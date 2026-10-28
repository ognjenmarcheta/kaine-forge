import {
  Building2,
  CommandMenu,
  Languages,
  ListTodo,
  MessageSquare,
  Monitor,
  Moon,
  NotebookPen,
  Sun,
  type CommandMenuGroup,
  type CommandMenuItem,
  type NavPreferencesProps
} from "@repo/ui";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { isApplePlatform, isCommandMenuShortcut } from "./command-menu.util";
import {
  SHELL_NAVIGATION_ITEMS,
  type ShellNavigationContext,
  type ShellNavigationItem
} from "./shell-navigation.definition";
import { groupShellNavigation } from "./shell-navigation.util";
import { useWorkspaceNavigation } from "./workspace-navigation.provider";
import { NEW_NOTE } from "../features/notes/notes.util";
import { useOrganizationSettingsAccess } from "../features/organizations/organizations.hook";
import { useOrganization } from "../hooks/use-organization";
import { useTranslation } from "../hooks/use-translation";

/** The heading of each tabbed settings page's group, so tabs such as "Data" stay distinct. */
const TAB_GROUP_HEADING_KEYS: Readonly<Record<string, `navigation.${string}`>> = {
  account: "navigation.accountTabs",
  organization: "navigation.organizationTabs"
};

function themeIcon(value: string) {
  if (value === "dark") return Moon;
  return value === "light" ? Sun : Monitor;
}

interface ShellCommandMenuProps {
  navigationContext: ShellNavigationContext;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** The same language and theme controls the sidebar shows. */
  preferences: Pick<NavPreferencesProps, "language" | "theme">;
}

/**
 * The Cmd/Ctrl+K menu of the app shell. Every page change and Organization
 * switch goes through `requestLeave`, so unsaved work still asks first.
 */
export function ShellCommandMenu({
  navigationContext,
  onOpenChange,
  open,
  preferences
}: ShellCommandMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requestLeave } = useWorkspaceNavigation();
  const { activeOrganizationId, organizations, organizationsVisible, setActiveOrganization } =
    useOrganization();
  const { can } = useOrganizationSettingsAccess();

  useEffect(() => {
    const applePlatform = isApplePlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCommandMenuShortcut(event, applePlatform)) return;
      event.preventDefault();
      onOpenChange(!open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  /** Closes the menu first, so the leave confirmation is not hidden behind it. */
  const leaveTo = (action: () => void) => () => {
    onOpenChange(false);
    requestLeave(action);
  };
  const goTo = (href: string) => leaveTo(() => void navigate(href));

  const pages: ShellNavigationItem[] = [
    ...groupShellNavigation(navigationContext).flatMap(({ items }) => items),
    ...SHELL_NAVIGATION_ITEMS.filter((item) => item.group === "account")
  ];
  const tabGroups = pages.flatMap((page): CommandMenuGroup[] => {
    const headingKey = TAB_GROUP_HEADING_KEYS[page.id];
    if (!page.tabs || !headingKey) return [];
    const heading = t(headingKey);
    return [
      {
        heading,
        items: page.tabs
          .filter((tab) => tab.permission === undefined || can(tab.permission))
          .map((tab) => ({
            id: `tab:${page.id}:${tab.segment}`,
            icon: page.icon,
            keywords: [heading, t(page.titleKey)],
            label: t(tab.titleKey),
            onSelect: goTo(`${page.href}/${tab.segment}`)
          }))
      }
    ];
  });

  const otherOrganizations =
    organizationsVisible && organizations.length > 1
      ? organizations.filter((organization) => organization.id !== activeOrganizationId)
      : [];
  const switchHeading = t("navigation.commandMenu.groupSwitchOrganization");

  const groups: CommandMenuGroup[] = [
    {
      heading: t("navigation.commandMenu.groupGoTo"),
      items: pages.map((page) => ({
        id: `page:${page.id}`,
        icon: page.icon,
        label: t(page.titleKey),
        onSelect: goTo(page.href)
      }))
    },
    ...tabGroups,
    {
      heading: t("navigation.commandMenu.groupCreate"),
      items: [
        {
          id: "create:todo",
          icon: ListTodo,
          label: t("navigation.commandMenu.newTodo"),
          onSelect: goTo("/todos")
        },
        {
          id: "create:note",
          icon: NotebookPen,
          label: t("navigation.commandMenu.newNote"),
          onSelect: goTo(`/notes/${NEW_NOTE}`)
        },
        {
          id: "create:chat",
          icon: MessageSquare,
          label: t("navigation.commandMenu.newChat"),
          onSelect: goTo("/assistant")
        }
      ]
    },
    {
      heading: switchHeading,
      items: otherOrganizations.map((organization) => ({
        id: `organization:${organization.id}`,
        icon: Building2,
        keywords: [switchHeading],
        label: organization.name,
        onSelect: leaveTo(() => void setActiveOrganization(organization.id))
      }))
    },
    {
      heading: t("navigation.commandMenu.groupPreferences"),
      items: [
        ...preferences.theme.options.map((option): CommandMenuItem => ({
          id: `theme:${option.value}`,
          icon: themeIcon(option.value),
          keywords: [preferences.theme.label],
          label: option.label,
          onSelect: () => {
            onOpenChange(false);
            preferences.theme.onValueChange(option.value);
          }
        })),
        ...preferences.language.options.map((option): CommandMenuItem => ({
          id: `language:${option.value}`,
          icon: Languages,
          keywords: [preferences.language.label],
          label: option.label,
          onSelect: () => {
            onOpenChange(false);
            preferences.language.onValueChange(option.value);
          }
        }))
      ]
    }
  ];

  return (
    <CommandMenu
      emptyLabel={t("navigation.commandMenu.empty")}
      groups={groups}
      label={t("navigation.commandMenu.label")}
      onOpenChange={onOpenChange}
      open={open}
      placeholder={t("navigation.commandMenu.placeholder")}
    />
  );
}
