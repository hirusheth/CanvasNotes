# Canvas Notes

A personal, self-hosted visual notes app in the style of Milanote. Put notes,
headings, to-do lists, tables, sketches, documents, images, files, links,
videos, maps and colour swatches anywhere on an endless board. Group them in
columns, connect them with arrows, label them, and put boards inside boards.
It works on a laptop, an iPad and a phone.

Your data stays on your server: notes are kept in a SQLite file and uploads in
a folder, both under `data/`.

`docs/feature-parity.md` compares every Milanote feature (taken from its UI
strings with REA) against what's built here. `docs/rea-findings.md` explains how
the data model was studied.

## Run it locally

Needs Node.js 22.13 or newer (it uses the built-in `node:sqlite`). The repo's
`.nvmrc` pins Node 24.

```bash
npm install
npm run build
npm start            # http://127.0.0.1:5180
```

For development with hot reload: `npm run dev` (same port; Vite runs inside the server).

`npm start` and `npm run dev` read a `.env` file in the project folder if there is
one (it's git-ignored). To open it from your phone or iPad on the same Wi-Fi:

```bash
printf 'HOST=0.0.0.0\nCANVASNOTES_PASSWORD=choose-a-password\n' > .env
npm start            # prints the http://<ip>:5180 addresses to open
```

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `5180` | Port to listen on |
| `HOST` | `127.0.0.1` | `0.0.0.0` to accept connections from other devices |
| `DATA_DIR` | `./data` | Where the database and uploads live |
| `CANVASNOTES_PASSWORD` | unset | Turns on the sign-in page. **Required once it's reachable from other devices** |
| `ANTHROPIC_API_KEY` | unset | Optional. Turns on **AI Ideas** (brainstorm cards with Claude) |

The interface language (English, Español, Français, Português, Deutsch,
Italiano, Nederlands, Polski, Русский, 日本語, 中文, 한국어), number and date
formats, the default currency and 12/24-hour time are set per device in
**Settings → Localization**.

## Host it (for phone, iPad and laptop)

1. **Run it on a server** (a VPS, a home server or a Raspberry Pi):

   ```bash
   echo 'CANVASNOTES_PASSWORD=choose-a-long-password' > .env
   mkdir -p data                 # must be writable by uid 1000 (the container's user)
   docker compose up -d          # data is kept in ./data
   ```

   Without Docker: `HOST=0.0.0.0 CANVASNOTES_PASSWORD=… npm start`, kept running
   with systemd or pm2.

2. **Put HTTPS in front of it.** The session cookie is marked `Secure` behind
   HTTPS. Never type the password over plain HTTP on the internet. With
   [Caddy](https://caddyserver.com), which gets certificates automatically:

   ```
   notes.example.com {
       reverse_proxy 127.0.0.1:5180
   }
   ```

   Serve it at the root of a domain or subdomain, not under a sub-path. For
   private access without a public domain, Tailscale works too: it gives you
   HTTPS on your own devices.

3. **On iPhone or iPad**, open the site in Safari, then Share → *Add to Home
   Screen*. It opens full screen like an app and stays signed in for a year.
   On Android, use Chrome → *Install app*.

Signing in sets an HttpOnly cookie signed with a per-install secret
(`data/.session-secret`). Changing the password signs every device out. After
ten wrong attempts in 15 minutes, sign-in is blocked for a while. Use **⋯ → Sign
out** on a shared device.

Back up by copying `data/`, or use **⋯ → Export backup** for one JSON file.
**Import backup** can merge that file in or replace everything.

## Using it

**Laptop.** Double-click the board for a note. Drag tools in from the left, or
click one to drop it in the middle of the view. Scroll or hold space and drag to
move around. Ctrl + scroll zooms. Drag on empty space to select several cards.
Right-click anything for its menu. `?` lists every shortcut.

**iPad and phone.**
- Double-tap the board to write a note.
- Tap a tool (along the bottom on a phone) to add it.
- Pinch to zoom. Drag with one finger to move around.
- Press and hold a card, then drag, to move it. Hold it still to open its menu.
- Press and hold empty space, then drag, to select several cards.
- Selected cards get an action bar: Edit, Duplicate, More, Delete.

**Cards.**
- Notes support Markdown shortcuts (`# `, `## `, `* `, `1. `, `[] `, `> `,
  `! ` for a callout, ```` ``` ````, `---`), text colours, highlights,
  alignment, and links to other boards.
- To-do lists have indent levels (Tab) and due dates.
- Tables calculate formulas like `=SUM(B2:B9)` and `=IF(C2>10,"big","small")`.
- Paste or drop links, images and files straight onto the board. YouTube,
  Vimeo, Spotify, SoundCloud and Google Maps links become players and maps.

**Organising.**
- **Unsorted** (`U`) is a holding area for each board.
- **Templates**: right-click a board → *Convert to Template*.
- **Labels**: right-click → *Labels…*, then filter search by label.
- **Export**: the download icon → PNG, PDF, Markdown, Word, or a ZIP of all
  files.
- **Presentation mode**: Ctrl Shift P, then the arrow keys.
- **Quick notes**: the inbox icon in the top bar. One holding area shared by every board, handy from your phone.
- **Private boards**: right-click a board → *Password Protect…*. Its contents stay on the server until you unlock it.
- **Share read-only**: right-click a board → *Publish Read-only Link*. Anyone with the link can view it without signing in. *Unpublish* turns it off.
- **Synced copies**: right-click a card → *Create Synced Copy*. Editing one updates the others.

## Checking it

`npm run test:parity` drives the real app in headless Chrome and checks every
feature in `docs/feature-parity.md` (103 checks, about 4 minutes), including touch
gestures in a phone-sized touch context and the hosted sign-in on a second,
password-protected server it starts on port 5191. Run it with Node 22.5 or newer,
like the server. Start a
server with an empty `DATA_DIR` first, for example
`DATA_DIR=/tmp/cn-test npm start`. It uses the system Chrome; set
`CHROME_PATH` if yours is elsewhere, and `CANVASNOTES_URL` for another address.

## How it's built

- `server/` is a dependency-free Node server: a JSON API over `node:sqlite`,
  uploads, link previews (`/api/unfurl`), a ZIP of a board's files, and
  password sign-in (`auth.mjs`). It also serves the built client.
- `src/` is React and TypeScript, built with Vite. TipTap is the rich-text
  editor.
  - `store.ts` holds element state, undo/redo, and debounced autosave.
  - `viewport.ts` holds per-board pan and zoom, plus the measured card rects.
  - `components/Canvas.tsx` handles every mouse and touch gesture.
  - `elements/` renders each card type. `formula.ts` is the table formula
    engine. `exporters.ts` handles board exports.
