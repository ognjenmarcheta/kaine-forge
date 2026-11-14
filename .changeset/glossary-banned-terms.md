---
"@repo/config": minor
"@repo/translation": patch
---

The new lint rule `domain/banned-terms` and a config test block the `CONTEXT.md` Banned terms in declared names under `apps/` and `packages/`, in English copy, and in the GraphQL schema. Thirteen English strings that used a banned word now use the glossary term, and the German and Serbian strings follow them: "Invite members", "set up your organization", "Recent audit events", the Work navigation group, and, on the desk, "Your turn", "Stopped", and "All work".
