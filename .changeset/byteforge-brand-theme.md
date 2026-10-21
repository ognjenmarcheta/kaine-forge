---
"@repo/ui": minor
"@repo/mobile-ui": minor
"@repo/config": minor
"@repo/web": minor
"@repo/mobile": minor
"@repo/desktop": minor
"@repo/desk-ui": minor
---

Adopt the Byteforge brand as the default light and dark themes. The palette uses one orange for actions, selection, links, and focus, on cool white and ink-black neutrals, with matching success, information, warning, and danger roles and a darker amber severe role. Text on orange fills uses the new `--ds-text-brand-inverse` token so it meets WCAG AA, and a contrast contract test checks the key pairs in both themes. Web, desktop, and mobile use Geist and Geist Mono, self-hosted. Shapes follow the site: pill buttons, 8px inputs, 12px menus, and 20px cards and dialogs. Shadows are ink-tinted, the easing is a quick ease-out, and buttons scale to `--ds-motion-press-scale` (0.97) on press. This replaces `--ds-motion-distance-press`, and `@repo/mobile-ui` exports `motionPressScale` and `fontFamilies` and drops `motionDistances.press`. A new mark, an olive tree growing through the Byteforge anvil, replaces the app icons, favicon, and README logo, and its Blender source and render script are in `media/brand/`.
