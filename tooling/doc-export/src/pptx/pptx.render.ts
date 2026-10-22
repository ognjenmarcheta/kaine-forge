import PptxGenJS from "pptxgenjs";

import { plainText, type Block, type Run } from "../markdown/markdown.parse";

/**
 * A 16:9 PowerPoint deck from parsed Markdown. The first `#` heading is the title slide, with
 * the paragraph right after it as the subtitle. Every other `#` or `##` heading starts a slide
 * with that title. Content before the first such slide goes on a slide titled with the deck
 * title, so no text is dropped. `###` headings show as bold body lines.
 */

const AUTHOR = "Kaine Forge";
const CODE_FONT = "Consolas";

interface Cover {
  readonly title: string;
  subtitle: readonly Run[] | null;
}

interface SlideModel {
  readonly title: string;
  readonly body: Block[];
}

interface Deck {
  readonly title: string;
  /** `null`: the Markdown has no `#` heading and the deck has other slides. */
  readonly cover: Cover | null;
  readonly slides: readonly SlideModel[];
}

const deckOf = (blocks: readonly Block[], fallbackTitle: string): Deck => {
  const titleBlock = blocks.find((block) => block.kind === "heading" && block.level === 1);
  const title = titleBlock === undefined ? fallbackTitle : plainText(titleBlock.runs);
  const cover: Cover | null = titleBlock === undefined ? null : { title, subtitle: null };
  const slides: SlideModel[] = [];
  let current: SlideModel | null = null;
  blocks.forEach((block, index) => {
    if (block.kind === "heading" && block.level <= 2) {
      current = block === titleBlock ? null : { title: plainText(block.runs), body: [] };
      if (current !== null) slides.push(current);
      return;
    }
    if (current === null) {
      if (cover !== null && block.kind === "paragraph" && blocks[index - 1] === titleBlock) {
        cover.subtitle = block.runs;
        return;
      }
      current = { title, body: [] };
      slides.push(current);
    }
    current.body.push(block);
  });
  // A deck needs a slide: an empty input still gets its title slide.
  return {
    title,
    cover: cover ?? (slides.length === 0 ? { title, subtitle: null } : null),
    slides
  };
};

const textProps = (runs: readonly Run[], options: PptxGenJS.TextPropsOptions) =>
  runs.map((run): PptxGenJS.TextProps => ({
    text: run.text,
    options: { ...options, bold: run.bold, ...(run.code ? { fontFace: CODE_FONT } : {}) }
  }));

/** Each block is one paragraph: its last run breaks the line. */
const bodyProps = (body: readonly Block[]): PptxGenJS.TextProps[] =>
  body.flatMap((block) => {
    const options: PptxGenJS.TextPropsOptions =
      block.kind === "bullet"
        ? { bullet: true }
        : block.kind === "numbered"
          ? { bullet: { type: "number" } }
          : {};
    const runs: readonly Run[] =
      block.kind === "heading"
        ? block.runs.map((run) => ({ ...run, bold: true }))
        : block.runs.length > 0
          ? block.runs
          : [{ text: "", bold: false, code: false }];
    const props = textProps(runs, options);
    const last = props.at(-1);
    if (last !== undefined) last.options = { ...last.options, breakLine: true };
    return props;
  });

export const renderPptx = async (blocks: readonly Block[], fallbackTitle: string) => {
  const deck = deckOf(blocks, fallbackTitle);
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.author = AUTHOR;
  pres.company = AUTHOR;
  pres.revision = "1";
  pres.subject = deck.title;
  pres.title = deck.title;

  if (deck.cover !== null) {
    const slide = pres.addSlide();
    slide.addText(deck.cover.title, {
      x: 0.5,
      y: 1.6,
      w: 9,
      h: 1.2,
      fontSize: 36,
      bold: true,
      align: "center"
    });
    if (deck.cover.subtitle !== null) {
      slide.addText(textProps(deck.cover.subtitle, {}), {
        x: 0.5,
        y: 3,
        w: 9,
        h: 1,
        fontSize: 20,
        align: "center"
      });
    }
  }
  for (const model of deck.slides) {
    const slide = pres.addSlide();
    slide.addText(model.title, { x: 0.5, y: 0.3, w: 9, h: 0.9, fontSize: 28, bold: true });
    if (model.body.length > 0) {
      slide.addText(bodyProps(model.body), {
        x: 0.5,
        y: 1.3,
        w: 9,
        h: 4,
        fontSize: 18,
        valign: "top",
        fit: "shrink"
      });
    }
  }
  const output = await pres.write({ outputType: "nodebuffer" });
  if (!(output instanceof Uint8Array)) throw new Error("pptxgenjs did not return bytes");
  return output;
};
