import JSZip from "jszip";

/**
 * Office Open XML packages: the ZIP files behind `.docx` and `.pptx`. `normalizePackage` makes
 * the bytes depend on the content only, and `verifyPackage` checks the parts Word and
 * PowerPoint need before they open a file.
 */

export const DOC_KINDS = ["docx", "pptx"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const isDocKind = (value: string): value is DocKind =>
  DOC_KINDS.some((kind) => kind === value);

/**
 * The one date every export carries: in the ZIP entries and as the created and modified
 * document properties. Both libraries stamp the current time, so the same input would give
 * different bytes on each run.
 */
const FIXED_DATE = new Date("2000-01-01T00:00:00Z");
const FIXED_TIMESTAMP = "2000-01-01T00:00:00Z";
const CORE_PROPERTIES = "docProps/core.xml";
const CORE_DATES = /(<dcterms:(created|modified)\b[^>]*>)[^<]*(<\/dcterms:\2>)/g;

/** The same package with fixed dates. Entries keep their order; folder entries are left out. */
export const normalizePackage = async (bytes: Uint8Array): Promise<Buffer> => {
  const source = await JSZip.loadAsync(bytes);
  const target = new JSZip();
  for (const entry of Object.values(source.files)) {
    if (entry.dir) continue;
    const content =
      entry.name === CORE_PROPERTIES
        ? (await entry.async("string")).replace(CORE_DATES, `$1${FIXED_TIMESTAMP}$3`)
        : await entry.async("uint8array");
    target.file(entry.name, content, { date: FIXED_DATE, createFolders: false });
  }
  return target.generateAsync({ type: "nodebuffer", compression: "DEFLATE", platform: "DOS" });
};

export type VerifyResult =
  { readonly ok: true; readonly parts: number } | { readonly ok: false; readonly reason: string };

const SLIDE_PART = /^ppt\/slides\/slide\d+\.xml$/;

const requiredParts = (kind: DocKind): readonly string[] =>
  kind === "docx"
    ? ["[Content_Types].xml", "_rels/.rels", "word/document.xml"]
    : ["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml"];

/** Whether the bytes are a ZIP with the parts a `kind` package needs. */
export const verifyPackage = async (bytes: Uint8Array, kind: DocKind): Promise<VerifyResult> => {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return { ok: false, reason: "not a ZIP archive" };
  }
  const names = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);
  const missing = requiredParts(kind).filter((part) => !names.includes(part));
  if (kind === "pptx" && !names.some((name) => SLIDE_PART.test(name))) {
    missing.push("ppt/slides/slide1.xml (no slide)");
  }
  return missing.length > 0
    ? { ok: false, reason: `missing ${missing.join(", ")}` }
    : { ok: true, parts: names.length };
};
