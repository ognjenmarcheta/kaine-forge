---
"@repo/api": minor
---

Validate the AI provider and model environment variables. `AI_ASSISTANT_PROVIDER` and `AI_ASSISTANT_MODEL` were read by the assistant runtime but declared nowhere, and `AI_TODO_PROVIDER` accepted any string — so a misspelled provider silently fell back to OpenAI. Both provider variables are now an enum that is trimmed and lowercased before matching, so a typo fails at startup with the variable named. Blank still means unset, which keeps a fresh clone bootable.

Breaking for any deployment currently setting a provider value that is not exactly `openai` or `deepseek`: the API now exits at startup instead of quietly using OpenAI.
