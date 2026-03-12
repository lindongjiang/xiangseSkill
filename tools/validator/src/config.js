export const config = {
  httpTimeoutMs: Number(process.env.VALIDATOR_HTTP_TIMEOUT_MS || 15000),
  jsTimeoutMs: Number(process.env.VALIDATOR_JS_TIMEOUT_MS || 1200)
};
