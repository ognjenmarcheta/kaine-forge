"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeftIcon } from "lucide-react";
import { Slot } from "radix-ui";
import * as React from "react";

import { Input } from "./input";
import { Separator } from "./separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./sheet";
import { Skeleton } from "./skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { useIsMobile } from "../../hooks/use-mobile";
import { cn } from "../../lib/cn";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);

  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;

      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }

      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open]
  );

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((nextOpen) => !nextOpen) : setOpen((nextOpen) => !nextOpen);
  }, [isMobile, setOpen, setOpenMobile]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            // SAFETY: `--*` custom properties are valid inline styles at
            // runtime; React.CSSProperties has no index signature for them.
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style
            } as React.CSSProperties
          }
          className={cn(
            "group/sidebar-wrapper has-data-[variant=inset]:bg-ds-surface-sunken flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

type SidebarSurface = "default" | "raised" | "sunken";

const SIDEBAR_SURFACE_CLASS: Record<SidebarSurface, string> = {
  default: "bg-ds-surface",
  raised: "bg-ds-surface-raised",
  sunken: "bg-ds-surface-sunken"
};

type SidebarProps = React.ComponentProps<"div"> & {
  collapsible?: "offcanvas" | "icon" | "none";
  /**
   * Names a navigation landmark that holds the whole sidebar, so its header and footer are not
   * outside every landmark. Give it for a sidebar of links; AppSidebar has its own.
   */
  label?: string;
  mobileSheetCloseLabel?: string;
  mobileSheetDescription?: string;
  mobileSheetTitle?: string;
  side?: "left" | "right";
  /** The panel's fill: `sunken` (the default), the page's `default`, or `raised`. */
  surface?: SidebarSurface;
  variant?: "sidebar" | "floating" | "inset";
};

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  label,
  mobileSheetCloseLabel,
  mobileSheetDescription,
  mobileSheetTitle,
  surface = "sunken",
  className,
  children,
  ...props
}: SidebarProps) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
  const content =
    label === undefined ? (
      children
    ) : (
      <nav aria-label={label} className="flex min-h-0 flex-1 flex-col">
        {children}
      </nav>
    );

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          SIDEBAR_SURFACE_CLASS[surface],
          "text-ds-text flex h-full w-(--sidebar-width) flex-col",
          className
        )}
        {...props}
      >
        {content}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          {...(mobileSheetCloseLabel ? { closeLabel: mobileSheetCloseLabel } : {})}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className={cn(
            SIDEBAR_SURFACE_CLASS[surface],
            "text-ds-text w-(--sidebar-width) p-0 [&>button]:hidden",
            className
          )}
          style={
            // SAFETY: `--*` custom properties are valid inline styles at
            // runtime; React.CSSProperties has no index signature for them.
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            {mobileSheetTitle ? <SheetTitle>{mobileSheetTitle}</SheetTitle> : null}
            {mobileSheetDescription ? (
              <SheetDescription>{mobileSheetDescription}</SheetDescription>
            ) : null}
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer text-ds-text hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-drawer ease-standard",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-drawer ease-standard md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className={cn(
            SIDEBAR_SURFACE_CLASS[surface],
            "group-data-[variant=floating]:border-ds-border flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-raised"
          )}
        >
          {content}
        </div>
      </div>
    </div>
  );
}

/** Opens and closes the sidebar. `children` replaces the panel icon, such as a chevron that turns with the state. */
function SidebarTrigger({
  children,
  className,
  label,
  onClick,
  ...props
}: React.ComponentProps<"button"> & { label?: string }) {
  const { toggleSidebar } = useSidebar();

  return (
    // eslint-disable-next-line no-restricted-syntax -- Utility-only shadcn trigger styles must not inherit legacy Button classes.
    <button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      type="button"
      className={cn(
        "text-ds-text ring-ds-border-focused hover:bg-ds-bg-neutral-hovered hover:text-ds-text inline-flex size-7 items-center justify-center rounded-md p-0 outline-hidden transition-colors focus-visible:ring-2",
        className
      )}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      {children ?? <PanelLeftIcon className="size-4" />}
      {label ? <span className="sr-only">{label}</span> : null}
    </button>
  );
}

