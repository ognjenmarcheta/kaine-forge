# @repo/doc-export

## 0.1.6

### Patch Changes

- Updated dependencies [1b07779]
  - @repo/desk@0.7.0

## 0.1.5

### Patch Changes

- Updated dependencies [a96ff72]
  - @repo/desk@0.6.2

## 0.1.4

### Patch Changes

- Updated dependencies [1d503d9]
  - @repo/desk@0.6.1

## 0.1.3

### Patch Changes

- Updated dependencies [d1325ed]
- Updated dependencies [1a3fc0f]
- Updated dependencies [d947f31]
- Updated dependencies [91e33eb]
- Updated dependencies [cef5a53]
- Updated dependencies [79327c2]
- Updated dependencies [40b44ce]
- Updated dependencies [d9eecbc]
- Updated dependencies [cd5c89e]
- Updated dependencies [a4943a9]
- Updated dependencies [cc50650]
- Updated dependencies [b1b7350]
- Updated dependencies [d2ade33]
- Updated dependencies [a554319]
- Updated dependencies [5c0f6b4]
- Updated dependencies [69d84bb]
- Updated dependencies [4c41c94]
- Updated dependencies [cc50650]
- Updated dependencies [87b8219]
- Updated dependencies [2271b43]
- Updated dependencies [e4a6c42]
- Updated dependencies [27abb62]
- Updated dependencies [bdbfa41]
- Updated dependencies [87b8219]
- Updated dependencies [5a9cb42]
  - @repo/desk@0.6.0

## 0.1.2

### Patch Changes

- Updated dependencies [54c80df]
  - @repo/desk@0.5.2

## 0.1.1

### Patch Changes

- Updated dependencies [40cca08]
- Updated dependencies [ccdac99]
- Updated dependencies [40cca08]
- Updated dependencies [22dd10f]
  - @repo/desk@0.5.1

## 0.1.0

### Minor Changes

- 500e8a7: Add `pnpm doc:export`, which exports a small Markdown subset to Word (`.docx`) and PowerPoint (`.pptx`) files with the same bytes for the same input, and verifies exported files with `--verify`. The tool keeps its input and output inside the repository and outside dot-directories, `node_modules`, and the desk's protected paths. Agent Desk agents gain opt-in extra tools (`capabilities.tools`, catalog `doc-export`) for the edit-code preset: the resolver allows exactly `pnpm doc:export`, the capability profile and run receipt list `extraTools`, and the Agents page adds an Extra tools field with new `desk` translation keys.

### Patch Changes

- Updated dependencies [500e8a7]
- Updated dependencies [500e8a7]
  - @repo/desk@0.5.0
