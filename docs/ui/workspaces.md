# Workspace specs

These are the product rules of the template's own screens: the app shell, the dashboard, the Assistant, Notes, Todos, and the agent desk. They hold under every theme. The general rules live in `DESIGN_SYSTEM.md` and `docs/ui/guidelines.md`.

## Shell and dashboard

Use aligned rows and dividers for work lists. The dashboard shows real Active Organization counts (open Todos, Notes, unread notifications) and recent items that link to the existing workflows; it does not show invented analytics. Web/desktop use a full-height sidebar; mobile retains a drawer with explicit preferences. All existing platform capabilities stay available.

## Sidebar preferences

Web/desktop sidebar preferences use two neutral, labeled footer rows: Language, then Appearance, with muted current values. Collapsing keeps both controls mounted in the same vertical positions and shows icon tooltips with their current values. Expanded menus open upward; collapsed menus open to the right, with viewport collision handling. Use native language names and radio selection semantics. The responsive web drawer keeps full labels and 48px control heights. `ShellSelectControl` supports an optional `compact` display and `NavPreferences` supports a `footer` layout; existing defaults remain available.

## Assistant

The web/desktop AI Assistant uses a viewport-height split workspace. A 256px conversation rail appears from 1024px; narrower screens use a history Sheet. History and transcript scroll independently, with the conversation header and composer kept visible. User messages use the selected surface; assistant replies use the neutral surface, with a maximum 768px reading column. The labeled composer grows from two to six lines, with a two-line ceiling on short viewports. Starter prompts fill the composer without sending. Status text announces thinking and responding without announcing every streamed token. Reading older messages suspends scroll following until the user selects “Jump to latest.” Confirmed Todo and Note results link to the existing workflows; a collapsed Activity disclosure contains the returned action list. Failures retain the prompt and distinguish unavailable configuration from uncertain actions. Theme and language changes preserve drafts and scroll; Active Organization changes reset route-local state.

## Notes

The web/desktop Notes workspace shows a 288px searchable note rail from 1024px. Narrower screens show the list or editor according to the URL, with Back to Notes restoring list focus. The rail and document scroll independently; the workspace header and Save action remain visible. The plain-text writing column has a maximum width of 768px. New note opens a local draft; its first successful Save creates a saved URL. Title/body edits require Save (Ctrl/Cmd+S), while linked Todo checklist changes save immediately. Unsaved drafts remain reachable above search results and survive note, theme, and language changes within the workspace. Leaving with drafts requires an explicit discard decision; Organization changes wait for pending mutations. External changes never replace a dirty draft, and deleted notes retain recoverable draft text. Search covers saved titles and bodies across the Active Organization, with 50-note pages and Load more. Search does not include unsaved text. Drafts are in memory only and clear when the workspace or Active Organization changes.

## Todos

The web/desktop Todos workspace uses a single list with a maximum width of 1024px. Quick creation shares its title and optional description with the Add details dialog. A labeled search and All/Open/Completed controls filter saved titles and descriptions across the Active Organization, with 50-item pages and Load more. Search and status live in the URL; All is the default. The toolbar remains visible above an independently scrolling list from 768px on viewports at least 640px tall. Smaller or shorter screens use normal document scrolling. Rows separate completion checkboxes from title buttons, show a description preview and localized update date, and disclose attachments on demand. Menus contain deletion, AI generation, and form examples. Completion changes wait for confirmation; title/description saves never resend completion. Drafts survive filtering, theme, and language changes; leaving warns about unsaved text and waits for pending operations. Attachment uploads remain attached to their originating Todo even when filtered out. Errors stay beside the affected action, and uncertain creation is never retried automatically. Counts describe loaded results, not Organization-wide totals. The shared shell navigation guard preserves the same protection for Notes.

## Agent desk

The agent desk (`tooling/desk-ui`) uses the brand color only where the person acts. The rule keeps the eye on the next decision.

- Use the brand color for the logo mark, primary action buttons, links, and a count of items that need the person. Make a count quiet (`.desk-count--quiet`, or `data-empty` for zero) when it asks for nothing.
- Show selection in ink, not the brand color: the active page is a raised neutral pill (`--ds-surface-raised`, `--ds-border-strong`), and the active tab and the selected stage use `--ds-text`.
- Frame cards with a `--ds-border` hairline, `--ds-radius-250`, and 20px padding. Do not add a shadow. Use `--ds-surface-sunken-bold` for quiet fills such as tags and neutral counts, and `--ds-surface-inverse` with `--ds-text-surface-inverse` for terminal output and toasts.
- Give each status chip a glyph as well as its words (`.desk-chip__glyph`), so a status reads without color.
- Remove animation and transitions when the person asks for reduced motion.
