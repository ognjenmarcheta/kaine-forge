/**
 * A small Markdown subset, parsed by hand: `#`, `##` and `###` headings, paragraphs (lines
 * joined with a space), `-` and `*` bullets, `1.` numbered items, inline `**bold**` and
 * `` `code` ``. Anything else stays as plain paragraph text, so no input text is dropped.
 */

export interface Run {
  readonly text: string;
  readonly bold: boolean;
  readonly code: boolean;
}

export type Block =
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3; readonly runs: readonly Run[] }
  | { readonly kind: "paragraph"; readonly runs: readonly Run[] }
  | { readonly kind: "bullet"; readonly runs: readonly Run[] }
  | { readonly kind: "numbered"; readonly runs: readonly Run[] };

const HEADING = /^(#{1,3})[ \t]+(.*)$/;
const BULLET = /^[ \t]*[-*][ \t]+(.*)$/;
const NUMBERED = /^[ \t]*\d+\.[ \t]+(.*)$/;

const push = (runs: Run[], text: string, bold: boolean, code: boolean): void => {
  if (text === "") return;
  const last = runs.at(-1);
  if (last !== undefined && last.bold === bold && last.code === code) {
    runs[runs.length - 1] = { text: last.text + text, bold, code };
  } else {
    runs.push({ text, bold, code });
  }
};

/** Inline `` `code` `` and `**bold**`. A marker without its closing pair stays as text. */
export const parseInline = (text: string, bold = false, runs: Run[] = []): Run[] => {
  let plain = "";
  let index = 0;
  while (index < text.length) {
    if (text.startsWith("`", index)) {
      const close = text.indexOf("`", index + 1);
      if (close > index + 1) {
        push(runs, plain, bold, false);
        plain = "";
        push(runs, text.slice(index + 1, close), bold, true);
        index = close + 1;
        continue;
      }
    }
    if (!bold && text.startsWith("**", index)) {
      const close = text.indexOf("**", index + 2);
      if (close > index + 2) {
        push(runs, plain, false, false);
        plain = "";
        parseInline(text.slice(index + 2, close), true, runs);
        index = close + 2;
        continue;
      }
    }
    plain += text[index];
    index += 1;
  }
  push(runs, plain, bold, false);
  return runs;
};

/** The plain text of runs, without markers. */
export const plainText = (runs: readonly Run[]): string => runs.map((run) => run.text).join("");

export const parseMarkdown = (source: string): Block[] => {
  const blocks: Block[] = [];
  /** Lines of the open paragraph or list item, joined when it closes. */
  let open: { kind: "paragraph" | "bullet" | "numbered"; lines: string[] } | null = null;
  const close = (): void => {
    if (open === null) return;
    blocks.push({ kind: open.kind, runs: parseInline(open.lines.join(" ")) });
    open = null;
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line === "") {
      close();
      continue;
    }
    const heading = HEADING.exec(raw);
    if (heading !== null) {
      close();
      const level = heading[1]?.length === 1 ? 1 : heading[1]?.length === 2 ? 2 : 3;
      blocks.push({ kind: "heading", level, runs: parseInline((heading[2] ?? "").trim()) });
      continue;
    }
    const bullet = BULLET.exec(raw);
    const numbered = bullet === null ? NUMBERED.exec(raw) : null;
    const item = bullet ?? numbered;
    if (item !== null) {
      close();
      open = { kind: bullet !== null ? "bullet" : "numbered", lines: [(item[1] ?? "").trim()] };
      continue;
    }
    // A plain line continues the open paragraph or list item (a lazy continuation line).
    if (open === null) open = { kind: "paragraph", lines: [] };
    open.lines.push(line);
  }
  close();
  return blocks;
};
