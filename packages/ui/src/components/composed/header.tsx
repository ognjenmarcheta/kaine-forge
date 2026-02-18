import type { ReactNode } from "react";

interface HeaderProps {
  left: ReactNode;
  right: ReactNode;
}

export function Header({ left, right }: HeaderProps) {
  return (
    <header className="ui-header">
      <div className="ui-header__left">{left}</div>
      <div className="ui-header__right">{right}</div>
    </header>
  );
}
