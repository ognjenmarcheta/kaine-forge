import type { StepKind } from "@repo/desk/contracts";
import { Bot, Clock, GitBranch, GitPullRequest, Terminal, User } from "@repo/ui";

/** A step kind as an icon, or setup. Decorative: the kind is also written out. */
export function KindIcon({ kind }: { readonly kind: StepKind | "setup" }) {
  const props = { "aria-hidden": true, className: "desk-icon" } as const;
  switch (kind) {
    case "setup":
      return <GitBranch {...props} />;
    case "agent":
      return <Bot {...props} />;
    case "gate":
      return <User {...props} />;
    case "check":
      return <Terminal {...props} />;
    case "ship":
      return <GitPullRequest {...props} />;
    case "pr-wait":
      return <Clock {...props} />;
  }
}

/** A step's name in a sentence: its label, or its id while the label is empty. */
export const stepTitle = (step: { readonly id: string; readonly label: string }): string =>
  step.label.trim() === "" ? step.id : step.label;
