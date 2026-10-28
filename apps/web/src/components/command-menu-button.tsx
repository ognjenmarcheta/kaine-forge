import { Button, Search } from "@repo/ui";
import { useState } from "react";

import { isApplePlatform } from "./command-menu.util";
import { useTranslation } from "../hooks/use-translation";

/** The header's search-style button that opens the command menu; an icon alone on a phone. */
export function CommandMenuButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const [applePlatform] = useState(isApplePlatform);

  return (
    <Button
      appearance="subtle"
      aria-keyshortcuts={applePlatform ? "Meta+K" : "Control+K"}
      className="gap-ds-100 text-ds-text-subtle"
      onClick={onOpen}
      spacing="compact"
      type="button"
    >
      <Search aria-hidden="true" className="size-4" />
      <span className="sr-only md:not-sr-only">{t("navigation.commandMenu.open")}</span>
      <kbd aria-hidden="true" className="ui-command-menu__kbd hidden md:inline">
        {t(
          applePlatform
            ? "navigation.commandMenu.shortcutMac"
            : "navigation.commandMenu.shortcutOther"
        )}
      </kbd>
    </Button>
  );
}
