/** 预览安装向导图片：把 BMP 转成 PNG 方便查看 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function bmpToPng(bmpPath) {
  const buf = fs.readFileSync(bmpPath);
  const dataOffset = buf.readUInt32LE(10);
  const w = buf.readInt32LE(18);
  const h = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  const rowSize = Math.ceil(w * (bpp / 8) / 4) * 4;

  // BGR(A) 自下而上 → RGBA 自上而下
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = dataOffset + (h - 1 - y) * rowSize + x * (bpp / 8);
      const d = (y * w + x) * 4;
      rgba[d] = buf[s + 2]; rgba[d + 1] = buf[s + 1]; rgba[d + 2] = buf[s]; rgba[d + 3] = 255;
    }
  }

  // 写 PNG
  const rows = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const r = y * (1 + w * 4);
    rows[r] = 0;
    rgba.copy(rows, r + 1, y * w * 4, (y + 1) * w * 4);
  }
  const compressed = zlib.deflateSync(rows);

  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  const crc32 = b => { let c = ~0; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
  const chunk = (type, data) => Buffer.concat([
    (() => { const b = Buffer.alloc(4); b.writeUInt32BE(data.length); return b; })(),
    Buffer.from(type), data,
    (() => { const b = Buffer.alloc(4); b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data]))); return b; })(),
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const OUT = path.join(ROOT, 'build', 'icon-preview');
fs.mkdirSync(OUT, { recursive: true });
for (const name of ['wizard-small', 'wizard-large']) {
  const bmp = path.join(ROOT, 'build', `${name}.bmp`);
  const png = bmpToPng(bmp);
  fs.writeFileSync(path.join(OUT, `${name}.png`), png);
  console.log(`${name}.bmp → ${name}.png`);
}
