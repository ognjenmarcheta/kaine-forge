import { Button, Field, FieldLabel, Modal, Textarea } from "@repo/ui";
import { useId } from "react";

import { useTranslation } from "../hooks/use-translation";

/** A Note body edit the server refused because another device changed the same lines. */
export interface NoteConflict {
  id: string;
  title: string;
  mine: string;
  current: string;
}

interface NoteConflictDialogProps {
  conflict: NoteConflict | null;
  onKeepMine: (conflict: NoteConflict) => void;
  onKeepCurrent: () => void;
}

/** Lets the second writer choose between their refused body and the current one. */
export function NoteConflictDialog({
  conflict,
  onKeepMine,
  onKeepCurrent
}: NoteConflictDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <Modal
      open={conflict !== null}
      title={t("sync.conflict.title")}
      description={t("sync.conflict.message")}
      closeButtonLabel={t("common.close")}
      onOpenChange={(open) => {
        if (!open) onKeepCurrent();
      }}
      footer={
        <div className="ui-modal__actions">
          <Button appearance="subtle" onClick={onKeepCurrent}>
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
          <Textarea id={id + "-current"} readOnly rows={6} value={conflict?.current ?? ""} />
        </Field>
      </div>
    </Modal>
  );
}
