import { computeState, ingest, firstSeen, loadMember, inviteCode, randomHex, now, pct, FULL, partialMd5 } from "./logic.js";
import { renderScreen, renderNoRoom } from "./screen.js";
import { makeZip } from "./zip.js";
import { pluginFiles } from "./plugin.js";
import { koPluginFiles } from "./koplugin.js";
import { PAGE } from "./web.js";

const DAY = 86400;
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

export default {
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
    if (!room) return bad("Không tìm thấy mã mời này", 404);
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
      return json(await extend(db, me, room, body.action, Number(body.days)));

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
    const me = dev.member_id ? await db.prepare("SELECT * FROM members WHERE id = ?").bind(dev.member_id).first() : null;
    return { known: true, me };
  }
  const me = await loadMember(db, token);
  return { known: !!me, me };
}

async function addQuote(db, me, q, page) {
  const r = await db.prepare("INSERT INTO quotes (member_id, text, page, created_at) VALUES (?, ?, ?, ?)").bind(me.id, q, page, now()).run();
  if (!me.fav_quote) await db.prepare("UPDATE members SET fav_quote = ? WHERE id = ?").bind(r.meta.last_row_id, me.id).run();
}

async function extend(db, me, room, action, days) {
  if (!room.start_ts) throw new Error("Sprint chưa bắt đầu");
  if (action === "propose") {
    if (![3, 7].includes(days)) throw new Error("Chỉ gia hạn +3 hoặc +7 ngày");
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
      const { s, sections } = await homeSections(db, me);
      return json({ sections, updated: s.updated_label, lang: me.lang === "en" ? "en" : "vi" });
    }
    if (list) {
      const { s, sections } = await homeSections(db, me);
      const sec = sections.find((x) => x.id === list) || sections[0];
      const en = me.lang === "en";
      return json({ items: [...sec.items, { id: "info", title: en ? `Updated ${s.updated_label}` : `Cập nhật lúc ${s.updated_label}`, author: en ? "Go back and reopen to refresh" : "Thoát ra rồi mở lại để làm mới" }] });
    }
    return json({ items: await homeItems(db, me) });
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
      } else if (id.startsWith("share-")) {
        const r = await db.prepare("UPDATE highlights SET share_ts = ? WHERE member_id = ? AND clip_id = ? AND deleted = 0").bind(now(), me.id, id.slice(6)).run();
        msg = r.meta.changes ? L("Đã chia sẻ câu này.", "Shared.") : L("Không tìm thấy câu này.", "Highlight not found.");
      } else if (id === "seen") {
        await db.prepare("UPDATE members SET nudged_ts = NULL WHERE id = ?").bind(me.id).run();
        msg = L("Đã xem lời nhắc.", "Marked as seen.");
      } else if (id === "ext3" || id === "ext7") {
        await extend(db, me, room, "propose", id === "ext3" ? 3 : 7);
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
  const scale = Math.max(1, Math.min(4, Math.min(w / 480, h / 800)));
  return new Response(await canvas.toPNG(scale), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
}

// On-device menu, grouped into sections. CrossPoint shows each section as a list
// (browse.lists_url + ?list=<id>); KOReader shows them as sub-menus (?grouped=1);
// plain /home (older plugin installs) gets one list with section header rows.
async function homeSections(db, me) {
  const s = await computeState(db, me);
  const L = (vi, en) => (me.lang === "en" ? en : vi);
  const P = s.partner && s.partner.name;
  const sections = [];
  let cur;
  const section = (id, title, note = "") => sections.push((cur = { id, title, note, items: [] }));
  const info = (title, author = "") => cur.items.push({ id: "info", title, author });
  const act = (id, title, author = "") => cur.items.push({ id: id + ".dp", title, author });
  const st = (p) =>
    !p.bound
      ? L("chưa mở sách chung", "hasn't opened the shared book")
      : p.finished
        ? L("đã đọc xong", "finished the book")
        : p.done_today
          ? L(`đã đạt mục tiêu hôm nay (+${p.today_pct}%)`, `reached today's goal (+${p.today_pct}%)`)
          : p.read_today
            ? L(`đã đọc ${Math.round(p.today_pct)}% / ${Math.round(p.target_pct)}%`, `read ${Math.round(p.today_pct)}% of ${Math.round(p.target_pct)}%`)
            : L("chưa đọc hôm nay", "hasn't read today");
  const bookSection = () => {
    if (!s.book) return;
    section("book", L("Sách chung", "Shared book"), s.book.title);
    info(s.book.title, s.me.bound ? L(`Bạn đang đọc file: ${s.me.book}`, `Your file: ${s.me.book}`) : L("Mở cuốn này trên máy để bắt đầu tính tiến độ", "Open this book on your reader to start tracking"));
    if (s.book.file) {
      const ext = s.book.file.match(/\.[^.]+$/)?.[0] || ".epub";
      cur.items.push({ id: fileSafe(s.book.title) + ext, title: L("Tải sách chung về máy", "Download the shared book"), author: L("Lưu vào thư mục DualPage. Lần đầu mở bằng Duyệt file", "Saved to the DualPage folder. First time, open it from the file browser") });
    }
    info(L("Chỉ sách chung được tính tiến độ", "Only the shared book counts"), L("Đọc sách khác vẫn được, chỉ không cộng vào chuỗi", "Other books are fine, they just don't count"));
  };

  if (s.phase === "waiting") {
    section("today", L("Chờ bạn đọc vào phòng", "Waiting for your partner"), L(`Mã mời ${s.code}`, `Invite code ${s.code}`));
    info(L(`Mã mời: ${s.code}`, `Invite code: ${s.code}`), L("Gửi mã này cho bạn đọc để ghép đôi", "Send this code to your reading partner"));
    info(L(`Sprint ${s.sprint_days} ngày`, `${s.sprint_days}-day sprint`), L("Bắt đầu khi bạn đọc vào phòng và đồng ý", "Starts when your partner joins and accepts"));
    bookSection();
    return { s, sections };
  }
  if (s.phase === "pending") {
    section("today", L("Bắt đầu sprint", "Start the sprint"), me.role === "guest" ? L("Chờ bạn đồng ý", "Waiting for you") : L(`Chờ ${P} đồng ý`, `Waiting for ${P}`));
    if (me.role === "guest") act("accept", L(`Đồng ý sprint ${s.sprint_days} ngày`, `Accept the ${s.sprint_days}-day sprint`), L("Bấm để bắt đầu cùng nhau", "Tap to start together"));
    else info(L(`Chờ ${P} đồng ý sprint ${s.sprint_days} ngày`, `Waiting for ${P} to accept the ${s.sprint_days}-day sprint`), L("Mở lại mục này để làm mới", "Reopen to refresh"));
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
  info(L(`Chuỗi đọc chung: ${s.streak} ngày`, `Reading streak: ${s.streak} days`), L("Tăng 1 vào ngày cả hai cùng đạt mục tiêu", "Grows on days you both reach your goal"));
  info(L("Bạn: ", "You: ") + st(s.me), L(`Đã đọc ${s.me.progress}% sách`, `${s.me.progress}% of the book read`));
  info(`${P}: ${st(s.partner)}`, L(`Đã đọc ${s.partner.progress}% sách`, `${s.partner.progress}% of the book read`));
  if (!s.partner.done_today) act("nudge", L(`Nhắc ${P} đọc`, `Nudge ${P} to read`), L("Lời nhắc hiện trên màn hình chờ của bạn ấy", "Shows on their sleep screen"));

  const others = s.me.highlights.filter((h) => !s.me.shared || h.id !== s.me.shared.id).slice(0, 6);
  section("quotes", L("Câu hay", "Highlights"), s.partner.shared ? L(`${P} đang chia sẻ một câu`, `${P} shared a highlight`) : L(`${s.me.highlights.length} câu bạn đã highlight`, `${s.me.highlights.length} of your highlights`));
  if (s.partner.shared) info(L(`${P} chia sẻ với bạn`, `${P} shared with you`), `“${s.partner.shared.text}”`);
  if (s.me.shared) info(L("Câu bạn đang chia sẻ", "You're sharing"), `“${s.me.shared.text}”`);
  for (const h of others) act("share-" + h.id, L("Chia sẻ: ", "Share: ") + `“${h.text.slice(0, 70)}${h.text.length > 70 ? "…" : ""}”`, h.chapter || L("Bấm để hiện câu này bên bạn đọc", "Tap to show this on your partner's screen"));
  if (!s.me.highlights.length) info(L("Chưa có câu highlight nào", "No highlights yet"), L("Highlight trong sách chung, câu mới nhất tự hiện bên bạn đọc", "Highlight in the shared book; your newest one shows on your partner's screen"));

  bookSection();

  const ext = s.sprint.extension;
  section(
    "sprint",
    L("Sprint và gia hạn", "Sprint & extension"),
    ext && !ext.by_me ? L(`${P} đề nghị +${ext.days} ngày`, `${P} asks for +${ext.days} days`) : L(`Ngày ${s.sprint.day}/${s.sprint.total_days}, còn ${s.sprint.days_left} ngày`, `Day ${s.sprint.day}/${s.sprint.total_days}, ${s.sprint.days_left} days left`)
  );
  info(L(`Ngày ${s.sprint.day}/${s.sprint.total_days}, còn ${s.sprint.days_left} ngày`, `Day ${s.sprint.day}/${s.sprint.total_days}, ${s.sprint.days_left} days left`), L(`Mục tiêu của bạn: ${s.me.target_pct ? Math.round(s.me.target_pct) : "?"}% sách mỗi ngày`, `Your goal: ${s.me.target_pct ? Math.round(s.me.target_pct) : "?"}% of the book per day`));
  if (ext && !ext.by_me) {
    act("ext_yes", L(`Đồng ý gia hạn +${ext.days} ngày`, `Accept +${ext.days} days`), L(`${P} đề nghị`, `Proposed by ${P}`));
    act("ext_no", L("Từ chối gia hạn", "Decline the extension"));
  } else if (ext) info(L(`Đã đề nghị gia hạn +${ext.days} ngày`, `You proposed +${ext.days} days`), L(`Chờ ${P} đồng ý`, `Waiting for ${P}`));
  else {
    act("ext3", L("Đề nghị gia hạn +3 ngày", "Propose +3 days"), L("Cả hai phải đồng ý", "You both need to agree"));
    act("ext7", L("Đề nghị gia hạn +7 ngày", "Propose +7 days"), L("Cả hai phải đồng ý", "You both need to agree"));
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
  const en = me.lang === "en";
  items.push({ id: "info", title: en ? `Updated ${s.updated_label}` : `Cập nhật lúc ${s.updated_label}`, author: en ? "Reopen to refresh" : "Mở lại mục này để làm mới" });
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
}

async function kosync(req, env, url, route) {
  const db = env.DB;
  const user = req.headers.get("x-auth-user") || "";
  const { known, me } = await memberForDevice(db, user);
  const kj = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  if (route === "users/create") return kj({ message: "Use dualpage.online" }, 402);
  if (!known) return kj({ message: "Unauthorized" }, 401);
  if (route === "users/auth") return kj({ authorized: "OK" });
  if (route === "syncs/progress" && req.method === "PUT") {
    const b = await req.json().catch(() => ({}));
    return kj({ document: b.document || "", timestamp: now() });
  }
  if (route.startsWith("syncs/progress/")) return kj({}, 404);

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
