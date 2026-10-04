/* Helpers shared by the Netlify Functions. */

function json({ status, body }) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body;
    return JSON.parse(raw || "{}");
  } catch (e) {
    return null;
  }
}

// Public URL of this deploy, used for Stripe's success/cancel redirects.
function siteUrl(event) {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  const host = event.headers && (event.headers["x-forwarded-host"] || event.headers.host);
  if (host) return `https://${host}`;
  return process.env.URL || "";
}

const methodNotAllowed = () => json({ status: 405, body: { error: "Method not allowed" } });

module.exports = { json, parseBody, siteUrl, methodNotAllowed };
