/** 把 icon.ico 各尺寸导出为 PNG 预览图，检查渲染效果 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICO = path.join(ROOT, 'build', 'icon.ico');
const OUT = path.join(ROOT, 'build', 'icon-preview');
fs.mkdirSync(OUT, { recursive: true });

const buf = fs.readFileSync(ICO);
const count = buf.readUInt16LE(4);
console.log(`icon.ico 共 ${count} 个尺寸：`);

for (let i = 0; i < count; i++) {
  const e = 6 + i * 16;
  const w = buf[e] || 256, h = buf[e + 1] || 256;
  const size = buf.readUInt32LE(e + 8);
  const offset = buf.readUInt32LE(e + 12);

  // ICO 里 32bpp BMP：BITMAPINFOHEADER + XOR(BGRA 自下而上) + AND
  const bmp = buf.subarray(offset, offset + size);
  const biW = bmp.readInt32LE(4);
  const biH = bmp.readInt32LE(8) / 2;   // 高度是两倍（XOR+AND）
  const bpp = bmp.readUInt16LE(14);
  const headerSize = bmp.readUInt32LE(0);
  const pixelData = bmp.subarray(headerSize, headerSize + biW * biH * 4);

  // 转成 PNG：手动构造最小 PNG
  const rgba = Buffer.alloc(biW * biH * 4);
  for (let y = 0; y < biH; y++) {
    for (let x = 0; x < biW; x++) {
      const s = ((biH - 1 - y) * biW + x) * 4;
      const d = (y * biW + x) * 4;
      rgba[d] = pixelData[s + 2]; rgba[d + 1] = pixelData[s + 1];
      rgba[d + 2] = pixelData[s]; rgba[d + 3] = pixelData[s + 3];
    }
  }

  // 统计非透明像素
  let opaque = 0;
  for (let p = 3; p < rgba.length; p += 4) if (rgba[p] > 20) opaque++;

  // 写 PNG（未压缩块）
  const rows = Buffer.alloc(biH * (1 + biW * 4));
  for (let y = 0; y < biH; y++) {
    const r = y * (1 + biW * 4);
    rows[r] = 0;
    rgba.copy(rows, r + 1, y * biW * 4, (y + 1) * biW * 4);
  }
  const blocks = [];
  for (let p = 0; p < rows.length; p += 65535) {
    const chunk = rows.subarray(p, Math.min(p + 65535, rows.length));
    const last = p + 65535 >= rows.length ? 1 : 0;
    const blk = Buffer.alloc(5 + chunk.length);
    blk[0] = last; blk.writeUInt16LE(chunk.length, 1); blk.writeUInt16LE(~chunk.length & 0xffff, 3);
    chunk.copy(blk, 5);
    blocks.push(blk);
  }
  const idatData = Buffer.concat(blocks);
  const zlibData = Buffer.concat([Buffer.from([0x78, 0x01]), idatData, (() => {
    let a = 1, b = 0;
    for (const byte of rows) { a = (a + byte) % 65521; b = (b + a) % 65521; }
    const out = Buffer.alloc(4); out.writeUInt32BE(((b << 16) | a) >>> 0); return out;
  })()]);

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
  ihdr.writeUInt32BE(biW, 0); ihdr.writeUInt32BE(biH, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlibData), chunk('IEND', Buffer.alloc(0)),
  ]);

  const file = path.join(OUT, `${biW}px.png`);
  fs.writeFileSync(file, png);
  console.log(`  ${String(biW).padStart(3)}px  非透明 ${String(opaque).padStart(6)} 个（${(opaque / (biW * biH) * 100).toFixed(1)}%）  → ${file}`);
}
