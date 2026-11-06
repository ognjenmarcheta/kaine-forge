import type { ActionRequestInput, FlowNodeId, IssueDetail } from "@repo/desk/contracts";
import type { ReactNode } from "react";

import type { ActionWords, IssueActions } from "./gate.actions";
import { keyLabel, type PageKey } from "../shell/shell.keys";
import { TONE_GLYPH, type ReadableSummary } from "../status/status.model";

/** What every decision card body gets from the panel around it. */
export interface GateBodyProps {
  readonly detail: IssueDetail;
  readonly summary: ReadableSummary;
  readonly revision: string;
  readonly actions: IssueActions;
  /** Run an action. `true` when it worked; focus then moves to the card heading. */
  readonly send: (request: ActionRequestInput, words?: ActionWords) => Promise<boolean>;
  /** The id of the card heading: the decision bar is named by it. */
  readonly titleId: string;
  readonly onOpenResult: (node: FlowNodeId) => void;
  /** Bring the history of the issue into view, where the failure shows. */
  readonly onShowTrace: () => void;
  /**
   * Open the ship dialog, naming the files not marked viewed. The panel owns the dialog, so it
   * stays open while the ship moves the issue on.
   */
  readonly onShip: (unviewed: readonly string[], unsent?: UnsentComments | null) => void;
}

/** Comments the owner wrote and has not sent. The ship dialog warns about them. */
export interface UnsentComments {
  readonly count: number;
  /** Open the Send back form, where the comments go. */
  readonly onSendBack: () => void;
}

/** A single-key shortcut, shown on the button that it presses. The button names it in `aria-keyshortcuts`. */
export function Kbd({ shortcut }: { readonly shortcut: PageKey }) {
  return (
    <kbd className="dk-kbd" aria-hidden="true">
      {keyLabel(shortcut)}
    </kbd>
  );
}

/**
 * The decision's buttons: at the bottom of the card, sticky while the card scrolls, and fixed to
 * the bottom of the screen on a phone. The hint says what the primary action does.
 */
export function DecideBar({
  labelledBy,
  hint,
  children
}: {
  readonly labelledBy: string;
  readonly hint?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="dk-decide" role="group" aria-labelledby={labelledBy}>
      {children}
      {hint !== undefined && <span className="dk-note">{hint}</span>}
    </div>
  );
}

/** Engine text about what a new round changed, one line for each point. */
export function RevisionNote({ title, text }: { readonly title: string; readonly text: string }) {
  const points = text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s+/, "").trim())
    .filter((line) => line !== "");
  return (
    <div className="dk-banner dk-banner-information dk-mb-200">
      <span className="dk-g" aria-hidden="true">
        {TONE_GLYPH["warning-subtle"]}
      </span>
      <div className="dk-grow dk-stack dk-gap-050">
        <b>{title}</b>
        <ul className="dk-t-small dk-dashlist">
          {points.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
