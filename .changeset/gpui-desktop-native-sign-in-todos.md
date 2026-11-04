---
"@repo/desktop-native": minor
"@repo/theme": patch
"@repo/translation": minor
---

The native desktop app signs in through the API's bearer session, keeps the token in the OS
keyring, and shows the Todos list of the active Organization with toggle and load-more, read
through `graphql_client` operations against the API schema. `pnpm smoke:native` starts the app
against a running API and reads the sign-in screen from the accessibility tree. The theme
tokens gain the layout widths; `auth.session.notSaved` is a new string (ADR 0025).
