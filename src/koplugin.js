// KOReader plugin folder (dualpage.koplugin), generated per device like the CrossPoint one.
import MAIN from "./ko/main.lua";
import META from "./ko/_meta.lua";

// Version = hash of the plugin code; the installed plugin compares it with
// /d/<token>/ko/version and updates itself when it differs.
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}
export const KO_VERSION = fnv(MAIN + META);
export const KO_MAIN = MAIN.replace('local PLUGIN_VERSION = "dev"', `local PLUGIN_VERSION = "${KO_VERSION}"`);

export function koPluginFiles(origin, token, lang = "vi") {
  const en = lang === "en";
  const D = "dualpage.koplugin/";
  const config = `-- Dual Page: this reader's server and device code. Keep it private.\nreturn {\n    server = ${JSON.stringify(origin)},\n    token = ${JSON.stringify(token)},\n    lang = ${JSON.stringify(en ? "en" : "vi")},\n}\n`;
  const readme = `Dual Page cho KOReader
======================

1. Chép cả thư mục dualpage.koplugin vào thư mục koreader/plugins trên máy
   (Kindle: cắm USB, vào koreader/plugins. Kobo: .adds/koreader/plugins).
2. Khởi động lại KOReader.
3. Menu chính → Dual Page → bật "Dùng màn hình chờ Dual Page".
4. Mở "Dual Page" để xem chuỗi đọc chung, nhắc bạn, chia sẻ câu hay, tải sách chung.

Tiến độ và highlight tự gửi khi có Wi-Fi. Chọn chữ → "Chia sẻ Dual Page"
để hiện câu đó trên màn hình chờ của bạn đọc.

Plugin chỉ cài một lần. Đổi phòng trên ${origin.replace(/^https?:\/\//, "")} không cần cài lại.
Tệp dualpage_config.lua chứa mã riêng của máy này, đừng chia sẻ.
`;
  const readmeEn = `Dual Page for KOReader
======================

1. Copy the whole dualpage.koplugin folder into koreader/plugins on your device
   (Kindle: plug in USB, open koreader/plugins. Kobo: .adds/koreader/plugins).
2. Restart KOReader.
3. Main menu → Dual Page → turn on "Use Dual Page sleep screen".
4. Open "Dual Page" for your streak, nudges, shared highlights and the shared book.

Progress and highlights are sent automatically on Wi-Fi. Select text → "Share to Dual Page"
to show that line on your partner's sleep screen.

Install once. Switching rooms on ${origin.replace(/^https?:\/\//, "")} needs no reinstall.
dualpage_config.lua holds this device's private code; don't share it.
`;
  return [
    [D + "_meta.lua", META],
    [D + "main.lua", KO_MAIN],
    [D + "dualpage_config.lua", config],
    [D + "README.txt", en ? readmeEn : readme],
  ];
}
