// KOReader plugin folder (dualpage.koplugin), generated per device like the CrossPoint one.
import MAIN from "./ko/main.lua";
import META from "./ko/_meta.lua";

export function koPluginFiles(origin, token) {
  const D = "dualpage.koplugin/";
  const config = `-- Dual Page: this reader's server and device code. Keep it private.\nreturn {\n    server = ${JSON.stringify(origin)},\n    token = ${JSON.stringify(token)},\n}\n`;
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
  return [
    [D + "_meta.lua", META],
    [D + "main.lua", MAIN],
    [D + "dualpage_config.lua", config],
    [D + "README.txt", readme],
  ];
}
