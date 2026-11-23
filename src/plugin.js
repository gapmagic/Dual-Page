// Builds the per-person SD-card plugin folder (zipped by the API).
export function pluginFiles(origin, token) {
  const D = "{cfg.server}/d/{cfg.token}";
  const device = {
    title: "Dual Page",
    description: "Chuỗi đọc chung với bạn đọc",
    config: { file: "config.json" },
    browse: {
      format: "json",
      url: `${D}/home`,
      items: "items",
      fields: { title: "title", author: "author", id: "id" },
      page_size: 12,
      search: { url: `${D}/search?q={query}` },
    },
    download: {
      url: `${D}/act/{id_enc}`,
      dest_dir: "/DualPage",
      filename: "{id}",
    },
    events: {
      "reader.session": {
        request: {
          method: "POST",
          url: `${D}/session`,
          headers: { "Content-Type": "text/plain" },
          body: "id={event.id}&doc={event.document}&sbp={event.start_progress_bp}&ebp={event.end_progress_bp}&dur={event.duration_seconds}&end={event.end_time}&book={event.book}",
        },
        connect: true,
      },
      "reader.exit": {
        request: {
          method: "POST",
          url: `${D}/exit`,
          headers: { "Content-Type": "text/plain" },
          body: "id={event.id}&pct={event.percent}&end={event.end_percent}&ts={event.ts}&book={event.book}",
        },
        connect: true,
      },
      "sleep.enter": {
        download: {
          url: `${D}/sleep.bmp?id={event.id}&pct={event.percent}&end={event.end_percent}&ts={event.ts}&book={event.book}`,
          dest: "/sleep.bmp",
        },
      },
    },
  };
  const manifest = {
    title: "Dual Page",
    description: "Giữ chuỗi đọc chung với bạn đọc",
    version: "0.1.0",
  };
  const config = { server: origin, token };
  const readme = `Dual Page

Cài đặt một lần cho máy này (đổi phòng, đổi bạn đọc sau này chỉ cần làm trên web):
1. Chép cả thư mục "dualpage" vào thư mục "plugins" ở gốc thẻ SD (tạo thư mục plugins nếu chưa có), để có /plugins/dualpage/device.json.
2. Settings → Connectivity → Plugins: bật Enabled.
3. Settings → Sleep Screen: chọn Custom để màn hình chờ hiện chuỗi đọc.
4. Kết nối Wi-Fi một lần để máy nhớ mạng.
5. Khởi động lại máy.

Cách dùng:
- Cứ đọc như bình thường. Khi thoát sách hoặc cho máy ngủ, tiến độ tự gửi lên và màn hình chờ cập nhật chuỗi đọc, trạng thái bạn đọc.
- Chỉ sách chung của phòng được tính vào tiến độ. Đọc sách riêng thoải mái, không ảnh hưởng gì.
- Nếu phòng có file sách chung: Home → Plugins → Dual Page → "Tải sách chung về máy" (lưu vào thư mục DualPage).
- Home → Plugins → Dual Page: xem trạng thái (mở lại để làm mới), nhắc bạn đọc, gia hạn sprint.
- Lưu trích dẫn: trong Dual Page bấm Tìm kiếm, gõ 1-2 câu rồi xác nhận.
`;
  return [
    ["dualpage/device.json", JSON.stringify(device, null, 2)],
    ["dualpage/manifest.json", JSON.stringify(manifest, null, 2)],
    ["dualpage/config.json", JSON.stringify(config)],
    ["dualpage/README.md", readme],
  ];
}
