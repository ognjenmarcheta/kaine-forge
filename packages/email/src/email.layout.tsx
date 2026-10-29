import { defaultTheme } from "@repo/theme";
import type { ReactNode } from "react";

// Email clients ignore CSS custom properties and stylesheets, so the layout
// inlines the light values of the default theme from @repo/theme.
const light = defaultTheme.modes.light;
const EMAIL_TOKENS = {
  brand: light["background-brand-bold"],
  border: light.border,
  link: light.link,
  surface: light.surface,
  surfaceSunken: light["surface-sunken"],
  text: light.text,
  textInverse: light["text-brand-inverse"],
  textSubtle: light["text-subtle"],
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
} as const;

export interface EmailLayoutProps {
  locale: string;
  subject: string;
  heading: string;
  footer: string;
  children: ReactNode;
}

export function EmailLayout({ locale, subject, heading, footer, children }: EmailLayoutProps) {
  return (
    <html lang={locale}>
      <head>
        <meta content="text/html; charset=UTF-8" httpEquiv="Content-Type" />
        <title>{subject}</title>
      </head>
      <body
        style={{
          backgroundColor: EMAIL_TOKENS.surfaceSunken,
          color: EMAIL_TOKENS.text,
          fontFamily: EMAIL_TOKENS.fontFamily,
          margin: 0,
          padding: "24px 12px"
        }}
      >
        <table
          align="center"
          role="presentation"
          style={{
            backgroundColor: EMAIL_TOKENS.surface,
            border: `1px solid ${EMAIL_TOKENS.border}`,
            borderRadius: "8px",
            maxWidth: "560px",
            width: "100%"
          }}
        >
          <tbody>
            <tr>
              <td style={{ padding: "32px" }}>
                <h1 style={{ fontSize: "22px", lineHeight: "30px", margin: "0 0 16px" }}>
                  {heading}
                </h1>
                {children}
                <p
                  style={{
                    borderTop: `1px solid ${EMAIL_TOKENS.border}`,
                    color: EMAIL_TOKENS.textSubtle,
                    fontSize: "12px",
                    lineHeight: "18px",
                    margin: "32px 0 0",
                    paddingTop: "16px"
                  }}
                >
                  {footer}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function EmailText({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: "15px", lineHeight: "24px", margin: "0 0 16px" }}>{children}</p>;
}

export function EmailCode({ code }: { code: string }) {
  return (
    <p
      style={{
        backgroundColor: EMAIL_TOKENS.surfaceSunken,
        borderRadius: "6px",
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        fontSize: "28px",
        letterSpacing: "6px",
        margin: "0 0 16px",
        padding: "12px 16px",
        textAlign: "center"
      }}
    >
      {code}
    </p>
  );
}

export interface EmailButtonProps {
  href: string;
  label: string;
  /** Shown under the button with the raw URL; left out of the plain-text part. */
  fallback: string;
}

export function EmailButton({ href, label, fallback }: EmailButtonProps) {
  return (
    <>
      <p style={{ margin: "8px 0 24px" }}>
        <a
          href={href}
          style={{
            backgroundColor: EMAIL_TOKENS.brand,
            borderRadius: "6px",
            color: EMAIL_TOKENS.textInverse,
            display: "inline-block",
            fontSize: "15px",
            fontWeight: 600,
            padding: "12px 20px",
            textDecoration: "none"
          }}
        >
          {label}
        </a>
      </p>
      {/* The plain-text part prints the button as "label URL" already. */}
      <p
        data-skip-in-text="true"
        style={{
          color: EMAIL_TOKENS.textSubtle,
          fontSize: "12px",
          lineHeight: "18px",
          margin: "0 0 16px",
          wordBreak: "break-all"
        }}
      >
        {fallback}{" "}
        <a href={href} style={{ color: EMAIL_TOKENS.link }}>
          {href}
        </a>
      </p>
    </>
  );
}
