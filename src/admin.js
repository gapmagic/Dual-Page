// Owner-only usage stats: GET /admin (page) and GET /api/admin/stats (data, needs the admin key).
// The key travels in the URL fragment (#k=...) and an x-admin-key header, never in a query string.
// wrangler.toml holds only its SHA-256 (ADMIN_KEY_HASH); an ADMIN_KEY secret also works.

const DAY = 86400;
const noStore = { "cache-control": "no-store", "x-robots-tag": "noindex" };

async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authorized(req, env) {
  const key = req.headers.get("x-admin-key") || "";
  if (!key) return false;
  const want = env.ADMIN_KEY ? await sha256(env.ADMIN_KEY) : env.ADMIN_KEY_HASH;
  if (!want) return false;
  const got = await sha256(key);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i % want.length);
  return diff === 0;
}

const utcDay = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

// Rooms made by the deploy smoke test (host "smoke", book "Smoke") are left out of every count.
const SMOKE = `SELECT r.id FROM rooms r JOIN members m ON m.room_id = r.id AND m.role = 'host'
  WHERE m.name = 'smoke' AND r.book_title = 'Smoke'`;

export async function stats(env) {
  const db = env.DB;
  const t = Math.floor(Date.now() / 1000);
  const d7 = utcDay(t - 6 * DAY), d30 = utcDay(t - 29 * DAY);
  const one = (sql, ...b) => db.prepare(sql).bind(...b).first();
  const realMembers = `SELECT id FROM members WHERE room_id NOT IN (${SMOKE})`;
  const [devices, rooms, members, active, highlights, perDay] = await Promise.all([
    one(`SELECT COUNT(*) total,
        SUM(member_id IS NOT NULL) in_room,
        SUM(kosync_ts IS NOT NULL) sync_on,
        SUM(created_at >= ?) new7, SUM(created_at >= ?) new30 FROM devices`, t - 7 * DAY, t - 30 * DAY),
    one(`SELECT COUNT(*) total,
        SUM(start_ts IS NOT NULL) started,
        SUM(start_ts IS NOT NULL AND closed_ts IS NULL AND end_ts > ?) running,
        SUM(start_ts IS NOT NULL AND end_ts <= ?) finished,
        SUM(created_at >= ?) new7, SUM(created_at >= ?) new30
      FROM rooms WHERE id NOT IN (${SMOKE})`, t, t, t - 7 * DAY, t - 30 * DAY),
    one(`SELECT COUNT(*) total, SUM(role = 'guest') guests, SUM(created_at >= ?) new7, SUM(created_at >= ?) new30
      FROM members WHERE room_id NOT IN (${SMOKE})`, t - 7 * DAY, t - 30 * DAY),
    one(`SELECT COUNT(DISTINCT CASE WHEN day >= ? THEN member_id END) a7, COUNT(DISTINCT member_id) a30,
        SUM(seconds) secs30
      FROM daily WHERE day >= ? AND member_id IN (${realMembers})`, d7, d30),
    one(`SELECT (SELECT COUNT(*) FROM shares WHERE room_id NOT IN (${SMOKE})) shared,
        (SELECT COUNT(*) FROM highlights WHERE deleted = 0) synced`),
    db.prepare(`SELECT day, COUNT(DISTINCT member_id) n FROM daily
      WHERE day >= ? AND member_id IN (${realMembers}) GROUP BY day ORDER BY day`).bind(d30).all(),
  ]);
  const byDay = new Map(perDay.results.map((r) => [r.day, r.n]));
  const days = [];
  for (let i = 29; i >= 0; i--) { const d = utcDay(t - i * DAY); days.push({ day: d, readers: byDay.get(d) || 0 }); }
  return { generated_at: t, devices, rooms, members, active, highlights, days };
}

export async function adminApi(req, env) {
  if (!(await authorized(req, env))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json", ...noStore } });
  }
  return new Response(JSON.stringify(await stats(env)), { headers: { "content-type": "application/json", ...noStore } });
}

export function adminPage() {
  return new Response(ADMIN_PAGE, { headers: { "content-type": "text/html; charset=utf-8", ...noStore, "referrer-policy": "no-referrer" } });
}

