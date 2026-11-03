import { boardJobs, JOB_TONE } from "./job.model";
import { SideCard } from "../board/board.side";
import { useT } from "../i18n/i18n.t";
import { RouteLink } from "../shell/shell.router";
import { useDesk } from "../state/desk.provider";
import { StatusChip } from "../status/status.chip";

/** Desk jobs on the board: the unfinished ones first, then the last few that ended. */
export function JobsList() {
  const t = useT();
  const { state } = useDesk();
  const jobs = boardJobs(state.jobs);
  if (jobs.length === 0) return null;
  return (
    <SideCard title={t("desk.job.side.title")} count={jobs.length}>
      <ul className="desk-side__list">
        {jobs.map((job) => (
          <li key={job.id} className="desk-side__item">
            <RouteLink className="desk-side__name" to={{ view: "job", jobId: job.id }}>
              {t(`desk.job.title.${job.kind}`, { id: job.id })}
            </RouteLink>
            <span className="desk-side__meta">
              <StatusChip tone={JOB_TONE[job.status]}>
                {t(`desk.job.status.${job.status}`)}
              </StatusChip>
            </span>
          </li>
        ))}
      </ul>
    </SideCard>
  );
}
