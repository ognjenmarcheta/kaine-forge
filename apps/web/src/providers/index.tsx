import type { ReactNode } from "react";

import { AuthProvider } from "./auth.provider";
import { GraphqlProvider } from "./graphql.provider";
import { ThemeProvider } from "./theme.provider";
import { TranslationProvider } from "./translation.provider";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <TranslationProvider>
      <ThemeProvider>
        <AuthProvider>
          <GraphqlProvider>{children}</GraphqlProvider>
        </AuthProvider>
      </ThemeProvider>
    </TranslationProvider>
  );
}
