import { AccountDelete } from "./components/account-delete";
import { AccountEmail } from "./components/account-email";
import { AccountLinkedAccounts } from "./components/account-linked-accounts";
import { AccountPassword } from "./components/account-password";
import { AccountProfile } from "./components/account-profile";
import { DataExportSection } from "../data-export/components/data-export-section";
import { PasskeySettings } from "../security/components/passkey-settings";
import { TwoFactorSettings } from "../security/components/two-factor-settings";

/** The profile picture, the display name, and the email address. */
export function AccountProfileTab() {
  return (
    <>
      <AccountProfile />
      <AccountEmail />
    </>
  );
}

/** The ways to sign in: the password, two-step verification, and linked accounts. */
export function AccountSecurityTab() {
  return (
    <>
      <AccountPassword />
      <TwoFactorSettings />
      <PasskeySettings />
      <AccountLinkedAccounts />
    </>
  );
}

/** The export of the user's own data and the account deletion request. */
export function AccountDataTab() {
  return (
    <>
      <DataExportSection kind="user" organizationId={null} />
      <AccountDelete />
    </>
  );
}
