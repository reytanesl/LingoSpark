/**
 * PNG previews (first 4 pages) for the E8 study plan shop listing.
 *   node shop/build-study-plan-previews.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const STUDY_HTML = path.join(ROOT, 'packs', 'dist', 'e8-2027-study-plan', 'E8-2027-study-plan.html');
const OUT_DIR = path.join(__dirname, 'previews', 'e8-study-plan');
const TMP_DIR = path.join(OUT_DIR, '_tmp');
const PAGE_COUNT = 4;
const VIEW_W = 794;
const VIEW_H = 1024;

function findBrowser() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
}

function extractPages(html) {
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    const styles = styleMatch ? styleMatch[1] : '';
    const marker = '<div class="page">';
    const pages = [];
    let pos = 0;
    while ((pos = html.indexOf(marker, pos)) !== -1 && pages.length < PAGE_COUNT) {
        const start = pos;
        const footerIdx = html.indexOf('<div class="footer">', start);
        if (footerIdx === -1) break;
        const end = html.indexOf('</div></div>', footerIdx);
        if (end === -1) break;
        pages.push(html.slice(start, end + 12));
        pos = end + 12;
    }
    if (!pages.length) throw new Error('No .page blocks found');
    return { styles, pages };
}

function wrapPage(styles, pageHtml) {
    const screenStyles = `
${styles}
html, body { margin: 0; padding: 0; background: #fff; }
.page {
  page-break-after: auto;
  height: ${VIEW_H}px;
  min-height: ${VIEW_H}px;
  max-height: ${VIEW_H}px;
  width: ${VIEW_W}px;
  overflow: hidden;
}
body { width: ${VIEW_W}px; }
`.trim();
    return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<style>${screenStyles}</style>
</head>
<body>
${pageHtml}
</body>
</html>`;
}

function screenshot(browser, htmlPath, pngPath) {
    if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
    const result = spawnSync(
        browser,
        [
            '--headless=new',
            '--disable-gpu',
            '--hide-scrollbars',
            `--window-size=${VIEW_W},${VIEW_H}`,
            '--force-device-scale-factor=1',
            `--screenshot=${pngPath}`,
            pathToFileURL(htmlPath).href,
        ],
        { encoding: 'utf8', timeout: 60000 }
    );
    if (result.status !== 0 || !fs.existsSync(pngPath)) {
        throw new Error(`Screenshot failed: ${result.stderr || result.stdout || result.status}`);
    }
}

if (!fs.existsSync(STUDY_HTML)) {
    console.error(`Missing ${STUDY_HTML} — run: node packs/build-study-plan.mjs`);
    process.exit(1);
}

const browser = findBrowser();
if (!browser) {
    console.error('Chrome/Edge not found — cannot build PNG previews.');
    process.exit(1);
}

const html = fs.readFileSync(STUDY_HTML, 'utf8');
const { styles, pages } = extractPages(html);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

const outFiles = [];
for (let i = 0; i < pages.length; i++) {
    const tmpHtml = path.join(TMP_DIR, `page-${i + 1}.html`);
    const pngPath = path.join(OUT_DIR, `page-${i + 1}.png`);
    fs.writeFileSync(tmpHtml, wrapPage(styles, pages[i]), 'utf8');
    screenshot(browser, tmpHtml, pngPath);
    outFiles.push(pngPath);
    console.log(`Preview ${i + 1}/${pages.length} → ${path.relative(ROOT, pngPath)}`);
}

try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
} catch {
    /* ignore */
}

console.log(`Done — ${outFiles.length} shop preview PNGs in ${path.relative(ROOT, OUT_DIR)}`);
