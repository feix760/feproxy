// Rebuilds src/frontend/asset/favicon.ico from the two source svgs.
//
// Not part of `npm run build`: it needs rsvg-convert (`brew install librsvg`), which CI doesn't have,
// and the ico only changes when the icon does. Run `npm run build:favicon` after editing either svg.
//
// The 16x16 entry comes from scripts/favicon-16.svg rather than the master, because the master's
// detail doesn't survive the downscale — see the comment in that file. 32 and 48 come from
// src/frontend/asset/favicon.svg.
//
// Payloads are stored as PNG rather than BMP, which every browser has understood since IE11.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const master = path.join(root, 'src/frontend/asset/favicon.svg');
const small = path.join(__dirname, 'favicon-16.svg');
const target = path.join(root, 'src/frontend/asset/favicon.ico');

const SIZES = [
  { size: 16, source: small },
  { size: 32, source: master },
  { size: 48, source: master },
];

const render = (source, size, out) => {
  execFileSync('rsvg-convert', [ '-w', String(size), '-h', String(size), source, '-o', out ]);
  return fs.readFileSync(out);
};

const packIco = images => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // resource type: icon
  header.writeUInt16LE(images.length, 4);

  // Every entry is 16 bytes, and the payloads follow the whole directory
  let offset = header.length + images.length * 16;

  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0); // width; 0 would mean 256, which we don't ship
    entry.writeUInt8(size, 1); // height
    entry.writeUInt8(0, 2); // palette size, 0 for truecolour
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([ header, ...entries, ...images.map(image => image.data) ]);
};

const main = () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feproxy-favicon-'));
  try {
    const images = SIZES.map(({ size, source }) => ({
      size,
      data: render(source, size, path.join(tmp, `${size}.png`)),
    }));

    fs.writeFileSync(target, packIco(images));

    console.log(`favicon.ico written: ${images.map(image => `${image.size}x${image.size}`).join(', ')}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

main();
