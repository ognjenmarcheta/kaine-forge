---
"@repo/api": patch
---

Record AI failures and model-call usage. Both AI workflows previously ended in a bare `catch` that returned a degraded status with no log and no trace, so a provider outage, an expired key and a bug in our own persistence were indistinguishable. The degraded response is unchanged; the reason is now logged and sent to the error reporter.

Each model call also emits one structured line with provider, model, input/output/total tokens, duration, and — for the assistant — step and tool-call counts. Metadata only: no prompt, message, reply, tool payload or cost figure. Errors are logged under an `error` key rather than `err`, because pino's default serializer would otherwise copy the AI SDK's request body, which holds the prompt and the whole conversation, onto the record.
