---
"@repo/desk-ui": minor
"@repo/desk": minor
"@repo/translation": minor
"@repo/config": patch
---

The UI lab is now the agent desk's Lab view (`?view=lab`, G then L), and `@repo/ui-lab` is gone.
`pnpm lab` starts the desk UI dev server; the lab opens without a desk server. `lab-frame.html`
shows the lab alone for the compare view and `lab:shots`/`lab:diff`, and it is the one desk page
that the desk itself may frame. Lab themes load as a constructed stylesheet under the desk CSP.
