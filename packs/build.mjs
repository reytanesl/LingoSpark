/**
 * Build sellable lesson packs from packs/data/*.json
 *   node packs/build.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DIST_DIR = path.join(__dirname, 'dist');
const SITE = 'https://lingospark.study';
const YEAR = new Date().getFullYear();

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a += 0x6d2b79f5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(arr, seed) {
    const copy = [...arr];
    const rand = mulberry32(seed);
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const SET_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function chunkSets(items) {
    const size = items.length >= 80 ? 20 : Math.ceil(items.length / 2);
    const sets = [];
    for (let i = 0; i < items.length; i += size) {
        sets.push({
            label: SET_LETTERS[sets.length],
            items: items.slice(i, i + size),
        });
    }
    return sets;
}

function setSize(pack) {
    const sets = chunkSets(pack.items);
    return sets[0] ? sets[0].items.length : 0;
}

function pasteLines(items, mode) {
    if (mode === 'terms') return items.map((i) => i.term).join('\n');
    if (mode === 'en') return items.map((i) => `${i.term} = ${i.definitionEn}`).join('\n');
    return items.map((i) => `${i.term} = ${i.definitionPl}`).join('\n');
}

function blankExample(item) {
    const term = item.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${term}\\b`, 'i');
    if (re.test(item.example)) {
        return item.example.replace(re, '_______________');
    }
    return item.example;
}

function css() {
    return `
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Georgia, "Times New Roman", serif;
  color: #1f1f1f;
  font-size: 11pt;
  line-height: 1.45;
  background: #fff;
}
h1, h2, h3 { font-family: "Trebuchet MS", "Segoe UI", sans-serif; color: #012169; page-break-after: avoid; }
h1 { font-size: 20pt; margin: 0 0 0.35em; }
h2 { font-size: 14pt; margin: 1.1em 0 0.4em; border-bottom: 2px solid #C8102E; padding-bottom: 0.15em; }
h3 { font-size: 12pt; margin: 0.9em 0 0.3em; }
p { margin: 0.4em 0 0.55em; }
.meta { color: #5A5A5A; font-size: 10pt; margin-bottom: 0.8em; }
.banner {
  background: #012169; color: #fff; padding: 10px 14px; margin: 0 0 14px;
  font-family: "Trebuchet MS", "Segoe UI", sans-serif;
}
.banner strong { letter-spacing: 0.04em; }
.kicker { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.12em; color: #C8102E; font-family: "Trebuchet MS", sans-serif; font-weight: 700; }
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
.footer {
  margin-top: 1.4em; padding-top: 0.5em; border-top: 1px solid #ddd;
  font-size: 8.5pt; color: #5A5A5A;
}
table { width: 100%; border-collapse: collapse; margin: 0.5em 0 1em; }
th, td { border: 1px solid #cfcfcf; padding: 6px 8px; vertical-align: top; font-size: 10.5pt; }
th { background: #F4F5F7; font-family: "Trebuchet MS", sans-serif; text-align: left; color: #012169; }
ol, ul { margin: 0.3em 0 0.8em 1.2em; }
li { margin-bottom: 0.28em; }
.box { border: 1px solid #012169; padding: 10px 12px; margin: 0.7em 0; background: #f7f8fb; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
.match-row { display: grid; grid-template-columns: 1.1fr 0.7fr 1.3fr; gap: 8px; align-items: center; margin: 5px 0; }
.match-term { font-weight: 700; }
.blank-line { border-bottom: 1px solid #333; min-height: 1.2em; }
.small { font-size: 9.5pt; color: #5A5A5A; }
.cover-title { font-size: 26pt; line-height: 1.15; margin: 0.4em 0 0.2em; }
.badge { display: inline-block; background: #C8102E; color: #fff; font-family: "Trebuchet MS", sans-serif; font-size: 9pt; padding: 3px 8px; margin-right: 6px; }
@media print {
  a { color: inherit; text-decoration: none; }
}
`.trim();
}

function wrapHtml(title, body) {
    return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>${css()}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

function footer(pack) {
    return `<div class="footer">© ${YEAR} LingoSpark · ${escapeHtml(pack.sku)} · Single classroom licence — do not upload or share the files. Play the lists at ${SITE}</div>`;
}

function coverPage(pack) {
    return `
<div class="page">
  <div class="banner"><strong>LingoSpark</strong> · Digital lesson pack</div>
  <div class="kicker">${escapeHtml(pack.exam)} · ${escapeHtml(pack.level)}</div>
  <h1 class="cover-title">${escapeHtml(pack.titlePl)}</h1>
  <p class="meta">${escapeHtml(pack.titleEn)}</p>
  <p><span class="badge">${escapeHtml(pack.topicPl)}</span><span class="badge">${pack.items.length} haseł</span><span class="badge">${chunkSets(pack.items).length} lekcji × 45 min</span></p>
  <div class="box">
    <p><strong>Co jest w paczce</strong></p>
    <ul>
      <li>${chunkSets(pack.items).length} zestawy po ok. ${setSize(pack)} haseł (Set ${chunkSets(pack.items).map((s) => s.label).join(' / ')}) — format <code>term = polska definicja</code></li>
      <li>Ta sama lista z definicjami po angielsku (Matura / mocniejsze klasy)</li>
      <li>Sama kolumna haseł — do Primary English (Custom Vocab)</li>
      <li>Karty: dobieranie, luki, mini-quiz + klucz</li>
      <li>Plan lekcji pod gry na ${escapeHtml(SITE)}</li>
    </ul>
  </div>
  <p>Wklejasz listę tutaj:</p>
  <ul>
    <li><strong>Bomb Defusal / Flashcards / Grid Territory</strong> — Vocab Review → Play Now → wklej listę</li>
    <li><strong>Vocab Auction</strong> — w polu własnych słów wklej <code>term = definition</code></li>
    <li><strong>Live Quiz</strong> — nauczyciel loguje się → Live Game → Paste glossary</li>
    <li><strong>Primary English</strong> — Writing Suite (premium) → Custom Vocab → wklej same hasła</li>
  </ul>
  ${footer(pack)}
</div>`;
}

function howToPage(pack) {
    return `
<div class="page">
  <div class="kicker">Teacher notes · EN + PL</div>
  <h1>How to paste this pack into LingoSpark</h1>
  <p class="meta">${escapeHtml(pack.titleEn)} · ${SITE}</p>

  <h2>1. Bomb Defusal (best first game)</h2>
  <ol>
    <li>Open ${SITE} → <strong>Vocab Review</strong> → Vocabulary Bomb Defusal → Play Now.</li>
    <li>Open <code>paste/set-A-pl.txt</code> (or another set), copy all, paste into the glossary box.</li>
    <li>Leave “Prompt with Definition, Type Term” so students see Polish (or English) and type the English word.</li>
    <li>Start. Correct answers add time; mistakes take time away.</li>
  </ol>
  <p class="small">PL: Vocab Review → Bomba → wklej set-A-pl.txt → definicja na ekranie, uczeń wpisuje hasło po angielsku.</p>

  <h2>2. Classic Flashcards</h2>
  <ol>
    <li>Same glossary box as above (it stays filled if you go Back and pick Flashcards).</li>
    <li>Or paste again. Students mark Know / Don’t know. Unknown cards stay in the deck.</li>
  </ol>

  <h2>3. Grid Territory / Vocab Auction / Live Quiz</h2>
  <ul>
    <li><strong>Grid:</strong> Vocab Review → Grid Territory — paste the same list; play pairs or vs bot.</li>
    <li><strong>Auction:</strong> Vocab Review → Vocab Auction → paste <code>term = definition</code> in the custom box. Solo or 2 players.</li>
    <li><strong>Live Quiz:</strong> sign in → Live Game. Choose Paste glossary. Need at least 12 items (each set has about ${setSize(pack)}). Students join with a room code. First to 12 correct wins.</li>
  </ul>

  <h2>4. Primary English (optional, paid on the site)</h2>
  <p>Writing Suite → Primary English → Custom Vocab. Paste <code>paste/terms-only.txt</code> (English terms only, one per line). Needs 4+ items. AI tasks then force those words.</p>

  <div class="box">
    <p><strong>These lists are not the free demo sets on the site.</strong> The free demos are Matura “Człowiek” only. This pack is original exam-topic content for selling / classroom use.</p>
  </div>
  ${footer(pack)}
</div>`;
}

function lessonPlanPage(pack) {
    const sets = chunkSets(pack.items);
    const n = setSize(pack);
    const setList = sets.map((s) => s.label).join(', ');
    return `
<div class="page">
  <div class="kicker">Plan lekcji</div>
  <h1>${sets.length} × 45 minut — ${escapeHtml(pack.topicPl)}</h1>
  <p class="meta">${escapeHtml(pack.exam)} · ${escapeHtml(pack.level)} · ${pack.items.length} haseł · ok. ${n} na lekcję (Set ${setList})</p>

  <h2>Jedna lekcja = jeden set</h2>
  <ol>
    <li><strong>5 min</strong> — rozgrzewka: 4 hasła z karty dobierania na tablicy (EN → PL).</li>
    <li><strong>12 min</strong> — Bomb Defusal. Wklej <code>set-X-pl.txt</code> dla tej lekcji.</li>
    <li><strong>8 min</strong> — fiszki: Know / Don’t know.</li>
    <li><strong>12 min</strong> — pary: Grid Territory albo Vocab Auction.</li>
    <li><strong>8 min</strong> — karta dobierania / luki, albo Live Quiz (od Set B wzwyż).</li>
  </ol>
  <p>Kolejność: A → B → C… Powtórka co trzecią lekcję: wklej dwa poprzednie sety naraz do Live Quiz.</p>

  <h2>Wersja trudniejsza (definicje EN)</h2>
  <p>Wklej <code>set-X-en.txt</code> i ustaw „Prompt with Definition, Type Term”. Uczeń widzi angielską definicję — jak w części leksykalnej.</p>

  <h2>Praca domowa</h2>
  <p>Uczniowie wklejają ten sam plik w Flashcards na telefonie. Konto LingoSpark jest darmowe; gry słownikowe też. Writing Suite / Primary English są płatne — nie są potrzebne do tej paczki.</p>
  <p class="small">Karty do druku biorą 12 haseł (dobieranie) i 8 (luki + quiz) z każdego setu. Pełny set jest w plikach paste — do gier.</p>
  ${footer(pack)}
</div>`;
}

function matchingBlock(items, seed, label) {
    const left = items.slice(0, Math.min(12, items.length));
    const right = shuffle(left.map((i) => i.definitionPl), seed);
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const termCol = left.map((item, idx) => `<div>${idx + 1}. <span class="match-term">${escapeHtml(item.term)}</span> ______</div>`).join('');
    const defCol = right.map((d, i) => `<div>${letters[i]}. ${escapeHtml(d)}</div>`).join('');
    return `
<h2>Dobieranie ${escapeHtml(label)} — EN → PL</h2>
<p class="small">Wpisz literę definicji obok hasła. ${left.length} pozycji.</p>
<div class="grid-2">
  <div>${termCol}</div>
  <div>${defCol}</div>
</div>`;
}

function gapBlock(items, label, seed) {
    const pick = items.slice(0, Math.min(8, items.length));
    const original = pick.map((i) => i.term);
    let boxed = shuffle(original, seed);
    for (let n = 1; n < 12 && boxed.length > 1 && boxed.every((t, i) => t === original[i]); n += 1) {
        boxed = shuffle(original, seed + n);
    }
    const box = boxed.map((t) => escapeHtml(t)).join(' · ');
    const list = pick
        .map((i, idx) => `<p>${idx + 1}. ${escapeHtml(blankExample(i))}</p>`)
        .join('');
    return `
<h2>Luki ${escapeHtml(label)}</h2>
<p class="small">Uzupełnij zdania hasłem z ramki. Forma w zdaniu może być bez zmian.</p>
<div class="box">${box}</div>
${list}`;
}

function quizBlock(items, label) {
    const pick = items.slice(0, Math.min(8, items.length));
    const list = pick
        .map((i, idx) => `<p>${idx + 1}. ${escapeHtml(i.definitionEn)}<br><span class="blank-line">&nbsp;</span></p>`)
        .join('');
    return `
<h2>Mini-quiz ${escapeHtml(label)} — napisz hasło po angielsku</h2>
<p class="small">Jak na egzaminie: definicja po angielsku → term.</p>
${list}`;
}

function studentPages(pack) {
    const sets = chunkSets(pack.items);
    return sets
        .map((set, idx) => {
            const seed = 11 + idx * 13;
            return `
<div class="page">
  <div class="kicker">Student · ${escapeHtml(pack.sku)}</div>
  <h1>${escapeHtml(pack.topicPl)} — karty (Set ${set.label})</h1>
  <p class="meta">Imię: ______________________ Klasa: ______ Data: __________</p>
  ${matchingBlock(set.items, seed, set.label)}
  ${gapBlock(set.items, set.label, seed + 97)}
  ${footer(pack)}
</div>
<div class="page">
  <div class="kicker">Student · ${escapeHtml(pack.sku)}</div>
  <h1>${escapeHtml(pack.topicPl)} — karty (Set ${set.label}, cd.)</h1>
  ${quizBlock(set.items, set.label)}
  ${footer(pack)}
</div>`;
        })
        .join('');
}

function keyPages(pack) {
    const sets = chunkSets(pack.items);
    const table = (items, seed, label) => {
        const left = items.slice(0, Math.min(12, items.length));
        const right = shuffle(left.map((i) => i.definitionPl), seed);
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const letterOf = (def) => letters[right.indexOf(def)];
        const matchRows = left
            .map((i, idx) => `<tr><td>${idx + 1}. ${escapeHtml(i.term)}</td><td>${letterOf(i.definitionPl)}</td><td>${escapeHtml(i.definitionPl)}</td></tr>`)
            .join('');
        const gaps = items
            .slice(0, Math.min(8, items.length))
            .map((i, idx) => `<tr><td>${idx + 1}</td><td>${escapeHtml(i.term)}</td></tr>`)
            .join('');
        const quiz = items
            .slice(0, Math.min(8, items.length))
            .map((i, idx) => `<tr><td>${idx + 1}</td><td>${escapeHtml(i.term)}</td></tr>`)
            .join('');
        return `
<h2>Klucz — Set ${escapeHtml(label)}</h2>
<h3>Dobieranie</h3>
<table><tr><th>#</th><th>Litera</th><th>Definicja</th></tr>${matchRows}</table>
<h3>Luki</h3>
<table><tr><th>#</th><th>Hasło</th></tr>${gaps}</table>
<h3>Mini-quiz</h3>
<table><tr><th>#</th><th>Hasło</th></tr>${quiz}</table>`;
    };
    const keyBlocks = sets
        .map((set, idx) => `<div class="page">
  <div class="kicker">Teacher · answer key</div>
  ${idx === 0 ? '<h1>Klucz odpowiedzi</h1>' : ''}
  ${table(set.items, 11 + idx * 13, set.label)}
  ${footer(pack)}
</div>`)
        .join('');
    const glossary = `
<div class="page">
  <div class="kicker">Teacher · full list</div>
  <h1>Pełna lista (${pack.items.length})</h1>
  <table>
    <tr><th>Term</th><th>PL</th><th>EN definition</th></tr>
    ${pack.items.map((i) => `<tr><td>${escapeHtml(i.term)}</td><td>${escapeHtml(i.definitionPl)}</td><td>${escapeHtml(i.definitionEn)}</td></tr>`).join('')}
  </table>
  ${footer(pack)}
</div>`;
    return keyBlocks + glossary;
}

function teacherGuideHtml(pack) {
    return wrapHtml(
        pack.titlePl,
        coverPage(pack) + howToPage(pack) + lessonPlanPage(pack)
    );
}

function studentHtml(pack) {
    return wrapHtml(`${pack.topicPl} — student worksheets`, studentPages(pack));
}

function keyHtml(pack) {
    return wrapHtml(`${pack.topicPl} — answer key`, keyPages(pack));
}

function listingText(pack) {
    const games = 'Bomb Defusal, Classic Flashcards, Grid Territory, Vocab Auction, Live Vocab Quiz';
    return `# Listing copy — ${pack.sku}

## Teachers Pay Teachers — title
${pack.titleEn} | Paste into vocab games (Bomb, Flashcards, Live Quiz)

## TPT — description (EN)
${pack.blurbEn}

This pack is built for Polish exam English (${pack.examEn}, ${pack.level}, topic: ${pack.topicEn}).

**${pack.items.length} exam-style terms** in ${chunkSets(pack.items).length} lesson sets of about ${setSize(pack)} (one 45-minute lesson per set).

Each term has:
- a Polish gloss (paste into games so students type the English word)
- an English definition (harder mode / Matura-style)
- a natural example sentence (used in the gap-fill)

**How it works with LingoSpark (free vocab games):**
1. Copy a paste file (term = definition).
2. Open ${SITE} → Vocab Review.
3. Paste into ${games}.
4. Play. No extra software.

Printable worksheets (matching, gap-fill, mini-quiz) plus a full answer key are included as HTML — print to PDF from your browser (Ctrl+P → Save as PDF).

Vocab games on LingoSpark stay free. You do not need a paid Writing Suite account to use this pack.

**Not included:** the site’s free “Człowiek” demo lists. This is original ${pack.topicEn} content.

Licence: one teacher, one classroom. Do not post the paste files on a public drive.

Suggested price: USD ${pack.priceHint.tptUsd}

## TPT tags
${pack.tags.join(', ')}

## Etsy — title
${pack.titleEn} — printable + paste-ready ESL list

## Polish teacher groups / Facebook
${pack.titlePl}

${pack.blurbPl}

${pack.items.length} haseł (${pack.level}), ${chunkSets(pack.items).length} lekcji. Wklejasz do darmowych gier na ${SITE} (bomba, fiszki, aukcja, live quiz). Karty do druku + klucz.

Cena sugerowana: ${pack.priceHint.pln} zł (plik ZIP).

Licencja: jedna osoba / jedna klasa. Nie wrzucaj plików na Librus „dla całej szkoły” ani na grupę FB.
`;
}

function writePack(pack) {
    const sets = chunkSets(pack.items);
    const root = path.join(DIST_DIR, pack.id);
    const paste = path.join(root, 'paste');
    fs.mkdirSync(paste, { recursive: true });

    const files = {
        'paste/full-list-pl.txt': pasteLines(pack.items, 'pl'),
        'paste/full-list-en.txt': pasteLines(pack.items, 'en'),
        'paste/terms-only.txt': pasteLines(pack.items, 'terms'),
        'print/teacher-guide.html': teacherGuideHtml(pack),
        'print/student-worksheets.html': studentHtml(pack),
        'print/answer-key.html': keyHtml(pack),
        'LISTING.txt': listingText(pack),
        'LICENSE-CLASSROOM.txt': fs.readFileSync(path.join(__dirname, 'LICENSE-CLASSROOM.txt'), 'utf8'),
        'README.txt': `LingoSpark pack ${pack.sku}
${pack.titlePl}

${pack.items.length} terms in ${sets.length} sets (${sets.map((s) => s.label).join(', ')}).

1. Open print/teacher-guide.html and print/student-worksheets.html in a browser.
2. Ctrl+P → Save as PDF (TPT wants PDF).
3. Upload the PDFs + the paste/ folder as a ZIP.
4. Play: copy paste/set-A-pl.txt → ${SITE} → Vocab Review → Bomb Defusal.

Licence: classroom (see LICENSE-CLASSROOM.txt in packs/).
`,
    };
    for (const set of sets) {
        files[`paste/set-${set.label}-pl.txt`] = pasteLines(set.items, 'pl');
        files[`paste/set-${set.label}-en.txt`] = pasteLines(set.items, 'en');
    }

    for (const [rel, content] of Object.entries(files)) {
        const full = path.join(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf8');
    }
    return root;
}

function bundleListing(packs, kind) {
    const e8 = kind === 'e8';
    const pr = kind === 'matura-pr';
    const count = packs.length;
    const usd = e8 ? '29' : pr ? '39' : kind === 'matura' ? '5' : '69';
    const pln = e8 ? '99' : pr ? '149' : kind === 'matura' ? '20' : '249';
    const title =
        kind === 'e8'
            ? `Polish Grade-8 English (Egzamin ósmoklasisty) — all ${count} CKE modules`
            : pr
              ? `Polish Matura Extended (rozszerzona) — all ${count} CKE modules`
              : kind === 'matura'
                ? 'Polish Matura Basic — Work + Health vocab games'
                : `LingoSpark exam packs bundle (${count} packs)`;
    const heading =
        kind === 'e8'
            ? `# Bundle listing — E8 complete (${count} modules)`
            : pr
              ? `# Bundle listing — Matura PR complete (${count} modules)`
              : kind === 'matura'
                ? `# Bundle listing — Matura PP (2 packs)`
                : `# Bundle listing — all packs (${count})`;
    return `${heading}

## TPT title
${title} | Paste into LingoSpark games

## Description
${e8 ? 'Every thematic module from the CKE Grade-8 English exam informator.' : pr ? 'Every thematic module from the CKE Matura Extended (poziom rozszerzony) informator. B2 lexis, ENG–PL glosses.' : 'Paste-ready LingoSpark packs:'}

${packs.map((p) => `- **${p.topicPl} / ${p.topicEn}** (${p.exam}) — ${p.items.length} terms`).join('\n')}

Each pack: paste files by set plus a full list (PL + EN glosses), terms-only for Primary English, printable matching / gap-fill / quiz, lesson plan, answer key.

Play on ${SITE} (vocab games are free).

Suggested bundle price: USD ${usd} / ${pln} zł (save vs buying separately).

The E8 Człowiek pack is original Grade-8 vocab — not the free Matura “Człowiek” demo on the site.
`;
}

const E8_ORDER = [
    'osmoklasista-czlowiek',
    'osmoklasista-dom',
    'osmoklasista-edukacja',
    'osmoklasista-praca',
    'osmoklasista-zycie-prywatne',
    'osmoklasista-zywienie',
    'osmoklasista-zakupy',
    'osmoklasista-podroze',
    'osmoklasista-kultura',
    'osmoklasista-sport',
    'osmoklasista-zdrowie',
    'osmoklasista-nauka-technika',
    'osmoklasista-przyroda',
    'osmoklasista-zycie-spoleczne',
];

const PR_ORDER = [
    'matura-pr-czlowiek',
    'matura-pr-dom',
    'matura-pr-edukacja',
    'matura-pr-praca',
    'matura-pr-zycie-prywatne',
    'matura-pr-zywienie',
    'matura-pr-zakupy',
    'matura-pr-podroze',
    'matura-pr-kultura',
    'matura-pr-sport',
    'matura-pr-zdrowie',
    'matura-pr-nauka-technika',
    'matura-pr-przyroda',
    'matura-pr-panstwo-spoleczenstwo',
];

function sortPacks(packs) {
    const rank = (id) => {
        const e8 = E8_ORDER.indexOf(id);
        if (e8 !== -1) return e8;
        const pr = PR_ORDER.indexOf(id);
        if (pr !== -1) return 200 + pr;
        return 1000 + id.charCodeAt(0);
    };
    return [...packs].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

function distIndex(packs) {
    const e8 = sortPacks(packs.filter((p) => p.id.startsWith('osmoklasista-')));
    const pr = sortPacks(packs.filter((p) => p.id.startsWith('matura-pr-')));
    const other = packs.filter((p) => !p.id.startsWith('osmoklasista-') && !p.id.startsWith('matura-pr-'));
    const list = (items) =>
        items
            .map(
                (p) => `<li><a href="${p.id}/print/teacher-guide.html">${escapeHtml(p.titlePl)}</a>
        · <a href="${p.id}/print/student-worksheets.html">karty</a>
        · <a href="${p.id}/print/answer-key.html">klucz</a></li>`
            )
            .join('\n');
    return wrapHtml(
        'LingoSpark lesson packs',
        `<div class="banner"><strong>LingoSpark</strong> · packs preview</div>
<h1>Digital lesson packs</h1>
<p>Open a guide, then Ctrl+P → Save as PDF before uploading to TPT / Etsy.</p>
<h2>Egzamin ósmoklasisty — all 14 CKE modules</h2>
<ul>${list(e8)}</ul>
<h2>Matura rozszerzona — all 14 CKE modules</h2>
<ul>${list(pr)}</ul>
<h2>Matura podstawowa</h2>
<ul>${list(other)}</ul>
<p class="small">Source JSON lives in packs/data/. Rebuild with <code>node packs/build.mjs</code>.</p>`
    );
}

function normalizeTerm(term) {
    return String(term).toLowerCase().replace(/\s+/g, ' ').trim();
}

function validateItem(filename, item) {
    if (!item.term || !item.definitionPl || !item.definitionEn || !item.example) {
        throw new Error(`${filename}: incomplete item ${JSON.stringify(item)}`);
    }
    if (!item.example.toLowerCase().includes(item.term.toLowerCase())) {
        throw new Error(`${filename}: example does not contain term "${item.term}": ${item.example}`);
    }
}

function loadPacks() {
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
    const packs = files.map((filename) => {
        const pack = JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
        pack._file = filename;
        return pack;
    });

    const takenE8 = new Map();
    const takenPr = new Map();
    for (const pack of packs) {
        const seen = new Set();
        const e8 = pack.id.startsWith('osmoklasista-');
        const pr = pack.id.startsWith('matura-pr-');
        const taken = e8 ? takenE8 : pr ? takenPr : null;
        for (const item of pack.items) {
            validateItem(pack._file, item);
            const key = normalizeTerm(item.term);
            if (seen.has(key)) throw new Error(`${pack._file}: duplicate term "${item.term}"`);
            seen.add(key);
            if (taken && taken.has(key)) {
                throw new Error(`Base clash "${item.term}": ${taken.get(key)} and ${pack.id}`);
            }
            if (taken) taken.set(key, pack.id);
        }
    }

    for (const pack of sortPacks(packs)) {
        const extraPath = path.join(DATA_DIR, 'extra', pack._file);
        if (!fs.existsSync(extraPath)) continue;
        const extra = JSON.parse(fs.readFileSync(extraPath, 'utf8'));
        if (!Array.isArray(extra)) throw new Error(`extra/${pack._file} must be an array`);
        const e8 = pack.id.startsWith('osmoklasista-');
        const pr = pack.id.startsWith('matura-pr-');
        const taken = e8 ? takenE8 : pr ? takenPr : new Map();
        for (const item of extra) {
            validateItem('extra/' + pack._file, item);
            const key = normalizeTerm(item.term);
            if (taken.has(key)) continue;
            pack.items.push(item);
            taken.set(key, pack.id);
        }
    }

    for (const pack of packs) {
        delete pack._file;
        const e8 = pack.id.startsWith('osmoklasista-');
        const pr = pack.id.startsWith('matura-pr-');
        if (e8 && (pack.items.length < 100 || pack.items.length > 150)) {
            throw new Error(`${pack.id}: E8 packs need 100–150 items, got ${pack.items.length}`);
        }
        if (pr && (pack.items.length < 150 || pack.items.length > 200)) {
            throw new Error(`${pack.id}: Matura PR packs need 150–200 items, got ${pack.items.length}`);
        }
        if (!e8 && !pr && pack.items.length < 16) {
            throw new Error(`${pack.id}: need at least 16 items`);
        }
        pack.titlePl = pack.titlePl.replace(/— \d+ haseł/, `— ${pack.items.length} haseł`);
        pack.titleEn = pack.titleEn.replace(/— \d+ terms/, `— ${pack.items.length} terms`);
        if (e8) pack.priceHint = { tptUsd: 3, pln: 12 };
        if (pr) pack.priceHint = { tptUsd: 4, pln: 16 };
    }
    return packs;
}

function findBrowser() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
}

function htmlToPdf(browser, htmlPath, pdfPath) {
    const result = spawnSync(
        browser,
        [
            '--headless=new',
            '--disable-gpu',
            '--no-pdf-header-footer',
            `--print-to-pdf=${pdfPath}`,
            pathToFileURL(htmlPath).href,
        ],
        { encoding: 'utf8', timeout: 90000 }
    );
    if (result.status !== 0) {
        throw new Error(`PDF failed for ${htmlPath}: ${result.stderr || result.stdout || result.status}`);
    }
}

function zipPack(packDir, zipPath) {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    const result = spawnSync(
        'powershell.exe',
        [
            '-NoProfile',
            '-Command',
            `Compress-Archive -Path ${JSON.stringify(path.join(packDir, '*'))} -DestinationPath ${JSON.stringify(zipPath)} -Force`,
        ],
        { encoding: 'utf8', timeout: 60000 }
    );
    if (result.status !== 0) {
        throw new Error(`ZIP failed: ${result.stderr || result.stdout || result.status}`);
    }
}

function zipMany(dirs, zipPath) {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    const list = dirs.map((d) => `'${String(d).replace(/'/g, "''")}'`).join(', ');
    const result = spawnSync(
        'powershell.exe',
        [
            '-NoProfile',
            '-Command',
            `Compress-Archive -Path @(${list}) -DestinationPath ${JSON.stringify(zipPath)} -Force`,
        ],
        { encoding: 'utf8', timeout: 120000 }
    );
    if (result.status !== 0) {
        throw new Error(`ZIP failed: ${result.stderr || result.stdout || result.status}`);
    }
}

const packs = loadPacks();
const e8Packs = sortPacks(packs.filter((p) => p.id.startsWith('osmoklasista-')));
const prPacks = sortPacks(packs.filter((p) => p.id.startsWith('matura-pr-')));
const maturaPacks = packs.filter((p) => p.id.startsWith('matura-pp-'));
fs.mkdirSync(DIST_DIR, { recursive: true });
for (const pack of packs) writePack(pack);
fs.writeFileSync(path.join(DIST_DIR, 'BUNDLE-LISTING-E8.txt'), bundleListing(e8Packs, 'e8'), 'utf8');
fs.writeFileSync(path.join(DIST_DIR, 'BUNDLE-LISTING-MATURA.txt'), bundleListing(maturaPacks, 'matura'), 'utf8');
fs.writeFileSync(path.join(DIST_DIR, 'BUNDLE-LISTING-MATURA-PR.txt'), bundleListing(prPacks, 'matura-pr'), 'utf8');
fs.writeFileSync(path.join(DIST_DIR, 'BUNDLE-LISTING.txt'), bundleListing(packs, 'all'), 'utf8');
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), distIndex(packs), 'utf8');
console.log(`Built ${packs.length} packs → ${DIST_DIR}`);
for (const p of sortPacks(packs)) console.log(`  ${p.sku}  ${p.id}  (${p.items.length} terms)`);

const browser = findBrowser();
if (browser) {
    console.log(`Printing PDFs with ${browser}`);
    for (const pack of packs) {
        const printDir = path.join(DIST_DIR, pack.id, 'print');
        for (const name of ['teacher-guide', 'student-worksheets', 'answer-key']) {
            htmlToPdf(browser, path.join(printDir, `${name}.html`), path.join(printDir, `${name}.pdf`));
        }
        console.log(`  PDFs ${pack.sku}`);
    }
} else {
    console.log('No Chrome/Edge found — print HTML to PDF from the browser (Ctrl+P).');
}

for (const pack of packs) {
    const zipName = `LingoSpark-${pack.sku}.zip`;
    zipPack(path.join(DIST_DIR, pack.id), path.join(DIST_DIR, zipName));
    console.log(`  ZIP ${zipName}`);
}
zipMany(
    e8Packs.map((p) => path.join(DIST_DIR, p.id)),
    path.join(DIST_DIR, 'LingoSpark-LS-8-COMPLETE.zip')
);
console.log('  ZIP LingoSpark-LS-8-COMPLETE.zip');
if (prPacks.length) {
    zipMany(
        prPacks.map((p) => path.join(DIST_DIR, p.id)),
        path.join(DIST_DIR, 'LingoSpark-LS-PR-COMPLETE.zip')
    );
    console.log('  ZIP LingoSpark-LS-PR-COMPLETE.zip');
}
