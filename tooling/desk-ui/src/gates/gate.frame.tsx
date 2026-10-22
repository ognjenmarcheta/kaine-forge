import type { ActionRequestInput, FlowNodeId, IssueDetail } from "@repo/desk/contracts";
import type { ReactNode } from "react";

import type { IssueActions } from "./gate.actions";
import { keyLabel, type PageKey } from "../shell/shell.keys";
import type { ReadableSummary } from "../status/status.model";

/** What every decision card body gets from the panel around it. */
export interface GateBodyProps {
  readonly detail: IssueDetail;
  readonly summary: ReadableSummary;
  readonly revision: string;
  readonly actions: IssueActions;
  /** Run an action. `true` when it worked; focus then moves to the card heading. */
  readonly send: (request: ActionRequestInput) => Promise<boolean>;
  /** The id of the card heading: the decision bar is named by it. */
  readonly titleId: string;
  readonly onOpenResult: (node: FlowNodeId) => void;
  /** Bring the history of the issue into view, where the failure shows. */
  readonly onShowTrace: () => void;
  /**
   * Open the ship dialog, naming the files not marked viewed. The panel owns the dialog, so it
   * stays open while the ship moves the issue on.
   */
  readonly onShip: (unviewed: readonly string[]) => void;
}

/** A single-key shortcut, shown on the button that it presses. The button names it in `aria-keyshortcuts`. */
export function Kbd({ shortcut }: { readonly shortcut: PageKey }) {
  return (
    <kbd className="desk-kbd" aria-hidden="true">
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
    <div className="desk-decide" role="group" aria-labelledby={labelledBy}>
      {children}
      {hint !== undefined && <span className="desk-decide__hint">{hint}</span>}
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
    <section className="desk-changed">
      <h3>{title}</h3>
      <ul>
        {points.map((point, index) => (
          <li key={index}>{point}</li>
        ))}
      </ul>
    </section>
  );
}
