import type { GithubPull } from "@repo/desk/contracts";
import { Badge, Button, Card } from "@repo/ui";
import { useId } from "react";

import { useIssueActions } from "../gates/gate.actions";
import { useGithubLists } from "../github/github.use";
import { useLanguage, useT } from "../i18n/i18n.t";
import { relativeTime, safeHttpUrl } from "../shell/shell.format";
import { useNow } from "../shell/shell.now";
import { RouteLink } from "../shell/shell.router";
import { FailureText, Loading, Muted } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { StatusChip } from "../status/status.chip";
import type { Tone } from "../status/status.model";

const CI_TONE: Readonly<Record<GithubPull["ci"]["state"], Tone>> = {
  passing: "success",
  failing: "danger",
  running: "information",
  none: "neutral"
};

/**
 * A desk PR's actions: read its failing checks and new comments now, and send them to a fix
 * round. The round runs build, check, and review again and waits for the owner's OK to push.
 */
function DeskPullActions({
  pull,
  issue,
  onDone
}: {
  readonly pull: GithubPull;
  readonly issue: number;
  readonly onDone: () => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const now = useNow();
  const { state } = useDesk();
  const summary = state.issues[issue];
  const actions = useIssueActions(issue, summary?.readable === true && summary.busy);
  const check = pull.check;
  const found = check !== null && (check.failingChecks.length > 0 || check.comments > 0);
  const atLimit = summary?.readable === true && summary.prRound >= summary.prRoundLimit;
  return (
    <span className="desk-pulls__actions">
      {check !== null && (
        <span className="desk-muted">
          {t("desk.pulls.checked", {
            when: relativeTime(check.at, now, language),
            failing: check.failingChecks.length,
            comments: check.comments
          })}
          {check.skipped.length > 0 &&
            ` ${t("desk.pulls.skipped", { authors: check.skipped.join(", ") })}`}
        </span>
      )}
      <Button
        appearance="subtle"
        spacing="compact"
        disabled={actions.busy}
        onClick={() => void actions.run({ action: "check-pr" }).then(onDone)}
      >
        {t("desk.pulls.check")}
      </Button>
      <Button
        spacing="compact"
        disabled={actions.busy || !found || atLimit}
        onClick={() => void actions.run({ action: "pr-feedback" }).then(onDone)}
      >
        {t("desk.pulls.address")}
      </Button>
    </span>
  );
}

function PullRow({ pull, onDone }: { readonly pull: GithubPull; readonly onDone: () => void }) {
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
        <StatusChip tone={CI_TONE[pull.ci.state]}>
          {t(`desk.pulls.ci.${pull.ci.state}`, { count: pull.ci.failing })}
        </StatusChip>
        {pull.review !== "none" && (
          <Badge appearance="default">{t(`desk.pulls.review.${pull.review}`)}</Badge>
        )}
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
      {pull.issue !== null && state.issues[pull.issue] !== undefined && (
        <DeskPullActions pull={pull} issue={pull.issue} onDone={onDone} />
      )}
    </li>
  );
}

/**
 * The open pull requests of the repository with their CI and review state. A PR of a desk issue
 * can be checked and sent to a fix round from here; the engineer reviews and merges on GitHub.
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
              // After an action the list reads the issue state again, not GitHub.
              <PullRow key={pull.number} pull={pull} onDone={() => reload(false)} />
            ))}
          </ul>
        ))}
    </Card>
  );
}

/** The open pull requests in the side list of Your turn: a title and one quiet line each. */
export function SidePullRequests() {
  const t = useT();
  const heading = useId();
  const { language } = useLanguage();
  const now = useNow();
  const { state } = useGithubLists(true);
  const pulls = state.status === "ok" && state.lists.ok ? state.lists.pulls : null;
  return (
    <Card className="desk-side__card" aria-labelledby={heading} role="region">
      <h2 id={heading} className="desk-side__title">
        {t("desk.pulls.title")}
        {pulls !== null && <span className="desk-side__count">{pulls.length}</span>}
      </h2>
      {state.status === "loading" && <Loading />}
      {(state.status === "error" || (state.status === "ok" && !state.lists.ok)) && (
        <p className="desk-side__empty">{t("desk.github.unavailable")}</p>
      )}
      {pulls !== null && pulls.length === 0 && (
        <p className="desk-side__empty">{t("desk.pulls.sideEmpty")}</p>
      )}
      {pulls !== null && pulls.length > 0 && (
        <ul className="desk-side__list">
          {pulls.map((pull) => {
            const href = safeHttpUrl(pull.url);
            const name = (
              <>
                <b className="desk-side__number">
                  {t("desk.issue.number", { number: pull.number })}
                </b>{" "}
                {pull.title}
              </>
            );
            const when = relativeTime(pull.updatedAt, now, language);
            return (
              <li key={pull.number} className="desk-side__item">
                {href === null ? (
                  <span className="desk-side__name">{name}</span>
                ) : (
                  <a className="desk-side__name" href={href} target="_blank" rel="noreferrer">
                    {name}
                  </a>
                )}
                <span className="desk-side__meta">
                  {pull.draft ? t("desk.pulls.sideDraft", { when }) : when}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
