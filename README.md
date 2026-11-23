# Dual Page for XTeink (CrossPoint)

Two readers keep a shared reading streak. Backend: Cloudflare Workers + D1.
Device side: an SD-card plugin for CrossPoint firmware (no firmware build).

- `src/index.js` – API (`/api/*`, web companion) and device endpoints (`/d/<token>/*`)
- `src/logic.js` – streak, daily target, sprint, progress ingestion
- `src/screen.js`, `src/bmp.js`, `src/font.js` – 480x800 1-bit sleep-screen BMP
- `src/plugin.js` – per-person plugin folder (device.json events + on-device catalog)
- `src/web.js` – companion web page

## Deploy
```
npm install
npx wrangler d1 create readpal        # put database_id in wrangler.toml
npx wrangler d1 execute readpal --remote --file schema.sql
npx wrangler deploy
```
With an API token: `CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx wrangler deploy`.

## How the device side works
- `reader.session` (POST, connect at sleep) – active reading summary: start/end progress, seconds, KOSync document hash.
- `reader.exit` – percent when leaving a book.
- `sleep.enter` – downloads `/sleep.bmp` (needs Sleep Screen = Custom) with the current percent in the query string.
- Home → Plugins → Dual Page – status list; rows trigger actions (nudge, extension) via tiny downloads into `/.dualpage`.
  Search saves a quote.
