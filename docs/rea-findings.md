# What REA showed about Milanote

Canvas Notes copies Milanote's way of working, not its code. I studied the public
web client with [REA](https://github.com/morluto/rea) to learn how it models a
board, then wrote this app from scratch.

## How the evidence was gathered

1. Opened `https://app.milanote.com/` in headless Chrome with a DevTools port.
   Logged-out visitors land on `/login`, but the whole app bundle still loads.
2. `rea inspect-web-page` listed six inline scripts. It also showed that the app
   code is served from `static.milanote.com`, so later runs allowed that origin.
3. `rea analyze-web-bundle --allowed-origins https://app.milanote.com --allowed-origins https://static.milanote.com --fetch-source-maps`
   captured 24 chunks and fetched source maps for most of them (626 source
   modules, such as `src/client/canvas/selection`). It also listed about 70 client
   routes. The `main`, `workspace`, `tables` and `vendor` maps were too big for
   REA's decoder limits, so REA reported them as unknown.
4. `rea inspect-web-page --include-script-sources` followed by
   `rea export-web-scripts` saved those big bundles so they could be read directly.

## Findings that shaped the design

- **Everything is an element.** Element types in the bundle are `CARD`, `BOARD`,
  `COLUMN`, `LINE`, `IMAGE`, `LINK`, `TASK_LIST`/`TASK`, `FILE`, `COLOR_SWATCH`,
  `SKETCH`, `DOCUMENT`, `TABLE`, `COMMENT_THREAD`, `ANNOTATION`, `AUDIO`, `VIDEO`,
  `ALIAS`/`CLONE`.
- **Each element has a location:** `{ section, parentId, position }`. Sections are
  `CANVAS`, `INBOX` (the "Unsorted" panel), `TRASH`, `DELETED`, `ATTACHED` and
  `QUICK_NOTES`. On the canvas, a position is `{x, y}`. Inside a column it's an
  `index`/`score`, a sortable number. New column items get `score = last + step`.
- **Boards are elements too.** Child elements point to the board element's id as
  their `parentId`. That gives nested boards and breadcrumbs. Shortcuts to a board
  are `ALIAS` elements.
- **Workspace roots:** Home, Templates and Quick notes.
- **Editor shortcuts (from the English strings):** `#` and `##` for headings,
  `*` for bullets, `>` for quotes, `!` for a callout, ```` ``` ```` for code and
  `---` for a divider. Hold space and drag to move around the board. Double-click
  to add a note.

## What Canvas Notes implements

From that model: notes (rich text with the same markdown shortcuts), boards
nested inside boards with breadcrumbs, columns with drag-in and drag-out
ordering, to-do lists, images, files, link cards with previews, colour swatches,
and lines that connect cards with labels and arrowheads. Also Trash with restore,
search, undo/redo, copy/paste, dark mode, and JSON export/import. The element
location is simplified to `{ parentId, section: canvas | trash, columnId, order, x, y }`.

Not built (yet): sketches, tables, comments, documents, the Unsorted inbox,
templates, sharing and real-time collaboration.
