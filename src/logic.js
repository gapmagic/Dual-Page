// Room state: streaks, daily targets, sprint phases, progress ingestion.
export const FULL = 10000; // progress in basis points
const DAY = 86400;

const fmtCache = {};
export function localDay(ts, tz) {
  if (!fmtCache[tz]) {
    try {
      fmtCache[tz] = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      fmtCache[tz] = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
    }
  }
  return fmtCache[tz].format(new Date(ts * 1000));
}
export function localTime(ts, tz) {
  try {
    return new Intl.DateTimeFormat("vi-VN", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts * 1000));
  } catch {
    return new Date(ts * 1000).toISOString().slice(11, 16);
  }
}
export function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function dayDiff(a, b) {
  const p = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(b) - p(a)) / 86400000);
}
export const now = () => Math.floor(Date.now() / 1000);
export const pct = (bp) => Math.round((bp || 0) / 100);

export function randomHex(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export function inviteCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = new Uint8Array(3);
  crypto.getRandomValues(b);
  return "XTE-" + [...b].map((x) => A[x % A.length]).join("");
}

function sprintTotalDays(room) {
  if (room.start_ts && room.end_ts) return Math.round((room.end_ts - room.start_ts) / DAY);
  return room.sprint_days;
}

// Builds per-member daily view: gain(day), done(day).
function memberDays(m, rows, room) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const sorted = [...rows].sort((a, b) => (a.day < b.day ? -1 : 1));
  const finishedDay = m.finished_ts ? localDay(m.finished_ts, m.tz) : null;
  const gain = (day) => {
    const r = byDay.get(day);
    if (!r) return 0;
    let prev = m.baseline_bp ?? 0;
    for (const s of sorted) if (s.day < day && s.max_bp > prev) prev = s.max_bp;
    return Math.max(0, r.max_bp - prev);
  };
  const done = (day) => {
    if (!m.target_bp) return false;
    if (finishedDay && day >= finishedDay) return true;
    return gain(day) >= m.target_bp;
  };
  const seconds = rows.reduce((a, r) => a + (r.seconds || 0), 0);
  return { gain, done, seconds, byDay };
}

export async function loadMember(db, token) {
  if (!token || token.length < 16) return null;
  return db.prepare("SELECT * FROM members WHERE token = ?").bind(token).first();
}

