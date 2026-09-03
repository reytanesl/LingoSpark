/**
 * Build Matura Extended (rozszerzona) 2027 student study plan — English
 *   node packs/build-matura-pr-study-plan.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const OUT_DIR = path.join(__dirname, 'dist', 'matura-pr-2027-study-plan');
const SITE = 'https://lingospark.study';
const YEAR = 2027;
const FOOT = `LingoSpark · Matura Extended English study plan ${YEAR} · ${SITE}`;

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

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function loadPrPacks() {
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith('matura-pr-') && f.endsWith('.json'));
    const packs = files.map((filename) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8')));
    const ordered = PR_ORDER.map((id) => packs.find((p) => p.id === id)).filter(Boolean);
    if (ordered.length !== 14) {
        throw new Error(`Expected 14 Matura PR packs, found ${ordered.length}`);
    }
    return ordered;
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
  border-radius: 8px;
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
  border-radius: 6px;
}
.box {
  border: 1px solid #012169; background: #f7f8fb;
  padding: 8px 10px; margin: 0.45em 0;
  border-radius: 8px;
}
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
.grid-2.fill-stack { flex: 1; min-height: 0; align-content: stretch; }
.grid-2.fill-stack > div { display: flex; flex-direction: column; min-height: 0; }
table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: 0.35em 0 0.5em;
  font-size: 9.5pt;
  border: 1px solid #cfcfcf;
  border-radius: 8px;
  overflow: hidden;
}
th, td {
  border: none;
  border-bottom: 1px solid #e4e4e4;
  border-right: 1px solid #e4e4e4;
  padding: 5px 7px;
  vertical-align: top;
}
tr th:last-child, tr td:last-child { border-right: none; }
tbody tr:last-child td, thead tr:last-child th,
table tr:last-child td, table tr:last-child th { border-bottom: none; }
th { background: #F4F5F7; color: #012169; text-align: left; }
.check {
  width: 14px; height: 14px; border: 1.5px solid #333;
  display: inline-block; flex-shrink: 0; margin-top: 1px;
  border-radius: 3px;
}
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
  border: 1px solid #bbb; border-radius: 8px;
  background: linear-gradient(#fff 23px, #e8ebf0 24px);
  background-size: 100% 24px;
  min-height: 18mm;
}
.line-field { border-bottom: 1px solid #999; min-height: 1.35em; margin: 0.25em 0; }
.planner-wrap {
  flex: 1; min-height: 0; display: flex; flex-direction: column; margin: 0.35em 0;
  border: 1px solid #ccc; border-radius: 8px; overflow: hidden;
}
.planner-grid {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 0;
  font-size: 8pt; flex: 1; min-height: 0;
  grid-template-rows: auto repeat(5, 1fr);
}
.planner-grid .head { background: #012169; color: #fff; text-align: center; padding: 4px 2px; font-weight: 600; }
.planner-grid .cell { border: 1px solid #ddd; border-top: none; border-left: none; min-height: 11mm; padding: 2px 3px; }
.planner-grid .head { border: none; border-right: 1px solid rgba(255,255,255,0.15); }
.planner-grid .head:nth-child(7n) { border-right: none; }
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
.tracker-progress { white-space: nowrap; font-size: 9pt; }
.tracker-progress .check { margin-right: 2px; }
.tracker-table td, .tracker-table th { padding: 3px 6px; font-size: 9pt; line-height: 1.3; }
.tracker-table .line-field { min-height: 1.1em; margin: 0; }
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

function page(content, foot = FOOT) {
    return `<div class="page"><div class="page-body">${content}</div><div class="footer">${escapeHtml(foot)}</div></div>`;
}

function chunkEvenly(items, targetPerPage = 56) {
    if (!items.length) return [];
    const pageCount = Math.max(1, Math.ceil(items.length / targetPerPage));
    const base = Math.floor(items.length / pageCount);
    const extra = items.length % pageCount;
    const chunks = [];
    let index = 0;
    for (let n = 0; n < pageCount; n++) {
        const size = base + (n < extra ? 1 : 0);
        chunks.push(items.slice(index, index + size));
        index += size;
    }
    return chunks;
}

function coverPage(totalTerms) {
    return page(`
  <div class="banner"><strong>LingoSpark</strong><span>Study plan · Matura Extended ${YEAR}</span></div>
  <div class="cover-stack">
    <div>
      <div class="kicker">Polish Matura · extended English · B2</div>
      <h1>Study plan<br>for Matura Extended<br>English</h1>
      <p class="meta">Printable workbook · ${totalTerms} vocabulary items · 14 CKE topics · CEFR B2</p>
      <p style="margin-top: 0.8em;">
        <span class="cover-badge">14 CKE topics</span>
        <span class="cover-badge">Vocabulary checklists</span>
        <span class="cover-badge">B2 grammar &amp; Use of English</span>
        <span class="cover-badge">Mind maps &amp; notes</span>
        <span class="cover-badge">Study schedule</span>
      </p>
    </div>
    <div class="box cover-fields fill-grow">
      <p><strong>Full name:</strong></p>
      <div class="line-field"></div>
      <p><strong>Class / school:</strong></p>
      <div class="line-field"></div>
      <p><strong>Date I started this plan:</strong></p>
      <div class="line-field"></div>
      <p><strong>Exam date (written / oral):</strong></p>
      <div class="line-field"></div>
      <p><strong>Target result (e.g. 80%+ / a university course):</strong></p>
      <div class="line-field"></div>
      <p><strong>Teacher / tutor (optional):</strong></p>
      <div class="line-field"></div>
    </div>
    <div class="box fill-grow">
      <p><strong>What is in this workbook</strong></p>
      <div class="grid-2" style="font-size:9.5pt;">
        <p><span class="check"></span> Tracker for 14 CKE topics + a schedule to May ${YEAR}</p>
        <p><span class="check"></span> Grammar, word formation, phrasal verbs, writing, speaking</p>
        <p><span class="check"></span> A mind map and notes page for every topic</p>
        <p><span class="check"></span> ${totalTerms} ENG–PL terms with tick boxes</p>
        <p><span class="check"></span> Monthly calendars and a weekly template</p>
        <p><span class="check"></span> Final revision before the exam</p>
      </div>
      <p class="legend" style="margin-top:0.6em;">Print the whole booklet or selected chapters. Tick ☐ when you can use a term in a sentence. Practise vocab in the free games at ${SITE}.</p>
    </div>
  </div>
`);
}

function howToUsePage() {
    return page(`
  <div class="banner"><strong>LingoSpark</strong><span>How to use this plan</span></div>
  <h2>How to use this plan</h2>
  <div class="grid-2">
    <div>
      <h3>1. Set a schedule</h3>
      <p>Look at the calendars and the weekly template. Spread the 14 topics across the time you have until May ${YEAR}. Leave weeks for revision.</p>
      <h3>2. Learn by topic</h3>
      <p>Each CKE module has a mind-map page, notes, and a vocabulary checklist. Understand the theme first, then learn words in example sentences.</p>
      <h3>3. Track progress</h3>
      <p>After each review, tick the box next to a term. Copy stubborn items onto “Words to revisit”.</p>
    </div>
    <div>
      <h3>4. Train every paper</h3>
      <p>Matura Extended tests listening, reading, Use of English, a 200–250-word text, and a spoken exam. Vocabulary supports every part.</p>
      <h3>5. Review on a cycle</h3>
      <p>Return to each topic every 2–4 weeks. In the last six weeks, go through every checklist again.</p>
      <h3>6. Use LingoSpark</h3>
      <p>Paste ENG–PL lists into the free vocab games at ${SITE}. Longer writing practice lives in Writing Suite.</p>
    </div>
  </div>
  <h2>Matura Extended English — exam map</h2>
  <table>
    <tr><th>Paper</th><th>What to practise</th><th>My notes / score</th></tr>
    <tr><td><strong>1. Listening</strong></td><td>main idea, detail, speaker’s attitude, matching, multiple choice</td><td><div class="line-field"></div></td></tr>
    <tr><td><strong>2. Reading</strong></td><td>longer texts, matching headings, true/false/not given, multiple matching</td><td><div class="line-field"></div></td></tr>
    <tr><td><strong>3. Use of English</strong></td><td>word formation, transformations, cloze, collocations, B2 grammar</td><td><div class="line-field"></div></td></tr>
    <tr><td><strong>4. Writing</strong></td><td>opinion / for-and-against essay, article, formal letter, review — about 200–250 words</td><td><div class="line-field"></div></td></tr>
    <tr><td><strong>5. Speaking</strong></td><td>warm-up, picture description, follow-up questions, a longer turn on a stimulus</td><td><div class="line-field"></div></td></tr>
  </table>
  <div class="fill-stack">
    <h3>My goals for this school year</h3>
    <div class="notes-area fill-grow"></div>
  </div>
  <p class="legend">Vocabulary source: 14 thematic modules from the CKE informator for Matura (extended level). Lists are B2, not the Grade-8 packs.</p>
`);
}

function trackerRow(p, index) {
    return `<tr><td>${index + 1}</td><td><strong>${escapeHtml(p.topicEn)}</strong> <span class="meta">/ ${escapeHtml(p.topicPl)}</span></td><td>${p.items.length}</td><td class="tracker-progress"><span class="check"></span> learn · <span class="check"></span> r1 · <span class="check"></span> r2</td><td><div class="line-field"></div></td></tr>`;
}

function topicTrackerPage(packs) {
    const total = packs.reduce((n, p) => n + p.items.length, 0);
    const midpoint = Math.ceil(packs.length / 2);
    const firstHalf = packs.slice(0, midpoint);
    const secondHalf = packs.slice(midpoint);
    const header = `<tr><th>#</th><th>Topic</th><th>Terms</th><th>Progress</th><th>Date finished</th></tr>`;
    return (
        page(`
  <div class="banner"><strong>LingoSpark</strong><span>Topic tracker · 1/2</span></div>
  <h2>Tracker — 14 CKE topics (1/2)</h2>
  <p>Altogether <strong>${total}</strong> terms. Tick: learn · review 1 (r1) · review 2 (r2).</p>
  <table class="tracker-table">
    ${header}
    ${firstHalf.map((p, i) => trackerRow(p, i)).join('')}
  </table>
  <div class="fill-stack">
    <h3>Notes — topics 1–${midpoint}</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`) +
        page(`
  <div class="banner"><strong>LingoSpark</strong><span>Topic tracker · 2/2</span></div>
  <h2>Tracker — 14 CKE topics (2/2)</h2>
  <p>When every topic is ticked, go back to the revision schedule.</p>
  <table class="tracker-table">
    ${header}
    ${secondHalf.map((p, i) => trackerRow(p, midpoint + i)).join('')}
  </table>
  <div class="fill-stack">
    <h3>My strengths</h3>
    <div class="notes-area fill-grow"></div>
    <h3>What to fix before the exam</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`)
    );
}

function timelinePage() {
    return [
        page(`
  <div class="banner"><strong>LingoSpark</strong><span>Schedule · full plan</span></div>
  <h2>Suggested schedule to May ${YEAR}</h2>
  <p>Adjust the pace to your calendar. Calm pace: about two topics a month plus reviews.</p>
  <div class="fill-stack">
    <div class="timeline fill-grow">
      <div class="timeline-item"><strong>Full plan (two years) — September 2025–May ${YEAR}</strong> — about two topics a month and a quarterly review. Best if you start in the second-to-last year of liceum.</div>
      <div class="timeline-item"><strong>September–October 2025</strong> — People; Home and living. Review all tenses; start a word-formation notebook.</div>
      <div class="timeline-item"><strong>November 2025–June 2026</strong> — Education → Health (topics 3–11). Each month: vocabulary + one paper (L / Rd / W / Sp).</div>
      <div class="timeline-item"><strong>September–November 2026</strong> — Science and technology; Nature; The state and society. Recycle every checklist.</div>
      <div class="timeline-item"><strong>December 2026–January 2027</strong> — Grammar, transformations, phrasal verbs, stubborn terms.</div>
      <div class="timeline-item"><strong>February–March 2027</strong> — CKE sample papers: listening, reading, Use of English.</div>
      <div class="timeline-item"><strong>April–May 2027</strong> — Light revision, timed writing, speaking sets. Stay calm.</div>
    </div>
    <h3>My own dates — full plan</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`),
        page(`
  <div class="banner"><strong>LingoSpark</strong><span>Schedule · intensive plan</span></div>
  <h2>Intensive plan (start September 2026 — exam May ${YEAR})</h2>
  <p>If you are in the final year, keep this pace: two to three topics a month plus reviews.</p>
  <div class="fill-stack">
    <div class="timeline fill-grow">
      <div class="timeline-item"><strong>September–October 2026</strong> — Topics 1–4 + tense review (including perfect and continuous forms).</div>
      <div class="timeline-item"><strong>November–December 2026</strong> — Topics 5–8 + conditionals, wish, passives.</div>
      <div class="timeline-item"><strong>January–February 2027</strong> — Topics 9–14 + reported speech, inversion light, word formation.</div>
      <div class="timeline-item"><strong>March–April 2027</strong> — Sample papers, 200–250-word texts, speaking sets.</div>
      <div class="timeline-item"><strong>May 2027</strong> — Light review, sleep, exam-day plan.</div>
    </div>
    <h3>My own dates — intensive plan</h3>
    <div class="notes-area fill-grow"></div>
    <h3>Calendar codes</h3>
    <div class="box fill-grow">
      <div class="grid-2" style="font-size:9.5pt;">
        <p><strong>V</strong> — vocabulary (new checklist terms)</p>
        <p><strong>G</strong> — grammar / Use of English</p>
        <p><strong>L</strong> — listening</p>
        <p><strong>Rd</strong> — reading</p>
        <p><strong>W</strong> — writing (200–250 words)</p>
        <p><strong>Sp</strong> — speaking</p>
        <p><strong>Rev</strong> — review of earlier topics</p>
      </div>
    </div>
  </div>
`),
    ].join('');
}

function weeklyPlannerPage() {
    return page(`
  <div class="banner"><strong>LingoSpark</strong><span>Weekly plan</span></div>
  <h2>Weekly plan — template</h2>
  <p>Each week choose: one new topic (or part of one), one review, and one paper skill (listening / reading / writing / speaking).</p>
  <table>
    <tr><th>Day</th><th>What I will do (20–40 min)</th><th>☐ done</th></tr>
    <tr><td>Monday</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
    <tr><td>Tuesday</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
    <tr><td>Wednesday</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
    <tr><td>Thursday</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
    <tr><td>Friday</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
    <tr><td>Saturday</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
    <tr><td>Sunday</td><td><div class="line-field"></div></td><td><span class="check"></span></td></tr>
  </table>
  <div class="fill-stack">
    <h3>Week summary</h3>
    <p>New terms: ______ &nbsp;|&nbsp; Reviewed: ______ &nbsp;|&nbsp; Stubborn items: ______</p>
    <div class="notes-area fill-grow"></div>
    <h3>Plan for next week</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`);
}

function monthlyPlannerPage(monthLabel) {
    return page(`
  <div class="banner"><strong>LingoSpark</strong><span>Monthly calendar</span></div>
  <h2>Calendar — ${escapeHtml(monthLabel)}</h2>
  <p>Write codes: <strong>V</strong> vocab · <strong>G</strong> grammar · <strong>L</strong> listening · <strong>Rd</strong> reading · <strong>W</strong> writing · <strong>Sp</strong> speaking · <strong>Rev</strong> review</p>
  <div class="planner-wrap fill-grow">
    <div class="planner-grid fill-grow">
      <div class="head">Mon</div><div class="head">Tue</div><div class="head">Wed</div><div class="head">Thu</div><div class="head">Fri</div><div class="head">Sat</div><div class="head">Sun</div>
      ${Array.from({ length: 35 }, () => '<div class="cell"></div>').join('')}
    </div>
  </div>
  <div class="fill-stack">
    <h3>Goals this month</h3>
    <div class="notes-area fill-grow"></div>
    <h3>What went well / what to change</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`);
}

function topicIntroPage(index, pack) {
    return page(
        `
  <div class="banner"><strong>LingoSpark</strong><span>Topic ${index + 1} / 14</span></div>
  <h2><span class="topic-num">${index + 1}</span>${escapeHtml(pack.topicEn)} <span class="meta">/ ${escapeHtml(pack.topicPl)}</span></h2>
  <p class="meta">${pack.items.length} terms · ${escapeHtml(pack.level || 'B2')} · Matura Extended</p>
  <div class="fill-stack">
    <h3>Mind map — add associations, subtopics, examples</h3>
    <div class="mindmap fill-grow"></div>
    <div class="grid-2 fill-stack">
      <div>
        <h3>Lesson notes</h3>
        <div class="notes-area fill-grow"></div>
      </div>
      <div>
        <h3>Phrases / collocations to keep</h3>
        <div class="notes-area fill-grow"></div>
      </div>
    </div>
    <h3>Stubborn words — copy from the checklist</h3>
    <div class="notes-area fill-grow"></div>
    <p class="legend">Next page: vocabulary checklist. Tick ☐ when you can use the term in a sentence.</p>
  </div>
`,
        `${index + 1}. ${pack.topicEn} · LingoSpark Matura Extended ${YEAR}`
    );
}

function vocabChecklistPages(index, pack) {
    const chunks = chunkEvenly(pack.items, 56);
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
            return page(
                `
  <div class="banner"><strong>LingoSpark</strong><span>${escapeHtml(pack.topicEn)} · vocabulary</span></div>
  <h2><span class="topic-num">${index + 1}</span>${escapeHtml(pack.topicEn)} — checklist ${part}/${parts}</h2>
  <p class="legend">Tick the box when you know the meaning and can use the English term in a sentence.</p>
  <div class="vocab-block fill-grow">
    <div class="vocab-cols${dense}">${rows}</div>
  </div>
  <div class="fill-stack">
    <h3>Quick notes / hard items from this page</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`,
                `${index + 1}. ${pack.topicEn} · checklist ${part}/${parts}`
            );
        })
        .join('');
}

function grammarCheckItem(label, hint = '') {
    const hintHtml = hint ? `<br><span class="meta">${escapeHtml(hint)}</span>` : '';
    return `<tr><td><span class="check"></span></td><td><strong>${escapeHtml(label)}</strong>${hintHtml}</td><td><div class="line-field"></div></td></tr>`;
}

function grammarOverviewPage() {
    const items = [
        ['Present / past / future — all simple, continuous and perfect forms', 'including present perfect continuous'],
        ['Future perfect & future continuous', 'By June I will have finished. / This time tomorrow I will be sitting the paper.'],
        ['Used to / would / be used to / get used to', 'I used to live… / I am used to waking up early.'],
        ['Modals of deduction (present & past)', 'must / might / can’t + have + past participle'],
        ['Mixed conditionals & wish / if only', 'If I had revised, I would be calmer now.'],
        ['Passives in all tenses + have something done', 'I’m having my essay checked.'],
        ['Reported speech & reporting verbs', 'admit, deny, suggest, warn, accuse of'],
        ['Relative clauses — defining & non-defining', 'whose, where, of which; commas'],
        ['Gerunds vs infinitives (B2 pairs)', 'regret doing / forget to do / stop to do'],
        ['Articles, quantifiers, uncountables', 'the environment, advice, a piece of research'],
        ['Inversion after negative adverbials (light)', 'Not only… / Rarely… / Under no circumstances…'],
        ['Cleft sentences for emphasis', 'It was the ending that surprised me.'],
        ['Comparatives, so / such, too / enough', 'so interesting that… / such a long paper'],
        ['Linkers for essays', 'whereas, nevertheless, in contrast, as a result'],
        ['Word formation — prefixes & suffixes', 'un-, in-, -ment, -ity, -ive, -ise'],
        ['Phrasal verbs — separable / inseparable', 'look into, put up with, bring about'],
        ['Collocations & fixed phrases', 'make a decision, take action, raise awareness'],
        ['Formal vs informal register', 'I would be grateful if… vs I reckon…'],
        ['Question tags & echo questions', 'You have finished, haven’t you?'],
        ['Participle clauses', 'Having read the article, she changed her mind.'],
    ];
    const midpoint = Math.ceil(items.length / 2);
    const renderPart = (partItems, part, parts) => page(`
  <div class="banner"><strong>LingoSpark</strong><span>Grammar · part ${part}/${parts}</span></div>
  <h2>Grammar checklist — Matura Extended (${part}/${parts})</h2>
  <p>Tick ☐ when you can use the structure in a sentence and spot it in a Use of English task.</p>
  <table class="compact-table">
    <tr><th style="width:28px">☐</th><th>Area</th><th>My note / example</th></tr>
    ${partItems.map(([label, hint]) => grammarCheckItem(label, hint)).join('')}
  </table>
  <div class="fill-stack">
    <h3>Notes — grammar (page ${part})</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`);
    return renderPart(items.slice(0, midpoint), 1, 2) + renderPart(items.slice(midpoint), 2, 2);
}

function grammarDetailPage(title, rows) {
    const tableRows = rows.map(([label, hint]) => grammarCheckItem(label, hint)).join('');
    return page(`
  <div class="banner"><strong>LingoSpark</strong><span>Grammar — detail</span></div>
  <h2>${escapeHtml(title)}</h2>
  <table class="compact-table">
    <tr><th style="width:28px">☐</th><th>Structure / rule</th><th>Example / note</th></tr>
    ${tableRows}
  </table>
  <div class="fill-stack">
    <h3>Notes</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`);
}

function grammarPages() {
    const phrasals = [
        ['look into', 'zbadać, przyjrzeć się (sprawie)'],
        ['look down on', 'patrzeć z góry na'],
        ['put up with', 'znosić, tolerować'],
        ['come up with', 'wymyślić (pomysł)'],
        ['get away with', 'ujść na sucho'],
        ['get round to', 'zebrać się na coś'],
        ['bring about', 'spowodować, wywołać'],
        ['carry out', 'przeprowadzić (badanie, plan)'],
        ['turn down', 'odrzucić (ofertę); ściszyć'],
        ['turn up', 'pojawić się; podgłośnić'],
        ['take over', 'przejąć (firmę, obowiązki)'],
        ['take up', 'zacząć (hobby); zająć (miejsce)'],
        ['give in', 'ustąpić'],
        ['give away', 'oddawać za darmo; zdradzić (tajemnicę)'],
        ['make up for', 'zrekompensować'],
        ['do without', 'obyć się bez'],
        ['cut down on', 'ograniczyć'],
        ['break down', 'zepsuć się; załamać się'],
        ['break up', 'rozejść się; rozbić (na części)'],
        ['set up', 'założyć (firmę)'],
        ['set out', 'wyruszyć; przedstawić (plan)'],
        ['work out', 'ćwiczyć; obliczyć; rozwiązać'],
        ['figure out', 'zrozumieć, rozgryźć'],
        ['point out', 'zauważyć, wskazać'],
        ['stand up for', 'bronić (kogoś, wartości)'],
        ['stand for', 'oznaczać; popierać'],
        ['run out of', 'zabraknąć'],
        ['run into', 'wpaść na kogoś; natrafić na problem'],
        ['end up', 'skończyć (gdzieś / jako)'],
        ['catch up with', 'nadrobić; spotkać się po czasie'],
        ['keep up with', 'nadążać za'],
        ['live up to', 'sprostać (oczekiwaniom)'],
        ['come across', 'natknąć się na; sprawiać wrażenie'],
        ['go through', 'przejść (trudny okres); przeglądać'],
        ['put off', 'odłożyć na później'],
        ['call off', 'odwołać (wydarzenie)'],
    ];
    return [
        grammarOverviewPage(),
        grammarDetailPage('Tenses and time', [
            ['Present Perfect vs Past Simple', 'I have lived here for years. / I lived there in 2019.'],
            ['Present Perfect Continuous', 'I have been revising since Monday.'],
            ['Past Perfect for earlier past', 'She had left before the exam started.'],
            ['Future continuous', 'This time next week I will be travelling.'],
            ['Future perfect', 'By May I will have finished every checklist.'],
            ['be going to vs will vs present continuous for future', 'plans, predictions, arrangements'],
            ['used to vs would (past habits)', 'would not with states'],
            ['be used to / get used to + -ing', 'I am used to writing 250-word essays.'],
        ]),
        grammarDetailPage('Modals, conditionals, the passive', [
            ['must / might / can’t + be (present deduction)', 'She must be tired.'],
            ['must / might / can’t + have + pp (past deduction)', 'He can’t have forgotten the date.'],
            ['should have / ought to have (regret)', 'I should have started earlier.'],
            ['needn’t have vs didn’t need to', 'needn’t have = did it, but it was unnecessary'],
            ['Zero / first / second / third conditionals', ''],
            ['Mixed conditionals', 'If I had slept, I would feel better now.'],
            ['wish / if only + past / past perfect / would', 'I wish I knew. / I wish I had known.'],
            ['Passive of all tenses', 'The results will be published tomorrow.'],
            ['have / get something done', 'I had my passport renewed.'],
        ]),
        grammarDetailPage('Complex sentences and Use of English', [
            ['Defining vs non-defining relative clauses', 'commas; who/which/that/whose'],
            ['Participle clauses', 'Walking into the hall, she felt nervous.'],
            ['Reported questions — word order', 'She asked where I lived. (not where did I live)'],
            ['Reporting verbs + patterns', 'suggest + -ing; warn someone not to'],
            ['so / such / too / enough', 'such a demanding paper'],
            ['despite / in spite of / although / whereas', ''],
            ['Purpose: to / in order to / so that', ''],
            ['Inversion after negative adverbials', 'Never have I seen…'],
            ['It-cleft / what-cleft', 'What I need is more practice.'],
        ]),
        grammarDetailPage('Word formation & transformations', [
            ['Negative prefixes: un-, in-, im-, ir-, il-, dis-', 'inaccurate, impatient, irregular'],
            ['Noun suffixes: -ment, -tion, -ity, -ness, -ance', 'awareness, employment'],
            ['Adjective suffixes: -ive, -ous, -al, -ful, -less', 'effective, ambitious'],
            ['Verb suffixes: -ise / -ize, -en, -ify', 'strengthen, simplify'],
            ['Adverbs from adjectives', 'dramatic → dramatically'],
            ['Key word transformations — keep the meaning', 'typically 2–5 words including the key word'],
            ['Collocation traps', 'make a mistake, do research, take part'],
            ['Dependent prepositions', 'interested in, accused of, succeed in'],
            ['Countable / uncountable exam nouns', 'information, advice, news, furniture'],
        ]),
        page(`
  <div class="banner"><strong>LingoSpark</strong><span>Phrasal verbs</span></div>
  <h2>Phrasal verbs — Matura Extended checklist</h2>
  <p>B2 verbs with particles. Tick when you know the meaning and can use the phrase in a sentence.</p>
  <div class="vocab-block fill-grow">
    <div class="vocab-cols dense">
    ${phrasals
        .map(
            ([term, pl]) =>
                `<div class="vocab-row"><span class="check"></span><div><span class="term">${escapeHtml(term)}</span> — <span class="pl">${escapeHtml(pl)}</span></div></div>`
        )
        .join('')}
    </div>
  </div>
  <div class="fill-stack">
    <h3>My own phrasal verbs from papers / lessons</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`),
        page(`
  <div class="banner"><strong>LingoSpark</strong><span>Writing and speaking</span></div>
  <h2>Writing checklist — 200–250 words</h2>
  <table>
    <tr><th style="width:28px">☐</th><th>Text type</th><th>Remember</th></tr>
    ${grammarCheckItem('Opinion essay (rozprawka)', 'clear thesis, 2–3 arguments, conclusion')}
    ${grammarCheckItem('For-and-against essay', 'both sides, then your position')}
    ${grammarCheckItem('Article', 'title, hook, register for a magazine / school paper')}
    ${grammarCheckItem('Formal letter', 'Dear Sir or Madam / Yours faithfully')}
    ${grammarCheckItem('Review', 'title of the work, opinion + justification')}
    ${grammarCheckItem('Linkers of contrast and result', 'however, nevertheless, therefore, as a result')}
    ${grammarCheckItem('Word count', 'aim 200–250; plan before you write')}
    ${grammarCheckItem('Register', 'no slang in formal tasks; no contractions in letters')}
  </table>
  <h2>Speaking checklist — oral exam</h2>
  <table>
    <tr><th style="width:28px">☐</th><th>Skill</th><th>Note</th></tr>
    ${grammarCheckItem('Warm-up answers in full sentences', 'not one-word replies')}
    ${grammarCheckItem('Picture description', 'speculate: might be, looks as if, in the background')}
    ${grammarCheckItem('Follow-up questions', 'justify with because / that’s why')}
    ${grammarCheckItem('Longer turn on a stimulus', 'structure: intro → 2 points → conclusion')}
    ${grammarCheckItem('Opinion language', 'I would argue that… / It seems to me that…')}
    ${grammarCheckItem('Asking the examiner to repeat', 'Could you repeat that, please?')}
  </table>
  <div class="fill-stack">
    <h3>Notes — writing and speaking</h3>
    <div class="notes-area fill-grow"></div>
    <h3>Templates / set phrases to memorise</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`),
        page(`
  <div class="banner"><strong>LingoSpark</strong><span>Mind map — grammar</span></div>
  <h2>Mind map — grammar (your own)</h2>
  <p>Connect tenses, modals, conditionals and Use of English traps. Add examples from papers.</p>
  <div class="fill-stack">
    <div class="mindmap fill-grow"></div>
    <h3>General notes</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`),
    ].join('');
}

function reviewPages(packs) {
    const total = packs.reduce((n, p) => n + p.items.length, 0);
    const tracker = page(`
  <div class="banner"><strong>LingoSpark</strong><span>Final revision</span></div>
  <h2>Before the exam — topic tracker</h2>
  <p>Four to six weeks before the papers, go through every checklist again. Leave only the empty boxes.</p>
  <table class="compact-table">
    <tr><th>Topic</th><th>Terms</th><th>☐ review I</th><th>☐ review II</th><th>☐ ready</th></tr>
    ${packs
        .map(
            (p) =>
                `<tr><td>${escapeHtml(p.topicEn)}</td><td>${p.items.length}</td><td><span class="check"></span></td><td><span class="check"></span></td><td><span class="check"></span></td></tr>`
        )
        .join('')}
  </table>
  <div class="fill-stack">
    <h3>Exam-day plan</h3>
    <div class="box fill-grow">
      <p><span class="check"></span> Pack pens, ID, water</p>
      <p><span class="check"></span> Sleep — light vocab in the morning, no panic cramming</p>
      <p><span class="check"></span> Read every rubric twice (listening: study the questions first)</p>
      <p><span class="check"></span> Leave five minutes to check Use of English and the word count in writing</p>
      <p><span class="check"></span> Oral exam: speak in full sentences, justify opinions, ask for repetition if needed</p>
    </div>
    <h3>Last notes before the exam</h3>
    <div class="notes-area fill-grow"></div>
  </div>
`);
    const mustKnow = page(`
  <div class="banner"><strong>LingoSpark</strong><span>Final revision</span></div>
  <h2>“Must know” list — 30 priority terms</h2>
  <p>Pick terms from the checklists that you must know cold. Review them every two or three days.</p>
  <div class="checklist-grid fill-grow">
    ${Array.from({ length: 30 }, (_, i) => `<p>${i + 1}. <span class="line-field" style="display:inline-block;width:82%;"></span></p>`).join('')}
  </div>
  <div class="fill-stack">
    <h3>Grammar — last review (six points)</h3>
    <div class="grid-2">
      <p>1. <span class="line-field" style="display:inline-block;width:80%;"></span></p>
      <p>2. <span class="line-field" style="display:inline-block;width:80%;"></span></p>
      <p>3. <span class="line-field" style="display:inline-block;width:80%;"></span></p>
      <p>4. <span class="line-field" style="display:inline-block;width:80%;"></span></p>
      <p>5. <span class="line-field" style="display:inline-block;width:80%;"></span></p>
      <p>6. <span class="line-field" style="display:inline-block;width:80%;"></span></p>
    </div>
    <h3>How ready I feel (1–10) and why</h3>
    <div class="notes-area fill-grow"></div>
    <p class="legend">${total} terms in this plan · Good luck · ${SITE}</p>
  </div>
`);
    return tracker + mustKnow;
}

function buildHtml(packs) {
    const totalTerms = packs.reduce((n, p) => n + p.items.length, 0);
    const months = [
        'September 2025',
        'October 2025',
        'November 2025',
        'December 2025',
        'January 2026',
        'February 2026',
        'March 2026',
        'April 2026',
        'May 2026',
        'June 2026',
        'September 2026',
        'October 2026',
        'November 2026',
        'December 2026',
        'January 2027',
        'February 2027',
        'March 2027',
        'April 2027',
        'May 2027',
    ];
    const topicPages = packs.map((pack, i) => topicIntroPage(i, pack) + vocabChecklistPages(i, pack)).join('');
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
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Matura Extended English study plan ${YEAR} — LingoSpark</title>
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
        { encoding: 'utf8', timeout: 300000 }
    );
    if (result.status !== 0) {
        throw new Error(`PDF failed: ${result.stderr || result.stdout || result.status}`);
    }
}

const packs = loadPrPacks();
const totalTerms = packs.reduce((n, p) => n + p.items.length, 0);
fs.mkdirSync(OUT_DIR, { recursive: true });

const htmlPath = path.join(OUT_DIR, 'Matura-PR-2027-study-plan.html');
const pdfPath = path.join(OUT_DIR, 'Matura-PR-2027-study-plan.pdf');
const readmePath = path.join(OUT_DIR, 'README.txt');

const html = buildHtml(packs);
const pageCount = (html.match(/class="page"/g) || []).length;
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`Study plan HTML → ${htmlPath}`);
console.log(`  ${packs.length} topics, ${totalTerms} vocabulary items, ${pageCount} pages`);
fs.writeFileSync(
    readmePath,
    `LingoSpark — Matura Extended English study plan ${YEAR}
=====================================================

Files:
  Matura-PR-2027-study-plan.pdf   — print-ready PDF
  Matura-PR-2027-study-plan.html  — HTML (Ctrl+P → Save as PDF)

Contents:
  - 14 CKE topics for Matura Extended (${totalTerms} B2 terms with ENG–PL checklists)
  - ${pageCount} A4 pages
  - B2 grammar, word formation, phrasal verbs, writing (200–250 words) and speaking
  - mind maps, notes, weekly template and monthly calendars
  - schedule to May ${YEAR} (full plan + intensive plan)
  - progress tracker and final revision

Rebuild: node packs/build-matura-pr-study-plan.mjs
Vocab games: ${SITE}
`,
    'utf8'
);

const browser = findBrowser();
if (browser) {
    htmlToPdf(browser, htmlPath, pdfPath);
    const sizeKb = Math.round(fs.statSync(pdfPath).size / 1024);
    console.log(`Study plan PDF  → ${pdfPath} (${sizeKb} KB)`);
} else {
    console.log('No Chrome/Edge — open the HTML and print to PDF (Ctrl+P).');
}
