// Generates the WASSAA PWA icons without any image dependency.
// The mark: terracotta field with a cream "W" (the brand monogram).
import zlib from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const TERRACOTTA = [184, 90, 60];
const CREAM = [247, 245, 240];

// ---------- minimal PNG writer ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // no filter
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------- artwork ----------
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy || 1e-6;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function render(size, padding) {
  const rgba = Buffer.alloc(size * size * 4);
  const inner = 1 - padding * 2;
  const points = [
    [0.16, 0.28], [0.36, 0.74], [0.5, 0.46], [0.64, 0.74], [0.84, 0.28]
  ].map(([x, y]) => [padding + x * inner, padding + y * inner]);
  const stroke = 0.085 * inner * size;
  const edge = Math.max(1, size * 0.004);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        d = Math.min(d, distanceToSegment(x + 0.5, y + 0.5, points[i][0] * size, points[i][1] * size, points[i + 1][0] * size, points[i + 1][1] * size));
      }
      const coverage = Math.max(0, Math.min(1, (stroke / 2 - d) / edge + 0.5));
      const color = [
        Math.round(TERRACOTTA[0] + (CREAM[0] - TERRACOTTA[0]) * coverage),
        Math.round(TERRACOTTA[1] + (CREAM[1] - TERRACOTTA[1]) * coverage),
        Math.round(TERRACOTTA[2] + (CREAM[2] - TERRACOTTA[2]) * coverage),
        255
      ];
      const offset = (y * size + x) * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-192.png', 192, 0.02],
  ['icon-512.png', 512, 0.02],
  ['maskable-512.png', 512, 0.1], // extra safe-area padding for Android masks
  ['apple-touch-icon-180.png', 180, 0.02],
  ['favicon.png', 64, 0.02]
];

for (const [name, size, padding] of targets) {
  writeFileSync(path.join(OUT, name), render(size, padding));
  console.log(`wrote icons/${name} (${size}x${size})`);
}
