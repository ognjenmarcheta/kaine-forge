import type { ReactNode } from "react";

interface AppLayoutProps {
  header: ReactNode;
  main: ReactNode;
  sidebar: ReactNode;
}

export function AppLayout({ header, main, sidebar }: AppLayoutProps) {
  return (
    <div className="ui-app-shell flex min-h-svh w-full min-w-0 flex-1">
      {sidebar}
      <div className="ui-app-shell__workspace">
        {header}
        {main}
      </div>
    </div>
  );
}
