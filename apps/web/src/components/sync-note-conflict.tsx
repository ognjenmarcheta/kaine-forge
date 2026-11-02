import type { SyncEngine } from "@repo/sync";
import { Button, Field, FieldLabel, Modal, Textarea } from "@repo/ui";
import { useCallback, useId, useSyncExternalStore } from "react";

import { useTranslation } from "../hooks/use-translation";

/** A Note body edit the server refused because another device changed the same lines. */
export interface NoteConflict {
  id: string;
  title: string;
  mine: string;
}

interface NoteConflictDialogProps {
  engine: SyncEngine | null;
  conflict: NoteConflict | null;
  onKeepMine: (conflict: NoteConflict) => void;
  onKeepCurrent: (conflict: NoteConflict) => void;
}

/**
 * The Note's body as the engine shows it, kept live. The refused edit rolls
 * back just after it is reported, so this becomes the server's body then.
 */
function useNoteBody(engine: SyncEngine | null, id: string | undefined): string {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!engine) return () => undefined;
      const subscription = engine.notes.subscribeChanges(onChange);
      return () => subscription.unsubscribe();
    },
    [engine]
  );
  return useSyncExternalStore(subscribe, () => (id ? (engine?.notes.get(id)?.body ?? "") : ""));
}

/** Lets the second writer choose between their refused body and the current one. */
export function NoteConflictDialog({
  engine,
  conflict,
  onKeepMine,
  onKeepCurrent
}: NoteConflictDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const current = useNoteBody(engine, conflict?.id);
  return (
    <Modal
      open={conflict !== null}
      title={t("sync.conflict.title")}
      description={t("sync.conflict.message")}
      closeButtonLabel={t("common.close")}
      onOpenChange={(open) => {
        if (!open && conflict) onKeepCurrent(conflict);
      }}
      footer={
        <div className="ui-modal__actions">
          <Button appearance="subtle" onClick={() => conflict && onKeepCurrent(conflict)}>
            {t("sync.conflict.keepCurrent")}
          </Button>
          <Button onClick={() => conflict && onKeepMine(conflict)}>
            {t("sync.conflict.keepMine")}
          </Button>
        </div>
      }
    >
      <div className="ui-form">
        <p>
          <strong>{conflict?.title}</strong>
        </p>
        <Field>
          <FieldLabel htmlFor={id + "-mine"}>{t("sync.conflict.mine")}</FieldLabel>
          <Textarea id={id + "-mine"} readOnly rows={6} value={conflict?.mine ?? ""} />
        </Field>
        <Field>
          <FieldLabel htmlFor={id + "-current"}>{t("sync.conflict.current")}</FieldLabel>
          <Textarea id={id + "-current"} readOnly rows={6} value={current} />
        </Field>
      </div>
    </Modal>
  );
}
