import { readFileSync } from "node:fs";

export function claudeLoginChanged(file, before) {
  try {
    const saved = readFileSync(file, "utf8");
    if (saved === before) return false;
    const token = JSON.parse(saved)?.claudeAiOauth?.accessToken;
    return typeof token === "string" && token.length > 0;
  } catch {
    // The CLI can replace or partially write credentials during a refresh.
    return false;
  }
}

// Provider transport formats differ. The controller applies the shared Zod
// contract to the result returned by either adapter.
export function providerFailure(text) {
  // Return fixed labels only. Provider diagnostics may contain credentials.
  if (/workspace routing discovery.*(?:unauthorized|401)/i.test(text))
    return "workspace-routing-unauthorized";
  if (/expired|refresh_token_(?:invalid|reused|revoked)/i.test(text))
    return "authentication-expired";
  if (/invalid.{0,30}(?:api.key|x-api-key)|incorrect api key/i.test(text))
    return "api-key-rejected";
  if (/(?:invalid|revoked).{0,30}(?:bearer|oauth|access.token)|invalid bearer token/i.test(text))
    return "authentication-invalid";
  if (
    /oauth.{0,80}(?:not supported|not allowed)|only authorized for use with Claude Code|insufficient.{0,20}scope/i.test(
      text
    )
  )
    return "authentication-scope";
  if (/not logged in|please (?:run|use).{0,20}login|login required/i.test(text))
    return "login-required";
  if (/authentication|unauthorized|\b401\b/i.test(text)) return "authentication";
  if (/connection|ENOTFOUND|ECONN|fetch failed|network/i.test(text)) return "network";
  if (/model.*not|model.*invalid|not.*model/i.test(text)) return "model-unavailable";
  if (/rate.limit|\b429\b/i.test(text)) return "rate-limit";
  return "provider-error";
}

export function providerErrorMessage(output, diagnostics) {
  let message = diagnostics;
  try {
    const response = JSON.parse(output);
    if (response.is_error === true && typeof response.result === "string")
      message = response.result;
  } catch {
    /* Non-JSON providers use stderr. */
  }
  return message
    .replace(/https?:\/\/\S+|\bBearer\s+\S+|\b[\w.+-]+@[\w.-]+\b/gi, "[redacted]")
    .replace(/[A-Za-z0-9_+/.=-]{24,}/g, "[redacted]")
    .replace(/\p{Cc}/gu, " ")
    .trim()
    .slice(0, 300);
}

export function parseProviderOutput(provider, output, lastMessage = null) {
  if (provider === "codex") {
    let completed = false;
    let usage = {};
    for (const line of output.trim().split("\n")) {
      const event = JSON.parse(line);
      if (["error", "turn.failed"].includes(event.type)) throw new Error("Codex reported failure");
      if (event.type === "turn.completed") {
        completed = true;
        usage = event.usage ?? {};
      }
      if (event.item && !["agent_message", "reasoning"].includes(event.item.type))
        throw new Error("Unexpected tool use in proposal worker");
    }
    if (!completed || !lastMessage) throw new Error("Missing Codex completion");
    return { result: JSON.parse(lastMessage), usage };
  }
  if (provider !== "claude") throw new Error("Unsupported provider");
  const response = JSON.parse(output);
  if (response.is_error || response.subtype !== "success" || !response.structured_output)
    throw new Error("Claude reported failure");
  return { result: response.structured_output, usage: response.usage ?? {} };
}
