// Companion web page. Vietnamese is the source language; t() looks strings up in EN.
export const PAGE = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dual Page</title>
<style>
:root{--ink:#1d1b18;--mute:#6b665e;--line:#d9d4ca;--bg:#f6f3ed;--card:#fff;--acc:#2f5d50}
*{box-sizing:border-box}body{margin:0;font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:520px;margin:0 auto;padding:20px 16px 60px}
header{display:flex;justify-content:space-between;align-items:center;margin:0 0 16px}
h1{font-size:20px;letter-spacing:.08em;margin:0}h2{font-size:16px;margin:0 0 10px}
.lang a{color:var(--mute);text-decoration:none;font-size:14px;font-weight:600;padding:4px 6px;border-radius:6px}.lang a.on{color:#fff;background:var(--acc)}
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
.q{border-left:3px solid var(--line);padding:4px 10px;margin:8px 0}.q.fav{border-color:var(--acc)}.big-q{font-size:18px;line-height:1.4}
.tabs button{margin-top:0}.err{color:#a3341f;min-height:1.2em}
img.prev{width:100%;max-width:240px;border:1px solid var(--line);display:block;margin:8px auto}
ol{padding-left:20px}.btitle{font-size:22px;font-weight:700;line-height:1.25;margin:2px 0 6px}.book{border-left:4px solid var(--acc)}a.dl{font-weight:600;color:var(--acc)}details{margin-top:8px}summary{cursor:pointer;color:var(--acc)}li{margin:4px 0}
</style></head><body><main>
<header><h1>DUAL PAGE</h1><nav class="lang"><a href="#" data-l="vi" onclick="setLang('vi');return false">VI</a><a href="#" data-l="en" onclick="setLang('en');return false">EN</a></nav></header>
<div id="err" class="err"></div>
<div id="app">…</div>
</main>
<script>
const EN = {
  "Đang tải…": "Loading…",
  "Lỗi mạng": "Network error",
  "Có lỗi": "Something went wrong",
  "Tạo phòng": "Create a room",
  "Tham gia bằng mã": "Join with a code",
  "Tạo phòng đọc đôi": "Create a reading room for two",
  "Tên của bạn": "Your name",
  "Độ dài sprint (bạn đọc sẽ xác nhận)": "Sprint length (your partner confirms)",
  "{0} ngày": "{0} days",
  "Tự chọn…": "Custom…",
  "Số ngày": "Days",
  "Sách chung (chỉ cuốn này được tính vào chuỗi)": "Shared book (only this book counts toward the streak)",
  "Ví dụ: Nhà giả kim": "e.g. The Alchemist",
  "File sách để bạn đọc tải cùng một bản (tuỳ chọn, .epub)": "Book file so you both read the same copy (optional, .epub)",
  "Tạo phòng và lấy mã mời": "Create room and get invite code",
  "Tham gia phòng": "Join a room",
  "Mã mời": "Invite code",
  "Tham gia": "Join",
  "Đang tải sách lên…": "Uploading book…",
  "Tải sách lên thất bại": "Upload failed",
  "Sách chung": "Shared book",
  "Chưa chọn sách chung.": "No shared book yet.",
  "Chỉ cuốn này được tính vào tiến độ và chuỗi. Đọc sách riêng thoải mái, không ảnh hưởng gì.": "Only this book counts toward progress and the streak. Read other books freely; they don't affect anything.",
  "Tải file sách ({0})": "Download book file ({0})",
  "Trên máy đọc: Plugins → Dual Page → Tải sách chung về máy.": "On your reader: Dual Page → Shared book → Download the shared book.",
  "Máy bạn đang tính cuốn: {0}": "Your reader is counting: {0}",
  "Đổi sách chung": "Change shared book",
  "Tên sách": "Book title",
  "Lưu": "Save",
  "Thay file sách": "Replace book file",
  "Tải file sách lên (.epub)": "Upload book file (.epub)",
  "Tải file sách lên để bạn đọc dùng cùng bản (.epub)": "Upload the book file so you both read the same copy (.epub)",
  "đang hiện bên {0}": "showing on {0}'s screen",
  "chia sẻ câu này": "share this one",
  "Câu hay chia sẻ cho nhau": "Shared highlights",
  "{0} chia sẻ:": "{0} shared:",
  "{0} chưa chia sẻ câu nào.": "{0} hasn't shared a highlight yet.",
  "Highlight câu hay trong sách chung trên máy đọc. Khi máy ngủ, câu mới nhất của bạn tự hiện trên màn hình chờ của {0} (tối đa 140 ký tự). Muốn chia sẻ câu khác thì chọn bên dưới hoặc trong menu Dual Page trên máy.": "Highlight lines in the shared book on your reader. Your newest highlight shows up on {0}'s sleep screen (up to 140 characters). To share a different one, pick it below or in the Dual Page menu on your reader.",
  "Câu bạn đã highlight": "Your highlights",
  "Chưa thấy câu highlight nào? Bật chia sẻ highlight trên máy": "No highlights yet? Turn on highlight sharing on your reader",
  "XTeink: Settings → File Transfer, kết nối cùng Wi-Fi với điện thoại.": "XTeink: Settings → File Transfer, on the same Wi-Fi as your phone.",
  "Mở địa chỉ máy hiện trên màn hình (ví dụ crosspoint.local) bằng trình duyệt điện thoại, vào trang Plugins.": "Open the address shown on the reader (e.g. crosspoint.local) in your phone's browser and go to Plugins.",
  "Ở thẻ \\"Dual Page\\", bấm \\"Bật chia sẻ highlight\\".": "On the \\"Dual Page\\" card, tap \\"Turn on highlight sharing\\".",
  "KOReader: highlight được gửi tự động khi có Wi-Fi.": "KOReader: highlights are sent automatically when Wi-Fi is on.",
  "chưa mở sách chung": "hasn't opened the shared book",
  "đã đọc xong ✓": "finished ✓",
  "xong hôm nay ✓": "done for today ✓",
  "đã đọc {0}% / mục tiêu {1}%": "read {0}% of {1}% goal",
  "chưa đọc hôm nay": "hasn't read today",
  "Bạn": "You",
  "Mã mời của bạn": "Your invite code",
  "Gửi mã hoặc link này cho bạn đọc. Phòng khoá khi đủ 2 người. Sprint: {0} ngày.": "Send this code or link to your reading partner. The room locks at 2 people. Sprint: {0} days.",
  "Sao chép link": "Copy link",
  "{0} mời bạn sprint {1} ngày": "{0} invites you to a {1}-day sprint",
  " với cuốn “{0}”": " reading “{0}”",
  "Mục tiêu mỗi ngày = phần sách còn lại chia đều cho {0} ngày. Chuỗi +1 khi cả hai cùng đạt mục tiêu trong ngày.": "Daily goal = the rest of the book split over {0} days. The streak grows by 1 on days you both reach your goal.",
  "Đồng ý và bắt đầu": "Accept and start",
  "{0} đã tham gia": "{0} joined",
  "Đang chờ bạn ấy đồng ý sprint {0} ngày. Đổi số ngày:": "Waiting for them to accept the {0}-day sprint. Change length:",
  "Đổi": "Change",
  "Tổng kết sprint": "Sprint recap",
  "ngày cùng đạt mục tiêu": "days you both hit your goal",
  "Xong sớm {0} ngày!": "Finished {0} days early!",
  "+{0}% sách, {1} phút": "+{0}% of the book, {1} min",
  "Chưa có câu chia sẻ": "No shared highlight",
  "{0} nhắc: Đọc thôi nào!": "{0} says: time to read!",
  "Đã xem": "Got it",
  "ngày chuỗi đọc chung · ngày {0}/{1}, còn {2} ngày": "day reading streak · day {0}/{1}, {2} days left",
  "Hôm nay": "Today",
  "Mục tiêu của bạn: {0}% sách mỗi ngày": "Your goal: {0}% of the book per day",
  "Nhắc {0} đọc": "Nudge {0} to read",
  "Gia hạn sprint": "Extend the sprint",
  "Bạn đã đề nghị +{0} ngày, chờ {1} đồng ý.": "You proposed +{0} days, waiting for {1}.",
  "Huỷ đề nghị": "Cancel proposal",
  "{0} đề nghị gia hạn +{1} ngày.": "{0} proposed extending by +{1} days.",
  "Đồng ý": "Accept",
  "Từ chối": "Decline",
  "Cả hai phải đồng ý.": "You both need to agree.",
  "Đề nghị +{0} ngày": "Propose +{0} days",
  "Số ngày (1–30)": "Days (1–30)",
  "Đề nghị": "Propose",
  "Số ngày gia hạn phải từ 1 đến 30": "Extensions must be 1 to 30 days",
  "Máy đọc": "Your reader",
  "Có bản plugin mới? Tải lại rồi chép đè lên bản cũ:": "New plugin version? Download it again and copy it over the old one:",
  "Tải lại plugin XTeink": "Download XTeink plugin again",
  "Tải lại plugin KOReader": "Download KOReader plugin again",
  "Máy đọc của bạn đã nối với phòng này ✓": "Your reader is connected to this room ✓",
  "Plugin chỉ cài một lần. Khi tạo hoặc tham gia phòng mới trên trình duyệt này, máy tự chuyển sang phòng mới.": "Install the plugin once. When you create or join a new room in this browser, your reader switches over automatically.",
  "Hai bạn dùng máy khác nhau vẫn vào chung một phòng được. Chọn đúng loại máy của bạn:": "You can share a room even with different e-readers. Pick yours:",
  "XTeink (CrossPoint 2.0 trở lên)": "XTeink (CrossPoint 2.0 or later)",
  "Tải plugin cho XTeink": "Download the XTeink plugin",
  "Giải nén, chép thư mục <b>dualpage</b> vào thư mục <b>plugins</b> ở gốc thẻ SD.": "Unzip and copy the <b>dualpage</b> folder into the <b>plugins</b> folder at the root of the SD card.",
  "Settings → Connectivity → Plugins: Enabled. Settings → Sleep Screen: Custom.": "Settings → Connectivity → Plugins: Enabled. Settings → Sleep Screen: Custom.",
  "Kết nối Wi-Fi một lần, rồi khởi động lại máy.": "Connect to Wi-Fi once, then restart the reader.",
  "KOReader (Kindle, Kobo, PocketBook, Android)": "KOReader (Kindle, Kobo, PocketBook, Android)",
  "Tải plugin cho KOReader": "Download the KOReader plugin",
  "Giải nén, chép thư mục <b>dualpage.koplugin</b> vào <b>koreader/plugins</b> trên máy.": "Unzip and copy the <b>dualpage.koplugin</b> folder into <b>koreader/plugins</b> on your device.",
  "Khởi động lại KOReader. Mở menu chính → <b>Dual Page</b> → bật <b>Dùng màn hình chờ Dual Page</b>.": "Restart KOReader. Open the main menu → <b>Dual Page</b> → turn on <b>Use Dual Page sleep screen</b>.",
  "Đọc như bình thường. Highlight mới tự gửi, hoặc chọn chữ → <b>Chia sẻ Dual Page</b>.": "Read as usual. New highlights are sent automatically, or select text → <b>Share to Dual Page</b>.",
  "Chỉ cài một lần cho mỗi máy. Sau này đổi phòng không cần chép lại.": "One install per device. Changing rooms later doesn't need a reinstall.",
  "Màn hình chờ trên máy sẽ trông như thế này:": "Your sleep screen will look like this:",
  "Xem trước màn hình chờ": "Sleep screen preview",
  "Cập nhật lúc {0}": "Updated {0}",
  "Làm mới": "Refresh",
  "Đổi phòng": "Switch room",
  "Rời phòng này để tạo hoặc tham gia phòng khác? Dữ liệu phòng vẫn còn, vào lại bằng link có #t=.": "Leave this room to create or join another? Room data is kept; come back with your #t= link.",
  "Link riêng của bạn (mở trên máy khác):": "Your private link (to open on another device):",
  "hai bạn đọc cùng một cuốn": "you're both reading the same book",
  // server errors
  "Chưa có bạn đọc": "No reading partner yet",
  "Chỉ người được mời mới xác nhận": "Only the invited reader can accept",
  "Chỉ nhận file .epub hoặc .txt": "Only .epub or .txt files",
  "Cần nhập tên": "Please enter your name",
  "Cần nhập tên sách": "Please enter a book title",
  "Cần nhập tên sách chung": "Please enter the shared book's title",
  "File lớn hơn 24MB": "File is larger than 24 MB",
  "File trống": "File is empty",
  "Không hợp lệ hoặc đã hết hạn": "Invalid or expired link",
  "Không thể đổi sau khi sprint đã bắt đầu": "Can't change this after the sprint has started",
  "Không tìm thấy câu này": "Highlight not found",
  "Không tìm thấy file": "File not found",
  "Không tìm thấy mã mời này": "Invite code not found",
  "Phòng chưa có file sách": "This room has no book file",
  "Phòng này đã đủ 2 người": "This room already has 2 readers",
  "Sprint đã bắt đầu, không đổi sách chung được nữa": "The sprint has started; the shared book can't be changed",
  "Số ngày sprint phải từ 1 đến 365": "Sprint length must be 1 to 365 days",
  "Thiếu mã máy đọc, hãy tải lại từ trang web": "Missing reader code, please download again from this page",
  "Sprint chưa bắt đầu": "The sprint hasn't started",
  "Chỉ gia hạn +3 hoặc +7 ngày": "Extensions are +3 or +7 days",
  "Không có đề nghị gia hạn nào từ bạn đọc": "Your partner hasn't proposed an extension",
};
let LANG = ((l) => (l === "en" || l === "vi" ? l : null))(new URLSearchParams(location.search).get("lang")) || localStorage.getItem("rp_lang") || ((navigator.language || "vi").toLowerCase().startsWith("vi") ? "vi" : "en");
function t(s, ...a) { const x = LANG === "en" && EN[s] !== undefined ? EN[s] : s; return x.replace(/\\{(\\d)\\}/g, (_, i) => a[i] ?? ""); }

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";
const qs = new URLSearchParams(location.search);
let token = (location.hash.match(/t=([0-9a-f]+)/) || [])[1] || localStorage.getItem("rp_t");
if (token) { localStorage.setItem("rp_t", token); if (!location.hash) history.replaceState(null, "", location.pathname + "#t=" + token); }
let S = null, mode = qs.get("code") ? "join" : "create";

function paintLang() {
  document.documentElement.lang = LANG;
  for (const a of document.querySelectorAll(".lang a")) a.classList.toggle("on", a.dataset.l === LANG);
}
async function setLang(l) {
  LANG = l; localStorage.setItem("rp_lang", l); paintLang();
  if (token && S) { try { S = await call("lang", { lang: l }); } catch {} render(); } else renderStart();
}
async function call(path, body) {
  $("#err").textContent = "";
  const r = await fetch("/api/" + path + (body ? "" : "?t=" + token), body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, ...body }) } : {});
  const j = await r.json().catch(() => ({ error: "Lỗi mạng" }));
  if (!r.ok) { $("#err").textContent = t(j.error || "Có lỗi"); throw new Error(j.error); }
  return j;
}
async function act(path, body = {}) { try { S = await call(path, body); render(); } catch {} }
async function load() {
  paintLang();
  if (!token) return renderStart();
  try {
    S = await call("state");
    if (S.me.lang !== LANG) { try { S = await call("lang", { lang: LANG }); } catch {} }
    render();
  } catch (e) { if (String(e.message).includes("hợp lệ")) { localStorage.removeItem("rp_t"); token = null; renderStart(); } }
}

