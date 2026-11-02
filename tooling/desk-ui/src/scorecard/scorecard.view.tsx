import {
  SCORECARD_DIMENSIONS,
  type ScorecardFinding,
  type ScorecardFlowLayout,
  type ScorecardRun,
  type ScorecardView as ScorecardData
} from "@repo/desk/contracts";
import {
  Button,
  Card,
  ChevronRight,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tag
} from "@repo/ui";
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";

import {
  BAND_TONE,
  DISPOSITION_TONE,
  FINDING_FILTERS,
  SORTS,
  bandOf,
  dimensionRows,
  findingsView,
  isProposed,
  scoredCount,
  shortCommit,
  sortRows,
  summaryOf,
  type DimensionRow,
  type FindingFilter,
  type Sort
} from "./scorecard.model";
import { toApiError, type FailureCode } from "../api/api.client";
import { useLanguage, useT, type Translate } from "../i18n/i18n.t";
import { formatCount } from "../shell/shell.format";
import { Segmented } from "../shell/shell.layout";
import { usePaletteActions } from "../shell/shell.palette";
import { FailureText, LoadingLines, Muted } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { sparkPoints } from "../stats/stats.model";
import { StatusChip } from "../status/status.chip";

const score = (value: number | null, language: string): string =>
  value === null
    ? "—"
    : new Intl.NumberFormat(language, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      }).format(value);

/** A change in words and a glyph, so the arrow is not the only signal. */
function Delta({ value }: { readonly value: number | null }) {
  const t = useT();
  const { language } = useLanguage();
  if (value === null) return <span className="desk-muted">{t("desk.scorecard.delta.none")}</span>;
  const direction = value > 0 ? "up" : value < 0 ? "down" : "held";
  const glyph = direction === "up" ? "▲" : direction === "down" ? "▼" : "•";
  return (
    <span className="desk-score-delta" data-direction={direction}>
      <span aria-hidden="true">{glyph} </span>
      {t(`desk.scorecard.delta.${direction}`, { value: score(Math.abs(value), language) })}
    </span>
  );
}

const githubLink = (repository: string | null, path: string): string | null =>
  repository === null ? null : `https://github.com/${repository}/${path}`;

