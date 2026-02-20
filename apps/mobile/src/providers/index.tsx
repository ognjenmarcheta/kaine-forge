import type { ReactNode } from "react";

import { AuthProvider } from "./auth.provider";
import { OrganizationProvider } from "./organization.provider";
import { QueryProvider } from "./query.provider";
import { ThemeProvider } from "./theme.provider";
import { TranslationProvider } from "./translation.provider";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <TranslationProvider>
      <ThemeProvider>
        <QueryProvider>
          <AuthProvider>
            <OrganizationProvider>{children}</OrganizationProvider>
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </TranslationProvider>
  );
}
