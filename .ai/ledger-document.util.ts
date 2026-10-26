// A ledger is a markdown file with two marker regions: a hand-edited data
// region holding one ```json block, and a generated region rendered from it.
// The scorecard and harness-eval ledgers supply only their schema and renderer.

const markerRegion = (marker: string): RegExp =>
  new RegExp(`(<!--\\s*${marker}:start\\s*-->)([\\s\\S]*?)(<!--\\s*${marker}:end\\s*-->)`);

export const extractRegion = (raw: string, marker: string): string => {
  const match = markerRegion(marker).exec(raw);
  if (!match) {
    throw new Error(`Ledger is missing the ${marker} marker pair`);
  }
  return match[2] ?? "";
};

export const replaceRegion = (raw: string, marker: string, body: string): string => {
  const pattern = markerRegion(marker);
  if (!pattern.test(raw)) {
    throw new Error(`Ledger is missing the ${marker} marker pair`);
  }
  return raw.replace(pattern, (_full, start: string, _body: string, end: string) =>
    [start, "", body.trim(), "", end].join("\n")
  );
};

export interface LedgerDocument<T> {
  /** Reads the data region through the ledger's schema. */
  parse: (raw: string) => T;
  /** Returns `raw` with the generated region rendered from `data`. */
  rewrite: (raw: string, data: T) => string;
}

export const ledgerDocument = <T>(spec: {
  dataMarker: string;
  generatedMarker: string;
  parseData: (value: unknown) => T;
  render: (data: T) => string;
  /** A blank data region, or an empty json block, reads as `{}`. */
  allowEmpty?: boolean;
}): LedgerDocument<T> => ({
  parse: (raw) => {
    const region = extractRegion(raw, spec.dataMarker);
    const fence = /```json\s*([\s\S]*?)```/.exec(region);
    const body = (fence ? (fence[1] ?? "") : region).trim();
    if (body === "" && spec.allowEmpty) {
      return spec.parseData({});
    }
    if (!fence) {
      throw new Error(`Ledger ${spec.dataMarker} region has no \`\`\`json block`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Ledger ${spec.dataMarker} JSON is invalid: ${message}`);
    }
    return spec.parseData(parsed);
  },
  rewrite: (raw, data) => replaceRegion(raw, spec.generatedMarker, spec.render(data))
});
