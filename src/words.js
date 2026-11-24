// Book length in "standard pages" (printed-book pages), so both readers see the
// same page numbers whatever device or font size they use.
export const WORDS_PER_PAGE = 280;

async function inflateRaw(bytes) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
}

// Text of the (X)HTML chapters of an EPUB, read from the zip's central directory.
async function epubText(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return "";
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  let out = "";
  for (let k = 0; k < n && p + 46 <= buf.length; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (!/\.(x?html?)$/i.test(name)) continue;
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const raw = buf.subarray(start, start + csize);
    try {
      out += " " + dec.decode(method === 8 ? await inflateRaw(raw) : raw);
    } catch {}
  }
  return out
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
}

export async function bookPages(buf, name) {
  const text = /\.txt$/i.test(name) ? new TextDecoder().decode(buf) : await epubText(buf);
  const words = (text.match(/[^\s.,;:!?"“”'‘’()\[\]—–-]+/g) || []).length;
  return words > 0 ? Math.max(1, Math.round(words / WORDS_PER_PAGE)) : null;
}
