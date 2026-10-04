const { createCheckout } = require("../../lib/store");
const { json, parseBody, siteUrl, methodNotAllowed } = require("./_util");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const body = parseBody(event);
  if (!body) return json({ status: 400, body: { error: "Invalid request." } });
  return json(await createCheckout(body, siteUrl(event)));
};
