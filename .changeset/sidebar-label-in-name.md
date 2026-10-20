---
"@repo/ui": minor
---

Name the organization switcher, user menu, and compact/full shell select triggers by their visible text (WCAG 2.5.3 Label in Name). Removes the unused `ariaLabel` prop from `OrganizationSwitcher` and `NavUser`; `ShellSelectControl` applies `ariaLabel` only to its icon-only trigger.
