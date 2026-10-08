import { builderOutputSchema, type BuilderOutput } from "@repo/desk/contracts";
import { Tag } from "@repo/ui";

import { useJsonArtifact } from "./artifact.use";
import { useT } from "../i18n/i18n.t";
import { FailureText, ItemList, List, Loading, Muted, Section } from "../shell/shell.ui";
import { CLAIMED_CHECK_TONE, appearanceOf } from "../status/status.model";

export function BuildView({ build }: { readonly build: BuilderOutput }) {
  const t = useT();
  return (
    <div className="desk-artifact">
      <p>{build.summary}</p>
      {build.blockers.length > 0 && (
        <Section title={t("desk.build.blockers")}>
          <List empty={t("desk.common.none")} items={build.blockers} />
        </Section>
      )}
      <Section title={t("desk.build.files")}>
        <ItemList
          empty={t("desk.common.none")}
          items={build.filesChanged}
          render={(path) => <code>{path}</code>}
        />
      </Section>
      <Section title={t("desk.build.notes")}>
        <List empty={t("desk.common.none")} items={build.notes} />
      </Section>
      <Section title={t("desk.build.claimed")}>
        <Muted>{t("desk.build.claimedHint")}</Muted>
        <ItemList
          empty={t("desk.common.none")}
          items={build.claimedChecks}
          render={(check) => (
            <>
              <Tag appearance={appearanceOf(CLAIMED_CHECK_TONE[check.result])}>
                {t(`desk.build.result.${check.result}`)}
              </Tag>{" "}
              <code>{check.command}</code>
            </>
          )}
        />
      </Section>
      <Section title={t("desk.common.plainLanguage")}>
        <p>{build.plainLanguage}</p>
      </Section>
    </div>
  );
}

export function BuildArtifact({
  issueNumber,
  revision
}: {
  readonly issueNumber: number;
  readonly revision: string;
}) {
  const t = useT();
  const state = useJsonArtifact(issueNumber, "build", builderOutputSchema, revision);
  switch (state.status) {
    case "loading":
      return <Loading />;
    case "missing":
      return <Muted>{t("desk.artifact.missing")}</Muted>;
    case "error":
      return <FailureText code={state.code} detail={state.detail} />;
    case "ok":
      return <BuildView build={state.value} />;
  }
}
