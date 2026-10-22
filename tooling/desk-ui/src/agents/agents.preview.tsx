import type { CapabilityProfile } from "@repo/desk/contracts";
import { Card } from "@repo/ui";
import { useId } from "react";

import type { AgentDraft } from "./agents.model";
import { useT } from "../i18n/i18n.t";
import { CapabilityReceipt } from "../inspector/inspector.capabilities";

function Names({ names }: { readonly names: readonly string[] }) {
  const t = useT();
  return names.length === 0 ? (
    <span className="desk-muted">{t("desk.caps.noneListed")}</span>
  ) : (
    <>{names.join(", ")}</>
  );
}

/**
 * What a run of the agent gets. A saved agent without edits shows the server's resolved
 * profile. Unsaved edits show only what the agent asks for: the policy floor, the installed
 * servers, and the isolation are the server's to apply, so the page does not guess them.
 */
export function CapabilityPreview({
  draft,
  resolved
}: {
  readonly draft: AgentDraft;
  /** The server's profile of the saved agent, or `null` while the form has unsaved edits. */
  readonly resolved: CapabilityProfile | null;
}) {
  const t = useT();
  const id = useId();
  return (
    <Card className="desk-panel desk-editor__preview" aria-labelledby={id} role="region">
      <h2 id={id}>{t("desk.agents.preview.title")}</h2>
      {resolved !== null ? (
        <>
          <p className="desk-muted">{t("desk.agents.preview.resolved")}</p>
          <CapabilityReceipt profile={resolved} />
        </>
      ) : (
        <>
          <p className="desk-note">{t("desk.agents.preview.unsaved")}</p>
          <dl className="desk-kv desk-caps__receipt">
            <dt>{t("desk.caps.provider")}</dt>
            <dd>
              {t("desk.caps.providerValue", {
                provider: t(`desk.agents.provider.${draft.provider}`),
                model: draft.model.trim() === "" ? t("desk.caps.defaultModel") : draft.model.trim()
              })}
            </dd>
            <dt>{t("desk.caps.preset")}</dt>
            <dd>{t(`desk.caps.preset.${draft.preset}`)}</dd>
            <dt>{t("desk.agents.preview.askedMcp")}</dt>
            <dd>
              <Names names={draft.mcp} />
            </dd>
            <dt>{t("desk.agents.preview.askedSkills")}</dt>
            <dd>
              <Names names={draft.skills} />
            </dd>
            <dt>{t("desk.agents.preview.askedTools")}</dt>
            <dd>
              <Names names={draft.tools} />
            </dd>
          </dl>
        </>
      )}
    </Card>
  );
}
