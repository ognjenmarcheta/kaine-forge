import { describe, expect, it } from "vitest";

import { parseMarkdown, type Block } from "./markdown.parse";

const plain = (text: string) => ({ text, bold: false, code: false });
const bold = (text: string) => ({ text, bold: true, code: false });
const code = (text: string, isBold = false) => ({ text, bold: isBold, code: true });

describe("parseMarkdown", () => {
  it.each<[string, string, Block[]]>([
    [
      "headings of levels 1 to 3",
      "# One\n## Two\n### Three",
      [
        { kind: "heading", level: 1, runs: [plain("One")] },
        { kind: "heading", level: 2, runs: [plain("Two")] },
        { kind: "heading", level: 3, runs: [plain("Three")] }
      ]
    ],
    [
      "a paragraph from joined lines, ended by a blank line",
      "first line\nsecond line\r\n\r\nnext",
      [
        { kind: "paragraph", runs: [plain("first line second line")] },
        { kind: "paragraph", runs: [plain("next")] }
      ]
    ],
    [
      "dash, star and numbered items, with a lazy continuation line",
      "- dash\n* star\n  continued\n1. one\n12. twelve",
      [
        { kind: "bullet", runs: [plain("dash")] },
        { kind: "bullet", runs: [plain("star continued")] },
        { kind: "numbered", runs: [plain("one")] },
        { kind: "numbered", runs: [plain("twelve")] }
      ]
    ],
    [
      "bold and code inline, code inside bold",
      "a **b** `c` **d `e`**",
      [
        {
          kind: "paragraph",
          runs: [
            plain("a "),
            bold("b"),
            plain(" "),
            code("c"),
            plain(" "),
            bold("d "),
            code("e", true)
          ]
        }
      ]
    ],
    [
      "markers without a closing pair as text",
      "**open and `tick",
      [{ kind: "paragraph", runs: [plain("**open and `tick")] }]
    ],
    [
      "syntax outside the subset as plain paragraph text",
      "#### Deep\n| a | b |\n[link](x)\n```\n#hashtag",
      [
        {
          kind: "paragraph",
          runs: [plain("#### Deep | a | b | [link](x) ``` #hashtag")]
        }
      ]
    ]
  ])("parses %s", (_name, source, expected) => {
    expect(parseMarkdown(source)).toEqual(expected);
  });
});
