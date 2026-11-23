import { computeState, ingest, firstSeen, loadMember, inviteCode, randomHex, now, pct, FULL } from "./logic.js";
import { renderScreen } from "./screen.js";
import { makeZip } from "./zip.js";
import { pluginFiles } from "./plugin.js";
import { PAGE } from "./web.js";

const DAY = 86400;
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
const text = (s, status = 200) => new Response(s, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
const bad = (msg, status = 400) => json({ error: msg }, status);

function cleanName(s) {
  return String(s || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24);
}
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
      return text("Not found", 404);
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      return p.startsWith("/d/") && p.endsWith(".bmp") ? text("error", 500) : bad("server_error: " + e.message, 500);
    }
  },
};

async function api(req, env, url, route) {
  const db = env.DB;
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const token = body.t || url.searchParams.get("t");

  if (route === "rooms" && req.method === "POST") {
    const name = cleanName(body.name);
    if (!name) return bad("Cần nhập tên");
    let days = Math.round(Number(body.sprint_days));
    if (!(days >= 1 && days <= 365)) return bad("Số ngày sprint phải từ 1 đến 365");
    const roomId = randomHex(8);
    let code;
    for (let i = 0; i < 5; i++) {
      code = inviteCode();
      if (!(await db.prepare("SELECT 1 FROM rooms WHERE code = ?").bind(code).first())) break;
    }
    const t = now();
    const memberToken = randomHex(16);
    await db.batch([
      db.prepare("INSERT INTO rooms (id, code, sprint_days, created_at) VALUES (?, ?, ?, ?)").bind(roomId, code, days, t),
      db
        .prepare("INSERT INTO members (id, room_id, token, name, tz, role, created_at) VALUES (?, ?, ?, ?, ?, 'host', ?)")
        .bind(randomHex(8), roomId, memberToken, name, cleanTz(body.tz), t),
    ]);
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
      .prepare("INSERT INTO members (id, room_id, token, name, tz, role, created_at) VALUES (?, ?, ?, ?, ?, 'guest', ?)")
      .bind(randomHex(8), room.id, memberToken, name, cleanTz(body.tz), now())
      .run();
    return json({ t: memberToken });
  }

  const me = await loadMember(db, token);
  if (!me) return bad("Không hợp lệ hoặc đã hết hạn", 401);
  const room = await db.prepare("SELECT * FROM rooms WHERE id = ?").bind(me.room_id).first();
  const partner = await db.prepare("SELECT * FROM members WHERE room_id = ? AND id != ?").bind(me.room_id, me.id).first();

  switch (route) {
    case "state":
      return json(await computeState(db, me));

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

    case "progress": {
      const val = Number(body.percent);
      if (!(val >= 0 && val <= 100)) return bad("Phần trăm phải từ 0 đến 100");
      await ingest(db, me, val * 100, now(), { seconds: Math.max(0, Math.round(Number(body.minutes || 0) * 60)) });
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

    case "nudge/dismiss":
      await db.prepare("UPDATE members SET nudged_ts = NULL WHERE id = ?").bind(me.id).run();
      return json(await computeState(db, await loadMember(db, token)));

    case "quote": {
      const q = String(body.text || "").trim().slice(0, 400);
      if (!q) return bad("Trích dẫn trống");
      await addQuote(db, me, q, String(body.page || "").slice(0, 20) || `${pct(me.bp)}%`);
      return json(await computeState(db, me));
    }

    case "quote/fav": {
      const q = await db.prepare("SELECT * FROM quotes WHERE id = ? AND member_id = ?").bind(Number(body.id), me.id).first();
      if (!q) return bad("Chỉ chọn được trích dẫn của chính bạn");
      await db.prepare("UPDATE members SET fav_quote = ? WHERE id = ?").bind(q.id, me.id).run();
      return json(await computeState(db, await loadMember(db, token)));
    }

    case "extend":
      return json(await extend(db, me, room, body.action, Number(body.days)));

    case "plugin.zip": {
      const files = pluginFiles(url.origin, token, me.name);
      const zip = makeZip(files);
      return new Response(zip, {
        headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="readpal-plugin.zip"' },
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
  const me = await loadMember(db, token);
  if (!me) return action.endsWith(".bmp") ? text("unknown device", 404) : text("unknown device", 401);

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
    return new Response(renderScreen(s), { headers: { "content-type": "image/bmp", "cache-control": "no-store" } });
  }

  if (action === "home") return json({ items: await homeItems(db, me) });

  if (action === "search") {
    const q = (url.searchParams.get("q") || "").trim().slice(0, 400);
    if (q.length >= 3) {
      await addQuote(db, me, q, `${pct(me.bp)}%`);
      return json({ items: [{ id: "info", title: "Đã lưu trích dẫn ✓", author: `“${q.slice(0, 80)}” · ${pct(me.bp)}%` }] });
    }
    return json({ items: [{ id: "info", title: "Trích dẫn quá ngắn", author: "Gõ 1-2 câu rồi tìm để lưu" }] });
  }

  if (action.startsWith("act/")) {
    const id = decodeURIComponent(action.slice(4)).replace(/\.txt$/, "");
    const room = await db.prepare("SELECT * FROM rooms WHERE id = ?").bind(me.room_id).first();
    const partner = await db.prepare("SELECT * FROM members WHERE room_id = ? AND id != ?").bind(me.room_id, me.id).first();
    let msg = "Reading Pal";
    try {
      if (id === "nudge" && partner) {
        await db.prepare("UPDATE members SET nudged_ts = ? WHERE id = ?").bind(now(), partner.id).run();
        msg = `Đã nhắc ${partner.name}.`;
      } else if (id === "seen") {
        await db.prepare("UPDATE members SET nudged_ts = NULL WHERE id = ?").bind(me.id).run();
        msg = "Đã xem lời nhắc.";
      } else if (id === "ext3" || id === "ext7") {
        await extend(db, me, room, "propose", id === "ext3" ? 3 : 7);
        msg = "Đã gửi đề nghị gia hạn.";
      } else if (id === "ext_yes") {
        await extend(db, me, room, "accept");
        msg = "Đã đồng ý gia hạn.";
      } else if (id === "ext_no") {
        await extend(db, me, room, "decline");
        msg = "Đã từ chối gia hạn.";
      } else if (id === "accept" && me.role === "guest" && !room.start_ts) {
        await startSprint(db, room);
        msg = "Sprint đã bắt đầu!";
      }
    } catch (e) {
      msg = e.message;
    }
    return text(msg + "\n");
  }
  return text("Not found", 404);
}

async function homeItems(db, me) {
  const s = await computeState(db, me);
  const items = [];
  const info = (title, author = "") => items.push({ id: "info", title, author });
  const act = (id, title, author = "") => items.push({ id, title, author });
  const st = (p) =>
    !p.bound ? "chưa chọn sách" : p.finished ? "đã đọc xong ✓" : p.done_today ? `xong hôm nay ✓ +${p.today_pct}%` : p.read_today ? `đã đọc ${Math.round(p.today_pct)}% / mục tiêu ${Math.round(p.target_pct)}%` : "chưa đọc hôm nay";

  if (s.phase === "waiting") {
    info(`Mã mời: ${s.code}`, "Gửi mã này cho bạn đọc để ghép đôi");
    return items;
  }
  if (s.phase === "pending") {
    if (me.role === "guest") act("accept", `Nhận sprint ${s.sprint_days} ngày`, "Bấm để bắt đầu cùng nhau");
    else info(`Chờ ${s.partner.name} nhận sprint ${s.sprint_days} ngày`);
    return items;
  }
  if (s.me.nudged) act("seen", `${s.partner.name} nhắc: Đọc thôi nào!`, "Bấm để đánh dấu đã xem");
  if (s.phase === "recap") {
    const r = s.sprint.recap;
    info(`Tổng kết: ${r.shared_days} ngày cùng đạt mục tiêu`, r.early_days ? `Xong sớm ${r.early_days} ngày!` : "");
    for (const x of [r.me, r.partner]) info(`${x.name}: +${x.pages_pct}% sách, ${x.minutes} phút`, x.quote ? `“${x.quote.text.slice(0, 120)}”` : "");
    return items;
  }
  info(`Chuỗi đọc chung: ${s.streak} ngày`, `Sprint ngày ${s.sprint.day}/${s.sprint.total_days}, còn ${s.sprint.days_left} ngày`);
  info(`Bạn: ${st(s.me)}`, `Tiến độ ${s.me.progress}% · mục tiêu ${s.me.target_pct ? Math.round(s.me.target_pct) : "?"}%/ngày`);
  info(`${s.partner.name}: ${st(s.partner)}`, `Tiến độ ${s.partner.progress}%`);
  if (!s.partner.done_today) act("nudge", `Nhắc ${s.partner.name} đọc`, "Lời nhắc hiện khi bạn ấy mở máy");
  const ext = s.sprint.extension;
  if (ext && !ext.by_me) {
    act("ext_yes", `Đồng ý gia hạn +${ext.days} ngày`, `${s.partner.name} đề nghị`);
    act("ext_no", "Từ chối gia hạn");
  } else if (ext) info(`Đã đề nghị gia hạn +${ext.days} ngày`, `Chờ ${s.partner.name} đồng ý`);
  else {
    act("ext3", "Đề nghị gia hạn +3 ngày");
    act("ext7", "Đề nghị gia hạn +7 ngày");
  }
  info("Lưu trích dẫn: bấm Tìm kiếm", "Gõ 1-2 câu, kèm trang/% hiện tại");
  info(`Cập nhật lúc ${s.updated_label}`, "Mở lại mục này để làm mới");
  return items;
}
