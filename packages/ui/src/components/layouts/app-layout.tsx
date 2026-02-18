import type { ReactNode } from "react";

interface AppLayoutProps {
  header: ReactNode;
  main: ReactNode;
  sidebar: ReactNode;
}

export function AppLayout({ header, main, sidebar }: AppLayoutProps) {
  return (
    <div className="ui-app-shell">
      {header}
      <div className="ui-app-shell__body">
        {sidebar}
        <main className="ui-app-shell__content">{main}</main>
      </div>
    </div>
  );
}