function renderStart() {
  const days = [7, 14, 21, 30];
  $("#app").innerHTML = \`
  <div class="card tabs"><button class="\${mode === "create" ? "" : "ghost"}" onclick="mode='create';renderStart()">\${t("Tạo phòng")}</button><button class="\${mode === "join" ? "" : "ghost"}" onclick="mode='join';renderStart()">\${t("Tham gia bằng mã")}</button></div>
  <div class="card">\${mode === "create" ? \`
    <h2>\${t("Tạo phòng đọc đôi")}</h2>
    <label>\${t("Tên của bạn")}</label><input id="name" maxlength="24">
    <label>\${t("Độ dài sprint (bạn đọc sẽ xác nhận)")}</label>
    <select id="days">\${days.map((d) => \`<option value="\${d}" \${d === 14 ? "selected" : ""}>\${t("{0} ngày", d)}</option>\`).join("")}<option value="custom">\${t("Tự chọn…")}</option></select>
    <input id="custom" type="number" min="1" max="365" placeholder="\${t("Số ngày")}" style="display:none;margin-top:8px">
    <label>\${t("Sách chung (chỉ cuốn này được tính vào chuỗi)")}</label><input id="bt" maxlength="120" placeholder="\${t("Ví dụ: Nhà giả kim")}">
    <label>\${t("File sách để bạn đọc tải cùng một bản (tuỳ chọn, .epub)")}</label><input id="bf" type="file" accept=".epub,.txt">
    <button onclick="create()">\${t("Tạo phòng và lấy mã mời")}</button>\` : \`
    <h2>\${t("Tham gia phòng")}</h2>
    <label>\${t("Mã mời")}</label><input id="code" placeholder="XTE-4K2" value="\${esc(qs.get("code") || "")}">
    <label>\${t("Tên của bạn")}</label><input id="name" maxlength="24">
    <button onclick="join()">\${t("Tham gia")}</button>\`}
  </div>\`;
  const sel = $("#days"); if (sel) sel.onchange = () => ($("#custom").style.display = sel.value === "custom" ? "block" : "none");
}
async function create() {
  const d = $("#days").value === "custom" ? $("#custom").value : $("#days").value;
  const f = $("#bf").files[0];
  const bt = $("#bt").value.trim() || (f ? f.name.replace(/\\.[^.]+$/, "") : "");
  try {
    const r = await call("rooms", { name: $("#name").value, sprint_days: Number(d), tz, d: dev(), book_title: bt, lang: LANG });
    token = r.t;
    if (f) await upload(f);
    setToken(r.t);
  } catch {}
}
async function join() {
  try { const r = await call("join", { code: $("#code").value, name: $("#name").value, tz, d: dev(), lang: LANG }); setToken(r.t); } catch {}
}
function dev() { try { return localStorage.getItem("rp_dev") || ""; } catch { return ""; } }
async function getPlugin(kind) {
  try { const r = await call("device", { d: dev() }); localStorage.setItem("rp_dev", r.d); location.href = "/api/" + (kind === "ko" ? "koplugin.zip" : "plugin.zip") + "?t=" + token + "&d=" + r.d; } catch {}
}
async function upload(f) {
  $("#err").textContent = t("Đang tải sách lên…");
  const r = await fetch("/api/book/upload?t=" + token, { method: "POST", headers: { "x-filename": encodeURIComponent(f.name) }, body: f });
  const j = await r.json().catch(() => ({ error: "Lỗi mạng" }));
  $("#err").textContent = r.ok ? "" : t(j.error || "Tải sách lên thất bại");
  if (r.ok) { S = j; if (S.phase) render(); }
}
function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB"; }
function bookCard(s) {
  const b = s.book, open = !s.sprint || s.phase === "pending" || s.phase === "waiting";
  if (!b && !open) return "";
  return \`<div class="card book"><h2>\${t("Sách chung")}</h2>
    \${b ? \`<div class="btitle">\${esc(b.title)}</div>\` : \`<p class="muted">\${t("Chưa chọn sách chung.")}</p>\`}
    <p class="muted">\${t("Chỉ cuốn này được tính vào tiến độ và chuỗi. Đọc sách riêng thoải mái, không ảnh hưởng gì.")}</p>
    \${b && b.file ? \`<p><a class="dl" href="/api/book/file?t=\${token}">\${t("Tải file sách ({0})", kb(b.size))}</a><br><span class="muted">\${t("Trên máy đọc: Plugins → Dual Page → Tải sách chung về máy.")}</span></p>\` : ""}
    \${s.me.bound ? \`<p class="muted">\${t("Máy bạn đang tính cuốn: {0}", esc(s.me.book))}</p>\` : ""}
    \${open ? \`<details><summary>\${t("Đổi sách chung")}</summary>
      <label>\${t("Tên sách")}</label><div class="row"><input id="nbt" maxlength="120" value="\${esc(b ? b.title : "")}"><button class="ghost" onclick="act('book/title',{title:$('#nbt').value})">\${t("Lưu")}</button></div>
      <label>\${b && b.file ? t("Thay file sách") : t("Tải file sách lên (.epub)")}</label><input id="nbf" type="file" accept=".epub,.txt" onchange="this.files[0]&&upload(this.files[0])">
    </details>\` : b && !b.file ? \`<label>\${t("Tải file sách lên để bạn đọc dùng cùng bản (.epub)")}</label><input type="file" accept=".epub,.txt" onchange="this.files[0]&&upload(this.files[0])">\` : ""}
  </div>\`;
}
function highlightCard(s) {
  const p = s.partner, m = s.me;
  const mine = m.highlights.map((h) => \`<div class="q \${m.shared && m.shared.id === h.id ? "fav" : ""}">“\${esc(h.text)}”
    \${m.shared && m.shared.id === h.id ? \`<span class="ok"> ✓ \${t("đang hiện bên {0}", esc(p.name))}</span>\` : \` <a href="#" onclick="act('share',{id:'\${esc(h.id)}'});return false">\${t("chia sẻ câu này")}</a>\`}</div>\`).join("");
  return \`<div class="card"><h2>\${t("Câu hay chia sẻ cho nhau")}</h2>
    \${p.shared ? \`<p><b>\${t("{0} chia sẻ:", esc(p.name))}</b></p><div class="q fav big-q">“\${esc(p.shared.text)}”</div>\` : \`<p class="muted">\${t("{0} chưa chia sẻ câu nào.", esc(p.name))}</p>\`}
    <p class="muted">\${t("Highlight câu hay trong sách chung trên máy đọc. Khi máy ngủ, câu mới nhất của bạn tự hiện trên màn hình chờ của {0} (tối đa 140 ký tự). Muốn chia sẻ câu khác thì chọn bên dưới hoặc trong menu Dual Page trên máy.", esc(p.name))}</p>
    \${mine ? \`<p><b>\${t("Câu bạn đã highlight")}</b></p>\${mine}\` : \`<details><summary>\${t("Chưa thấy câu highlight nào? Bật chia sẻ highlight trên máy")}</summary><ol>
      <li>\${t("XTeink: Settings → File Transfer, kết nối cùng Wi-Fi với điện thoại.")}</li>
      <li>\${t("Mở địa chỉ máy hiện trên màn hình (ví dụ crosspoint.local) bằng trình duyệt điện thoại, vào trang Plugins.")}</li>
      <li>\${t('Ở thẻ "Dual Page", bấm "Bật chia sẻ highlight".')}</li></ol>
      <p class="muted">\${t("KOReader: highlight được gửi tự động khi có Wi-Fi.")}</p></details>\`}
  </div>\`;
}
function setToken(tk) { token = tk; localStorage.setItem("rp_t", tk); history.replaceState(null, "", location.pathname + "#t=" + tk); load(); }

function st(p) {
  if (!p.bound) return t("chưa mở sách chung");
  if (p.finished) return \`<span class="ok">\${t("đã đọc xong ✓")}</span>\`;
  if (p.done_today) return \`<span class="ok">\${t("xong hôm nay ✓")}</span> (+\${p.today_pct}%)\`;
  if (p.read_today) return t("đã đọc {0}% / mục tiêu {1}%", p.today_pct, p.target_pct);
  return t("chưa đọc hôm nay");
}
function bars() {
  return [S.me, S.partner].map((p) => \`<div class="row"><b>\${p === S.me ? t("Bạn") : esc(p.name)}</b><span style="text-align:right">\${p.progress}%</span></div>
    <div class="bar"><i style="width:\${p.progress}%"></i></div>\`).join("");
}
function render() {
  paintLang();
  const s = S, out = [];
  const link = location.origin + "/?code=" + s.code;
  const P = esc(s.partner ? s.partner.name : "");
  if (s.phase === "waiting") {
    out.push(\`<div class="card"><h2>\${t("Mã mời của bạn")}</h2><div class="code">\${s.code}</div>
      <p class="muted">\${t("Gửi mã hoặc link này cho bạn đọc. Phòng khoá khi đủ 2 người. Sprint: {0} ngày.", s.sprint_days)}</p>
      <input readonly value="\${link}" onclick="this.select()"><button onclick="navigator.clipboard.writeText('\${link}')">\${t("Sao chép link")}</button></div>\`);
  } else if (s.phase === "pending") {
    if (s.me.role === "guest") out.push(\`<div class="card"><h2>\${t("{0} mời bạn sprint {1} ngày", P, s.sprint_days)}\${s.book ? t(" với cuốn “{0}”", esc(s.book.title)) : ""}</h2>
      <p class="muted">\${t("Mục tiêu mỗi ngày = phần sách còn lại chia đều cho {0} ngày. Chuỗi +1 khi cả hai cùng đạt mục tiêu trong ngày.", s.sprint_days)}</p>
      <button onclick="act('accept')">\${t("Đồng ý và bắt đầu")}</button></div>\`);
    else out.push(\`<div class="card"><h2>\${t("{0} đã tham gia", P)}</h2><p class="muted">\${t("Đang chờ bạn ấy đồng ý sprint {0} ngày. Đổi số ngày:", s.sprint_days)}</p>
      <div class="row"><input id="nd" type="number" min="1" max="365" value="\${s.sprint_days}"><button onclick="act('sprint',{sprint_days:Number($('#nd').value)})">\${t("Đổi")}</button></div></div>\`);
  } else if (s.phase === "recap") {
    const r = s.sprint.recap;
    out.push(\`<div class="card"><h2>\${t("Tổng kết sprint")}</h2><div class="big">\${r.shared_days}</div><div class="sub">\${t("ngày cùng đạt mục tiêu")}</div>
      \${r.early_days ? \`<p class="ok" style="text-align:center">\${t("Xong sớm {0} ngày!", r.early_days)}</p>\` : ""}
      \${[r.me, r.partner].map((p) => \`<hr><b>\${esc(p.name)}</b>: \${t("+{0}% sách, {1} phút", p.pages_pct, p.minutes)}\${p.quote ? \`<div class="q fav">“\${esc(p.quote.text)}” <span class="muted">\${esc(p.quote.page || "")}</span></div>\` : \`<p class="muted">\${t("Chưa có câu chia sẻ")}</p>\`}\`).join("")}
</div>\`);
  } else {
    if (s.me.nudged) out.push(\`<div class="banner"><b>\${t("{0} nhắc: Đọc thôi nào!", P)}</b><br><button onclick="act('nudge/dismiss')">\${t("Đã xem")}</button></div>\`);
    const sp = s.sprint;
    out.push(\`<div class="card"><div class="big">\${s.streak}</div><div class="sub">\${t("ngày chuỗi đọc chung · ngày {0}/{1}, còn {2} ngày", sp.day, sp.total_days, sp.days_left)}</div></div>\`);
    out.push(bookCard(s));
    out.push(\`<div class="card"><h2>\${t("Hôm nay")}</h2><p>\${t("Bạn")}: \${st(s.me)}<br>\${P}: \${st(s.partner)}</p>
      <p class="muted">\${t("Mục tiêu của bạn: {0}% sách mỗi ngày", s.me.target_pct ?? "?")}\${s.same_book && !s.book ? " · " + t("hai bạn đọc cùng một cuốn") : ""}</p>\${bars()}
      <button \${s.partner.done_today ? "disabled" : ""} onclick="act('nudge')">\${t("Nhắc {0} đọc", P)}</button></div>\`);
    const ext = sp.extension;
    out.push(\`<div class="card"><h2>\${t("Gia hạn sprint")}</h2>\${ext ? (ext.by_me ? \`<p>\${t("Bạn đã đề nghị +{0} ngày, chờ {1} đồng ý.", ext.days, P)}</p><button class="ghost" onclick="act('extend',{action:'cancel'})">\${t("Huỷ đề nghị")}</button>\`
      : \`<p>\${t("{0} đề nghị gia hạn +{1} ngày.", P, ext.days)}</p><button onclick="act('extend',{action:'accept'})">\${t("Đồng ý")}</button><button class="ghost" onclick="act('extend',{action:'decline'})">\${t("Từ chối")}</button>\`)
      : \`<p class="muted">\${t("Cả hai phải đồng ý.")}</p><div class="row" style="gap:8px;margin-top:8px"><input id="extn" type="number" min="1" max="30" inputmode="numeric" placeholder="\${t("Số ngày (1–30)")}" style="flex:1"><button class="ghost" onclick="const n=+document.getElementById('extn').value;act('extend',{action:'propose',days:n})">\${t("Đề nghị")}</button></div>\`}</div>\`);
  }
  if (s.phase !== "active") out.push(bookCard(s));
  if (s.phase === "active" || s.phase === "recap") out.push(highlightCard(s));
  const linked = s.devices > 0;
  out.push(\`<div class="card"><h2>\${t("Máy đọc")}</h2>
    \${linked ? \`<p class="ok">\${t("Máy đọc của bạn đã nối với phòng này ✓")}</p><p class="muted">\${t("Plugin chỉ cài một lần. Khi tạo hoặc tham gia phòng mới trên trình duyệt này, máy tự chuyển sang phòng mới.")}</p><p class="muted">\${t("Có bản plugin mới? Tải lại rồi chép đè lên bản cũ:")}</p><button class="ghost" onclick="getPlugin('xt')">\${t("Tải lại plugin XTeink")}</button><button class="ghost" onclick="getPlugin('ko')">\${t("Tải lại plugin KOReader")}</button>\` : \`<p class="muted">\${t("Hai bạn dùng máy khác nhau vẫn vào chung một phòng được. Chọn đúng loại máy của bạn:")}</p>\`}
    <details\${linked ? "" : " open"}><summary><b>\${t("XTeink (CrossPoint 2.0 trở lên)")}</b></summary><ol><li><button onclick="getPlugin('xt')">\${t("Tải plugin cho XTeink")}</button></li>
    <li>\${t("Giải nén, chép thư mục <b>dualpage</b> vào thư mục <b>plugins</b> ở gốc thẻ SD.")}</li>
    <li>\${t("Settings → Connectivity → Plugins: Enabled. Settings → Sleep Screen: Custom.")}</li>
    <li>\${t("Kết nối Wi-Fi một lần, rồi khởi động lại máy.")}</li></ol></details>
    <details\${linked ? "" : " open"}><summary><b>\${t("KOReader (Kindle, Kobo, PocketBook, Android)")}</b></summary><ol><li><button onclick="getPlugin('ko')">\${t("Tải plugin cho KOReader")}</button></li>
    <li>\${t("Giải nén, chép thư mục <b>dualpage.koplugin</b> vào <b>koreader/plugins</b> trên máy.")}</li>
    <li>\${t("Khởi động lại KOReader. Mở menu chính → <b>Dual Page</b> → bật <b>Dùng màn hình chờ Dual Page</b>.")}</li>
    <li>\${t("Đọc như bình thường. Highlight mới tự gửi, hoặc chọn chữ → <b>Chia sẻ Dual Page</b>.")}</li></ol></details>
    <p class="muted">\${t("Chỉ cài một lần cho mỗi máy. Sau này đổi phòng không cần chép lại.")}</p>
    <p class="muted">\${t("Màn hình chờ trên máy sẽ trông như thế này:")}</p><img class="prev" src="/d/\${token}/sleep.bmp?v=\${s.now}&l=\${LANG}" alt="\${t("Xem trước màn hình chờ")}"></div>\`);
  out.push(\`<p class="muted">\${t("Cập nhật lúc {0}", s.updated_label)} · <a href="#" onclick="load();return false">\${t("Làm mới")}</a> · <a href="#" onclick="if(confirm(t('Rời phòng này để tạo hoặc tham gia phòng khác? Dữ liệu phòng vẫn còn, vào lại bằng link có #t=.'))){localStorage.removeItem('rp_t');location.href='/'};return false">\${t("Đổi phòng")}</a><br>\${t("Link riêng của bạn (mở trên máy khác):")} <input readonly value="\${location.origin}/#t=\${token}" onclick="this.select()"></p>\`);
  $("#app").innerHTML = out.join("");
}
load();
setInterval(() => { if (token && document.visibilityState === "visible" && !document.activeElement?.matches("input,textarea,select")) load(); }, 60000);
</script></body></html>`;
