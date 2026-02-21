import type { ReactNode } from "react";

interface HeaderProps {
  left: ReactNode;
  right: ReactNode;
}

export function Header({ left, right }: HeaderProps) {
  return (
    <header className="ui-header">
      <div className="ui-header__left min-w-0">{left}</div>
      <div className="ui-header__right flex-wrap justify-end">{right}</div>
    </header>
  );
}
