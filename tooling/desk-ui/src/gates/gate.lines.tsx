import { MAX_FEEDBACK_CHARS } from "@repo/desk/contracts";
import { Button, Textarea } from "@repo/ui";
import { Plus } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { useT, type Translate } from "../i18n/i18n.t";

/** A note on one line of the diff, for the builder. Nothing is sent until Send back. */
export interface LineNote {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

interface LineNotes {
  readonly notes: readonly LineNote[];
  readonly draft: { readonly path: string; readonly line: number } | null;
  readonly start: (path: string, line: number) => void;
  readonly save: (text: string) => void;
  readonly cancel: () => void;
  readonly remove: (note: LineNote) => void;
}

const LineNotesContext = createContext<LineNotes | null>(null);

/** The line notes of a review and the one being written. */
export function useLineNotes(): LineNotes & { readonly clear: () => void } {
  const [notes, setNotes] = useState<readonly LineNote[]>([]);
  const [draft, setDraft] = useState<LineNotes["draft"]>(null);
  return useMemo(
    () => ({
      notes,
      draft,
      start: (path, line) => setDraft({ path, line }),
      save: (text) => {
        const trimmed = text.trim();
        if (draft !== null && trimmed !== "")
          setNotes((was) => [...was, { ...draft, text: trimmed }]);
        setDraft(null);
      },
      cancel: () => setDraft(null),
      remove: (note) => setNotes((was) => was.filter((entry) => entry !== note)),
      clear: () => {
        setNotes([]);
        setDraft(null);
      }
    }),
    [notes, draft]
  );
}

export function LineNotesProvider({
  value,
  children
}: {
  readonly value: LineNotes;
  readonly children: ReactNode;
}) {
  return <LineNotesContext.Provider value={value}>{children}</LineNotesContext.Provider>;
}

/** The notes as one feedback text: each with its file and line, after a heading. */
export const lineNotesText = (t: Translate, notes: readonly LineNote[]): string =>
  notes.length === 0
    ? ""
    : [
        t("desk.lines.heading"),
        ...notes.map((note) =>
          t("desk.lines.item", { path: note.path, line: note.line, text: note.text })
        )
      ].join("\n");

function DraftBox({
  line,
  onSave,
  onCancel
}: {
  readonly line: number;
  readonly onSave: (text: string) => void;
  readonly onCancel: () => void;
}) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => box.current?.focus(), []);
  return (
    <div className="dk-inl dk-mine">
      <label className="dk-lbl" htmlFor={id}>
        {t("desk.lines.label", { line })}
      </label>
      <Textarea
        ref={box}
        id={id}
        value={text}
        maxLength={MAX_FEEDBACK_CHARS}
        placeholder={t("desk.lines.placeholder")}
        onChange={(event) => setText(event.target.value)}
      />
      <span className="dk-row">
        <Button
          appearance="outline"
          spacing="compact"
          disabled={text.trim() === ""}
          onClick={() => onSave(text)}
        >
          {t("desk.lines.add")}
        </Button>
        <Button appearance="ghost" spacing="compact" onClick={onCancel}>
          {t("desk.common.cancel")}
        </Button>
        <span className="dk-hint">{t("desk.lines.notSent")}</span>
      </span>
    </div>
  );
}

/** The "+" of a diff line that has a new-file line number: start a note on it. */
export function LineAdd({ path, line }: { readonly path: string; readonly line: number }) {
  const t = useT();
  const notes = useContext(LineNotesContext);
  if (notes === null) return null;
  return (
    <Button
      appearance="ghost"
      className="dk-bare dk-ln-add"
      aria-label={t("desk.lines.start", { line })}
      title={t("desk.lines.start", { line })}
      onClick={() => notes.start(path, line)}
    >
      <Plus className="dk-ic" aria-hidden="true" />
    </Button>
  );
}

/** The notes on a line, and the box for a new one when it is being written there. */
export function LineNotesAt({ path, line }: { readonly path: string; readonly line: number }) {
  const t = useT();
  const notes = useContext(LineNotesContext);
  if (notes === null) return null;
  const here = notes.notes.filter((note) => note.path === path && note.line === line);
  const drafting = notes.draft?.path === path && notes.draft.line === line;
  return (
    <>
      {here.map((note, index) => (
        <div key={`${String(line)}-${String(index)}`} className="dk-inl dk-mine" role="note">
          <b>{t("desk.lines.mine")}</b>
          <span>{note.text}</span>
          <span>
            <Button
              appearance="link"
              spacing="compact"
              className="dk-bare dk-linkbtn dk-t-small"
              onClick={() => notes.remove(note)}
            >
              {t("desk.lines.delete")}
            </Button>
          </span>
        </div>
      ))}
      {drafting && <DraftBox line={line} onSave={notes.save} onCancel={notes.cancel} />}
    </>
  );
}
