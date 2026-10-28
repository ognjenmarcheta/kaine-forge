import { Command, defaultFilter } from "cmdk";
import { SearchIcon, type LucideIcon } from "lucide-react";
import { Dialog } from "radix-ui";

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
 * times a day, so it has no open or close animation.
 */
export function CommandMenu({
  emptyLabel,
  groups,
  label,
  onOpenChange,
  open,
  placeholder
}: CommandMenuProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-command-menu__overlay" />
        <Dialog.Content aria-describedby={undefined} className="ui-command-menu">
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
                        onSelect={item.onSelect}
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
