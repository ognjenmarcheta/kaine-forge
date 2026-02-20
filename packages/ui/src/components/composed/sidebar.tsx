import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode
} from "react";

import { cn } from "../../lib/cn";

const DEFAULT_SIDEBAR_STORAGE_KEY = "kaine.sidebar.open";

interface ResolveSidebarOpenFromStorageInput {
  defaultOpen: boolean;
  storageValue: string | null;
}

interface SidebarContextValue {
  open: boolean;
  setOpen: (value: boolean) => void;
  storageKey: string;
  toggle: () => void;
}

interface SidebarProviderProps {
  children: ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
}

interface SidebarProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

interface SidebarMenuButtonClassNameInput {
  className?: string;
  isActive?: boolean;
}

interface SidebarMenuButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function resolveSidebarOpenFromStorage({
  defaultOpen,
  storageValue
}: ResolveSidebarOpenFromStorageInput): boolean {
  if (storageValue === "1") {
    return true;
  }

  if (storageValue === "0") {
    return false;
  }

  return defaultOpen;
}

export function resolveSidebarClassName(open: boolean, className?: string): string {
  return cn("ui-sidebar", open ? null : "ui-sidebar--collapsed", className);
}

export function resolveSidebarMenuButtonClassName({
  className,
  isActive = false
}: SidebarMenuButtonClassNameInput): string {
  return cn(
    "ui-sidebar__menu-button",
    isActive ? "ui-sidebar__menu-button--active" : null,
    className
  );
}

export function SidebarProvider({
  children,
  defaultOpen = true,
  storageKey = DEFAULT_SIDEBAR_STORAGE_KEY
}: SidebarProviderProps) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") {
      return defaultOpen;
    }

    return resolveSidebarOpenFromStorage({
      defaultOpen,
      storageValue: window.localStorage.getItem(storageKey)
    });
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(storageKey, open ? "1" : "0");
  }, [open, storageKey]);

  const toggle = useCallback(() => {
    setOpen((current) => !current);
  }, []);

  const value = useMemo<SidebarContextValue>(
    () => ({
      open,
      setOpen,
      storageKey,
      toggle
    }),
    [open, setOpen, storageKey, toggle]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const value = useContext(SidebarContext);

  if (!value) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }

  return value;
}

export function Sidebar({ children, className, ...props }: SidebarProps) {
  const { open } = useSidebar();

  return (
    <aside
      className={resolveSidebarClassName(open, className)}
      data-state={open ? "expanded" : "collapsed"}
      {...props}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ui-sidebar__header", className)} {...props}>
      {children}
    </div>
  );
}

export function SidebarContent({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ui-sidebar__content", className)} {...props}>
      {children}
    </div>
  );
}

export function SidebarFooter({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ui-sidebar__footer", className)} {...props}>
      {children}
    </div>
  );
}

export function SidebarGroup({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={cn("ui-sidebar__group", className)} {...props}>
      {children}
    </section>
  );
}

export function SidebarGroupLabel({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <h2 className={cn("ui-sidebar__group-label", className)} {...props}>
      {children}
    </h2>
  );
}

export function SidebarGroupContent({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ui-sidebar__group-content", className)} {...props}>
      {children}
    </div>
  );
}

export function SidebarMenu({ children, className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className={cn("ui-sidebar__menu", className)} {...props}>
      {children}
    </ul>
  );
}

export function SidebarMenuItem({ children, className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return (
    <li className={cn("ui-sidebar__menu-item", className)} {...props}>
      {children}
    </li>
  );
}

export function SidebarMenuButton({ className, isActive, ...props }: SidebarMenuButtonProps) {
  return (
    <button
      className={resolveSidebarMenuButtonClassName({ className, isActive })}
      type="button"
      {...props}
    />
  );
}

export function SidebarTrigger({ children, className, onClick, ...props }: SidebarMenuButtonProps) {
  const { open, toggle } = useSidebar();

  return (
    <button
      aria-label="Toggle sidebar"
      className={cn("ui-sidebar__trigger", className)}
      type="button"
      onClick={(event) => {
        toggle();
        onClick?.(event);
      }}
      {...props}
    >
      {children ?? (open ? "<<" : ">>")}
    </button>
  );
}

export function SidebarRail({ className, onClick, ...props }: SidebarMenuButtonProps) {
  const { toggle } = useSidebar();

  return (
    <button
      aria-label="Resize sidebar"
      className={cn("ui-sidebar__rail", className)}
      type="button"
      onClick={(event) => {
        toggle();
        onClick?.(event);
      }}
      {...props}
    />
  );
}

export function SidebarInset({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ui-sidebar__inset", className)} {...props}>
      {children}
    </div>
  );
}
