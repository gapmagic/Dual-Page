# Generates src/font.js: 1-bit glyph bitmaps for the sleep-screen BMP renderer.
import base64, json, sys
from PIL import Image, ImageDraw, ImageFont
vn = "àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ"
chars = "".join(chr(c) for c in range(32, 127)) + vn + vn.upper() + "Đ•·→✓…–—“”‘’%★"
chars = "".join(dict.fromkeys(chars))
sets = {
  "body": ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 26, chars),
  "bold": ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 30, chars),
  "big":  ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 140, "0123456789"),
}
out = {}
for name, (path, size, cs) in sets.items():
    f = ImageFont.truetype(path, size)
    asc, desc = f.getmetrics()
    H = asc + desc + 4
    g = {}
    for ch in cs:
        adv = max(1, round(f.getlength(ch)))
        W = adv + 4
        im = Image.new("L", (W, H), 0)
        ImageDraw.Draw(im).text((2, 2), ch, font=f, fill=255)
        bits = bytearray()
        rb = (W + 7) // 8
        for y in range(H):
            row = bytearray(rb)
            for x in range(W):
                if im.getpixel((x, y)) > 110:
                    row[x // 8] |= 0x80 >> (x % 8)
            bits += row
        g[ch] = [W, adv, base64.b64encode(bytes(bits)).decode()]
    out[name] = {"h": H, "g": g}
open(sys.argv[1], "w").write("export const FONTS = " + json.dumps(out, ensure_ascii=False) + ";\n")
