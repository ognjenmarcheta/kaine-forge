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
  /** Add a finished note, for example a finding's fix. The same note is not added twice. */
  readonly add: (note: LineNote) => void;
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
      add: (note) =>
        setNotes((was) =>
          was.some(
            (entry) =>
              entry.path === note.path && entry.line === note.line && entry.text === note.text
          )
            ? was
            : [...was, note]
        ),
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
          type="button"
          appearance="outline"
          spacing="compact"
          disabled={text.trim() === ""}
          onClick={() => onSave(text)}
        >
          {t("desk.lines.add")}
        </Button>
        <Button type="button" appearance="ghost" spacing="compact" onClick={onCancel}>
          {t("desk.common.cancel")}
        </Button>
        <span className="dk-hint">{t("desk.lines.notSent")}</span>
      </span>
    </div>
  );
}

/** The part of a review finding that "Apply fix" needs. */
export interface FixableFinding {
  readonly file: string;
  readonly line: number;
  readonly summary: string;
  readonly fix: string;
}

/**
 * "Apply fix" on a finding: it queues the finding and its suggested fix as a note for the builder.
 * The builder applies it when the owner sends back. A queued fix shows "Queued" and an Undo.
 */
export function ApplyFix({ finding }: { readonly finding: FixableFinding }) {
  const t = useT();
  const notes = useContext(LineNotesContext);
  if (notes === null || finding.fix.trim() === "") return null;
  const text = t("desk.finding.noteText", { summary: finding.summary, fix: finding.fix });
  const queued = notes.notes.find(
    (note) => note.path === finding.file && note.line === finding.line && note.text === text
  );
  if (queued === undefined) {
    return (
      <Button
        type="button"
        appearance="outline"
        spacing="compact"
        onClick={() => notes.add({ path: finding.file, line: finding.line, text })}
      >
        {t("desk.finding.apply")}
      </Button>
    );
  }
  return (
    <span className="dk-row">
      <span className="dk-hint">{t("desk.finding.queued")}</span>
      <Button
        type="button"
        appearance="link"
        spacing="compact"
        className="dk-bare dk-linkbtn dk-t-small"
        onClick={() => notes.remove(queued)}
      >
        {t("desk.finding.undo")}
      </Button>
    </span>
  );
}

/** Above the decision bar while comments wait: how many, and the way to send them. */
export function PendingStrip({
  count,
  onReview
}: {
  readonly count: number;
  readonly onReview: () => void;
}) {
  const t = useT();
  return (
    <div className="dk-banner dk-banner-information" role="status">
      <span>{t("desk.lines.pending", { count })}</span>
      <Button type="button" appearance="outline" spacing="compact" onClick={onReview}>
        {t("desk.lines.review")}
      </Button>
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
      type="button"
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
              type="button"
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