function SidebarRail({
  className,
  label,
  onClick,
  ...props
}: React.ComponentProps<"button"> & { label?: string }) {
  const { toggleSidebar } = useSidebar();

  return (
    // eslint-disable-next-line no-restricted-syntax -- Utility-only shadcn rail styles must not inherit legacy Button classes.
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label={label}
      tabIndex={-1}
      title={label}
      type="button"
      className={cn(
        "hover:after:bg-ds-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 border-0 bg-transparent p-0 transition-transform ease-standard group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "hover:group-data-[collapsible=offcanvas]:bg-ds-surface-sunken group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      onClick={(event) => {
        toggleSidebar();
        onClick?.(event);
      }}
      {...props}
    />
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "bg-ds-bg relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-raised md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  );
}

function SidebarInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("bg-ds-bg h-8 w-full", className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("bg-ds-border mx-2 w-auto data-[orientation=horizontal]:w-auto", className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  );
}

/** Sets the id of a child part, such as a label, on its parent part. */
type RegisterId = (id: string | undefined) => void;

/** Gives `id` to the parent part while this part is mounted. */
function useRegisterId(register: RegisterId | undefined, id: string) {
  React.useLayoutEffect(() => {
    if (register === undefined) return undefined;
    register(id);
    return () => register(undefined);
  }, [register, id]);
}

const SidebarGroupLabelContext = React.createContext<RegisterId | undefined>(undefined);

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  // A group with a label is a group named by it (WCAG 2.2 SC 1.3.1); one without stays a plain div.
  const [labelId, setLabelId] = React.useState<string>();

  return (
    <SidebarGroupLabelContext.Provider value={setLabelId}>
      <div
        data-slot="sidebar-group"
        data-sidebar="group"
        {...(labelId === undefined ? {} : { role: "group", "aria-labelledby": labelId })}
        className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
        {...props}
      />
    </SidebarGroupLabelContext.Provider>
  );
}

function SidebarGroupLabel({
  className,
  asChild = false,
  id,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";
  const generatedId = React.useId();
  const labelId = id ?? generatedId;
  useRegisterId(React.useContext(SidebarGroupLabelContext), labelId);

  return (
    <Comp
      id={labelId}
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "text-ds-text-subtle ring-ds-border-focused flex h-8 shrink-0 items-center rounded-md px-2 text-body-sm font-medium outline-hidden transition-[margin,opacity] duration-drawer ease-standard focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  );
}

function SidebarGroupAction({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        "text-ds-text ring-ds-border-focused hover:bg-ds-bg-neutral-hovered hover:text-ds-text absolute top-ds-150 right-3 flex aspect-square w-ds-control-xsmall items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  );
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-body", className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

interface SidebarMenuItemContextProps {
  badgeId: string | undefined;
  setBadgeId: RegisterId;
}

const SidebarMenuItemContext = React.createContext<SidebarMenuItemContextProps | null>(null);

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  const [badgeId, setBadgeId] = React.useState<string>();
  const item = React.useMemo(() => ({ badgeId, setBadgeId }), [badgeId]);

  return (
    <SidebarMenuItemContext.Provider value={item}>
      <li
        data-slot="sidebar-menu-item"
        data-sidebar="menu-item"
        className={cn("group/menu-item relative", className)}
        {...props}
      />
    </SidebarMenuItemContext.Provider>
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-body outline-hidden ring-ds-border-focused hover:bg-ds-bg-neutral-hovered hover:text-ds-text focus-visible:ring-2 active:bg-ds-bg-neutral-hovered active:text-ds-text disabled:pointer-events-none disabled:text-ds-text-disabled group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:text-ds-text-disabled data-[active=true]:bg-ds-bg-selected data-[active=true]:font-medium data-[active=true]:text-ds-text-selected data-[active=true]:shadow-[inset_var(--ds-border-width-selected)_0_0_var(--ds-border-selected)] data-[active=true]:hover:bg-ds-bg-selected data-[active=true]:hover:text-ds-text-selected data-[state=open]:hover:bg-ds-bg-neutral-hovered data-[state=open]:hover:text-ds-text group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-ds-bg-neutral-hovered hover:text-ds-text",
        // The current item takes a neutral fill and no start indicator, for a sidebar whose
        // brand color is not the selection color.
        neutral:
          "hover:bg-ds-bg-neutral-hovered hover:text-ds-text data-[active=true]:bg-ds-bg-neutral data-[active=true]:text-ds-text data-[active=true]:shadow-none data-[active=true]:hover:bg-ds-bg-neutral-hovered data-[active=true]:hover:text-ds-text",
        // The current item is brand text and icon on the neutral fill, with no start indicator.
        brand:
          "hover:bg-ds-bg-neutral-hovered hover:text-ds-text data-[active=true]:bg-ds-bg-neutral data-[active=true]:text-ds-text-brand data-[active=true]:shadow-none data-[active=true]:hover:bg-ds-bg-neutral data-[active=true]:hover:text-ds-text-brand data-[active=true]:[&>svg]:text-current",
        outline:
          "bg-ds-bg shadow-[0_0_0_1px_var(--ds-border)] hover:bg-ds-bg-neutral-hovered hover:text-ds-text hover:shadow-[0_0_0_1px_var(--ds-background-neutral-hovered)]"
      },
      size: {
        default: "h-8 text-body",
        sm: "h-7 text-body-sm",
        lg: "h-12 text-body group-data-[collapsible=icon]:p-0!"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string | React.ComponentProps<typeof TooltipContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot.Root : "button";
  const { isMobile, state } = useSidebar();
  // A badge beside the button, such as a count, describes it: it sits outside the link's name.
  const badgeId = React.useContext(SidebarMenuItemContext)?.badgeId;
  // The tooltip shows only on the collapsed desktop rail. Hidden, it must not open either: an
  // open tooltip is the top layer and takes the first Escape, such as in the phone sheet.
  const tooltipHidden = state !== "collapsed" || isMobile;
  const [tooltipOpen, setTooltipOpen] = React.useState(false);

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      {...(badgeId === undefined ? {} : { "aria-describedby": badgeId })}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  );

  if (!tooltip) {
    return button;
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip
    };
  }

  return (
    <Tooltip open={!tooltipHidden && tooltipOpen} onOpenChange={setTooltipOpen}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" align="center" hidden={tooltipHidden} {...tooltip} />
    </Tooltip>
  );
}

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  showOnHover?: boolean;
}) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        // Centered on its row at the end, as the badge is, with no state variants of the link.
        "text-ds-text ring-ds-border-focused hover:bg-ds-bg-neutral-hovered hover:text-ds-text absolute end-1 top-1/2 flex aspect-square w-ds-control-xsmall -translate-y-1/2 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 md:after:hidden",
        "group-has-data-[sidebar=menu-sub]/menu-item:top-ds-200",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  );
}

