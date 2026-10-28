import {
  Card,
  Gauge,
  Plot,
  PlotArcs,
  PlotArea,
  PlotAxis,
  PlotBand,
  PlotBars,
  PlotCrosshair,
  PlotDots,
  PlotGrid,
  PlotHighlight,
  PlotLegend,
  PlotLine,
  PlotStems,
  PlotTooltip,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type PlotFill,
  type PlotTable
} from "@repo/ui";
import { useState, type ReactNode } from "react";

import { LabNav } from "./lab.nav";
import type { LabCatalog } from "./lab.registry";
import {
  PriceTrendPlot,
  SavingsBarsPlot,
  TargetsGaugePlot
} from "./screens/23-price-tracker/23-price-tracker.charts";
import {
  DAY_MS,
  LAST_DAY,
  OPENING_DAY,
  aura,
  priceChecks,
  savedPerMonth,
  targetPeriods
} from "./screens/23-price-tracker/23-price-tracker.data";

type Mode = "light" | "dark";

/** The theme the page opens on: reference 23 is the look the primitives were built for. */
const DEFAULT_THEME = "lab-23-price-tracker";

// Fixed demo data: one week of visits and sign-ups, and a day of requests per 20 minutes.
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const visits = [120, 168, 154, 210, 236, 190, 251];
const signups = [42, 61, 55, 88, 97, 74, 109];
const forecast = [
  { low: 96, high: 150 },
  { low: 130, high: 196 },
  { low: 125, high: 188 },
  { low: 170, high: 244 },
  { low: 190, high: 270 },
  { low: 150, high: 224 },
  { low: 205, high: 290 }
];
const requests = Array.from({ length: 72 }, (_, slot) =>
  Math.round(40 + 30 * Math.sin(slot / 7) + 18 * Math.sin(slot / 2.3) + 50)
);

const point = { type: "point", domain: days, padding: 0.2 } as const;
const band = { type: "band", domain: days, paddingInner: 0.25, paddingOuter: 0.1 } as const;
const visitsScale = { type: "linear", domain: [0, 300] } as const;
const margin = { top: 12, right: 12, bottom: 28, left: 40 };
const weekTable: PlotTable = {
  columns: ["Visits", "Sign-ups"],
  rows: days.map((day, index) => ({
    header: day,
    cells: [String(visits[index]), String(signups[index])]
  }))
};
const byDay = (_: unknown, index: number): string => days[index] ?? "";
const asValue = (value: number): number => value;
const dayLabel = (value: string | number | Date): string => String(value);
const countLabel = (value: string | number | Date): string => String(value);

function Demo({
  children,
  description,
  title
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card className="grid content-start gap-ds-150 p-card">
      <h3 className="m-0 text-heading-sm">{title}</h3>
      <p className="m-0 text-body-sm text-ds-text-subtle">{description}</p>
      {children}
    </Card>
  );
}

// Fixed demo data for the interaction demos: a second week, a fortnight, and two months of cases.
const lastWeekVisits = [98, 140, 171, 160, 205, 214, 180];
const fortnight = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].flatMap((day) => [
  `${day} 1`,
  `${day} 2`
]);
const fortnightVisits = [88, 120, 131, 150, 142, 160, 175, 168, 190, 214, 201, 222, 236, 248];
const diagnoses = ["Pneumonia", "Bronchitis", "Asthma", "Influenza", "Other"];
const casesByMonth = {
  june: [95, 72, 58, 41, 30],
  july: [61, 88, 49, 83, 22]
} as const;
const projectsByWeek = {
  now: [9, 12, 9],
  before: [5, 10, 15]
} as const;

type Week = "this" | "last";

function WeekToggle({ onChange, value }: { onChange: (week: Week) => void; value: Week }) {
  return (
    <SegmentedControl
      aria-label="Week"
      className="justify-self-start"
      value={value}
      onValueChange={(next) => onChange(next === "last" ? "last" : "this")}
    >
      <SegmentedControlItem value="this">This week</SegmentedControlItem>
      <SegmentedControlItem value="last">Last week</SegmentedControlItem>
    </SegmentedControl>
  );
}

