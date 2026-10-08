import { SUPPORTED_LANGUAGES } from "@repo/translation";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SlidersHorizontal,
  Toaster,
  TooltipProvider
} from "@repo/ui";
import type { ReactNode } from "react";

import { THEMES, isTheme, useTheme } from "./shell.preferences";
import { RouteLink, useRouter } from "./shell.router";
import { isSupportedLanguage, useLanguage, useT } from "../i18n/i18n.t";
import { useDesk } from "../state/desk.provider";

/** The one live status of the page: a quiet pill, announced politely when it changes. */
function LivePill() {
  const t = useT();
  const { state } = useDesk();
  return (
    <p className="desk-live" role="status" data-connection={state.connection}>
      <span className="desk-live__dot" aria-hidden="true" />
      <span>{t(`desk.connection.${state.connection}`)}</span>
    </p>
  );
}

/** Theme and language in one compact menu. A change applies at once and keeps what you typed. */
function Preferences() {
  const t = useT();
  const { language, setLanguage } = useLanguage();
  const [theme, setTheme] = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button appearance="ghost" className="desk-icon-button" aria-label={t("desk.prefs.title")}>
          <SlidersHorizontal aria-hidden="true" className="desk-icon" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="desk-menu">
        <DropdownMenuLabel>{t("desk.prefs.theme")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (isTheme(value)) setTheme(value);
          }}
        >
          {THEMES.map((entry) => (
            <DropdownMenuRadioItem key={entry} value={entry}>
              {t(`desk.prefs.theme.${entry}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("desk.prefs.language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(value) => {
            if (isSupportedLanguage(value)) setLanguage(value);
          }}
        >
          {SUPPORTED_LANGUAGES.map((entry) => (
            <DropdownMenuRadioItem key={entry} value={entry} lang={entry}>
              {t(`desk.prefs.language.${entry}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The frame of every page: skip link, one-row top bar, the main region, and the toasts. */
export function Shell({ children }: { readonly children: ReactNode }) {
  const t = useT();
  const { route } = useRouter();
  return (
    <TooltipProvider delayDuration={400}>
      <div className="desk-shell">
        <a className="desk-skip" href="#main">
          {t("desk.shell.skip")}
        </a>
        <header className="desk-topbar">
          <div className="desk-brand">
            <span className="desk-brand__mark" aria-hidden="true">
              {t("desk.shell.mark")}
            </span>
            <span className="desk-brand__name">
              <strong className="desk-brand__full">{t("desk.shell.brand")}</strong>
              <strong className="desk-brand__short" aria-hidden="true">
                {t("desk.shell.shortBrand")}
              </strong>
              <small>{t("desk.shell.subtitle")}</small>
            </span>
          </div>
          <nav aria-label={t("desk.shell.navigation")} className="desk-nav">
            <RouteLink
              to={{ view: "board" }}
              aria-current={route.view === "board" || route.view === "issue" ? "page" : undefined}
            >
              {t("desk.nav.board")}
            </RouteLink>
            <RouteLink
              to={{ view: "health" }}
              aria-current={route.view === "health" ? "page" : undefined}
            >
              {t("desk.nav.health")}
            </RouteLink>
          </nav>
          <div className="desk-topbar__end">
            <LivePill />
            <Preferences />
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Toaster
          position="bottom-right"
          containerAriaLabel={t("desk.toast.region")}
          toastOptions={{ closeButtonAriaLabel: t("desk.common.close") }}
        />
      </div>
    </TooltipProvider>
  );
}
