// Builds the per-person SD-card plugin folder (zipped by the API).
export function pluginFiles(origin, token, lang = "vi") {
  const en = lang === "en";
  const D = "{cfg.server}/d/{cfg.token}";
  const device = {
    title: "Dual Page",
    description: en ? "Shared reading streak with your partner" : "Chuỗi đọc chung với bạn đọc",
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
    description: en ? "Keep a shared reading streak with your partner" : "Giữ chuỗi đọc chung với bạn đọc",
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
- Nếu phòng có file sách chung: Home → Plugins → Dual Page → "Tải sách chung về máy" (lưu vào thư mục DualPage). Lần đầu, mở sách bằng Home → Duyệt file → DualPage; sau đó sách hiện ở mục Gần đây.
- Highlight câu hay trong sách chung (giữ Confirm → Clip). Khi máy ngủ, câu mới nhất tự hiện trên màn hình chờ của bạn đọc (tối đa 140 ký tự). Muốn chia sẻ câu khác: Plugins → Dual Page → chọn "Chia sẻ: …".
- Home → Plugins → Dual Page: xem trạng thái (mở lại để làm mới), nhắc bạn đọc, gia hạn sprint.
`;
  const readmeEn = `Dual Page

Install once on this reader (switching rooms or partners later is done on the website):
1. Copy the whole "dualpage" folder into the "plugins" folder at the root of the SD card (create "plugins" if needed), so you have /plugins/dualpage/device.json.
2. Settings → Connectivity → Plugins: Enabled.
3. Settings → Sleep Screen: Custom, so the sleep screen shows your streak.
4. Connect to Wi-Fi once so the reader remembers the network.
5. Restart the reader.

Turn on highlight sharing (once):
1. On the reader: Settings → File Transfer, on the same Wi-Fi as your phone.
2. On your phone, open the address shown on the reader (e.g. http://crosspoint.local) and go to Plugins.
3. On the "Dual Page: share highlights" card, tap "Turn on highlight sharing".

How to use:
- Just read. When you leave a book or the reader sleeps, progress is sent and the sleep screen updates your streak and your partner's status.
- Only the room's shared book counts. Other books are fine, they just don't count.
- If the room has a book file: Home → Plugins → Dual Page → Shared book → "Download the shared book" (saved to the DualPage folder). The first time, open it from Home → File browser → DualPage; after that it shows under Recent.
- Highlight great lines in the shared book (hold Confirm → Clip). Your newest highlight shows on your partner's sleep screen (up to 140 characters). To share another: Dual Page → Highlights → "Share: …".
- Home → Plugins → Dual Page: Today, Highlights, Shared book, Sprint & extension. Nudge your partner or extend the sprint from there.
`;
  // Browser-side card on the reader's web page: turns on highlight sync to Dual Page.
  const TX = en
    ? { h: "Dual Page: share highlights", p: "Tap below so the reader sends your highlights to Dual Page each time it sleeps. Your newest highlight in the shared book shows on your partner\\'s sleep screen.", n: "Note: this replaces the reader\\'s current KOReader Sync settings.", b: "Turn on highlight sharing", w: "Setting up…", ok: "On ✓", err: "Error: " }
    : { h: "Dual Page: chia sẻ câu highlight", p: "Bấm nút dưới để máy tự gửi các câu bạn highlight lên Dual Page mỗi lần máy ngủ. Câu highlight mới nhất trong sách chung sẽ hiện trên màn hình chờ của bạn đọc.", n: "Lưu ý: thao tác này thay cài đặt KOReader Sync hiện có trên máy.", b: "Bật chia sẻ highlight", w: "Đang cài…", ok: "Đã bật ✓", err: "Lỗi: " };
  const pluginJs = `CrossPoint.registerPlugin(function (el) {
  var SERVER = ${JSON.stringify(origin + "/kosync")}, USER = ${JSON.stringify(token)};
  el.innerHTML = '<h3>${TX.h}</h3>' +
    '<p>${TX.p}</p>' +
    '<p><small>${TX.n}</small></p>' +
    '<button type="button">${TX.b}</button> <span class="dp-msg"></span>';
  var msg = el.querySelector('.dp-msg');
  el.querySelector('button').onclick = function () {
    msg.textContent = '${TX.w}';
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ koServerUrl: SERVER, koUsername: USER, koPassword: 'dualpage', koServerType: 1,
        koMatchMethod: 1, koSyncBehavior: 1, koSyncClippings: 1, koSyncOnSleep: 1 })
    }).then(function (r) { return r.text().then(function (t) { msg.textContent = r.ok ? '${TX.ok}' : '${TX.err}' + t; }); })
      .catch(function (e) { msg.textContent = '${TX.err}' + e; });
  };
});
`;
  return [
    ["dualpage/plugin.js", pluginJs],
    ["dualpage/device.json", JSON.stringify(device, null, 2)],
    ["dualpage/manifest.json", JSON.stringify(manifest, null, 2)],
    ["dualpage/config.json", JSON.stringify(config)],
    ["dualpage/README.md", en ? readmeEn : readme],
  ];
}
