import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseProviderOutput,
  providerFailure,
  providerErrorMessage,
  claudeLoginChanged
} from "./factory-provider.mjs";

test("error summaries remove tokens, URLs, email addresses, and control characters", () => {
  const message =
    "Rejected Bearer secret-value https://host/auth?token=secret user@example.com sk-ant-abcdefghijklmnopqrstuvwxyz0123456789\nTry login";
  const summary = providerErrorMessage(JSON.stringify({ is_error: true, result: message }), "");
  assert.equal(summary, "Rejected [redacted] [redacted] [redacted] [redacted] Try login");
  assert.equal(providerErrorMessage("invalid JSON", "Request failed"), "Request failed");
  assert.equal(providerErrorMessage("{}", "x ".repeat(200)).length, 300);
});

test("provider failures retain useful reasons without returning credentials", () => {
  for (const [message, expected] of [
    ["workspace routing discovery unauthorized (401)", "workspace-routing-unauthorized"],
    ["OAuth token has expired", "authentication-expired"],
    ["Incorrect API key provided: sk-secret", "api-key-rejected"],
    ["Invalid bearer token sk-secret", "authentication-invalid"],
    ["OAuth authentication is currently not supported", "authentication-scope"],
    ["Not logged in. Please run /login", "login-required"],
    ["API Error: 401 authentication_error", "authentication"],
    ["Model is not available", "model-unavailable"],
    ['{"session_id":"abc401def","result":"Model is not available"}', "model-unavailable"],
    ["Request failed: 429 rate limit", "rate-limit"],
    ["ECONNRESET", "network"],
    ["Something failed with secret=private", "provider-error"]
  ])
    assert.equal(providerFailure(message), expected);
});

const result = {
  issue: 1,
  revision: "a".repeat(40),
  status: "completed",
  summary: "Done",
  nextAction: "none",
  files: [],
  findings: [],
  evidence: []
};
for (const provider of ["codex", "claude"]) {
  test(`${provider} produces the shared result and available usage`, () => {
    const usage = { input_tokens: 10, output_tokens: 2 };
    const output =
      provider === "codex"
        ? JSON.stringify({ type: "turn.completed", usage })
        : JSON.stringify({ subtype: "success", is_error: false, structured_output: result, usage });
    assert.deepEqual(parseProviderOutput(provider, output, JSON.stringify(result)), {
      result,
      usage
    });
  });
  test(`${provider} rejects malformed and incomplete output`, () => {
    assert.throws(() => parseProviderOutput(provider, "not JSON"));
    assert.throws(() => parseProviderOutput(provider, "{}"));
  });
  test(`${provider} rejects an explicit provider failure`, () => {
    const output =
      provider === "codex"
        ? JSON.stringify({ type: "turn.failed" })
        : JSON.stringify({ subtype: "error", is_error: true });
    assert.throws(() => parseProviderOutput(provider, output, JSON.stringify(result)));
  });
}
test("Codex tool attempts cannot be accepted as a proposal", () => {
  const output = [
    JSON.stringify({ type: "item.completed", item: { type: "command_execution" } }),
    JSON.stringify({ type: "turn.completed" })
  ].join("\n");
  assert.throws(() => parseProviderOutput("codex", output, JSON.stringify(result)), /tool use/);
});

test("Claude login retries missing, partial and invalid credentials until a changed token is saved", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "factory-login-"));
  const file = path.join(directory, "credentials.json");
  const before = JSON.stringify({ claudeAiOauth: { accessToken: "old" } });
  try {
    assert.equal(claudeLoginChanged(file, before), false);
    for (const value of [before, "{", "null", "{}", '{"claudeAiOauth":{"accessToken":7}}']) {
      writeFileSync(file, value);
      assert.equal(claudeLoginChanged(file, before), false);
    }
    writeFileSync(file, JSON.stringify({ claudeAiOauth: { accessToken: "new" } }));
    assert.equal(claudeLoginChanged(file, before), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
