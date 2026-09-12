# UI motion verification

Verified on Windows on 2026-09-11; PR checks and coverage refreshed on 2026-09-12, on `codex/smooth-ui-motion` from merged redesign commit `99a5fc9`.

## Behavior

- Web/desktop use explicit CSS entry and exit keyframes instead of animation utilities whose keyframes were absent. The mobile web sidebar overrides the Sheet's `data-slot`, so Sheet motion now uses a stable shared class.
- Sidebar width and its content spacer interpolate together. Labels fade; Language and Theme stay mounted in two fixed vertical footer rows above a stable-height profile slot. Expanded rows show labels and current values; collapsed rows show icon tooltips. Avatars and Organization icons stay visible in the collapsed rail.
- Sheets slide from all four edges. Dialogs, menus, and tooltips animate entry and exit; Radix controls presence and focus restoration.
- Attachment disclosure uses intrinsic-height grid transitions on an inner element, outside Radix's temporary measurement styles. Its upload control remains mounted; closed content is inert.
- Native dialogs retain content during exit and reject stale completion callbacks after reopening. Button feedback moves content inside stable touch targets. The installed drawer's source and compiled module use the system reduced-motion setting through a narrow pnpm patch.
- Existing 120/180/220ms durations remain unchanged. Native easing and distances are generated from canonical CSS tokens. No animation library, backend change, migration, or production environment setting is added.

## Evidence

`pnpm check:affected` also passes after the fixes; full checks cover the whole-graph gates it omits.

| Check                                                                                                            | Result                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                                                     | Passed: formatting, lint, typecheck, workspace tests, boundaries, knip, and root checks.                                                                      |
| `pnpm coverage`                                                                                                  | Passed thresholds: 51.75% statements, 45.02% branches, 46.67% functions, 52.29% lines.                                                                        |
| `pnpm tokens:mobile:check`                                                                                       | Passed.                                                                                                                                                       |
| `pnpm ai:doctor`                                                                                                 | No drift; optional uvx, Firecrawl, and Graphify setup warnings.                                                                                               |
| `pnpm run build:core`                                                                                            | Passed; existing Vite large-chunk warning remains.                                                                                                            |
| `E2E_STORAGE_ENABLED=1 pnpm --filter @repo/e2e exec playwright test`                                             | 36/36 passed with local PostgreSQL and MinIO, including real Attachment upload/download/removal. Set this variable before invoking the command in your shell. |
| `pnpm --filter @repo/desktop build`                                                                              | Windows Tauri executable rebuilt successfully.                                                                                                                |
| `pnpm --filter @repo/mobile exec expo export --platform android --platform ios --output-dir .expo/motion-export` | Android and iOS bundles exported successfully.                                                                                                                |
| `pnpm install --frozen-lockfile --ignore-scripts`                                                                | Passed with the drawer patch.                                                                                                                                 |
| `git diff --check`                                                                                               | Passed.                                                                                                                                                       |

The browser tests inspect intermediate animation geometry, sidebar reversal and containment, all Sheet directions, dialog/menu/tooltip exits, disclosure DOM retention, focus restoration, and reduced-motion changes. Existing tests retain coverage for pending forms, failed drafts, theme persistence, and Organization isolation. Native tests cover interrupted exits, preserved drafts/callbacks/refs, disabled feedback, late preference reads, and the installed drawer patch.

## Sidebar footer follow-up

The footer now shows two neutral rows with Language and Theme labels, current values, and native language names (English, Deutsch, Srpski). Its radio menus open upward when expanded and rightward when collapsed. Controls stay mounted, with a stable profile slot preventing vertical movement during collapse. The responsive drawer uses 48px preference controls. Expanded tooltips cannot intercept Escape, and closing the controlled drawer restores focus to its opener.

Regression coverage checks intermediate label opacity, fixed row positions, visible collapsed icons and avatar, rapid reversal, menu radio selection and keyboard navigation, focus restoration, saved preferences after reload, retained Assistant drafts, and live reduced motion. The CSS targets the stable `data-sidebar` attribute because Radix can replace trigger `data-slot` values. Both themes were visually reviewed at 360, 768, and 1440px with German labels, including collapsed and expanded desktop layouts.

The footer follow-up reruns affected checks, full checks, token drift, core build, and browser tests. Coverage was refreshed during PR preparation. The Tauri executable build and native bundle exports above belong to the preceding motion implementation; these were not repeated for this web-only footer change. Physical-device limits below still apply.

## Review captures

- [Light motion recording](images/motion/light.webm)
- [Dark motion recording](images/motion/dark.webm)

Each short recording shows the updated sidebar/drawer with German labels at 360, 768, and 1440px, followed by a Todo dialog. Only the seeded test account and synthetic test data appear. The HTML Sheet fixture is development-only and is not a production build entry.

Windows reports window animations disabled, but the test Chromium instance reports `prefers-reduced-motion: no-preference` by default. Tests explicitly exercise both preferences. The application follows the browser/device preference and does not override it.

## Remaining device checks

Physical Android/iOS motion, interrupted gestures, keyboard avoidance, safe areas, screen-reader behavior, text scaling, and touch feedback remain unverified because no physical device is available. Bundle exports are not device tests. Tauri was rebuilt; these new motion sequences were tested in Chromium rather than repeated inside the desktop executable. Nothing was merged or deployed.
