import type { FlowModel, FlowNode, FlowNodeId, IssueDetail } from "@repo/desk/contracts";
import { ArrowRight, Button, X } from "@repo/ui";
import { useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";

import { anomaliesOf } from "./inspector.model";
import { Anomalies } from "./inspector.parts";
import { StageResult } from "./inspector.result";
import { StageSection } from "./inspector.stage";
import { nodeStatusText } from "../flow/flow.text";
import { useT, type Translate } from "../i18n/i18n.t";
import { useShortcuts } from "../shell/shell.keys";
import { useDesk } from "../state/desk.provider";
import { StatusChip } from "../status/status.chip";
import { NODE_TONE, type ReadableSummary } from "../status/status.model";

const EMPTY: readonly never[] = [];

/** Elements that use the arrow keys themselves: there an arrow does not change the stage. */
const OWNS_ARROWS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="tablist"], [role="listbox"], [role="menu"], [role="radiogroup"], [role="slider"]';

/** Who works in the stage: "Agent · Planner", "You decide", "The engine runs it", "The GitHub issue". */
const subtitleOf = (t: Translate, node: FlowNode): string =>
  node.role === null
    ? t(`desk.inspector.subtitle.${node.kind}`)
    : t("desk.inspector.subtitle.agentRole", { role: t(`desk.inspector.role.${node.role}`) });

export interface StageSheetProps {
  readonly detail: IssueDetail;
  readonly summary: ReadableSummary;
  /** The live flow model: the running stage's clock ticks with the page clock. */
  readonly flow: FlowModel;
  readonly nodeId: FlowNodeId;
  readonly revision: string;
  readonly onSelect: (id: FlowNodeId) => void;
  readonly onClose: () => void;
}

/**
 * One stage in a side sheet beside the page: who works there, its status, its tiles and
 * checklists, what went wrong, and its full result. The sheet is not modal: the page stays
 * usable. ← and → step through the stages, Esc closes it, and focus returns to its opener.
 */
export function StageSheet({
  detail,
  summary,
  flow,
  nodeId,
  revision,
  onSelect,
  onClose
}: StageSheetProps) {
  const t = useT();
  const id = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const { state } = useDesk();
  const logs = state.logs[summary.issueNumber] ?? EMPTY;
  const index = Math.max(
    0,
    flow.nodes.findIndex((entry) => entry.id === nodeId)
  );
  const node = flow.nodes[index];
  const previous = flow.nodes[index - 1]?.id ?? null;
  const next = flow.nodes[index + 1]?.id ?? null;

  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheet.current?.focus({ preventScroll: true });
    const element = sheet.current;
    return () => {
      // Back to the opener only when focus was in the sheet: a click elsewhere keeps its focus.
      const active = document.activeElement;
      const inside = active === document.body || (element?.contains(active) ?? false);
      if (inside && opener?.isConnected === true) opener.focus({ preventScroll: true });
    };
  }, []);

  // The sheet starts below the top bar, whose height changes with its text and the connection
  // banner. A CSSOM custom property, not a style attribute: the CSP allows it.
  useLayoutEffect(() => {
    const masthead = document.querySelector(".desk-masthead");
    const element = sheet.current;
    if (masthead === null || element === null) return;
    const place = (): void => {
      element.style.setProperty(
        "--desk-masthead",
        `${String(masthead.getBoundingClientRect().height)}px`
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(masthead);
    return () => observer.disconnect();
  }, []);

  /** Step to a stage. At either end the button disables, so focus moves to the sheet. */
  const go = (target: FlowNodeId | null, atEnd: boolean): void => {
    if (target === null) return;
    onSelect(target);
    if (atEnd) sheet.current?.focus({ preventScroll: true });
  };
  const goPrevious = (): void => go(previous, index - 1 === 0);
  const goNext = (): void => go(next, index + 2 === flow.nodes.length);

  useShortcuts([
    { key: "ArrowLeft", run: goPrevious, labelKey: "desk.sheet.keys.previous" },
    { key: "ArrowRight", run: goNext, labelKey: "desk.sheet.keys.next" },
    { key: "Escape", run: onClose, labelKey: "desk.sheet.keys.close" }
  ]);

  // Page shortcuts skip a dialog, so the sheet handles its own keys.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.target instanceof Element && event.target.closest(OWNS_ARROWS) !== null) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") goPrevious();
    else goNext();
  };

  if (node === undefined) return null;
  const tone = NODE_TONE[node.status];
  return (
    <div
      ref={sheet}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${id}-title`}
      tabIndex={-1}
      className="desk-sheet"
      onKeyDown={onKeyDown}
    >
      <div className="desk-sheet__head">
        <div className="desk-sheet__title">
          <p className="desk-sheet__where">
            {t("desk.sheet.position", {
              index: index + 1,
              total: flow.nodes.length,
              who: subtitleOf(t, node)
            })}
          </p>
          <h2 id={`${id}-title`}>{t(`desk.flow.node.${node.id}`)}</h2>
          <StatusChip tone={tone}>{nodeStatusText(t, node)}</StatusChip>
        </div>
        <Button
          appearance="ghost"
          className="desk-sheet__button"
          aria-label={t("desk.sheet.previous")}
          aria-keyshortcuts="ArrowLeft"
          disabled={previous === null}
          onClick={goPrevious}
        >
          <ArrowRight aria-hidden="true" className="desk-icon desk-icon--back" />
        </Button>
        <Button
          appearance="ghost"
          className="desk-sheet__button"
          aria-label={t("desk.sheet.next")}
          aria-keyshortcuts="ArrowRight"
          disabled={next === null}
          onClick={goNext}
        >
          <ArrowRight aria-hidden="true" className="desk-icon" />
        </Button>
        <Button
          appearance="ghost"
          className="desk-sheet__button"
          aria-label={t("desk.common.close")}
          aria-keyshortcuts="Escape"
          onClick={onClose}
        >
          <X aria-hidden="true" className="desk-icon" />
        </Button>
      </div>
      <div className="desk-sheet__body">
        <StageSection key={node.id} node={node} detail={detail} flow={flow} revision={revision} />
        <Anomalies anomalies={anomaliesOf(node, detail, flow, logs)} />
        <h3 className="desk-sheet__sep">{t("desk.sheet.fullResult")}</h3>
        <StageResult key={`result-${node.id}`} node={node} detail={detail} revision={revision} />
      </div>
    </div>
  );
}