/** Hover, focus, or tap a bar for its value; click or press Enter to pin it; switch the week. */
function HoverAndPin() {
  const [week, setWeek] = useState<Week>("this");
  const [pinned, setPinned] = useState<number | null>(null);
  const data = week === "this" ? visits : lastWeekVisits;

  return (
    <Demo
      description="Hover a bar: it gets a ring and the tooltip follows it. Click a bar, or focus the chart and press Enter, to pin it; click it again or press Escape to unpin. The arrow keys, Home, and End move the active bar. Switch the week: the bars grow and shrink to the new values."
      title="Hover, pin, and switch data"
    >
      <WeekToggle onChange={setWeek} value={week} />
      <Plot
        height={180}
        hideTitle
        interaction={{ selectedIndex: pinned, onSelectedChange: setPinned }}
        margin={{ top: 8, right: 0, bottom: 28, left: 40 }}
        table={{
          columns: ["Visits"],
          rows: days.map((day, index) => ({ header: day, cells: [String(data[index])] }))
        }}
        title={`Visits per day, ${week === "this" ? "this" : "last"} week`}
        x={band}
        y={visitsScale}
      >
        <PlotGrid axis="y" dash="4 4" values={[0, 100, 200, 300]} />
        <PlotBars
          data={data}
          fill={(_, index) =>
            index === pinned
              ? { type: "gradient", color: "chart-1", from: 1, to: 0.55 }
              : { type: "solid", color: "chart-1", opacity: 0.75 }
          }
          radius={6}
          x={byDay}
          y={asValue}
        />
        <PlotAxis axis="y" format={countLabel} values={[0, 100, 200, 300]} />
        <PlotAxis axis="x" format={dayLabel} />
      </Plot>
      <p aria-live="polite" className="m-0 text-body-sm text-ds-text-subtle">
        {pinned === null ? "No bar pinned" : `Pinned: ${days[pinned] ?? ""}`}
      </p>
    </Demo>
  );
}

/** A trend with a crosshair; switching the range changes the point count, so the lines cross-fade. */
function CrosshairTrend() {
  const [range, setRange] = useState<"week" | "fortnight">("week");
  const labels = range === "week" ? days : fortnight;
  const data = range === "week" ? visits : fortnightVisits;
  const at = (_: unknown, index: number): string => labels[index] ?? "";

  return (
    <Demo
      description="PlotCrosshair follows the active point, and the line marks it with a dot. Switch the range: the point count changes, so the old line fades out as the new one fades in."
      title="PlotCrosshair and a cross-fade"
    >
      <SegmentedControl
        aria-label="Range"
        className="justify-self-start"
        value={range}
        onValueChange={(next) => setRange(next === "fortnight" ? "fortnight" : "week")}
      >
        <SegmentedControlItem value="week">7 days</SegmentedControlItem>
        <SegmentedControlItem value="fortnight">14 half days</SegmentedControlItem>
      </SegmentedControl>
      <Plot
        height={180}
        hideTitle
        margin={margin}
        table={{
          columns: ["Visits"],
          rows: labels.map((label, index) => ({ header: label, cells: [String(data[index])] }))
        }}
        title={`Visits, ${range === "week" ? "per day" : "per half day"} this week`}
        x={{ type: "point", domain: labels, padding: 0.2 }}
        y={visitsScale}
      >
        <PlotGrid axis="y" values={[0, 100, 200, 300]} />
        <PlotCrosshair />
        <PlotArea
          curve="monotone"
          data={data}
          fill={{ type: "gradient", color: "chart-2", from: 0.3, to: 0 }}
          x={at}
          y={asValue}
        />
        <PlotLine color="chart-2" curve="monotone" data={data} x={at} y={asValue} />
        <PlotAxis axis="y" format={countLabel} values={[0, 100, 200, 300]} />
        <PlotAxis axis="x" format={dayLabel} minSpacing={36} />
      </Plot>
    </Demo>
  );
}

