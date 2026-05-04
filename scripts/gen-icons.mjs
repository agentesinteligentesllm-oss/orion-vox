/**
 * Genera iconos PNG mínimos válidos para el manifest de Orion Vox.
 * Usa solo módulos built-in de Node.js (sin dependencias).
 * Colores: fondo #0E1116 (oscuro) con marca #863bff (violeta).
 *
 * Uso: node scripts/gen-icons.mjs
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dir, '..', 'public');
const iconsDir = join(publicDir, 'icons');

// CRC32 para validación de chunks PNG
function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Genera un PNG sólido de tamaño `size`x`size` con color RGB dado.
 * Válido como icono maskable (safe zone es el 80% del centro).
 */
function makePNG(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB truecolor
  // bytes 10-12: compression=0, filter=0, interlace=0

  // Scanlines: filter byte (0=None) + RGB pixels por fila
  const row = Buffer.alloc(1 + size * 3);
  row[0] = 0;
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const rawData = Buffer.concat(Array.from({ length: size }, () => row));

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rawData)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });

// Fondo oscuro del tema: #0E1116 = rgb(14, 17, 22)
// Marca violeta: #863bff = rgb(134, 59, 255)
// Usamos el violeta como fondo para que sea identificable en el launcher
const [r, g, b] = [134, 59, 255];

const icons = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['shortcut-voice.png', 96],
  ['shortcut-config.png', 96],
  ['shortcut-audit.png', 96],
];

for (const [name, size] of icons) {
  writeFileSync(join(iconsDir, name), makePNG(size, r, g, b));
  console.log(`✓ ${name} (${size}×${size})`);
}

console.log(`\nIconos generados en public/icons/ (${icons.length} archivos)`);
console.log('Reemplazá con PNGs reales cuando tengas el diseño final.');
