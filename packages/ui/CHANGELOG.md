# @repo/ui

## 2.0.0

### Major Changes

- e64ae54: Themes are now data in the new `@repo/theme` package. Byte Forge stays the default with unchanged colors, and Moss is an example custom theme. `pnpm theme:build` writes the web tokens and utilities, the mobile tokens, the NativeWind preset tokens, and each theme's `DESIGN.md`. It fails when a theme misses WCAG 2.2 AA contrast or the 24px target size. `createTheme` derives a full theme from a brand color, a neutral tint, fonts, density, and depth. `pnpm ui:check` runs the accessibility and UI lint rules, and `pnpm lab` previews themes and components.

  Breaking changes:

  - `@repo/ui`: the web gets theme utilities (`bg-ds-surface-raised`, `p-ds-200`, `text-body`, `rounded-card`, `shadow-card`), and the default Tailwind palette, font sizes, radii, and shadows generate no CSS. Replace `text-sm` with `text-body`, `text-xs` with `text-body-sm`, and `bg-[var(--ds-*)]` with the matching utility.
  - `@repo/ui` and `@repo/config`: 127 unused tokens are removed, including the accent hues and the attention, severe, open, closed, and done families. `--ds-lineHeight-*` is renamed `--ds-line-height-*`, and the `--ds-base-*` tier is gone.
  - The root element now carries `data-color-mode="light|dark"`, and `data-theme` names the theme. The Tailwind `dark:` variant follows `data-color-mode`.
  - `@repo/mobile-ui`: `nativeThemeTokens` is keyed by theme name, and the `fontFamilies` export is removed. Wrap the app in `ThemeRoot` and read colors with `useThemeTokens()`.
  - `@repo/translation`: `navigation.theme*` and `desk.prefs.theme*` are now `navigation.appearance*` and `desk.prefs.appearance*`, and the label reads "Appearance".
  - `@repo/ui`: `AvatarGroup` requires an `aria-label`, and with `max` an `overflowLabel`.

  New components: `Table`, `SegmentedControl`, `Kbd`, `ProportionBar`, and the charts `LineChart`, `BarChart`, `DonutChart`, `RadialProgress`, and `Sparkline` in `@repo/ui`; `ProgressBar`, `DonutChart`, and `BarChart` in `@repo/mobile-ui`. Chart series take a fixed `color` (a chart slot, a role, or `"neutral"`), and the charts add dashed lines, reference lines, value labels, a highlighted bar, legend positions, and hidden axes.

  Shared components gain what designs kept rebuilding. `Button` has `appearance="outline"` and `spacing="icon"`. `CardTitle` takes `as`. `StatCard` takes any value node, an `icon`, a `delta` badge, a `description`, and an `action`. `Checkbox` draws the indeterminate state and has a 24px hit area. `Banner` has `emphasis="subtle"`, and it is a polite `status` unless `urgent`. `Table` scrolls by keyboard when it overflows and takes `scrollLabel`. `AppSidebar` holds its parts in one navigation landmark named by `label`. `CommandMenu` returns focus to where it opened. Web fields and selects are 40px high.

  The `@repo/ui` CSS now sits in cascade layers, so a utility in `className` wins over a component's own CSS. The new `ui/no-reset-default` lint rule reports Tailwind defaults that the theme removes, such as `rounded`, `text-sm`, and `bg-red-500`, and the motion tokens are used through `duration-*` and `ease-standard` instead of arbitrary values.

  A second round added `appearance="raised"` on `Button`, `FilterMenu`, `CardAction`, `TopNav`, `StatCard` part slots and a `visual` slot, `AvatarFallback` tones, `PageHeader size="display"`, `CopyButton labelSuffix`, chart dots, annotations, gradient areas, bar tracks, horizontal bars and highlight colors, a colored `RadialProgress`, and `Gauge`. A focus ring no longer fades in, a labelled sidebar group is a named group, a sidebar count describes its link, and the contrast check now covers role borders, chart colors, and raised fills on cards and sunken areas.

  Themes gain a `display` type step (`text-display`), per-step `type` changes and a `color.darkSurface` lightness in `createTheme`, and the motion utilities `duration-control`, `duration-overlay`, `duration-drawer`, and `ease-standard`. In dark mode, derived cards sit one step above the page and sunken areas one step below it, and the contrast check also measures text, charts, and role borders on cards and sunken areas. Field borders now reach 3:1 against the surface, and the email fallback link now reaches 4.5:1.

### Minor Changes

- e64ae54: Each chart color has a tint and a text color, for category tiles, tags, and avatars.

  - Twelve color roles: `background-chart-1` to `background-chart-6`, a pale fill in each chart color's hue (`bg-ds-bg-chart-N`), and `text-chart-1` to `text-chart-6`, its text color (`text-ds-text-chart-N`). They reach web, mobile, and NativeWind like every role.
  - `createTheme` derives them from the final chart colors, so a theme that sets its own chart colors keeps its tints in step. A tint the theme sets wins, and its text color is derived against it. `createCategoryColors` derives them for a theme built by hand.
  - `contrastPairs` adds 36 pairs, which lab themes pass too: ink, `text-subtle`, and the text color on each tint, and each text color on the page, cards, and sunken areas. The chart color is not measured on its tint, so a theme can set a mid-tone pastel; an icon or a mark on a tint takes the text color.
  - `AvatarFallback`'s chart tones draw the tint with its text color, not the chart color at 20% with ink.
  - A `PlotFill` of `{ type: "tint", color: "chart-N" }` paints a mark in the tint, such as a bar that carries ink text. `RadialProgress`'s `fill` draws a chart slot's tint.

