// Sleep-screen layout for the e-reader (480x800, 1-bit).
import { Canvas, W } from "./bmp.js";

const M = 28; // side margin

function statusLine(p) {
  if (!p.bound) return "chưa mở sách chung";
  if (p.finished) return "đã đọc xong sách ✓";
  if (p.done_today) return `xong hôm nay ✓ (+${p.today_pct}%)`;
  if (p.read_today) return `đã đọc ${fmt(p.today_pct)}% / ${fmt(p.target_pct)}%`;
  return "chưa đọc hôm nay";
}

export function renderScreen(s) {
  const c = new Canvas();
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
    c.center(200, "Đang chờ bạn đọc", "bold");
    c.center(250, "Mã mời của bạn:", "body");
    c.center(300, s.code, "bold");
    c.wrap(M, 360, "Gửi mã này cho bạn đọc để ghép đôi. Phòng khoá khi đủ 2 người.", W - 2 * M, "body", 3);
    footer(c, s);
    return c.toBMP();
  }
  if (s.phase === "pending") {
    c.center(220, `${s.partner.name} đã tham gia!`, "bold");
    c.center(270, `Chờ xác nhận sprint ${s.sprint_days} ngày`, "body");
    c.wrap(M, 320, s.me.role === "guest" ? "Mở Plugins → Dual Page hoặc trang web để đồng ý." : "Đang chờ bạn ấy đồng ý.", W - 2 * M, "body", 3);
    footer(c, s);
    return c.toBMP();
  }

  if (s.phase === "recap") return renderRecap(c, s);

  const quote = s.partner.shared;
  const compact = !!(quote || s.me.nudged);

  // streak: big number with its label beside it (compact) or below it
  const n = String(s.streak);
  const bw = c.textWidth(n, "big");
  if (compact) {
    const lw = c.textWidth("chuỗi đọc chung", "bold");
    const x0 = Math.round((W - bw - 18 - lw) / 2);
    c.text(x0, y - 20, n, "big");
    c.text(x0 + bw + 18, y + 34, "ngày", "bold");
    c.text(x0 + bw + 18, y + 70, "chuỗi đọc chung", "bold");
    y += 138;
  } else {
    c.text(Math.round((W - bw) / 2), y - 16, n, "big");
    y += s.book ? 146 : 160;
    c.center(y, "ngày chuỗi đọc chung", "bold");
    y += 50;
  }

  if (s.me.nudged) {
    c.rect(M - 8, y - 6, W - 2 * (M - 8), 44);
    c.center(y + 1, `${s.partner.name} nhắc: Đọc thôi nào!`, "bold", 0);
    y += 52;
  }

  // per person: name + today's status, percent, progress bar
  for (const p of [s.me, s.partner]) {
    const label = p === s.me ? "Bạn" : trim(c, p.name, 140);
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
  c.center(y, `Sprint: ngày ${sp.day}/${sp.total_days} · còn ${sp.days_left} ngày`, "body");
  y += 36;
  if (sp.extension && !sp.extension.by_me) {
    c.center(y, trim(c, `${s.partner.name} đề nghị gia hạn +${sp.extension.days} ngày`, W - 2 * M), "body");
    y += 36;
  } else if (!quote && s.me.target_pct) {
    c.center(y, `Mục tiêu mỗi ngày: ${fmt(s.me.target_pct)}% sách`, "body");
    y += 36;
  }

  // the partner's shared highlight
  if (quote) {
    y += 6;
    const boxTop = y;
    const maxLines = Math.max(1, Math.floor((744 - y - 46) / c.lineHeight("body")));
    c.text(M + 6, y + 8, trim(c, `${s.partner.name} chia sẻ:`, W - 2 * M - 12), "bold");
    const end = c.wrap(M + 6, y + 46, `“${quote.text}”`, W - 2 * M - 12, "body", maxLines);
    c.frame(M - 8, boxTop, W - 2 * (M - 8), end - boxTop + 8, 2);
  }
  footer(c, s);
  return c.toBMP();
}

function renderRecap(c, s) {
  const r = s.sprint.recap;
  let y = 96;
  c.center(y, "TỔNG KẾT SPRINT", "bold");
  y += 40;
  if (s.book) {
    c.center(y, trim(c, `“${s.book.title}”`, W - 2 * M), "body");
    y += 40;
  }
  const n = String(r.shared_days);
  c.text(Math.round((W - c.textWidth(n, "big")) / 2), y - 10, n, "big");
  y += 160;
  c.center(y, "ngày cùng đạt mục tiêu", "bold");
  y += 44;
  if (r.early_days > 0) {
    c.center(y, `Xong sớm ${r.early_days} ngày!`, "bold");
    y += 44;
  }
  for (const p of [r.me, r.partner]) {
    c.rect(M, y, W - 2 * M, 2);
    y += 12;
    c.text(M, y, `${trim(c, p.name, 200)}: +${p.pages_pct}% sách, ${p.minutes} phút`, "body");
    y += 36;
    if (p.quote) {
      y = c.wrap(M + 10, y, `“${p.quote.text}”`, W - 2 * M - 20, "body", 3);
      y += 8;
    }
  }
  footer(c, s);
  return c.toBMP();
}

const fmt = (x) => (x >= 10 || Number.isInteger(x) ? Math.round(x) : x);

function trim(c, s, maxW) {
  if (c.textWidth(s) <= maxW) return s;
  while (s.length > 1 && c.textWidth(s + "…") > maxW) s = s.slice(0, -1);
  return s + "…";
}

function footer(c, s) {
  c.center(760, `Cập nhật lúc ${s.updated_label}`, "body");
}

export function renderNoRoom(origin) {
  const c = new Canvas();
  c.rect(0, 0, W, 64);
  c.center(16, "DUAL PAGE", "bold", 0);
  c.center(240, "Máy chưa vào phòng nào", "bold");
  c.wrap(M, 300, `Mở ${origin.replace(/^https?:\/\//, "")} trên điện thoại để tạo phòng hoặc tham gia bằng mã mời. Không cần cài lại plugin.`, W - 2 * M, "body", 5);
  return c.toBMP();
}
