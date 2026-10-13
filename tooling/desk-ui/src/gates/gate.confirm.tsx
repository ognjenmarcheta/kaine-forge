import { Checkbox, Label, Modal } from "@repo/ui";
import { useId, useState } from "react";

import { useT } from "../i18n/i18n.t";

/** A dialog opened from a menu has no trigger of its own: focus returns where the caller says. */
interface ReturnFocus {
  readonly onCloseAutoFocus?: (event: Event) => void;
}

const returnFocus = (props: ReturnFocus) =>
  props.onCloseAutoFocus === undefined ? {} : { onCloseAutoFocus: props.onCloseAutoFocus };

export interface CancelDialogProps extends ReturnFocus {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}

export function CancelDialog({ open, onOpenChange, onConfirm, ...rest }: CancelDialogProps) {
  const t = useT();
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      {...returnFocus(rest)}
      title={t("desk.gate.cancel.title")}
      description={t("desk.gate.cancel.description")}
      closeButtonLabel={t("desk.common.close")}
      size="sm"
      actions={[
        { appearance: "subtle", label: t("desk.common.back"), onClick: () => onOpenChange(false) },
        {
          appearance: "danger",
          label: t("desk.gate.cancel.confirm"),
          onClick: () => {
            onOpenChange(false);
            onConfirm();
          }
        }
      ]}
    />
  );
}

export interface RemoveDialogProps extends ReturnFocus {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (force: boolean) => void;
}

/** Remove deletes the desk state and the worktree. A worktree with changes needs the force box. */
export function RemoveDialog({ open, onOpenChange, onConfirm, ...rest }: RemoveDialogProps) {
  const t = useT();
  const id = useId();
  const [force, setForce] = useState(false);
  return (
    <Modal
      open={open}
      {...returnFocus(rest)}
      onOpenChange={(next) => {
        if (!next) setForce(false);
        onOpenChange(next);
      }}
      title={t("desk.gate.remove.title")}
      description={t("desk.gate.remove.description")}
      closeButtonLabel={t("desk.common.close")}
      size="sm"
      actions={[
        { appearance: "subtle", label: t("desk.common.back"), onClick: () => onOpenChange(false) },
        {
          appearance: "danger",
          label: t("desk.gate.remove.confirm"),
          onClick: () => {
            onOpenChange(false);
            onConfirm(force);
            setForce(false);
          }
        }
      ]}
    >
      <div className="desk-check-row">
        <Checkbox
          id={`${id}-force`}
          checked={force}
          onCheckedChange={(value) => setForce(value === true)}
        />
        <Label htmlFor={`${id}-force`}>{t("desk.gate.remove.force")}</Label>
      </div>
      <p className="desk-muted">{t("desk.gate.remove.forceHelp")}</p>
    </Modal>
  );
}