- e64ae54: The last small component options that designs had to restyle by hand.

  - `SidebarMenuButton` takes `variant="brand"`: the current link in brand text and icon on the neutral fill, with no start indicator.
  - `CardAction` takes `wrap={false}`, which keeps a short action, such as a period pill, on the title row in a narrow `@container/card`.
  - Every theme now passes brand text on the neutral fill (`text-brand` on `background-neutral`, 4.5:1), the pair the brand variant draws.

- e64ae54: More component options that designs had to restyle by hand.

  - `SearchTrigger` takes `show="icon"`: only the magnifier in a square button, with the label as its hidden name and no shortcut hint.
  - `AppSidebar` takes `headerClassName` and `footerClassName`, after their own padding.
  - A `StatCard` `delta` takes `appearance="icon"`: a round tinted chip with only the icon, and the change read, not shown.
  - `SegmentedControl` takes `appearance="brand"` for a bold brand surface. Its items keep 4.5:1 at rest, on hover, and chosen.
  - `SidebarMenuAction` centers on its row at the logical end with no state variants of its link, as `SidebarMenuBadge` does. An action that set `right-*` or a `peer-data-[size=…]` top now needs only `end-*`.

- e64ae54: Component options that designs had to restyle by hand.

  - `FilterMenu` takes `iconPlacement="end"`, which puts the icon after the text, before any chevron.
  - `StatCard` takes `iconPlacement="top"`, the icon on its own row above the label with the action at its end, and `deltaPlacement="end"`, the description and then the change at the end of the value's line.
  - `SidebarTrigger` draws its children in place of the panel icon.
  - `SidebarMenuBadge` centers on its row at the logical end, with no state variants, so a caller's `end-*`, `top-*`, and text color hold on hover and on the current link. In an item that holds a submenu, it centers on a default-size link. A badge that set `right-*` or `top-*` for a centered count now needs only `end-*`.

- e64ae54: Common composed parts take the options that designs rebuilt locally. Every option is opt-in, so current screens render as before.

  - `StatCard`: a `delta` takes `appearance="text"` and an `icon` (`null` for none). `deltaPlacement="below"`, `iconPlacement` (`start`, `end`, `leading`), and `wrap={false}` set the layout.
  - `TopNav`: `appearance="filled"`, `itemWidth="equal"`, and `size` (`medium`, `large`, `xlarge`).
  - `FilterMenu`: `show="label"`, `chevron={false}`, `size`, `width="widest"`, and `multiple` for checkboxes.
  - `Badge`: `emphasis="outline"` and `appearance="selected"`.
  - `Avatar`: sizes 28, 36, and 44. `AvatarFallback` takes the `chart-1` to `chart-6` tones. `AvatarGroup` takes `overlap="sm"` and `overflowTone`.
  - `Card`: `CardIcon` puts an icon well before the title. In a card marked `@container/card`, `CardAction` moves under the title when the card is narrow.
  - `NavUser`: `user.role`, `avatarTone`, a `status` dot, and `trailingIcon="chevrons"`.
  - `PageHeader`: `descriptionSize`. A wide actions bar now wraps or scrolls inside the header instead of widening the page.
  - `TableHead`: `onSort` and `sort` make a sort button with `aria-sort`.
  - `Kbd`: `shortcut={{ apple, other }}` shows ⌘ on Apple devices and Ctrl elsewhere, with stable server rendering. `useApplePlatform` is exported.
  - New `SearchTrigger`: a button that looks like a search field, with the shortcut hint, to open a `CommandMenu`.

- e64ae54: Dialogs, the command menu, and radios fix three focus and contrast bugs, and the sidebar primitives take four opt-in options.

  - `Modal` (so also `ConfirmModal`, `FormModal`, and `ConfigFormModal`), `AlertDialogContent`, and `SheetContent` return focus to the element that opened them. A dialog opened from a menu item returned focus to the page body, because the item goes away with its menu; it now returns focus to the menu's trigger, through sub-menus, or for a context menu to the element focused before the menu opened. `useDialogReturnFocus` gives the same behavior to another Radix dialog.
  - `CommandMenu` closes itself when a command is picked, gives focus back to its opener, and then runs the command. A command can open a dialog, whose focus then returns to the opener, or move focus, which the menu no longer takes back. A screen no longer waits on a timer for the menu to close.
  - `RadioGroupItem` draws its ring in the field border, which reaches 3:1 on every surface; the old border was about 1.3:1 (WCAG 2.2 SC 1.4.11).
  - `Sidebar` takes `label`, which wraps the sidebar in a named navigation landmark, and `surface` (`sunken`, `default`, or `raised`) for its fill. `SidebarMenuButton` takes `variant="neutral"` for a current item in the neutral fill without the start indicator. `SidebarMenuSub` takes `tree` for tree lines.

