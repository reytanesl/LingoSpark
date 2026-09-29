/**
 * Coverage check: every picture-mode item must exact-match a hotspot
 * in at least one scene for its topic.
 */
import fs from 'fs';
import { spawnSync } from 'child_process';

const r = spawnSync(process.execPath, ['scripts/audit-topic-picture-relevance.mjs'], {
  encoding: 'utf8',
  cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
if (r.status !== 0) process.exit(r.status || 1);
if (/misses:/.test(r.stdout || '') && !/misses:\s*$/m.test(r.stdout || '')) {
  // audit prints misses only when non-empty; also check pct
}
const m = (r.stdout || '').match(/miss:\s*(\d+)/);
if (m && Number(m[1]) > 0) {
  console.error('Picture highlight coverage failed.');
  process.exit(1);
}
console.log('picture highlight coverage OK');
