import type { AuthCustomRole } from "@repo/auth/auth.type";
import { CUSTOM_ROLE_PERMISSIONS, type Permission } from "@repo/auth/permissions";
import { getAuthErrorMessageKey } from "@repo/auth/transport";
import {
  Button,
  Checkbox,
  ChevronRight,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ConfirmModal,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
  QueryError,
  SettingsSection
} from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { useTranslation } from "../../../hooks/use-translation";
import { organizationApi } from "../../../lib/auth-api";
import { ORGANIZATIONS_DEFINITION } from "../organizations.definition";
import { useCustomRoles } from "../organizations.hook";

// The Custom Role editor groups CUSTOM_ROLE_PERMISSIONS by resource.
const PERMISSION_GROUPS = new Map<string, Permission[]>();
for (const permission of CUSTOM_ROLE_PERMISSIONS) {
  const resource = permission.split(":")[0] ?? "";
  PERMISSION_GROUPS.set(resource, [...(PERMISSION_GROUPS.get(resource) ?? []), permission]);
}

interface PermissionChecklistProps {
  onChange: (permissions: ReadonlySet<Permission>) => void;
  value: ReadonlySet<Permission>;
}

function PermissionChecklist({ onChange, value }: PermissionChecklistProps) {
  const { t } = useTranslation();
  const idPrefix = useId();

  return (
    <FieldSet>
      <FieldLegend variant="label">{t("organizations.roles.permissions")}</FieldLegend>
      <div className="grid gap-[var(--ds-space-150)] sm:grid-cols-2">
        {[...PERMISSION_GROUPS].map(([resource, permissions]) => (
          <div key={resource} className="grid gap-[var(--ds-space-050)]">
            <p className="text-body-sm font-semibold text-[color:var(--ds-text)]">
              {t(`organizations.permission.group.${resource}`)}
            </p>
            {permissions.map((permission) => {
              const id = `${idPrefix}-${permission}`;

              return (
                <label
                  key={permission}
                  className="flex items-center gap-[var(--ds-space-100)] text-body-sm text-[color:var(--ds-text)]"
                  htmlFor={id}
                >
                  <Checkbox
                    checked={value.has(permission)}
                    id={id}
                    onCheckedChange={(checked) => {
                      const next = new Set(value);
                      if (checked === true) next.add(permission);
                      else next.delete(permission);
                      onChange(next);
                    }}
                  />
                  <span>{t(`organizations.permission.${permission.replace(":", ".")}`)}</span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </FieldSet>
  );
}

function CustomRoleItem({ role }: { role: AuthCustomRole }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [permissions, setPermissions] = useState<ReadonlySet<Permission>>(
    () => new Set(role.permissions)
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [open, setOpen] = useState(false);
  const reloadRoles = () =>
    queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_DEFINITION.customRolesScope });
  const save = useMutation({
    mutationFn: organizationApi.updateCustomRole,
    onSettled: reloadRoles
  });
  const remove = useMutation({
    mutationFn: organizationApi.deleteCustomRole,
    onSettled: async () => {
      setConfirmingDelete(false);
      await reloadRoles();
    }
  });
  const error = save.error ?? remove.error;

  return (
    <article className="ui-work-row grid gap-[var(--ds-space-150)]">
      <h3 className="text-heading-xs font-semibold text-[color:var(--ds-text)]">{role.name}</h3>
      {/* Collapsed by default; the edits stay while it is closed. */}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="ui-disclosure-trigger">
          <ChevronRight aria-hidden className="size-4" />
          {t("organizations.roles.permissionCount").replace("{count}", String(permissions.size))}
        </CollapsibleTrigger>
        <CollapsibleContent forceMount inert={!open}>
          <div className="pt-[var(--ds-space-150)]">
            <PermissionChecklist value={permissions} onChange={setPermissions} />
          </div>
        </CollapsibleContent>
      </Collapsible>
      {error ? <FieldError>{t(getAuthErrorMessageKey(error))}</FieldError> : null}
      {save.isSuccess ? (
        <FieldDescription role="status">{t("organizations.roles.saved")}</FieldDescription>
      ) : null}
      <div className="flex flex-wrap gap-[var(--ds-space-100)]">
        <Button
          disabled={save.isPending || permissions.size === 0}
          onClick={() => save.mutate({ name: role.name, permissions: [...permissions] })}
        >
          {t("organizations.roles.save")}
        </Button>
        <Button appearance="subtle" onClick={() => setConfirmingDelete(true)}>
          {t("organizations.roles.delete")}
        </Button>
      </div>
      <ConfirmModal
        cancelLabel={t("button.cancel")}
        confirmLabel={t("organizations.roles.delete")}
        description={t("organizations.roles.deleteDescription")}
        isConfirming={remove.isPending}
        open={confirmingDelete}
        title={role.name}
        onConfirm={() => remove.mutate(role.name)}
        onOpenChange={setConfirmingDelete}
      />
    </article>
  );
}

function CustomRoleCreateForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const nameId = useId();
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<ReadonlySet<Permission>>(() => new Set());
  const create = useMutation({
    mutationFn: organizationApi.createCustomRole,
    onSuccess: async () => {
      setName("");
      setPermissions(new Set());
      await queryClient.invalidateQueries({
        queryKey: ORGANIZATIONS_DEFINITION.customRolesScope
      });
    }
  });

  return (
    <form
      className="grid gap-[var(--ds-space-150)]"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate({ name: name.trim().toLowerCase(), permissions: [...permissions] });
      }}
    >
      <Field>
        <FieldLabel htmlFor={nameId}>{t("organizations.roles.name")}</FieldLabel>
        <Input
          id={nameId}
          autoComplete="off"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <FieldDescription>{t("organizations.roles.nameHint")}</FieldDescription>
      </Field>
      <PermissionChecklist value={permissions} onChange={setPermissions} />
      {create.error ? <FieldError>{t(getAuthErrorMessageKey(create.error))}</FieldError> : null}
      {create.isSuccess ? (
        <FieldDescription role="status">{t("organizations.roles.created")}</FieldDescription>
      ) : null}
      <div>
        <Button disabled={create.isPending || permissions.size === 0} type="submit">
          {t("organizations.roles.create")}
        </Button>
      </div>
    </form>
  );
}

/** The Active Organization's Custom Roles, which only its owners create, change, and delete. */
export function OrganizationRoles() {
  const { t } = useTranslation();
  const rolesQuery = useCustomRoles(true);
  const roles = rolesQuery.data ?? [];

  return (
    <>
      <SettingsSection
        description={t("organizations.roles.description")}
        title={t("organizations.roles.title")}
      >
        {rolesQuery.status === "error" ? (
          <QueryError
            message={t("organizations.roles.error")}
            retryLabel={t("common.retry")}
            onRetry={() => void rolesQuery.refetch()}
          />
        ) : null}
        {rolesQuery.status === "success" && roles.length === 0 ? (
          <p className="text-body text-[color:var(--ds-text-subtle)]">
            {t("organizations.roles.empty")}
          </p>
        ) : null}
        {roles.length > 0 ? (
          <div className="ui-work-list">
            {roles.map((role) => (
              <CustomRoleItem key={role.id} role={role} />
            ))}
          </div>
        ) : null}
      </SettingsSection>
      <SettingsSection title={t("organizations.roles.create")}>
        <CustomRoleCreateForm />
      </SettingsSection>
    </>
  );
}
