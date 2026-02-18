import type { ReactNode } from "react";

interface AuthLayoutProps {
  children?: ReactNode;
  subtitle: string;
  title: string;
}

export function AuthLayout({ children, subtitle, title }: AuthLayoutProps) {
  return (
    <main className="ui-auth-layout">
      <section className="ui-auth-layout__card">
        <h1 className="ui-auth-layout__title">{title}</h1>
        <p className="ui-auth-layout__subtitle">{subtitle}</p>
        {children}
      </section>
    </main>
  );
}
