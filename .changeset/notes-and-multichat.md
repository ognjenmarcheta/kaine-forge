---
"@repo/api": minor
"@repo/web": minor
"@repo/db": minor
"@repo/translation": minor
---

Add a Notes feature and multi-chat assistant. Notes have a title, a body, and a
checklist of todos (todos gain a nullable `note_id`, detached on note delete). Notes are
managed at `/notes` + `/notes/:id` and can also be created/updated by the AI assistant
via new tools (`createNote` with an inline checklist, `listNotes`, `updateNote`,
`addTodoToNote`); note changes stream live over `note:*` subscriptions. The assistant page
becomes multi-chat: conversations are listed, resumable, and deletable, message history
loads on open, and each assistant turn surfaces clickable links to the notes it created.
