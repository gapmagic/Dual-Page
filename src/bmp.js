// 1-bit 480x800 canvas rendered to a BMP the CrossPoint sleep screen can show.
import { FONTS } from "./font.js";

export const W = 480;
export const H = 800;

const decoded = {};
function glyph(font, ch) {
  const f = FONTS[font];
  let g = f.g[ch];
  if (!g) {
    ch = "?";
    g = f.g["?"] || f.g["0"];
  }
  const key = font + ch;
  if (!decoded[key]) {
    const bin = atob(g[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    decoded[key] = { w: g[0], adv: g[1], h: f.h, bits: bytes };
  }
  return decoded[key];
}

import { crc32 } from "./zip.js";

export class Canvas {
  constructor() {
    this.px = new Uint8Array(W * H); // 1 = black
  }
  set(x, y, v = 1) {
    if (x >= 0 && y >= 0 && x < W && y < H) this.px[y * W + x] = v;
  }
  rect(x, y, w, h, v = 1) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v);
  }
  frame(x, y, w, h, t = 2) {
    this.rect(x, y, w, t);
    this.rect(x, y + h - t, w, t);
    this.rect(x, y, t, h);
    this.rect(x + w - t, y, t, h);
  }
  textWidth(str, font = "body") {
    let w = 0;
    for (const ch of str.normalize("NFC")) w += glyph(font, ch).adv;
    return w;
  }
  lineHeight(font = "body") {
    return FONTS[font].h;
  }
  text(x, y, str, font = "body", v = 1) {
    for (const ch of str.normalize("NFC")) {
      const g = glyph(font, ch);
      const rb = (g.w + 7) >> 3;
      for (let j = 0; j < g.h; j++)
        for (let i = 0; i < g.w; i++)
          if (g.bits[j * rb + (i >> 3)] & (0x80 >> (i & 7))) this.set(x + i - 2, y + j - 2, v);
      x += g.adv;
    }
    return x;
  }
  center(y, str, font = "body", v = 1) {
    this.text(Math.round((W - this.textWidth(str, font)) / 2), y, str, font, v);
  }
  // Word-wraps into lines no wider than maxW; returns the y after the last line.
  wrap(x, y, str, maxW, font = "body", maxLines = 99, v = 1) {
    const words = str.normalize("NFC").split(/\s+/).filter(Boolean);
    let line = "";
    let n = 0;
    const lh = this.lineHeight(font);
    const flush = (last) => {
      let s = line;
      if (!last && n === maxLines - 1) s = s + "…";
      this.text(x, y, s, font, v);
      y += lh;
      n++;
    };
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (this.textWidth(t, font) > maxW && line) {
        flush(false);
        line = w;
        if (n >= maxLines) return y;
      } else line = t;
    }
    if (line && n < maxLines) flush(true);
    return y;
  }
  bar(x, y, w, h, frac) {
    this.frame(x, y, w, h, 2);
    const f = Math.max(0, Math.min(1, frac));
    this.rect(x + 4, y + 4, Math.round((w - 8) * f), h - 8);
  }
  // 8-bit grayscale PNG at exactly outW x outH (KOReader sleep screen). The
  // 480x800 layout is scaled to fit and centred; the header band runs the full
  // width. Area-averaged scaling keeps text smooth at any (non-integer) scale,
  // and an exact-size image means KOReader shows it 1:1 without re-scaling.
  async toPNG(outW = W, outH = H) {
    const w = Math.max(1, Math.min(2400, Math.round(outW))), h = Math.max(1, Math.min(2400, Math.round(outH)));
    const s = Math.min(w / W, h / H);
    const ox = (w - W * s) / 2, oy = (h - H * s) / 2;
    const band = this.band || 0;
    // For each output column/row: the source cells it covers and their weights.
    const taps = (n, off, max) => {
      const out = [];
      for (let o = 0; o < n; o++) {
        const a = (o - off) / s, b = (o + 1 - off) / s, t = [];
        for (let i = Math.floor(a); i < b; i++) {
          const wgt = Math.min(b, i + 1) - Math.max(a, i);
          if (wgt > 1e-6) t.push(i, wgt * s);
        }
        out.push(t);
      }
      return out;
    };
    const tx = taps(w, ox), ty = taps(h, oy);
    const px = this.px;
    const raw = new Uint8Array((w + 1) * h);
    for (let y = 0; y < h; y++) {
      const row = y * (w + 1) + 1;
      const yt = ty[y];
      for (let x = 0; x < w; x++) {
        const xt = tx[x];
        let black = 0;
        for (let j = 0; j < yt.length; j += 2) {
          const sy = yt[j];
          if (sy < 0 || sy >= H) continue;
          for (let i = 0; i < xt.length; i += 2) {
            const sx = xt[i];
            const v = sx >= 0 && sx < W ? px[sy * W + sx] : sy < band ? 1 : 0;
            if (v) black += yt[j + 1] * xt[i + 1];
          }
        }
        raw[row + x] = 255 - Math.min(255, Math.round(black * 255));
      }
    }
    const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
    const chunk = (type, data) => {
      const b = new Uint8Array(12 + data.length);
      const dv = new DataView(b.buffer);
      dv.setUint32(0, data.length);
      for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
      b.set(data, 8);
      dv.setUint32(8 + data.length, crc32(b.subarray(4, 8 + data.length)));
      return b;
    };
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, w);
    dv.setUint32(4, h);
    ihdr.set([8, 0, 0, 0, 0], 8);
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", z), chunk("IEND", new Uint8Array(0))];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) (out.set(p, o), (o += p.length));
    return out;
  }
  toBMP() {
    const rowBytes = ((W + 31) >> 5) << 2;
    const dataSize = rowBytes * H;
    const off = 14 + 40 + 8;
    const buf = new Uint8Array(off + dataSize);
    const dv = new DataView(buf.buffer);
    buf[0] = 0x42;
    buf[1] = 0x4d;
    dv.setUint32(2, buf.length, true);
    dv.setUint32(10, off, true);
    dv.setUint32(14, 40, true);
    dv.setInt32(18, W, true);
    dv.setInt32(22, H, true); // bottom-up
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 1, true);
    dv.setUint32(30, 0, true);
    dv.setUint32(34, dataSize, true);
    dv.setUint32(38, 2835, true);
    dv.setUint32(42, 2835, true);
    dv.setUint32(46, 2, true);
    dv.setUint32(50, 2, true);
    // palette: index 0 = black, 1 = white
    dv.setUint32(54, 0x00000000, true);
    dv.setUint32(58, 0x00ffffff, true);
    for (let y = 0; y < H; y++) {
      const row = off + (H - 1 - y) * rowBytes;
      for (let x = 0; x < W; x++) {
        if (!this.px[y * W + x]) buf[row + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    return buf;
  }
}
