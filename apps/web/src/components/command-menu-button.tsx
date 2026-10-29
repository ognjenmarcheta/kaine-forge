import { SearchTrigger, useApplePlatform } from "@repo/ui";

import { useTranslation } from "../hooks/use-translation";

/** The header's search-style button that opens the command menu; an icon alone on a phone. */
export function CommandMenuButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const applePlatform = useApplePlatform();
  const trigger = {
    appearance: "subtle",
    "aria-keyshortcuts": applePlatform ? "Meta+K" : "Control+K",
    label: t("navigation.commandMenu.open"),
    onClick: onOpen,
    spacing: "compact"
  } as const;

  // CSS picks the form, so the first paint is right: the magnifier alone below md, where the
  // header has no room for the label and the shortcut hint.
  return (
    <>
      <SearchTrigger {...trigger} className="md:hidden" show="icon" />
      <SearchTrigger
        {...trigger}
        className="hidden md:inline-flex"
        shortcut={{
          apple: t("navigation.commandMenu.shortcutMac"),
          other: t("navigation.commandMenu.shortcutOther")
        }}
      />
    </>
  );
}
