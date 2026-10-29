import { ChevronsUpDown, CircleUser, LogOut, MoreVertical } from "lucide-react";

import { cn } from "../../lib/cn";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  type AvatarFallbackProps
} from "../primitives/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../primitives/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "../primitives/sidebar";

export interface NavUserData {
  avatar?: string;
  email: string;
  name: string;
  /** A role line, such as "Head nurse", shown under the name in place of the email. The menu still shows the email. */
  role?: string;
}

export interface NavUserProps {
  /** A menu item above log out, such as a link to the account page. */
  accountItem?: { label: string; onSelect: () => void };
  /** The fill behind the initials, from the `AvatarFallback` tones. Defaults to `neutral`. */
  avatarTone?: AvatarFallbackProps["tone"];
  className?: string;
  logoutLabel: string;
  onLogout: () => void;
  /** A dot on the avatar, such as "Online" in `success`. Its label joins the button's name (COLOR-2). */
  status?: { label: string; tone: "danger" | "neutral" | "success" | "warning" };
  /** The icon at the end of the button: `dots` (default) for a menu, `chevrons` for a switcher look. */
  trailingIcon?: "chevrons" | "dots";
  user: NavUserData;
}

const statusFills = {
  danger: "bg-ds-bg-danger-bold",
  neutral: "bg-ds-bg-neutral-bold",
  success: "bg-ds-bg-success-bold",
  warning: "bg-ds-bg-warning-bold"
} as const;

export function resolveNavUserInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return "U";
  }

  const parts = trimmed.split(/\s+/);
  // A leading title such as "Dr." or "Prof." is not part of the name; an initial such as "J." is.
  while (parts.length > 1 && /^\p{L}{2,}\.$/u.test(parts[0] ?? "")) {
    parts.shift();
  }
  const first = parts[0]?.charAt(0) ?? "";
  const second = parts[1]?.charAt(0) ?? "";
  return `${first}${second || ""}`.toUpperCase();
}

export function NavUser({
  accountItem,
  avatarTone = "neutral",
  className,
  logoutLabel,
  onLogout,
  status,
  trailingIcon = "dots",
  user
}: NavUserProps) {
  const { isMobile } = useSidebar();
  const initials = resolveNavUserInitials(user.name);
  const TrailingIcon = trailingIcon === "chevrons" ? ChevronsUpDown : MoreVertical;

  return (
    <SidebarMenu className="w-full">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Named by its visible text (initials, name, email); see WCAG 2.5.3 (#545). */}
            <SidebarMenuButton className={className} size="lg">
              {/* With a status dot the avatar does not clip, so the dot can sit on its corner. */}
              <Avatar className={cn("h-8 w-8 rounded-lg", status && "overflow-visible")}>
                {user.avatar ? (
                  <AvatarImage alt={user.name} className="rounded-lg" src={user.avatar} />
                ) : null}
                <AvatarFallback className="rounded-lg" tone={avatarTone}>
                  {initials}
                </AvatarFallback>
                {status ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute -bottom-ds-025 -end-ds-025 size-ds-100 rounded-full ring-2 ring-ds-surface-sunken",
                      statusFills[status.tone]
                    )}
                  />
                ) : null}
              </Avatar>
              <div className="grid flex-1 min-w-0 text-left text-body leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-body-sm text-ds-text-subtle">
                  {user.role ?? user.email}
                </span>
                {status ? <span className="sr-only">{status.label}</span> : null}
              </div>
              <TrailingIcon aria-hidden className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-body">
                <Avatar className="h-8 w-8 rounded-lg">
                  {user.avatar ? <AvatarImage alt={user.name} src={user.avatar} /> : null}
                  <AvatarFallback className="rounded-lg" tone={avatarTone}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 min-w-0 text-left text-body leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-body-sm text-ds-text-subtle">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {accountItem ? (
              <DropdownMenuItem onSelect={accountItem.onSelect}>
                <CircleUser />
                {accountItem.label}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem destructive onSelect={onLogout}>
              <LogOut />
              {logoutLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