/** Value-sized slices: hover or step through them; the slices tween to the other month. */
function Donut() {
  const [month, setMonth] = useState<"june" | "july">("june");
  const cases = casesByMonth[month];
  const total = cases.reduce((sum, count) => sum + count, 0);
  const share = (count: number) => `${Math.round((count / total) * 100)}%`;

  return (
    <Demo
      description="PlotArcs with values: slices sized by their counts. The plot picks a slice by angle and radius, so hover, the arrow keys, and Enter work as on a bar chart. Switch the month: the slices tween to the new shares."
      title="Donut from value slices"
    >
      <SegmentedControl
        aria-label="Month"
        className="justify-self-start"
        value={month}
        onValueChange={(next) => setMonth(next === "july" ? "july" : "june")}
      >
        <SegmentedControlItem value="june">June</SegmentedControlItem>
        <SegmentedControlItem value="july">July</SegmentedControlItem>
      </SegmentedControl>
      <Plot
        height={200}
        hideTitle
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        table={{
          columns: ["Cases", "Share"],
          rows: diagnoses.map((name, index) => ({
            header: name,
            cells: [String(cases[index] ?? 0), share(cases[index] ?? 0)]
          }))
        }}
        title={`Cases by diagnosis, ${month === "june" ? "June" : "July"}`}
        tooltip={(index) => (
          <p className="m-0 tabular-nums">
            {diagnoses[index]} {cases[index]} cases · {share(cases[index] ?? 0)}
          </p>
        )}
        overlay={
          <p className="pointer-events-none absolute inset-0 m-0 grid place-items-center text-heading-md tabular-nums">
            {total}
          </p>
        }
      >
        <PlotArcs
          cornerRadius={4}
          endAngle={2 * Math.PI}
          fill={(index) => ({
            type: "solid",
            color:
              (["chart-1", "chart-2", "chart-3", "chart-4", "neutral"] as const)[index] ?? "neutral"
          })}
          innerRatio={0.62}
          padAngle={0.03}
          startAngle={0}
          values={cases}
        />
      </Plot>
    </Demo>
  );
}

/** Two series side by side in each category, rounded at both ends. */
function GroupedBars() {
  const [week, setWeek] = useState<Week>("this");
  const series = week === "this" ? [visits, signups] : [lastWeekVisits, signups.map((v) => v - 12)];

  return (
    <Demo
      description="One PlotBars per series with group: a band sub-scale places them side by side, and round both rounds both ends. The active day rings both bars."
      title="Grouped bars"
    >
      <WeekToggle onChange={setWeek} value={week} />
      <PlotLegend
        items={[
          { key: "visits", label: "Visits", color: "chart-1", mark: "square" },
          { key: "signups", label: "Sign-ups", color: "chart-2", mark: "square" }
        ]}
      />
      <Plot
        height={180}
        hideTitle
        margin={{ top: 8, right: 0, bottom: 28, left: 0 }}
        table={{
          columns: ["Visits", "Sign-ups"],
          rows: days.map((day, index) => ({
            header: day,
            cells: series.map((values) => String(values[index]))
          }))
        }}
        title={`Visits and sign-ups per day, ${week === "this" ? "this" : "last"} week`}
        x={band}
        y={visitsScale}
      >
        {series.map((values, index) => (
          <PlotBars
            key={index}
            data={values}
            fill={{ type: "solid", color: index === 0 ? "chart-1" : "chart-2" }}
            group={{ index, count: series.length, padding: 0.2 }}
            radius="full"
            round="both"
            x={byDay}
            y={asValue}
          />
        ))}
        <PlotAxis axis="x" format={dayLabel} />
      </Plot>
    </Demo>
  );
}

/** The plain SVG gauge: hover a part, step through the parts, and switch the week. */
function GaugeDemo() {
  const [now, setNow] = useState(true);
  const counts = now ? projectsByWeek.now : projectsByWeek.before;

  return (
    <Demo
      description="Gauge without Recharts: hover a part, or focus it and use the arrow keys. Switch the week: the parts fill to the new values."
      title="Gauge"
    >
      <WeekToggle onChange={(week) => setNow(week === "this")} value={now ? "this" : "last"} />
      <Gauge
        centerValue={`${Math.round(((counts[0] ?? 0) / counts.reduce((a, b) => a + b, 0)) * 100)}%`}
        centerLabel="Done"
        hideTitle
        parts={[
          { key: "done", label: "Done", value: counts[0] ?? 0 },
          { key: "over", label: "Over 50%", value: counts[1] ?? 0 },
          { key: "under", label: "Under 50%", value: counts[2] ?? 0 }
        ]}
        title="Project completion"
        valueFormatter={(value) => `${value} projects`}
      />
    </Demo>
  );
}