- e64ae54: `RadialProgress`, `Gauge`, `ProportionBar`, and `ProgressBar` cover more designs without local copies. The new options are opt-in, so current screens render as before.

  - `RadialProgress` draws in plain SVG, without loading the chart library, and sweeps to a new value on the motion tokens. It takes a number `size` for any ring size, `valuePosition="end"`, a `fill` disc, `innerRatio`, and `interaction`.
  - `Gauge` takes `center` for your own middle, `legend={false}`, `innerRatio` for the ring's thickness, and `segmentCaps="butt"`. Each part has a `data-slot`.
  - `ProportionBar` answers the pointer and the keyboard as the charts do (DATA-5): hover, focus, or a tap rings a part and shows its name and value, the arrow keys walk the parts, a click or Enter pins one, and Escape lets it go. Parts grow to new values on the motion tokens. `interaction={false}` keeps the old still bar; `tooltip={false}` and `onActiveChange` let a screen show the active part itself. A segment's `fill="hatch"` draws it as lines, and `height` sets any thickness.
  - `ProgressBar` takes `height`, `track` (`neutral`, `sunken`, `hatch`, or `none`), several `parts`, and `gap`.
  - The `bg-hatch` utility draws a hatched part in HTML, in the text color.

- e64ae54: The plot primitives cover more chart designs without custom marks. All new options are opt-in, so current plots render as before.

  - `PlotBars` draws horizontal rows with `orientation="horizontal"`, and stacks segments when `y0` or `x0` reads a start per bar. A stack rings as one column or row.
  - `PlotLine` takes `extend`, which runs the line to the edges of the drawing area.
  - `PlotArcs` takes `stroke` (an edge or an even gap), `offset` (moves a slice out), and `label` (text on each slice).
  - `PlotAxis` takes `align="start"` for y labels, a `\n` in a label for a second line, and `highlight` for the active label.
  - `interaction.spans` picks parts of unequal size by the part under the pointer. `interaction.rest` sets what a pinned point shows at rest: `"highlight"` holds its tooltip until people use the plot, and `"none"` shows neither ring nor tooltip.
  - `PlotAnchor` and `PlotTooltip` take `side="above"`, `"below"`, and `"beside"`, which center, flip, and stay inside the plot, and `maxWidth`. A `PlotLegend` item's `fill` draws a tint or hatch swatch with an edge in its color.
  - Custom marks use `usePlotTween` to move on the motion tokens and `PLOT_RING` to draw the active ring.

  The UI lab's charts page shows each option.

- e64ae54: Chart pieces that designs had to build locally.

  - `PlotArcs` takes `radii`: how far each slice reaches, as a share of the ring's radius. Equal slices with their own reach make a polar area chart; the reach tweens, and labels sit halfway out on each slice.
  - A gradient `PlotFill` takes `stops` through several colors, such as a flow from yellow through green to teal.
  - A hatch `PlotFill` takes a `base`, a solid color or a chart tint under its lines, so a hatched part on a pale base is one fill instead of two layers.
  - `PlotBars` takes `trackPad`, which grows the track around the bar and before its baseline into a row.
  - `PlotColor` adds `"sunken"`, the well color, where every chart color keeps 3:1.

- e64ae54: `@repo/ui` gains plot primitives for charts that a design draws its own way: `Plot`, with d3 scales, SVG marks (grid, stems, lines, areas, bands, bars with tracks, capsule highlights, dots, segmented arcs) and HTML overlays (tooltip, anchor, legend). A plot is interactive by default: hover, focus, or tap shows a mark's value, a click pins it, the arrow keys walk the points, and marks tween to new data on the motion tokens and snap under reduced motion. `Gauge` parts answer hover and keys, and the Recharts charts animate on the token durations.

  `@repo/ui-3d` is a new package for accessible 3D views. `Viewport3D` loads three.js lazily, mirrors a DOM control, turns and zooms by keys and buttons, respects reduced motion, renders on demand, and falls back when WebGL is missing. `useThemeColors` and `useThemeMaterials` color a scene from the theme tokens.

  The UI lab compares a screen with its reference side by side, with a slider, or as an overlay or a difference, enlarges the reference, aligns it with `referenceCrop`, lists screens on their own page, and saves a difference image in `pnpm lab:shots`.

- e64ae54: Two plot kit options that designs had to build locally.

  - `PlotAxis` takes `shortFormat`. It measures the x labels, and when one full label does not fit its room, every label takes the short form, such as the first three letters of a name. The full labels come back when the room grows.
  - `usePlotRing` gives a custom mark the ring that `PlotArcs` draws: its center, radii, `angleAt`, and `pointAt`, such as for a knob where a gauge's value ends.

- e64ae54: Fixes for gaps that new designs found in the kit.

  - `PlotBars` names each bar by its category, so bars that change order, such as sorted ones, slide to their new places instead of each place morphing into another bar. `usePlotTween` takes the same `keys` for custom marks.
  - `PlotAnchor`'s `y` takes a category on a band y scale, the center of that row, so one anchor per row labels every bar of a row chart.
  - A `SidebarMenuButton` tooltip that is hidden (an expanded sidebar, or a phone) no longer opens on focus. Open and hidden, it was the top layer and took the first Escape, so the phone sheet needed two.
  - A `Table`'s `scrollLabel` names its scroller as a group, not a region landmark, so a name like its card's no longer duplicates the card's landmark (axe `landmark-unique`).
  - `PlotLegend`'s `square` swatch is square, not rounded.

