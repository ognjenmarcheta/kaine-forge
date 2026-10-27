import { ORGANIZATION_ROLES, type Permission } from "@repo/auth/permissions";
import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { queryKeys } from "@repo/query";
import { Button, ConfirmModal, FieldError, LabeledSelect } from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useTranslation } from "../../../hooks/use-translation";
import { organizationApi } from "../../../lib/auth-api";
import type { OrganizationMember } from "../organizations.type";
import { assignableRoleOptions, roleLabel } from "../organizations.util";

interface OrganizationMemberListProps {
  customRoleNames: readonly string[];
  members: OrganizationMember[];
  ownUserId: string | undefined;
  permissions: ReadonlySet<Permission>;
}

type PendingAction = { kind: "remove" | "transfer"; member: OrganizationMember };

/**
 * Members of the Active Organization. `member:update` changes roles and
 * `member:delete` removes members, never an owner; `organization:transfer`
 * hands over ownership. The server enforces the same rules; this only hides
 * controls.
 */
export function OrganizationMemberList({
  customRoleNames,
  members,
  ownUserId,
  permissions
}: OrganizationMemberListProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const reloadMembers = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.organizationMembersScope() });
  const updateRole = useMutation({
    mutationFn: organizationApi.updateMemberRole,
    onSettled: reloadMembers
  });
  const confirmAction = useMutation({
    mutationFn: (action: PendingAction) =>
      action.kind === "remove"
        ? organizationApi.removeMember(action.member.id)
        : organizationApi.transferOwnership(action.member.id),
    onSettled: async () => {
      setPending(null);
      await reloadMembers();
    }
  });
  const roleOptions = assignableRoleOptions(customRoleNames, t);
  const error = updateRole.error ?? confirmAction.error;

  return (
    <>
      {error ? <FieldError>{t(getAuthErrorMessageKey(error))}</FieldError> : null}
      <div className="ui-work-list">
        {members.map((member) => {
          const isSelf = member.userId === ownUserId;
          const isOwner = member.role === ORGANIZATION_ROLES.OWNER;
          const canChangeRole =
            permissions.has("member:update") &&
            !isSelf &&
            !isOwner &&
            roleOptions.some((option) => option.value === member.role);
          const canRemove = permissions.has("member:delete") && !isSelf && !isOwner;

          return (
            <article key={member.id} className="ui-work-row">
              <div className="flex flex-wrap items-start justify-between gap-[var(--ds-space-150)]">
                <div>
                  <h2 className="text-heading-xs font-semibold text-[color:var(--ds-text)]">
                    {member.name}
                  </h2>
                  <p className="text-body-sm text-[color:var(--ds-text-subtle)]">{member.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-[var(--ds-space-100)]">
                  {canChangeRole ? (
                    <LabeledSelect
                      ariaLabel={`${t("organizations.role.label")}: ${member.name}`}
                      disabled={updateRole.isPending}
                      label={t("organizations.role.label")}
                      options={roleOptions}
                      value={member.role}
                      onValueChange={(role) => {
                        if (role !== member.role) {
                          updateRole.mutate({ memberId: member.id, role });
                        }
                      }}
                    />
                  ) : (
                    <span className="rounded-[var(--ds-radius-100)] bg-[var(--ds-background-neutral)] px-[var(--ds-space-100)] py-[var(--ds-space-050)] text-body-sm text-[color:var(--ds-text-subtle)]">
                      {roleLabel(member.role, t)}
                    </span>
                  )}
                  {permissions.has("organization:transfer") && !isSelf ? (
                    <Button
                      appearance="subtle"
                      onClick={() => setPending({ kind: "transfer", member })}
                    >
                      {t("organizations.members.transfer")}
                    </Button>
                  ) : null}
                  {canRemove ? (
                    <Button
                      appearance="subtle"
                      onClick={() => setPending({ kind: "remove", member })}
                    >
                      {t("organizations.members.remove")}
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <ConfirmModal
        cancelLabel={t("button.cancel")}
        confirmLabel={
          pending?.kind === "transfer"
            ? t("organizations.members.transfer")
            : t("organizations.members.remove")
        }
        description={
          pending?.kind === "transfer"
            ? t("organizations.members.transferDescription")
            : t("organizations.members.removeDescription")
        }
        isConfirming={confirmAction.isPending}
        open={pending !== null}
        title={pending ? `${pending.member.name} (${pending.member.email})` : ""}
        onConfirm={() => {
          if (pending) confirmAction.mutate(pending);
        }}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      />
    </>
  );
}
