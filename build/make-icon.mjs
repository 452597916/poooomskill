/** 由 brand/icon-source.png（1024×1024 透明底旋窝）生成 Windows 图标（多尺寸 .ico）
 *  用法：node build/make-icon.mjs
 *
 *  流程（纯 Node 标准库，不依赖浏览器）：
 *    1) 解码 icon-source.png（PNG → RGBA）
 *    2) 面积平均降采样出各尺寸（alpha 加权，避免边缘发黑）
 *    3) 按 BMP 条目格式组装多尺寸 .ico
 *
 *  小尺寸（16/24/32）的 alpha 通道做两端推平处理：
 *  面积平均会让边缘半透明像素在托盘上糊成光晕，推平后边缘更利落。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_PNG = path.join(ROOT, 'brand', 'icon-source.png');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

/* ---------------- PNG 解码（8 位 RGB/RGBA，非隔行） ---------------- */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let pos = 8, w = 0, h = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`不支持的 PNG 格式：depth=${depth} colorType=${colorType} interlace=${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      switch (filter) {
        case 0: break;
        case 1: line[i] = (line[i] + a) & 0xff; break;
        case 2: line[i] = (line[i] + b) & 0xff; break;
        case 3: line[i] = (line[i] + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
          line[i] = (line[i] + pr) & 0xff;
          break;
        }
        default: throw new Error('未知 PNG 过滤类型 ' + filter);
      }
    }
    for (let x = 0; x < w; x++) {
      const s = x * channels, d = (y * w + x) * 4;
      out[d] = line[s];
      out[d + 1] = line[s + 1];
      out[d + 2] = line[s + 2];
      out[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { w, h, rgba: out };
}

/* ---------------- 面积平均降采样（alpha 加权） ---------------- */
function downscale(src, sw, sh, tw, th) {
  const out = Buffer.alloc(tw * th * 4);
  const xr = sw / tw, yr = sh / th;
  for (let ty = 0; ty < th; ty++) {
    const y0 = ty * yr, y1 = (ty + 1) * yr;
    for (let tx = 0; tx < tw; tx++) {
      const x0 = tx * xr, x1 = (tx + 1) * xr;
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        if (wy <= 0) continue;
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(sx + 1, x1) - Math.max(sx, x0);
          if (wx <= 0) continue;
          const w = wx * wy;
          const i = (sy * sw + sx) * 4;
          const pa = src[i + 3] / 255;
          r += src[i] * pa * w; g += src[i + 1] * pa * w; b += src[i + 2] * pa * w;
          a += pa * w; wsum += w;
        }
      }
      const d = (ty * tw + tx) * 4;
      if (a > 0) {
        out[d] = Math.round(r / a);
        out[d + 1] = Math.round(g / a);
        out[d + 2] = Math.round(b / a);
      }
      let alpha = a / wsum;
      // 小尺寸边缘半透明像素向两端推：直接平均会在托盘上糊成一圈光晕
      if (tw <= 32) alpha = alpha < 0.14 ? 0 : (alpha > 0.86 ? 1 : (alpha - 0.14) / 0.72);
      out[d + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

/* ---------------- 组装 ICO（BMP 条目） ---------------- */
function bmpEntry(w, h, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(w, 4);
  header.writeInt32LE(h * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);

  const xor = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((h - 1 - y) * w + x) * 4;   // BMP 自下而上
      const d = (y * w + x) * 4;
      xor[d] = rgba[s + 2]; xor[d + 1] = rgba[s + 1]; xor[d + 2] = rgba[s]; xor[d + 3] = rgba[s + 3];
    }
  }
  const mask = Buffer.alloc(Math.ceil(w / 32) * 4 * h);
  return Buffer.concat([header, xor, mask]);
}

const countOpaque = rgba => {
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 20) n++;
  return n;
};

/* ---------------- 主流程 ---------------- */
if (!fs.existsSync(SRC_PNG)) {
  console.error('缺少 brand/icon-source.png，请先把 1024×1024 PNG 放到 brand/ 目录');
  process.exit(1);
}

const src = decodePng(fs.readFileSync(SRC_PNG));
console.log(`源图：${src.w}×${src.h}，非透明像素 ${countOpaque(src.rgba)} 个`);

const entries = [];
for (const size of SIZES) {
  const rgba = downscale(src.rgba, src.w, src.h, size, size);
  const opaque = countOpaque(rgba);
  console.log(`  ${String(size).padStart(3)}px  非透明像素 ${String(opaque).padStart(6)} 个（${(opaque / (size * size) * 100).toFixed(1)}%）`);
  entries.push({ size, bmp: bmpEntry(size, size, rgba) });
}

const dir = Buffer.alloc(6 + entries.length * 16);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(entries.length, 4);
let offset = dir.length;
entries.forEach((e, i) => {
  const at = 6 + i * 16;
  dir.writeUInt8(e.size >= 256 ? 0 : e.size, at);
  dir.writeUInt8(e.size >= 256 ? 0 : e.size, at + 1);
  dir.writeUInt8(0, at + 2);
  dir.writeUInt8(0, at + 3);
  dir.writeUInt16LE(1, at + 4);
  dir.writeUInt16LE(32, at + 6);
  dir.writeUInt32LE(e.bmp.length, at + 8);
  dir.writeUInt32LE(offset, at + 12);
  offset += e.bmp.length;
});
const ico = Buffer.concat([dir, ...entries.map(e => e.bmp)]);

fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), ico);
fs.writeFileSync(path.join(ROOT, 'public', 'favicon.ico'), ico);

// 保留一份 512px PNG：安装向导图、README 等场合用
const png512 = { w: 512, h: 512, rgba: downscale(src.rgba, src.w, src.h, 512, 512) };
fs.writeFileSync(path.join(ROOT, 'build', 'mark-full-512.png'), encodePng(png512));

console.log(`\n已生成 build\\icon.ico：${entries.length} 个尺寸，共 ${ico.length} 字节`);
console.log('public\\favicon.ico 已同步');
console.log('build\\mark-full-512.png 已保留（供向导图引用）');

/* ---------------- PNG 编码（RGBA → PNG，无过滤） ---------------- */
function encodePng({ w, h, rgba }) {
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