- e64ae54: Small chart options that designs had to build locally.

  - `PlotBars` takes `gap`, which starts each bar a few pixels from its baseline, so stacked segments and the rises and falls of a diverging chart sit apart.
  - A tint `PlotFill` takes `opacity`.
  - `PlotAxis` takes `ticks` (short tick marks in the bold border color), `side="top"` for x labels above the drawing area, and `align="end"`.
  - `PlotFrame` draws hairlines along the sides of the drawing area that you name.
  - `PlotStems` takes `highlight`, which draws the active stem in the text color.
  - A `PlotLegend` swatch takes `"ink"` for a series drawn in the text color.

- e64ae54: Themes cover more of what screens had to set by hand, and the theme check measures more of what components draw.

  - Dark cards stand apart. A derived dark card now reaches 1.1:1 against both the page and a sunken canvas, and its hovered and pressed fills, overlays, and borders move up with it. Byte Forge's dark cards move from `#14171d` (equal to the sunken canvas) to `#1d2128`.
  - Every type step has a `text-*` utility, including the 13px `text-body-compact`, `text-body-snug`, `text-heading-page`, and `text-code-sm`.
  - Letter spacing is a theme input: `letterSpacing` in `createTheme` for every step, or per step in `type`. Each step emits `--ds-letter-spacing-<step>`, and its `text-*` utility sets it.
  - `--ds-shadow-glow` (`shadow-glow`) is a glow in the brand fill color: cast below in light mode, spread evenly and stronger in dark mode. `color.glow` tunes it, and `0` turns it off.
  - `findTargetSizeFailures` reads rem control heights at 16px.
  - `shippedThemePairs` adds 45 pairs that a registered theme must pass: chart and status fills on their tracks on each surface, the dark brand fill on its track, chart colors on `chart-grid`, the marks on a selected row, and the dark card step. Lab themes keep `contrastPairs`.
  - To pass the new pairs, Byte Forge's light `chart-3` moves from `#00967c` to `#00947b`. A warning ProgressBar draws in `border-warning`, so the amber warning fill of badges, banners, and buttons stays as it was. A derived dark brand fill that cannot show on its track gets lighter and keeps white text.

### Patch Changes

- e64ae54: `resolveNavUserInitials` skips a leading title, so "Dr. Adrian Hale" gives "AH", not "DA". A single-letter initial such as "J." still counts.
- e64ae54: `Pagination` keeps focus when First, Previous, Next, or Last reaches the edge and disables itself: focus moves to the current page instead of dropping to the page body.
- e64ae54: A moving `PlotAnchor` or `PlotTooltip` glides only from the frame after its first measured place, so it no longer sweeps in from a wrong place or widens a narrow page on first show.
- e64ae54: A `PlotAnchor` or `PlotTooltip` now measures its content hidden at the plot's origin before it places it. A place computed without the size could reach past the plot, and a phone browser that laid the page out with it there widened the page for good.
- e64ae54: `Textarea` accepts a `ref`, so a caller can move focus to it, as with `Input`. Its props type was the plain HTML attributes, which left `ref` out.
- e64ae54: `TopNav` keys each link by its address and label, so placeholder links that share an address no longer collide.
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
  - @repo/theme@0.1.0

## 1.10.0

### Minor Changes

- a26fb69: The signed-in web app is redesigned for clearer navigation and safer actions.

  `@repo/web`: the sidebar groups pages into Workspace (Dashboard, Todos, Notes, Assistant) and Organization (Organization, Audit log). Organization and Account settings are tabbed pages whose tab is in the URL: `/organization/{general,members,roles,data}` and `/account/{profile,security,sessions,notifications,data}`. The old `/members` and `/security` links redirect to the matching tab. The dashboard shows the Active Organization's open Todo, Note, and unread notification counts, a quick add for open Todos, and recent Notes, chats, and activity with "View all" links. Revoking an Invitation, changing a member's role, signing out one or all other sessions, unlinking a sign-in method, declining an Invitation, and requesting account deletion now ask for confirmation and report success. The header has a "Search…" button and a Cmd/Ctrl+K command menu to go to a page, open a settings tab, create an item, switch Organization, or change theme and language. The sign-in page's login and sign-up choice is a link pair kept in `?mode=signup`.

  `@repo/api`: GraphQL adds `todoCounts` (`open`, `completed`) and `noteCount`, both counted in the Active Organization from the session.

  `@repo/ui` adds `PageHeader`, `EmptyState`, `QueryError`, `SettingsSection`, `StatCard`, `CopyButton`, and `CommandMenu` (built on `cmdk`), and exports `tabsListClassName` and `tabsTriggerClassName` for link-based tab navigation. The active sidebar item uses the selected tokens with an inset start indicator.

  `@repo/translation` adds the strings for the new navigation, dashboard, confirmations, and command menu.

## 1.9.0

### Minor Changes

