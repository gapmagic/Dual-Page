import { computeState, ingest, firstSeen, loadMember, inviteCode, randomHex, now, pct, FULL, partialMd5 } from "./logic.js";
import { renderScreen, renderNoRoom } from "./screen.js";
import { makeZip } from "./zip.js";
import { pluginFiles } from "./plugin.js";
import { koPluginFiles, KO_VERSION, KO_MAIN } from "./koplugin.js";
import { PAGE } from "./web.js";

const DAY = 86400;
const HOST = "dualpage.online";
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
const text = (s, status = 200) => new Response(s, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
const bad = (msg, status = 400) => json({ error: msg }, status);

function cleanName(s) {
  return String(s || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24);
}
function cleanTitle(s) {
  return String(s || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120);
}
function fileSafe(s) {
  return String(s || "book").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim().slice(0, 80) || "book";
}
const cleanLang = (l) => (l === "en" ? "en" : "vi");

function cleanTz(tz) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "Asia/Ho_Chi_Minh";
  }
}
// The firmware sends unmatched {event.x} literally; treat those as missing.
const v = (s) => (s == null || s === "" || String(s).startsWith("{") ? null : String(s));
// Device bodies/URLs put `book=` last so a path with & or quotes survives.
function parseTail(raw) {
  const out = {};
  const i = raw.indexOf("book=");
  let head = raw;
  if (i >= 0) {
    out.book = raw.slice(i + 5);
    try {
      out.book = decodeURIComponent(out.book);
    } catch {}
    head = raw.slice(0, i);
  }
  for (const kv of head.split("&")) {
    const j = kv.indexOf("=");
    if (j > 0) out[kv.slice(0, j)] = decodeURIComponent(kv.slice(j + 1));
  }
  return out;
}

// Shared book files are only needed while a room is reading. Daily cleanup:
// 7 days after the sprint ends, or 30 days after a room was created if its
// sprint never started, the file is deleted (title and progress stay).
const BOOK_KEEP_AFTER_END = 7 * DAY;
const BOOK_KEEP_UNSTARTED = 30 * DAY;
async function cleanupBooks(env) {
  const t = now();
  const { results } = await env.DB.prepare(
    "SELECT id FROM rooms WHERE book_file IS NOT NULL AND ((end_ts IS NOT NULL AND end_ts < ?) OR (start_ts IS NULL AND created_at < ?)) LIMIT 200",
  )
    .bind(t - BOOK_KEEP_AFTER_END, t - BOOK_KEEP_UNSTARTED)
    .all();
  for (const r of results) {
    await env.BOOKS.delete("book:" + r.id);
    await env.DB.prepare("UPDATE rooms SET book_file = NULL, book_size = NULL WHERE id = ?").bind(r.id).run();
  }
  return results.length;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupBooks(env));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    const db = env.DB;
    try {
      if (req.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" } });
      if (p === "/" || p === "/index.html") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
      if (p.startsWith("/api/")) return await api(req, env, url, p.slice(5));
      if (p.startsWith("/d/")) return await device(req, env, url, p.slice(3));
      if (p.startsWith("/kosync/")) return await kosync(req, env, url, p.slice(8));
      return text("Not found", 404);
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      return p.startsWith("/d/") && p.endsWith(".bmp") ? text("error", 500) : bad("server_error: " + e.message, 500);
    }
  },
};

