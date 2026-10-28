import type { AuthInvitation } from "@repo/auth/auth.type";
import { getAuthErrorMessageKey } from "@repo/auth/transport";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  LabeledSelect,
  SettingsSection
} from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { useTranslation } from "../../../hooks/use-translation";
import { organizationApi } from "../../../lib/auth-api";
import { ORGANIZATIONS_DEFINITION } from "../organizations.definition";
import { assignableRoleOptions } from "../organizations.util";

interface OrganizationInviteFormProps {
  /** Custom Roles to offer next to the built-in roles. */
  customRoleNames?: readonly string[];
  onInvited?: (invitation: AuthInvitation) => void;
}

export function OrganizationInviteForm({
  customRoleNames = [],
  onInvited
}: OrganizationInviteFormProps = {}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("member");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: organizationApi.inviteMember,
    onSuccess: async (invitation) => {
      setEmail("");
      onInvited?.(invitation);
      setNotice(t("organizations.invite.sent"));
      await queryClient.invalidateQueries({
        queryKey: ORGANIZATIONS_DEFINITION.invitationsScope
      });
    },
    onError: (inviteError) => setError(t(getAuthErrorMessageKey(inviteError)))
  });

  return (
    <SettingsSection title={t("organizations.invite.title")}>
      <form
        className="grid gap-[var(--ds-space-150)]"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setNotice(null);
          invite.mutate({ email: email.trim(), role });
        }}
      >
        <Field>
          <FieldLabel htmlFor={emailId}>{t("common.emailLabel")}</FieldLabel>
          <Input
            id={emailId}
            autoComplete="off"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <LabeledSelect
          label={t("organizations.role.label")}
          options={assignableRoleOptions(customRoleNames, t)}
          value={role}
          onValueChange={setRole}
        />
        {error ? <FieldError>{error}</FieldError> : null}
        {notice ? <FieldDescription role="status">{notice}</FieldDescription> : null}
        <div>
          <Button disabled={invite.isPending} type="submit">
            {invite.isPending ? t("common.loadingShort") : t("organizations.invite.submit")}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
