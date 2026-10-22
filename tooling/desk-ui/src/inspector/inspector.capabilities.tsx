import type { CapabilityProfile, FlowNode, IssueDetail, RunRecord } from "@repo/desk/contracts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@repo/ui";

import { agentRunsOf } from "./inspector.model";
import { useLanguage, useT } from "../i18n/i18n.t";
import { formatClock } from "../shell/shell.format";
import { StatusChip } from "../status/status.chip";

/** A list of names, or "None". Names are engine text and show as they are. */
function Names({ names }: { readonly names: readonly string[] }) {
  const t = useT();
  return names.length === 0 ? (
    <span className="desk-muted">{t("desk.caps.noneListed")}</span>
  ) : (
    <>{names.join(", ")}</>
  );
}

/** One rule list of the tool policy, folded: the count says enough until the owner asks. */
function Rules({ title, rules }: { readonly title: string; readonly rules: readonly string[] }) {
  if (rules.length === 0) return null;
  return (
    <>
      <h5 className="desk-caps__rules-title">{title}</h5>
      <ul className="desk-caps__rules">
        {rules.map((rule) => (
          <li key={rule}>
            <code>{rule}</code>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The receipt of one run, or of an agent's next run on the Agents page: what it gets after the
 * policy floor, the installed servers and skills, the provider, and the isolation narrowed what
 * its agent asked for. Where it runs is said in words: isolated in a container, or on the
 * owner's machine.
 */
export function CapabilityReceipt({ profile }: { readonly profile: CapabilityProfile }) {
  const t = useT();
  const isolated = profile.sandbox === "docker";
  const { allow, deny } = profile.tools;
  return (
    <div className="desk-caps__receipt">
      <dl className="desk-kv">
        <dt>{t("desk.caps.provider")}</dt>
        <dd>
          {t("desk.caps.providerValue", {
            provider: profile.provider,
            model: profile.model ?? t("desk.caps.defaultModel")
          })}
        </dd>
        <dt>{t("desk.caps.preset")}</dt>
        <dd>{t(`desk.caps.preset.${profile.preset}`)}</dd>
        <dt>{t("desk.caps.where")}</dt>
        <dd className="desk-caps__where">
          <StatusChip tone={isolated ? "success" : "warning"}>
            {t(isolated ? "desk.caps.isolated" : "desk.caps.onHost")}
          </StatusChip>
          <span>{t(`desk.caps.sandbox.${profile.sandbox}`)}</span>
        </dd>
        <dt>{t("desk.caps.network")}</dt>
        <dd>{profile.network}</dd>
        <dt>{t("desk.caps.mcp")}</dt>
        <dd>
          <Names names={profile.mcp} />
        </dd>
        <dt>{t("desk.caps.skills")}</dt>
        <dd>
          <Names names={profile.skills} />
        </dd>
        <dt>{t("desk.caps.extraTools")}</dt>
        <dd>
          <Names names={profile.extraTools} />
        </dd>
        <dt>{t("desk.caps.tools")}</dt>
        <dd>
          {t("desk.caps.toolCounts", { allow: allow.length, deny: deny.length })}
          {allow.length + deny.length > 0 && (
            <Collapsible className="desk-caps__more">
              <CollapsibleTrigger className="desk-link-button">
                {t("desk.caps.toolsShow")}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Rules title={t("desk.caps.allowed")} rules={allow} />
                <Rules title={t("desk.caps.denied")} rules={deny} />
              </CollapsibleContent>
            </Collapsible>
          )}
        </dd>
      </dl>
      {profile.removed.length > 0 && (
        <>
          <h5 className="desk-caps__rules-title">{t("desk.caps.removed")}</h5>
          <ul className="desk-caps__removed">
            {profile.removed.map((entry) => (
              <li key={`${entry.kind}-${entry.name}`}>
                <strong>{entry.name}</strong>{" "}
                <span className="desk-muted">{t(`desk.caps.kind.${entry.kind}`)}</span>{" "}
                <span>{entry.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {profile.notes.length > 0 && (
        <>
          <h5 className="desk-caps__rules-title">{t("desk.caps.notes")}</h5>
          <ul className="desk-caps__notes">
            {profile.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function RunReceipt({ run, index }: { readonly run: RunRecord; readonly index: number }) {
  const t = useT();
  const { language } = useLanguage();
  return (
    <li className="desk-caps__run">
      <h4>{t("desk.caps.run", { index: index + 1, time: formatClock(run.at, language) })}</h4>
      {run.capabilities === undefined ? (
        <p className="desk-muted">{t("desk.caps.none")}</p>
      ) : (
        <CapabilityReceipt profile={run.capabilities} />
      )}
    </li>
  );
}

/** The capabilities each run of the stage's agent got, oldest first. A stage without runs has none. */
export function CapabilityReceipts({
  node,
  detail
}: {
  readonly node: FlowNode;
  readonly detail: IssueDetail;
}) {
  const t = useT();
  const runs = agentRunsOf(node, detail);
  if (runs.length === 0) return null;
  return (
    <section className="desk-inspector__section desk-caps">
      <h3>{t("desk.caps.title")}</h3>
      <ol className="desk-caps__runs">
        {runs.map((run, index) => (
          <RunReceipt key={`${run.at}-${String(index)}`} run={run} index={index} />
        ))}
      </ol>
    </section>
  );
}
