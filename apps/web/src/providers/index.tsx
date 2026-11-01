import { Toaster } from "@repo/ui";
import type { ReactNode } from "react";

import { AuthProvider } from "./auth.provider";
import { OrganizationProvider } from "./organization.provider";
import { QueryProvider } from "./query.provider";
import { SyncProvider } from "./sync.provider";
import { ThemeProvider } from "./theme.provider";
import { TranslationProvider } from "./translation.provider";
import { AppUpdatePrompt } from "../components/app-update-prompt";
import { useTranslation } from "../hooks/use-translation";

interface AppProvidersProps {
  children: ReactNode;
}

function AppToaster() {
  const { t } = useTranslation();

  return <Toaster containerAriaLabel={t("common.notifications")} />;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <TranslationProvider>
      <ThemeProvider>
        <QueryProvider>
          <AuthProvider>
            <OrganizationProvider>
              <SyncProvider>{children}</SyncProvider>
            </OrganizationProvider>
            <AppToaster />
            {/* The desktop shell loads this build from disk and keeps no service worker. */}
            {"__TAURI_INTERNALS__" in window ? null : <AppUpdatePrompt />}
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </TranslationProvider>
  );
}
