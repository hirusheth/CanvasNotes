# Feature parity with Milanote (checked with REA)

This is the check of whether Canvas Notes covers what Milanote does. The
feature list wasn't written from memory. It comes from Milanote's own web
client, captured with REA:

1. `rea inspect-web-page --include-script-sources` on `app.milanote.com`, then
   `rea export-web-scripts`, saved the bundles: `main`, `workspace`, and
   `locales-en`, which holds every UI string.
2. The English locale bundle was split into its namespaces: `toolbar`,
   `elements`, `popup`, `canvas`, `modal.shortcuts`, `appHeader`, `settings` and
   others. Every tool, element type, menu item, popup, shortcut and export
   option has a string there, so the list below is complete as far as the UI
   goes.
3. Each entry was then built and tested in a browser (desktop, simulated
   iPhone and iPad with real touch events), or marked as not built, with the
   reason.
4. The rows are re-checked automatically by `tests/parity.e2e.js`
   (`npm run test:parity` against a server with an empty `DATA_DIR`). It drives
   the real UI in headless Chrome and verifies what the server stored: 75
   checks, last run 75/75 on 2026-10-25. Touch gestures (double-tap, hold-drag,
   hold-menu, pinch) were verified separately with Chrome DevTools touch
   emulation.

✅ built and tested · ◐ partly built · ✗ not built · — doesn't apply to a
single-user, self-hosted app

## Elements (`toolbar.tools.elements`, `elements.elementTypes`)

