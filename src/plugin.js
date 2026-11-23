// Builds the per-person SD-card plugin folder (zipped by the API).
export function pluginFiles(origin, token) {
  const D = "{cfg.server}/d/{cfg.token}";
  const device = {
    title: "Dual Page",
    description: "Chuỗi đọc chung với bạn đọc",
    config: { file: "config.json" },
    browse: {
      format: "json",
      url: `${D}/home?list={list_id_enc}`,
      items: "items",
      fields: { title: "title", author: "author", id: "id" },
      page_size: 12,
      // Sections (Hôm nay, Câu hay, Sách chung, Sprint) come from the server so
      // their titles can carry live status, e.g. "Hôm nay · Minh nhắc bạn đọc!".
      lists_url: `${D}/lists`,
      lists_items: "lists",
      lists_fields: { title: "title", id: "id" },
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
    version: "0.3.0",
    mount: "settings",
  };
  const config = { server: origin, token };
  const readme = `Dual Page

Cài đặt một lần cho máy này (đổi phòng, đổi bạn đọc sau này chỉ cần làm trên web):
1. Chép cả thư mục "dualpage" vào thư mục "plugins" ở gốc thẻ SD (tạo thư mục plugins nếu chưa có), để có /plugins/dualpage/device.json.
2. Settings → Connectivity → Plugins: bật Enabled.
3. Settings → Sleep Screen: chọn Custom để màn hình chờ hiện chuỗi đọc.
4. Kết nối Wi-Fi một lần để máy nhớ mạng.
5. Khởi động lại máy.

Bật chia sẻ câu highlight (một lần):
1. Trên máy: Settings → File Transfer, kết nối cùng Wi-Fi với điện thoại.
2. Trên điện thoại mở địa chỉ máy hiện trên màn hình (ví dụ http://crosspoint.local), vào trang Plugins.
3. Ở thẻ "Dual Page: chia sẻ câu highlight" bấm "Bật chia sẻ highlight".

Cách dùng:
- Cứ đọc như bình thường. Khi thoát sách hoặc cho máy ngủ, tiến độ tự gửi lên và màn hình chờ cập nhật chuỗi đọc, trạng thái bạn đọc.
- Chỉ sách chung của phòng được tính vào tiến độ. Đọc sách riêng thoải mái, không ảnh hưởng gì.
- Nếu phòng có file sách chung: Home → Plugins → Dual Page → "Tải sách chung về máy" (lưu vào thư mục DualPage).
- Highlight câu hay trong sách chung (giữ Confirm → Clip). Khi máy ngủ, câu mới nhất tự hiện trên màn hình chờ của bạn đọc (tối đa 140 ký tự). Muốn chia sẻ câu khác: Plugins → Dual Page → chọn "Chia sẻ: …".
- Home → Plugins → Dual Page: xem trạng thái (mở lại để làm mới), nhắc bạn đọc, gia hạn sprint.
`;
  // Browser-side card on the reader's web page: turns on highlight sync to Dual Page.
  const pluginJs = `CrossPoint.registerPlugin(function (el) {
  var SERVER = ${JSON.stringify(origin + "/kosync")}, USER = ${JSON.stringify(token)};
  el.innerHTML = '<h3>Dual Page: chia sẻ câu highlight</h3>' +
    '<p>Bấm nút dưới để máy tự gửi các câu bạn highlight lên Dual Page mỗi lần máy ngủ. ' +
    'Câu highlight mới nhất trong sách chung sẽ hiện trên màn hình chờ của bạn đọc.</p>' +
    '<p><small>Lưu ý: thao tác này thay cài đặt KOReader Sync hiện có trên máy.</small></p>' +
    '<button type="button">Bật chia sẻ highlight</button> <span class="dp-msg"></span>';
  var msg = el.querySelector('.dp-msg');
  el.querySelector('button').onclick = function () {
    msg.textContent = 'Đang cài…';
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ koServerUrl: SERVER, koUsername: USER, koPassword: 'dualpage', koServerType: 1,
        koMatchMethod: 1, koSyncBehavior: 1, koSyncClippings: 1, koSyncOnSleep: 1 })
    }).then(function (r) { return r.text().then(function (t) { msg.textContent = r.ok ? 'Đã bật ✓' : 'Lỗi: ' + t; }); })
      .catch(function (e) { msg.textContent = 'Lỗi: ' + e; });
  };
});
`;
  return [
    ["dualpage/plugin.js", pluginJs],
    ["dualpage/device.json", JSON.stringify(device, null, 2)],
    ["dualpage/manifest.json", JSON.stringify(manifest, null, 2)],
    ["dualpage/config.json", JSON.stringify(config)],
    ["dualpage/README.md", readme],
  ];
}
