/**
 * PNG previews (first 4 pages) for study-plan shop listings.
 *   node shop/build-study-plan-previews.mjs
 *   node shop/build-study-plan-previews.mjs e8
 *   node shop/build-study-plan-previews.mjs pr
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PAGE_COUNT = 4;
const VIEW_W = 794;
const VIEW_H = 1024;

const PLANS = {
    e8: {
        html: path.join(ROOT, 'packs', 'dist', 'e8-2027-study-plan', 'E8-2027-study-plan.html'),
        outDir: path.join(__dirname, 'previews', 'e8-study-plan'),
        rebuild: 'node packs/build-study-plan.mjs',
        lang: 'pl',
    },
    pr: {
        html: path.join(ROOT, 'packs', 'dist', 'matura-pr-2027-study-plan', 'Matura-PR-2027-study-plan.html'),
        outDir: path.join(__dirname, 'previews', 'matura-pr-study-plan'),
        rebuild: 'node packs/build-matura-pr-study-plan.mjs',
        lang: 'en',
    },
};

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

function wrapPage(styles, pageHtml, lang) {
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
<html lang="${lang}">
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

function buildPlan(browser, key, plan) {
    if (!fs.existsSync(plan.html)) {
        console.error(`Missing ${plan.html} — run: ${plan.rebuild}`);
        return false;
    }
    const html = fs.readFileSync(plan.html, 'utf8');
    const { styles, pages } = extractPages(html);
    const tmpDir = path.join(plan.outDir, '_tmp');
    fs.mkdirSync(plan.outDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    for (let i = 0; i < pages.length; i++) {
        const tmpHtml = path.join(tmpDir, `page-${i + 1}.html`);
        const pngPath = path.join(plan.outDir, `page-${i + 1}.png`);
        fs.writeFileSync(tmpHtml, wrapPage(styles, pages[i], plan.lang), 'utf8');
        screenshot(browser, tmpHtml, pngPath);
        console.log(`Preview ${key} ${i + 1}/${pages.length} → ${path.relative(ROOT, pngPath)}`);
    }

    try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
        /* ignore */
    }
    return true;
}

const arg = (process.argv[2] || 'all').toLowerCase();
const keys = arg === 'all' ? Object.keys(PLANS) : arg in PLANS ? [arg] : null;
if (!keys) {
    console.error(`Unknown plan "${arg}". Use: e8, pr, or all.`);
    process.exit(1);
}

const browser = findBrowser();
if (!browser) {
    console.error('Chrome/Edge not found — cannot build PNG previews.');
    process.exit(1);
}

let ok = true;
for (const key of keys) {
    if (!buildPlan(browser, key, PLANS[key])) ok = false;
}
if (!ok) process.exit(1);
console.log('Done — study plan shop preview PNGs.');