function GridAndAxes() {
  return (
    <Demo
      description="Dashed horizontal grid lines on the y ticks, a monotone line, and SVG tick labels."
      title="PlotGrid, PlotAxis, PlotLine"
    >
      <Plot
        height={180}
        hideTitle
        margin={margin}
        table={weekTable}
        title="Visits per day this week"
        x={point}
        y={visitsScale}
      >
        <PlotGrid axis="y" dash="4 4" values={[0, 100, 200, 300]} />
        <PlotLine curve="monotone" data={visits} x={byDay} y={asValue} />
        <PlotAxis axis="y" format={countLabel} values={[0, 100, 200, 300]} />
        <PlotAxis axis="x" format={dayLabel} />
      </Plot>
    </Demo>
  );
}

function Stems() {
  return (
    <Demo
      description="One vertical stem per value, dense enough to read as a texture, over a grid line."
      title="PlotStems"
    >
      <Plot
        height={180}
        hideTitle
        margin={{ top: 12, right: 4, bottom: 8, left: 4 }}
        table={{
          columns: ["Requests"],
          rows: requests.map((count, slot) => ({
            header: `${String(Math.floor(slot / 3)).padStart(2, "0")}:${String((slot % 3) * 20).padStart(2, "0")}`,
            cells: [String(count)]
          }))
        }}
        title="Requests every 20 minutes today"
        x={{ type: "linear", domain: [0, requests.length - 1] }}
        y={{ type: "linear", domain: [0, 160] }}
      >
        <PlotGrid axis="y" values={[0, 80, 160]} />
        <PlotStems color="chart-2" data={requests} width={3} x={(_, slot) => slot} y={asValue} />
      </Plot>
    </Demo>
  );
}

function Lines() {
  return (
    <Demo
      description="Curves, dash patterns, and caps: a solid monotone line, a dashed step line, and round dots from a 0-length dash."
      title="PlotLine"
    >
      <PlotLegend
        items={[
          { key: "visits", label: "Visits", color: "chart-1" },
          { key: "signups", label: "Sign-ups", color: "chart-2" },
          { key: "target", label: "Target", color: "chart-3" }
        ]}
      />
      <Plot
        height={160}
        hideTitle
        margin={margin}
        table={weekTable}
        title="Visits and sign-ups per day this week"
        x={point}
        y={visitsScale}
      >
        <PlotLine curve="monotone" data={visits} width={2.5} x={byDay} y={asValue} />
        <PlotLine color="chart-2" curve="step" dash="6 5" data={signups} x={byDay} y={asValue} />
        <PlotLine
          cap="round"
          color="chart-3"
          dash="0 8"
          data={days.map(() => 200)}
          width={4}
          x={byDay}
          y={asValue}
        />
        <PlotAxis axis="x" format={dayLabel} />
      </Plot>
    </Demo>
  );
}

const areaFills: [string, PlotFill][] = [
  ["Flat", { type: "solid", color: "chart-1", opacity: 0.2 }],
  ["Gradient", { type: "gradient", color: "chart-1", from: 0.45, to: 0 }],
  ["Hatched", { type: "hatch", color: "chart-1", spacing: 8, angle: -22, width: 1.5, opacity: 0.6 }]
];

function Areas() {
  return (
    <Demo
      description="The area under a series, filled flat, with a gradient toward the baseline, or with hatching."
      title="PlotArea"
    >
      <div className="grid grid-cols-1 gap-ds-200 sm:grid-cols-3">
        {areaFills.map(([name, fill]) => (
          <div key={name} className="grid gap-ds-050">
            <p className="m-0 text-body-sm text-ds-text-subtle">{name}</p>
            <Plot
              height={110}
              hideTitle
              margin={{ top: 8, right: 4, bottom: 4, left: 4 }}
              table={weekTable}
              title={`Visits per day this week, ${name.toLowerCase()} area`}
              x={point}
              y={visitsScale}
            >
              <PlotArea curve="monotone" data={visits} fill={fill} x={byDay} y={asValue} />
              <PlotLine curve="monotone" data={visits} x={byDay} y={asValue} />
            </Plot>
          </div>
        ))}
      </div>
    </Demo>
  );
}

