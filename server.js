/* Everchef Tech Supply — Node web server (for local development or Node hosts
   such as Render/Railway). On Netlify the same endpoints run as Netlify
   Functions instead — see netlify/functions and netlify.toml.

     POST /api/checkout         create a Stripe Checkout Session from the cart
     GET  /api/order            fetch a short summary of a completed session
     POST /api/contact          deliver the contact form by email (SMTP)
     POST /api/stripe/webhook   receive Stripe events (optional)
*/
require("dotenv").config();

const path = require("path");
const express = require("express");
const store = require("./lib/store");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

if (!store.getStripe()) console.warn("[checkout] STRIPE_SECRET_KEY is not set — checkout is disabled until it is configured.");
if (!store.getMailer()) console.warn("[contact] SMTP_HOST is not set — the contact form will fall back to the visitor's email app.");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

const send = (res) => ({ status, body }) => res.status(status).json(body);

// Registered before express.json() so the raw body is preserved for signature verification.
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  send(res)(store.handleWebhook(req.body, req.headers["stripe-signature"]));
});

app.use(express.json({ limit: "20kb" }));

function siteUrl(req) {
  return process.env.SITE_URL || `${req.protocol}://${req.get("host")}`;
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

app.post("/api/checkout", rateLimit(20, 10 * 60 * 1000), async (req, res) => {
  send(res)(await store.createCheckout(req.body, siteUrl(req)));
});

app.get("/api/order", rateLimit(60, 10 * 60 * 1000), async (req, res) => {
  send(res)(await store.getOrder(req.query.session_id));
});

app.post("/api/contact", rateLimit(5, 10 * 60 * 1000), async (req, res) => {
  send(res)(await store.sendContact(req.body));
});

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

app.use(express.static(PUBLIC_DIR, { extensions: ["html"], maxAge: "1h" }));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, "404.html")));

app.listen(PORT, () => console.log(`Everchef Tech Supply running at http://localhost:${PORT}`));