async function api(req, env, url, route) {
  const db = env.DB;
  const body = req.method === "POST" && route !== "book/upload" ? await req.json().catch(() => ({})) : {};
  const token = body.t || url.searchParams.get("t");

  if (route === "rooms" && req.method === "POST") {
    const name = cleanName(body.name);
    if (!name) return bad("Cần nhập tên");
    let days = Math.round(Number(body.sprint_days));
    if (!(days >= 1 && days <= 365)) return bad("Số ngày sprint phải từ 1 đến 365");
    const bookTitle = cleanTitle(body.book_title);
    if (!bookTitle) return bad("Cần nhập tên sách chung");
    const roomId = randomHex(8);
    let code;
    for (let i = 0; i < 5; i++) {
      code = inviteCode();
      if (!(await db.prepare("SELECT 1 FROM rooms WHERE code = ?").bind(code).first())) break;
    }
    const t = now();
    const memberToken = randomHex(16);
    await db.batch([
      db.prepare("INSERT INTO rooms (id, code, sprint_days, created_at, book_title) VALUES (?, ?, ?, ?, ?)").bind(roomId, code, days, t, bookTitle),
      db
        .prepare("INSERT INTO members (id, room_id, token, name, tz, role, created_at, lang) VALUES (?, ?, ?, ?, ?, 'host', ?, ?)")
        .bind(randomHex(8), roomId, memberToken, name, cleanTz(body.tz), t, cleanLang(body.lang)),
    ]);
    await linkDevice(db, body.d, memberToken);
    return json({ t: memberToken, code });
  }

  if (route === "join" && req.method === "POST") {
    const name = cleanName(body.name);
    if (!name) return bad("Cần nhập tên");
    const code = String(body.code || "").toUpperCase().replace(/\s/g, "").replace(/^XTE-?/, "XTE-");
    const room = await db.prepare("SELECT * FROM rooms WHERE code = ?").bind(code).first();
    if (!room || room.closed_ts) return bad("Không tìm thấy mã mời này", 404);
    const n = await db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id = ?").bind(room.id).first();
    if (n.n >= 2) return bad("Phòng này đã đủ 2 người", 409);
    const memberToken = randomHex(16);
    await db
      .prepare("INSERT INTO members (id, room_id, token, name, tz, role, created_at, lang) VALUES (?, ?, ?, ?, ?, 'guest', ?, ?)")
      .bind(randomHex(8), room.id, memberToken, name, cleanTz(body.tz), now(), cleanLang(body.lang))
      .run();
    await linkDevice(db, body.d, memberToken);
    return json({ t: memberToken });
  }

  const me = await loadMember(db, token);
  if (!me) return bad("Không hợp lệ hoặc đã hết hạn", 401);
  const room = await db.prepare("SELECT * FROM rooms WHERE id = ?").bind(me.room_id).first();
  const partner = await db.prepare("SELECT * FROM members WHERE room_id = ? AND id != ?").bind(me.room_id, me.id).first();

  // A closed room (the partner left) is read-only.
  if (room.closed_ts && !["lang", "state", "device", "leave"].includes(route)) return bad("Bạn đọc kia đã rời phòng. Hãy tạo phòng mới.", 409);

  switch (route) {
    case "lang": {
      await db.prepare("UPDATE members SET lang = ? WHERE id = ?").bind(cleanLang(body.lang), me.id).run();
      me.lang = cleanLang(body.lang);
      return json(await computeState(db, me));
    }

    case "state": {
      const st = await computeState(db, me);
      const dev = await db.prepare("SELECT COUNT(*) AS n FROM devices WHERE member_id = ?").bind(me.id).first();
      st.devices = dev.n;
      return json(st);
    }

    case "device": {
      // Returns this browser's reader token (creating one if needed) and links it to me.
      let d = String(body.d || "");
      const known = d && (await db.prepare("SELECT 1 FROM devices WHERE token = ?").bind(d).first());
      if (!known) {
        d = randomHex(16);
        await db.prepare("INSERT INTO devices (token, member_id, created_at) VALUES (?, ?, ?)").bind(d, me.id, now()).run();
      } else await db.prepare("UPDATE devices SET member_id = ? WHERE token = ?").bind(me.id, d).run();
      return json({ d });
    }

    case "leave": {
      if (req.method !== "POST") return bad("POST only", 405);
      const t = now();
      await db.batch([
        db.prepare("UPDATE members SET left_ts = ? WHERE id = ?").bind(t, me.id),
        db.prepare("UPDATE rooms SET closed_ts = ? WHERE id = ?").bind(t, room.id),
        db.prepare("UPDATE devices SET member_id = NULL WHERE member_id = ?").bind(me.id),
      ]);
      if (room.book_file) {
        await env.BOOKS.delete("book:" + room.id);
        await db.prepare("UPDATE rooms SET book_file = NULL, book_size = NULL WHERE id = ?").bind(room.id).run();
      }
      return json({ ok: true });
    }

    case "accept": {
      if (me.role !== "guest") return bad("Chỉ người được mời mới xác nhận");
      if (room.start_ts) return json(await computeState(db, me));
      await startSprint(db, room);
      return json(await computeState(db, me));
    }

    case "sprint": {
      // Host may change the length until the guest accepts.
      if (me.role !== "host" || room.start_ts) return bad("Không thể đổi sau khi sprint đã bắt đầu");
      const days = Math.round(Number(body.sprint_days));
      if (!(days >= 1 && days <= 365)) return bad("Số ngày sprint phải từ 1 đến 365");
      await db.prepare("UPDATE rooms SET sprint_days = ? WHERE id = ?").bind(days, room.id).run();
      return json(await computeState(db, me));
    }

    case "rebind": {
      await db.prepare("UPDATE members SET book_path = NULL, book_doc = NULL, target_bp = NULL, finished_ts = NULL, bp = 0 WHERE id = ?").bind(me.id).run();
      return json(await computeState(db, await loadMember(db, token)));
    }

    case "nudge": {
      if (!partner) return bad("Chưa có bạn đọc");
      await db.prepare("UPDATE members SET nudged_ts = ? WHERE id = ?").bind(now(), partner.id).run();
      return json(await computeState(db, me));
    }

    case "share": {
      const r = await db.prepare("UPDATE highlights SET share_ts = ? WHERE member_id = ? AND clip_id = ? AND deleted = 0").bind(now(), me.id, String(body.id || "")).run();
      if (!r.meta.changes) return bad("Không tìm thấy câu này");
      return json(await computeState(db, me));
    }

    case "nudge/dismiss":
      await db.prepare("UPDATE members SET nudged_ts = NULL WHERE id = ?").bind(me.id).run();
      return json(await computeState(db, await loadMember(db, token)));

    case "extend":
      try {
        return json(await extend(db, me, room, body.action, Number(body.days)));
      } catch (e) {
        return bad(e.message);
      }

    case "book/title": {
      if (room.start_ts) return bad("Sprint đã bắt đầu, không đổi sách chung được nữa");
      const title = cleanTitle(body.title);
      if (!title) return bad("Cần nhập tên sách");
      await db.prepare("UPDATE rooms SET book_title = ? WHERE id = ?").bind(title, room.id).run();
      return json(await computeState(db, me));
    }

    case "book/upload": {
      if (req.method !== "POST") return bad("POST only", 405);
      const buf = new Uint8Array(await req.arrayBuffer());
      if (buf.length < 100) return bad("File trống");
      if (buf.length > 24 * 1024 * 1024) return bad("File lớn hơn 24MB");
      let name = decodeURIComponent(req.headers.get("x-filename") || "book.epub");
      if (!/\.(epub|txt)$/i.test(name)) return bad("Chỉ nhận file .epub hoặc .txt");
      const doc = await partialMd5(buf);
      await env.BOOKS.put("book:" + room.id, buf, { metadata: { name } });
      const title = room.book_title || cleanTitle(name.replace(/\.[^.]+$/, ""));
      await db.prepare("UPDATE rooms SET book_doc = ?, book_file = ?, book_size = ?, book_title = ? WHERE id = ?").bind(doc, name, buf.length, title, room.id).run();
      return json(await computeState(db, me));
    }

    case "book/file": {
      if (!room.book_file) return bad("Phòng chưa có file sách", 404);
      const data = await env.BOOKS.get("book:" + room.id, "arrayBuffer");
      if (!data) return bad("Không tìm thấy file", 404);
      const ext = room.book_file.match(/\.[^.]+$/)?.[0] || ".epub";
      return new Response(data, {
        headers: {
          "content-type": ext === ".txt" ? "text/plain; charset=utf-8" : "application/epub+zip",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileSafe(room.book_title) + ext)}`,
        },
      });
    }

    case "plugin.zip":
    case "koplugin.zip": {
      const d = url.searchParams.get("d");
      const dev = d && (await db.prepare("SELECT * FROM devices WHERE token = ? AND member_id = ?").bind(d, me.id).first());
      if (!dev) return bad("Thiếu mã máy đọc, hãy tải lại từ trang web");
      const ko = route === "koplugin.zip";
      const zip = makeZip(ko ? koPluginFiles(url.origin, d, me.lang) : pluginFiles(url.origin, d, me.lang));
      const name = ko ? "dualpage-koreader.zip" : "dualpage-plugin.zip";
      return new Response(zip, {
        headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${name}"` },
      });
    }
  }
  return bad("Không có API này", 404);
}

