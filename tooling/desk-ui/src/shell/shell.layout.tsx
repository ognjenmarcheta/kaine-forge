import { themes } from "@repo/theme";
import { SUPPORTED_LANGUAGES } from "@repo/translation";
import { Button, Checkbox, Label, Toaster, TooltipProvider } from "@repo/ui";
import {
  Bot,
  ChartColumn,
  FlaskConical,
  Gauge,
  Inbox,
  Plus,
  Rows3,
  Search,
  SlidersHorizontal,
  Workflow,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useGlobalKeys, type GoTarget } from "./shell.keys";
import { NewWorkProvider, useNewWork } from "./shell.newwork";
import {
  notificationsSupported,
  useDocumentTitle,
  useTurnNotifications,
  useYourTurn
} from "./shell.notify";
import { CommandPalette, rememberIssue } from "./shell.palette";
import {
  DENSITIES,
  THEMES,
  useDensity,
  useHoldToasts,
  useNotifyPreference,
  useTheme,
  useThemeName
} from "./shell.preferences";
import type { Route } from "./shell.route";
import { RouteLink, useRouter } from "./shell.router";
import { Segmented } from "./shell.ui";
import { setHoldUndo, useFlushUndoOnPageHide } from "./shell.undo";
import { useLanguage, useT } from "../i18n/i18n.t";
import { useDesk } from "../state/desk.provider";

/** Default toast time and the most toasts on screen at once. */
const TOAST_MS = 4_500;
const TOAST_LIMIT = 3;

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

interface NavItem {
  readonly target: GoTarget;
  readonly icon: LucideIcon;
  /** The routes that light this item up: a page and the pages under it. */
  readonly current: readonly Route["view"][];
}

/** The sidebar: four groups, each a few pages. The phone tabs show the first four items. */
const NAV: readonly { readonly group: string; readonly items: readonly NavItem[] }[] = [
  {
    group: "work",
    items: [
      { target: "inbox", icon: Inbox, current: ["inbox", "issue", "job"] },
      { target: "work", icon: Rows3, current: ["work"] }
    ]
  },
  {
    group: "configure",
    items: [
      { target: "flows", icon: Workflow, current: ["flows", "flow"] },
      { target: "agents", icon: Bot, current: ["agents", "agent"] },
      { target: "setup", icon: Wrench, current: ["setup"] }
    ]
  },
  {
    group: "insights",
    items: [
      { target: "insights", icon: ChartColumn, current: ["insights"] },
      { target: "scorecard", icon: Gauge, current: ["scorecard"] }
    ]
  },
  { group: "developer", items: [{ target: "lab", icon: FlaskConical, current: ["lab"] }] }
];

const PHONE_TABS: readonly GoTarget[] = ["inbox", "work", "insights", "setup"];

/** The badge beside a nav item: what waits on you, or the setup errors. */
function NavCount({ target }: { readonly target: GoTarget }) {
  const t = useT();
  const { state } = useDesk();
  const turn = useYourTurn();
  if (target === "inbox" && turn.size > 0) {
    return (
      <span
        className="dk-count dk-need dk-num"
        aria-label={t("desk.nav.turnCount", { count: turn.size })}
      >
        {turn.size}
      </span>
    );
  }
  const errors = state.health?.checks.filter((check) => check.status === "error").length ?? 0;
  if (target === "setup" && errors > 0) {
    return (
      <span
        className="dk-count dk-bad dk-num"
        aria-label={t("desk.nav.setupErrors", { count: errors })}
      >
        {errors}
      </span>
    );
  }
  return null;
}

function NavLink({ item, className }: { readonly item: NavItem; readonly className?: string }) {
  const t = useT();
  const { route } = useRouter();
  const Icon = item.icon;
  return (
    <RouteLink
      to={{ view: item.target }}
      className={className}
      title={t(`desk.nav.${item.target}`)}
      aria-current={item.current.includes(route.view) ? "page" : undefined}
    >
      <Icon className="dk-ic" aria-hidden="true" />
      <span className="dk-lab">{t(`desk.nav.${item.target}`)}</span>
      <NavCount target={item.target} />
    </RouteLink>
  );
}

/** The one live status of the page, announced politely when it changes. */
function Connection() {
  const t = useT();
  const { state } = useDesk();
  const tone =
    state.connection === "live" ? "" : state.connection === "reconnecting" ? " dk-re" : " dk-co";
  return (
    <span className={`dk-conn${tone}`} role="status">
      <i aria-hidden="true" />
      <span className="dk-lab">{t(`desk.connection.${state.connection}`)}</span>
    </span>
  );
}

