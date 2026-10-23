/* Shared open-answer checking for "In your own time" (browser: window.AnswerCheck; server/tests: globalThis.AnswerCheck after import).
 * Layer 1: normalisation (case, spaces, punctuation, curly apostrophes, contractions) + 1-letter typo => "almost".
 * Layer 2: acceptedAnswers (all key variants) are merged into item.alts by the lesson normaliser.
 * Layer 3: exam-rule pre-check + prompt/reply helpers for the short AI re-check of mismatched items. */
(function (root) {
    'use strict';
    const CONTRACTIONS = {
        "won't": 'will not', "can't": 'cannot', "shan't": 'shall not', "ain't": 'is not', "let's": 'let us',
        "i'm": 'i am', "n't": ' not', "'re": ' are', "'ve": ' have', "'ll": ' will', "'d": ' would',
    };
    function normAnswer(s) {
        let v = String(s ?? '').toLowerCase().replace(/[\u2018\u2019\u02bc`´]/g, "'").replace(/[\u201c\u201d]/g, '"');
        v = v.replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
        v = v.split(' ').map((w) => {
            if (CONTRACTIONS[w]) return CONTRACTIONS[w];
            for (const suf of ["n't", "'re", "'ve", "'ll", "'d"]) if (w.length > suf.length && w.endsWith(suf)) return w.slice(0, -suf.length) + CONTRACTIONS[suf];
            if (/^(he|she|it|that|there|what|who|where|here|how)'s$/.test(w)) return w.slice(0, -2) + ' is';
            return w;
        }).join(' ');
        return v.replace(/\bcan not\b/g, 'cannot').replace(/\s+/g, ' ').trim();
    }
    /** Optimal-string-alignment distance (a swap of two neighbouring letters counts as 1). */
    function editDistance(a, b) {
        a = String(a); b = String(b);
        if (Math.abs(a.length - b.length) > 2) return 3;
        const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
        for (let j = 1; j <= b.length; j++) d[0][j] = j;
        for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
            const c = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
        return d[a.length][b.length];
    }
    function keyAnswers(item) {
        return [item?.answer, ...(item?.alts || []), ...(item?.acceptedAnswers || [])].map(normAnswer).filter(Boolean);
    }
    /** Spelling always counts (as in CKE marking), so a 1-letter typo is "almost" — never full credit.
     *  Only for answers of 4+ letters (shorter words: one letter changes the word, e.g. in/on). */
    function gradeAnswer(item, value) {
        const v = normAnswer(value);
        if (!v) return { status: 'empty' };
        const keys = keyAnswers(item);
        if (keys.includes(v)) return { status: 'ok' };
        if (keys.some((k) => k.replace(/\s/g, '').length >= 4 && editDistance(k, v) === 1)) return { status: 'almost' };
        return { status: 'wrong' };
    }
    const wordCount = (s) => normAnswer(s).split(' ').filter(Boolean).length;
    /** Hard exam rules (checked before any AI): returns a short Polish reason, or ''. */
    function examRuleViolation(format, item, value, cefr) {
        const raw = String(value ?? '').trim();
        const words = raw.split(/\s+/).filter(Boolean).length; // contractions count as written (CKE)
        if (['open_cloze', 'word_formation', 'lexical_set'].includes(format) && words > 1) return 'W tę lukę wpisuje się tylko jeden wyraz.';
        if (format === 'transformation') {
            if (words > 5) return 'Przekroczony limit: maksymalnie 5 wyrazów (z wyrazem kluczowym).';
            const key = normAnswer(item?.key);
            if (key && !(' ' + normAnswer(raw) + ' ').includes(' ' + key + ' ')) return `Brakuje wyrazu kluczowego „${String(item.key).toUpperCase()}” w niezmienionej formie.`;
        }
        if (format === 'translation') { const max = ['B2', 'C1'].includes(cefr) ? 5 : 4; if (words > max) return `Przekroczony limit: maksymalnie ${max} wyrazy.`; }
        if (format === 'brackets' && words > 3) return 'Przekroczony limit: maksymalnie 3 wyrazy.';
        if (format === 'word_formation' && item?.cue) {
            const root2 = normAnswer(item.cue).replace(/[^a-z]/g, '').slice(0, 2), v = normAnswer(raw).replace(/^(un|in|im|ir|il|dis|mis|non|over|under|re)/, '');
            if (root2 && !normAnswer(raw).includes(root2) && !v.startsWith(root2)) return `Odpowiedź musi pochodzić od wyrazu ${String(item.cue).toUpperCase()}.`;
        }
        return '';
    }
    function buildOpenCheckPrompt({ format, cefr, prompt, items }) {
        const lines = items.map((it) => JSON.stringify({ i: it.i, sentence: it.q || '', original: it.lead || undefined, keyWord: it.key || undefined, givenWord: it.cue || undefined, polish: it.pl || undefined, key: [it.answer, ...(it.accepted || [])], student: it.given }));
        return `You are a strict but fair CKE (Polish matura / exam) examiner of English Use of English answers. Task format: "${format}", level ${cefr || 'B1'}.
${prompt ? `Task text (gaps as {{n}}):\n${String(prompt).slice(0, 1500)}\n` : ''}Each item below has the official key and the student's answer, which did NOT match the key. Decide if the student's answer is ALSO fully correct: grammatically correct, same meaning, fits the context, correct spelling, AND obeys exam rules (word limits; key word used unchanged in transformations; derived from the given word in word formation; one word in open cloze). Over the word limit = wrong. If in doubt, mark it wrong.
Items:
${lines.join('\n')}
Reply with JSON only: {"results":[{"i":<n>,"correct":true|false,"explanation":"ONE short sentence in Polish (max 18 words) explaining why, without giving away the key answer"}]}`;
    }
    function parseOpenCheckReply(reply, ids) {
        const out = {};
        for (const r of (Array.isArray(reply?.results) ? reply.results : [])) {
            const i = Number(r?.i);
            if (!ids.includes(i)) continue;
            out[i] = { correct: r.correct === true, explanation: String(r.explanation || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
        }
        return out;
    }
    /** OWN_TIME_MOCK=1 stand-in for the AI: knows a few classic key-equivalents. */
    const MOCK_EQUIV = [['despite', 'in spite of'], ['although', 'though', 'even though'], ['so as to', 'in order to'], ['big', 'large'], ['till', 'until'], ['shop assistant', 'sales assistant'], ['price', 'cost']];
    function mockOpenCheck(items) {
        const out = {};
        for (const it of items) {
            const g = normAnswer(it.given), keys = [it.answer, ...(it.accepted || [])].map(normAnswer);
            const hit = MOCK_EQUIV.find((set) => set.includes(g) && keys.some((k) => set.includes(k)));
            out[it.i] = hit ? { correct: true, explanation: `„${it.given}” znaczy tu to samo co „${it.answer}” i pasuje gramatycznie.` }
                : { correct: false, explanation: `„${it.given}” nie pasuje tu znaczeniowo lub gramatycznie.` };
        }
        return out;
    }
    const api = { normAnswer, editDistance, gradeAnswer, examRuleViolation, wordCount, buildOpenCheckPrompt, parseOpenCheckReply, mockOpenCheck, APPEALS_PER_SET: 3 };
    root.AnswerCheck = api;
})(typeof window !== 'undefined' ? window : globalThis);
