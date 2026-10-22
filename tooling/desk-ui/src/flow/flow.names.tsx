import { createContext, useContext, useMemo, type ReactNode } from "react";

import { nodeName, stageName, type IssueFlow } from "./flow.steps";
import { useT } from "../i18n/i18n.t";

const IssueFlowContext = createContext<IssueFlow | null>(null);

/** The flow of the issue on the page, so a stage deep in the page is named from its own flow. */
export function IssueFlowProvider({
  flow,
  children
}: {
  readonly flow: IssueFlow;
  readonly children: ReactNode;
}) {
  return <IssueFlowContext.Provider value={flow}>{children}</IssueFlowContext.Provider>;
}

export interface StageNames {
  /** The issue's flow, or `null` outside an issue page. */
  readonly flow: IssueFlow | null;
  readonly node: (id: string) => string;
  readonly stage: (stage: string) => string;
}

/** Names of the stages of the issue on the page, in the page's language. */
export function useStageNames(): StageNames {
  const t = useT();
  const flow = useContext(IssueFlowContext);
  return useMemo(
    () => ({
      flow,
      node: (id: string) => nodeName(t, flow, id),
      stage: (stage: string) => stageName(t, flow, stage)
    }),
    [t, flow]
  );
}
