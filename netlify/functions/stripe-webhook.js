const { handleWebhook } = require("../../lib/store");
const { json, methodNotAllowed } = require("./_util");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  // Stripe signs the exact raw bytes, so pass the body through untouched.
  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64") : event.body || "";
  const headers = event.headers || {};
  return json(handleWebhook(raw, headers["stripe-signature"]));
};
