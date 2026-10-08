import { describe, expect, it } from "vitest";

import { tokenizeCommandLine } from "./command-line.contract";

const argvOf = (line: string): readonly string[] => {
  const result = tokenizeCommandLine(line);
  if (!result.ok) throw new Error(result.reason);
  return result.argv;
};

describe("tokenizeCommandLine", () => {
  it("splits on whitespace and ignores extra blanks", () => {
    expect(argvOf("  notify-send   desk \t done\n")).toEqual(["notify-send", "desk", "done"]);
  });

  it("keeps a single-quoted word whole, with quotes and backslashes inside", () => {
    expect(argvOf(`osascript -e 'display notification "hi" with title "Desk"'`)).toEqual([
      "osascript",
      "-e",
      'display notification "hi" with title "Desk"'
    ]);
    expect(argvOf(String.raw`say 'a\b'`)).toEqual(["say", String.raw`a\b`]);
  });

  it('unescapes only \\" and \\\\ inside double quotes', () => {
    expect(argvOf(String.raw`say "a \"b\" \\ \n"`)).toEqual(["say", String.raw`a "b" \ \n`]);
  });

  it("joins adjacent quoted and plain pieces into one word", () => {
    expect(argvOf(`say pre'fix 1'"post fix"`)).toEqual(["say", "prefix 1post fix"]);
  });

  it("makes a backslash outside quotes escape the next character", () => {
    expect(argvOf(String.raw`say a\ b \'c`)).toEqual(["say", "a b", "'c"]);
  });

  it("keeps an empty quoted word", () => {
    expect(argvOf(`say '' x`)).toEqual(["say", "", "x"]);
  });

  it("treats shell syntax as plain text and expands nothing", () => {
    expect(argvOf("echo $HOME `id` a|b; c&&d >out *")).toEqual([
      "echo",
      "$HOME",
      "`id`",
      "a|b;",
      "c&&d",
      ">out",
      "*"
    ]);
  });

  it.each([
    ["an empty line", ""],
    ["a blank line", "   "],
    ["an unclosed single quote", "say 'oops"],
    ["an unclosed double quote", 'say "oops'],
    ["a trailing backslash", "say oops\\"]
  ])("rejects %s", (_name, line) => {
    expect(tokenizeCommandLine(line).ok).toBe(false);
  });
});
