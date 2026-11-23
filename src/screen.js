// Sleep-screen layout for the e-reader (480x800, 1-bit).
import { Canvas, W } from "./bmp.js";

const M = 28; // side margin

function statusLine(p) {
  if (!p.bound) return "chưa chọn sách";
  if (p.finished) return "đã đọc xong sách ✓";
  if (p.done_today) return `xong hôm nay ✓ (+${p.today_pct}%)`;
  if (p.read_today) return `đã đọc ${fmt(p.today_pct)}% / ${fmt(p.target_pct)}%`;
  return "chưa đọc hôm nay";
}

export function renderScreen(s) {
  const c = new Canvas();
  // header band
  c.rect(0, 0, W, 64);
  c.center(16, "READING PAL", "bold", 0);
  let y = 84;

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
    c.wrap(M, 320, s.me.role === "guest" ? "Mở Plugins → Reading Pal hoặc trang web để đồng ý." : "Đang chờ bạn ấy đồng ý.", W - 2 * M, "body", 3);
    footer(c, s);
    return c.toBMP();
  }

  if (s.phase === "recap") return renderRecap(c, s);

  // big streak number
  const n = String(s.streak);
  const bw = c.textWidth(n, "big");
  c.text(Math.round((W - bw) / 2), y - 10, n, "big");
  y += 160;
  c.center(y, "ngày chuỗi đọc chung", "bold");
  y += s.me.nudged ? 44 : 50;

  if (s.me.nudged) {
    c.rect(M - 8, y - 6, W - 2 * (M - 8), 46);
    c.center(y + 2, `${s.partner.name} nhắc: Đọc thôi nào!`, "bold", 0);
    y += 56;
  }

  // today box
  c.frame(M - 8, y, W - 2 * (M - 8), 132, 2);
  c.text(M + 4, y + 10, "Hôm nay", "bold");
  c.text(M + 4, y + 50, `Bạn: ${statusLine(s.me)}`, "body");
  c.text(M + 4, y + 88, `${trim(c, s.partner.name, 140)}: ${statusLine(s.partner)}`, "body");
  y += 152;

  // progress bars
  for (const p of [s.me, s.partner]) {
    const label = p === s.me ? "Bạn" : trim(c, p.name, 180);
    c.text(M, y, label, "body");
    const pt = `${p.progress}%`;
    c.text(W - M - c.textWidth(pt, "bold"), y - 2, pt, "bold");
    c.bar(M, y + 36, W - 2 * M, 28, p.progress / 100);
    y += 82;
  }
  if (s.same_book && !s.me.nudged) {
    c.center(y - 6, "Hai bạn đang đọc cùng một cuốn", "body");
    y += 30;
  }

  // sprint
  y += 8;
  c.rect(M, y, W - 2 * M, 2);
  y += 14;
  const sp = s.sprint;
  c.center(y, `Sprint: ngày ${sp.day}/${sp.total_days} · còn ${sp.days_left} ngày`, "body");
  y += 38;
  if (sp.extension && !sp.extension.by_me) {
    c.wrap(M, y, `${s.partner.name} đề nghị +${sp.extension.days} ngày (vào Plugins để đồng ý)`, W - 2 * M, "body", Math.max(1, Math.floor((745 - y) / 34)));
  } else if (s.me.target_pct && y < 720) c.center(y, `Mục tiêu mỗi ngày: ${fmt(s.me.target_pct)}% sách`, "body");
  footer(c, s);
  return c.toBMP();
}

function renderRecap(c, s) {
  const r = s.sprint.recap;
  let y = 96;
  c.center(y, "TỔNG KẾT SPRINT", "bold");
  y += 50;
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
