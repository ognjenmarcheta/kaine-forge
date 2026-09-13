import { Link } from "react-router-dom";

import { useTranslation } from "../../../hooks/use-translation";
import { readAssistantAction } from "../assistant.util";

interface AssistantToolActionsProps {
  actions: { output: string | null; tool: string }[];
}

export function AssistantToolActions({ actions }: AssistantToolActionsProps) {
  const { t } = useTranslation();
  const results = actions.map(readAssistantAction);
  const activitySummary = `${t("assistant.activity")} (${results.length.toString()})`;
  if (!results.length) return null;
  return (
    <div className="ui-assistant__actions">
      <ul className="ui-assistant__results">
        {results.map((result, index) =>
          result.kind === "change" ? (
            <li key={index}>
              <span>
                {t(result.label)}
                {result.detail ? `: ${result.detail}` : ""}
                {result.state ? ` · ${t(result.state)}` : ""}
              </span>
              {result.href ? (
                <Link to={result.href}>
                  {t(result.href === "/todos" ? "assistant.openTodos" : "assistant.openNote")}
                </Link>
              ) : null}
            </li>
          ) : null
        )}
      </ul>
      <details className="ui-assistant__activity">
        <summary>{activitySummary}</summary>
        <ul>
          {results.map((result, index) => {
            const label = `${t(`assistant.activity.${result.kind}`)} · ${t(result.label)}`;
            return (
              <li key={index}>
                <span>{label}</span>
                {result.detail ? `: ${result.detail}` : ""}
                {result.state ? ` · ${t(result.state)}` : ""}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