function External({
  href,
  children
}: {
  readonly href: string | null;
  readonly children: ReactNode;
}) {
  if (href === null) return <>{children}</>;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function RunMeta({
  run,
  repository
}: {
  readonly run: ScorecardRun;
  readonly repository: string | null;
}) {
  const t = useT();
  return (
    <p className="desk-muted desk-score-meta">
      {t("desk.scorecard.meta", {
        date: run.date,
        mode: t(`desk.scorecard.mode.${run.mode}`),
        agent: run.agent,
        count: scoredCount(run)
      })}{" "}
      <External href={githubLink(repository, `commit/${run.commit}`)}>
        <code>{shortCommit(run.commit)}</code>
      </External>
    </p>
  );
}

function SummaryCard({
  label,
  value,
  note
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly note: ReactNode;
}) {
  const id = useId();
  return (
    <div className="desk-stat" role="group" aria-labelledby={id}>
      <span id={id} className="desk-stat__label">
        {label}
      </span>
      <strong className="desk-stat__value">{value}</strong>
      <span className="desk-stat__note">{note}</span>
    </div>
  );
}

function Summary({
  runs,
  index
}: {
  readonly runs: readonly ScorecardRun[];
  readonly index: number;
}) {
  const t = useT();
  const { language } = useLanguage();
  const summary = summaryOf(runs, index);
  if (summary === null) return null;
  const count = (value: number): string => formatCount(value, language);
  return (
    <div className="desk-score-summary">
      <SummaryCard
        label={t("desk.scorecard.summary.overall")}
        value={score(summary.overall, language)}
        note={
          <span className="desk-score-note">
            <span>{t(`desk.scorecard.band.${bandOf(summary.overall)}`)}</span>
            <Delta value={summary.overallDelta} />
          </span>
        }
      />
      <SummaryCard
        label={t("desk.scorecard.summary.moved")}
        value={t("desk.scorecard.summary.movedValue", {
          up: count(summary.up),
          down: count(summary.down)
        })}
        note={t("desk.scorecard.summary.held", { count: summary.held })}
      />
      <SummaryCard
        label={t("desk.scorecard.summary.open")}
        value={count(summary.open)}
        note={t("desk.scorecard.summary.regressions", { count: summary.regressions })}
      />
      <SummaryCard
        label={t("desk.scorecard.summary.fixed")}
        value={count(summary.fixed)}
        note={t("desk.scorecard.summary.fixedNote")}
      />
    </div>
  );
}

const TREND_HEIGHT = 180;
const TREND_PAD = { top: 16, right: 16, bottom: 28, left: 32 } as const;

/**
 * The width of an element in CSS pixels, so a chart draws at its real size and its text keeps
 * the type step instead of scaling with the page.
 */
function useWidth(fallback: number): readonly [number, (element: HTMLDivElement | null) => void] {
  const [width, setWidth] = useState(fallback);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (element === null) return;
    const update = (): void => setWidth(Math.max(240, Math.round(element.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [width, setElement] as const;
}

/**
 * The overall score of every run on one axis. A dashed line marks where the number of scored
 * dimensions changes: the ledger says overalls across it do not compare. SVG attributes only.
 */
function Trend({
  runs,
  selected
}: {
  readonly runs: readonly ScorecardRun[];
  readonly selected: number;
}) {
  const t = useT();
  const { language } = useLanguage();
  const id = useId();
  const [width, measure] = useWidth(640);
  if (runs.length < 2) return null;
  const low = Math.max(0, Math.floor(Math.min(...runs.map((run) => run.overall))) - 1);
  const plotWidth = width - TREND_PAD.left - TREND_PAD.right;
  const plotHeight = TREND_HEIGHT - TREND_PAD.top - TREND_PAD.bottom;
  const x = (index: number): number => TREND_PAD.left + (index / (runs.length - 1)) * plotWidth;
  const y = (value: number): number => TREND_PAD.top + ((10 - value) / (10 - low)) * plotHeight;
  const ticks = Array.from({ length: 10 - low + 1 }, (_, step) => low + step);
  const boundaries = runs.flatMap((run, index) => {
    const before = runs[index - 1];
    return before !== undefined && scoredCount(run) !== scoredCount(before)
      ? [{ index, count: scoredCount(run) }]
      : [];
  });
  return (
    <Card className="desk-panel">
      <h2 id={id}>{t("desk.scorecard.trend.title")}</h2>
      <div ref={measure}>
        <svg
          className="desk-score-trend"
          width={width}
          height={TREND_HEIGHT}
          viewBox={`0 0 ${width} ${TREND_HEIGHT}`}
          role="img"
          aria-labelledby={id}
        >
          {ticks.map((tick) => (
            <g key={tick} className="desk-score-trend__grid">
              <line x1={TREND_PAD.left} x2={width - TREND_PAD.right} y1={y(tick)} y2={y(tick)} />
              <text x={TREND_PAD.left - 8} y={y(tick) + 4} textAnchor="end">
                {tick}
              </text>
            </g>
          ))}
          {boundaries.map(({ index, count }) => (
            <g key={index} className="desk-score-trend__boundary">
              <line
                x1={x(index - 0.5)}
                x2={x(index - 0.5)}
                y1={TREND_PAD.top}
                y2={TREND_HEIGHT - TREND_PAD.bottom}
              />
              <text x={x(index - 0.5) + 4} y={TREND_PAD.top + 10}>
                {t("desk.scorecard.trend.boundary", { count })}
              </text>
            </g>
          ))}
          <polyline
            className="desk-score-trend__line"
            points={runs
              .map((run, index) => `${x(index).toFixed(1)},${y(run.overall).toFixed(1)}`)
              .join(" ")}
          />
          {runs.map((run, index) => (
            <circle
              key={`${run.date}-${run.commit}`}
              className="desk-score-trend__dot"
              data-selected={index === selected ? "true" : undefined}
              cx={x(index)}
              cy={y(run.overall)}
              r={index === selected ? 5 : 3.5}
            >
              <title>
                {t("desk.scorecard.trend.point", {
                  date: run.date,
                  commit: shortCommit(run.commit),
                  value: score(run.overall, language)
                })}
              </title>
            </circle>
          ))}
          <text className="desk-score-trend__axis" x={TREND_PAD.left} y={TREND_HEIGHT - 6}>
            {runs[0]?.date}
          </text>
          <text
            className="desk-score-trend__axis"
            x={width - TREND_PAD.right}
            y={TREND_HEIGHT - 6}
            textAnchor="end"
          >
            {runs.at(-1)?.date}
          </text>
        </svg>
      </div>
      <ol className="desk-sr-only">
        {runs.map((run) => (
          <li key={`${run.date}-${run.commit}`}>
            {t("desk.scorecard.trend.point", {
              date: run.date,
              commit: shortCommit(run.commit),
              value: score(run.overall, language)
            })}
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** The score as a bar on a 0-10 rail. The number is written beside it, so the bar only repeats it. */
function ScoreBar({ value }: { readonly value: number | null }) {
  return (
    <svg className="desk-bars__track desk-score-bar" aria-hidden="true" focusable="false">
      <rect className="desk-bars__rail" width="100%" height="100%" rx="4" />
      {value !== null && value > 0 && (
        <rect
          className="desk-score-bar__fill"
          width={`${(Math.min(10, value) * 10).toFixed(1)}%`}
          height="100%"
          rx="4"
        />
      )}
    </svg>
  );
}

function DimensionsTable({
  rows,
  sort,
  onSort
}: {
  readonly rows: readonly DimensionRow[];
  readonly sort: Sort;
  readonly onSort: (sort: Sort) => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const toggle = (number: number): void =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  return (
    <Card className="desk-panel">
      <div className="desk-panel__head desk-score-head">
        <h2>{t("desk.scorecard.dimensions.title")}</h2>
        <Segmented
          label={t("desk.scorecard.sort.label")}
          value={sort}
          options={SORTS}
          name={(entry) => t(`desk.scorecard.sort.${entry}`)}
          onChange={onSort}
        />
      </div>
      <div className="desk-table-scroll">
        <table className="desk-table desk-score-table">
          <thead>
            <tr>
              <th scope="col">{t("desk.scorecard.dimensions.number")}</th>
              <th scope="col">{t("desk.scorecard.dimensions.name")}</th>
              <th scope="col" className="desk-table__number">
                {t("desk.scorecard.dimensions.score")}
              </th>
              <th scope="col">
                <span className="desk-sr-only">{t("desk.scorecard.dimensions.bar")}</span>
              </th>
              <th scope="col">{t("desk.scorecard.dimensions.band")}</th>
              <th scope="col">{t("desk.scorecard.dimensions.change")}</th>
              <th scope="col">{t("desk.scorecard.dimensions.history")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = open.has(row.number);
              const detailsId = `desk-score-dim-${row.number}`;
              return (
                <DimensionRowView
                  key={row.number}
                  row={row}
                  expanded={expanded}
                  detailsId={detailsId}
                  onToggle={() => toggle(row.number)}
                  language={language}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DimensionRowView({
  row,
  expanded,
  detailsId,
  onToggle,
  language
}: {
  readonly row: DimensionRow;
  readonly expanded: boolean;
  readonly detailsId: string;
  readonly onToggle: () => void;
  readonly language: string;
}) {
  const t = useT();
  return (
    <>
      <tr>
        <td className="desk-table__number">{row.number}</td>
        <th scope="row">
          <Button
            appearance="ghost"
            className="desk-score-toggle"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={onToggle}
          >
            <ChevronRight
              aria-hidden="true"
              className="desk-icon desk-score-toggle__chevron"
              data-open={expanded ? "true" : undefined}
            />
            {row.name}
          </Button>
        </th>
        <td className="desk-table__number desk-score-value">{score(row.score, language)}</td>
        <td>
          <ScoreBar value={row.score} />
        </td>
        <td>
          <StatusChip tone={BAND_TONE[row.band]}>{t(`desk.scorecard.band.${row.band}`)}</StatusChip>
        </td>
        <td>
          <Delta value={row.delta} />
        </td>
        <td>
          <svg
            className="desk-score-spark"
            viewBox="0 0 100 36"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <polyline points={sparkPoints(row.history)} />
          </svg>
          <span className="desk-sr-only">
            {t("desk.scorecard.dimensions.historyText", {
              values: row.history.map((value) => score(value, language)).join(", ")
            })}
          </span>
        </td>
      </tr>
      <tr id={detailsId} hidden={!expanded} className="desk-score-details">
        <td />
        <td colSpan={6}>
          <p>
            {row.evidence.summary === ""
              ? t("desk.scorecard.dimensions.noEvidence")
              : row.evidence.summary}
          </p>
          {row.evidence.holdsBack.length > 0 && (
            <>
              <h3>{t("desk.scorecard.dimensions.holdsBack")}</h3>
              <ul>
                {row.evidence.holdsBack.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </>
          )}
        </td>
      </tr>
    </>
  );
}

/** Every dimension in every run: the number on its band's tint, so the tint is never the only signal. */
function History({
  runs,
  index
}: {
  readonly runs: readonly ScorecardRun[];
  readonly index: number;
}) {
  const t = useT();
  const { language } = useLanguage();
  const shown = runs.slice(0, index + 1);
  return (
    <Card className="desk-panel">
      <h2>{t("desk.scorecard.history.title")}</h2>
      <div className="desk-table-scroll">
        <table className="desk-table desk-score-history">
          <thead>
            <tr>
              <th scope="col">{t("desk.scorecard.dimensions.name")}</th>
              {shown.map((run) => (
                <th key={`${run.date}-${run.commit}`} scope="col" className="desk-table__number">
                  {run.date}
                  <small>{shortCommit(run.commit)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dimensionRows(runs, index).map((row) => (
              <tr key={row.number}>
                <th scope="row">{row.name}</th>
                {row.history.map((value, column) => (
                  <td
                    key={`${shown[column]?.date ?? ""}-${shown[column]?.commit ?? ""}`}
                    className={`desk-table__number desk-score-cell desk-tone--${BAND_TONE[bandOf(value)]}`}
                  >
                    {score(value, language)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Muted>{t("desk.scorecard.history.hint")}</Muted>
    </Card>
  );
}

function FindingRow({
  finding,
  repository
}: {
  readonly finding: ScorecardFinding;
  readonly repository: string | null;
}) {
  const t = useT();
  return (
    <tr>
      <td className="desk-table__number">{finding.ladderRank}</td>
      <th scope="row" className="desk-score-finding">
        <span>{finding.title}</span>
        <code>{finding.slug}</code>
        {isProposed(finding) && (
          <Tag appearance="information">{t("desk.scorecard.findings.proposed")}</Tag>
        )}
      </th>
      <td className="desk-table__number">{finding.dimension}</td>
      <td>
        <StatusChip tone={DISPOSITION_TONE[finding.disposition]}>
          {t(`desk.scorecard.disposition.${finding.disposition}`)}
        </StatusChip>
      </td>
      <td>
        {finding.issue === undefined ? (
          <span className="desk-muted">{t("desk.scorecard.findings.noIssue")}</span>
        ) : (
          <External href={githubLink(repository, `issues/${finding.issue}`)}>
            {issueLabel(finding.issue)}
          </External>
        )}
      </td>
      <td className="desk-score-reason">{finding.reason ?? ""}</td>
    </tr>
  );
}

const ALL_DIMENSIONS = "all";

/** Proper names and numbers, the same in every language. */
const DIMENSION_OPTIONS = SCORECARD_DIMENSIONS.map((name, position) => ({
  value: String(position + 1),
  label: `${position + 1}. ${name}`
}));
const issueLabel = (issue: number): string => `#${issue}`;
const runLabel = (run: ScorecardRun): string => `${run.date} · ${shortCommit(run.commit)}`;

function Findings({
  run,
  repository
}: {
  readonly run: ScorecardRun;
  readonly repository: string | null;
}) {
  const t = useT();
  const id = useId();
  const [filter, setFilter] = useState<FindingFilter>("open");
  const [search, setSearch] = useState("");
  const [dimension, setDimension] = useState<string>(ALL_DIMENSIONS);
  const view = findingsView(run, {
    filter,
    search,
    dimension: dimension === ALL_DIMENSIONS ? null : Number(dimension)
  });
  return (
    <Card className="desk-panel">
      <div className="desk-panel__head desk-score-head">
        <h2>{t("desk.scorecard.findings.title")}</h2>
        <Segmented
          label={t("desk.scorecard.findings.filter")}
          value={filter}
          options={FINDING_FILTERS}
          name={(entry) => t(`desk.scorecard.findings.show.${entry}`)}
          onChange={setFilter}
        />
      </div>
      <div className="desk-score-filters">
        <div className="desk-field">
          <Label htmlFor={`${id}-search`}>{t("desk.scorecard.findings.search")}</Label>
          <Input
            id={`${id}-search`}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="desk-field">
          <Label htmlFor={`${id}-dimension`}>{t("desk.scorecard.findings.dimension")}</Label>
          <Select value={dimension} onValueChange={setDimension}>
            <SelectTrigger id={`${id}-dimension`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DIMENSIONS}>
                {t("desk.scorecard.findings.allDimensions")}
              </SelectItem>
              {DIMENSION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="desk-muted" role="status">
        {t("desk.scorecard.findings.count", { shown: view.rows.length, total: view.total })}
      </p>
      {view.rows.length === 0 ? (
        <p className="desk-empty">{t("desk.scorecard.findings.empty")}</p>
      ) : (
        <div className="desk-table-scroll">
          <table className="desk-table desk-score-findings">
            <thead>
              <tr>
                <th scope="col" className="desk-table__number">
                  {t("desk.scorecard.findings.rank")}
                </th>
                <th scope="col">{t("desk.scorecard.findings.finding")}</th>
                <th scope="col" className="desk-table__number">
                  {t("desk.scorecard.findings.dimensionShort")}
                </th>
                <th scope="col">{t("desk.scorecard.findings.disposition")}</th>
                <th scope="col">{t("desk.scorecard.findings.issue")}</th>
                <th scope="col">{t("desk.scorecard.findings.reason")}</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((finding) => (
                <FindingRow key={finding.slug} finding={finding} repository={repository} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Calibration({ notes }: { readonly notes: readonly string[] }) {
  const t = useT();
  if (notes.length === 0) return null;
  return (
    <Card className="desk-panel">
      <h2>{t("desk.scorecard.calibration.title")}</h2>
      <ul className="desk-score-notes">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </Card>
  );
}

function FlowDiagram({ flow }: { readonly flow: ScorecardFlowLayout }) {
  const byId = new Map(flow.nodes.map((node) => [node.id, node]));
  const groups = [...new Set(flow.nodes.map((node) => node.group))].sort();
  const tint = (group: string): number => (groups.indexOf(group) % 6) + 1;
  return (
    <div className="desk-score-flow">
      <svg
        width={flow.width}
        height={flow.height}
        viewBox={`0 0 ${flow.width} ${flow.height}`}
        role="img"
        aria-label={flow.title}
      >
        {flow.edges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (from === undefined || to === undefined) return null;
          const startX = from.x + from.width;
          const startY = from.y + from.height / 2;
          const endX = to.x;
          const endY = to.y + to.height / 2;
          const bend = Math.max(24, (endX - startX) / 2);
          return (
            <path
              key={`${edge.from}->${edge.to}`}
              className="desk-score-flow__edge"
              d={`M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`}
            />
          );
        })}
        {flow.nodes.map((node) => (
          <g
            key={node.id}
            className={`desk-score-flow__node desk-score-flow__node--${tint(node.group)}`}
          >
            <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="6" />
            <text x={node.x + node.width / 2} y={node.y + 11 + 11} textAnchor="middle">
              {node.label.split("\n").map((line, index) => (
                <tspan key={line} x={node.x + node.width / 2} dy={index === 0 ? 0 : 15}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Diagrams({ flows }: { readonly flows: readonly ScorecardFlowLayout[] }) {
  const t = useT();
  if (flows.length === 0) return null;
  return (
    <Card className="desk-panel">
      <h2>{t("desk.scorecard.diagrams.title")}</h2>
      {flows.map((flow) => (
        <Collapsible key={flow.id} className="desk-score-diagram">
          <CollapsibleTrigger asChild>
            <Button appearance="ghost" className="desk-score-toggle">
              <ChevronRight aria-hidden="true" className="desk-icon desk-score-toggle__chevron" />
              {flow.title}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Muted>{flow.caption}</Muted>
            <FlowDiagram flow={flow} />
          </CollapsibleContent>
        </Collapsible>
      ))}
    </Card>
  );
}

function Report({ data }: { readonly data: Extract<ScorecardData, { state: "ready" }> }) {
  const t = useT();
  const [selected, setSelected] = useState(data.runs.length - 1);
  const [sort, setSort] = useState<Sort>("number");
  const id = useId();
  const index = Math.min(selected, data.runs.length - 1);
  const run = data.runs[index];
  const rows = useMemo(
    () => sortRows(dimensionRows(data.runs, index), sort),
    [data.runs, index, sort]
  );
  if (run === undefined) return <Muted>{t("desk.scorecard.noRuns")}</Muted>;
  return (
    <>
      <div className="desk-score-runbar">
        <RunMeta run={run} repository={data.repository} />
        <div className="desk-field desk-score-run">
          <Label htmlFor={`${id}-run`}>{t("desk.scorecard.run")}</Label>
          <Select value={String(index)} onValueChange={(value) => setSelected(Number(value))}>
            <SelectTrigger id={`${id}-run`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.runs.map((entry, position) => (
                <SelectItem key={`${entry.date}-${entry.commit}`} value={String(position)}>
                  {runLabel(entry)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Summary runs={data.runs} index={index} />
      <Trend runs={data.runs} selected={index} />
      <DimensionsTable rows={rows} sort={sort} onSort={setSort} />
      <Findings key={index} run={run} repository={data.repository} />
      <Calibration notes={data.calibration[shortCommit(run.commit)] ?? []} />
      <History runs={data.runs} index={index} />
      <Diagrams flows={data.flows} />
    </>
  );
}

interface Failure {
  readonly code: FailureCode;
  readonly detail: string | null;
}

const ledgerHint = (t: Translate, path: string): string => t("desk.scorecard.missing", { path });

/**
 * The monorepo health scorecard from the ledger in the checkout: the selected run's scores and
 * their change, the trend, the open findings, and the run's notes. Read-only.
 */
export function ScorecardView() {
  const t = useT();
  const { api } = useDesk();
  const [data, setData] = useState<ScorecardData | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback((): void => {
    setLoading(true);
    api
      .scorecard()
      .then((loaded) => {
        setData(loaded);
        setError(null);
      })
      .catch((failure: unknown) => {
        const converted = toApiError(failure);
        setError({ code: converted.code, detail: converted.detail });
      })
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(load, [load]);
  usePaletteActions([{ id: "scorecard-refresh", label: t("desk.scorecard.refresh"), run: load }]);

  return (
    <>
      <div className="desk-heading">
        <div>
          <h1>{t("desk.scorecard.title")}</h1>
          <p className="desk-muted">{t("desk.scorecard.intro")}</p>
        </div>
        <Button appearance="subtle" onClick={load} disabled={loading}>
          {t("desk.scorecard.refresh")}
        </Button>
      </div>
      {error !== null && <FailureText code={error.code} detail={error.detail} />}
      {loading && data === null && (
        <Card className="desk-panel">
          <LoadingLines label={t("desk.scorecard.loading")} lines={4} />
        </Card>
      )}
      {data?.state === "missing" && <p className="desk-empty">{ledgerHint(t, data.ledgerPath)}</p>}
      {data?.state === "invalid" && (
        <div className="desk-failure" role="alert">
          <p>{t("desk.scorecard.invalid", { path: data.ledgerPath })}</p>
          <p>{data.detail}</p>
        </div>
      )}
      {data?.state === "ready" &&
        (data.runs.length === 0 ? (
          <p className="desk-empty">{t("desk.scorecard.noRuns")}</p>
        ) : (
          <Report data={data} />
        ))}
    </>
  );
}