function Band() {
  return (
    <Demo
      description="The area between two series, such as a forecast range, with the expected line inside it."
      title="PlotBand"
    >
      <Plot
        height={180}
        hideTitle
        margin={margin}
        table={{
          columns: ["Low", "High", "Visits"],
          rows: days.map((day, index) => ({
            header: day,
            cells: [
              String(forecast[index]?.low),
              String(forecast[index]?.high),
              String(visits[index])
            ]
          }))
        }}
        title="Visit forecast range and visits this week"
        x={point}
        y={visitsScale}
      >
        <PlotGrid axis="y" values={[0, 100, 200, 300]} />
        <PlotBand
          curve="catmull-rom"
          fill={{ type: "solid", color: "chart-2", opacity: 0.18 }}
          lower={{ data: forecast, x: byDay, y: (range) => range.low }}
          upper={{ data: forecast, x: byDay, y: (range) => range.high }}
        />
        <PlotLine color="chart-2" curve="catmull-rom" data={visits} x={byDay} y={asValue} />
        <PlotAxis axis="y" format={countLabel} values={[0, 100, 200, 300]} />
        <PlotAxis axis="x" format={dayLabel} />
      </Plot>
    </Demo>
  );
}

function Bars() {
  const [selected, setSelected] = useState(6);

  return (
    <Demo
      description="Rounded data ends, a quiet track, gradient fills, and a selected bar. Arrow keys or the pointer move the selection."
      title="PlotBars"
    >
      <Plot
        height={180}
        hideTitle
        margin={{ top: 8, right: 0, bottom: 28, left: 0 }}
        table={weekTable}
        title="Visits per day this week"
        x={band}
        y={visitsScale}
        scrub={{
          stops: days,
          selectedIndex: selected,
          onSelect: setSelected,
          label: "Pick a day",
          describe: (index) => `${days[index] ?? ""}: ${visits[index] ?? 0} visits`
        }}
      >
        <PlotBars
          data={visits}
          fill={(_, index) =>
            index === selected
              ? { type: "gradient", color: "chart-1", from: 1, to: 0.35 }
              : { type: "gradient", color: "chart-1", from: 0.45, to: 0.15 }
          }
          radius="full"
          track={{ type: "solid", color: "grid", opacity: 0.5 }}
          x={byDay}
          y={asValue}
        />
        <PlotAxis axis="x" format={dayLabel} />
      </Plot>
    </Demo>
  );
}

function Markers() {
  return (
    <Demo
      description="A capsule over one point and a full-height band over another, under filled and hollow markers."
      title="PlotHighlight, PlotDots"
    >
      <Plot
        height={180}
        hideTitle
        margin={margin}
        table={weekTable}
        title="Visits and sign-ups per day this week"
        x={point}
        y={visitsScale}
      >
        <PlotHighlight
          fill={{ type: "solid", color: "neutral", opacity: 0.15 }}
          radius={4}
          width={36}
          x="Thu"
        />
        <PlotHighlight
          fill={{ type: "solid", color: "chart-1", opacity: 0.35 }}
          pad={8}
          stroke={{ color: "chart-1", width: 1 }}
          width={22}
          x="Sun"
          y1={signups[6] ?? 0}
          y2={visits[6] ?? 0}
        />
        <PlotLine color="chart-1" data={visits} x={byDay} y={asValue} />
        <PlotLine color="chart-2" data={signups} x={byDay} y={asValue} />
        <PlotDots data={visits} r={4} x={byDay} y={asValue} />
        <PlotDots color="chart-2" data={signups} hollow r={4} x={byDay} y={asValue} />
        <PlotAxis axis="x" format={dayLabel} />
      </Plot>
    </Demo>
  );
}

function Arcs() {
  const share = 0.65;
  const halfRing = 20;
  const fullRing = 12;

  return (
    <Demo
      description="Segmented rings from d3.arc: a half-ring gauge with round-cornered segments and a full ring that fills by segment."
      title="PlotArcs"
    >
      <div className="grid grid-cols-1 items-end gap-ds-200 sm:grid-cols-2">
        <Plot
          height={110}
          hideTitle
          table={{ columns: [], rows: [{ header: "Storage used", cells: ["65%"] }] }}
          title="Storage used"
          overlay={
            <p className="absolute inset-x-0 bottom-0 m-0 text-center text-heading-md tabular-nums">
              65%
            </p>
          }
        >
          <PlotArcs
            cornerRadius={3}
            count={halfRing}
            fill={(index) =>
              index < Math.round(share * halfRing)
                ? { type: "solid", color: "chart-1" }
                : { type: "solid", color: "grid" }
            }
            innerRatio={0.7}
          />
        </Plot>
        <Plot
          height={130}
          hideTitle
          table={{ columns: [], rows: [{ header: "Tasks done", cells: ["8 of 12"] }] }}
          title="Tasks done"
          overlay={
            <p className="absolute inset-0 m-0 grid place-items-center text-heading-md tabular-nums">
              8/12
            </p>
          }
        >
          <PlotArcs
            cornerRadius={2}
            count={fullRing}
            endAngle={2 * Math.PI}
            fill={(index) =>
              index < 8 ? { type: "solid", color: "chart-2" } : { type: "solid", color: "grid" }
            }
            innerRatio={0.72}
            padAngle={0.06}
            startAngle={0}
          />
        </Plot>
      </div>
    </Demo>
  );
}

