const { getOrder } = require("../../lib/store");
const { json, methodNotAllowed } = require("./_util");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();
  return json(await getOrder((event.queryStringParameters || {}).session_id));
};
