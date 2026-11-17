---
"@repo/desk": minor
"@repo/translation": patch
---

The desk now records where rework starts. When the owner sends work back from a gate, `lessons.jsonl` gets a `sendback/<gate role>/<target role>` lesson with the owner's words as its sample. Feedback that answers `needs-you` records none. The reviewer marks each finding with an `origin`: a finding that the plan caused gets the key `review/plan/<section>/<severity>`, and a build finding keeps its old key, so the counts of promoted lessons go on. Reviews stored before the field read as build findings. The new `sendback` source has a label in English, German, and Serbian.
