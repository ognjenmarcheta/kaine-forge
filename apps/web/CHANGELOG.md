# @repo/web

## 1.5.0

### Minor Changes

- 87e6d0b: Add a Notes feature and multi-chat assistant. Notes have a title, a body, and a
  checklist of todos (todos gain a nullable `note_id`, detached on note delete). Notes are
  managed at `/notes` + `/notes/:id` and can also be created/updated by the AI assistant
  via new tools (`createNote` with an inline checklist, `listNotes`, `updateNote`,
  `addTodoToNote`); note changes stream live over `note:*` subscriptions. The assistant page
  becomes multi-chat: conversations are listed, resumable, and deletable, message history
  loads on open, and each assistant turn surfaces clickable links to the notes it created.

### Patch Changes

- Updated dependencies [87e6d0b]
  - @repo/translation@1.3.0
  - @repo/auth@1.4.2

## 1.4.0

### Minor Changes

- f136b60: Add an agentic AI assistant example that extends the todo generator. A new `/assistant`
  chat runs a multi-step tool-calling loop (Vercel AI SDK `streamText` + `stepCountIs`) that
  can create, list, complete, update, and delete todos through org-scoped tools. Replies stream
  token-by-token over a new `assistantMessageDelta` subscription, and the assistant page shows a
  live todo list driven by the existing `todo:*` events. Conversations and messages are persisted
  in new `assistant_conversations` and `assistant_messages` tables. The assistant provider config
  falls back to the existing `AI_TODO_PROVIDER`/`AI_TODO_MODEL` (OpenAI/DeepSeek) settings.

### Patch Changes

- Updated dependencies [f136b60]
  - @repo/translation@1.2.0
  - @repo/auth@1.4.1

## 1.3.0

### Minor Changes

- c1d66c1: Clients authenticate through better-auth's client (organization + bearer flows) with env-gated GitHub/Google social login buttons

### Patch Changes

- Updated dependencies [c046f32]
- Updated dependencies [68ebc61]
- Updated dependencies [b2b0a3e]
- Updated dependencies [4057465]
- Updated dependencies [c1d66c1]
- Updated dependencies [9cc4adf]
  - @repo/auth@1.4.0

## 1.2.11

### Patch Changes

- 881822c: Add HEALTHCHECK directives to Dockerfile.api (Node fetch against /health) and Dockerfile.web (wget against nginx)
- c9b20e0: Extend the local AuthUser session mirrors with the new emailVerified field exposed by @repo/auth sessions
- Updated dependencies [480a52d]
- Updated dependencies [f884c6b]
- Updated dependencies [d03004e]
- Updated dependencies [c72eb56]
- Updated dependencies [5d8d4a1]
- Updated dependencies [3733f8d]
  - @repo/ui@1.1.3
  - @repo/auth@1.3.0

## 1.2.10

### Patch Changes

- d5f6d92: Add AI todo generation with OpenAI and DeepSeek provider support.
- Updated dependencies [d5f6d92]
  - @repo/ui@1.1.2

## 1.2.9

### Patch Changes

- 9d42572: Deepen Todo client workflows and Active Organization provider orchestration while preserving app behavior.
- Updated dependencies [9d42572]
  - @repo/query@1.3.5
  - @repo/todos@1.0.3

## 1.2.8

### Patch Changes

- Updated dependencies [35d096a]
  - @repo/query@1.3.4

## 1.2.7

### Patch Changes

- 69f4711: Deepen API auth transport, storage lifecycle, shared upload/auth transitions, explicit query runtime registration, and preference persistence modules.
- Updated dependencies [69f4711]
  - @repo/query@1.3.3
  - @repo/storage@1.1.2
  - @repo/persistence@1.1.1

## 1.2.6

### Patch Changes

- 1d159d2: Deepen Authenticated Organization Scope, Active Organization lifecycle, Todo workflow, Attachment lifecycle, Translation runtime, API runtime, and GraphQL feature composition seams.
- Updated dependencies [1d159d2]
  - @repo/auth@1.2.2
  - @repo/query@1.3.2
  - @repo/todos@1.0.2
  - @repo/translation@1.1.1

## 1.2.5

### Patch Changes

- af949dd: Deepen shared auth, query, Todo, storage upload, persistence, and API scope architecture behind focused Modules and Adapters.
- Updated dependencies [af949dd]
  - @repo/auth@1.2.1
  - @repo/query@1.3.1
  - @repo/storage@1.1.1
  - @repo/todos@1.0.1

## 1.2.4

### Patch Changes

- 7b286b2: Deepen shared auth transport, organization-scoped query cache helpers, upload lifecycle, persistence adapters, and server auth internals.
- 7af7edb: Deepen organization-scoped auth, data access, client organization selection, and session transport.
- Updated dependencies [7b286b2]
- Updated dependencies [7af7edb]
  - @repo/auth@1.2.0
  - @repo/query@1.3.0
  - @repo/storage@1.1.0
  - @repo/persistence@1.1.0

## 1.2.3

### Patch Changes

- Updated dependencies [29a0d96]
  - @repo/auth@1.1.2

## 1.2.2

### Patch Changes

- efcb73a: Backport template-safe runtime hardening, Docker support, bearer auth fallback, organization members wiring, mobile UI primitives, and generated AI assistant scaffold.
- Updated dependencies [efcb73a]
  - @repo/auth@1.1.1

## 1.2.1

### Patch Changes

- 532bf1a: UI update
- Updated dependencies [07b5833]
- Updated dependencies [532bf1a]
  - @repo/ui@1.1.1

## 1.2.0

### Minor Changes

- 0ebaed1: Change graphql client

### Patch Changes

- Updated dependencies [0ebaed1]
  - @repo/query@1.2.0

## 1.1.0

### Minor Changes

- 42437fd: Multitenancy and organization implementation

### Patch Changes

- Updated dependencies [42437fd]
  - @repo/feature-flags@1.1.0
  - @repo/translation@1.1.0
  - @repo/auth@1.1.0
  - @repo/ui@1.1.0

## 1.0.0

### Major Changes

- 9633894: First release test

### Patch Changes

- Updated dependencies [9633894]
  - @repo/translation@1.0.0
  - @repo/auth@1.0.0
  - @repo/ui@1.0.0
