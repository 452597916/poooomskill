/** 生成 Inno Setup 安装向导图片（纯代码合成，不依赖浏览器）：
 *    wizard-small.bmp  55×55   右上角小图标：米白底 + 旋窝居中
 *    wizard-large.bmp  164×314 左侧品牌大图：紫蓝渐变底 + 旋窝居中
 *  用法：node build/make-wizard-images.mjs（需先跑 make-icon.mjs 生成 mark-full-512.png）
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'build', 'mark-full-512.png');
const OUT_DIR = path.join(ROOT, 'build');

if (!fs.existsSync(SRC)) {
  console.error('缺少 build/mark-full-512.png，请先执行 node build/make-icon.mjs');
  process.exit(1);
}

/* ---------------- PNG 解码 ---------------- */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let pos = 8, w = 0, h = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) throw new Error('不支持的 PNG');
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0;
      switch (filter) {
        case 1: line[i] = (line[i] + a) & 0xff; break;
        case 2: line[i] = (line[i] + b) & 0xff; break;
        case 3: line[i] = (line[i] + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
      }
    }
    for (let x = 0; x < w; x++) {
      const s = x * channels, d = (y * w + x) * 4;
      out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { w, h, rgba: out };
}

/* ---------------- 面积平均降采样 ---------------- */
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
          const w = wx * wy, i = (sy * sw + sx) * 4, pa = src[i + 3] / 255;
          r += src[i] * pa * w; g += src[i + 1] * pa * w; b += src[i + 2] * pa * w;
          a += pa * w; wsum += w;
        }
      }
      const d = (ty * tw + tx) * 4;
      if (a > 0) { out[d] = Math.round(r / a); out[d + 1] = Math.round(g / a); out[d + 2] = Math.round(b / a); }
      out[d + 3] = Math.round((a / wsum) * 255);
    }
  }
  return out;
}

/* ---------------- RGBA → 24 位 BMP ---------------- */
function rgbaToBmp(w, h, rgba) {
  const rowSize = Math.ceil(w * 3 / 4) * 4;
  const pixelSize = rowSize * h;
  const fileSize = 54 + pixelSize;
  const fileHeader = Buffer.alloc(14);
  fileHeader.write('BM');
  fileHeader.writeUInt32LE(fileSize, 2);
  fileHeader.writeUInt32LE(54, 10);
  const infoHeader = Buffer.alloc(40);
  infoHeader.writeUInt32LE(40, 0);
  infoHeader.writeInt32LE(w, 4);
  infoHeader.writeInt32LE(h, 8);
  infoHeader.writeUInt16LE(1, 12);
  infoHeader.writeUInt16LE(24, 14);
  infoHeader.writeUInt32LE(pixelSize, 20);
  const pixels = Buffer.alloc(pixelSize);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((h - 1 - y) * w + x) * 4, d = y * rowSize + x * 3;
      pixels[d] = rgba[s + 2]; pixels[d + 1] = rgba[s + 1]; pixels[d + 2] = rgba[s];
    }
  }
  return Buffer.concat([fileHeader, infoHeader, pixels]);
}

/* ---------------- 合成工具 ---------------- */
/** 把 fg（RGBA）以 alpha 混合叠到 bg（RGB 数组 [r,g,b]）上，就地写入 target（RGBA） */
function blendAt(target, tw, fg, fw, fh, offX, offY) {
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const fi = (y * fw + x) * 4;
      const a = fg[fi + 3] / 255;
      if (a === 0) continue;
      const ti = ((offY + y) * tw + (offX + x)) * 4;
      for (let c = 0; c < 3; c++) {
        target[ti + c] = Math.round(fg[fi + c] * a + target[ti + c] * (1 - a));
      }
      target[ti + 3] = 255;
    }
  }
}

/** 线性渐变背景：从 c1 到 c2 沿对角线方向 */
function gradientBg(w, h, c1, c2) {
  const out = Buffer.alloc(w * h * 4);
  const max = w + h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (x + y) / max;
      const i = (y * w + x) * 4;
      out[i] = Math.round(c1[0] + (c2[0] - c1[0]) * t);
      out[i + 1] = Math.round(c1[1] + (c2[1] - c1[1]) * t);
      out[i + 2] = Math.round(c1[2] + (c2[2] - c1[2]) * t);
      out[i + 3] = 255;
    }
  }
  return out;
}

/** 纯色背景 */
function solidBg(w, h, [r, g, b]) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
  }
  return out;
}

/* ---------------- 主流程 ---------------- */
const logo = decodePng(fs.readFileSync(SRC));
console.log(`旋窝源图：${logo.w}×${logo.h}`);

// 1. wizard-small.bmp：55×55 米白底 + 48×48 旋窝居中
{
  const size = 55, logoSize = 48;
  const bg = solidBg(size, size, [251, 250, 248]);   // #fbfaf8
  const small = downscale(logo.rgba, logo.w, logo.h, logoSize, logoSize);
  blendAt(bg, size, small, logoSize, logoSize, Math.round((size - logoSize) / 2), Math.round((size - logoSize) / 2));
  fs.writeFileSync(path.join(OUT_DIR, 'wizard-small.bmp'), rgbaToBmp(size, size, bg));
  console.log('wizard-small.bmp 已生成（55×55 米白底 + 旋窝居中）');
}

// 2. wizard-large.bmp：164×314 紫蓝渐变底 + 96×96 旋窝居中偏上
{
  const w = 164, h = 314, logoSize = 96;
  const bg = gradientBg(w, h, [30, 27, 75], [76, 29, 149]);   // #1e1b4b → #4c1d95
  const small = downscale(logo.rgba, logo.w, logo.h, logoSize, logoSize);
  blendAt(bg, w, small, logoSize, logoSize, Math.round((w - logoSize) / 2), Math.round(h * 0.3 - logoSize / 2));
  fs.writeFileSync(path.join(OUT_DIR, 'wizard-large.bmp'), rgbaToBmp(w, h, bg));
  console.log('wizard-large.bmp 已生成（164×314 渐变底 + 旋窝居中偏上）');
}

console.log('完成。');
