/**
 * Worksheet Maker static allowlist (mirrors the root static-allowlist.js).
 * Only what the browser loads is served: the page, assets/, and the lib/ ES modules that
 * index.html imports (plus their transitive browser imports). Server code, package files,
 * docs, fixtures, node_modules and dotfiles all 404.
 */
import path from 'path';

export const PUBLIC_PAGES = new Set(['index.html']);

/** lib/ modules imported by index.html, directly or transitively. None use Node APIs. */
export const PUBLIC_LIB_MODULES = new Set([
  'lib/answers.js',
  'lib/browser-saved.js',
  'lib/google-drive.js',
  'lib/language-prompt.js',
  'lib/lesson-display.js',
  'lib/lesson-prompt.js',
  'lib/lesson-to-deck.js',
  'lib/missing-sentences.js',
  'lib/normalize-deck.js',
  'lib/polish-primary.js',
  'lib/polish-sheet-theme.js',
  'lib/print-select.js',
  'lib/sheet-edit.js',
  'lib/slide-themes.js',
  'lib/ui-strings.js',
  'lib/verify-answers.js',
  'lib/video-embed.js',
]);

const ASSET_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.avif', '.css', '.woff', '.woff2', '.ttf', '.otf', '.mp3']);

/** Repo-relative path inside worksheet-maker/, or null when malformed / dotfile / traversal. */
function toRelative(urlPath) {
  if (typeof urlPath !== 'string') return null;
  let decoded;
  try { decoded = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const segs = decoded.split('/').filter(Boolean);
  if (segs.some((s) => s.startsWith('.'))) return null;
  return segs.join('/');
}

export function isWorksheetPublicPath(urlPath) {
  const rel = toRelative(urlPath);
  if (rel === null) return false;
  if (rel === '') return true; // "/" → index.html
  if (urlPath.endsWith('/')) return false;
  if (PUBLIC_PAGES.has(rel) || PUBLIC_LIB_MODULES.has(rel)) return true;
  if (rel.startsWith('assets/')) return ASSET_EXT.has(path.posix.extname(rel).toLowerCase());
  return false;
}
