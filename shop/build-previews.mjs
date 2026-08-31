/**
 * Branded SVG thumbnails for the teacher shop (and TPT-style listings).
 *   node shop/build-previews.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'previews');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'catalog.js'), 'utf8'), ctx);
const products = ctx.window.LS_SHOP.products;

function xml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function icon(id) {
    const c = '#012169';
    const r = '#C8102E';
    const g = '#00823B';
    switch (id) {
        case 'e8-2027-study-plan':
            return `<g fill="none" stroke="${c}" stroke-width="8" stroke-linejoin="round">
              <rect x="500" y="270" width="200" height="260" rx="10"/>
              <path d="M530 310h140M530 350h110M530 390h140M530 430h90" stroke="${r}" stroke-width="6"/>
              <rect x="545" y="455" width="22" height="22" stroke="${g}" stroke-width="5"/>
              <rect x="580" y="455" width="22" height="22" stroke="${g}" stroke-width="5"/>
              <rect x="615" y="455" width="22" height="22" stroke="${g}" stroke-width="5"/>
            </g>`;
        case 'ls-8-complete':
            return `<g fill="none" stroke="${c}" stroke-width="8" stroke-linejoin="round">
              <rect x="430" y="268" width="90" height="110" rx="8"/>
              <rect x="535" y="248" width="90" height="130" rx="8"/>
              <rect x="640" y="278" width="90" height="100" rx="8"/>
              <path d="M445 288h60M550 268h60M655 298h60" stroke="${r}" stroke-width="6"/>
            </g>`;
        case 'osmoklasista-czlowiek':
            return `<g fill="none" stroke="${c}" stroke-width="8">
              <circle cx="600" cy="300" r="42"/>
              <path d="M530 430c10-52 32-78 70-78s60 26 70 78"/>
            </g>`;
        case 'osmoklasista-dom':
            return `<g fill="none" stroke="${c}" stroke-width="8" stroke-linejoin="round">
              <path d="M500 390V330l100-70 100 70v60H500z"/>
              <rect x="575" y="350" width="50" height="40" stroke="${r}"/>
            </g>`;
        case 'osmoklasista-edukacja':
            return `<g fill="none" stroke="${c}" stroke-width="8" stroke-linejoin="round">
              <path d="M490 320l110-40 110 40-110 40z"/>
              <path d="M520 340v70c40 18 90 18 130 0v-70"/>
            </g>`;
        case 'osmoklasista-praca':
            return `<g fill="none" stroke="${c}" stroke-width="8" stroke-linejoin="round">
              <rect x="510" y="310" width="180" height="120" rx="12"/>
              <path d="M560 310v-22h80v22" stroke="${r}"/>
            </g>`;
        case 'osmoklasista-zycie-prywatne':
            return `<g fill="none" stroke="${r}" stroke-width="8">
              <path d="M600 412l-70-68a44 44 0 0168-56 44 44 0 0168 56z"/>
            </g>`;
        case 'osmoklasista-zywienie':
            return `<g fill="none" stroke="${g}" stroke-width="8">
              <circle cx="600" cy="350" r="70"/>
              <path d="M600 280c18-40 48-48 62-42" stroke="${c}"/>
            </g>`;
        case 'osmoklasista-zakupy':
            return `<g fill="none" stroke="${c}" stroke-width="8" stroke-linejoin="round">
              <path d="M520 300h160l-18 120H538z"/>
              <path d="M555 300c0-28 18-48 45-48s45 20 45 48" stroke="${r}"/>
            </g>`;
        case 'osmoklasista-podroze':
            return `<g fill="none" stroke="${c}" stroke-width="8" stroke-linejoin="round">
              <path d="M490 360l220-40-70 28 18 70-40-48z"/>
              <path d="M470 400h260" stroke="${r}" stroke-width="6"/>
            </g>`;
        case 'osmoklasista-kultura':
            return `<g fill="none" stroke="${c}" stroke-width="8">
              <circle cx="560" cy="340" r="48"/>
              <circle cx="640" cy="340" r="48"/>
              <path d="M540 330h12M568 330h12M620 330h12M648 330h12" stroke="${r}" stroke-width="6"/>
              <path d="M538 358c14 16 30 16 44 0M618 358c14 16 30 16 44 0"/>
            </g>`;
        case 'osmoklasista-sport':
            return `<g fill="none" stroke="${c}" stroke-width="8">
              <circle cx="600" cy="350" r="72"/>
              <path d="M600 278v144M528 350h144"/>
              <path d="M555 300c30 20 60 20 90 0M555 400c30-20 60-20 90 0" stroke="${r}" stroke-width="6"/>
            </g>`;
        case 'osmoklasista-zdrowie':
            return `<g fill="${r}">
              <rect x="572" y="278" width="56" height="144" rx="8"/>
              <rect x="528" y="322" width="144" height="56" rx="8"/>
            </g>`;
        case 'osmoklasista-nauka-technika':
            return `<g fill="none" stroke="${c}" stroke-width="8">
              <circle cx="600" cy="350" r="18" fill="${c}" stroke="none"/>
              <ellipse cx="600" cy="350" rx="90" ry="36"/>
              <ellipse cx="600" cy="350" rx="90" ry="36" transform="rotate(60 600 350)"/>
              <ellipse cx="600" cy="350" rx="90" ry="36" transform="rotate(-60 600 350)"/>
            </g>`;
        case 'osmoklasista-przyroda':
            return `<g fill="none" stroke="${g}" stroke-width="8" stroke-linejoin="round">
              <path d="M600 250l70 110H530z"/>
              <path d="M600 310l78 120H522z"/>
              <path d="M600 360v80" stroke="${c}"/>
            </g>`;
        case 'osmoklasista-zycie-spoleczne':
            return `<g fill="none" stroke="${c}" stroke-width="8">
              <circle cx="555" cy="310" r="28"/>
              <circle cx="645" cy="310" r="28"/>
              <path d="M510 410c8-44 24-66 45-66s37 22 45 66"/>
              <path d="M600 410c8-44 24-66 45-66s37 22 45 66"/>
            </g>`;
        case 'matura-pp-praca':
            return `<g fill="none" stroke="${c}" stroke-width="8" stroke-linejoin="round">
              <rect x="530" y="270" width="140" height="180" rx="8"/>
              <path d="M555 310h90M555 345h90M555 380h60" stroke="${r}" stroke-width="6"/>
            </g>`;
        case 'matura-pp-zdrowie':
            return `<g fill="none" stroke="${r}" stroke-width="8">
              <path d="M600 412l-70-68a44 44 0 0168-56 44 44 0 0168 56z"/>
              <path d="M600 318v40M580 338h40" stroke="${c}" stroke-width="7"/>
            </g>`;
        default:
            return `<circle cx="600" cy="350" r="50" fill="#012169"/>`;
    }
}

function svgFor(p) {
    const exam = xml(p.exam);
    const title = xml(p.title);
    const count =
        p.kind === 'study-plan'
            ? '1755 haseł · checklisty · PDF'
            : p.id === 'ls-8-complete'
            ? '14 działów · 1700+ haseł'
            : `${p.terms} haseł · ${p.pricePln} zł`;
    const badge =
        p.kind === 'study-plan'
            ? 'PLAN NAUKI E8'
            : p.exam.includes('Matura')
            ? 'MATURA PP'
            : p.featured
            ? 'KOMPLET E8'
            : 'ÓSMOKLASISTA';
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900">
  <rect width="1200" height="900" fill="#F4F5F7"/>
  <rect width="1200" height="132" fill="#012169"/>
  <text x="60" y="62" fill="#ffffff" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="34" font-weight="700" letter-spacing="3">LINGOSPARK</text>
  <text x="60" y="102" fill="#F4F5F7" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="20">paczka lekcyjna · listy + karty do gier</text>
  <text x="1140" y="82" text-anchor="end" fill="#ffffff" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="18" font-weight="700">${xml(p.sku)}</text>
  <rect y="132" width="1200" height="10" fill="#C8102E"/>
  <rect x="80" y="200" width="1040" height="560" rx="18" fill="#ffffff" stroke="#E0E0E0" stroke-width="2"/>
  <rect x="80" y="200" width="12" height="560" fill="#C8102E"/>
  <text x="130" y="255" fill="#C8102E" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="22" font-weight="700" letter-spacing="2">${badge}</text>
  <text x="130" y="330" fill="#012169" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="52" font-weight="700">${title}</text>
  <text x="130" y="380" fill="#5A5A5A" font-family="Segoe UI, sans-serif" font-size="24">${exam}</text>
  ${icon(p.id)}
  <text x="130" y="700" fill="#012169" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="28" font-weight="700">${xml(count)}</text>
  <text x="130" y="740" fill="#5A5A5A" font-family="Segoe UI, sans-serif" font-size="20">Bomb Defusal · Flashcards · Auction · Live Quiz</text>
</svg>
`;
}

fs.mkdirSync(outDir, { recursive: true });
for (const p of products) {
    const file = path.join(outDir, path.basename(p.image));
    fs.writeFileSync(file, svgFor(p), 'utf8');
    console.log('wrote', path.basename(file));
}
