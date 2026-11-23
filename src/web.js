export const PAGE = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dual Page</title>
<style>
:root{--ink:#1d1b18;--mute:#6b665e;--line:#d9d4ca;--bg:#f6f3ed;--card:#fff;--acc:#2f5d50}
*{box-sizing:border-box}body{margin:0;font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:520px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:20px;letter-spacing:.08em;margin:0 0 16px}h2{font-size:16px;margin:0 0 10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 14px}
label{display:block;font-size:14px;color:var(--mute);margin:10px 0 4px}
input,select,textarea{width:100%;font:inherit;padding:10px;border:1px solid var(--line);border-radius:8px;background:#fff}
button{font:inherit;padding:10px 14px;border-radius:8px;border:1px solid var(--acc);background:var(--acc);color:#fff;cursor:pointer;margin:8px 8px 0 0}
button.ghost{background:#fff;color:var(--acc)}button:disabled{opacity:.5}
.row{display:flex;gap:8px;align-items:center}.row>*{flex:1}
.big{font-size:72px;font-weight:700;text-align:center;line-height:1}.sub{text-align:center;color:var(--mute)}
.bar{height:14px;border:1px solid var(--ink);border-radius:7px;overflow:hidden;margin:4px 0 12px}.bar>i{display:block;height:100%;background:var(--ink)}
.muted{color:var(--mute);font-size:14px}.ok{color:var(--acc);font-weight:600}
.banner{background:var(--ink);color:#fff;border-radius:12px;padding:12px 16px;margin:0 0 14px}
.banner button{background:#fff;color:var(--ink);border-color:#fff}
.code{font-size:32px;font-weight:700;letter-spacing:.1em;text-align:center;margin:8px 0}
.q{border-left:3px solid var(--line);padding:4px 10px;margin:8px 0}.q.fav{border-color:var(--acc)}
.tabs button{margin-top:0}.err{color:#a3341f;min-height:1.2em}
img.prev{width:100%;max-width:240px;border:1px solid var(--line);display:block;margin:8px auto}
ol{padding-left:20px}.btitle{font-size:22px;font-weight:700;line-height:1.25;margin:2px 0 6px}.book{border-left:4px solid var(--acc)}a.dl{font-weight:600;color:var(--acc)}details{margin-top:8px}summary{cursor:pointer;color:var(--acc)}li{margin:4px 0}
</style></head><body><main>
<h1>DUAL PAGE</h1>
<div id="err" class="err"></div>
<div id="app">Đang tải…</div>
</main>
<script>
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";
const qs = new URLSearchParams(location.search);
let token = (location.hash.match(/t=([0-9a-f]+)/) || [])[1] || localStorage.getItem("rp_t");
if (token) { localStorage.setItem("rp_t", token); if (!location.hash) history.replaceState(null, "", location.pathname + "#t=" + token); }
let S = null, mode = qs.get("code") ? "join" : "create";

async function call(path, body) {
  $("#err").textContent = "";
  const r = await fetch("/api/" + path + (body ? "" : "?t=" + token), body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: "Lỗi mạng" }));
  if (!r.ok) { $("#err").textContent = j.error || "Có lỗi"; throw new Error(j.error); }
  return j;
}
async function act(path, body = {}) { try { S = await call(path, body); render(); } catch {} }
async function load() { if (!token) return renderStart(); try { S = await call("state"); render(); } catch (e) { if (String(e.message).includes("hợp lệ")) { localStorage.removeItem("rp_t"); token = null; renderStart(); } } }

function renderStart() {
  const days = [7, 14, 21, 30];
  $("#app").innerHTML = \`
  <div class="card tabs"><button class="\${mode === "create" ? "" : "ghost"}" onclick="mode='create';renderStart()">Tạo phòng</button><button class="\${mode === "join" ? "" : "ghost"}" onclick="mode='join';renderStart()">Tham gia bằng mã</button></div>
  <div class="card">\${mode === "create" ? \`
    <h2>Tạo phòng đọc đôi</h2>
    <label>Tên của bạn</label><input id="name" maxlength="24">
    <label>Độ dài sprint (bạn đọc sẽ xác nhận)</label>
    <select id="days">\${days.map((d) => \`<option value="\${d}" \${d === 14 ? "selected" : ""}>\${d} ngày</option>\`).join("")}<option value="custom">Tự chọn…</option></select>
    <input id="custom" type="number" min="1" max="365" placeholder="Số ngày" style="display:none;margin-top:8px">
    <label>Sách chung (chỉ cuốn này được tính vào chuỗi)</label><input id="bt" maxlength="120" placeholder="Ví dụ: Nhà giả kim">
    <label>File sách để bạn đọc tải cùng một bản (tuỳ chọn, .epub)</label><input id="bf" type="file" accept=".epub,.txt">
    <button onclick="create()">Tạo phòng và lấy mã mời</button>\` : \`
    <h2>Tham gia phòng</h2>
    <label>Mã mời</label><input id="code" placeholder="XTE-4K2" value="\${esc(qs.get("code") || "")}">
    <label>Tên của bạn</label><input id="name" maxlength="24">
    <button onclick="join()">Tham gia</button>\`}
  </div>\`;
  const sel = $("#days"); if (sel) sel.onchange = () => ($("#custom").style.display = sel.value === "custom" ? "block" : "none");
}
async function create() {
  const d = $("#days").value === "custom" ? $("#custom").value : $("#days").value;
  const f = $("#bf").files[0];
  const bt = $("#bt").value.trim() || (f ? f.name.replace(/\.[^.]+$/, "") : "");
  try {
    const r = await call("rooms", { name: $("#name").value, sprint_days: Number(d), tz, d: dev(), book_title: bt });
    token = r.t;
    if (f) await upload(f);
    setToken(r.t);
  } catch {}
}
async function join() {
  try { const r = await call("join", { code: $("#code").value, name: $("#name").value, tz, d: dev() }); setToken(r.t); } catch {}
}
function dev() { try { return localStorage.getItem("rp_dev") || ""; } catch { return ""; } }
async function getPlugin() {
  try { const r = await call("device", { d: dev() }); localStorage.setItem("rp_dev", r.d); location.href = "/api/plugin.zip?t=" + token + "&d=" + r.d; } catch {}
}
async function upload(f) {
  $("#err").textContent = "Đang tải sách lên…";
  const r = await fetch("/api/book/upload?t=" + token, { method: "POST", headers: { "x-filename": encodeURIComponent(f.name) }, body: f });
  const j = await r.json().catch(() => ({ error: "Lỗi mạng" }));
  $("#err").textContent = r.ok ? "" : j.error || "Tải sách lên thất bại";
  if (r.ok) { S = j; if (S.phase) render(); }
}
function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB"; }
function bookCard(s) {
  const b = s.book, open = !s.sprint || s.phase === "pending" || s.phase === "waiting";
  if (!b && !open) return "";
  return \`<div class="card book"><h2>Sách chung</h2>
    \${b ? \`<div class="btitle">\${esc(b.title)}</div>\` : '<p class="muted">Chưa chọn sách chung.</p>'}
    <p class="muted">Chỉ cuốn này được tính vào tiến độ và chuỗi. Đọc sách riêng thoải mái, không ảnh hưởng gì.</p>
    \${b && b.file ? \`<p><a class="dl" href="/api/book/file?t=\${token}">Tải file sách (\${kb(b.size)})</a><br><span class="muted">Trên máy đọc: Plugins → Dual Page → Tải sách chung về máy.</span></p>\` : ""}
    \${s.me.bound ? \`<p class="muted">Máy bạn đang tính cuốn: \${esc(s.me.book)}</p>\` : ""}
    \${open ? \`<details><summary>Đổi sách chung</summary>
      <label>Tên sách</label><div class="row"><input id="nbt" maxlength="120" value="\${esc(b ? b.title : "")}"><button class="ghost" onclick="act('book/title',{title:$('#nbt').value})">Lưu</button></div>
      <label>\${b && b.file ? "Thay file sách" : "Tải file sách lên (.epub)"}</label><input id="nbf" type="file" accept=".epub,.txt" onchange="this.files[0]&&upload(this.files[0])">
    </details>\` : b && !b.file ? \`<label>Tải file sách lên để bạn đọc dùng cùng bản (.epub)</label><input type="file" accept=".epub,.txt" onchange="this.files[0]&&upload(this.files[0])">\` : ""}
  </div>\`;
}
function setToken(t) { token = t; localStorage.setItem("rp_t", t); history.replaceState(null, "", location.pathname + "#t=" + t); load(); }

function st(p) {
  if (!p.bound) return "chưa mở sách chung";
  if (p.finished) return '<span class="ok">đã đọc xong ✓</span>';
  if (p.done_today) return \`<span class="ok">xong hôm nay ✓</span> (+\${p.today_pct}%)\`;
  if (p.read_today) return \`đã đọc \${p.today_pct}% / mục tiêu \${p.target_pct}%\`;
  return "chưa đọc hôm nay";
}
function bars() {
  return [S.me, S.partner].map((p) => \`<div class="row"><b>\${p === S.me ? "Bạn" : esc(p.name)}</b><span style="text-align:right">\${p.progress}%</span></div>
    <div class="bar"><i style="width:\${p.progress}%"></i></div>\`).join("");
}
function render() {
  const s = S, out = [];
  const link = location.origin + "/?code=" + s.code;
  if (s.phase === "waiting") {
    out.push(\`<div class="card"><h2>Mã mời của bạn</h2><div class="code">\${s.code}</div>
      <p class="muted">Gửi mã hoặc link này cho bạn đọc. Phòng khoá khi đủ 2 người. Sprint: \${s.sprint_days} ngày.</p>
      <input readonly value="\${link}" onclick="this.select()"><button onclick="navigator.clipboard.writeText('\${link}')">Sao chép link</button></div>\`);
  } else if (s.phase === "pending") {
    if (s.me.role === "guest") out.push(\`<div class="card"><h2>\${esc(s.partner.name)} mời bạn sprint \${s.sprint_days} ngày\${s.book ? \` với cuốn “\${esc(s.book.title)}”\` : ""}</h2>
      <p class="muted">Mục tiêu mỗi ngày = phần sách còn lại chia đều cho \${s.sprint_days} ngày. Chuỗi +1 khi cả hai cùng đạt mục tiêu trong ngày.</p>
      <button onclick="act('accept')">Đồng ý và bắt đầu</button></div>\`);
    else out.push(\`<div class="card"><h2>\${esc(s.partner.name)} đã tham gia</h2><p class="muted">Đang chờ bạn ấy đồng ý sprint \${s.sprint_days} ngày. Đổi số ngày:</p>
      <div class="row"><input id="nd" type="number" min="1" max="365" value="\${s.sprint_days}"><button onclick="act('sprint',{sprint_days:Number($('#nd').value)})">Đổi</button></div></div>\`);
  } else if (s.phase === "recap") {
    const r = s.sprint.recap;
    out.push(\`<div class="card"><h2>Tổng kết sprint</h2><div class="big">\${r.shared_days}</div><div class="sub">ngày cùng đạt mục tiêu</div>
      \${r.early_days ? \`<p class="ok" style="text-align:center">Xong sớm \${r.early_days} ngày!</p>\` : ""}
      \${[r.me, r.partner].map((p) => \`<hr><b>\${esc(p.name)}</b>: +\${p.pages_pct}% sách, \${p.minutes} phút\${p.quote ? \`<div class="q fav">“\${esc(p.quote.text)}” <span class="muted">\${esc(p.quote.page || "")}</span></div>\` : '<p class="muted">Chưa có trích dẫn</p>'}\`).join("")}
</div>\`);
  } else {
    if (s.me.nudged) out.push(\`<div class="banner"><b>\${esc(s.partner.name)} nhắc: Đọc thôi nào!</b><br><button onclick="act('nudge/dismiss')">Đã xem</button></div>\`);
    const sp = s.sprint;
    out.push(\`<div class="card"><div class="big">\${s.streak}</div><div class="sub">ngày chuỗi đọc chung · ngày \${sp.day}/\${sp.total_days}, còn \${sp.days_left} ngày</div></div>\`);
    out.push(bookCard(s));
    out.push(\`<div class="card"><h2>Hôm nay</h2><p>Bạn: \${st(s.me)}<br>\${esc(s.partner.name)}: \${st(s.partner)}</p>
      <p class="muted">Mục tiêu của bạn: \${s.me.target_pct ?? "?"}% sách mỗi ngày\${s.same_book && !s.book ? " · hai bạn đọc cùng một cuốn" : ""}</p>\${bars()}
      <button \${s.partner.done_today ? "disabled" : ""} onclick="act('nudge')">Nhắc \${esc(s.partner.name)} đọc</button></div>\`);
    const ext = sp.extension;
    out.push(\`<div class="card"><h2>Gia hạn sprint</h2>\${ext ? (ext.by_me ? \`<p>Bạn đã đề nghị +\${ext.days} ngày, chờ \${esc(s.partner.name)} đồng ý.</p><button class="ghost" onclick="act('extend',{action:'cancel'})">Huỷ đề nghị</button>\`
      : \`<p>\${esc(s.partner.name)} đề nghị gia hạn +\${ext.days} ngày.</p><button onclick="act('extend',{action:'accept'})">Đồng ý</button><button class="ghost" onclick="act('extend',{action:'decline'})">Từ chối</button>\`)
      : \`<p class="muted">Cả hai phải đồng ý.</p><button class="ghost" onclick="act('extend',{action:'propose',days:3})">Đề nghị +3 ngày</button><button class="ghost" onclick="act('extend',{action:'propose',days:7})">Đề nghị +7 ngày</button>\`}</div>\`);
  }
  if (s.phase !== "active") out.push(bookCard(s));
  const linked = s.devices > 0;
  out.push(\`<div class="card"><h2>Máy đọc XTeink</h2>
    \${linked ? \`<p class="ok">Máy đọc của bạn đã nối với phòng này ✓</p><p class="muted">Plugin chỉ cài một lần. Khi tạo hoặc tham gia phòng mới trên trình duyệt này, máy tự chuyển sang phòng mới. <a href="#" onclick="getPlugin();return false">Tải lại plugin</a></p>\`
    : \`<ol><li><button onclick="getPlugin()">Tải plugin cho máy đọc</button></li>
    <li>Giải nén, chép thư mục <b>dualpage</b> vào thư mục <b>plugins</b> ở gốc thẻ SD.</li>
    <li>Settings → Connectivity → Plugins: Enabled. Settings → Sleep Screen: Custom.</li>
    <li>Kết nối Wi-Fi một lần, rồi khởi động lại máy.</li></ol>
    <p class="muted">Chỉ cài một lần cho mỗi máy. Sau này đổi phòng không cần chép lại.</p>\`}
    <p class="muted">Màn hình chờ trên máy sẽ trông như thế này:</p><img class="prev" src="/d/\${token}/sleep.bmp?v=\${s.now}" alt="Xem trước màn hình chờ"></div>\`);
  out.push(\`<p class="muted">Cập nhật lúc \${s.updated_label} · <a href="#" onclick="load();return false">Làm mới</a> · <a href="#" onclick="if(confirm('Rời phòng này để tạo hoặc tham gia phòng khác? Dữ liệu phòng vẫn còn, vào lại bằng link có #t=.')){localStorage.removeItem('rp_t');location.href='/'};return false">Đổi phòng</a><br>Link riêng của bạn (mở trên máy khác): <input readonly value="\${location.origin}/#t=\${token}" onclick="this.select()"></p>\`);
  $("#app").innerHTML = out.join("");
}
load();
setInterval(() => { if (token && document.visibilityState === "visible" && !document.activeElement?.matches("input,textarea,select")) load(); }, 60000);
</script></body></html>`;
