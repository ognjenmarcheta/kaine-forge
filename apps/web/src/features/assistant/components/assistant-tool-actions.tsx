import { Link } from "react-router-dom";

import { useTranslation } from "../../../hooks/use-translation";

interface AssistantToolActionsProps {
  actions: { output: string | null; tool: string }[];
}

interface NoteLink {
  noteId: string;
  title: string;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function noteLinkFor(action: { output: string | null; tool: string }): NoteLink | null {
  if (!action.output) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(action.output);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (action.tool === "createNote" || action.tool === "updateNote") {
    const noteId = readString(parsed, "id");
    if (noteId) return { noteId, title: readString(parsed, "title") ?? noteId };
  }
  if (action.tool === "addTodoToNote") {
    const noteId = readString(parsed, "noteId");
    if (noteId) return { noteId, title: readString(parsed, "title") ?? noteId };
  }
  return null;
}

export function AssistantToolActions({ actions }: AssistantToolActionsProps) {
  const { t } = useTranslation();
  const notePrefix = t("assistant.result.note");
  const links = actions.map(noteLinkFor).filter((link): link is NoteLink => link !== null);
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-[var(--ds-space-100)]">
      {links.map((link, index) => {
        const label = `${notePrefix} ${link.title}`;
        return (
          <Link
            key={`${link.noteId}-${index.toString()}`}
            className="text-[color:var(--ds-text-link,var(--ds-text-subtle))] underline"
            to={`/notes/${link.noteId}`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
