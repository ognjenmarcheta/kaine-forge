import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedProxyTarget } from "./factory-proxy.mjs";

test("dependency proxy permits only the exact HTTPS npm registry destination", () => {
  assert.equal(allowedProxyTarget("registry.npmjs.org:443", "dependencies"), true);
  for (const target of [
    "example.com:443",
    "registry.npmjs.org.attacker.test:443",
    "attacker.test:443",
    "registry.npmjs.org:80",
    "registry.npmjs.org:443:",
    "user@registry.npmjs.org:443",
    "registry.npmjs.org",
    "127.0.0.1:443",
    "169.254.169.254:443",
    "[::1]:443",
    "chatgpt.com:443",
    "api.anthropic.com:443",
    "https://registry.npmjs.org:443",
    null
  ])
    assert.equal(allowedProxyTarget(target, "dependencies"), false, String(target));
});
test("dependency and provider proxy policies remain separate and unknown modes deny access", () => {
  assert.equal(allowedProxyTarget("chatgpt.com:443", "providers"), true);
  assert.equal(allowedProxyTarget("api.anthropic.com:443", "providers"), true);
  assert.equal(allowedProxyTarget("registry.npmjs.org:443", "providers"), false);
  assert.equal(allowedProxyTarget("registry.npmjs.org:443", "unknown"), false);
});
