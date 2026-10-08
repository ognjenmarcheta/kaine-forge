/**
 * A small reader for the shell command lines an agent runs. It is not a shell:
 * it splits a line into simple commands and words so the desk can see which
 * program was run and with which subcommand, even through `git -C . -c k=v
 * commit`, `env X=1 gh …` and `bash -lc '…'`. It reads text only.
 */

const COMMAND_WRAPPERS: ReadonlySet<string> = new Set([
  "env",
  "command",
  "time",
  "nice",
  "sudo",
  "exec",
  "nohup",
  "xargs"
]);
const SHELLS: ReadonlySet<string> = new Set(["sh", "bash", "zsh", "dash"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Split one command line into words. Quotes group, a backslash escapes. */
export const shellWords = (line: string): string[] => {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let started = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? "";
    if (quote !== null) {
      if (char === quote) quote = null;
      else if (char === "\\" && quote === '"') current += line[++index] ?? "";
      else current += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === "\\") {
      current += line[++index] ?? "";
      started = true;
    } else if (/\s/.test(char)) {
      if (started) words.push(current);
      current = "";
      started = false;
    } else {
      current += char;
      started = true;
    }
  }
  if (started) words.push(current);
  return words;
};

/** Text inside `$( … )` and backticks. They run as commands of their own. */
const substitutions = (line: string): string[] => [
  ...[...line.matchAll(/\$\(([^()]*)\)/g)].map((match) => match[1] ?? ""),
  ...[...line.matchAll(/`([^`]*)`/g)].map((match) => match[1] ?? "")
];

/** Split a line at `&&`, `||`, `;`, `|` and newlines, outside quotes. */
const simpleCommands = (line: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? "";
    if (quote !== null) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
    } else if (char === "&" && (current.endsWith(">") || line[index + 1] === ">")) {
      // `2>&1` and `&>file` are redirections, not command separators.
      current += char;
    } else if (char === ";" || char === "\n" || char === "|" || char === "&") {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== "");
};

/** The words of every simple command in `line`, wrappers and shell `-c` bodies unwrapped. */
export const commandsIn = (line: string, depth = 0): string[][] => {
  if (depth > 3) return [];
  const found: string[][] = [];
  for (const piece of [line, ...substitutions(line)]) {
    for (const simple of simpleCommands(piece)) {
      let words = shellWords(simple);
      while (words.length > 0) {
        const head = words[0] ?? "";
        if (ASSIGNMENT.test(head) || COMMAND_WRAPPERS.has(head)) words = words.slice(1);
        else break;
      }
      if (words.length === 0) continue;
      const program = (words[0] ?? "").split("/").at(-1) ?? "";
      const flagIndex = words.findIndex((word) => /^-[A-Za-z]*c$/.test(word));
      if (SHELLS.has(program) && flagIndex > 0 && words[flagIndex + 1] !== undefined) {
        found.push(...commandsIn(words[flagIndex + 1] ?? "", depth + 1));
        continue;
      }
      found.push(words);
    }
  }
  return found;
};

const GIT_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--config-env",
  "--super-prefix"
]);

/** The subcommand of a `git` command, after global options such as `-C .` and `-c k=v`. */
export const gitSubcommand = (words: readonly string[]): string | null => {
  if ((words[0] ?? "").split("/").at(-1) !== "git") return null;
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index] ?? "";
    if (GIT_OPTIONS_WITH_VALUE.has(word)) index += 1;
    else if (!word.startsWith("-")) return word;
  }
  return null;
};
