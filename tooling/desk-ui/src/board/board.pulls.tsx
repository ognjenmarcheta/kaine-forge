import type { GithubPull } from "@repo/desk/contracts";
import { Badge, Button, Card } from "@repo/ui";
import { useId } from "react";

import { useGithubLists } from "../github/github.use";
import { useLanguage, useT } from "../i18n/i18n.t";
import { relativeTime, safeHttpUrl } from "../shell/shell.format";
import { useNow } from "../shell/shell.now";
import { RouteLink } from "../shell/shell.router";
import { FailureText, Loading, Muted } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";

function PullRow({ pull }: { readonly pull: GithubPull }) {
  const t = useT();
  const { language } = useLanguage();
  const now = useNow();
  const { state } = useDesk();
  const href = safeHttpUrl(pull.url);
  const name = t("desk.issue.number", { number: pull.number });
  return (
    <li className="desk-pulls__row">
      <span className="desk-pulls__title">
        {href === null ? (
          name
        ) : (
          <a href={href} target="_blank" rel="noreferrer">
            {name}
          </a>
        )}{" "}
        {pull.title}
      </span>
      <span className="desk-pulls__meta">
        {pull.draft && <Badge appearance="default">{t("desk.pulls.draft")}</Badge>}
        <code>{pull.branch}</code>
        {pull.author !== null && (
          <span className="desk-muted">{t("desk.pulls.by", { author: pull.author })}</span>
        )}
        <span className="desk-muted">{relativeTime(pull.updatedAt, now, language)}</span>
        {pull.issue !== null && state.issues[pull.issue] !== undefined && (
          <RouteLink to={{ view: "issue", issueNumber: pull.issue }}>
            {t("desk.pulls.issue", { number: pull.issue })}
          </RouteLink>
        )}
      </span>
    </li>
  );
}

/**
 * The open pull requests of the repository, read-only. The desk opens draft PRs for its own
 * issues; it does not continue a pull request. The engineer reviews and merges on GitHub.
 */
export function OpenPullRequests() {
  const t = useT();
  const heading = useId();
  const { state, reload } = useGithubLists(true);
  const pulls = state.status === "ok" && state.lists.ok ? state.lists.pulls : null;
  return (
    <Card className="desk-panel desk-pulls" aria-labelledby={heading} role="region">
      <div className="desk-panel__head">
        <h2 id={heading}>
          {pulls === null
            ? t("desk.pulls.title")
            : t("desk.pulls.titleCount", { count: pulls.length })}
        </h2>
        <Button
          appearance="subtle"
          spacing="compact"
          disabled={state.status === "loading"}
          onClick={() => reload(true)}
        >
          {t("desk.github.refresh")}
        </Button>
      </div>
      <Muted>{t("desk.pulls.intro")}</Muted>
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <FailureText code={state.code} detail={state.detail} />}
      {state.status === "ok" && !state.lists.ok && (
        <p className="desk-muted">
          {t("desk.github.unavailable")} <span>{state.lists.reason}</span>
        </p>
      )}
      {pulls !== null &&
        (pulls.length === 0 ? (
          <Muted>{t("desk.pulls.empty")}</Muted>
        ) : (
          <ul className="desk-pulls__list">
            {pulls.map((pull) => (
              <PullRow key={pull.number} pull={pull} />
            ))}
          </ul>
        ))}
    </Card>
  );
}
