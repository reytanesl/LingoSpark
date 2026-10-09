// Server-only: decides which repo files express.static may serve.
// The app is served from the repo root, so this is an ALLOWLIST: anything not
// matched here (server modules, tests, package/deploy files, dotfiles, scripts,
// node_modules, data/, packs/, shorts/, ...) answers 404 before express.static.

import path from 'path';

/** HTML pages that browsers open directly or in iframes. */
export const PUBLIC_PAGES = new Set([
    'index.html',
    'admin.html',
    'shop.html',
    'penalty-match.html',
    'vocab-auction.html',
    'board-game-challenge.html',
    'esl-millionaire.html',
    'vocab-scenes.html',
]);

/**
 * Root-level JS loaded by pages (<script src>, or injected by page code).
 * Server modules (server.js, db.js, auth.js, live-game.js, lucky-lanterns.js,
 * word-cannon.js, vocab-quiz-utils.js, odyssey-prompts.js, ...) are NOT listed.
 * Add a file here when a page starts loading it.
 */
export const PUBLIC_SCRIPTS = new Set([
    'demo-sets.js',
    'frank-paragraphs.js',
    'live-entry.js',
    'live-game-client.js',
    'lucky-lanterns-fx.js',
    'password-reset-client.js',
    'pe-colour-blocks.js',
    'pe-dictation-banks.js',
    'pe-line-up.js',
    'pe-review-chat.js',
    'pe-topic-challenge-banks.js',
    'pe-topic-challenge-cues.js',
    'pe-topic-challenge-hotspots.js',
    'pe-topic-challenge.js',
    'penalty-match-core.js',
    'test-countdown.js',
    'vocab-auction-bank.js',
    'vocab-auction-chips.js',
    'word-cannon-client.js',
    'word-cannon-fx.js',
]);

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.avif']);
const AUDIO_EXT = new Set(['.mp3', '.ogg', '.wav', '.m4a']);
const FONT_EXT = new Set(['.woff', '.woff2', '.ttf', '.otf']);

/** Directory prefix -> extensions (or exact files) allowed below it. */
const PUBLIC_DIRS = [
    { dir: 'assets/', ext: new Set([...IMAGE_EXT, ...AUDIO_EXT, ...FONT_EXT, '.css']) },
    { dir: 'audio/', ext: AUDIO_EXT },
    // shop/ also holds build scripts (*.mjs, *.py); only images + the catalog are public.
    { dir: 'shop/', ext: IMAGE_EXT, files: new Set(['shop/catalog.js']) },
];

/**
 * Normalise a request path into a repo-relative path, or null when it is
 * malformed / tries to escape / touches a dotfile.
 */
export function toRepoRelative(urlPath) {
    if (typeof urlPath !== 'string') return null;
    let decoded;
    try {
        decoded = decodeURIComponent(urlPath.split('?')[0]);
    } catch {
        return null;
    }
    if (decoded.includes('\0') || decoded.includes('\\')) return null;
    const segments = decoded.split('/').filter(Boolean);
    for (const seg of segments) {
        if (seg.startsWith('.')) return null; // dotfiles, .git/, .env*, '..'
    }
    return segments.join('/');
}

/** True when the request path may be served from the repo root. */
export function isPublicStaticPath(urlPath) {
    const rel = toRepoRelative(urlPath);
    if (rel === null) return false;
    if (rel === '') return true; // "/" -> index.html
    if (urlPath.endsWith('/')) return false; // no directory index outside "/"
    const ext = path.posix.extname(rel).toLowerCase();

    if (!rel.includes('/')) {
        if (PUBLIC_PAGES.has(rel) || PUBLIC_SCRIPTS.has(rel)) return true;
        if (ext === '.css') return true;
        // favicons, apple-touch-icon, logo PNGs; audio tracks referenced by root pages
        if (IMAGE_EXT.has(ext) || AUDIO_EXT.has(ext)) return true;
        return false;
    }

    for (const rule of PUBLIC_DIRS) {
        if (!rel.startsWith(rule.dir)) continue;
        if (rule.files?.has(rel)) return true;
        return rule.ext.has(ext);
    }
    return false;
}

/** Express middleware: 404 for anything not on the allowlist (GET/HEAD only). */
export function staticAllowlist() {
    return function staticAllowlistMiddleware(req, res, next) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        if (isPublicStaticPath(req.path)) return next();
        res.status(404).type('text/plain').send('Not found');
    };
}
