import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const table = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  table[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (width * 4 + 1);
    raw[start] = 0;
    rgba.copy(raw, start + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function paint(rgba, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const index = (y * size + x) * 4;
  rgba[index] = color[0];
  rgba[index + 1] = color[1];
  rgba[index + 2] = color[2];
  rgba[index + 3] = color[3];
}

function insideRound(x, y, left, top, right, bottom, radius) {
  if (x < left || y < top || x >= right || y >= bottom) return false;
  const cx = x < left + radius ? left + radius : x >= right - radius ? right - radius - 1 : x;
  const cy = y < top + radius ? top + radius : y >= bottom - radius ? bottom - radius - 1 : y;
  const dx = x + 0.5 - (cx + 0.5);
  const dy = y + 0.5 - (cy + 0.5);
  return dx * dx + dy * dy <= (radius + 0.2) * (radius + 0.2);
}

function icon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const navy = [28, 58, 95, 255];
  const white = [255, 255, 255, 255];
  const ink = [28, 58, 95, 220];
  const margin = Math.max(1, Math.round(size * 0.06));
  const radius = Math.max(2, Math.round(size * 0.22));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (insideRound(x, y, margin, margin, size - margin, size - margin, radius)) paint(rgba, size, x, y, navy);
    }
  }
  const page = {
    left: Math.round(size * 0.28),
    top: Math.round(size * 0.28),
    right: Math.round(size * 0.7),
    bottom: Math.round(size * 0.78),
    radius: Math.max(1, Math.round(size * 0.05)),
  };
  fillRound(rgba, size, page, white);
  const line = Math.max(1, Math.round(size * 0.045));
  for (let row = 0; row < 3; row += 1) {
    const y = page.top + Math.round((page.bottom - page.top) * (0.36 + row * 0.16));
    for (let yy = y; yy < y + line; yy += 1) {
      for (let x = page.left + Math.round(size * 0.08); x < page.right - Math.round(size * 0.08); x += 1) {
        paint(rgba, size, x, yy, ink);
      }
    }
  }
  const stamp = {
    right: size - margin - Math.round(size * 0.08),
    top: margin + Math.round(size * 0.1),
    width: Math.round(size * 0.34),
    height: Math.max(3, Math.round(size * 0.16)),
    radius: Math.max(1, Math.round(size * 0.04)),
  };
  fillRound(rgba, size, {
    left: stamp.right - stamp.width,
    top: stamp.top,
    right: stamp.right,
    bottom: stamp.top + stamp.height,
    radius: stamp.radius,
  }, white);
  return encodePng(size, size, rgba);
}

function fillRound(rgba, size, box, color) {
  for (let y = box.top; y < box.bottom; y += 1) {
    for (let x = box.left; x < box.right; x += 1) {
      if (insideRound(x, y, box.left, box.top, box.right, box.bottom, box.radius)) paint(rgba, size, x, y, color);
    }
  }
}

const dir = path.resolve("public/assets");
mkdirSync(dir, { recursive: true });
for (const size of [16, 32, 64, 80]) {
  writeFileSync(path.join(dir, `icon-${size}.png`), icon(size));
}
console.log("Symbole geschrieben nach", dir);
