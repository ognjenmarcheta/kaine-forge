import { SUPPORTED_LANGUAGES } from "@repo/translation";
import {
  Button,
  Checkbox,
  Label,
  Search,
  SlidersHorizontal,
  Toaster,
  TooltipProvider
} from "@repo/ui";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useGlobalKeys } from "./shell.keys";
import {
  useDocumentTitle,
  notificationsSupported,
  useTurnNotifications,
  useYourTurn
} from "./shell.notify";
import { CommandPalette, rememberIssue } from "./shell.palette";
import { THEMES, useNotifyPreference, useTheme } from "./shell.preferences";
import { RouteLink, useRouter } from "./shell.router";
import { useFlushUndoOnPageHide } from "./shell.undo";
import { useLanguage, useT } from "../i18n/i18n.t";
import { useDesk } from "../state/desk.provider";

/** Default toast time and the most toasts on screen at once. */
const TOAST_MS = 4_500;
const TOAST_LIMIT = 3;

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

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

/** While the live stream reconnects, what the page shows may be old. Say so, once, on top. */
function ConnectionBanner() {
  const t = useT();
  const { state } = useDesk();
  if (state.connection !== "reconnecting") return null;
  return (
    <div className="desk-connbar" role="status">
      <span className="desk-connbar__spin" aria-hidden="true" />
      <strong>{t("desk.connection.pausedTitle")}</strong>
      <span>{t("desk.connection.pausedBody")}</span>
    </div>
  );
}

/** Pressed buttons in a pill: one choice of a few, all visible. */
function Segmented<T extends string>({
  label,
  value,
  options,
  name,
  onChange
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly T[];
  readonly name: (option: T) => string;
  readonly onChange: (option: T) => void;
}) {
  return (
    <div className="desk-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <Button
          key={option}
          type="button"
          appearance="ghost"
          className="desk-seg__item"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {name(option)}
        </Button>
      ))}
    </div>
  );
}

/**
 * Theme, language, and notifications in one small panel under the top bar. A change applies
 * at once and keeps what you typed. Esc or a click outside closes it.
 */
function Preferences({
  notify,
  onNotify
}: {
  readonly notify: boolean;
  readonly onNotify: (on: boolean) => void;
}) {
  const t = useT();
  const id = useId();
  const { language, setLanguage } = useLanguage();
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
    const outside = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel.current?.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const toggleNotify = async (on: boolean): Promise<void> => {
    if (!on) {
      onNotify(false);
      return;
    }
    if (!notificationsSupported()) {
      toast(t("desk.prefs.notify.unsupported"));
      return;
    }
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "granted") onNotify(true);
    else toast.warning(t("desk.prefs.notify.blocked"));
  };

  return (
    <>
      <Button
        ref={trigger}
        appearance="ghost"
        className="desk-icon-button"
        aria-label={t("desk.prefs.title")}
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        <SlidersHorizontal aria-hidden="true" className="desk-icon" />
      </Button>
      {open && (
        <div
          ref={panel}
          id={`${id}-panel`}
          className="desk-prefs"
          role="dialog"
          aria-label={t("desk.prefs.title")}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setOpen(false);
            trigger.current?.focus();
          }}
        >
          <h2 className="desk-prefs__title">{t("desk.prefs.theme")}</h2>
          <Segmented
            label={t("desk.prefs.theme")}
            value={theme}
            options={THEMES}
            name={(entry) => t(`desk.prefs.theme.${entry}`)}
            onChange={setTheme}
          />
          <h2 className="desk-prefs__title">{t("desk.prefs.language")}</h2>
          <Segmented
            label={t("desk.prefs.language")}
            value={language}
            options={SUPPORTED_LANGUAGES}
            name={(entry) => t(`desk.prefs.language.${entry}`)}
            onChange={setLanguage}
          />
          <h2 className="desk-prefs__title">{t("desk.prefs.notify")}</h2>
          <div className="desk-check-row">
            <Checkbox
              id={`${id}-notify`}
              checked={notify}
              onCheckedChange={(next) => void toggleNotify(next === true)}
            />
            <Label htmlFor={`${id}-notify`}>{t("desk.prefs.notify.label")}</Label>
          </div>
          <p className="desk-prefs__help">{t("desk.prefs.notify.help")}</p>
        </div>
      )}
    </>
  );
}

