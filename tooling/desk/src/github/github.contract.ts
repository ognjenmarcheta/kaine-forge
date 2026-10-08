/**
 * Lenient reader for the six-heading `ready-for-agent` contract in
 * `docs/agents/triage-labels.md`. It reports "contract N/6". It never decides
 * readiness: that stays with a human or `kaine-intake`.
 */

export const CONTRACT_SECTIONS = [
  "outcome",
  "acceptance-criteria",
  "scope",
  "validation",
  "evidence",
  "out-of-scope"
] as const;
export type ContractSection = (typeof CONTRACT_SECTIONS)[number];

/**
 * Headings that count for each section, lower-case. The first entry is the
 * canonical heading. The rest are the headings the repo's issue templates use.
 */
const HEADING_ALIASES: Readonly<Record<ContractSection, readonly string[]>> = {
  outcome: ["outcome", "problem", "proposed solution"],
  "acceptance-criteria": ["acceptance criteria", "acceptance"],
  scope: ["scope", "workspace or paths in scope", "affected workspace or area"],
  validation: ["validation", "validation tier"],
  evidence: ["evidence", "what happened", "reproduction"],
  "out-of-scope": ["out of scope"]
};

const NO_RESPONSE = "_no response_";

export interface ContractReport {
  readonly found: number;
  readonly total: typeof CONTRACT_SECTIONS.length;
  readonly missing: readonly ContractSection[];
  /** Trimmed text per section that has content. */
  readonly sections: Readonly<Partial<Record<ContractSection, string>>>;
  readonly acceptanceCriteria: readonly string[];
}

const normalizeHeading = (raw: string): string =>
  raw
    .replace(/\s+#+\s*$/, "")
    .replace(/[*_`]/g, "")
    .replace(/[:?.\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const sectionFor = (heading: string): ContractSection | null => {
  for (const section of CONTRACT_SECTIONS) {
    if (HEADING_ALIASES[section].includes(heading)) return section;
  }
  return null;
};

const HEADING_LINE = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*$/;
const FENCE_LINE = /^ {0,3}(```|~~~)/;

interface RawBlock {
  readonly heading: string;
  readonly lines: string[];
}

/** Split into headed blocks. Headings inside fenced code are text, not headings. */
const splitBlocks = (body: string): RawBlock[] => {
  const blocks: RawBlock[] = [];
  let current: RawBlock | null = null;
  let fence: string | null = null;
  for (const line of body.split(/\r?\n/)) {
    const fenceMatch = FENCE_LINE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? "";
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
    }
    const heading = fence === null && !fenceMatch ? HEADING_LINE.exec(line) : null;
    if (heading) {
      current = { heading: normalizeHeading(heading[1] ?? ""), lines: [] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return blocks;
};

const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.*)$/;

/** Bullets and checklist items. With no bullets, each non-empty line is one criterion. */
export const parseAcceptanceCriteria = (text: string): string[] => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const hasBullets = lines.some((line) => BULLET.test(line));
  const criteria: string[] = [];
  for (const line of lines) {
    const bullet = BULLET.exec(line);
    if (bullet) {
      const item = (bullet[1] ?? "").trim();
      if (item !== "") criteria.push(item);
    } else if (!hasBullets) {
      criteria.push(line.trim());
    } else if (/^\s+\S/.test(line) && criteria.length > 0) {
      // An indented continuation joins the bullet above it.
      criteria[criteria.length - 1] = `${criteria[criteria.length - 1]} ${line.trim()}`;
    }
  }
  return criteria;
};

export const parseContract = (body: string): ContractReport => {
  const collected = new Map<ContractSection, string[]>();
  for (const block of splitBlocks(body)) {
    const section = sectionFor(block.heading);
    if (section === null) continue;
    const text = block.lines.join("\n").trim();
    if (text === "" || text.toLowerCase() === NO_RESPONSE) continue;
    collected.set(section, [...(collected.get(section) ?? []), text]);
  }

  const sections: Partial<Record<ContractSection, string>> = {};
  for (const [section, parts] of collected) sections[section] = parts.join("\n\n");
  const missing = CONTRACT_SECTIONS.filter((section) => !collected.has(section));

  return {
    found: CONTRACT_SECTIONS.length - missing.length,
    total: CONTRACT_SECTIONS.length,
    missing,
    sections,
    acceptanceCriteria: parseAcceptanceCriteria(sections["acceptance-criteria"] ?? "")
  };
};

export const formatContract = (report: ContractReport): string =>
  report.missing.length === 0
    ? `contract ${report.found}/${report.total}`
    : `contract ${report.found}/${report.total}, missing: ${report.missing.join(", ")}`;
