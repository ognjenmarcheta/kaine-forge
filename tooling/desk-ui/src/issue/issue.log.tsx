import { Button } from "@repo/ui";
import { useEffect, useRef, useState } from "react";

import { useLanguage, useT } from "../i18n/i18n.t";
import { formatClock } from "../shell/shell.format";
import { useDesk } from "../state/desk.provider";

const EMPTY: readonly never[] = [];

/**
 * Load the log buffer of an issue, and again after a reconnect: entries may have been missed.
 * The issue page calls it once, so the Log tab and the inspector read the same entries.
 */
export function useIssueLog(issueNumber: number): void {
  const { state, loadLog } = useDesk();
  const live = state.connection === "live";
  useEffect(() => {
    loadLog(issueNumber).catch(() => undefined);
  }, [issueNumber, loadLog, live]);
}

/**
 * The live log of one issue: the buffer on load, then the events. Text arrives redacted and is
 * shown as text. Each row shows its time once, in the reader's zone and language.
 */
export function LogPanel({ issueNumber }: { readonly issueNumber: number }) {
  const t = useT();
  const { language } = useLanguage();
  const { state } = useDesk();
  const entries = state.logs[issueNumber] ?? EMPTY;
  const box = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    const element = box.current;
    if (following && element !== null) element.scrollTop = element.scrollHeight;
  }, [entries.length, following]);

  return (
    <div className="desk-log-panel">
      <div
        ref={box}
        className="desk-log"
        role="log"
        tabIndex={0}
        aria-label={t("desk.log.label")}
        aria-live="off"
        onScroll={(event) => {
          const element = event.currentTarget;
          setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < 24);
        }}
      >
        {entries.length === 0 ? (
          <p className="desk-muted">{t("desk.log.empty")}</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.seq} className="desk-log__line" data-kind={entry.kind}>
              <time dateTime={entry.at} className="desk-log__time">
                {formatClock(entry.at, language)}
              </time>{" "}
              <span>{entry.text}</span>
            </div>
          ))
        )}
      </div>
      {!following && (
        <Button
          appearance="secondary"
          spacing="compact"
          className="desk-log__latest"
          onClick={() => {
            setFollowing(true);
          }}
        >
          {t("desk.log.latest")}
        </Button>
      )}
    </div>
  );
}
