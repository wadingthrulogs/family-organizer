// Generates a small valid PNG (four colored horizontal bands) for smoke-testing
// the watcher. Not part of the service — a throwaway test helper.
//   node make-test-image.mjs /home/wade/uploads/testcard.png
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const W = 120, H = 80;
const colors = [[220, 40, 40], [40, 180, 60], [40, 80, 220], [230, 200, 30]];

function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit, RGB

const rowBytes = W * 3;
const raw = Buffer.alloc((rowBytes + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (rowBytes + 1)] = 0; // filter byte
  const c = colors[Math.floor(y / (H / 4)) % 4];
  for (let x = 0; x < W; x++) {
    const i = y * (rowBytes + 1) + 1 + x * 3;
    raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2];
  }
}
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = process.argv[2] || 'testcard.png';
writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
