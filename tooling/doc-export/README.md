# Document export

`@repo/doc-export` turns a Markdown file into a Word document (`.docx`) or a PowerPoint deck
(`.pptx`), and checks exported files. Agent Desk agents run it through the `doc-export` extra
tool (see `docs/agents/agent-desk.md`, "Extra tools"). People can run it too.

## Usage

Run it from the repository root. Paths are relative to the root.

```sh
pnpm doc:export docs/plan.md --to docx --out exports/plan.docx
pnpm doc:export docs/plan.md --to pptx --out exports/plan.pptx
pnpm doc:export --verify exports            # files or folders, one or more
```

- `--to docx|pptx` and `--out <path>` are required for an export. The tool creates missing
  parent folders and replaces an existing file.
- `--verify <path>...` reads each `.docx` and `.pptx` file. A folder is searched recursively
  (`.git` and `node_modules` are skipped, symlinks are not followed). It prints one line per
  file: `ok   <path> (<kind>, <n> parts)` or `FAIL <path>: <reason>`. A file passes when it is a
  ZIP archive with `[Content_Types].xml`, `_rels/.rels`, and `word/document.xml` (docx) or
  `ppt/presentation.xml` and at least one `ppt/slides/slideN.xml` (pptx). A path that does not
  exist, or a folder without exports, fails.
- Exit codes: `0` done, `1` refused or failed, `2` usage error.

## Markdown subset

The parser is small and hand-written.

| Markdown                 | Word                                    | PowerPoint                                                 |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------- |
| first `# Title`          | Heading 1, and the title property       | Title slide. The paragraph right after it is the subtitle. |
| other `#`, `##`          | Heading 1, Heading 2                    | A new slide with that title                                |
| `###`                    | Heading 3                               | A bold line in the slide body                              |
| paragraph (lines joined) | Paragraph                               | A line in the slide body                                   |
| `- item`, `* item`       | Bulleted list                           | Bulleted line                                              |
| `1. item`                | Numbered list (each list restarts at 1) | Numbered line                                              |
| `**bold**`, `` `code` `` | Bold, monospace                         | Bold, monospace                                            |

Anything else (tables, links, code fences, `####`) stays as plain paragraph text, so no text is
dropped. A blank line ends a paragraph or list item. Content before the first slide heading goes
on a slide titled with the deck title. Without a `#` heading, the file name is the title.

Exports are deterministic: the same input gives the same bytes. The creator is `Kaine Forge`,
and the created and modified dates and the ZIP entry dates are fixed at `2000-01-01T00:00:00Z`.
Decks use the `LAYOUT_16x9` layout.

## Safety rules

Agents run the tool through Bash, so the tool enforces its own limits. It uses real paths, so
`..` segments and symlinks cannot leave the repository.

- The input is an existing `.md` file inside the repository.
- The output is inside the repository and ends in the extension that `--to` names.
- The output is not inside a dot-directory (`.git`, `.github`, `.ai`, `.desk`, `.ai.local`, and
  every other folder whose name starts with `.`) or `node_modules`, and it is not a path that
  the Agent Desk protects (`protectedPathReason` from `@repo/desk`).
- An existing output must be a regular file, not a symlink or a folder.
- The tool uses no network and starts no child process.

## Tests

```sh
pnpm --filter @repo/doc-export test
```