export async function computeState(db, me) {
  const t = now();
  const room = await db.prepare("SELECT * FROM rooms WHERE id = ?").bind(me.room_id).first();
  const { results: members } = await db.prepare("SELECT * FROM members WHERE room_id = ? ORDER BY created_at").bind(room.id).all();
  const partner = members.find((x) => x.id !== me.id) || null;
  const ids = members.map((x) => x.id);
  const { results: daily } = await db
    .prepare(`SELECT * FROM daily WHERE member_id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all();
  const { results: quotes } = await db
    .prepare(`SELECT * FROM quotes WHERE member_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at DESC LIMIT 50`)
    .bind(...ids)
    .all();

  // Highlights of the shared book (clippings synced from the readers).
  const { results: hl } = await db
    .prepare(`SELECT * FROM highlights WHERE deleted = 0 AND member_id IN (${ids.map(() => "?").join(",")}) ORDER BY share_ts DESC, created_at DESC, rowid DESC LIMIT 60`)
    .bind(...ids)
    .all();
  const docsFor = (m) => new Set([room.book_doc, m.book_doc].filter(Boolean));
  const hlFor = (m) => {
    const docs = docsFor(m);
    return hl.filter((h) => h.member_id === m.id && docs.has(h.doc));
  };
  const today = localDay(t, me.tz);
  const view = (m) => {
    const d = memberDays(m, daily.filter((r) => r.member_id === m.id), room);
    const mToday = localDay(t, m.tz);
    return {
      m,
      d,
      out: {
        id: m.id,
        name: m.name,
        role: m.role,
        tz: m.tz,
        bound: !!m.book_path,
        book: m.book_path ? m.book_path.split("/").pop() : null,
        progress: pct(m.bp),
        progress_bp: m.bp,
        target_pct: m.target_bp ? +(m.target_bp / 100).toFixed(1) : null,
        today_pct: +(d.gain(mToday) / 100).toFixed(1),
        done_today: d.done(mToday),
        read_today: d.gain(mToday) > 0,
        finished: !!m.finished_ts,
        minutes: Math.round(d.seconds / 60),
        nudged: !!m.nudged_ts,
        fav_quote: m.fav_quote,
        shared: (() => {
          const h = hlFor(m)[0];
          return h ? { id: h.clip_id, text: shortQuote(h.text), at: h.share_ts } : null;
        })(),
        highlights: hlFor(m)
          .slice()
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, 8)
          .map((h) => ({ id: h.clip_id, text: shortQuote(h.text), chapter: h.chapter })),
        highlight_count: hlFor(m).length,
        last_updated: m.last_updated,
      },
    };
  };
  const vm = view(me);
  const vp = partner ? view(partner) : null;

  let phase = "waiting";
  if (partner) phase = room.start_ts ? "active" : "pending";

  let streak = 0;
  let sharedDays = 0;
  let sprint = null;
  if (phase === "active" && vp) {
    const startDay = localDay(room.start_ts, me.tz);
    const endDay = addDays(startDay, sprintTotalDays(room) - 1);
    const lastDay = today < endDay ? today : endDay;
    for (let d = lastDay; d >= startDay; d = addDays(d, -1)) {
      if (vm.d.done(d) && vp.d.done(d)) streak++;
      else if (d === today) continue;
      else break;
    }
    for (let d = startDay; d <= lastDay; d = addDays(d, 1)) if (vm.d.done(d) && vp.d.done(d)) sharedDays++;
    const total = sprintTotalDays(room);
    const dayIndex = Math.min(total, dayDiff(startDay, today) + 1);
    const bothFinished = me.finished_ts && partner.finished_ts;
    const over = t >= room.end_ts;
    if (bothFinished || over) phase = "recap";
    sprint = {
      total_days: total,
      day: dayIndex,
      days_left: Math.max(0, total - dayIndex),
      start_day: startDay,
      end_day: endDay,
      extension: room.ext_days ? { days: room.ext_days, by_me: room.ext_by === me.id } : null,
    };
    if (phase === "recap") {
      const lastFinish = bothFinished ? Math.max(me.finished_ts, partner.finished_ts) : null;
      const early = lastFinish ? Math.max(0, dayDiff(localDay(lastFinish, me.tz), endDay)) : 0;
      const qFor = (m) => {
        const h = hlFor(m)[0];
        return h ? { text: shortQuote(h.text), page: h.chapter || "" } : null;
      };
      sprint.recap = {
        shared_days: sharedDays,
        early_days: early,
        me: { name: me.name, pages_pct: pct(me.bp - (me.baseline_bp || 0)), minutes: vm.out.minutes, quote: qFor(me) },
        partner: { name: partner.name, pages_pct: pct(partner.bp - (partner.baseline_bp || 0)), minutes: vp.out.minutes, quote: qFor(partner) },
      };
    }
  }

  return {
    now: t,
    phase,
    code: room.code,
    sprint_days: room.sprint_days,
    book: room.book_title || room.book_file ? { title: room.book_title || room.book_file, file: room.book_file || null, size: room.book_size || null } : null,
    streak,
    shared_days: sharedDays,
    sprint,
    same_book: !!(me.book_doc && partner && partner.book_doc && me.book_doc === partner.book_doc),
    me: vm.out,
    partner: vp ? vp.out : null,
    quotes: quotes.map((q) => ({ id: q.id, mine: q.member_id === me.id, text: q.text, page: q.page, created_at: q.created_at })),
    updated_label: localTime(t, me.tz),
  };
}

// Records a progress point. opts: {path, doc, startBp, seconds}
export async function ingest(db, m, bp, ts, opts = {}) {
  bp = Math.max(0, Math.min(FULL, Math.round(bp)));
  if (!(ts > 1600000000) || ts > now() + 600) ts = now();
  const room = await db.prepare("SELECT * FROM rooms WHERE id = ?").bind(m.room_id).first();
  const path = opts.path || null;

  if (!countsForRoom(room, m, path, opts.doc)) return { ignored: "other_book" };
  const upd = {};
  if (!m.book_path) {
    upd.book_path = path || "manual";
    if (opts.doc) upd.book_doc = opts.doc;
    upd.baseline_bp = opts.startBp ?? bp;
  } else {
    if (path && path !== m.book_path) upd.book_path = path; // same book, another file/location
    if (opts.doc && opts.doc !== m.book_doc) upd.book_doc = opts.doc;
  }

  const baseline = upd.baseline_bp ?? m.baseline_bp ?? 0;
  if (!room.start_ts) {
    // Sprint not started yet: reading so far only moves the starting point.
    upd.baseline_bp = Math.max(baseline, bp);
  }
  const base = upd.baseline_bp ?? baseline;
  const days = room.start_ts ? Math.round((room.end_ts - room.start_ts) / DAY) : room.sprint_days;
  if (!m.target_bp || upd.baseline_bp !== undefined) {
    upd.target_bp = Math.max(1, Math.ceil((FULL - base) / days));
  }

  const newBp = Math.max(m.bp || 0, bp);
  upd.bp = newBp;
  upd.last_updated = now();
  if (newBp >= 9900 && !m.finished_ts) upd.finished_ts = ts;
  if (bp > (m.bp || 0)) upd.nudged_ts = null;

  const stmts = [];
  if (room.start_ts) {
    const day = localDay(ts, m.tz);
    stmts.push(
      db
        .prepare(
          `INSERT INTO daily (member_id, day, max_bp, seconds) VALUES (?, ?, ?, ?)
           ON CONFLICT(member_id, day) DO UPDATE SET max_bp = MAX(max_bp, excluded.max_bp), seconds = seconds + excluded.seconds`
        )
        .bind(m.id, day, bp, opts.seconds || 0)
    );
  }
  const keys = Object.keys(upd);
  stmts.push(
    db.prepare(`UPDATE members SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).bind(...keys.map((k) => upd[k]), m.id)
  );
  await db.batch(stmts);
  Object.assign(m, upd);
  return { ok: true };
}

