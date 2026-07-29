/**
 * Detect AI self-attribution in git commit messages.
 * Used by commitlint so AI Co-Authored-By trailers and generator footers never land.
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

const AI_ROBOT_FOOTER = /^\s*🤖\s*Generated\b/im;

const CO_AUTHORED_BY = /^\s*Co-Authored-By:\s*(.+)\s*$/gim;

/**
 * @param {string} message Full commit message (header + body + footer)
 * @returns {string | null} Human-readable violation, or null if clean
 */
export function findAiCoauthorViolation(message) {
  if (typeof message !== "string" || message.length === 0) {
    return null;
  }

  const lines = message.split(/\r?\n/);
  for (const line of lines) {
    CO_AUTHORED_BY.lastIndex = 0;
    const match = CO_AUTHORED_BY.exec(line);
    if (!match) {
      continue;
    }
    const identity = match[1] ?? "";
    if (AI_IDENTITY.test(identity) || AI_EMAIL.test(identity)) {
      return `AI co-author trailer is not allowed: "${line.trim()}". Commits must use the human contributor only (see .ai/guide.md).`;
    }
  }

  if (AI_GENERATOR_FOOTER.test(message) || AI_ROBOT_FOOTER.test(message)) {
    return 'AI generator footers ("Generated with …" / "Made with …" / "🤖 Generated") are not allowed in commit messages. Commits must use the human contributor only (see .ai/guide.md).';
  }

  return null;
}
