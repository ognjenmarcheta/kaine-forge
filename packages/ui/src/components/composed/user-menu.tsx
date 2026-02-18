import { Button } from "../primitives/button";

interface UserMenuProps {
  displayName: string;
  logoutLabel: string;
  onLogout: () => void;
}

export function UserMenu({ displayName, logoutLabel, onLogout }: UserMenuProps) {
  return (
    <div className="ui-user-menu">
      <span className="ui-user-menu__name">{displayName}</span>
      <Button intent="subtle" size="sm" type="button" onClick={onLogout}>
        {logoutLabel}
      </Button>
    </div>
  );
}
