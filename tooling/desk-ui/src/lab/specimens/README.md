# Lab specimens

A specimen shows one `@repo/ui` component alone, with every variant and state, under the default theme. Open `#/specimens` in the Lab view; `#/specimens/<id>` shows one, and `#/specimens/<id>/dark` shows it in dark mode.

```text
src/specimens/<id>.specimen.tsx   exports `specimen: LabSpecimen` (from "../lab.registry")
```

`<id>` is the component's file name, such as `rating-stars` for `RatingStars`. The lab finds a specimen by its file name, so a new specimen never edits a shared file. A specimen that does not load shows as "did not load", and `lab.registry.test.ts` fails until it loads.

A **component job** of the agent desk (ADR 0021) writes the specimen of the component it builds, and its gate links to it in the job's own lab server.
