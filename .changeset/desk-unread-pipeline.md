---
"@repo/desk": patch
---

Remove the unread `PIPELINE` constant and its `PipelineDefinition`, `PipelineNode`, `PipelineEdge`, `PipelineLoopEdge`, `HumanGate`, and `ActiveStage` types from `@repo/desk/contracts`. The flow model takes its nodes and edges from the flow snapshot.
