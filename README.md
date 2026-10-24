# Canvas Notes

A personal, self-hosted visual notes app in the style of Milanote. Put notes,
to-do lists, images, links, files and colour swatches anywhere on an endless
board. Group them in columns, connect them with arrows, and put boards inside
boards.

Everything stays on your machine. Notes are kept in a SQLite file and uploads in
a folder, both under `data/`.

## Run it

Needs Node.js 22.13 or newer (it uses the built-in `node:sqlite`). The repo's
`.nvmrc` pins Node 24.

```bash
npm install
npm run build
npm start            # http://127.0.0.1:5180
```

For development with hot reload:

```bash
npm run dev          # same port, Vite runs inside the server
```

Settings (environment variables):

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `5180` | Port to listen on |
| `HOST` | `127.0.0.1` | Set to `0.0.0.0` to use it from your phone on the same network |
| `DATA_DIR` | `./data` | Where the database and uploads live |
| `CANVASNOTES_PASSWORD` | unset | If set, the browser asks for this password (HTTP Basic auth) |

Back up by copying `data/`, or use **⋯ → Export backup** to get one JSON file.
**Import backup** can merge that file in or replace everything.

## Using it

- **Double-click** the board to write a note. Click a selected card again, or press
  **Enter**, to edit it.
- **Drag tools** from the left bar onto the board, or click one to drop it in the
  middle of the view. If you drop it on a column, it goes into the column.
- **Drag cards into columns.** A blue line shows where the card will land. Drag a
  card onto a board card to move it inside that board.
- **Line tool (L):** drag from one card to another to connect them. Drag a selected
  line's end dots to reattach them, double-click a line to label it, and
  right-click it to change the arrowheads or make it dashed.
- **Right-click** any card to change its colour, duplicate it, change its layer
  order or delete it.
- **Paste** text, links or images straight onto the board, or drag files in from
  your computer.
- **Ctrl K** searches everything. **?** lists all the shortcuts.
- Notes support markdown shortcuts: `# `, `## `, `* `, `1. `, `[] `, `> `,
  ```` ``` ````, `---`.

## How it's built

- `server/` is a dependency-free Node server: a JSON API over `node:sqlite`, file
  uploads, link previews (`/api/unfurl`), and the static client.
- `src/` is React and TypeScript, bundled with Vite. TipTap is the note editor.
  - `store.ts` holds element state, undo/redo, and debounced autosave to `/api/ops`.
  - `viewport.ts` holds per-board pan and zoom, plus the measured card rects used
    for lines and drop targets.
  - `components/Canvas.tsx` handles every pointer gesture: pan, marquee selection,
    dragging, resizing and drawing lines.
  - `elements/` renders each card type.

`docs/rea-findings.md` explains how Milanote's data model was studied with REA
and how it shaped this app.
