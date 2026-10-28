---
"@repo/db": minor
"@repo/api": minor
"@repo/auth": minor
"@repo/web": minor
"@repo/mobile": minor
"@repo/translation": minor
---

Add the Organization Theme: every member of an Organization sees the theme it picks. The `organizations` table gains a nullable `theme` column (migration `0025`). The API adds the `organizationTheme` query and the `setOrganizationTheme(theme: String)` mutation. The mutation needs the `organization:update` Permission, accepts only registered theme names, and records an `organization_theme_changed` Audit Event when the value changes. Organization settings show a Theme section when more than one theme is registered. The web and mobile apps apply the theme at runtime, and signed-out pages use the default theme.
