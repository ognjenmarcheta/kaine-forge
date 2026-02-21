import type { ReactNode } from "react";

interface AppLayoutProps {
  header: ReactNode;
  main: ReactNode;
  sidebar: ReactNode;
}

export function AppLayout({ header, main, sidebar }: AppLayoutProps) {
  return (
    <div className="ui-app-shell flex min-h-svh w-full min-w-0 flex-1 flex-col">
      {header}
      <div className="ui-app-shell__body flex min-h-0 flex-1">
        {sidebar}
        {main}
      </div>
    </div>
  );
}
