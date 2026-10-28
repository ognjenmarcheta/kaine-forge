import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { queryKeys } from "@repo/query";
import {
  Button,
  ConfirmModal,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Modal,
  SettingsSection
} from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useOrganization } from "../../../hooks/use-organization";
import { useTranslation } from "../../../hooks/use-translation";
import { organizationApi } from "../../../lib/auth-api";
import type { OrganizationOption } from "../organizations.type";

interface OrganizationSettingsProps {
  canDelete: boolean;
  canRename: boolean;
  organization: OrganizationOption;
}

/** Rename, leave, and delete the Active Organization; the server checks every role. */
export function OrganizationSettings({
  canDelete,
  canRename,
  organization
}: OrganizationSettingsProps) {
  const { t } = useTranslation();
  const { applyOrganizationSession } = useOrganization();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const nameId = useId();
  const confirmId = useId();
  const [name, setName] = useState(organization.name);
  const [dialog, setDialog] = useState<"leave" | "delete" | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const rename = useMutation({
    mutationFn: organizationApi.renameOrganization,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.organizations() })
  });
  // Leave and delete switch the session to another organization the user belongs to.
  const exit = useMutation({
    mutationFn: (kind: "leave" | "delete") =>
      kind === "leave" ? organizationApi.leaveOrganization() : organizationApi.deleteOrganization(),
    onSuccess: async (nextSession) => {
      setDialog(null);
      await applyOrganizationSession(nextSession);
      void navigate("/dashboard");
    },
    // The section shows the reason, such as "transfer ownership first".
    onError: () => setDialog(null)
  });
  const openDialog = (kind: "leave" | "delete") => {
    exit.reset();
    setConfirmName("");
    setDialog(kind);
  };
  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <>
      {canRename ? (
        <SettingsSection title={t("organizations.settings.nameTitle")}>
          <form
            className="grid gap-[var(--ds-space-100)]"
            onSubmit={(event) => {
              event.preventDefault();
              rename.mutate(name.trim());
            }}
          >
            <Field>
              <FieldLabel htmlFor={nameId}>{t("organizations.name")}</FieldLabel>
              <Input
                id={nameId}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            {rename.error ? (
              <FieldError>{t(getAuthErrorMessageKey(rename.error))}</FieldError>
            ) : null}
            {rename.isSuccess ? (
              <FieldDescription role="status">
                {t("organizations.settings.renamed")}
              </FieldDescription>
            ) : null}
            <div>
              <Button
                disabled={rename.isPending || name.trim() === organization.name}
                type="submit"
              >
                {t("organizations.settings.rename")}
              </Button>
            </div>
          </form>
        </SettingsSection>
      ) : null}
      <SettingsSection
        description={
          organization.personal
            ? t("organizations.settings.personal")
            : t("organizations.settings.exitDescription")
        }
        title={t("organizations.settings.exitTitle")}
      >
        {organization.personal ? null : (
          <div className="flex flex-wrap gap-[var(--ds-space-100)]">
            <Button appearance="subtle" onClick={() => openDialog("leave")}>
              {t("organizations.settings.leave")}
            </Button>
            {canDelete ? (
              <Button appearance="danger" onClick={() => openDialog("delete")}>
                {t("organizations.settings.delete")}
              </Button>
            ) : null}
          </div>
        )}
        {exit.error ? <FieldError>{t(getAuthErrorMessageKey(exit.error))}</FieldError> : null}
      </SettingsSection>
      <ConfirmModal
        cancelLabel={t("button.cancel")}
        confirmLabel={t("organizations.settings.leave")}
        description={t("organizations.settings.leaveDescription")}
        isConfirming={exit.isPending}
        open={dialog === "leave"}
        title={t("organizations.settings.leave")}
        onConfirm={() => exit.mutate("leave")}
        onOpenChange={closeDialog}
      />
      <Modal
        actions={[
          {
            appearance: "subtle",
            disabled: exit.isPending,
            label: t("button.cancel"),
            onClick: () => closeDialog(false)
          },
          {
            appearance: "danger",
            disabled: confirmName !== organization.name,
            label: t("organizations.settings.delete"),
            loading: exit.isPending,
            onClick: () => exit.mutate("delete")
          }
        ]}
        description={t("organizations.settings.deleteDescription")}
        open={dialog === "delete"}
        title={t("organizations.settings.delete")}
        onOpenChange={closeDialog}
      >
        <Field>
          <FieldLabel htmlFor={confirmId}>{t("organizations.settings.deleteConfirm")}</FieldLabel>
          <FieldDescription>{organization.name}</FieldDescription>
          <Input
            id={confirmId}
            autoComplete="off"
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
          />
        </Field>
      </Modal>
    </>
  );
}
