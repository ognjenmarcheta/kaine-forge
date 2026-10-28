import { ArrowRight, Button, Check, SettingsSection } from "@repo/ui";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useTranslation } from "../../../hooks/use-translation";
import { useNoteCount } from "../../notes/notes.hook";
import { NEW_NOTE } from "../../notes/notes.util";
import { useOnboardingSteps } from "../../onboarding/onboarding.hook";
import { useTodoCounts } from "../../todos/todos.hook";
import { readGettingStartedDismissed, writeGettingStartedDismissed } from "../dashboard.util";

interface ChecklistItem {
  key: string;
  label: string;
  href: string;
  done: boolean;
}

/**
 * First steps in the Active Organization. Todo and Note steps are done once one
 * exists; the invite step applies only where onboarding offers it, and the
 * list shows until the first Todo and Note exist or the user hides it.
 */
export function DashboardGettingStarted({
  userId,
  todoCounts,
  noteCount
}: {
  userId: string;
  todoCounts: ReturnType<typeof useTodoCounts>;
  noteCount: ReturnType<typeof useNoteCount>;
}) {
  const { t } = useTranslation();
  const onboarding = useOnboardingSteps();
  const [dismissed, setDismissed] = useState(() => readGettingStartedDismissed(userId));
  const todos = todoCounts.data?.todoCounts;
  const notes = noteCount.data?.noteCount;

  if (dismissed || !todos || notes === undefined) return null;

  const items: ChecklistItem[] = [
    {
      key: "todo",
      label: t("dashboard.gettingStarted.todo"),
      href: "/todos",
      done: todos.open + todos.completed > 0
    },
    {
      key: "note",
      label: t("dashboard.gettingStarted.note"),
      href: `/notes/${NEW_NOTE}`,
      done: notes > 0
    }
  ];
  if (items.every((item) => item.done)) return null;
  if (onboarding.status === "ready" && onboarding.steps.includes("invite"))
    items.push({
      key: "invite",
      label: t("dashboard.gettingStarted.invite"),
      href: "/members",
      done: false
    });

  return (
    <SettingsSection
      title={t("dashboard.gettingStarted.title")}
      description={t("dashboard.gettingStarted.description")}
      actions={
        <Button
          appearance="subtle"
          type="button"
          onClick={() => {
            writeGettingStartedDismissed(userId);
            setDismissed(true);
          }}
        >
          {t("dashboard.gettingStarted.dismiss")}
        </Button>
      }
    >
      <ul className="ui-work-list">
        {items.map((item) => (
          <li key={item.key} className="ui-work-row ui-dashboard__row">
            {item.done ? (
              <>
                <Check aria-hidden="true" className="ui-dashboard__row-icon" />
                <span className="ui-dashboard__row-done">
                  <span aria-hidden="true">{item.label}</span>
                  <span className="sr-only">
                    {t("dashboard.gettingStarted.done").replace("{step}", item.label)}
                  </span>
                </span>
              </>
            ) : (
              <>
                <ArrowRight aria-hidden="true" className="ui-dashboard__row-icon" />
                <Button asChild appearance="link">
                  <Link to={item.href}>{item.label}</Link>
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}