function SidebarMenuBadge({ className, id, ...props }: React.ComponentProps<"div">) {
  const generatedId = React.useId();
  const badgeId = id ?? generatedId;
  useRegisterId(React.useContext(SidebarMenuItemContext)?.setBadgeId, badgeId);

  return (
    <div
      id={badgeId}
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        // Centered on its row at the end, with no state variants, so a caller's end-*, top-*, and
        // text color hold whatever the state of the link.
        "text-ds-text pointer-events-none absolute end-1 top-1/2 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-md px-1 text-body-sm font-medium tabular-nums select-none",
        // An item that holds a submenu is taller than its link: center on a default-size link.
        "group-has-data-[sidebar=menu-sub]/menu-item:top-ds-200",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  );
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean;
}) {
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  }, []);

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon ? (
        <Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />
      ) : null}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          // SAFETY: `--*` custom properties are valid inline styles at
          // runtime; React.CSSProperties has no index signature for them.
          {
            "--skeleton-width": width
          } as React.CSSProperties
        }
      />
    </div>
  );
}

const SidebarMenuSubTreeContext = React.createContext(false);

function SidebarMenuSub({
  className,
  tree = false,
  ...props
}: React.ComponentProps<"ul"> & {
  /** Draws tree lines: the rail ends at the last item, and a branch reaches each item. */
  tree?: boolean;
}) {
  return (
    <SidebarMenuSubTreeContext.Provider value={tree}>
      <ul
        data-slot="sidebar-menu-sub"
        data-sidebar="menu-sub"
        className={cn(
          "border-ds-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
          // Each item draws its piece of the rail instead.
          tree && "border-transparent",
          "group-data-[collapsible=icon]:hidden",
          className
        )}
        {...props}
      />
    </SidebarMenuSubTreeContext.Provider>
  );
}

function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<"li">) {
  const tree = React.useContext(SidebarMenuSubTreeContext);

  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn(
        "group/menu-sub-item relative",
        // On the list's rail line: from above the item, past the gap, down to a rounded branch at
        // its middle. The next item's piece continues the rail, so the last one ends in an elbow.
        tree &&
          "before:border-ds-border before:absolute before:start-[calc(-1*(--spacing(2.5))-1px)] before:top-[calc(-50%-var(--ds-space-100))] before:bottom-1/2 before:w-ds-100 before:rounded-es-sm before:border-s before:border-b first:before:top-0",
        className
      )}
      {...props}
    />
  );
}

function SidebarMenuSubButton({
  asChild = false,
  size = "md",
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean;
  size?: "sm" | "md";
  isActive?: boolean;
}) {
  const Comp = asChild ? Slot.Root : "a";

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "text-ds-text ring-ds-border-focused hover:bg-ds-bg-neutral-hovered hover:text-ds-text active:bg-ds-bg-neutral-hovered active:text-ds-text [&>svg]:text-ds-text flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:text-ds-text-disabled aria-disabled:pointer-events-none aria-disabled:text-ds-text-disabled [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        "data-[active=true]:bg-ds-bg-neutral-hovered data-[active=true]:text-ds-text",
        size === "sm" && "text-body-sm",
        size === "md" && "text-body",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar
};
