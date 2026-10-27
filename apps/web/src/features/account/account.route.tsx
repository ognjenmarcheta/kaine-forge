import { AccountDelete } from "./components/account-delete";
import { AccountEmail } from "./components/account-email";
import { AccountLinkedAccounts } from "./components/account-linked-accounts";
import { AccountPassword } from "./components/account-password";
import { AccountProfile } from "./components/account-profile";
import { AccountSessions } from "./components/account-sessions";
import { useTranslation } from "../../hooks/use-translation";

export function AccountRoute() {
  const { t } = useTranslation();

  return (
    <section className="grid gap-[var(--ds-space-400)]">
      <header>
        <h1>{t("auth.account.title")}</h1>
        <p className="text-[color:var(--ds-text-subtle)]">{t("auth.account.summary")}</p>
      </header>
      <AccountProfile />
      <AccountEmail />
      <AccountPassword />
      <AccountSessions />
      <AccountLinkedAccounts />
      <AccountDelete />
    </section>
  );
}