/** While the live stream reconnects, what the page shows may be old. Say so, once, on top. */
function ConnectionBar() {
  const t = useT();
  const { state } = useDesk();
  if (state.connection !== "reconnecting") return null;
  return (
    <div className="dk-connbar" role="status">
      <span className="dk-spin" aria-hidden="true" />
      <b>{t("desk.connection.pausedTitle")}</b>
      <span>{t("desk.connection.pausedBody")}</span>
    </div>
  );
}

/**
 * Theme, color mode, density, language, messages, and notifications in one small panel. A
 * change applies at once and keeps what you typed. Esc or a click outside closes it.
 */
interface Prefs {
  readonly theme: ReturnType<typeof useTheme>;
  readonly themeName: ReturnType<typeof useThemeName>;
  readonly density: ReturnType<typeof useDensity>;
  readonly hold: ReturnType<typeof useHoldToasts>;
  readonly notify: ReturnType<typeof useNotifyPreference>;
}

function Preferences({
  prefs,
  trigger,
  onClose
}: {
  readonly prefs: Prefs;
  readonly trigger: HTMLElement | null;
  readonly onClose: () => void;
}) {
  const t = useT();
  const id = useId();
  const { language, setLanguage } = useLanguage();
  const [theme, setTheme] = prefs.theme;
  const [themeName, setThemeName] = prefs.themeName;
  const [density, setDensity] = prefs.density;
  const [hold, setHold] = prefs.hold;
  const [notify, setNotify] = prefs.notify;
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
    const outside = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel.current?.contains(target) || trigger?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [trigger, onClose]);

  const toggleNotify = async (on: boolean): Promise<void> => {
    if (!on) {
      setNotify(false);
      return;
    }
    if (!notificationsSupported()) {
      toast(t("desk.prefs.notify.unsupported"));
      return;
    }
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "granted") setNotify(true);
    else toast.warning(t("desk.prefs.notify.blocked"));
  };

  return (
    <div
      ref={panel}
      className="dk-pop"
      role="dialog"
      aria-label={t("desk.prefs.title")}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
        trigger?.focus();
      }}
    >
      <h2 className="dk-h-card">{t("desk.prefs.title")}</h2>
      <div className="dk-field">
        <span className="dk-lbl">{t("desk.prefs.theme")}</span>
        <Segmented
          label={t("desk.prefs.theme")}
          value={themeName}
          options={themes.map((entry) => entry.name)}
          name={(entry) => themes.find((item) => item.name === entry)?.label ?? entry}
          onChange={setThemeName}
        />
      </div>
      <div className="dk-field">
        <span className="dk-lbl">{t("desk.prefs.mode")}</span>
        <Segmented
          label={t("desk.prefs.mode")}
          value={theme}
          options={THEMES}
          name={(entry) => t(`desk.prefs.appearance.${entry}`)}
          onChange={setTheme}
        />
      </div>
      <div className="dk-field">
        <span className="dk-lbl">{t("desk.prefs.density")}</span>
        <Segmented
          label={t("desk.prefs.density")}
          value={density}
          options={DENSITIES}
          name={(entry) => t(`desk.prefs.density.${entry}`)}
          onChange={setDensity}
        />
        <span className="dk-hint">{t("desk.prefs.density.help")}</span>
      </div>
      <div className="dk-field">
        <span className="dk-lbl">{t("desk.prefs.language")}</span>
        <Segmented
          label={t("desk.prefs.language")}
          value={language}
          options={SUPPORTED_LANGUAGES}
          name={(entry) => t(`desk.prefs.language.${entry}`)}
          onChange={setLanguage}
        />
      </div>
      <div className="dk-check">
        <Checkbox
          id={`${id}-hold`}
          checked={hold}
          onCheckedChange={(next) => setHold(next === true)}
        />
        <Label htmlFor={`${id}-hold`}>{t("desk.prefs.holdToasts")}</Label>
      </div>
      <div className="dk-check">
        <Checkbox
          id={`${id}-notify`}
          checked={notify}
          aria-describedby={`${id}-notify-help`}
          onCheckedChange={(next) => void toggleNotify(next === true)}
        />
        <span>
          <Label htmlFor={`${id}-notify`}>{t("desk.prefs.notify.label")}</Label>
          <span id={`${id}-notify-help`} className="dk-hint dk-block">
            {t("desk.prefs.notify.help")}
          </span>
        </span>
      </div>
    </div>
  );
}

