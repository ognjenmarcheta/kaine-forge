import { densityTokens, layoutTokens, typeStyles } from "@repo/theme";
import { useEffect, useState } from "react";

import { LabNav } from "./lab.nav";

const CHARTS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"] as const;

/** Tailwind reads class names from the source, so each swatch and sample names its class whole. */
const SWATCH: Readonly<Record<(typeof CHARTS)[number], string>> = {
  "chart-1": "bg-ds-chart-1",
  "chart-2": "bg-ds-chart-2",
  "chart-3": "bg-ds-chart-3",
  "chart-4": "bg-ds-chart-4",
  "chart-5": "bg-ds-chart-5",
  "chart-6": "bg-ds-chart-6"
};

const STYLES = [
  "title",
  "heading",
  "body",
  "label",
  "mono"
] as const satisfies readonly (keyof typeof typeStyles)[];

const SAMPLE: Readonly<Record<keyof typeof typeStyles, string>> = {
  title: "text-heading-lg",
  heading: "text-heading-sm",
  body: "text-body",
  label: "text-body-sm",
  mono: "text-code-sm"
};

/** The status roles the desk draws, each with its glyph: color is never the only cue. */
const STATUSES = [
  { role: "success", glyph: "✓", label: "Passed" },
  { role: "attention", glyph: "◷", label: "Your turn" },
  { role: "warning", glyph: "▲", label: "Warning" },
  { role: "danger", glyph: "!", label: "Stopped" },
  { role: "information", glyph: "↻", label: "Running" },
  { role: "neutral", glyph: "–", label: "Cancelled" }
] as const;

/** The value a token has right now, read from the page, so a theme or mode change shows at once. */
function useTokenValues(names: readonly string[]): Readonly<Record<string, string>> {
  const [values, setValues] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => {
    const read = (): void => {
      const style = getComputedStyle(document.documentElement);
      setValues(
        Object.fromEntries(
          names.map((name) => [name, style.getPropertyValue(`--ds-${name}`).trim()])
        )
      );
    };
    read();
    // The theme, the mode, and the density are attributes on the root.
    const watch = new MutationObserver(read);
    watch.observe(document.documentElement, { attributes: true });
    return () => watch.disconnect();
  }, [names]);
  return values;
}

function Section({
  title,
  note,
  children
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-ds-150 rounded-card border border-ds-border bg-ds-surface-raised p-ds-250">
      <div className="grid gap-ds-050">
        <h2 className="m-0 text-heading-sm">{title}</h2>
        <p className="m-0 text-body-sm text-ds-text-subtle">{note}</p>
      </div>
      {children}
    </section>
  );
}

const LAYOUT_NAMES = Object.keys(layoutTokens);
const CHART_NAMES = [...CHARTS];

/**
 * The tokens the desk is built from, read from the page: the five text styles, the chart colors,
 * the status roles with their glyphs, the two densities, and the named layers and widths.
 */
export function TokensPage() {
  const layout = useTokenValues(LAYOUT_NAMES);
  const charts = useTokenValues(CHART_NAMES);
  return (
    <main className="grid gap-ds-250 p-ds-300 text-ds-text">
      <header className="grid gap-ds-150">
        <h1 className="m-0 text-heading-lg">Tokens</h1>
        <LabNav current="tokens" />
      </header>
      <Section
        title="Five text styles"
        note="Every screen uses only these. Label is the floor: nothing on the desk is smaller."
      >
        <table className="w-full border-collapse text-body-sm">
          <tbody>
            {STYLES.map((style) => (
              <tr key={style} className="border-t border-ds-border">
                <th scope="row" className="w-32 py-ds-100 pr-ds-200 text-left font-medium">
                  {style}
                </th>
                <td className="py-ds-100 pr-ds-200 font-mono text-ds-text-subtle">{`--ds-type-${style} → --ds-font-${typeStyles[style]}`}</td>
                <td className={`py-ds-100 ${SAMPLE[style]}`}>
                  The quick brown fox jumps over the lazy dog.
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section
        title="Chart colors"
        note="The light series stays apart for deuteranopia, protanopia, and tritanopia. Charts still carry labels."
      >
        <ul className="m-0 grid grid-cols-3 gap-ds-100 p-0 sm:grid-cols-6">
          {CHARTS.map((name) => (
            <li key={name} className="grid list-none gap-ds-050">
              <span className={`block h-ds-500 rounded-md ${SWATCH[name]}`} aria-hidden="true" />
              <span className="text-body-sm font-medium">{name}</span>
              <span className="font-mono text-body-xs text-ds-text-subtle">{charts[name]}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section
        title="Status: glyph and words, every time"
        note="Your turn has its own attention role, so a theme can tell it apart from a real warning."
      >
        <p className="m-0 flex flex-wrap gap-ds-100">
          {STATUSES.map((status) => (
            <span key={status.role} className={`dk-st dk-st-${status.role}`}>
              <span className="dk-g" aria-hidden="true">
                {status.glyph}
              </span>
              {status.label}
            </span>
          ))}
          <span className="dk-unread">
            <i aria-hidden="true" />
            New
          </span>
        </p>
      </Section>
      <Section
        title="Density"
        note="One setting for the whole app, in Preferences. Compact shows each item on two lines."
      >
        <table className="w-full border-collapse text-body-sm">
          <thead>
            <tr>
              <th scope="col" className="py-ds-100 text-left font-medium">
                Token
              </th>
              <th scope="col" className="py-ds-100 text-left font-medium">
                Comfortable
              </th>
              <th scope="col" className="py-ds-100 text-left font-medium">
                Compact
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(densityTokens.comfortable).map(([name, value]) => (
              <tr key={name} className="border-t border-ds-border font-mono text-body-xs">
                <td className="py-ds-075">{`--ds-${name}`}</td>
                <td className="py-ds-075">{value}</td>
                <td className="py-ds-075">
                  {Object.entries(densityTokens.compact).find(([key]) => key === name)?.[1]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section
        title="Layers and layout"
        note="Named layers replace raw z-index numbers; named widths replace sizes a component picks."
      >
        <ul className="m-0 grid gap-ds-050 p-0 font-mono text-body-xs">
          {LAYOUT_NAMES.map((name) => (
            <li
              key={name}
              className="flex list-none justify-between border-t border-ds-border py-ds-075"
            >
              <span>{`--ds-${name}`}</span>
              <span className="text-ds-text-subtle">{layout[name]}</span>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
