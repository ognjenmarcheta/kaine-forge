# @repo/doc-export

## 0.1.0

### Minor Changes

- 500e8a7: Add `pnpm doc:export`, which exports a small Markdown subset to Word (`.docx`) and PowerPoint (`.pptx`) files with the same bytes for the same input, and verifies exported files with `--verify`. The tool keeps its input and output inside the repository and outside dot-directories, `node_modules`, and the desk's protected paths. Agent Desk agents gain opt-in extra tools (`capabilities.tools`, catalog `doc-export`) for the edit-code preset: the resolver allows exactly `pnpm doc:export`, the capability profile and run receipt list `extraTools`, and the Agents page adds an Extra tools field with new `desk` translation keys.

### Patch Changes

- Updated dependencies [500e8a7]
- Updated dependencies [500e8a7]
  - @repo/desk@0.5.0
