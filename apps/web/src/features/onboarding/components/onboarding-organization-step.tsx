import { AUTH_DEFINITIONS } from "@repo/auth/auth.definition";
import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { queryKeys } from "@repo/query";
import { Button, Field, FieldError, FieldLabel, Input } from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { useOrganization } from "../../../hooks/use-organization";
import { useTranslation } from "../../../hooks/use-translation";
import { organizationApi } from "../../../lib/auth-api";

interface OnboardingOrganizationStepProps {
  initialName: string;
  onDone: () => void;
}

/**
 * Names the Personal Organization, or creates a new Organization with the
 * name. Both act on the session: the rename on the Active Organization, and
 * the new Organization becomes active.
 */
export function OnboardingOrganizationStep({
  initialName,
  onDone
}: OnboardingOrganizationStepProps) {
  const { t } = useTranslation();
  const { createOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const nameId = useId();
  const [name, setName] = useState(initialName);
  const trimmedName = name.trim();
  const save = useMutation({
    mutationFn: async (mode: "rename" | "create") => {
      if (mode === "create") {
        await createOrganization(trimmedName);
        return;
      }

      await organizationApi.renameOrganization(trimmedName);
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations() });
    },
    onSuccess: onDone
  });

  return (
    <form
      className="grid gap-ds-150"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate("rename");
      }}
    >
      <Field>
        <FieldLabel htmlFor={nameId}>{t("organizations.name")}</FieldLabel>
        <Input
          id={nameId}
          autoComplete="organization"
          maxLength={AUTH_DEFINITIONS.ORGANIZATION_NAME_MAX_LENGTH}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      {save.error ? <FieldError>{t(getAuthErrorMessageKey(save.error))}</FieldError> : null}
      <div className="grid gap-ds-100">
        <Button disabled={save.isPending || trimmedName === ""} type="submit">
          {t("auth.onboarding.organization.rename")}
        </Button>
        <Button
          appearance="link"
          disabled={save.isPending || trimmedName === ""}
          type="button"
          onClick={() => save.mutate("create")}
        >
          {t("auth.onboarding.organization.create")}
        </Button>
      </div>
    </form>
  );
}