| Milanote | Status | Notes |
|---|---|---|
| Note (`card`) | ✅ | Rich text, Markdown shortcuts, colours |
| Heading | ✅ | Three sizes |
| Link | ✅ | Server-side preview: title, description, image. Replace or refresh the preview |
| Video | ✅ | YouTube, Vimeo, Loom embeds. Uploaded video files play inline |
| Audio | ✅ | Spotify and SoundCloud embeds. Uploaded audio plays inline |
| Map | ✅ | Google Maps and OpenStreetMap links embed |
| To-do (`taskList`, `task`) | ✅ | Title, progress, indent levels, due dates (overdue / today), delete completed |
| Line | ✅ | Attaches to cards, label, arrowheads, dashed, weight, colour |
| Board | ✅ | Nested boards, icon (emoji, letters, uploaded image), colour, description |
| Shortcut (`alias`) | ✅ | Find original, duplicate the shortcut or the board it links to |
| Column | ✅ | Drag in and out, ordering, collapse, colour |
| Comment (`commentThread`) | ✅ | Thread card with replies, edit, delete (single user, no mentions) |
| Table | ✅ | Formulas, cell types, alignment, colour, row/column operations |
| Spreadsheet | ✅ | Table card; dropping a CSV/TSV file imports it as a table |
| Image | ✅ | Upload, paste, drop, caption, replace, download original |
| File / Upload | ✅ | Any file. PDF preview, download, copy link |
| Sketch | ✅ | Pen, eraser, 8 colours plus custom, 4 weights, undo/redo, save/discard |
| Annotation (draw on image) | ✅ | "Draw On" any image |
| Document | ✅ | Full-screen editor, word count, export to Markdown, text, Word, PDF |
| Colour swatch | ✅ | Picker, name, hex |
| Synced copy (`clone`) | ✅ | Editing one copy updates the others; badge shows the count; stop syncing |
| Folder | ✅ | A collapsible folder-style column (its exact Milanote behaviour couldn't be confirmed from the bundle) |
| Image/File placeholder | ✅ | Empty slot you drop or pick a file into |

## Selected-card tools (`toolbar.tools.selected`)

| Milanote | Status | Notes |
|---|---|---|
| Colour (card colour, background) | ✅ | 8 colours, default, custom colour picker |
| Colour mode: top strip vs background (`popup.color.modeSwitcher`) | ✅ | Switchable per card |
| Caption / description | ✅ | Boards, shortcuts, links, files, swatches, sketches, tables, documents |
| Labels | ✅ | Create, colour, rename, delete with confirmation, usage count, filter in search |
| Connect | ✅ | "Connect with Lines" plus the line tool |
| Alignment, Distribute | ✅ | Left/centre/right/top/middle/bottom, distribute across or down |
| Collapse | ✅ | Columns |
| Draw on, Edit drawing | ✅ | |
| Icon | ✅ | |
| Rename, Title | ✅ | |
| Preview, Media, Link info | ✅ | |
| File info | ✅ | Panel with name, type, size, dimensions, dates |
| Edit image (crop) | ✅ | Crop editor with handles; crop to fit the dot grid |
| Transparent | ✅ | Card colour option |
| Autoplay, Loop, Start, End (video) | ✅ | For YouTube/Vimeo embeds and uploaded media |
| Reactions | ✅ | Emoji reactions on cards (single user) |

## Text editing (`toolbar.tools.editing`, `toolbar.textStyles`, `popup.textStyle`)

| Milanote | Status |
|---|---|
| Bold, italic, underline, strikethrough, inline code | ✅ |
| Hyperlink, link to board, divider line, emoji | ✅ |
| Bullet list, numbered list, checkbox, indent, un-indent | ✅ |
| Align left/centre/right | ✅ |
| Text colour, highlight colours | ✅ |
| Styles: normal, large heading, heading, small heading, small text, quote, callout, code block | ✅ |
| Clear formatting | ✅ |
| Markdown shortcuts `#` `##` `*` `1.` `[]` `>` `!` ` ``` ` `---` | ✅ |
| Font, font size | ✅ Font and size picker (Aa) in the note toolbar |
| Paragraph text indent | ✅ Indent / un-indent buttons and Tab work on paragraphs and headings, not just lists |
| Mentions, assign to user | — |

## Tables (`popup.table`, `canvas.contextMenuItems.table`)

| Milanote | Status | Notes |
|---|---|---|
| Add row/column above/below/left/right, delete, move | ✅ | |
| Cell types: auto, text, number, currency, percentage, checkbox, date & time | ✅ | |
| Formulas with circular-reference, divide-by-zero and parse errors | ✅ | SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, ROUND, ABS, SQRT, POWER, IF, AND, OR, NOT, CONCAT, LEN, UPPER, LOWER, TODAY, operators, ranges |
| Alignment, cell colour, bold, header row, clear cell | ✅ | |
| Number format options (decimals, chosen currency, date format) | ✅ | Decimals, currency, date format, thousands separator |
| Multi-cell selection, paste values | ✅ | Shift-select ranges, copy/cut/clear blocks, paste from spreadsheets, paste values |

## Board menu (`canvas.contextMenuItems.canvas`)

| Milanote | Status |
|---|---|
| New note / to-do / column / board / table / comment / link / line | ✅ (plus heading, document, sketch, colour, video, audio, map) |
| Paste, undo, redo, select all | ✅ |
| Change board background, custom colour, revert to default, show dot grid | ✅ |
| New folder, new image/file placeholder | ✅ |
| New public template | — (Milanote staff tool) |

## Card menu (`canvas.contextMenuItems.element`)

| Milanote | Status |
|---|---|
| Copy, cut, paste, duplicate, move to trash | ✅ |
| Bring to front, send to back | ✅ |
| Lock / unlock position | ✅ |
| Group into column, connect with lines | ✅ |
| Convert to note / document / board / heading / to-do | ✅ |
| Copy a link to this board, open in new tab, create a shortcut, duplicate the board it links to, find original board | ✅ |
| Copy link address, copy link to file, open file, download, download original image, replace image, replace preview | ✅ |
| Paste styles (and copy style) | ✅ |
| Rename, choose custom colour, add image (via image tool) | ✅ |
| Convert to template, revert template to board | ✅ |
| Created / modified time | ✅ |
| Convert to sketch card | ✅ |
| Create synced copy | ✅ |
| Crop image to fit dot grid, download SVG | ✅ |

## Boards, navigation and organising

| Milanote | Status | Notes |
|---|---|---|
| Breadcrumbs, go to parent, back/forward, drag cards onto a breadcrumb to move them up | ✅ | |
| Unsorted (`canvas.inbox`) | ✅ | Per-board panel, quick add, drag out to the board, `U` to send cards there |
| Quick notes (from your phone) | ✅ | A Quick notes panel shared by every board, reachable from any device (no separate native app) |
| Templates: choose, keep example content, your custom templates, convert / revert | ✅ | No public template gallery |
| Trash: restore, delete, empty trash with confirmation | ✅ | |
| Search (`appHeader.tools.boardSearch`): matches, sort by relevance / last modified / last viewed, labels, recently viewed | ✅ | "Shared with" filter doesn't apply |
| Presentation mode | ✅ | Full screen, steps through cards, opens boards |
| Board password protection | ✅ | Per-board passwords (hashed on the server; contents withheld until unlocked), on top of the app sign-in |

## Export (`appHeader.tools.export`)

| Milanote | Status |
|---|---|
| Current board layout as PNG | ✅ |
| As PDF | ✅ (through the browser's print dialog) |
| Linear document: Markdown, plain text, Word, include sub-boards | ✅ |
| Download all images and files as a ZIP | ✅ (includes sub-boards, one folder per board) |
| Export a single element | ✅ (notes, documents, tables, sketches) |
| Whole-account backup | ✅ (JSON export/import, not in Milanote) |

## Shortcuts (`modal.shortcuts`)

Every section is covered: the basics, navigation, zoom, appearance (dark mode,
larger/smaller interface), text formatting, Markdown, to-do lists and drawing.
The drawing tools are all there too: the colour eyedropper (I, picks a stroke's
colour or an image pixel), the selection tool (V, box-select strokes, drag to
move, Delete), and the colour-palette toggle (C).

## Settings (`settings.*`)

| Milanote | Status |
|---|---|
| Appearance (light / dark / system), interface size | ✅ |
| Toolbar options (choose tools) | ✅ |
| Localization: numbers & dates format, currency, 12/24-hour time | ✅ Settings → Localization; tables, due dates and timestamps follow it |
| Localization: interface language | ✅ English, Español, Français, Português, the languages Milanote offers everyone. Its German, Chinese, Russian, Polish, Japanese, Dutch, Italian and Korean options sit behind experiment flags in its bundle and are not added here |
| Notifications, privacy, account, billing | — |

## Devices

| Need | Status |
|---|---|
| Laptop: mouse, trackpad, keyboard | ✅ |
| iPad: touch, pinch zoom, long-press drag, long-press menu, side toolbar | ✅ |
| Phone: bottom toolbar, sheet menus, full-screen editors, action bar for selected cards | ✅ |
| Install to home screen (manifest, icons, standalone) | ✅ |
| Hosted: password login with a one-year signed cookie, rate-limited, HTTPS-aware, Docker | ✅ |

## Out of scope (multi-user or Milanote's services)

Sharing with other people, team and billing, notifications, mentions,
assignments, real-time collaboration, sign-up and onboarding, the native
desktop and mobile apps, and the admin tools.

Added beyond the first pass, though Milanote has them: **read-only public
links** for a board (contents of password-locked boards stay hidden), **image
search** (Wikimedia Commons, no key needed), and **AI Ideas** (brainstorm cards
with Claude; needs `ANTHROPIC_API_KEY` on the server).
