import type { AuthInvitation } from "@repo/auth/auth.type";
import { useState } from "react";

import { useTranslation } from "../../../hooks/use-translation";
import { OrganizationInviteForm } from "../../organizations/components/organization-invite-form";

/** The Members page invite form, plus the Invitations sent in this step. */
export function OnboardingInviteStep() {
  const { t } = useTranslation();
  const [sent, setSent] = useState<AuthInvitation[]>([]);

  return (
    <div className="grid gap-[var(--ds-space-200)]">
      <OrganizationInviteForm
        onInvited={(invitation) => setSent((current) => [...current, invitation])}
      />
      {sent.length > 0 ? (
        <section className="grid gap-[var(--ds-space-100)]">
          <h2 className="text-heading-sm font-semibold text-[color:var(--ds-text)]">
            {t("auth.onboarding.invite.sentTitle")}
          </h2>
          <ul aria-label={t("auth.onboarding.invite.sentTitle")} className="ui-work-list">
            {sent.map((invitation) => (
              <li
                key={invitation.id}
                className="ui-work-row flex flex-wrap items-center justify-between gap-[var(--ds-space-150)]"
              >
                <span className="text-body text-[color:var(--ds-text)]">{invitation.email}</span>
                <span className="text-body-sm text-[color:var(--ds-text-subtle)]">
                  {t(`organizations.role.${invitation.role}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
