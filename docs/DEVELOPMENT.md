# Dual Page: technical notes

**Backend:** Cloudflare Workers + D1 (SQLite) + KV (epub files). No framework and no runtime dependencies.

```
src/index.js    Router: website (/), API (/api/*), device endpoints (/d/<token>/*), KOSync (/kosync/*)
src/logic.js    Streak, sprint, daily goal, shared-book matching, partial MD5, quotes trimmed to 300 characters
src/screen.js   Sleep-screen layouts (reading, waiting, recap, no room)
src/bmp.js      1-bit canvas with BMP/PNG output
src/font.js     Glyph font generated from DejaVu (tools/gen_font.py), with full Vietnamese diacritics
src/plugin.js   Builds the per-reader CrossPoint plugin (device.json, config.json, manifest.json, plugin.js)
src/ko/main.lua KOReader plugin (served to readers, updates itself)
src/zip.js      Store-only zip writer
src/web.js      Companion website (English and Vietnamese)
src/admin.js    Owner-only usage stats at /admin (key hash in wrangler.toml ADMIN_KEY_HASH)
schema.sql      Tables: rooms, members, daily, devices, highlights, shares, kosync, seen_events, quotes
migrations.sql  Added columns (safe to run repeatedly)
```

### How the CrossPoint plugin works

The plugin is just config files on the SD card. The firmware calls the server on events:

- `reader.session` sends `POST /d/<token>/session` at the end of a reading session, with start/end %, seconds, document ID and file name.
- `reader.exit` sends the % when leaving a book.
- `sleep.enter` downloads `/d/<token>/sleep.bmp` to `/sleep.bmp`. That is the sleep screen.
- The plugin menu is the JSON catalog `/d/<token>/home`. Each tappable row is a small "download" of `/d/<token>/act/<id>`, used for nudges, extensions, sharing, or saving the epub to `/DualPage`.
- Highlights arrive through KOSync's **Sync Clippings**: `PUT /kosync/api/v1/clippings/<doc>`.

Each reader has its own **device token** tied to a person in a room. When they switch rooms, the server re-links the token, so the plugin never needs reinstalling.

### Main API (`/api/*`)

`rooms` (create a room) · `join` · `state` · `device` · `accept` · `sprint` · `extend` · `nudge` · `nudge/dismiss` · `share` · `rebind` · `leave` · `lang` · `book/title` · `book/upload` · `book/file` · `plugin.zip` · `koplugin.zip`

### Run locally

```bash
npm ci
npx wrangler d1 execute readpal --local --file schema.sql
npx wrangler d1 execute readpal --local --file migrations.sql
npx wrangler dev --local        # http://localhost:8787
```

### Deploy

Every push to `main` runs `scripts/deploy.sh` through GitHub Actions (`.github/workflows/deploy.yml`). The script:
- creates the D1 database `readpal` and KV namespace `dualpage-books` if missing, and runs the schema and migrations;
- deploys the `dualpage` Worker (custom domain **dualpage.online**);
- runs a smoke test that creates a room on dualpage.online.

The repo needs a `CLOUDFLARE_API_TOKEN` secret (Workers Scripts, D1 and Workers KV permissions).
