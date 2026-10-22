import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun
} from "docx";

import { plainText, type Block, type Run } from "../markdown/markdown.parse";

/**
 * A Word document from parsed Markdown. The first `#` heading is the document title; `#`,
 * `##` and `###` are Heading 1 to 3; bullets and numbered items are lists. Each run of
 * numbered items restarts at 1.
 */

const AUTHOR = "Kaine Forge";
const NUMBERED = "numbered";
const CODE_FONT = "Consolas";

const HEADING_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3
} as const;

const textRuns = (runs: readonly Run[]): TextRun[] =>
  runs.map(
    (run) =>
      new TextRun({ text: run.text, bold: run.bold, ...(run.code ? { font: CODE_FONT } : {}) })
  );

export const renderDocx = async (blocks: readonly Block[], fallbackTitle: string) => {
  const title = blocks.find((block) => block.kind === "heading" && block.level === 1);
  let list = 0;
  const children = blocks.map((block, index) => {
    const children = textRuns(block.runs);
    switch (block.kind) {
      case "heading":
        return new Paragraph({ heading: HEADING_LEVEL[block.level], children });
      case "paragraph":
        return new Paragraph({ children });
      case "bullet":
        return new Paragraph({ bullet: { level: 0 }, children });
      case "numbered":
        if (blocks[index - 1]?.kind !== "numbered") list += 1;
        return new Paragraph({
          numbering: { reference: NUMBERED, level: 0, instance: list },
          children
        });
    }
  });
  const document = new Document({
    creator: AUTHOR,
    lastModifiedBy: AUTHOR,
    title: title === undefined ? fallbackTitle : plainText(title.runs),
    revision: 1,
    numbering: {
      config: [
        {
          reference: NUMBERED,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } }
            }
          ]
        }
      ]
    },
    sections: [{ children }]
  });
  return Packer.toBuffer(document);
};
