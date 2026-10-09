import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconPath = path.join(root, 'packages', 'vscode', 'media', 'icon.png');
const data = await readFile(iconPath);

const signature = Buffer.from([137,80,78,71,13,10,26,10]);
if (data.length < 33 || !data.subarray(0,8).equals(signature)) {
  throw new Error('Marketplace icon is not a valid PNG file.');
}

let offset = 8;
let width;
let height;
let sawIend = false;

while (offset + 12 <= data.length) {
  const length = data.readUInt32BE(offset);
  const typeStart = offset + 4;
  const typeEnd = typeStart + 4;
  const chunkStart = typeEnd;
  const chunkEnd = chunkStart + length;
  const crcOffset = chunkEnd;

  if (crcOffset + 4 > data.length) {
    throw new Error('Marketplace icon PNG contains a truncated chunk.');
  }

  const type = data.toString('ascii', typeStart, typeEnd);
  const expectedCrc = data.readUInt32BE(crcOffset);
  const actualCrc = crc32(data.subarray(typeStart, chunkEnd));
  if (actualCrc !== expectedCrc) {
    throw new Error(`Marketplace icon PNG failed CRC validation for ${type}.`);
  }

  if (type === 'IHDR') {
    width = data.readUInt32BE(chunkStart);
    height = data.readUInt32BE(chunkStart + 4);
  }
  if (type === 'IEND') {
    sawIend = true;
    break;
  }

  offset = crcOffset + 4;
}

if (!sawIend) throw new Error('Marketplace icon PNG is missing IEND.');
if (!width || !height || width < 128 || height < 128) {
  throw new Error(`Marketplace icon must be at least 128x128; got ${width ?? '?'}x${height ?? '?'}.`);
}

process.stdout.write(`Marketplace icon OK: ${width}x${height} PNG (${data.length} bytes)\n`);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
