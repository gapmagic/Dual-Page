# Dual Page: ghi chú kỹ thuật

**Backend:** Cloudflare Workers + D1 (SQLite) + KV (lưu file epub). Không có framework và không có dependency khi chạy.

```
src/index.js    Router: trang web (/), API (/api/*), endpoint thiết bị (/d/<token>/*), KOSync (/kosync/*)
src/logic.js    Streak, sprint, mục tiêu ngày, nhận diện sách chung, partial MD5, rút gọn câu 300 ký tự
src/screen.js   Bố cục màn hình chờ (đang đọc, chờ, tổng kết, chưa vào phòng)
src/bmp.js      Canvas 1-bit và xuất BMP
src/font.js     Font glyph sinh từ DejaVu (tools/gen_font.py), có đủ dấu tiếng Việt
src/plugin.js   Sinh plugin CrossPoint theo từng máy (device.json, config.json, manifest.json, plugin.js)
src/zip.js      Tạo file zip (store-only)
src/web.js      Trang web đồng hành (tiếng Việt)
schema.sql      Bảng: rooms, members, daily, devices, highlights, seen_events, quotes
migrations.sql  Thêm cột sách chung cho bảng rooms (chạy an toàn nhiều lần)
```

### Plugin CrossPoint hoạt động thế nào

Plugin chỉ là file cấu hình trên thẻ SD. Firmware tự gọi về server theo sự kiện:

- `reader.session` gửi `POST /d/<token>/session` khi kết thúc phiên đọc, gồm % đầu/cuối, số giây, mã sách và tên file.
- `reader.exit` gửi % khi thoát sách.
- `sleep.enter` tải `/d/<token>/sleep.bmp` về `/sleep.bmp`. Đây là màn hình chờ.
- Menu plugin là catalog JSON `/d/<token>/home`. Mỗi dòng bấm được là một lượt "tải" nhỏ `/d/<token>/act/<id>`, dùng cho nhắc, gia hạn, chia sẻ, hoặc tải epub vào `/DualPage`.
- Highlight đi qua tính năng **Sync Clippings** của KOSync: `PUT /kosync/api/v1/clippings/<doc>`.

Mỗi máy có một **device token** riêng gắn với người trong phòng. Khi đổi phòng, server gắn lại token này nên plugin không phải cài lại.

### API chính (`/api/*`)

`rooms` (tạo phòng) · `join` · `state` · `device` · `accept` · `sprint` · `extend` · `nudge` · `nudge/dismiss` · `share` · `rebind` · `book/title` · `book/upload` · `book/file` · `plugin.zip`

### Chạy local

```bash
npm ci
npx wrangler d1 execute readpal --local --file schema.sql
npx wrangler dev --local        # http://localhost:8787
```

### Deploy

Mỗi lần push lên `main`, GitHub Actions (`.github/workflows/deploy.yml`) sẽ chạy `scripts/deploy.sh`. Script này:
- tạo D1 `readpal` và KV `dualpage-books` nếu chưa có, chạy schema và migration;
- deploy Worker `dualpage` (tên miền riêng **dualpage.online**);
- chạy smoke test tạo phòng trên dualpage.online.

Cần secret `CLOUDFLARE_API_TOKEN` trong repo (quyền Workers Scripts, D1, Workers KV).