const ADMIN_PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Dual Page stats</title>
<style>
:root{--ink:#1d1b18;--mute:#6b665e;--line:#d9d4ca;--bg:#f6f3ed;--card:#fff;--acc:#2f5d50}
*{box-sizing:border-box}body{margin:0;font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:720px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:20px;letter-spacing:.08em;margin:0 0 4px}h2{font-size:15px;margin:0 0 10px;color:var(--mute);font-weight:600}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 14px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.n{font-size:34px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}.l{font-size:14px;color:var(--mute)}
.muted{color:var(--mute);font-size:14px}
input{width:100%;font:inherit;padding:10px;border:1px solid var(--line);border-radius:8px}
button{font:inherit;padding:10px 14px;border-radius:8px;border:1px solid var(--acc);background:var(--acc);color:#fff;cursor:pointer;margin-top:8px}
.chart{display:flex;align-items:flex-end;gap:2px;height:120px;border-bottom:1px solid var(--line)}
.chart i{flex:1;background:var(--acc);border-radius:2px 2px 0 0;min-height:1px}
.axis{display:flex;justify-content:space-between;font-size:12px;color:var(--mute);margin-top:4px}
.err{color:#a3341f}
</style></head><body><main>
<h1>DUAL PAGE · STATS</h1><p class="muted" id="sub">Owner only</p>
<div id="app"></div>
</main><script>
const app = document.getElementById("app");
let key = "";
try { key = new URLSearchParams(location.hash.slice(1)).get("k") || localStorage.getItem("dp_admin") || ""; } catch {}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const n = (x) => (x || 0).toLocaleString("en-US");
const tile = (v, l) => '<div><div class="n">' + n(v) + '</div><div class="l">' + esc(l) + '</div></div>';
function askKey(msg) {
  app.innerHTML = '<div class="card"><p>' + (msg ? '<span class="err">' + esc(msg) + '</span>' : 'Enter your admin key.') + '</p>'
    + '<input id="k" type="password" autocomplete="current-password"><button id="go">Open</button></div>';
  document.getElementById("go").onclick = () => { key = document.getElementById("k").value.trim(); load(); };
}
async function load() {
  if (!key) return askKey();
  const r = await fetch("/api/admin/stats", { headers: { "x-admin-key": key }, cache: "no-store" });
  if (r.status === 401) { try { localStorage.removeItem("dp_admin"); } catch {} return askKey("That key is not right."); }
  if (!r.ok) return askKey("Server error " + r.status);
  try { localStorage.setItem("dp_admin", key); } catch {}
  if (location.hash) history.replaceState(null, "", location.pathname);
  render(await r.json());
}
function render(s) {
  const D = s.devices, R = s.rooms, M = s.members, A = s.active, H = s.highlights;
  const max = Math.max(1, ...s.days.map((d) => d.readers));
  document.getElementById("sub").textContent = "Updated " + new Date(s.generated_at * 1000).toLocaleString() + " · test rooms from deploys are left out";
  app.innerHTML =
    '<div class="card"><h2>Active readers</h2><div class="grid">' + tile(A.a7, "read in the last 7 days") + tile(A.a30, "read in the last 30 days")
    + tile(Math.round((A.secs30 || 0) / 3600), "hours read, last 30 days") + '</div></div>'
    + '<div class="card"><h2>Readers each day, last 30 days</h2><div class="chart">'
    + s.days.map((d) => '<i title="' + d.day + ': ' + d.readers + '" style="height:' + (d.readers / max * 100) + '%"></i>').join("")
    + '</div><div class="axis"><span>' + s.days[0].day.slice(5) + '</span><span>max ' + max + '</span><span>' + s.days[s.days.length - 1].day.slice(5) + '</span></div></div>'
    + '<div class="card"><h2>Readers with the plugin</h2><div class="grid">' + tile(D.total, "devices installed") + tile(D.in_room, "in a room now")
    + tile(D.sync_on, "turned on highlight sharing") + tile(D.new7, "new, last 7 days") + tile(D.new30, "new, last 30 days") + '</div></div>'
    + '<div class="card"><h2>Rooms</h2><div class="grid">' + tile(R.total, "rooms created") + tile(R.started, "sprints started")
    + tile(R.running, "sprints running now") + tile(R.finished, "sprints finished") + tile(R.new7, "new, last 7 days") + tile(R.new30, "new, last 30 days") + '</div></div>'
    + '<div class="card"><h2>People in rooms</h2><div class="grid">' + tile(M.total, "joined a room (host or guest)") + tile(M.guests, "joined with an invite code")
    + tile(M.new7, "joined, last 7 days") + tile(M.new30, "joined, last 30 days") + '</div>'
    + '<p class="muted">One person in three rooms counts three times.</p></div>'
    + '<div class="card"><h2>Highlights</h2><div class="grid">' + tile(H.shared, "quotes shared with a partner") + tile(H.synced, "highlights synced") + '</div></div>';
}
load();
</script></body></html>`;
