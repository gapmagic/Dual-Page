// Sleep-screen layout for the e-reader (480x800, 1-bit).
import { Canvas, W } from "./bmp.js";

const M = 28; // side margin
let EN = false; // set per render from the viewer's language
const L = (vi, en) => (EN ? en : vi);

function statusLine(p) {
  if (!p.bound) return L("chưa mở sách chung", "not started the book");
  if (p.finished) return L("đã đọc xong sách ✓", "finished the book ✓");
  const pg = p.target_pages != null;
  if (p.done_today) return pg ? L(`đã đọc ${p.today_pages}/${p.target_pages} trang ✓`, `read ${p.today_pages}/${p.target_pages} pages ✓`) : L(`xong hôm nay ✓ (+${p.today_pct}%)`, `done today ✓ (+${p.today_pct}%)`);
  if (p.read_today && pg) return L(`đã đọc ${p.today_pages}/${p.target_pages} trang`, `read ${p.today_pages}/${p.target_pages} pages`);
  if (p.read_today) return L(`đã đọc ${fmt(p.today_pct)}% / ${fmt(p.target_pct)}%`, `read ${fmt(p.today_pct)}% / ${fmt(p.target_pct)}%`);
  return L("chưa đọc hôm nay", "not read today");
}

export function renderScreen(s) {
  EN = s.me && s.me.lang === "en";
  const c = new Canvas();
  c.band = 64; // header band height, extended to the full width on wider screens
  // header band
  c.rect(0, 0, W, 64);
  c.center(16, "DUAL PAGE", "bold", 0);
  let y = 84;
  if (s.book && s.phase !== "recap") {
    // Shared book title under the header band.
    c.center(74, trim(c, `“${s.book.title}”`, W - 2 * M), "body");
    c.rect(M, 112, W - 2 * M, 1);
    y = 118;
  }

  if (s.phase === "waiting") {
    c.center(200, L("Đang chờ bạn đọc", "Waiting for your partner"), "bold");
    c.center(250, L("Mã mời của bạn:", "Your invite code:"), "body");
    c.center(300, s.code, "bold");
    c.wrap(M, 360, L("Gửi mã này cho bạn đọc để ghép đôi. Phòng khoá khi đủ 2 người.", "Send this code to your reading partner. The room locks at 2 people."), W - 2 * M, "body", 3);
    footer(c, s);
    return c;
  }
  if (s.phase === "pending") {
    c.center(220, L(`${s.partner.name} đã tham gia!`, `${s.partner.name} joined!`), "bold");
    c.center(270, L(`Chờ xác nhận sprint ${s.sprint_days} ngày`, `Waiting to start a ${s.sprint_days}-day sprint`), "body");
    c.wrap(M, 320, s.me.role === "guest" ? L("Mở Plugins → Dual Page hoặc trang web để đồng ý.", "Open Plugins → Dual Page or the website to accept.") : L("Đang chờ bạn ấy đồng ý.", "Waiting for them to accept."), W - 2 * M, "body", 3);
    footer(c, s);
    return c;
  }

  if (s.phase === "recap") return renderRecap(c, s);

  const quote = s.partner.shared;
  const compact = !!(quote || s.me.nudged);

  // streak: big number with its label beside it (compact) or below it
  const n = String(s.streak);
  const bw = c.textWidth(n, "big");
  if (compact) {
    const l1 = L("ngày", "day"), l2 = L("chuỗi đọc chung", "reading streak");
    const lw = Math.max(c.textWidth(l1, "bold"), c.textWidth(l2, "bold"));
    const x0 = Math.round((W - bw - 18 - lw) / 2);
    c.text(x0, y - 20, n, "big");
    c.text(x0 + bw + 18, y + 34, l1, "bold");
    c.text(x0 + bw + 18, y + 70, l2, "bold");
    y += 138;
  } else {
    c.text(Math.round((W - bw) / 2), y - 16, n, "big");
    y += s.book ? 146 : 160;
    c.center(y, L("ngày chuỗi đọc chung", "day reading streak"), "bold");
    y += 50;
  }

  if (s.me.nudged) {
    c.rect(M - 8, y - 6, W - 2 * (M - 8), 44);
    c.center(y + 1, trim(c, L(`${s.partner.name} nhắc: Đọc thôi nào!`, `${s.partner.name}: time to read!`), W - 2 * M), "bold", 0);
    y += 52;
  }

  // per person: name + today's status, percent, progress bar
  for (const p of [s.me, s.partner]) {
    const label = p === s.me ? L("Bạn", "You") : trim(c, p.name, 140);
    const pt = `${p.progress}%`;
    const ptw = c.textWidth(pt, "bold");
    c.text(M, y, trim(c, `${label}: ${statusLine(p)}`, W - 2 * M - ptw - 12), "body");
    c.text(W - M - ptw, y - 2, pt, "bold");
    c.bar(M, y + 34, W - 2 * M, 22, p.progress / 100);
    y += compact ? 68 : 80;
  }

  // sprint line
  y += 2;
  c.rect(M, y, W - 2 * M, 1);
  y += 10;
  const sp = s.sprint;
  c.center(y, L(`Sprint: ngày ${sp.day}/${sp.total_days} · còn ${sp.days_left} ngày`, `Sprint: day ${sp.day}/${sp.total_days} · ${sp.days_left} days left`), "body");
  y += 36;
  if (sp.extension && !sp.extension.by_me) {
    c.center(y, trim(c, L(`${s.partner.name} đề nghị gia hạn +${sp.extension.days} ngày`, `${s.partner.name} asks to extend +${sp.extension.days} days`), W - 2 * M), "body");
    y += 36;
  } else if (!quote && s.me.target_pct) {
    c.center(y, s.me.target_pages != null
      ? L(`Mục tiêu mỗi ngày: ${s.me.target_pages} trang`, `Daily goal: ${s.me.target_pages} pages`)
      : L(`Mục tiêu mỗi ngày: ${fmt(s.me.target_pct)}% sách`, `Daily goal: ${fmt(s.me.target_pct)}% of the book`), "body");
    y += 36;
  }

  // the partner's shared highlight
  if (quote) {
    y += 6;
    const boxTop = y;
    const maxLines = Math.max(1, Math.floor((744 - y - 46) / c.lineHeight("body")));
    c.text(M + 6, y + 8, trim(c, L(`${s.partner.name} chia sẻ:`, `${s.partner.name} shared:`), W - 2 * M - 12), "bold");
    const end = c.wrap(M + 6, y + 46, `“${quote.text}”`, W - 2 * M - 12, "body", maxLines);
    c.frame(M - 8, boxTop, W - 2 * (M - 8), end - boxTop + 8, 2);
  }
  footer(c, s);
  return c;
}

