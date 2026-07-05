# @repo/translation

## 1.3.0

### Minor Changes

- 87e6d0b: Add a Notes feature and multi-chat assistant. Notes have a title, a body, and a
  checklist of todos (todos gain a nullable `note_id`, detached on note delete). Notes are
  managed at `/notes` + `/notes/:id` and can also be created/updated by the AI assistant
  via new tools (`createNote` with an inline checklist, `listNotes`, `updateNote`,
  `addTodoToNote`); note changes stream live over `note:*` subscriptions. The assistant page
  becomes multi-chat: conversations are listed, resumable, and deletable, message history
  loads on open, and each assistant turn surfaces clickable links to the notes it created.

## 1.2.0

### Minor Changes

- f136b60: Add an agentic AI assistant example that extends the todo generator. A new `/assistant`
  chat runs a multi-step tool-calling loop (Vercel AI SDK `streamText` + `stepCountIs`) that
  can create, list, complete, update, and delete todos through org-scoped tools. Replies stream
  token-by-token over a new `assistantMessageDelta` subscription, and the assistant page shows a
  live todo list driven by the existing `todo:*` events. Conversations and messages are persisted
  in new `assistant_conversations` and `assistant_messages` tables. The assistant provider config
  falls back to the existing `AI_TODO_PROVIDER`/`AI_TODO_MODEL` (OpenAI/DeepSeek) settings.

## 1.1.1

### Patch Changes

- 1d159d2: Deepen Authenticated Organization Scope, Active Organization lifecycle, Todo workflow, Attachment lifecycle, Translation runtime, API runtime, and GraphQL feature composition seams.

## 1.1.0

### Minor Changes

- 42437fd: Multitenancy and organization implementation

## 1.0.0

### Major Changes

- 9633894: First release test
