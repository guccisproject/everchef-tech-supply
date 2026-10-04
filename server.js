/* Everchef Tech Supply — web server
   Serves the static storefront and provides:
     POST /api/checkout   create a Stripe Checkout Session from the cart
     GET  /api/order      fetch a short summary of a completed session
     POST /api/contact    deliver the contact form by email (SMTP)
     POST /api/stripe/webhook  receive Stripe events (optional)
*/
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const CONTACT_TO = process.env.CONTACT_TO || "everchef.tech@outlook.com";
const MAX_QTY = 10;

const catalog = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, "data", "products.json"), "utf8"));
const productsById = new Map(catalog.products.map((p) => [p.id, p]));

const stripe = process.env.STRIPE_SECRET_KEY ? require("stripe")(process.env.STRIPE_SECRET_KEY) : null;
if (!stripe) console.warn("[checkout] STRIPE_SECRET_KEY is not set — checkout is disabled until it is configured.");

let mailer = null;
if (process.env.SMTP_HOST) {
  mailer = require("nodemailer").createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
} else {
  console.warn("[contact] SMTP_HOST is not set — the contact form will fall back to the visitor's email app.");
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

/* ---------------------------------------------------------------- webhook
   Must be registered before express.json() so the raw body is preserved for
   signature verification. */
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.sendStatus(404);
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.warn("[webhook] signature verification failed:", err.message);
    return res.status(400).send("Invalid signature");
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    console.log(`[order] paid ${s.id} ${(s.amount_total / 100).toFixed(2)} ${s.currency} ${s.customer_details && s.customer_details.email}`);
  }
  res.json({ received: true });
});

app.use(express.json({ limit: "20kb" }));

/* -------------------------------------------------------------- helpers */

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

// Very small in-memory rate limiter (per IP, per route).
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.path}:${req.ip}`;
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, start: now };
    if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
    entry.count += 1;
    hits.set(key, entry);
    if (entry.count > max) return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
    next();
  };
}
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, v] of hits) if (v.start < cutoff) hits.delete(k);
}, 10 * 60 * 1000).unref();

/* -------------------------------------------------------------- checkout */

app.post("/api/checkout", rateLimit(20, 10 * 60 * 1000), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Online checkout is not yet available." });

  const { items, shipping, email, giftNote } = req.body || {};
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return res.status(400).json({ error: "Your cart is empty." });
  }

  // Prices always come from the server-side catalog, never from the browser.
  const merged = new Map();
  for (const item of items) {
    const product = item && productsById.get(String(item.id));
    const qty = Math.floor(Number(item && item.qty));
    if (!product || !Number.isFinite(qty) || qty < 1) continue;
    merged.set(product.id, Math.min(MAX_QTY, (merged.get(product.id) || 0) + qty));
  }
  if (merged.size === 0) return res.status(400).json({ error: "Your cart is empty." });

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

  const base = siteUrl(req);
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
  if (typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200) {
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
    res.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] Stripe error:", err.message);
    res.status(502).json({ error: "We couldn't start checkout right now." });
  }
});

app.get("/api/order", rateLimit(60, 10 * 60 * 1000), async (req, res) => {
  const id = String(req.query.session_id || "");
  if (!stripe || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return res.status(404).json({ error: "Not found" });
  try {
    const s = await stripe.checkout.sessions.retrieve(id);
    if (s.payment_status !== "paid" && s.status !== "complete") return res.status(404).json({ error: "Not found" });
    res.json({
      reference: s.id.slice(-10).toUpperCase(),
      email: s.customer_details && s.customer_details.email,
      amountTotal: s.amount_total,
    });
  } catch (err) {
    res.status(404).json({ error: "Not found" });
  }
});

/* --------------------------------------------------------------- contact */

const clean = (v, max) => (typeof v === "string" ? v.replace(/[\r\n]+/g, " ").trim().slice(0, max) : "");

app.post("/api/contact", rateLimit(5, 10 * 60 * 1000), async (req, res) => {
  const body = req.body || {};
  if (body.company) return res.json({ ok: true }); // honeypot filled: quietly ignore bots

  const name = clean(body.name, 100);
  const email = clean(body.email, 200);
  const subject = clean(body.subject, 80) || "General Question";
  const order = clean(body.order, 60);
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";

  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please provide your name, a valid email and a message." });
  }
  if (!mailer) return res.status(503).json({ error: "Email delivery is not configured.", fallback: "mailto" });

  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || CONTACT_TO,
      to: CONTACT_TO,
      replyTo: `"${name.replace(/"/g, "")}" <${email}>`,
      subject: `[Website] ${subject}${order ? ` — Order ${order}` : ""}`,
      text: `Name: ${name}\nEmail: ${email}\nTopic: ${subject}\nOrder: ${order || "—"}\n\n${message}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[contact] send failed:", err.message);
    res.status(502).json({ error: "We couldn't send your message.", fallback: "mailto" });
  }
});

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

/* ---------------------------------------------------------------- static */

app.use(express.static(PUBLIC_DIR, { extensions: ["html"], maxAge: "1h" }));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, "404.html")));

app.listen(PORT, () => console.log(`Everchef Tech Supply running at http://localhost:${PORT}`));
