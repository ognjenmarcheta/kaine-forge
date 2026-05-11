import { Toaster } from "@repo/ui";
import type { ReactNode } from "react";

import { AuthProvider } from "./auth.provider";
import { OrganizationProvider } from "./organization.provider";
import { QueryProvider } from "./query.provider";
import { ThemeProvider } from "./theme.provider";
import { TranslationProvider } from "./translation.provider";
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
            <OrganizationProvider>{children}</OrganizationProvider>
            <AppToaster />
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </TranslationProvider>
  );
}