function Sidebar({ prefs, onPalette }: { readonly prefs: Prefs; readonly onPalette: () => void }) {
  const t = useT();
  const newWork = useNewWork();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsButton, setPrefsButton] = useState<HTMLButtonElement | null>(null);
  const shortcut = IS_MAC ? "⌘K" : `${t("desk.keys.ctrl")} K`;
  return (
    <aside className="dk-side" aria-label={t("desk.shell.sidebar")}>
      <div className="dk-brand">
        <span className="dk-logo" aria-hidden="true">
          {t("desk.shell.mark")}
        </span>
        <span className="dk-brand-t">
          <b>{t("desk.shell.brand")}</b>
          <span>{t("desk.shell.subtitle")}</span>
        </span>
      </div>
      <Button
        type="button"
        appearance="ghost"
        className="dk-bare dk-search-trigger"
        aria-label={t("desk.palette.open")}
        aria-keyshortcuts={IS_MAC ? "Meta+K /" : "Control+K /"}
        onClick={onPalette}
      >
        <Search className="dk-ic" aria-hidden="true" />
        <span className="dk-st-l">{t("desk.palette.trigger")}</span>
        <kbd className="dk-kbd">{shortcut}</kbd>
      </Button>
      <nav className="dk-nav" aria-label={t("desk.shell.navigation")}>
        {NAV.map(({ group, items }) => (
          <div key={group} className="dk-nav-g">
            <span className="dk-nav-h">{t(`desk.nav.group.${group}`)}</span>
            {items.map((item) => (
              <NavLink key={item.target} item={item} />
            ))}
          </div>
        ))}
      </nav>
      <div className="dk-side-foot">
        <Button
          type="button"
          appearance="outline"
          title={t("desk.newWork.open")}
          aria-keyshortcuts="N"
          onClick={() => newWork.open()}
        >
          <Plus className="dk-ic" aria-hidden="true" />
          <span className="dk-lab">{t("desk.newWork.open")}</span>
        </Button>
        <div className="dk-row">
          <Connection />
          <span className="dk-grow" />
          <Button
            type="button"
            ref={setPrefsButton}
            appearance="ghost"
            spacing="icon"
            aria-label={t("desk.prefs.title")}
            aria-expanded={prefsOpen}
            onClick={() => setPrefsOpen((was) => !was)}
          >
            <SlidersHorizontal className="dk-ic" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {prefsOpen && (
        <Preferences prefs={prefs} trigger={prefsButton} onClose={() => setPrefsOpen(false)} />
      )}
    </aside>
  );
}

/** On a phone the sidebar becomes four tabs at the bottom. */
function PhoneTabs() {
  const t = useT();
  const items = NAV.flatMap((group) => group.items).filter((item) =>
    PHONE_TABS.includes(item.target)
  );
  return (
    <nav className="dk-btabs" aria-label={t("desk.shell.tabs")}>
      {items.map((item) => (
        <NavLink key={item.target} item={item} />
      ))}
    </nav>
  );
}

function Frame({ children }: { readonly children: ReactNode }) {
  const t = useT();
  const { route, navigate } = useRouter();
  const newWork = useNewWork();
  const [paletteOpen, setPaletteOpen] = useState(false);
  // One owner for each preference: the root shows it from the first paint, the panel changes it.
  const prefs: Prefs = {
    theme: useTheme(),
    themeName: useThemeName(),
    density: useDensity(),
    hold: useHoldToasts(),
    notify: useNotifyPreference()
  };
  const [hold] = prefs.hold;
  const [notify] = prefs.notify;
  const turn = useYourTurn();

  useEffect(() => setHoldUndo(hold), [hold]);
  useGlobalKeys({
    openPalette: () => setPaletteOpen(true),
    go: (view) => navigate({ view }),
    newWork: () => newWork.open()
  });
  useFlushUndoOnPageHide();
  useDocumentTitle(turn.size);
  useTurnNotifications(notify);
  const visited = route.view === "issue" ? route.issueNumber : null;
  useEffect(() => {
    if (visited !== null) rememberIssue(visited);
  }, [visited]);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="dk">
        <a className="dk-skip" href="#main">
          {t("desk.shell.skip")}
        </a>
        <Sidebar prefs={prefs} onPalette={() => setPaletteOpen(true)} />
        <div className="dk-main">
          <ConnectionBar />
          <main id="main" className="dk-page" tabIndex={-1}>
            {children}
          </main>
        </div>
        <PhoneTabs />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <Toaster
          position="bottom-right"
          duration={TOAST_MS}
          visibleToasts={TOAST_LIMIT}
          containerAriaLabel={t("desk.toast.region")}
          toastOptions={{
            closeButtonAriaLabel: t("desk.common.close"),
            classNames: {
              toast: "dk-toast",
              description: "dk-toast-d",
              actionButton: "dk-undo"
            }
          }}
        />
      </div>
    </TooltipProvider>
  );
}

/** The frame of every page: skip link, sidebar, the main column, phone tabs, and the toasts. */
export function Shell({ children }: { readonly children: ReactNode }) {
  return (
    <NewWorkProvider>
      <Frame>{children}</Frame>
    </NewWorkProvider>
  );
}