function renderRecap(c, s) {
  const r = s.sprint.recap;
  let y = 96;
  c.center(y, L("TỔNG KẾT SPRINT", "SPRINT RECAP"), "bold");
  y += 40;
  if (s.book) {
    c.center(y, trim(c, `“${s.book.title}”`, W - 2 * M), "body");
    y += 40;
  }
  const n = String(r.shared_days);
  c.text(Math.round((W - c.textWidth(n, "big")) / 2), y - 10, n, "big");
  y += 160;
  c.center(y, L("ngày cùng đạt mục tiêu", "days you both hit the goal"), "bold");
  y += 44;
  if (r.early_days > 0) {
    c.center(y, L(`Xong sớm ${r.early_days} ngày!`, `Finished ${r.early_days} days early!`), "bold");
    y += 44;
  }
  for (const p of [r.me, r.partner]) {
    c.rect(M, y, W - 2 * M, 2);
    y += 12;
    c.text(M, y, `${trim(c, p.name, 200)}: ` + L(`+${p.pages_pct}% sách, ${p.minutes} phút`, `+${p.pages_pct}% of book, ${p.minutes} min`), "body");
    y += 36;
    if (p.quote) {
      y = c.wrap(M + 10, y, `“${p.quote.text}”`, W - 2 * M - 20, "body", 3);
      y += 8;
    }
  }
  footer(c, s);
  return c;
}

const fmt = (x) => (x >= 10 || Number.isInteger(x) ? Math.round(x) : x);

function trim(c, s, maxW) {
  if (c.textWidth(s) <= maxW) return s;
  while (s.length > 1 && c.textWidth(s + "…") > maxW) s = s.slice(0, -1);
  return s + "…";
}

function footer(c, s) {
  c.center(760, L(`Cập nhật lúc ${s.updated_label}`, `Updated ${s.updated_label}`), "body");
}

export function renderNoRoom(origin, lang) {
  EN = lang === "en";
  const c = new Canvas();
  c.band = 64;
  c.rect(0, 0, W, 64);
  c.center(16, "DUAL PAGE", "bold", 0);
  c.center(240, L("Máy chưa vào phòng nào", "This reader isn't in a room"), "bold");
  c.wrap(M, 300, L(`Mở ${origin.replace(/^https?:\/\//, "")} trên điện thoại để tạo phòng hoặc tham gia bằng mã mời. Không cần cài lại plugin.`, `Open ${origin.replace(/^https?:\/\//, "")} on your phone to create a room or join with an invite code. No need to reinstall the plugin.`), W - 2 * M, "body", 5);
  return c;
}
