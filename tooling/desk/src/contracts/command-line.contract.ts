/**
 * Split a command line into an argv array without a shell. The desk never runs
 * a shell string: this only cuts the text into words.
 *
 * - Whitespace separates words.
 * - `'...'` keeps everything inside, including `"` and `\`.
 * - `"..."` keeps everything inside. `\"` and `\\` stand for `"` and `\`.
 * - Outside quotes, `\` makes the next character literal.
 * - `$`, `*`, `|`, `;`, `&`, `>` and `` ` `` are plain characters. Nothing expands.
 */
export type TokenizeResult =
  | { readonly ok: true; readonly argv: readonly string[] }
  | { readonly ok: false; readonly reason: string };

export const tokenizeCommandLine = (line: string): TokenizeResult => {
  const argv: string[] = [];
  let current = "";
  let inWord = false;
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
    } else if (quote === '"') {
      const next = line.charAt(index + 1);
      if (char === "\\" && (next === '"' || next === "\\")) {
        current += next;
        index += 1;
      } else if (char === '"') quote = null;
      else current += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      inWord = true;
    } else if (char === "\\") {
      if (index + 1 >= line.length) return { ok: false, reason: "The command ends with a '\\'." };
      current += line.charAt(index + 1);
      index += 1;
      inWord = true;
    } else if (/\s/.test(char)) {
      if (inWord) {
        argv.push(current);
        current = "";
        inWord = false;
      }
    } else {
      current += char;
      inWord = true;
    }
  }
  if (quote !== null) return { ok: false, reason: `The command has an unclosed ${quote} quote.` };
  if (inWord) argv.push(current);
  if (argv.length === 0) return { ok: false, reason: "The command is empty." };
  return { ok: true, argv };
};