async function startSprint(db, room) {
  const t = now();
  const d = room.sprint_days;
  // Reading before the start only sets each person's starting point.
  await db.batch([
    db.prepare("UPDATE rooms SET start_ts = ?, end_ts = ? WHERE id = ?").bind(t, t + d * DAY, room.id),
    db.prepare("UPDATE members SET baseline_bp = bp, target_bp = NULL WHERE room_id = ?").bind(room.id),
    db
      .prepare(`UPDATE members SET target_bp = MAX(1, (${FULL} - bp + ? - 1) / ?) WHERE room_id = ? AND book_path IS NOT NULL`)
      .bind(d - 1, d, room.id),
  ]);
}

// Short code a reader can type in its own KOReader Sync settings as the
// username, instead of the 32-character device token.
const SYNC_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function sigOf(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
}

async function syncCodeFor(db, deviceToken) {
  const row = await db.prepare("SELECT sync_code, kosync_ts FROM devices WHERE token = ?").bind(deviceToken).first();
  if (!row) return null;
  if (row.sync_code) return row;
  for (let i = 0; i < 5; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = Array.from(bytes, (b) => SYNC_ALPHABET[b % SYNC_ALPHABET.length]).join("");
    const r = await db.prepare("UPDATE devices SET sync_code = ? WHERE token = ? AND sync_code IS NULL AND NOT EXISTS (SELECT 1 FROM devices WHERE sync_code = ?)").bind(code, deviceToken, code).run();
    if (r.meta.changes) return { sync_code: code, kosync_ts: row.kosync_ts };
  }
  return null;
}

async function linkDevice(db, d, memberToken) {
  if (!d || String(d).length < 16) return;
  await db
    .prepare("UPDATE devices SET member_id = (SELECT id FROM members WHERE token = ?) WHERE token = ?")
    .bind(memberToken, String(d))
    .run();
}

// A reader token is either a device token (plugin v2) or a member token (first plugins).
async function memberForDevice(db, token) {
  if (!token || token.length < 16) return { known: false, me: null };
  const dev = await db.prepare("SELECT member_id FROM devices WHERE token = ?").bind(token).first();
  if (dev) {
    const me = dev.member_id ? await db.prepare("SELECT * FROM members WHERE id = ? AND left_ts IS NULL").bind(dev.member_id).first() : null;
    return { known: true, me };
  }
  const me = await loadMember(db, token);
  return { known: !!me, me };
}

async function addQuote(db, me, q, page) {
  const r = await db.prepare("INSERT INTO quotes (member_id, text, page, created_at) VALUES (?, ?, ?, ?)").bind(me.id, q, page, now()).run();
  if (!me.fav_quote) await db.prepare("UPDATE members SET fav_quote = ? WHERE id = ?").bind(r.meta.last_row_id, me.id).run();
}

const MAX_EXT = 30;
// Reads "5", "+5", "5 ngày", "5 days" as 5; anything else is null.
const parseDays = (q) => {
  const m = String(q || "").trim().match(/^\+?\s*(\d{1,3})\s*(ngày|ngay|days?|d)?$/i);
  return m ? Number(m[1]) : null;
};

async function extend(db, me, room, action, days) {
  if (!room.start_ts) throw new Error("Sprint chưa bắt đầu");
  if (action === "propose") {
    if (!Number.isInteger(days) || days < 1 || days > MAX_EXT) throw new Error(`Số ngày gia hạn phải từ 1 đến ${MAX_EXT}`);
    await db.prepare("UPDATE rooms SET ext_days = ?, ext_by = ? WHERE id = ?").bind(days, me.id, room.id).run();
  } else if (action === "accept") {
    if (!room.ext_days || room.ext_by === me.id) throw new Error("Không có đề nghị gia hạn nào từ bạn đọc");
    await db.prepare("UPDATE rooms SET end_ts = end_ts + ?, ext_days = NULL, ext_by = NULL WHERE id = ?").bind(room.ext_days * DAY, room.id).run();
  } else if (action === "decline" || action === "cancel") {
    await db.prepare("UPDATE rooms SET ext_days = NULL, ext_by = NULL WHERE id = ?").bind(room.id).run();
  }
  return computeState(db, me);
}