function Scrubbing() {
  const [selected, setSelected] = useState(4);
  const day = days[selected] ?? "Mon";

  return (
    <Demo
      description="Focus the plot and use the arrow keys, Home, and End, or move the pointer. The tooltip follows the selection and flips sides near the edge."
      title="Scrubbing and PlotTooltip"
    >
      <Plot
        height={180}
        hideTitle
        margin={margin}
        table={weekTable}
        title="Visits and sign-ups per day this week"
        x={point}
        y={visitsScale}
        scrub={{
          stops: days,
          selectedIndex: selected,
          onSelect: setSelected,
          label: "Pick a day",
          describe: (index) =>
            `${days[index] ?? ""}: ${visits[index] ?? 0} visits, ${signups[index] ?? 0} sign-ups`
        }}
        overlay={
          <PlotTooltip offset={{ x: 14, y: -4 }} x={day} y="top">
            <p className="m-0 text-body-sm text-ds-text-subtle">{day}</p>
            <p className="m-0 tabular-nums">{visits[selected]} visits</p>
            <p className="m-0 tabular-nums">{signups[selected]} sign-ups</p>
          </PlotTooltip>
        }
      >
        <PlotHighlight
          fill={{ type: "solid", color: "chart-1", opacity: 0.12 }}
          radius="full"
          width={28}
          x={day}
        />
        <PlotLine curve="monotone" data={visits} x={byDay} y={asValue} />
        <PlotLine color="chart-2" curve="monotone" data={signups} x={byDay} y={asValue} />
        <PlotDots
          data={visits}
          hollow
          r={4}
          skip={(_, index) => index !== selected}
          x={byDay}
          y={asValue}
        />
        <PlotDots
          color="chart-2"
          data={signups}
          hollow
          r={4}
          skip={(_, index) => index !== selected}
          x={byDay}
          y={asValue}
        />
        <PlotAxis axis="x" format={dayLabel} />
      </Plot>
    </Demo>
  );
}

const months = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
const monthNames = [
  "August 2025",
  "September 2025",
  "October 2025",
  "November 2025",
  "December 2025",
  "January 2026",
  "February 2026",
  "March 2026",
  "April 2026",
  "May 2026",
  "June 2026",
  "July 2026"
];

/** The three charts of reference 23, as the screen draws them. */
function Reference23() {
  const [day, setDay] = useState(OPENING_DAY);
  const [month, setMonth] = useState(6);
  const from = LAST_DAY - 39 * DAY_MS;
  const period = targetPeriods[0];

  return (
    <div className="grid grid-cols-1 gap-ds-200 lg:grid-cols-[minmax(0,17fr)_minmax(0,40fr)]">
      <Card className="grid gap-ds-150 p-card lg:col-span-2">
        <h3 className="m-0 text-heading-sm">Price trend</h3>
        <p className="m-0 text-body-sm text-ds-text-subtle">
          PlotBand with a hatch fill, PlotHighlight, two PlotDots series, PlotAxis, and PlotTooltip.
        </p>
        <PriceTrendPlot
          data={{
            average: priceChecks(aura, "average"),
            best: priceChecks(aura, "best"),
            from,
            to: LAST_DAY
          }}
          onSelect={(index) => setDay(from + index * DAY_MS)}
          selectedIndex={Math.round((day - from) / DAY_MS)}
          title={`${aura.name} prices, last 40 days to July 10, 2026`}
        />
      </Card>
      <Card className="grid content-start gap-ds-150 p-card">
        <h3 className="m-0 text-heading-sm">Price targets</h3>
        <p className="m-0 text-body-sm text-ds-text-subtle">
          PlotArcs: 14 rounded segments that shade from violet to pale.
        </p>
        {period === undefined ? null : (
          <TargetsGaugePlot
            caption="Targets reached"
            reached={period.reached}
            set={period.set}
            title="Price targets reached, last 12 months"
          />
        )}
      </Card>
      <Card className="grid content-start gap-ds-150 p-card">
        <h3 className="m-0 text-heading-sm">Monthly savings</h3>
        <p className="m-0 text-body-sm text-ds-text-subtle">
          PlotBars with gradient fills, rounded tops, and a 3:1 edge on the pale bars.
        </p>
        <SavingsBarsPlot
          onSelect={setMonth}
          points={savedPerMonth.map((saved, index) => ({
            period: months[index] ?? "",
            long: monthNames[index] ?? "",
            saved
          }))}
          selectedIndex={month}
          title="Savings per month, August 2025 – July 2026"
        />
      </Card>
    </div>
  );
}

