import { Button, PageHeader } from "@repo/ui";
import { Link } from "react-router-dom";

import { DashboardCounts } from "./dashboard-counts";
import { DashboardGettingStarted } from "./dashboard-getting-started";
import { DashboardOpenTodos } from "./dashboard-open-todos";
import { DashboardRecentActivity } from "./dashboard-recent-activity";
import { DashboardRecentChats } from "./dashboard-recent-chats";
import { DashboardRecentNotes } from "./dashboard-recent-notes";
import {
  useGetNotesQuery,
  useGetTodosQuery,
  useNoteCountQuery,
  useTodoCountsQuery
} from "../../../graphql/generated/react-query";
import { useAuth } from "../../../hooks/use-auth";
import { useLiveNotes, useLiveTodos } from "../../../hooks/use-live-list";
import { useOrganization } from "../../../hooks/use-organization";
import { useTranslation } from "../../../hooks/use-translation";
import { useNoteCount } from "../../notes/notes.hook";
import { NEW_NOTE } from "../../notes/notes.util";
import { useTodoCounts } from "../../todos/todos.hook";

// Prefix keys: every dashboard Todo or Note query refetches after a live event.
const LIVE_TODO_KEYS = [useGetTodosQuery.getKey(), useTodoCountsQuery.getKey()];
const LIVE_NOTE_KEYS = [useGetNotesQuery.getKey(), useNoteCountQuery.getKey()];

export function DashboardOverview() {
  const { activeOrganizationId, isLoading } = useOrganization();
  // A new Active Organization resets drafts and pending rows, as on the Todos page.
  return (
    <DashboardWorkspace
      key={activeOrganizationId}
      organizationId={activeOrganizationId}
      enabled={Boolean(activeOrganizationId) && !isLoading}
    />
  );
}

function DashboardWorkspace({
  organizationId,
  enabled
}: {
  organizationId: string | null;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { organizations, organizationsVisible } = useOrganization();
  const organization = organizations.find((item) => item.id === organizationId);
  const firstName = session?.user.name.trim().split(/\s+/)[0];
  const todoCounts = useTodoCounts(organizationId, enabled);
  const noteCount = useNoteCount(organizationId, enabled);
  useLiveTodos({ enabled, invalidateKeys: LIVE_TODO_KEYS });
  useLiveNotes({ enabled, invalidateKeys: LIVE_NOTE_KEYS });

  return (
    <div className="ui-dashboard">
      <PageHeader
        eyebrow={organizationsVisible ? organization?.name : undefined}
        title={
          firstName
            ? t("dashboard.greeting").replace("{name}", firstName)
            : t("dashboard.greetingFallback")
        }
        description={t("dashboard.description")}
        actions={
          <>
            <Button asChild>
              <Link to="/todos">{t("dashboard.newTodo")}</Link>
            </Button>
            <Button asChild appearance="subtle">
              <Link to={`/notes/${NEW_NOTE}`}>{t("dashboard.newNote")}</Link>
            </Button>
          </>
        }
      />
      {session ? (
        <DashboardGettingStarted
          userId={session.user.id}
          todoCounts={todoCounts}
          noteCount={noteCount}
        />
      ) : null}
      <DashboardCounts todoCounts={todoCounts} noteCount={noteCount} />
      <DashboardOpenTodos organizationId={organizationId} enabled={enabled} />
      <div className="ui-dashboard__columns">
        <DashboardRecentNotes organizationId={organizationId} enabled={enabled} />
        <DashboardRecentChats organizationId={organizationId} enabled={enabled} />
      </div>
      <DashboardRecentActivity organizationId={organizationId} />
    </div>
  );
}
