import type { ReactNode } from "react";

interface AuthLayoutProps {
  children?: ReactNode;
  footer?: ReactNode;
  subtitle: string;
  title: string;
}

export function AuthLayout({ children, footer, subtitle, title }: AuthLayoutProps) {
  return (
    <main className="ui-auth-layout">
      <section className="ui-auth-layout__card">
        <h1 className="ui-auth-layout__title">{title}</h1>
        <p className="ui-auth-layout__subtitle">{subtitle}</p>
        {children}
      </section>
      {footer ? <footer className="ui-auth-layout__footer">{footer}</footer> : null}
    </main>
  );
}