- 729d942: A signed-in user now manages their own account on the web app's new `/account` page, opened from the sidebar user menu: avatar and display name, email address, password, signed-in sessions, linked sign-in methods, and account deletion. The avatar uploader moves there from `/security`, which keeps two-step verification only.

  `@repo/auth` turns on better-auth `user.changeEmail` (`updateEmailWithoutVerification: false`, so the email changes only after the new address is verified; a verified user's old address approves the change first) and `user.deleteUser` with an emailed confirmation link to `<WEB_APP_URL>/account/delete?token=…`. Deletion is refused with `SOLE_OWNER_OF_SHARED_ORGANIZATION` or `PERSONAL_ORGANIZATION_HAS_MEMBERS`, and the error body carries `organizationName`. In one locked transaction before the user row goes, the Organizations the user is alone in are deleted (their storage is queued for the sweep) and a shared, non-personal Organization's `user_id` moves to another owner. New `GET /account/social-providers` lists the providers the server configured. `AuthTransport` gains `updateProfile`, `changePassword`, `changeEmail`, `listSessions`, `revokeSession`, `revokeOtherSessions`, `listAccounts`, `listSocialProviders`, `linkSocialAccount`, `unlinkAccount`, `requestAccountDeletion` and `confirmAccountDeletion`; `AuthRequestError` gains `organizationName`. Breaking: `/sign-up/email` and `/update-user` refuse `image`, and `/organization/create` and `/organization/update` refuse `logo`, with `PUBLIC_ASSET_URL_READ_ONLY`. Only the API's Public Asset upload writes those URLs, because a client-chosen URL could name another owner's file.

  `@repo/db` breaking change: migration `0017` makes `files.uploaded_by` and `organizations.user_id` nullable with `ON DELETE SET NULL`, so `File.uploadedBy` and `Organization.userId` are `string | null`. An Attachment stays with its Organization after its uploader deletes their account, and an Organization that reaches a user while their account is being deleted survives with its members. The migration also adds a `public_asset_purges` queue (user id and image URL) that a trigger fills for every deleted user.

  `@repo/api`: new avatars and logos are published under `avatars/<userId>/` and `organization-logos/<organizationId>/`. Replacing a Public Asset, purging a deleted Organization's logo, and the new sweep of deleted users' avatars delete an object only when its key belongs to that owner. A legacy key without an owner is left in the bucket.

  `@repo/email` adds the `emailChangeApproval` and `accountDeletion` templates (en, sr, de) for these emails.

  `@repo/ui`: `NavUser` takes an optional `accountItem` menu entry above log out.

- 1e5e82d: Organizations get API Keys and Webhook Endpoints (#709).

  `@repo/auth` registers the official `@better-auth/api-key` add-on (catalog `1.7.12`) with `references: "organization"`. Only its create and verify endpoints are registered, and `/api-key/create` is in `disabledPaths`, so keys are managed through GraphQL with the Active Organization from the session. The add-on stores the SHA-256 hash of each key and returns the plain key (prefix `kf_`) once. The Permission catalog gains `apiKey:create`, `apiKey:read`, `apiKey:delete`, `webhook:create`, `webhook:read`, `webhook:update` and `webhook:delete`, granted to owner and admin and grantable by Custom Roles. A key grants its creator's Permissions except access changes (`apiKeyGrantablePermissions`: no API Key, Webhook Endpoint, role, member, invitation or Organization changes, and no Organization export); `resolveApiKeyScope` builds an Authenticated Organization Scope for the key's Organization whose Permissions are the ones the key grants that the creator still holds, and marks it with `apiKeyId`. An Audit Event recorded under a key request names the key in its metadata. Breaking: `ServerAuth` gains `resolveApiKey` and `createApiKey`, so every implementation and test fake needs them. New Audit Event actions: `api_key_created`, `api_key_revoked`, `webhook_endpoint_created`, `webhook_endpoint_updated`, `webhook_endpoint_deleted`, `webhook_secret_rotated`.

  `@repo/jobs` adds the `webhook.deliver` job (6 attempts, exponential backoff from 30 s). Breaking: `createJobHandlers` requires a `deliverWebhook` handler.

  `@repo/db` migration adds `api_keys`, `webhook_endpoints` and `webhook_deliveries`.

  `@repo/api`: a `/graphql` request with an `x-api-key` header acts as the key's Organization, with its own rate limit bucket; an unknown, revoked or expired key gets 401, a client over its address limit gets 429 before any key lookup, and a malformed key never reaches the database. A key request lists only its own Organization and cannot read its creator's own data. New GraphQL fields `apiKeys`, `createApiKey`, `revokeApiKey`, `webhookEventTypes`, `webhookEndpoints`, `webhookDeliveries`, `createWebhookEndpoint`, `updateWebhookEndpoint`, `rotateWebhookSecret` and `deleteWebhookEndpoint`, and `AuditEvent.apiKeyId`. Webhook URLs must use port 443, and Audit Events record them without the query string. Every organization event (`todo:*`, `note:*`) is delivered to the Organization's subscribed Webhook Endpoints as a JSON POST signed with HMAC-SHA256 over `<timestamp>.<body>`. An SSRF guard refuses loopback, private, link-local and unique-local IPv4 and IPv6 addresses at create, update and every attempt, connects to the checked address, and never follows redirects. Each attempt is written to the delivery log, which housekeeping deletes after `RETENTION_WEBHOOK_DELIVERIES_DAYS` (30).

  `@repo/web` adds the `/api-keys` and `/webhooks` pages, shown to members who hold the read Permission. `@repo/ui` exports the `KeyRound` and `Webhook` icons. `@repo/translation` adds their strings in en, sr and de. `@repo/logger` redacts the `x-api-key` header.

### Patch Changes

- 8be54b9: Signed-in users now get Notifications. Two types exist: "invitation received" (an Invitation to an email address that already has an account) and "role changed" (a role update, or becoming owner through an ownership transfer). The API registry (`apps/api/src/features/notifications/notifications.definition.ts`) declares each type's payload shape, default channels, and whether it has an email channel.

  The web header has a bell with an unread badge and an inbox; account settings has a per-type in-app and email choice. GraphQL adds `notifications(first, after)` (the caller's own Notifications in every Organization, newest first, with `unreadCount`), `notificationPreferences`, `markNotificationRead(id)`, `markAllNotificationsRead`, `updateNotificationPreference(input)`, and the `notificationReceived` subscription, filtered by the recipient's user id. None takes a user or organization id; another user's Notification id returns `notification not found`.

  The invitation email still always goes to the invited address, whatever the preferences, so "invitation received" is in-app only (`emailAvailable: false`). Only a verified account with that address gets the in-app Notification: under soft verification an unverified account may not own the address. An address without an account gets the email as before. A resend creates a new Notification. Delivery never blocks or fails the auth action that produced it.

  `@repo/auth` adds `@repo/auth/notifications` (event types and `setNotificationDispatcher`); the API process sets the dispatcher at startup. `@repo/db` migration `0018` adds `notifications` (with a partial index for unread rows) and `notification_preferences`. `@repo/email` adds the `roleChanged` template. `@repo/translation` adds the `notifications` namespace. `@repo/ui` exports the `Bell` icon. The shared cursor helper gains `pageOwnedByUser` for user-owned lists.

## 1.8.0

### Minor Changes

- 12ad7c5: The web app now names each browser tab `<route title> · <app name>` and updates it when the language changes. `index.html` carries the product name, a meta description, and Open Graph tags that template adoption rewrites. The app serves a permissive `robots.txt` and adds public `/terms` and `/privacy` stub pages, linked from a new auth page footer. `AuthLayout` takes an optional `footer` slot.

## 1.7.2

### Patch Changes

- 6d93644: Uploaded image Attachments are re-encoded without metadata (EXIF, GPS) and get a WebP thumbnail (`FileInfo.thumbnailUrl`), shown in the web attachment list. Users can set an avatar and organization admins can set a logo: both are Public Assets, re-encoded as square WebP and served from a separate public bucket through a CDN (`S3_PUBLIC_BUCKET`, `S3_PUBLIC_BASE_URL`). The storage sweep also clears unconfirmed Public Asset uploads.

## 1.7.1

### Patch Changes

- a1c0431: Adds two-factor sign-in (authenticator app, email code, backup codes), email one-time-code sign-in and password reset, optional Cloudflare Turnstile captcha, and a Have I Been Pwned check on new passwords; caches sessions in a signed cookie for five minutes and adds the better-auth performance indexes (ADR 0015).

## 1.7.0

### Minor Changes

- 527509e: Follow the Byteforge website's new red-orange accent. Brand and selected fills are `#d4421a` in both themes, and text on them is white through `--ds-text-brand-inverse`. Hovered and pressed fills get darker so white text stays WCAG AA. Links, brand text, selected tints, focus rings, and brand borders and icons move to matching values. Select action items now use `--ds-text-brand` instead of the fill color, so they stay readable on the dark overlay.

## 1.6.0

### Minor Changes

- 4f69756: Redesign the agent desk around the owner's turn. The board opens on Your turn with quick and batch approve for low-risk plans, the issue page has a short header, decision gates with plan risk and file review, a trace of every step, and a stage side sheet, and the shell adds a command palette, shortcuts, an 8-second undo window, and opt-in notifications. Health shows setup progress, Runs adds today's summary, seven-day cards, and cost by role, and lessons can be promoted, unpromoted, or turned into a GitHub issue after the owner confirms the exact text. The engine records plan risk, pause and resume, approve notes, and a seven-day series, and the design system adds the tokens the desk uses.

## 1.5.0

### Minor Changes

- 3408a45: Adopt the Byteforge brand as the default light and dark themes. The palette uses one orange for actions, selection, links, and focus, on cool white and ink-black neutrals, with matching success, information, warning, and danger roles and a darker amber severe role. Text on orange fills uses the new `--ds-text-brand-inverse` token so it meets WCAG AA, and a contrast contract test checks the key pairs in both themes. Web, desktop, and mobile use Geist and Geist Mono, self-hosted. Shapes follow the site: pill buttons, 8px inputs, 12px menus, and 20px cards and dialogs. Shadows are ink-tinted, the easing is a quick ease-out, and buttons scale to `--ds-motion-press-scale` (0.97) on press. This replaces `--ds-motion-distance-press`, and `@repo/mobile-ui` exports `motionPressScale` and `fontFamilies` and drops `motionDistances.press`. A new mark, an olive tree growing through the Byteforge anvil, replaces the app icons, favicon, and README logo, and its Blender source and render script are in `media/brand/`.

## 1.4.0

### Minor Changes

- e047bf0: Name the organization switcher, user menu, and compact/full shell select triggers by their visible text (WCAG 2.5.3 Label in Name). Removes the unused `ariaLabel` prop from `OrganizationSwitcher` and `NavUser`; `ShellSelectControl` applies `ariaLabel` only to its icon-only trigger.

## 1.3.1

### Patch Changes

- cb7174c: Add the `@repo/desk` workspace: the shared stage and agent-output contracts, the pure pipeline
  transition table, the per-issue state store with a process lease, and the desk configuration
  loader for the upcoming local agent desk. Add the GitHub intake path: the `gh` port, owner
  authorization, the issue contract reader, `agent:*` execution labels, the status comment, the
  worktree bootstrap plan, `desk doctor`, and the `start`, `status`, and `labels sync` commands.
  Add the pipeline engine: the stage runner with engine invariants around every agent run, the
  scheduler, process leases, and restart recovery.
  Add the engine commands (`approve`, `feedback`, `continue`, `cancel`, `remove`, `logs`, `resume`), live progress, a persistent redacted agent log, and a `notifyCommand` that runs without a shell.
  Add the ship step: `ship --dry-run` and `ship --confirm` commit, push, and open a draft PR through the repository hooks after a fail-closed gate (confirmation, matching checks and review, owner identity, authorization, refs baseline). The desk never merges. Add the local server (`desk serve`) with a loopback-only, cookie-protected API.
  Add the `@repo/desk-ui` workspace: the React desk with a board, an issue page, a React Flow graph of the pipeline, the plan and ship gates with a two-step ship dialog, a live log, and a health view, in English, German, and Serbian. Add the `desk` translation namespace. `pnpm desk serve` builds the UI first when it is missing, and `pnpm desk:ui` starts the Vite dev server with a proxy to a running desk. `@repo/desk` adds the `ship-plan` artifact id and browser-safe views of the check report and the ship plan.
  The built desk opens at a plain local URL in each browser and issues its session cookie on page load. The one-use link remains for the separate Vite development origin.
  Add optional Docker isolation (`desk start --isolation docker`, `isolation: "docker"`). One `IsolationPort` decides where the builder and the check steps run. In Docker mode they run in hardened containers with no network, a read-only root, no capabilities, and no host mount. Work moves in as a git bundle and a patch and out as a guarded patch, and dependencies come through a registry-only proxy and install offline. Add `desk docker build|login|doctor|status|prune`, `desk doctor --probe` with isolation probes, a per-issue `isolation` state field, a `docker` config block, labelled and verified cleanup in `remove` and crash recovery, and a container-only Codex sandbox flag. Real-Docker tests run with `DESK_DOCKER=1`.
  The desk board is a kanban with search, a start dialog, toasts, and compact cards that read only the issue summary (`prUrl`, `contract`, `stageEnteredAt`, `resumeStage`, `progress`, `currentNode`). Log entries carry their time in `at` only. `@repo/ui` also exports the `GitPullRequest`, `Plus`, `Search`, `SlidersHorizontal`, and `X` icons.
  The engine stops an agent run that repeats the same failing tool call 8 times and sends the issue to `needs-you`. Every agent run appends a record to `runs.jsonl` in the state root, and `desk stats` compares the runs by role, provider, and model. `GET /api/stats` serves the same numbers, the issue detail carries its `runs`, and the desk UI adds a **Runs** view and agent-usage tiles in the inspector. Token counts mean the same for Claude and Codex. A failed health check shows the command that repairs it, and the Health page can build the Docker image after a confirmation (`POST /api/health/fix`). `desk serve` reports the Docker checks too. On Windows the engine starts `pnpm` through `npm_execpath` and keeps the profile variables, so `pnpm` and the `gh` login work there. The Start dialog lists the open issues of the repository to pick from (ready label, contract count, already on the board), and the board shows the open pull requests read-only (`GET /api/github`). `desk contract` shows how intake reads an issue body, the issue templates follow the shared issue format, an issue that stops at intake keeps its title, and the UI offers Start again for it instead of a Continue that intake refuses. `desk draft` has the read-only intake agent draft a stopped issue in the issue format; the engine renders the body and keeps the old text as a quote. `desk draft --apply` writes the draft to the issue after an explicit yes, as the owner, and only when the issue did not change since the draft. The issue page offers Draft the issue format, a review dialog with the proposal and the open questions, and Apply with a second confirmation (actions `draft` and `apply-draft`, artifact `issue-draft`).
  Each run record now names the harness the agent started with (`harness: { repo, desk, head }`), and `desk stats --by-harness` splits the rows by instruction version. The desk writes review findings, failed checks, stuck runs, denials, verification violations, and broken invariants to `lessons.jsonl`, which `remove` keeps. `desk lessons` and `GET /api/lessons` list the problems seen in two or more issues, and the **Runs** view shows them as lesson candidates. The harness-eval ledger accepts calibrations and protocol 2 runs, whose conclusion must agree with the measured noise floor.

## 1.3.0

### Minor Changes

- 99a5fc9: Redesign existing client workflows with neutral light and dark themes, consistent motion, responsive navigation, and clearer form feedback. Preserve drafts during preference changes and failed submissions.

  Reset route state when the Active Organization changes, prevent pending forms from being edited or dismissed, and improve checklist and Attachment controls. Keep collapsed sidebar preferences contained and long menus scrollable.

- 28ab725: Add consistent entry and exit motion to drawers, dialogs, menus, tooltips, and Attachment disclosures. Smooth sidebar collapse and preference placement, preserve upload and form state, and respect device reduced motion. Share generated motion easing and distances with native controls and keep interrupted native dialog exits safe.

  Add stable, labeled Language and Theme footer rows with current values, native language names, and accessible radio menus. Keep their vertical positions fixed during collapse and preserve menu focus, drafts, and saved preferences.

- 6907d18: Refresh Notes with a responsive list and editor, full Organization-scoped title/body search, pagination, explicit saving, protected per-note drafts, and clearer checklist feedback. Preserve newer edits during saves and prevent accidental draft loss during navigation and Organization changes.
- db46fcf: Refresh Todos with inline creation, searchable status views, pagination, protected drafts, and clearer action and attachment feedback. Keep text edits separate from completion changes across web and mobile, and preserve Organization scoping.
- 4143c11: Refresh the AI Assistant with a responsive conversation workspace, a growing keyboard-accessible composer, per-conversation drafts, and readable Todo and Note results. Keep replies attached to their originating conversation during navigation and preserve prompts after failures.

## 1.2.1

### Patch Changes

- ceef03e: Intentional dependency upgrades from issue #198: Dependabot freezes for mobile singleton packages, jsdom 30, web React 19.2 catalog, GraphQL Codegen v7 suite with client regenerate, and Expo SDK 55 mobile graph (RN 0.83, expo ~55).
- 14601b7: Use a single `radix-ui` entrypoint (drop dual `@radix-ui/*` pins) and bump to 1.6.7 for root-import type and primitive fixes.
- fc1395e: Upgrade web tooling to Vite 8 (Rolldown-powered build, lightningcss minification). Replace the invalid `var()` media query in `globals.css` with its literal breakpoint value: media queries cannot consume custom properties, so the sub-768px layout block previously never matched in any browser and now applies as intended. Closes the vite workstream from the 2026-08 security triage.

## 1.2.0

### Minor Changes

- 7a6e25d: Rename TeamSwitcher public API to OrganizationSwitcher to match CONTEXT domain language.

### Patch Changes

- 22a7c4d: Close a batch of principal architecture review findings: honest package `dev` scripts, stronger catalog enforcement, fuller `create:package` wiring, Vitest UI/`test:watch`, digest-pinned Docker bases with a blocking Trivy CRITICAL gate, and CI/DX hardening (knip/boundaries on PRs, safer concurrency, caches, launch configs).
- 7bdc15c: Add dead-code and dependency-graph enforcement, and finish declaring the graph.

  `pnpm knip` and `pnpm boundaries` are new and both run in `pnpm check`. `turbo boundaries` complements the existing ESLint rules rather than replacing them: it catches importing a package a workspace does not declare, which ESLint cannot see, while ESLint keeps enforcing the web/mobile UI split and the `@repo/*/src` deep-import ban. `boundaries` is experimental in Turbo 2.8, which is why it is additive.

  `turbo boundaries` found 153 undeclared imports: 145 test files importing `vitest`, and `packages/config/eslint/*.js` importing six ESLint plugins. All resolved only through pnpm root hoisting. Every workspace that imports `vitest` now declares it, and the six plugins moved from the root to `@repo/config`, which is where they are imported — the root `eslint.config.mjs` only re-exports. `pnpm --filter <workspace> test` no longer depends on hoisting. One exception remains, marked with `@boundaries-ignore`: `packages/config/mobile-lan-dev.test.ts` reaches into `tooling/dev-mobile-lan.ts`, a loose root script with no workspace of its own to be tested from.

  knip is configured against this repo's conventions rather than run on defaults, which reported 63 false "unused files". Test files are entry points; the vitest `react-native` alias target, Expo/Metro config, and template placeholder files are ignored; the `exports` and `types` rules are off because this repo deliberately exports internals for unit testing. The dependency rule keeps an explicit ignore list for things static analysis cannot see: `pino-pretty` (referenced as a transport string), `tailwindcss` (a Tailwind v4 peer of `@tailwindcss/vite`), the `catalog:mobile` React Native singleton pins, Expo plugin inferences, and `zod` in `@repo/auth`.

  That last one is worth recording: knip reported `zod` as unused in `@repo/auth` and nothing imports it, but removing it breaks the build with TS2742 — better-auth's inferred types reference zod, so it is required for declaration emit. The pre-existing catalog alignment test already guarded it. **Verify a dependency removal with a build, not a grep.**

  Removed genuinely dead code that knip surfaced, each verified unreferenced first: eight source files across api/web/mobile, plus `react-i18next` from `@repo/translation` (declared but imported nowhere in the repo). Deleted `vitest.workspace.ts` — it used `defineWorkspace`, deprecated in the installed Vitest 3.2.4 and removed in 4, was invoked by nothing, and had drifted from `vitest.coverage.config.ts`, which is now the single project list.

  Normalized the four tsconfigs that extended the root base directly instead of the shared presets in `packages/config/typescript/`.

  Five new alignment tests, each verified to fail when violated: every workspace declares `@repo/config`; `globalDependencies` never lists the lockfile or globs a package; neither Dockerfile hand-copies `packages/config`; vitest importers declare vitest; ESLint plugins live in `@repo/config` and not the root.

- 2a37f9d: Generate mobile NativeWind design tokens from packages/ui globals.css and fail when they drift.
- 79fa89e: Complete TypeScript project references for tsc-emitting packages: composite `tsconfig.build.json` + `tsc -b`, while typecheck keeps source paths (issue #147).

## 1.1.3

### Patch Changes

- 480a52d: Add design-token contract test (DESIGN_SYSTEM.md ↔ globals.css ↔ Tailwind preset) and fix the stale base-token example in the docs

## 1.1.2

### Patch Changes

- d5f6d92: Add AI todo generation with OpenAI and DeepSeek provider support.

## 1.1.1

### Patch Changes

- 07b5833: Migrate all UI primitives from shadcn bridge variables to direct --ds-\* design token references and add accent color token suite (9 hues x 7 token types)
- 532bf1a: UI update

## 1.1.0

### Minor Changes

- 42437fd: Multitenancy and organization implementation

## 1.0.0

### Major Changes

- 9633894: First release test