// ---------- device endpoints: /d/<token>/<action> ----------
async function device(req, env, url, rest) {
  const db = env.DB;
  const [token, ...parts] = rest.split("/");
  const action = parts.join("/");
  const { known, me } = await memberForDevice(db, token);
  if (!known) return action.endsWith(".bmp") ? text("unknown device", 404) : text("unknown device", 401);
  if (!me) {
    // Installed reader that is not in a room right now.
    if (action === "sleep.bmp") return new Response(renderNoRoom(url.origin, url.searchParams.get("lang")).toBMP(), { headers: { "content-type": "image/bmp", "cache-control": "no-store" } });
    if (action === "sleep.png") return png(renderNoRoom(url.origin, url.searchParams.get("lang")), url);
    if (action === "lists") return json({ lists: [{ id: "today", title: "Dual Page · chưa vào phòng / not in a room" }] });
    if (action === "home" || action === "search") {
      const items = [
        { id: "info", title: "Máy chưa vào phòng nào", author: `Mở ${url.host} để tạo hoặc tham gia phòng` },
        { id: "info", title: "This reader isn't in a room", author: `Open ${url.host} to create or join one` },
      ];
      if (url.searchParams.get("grouped")) return json({ sections: [{ id: "today", title: "Dual Page", note: "chưa vào phòng / not in a room", items }] });
      return json({ items });
    }
    return text("ok");
  }

  if (action === "session" || action === "exit") {
    const raw = await req.text();
    const f = parseTail(raw);
    if (!(await firstSeen(db, me.id + ":" + (v(f.id) || "")))) return text("dup");
    if (action === "session") {
      const ebp = Number(v(f.ebp));
      if (!(ebp >= 0)) return text("ignored");
      const sbp = Number(v(f.sbp));
      await ingest(db, me, ebp, Number(v(f.end)) || now(), {
        path: v(f.book),
        doc: v(f.doc),
        startBp: sbp >= 0 ? sbp : undefined,
        seconds: Number(v(f.dur)) || 0,
      });
    } else {
      const p = Number(v(f.pct));
      if (p >= 0) await ingest(db, me, Math.max(p, Number(v(f.end)) === 100 ? 100 : 0) * 100, Number(v(f.ts)) || now(), { path: v(f.book) });
    }
    return text("ok");
  }

  if (action === "sleep.bmp") {
    const f = parseTail(url.search.slice(1));
    const p = Number(v(f.pct));
    if (v(f.book) && p >= 0) await ingest(db, me, Math.max(p, Number(v(f.end)) === 100 ? 100 : 0) * 100, Number(v(f.ts)) || now(), { path: v(f.book) });
    const s = await computeState(db, me);
    return new Response(renderScreen(s).toBMP(), { headers: { "content-type": "image/bmp", "cache-control": "no-store" } });
  }

  // KOReader: where this reader got to in the shared book, so a re-downloaded
  // copy (whose on-device position was lost with the old file) can jump back.
  if (action === "ko/version") return text(KO_VERSION);
  // KOReader polls this every few minutes while awake: is there a new nudge?
  if (action === "ping") {
    const live = me.nudged_ts && now() - me.nudged_ts < 12 * 3600;
    const p = live ? await db.prepare("SELECT name FROM members WHERE room_id = ? AND id != ?").bind(me.room_id, me.id).first() : null;
    // sig changes whenever the sleep screen would look different, so the
    // plugin only downloads a new image when something changed.
    const st = await computeState(db, me);
    const { now: _n, ...rest } = st;
    return json({ nudge: live ? { at: me.nudged_ts, from: p ? p.name : "" } : null, sig: sigOf(JSON.stringify(rest)) });
  }
  if (action === "ko/main.lua") return new Response(KO_MAIN, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

  if (action === "resume") {
    const doc = url.searchParams.get("doc") || "";
    const room = await db.prepare("SELECT book_doc FROM rooms WHERE id = ?").bind(me.room_id).first();
    const ours = doc && (doc === room?.book_doc || doc === me.book_doc);
    return json({ pct: ours && me.bp > 0 ? me.bp / 100 : null });
  }

  if (action === "sleep.png") {
    const p = Number(url.searchParams.get("pct"));
    const book = url.searchParams.get("book");
    if (book && p >= 0) await ingest(db, me, Math.round(p * 100), now(), { path: book, doc: url.searchParams.get("doc") || undefined });
    return png(renderScreen(await computeState(db, me)), url);
  }

  // KOReader plugin: {doc, items:[{id, text, chapter, created_at, deleted?, share?}]}
  if (action === "highlight" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const items = Array.isArray(b.items) ? b.items.slice(0, 20) : [];
    await upsertHighlights(db, me, b.doc, items);
    return text(items.some((i) => i.share) ? (me.lang === "en" ? "Shared." : "Đã chia sẻ câu này.") : "ok");
  }

  if (action === "home") {
    const list = url.searchParams.get("list");
    if (url.searchParams.get("grouped")) {
      const { s, sections } = await homeSections(db, me, { ko: true });
      return json({ sections, updated: s.updated_label, lang: me.lang === "en" ? "en" : "vi" });
    }
    if (list) {
      const { s, sections } = await homeSections(db, me, { dev: token });
      const sec = sections.find((x) => x.id === list) || sections[0];
      const en = me.lang === "en";
      return json({ items: sec.items });
    }
    return json({ items: await homeItems(db, me) });
  }
  // CrossPoint's search box doubles as the number pad for a custom extension.
  if (action === "search") {
    const en = me.lang === "en";
    const L = (vi, en2) => (en ? en2 : vi);
    const st = await computeState(db, me);
    const n = parseDays(url.searchParams.get("q"));
    const ext = st.sprint && st.sprint.extension;
    if (st.phase !== "active") return json({ items: [{ id: "info", title: L("Chỉ gia hạn được khi sprint đang chạy", "You can only extend during a sprint"), author: "" }] });
    if (ext) return json({ items: [{ id: "info", title: L(`Đang có đề nghị gia hạn +${ext.days} ngày`, `An extension of +${ext.days} days is pending`), author: L("Mở mục Sprint và gia hạn để xem", "Open Sprint & extension to see it") }] });
    if (!n || n > MAX_EXT) return json({ items: [{ id: "info", title: L(`Nhập số ngày muốn gia hạn (1–${MAX_EXT})`, `Type the number of days to extend (1–${MAX_EXT})`), author: L("Ví dụ: 5", "For example: 5") }] });
    return json({ items: [{ id: `ext${n}.dp`, title: "» " + L(`Đề nghị gia hạn +${n} ngày`, `Propose +${n} days`), author: L(`${st.partner.name} cần đồng ý. Sprint sẽ dài ${st.sprint.total_days + n} ngày.`, `${st.partner.name} needs to agree. The sprint becomes ${st.sprint.total_days + n} days.`) }] });
  }
  if (action === "lists") {
    const { sections } = await homeSections(db, me);
    return json({ lists: sections.map((x) => ({ id: x.id, title: x.note ? `${x.title} · ${x.note}` : x.title })) });
  }

  if (action.startsWith("act/")) {
    const id = decodeURIComponent(action.slice(4)).replace(/\.txt$/, "").replace(/\.dp$/, "");
    const room = await db.prepare("SELECT * FROM rooms WHERE id = ?").bind(me.room_id).first();
    const partner = await db.prepare("SELECT * FROM members WHERE room_id = ? AND id != ?").bind(me.room_id, me.id).first();
    if (/\.(epub|txt)$/i.test(id) && room.book_file) {
      const data = await env.BOOKS.get("book:" + room.id, "arrayBuffer");
      if (data) return new Response(data, { headers: { "content-type": "application/octet-stream" } });
    }
    let msg = "Dual Page";
    const L = (vi, en) => (me.lang === "en" ? en : vi);
    try {
      if (id === "nudge" && partner) {
        await db.prepare("UPDATE members SET nudged_ts = ? WHERE id = ?").bind(now(), partner.id).run();
        msg = L(`Đã nhắc ${partner.name}.`, `Nudged ${partner.name}.`);
      } else if (id.startsWith("reshare-")) {
        msg = (await reshare(db, me, id.slice(8)))
          ? (me.lang === "en" ? "Shared again. It now shows on your partner's sleep screen." : "Đã chia sẻ lại. Câu này đang hiện trên màn hình chờ của bạn đọc.")
          : (me.lang === "en" ? "Couldn't find this quote." : "Không tìm thấy câu này.");
      } else if (id.startsWith("share-")) {
        const r = await db.prepare("UPDATE highlights SET share_ts = ? WHERE member_id = ? AND clip_id = ? AND deleted = 0").bind(now(), me.id, id.slice(6)).run();
        msg = r.meta.changes ? L("Đã chia sẻ câu này.", "Shared.") : L("Không tìm thấy câu này.", "Highlight not found.");
      } else if (id === "seen") {
        await db.prepare("UPDATE members SET nudged_ts = NULL WHERE id = ?").bind(me.id).run();
        msg = L("Đã xem lời nhắc.", "Marked as seen.");
      } else if (/^ext\d+$/.test(id)) {
        await extend(db, me, room, "propose", Number(id.slice(3)));
        msg = L("Đã gửi đề nghị gia hạn.", "Extension proposed.");
      } else if (id === "ext_yes") {
        await extend(db, me, room, "accept");
        msg = L("Đã đồng ý gia hạn.", "Extension accepted.");
      } else if (id === "ext_no") {
        await extend(db, me, room, "decline");
        msg = L("Đã từ chối gia hạn.", "Extension declined.");
      } else if (id === "accept" && me.role === "guest" && !room.start_ts) {
        await startSprint(db, room);
        msg = L("Sprint đã bắt đầu!", "The sprint has started!");
      }
    } catch (e) {
      msg = e.message;
    }
    return text(msg + "\n");
  }
  return text("Not found", 404);
}

async function png(canvas, url) {
  const w = Number(url.searchParams.get("w")) || 480;
  const h = Number(url.searchParams.get("h")) || 800;
  return new Response(await canvas.toPNG(w, h), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
}

// On-device menu, grouped into sections. CrossPoint shows each section as a list
// (browse.lists_url + ?list=<id>); KOReader shows them as sub-menus (?grouped=1);
// plain /home (older plugin installs) gets one list with section header rows.
async function homeSections(db, me, opts = {}) {
  const s = await computeState(db, me);
  const L = (vi, en) => (me.lang === "en" ? en : vi);
  const P = s.partner && s.partner.name;
  const sections = [];
  let cur;
  const section = (id, title, note = "") => sections.push((cur = { id, title, note, items: [] }));
  const info = (title, author = "") => cur.items.push({ id: "info", title, author });
  // Firmware treats every row as fetchable; mark the real buttons with "» " so
  // plain info rows read as text, not actions.
  const act = (id, title, author = "") => cur.items.push({ id: id + ".dp", title: "» " + title, author });
  const st = (p) =>
    !p.bound
      ? L("chưa mở sách chung", "hasn't opened the shared book")
      : p.finished
        ? L("đã đọc xong", "finished the book")
        : p.read_today
          ? L(`hôm nay đọc +${p.today_pct}%`, `read +${p.today_pct}% today`) + (p.done_today ? " ✓" : "")
          : L("chưa đọc hôm nay", "hasn't read today");
  // One row only: the download button when the room has a file, else one info row.
  const bookSection = () => {
    if (!s.book) return;
    section("book", L("Sách chung", "Shared book"), s.book.title);
    const counts = L("Chỉ cuốn này được tính vào chuỗi.", "Only this book counts toward your streak.");
    if (s.book.file) {
      const ext = s.book.file.match(/\.[^.]+$/)?.[0] || ".epub";
      cur.items.push({
        id: fileSafe(s.book.title) + ext,
        title: "» " + L(`Tải về “${s.book.title}”`, `Download “${s.book.title}”`),
        author: counts + " " + L("Lưu vào thư mục DualPage; lần đầu mở bằng Duyệt file.", "Saved to the DualPage folder; the first time, open it from the file browser."),
      });
    } else {
      info(s.book.title, counts + " " + (s.me.bound ? L(`Bạn đang đọc file ${s.me.book}.`, `Your file: ${s.me.book}.`) : L("Chép sách vào máy rồi mở để bắt đầu.", "Copy the book to your reader and open it to start.")));
    }
  };

  if (s.phase === "ended") {
    section("today", L(`${P} đã rời phòng`, `${P} left the room`), s.sprint ? L(`Chuỗi dừng ở ${s.streak} ngày`, `Streak ended at ${s.streak} days`) : "");
    info(L(`${P} đã rời phòng`, `${P} left the room`), (s.sprint ? L(`Chuỗi đọc chung dừng ở ${s.streak} ngày. `, `Your shared streak ended at ${s.streak} days. `) : "") + L(`Mở ${HOST} để tạo phòng mới.`, `Open ${HOST} to create a new room.`));
    if (s.sprint) info(L(`Tổng kết: ${s.streak} ngày`, `Summary: ${s.streak} days`), L(`Bạn: ${s.me.progress}% sách. ${P}: ${s.partner.progress}% sách.`, `You: ${s.me.progress}% of the book. ${P}: ${s.partner.progress}%.`));
    return { s, sections };
  }
  if (s.phase === "waiting") {
    section("today", L("Chờ bạn đọc vào phòng", "Waiting for your partner"), L(`Mã mời ${s.code}`, `Invite code ${s.code}`));
    info(L(`Mã mời: ${s.code}`, `Invite code: ${s.code}`), L(`Gửi mã cho bạn đọc. Sprint ${s.sprint_days} ngày bắt đầu khi bạn ấy vào phòng và đồng ý.`, `Send it to your reading partner. The ${s.sprint_days}-day sprint starts when they join and accept.`));
    bookSection();
    return { s, sections };
  }
  if (s.phase === "pending") {
    section("today", L("Bắt đầu sprint", "Start the sprint"), me.role === "guest" ? L("Chờ bạn đồng ý", "Waiting for you") : L(`Chờ ${P} đồng ý`, `Waiting for ${P}`));
    if (me.role === "guest") act("accept", L(`Đồng ý sprint ${s.sprint_days} ngày`, `Accept the ${s.sprint_days}-day sprint`), L("Bấm để bắt đầu cùng nhau", "Tap to start together"));
    else info(L(`Chờ ${P} đồng ý`, `Waiting for ${P}`), L(`${P} cần bấm đồng ý sprint ${s.sprint_days} ngày. Mở lại mục này để xem.`, `${P} needs to accept the ${s.sprint_days}-day sprint. Reopen to check.`));
    bookSection();
    return { s, sections };
  }
  if (s.phase === "recap") {
    const r = s.sprint.recap;
    section("today", L("Tổng kết sprint", "Sprint recap"), L(`${r.shared_days} ngày cùng đạt mục tiêu`, `${r.shared_days} days you both hit the goal`));
    info(L(`${r.shared_days} ngày cùng đạt mục tiêu`, `${r.shared_days} days you both hit the goal`), r.early_days ? L(`Xong sớm ${r.early_days} ngày!`, `Finished ${r.early_days} days early!`) : L(`Sprint ${s.sprint.total_days} ngày`, `${s.sprint.total_days}-day sprint`));
    for (const x of [r.me, r.partner]) info(`${x.name}: ` + L(`+${x.pages_pct}% sách, ${x.minutes} phút`, `+${x.pages_pct}% of book, ${x.minutes} min`), x.quote ? `“${x.quote.text.slice(0, 120)}”` : "");
    bookSection();
    return { s, sections };
  }

  // Active sprint
  const nudged = s.me.nudged;
  section("today", L("Hôm nay", "Today"), nudged ? L(`${P} nhắc bạn đọc!`, `${P} nudged you to read!`) : L(`Chuỗi đọc chung ${s.streak} ngày`, `${s.streak}-day reading streak`));
  if (nudged) act("seen", L(`${P} nhắc bạn: Đọc thôi nào!`, `${P}: time to read!`), L("Bấm để đánh dấu đã xem", "Tap to mark as seen"));
  info(
    L(`Chuỗi đọc chung: ${s.streak} ngày`, `Reading streak: ${s.streak} days`),
    L("Bạn: ", "You: ") + st(s.me) + ` (${s.me.progress}%). ${P}: ${st(s.partner)} (${s.partner.progress}%).`
  );
  // On XTeink a button shows the firmware's "Downloading… / Download complete"
  // screen with this title under it, so the title reads as what is happening.
  if (s.partner.nudged) act("nudge", L(`Nhắc ${P} lần nữa`, `Nudge ${P} again`), L(`Đã nhắc lúc ${s.partner.nudged_at} ✓ Lời nhắc đang hiện trên màn hình chờ của ${P}.`, `Nudged at ${s.partner.nudged_at} ✓ It's showing on ${P}'s sleep screen.`));
  else act("nudge", L(`Gửi lời nhắc cho ${P}`, `Send ${P} a nudge`), L(`Lời nhắc hiện trên màn hình chờ của ${P}. Thấy "Tải về xong" là đã gửi.`, `Shows on ${P}'s sleep screen. "Download complete" means it was sent.`));

  const others = s.me.highlights.filter((h) => !s.me.shared || h.id !== s.me.shared.id).slice(0, 6);
  section("quotes", L("Câu hay", "Highlights"), s.partner.shared ? L(`${P} đang chia sẻ một câu`, `${P} shared a highlight`) : L(`${s.me.highlights.length} câu bạn đã highlight`, `${s.me.highlights.length} of your highlights`));
  // KOReader draws this section from `quotes`: two parts, each with the newest
  // quote and the earlier ones (the rows below stay for older plugin versions).
  if (opts.ko) {
    const q = (x) => x && { sid: x.sid, text: x.text, chapter: x.chapter, when: x.when };
    cur.quotes = {
      partner: { name: P, current: q(s.partner.shared), history: s.partner.shared_history.map(q) },
      me: { current: q(s.me.shared), history: s.me.shared_history.map(q) },
    };
  }
  // XTeink: two parts, newest quote each (title one line, quote up to 3 lines).
  const ph = s.partner.shared_history, mh = s.me.shared_history;
  const stamp = (x) => [x.when, x.chapter].filter(Boolean).join(" · ");
  if (s.partner.shared) info(L(`${P} chia sẻ với bạn`, `${P} shared with you`) + (s.partner.shared.when ? " · " + s.partner.shared.when : ""), `“${s.partner.shared.text}”`);
  else info(L(`${P} chia sẻ với bạn`, `${P} shared with you`), L(`${P} chưa chia sẻ câu nào.`, `${P} hasn't shared a quote yet.`));
  if (s.me.shared) info(L(`Bạn chia sẻ với ${P}`, `You shared with ${P}`) + (s.me.shared.when ? " · " + s.me.shared.when : ""), `“${s.me.shared.text}”`);
  // Earlier quotes of both readers in this same list (XTeink lists can't nest).
  if (!opts.ko) {
    if (ph.length) {
      info(L(`${P} đã chia sẻ trước đó`, `Earlier from ${P}`), L(`${ph.length} câu, mới nhất ở trên`, `${ph.length} quotes, newest first`));
      for (const x of ph) info(stamp(x), `“${x.text}”`);
    }
    if (mh.length) {
      info(L("Bạn đã chia sẻ trước đó", "Your earlier quotes"), L(`Bấm một câu để chia sẻ lại cho ${P}`, `Tap one to share it with ${P} again`));
      for (const x of mh) act("reshare-" + x.sid, L("Chia sẻ lại · ", "Share again · ") + stamp(x), `“${x.text}”`);
    }
  }
  // XTeink: highlights reach Dual Page through the reader's KOReader Sync. Until
  // this reader has talked to it, show how to turn it on right on the device.
  if (opts.dev) {
    const sc = await syncCodeFor(db, opts.dev);
    if (sc && !sc.kosync_ts) {
      // Short rows: the list shows one line per title and per subtitle.
      info(L(`Bật gửi highlight · mã ${sc.sync_code}`, `Turn on highlight sharing · code ${sc.sync_code}`), L("Settings → CrossPoint Sync, nhập như các dòng dưới", "Settings → CrossPoint Sync, enter the rows below"));
      info("Server Type: KoSync", `Sync Server URL: https://${HOST}/kosync`);
      info(`Username: ${sc.sync_code}`, "Password: dualpage");
      info("Document Matching: Binary", "Sync Clippings: On");
    }
  }
  if (opts.ko) for (const h of others) act("share-" + h.id, L("Chia sẻ: ", "Share: ") + `“${h.text.slice(0, 70)}${h.text.length > 70 ? "…" : ""}”`, h.chapter || L("Bấm để hiện câu này bên bạn đọc", "Tap to show this on your partner's screen"));
  if (!s.me.shared) info(L("Chưa có câu highlight nào", "No highlights yet"), L("Highlight trong sách chung, câu mới nhất tự hiện bên bạn đọc", "Highlight in the shared book; your newest one shows on your partner's screen"));
  // XTeink only uploads clippings during a manual sync from the book menu.
  if (opts.dev) info(L("Highlight xong: menu sách → Sync Progress", "After highlighting: book menu → Sync Progress"), L("Trong sách bấm nút chọn (Confirm) để mở menu. Máy chỉ gửi highlight khi đồng bộ.", "In the book, press Confirm to open the menu. Highlights are sent only when you sync."));


  bookSection();

  const ext = s.sprint.extension;
  section(
    "sprint",
    L("Sprint và gia hạn", "Sprint & extension"),
    ext && !ext.by_me ? L(`${P} đề nghị +${ext.days} ngày`, `${P} asks for +${ext.days} days`) : L(`Ngày ${s.sprint.day}/${s.sprint.total_days}, còn ${s.sprint.days_left} ngày`, `Day ${s.sprint.day}/${s.sprint.total_days}, ${s.sprint.days_left} days left`)
  );
  const dayLine = L(`Ngày ${s.sprint.day}/${s.sprint.total_days}, còn ${s.sprint.days_left} ngày`, `Day ${s.sprint.day}/${s.sprint.total_days}, ${s.sprint.days_left} days left`);
  const goal = s.me.target_pct ? L(`Mục tiêu: ${Math.round(s.me.target_pct)}% sách mỗi ngày.`, `Goal: ${Math.round(s.me.target_pct)}% of the book per day.`) : L("Mục tiêu mỗi ngày được tính khi bạn mở sách chung.", "Your daily goal is set when you open the shared book.");
  if (ext && !ext.by_me) {
    info(dayLine, goal);
    act("ext_yes", L(`Đồng ý gia hạn +${ext.days} ngày`, `Accept +${ext.days} days`), L(`${P} đề nghị`, `Proposed by ${P}`));
    act("ext_no", L("Từ chối gia hạn", "Decline the extension"));
  } else if (ext) {
    info(L(`Đã đề nghị gia hạn +${ext.days} ngày`, `You proposed +${ext.days} days`), L(`Chờ ${P} đồng ý. `, `Waiting for ${P}. `) + dayLine + ".");
  } else if (opts.ko) {
    info(dayLine, goal);
    cur.items.push({ id: "ext.ask", title: "» " + L("Đề nghị gia hạn…", "Propose an extension…"), author: L(`Nhập số ngày (1–${MAX_EXT}), ${P} cần đồng ý`, `Type the days (1–${MAX_EXT}); ${P} needs to agree`) });
  } else {
    // CrossPoint rows cannot open a keyboard; its Search box (magnifier in the
    // header) is the number entry, answered by /search.
    // Row titles are one line on the device; the description wraps to 3 lines.
    info(L("Gia hạn sprint", "Extend the sprint"), L("Bấm kính lúp ở trên để nhập số ngày muốn gia hạn", "Tap the magnifier at the top to enter how many days to extend"));
  }
  return { s, sections };
}

async function homeItems(db, me) {
  const { s, sections } = await homeSections(db, me);
  const items = [];
  for (const sec of sections) {
    items.push({ id: "info", title: `—— ${sec.title.toUpperCase()} ——`, author: sec.note });
    items.push(...sec.items);
  }
  return items;
}

// ---------- KOSync-compatible endpoints: highlights (clippings) arrive here ----------
// The reader's KOReader Sync settings point at <origin>/kosync with the device
// token as username. Only clippings are kept; progress comes from plugin events.
async function upsertHighlights(db, me, doc, items) {
  for (const it of items) {
    const id = String(it.id || "").slice(0, 64);
    if (!id) continue;
    if (Number(it.deleted) === 1) {
      await db.prepare("UPDATE highlights SET deleted = 1 WHERE member_id = ? AND clip_id = ?").bind(me.id, id).run();
      continue;
    }
    const text = String(it.text || "").replace(/\s+/g, " ").trim().slice(0, 2000);
    if (!text) continue;
    const t = now();
    const created = Number(it.created_at) > 1600000000 ? Number(it.created_at) : t;
    // share=1 re-shares an existing highlight (KOReader "Chia sẻ Dual Page" button).
    await db
      .prepare(
        `INSERT INTO highlights (member_id, clip_id, doc, text, chapter, created_at, share_ts) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(member_id, clip_id) DO UPDATE SET text = excluded.text, deleted = 0` + (it.share ? ", share_ts = excluded.share_ts" : "")
      )
      .bind(me.id, id, String(doc || "").slice(0, 64), text, String(it.chapter || "").slice(0, 120), created, t)
      .run();
  }
  await capHighlights(db, me);
}

// Keep only each reader's 3 latest highlights (newest highlighted or shared).
// Older shared quotes stay in the shares table for the history.
async function capHighlights(db, me) {
  await db
    .prepare(
      `UPDATE highlights SET deleted = 1 WHERE member_id = ? AND deleted = 0 AND rowid NOT IN
       (SELECT rowid FROM highlights WHERE member_id = ? AND deleted = 0 ORDER BY share_ts DESC, created_at DESC, rowid DESC LIMIT 3)`
    )
    .bind(me.id, me.id)
    .run();
}

// Shares an earlier quote again from the history (shares.id), even if its
// highlight was trimmed or removed on the reader since.
async function reshare(db, me, sid) {
  const r = await db.prepare("SELECT * FROM shares WHERE id = ? AND member_id = ? AND room_id = ?").bind(Number(sid) || 0, me.id, me.room_id).first();
  if (!r) return false;
  const room = await db.prepare("SELECT book_doc FROM rooms WHERE id = ?").bind(me.room_id).first();
  const t = now();
  await db
    .prepare(
      `INSERT INTO highlights (member_id, clip_id, doc, text, chapter, created_at, share_ts) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(member_id, clip_id) DO UPDATE SET deleted = 0, share_ts = excluded.share_ts`
    )
    .bind(me.id, r.clip_id, me.book_doc || (room && room.book_doc) || "", r.text, r.chapter || "", r.ts, t)
    .run();
  await capHighlights(db, me);
  return true;
}

async function kosync(req, env, url, route) {
  const db = env.DB;
  const user = req.headers.get("x-auth-user") || "";
  let devToken = user;
  if (/^[A-Za-z0-9]{6}$/.test(user)) {
    const d = await db.prepare("SELECT token FROM devices WHERE sync_code = ?").bind(user.toUpperCase()).first();
    devToken = d ? d.token : "";
  }
  const { known, me } = await memberForDevice(db, devToken);
  if (known) await db.prepare("UPDATE devices SET kosync_ts = ? WHERE token = ?").bind(now(), devToken).run();
  const kj = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  if (route === "users/create") return kj({ message: "Use dualpage.online" }, 402);
  if (!known) return kj({ message: "Unauthorized" }, 401);
  if (route === "users/auth") return kj({ authorized: "OK" });
  // Reading position per reader and document, so a deleted and re-downloaded
  // book can be pulled back to where it was (KOSync "pull" on the device).
  if (route === "syncs/progress" && req.method === "PUT") {
    const b = await req.json().catch(() => ({}));
    const doc = String(b.document || "");
    const ts = now();
    if (me && /^[0-9a-f]{32}$/.test(doc)) {
      const rec = { document: doc, progress: String(b.progress || ""), percentage: Number(b.percentage) || 0, device: String(b.device || ""), device_id: String(b.device_id || ""), timestamp: ts };
      await db.prepare("INSERT INTO kosync (member_id, document, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(member_id, document) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").bind(me.id, doc, JSON.stringify(rec), ts).run();
    }
    return kj({ document: doc, timestamp: ts });
  }
  if (route.startsWith("syncs/progress/")) {
    const doc = route.slice("syncs/progress/".length);
    const row = me && /^[0-9a-f]{32}$/.test(doc) ? await db.prepare("SELECT data FROM kosync WHERE member_id = ? AND document = ?").bind(me.id, doc).first() : null;
    let rec = row ? JSON.parse(row.data) : null;
    // The shared book: if no saved position matches where Dual Page last saw
    // this reader, answer with that percentage, so "Sync progress" on a freshly
    // re-downloaded copy jumps back to it.
    if (me && /^[0-9a-f]{32}$/.test(doc) && me.bp > 0) {
      const room = await db.prepare("SELECT book_doc FROM rooms WHERE id = ?").bind(me.room_id).first();
      const ours = doc === room?.book_doc || doc === me.book_doc;
      const pctNow = me.bp / FULL;
      if (ours && (!rec || Math.abs((Number(rec.percentage) || 0) - pctNow) > 0.01))
        rec = { document: doc, progress: "", percentage: pctNow, device: "Dual Page", device_id: "dualpage", timestamp: me.pos_ts || now() };
    }
    return rec ? kj(rec) : kj({}, 404);
  }

  const m = route.match(/^api\/v1\/clippings\/([0-9a-f]{32})$/);
  if (m) {
    const doc = m[1];
    if (req.method === "GET") {
      const cursor = Number(url.searchParams.get("cursor") || 0) || 0;
      return kj({ sync_version: 2, cursor, more: false, items: [] });
    }
    if (req.method === "PUT") {
      const b = await req.json().catch(() => ({}));
      const items = Array.isArray(b.items) ? b.items.slice(0, 20) : [];
      if (me) {
        await upsertHighlights(db, me, doc, items);
      }
      return kj({ accepted: 1 });
    }
  }
  if (route.startsWith("api/v1/")) return kj({}, 404);
  return kj({ message: "Not found" }, 404);
}
