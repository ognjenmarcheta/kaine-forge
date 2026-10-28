import { ORGANIZATION_ROLES, type Permission } from "@repo/auth/permissions";
import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { queryKeys } from "@repo/query";
import { Button, ConfirmModal, FieldError, LabeledSelect } from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

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

type PendingAction =
  | { kind: "remove" | "transfer"; member: OrganizationMember }
  | { kind: "role"; member: OrganizationMember; role: string };

const CONFIRM_LABEL_KEYS = {
  remove: "organizations.members.remove",
  role: "organizations.members.roleChangeConfirm",
  transfer: "organizations.members.transfer"
} as const satisfies Record<PendingAction["kind"], string>;

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
  // Every change here waits for a confirm; a role change names the old and the new role.
  const confirmAction = useMutation({
    mutationFn: async (action: PendingAction) => {
      if (action.kind === "role") {
        await organizationApi.updateMemberRole({ memberId: action.member.id, role: action.role });
      } else if (action.kind === "remove") {
        await organizationApi.removeMember(action.member.id);
      } else {
        await organizationApi.transferOwnership(action.member.id);
      }
    },
    onSuccess: (_result, action) => {
      if (action.kind === "role") toast.success(t("organizations.members.roleChanged"));
    },
    onSettled: async () => {
      await reloadMembers();
      setPending(null);
    }
  });
  const roleOptions = assignableRoleOptions(customRoleNames, t);
  const error = confirmAction.error;

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
              <div className="flex flex-wrap items-start justify-between gap-ds-150">
                <div>
                  <h3 className="text-heading-xs font-semibold text-ds-text">{member.name}</h3>
                  <p className="text-body-sm text-ds-text-subtle">{member.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-ds-100">
                  {canChangeRole ? (
                    <LabeledSelect
                      ariaLabel={`${t("organizations.role.label")}: ${member.name}`}
                      disabled={confirmAction.isPending}
                      label={t("organizations.role.label")}
                      options={roleOptions}
                      // The select shows the picked role while its confirm is open; a cancel restores it.
                      value={
                        pending?.kind === "role" && pending.member.id === member.id
                          ? pending.role
                          : member.role
                      }
                      onValueChange={(role) => {
                        if (role !== member.role) {
                          setPending({ kind: "role", member, role });
                        }
                      }}
                    />
                  ) : (
                    <span className="rounded-md bg-ds-bg-neutral px-ds-100 py-ds-050 text-body-sm text-ds-text-subtle">
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
        confirmLabel={t(CONFIRM_LABEL_KEYS[pending?.kind ?? "remove"])}
        description={
          pending?.kind === "role"
            ? t("organizations.members.roleChangeDescription")
                .replace("{from}", roleLabel(pending.member.role, t))
                .replace("{to}", roleLabel(pending.role, t))
            : t(
                pending?.kind === "transfer"
                  ? "organizations.members.transferDescription"
                  : "organizations.members.removeDescription"
              )
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
