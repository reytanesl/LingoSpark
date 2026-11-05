/**
 * "In your own time" — printable version of a whole generated task set (student sheet + optional answer key).
 * Pure HTML builder (works in the browser as window.OwnTimePrint and in Node for tests) + a tiny print helper.
 */
(function (global) {
    'use strict';
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const LETTERS = 'ABCDEFGH';
    const GAP = /_{3,}|\[\s*(?:…|\.\.\.)\s*\]/g;
    const TEXT_GAP = /\{\{\s*(\d+)\s*\}\}/g;
    const TYPE = {
        vocab_drill: ['Słownictwo', 'Vocabulary'], uoe: ['Środki językowe', 'Use of English'], reading: ['Czytanie', 'Reading'],
        writing: ['Pisanie', 'Writing'], word_order: ['Szyk wyrazów', 'Word order'], unscramble: ['Ułóż słowo', 'Unscramble'],
    };
    const line = (n = 10) => `<span class="otp-line" style="min-width:${n}ch"></span>`;
    const gapLen = (it) => Math.max(8, Math.min(22, String(it?.answer || '').length + 4));

    function gapText(task) {
        const items = task.items || [];
        return esc(task.prompt).replace(TEXT_GAP, (all, n) => {
            const it = items[Number(n) - 1] || {};
            return `<b class="otp-n">(${n})</b> ${line(gapLen(it))}${it.cue ? ` <span class="otp-cue">(${esc(it.cue)})</span>` : ''}`;
        }).replace(/\n/g, '<br>');
    }
    function optionsRow(it) {
        return `<span class="otp-opts">${it.options.map((o, k) => `<span class="otp-opt"><b>${LETTERS[k]}.</b> ${esc(o)}</span>`).join('')}</span>`;
    }
    function itemHtml(task, it) {
        if (task.type === 'word_order') return `${it.q ? `<span class="otp-cue">${esc(it.q)}</span> ` : ''}<span class="otp-tiles">${(it.tiles || []).map(esc).join(' / ')}</span><br>${line(40)}`;
        if (task.type === 'unscramble') return `${esc(it.q || '')} <span class="otp-tiles">${(it.tiles || []).map(esc).join(' ')}</span> ${line(gapLen(it))}`;
        const lead = it.lead ? `<span class="otp-lead">${esc(it.lead)}</span><br>${it.key ? `<b class="otp-key">${esc(it.key)}</b><br>` : ''}` : '';
        let q = esc(it.q || '');
        const extra = `${it.cue ? ` <span class="otp-cue">(${esc(it.cue)})</span>` : ''}${it.pl ? ` <span class="otp-cue">(${esc(it.pl)})</span>` : ''}`;
        let placed = false;
        q = q.replace(GAP, () => { placed = true; return line(gapLen(it)) + extra; }).replace(/\n/g, '<br>');
        if (!placed && !Array.isArray(it.options)) q += ` ${line(gapLen(it))}${extra}`;
        return `${lead}${q}${Array.isArray(it.options) ? `<br>${optionsRow(it)}` : ''}`;
    }
    function compact(task) {
        const items = task.items || [];
        if (!items.length || task.prompt && TEXT_GAP.test(task.prompt) && !items.some((it) => Array.isArray(it.options))) return false;
        TEXT_GAP.lastIndex = 0;
        return items.length >= 3 && items.every((it) => !it.lead && String(it.q || '').length <= 70 && (it.options || []).join(' ').length <= 60 && task.type !== 'word_order');
    }

    function taskHtml(task, n, o) {
        const L = o.lang === 'pl' ? 0 : 1;
        const items = task.items || [];
        const head = `<div class="otp-task-head"><span class="otp-num">${n}</span><span class="otp-type">${esc((TYPE[task.type] || TYPE.writing)[L])}${task.format && o.formatName && o.formatName(task.format) ? ` · ${esc(o.formatName(task.format))}` : ''}</span></div>`;
        let body = '';
        if (task.instruction) body += `<p class="otp-instr">${esc(task.instruction)}</p>`;
        // Word boxes removed from In your own time — never print a bank.
        TEXT_GAP.lastIndex = 0;
        const textGaps = task.prompt && /\{\{\s*\d+\s*\}\}/.test(task.prompt);
        if (textGaps) {
            body += `<div class="otp-text">${gapText(task)}</div>`;
            if (items.some((it) => Array.isArray(it.options))) body += `<ol class="otp-items otp-cols">${items.map((it) => `<li>${optionsRow(it)}</li>`).join('')}</ol>`;
        } else if (task.type === 'writing' || !items.length) {
            if (task.prompt) body += `<p class="otp-text">${esc(task.prompt).replace(/\n/g, '<br>')}</p>`;
            const tg = task.target;
            if (tg && tg.minSentences) body += `<p class="otp-meta">${esc(o.lang === 'pl' ? `${tg.minSentences}–${tg.maxSentences} zdań` : `${tg.minSentences}–${tg.maxSentences} sentences`)}</p>`;
            body += `<div class="otp-write">${'<span class="otp-wline"></span>'.repeat(Math.min(12, Math.max(5, (tg && tg.maxSentences) || 6) + 2))}</div>`;
        } else {
            if (task.prompt) body += `<div class="otp-text">${esc(task.prompt).replace(/\n/g, '<br>')}</div>`;
            body += `<ol class="otp-items${compact(task) ? ' otp-cols' : ''}">${items.map((it) => `<li>${itemHtml(task, it)}</li>`).join('')}</ol>`;
        }
        return `<section class="otp-task">${head}${body}</section>`;
    }

    function keyHtml(lesson, o) {
        const rows = (lesson.tasks || []).map((task, i) => {
            const items = task.items || [];
            if (!items.length) return `<li><b>${i + 1}.</b> ${esc(o.lang === 'pl' ? 'odpowiedź własna' : 'own answer')}${(task.modelAnswers || [])[0] ? ` — <i>${esc(task.modelAnswers[0])}</i>` : ''}</li>`;
            return `<li><b>${i + 1}.</b> ${items.map((it, k) => {
                const optIx = Array.isArray(it.options) ? it.options.indexOf(it.answer) : -1;
                const alts = (it.alts || it.acceptedAnswers || []).filter(Boolean).slice(0, 2);
                return `(${k + 1}) ${optIx >= 0 ? `${LETTERS[optIx]} ` : ''}${esc(it.answer)}${alts.length ? ` <span class="otp-alt">/ ${alts.map(esc).join(' / ')}</span>` : ''}`;
            }).join('; ')}</li>`;
        }).join('');
        return `<section class="otp-keypage"><h2>${esc(o.lang === 'pl' ? 'Klucz odpowiedzi' : 'Answer key')} — ${esc(lesson.title || '')}</h2><ol class="otp-key">${rows}</ol></section>`;
    }

    /** Short label for the task picker: "Use of English · first instruction words". */
    function taskLabel(task, lang) {
        const L = lang === 'pl' ? 0 : 1;
        const type = (TYPE[task?.type] || TYPE.writing)[L];
        const ins = String(task?.instruction || '').trim();
        return ins ? `${type} · ${ins.length > 60 ? `${ins.slice(0, 57).trimEnd()}…` : ins}` : type;
    }

    /** Keep only the chosen task indices (in set order); `select` absent = all tasks. */
    function pick(lesson, select) {
        if (!Array.isArray(select)) return lesson;
        const want = new Set(select.map(Number));
        return { ...lesson, tasks: (lesson?.tasks || []).filter((_, i) => want.has(i)) };
    }

    /** Build the printable sheet: all tasks of the set (or only `o.select` indices, renumbered 1..n), student version, optional answer key on its own page. */
    function build(lesson, o = {}) {
        const opts = { lang: o.lang === 'pl' ? 'pl' : 'en', ...o };
        lesson = pick(lesson, o.select);
        const tasks = lesson?.tasks || [];
        const head = `<header class="otp-head"><h1>${esc(lesson?.title || '')}</h1><div class="otp-sub">${esc([lesson?.focus, lesson?.cefr].filter(Boolean).join(' · '))}</div><div class="otp-name">${esc(opts.lang === 'pl' ? 'Imię i nazwisko' : 'Name')}: <span class="otp-line" style="min-width:24ch"></span> ${esc(opts.lang === 'pl' ? 'Data' : 'Date')}: <span class="otp-line" style="min-width:12ch"></span></div></header>`;
        return `<div class="otp-sheet" lang="${opts.lang}">${head}${tasks.map((tk, i) => taskHtml(tk, i + 1, opts)).join('')}</div>${opts.withKey ? keyHtml(lesson, opts) : ''}`;
    }

    /** Insert the sheet into a print-only container and open the print dialog. */
    function print(lesson, o = {}) {
        const doc = global.document;
        let box = doc.getElementById('ot-print-root');
        if (!box) { box = doc.createElement('div'); box.id = 'ot-print-root'; doc.body.appendChild(box); }
        box.innerHTML = build(lesson, o);
        doc.body.classList.add('ot-printing');
        const done = () => { doc.body.classList.remove('ot-printing'); global.removeEventListener('afterprint', done); };
        global.addEventListener('afterprint', done);
        if (!o.noDialog) global.print();
    }

    const api = { build, print, taskLabel };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.OwnTimePrint = api;
})(typeof window !== 'undefined' ? window : globalThis);
