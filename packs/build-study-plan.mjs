/**
 * Build E8 2027 student study plan (HTML + PDF)
 *   node packs/build-study-plan.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const OUT_DIR = path.join(__dirname, 'dist', 'e8-2027-study-plan');
const SITE = 'https://lingospark.study';
const YEAR = 2027;

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

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function normalizeTerm(term) {
    return String(term).toLowerCase().replace(/\s+/g, ' ').trim();
}

function loadE8Packs() {
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith('osmoklasista-') && f.endsWith('.json'));
    const packs = files.map((filename) => {
        const pack = JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
        pack._file = filename;
        return pack;
    });

    const taken = new Map();
    for (const pack of packs) {
        const seen = new Set();
        for (const item of pack.items) {
            const key = normalizeTerm(item.term);
            if (seen.has(key)) throw new Error(`${pack._file}: duplicate "${item.term}"`);
            seen.add(key);
            if (taken.has(key)) throw new Error(`Clash "${item.term}": ${taken.get(key)} and ${pack.id}`);
            taken.set(key, pack.id);
        }
    }

    for (const pack of packs) {
        const extraPath = path.join(DATA_DIR, 'extra', pack._file);
        if (!fs.existsSync(extraPath)) continue;
        const extra = JSON.parse(fs.readFileSync(extraPath, 'utf8'));
        for (const item of extra) {
            const key = normalizeTerm(item.term);
            if (taken.has(key)) continue;
            pack.items.push(item);
            taken.set(key, pack.id);
        }
        delete pack._file;
    }

    return E8_ORDER.map((id) => packs.find((p) => p.id === id)).filter(Boolean);
}

function css() {
    return `
@page { size: A4; margin: 12mm 14mm 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Segoe UI", "Trebuchet MS", sans-serif;
  color: #1f1f1f;
  font-size: 10.5pt;
  line-height: 1.4;
  background: #fff;
}
h1, h2, h3 { color: #012169; page-break-after: avoid; margin: 0 0 0.35em; }
h1 { font-size: 22pt; line-height: 1.15; }
h2 { font-size: 14pt; border-bottom: 2px solid #C8102E; padding-bottom: 0.12em; margin-top: 0.2em; }
h3 { font-size: 11.5pt; margin-top: 0.55em; margin-bottom: 0.25em; }
p { margin: 0.35em 0 0.5em; }
.page {
  page-break-after: always;
  height: 271mm;
  min-height: 271mm;
  max-height: 271mm;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.page:last-child { page-break-after: auto; }
.page-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-bottom: 10mm;
}
.page-body > .fill-grow:last-child,
.page-body > .fill-stack:last-child .fill-grow:last-child { margin-bottom: 0; }
.kicker {
  font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.14em;
  color: #C8102E; font-weight: 700; margin-bottom: 0.35em;
}
.banner {
  background: #012169; color: #fff; padding: 9px 12px; margin: 0 0 10px;
  display: flex; justify-content: space-between; align-items: center;
  flex-shrink: 0;
}
.banner strong { letter-spacing: 0.04em; font-size: 11pt; }
.banner span { font-size: 8.5pt; opacity: 0.9; }
.meta { color: #5A5A5A; font-size: 9.5pt; }
.footer {
  position: absolute; left: 0; right: 0; bottom: 0;
  border-top: 1px solid #ddd; padding-top: 4px;
  font-size: 8pt; color: #777;
  flex-shrink: 0;
}
.cover-badge {
  display: inline-block; background: #C8102E; color: #fff;
  font-size: 9pt; padding: 4px 10px; margin: 0 6px 6px 0;
}
.box {
  border: 1px solid #012169; background: #f7f8fb;
  padding: 8px 10px; margin: 0.45em 0;
}
.box-light { border: 1px dashed #9aa3b5; background: #fff; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
.grid-2.fill-stack { flex: 1; min-height: 0; align-content: stretch; }
.grid-2.fill-stack > div { display: flex; flex-direction: column; min-height: 0; }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 12px; }
table { width: 100%; border-collapse: collapse; margin: 0.35em 0 0.5em; font-size: 9.5pt; }
th, td { border: 1px solid #cfcfcf; padding: 5px 7px; vertical-align: top; }
th { background: #F4F5F7; color: #012169; text-align: left; }
.check { width: 14px; height: 14px; border: 1.5px solid #333; display: inline-block; flex-shrink: 0; margin-top: 1px; }
.vocab-block { flex: 1; min-height: 0; display: flex; flex-direction: column; margin: 0.2em 0; }
.vocab-row {
  display: flex; gap: 7px; align-items: flex-start;
  padding: 2px 0; border-bottom: 1px dotted #ddd;
  break-inside: avoid;
}
.vocab-row .term { font-weight: 600; min-width: 0; }
.vocab-row .pl { color: #555; font-size: 9pt; }
.vocab-cols {
  column-count: 2; column-gap: 18px;
  flex: 1; min-height: 0;
}
.vocab-cols.dense { column-gap: 16px; }
.vocab-cols.dense .vocab-row { padding: 1.5px 0; font-size: 9.8pt; }
.mindmap {
  border: 2px dashed #012169; border-radius: 8px;
  background: repeating-linear-gradient(0deg, transparent, transparent 11mm, #eef1f6 11mm, #eef1f6 11.3mm);
  margin: 0.35em 0;
  min-height: 45mm;
}
.notes-area {
  border: 1px solid #bbb; border-radius: 4px;
  background: linear-gradient(#fff 23px, #e8ebf0 24px);
  background-size: 100% 24px;
  min-height: 18mm;
}
.line-field { border-bottom: 1px solid #999; min-height: 1.35em; margin: 0.25em 0; }
.planner-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; margin: 0.35em 0; }
.planner-grid {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px;
  font-size: 8pt; flex: 1; min-height: 0;
  grid-template-rows: auto repeat(5, 1fr);
}
.planner-grid .head { background: #012169; color: #fff; text-align: center; padding: 4px 2px; font-weight: 600; }
.planner-grid .cell { border: 1px solid #ccc; min-height: 11mm; padding: 2px 3px; }
.timeline { border-left: 3px solid #012169; padding-left: 12px; margin: 0.4em 0; }
.timeline.fill-grow {
  display: flex; flex-direction: column; justify-content: space-between;
  min-height: 0;
}
.timeline-item { margin-bottom: 0.5em; }
.timeline-item strong { color: #012169; }
.legend { font-size: 8.5pt; color: #666; flex-shrink: 0; }
.topic-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%;
  background: #012169; color: #fff; font-size: 9pt; font-weight: 700; margin-right: 6px;
}
.fill-grow { flex: 1 1 auto; min-height: 14mm; }
.fill-stack { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.fill-stack .notes-area,
.fill-stack .mindmap,
.fill-stack .box { flex: 1; min-height: 14mm; }
.compact-table td, .compact-table th { padding: 4px 6px; font-size: 9pt; }
.cover-stack { flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-height: 0; }
.cover-fields .line-field { min-height: 1.6em; margin-bottom: 0.35em; }
.checklist-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px;
  flex: 1; min-height: 0; align-content: space-between;
}
.checklist-grid p { margin: 0.18em 0; font-size: 9.8pt; }
@media print {
  a { color: inherit; text-decoration: none; }
  .no-print { display: none; }
  .page { height: 271mm; overflow: hidden; }
}
`.trim();
}

function footer(text) {
    return `<div class="footer">${escapeHtml(text)}</div>`;
}

function page(content, foot = `LingoSpark · Plan nauki E8 Angielski ${YEAR} · ${SITE}`) {
    return `<div class="page"><div class="page-body">${content}</div>${footer(foot)}</div>`;
}

function chunkEvenly(items, targetPerPage = 54) {
    if (!items.length) return [];
    const pageCount = Math.max(1, Math.ceil(items.length / targetPerPage));
    const base = Math.floor(items.length / pageCount);
    const extra = items.length % pageCount;
    const chunks = [];
    let index = 0;
    for (let page = 0; page < pageCount; page++) {
        const size = base + (page < extra ? 1 : 0);
        chunks.push(items.slice(index, index + size));
        index += size;
    }
    return chunks;
}

function coverPage(totalTerms) {
    return page(`
  <div class="banner"><strong>LingoSpark</strong><span>Plan nauki · E8 ${YEAR}</span></div>
  <div class="cover-stack">
    <div>
      <div class="kicker">Egzamin ósmoklasisty · English</div>
      <h1>Plan nauki<br>do egzaminu E8<br>z języka angielskiego</h1>
      <p class="meta">Grade-8 English exam study workbook · ${totalTerms} vocabulary items · 14 CKE topics</p>
      <p style="margin-top: 0.8em;">
        <span class="cover-badge">14 działów tematycznych</span>
        <span class="cover-badge">Checklisty słownictwa</span>
        <span class="cover-badge">Gramatyka i phrasal verbs</span>
        <span class="cover-badge">Mapy myśli i notatki</span>
        <span class="cover-badge">Harmonogram nauki</span>
      </p>
    </div>
    <div class="box cover-fields fill-grow">
      <p><strong>Imię i nazwisko:</strong></p>
      <div class="line-field"></div>
      <p><strong>Klasa / szkoła:</strong></p>
      <div class="line-field"></div>
      <p><strong>Data rozpoczęcia planu:</strong></p>
      <div class="line-field"></div>
      <p><strong>Planowany termin egzaminu:</strong></p>
      <div class="line-field"></div>
      <p><strong>Cel na egzamin (np. 80%+):</strong></p>
      <div class="line-field"></div>
      <p><strong>Nauczyciel / korepetytor (opcjonalnie):</strong></p>
      <div class="line-field"></div>
    </div>
    <div class="box fill-grow">
      <p><strong>Co znajdziesz w tym zeszycie</strong></p>
      <div class="grid-2" style="font-size:9.5pt;">
        <p><span class="check"></span> Tracker 14 działów CKE + harmonogram do maja ${YEAR}</p>
        <p><span class="check"></span> Checklisty gramatyki, phrasal verbs, pisanie, mówienie</p>
        <p><span class="check"></span> Mapy myśli i notatnik przy każdym dziale</p>
        <p><span class="check"></span> ${totalTerms} haseł ze skrótem PL do zaznaczania</p>
        <p><span class="check"></span> Kalendarze miesięczne i plan tygodniowy</p>
        <p><span class="check"></span> Powtórka końcowa przed egzaminem</p>
      </div>
      <p class="legend" style="margin-top:0.6em;">Wydrukuj cały zeszyt lub wybrane rozdziały. Zaznaczaj ☐ po opanowaniu hasła. Ćwicz słownictwo w darmowych grach na ${SITE}.</p>
    </div>
  </div>
`);
}

function howToUsePage() {
    return page(`
  <div class="banner"><strong>LingoSpark</strong><span>Jak korzystać z planu</span></div>
  <h2>Jak korzystać z tego planu</h2>
  <div class="grid-2">
    <div>
      <h3>1. Ustal harmonogram</h3>
      <p>Przejrzyj kalendarz i plan tygodniowy. Podziel 14 działów na okres do maja ${YEAR}. Zostaw czas na powtórki.</p>
      <h3>2. Ucz się tematycznie</h3>
      <p>Każdy dział ma stronę z mapą myśli, notatkami i checklistę haseł. Najpierw zrozum temat, potem ucz się słówek w kontekście zdań.</p>
      <h3>3. Zaznaczaj postępy</h3>
      <p>Po każdej powtórce zaznacz kwadracik przy haśle. Hasła trudne przepisz do „Słówka do powtórki”.</p>
    </div>
    <div>
      <h3>4. Ćwicz wszystkie umiejętności</h3>
      <p>E8 sprawdza: słuchanie, czytanie ze zrozumieniem, znajomość języka (gramatyka + słownictwo), pisanie i mówienie. Słownictwo to baza pod każdą część.</p>
      <h3>5. Powtarzaj regularnie</h3>
      <p>Wracaj do działów co 2–4 tygodnie. Ostatnie 6 tygodni przed egzaminem — intensywna powtórka wszystkich checklist.</p>
      <h3>6. Korzystaj z LingoSpark</h3>
      <p>Wklej listy haseł do gier słownictwa na ${SITE} (darmowe). Pisanie i zadania maturalne — w Writing Suite.</p>
    </div>
  </div>
  <h2>Struktura egzaminu E8 — angielski</h2>
  <table>
    <tr><th>Część</th><th>Co ćwiczyć</th><th>Moja ocena / notatki</th></tr>
    <tr><td><strong>1. Słuchanie</strong></td><td>rozpoznawanie szczegółów, głównej myśli, intencji mówiącego</td><td><div class="line-field"></div></td></tr>
    <tr><td><strong>2. Czytanie</strong></td><td>teksty informacyjne i narracyjne, dopasowanie, prawda/fałsz</td><td><div class="line-field"></div></td></tr>
    <tr><td><strong>3. Znajomość języka</strong></td><td>gramatyka, słowotwórstwo, kolokacje, phrasal verbs, słownictwo tematyczne</td><td><div class="line-field"></div></td></tr>
    <tr><td><strong>4. Pisanie</strong></td><td>email, notatka, opis, wypowiedź na forum — 80–100 słów</td><td><div class="line-field"></div></td></tr>
    <tr><td><strong>5. Mówienie</strong></td><td>odpowiedzi na pytania, opis obrazka, rozmowa w parach</td><td><div class="line-field"></div></td></tr>
  </table>
  <div class="fill-stack">
    <h3>Moje cele na ten rok szkolny</h3>
    <div class="notes-area fill-grow"></div>
  </div>
  <p class="legend">Źródło słownictwa: 14 modułów tematycznych z informatora CKE dla egzaminu ósmoklasisty.</p>
`);
}

function topicTrackerPage(packs) {
    const rows = packs
        .map(
            (p, i) =>
                `<tr><td>${i + 1}</td><td><strong>${escapeHtml(p.topicPl)}</strong><br><span class="meta">${escapeHtml(p.topicEn)}</span></td><td>${p.items.length}</td><td><span class="check"></span> nauka<br><span class="check"></span> powtórka 1<br><span class="check"></span> powtórka 2</td><td><div class="line-field"></div></td></tr>`
        )
        .join('');
    const total = packs.reduce((n, p) => n + p.items.length, 0);
    return page(`
  <div class="banner"><strong>LingoSpark</strong><span>Tracker działów</span></div>
  <h2>Tracker — 14 działów tematycznych</h2>
  <p>Łącznie <strong>${total}</strong> haseł. Zaznacz, kiedy skończysz naukę i dwie powtórki każdego działu.</p>
  <table>
    <tr><th>#</th><th>Dział</th><th>Haseł</th><th>Postęp</th><th>Data ukończenia</th></tr>
    ${rows}
  </table>
  <div class="fill-stack">
    <h3>Moje mocne strony</h3>
    <div class="notes-area fill-grow"></div>
    <h3>Do poprawy przed egzaminem</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`);
}

function timelinePage() {
    return [
        page(`
  <div class="banner"><strong>LingoSpark</strong><span>Harmonogram · plan pełny</span></div>
  <h2>Sugerowany harmonogram do maja ${YEAR}</h2>
  <p>Dopasuj tempo do swojego kalendarza. Tempo spokojne: ~2 działy miesięcznie + powtórki.</p>
  <div class="fill-stack">
    <div class="timeline fill-grow">
      <div class="timeline-item"><strong>Plan pełny (2 lata) — wrzesień 2025–maj ${YEAR}</strong> — ok. 2 działy miesięcznie + powtórki co kwartał. Idealny, jeśli zaczynasz w klasie 7.</div>
      <div class="timeline-item"><strong>Wrzesień–październik 2025</strong> — Człowiek, Miejsce zamieszkania. Present Simple / Continuous, Past Simple.</div>
      <div class="timeline-item"><strong>Listopad 2025–czerwiec 2026</strong> — Edukacja → Zdrowie (działy 3–11). Co miesiąc: słownictwo + 1 umiejętność (L/C/P/M).</div>
      <div class="timeline-item"><strong>Wrzesień–listopad 2026</strong> — Nauka i technika, Przyroda, Życie społeczne. Powtórka wszystkich checklist.</div>
      <div class="timeline-item"><strong>Grudzień 2026–styczeń 2027</strong> — Powtórka gramatyki, phrasal verbs, trudne hasła.</div>
      <div class="timeline-item"><strong>Luty–marzec 2027</strong> — Próbne arkusze CKE, słuchanie i czytanie.</div>
      <div class="timeline-item"><strong>Kwiecień–maj 2027</strong> — Ostatnia powtórka, spokój przed egzaminem.</div>
    </div>
    <h3>Mój własny plan — plan pełny (dopisz daty)</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`),
        page(`
  <div class="banner"><strong>LingoSpark</strong><span>Harmonogram · plan intensywny</span></div>
  <h2>Plan intensywny (start: wrzesień 2026 — egzamin maj ${YEAR})</h2>
  <p>Jeśli zaczynasz w klasie 8, trzymaj się tego tempa — po 2–3 działy miesięcznie plus powtórki.</p>
  <div class="fill-stack">
    <div class="timeline fill-grow">
      <div class="timeline-item"><strong>Wrzesień–październik 2026</strong> — Działy 1–4 + checklista gramatyki (czasy podstawowe).</div>
      <div class="timeline-item"><strong>Listopad–grudzień 2026</strong> — Działy 5–8 + modal verbs, conditionals.</div>
      <div class="timeline-item"><strong>Styczeń–luty 2027</strong> — Działy 9–14 + passive, reported speech, phrasal verbs.</div>
      <div class="timeline-item"><strong>Marzec–kwiecień 2027</strong> — Próbne arkusze, pisanie, mówienie.</div>
      <div class="timeline-item"><strong>Maj 2027</strong> — Powtórka lekka, sen, plan dnia egzaminu.</div>
    </div>
    <h3>Mój własny plan — plan intensywny (dopisz daty)</h3>
    <div class="notes-area fill-grow"></div>
    <h3>Legenda skrótów w kalendarzu</h3>
    <div class="box fill-grow">
      <div class="grid-2" style="font-size:9.5pt;">
        <p><strong>S</strong> — słownictwo (nowe hasła z checklisty)</p>
        <p><strong>G</strong> — gramatyka (ćwiczenia, reguły)</p>
        <p><strong>L</strong> — słuchanie (nagrania, arkusze)</p>
        <p><strong>C</strong> — czytanie ze zrozumieniem</p>
        <p><strong>P</strong> — pisanie (email, opis, forum)</p>
        <p><strong>M</strong> — mówienie (ustna odpowiedź, dialog)</p>
        <p><strong>R</strong> — powtórka wcześniejszych działów</p>
      </div>
    </div>
  </div>
`),
    ].join('');
}

function weeklyPlannerPage() {
    return page(`
  <div class="banner"><strong>LingoSpark</strong><span>Plan tygodniowy</span></div>
  <h2>Plan tygodniowy — szablon</h2>
  <p>W każdym tygodniu wybierz: 1 nowy dział (lub jego część), 1 powtórkę, 1 umiejętność (słuchanie / czytanie / pisanie / mówienie).</p>
  <table>
    <tr><th>Dzień</th><th>Co robię (15–30 min)</th><th>☐ zrobione</th></tr>
    <tr><td>Poniedziałek</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
    <tr><td>Wtorek</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
    <tr><td>Środa</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
    <tr><td>Czwartek</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
    <tr><td>Piątek</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
    <tr><td>Sobota</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
    <tr><td>Niedziela</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
  </table>
  <div class="fill-stack">
    <h3>Podsumowanie tygodnia</h3>
    <p>Nowe hasła: ______ &nbsp;|&nbsp; Powtórzone: ______ &nbsp;|&nbsp; Trudne słówka: ______</p>
    <div class="notes-area fill-grow"></div>
    <h3>Plan na następny tydzień</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`);
}

function monthlyPlannerPage(monthLabel) {
    return page(`
  <div class="banner"><strong>LingoSpark</strong><span>Kalendarz miesiąca</span></div>
  <h2>Kalendarz — ${escapeHtml(monthLabel)}</h2>
  <p>Wpisuj skróty: <strong>S</strong> słownictwo · <strong>G</strong> gramatyka · <strong>L</strong> słuchanie · <strong>C</strong> czytanie · <strong>P</strong> pisanie · <strong>M</strong> mówienie · <strong>R</strong> powtórka</p>
  <div class="planner-wrap fill-grow">
    <div class="planner-grid fill-grow">
      <div class="head">Pn</div><div class="head">Wt</div><div class="head">Śr</div><div class="head">Cz</div><div class="head">Pt</div><div class="head">So</div><div class="head">Nd</div>
      ${Array.from({ length: 35 }, () => '<div class="cell"></div>').join('')}
    </div>
  </div>
  <div class="fill-stack">
    <h3>Cele tego miesiąca</h3>
    <div class="notes-area fill-grow"></div>
    <h3>Co poszło dobrze / co poprawić</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`);
}

function topicIntroPage(index, pack) {
    return page(`
  <div class="banner"><strong>LingoSpark</strong><span>Dział ${index + 1} / 14</span></div>
  <h2><span class="topic-num">${index + 1}</span>${escapeHtml(pack.topicPl)} <span class="meta">/ ${escapeHtml(pack.topicEn)}</span></h2>
  <p class="meta">${pack.items.length} haseł · poziom ${escapeHtml(pack.level || 'A2–B1')}</p>
  <div class="fill-stack">
    <h3>Mapa myśli — dopisz skojarzenia, podtematy, przykłady</h3>
    <div class="mindmap fill-grow"></div>
    <div class="grid-2 fill-stack">
      <div>
        <h3>Notatki z lekcji</h3>
        <div class="notes-area fill-grow"></div>
      </div>
      <div>
        <h3>Frazy / kolokacje do zapamiętania</h3>
        <div class="notes-area fill-grow"></div>
      </div>
    </div>
    <h3>Słówka trudne — przepisz z checklisty</h3>
    <div class="notes-area fill-grow"></div>
    <p class="legend">Następna strona: checklista słownictwa. Zaznacz ☐ gdy potrafisz użyć hasła w zdaniu.</p>
  </div>
`, `${index + 1}. ${pack.topicPl} · LingoSpark E8 ${YEAR}`);
}

function vocabChecklistPages(index, pack) {
    const chunks = chunkEvenly(pack.items, 54);
    return chunks
        .map((chunk, chunkIndex) => {
            const part = chunkIndex + 1;
            const parts = chunks.length;
            const dense = chunk.length >= 50 ? ' dense' : '';
            const rows = chunk
                .map(
                    (item) =>
                        `<div class="vocab-row"><span class="check"></span><div><span class="term">${escapeHtml(item.term)}</span> — <span class="pl">${escapeHtml(item.definitionPl)}</span></div></div>`
                )
                .join('');
            return page(`
  <div class="banner"><strong>LingoSpark</strong><span>${escapeHtml(pack.topicPl)} · słownictwo</span></div>
  <h2><span class="topic-num">${index + 1}</span>${escapeHtml(pack.topicPl)} — checklista ${part}/${parts}</h2>
  <p class="legend">Zaznacz kwadracik, gdy znasz znaczenie i potrafisz użyć hasła w zdaniu.</p>
  <div class="vocab-block fill-grow">
    <div class="vocab-cols${dense}">${rows}</div>
  </div>
  <div class="fill-stack">
    <h3>Szybkie notatki / trudne hasła z tej strony</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`, `${index + 1}. ${pack.topicPl} · checklist ${part}/${parts}`);
        })
        .join('');
}

function grammarCheckItem(label, hint = '') {
    const hintHtml = hint ? `<br><span class="meta">${escapeHtml(hint)}</span>` : '';
    return `<tr><td><span class="check"></span></td><td><strong>${escapeHtml(label)}</strong>${hintHtml}</td><td><div class="line-field"></div></td></tr>`;
}

function grammarOverviewPage() {
    const items = [
        ['Present Simple — czynności, fakty, nawyki', 'I play tennis every week.'],
        ['Present Continuous — teraz, tymczasowe', 'She is doing her homework now.'],
        ['Past Simple — przeszłość (regular + irregular)', 'We visited London last year.'],
        ['Past Continuous — tło w przeszłości', 'It was raining when we left.'],
        ['Present Perfect — doświadczenie, skutek teraz', 'I have never been to Scotland.'],
        ['Future: will — decyzja, obietnica, przewidywanie', 'I will help you.'],
        ['Future: be going to — plan, dowód', 'We are going to travel in July.'],
        ['Modal verbs: can / could / be able to', 'She can swim. / I could run faster.'],
        ['Modal verbs: must / mustn\'t / have to / don\'t have to', 'You must wear a uniform.'],
        ['Modal verbs: should / shouldn\'t', 'You should revise more.'],
        ['Modal verbs: may / might (możliwość)', 'It might rain tomorrow.'],
        ['Zero conditional — prawda ogólna', 'If you heat ice, it melts.'],
        ['First conditional — realna przyszłość', 'If it rains, we will stay at home.'],
        ['Second conditional — hipotetycznie', 'If I had money, I would buy a bike.'],
        ['Passive voice — Present / Past Simple', 'English is spoken here. / The letter was sent.'],
        ['Reported speech — twierdzenia i pytania', 'He said (that) he was tired.'],
        ['Relative clauses — who, which, that, where', 'The girl who sits next to me…'],
        ['Comparatives & superlatives', 'taller, more interesting, the best'],
        ['Articles: a / an / the / zero article', 'a book, the sun, go to school'],
        ['Countable & uncountable — some, any, much, many', 'How much sugar? How many apples?'],
        ['Prepositions of time & place', 'in July, on Monday, at school, in the park'],
        ['Question forms — Wh- i Yes/No', 'Where do you live? Do you like…?'],
        ['Gerund vs infinitive', 'enjoy doing / want to do'],
        ['Reflexive pronouns', 'myself, yourself, himself…'],
        ['So / neither — zgoda', 'I like pizza. So do I. / Neither do I.'],
        ['There is / There are', 'There are two books on the desk.'],
        ['Imperatives & suggestions', 'Open the window. / Let\'s go. / Why don\'t we…?'],
        ['Word formation — prefiksy i sufiksy', 'unhappy, rewrite, teacher, quickly'],
        ['Linkers — because, so, although, however', 'I stayed because I was tired.'],
        ['Phrasal verbs — najczęstsze', 'get up, look after, turn on/off…'],
    ];
    const midpoint = Math.ceil(items.length / 2);
    const renderPart = (partItems, part, parts) => page(`
  <div class="banner"><strong>LingoSpark</strong><span>Gramatyka · część ${part}/${parts}</span></div>
  <h2>Checklista gramatyki — egzamin E8 (${part}/${parts})</h2>
  <p>Zaznacz ☐, gdy potrafisz użyć struktury w zdaniu i rozpoznać ją w zadaniu.</p>
  <table class="compact-table">
    <tr><th style="width:28px">☐</th><th>Obszar</th><th>Moja notatka / przykład</th></tr>
    ${partItems.map(([label, hint]) => grammarCheckItem(label, hint)).join('')}
  </table>
  <div class="fill-stack">
    <h3>Notatki — gramatyka (strona ${part})</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`);
    const first = items.slice(0, midpoint);
    const second = items.slice(midpoint);
    return renderPart(first, 1, 2) + renderPart(second, 2, 2);
}

function grammarDetailPage(title, rows) {
    const tableRows = rows
        .map(([label, hint]) => grammarCheckItem(label, hint))
        .join('');
    return page(`
  <div class="banner"><strong>LingoSpark</strong><span>Gramatyka — szczegóły</span></div>
  <h2>${escapeHtml(title)}</h2>
  <table class="compact-table">
    <tr><th style="width:28px">☐</th><th>Struktura / zasada</th><th>Przykład / notatka</th></tr>
    ${tableRows}
  </table>
  <div class="fill-stack">
    <h3>Notatki</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`);
}

function grammarPages() {
    return [
        grammarOverviewPage(),
        grammarDetailPage('Czasowniki — formy i użycie', [
            ['Present Simple — 3. os. l.poj. -s/-es', 'He watches TV every day.'],
            ['Present Simple — przeczenia do/does + not', "She doesn't like maths."],
            ['Present Simple — pytania do/does', 'Do you play football?'],
            ['Present Continuous — am/is/are + -ing', 'They are waiting for the bus.'],
            ['Past Simple — regular (-ed)', 'We finished the test yesterday.'],
            ['Past Simple — irregular (learn list)', 'go → went, see → saw, have → had'],
            ['Past Continuous — was/were + -ing', 'I was reading when you called.'],
            ['Present Perfect — have/has + past participle', 'She has already done it.'],
            ['Present Perfect — ever / never / just / yet', 'Have you ever tried sushi?'],
            ['Future will — I think it will be sunny.', ''],
            ["Future going to — We're going to meet at six.", ''],
            ['Used to — dawniej (nawyk)', 'I used to live in the countryside.'],
        ]),
        grammarDetailPage('Modal verbs, strona bierna, mowa zależna', [
            ['can — umiejętność / pozwolenie', 'Can I open the window?'],
            ['could — umiejętność w przeszłości / grzeczna prośba', 'Could you help me?'],
            ['must — obowiązek / silna rada', 'You must be quiet in the library.'],
            ["mustn't — zakaz", "You mustn't run in the corridor."],
            ['have to — zewnętrzny obowiązek', 'I have to wear a uniform.'],
            ["don't have to — brak obowiązku", "You don't have to come if you're ill."],
            ['should — rada', 'You should drink more water.'],
            ['Passive — am/is/are + past participle', 'The room is cleaned every day.'],
            ['Passive — was/were + past participle', 'The window was broken.'],
            ['Reported speech — backshift czasów', 'She said she was busy.'],
            ['Reported questions — word order', 'He asked where I lived.'],
            ['Reported commands — tell + to infinitive', 'She told me to sit down.'],
        ]),
        grammarDetailPage('Zdania złożone, słownictwo gramatyczne', [
            ['Relative who — osoby', 'The man who called is my uncle.'],
            ['Relative which — rzeczy', 'The film which we saw was great.'],
            ['Relative where — miejsce', 'This is the school where I study.'],
            ['Comparative — -er / more + adj', 'This book is more interesting.'],
            ['Superlative — the -est / the most', 'She is the tallest in the class.'],
            ['as…as — równanie', 'He is as tall as his brother.'],
            ['too + adj — za bardzo', 'The soup is too hot.'],
            ['enough + noun / adj + enough', 'We have enough time.'],
            ['some — twierdzenie; any — pytania i przeczenia', ''],
            ['a lot of / lots of — oba typy rzeczowników', ''],
            ['Phrasal verb — rozdzielny vs nierozdzielny', 'turn on the light / turn it on'],
            ['Collocations — make/do, have/take', 'make a mistake, do homework'],
        ]),
        page(`
  <div class="banner"><strong>LingoSpark</strong><span>Phrasal verbs</span></div>
  <h2>Phrasal verbs — checklista E8</h2>
  <p>Najczęstsze czasowniki z partykułą. Zaznacz, gdy znasz znaczenie i potrafisz użyć w zdaniu.</p>
  <div class="vocab-block fill-grow">
    <div class="vocab-cols dense">
    ${[
        ['get up', 'wstawać'],
        ['get on with', 'dogadywać się z'],
        ['get dressed', 'ubierać się'],
        ['get changed', 'przebierać się'],
        ['look after', 'opiekować się'],
        ['look for', 'szukać'],
        ['look like', 'wyglądać jak'],
        ['take after', 'odziedziczyć cechy po'],
        ['turn on / off', 'włączać / wyłączać'],
        ['put on / take off', 'zakładać / zdejmować (ubranie)'],
        ['pick up', 'podnosić; odebrać (kogoś)'],
        ['give up', 'rezygnować z'],
        ['find out', 'dowiedzieć się'],
        ['fill in', 'wypełniać (formularz)'],
        ['hang out', 'spędzać czas'],
        ['stay in', 'zostać w domu'],
        ['go out', 'wyjść (towarzysko)'],
        ['run out of', 'zabraknąć (czegoś)'],
        ['take out', 'wyciągać; wynosić (śmieci)'],
        ['wake up', 'budzić się'],
        ['grow up', 'dorastać'],
        ['bring up', 'wychowywać'],
        ['set off', 'wyruszyć (w podróż)'],
        ['check in', 'melować się (hotel)'],
        ['check out', 'wymeldować się'],
        ['work out', 'ćwiczyć; rozwiązać (problem)'],
        ['try on', 'przymierzać (ubranie)'],
        ['pay for', 'płacić za'],
        ['look forward to', 'nie móc się doczekać'],
        ['fall out', 'pokłócić się'],
        ['make up', 'pogodzić się'],
    ]
        .map(
            ([term, pl]) =>
                `<div class="vocab-row"><span class="check"></span><div><span class="term">${escapeHtml(term)}</span> — <span class="pl">${escapeHtml(pl)}</span></div></div>`
        )
        .join('')}
    </div>
  </div>
  <div class="fill-stack">
    <h3>Własne phrasal verbs z lekcji / testów</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`),
        page(`
  <div class="banner"><strong>LingoSpark</strong><span>Pisanie i mówienie</span></div>
  <h2>Checklista — pisanie (część 4)</h2>
  <table>
    <tr><th style="width:28px">☐</th><th>Typ tekstu</th><th>Co pamiętać</th></tr>
    ${grammarCheckItem('Email — powitanie i pożegnanie', 'Dear… / Best wishes,')}
    ${grammarCheckItem('Email — cel wiadomości na początku', 'I am writing to…')}
    ${grammarCheckItem('Notatka / wiadomość krótka', 'krótko, konkretnie')}
    ${grammarCheckItem('Opis (osoby, miejsca, wydarzenia)', 'Present Simple/Continuous, adj')}
    ${grammarCheckItem('Wypowiedź na forum / blog', '80–100 słów, akapity')}
    ${grammarCheckItem('Linkery w piśmie', 'first, then, however, because')}
    ${grammarCheckItem('Poprawna interpunkcja (. , ? !)', '')}
    ${grammarCheckItem('Liczę słowa — nie za krótko, nie za długo', 'cel: 80–100 słów')}
  </table>
  <h2>Checklista — mówienie (część 5)</h2>
  <table>
    <tr><th style="width:28px">☐</th><th>Umiejętność</th><th>Notatka</th></tr>
    ${grammarCheckItem('Odpowiedzi na pytania egzaminatora', 'pełne zdania, nie jedno słowo')}
    ${grammarCheckItem('Opis obrazka / zdjęcia', 'There is/are, present continuous')}
    ${grammarCheckItem('Rozmowa w parach — zadawanie pytań', 'Wh- questions')}
    ${grammarCheckItem('Wyrażanie opinii', 'I think… / In my opinion…')}
    ${grammarCheckItem('Uzasadnianie', 'because, so, that\'s why')}
    ${grammarCheckItem('Pytania do rozmówcy', 'What about you? / Do you agree?')}
  </table>
  <div class="fill-stack">
    <h3>Notatki — pisanie i mówienie</h3>
    <div class="notes-area fill-grow"></div>
    <h3>Przykładowe zdania / szablony do zapamiętania</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`),
        page(`
  <div class="banner"><strong>LingoSpark</strong><span>Mapa myśli — gramatyka</span></div>
  <h2>Mapa myśli — gramatyka (własna)</h2>
  <p>Połącz czasy, modal verbs, zdania warunkowe i inne tematy. Dopisz przykłady z lekcji.</p>
  <div class="fill-stack">
    <div class="mindmap fill-grow"></div>
    <h3>Notatki ogólne</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`),
    ].join('');
}

function reviewPages(packs) {
    const total = packs.reduce((n, p) => n + p.items.length, 0);
    const tracker = page(`
  <div class="banner"><strong>LingoSpark</strong><span>Powtórka końcowa</span></div>
  <h2>Powtórka przed egzaminem — tracker działów</h2>
  <p>Na 4–6 tygodni przed egzaminem przejdź wszystkie checklisty jeszcze raz. Zostaw tylko te hasła, przy których kwadracik jest pusty.</p>
  <table class="compact-table">
    <tr><th>Dział</th><th>Haseł</th><th>☐ powtórka I</th><th>☐ powtórka II</th><th>☐ gotowe</th></tr>
    ${packs
        .map(
            (p) =>
                `<tr><td>${escapeHtml(p.topicPl)}</td><td>${p.items.length}</td><td><span class="check"></span></td><td><span class="check"></span></td><td><span class="check"></span></td></tr>`
        )
        .join('')}
  </table>
  <div class="fill-stack">
    <h3>Plan dnia egzaminu</h3>
    <div class="box fill-grow">
      <p><span class="check"></span> Spakować długopis, dokumenty, wodę</p>
      <p><span class="check"></span> Wyspać się — powtórka lekkich haseł rano, bez paniki</p>
      <p><span class="check"></span> Przeczytać polecenia dokładnie (słuchanie — najpierw zapoznanie z pytaniami)</p>
      <p><span class="check"></span> Zostawić 5 minut na sprawdzenie odpowiedzi w części językowej</p>
      <p><span class="check"></span> W części ustnej: mów wyraźnie, pełnymi zdaniami</p>
    </div>
    <h3>Ostatnie notatki przed egzaminem</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`);
    const mustKnow = page(`
  <div class="banner"><strong>LingoSpark</strong><span>Powtórka końcowa</span></div>
  <h2>Lista „must know” — 30 najważniejszych haseł</h2>
  <p>Wybierz hasła z checklist, które musisz znać na pewno. Powtarzaj je co 2–3 dni.</p>
  <div class="checklist-grid fill-grow">
    ${Array.from({ length: 30 }, (_, i) => `<p>${i + 1}. <span class="line-field" style="display:inline-block;width:82%;"></span></p>`).join('')}
  </div>
  <div class="fill-stack">
    <h3>Gramatyka — ostatnia powtórka (5 punktów)</h3>
    <div class="grid-2">
      <p>1. <span class="line-field" style="display:inline-block;width:80%;"></span></p>
      <p>2. <span class="line-field" style="display:inline-block;width:80%;"></span></p>
      <p>3. <span class="line-field" style="display:inline-block;width:80%;"></span></p>
      <p>4. <span class="line-field" style="display:inline-block;width:80%;"></span></p>
      <p>5. <span class="line-field" style="display:inline-block;width:80%;"></span></p>
      <p>6. <span class="line-field" style="display:inline-block;width:80%;"></span></p>
    </div>
    <h3>Moja ocena gotowości (1–10) i dlaczego</h3>
    <div class="notes-area fill-grow"></div>
    <p class="legend">Łącznie ${total} haseł w tym planie · Powodzenia! · ${SITE}</p>
  </div>
`);
    return tracker + mustKnow;
}

function buildHtml(packs) {
    const totalTerms = packs.reduce((n, p) => n + p.items.length, 0);
    const months = [
        'Wrzesień 2025',
        'Październik 2025',
        'Listopad 2025',
        'Grudzień 2025',
        'Styczeń 2026',
        'Luty 2026',
        'Marzec 2026',
        'Kwiecień 2026',
        'Maj 2026',
        'Czerwiec 2026',
        'Wrzesień 2026',
        'Październik 2026',
        'Listopad 2026',
        'Grudzień 2026',
        'Styczeń 2027',
        'Luty 2027',
        'Marzec 2027',
        'Kwiecień 2027',
        'Maj 2027',
    ];
    const topicPages = packs
        .map((pack, i) => topicIntroPage(i, pack) + vocabChecklistPages(i, pack))
        .join('');

    const body = [
        coverPage(totalTerms),
        howToUsePage(),
        topicTrackerPage(packs),
        timelinePage(),
        weeklyPlannerPage(),
        grammarPages(),
        ...months.map((m) => monthlyPlannerPage(m)),
        topicPages,
        reviewPages(packs),
    ].join('\n');

    return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<title>Plan nauki E8 Angielski ${YEAR} — LingoSpark</title>
<style>${css()}</style>
</head>
<body>
${body}
</body>
</html>`;
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
        { encoding: 'utf8', timeout: 120000 }
    );
    if (result.status !== 0) {
        throw new Error(`PDF failed: ${result.stderr || result.stdout || result.status}`);
    }
}

const packs = loadE8Packs();
const totalTerms = packs.reduce((n, p) => n + p.items.length, 0);
fs.mkdirSync(OUT_DIR, { recursive: true });

const htmlPath = path.join(OUT_DIR, 'E8-2027-study-plan.html');
const pdfPath = path.join(OUT_DIR, 'E8-2027-study-plan.pdf');
const readmePath = path.join(OUT_DIR, 'README.txt');

fs.writeFileSync(htmlPath, buildHtml(packs), 'utf8');
fs.writeFileSync(
    readmePath,
    `LingoSpark — Plan nauki E8 Angielski ${YEAR}
============================================

Pliki:
  E8-2027-study-plan.pdf   — gotowy PDF do druku
  E8-2027-study-plan.html  — wersja HTML (Ctrl+P → Zapisz jako PDF)

Zawartość:
  - 14 działów tematycznych CKE (${totalTerms} haseł ze checklistami)
  - checklisty gramatyki, phrasal verbs, pisanie i mówienie
  - mapy myśli, notatki, plan tygodniowy i kalendarze miesięczne
  - harmonogram do maja ${YEAR} (plan pełny + intensywny)
  - tracker postępów i powtórka końcowa

Generuj ponownie: node packs/build-study-plan.mjs
Gry słownictwa: ${SITE}
`,
    'utf8'
);

console.log(`Study plan HTML → ${htmlPath}`);
console.log(`  ${packs.length} topics, ${totalTerms} vocabulary items`);

const browser = findBrowser();
if (browser) {
    htmlToPdf(browser, htmlPath, pdfPath);
    const sizeKb = Math.round(fs.statSync(pdfPath).size / 1024);
    console.log(`Study plan PDF  → ${pdfPath} (${sizeKb} KB)`);
} else {
    console.log('No Chrome/Edge — open the HTML and print to PDF (Ctrl+P).');
}