// Returns true when the event id is new (and records it).
export async function firstSeen(db, id) {
  if (!id || id.startsWith("{")) return true;
  const r = await db.prepare("INSERT OR IGNORE INTO seen_events (id, ts) VALUES (?, ?)").bind(id, now()).run();
  return r.meta.changes > 0;
}

export function normTitle(x) {
  return String(x || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Loose match of a book file path against the shared book's title.
export function titleMatches(path, title) {
  const t = normTitle(title);
  if (!path || !t) return false;
  const f = normTitle(String(path).split("/").pop().replace(/\.[a-z0-9]+$/i, ""));
  if (!f) return false;
  if (f.includes(t) || (f.length >= 4 && t.includes(f))) return true;
  const words = t.split(" ").filter((w) => w.length >= 2);
  if (!words.length) return false;
  const fw = new Set(f.split(" "));
  const hit = words.filter((w) => fw.has(w)).length;
  return hit >= Math.max(1, Math.ceil(words.length * 0.7));
}

// Only the room's shared book counts. Rooms made before shared books existed
// fall back to "the first book this person opened".
export function countsForRoom(room, m, path, doc) {
  if (!path && !doc) return true; // manual entry on the web
  if (!room.book_title && !room.book_doc) {
    return !m.book_path || path === m.book_path || (doc && doc === m.book_doc);
  }
  if (room.book_doc && doc && doc === room.book_doc) return true;
  if (m.book_path && path && path === m.book_path) return true;
  if (m.book_doc && doc && doc === m.book_doc) return true;
  return titleMatches(path, room.book_title);
}

// KOReader/CrossPoint binary document id: MD5 over 1KB samples at 0, 1K, 4K, 16K, ...
export async function partialMd5(bytes) {
  const parts = [];
  for (let i = -1; i <= 10; i++) {
    const off = i < 0 ? 0 : 1024 * 2 ** (2 * i);
    if (off >= bytes.length) continue;
    parts.push(bytes.subarray(off, Math.min(bytes.length, off + 1024)));
  }
  const total = parts.reduce((a, p) => a + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  const h = await crypto.subtle.digest("MD5", buf);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const QUOTE_MAX = 140;
// Shared highlights are capped so they fit the partner's sleep screen.
export function shortQuote(text, max = QUOTE_MAX) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–—-]+$/, "") + "…";
}
