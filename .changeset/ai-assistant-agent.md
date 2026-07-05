---
"@repo/api": minor
"@repo/web": minor
"@repo/db": minor
"@repo/translation": minor
---

Add an agentic AI assistant example that extends the todo generator. A new `/assistant`
chat runs a multi-step tool-calling loop (Vercel AI SDK `streamText` + `stepCountIs`) that
can create, list, complete, update, and delete todos through org-scoped tools. Replies stream
token-by-token over a new `assistantMessageDelta` subscription, and the assistant page shows a
live todo list driven by the existing `todo:*` events. Conversations and messages are persisted
in new `assistant_conversations` and `assistant_messages` tables. The assistant provider config
falls back to the existing `AI_TODO_PROVIDER`/`AI_TODO_MODEL` (OpenAI/DeepSeek) settings.
