/**
 * Extract hotspot boxes from vocab-scenes.html into pe-topic-challenge-hotspots.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'vocab-scenes.html'), 'utf8');
const m = html.match(/const SCENES=(\[.*?\]);\s*const \$=/s);
if (!m) {
  console.error('SCENES not found');
  process.exit(1);
}
const scenes = JSON.parse(m[1]);
const map = {};
for (const s of scenes) {
  map[s.id] = s.hotspots.map((h) => ({ w: h.w, b: h.b }));
}
const out = `/**
 * Topic Challenge — normalized hotspot boxes for scene pictures (from Vocab Scenes).
 * b = [x0, y0, x1, y1] as fractions of image width/height.
 * Auto-extracted by scripts/extract-topic-hotspots.mjs
 */
(function (global) {
  'use strict';
  global.PE_TOPIC_CHALLENGE_HOTSPOTS = ${JSON.stringify(map)};
})(typeof window !== 'undefined' ? window : globalThis);
`;
const outPath = path.join(root, 'pe-topic-challenge-hotspots.js');
fs.writeFileSync(outPath, out);
console.log('Wrote', outPath, 'scenes', Object.keys(map).length);