/** Every SVG chart primitive at work, and the charts of reference 23 built from them. */
export function ChartsPage({ catalog }: { catalog: LabCatalog }) {
  const [theme, setTheme] = useState(
    catalog.themes.some((entry) => entry.name === DEFAULT_THEME)
      ? DEFAULT_THEME
      : (catalog.themes[0]?.name ?? "")
  );
  const [mode, setMode] = useState<Mode>("light");

  return (
    <div className="min-h-screen bg-ds-surface-sunken text-ds-text">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-ds-150 border-b border-ds-border bg-ds-surface px-ds-300 py-ds-150">
        <p className="m-0 text-heading-sm">Kaine UI Lab</p>
        <div className="mr-auto">
          <LabNav current="charts" />
        </div>
        {/* The .ui-select__trigger rule fills its container, so the container sets the width. */}
        <div className="w-56">
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger aria-label="Theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {catalog.themes.map((entry) => (
                <SelectItem key={entry.name} value={entry.name}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <SegmentedControl
          aria-label="Color mode"
          value={mode}
          onValueChange={(value) => setMode(value === "dark" ? "dark" : "light")}
        >
          <SegmentedControlItem value="light">Light</SegmentedControlItem>
          <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
        </SegmentedControl>
      </header>
      <main
        className="grid gap-ds-400 bg-ds-surface-sunken p-ds-300 text-ds-text"
        data-color-mode={mode}
        data-theme={theme}
      >
        <div className="grid gap-ds-100">
          <h1 className="m-0 text-heading-lg">Chart primitives</h1>
          <p className="m-0 max-w-prose text-body text-ds-text-subtle">
            d3 does the math and SVG draws the marks; titles, legends, and tooltips are HTML. Each
            plot is a titled figure with a hidden data table.
          </p>
        </div>
        <section aria-labelledby="charts-interaction" className="grid gap-ds-200">
          <h2 className="m-0 text-heading-md" id="charts-interaction">
            Interaction and motion
          </h2>
          <p className="m-0 max-w-prose text-body text-ds-text-subtle">
            Every plot with a table row per point is a slider over its points, with no wiring:
            hover, focus, or tap shows a point and highlights its mark, and a click, a tap, or Enter
            pins it. When the data changes, the marks tween with the motion tokens. Under reduced
            motion (the system setting, followed live) the values snap and the tooltip moves without
            sliding.
          </p>
          <div className="grid grid-cols-1 gap-ds-200 lg:grid-cols-2">
            <HoverAndPin />
            <CrosshairTrend />
            <Donut />
            <GroupedBars />
            <GaugeDemo />
          </div>
        </section>
        <section aria-labelledby="charts-primitives" className="grid gap-ds-200">
          <h2 className="m-0 text-heading-md" id="charts-primitives">
            Primitives
          </h2>
          <div className="grid grid-cols-1 gap-ds-200 lg:grid-cols-2">
            <GridAndAxes />
            <Stems />
            <Lines />
            <Band />
            <Bars />
            <Markers />
            <Arcs />
            <Scrubbing />
            <div className="lg:col-span-2">
              <Areas />
            </div>
          </div>
        </section>
        <section aria-labelledby="charts-reference" className="grid gap-ds-200">
          <h2 className="m-0 text-heading-md" id="charts-reference">
            Reference 23, built from the primitives
          </h2>
          <Reference23 />
        </section>
      </main>
    </div>
  );
}
