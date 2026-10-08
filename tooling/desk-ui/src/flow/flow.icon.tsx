import type { NodeKind } from "@repo/desk/contracts";
import { Bot, FileText, Terminal, User } from "@repo/ui";

/** Who works in a stage, as an icon: the issue, an agent, you, or the engine. Decorative: the kind is also written out. */
export function StageIcon({ kind }: { readonly kind: NodeKind }) {
  const props = { "aria-hidden": true, className: "desk-icon" } as const;
  switch (kind) {
    case "source":
      return <FileText {...props} />;
    case "agent":
      return <Bot {...props} />;
    case "human":
      return <User {...props} />;
    case "script":
      return <Terminal {...props} />;
  }
}
