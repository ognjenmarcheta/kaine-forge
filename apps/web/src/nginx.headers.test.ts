import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The web image renders this template with envsubst and serves the SPA from it
// (Dockerfile.web), so its add_header directives are the browser security
// headers that SECURITY.md promises on every response.
const template = readFileSync(fileURLToPath(new URL("../nginx.conf", import.meta.url)), "utf8");

type Token = { kind: "word" | "open" | "close" | "end"; text: string };
type Directive = { name: string; args: string[]; block: Directive[] | null };
type Header = { value: string; always: boolean };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    if (/\s/.test(ch)) {
      i += 1;
    } else if (ch === "#") {
      while (i < source.length && source.charAt(i) !== "\n") i += 1;
    } else if (ch === "{" || ch === "}" || ch === ";") {
      tokens.push({ kind: ch === "{" ? "open" : ch === "}" ? "close" : "end", text: ch });
      i += 1;
    } else if (ch === '"' || ch === "'") {
      const end = source.indexOf(ch, i + 1);
      if (end === -1) throw new Error(`Unterminated ${ch} string at offset ${i}`);
      tokens.push({ kind: "word", text: source.slice(i + 1, end) });
      i = end + 1;
    } else {
      let word = "";
      while (i < source.length && !/[\s;{}]/.test(source.charAt(i))) {
        // `${NAME}` is an envsubst variable, not a block.
        if (source.startsWith("${", i)) {
          const end = source.indexOf("}", i);
          word += source.slice(i, end + 1);
          i = end + 1;
        } else {
          word += source.charAt(i);
          i += 1;
        }
      }
      tokens.push({ kind: "word", text: word });
    }
  }
  return tokens;
}

function parse(tokens: Token[]): Directive[] {
  let pos = 0;
  function block(): Directive[] {
    const directives: Directive[] = [];
    while (pos < tokens.length && tokens[pos]?.kind !== "close") {
      const words: string[] = [];
      let token = tokens[pos];
      while (token?.kind === "word") {
        words.push(token.text);
        pos += 1;
        token = tokens[pos];
      }
      const [name, ...args] = words;
      if (name === undefined || token === undefined) throw new Error(`Bad directive at ${pos}`);
      pos += 1;
      if (token.kind === "open") {
        const children = block();
        if (tokens[pos]?.kind !== "close") throw new Error(`Unclosed block ${name}`);
        pos += 1;
        directives.push({ name, args, block: children });
      } else {
        directives.push({ name, args, block: null });
      }
    }
    return directives;
  }
  const root = block();
  if (pos !== tokens.length) throw new Error(`Unexpected } at token ${pos}`);
  return root;
}

function ownHeaders(directives: Directive[]): Map<string, Header> {
  const headers = new Map<string, Header>();
  for (const { name, args } of directives) {
    const [header, value, flag] = args;
    if (name === "add_header" && header !== undefined && value !== undefined) {
      headers.set(header.toLowerCase(), { value, always: flag === "always" });
    }
  }
  return headers;
}

// nginx inherits add_header from the enclosing level only when a level
// declares none of its own, so one add_header in a location drops them all.
function locationHeaders(
  directives: Directive[],
  inherited: Map<string, Header>
): [string, Map<string, Header>][] {
  return directives.flatMap(({ name, args, block }) => {
    if (name !== "location" || block === null) return [];
    const own = ownHeaders(block);
    const effective = own.size > 0 ? own : inherited;
    return [[args.join(" "), effective], ...locationHeaders(block, effective)];
  });
}

const servers = parse(tokenize(template)).filter(({ name }) => name === "server");
const locations = servers.flatMap(({ block }) =>
  block === null ? [] : locationHeaders(block, ownHeaders(block))
);

function header(headers: Map<string, Header>, name: string): Header {
  const found = headers.get(name);
  if (found === undefined) throw new Error(`${name} is not sent`);
  return found;
}

function cspDirectives(headers: Map<string, Header>): Map<string, string[]> {
  return new Map(
    header(headers, "content-security-policy")
      .value.split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter((words) => words[0] !== "")
      .map(([directive = "", ...sources]) => [directive, sources])
  );
}

describe("web nginx security headers", () => {
  it("serves the SPA and index.html from locations this test covers", () => {
    expect(servers).toHaveLength(1);
    expect(locations.map(([location]) => location)).toEqual(
      expect.arrayContaining(["/", "= /index.html"])
    );
  });

  describe.each(locations)("location %s", (_location, headers) => {
    it.each([
      ["strict-transport-security", "max-age=31536000; includeSubDomains"],
      ["x-frame-options", "SAMEORIGIN"],
      ["x-content-type-options", "nosniff"],
      ["referrer-policy", "strict-origin-when-cross-origin"]
    ])("sends %s: %s on every status", (name, value) => {
      expect(header(headers, name)).toEqual({ value, always: true });
    });

    it("sends a Permissions-Policy that denies camera, microphone, and geolocation", () => {
      const policy = header(headers, "permissions-policy");
      expect(policy.always).toBe(true);
      expect(policy.value.split(/,\s*/)).toEqual(
        expect.arrayContaining(["camera=()", "microphone=()", "geolocation=()"])
      );
    });

    it("sends the Content-Security-Policy on every status", () => {
      expect(header(headers, "content-security-policy").always).toBe(true);
    });

    it.each([
      ["default-src", ["'self'"]],
      ["object-src", ["'none'"]],
      ["base-uri", ["'self'"]],
      ["frame-ancestors", ["'self'"]]
    ])("restricts CSP %s to %j", (directive, sources) => {
      expect(cspDirectives(headers).get(directive)).toEqual(sources);
    });

    // Without script-src the browser falls back to default-src 'self'.
    it.each(["'unsafe-inline'", "'unsafe-eval'", "*", "data:", "https:"])(
      "keeps %s out of CSP script-src",
      (source) => {
        expect(cspDirectives(headers).get("script-src") ?? []).not.toContain(source);
      }
    );
  });
});
