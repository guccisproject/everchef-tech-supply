/* Shared store logic used by both the Express server (server.js) and the
   Netlify Functions (netlify/functions/*). Each handler returns
   { status, body } so either runtime can send it. */

const catalog = require("../public/data/products.json");

const MAX_QTY = 10;
const CONTACT_TO = process.env.CONTACT_TO || "vantelia.home@outlook.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const productsById = new Map(catalog.products.map((p) => [p.id, p]));

let stripeClient;
function getStripe() {
  if (stripeClient === undefined) {
    stripeClient = process.env.STRIPE_SECRET_KEY ? require("stripe")(process.env.STRIPE_SECRET_KEY) : null;
  }
  return stripeClient;
}

let mailer;
function getMailer() {
  if (mailer === undefined) {
    mailer = process.env.SMTP_HOST
      ? require("nodemailer").createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === "true",
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        })
      : null;
  }
  return mailer;
}

/* -------------------------------------------------------------- checkout */

async function createCheckout(body, baseUrl) {
  const stripe = getStripe();
  if (!stripe) return { status: 503, body: { error: "Online checkout is opening soon.", code: "checkout_disabled" } };

  const { items, shipping, email, giftNote } = body || {};
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return { status: 400, body: { error: "Your cart is empty." } };
  }

  // Prices always come from the server-side catalog, never from the browser.
  const merged = new Map();
  for (const item of items) {
    const product = item && productsById.get(String(item.id));
    const qty = Math.floor(Number(item && item.qty));
    if (!product || !Number.isFinite(qty) || qty < 1) continue;
    merged.set(product.id, Math.min(MAX_QTY, (merged.get(product.id) || 0) + qty));
  }
  if (merged.size === 0) return { status: 400, body: { error: "Your cart is empty." } };

  let subtotal = 0;
  const lineItems = [];
  for (const [id, qty] of merged) {
    const p = productsById.get(id);
    subtotal += p.price * qty;
    lineItems.push({
      quantity: qty,
      price_data: {
        currency: catalog.currency,
        unit_amount: p.price,
        product_data: {
          name: p.name,
          description: p.short,
          images: [p.image],
          metadata: { product_id: p.id },
        },
      },
    });
  }

  const ship = catalog.shipping;
  const rate = (name, amount, minDays, maxDays) => ({
    shipping_rate_data: {
      type: "fixed_amount",
      display_name: name,
      fixed_amount: { amount, currency: catalog.currency },
      delivery_estimate: {
        minimum: { unit: "business_day", value: minDays },
        maximum: { unit: "business_day", value: maxDays },
      },
    },
  });
  const standardAmount = subtotal >= ship.freeThreshold ? 0 : ship.standard.amount;
  const standard = rate(
    standardAmount === 0 ? "Free Standard Shipping (3–7 business days)" : ship.standard.name,
    standardAmount, ship.standard.minDays, ship.standard.maxDays
  );
  const expedited = rate(ship.expedited.name, ship.expedited.amount, ship.expedited.minDays, ship.expedited.maxDays);
  // The option chosen on our checkout page is listed first so Stripe pre-selects it.
  const shippingOptions = shipping === "expedited" ? [expedited, standard] : [standard, expedited];

  const base = baseUrl.replace(/\/+$/, "");
  const params = {
    mode: "payment",
    line_items: lineItems,
    shipping_address_collection: { allowed_countries: ["US"] },
    shipping_options: shippingOptions,
    phone_number_collection: { enabled: true },
    billing_address_collection: "auto",
    success_url: `${base}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/cart.html`,
    metadata: {},
  };
  if (typeof email === "string" && EMAIL_RE.test(email) && email.length <= 200) {
    params.customer_email = email;
  }
  if (typeof giftNote === "string" && giftNote.trim()) {
    params.metadata.gift_note = giftNote.trim().slice(0, 300);
  }
  if (process.env.STRIPE_AUTOMATIC_TAX === "true") {
    params.automatic_tax = { enabled: true };
  }

  try {
    const session = await stripe.checkout.sessions.create(params);
    return { status: 200, body: { url: session.url } };
  } catch (err) {
    console.error("[checkout] Stripe error:", err.message);
    return { status: 502, body: { error: "We couldn't start checkout right now." } };
  }
}

/* ----------------------------------------------------------------- order */

async function getOrder(sessionId) {
  const stripe = getStripe();
  const id = String(sessionId || "");
  if (!stripe || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return { status: 404, body: { error: "Not found" } };
  try {
    const s = await stripe.checkout.sessions.retrieve(id);
    if (s.payment_status !== "paid" && s.status !== "complete") return { status: 404, body: { error: "Not found" } };
    return {
      status: 200,
      body: {
        reference: s.id.slice(-10).toUpperCase(),
        email: s.customer_details && s.customer_details.email,
        amountTotal: s.amount_total,
      },
    };
  } catch (err) {
    return { status: 404, body: { error: "Not found" } };
  }
}

/* --------------------------------------------------------------- contact */

const clean = (v, max) => (typeof v === "string" ? v.replace(/[\r\n]+/g, " ").trim().slice(0, max) : "");

async function sendContact(body) {
  body = body || {};
  if (body.company) return { status: 200, body: { ok: true } }; // honeypot filled: quietly ignore bots

  const name = clean(body.name, 100);
  const email = clean(body.email, 200);
  const subject = clean(body.subject, 80) || "General Question";
  const order = clean(body.order, 60);
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";

  if (!name || !message || !EMAIL_RE.test(email)) {
    return { status: 400, body: { error: "Please provide your name, a valid email and a message." } };
  }
  const transport = getMailer();
  if (!transport) return { status: 503, body: { error: "Email delivery is not configured.", fallback: "mailto" } };

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || CONTACT_TO,
      to: CONTACT_TO,
      replyTo: `"${name.replace(/"/g, "")}" <${email}>`,
      subject: `[Website] ${subject}${order ? ` — Order ${order}` : ""}`,
      text: `Name: ${name}\nEmail: ${email}\nTopic: ${subject}\nOrder: ${order || "—"}\n\n${message}`,
    });
    return { status: 200, body: { ok: true } };
  } catch (err) {
    console.error("[contact] send failed:", err.message);
    return { status: 502, body: { error: "We couldn't send your message.", fallback: "mailto" } };
  }
}

/* --------------------------------------------------------------- webhook */

function handleWebhook(rawBody, signature) {
  const stripe = getStripe();
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return { status: 404, body: { error: "Not found" } };
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.warn("[webhook] signature verification failed:", err.message);
    return { status: 400, body: { error: "Invalid signature" } };
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    console.log(`[order] paid ${s.id} ${(s.amount_total / 100).toFixed(2)} ${s.currency} ${s.customer_details && s.customer_details.email}`);
  }
  return { status: 200, body: { received: true } };
}

module.exports = { createCheckout, getOrder, sendContact, handleWebhook, getStripe, getMailer };
