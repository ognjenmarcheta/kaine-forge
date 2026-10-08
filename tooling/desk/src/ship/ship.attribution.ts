/**
 * AI self-attribution check for everything the ship step writes: the commit
 * message, the PR title and body, and the changeset text. It ports
 * `findAiCoauthorViolation` from `scripts/no-ai-coauthor.mjs` (a .mjs script
 * outside this workspace, so the logic is copied, not imported). Keep the two
 * in step: `ship.attribution.test.ts` mirrors the cases of that script.
 */

/** Tool/vendor names and common AI agent identities (case-insensitive word match). */
const AI_IDENTITY =
  /\b(claude|anthropic|cursor(?:agent)?|copilot|github[\s-]?copilot|chatgpt|openai|gpt-?\d|codex|gemini|bard|grok|xai|devin|windsurf|aider|codeium|tabnine|codium|perplexity|jetbrains\s*ai|amazon\s*q|codewhisperer|amp|goose|opencode|continue\.dev)\b/i;

/** Known noreply / agent emails used by coding assistants. */
const AI_EMAIL =
  /(?:claude@|cursoragent@|copilot@|noreply@anthropic|@cursor\.com\b|@anthropic\.com\b|@openai\.com\b|@users\.noreply\.github\.com\b.*\b(claude|cursor|copilot|openai|anthropic)\b)/i;

/** Generator footers commonly appended by AI coding tools. */
const AI_GENERATOR_FOOTER =
  /^\s*(?:Generated\s+with|Made[- ]with)\s+(?:Claude|Cursor|Copilot|GPT|ChatGPT|Codex|Gemini|Grok|OpenAI|Anthropic)\b/im;

const AI_ROBOT_FOOTER = /^\s*\u{1F916}\s*Generated\b/imu;

const CO_AUTHORED_BY = /^\s*Co-Authored-By:\s*(.+)\s*$/i;

/** True when a git author name or email looks like an AI or tool identity. */
export const isAiIdentity = (name: string, email: string): boolean =>
  AI_IDENTITY.test(name) || AI_EMAIL.test(email);

/** A human-readable violation, or `null` when the message is clean. */
export const findAiCoauthorViolation = (message: string): string | null => {
  if (message.length === 0) return null;

  for (const line of message.split(/\r?\n/)) {
    const match = CO_AUTHORED_BY.exec(line);
    if (match === null) continue;
    const identity = match[1] ?? "";
    if (AI_IDENTITY.test(identity) || AI_EMAIL.test(identity)) {
      return `AI co-author trailer is not allowed: "${line.trim()}". Commits must use the human contributor only (see .ai/guide.md).`;
    }
  }

  if (AI_GENERATOR_FOOTER.test(message) || AI_ROBOT_FOOTER.test(message)) {
    return 'AI generator footers ("Generated with ..." / "Made with ..." / robot "Generated") are not allowed. Text must come from the human contributor only (see .ai/guide.md).';
  }
  return null;
};

export const ATTRIBUTION_SOURCES = ["commit-message", "pr-title", "pr-body", "changeset"] as const;
export type AttributionSource = (typeof ATTRIBUTION_SOURCES)[number];

export interface AttributionViolation {
  readonly source: AttributionSource;
  readonly message: string;
}

/** Check each text the ship step will publish. An absent text (`null`) is skipped. */
export const findAttributionViolations = (
  texts: Readonly<Record<AttributionSource, string | null>>
): AttributionViolation[] =>
  ATTRIBUTION_SOURCES.flatMap((source) => {
    const text = texts[source];
    const message = text === null ? null : findAiCoauthorViolation(text);
    return message === null ? [] : [{ source, message }];
  });
