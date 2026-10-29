import { Command, defaultFilter } from "cmdk";
import { SearchIcon, type LucideIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useRef, useState } from "react";

export interface CommandMenuItem {
  /** Unique within the menu; never matched by the search. */
  id: string;
  icon?: LucideIcon;
  /** More words the search matches, for example the group the item belongs to. */
  keywords?: string[];
  label: string;
  onSelect: () => void;
  shortcut?: string;
}

export interface CommandMenuGroup {
  heading: string;
  items: CommandMenuItem[];
}

export interface CommandMenuProps {
  emptyLabel: string;
  groups: CommandMenuGroup[];
  /** The dialog's accessible name. */
  label: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  placeholder: string;
}

/**
 * Ranks an item by its label first and its keywords after; the label travels
 * as the first keyword because the cmdk value holds the item id.
 */
function filterByLabel(_value: string, search: string, keywords?: string[]): number {
  const [label = "", ...aliases] = keywords ?? [];
  return defaultFilter(label, search, aliases);
}

/**
 * A searchable list of commands in a dialog. It opens from the keyboard many
 * times a day, so it has no open or close animation. When it closes, focus goes
 * back to the element that had it when the menu opened (A11Y-4). Picking a
 * command closes the menu and gives focus back first, then runs the command, so
 * a command can open a dialog or move focus.
 */
export function CommandMenu({
  emptyLabel,
  groups,
  label,
  onOpenChange,
  open,
  placeholder
}: CommandMenuProps) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const pickedCommand = useRef<(() => void) | null>(null);
  // True from a pick until the command has run; the menu is hidden in between.
  const [picked, setPicked] = useState(false);

  useEffect(() => {
    if (!picked) return;
    // The menu no longer traps focus here, so the opener takes it back before the command runs:
    // a dialog that the command opens returns focus to the opener, and a focus move stays.
    if (returnFocus.current?.isConnected) returnFocus.current.focus();
    const command = pickedCommand.current;
    pickedCommand.current = null;
    setPicked(false);
    onOpenChange(false);
    command?.();
  }, [onOpenChange, picked]);

  return (
    <Dialog.Root open={open && !picked} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-command-menu__overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className="ui-command-menu"
          onOpenAutoFocus={() => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            // The menu is controlled and has no Radix Trigger to restore focus to. It restores
            // focus only when focus left with it: a dialog or a field focused since keeps it.
            event.preventDefault();
            const focused = document.activeElement;
            if (focused !== null && focused !== document.body) return;
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
          }}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <Command filter={filterByLabel} label={label} loop vimBindings={false}>
            <div className="ui-command-menu__search">
              <SearchIcon aria-hidden="true" className="ui-command-menu__icon" />
              <Command.Input className="ui-command-menu__input" placeholder={placeholder} />
            </div>
            <Command.List className="ui-command-menu__list">
              <Command.Empty className="ui-command-menu__empty">{emptyLabel}</Command.Empty>
              {groups
                .filter((group) => group.items.length > 0)
                .map((group) => (
                  <Command.Group
                    key={group.heading}
                    className="ui-command-menu__group"
                    heading={group.heading}
                  >
                    {group.items.map(({ icon: Icon, ...item }) => (
                      <Command.Item
                        key={item.id}
                        className="ui-command-menu__item"
                        keywords={[item.label, ...(item.keywords ?? [])]}
                        onSelect={() => {
                          pickedCommand.current = item.onSelect;
                          setPicked(true);
                        }}
                        value={item.id}
                      >
                        {Icon ? (
                          <Icon aria-hidden="true" className="ui-command-menu__icon" />
                        ) : null}
                        <span className="ui-command-menu__label">{item.label}</span>
                        {item.shortcut ? (
                          <kbd className="ui-command-menu__kbd">{item.shortcut}</kbd>
                        ) : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