/** The frame of every page: skip link, one-row top bar, the main region, and the toasts. */
export function Shell({ children }: { readonly children: ReactNode }) {
  const t = useT();
  const { route, navigate } = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notify, setNotify] = useNotifyPreference();
  const turn = useYourTurn();
  const needsYou = [...turn.values()].some((group) => group === "needs-you");

  useGlobalKeys({
    openPalette: () => setPaletteOpen(true),
    go: (view) => navigate({ view })
  });
  useFlushUndoOnPageHide();
  useDocumentTitle(turn.size);
  useTurnNotifications(notify);
  const visited = route.view === "issue" ? route.issueNumber : null;
  useEffect(() => {
    if (visited !== null) rememberIssue(visited);
  }, [visited]);

  const shortcut = IS_MAC ? "⌘K" : `${t("desk.keys.ctrl")} K`;

  return (
    <TooltipProvider delayDuration={400}>
      <div className="desk-shell">
        <a className="desk-skip" href="#main">
          {t("desk.shell.skip")}
        </a>
        <div className="desk-masthead">
          <header className="desk-topbar">
            <div className="desk-brand">
              <span className="desk-brand__mark" aria-hidden="true">
                {t("desk.shell.mark")}
              </span>
              <span className="desk-brand__name">
                <strong>{t("desk.shell.brand")}</strong>
                <small>{t("desk.shell.subtitle")}</small>
              </span>
            </div>
            <nav aria-label={t("desk.shell.navigation")} className="desk-nav">
              <RouteLink
                to={{ view: "board" }}
                aria-current={route.view === "board" || route.view === "issue" ? "page" : undefined}
              >
                {t("desk.nav.board")}
                {turn.size > 0 && (
                  <>
                    <span
                      className={needsYou ? "desk-count" : "desk-count desk-count--quiet"}
                      aria-hidden="true"
                    >
                      {turn.size}
                    </span>
                    <span className="desk-sr-only">
                      {t("desk.nav.turnCount", { count: turn.size })}
                    </span>
                  </>
                )}
              </RouteLink>
              <RouteLink
                to={{ view: "health" }}
                aria-current={route.view === "health" ? "page" : undefined}
              >
                {t("desk.nav.health")}
              </RouteLink>
              <RouteLink
                to={{ view: "stats" }}
                aria-current={route.view === "stats" ? "page" : undefined}
              >
                {t("desk.nav.stats")}
              </RouteLink>
            </nav>
            <div className="desk-topbar__end">
              <Button
                appearance="ghost"
                className="desk-cmdk"
                aria-label={t("desk.palette.open")}
                aria-keyshortcuts={IS_MAC ? "Meta+K /" : "Control+K /"}
                onClick={() => setPaletteOpen(true)}
              >
                <Search aria-hidden="true" className="desk-icon" />
                <span className="desk-cmdk__text">{t("desk.palette.trigger")}</span>
                <kbd className="desk-kbd desk-cmdk__kbd">{shortcut}</kbd>
              </Button>
              <LivePill />
              <Preferences notify={notify} onNotify={setNotify} />
            </div>
          </header>
          <ConnectionBanner />
        </div>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <Toaster
          position="bottom-right"
          duration={TOAST_MS}
          visibleToasts={TOAST_LIMIT}
          containerAriaLabel={t("desk.toast.region")}
          toastOptions={{
            closeButtonAriaLabel: t("desk.common.close"),
            classNames: {
              toast: "desk-toast",
              description: "desk-toast__description",
              actionButton: "desk-toast__undo"
            }
          }}
        />
      </div>
    </TooltipProvider>
  );
}
