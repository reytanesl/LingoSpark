/**
 * Server-owned prompts for "In your own time" practice lessons.
 */

import { OWN_TIME_VOCAB_TEXT_MAX, vocabPromptBlock, sanitizeWordSetKey } from './own-time-vocab.js';
import './own-time-error-fix.js';
const { enrichErrorItem } = globalThis.OwnTimeErrorFix;

const CEFR_OK = new Set(['A0', 'A1', 'A2', 'B1', 'B2', 'C1']);
const INTENSITY_OK = new Set(['light', 'standard', 'stretch']);
const TASK_OK = new Set(['writing', 'drill', 'uoe', 'reading', 'vocab', 'grammar']);

/** Max "Keep going" extra practice sets per student per day (Europe/Warsaw day). */
export const OWN_TIME_EXTRA_DAILY_LIMIT = 3;

/** Context sent with an extra set, built from the lesson just finished (for prompt + storage). */
export function buildOwnTimeExtraContext(lesson, answers = {}) {
    const avoid = [];
    const weak = [];
    (lesson?.tasks || []).forEach((t, i) => {
        const a = answers[`t${i}`] || {};
        (t.items || []).forEach((it, j) => {
            if (it.answer) avoid.push(String(it.answer));
            if (it.q) avoid.push(String(it.q).slice(0, 80));
            const given = String((a.items || [])[j] || '').trim().toLowerCase();
            const ok = [it.answer, ...(it.alts || [])].map((x) => String(x || '').trim().toLowerCase());
            if (it.answer && !ok.includes(given)) weak.push(`${it.q} → ${it.answer}${given ? ` (wrote: ${given})` : ' (blank)'}`);
        });
    });
    return { previousTitle: lesson?.title || '', focus: lesson?.focus || '', avoid: avoid.slice(0, 40), weak: weak.slice(0, 12) };
}

const FOCUS_KEYS = ['drill', 'uoe', 'reading', 'writing', 'vocab', 'grammar'];
/** Feedback passed to the prompt: known keys only ("Chcę ćwiczyć" may list several focuses). */
export function cleanRecentFeedback(list) {
    return (Array.isArray(list) ? list : []).slice(0, 2).map((f) => {
        const src = f && typeof f === 'object' ? f : {};
        const focus = [...new Set((Array.isArray(src.focusNexts) ? src.focusNexts : (src.focusNext ? [src.focusNext] : [])).map((x) => String(x).toLowerCase()).filter((x) => FOCUS_KEYS.includes(x)))];
        return {
            levelOk: ['too_easy', 'ok', 'too_hard'].includes(src.levelOk) ? src.levelOk : 'ok',
            modeNext: src.modeNext === 'revise' ? 'revise' : 'new',
            focusNexts: focus,
            note: String(src.note || '').replace(/\s+/g, ' ').trim().slice(0, 300),
        };
    });
}

export function validateOwnTimeGenerateRequest(body = {}) {
    const profile = body.profile && typeof body.profile === 'object' ? body.profile : null;
    if (!profile) return { ok: false, error: 'Profile is required.' };

    const cefr = String(profile.cefr || 'A2').toUpperCase();
    if (!CEFR_OK.has(cefr)) return { ok: false, error: 'Invalid CEFR level.' };

    let intensity = String(profile.intensity || 'standard').toLowerCase();
    if (!INTENSITY_OK.has(intensity)) intensity = 'standard';

    const instrLang = profile.instrLang === 'en' ? 'en' : 'pl';
    const age = Number(profile.age);
    const taskPrefs = (Array.isArray(profile.taskPrefs) ? profile.taskPrefs : [])
        .map((t) => String(t || '').toLowerCase())
        .filter((t) => TASK_OK.has(t));
    const interests = (Array.isArray(profile.interests) ? profile.interests : [])
        .map((s) => String(s || '').trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 12);

    const topic = String(body.topic != null ? body.topic : profile.topic || '').trim().slice(0, 200);
    const vocab = String(body.vocab != null ? body.vocab : profile.vocab || '').trim().slice(0, OWN_TIME_VOCAB_TEXT_MAX);
    // Optional teacher-saved / built-in word set (server resolves to vocab text before planVocab).
    const wordSetKey = sanitizeWordSetKey(body.wordSetKey != null ? body.wordSetKey : profile.wordSetKey);
    const recentFeedback = cleanRecentFeedback(body.recentFeedback);
    const ps = body.prevSet && typeof body.prevSet === 'object' ? body.prevSet : null;
    const prevSet = ps ? { title: String(ps.title || '').trim().slice(0, 120), weak: (Array.isArray(ps.weak) ? ps.weak : []).map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)).filter(Boolean).slice(0, 8) } : null;
    const vocabState = body.vocabState ?? profile.vocabState ?? null;
    const extra = body.extra === true;
    const ctx = body.extraContext && typeof body.extraContext === 'object' ? body.extraContext : {};
    const strs = (arr, max, len) => (Array.isArray(arr) ? arr : [])
        .map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, len)).filter(Boolean).slice(0, max);
    const extraContext = extra ? {
        previousTitle: String(ctx.previousTitle || '').trim().slice(0, 120),
        focus: String(ctx.focus || '').trim().slice(0, 80),
        avoid: strs(ctx.avoid, 40, 80),
        weak: strs(ctx.weak, 12, 160),
        setNumber: Math.max(1, Math.min(OWN_TIME_EXTRA_DAILY_LIMIT, Number(ctx.setNumber) || 1)),
    } : null;

    return {
        ok: true,
        value: {
            age: Number.isFinite(age) ? age : null,
            classLabel: String(profile.classLabel || '').trim().slice(0, 80),
            cefr,
            interests,
            taskPrefs: taskPrefs.length ? taskPrefs : ['writing', 'vocab'],
            purpose: String(profile.purpose || '').trim().slice(0, 200),
            intensity,
            instrLang,
            topic,
            vocab,
            wordSetKey,
            vocabState,
            prevSet,
            recentFeedback,
            extra,
            extraContext,
        },
    };
}

/** Writing length by CEFR (keeps the original "2–6 sentences depending on level" rule). */
export const WRITING_TARGETS = {
    A0: { sentences: [2, 3], words: [15, 30] },
    A1: { sentences: [2, 3], words: [20, 40] },
    A2: { sentences: [3, 4], words: [35, 60] },
    B1: { sentences: [4, 5], words: [60, 90] },
    B2: { sentences: [5, 6], words: [90, 120] },
    C1: { sentences: [5, 6], words: [110, 150] },
};

export function writingTarget(cefr) {
    return WRITING_TARGETS[String(cefr || '').toUpperCase()] || WRITING_TARGETS.A2;
}

/** Every lesson and every "Keep going" extra set has 5–6 tasks (no time frame). */
export const OWN_TIME_TASKS_MIN = 5;
export const OWN_TIME_TASKS_MAX = 6;

/**
 * Use of English formats modelled on CKE exam papers (Informator o egzaminie ósmoklasisty z j. angielskiego
 * od 2024/2025; Informator o egzaminie maturalnym z j. angielskiego od 2024/2025 — PP, PR, poziom dwujęzyczny).
 * kind: mc = closed (options), open = typed answer. text: gaps live in the task prompt as {{n}}.
 */
export const UOE_FORMATS = {
    simple: { kind: 'open', name: 'Proste luki', instr: '' },
    mc_sentences: { kind: 'mc', name: 'Wybór wielokrotny — zdania', instr: 'Wybierz właściwą odpowiedź spośród podanych, tak aby otrzymać logiczne i gramatycznie poprawne zdania.' },
    mc_dialogue: { kind: 'mc', name: 'Wybór wielokrotny — minidialogi', instr: 'Przeczytaj dialogi. Wybierz właściwą odpowiedź spośród podanych, tak aby otrzymać logiczne i poprawne językowo wypowiedzi.' },
    mc_translation: { kind: 'mc', needsPl: true, name: 'Tłumaczenie fragmentu — wybór', instr: 'Wybierz właściwą odpowiedź spośród podanych, tak aby otrzymać poprawne tłumaczenie fragmentu podanego w nawiasie.' },
    mc_text: { kind: 'mc', text: true, name: 'Tekst z lukami — wybór wielokrotny', instr: 'Przeczytaj tekst. Wybierz właściwą odpowiedź spośród podanych, tak aby otrzymać logiczny, spójny i poprawny językowo tekst.' },
    two_sentences: { kind: 'mc', name: 'Jeden wyraz do dwóch zdań', instr: 'Wybierz wyraz, który poprawnie uzupełnia luki w obu zdaniach.' },
    brackets: { kind: 'open', cue: true, name: 'Wyrazy z nawiasu w odpowiedniej formie', instr: 'Uzupełnij zdania. Wpisz w każdą lukę wyrazy podane w nawiasach w odpowiedniej formie. Jeśli to konieczne, dodaj inne wyrazy, tak aby otrzymać logiczne i gramatycznie poprawne zdania. W każdą lukę możesz wpisać maksymalnie trzy wyrazy, wliczając w to wyrazy już podane.' },
    translation: { kind: 'open', needsPl: true, name: 'Tłumaczenie fragmentów zdań', instr: 'Przetłumacz na język angielski fragmenty podane w nawiasach, tak aby otrzymać logiczne i gramatycznie poprawne zdania. Wymagana jest pełna poprawność ortograficzna wpisywanych fragmentów.' },
    word_formation: { kind: 'open', text: true, cue: true, name: 'Słowotwórstwo', instr: 'Przeczytaj tekst. Uzupełnij każdą lukę, przekształcając wyraz podany w nawiasie, tak aby otrzymać logiczny, spójny i poprawny językowo tekst. W każdą lukę możesz wpisać tylko jeden wyraz.' },
    open_cloze: { kind: 'open', text: true, name: 'Tekst z lukami (open cloze)', instr: 'Przeczytaj tekst. Uzupełnij każdą lukę jednym wyrazem, tak aby otrzymać logiczny, spójny i poprawny gramatycznie tekst.' },
    transformation: { kind: 'open', needsKey: true, name: 'Transformacje (parafrazy)', instr: 'Uzupełnij każde zdanie, wykorzystując wyraz podany wielkimi literami, tak aby zachować znaczenie zdania wyjściowego. Nie zmieniaj formy podanego wyrazu. W każdą lukę możesz wpisać maksymalnie pięć wyrazów, wliczając w to wyraz już podany.' },
    lexical_set: { kind: 'open', name: 'Set leksykalny (kolokacje)', instr: 'Wpisz jeden wyraz, który poprawnie uzupełnia luki we wszystkich trzech zdaniach. Wyraz musi mieć tę samą formę w każdym zdaniu.' },
    tense_form: { kind: 'open', cue: true, grammar: true, name: 'Formy czasowników / czasy', instr: 'Uzupełnij zdania. Wpisz w każdą lukę podany w nawiasie czasownik w odpowiednim czasie i formie gramatycznej. W każdą lukę możesz wpisać maksymalnie trzy wyrazy.' },
    error_correction: { kind: 'open', grammar: true, name: 'Korekta błędu gramatycznego', instr: 'W każdym zdaniu jest jeden błąd gramatyczny. Kliknij wyraz lub wyrazy, w których jest błąd, a następnie wpisz poprawną formę tylko tego fragmentu.' },
    sentence_rewrite: { kind: 'open', needsLead: true, grammar: true, name: 'Przekształcanie zdań (gramatyka)', instr: 'Przekształć każde zdanie zgodnie z poleceniem (np. strona bierna, mowa zależna, okres warunkowy), zachowując znaczenie. W każdą lukę możesz wpisać maksymalnie sześć wyrazów.' },
    grammar_mc: { kind: 'mc', grammar: true, name: 'Gramatyka — wybór wielokrotny', instr: 'Wybierz właściwą odpowiedź spośród podanych, tak aby otrzymać gramatycznie poprawne zdanie.' },
};

/** Formats whose primary focus is grammar (not vocab/lexis). */
export const GRAMMAR_UOE_FORMATS = ['tense_form', 'error_correction', 'sentence_rewrite', 'grammar_mc', 'brackets', 'transformation'];


/** CKE exam mapping per CEFR level (A0/A1: no exam → simple gaps). */
export const UOE_LEVELS = {
    A0: { exam: null, name: 'Starter', options: 3, open: 'simple', formats: ['tense_form', 'grammar_mc', 'error_correction', 'simple'] },
    A1: { exam: null, name: 'Elementary', options: 3, open: 'simple', formats: ['tense_form', 'grammar_mc', 'error_correction', 'brackets', 'simple'] },
    A2: { exam: 'E8', name: 'Egzamin ósmoklasisty', options: 3, open: 'brackets', formats: ['mc_sentences', 'mc_dialogue', 'mc_translation', 'mc_text', 'brackets', 'translation', 'tense_form', 'error_correction', 'grammar_mc', 'sentence_rewrite'] },
    B1: { exam: 'MP', name: 'Matura — poziom podstawowy', options: 3, open: 'brackets', formats: ['mc_text', 'mc_sentences', 'two_sentences', 'mc_dialogue', 'brackets', 'translation', 'tense_form', 'error_correction', 'sentence_rewrite', 'grammar_mc'] },
    B2: { exam: 'MR', name: 'Matura — poziom rozszerzony', options: 4, open: 'open_cloze', formats: ['word_formation', 'open_cloze', 'transformation', 'translation', 'mc_text', 'error_correction', 'sentence_rewrite', 'tense_form'] },
    C1: { exam: 'MD', name: 'Matura — poziom dwujęzyczny', options: 4, open: 'open_cloze', formats: ['open_cloze', 'word_formation', 'transformation', 'translation', 'lexical_set', 'mc_text', 'error_correction', 'sentence_rewrite', 'tense_form'] },
};

/**
 * Age + CEFR → instruction tone band.
 * Missing age is inferred from level (and vice versa) so we never fall back to one generic polecenie.
 *   kid   — primary / A0–A1 (or under 12)
 *   young — lower secondary / A2 (about 12–14)
 *   exam  — E8 / matura teens / B1–B2
 *   adult — C1 or 19+
 */
export function instructionAudience({ age, cefr } = {}) {
    let lv = String(cefr || '').toUpperCase();
    if (!CEFR_OK.has(lv)) lv = '';
    let a = Number(age);
    if (!Number.isFinite(a) || a < 6 || a > 99) a = null;
    if (a == null) {
        a = ({ A0: 9, A1: 10, A2: 13, B1: 16, B2: 17, C1: 19 })[lv] || 14;
    }
    if (!lv) {
        lv = a < 11 ? 'A1' : a < 14 ? 'A2' : a < 16 ? 'B1' : a < 19 ? 'B2' : 'C1';
    }
    // Age dominates tone; level fills gaps. E8-age A2 (14–15) gets exam-style polecenia.
    let band = 'exam';
    if (a >= 19 || lv === 'C1') band = 'adult';
    else if (a < 12 || ['A0', 'A1'].includes(lv)) band = 'kid';
    else if (a < 14) band = 'young';
    else band = 'exam';
    return { band, age: a, cefr: lv };
}

/** Kid-friendly / young / adult variants of CKE UOE instructions (Polish). Empty = keep official. */
const UOE_INSTR_BY_BAND = {
    kid: {
        mc_sentences: 'Wybierz poprawną odpowiedź w każdym zdaniu.',
        mc_dialogue: 'Przeczytaj dialogi. Wybierz poprawną odpowiedź.',
        mc_translation: 'Wybierz poprawne tłumaczenie fragmentu w nawiasie.',
        mc_text: 'Przeczytaj tekst. Wybierz poprawną odpowiedź do każdej luki.',
        two_sentences: 'Wybierz jedno słowo, które pasuje do obu zdań.',
        brackets: 'Uzupełnij każde zdanie poprawną formą czasownika z nawiasu.',
        translation: 'Przetłumacz na angielski fragment w nawiasie.',
        word_formation: 'Zmień wyraz z nawiasu tak, żeby pasował do luki (jeden wyraz).',
        open_cloze: 'Przeczytaj tekst. Do każdej luki wpisz dokładnie jedno słowo.',
        transformation: 'Dokończ zdanie. Użyj słowa NAPISANEGO WIELKIMI LITERAMI — nie zmieniaj jego formy.',
        lexical_set: 'To samo słowo musi pasować do luk we wszystkich trzech zdaniach.',
        tense_form: 'Wpisz czasownik z nawiasu w poprawnym czasie.',
        error_correction: 'Kliknij błędny wyraz (lub wyrazy) i wpisz poprawną formę.',
        sentence_rewrite: 'Przepisz zdanie tak, jak każe polecenie (np. strona bierna).',
        grammar_mc: 'Wybierz poprawną formę gramatyczną.',
        simple: 'Uzupełnij luki.',
    },
    young: {
        mc_sentences: 'Wybierz właściwą odpowiedź, żeby zdania były poprawne.',
        mc_dialogue: 'Przeczytaj dialogi i wybierz właściwą odpowiedź.',
        mc_translation: 'Wybierz poprawne tłumaczenie fragmentu podanego w nawiasie.',
        mc_text: 'Przeczytaj tekst i wybierz właściwą odpowiedź do każdej luki.',
        two_sentences: 'Wybierz wyraz, który poprawnie uzupełnia luki w obu zdaniach.',
        brackets: 'Uzupełnij zdania poprawną formą wyrazów z nawiasów (max. 3 wyrazy w luce).',
        translation: 'Przetłumacz na angielski fragmenty w nawiasach. Pilnuj pisowni.',
        word_formation: 'Uzupełnij luki, zmieniając formę wyrazu z nawiasu (jeden wyraz).',
        open_cloze: 'Przeczytaj tekst. Uzupełnij każdą lukę jednym wyrazem.',
        transformation: 'Uzupełnij zdanie wyrazem NAPISANYM WIELKIMI LITERAMI (bez zmiany formy; max. 5 wyrazów).',
        lexical_set: 'Uzupełnij luki we wszystkich trzech zdaniach tym samym wyrazem (ta sama forma).',
        tense_form: 'Uzupełnij lukę czasownikiem z nawiasu w odpowiednim czasie i formie.',
        error_correction: 'Kliknij wyraz(y) z błędem i wpisz poprawną formę tylko tego fragmentu.',
        sentence_rewrite: 'Przekształć zdanie zgodnie z poleceniem (np. strona bierna, mowa zależna).',
        grammar_mc: 'Wybierz poprawną odpowiedź gramatyczną.',
        simple: 'Uzupełnij luki w zdaniach.',
    },
    adult: {
        // Slightly more precise than stock CKE wording; empty entries fall back to official.
        open_cloze: 'Przeczytaj tekst. Uzupełnij każdą lukę dokładnie jednym wyrazem, tak aby tekst był spójny i gramatycznie poprawny.',
        word_formation: 'Przeczytaj tekst. Uzupełnij każdą lukę jednym wyrazem utworzonym od formy podanej w nawiasie, zachowując spójność i poprawność tekstu.',
        transformation: 'Przekształć każde zdanie, używając podanego WIELKIMI LITERAMI wyrazu bez zmiany jego formy (maksymalnie pięć wyrazów w luce, wliczając wyraz podany).',
        lexical_set: 'Uzupełnij luki we wszystkich trzech zdaniach tym samym wyrazem (bez zmiany formy).',
        translation: 'Przetłumacz na język angielski fragmenty w nawiasach, zachowując pełną poprawność gramatyczną i ortograficzną.',
        tense_form: 'Uzupełnij każdą lukę czasownikiem z nawiasu w wymaganym czasie i aspekcie (maksymalnie trzy wyrazy).',
        error_correction: 'Kliknij wyraz lub wyrazy z błędem gramatycznym, potem wpisz poprawną formę tylko zaznaczonego fragmentu.',
        sentence_rewrite: 'Przekształć każde zdanie zgodnie z poleceniem gramatycznym, zachowując znaczenie (maksymalnie sześć wyrazów w luce).',
        grammar_mc: 'Wybierz formę gramatycznie poprawną w danym kontekście.',
    },
};

/** Non-UOE default polecenia by band (pl / en). */
const TASK_INSTR = {
    kid: {
        pl: {
            vocab_drill: 'Uzupełnij każde zdanie lub napisz brakujące słowo.',
            reading: 'Przeczytaj tekst. Odpowiedz krótko na pytania.',
            writing: 'Napisz kilka krótkich zdań.',
            word_order: 'Ułóż słowa w dobrej kolejności.',
            unscramble: 'Ułóż słowo z liter.',
            uoe: 'Uzupełnij luki.',
        },
        en: {
            vocab_drill: 'Fill in each gap or write the missing word.',
            reading: 'Read the text. Answer the questions in short words.',
            writing: 'Write a few short sentences.',
            word_order: 'Put the words in the right order.',
            unscramble: 'Build the word from the letters.',
            uoe: 'Complete the gaps.',
        },
    },
    young: {
        pl: {
            vocab_drill: 'Uzupełnij luki lub napisz brakujące słowa ze słownictwa lekcji.',
            reading: 'Przeczytaj tekst i krótko odpowiedz na pytania po angielsku.',
            writing: 'Napisz krótki tekst według polecenia.',
            word_order: 'Ułóż wyrazy tak, aby powstało poprawne zdanie.',
            unscramble: 'Ułóż angielskie słowo z podanych liter.',
            uoe: 'Uzupełnij luki poprawnymi wyrazami.',
        },
        en: {
            vocab_drill: 'Complete the gaps or write the missing lesson words.',
            reading: 'Read the text and answer the questions briefly in English.',
            writing: 'Write a short text as asked.',
            word_order: 'Arrange the words into a correct sentence.',
            unscramble: 'Build the English word from the letters.',
            uoe: 'Complete the gaps with the correct words.',
        },
    },
    exam: {
        pl: {
            vocab_drill: 'Uzupełnij luki lub podaj brakujące słowa, dbając o poprawną formę i pisownię.',
            reading: 'Przeczytaj tekst. Odpowiedz na pytania krótko po angielsku.',
            writing: 'Napisz tekst zgodnie z poleceniem, dbając o spójność i poprawność.',
            word_order: 'Ułóż wyrazy w poprawnej kolejności, tak aby powstało logiczne zdanie.',
            unscramble: 'Ułóż poprawne angielskie słowo z podanych liter.',
            uoe: 'Uzupełnij luki, tak aby zdania były logiczne i gramatycznie poprawne.',
        },
        en: {
            vocab_drill: 'Complete the gaps or supply the missing words, with correct form and spelling.',
            reading: 'Read the text. Answer the questions briefly in English.',
            writing: 'Write the text as required, keeping it clear and accurate.',
            word_order: 'Put the words in the correct order to make a clear sentence.',
            unscramble: 'Form the correct English word from the letters.',
            uoe: 'Complete the gaps so the sentences are logical and grammatically correct.',
        },
    },
    adult: {
        pl: {
            vocab_drill: 'Uzupełnij luki lub podaj precyzyjne odpowiedniki, zachowując poprawną formę i rejestr.',
            reading: 'Przeczytaj tekst uważnie i odpowiedz zwięźle po angielsku na pytania.',
            writing: 'Napisz tekst zgodny z poleceniem — jasny, spójny i poprawny językowo.',
            word_order: 'Ułóż wyrazy w naturalnej, poprawnej kolejności angielskiej.',
            unscramble: 'Odtwórz poprawne angielskie słowo z podanych liter.',
            uoe: 'Uzupełnij luki precyzyjnie, zachowując logikę, spójność i poprawność gramatyczną.',
        },
        en: {
            vocab_drill: 'Complete the gaps or give precise equivalents, with correct form and register.',
            reading: 'Read the text carefully and answer the questions concisely in English.',
            writing: 'Write a clear, coherent and accurate text as required.',
            word_order: 'Arrange the words into natural, correct English order.',
            unscramble: 'Reconstruct the correct English word from the letters.',
            uoe: 'Complete the gaps precisely, keeping logic, cohesion and grammar.',
        },
    },
};

export function taskInstruction(type, { format = null, age = null, cefr = 'A2', instrLang = 'pl' } = {}) {
    const { band } = instructionAudience({ age, cefr });
    const lang = instrLang === 'en' ? 'en' : 'pl';
    if (type === 'uoe' && format) return uoeInstruction(format, cefr, { age, band });
    const pack = TASK_INSTR[band] || TASK_INSTR.exam;
    const byLang = pack[lang] || pack.pl;
    let text = byLang[type] || byLang.uoe;
    if (type === 'writing') {
        const w = writingTarget(cefr);
        if (lang === 'pl') {
            const zd = w.sentences[1] <= 4 ? 'zdania' : 'zdań';
            text = band === 'kid'
                ? `Napisz ${w.sentences[0]}–${w.sentences[1]} krótkie ${zd}.`
                : band === 'adult'
                    ? `Napisz ${w.sentences[0]}–${w.sentences[1]} ${zd} (ok. ${w.words[0]}–${w.words[1]} słów), zgodnie z poleceniem.`
                    : `Napisz ${w.sentences[0]}–${w.sentences[1]} ${zd} zgodnie z poleceniem.`;
        } else {
            text = band === 'kid'
                ? `Write ${w.sentences[0]}–${w.sentences[1]} short sentences.`
                : `Write ${w.sentences[0]}–${w.sentences[1]} sentences as asked.`;
        }
    }
    return text;
}

export function uoeInstruction(format, cefr, opts = {}) {
    const f = UOE_FORMATS[format];
    if (!f) return '';
    const lv = String(cefr || '').toUpperCase();
    const { band } = opts.band ? { band: opts.band } : instructionAudience({ age: opts.age, cefr: lv });
    const needsFive = format === 'translation' && ['B2', 'C1'].includes(lv);
    const limit = needsFive
        ? (band === 'kid'
            ? (opts.instrLang === 'en' ? ' Write at most five words.' : ' Wpisz najwyżej pięć słów.')
            : ' Uwaga: w każdą lukę możesz wpisać maksymalnie pięć wyrazów.')
        : '';
    // Exam teens (B1/B2, typical E8/matura age): keep official CKE wording.
    if (band === 'exam' && f.instr) return f.instr + limit;
    const alt = (UOE_INSTR_BY_BAND[band] || {})[format];
    if (alt) return alt + limit;
    if (f.instr) return f.instr + limit;
    if (format === 'simple') {
        return (UOE_INSTR_BY_BAND[band] || UOE_INSTR_BY_BAND.young).simple || 'Uzupełnij luki.';
    }
    return '';
}

/** Prompt paragraph: concrete polecenie examples for this student. */
export function instructionToneGuide({ age, cefr, instrLang } = {}) {
    const aud = instructionAudience({ age, cefr });
    // Keep examples SHORT — full CKE polecenia are applied later by adaptTaskInstruction; bloating the
    // generation prompt with them only slows the model.
    if (aud.band === 'kid') {
        return `INSTRUCTION TONE (band=kid, age≈${aud.age}, ${aud.cefr}): ONE short concrete sentence a primary pupil understands. No exam jargon. Examples: "Wpisz czasownik z nawiasu w poprawnym czasie."; "Kliknij błędny wyraz i wpisz poprawną formę."; "Przeczytaj tekst. Odpowiedz krótko."; "Ułóż słowo z liter."`;
    }
    if (aud.band === 'young') {
        return `INSTRUCTION TONE (band=young, age≈${aud.age}, ${aud.cefr}): clear school Polish/English, 1–2 short sentences. Light exam vocabulary OK. Examples: "Uzupełnij lukę formą z nawiasu."; "Przeczytaj tekst. Uzupełnij każdą lukę jednym wyrazem."`;
    }
    if (aud.band === 'adult') {
        return `INSTRUCTION TONE (band=adult, age≈${aud.age}, ${aud.cefr}): precise adult wording, no talking down; state word limits clearly. Prefer CKE-accurate UoE instructions (short).`;
    }
    return `INSTRUCTION TONE (band=exam, age≈${aud.age}, ${aud.cefr}): concise CKE / exam-style polecenia for E8 or matura age — formal enough for the paper, not childish. Prefer official UoE wording; keep each instruction to 1–2 sentences.`;
}

/**
 * Ensure a task's polecenie matches age+level. UOE formats always get the band-aware text;
 * other types keep a good AI instruction unless empty, tiny, or clearly mismatched to the band.
 */
export function adaptTaskInstruction(task, { age = null, cefr = 'A2', instrLang = 'pl' } = {}) {
    if (!task || typeof task !== 'object') return task;
    const aud = instructionAudience({ age, cefr });
    const lang = instrLang === 'en' ? 'en' : 'pl';
    let cur = String(task.instruction || '').replace(/\s+/g, ' ').trim();
    // Never keep word-box / ramka wording in the polecenie.
    if (cur && (instructionCueRefs(cur).box || /\bramk|\bbox\b|Use these words|Użyj tych słów|zbędn/i.test(cur))) {
        cur = '';
    }
    const wanted = taskInstruction(task.type, { format: task.format || null, age: aud.age, cefr: aud.cefr, instrLang: lang });
    if (task.type === 'uoe' && task.format) {
        return { ...task, instruction: wanted || cur };
    }
    const looksLikeInstr = /^(Complete|Fill|Write|Read|Choose|Match|Translate|Find|Correct|Rewrite|Przekształć|Uzupełnij|Wpisz|Przeczytaj|Wybierz|Dopasuj|Przetłumacz|Napisz|Ułóż|Build|Arrange|Form|Odtwórz|Zmień|Dokończ|Znajdź|Popraw|Przepisz|Kliknij)\b/u.test(cur);
    if (!cur || cur.length < 8 || !looksLikeInstr) return { ...task, instruction: wanted };
    const examJargon = /spójny i poprawny językowo|maksymalnie (?:trzy|pięć) wyraz|znajomość środków|fragmenty podane w nawiasach, tak aby|Wymagana jest pełna poprawność/i.test(cur);
    const babyTalk = /^(Ułóż słowo z liter|Napisz kilka krótkich zdań|Uzupełnij luki\.|Fill in each gap)\.?$/i.test(cur);
    if (aud.band === 'kid' && (examJargon || cur.length > 140)) return { ...task, instruction: wanted };
    if (aud.band === 'adult' && babyTalk) return { ...task, instruction: wanted };
    if ((aud.band === 'exam' || aud.band === 'young') && babyTalk) return { ...task, instruction: wanted };
    return { ...task, instruction: cur };
}

export const OWN_TIME_TASK_TYPES = ['vocab_drill', 'uoe', 'reading', 'writing', 'word_order', 'unscramble'];

/** Small deterministic PRNG so the same item always gets the same scramble (stable re-renders, testable). */
function seededShuffle(arr, seedText) {
    let h = 2166136261;
    for (const ch of String(seedText)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
        h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x6d2b79f5) >>> 0;
        const j = h % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.length > 1 && out.join('\u0001') === arr.join('\u0001')) out.push(out.shift());
    return out;
}

/** Comparison key: case-, punctuation- and spacing-insensitive (word order + unscramble). */
/** Item alternatives: "acceptedAnswers" (all valid key variants, CKE-key style) merged with legacy "alts", de-duplicated. */
export function acceptedList(it) {
    const seen = new Set(), out = [];
    for (const a of [...(Array.isArray(it?.acceptedAnswers) ? it.acceptedAnswers : []), ...(Array.isArray(it?.alts) ? it.alts : [])]) {
        const k = looseKey(a);
        if (k && !seen.has(k)) { seen.add(k); out.push(a); }
    }
    return out;
}

export function looseKey(s) {
    return String(s ?? '').toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Word tiles for a sentence: words in order, final punctuation dropped (added back by the app). */
export function sentenceTiles(answer) {
    return String(answer || '').trim().replace(/[.!?]+$/, '').split(/\s+/).filter(Boolean);
}

/** Build a word_order / unscramble item with shuffled tiles; returns null if unusable. */
export function buildTileItem(type, it) {
    const answer = String(it?.answer || '').replace(/\s+/g, ' ').trim();
    if (!answer) return null;
    const alts = acceptedList(it).map((a) => String(a || '').replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean).slice(0, 6);
    const q = String(it?.q || it?.clue || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (type === 'word_order') {
        const words = sentenceTiles(answer);
        if (words.length < 3 || words.length > 12) return null;
        const end = (answer.match(/[.!?]+$/) || ['.'])[0];
        // Don't give the first word away with its capital letter (the app capitalises the built sentence).
        const shown = words.map((w, i) => (i === 0 && w !== 'I' && !/^I'/.test(w) ? w.charAt(0).toLowerCase() + w.slice(1) : w));
        return { q, answer: answer.slice(0, 200), alts, tiles: seededShuffle(shown, answer), end };
    }
    const word = answer.replace(/[^\p{L}'-]/gu, '');
    if (word.length < 3 || word.length > 12 || /\s/.test(answer)) return null;
    const emoji = String(it?.emoji || '').trim().slice(0, 8);
    return { q, answer: word, alts, emoji, tiles: seededShuffle(word.toLowerCase().split(''), word) };
}



/**
 * Default student guidance per task type (steps + hint; the success checklist was removed), used when the AI leaves a field out
 * (and for lessons generated before guidance existed).
 */
export function defaultGuidance(type, instrLang, cefr) {
    const en = instrLang === 'en';
    const w = writingTarget(cefr);
    const zd = w.sentences[1] <= 4 ? 'zdania' : 'zdań';
    const T = {
        word_order: {
            steps: en
                ? ['Tap the words in the right order (or drag them).', 'Tap a word in your sentence to send it back.', 'Press “Check”.']
                : ['Klikaj słowa we właściwej kolejności (albo je przeciągnij).', 'Kliknij słowo w zdaniu, żeby je cofnąć.', 'Kliknij „Sprawdź”.'],
            hint: en ? 'English sentences usually go: who → does what → what/where → when.' : 'Szyk angielski: kto → co robi → co/gdzie → kiedy.',
        },
        unscramble: {
            steps: en
                ? ['Read the clue.', 'Tap the letters in order — or type the word.', 'Press “Check”.']
                : ['Przeczytaj podpowiedź.', 'Klikaj litery po kolei — albo wpisz słowo.', 'Kliknij „Sprawdź”.'],
            hint: en ? 'Find the first letter, then say the word aloud.' : 'Znajdź pierwszą literę i powiedz słowo na głos.',
        },
        vocab_drill: {
            steps: en
                ? ['Read the example first.', 'Fill in every item — guess if you are not sure.', 'Press “Check”, then fix the red ones.']
                : ['Najpierw przeczytaj przykład.', 'Uzupełnij każdy punkt — jeśli nie wiesz, zgaduj.', 'Kliknij „Sprawdź” i popraw czerwone odpowiedzi.'],
            hint: en ? 'Say the word aloud — it helps you remember the spelling.' : 'Powiedz słowo na głos — łatwiej zapamiętasz pisownię.',
        },
        uoe: {
            steps: en
                ? ['Read the whole sentence before you write.', 'Decide what kind of word fits (verb, noun, adjective…).', 'Write one word per gap, then press “Check”.']
                : ['Przeczytaj całe zdanie, zanim coś wpiszesz.', 'Zastanów się, jakie słowo pasuje (czasownik, rzeczownik, przymiotnik…).', 'Wpisz jedno słowo w lukę i kliknij „Sprawdź”.'],
            hint: en ? 'Look at the words just before and after the gap.' : 'Spójrz na słowa tuż przed luką i tuż po niej.',
        },
        reading: {
            steps: en
                ? ['Read the questions first.', 'Read the text and underline the answers in your head.', 'Answer in short English phrases, then press “Check”.']
                : ['Najpierw przeczytaj pytania.', 'Przeczytaj tekst i znajdź w nim odpowiedzi.', 'Odpowiedz krótko po angielsku i kliknij „Sprawdź”.'],
            hint: en ? 'The answers are in the same order as the questions.' : 'Odpowiedzi są w tekście w tej samej kolejności co pytania.',
        },
        writing: {
            steps: en
                ? ['Plan: write 2–3 key words for your ideas.', `Write ${w.sentences[0]}–${w.sentences[1]} sentences. Use the useful language.`, 'Read it again and check spelling and full stops.']
                : ['Zaplanuj: zapisz 2–3 słowa-klucze z pomysłami.', `Napisz ${w.sentences[0]}–${w.sentences[1]} ${zd}. Użyj przydatnych zwrotów.`, 'Przeczytaj jeszcze raz i sprawdź pisownię oraz kropki.'],
            hint: en ? 'Start with the starter sentence if you are stuck.' : 'Jeśli utkniesz, zacznij od zdania-startera.',
        },
    };
    return T[type] || T.writing;
}

/** The profile "intensity" setting is now DIFFICULTY only (task count is always 5–6). */
function difficultyGuide(intensity) {
    if (intensity === 'light') return 'easier: the lower end of the CEFR band, shorter items, more support.';
    if (intensity === 'stretch') return 'challenge: the upper end of the CEFR band, trickier items.';
    return 'standard: solid practice in the middle of the CEFR band.';
}

/** Minimum open-cloze tasks per lesson at the higher levels (also with "Wyzwanie" / "Łatwiej"). */
export const OPEN_CLOZE_MIN = { B2: 1, C1: 2 };
function openClozeRule(cefr) {
    const min = OPEN_CLOZE_MIN[cefr] || 0;
    if (min >= 2) return `Use 2–3 uoe tasks. At least ${min} of them MUST be "open_cloze" (each with its own text); the other may use another format.`;
    if (min === 1) return 'Use 2 uoe tasks with DIFFERENT formats; one of them MUST be "open_cloze".';
    return 'Use 1–2 uoe tasks with DIFFERENT formats; at least one closed (options) and one open format over the lesson when there are two.';
}

/**
 * Enforce the open-cloze minimum: missing open clozes are made from mc_text tasks whose answers are
 * single words (options removed, same text and keys). Returns { tasks, openClozeShort } — the number still missing.
 */
export function ensureOpenCloze(tasks, cefr) {
    const min = OPEN_CLOZE_MIN[String(cefr || '').toUpperCase()] || 0;
    let have = tasks.filter((t) => t.type === 'uoe' && t.format === 'open_cloze').length;
    if (have >= min || !tasks.some((t) => t.type === 'uoe')) return { tasks, openClozeShort: 0 };
    const out = tasks.map((t) => {
        if (have >= min || t.type !== 'uoe' || t.format !== 'mc_text') return t;
        if (!/\{\{\s*\d+\s*\}\}/.test(String(t.prompt || '')) || !t.items.length) return t;
        if (!t.items.every((it) => /^[\p{L}']+$/u.test(String(it.answer || '').trim()))) return t;
        have += 1;
        return { ...t, format: 'open_cloze', instruction: uoeInstruction('open_cloze', cefr),
            items: t.items.map(({ options, ...it }) => ({ ...it, q: '' })), convertedFrom: 'mc_text' };
    });
    return { tasks: out, openClozeShort: Math.max(0, min - have) };
}

export function grammarFormatsFor(cefr) {
    const lv = UOE_LEVELS[String(cefr || '').toUpperCase()];
    const all = GRAMMAR_UOE_FORMATS;
    if (!lv) return all.filter((f) => f === 'tense_form' || f === 'error_correction' || f === 'grammar_mc');
    return all.filter((f) => lv.formats.includes(f));
}

export function isGrammarUoeTask(task) {
    return task?.type === 'uoe' && GRAMMAR_UOE_FORMATS.includes(task.format);
}

/**
 * When the student asked for grammar, make sure the lesson actually contains grammar-focused UOE tasks.
 * Retags eligible open verb-form tasks; if still short, promotes a simple/brackets uoe into tense_form.
 */
export function ensureGrammarTasks(tasks, cefr, prefs = []) {
    const want = (Array.isArray(prefs) ? prefs : []).map((p) => String(p || '').toLowerCase()).includes('grammar');
    if (!want) return { tasks, grammarShort: 0 };
    const allowed = new Set(grammarFormatsFor(cefr));
    let list = (tasks || []).map((t) => {
        if (t?.type !== 'uoe') return t;
        if (GRAMMAR_UOE_FORMATS.includes(t.format) && allowed.has(t.format)) return t;
        // Retag obvious verb-form "brackets/simple" as tense_form when allowed.
        if (allowed.has('tense_form') && (t.format === 'brackets' || t.format === 'simple')
            && (t.items || []).some((it) => it.cue) && isVerbFormTask(t)) {
            return { ...t, format: 'tense_form', instruction: uoeInstruction('tense_form', cefr) };
        }
        return t;
    });
    let have = list.filter(isGrammarUoeTask).length;
    const need = 2;
    if (have >= need) return { tasks: list, grammarShort: 0 };
    list = list.map((t) => {
        if (have >= need || t?.type !== 'uoe') return t;
        if (isGrammarUoeTask(t)) return t;
        if (!allowed.has('tense_form')) return t;
        if (!(t.items || []).length) return t;
        if ((t.items || []).every((it) => it.cue || /___/.test(String(it.q || '')))) {
            have += 1;
            return {
                ...t,
                format: 'tense_form',
                instruction: uoeInstruction('tense_form', cefr),
                convertedToGrammar: true,
                items: t.items.map((it) => ({ ...it, options: undefined })),
            };
        }
        if (allowed.has('error_correction') && (t.items || []).some((it) => it.lead)) {
            have += 1;
            return { ...t, format: 'error_correction', instruction: uoeInstruction('error_correction', cefr), convertedToGrammar: true };
        }
        return t;
    });
    return { tasks: list, grammarShort: Math.max(0, need - have) };
}

function uoeRuleText(cefr, nameLang) {
    const lv = UOE_LEVELS[cefr];
    if (!lv) return `CEFR ${cefr} has no exam mapping: use grammar-friendly open formats "tense_form" / "error_correction" / "grammar_mc" or "simple" — sentences with ONE "___" and a bracket cue for verb forms.`;
    const spec = {
        mc_sentences: `"mc_sentences": 3–5 single sentences (or a sentence + reply); item "q" with ONE "___"; "options": ${lv.options} short choices; "answer" = the correct option text.`,
        mc_dialogue: '"mc_dialogue": 3–4 two-line mini-dialogues ("A: …\nB: ___ …"); "q" with ONE "___"; "options"; "answer" = the option text.',
        mc_translation: `"mc_translation": 3–5 English sentences with ONE "___"; "pl" = the Polish fragment that the gap translates (shown in brackets); "options": ${lv.options} English versions; "answer" = the right one.`,
        mc_text: `"mc_text": a 60–110 word English text in "prompt" with {{1}}…{{n}} gaps (4–5 gaps); each item: "q": "", "options": ${lv.options} choices, "answer" = the option text.`,
        two_sentences: '"two_sentences": 3–4 items; "q" = TWO sentences separated by "\n", each with ONE "___", the same word fits both; "options": 3 words; "answer".',
        brackets: '"brackets": 3–5 sentences; "q" with ONE "___"; "cue" = the word(s) in brackets to use in the right form (e.g. "not / like"); "answer" = the full gap (max 3 words); "alts" = other correct versions (e.g. contractions).',
        translation: `"translation": 3–5 English sentences with ONE "___"; "pl" = the Polish fragment to translate (max ${['B2', 'C1'].includes(cefr) ? 5 : 4} English words); "answer" + "alts" (all correct translations, contractions).`,
        word_formation: '"word_formation": a 70–120 word English text in "prompt" with {{1}}…{{n}} gaps (4–5); each item "cue" = the base word in CAPITALS to transform, "answer" = ONE word, "alts" = other correct forms.',
        open_cloze: '"open_cloze": a 70–120 word English text in "prompt" with {{1}}…{{n}} gaps (4–6); each item "q": "", "answer" = ONE word (grammar/collocation words), "alts".',
        transformation: '"transformation": 3–4 items; "lead" = the original sentence; "key" = ONE given word (shown in capitals, must be used unchanged); "q" = the second sentence with ONE "___" (max 5 words incl. the key word); "answer" + "alts".',
        lexical_set: '"lexical_set": 3 items; "q" = THREE sentences separated by "\n", each with ONE "___"; ONE word (same form) fits all three — collocations/phrasal meanings; "answer" + "alts".',
        tense_form: '"tense_form": 3–5 sentences; "q" with ONE "___"; "cue" = BASE verb (e.g. "go", "not / like"); "answer" = the correct tense/aspect form (max 3 words); "alts" = contractions/full forms. Pure grammar — not vocabulary meaning.',
        error_correction: '"error_correction": 3–5 items; "lead" = the FULL incorrect English sentence (exactly one grammar mistake); "errorFrom" = the exact wrong word or contiguous words in lead (e.g. "would be", "to go", "Despite of"); "answer" = ONLY the replacement fragment for that span (e.g. "were", "going", "Despite") — never the whole sentence; "alts" = other valid replacement fragments. The UI lets the student click those words and type only the fix. Do NOT target rare-word spelling — target tense, agreement, articles, prepositions, word order, pronouns.',
        sentence_rewrite: '"sentence_rewrite": 3–4 items; "lead" = original sentence; "rule" = short grammar label in CAPITALS (PASSIVE / REPORTED SPEECH / FIRST CONDITIONAL / COMPARATIVE / HAVE SOMETHING DONE / SO-SUCH…); "q" = rewritten stem with ONE "___" (max 6 words) OR "" if the whole rewrite is the answer; "answer" + "alts". Keep meaning; change structure as the rule requires.',
        grammar_mc: `"grammar_mc": 3–5 sentences targeting articles / prepositions / quantifiers / relative pronouns / verb forms; item "q" with ONE "___"; "options": ${lv.options} short choices; "answer" = the correct option. Grammar focus only.`,
    };
    const examBit = lv.exam
        ? `must follow the Polish CKE exam (${lv.name}, "znajomość środków językowych") for ${cefr}`
        : `should suit CEFR ${cefr} (${lv.name}) with clear grammar-focused items`;
    return `Use of English ${examBit}. Set "format" on every "uoe" task to ONE of: ${lv.formats.join(', ')}. ${openClozeRule(cefr)} Keep the exam/school style but use the session topic/vocabulary. Grammar formats (tense_form, error_correction, sentence_rewrite, grammar_mc, brackets, transformation) practise STRUCTURE, not word meaning. Write "instruction" in Polish (the app shows the official/band wording). Formats:
${lv.formats.map((f) => `    - ${spec[f]}`).join('\n')}`;
}

export function buildOwnTimeLessonPrompt(v) {
    const instrLangName = v.instrLang === 'en' ? 'English' : 'Polish';
    const audience = instructionAudience({ age: v.age, cefr: v.cefr });
    const young = audience.band === 'kid' || audience.band === 'young';
    const lowLevel = ['A0', 'A1', 'A2'].includes(audience.cefr) || audience.age < 12;
    const x = v.extraContext;
    const extraBlock = v.extra && x ? `
EXTRA PRACTICE ("Keep going" set ${x.setNumber} today): the student already finished today's lesson${x.previousTitle ? ` "${x.previousTitle}"` : ''} and wants more.
- Same format, level and rules as below; build on the same topic/focus${x.focus ? ` (${x.focus})` : ''} from a fresh angle.
- Recycle the weak spots below with NEW sentences/items (do not copy them):
${x.weak.length ? x.weak.map((w) => `  * ${w}`).join('\n') : '  * (none recorded — consolidate the same skills)'}
- Do NOT reuse any of these items, answers or texts: ${x.avoid.length ? x.avoid.join(' | ') : '(none)'}
- Use a different title from the previous lesson.
` : '';
    const lastFocus = v.recentFeedback[0]?.focusNexts || [];
    const feedbackBlock = (v.recentFeedback.length
        ? `Recent student feedback (adapt level/focus):\n${JSON.stringify(v.recentFeedback)}`
        : 'No prior feedback yet — start gently at the stated level.')
        + (lastFocus.length > 1 ? `\nThe student wants to practise ALL of: ${lastFocus.join(', ')} (drill → vocab_drill/unscramble, uoe → uoe/word_order, vocab → vocab_drill, grammar → uoe grammar formats) — give EVERY one of these focuses at least one task in this set.` : '');
    const vocabBlock = v.vocabPlan?.active ? vocabPromptBlock(v.vocabPlan, { instrLangName, prevSet: v.prevSet }) : '';

    return `You are a friendly English practice coach for Polish school students (LingoSpark "In your own time").
Create ONE short personalised practice lesson JSON for this student.

STUDENT:
- Age: ${v.age ?? 'unknown'}
- Class / year: ${v.classLabel || 'n/a'}
- CEFR: ${v.cefr}
- Interests: ${v.interests.join(', ') || 'general school topics'}
- Preferred task types: ${v.taskPrefs.join(', ')}
- Why they need English: ${v.purpose || 'school'}
- Difficulty: ${v.intensity} → ${difficultyGuide(v.intensity)}
- Optional topic for this session: ${v.topic || '(invent a fresh topic from interests)'}
- Optional vocabulary to weave in: ${v.vocabPlan?.active ? '(see VOCABULARY LIST MODE below)' : (v.vocab || '(none — pick useful words for the topic/level)')}
${vocabBlock}${feedbackBlock}${extraBlock}

HARD RULES:
1. The lesson has EXACTLY 5 or 6 tasks (never fewer than 5, never more than 6) — also for extra sets. No time limits or minutes anywhere.
2. Practice MATERIAL (reading texts, gap sentences, writing prompts, vocab items) MUST be in English at CEFR ${v.cefr}, suitable for age ${v.age ?? 'teen'}.
3. Every coach-facing string — task "instruction", "coachNote", lesson "title" — MUST be written in ${instrLangName} (${v.instrLang}).
4. ${instructionToneGuide({ age: v.age, cefr: v.cefr, instrLang: v.instrLang })}
4b. The "instruction" (polecenie) itself must match this student's age AND CEFR: vocabulary and sentence structure of the instruction change with the band (kid ≠ exam ≠ adult). Never reuse one generic instruction for every learner. Never mention a word box / ramka / word bank.
5. Prefer the student's task types. Allowed types: vocab_drill, uoe, reading, writing, word_order, unscramble (map prefs: vocab/drill→vocab_drill or unscramble, uoe→uoe or word_order, reading→reading, writing→writing, grammar→uoe with a grammar format from GRAMMAR list below).
5a. TASK MIX for the 5–6 tasks: at most ONE writing and at most ONE reading task; 1–2 "uoe" tasks; fill the rest with vocab_drill (and tile tasks for lower levels). Order from easier (vocabulary) to harder (writing last).
5c. GRAMMAR: when "grammar" is among preferred task types (or the student asked for grammar), include at least TWO "uoe" tasks whose "format" is strictly grammar: tense_form, error_correction, sentence_rewrite, grammar_mc, brackets (verb form), or transformation (B2+). A word set / topic may supply vocabulary context, but each item must practise a grammar point (tense/aspect, voice, reported speech, conditionals, articles, prepositions, quantifiers, relative pronouns, agreement, word order of grammar — NOT vocab meaning gaps). Prefer productive type-in (tense_form / error_correction / sentence_rewrite / brackets / transformation) over grammar_mc except at A0–A1 where one short grammar_mc is fine. Never mention a word box.
5b. LOWER LEVELS: ${lowLevel
        ? `this student is ${v.cefr}${v.age != null ? `, age ${v.age}` : ''} — include ONE–TWO tile tasks ("word_order" and/or "unscramble") within the 5–6 tasks (they count towards the 5–6).`
        : v.cefr === 'B1' ? 'B1: you MAY use one short "word_order" task (tricky word order: adverbs, questions) — optional.' : 'B2+: do NOT use word_order or unscramble.'}
    - "word_order": 3–5 items; each item "answer" = ONE correct English sentence of 4–9 words using the session topic/vocabulary (the app shuffles the words; don't start with a name); "q" = short ${instrLangName} translation or cue (optional); "alts" = other fully correct word orders if any (e.g. moved time phrase).
    - "unscramble": 4–6 items; each "answer" = ONE English word (3–10 letters, from the session vocabulary); "q" = short English clue/definition (or ${instrLangName} translation for A0–A1); "emoji" = one fitting emoji or "".
6. Include modelAnswers or expected answers for closed items so the app can check locally.
7. For reading: short English text (60–120 words) + 2–3 comprehension questions with short answers (1–4 words, in English). A question may be a sentence to complete with ONE "___" gap.
7a. READING CLARITY (especially A0–A2 and under-12): simple, direct, age-appropriate sentences. State facts and relations directly ("Nina is Leo's cousin.", "Leo lives in a small town near a lake.") — never convoluted kinship or relational phrasing (NOT "Nina is his aunt and uncle's child"), no ambiguity, no apparent contradictions, no trick questions. Give reading items "acceptedAnswers" with the short key phrase AND natural variants (e.g. "small town", "in a small town", "a small town near a lake").
7b. SELF-CHECK before replying: for every reading question, the text contains exactly ONE clear, unambiguous answer, stated in plain words a ${v.cefr} learner understands; rewrite the text or the question if not.
7c. READING QUESTIONS must be properly posed: real question form (Wh- / Yes-No / gap-to-complete) ending with "?" when not a gap; no vague stems ("Tell about…", "Something about…"); no questions the text cannot answer; no questions that contradict the text. If a draft question fails this, rewrite or replace it before you reply.
8. For writing: one short prompt (2–6 sentences depending on level).
9. USE OF ENGLISH ("uoe"): ${uoeRuleText(v.cefr)} Never put a gap only at the end as a separate question; text gaps are {{1}}, {{2}}… in order, one per item.
10. For vocab_drill: translate / definition → word / gap sentences with the session vocabulary. Gap sentences use ONE "___" in "q"; definition/translation items put the cue in "q" with no gap. Keep each q under 90 characters so the task fits on one screen.
10b. ACCEPTED ANSWERS (every typed/open item): besides "answer", give "acceptedAnswers": an array with ALL other fully correct variants, like a CKE answer key — synonyms that fit the context and the rules (e.g. "despite" / "in spite of"), contracted and full forms ("don't" / "do not"), British/American spelling. Respect the format's word limits and key/given words in every variant. [] if there is truly only one answer.
10c. CHANGE OF FORM (Use of English gaps with a given word or expression — verb/word in brackets, "brackets", "word_formation", "correct form" gaps): the answer must ALWAYS require changing the given word (inflection, tense, plural, comparative, auxiliary + verb, negation, derivation with a prefix/suffix…). NEVER write a gap whose answer is the given word unchanged (e.g. "(play)" → "play" is forbidden; "(play)" → "played" / "is playing" is right). Exception: "transformation" keeps its KEY word unchanged on purpose. WORD FORMATION: the answer must NEVER equal the given word (ignoring capitals) — "(HAPPY)" → "happy" is forbidden; "(HAPPY)" → "unhappily" is right.
10d. NO REPEATED CUES: within one task every word in brackets / root cue must be different — never give two gaps the same base word (e.g. two gaps both "(go)" or both "(CREATE)").
10a. WORD CUE (gap-fill: vocab_drill gap sentences, verb-form / "correct form", "simple", "brackets", "word_formation", "open_cloze", "lexical_set"): NEVER use a word box, wordBank, "use these words", "words from the box", "extra words", or any list of answer words above the items — that UI does not exist. Put the bracket cue ONLY in item "cue" — never also write "(word)" next to "___" in "q" (the app shows the cue once). For form-change tasks give every item a bracket cue in "cue" (verb-form: BASE verb, e.g. "go" for "went"; word formation: stem in CAPITALS). A cue must never equal the answer itself unless the student must change its form. open_cloze at higher levels: no cues (exam style). Do NOT add a cue to translation tasks (the Polish words in brackets are the cue) or to tasks with options. Instructions must NEVER mention a box, ramka, word bank, or extra/unused words.
    ${cueRuleText(cueTier(v))} (Challenge rises gradually with the level and the chosen difficulty.)
10b. ONE-SCREEN RULE: each task must fit on one screen — at most 6 items, reading text ≤ 120 words, instructions one short sentence.
11. STUDENT GUIDANCE (every task): the student works ALONE at home, so each task must be self-explanatory.
    - "steps": 2–4 very short numbered actions in ${instrLangName} (what to do first, next, last).
    - "example": ONE worked example in English showing exactly how to answer (for closed items: a solved item that is NOT one of the items).
    - "usefulLanguage": 3–6 English words/phrases/sentence starters at ${v.cefr} that help with THIS task (writing: starters + linking words).
    - "hint": one short tip in ${instrLangName} for when they are stuck.
12. WRITING length at ${v.cefr}: ${writingTarget(v.cefr).sentences[0]}–${writingTarget(v.cefr).sentences[1]} sentences (about ${writingTarget(v.cefr).words[0]}–${writingTarget(v.cefr).words[1]} words); put {"minSentences": n, "maxSentences": n} in "target" and one full model answer in "modelAnswers".
13. Lesson "goal": one sentence in ${instrLangName} starting "Po tej lekcji…" / "By the end…" saying what the student will be able to do.

Return ONLY valid JSON (no markdown):
{
  "title": "short lesson title in ${instrLangName}",
  "cefr": "${v.cefr}",
  "instrLang": "${v.instrLang}",
  "focus": "short focus tag",
  "goal": "what the student can do after this lesson — in ${instrLangName}",
  "coachNote": "one encouraging tip in ${instrLangName}",
  "tasks": [
    {
      "n": 1,
      "type": "vocab_drill",
      "instruction": "what to do — in ${instrLangName} (never mention a word box / ramka / extra words)",
      "format": "(uoe only) one of the allowed formats",
      "steps": ["krok 1", "krok 2"],
      "example": "worked example in English",
      "usefulLanguage": ["phrase 1", "phrase 2", "phrase 3"],
      "hint": "short tip in ${instrLangName}",
      "target": {"minSentences": 3, "maxSentences": 4},
      "prompt": "English material / stem",
      "items": [
        {"q": "sentence with ___ where the answer goes (or cue / question)", "answer": "…", "acceptedAnswers": ["(every OTHER fully correct variant, CKE-key style)"], "options": ["(mc formats only)"], "cue": "(brackets / word_formation)", "pl": "(translation formats: Polish fragment)", "lead": "(transformation: original sentence)", "key": "(transformation: KEY WORD)"}
      ],
      "modelAnswers": []
    }
  ]
}`;
}

/** Canonical gap marker in item text: ____ / … / [...] → "___" (prompt-level {{n}} markers are kept). */
export function normalizeGapMarker(q) {
    return String(q ?? '').replace(/_{3,}|\[\s*(?:…|\.\.\.)\s*\]/g, '___');
}

/** Resolve the uoe format for a level; unknown/mismatched formats are inferred from the item structure. */
export function resolveUoeFormat(task, cefr) {
    const lv = UOE_LEVELS[cefr];
    if (!lv) return 'simple';
    const want = String(task?.format || '').trim().toLowerCase();
    if (lv.formats.includes(want)) return want;
    const items = Array.isArray(task?.items) ? task.items : [];
    const has = (k) => items.some((it) => it && it[k] != null && String(it[k]).length && (!Array.isArray(it[k]) || it[k].length));
    const textGaps = /\{\{\s*\d+\s*\}\}/.test(String(task?.prompt || task?.text || ''));
    const pick = (...fs) => fs.find((f) => lv.formats.includes(f));
    if (has('options')) return pick(textGaps ? 'mc_text' : (has('pl') ? 'mc_translation' : 'mc_sentences'), 'mc_text', 'mc_sentences') || lv.open;
    if (has('key') && has('lead')) return pick('transformation') || lv.open;
    if (has('lead') && !has('key')) {
        const looksErr = items.some((it) => /error|mistake|błęd|incorrect|wrong/i.test(String(it?.rule || it?.focus || task?.instruction || '')));
        return pick(looksErr ? 'error_correction' : 'sentence_rewrite', 'error_correction', 'sentence_rewrite', 'tense_form') || lv.open;
    }
    if (has('pl')) return pick('translation') || lv.open;
    if (textGaps) return pick(has('cue') ? 'word_formation' : 'open_cloze', 'open_cloze', 'word_formation') || lv.open;
    if (has('cue') && !has('options')) return pick('tense_form', 'brackets') || lv.open;
    return lv.open;
}

const clean = (s, n) => String(s ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, n);

/** Normalise one Use of English item for its CKE format; returns null if the item doesn't fit the format. */
export function buildUoeItem(format, it, cefr) {
    const f = UOE_FORMATS[format] || UOE_FORMATS.simple;
    const q = normalizeGapMarker(clean(it?.q || it?.question, 500));
    let answer = clean(it?.answer || it?.expected, 300);
    const alts = acceptedList(it).map((a) => clean(a, 300)).filter((a) => a && looseKey(a) !== looseKey(it?.answer)).slice(0, 8);
    const out = { q, answer, alts };
    if (f.kind === 'mc') {
        const lv = UOE_LEVELS[cefr];
        const want = lv ? lv.options : 3;
        const opts = [];
        for (const o of (Array.isArray(it?.options) ? it.options : [])) {
            const s = clean(String(o).replace(/^[A-D][).:]\s+/, ''), 120);
            if (s && !opts.some((x) => looseKey(x) === looseKey(s))) opts.push(s);
        }
        if (/^[A-D]$/i.test(answer) && opts.length) answer = opts['ABCD'.indexOf(answer.toUpperCase())] || answer;
        const hit = opts.find((o) => looseKey(o) === looseKey(answer));
        if (!hit || opts.length < 3) return null;
        out.answer = hit;
        out.options = opts.slice(0, Math.max(want, opts.indexOf(hit) + 1)).slice(0, 4);
        if (out.options.length > want && out.options.indexOf(hit) < want) out.options = out.options.slice(0, want);
    }
    if (!out.answer) return null;
    const cue = clean(it?.cue, 60).replace(/^\(|\)$/g, '');
    if (cue) out.cue = cue;
    else if (f.text && q && !/___/.test(q) && q.length <= 30) { out.cue = q.replace(/^\(|\)$/g, ''); out.q = ''; }
    // One bracket cue only: move ___ (go) / (go) ___ into cue and strip from q.
    Object.assign(out, dedupeBracketCue(out));
    delete out._bracketPairsNearGap;
    if (f.needsPl) {
        let pl = clean(it?.pl || it?.polish, 120).replace(/^\(|\)$/g, '');
        if (!pl) { const m = q.match(/\(([^()]{2,80})\)\s*___/); if (m) { pl = m[1]; out.q = q.replace(m[0], '___'); } }
        if (!pl || !/___/.test(out.q)) return null;
        out.pl = pl;
    }
    if (f.needsKey) {
        const key = clean(it?.key || it?.keyword, 30).replace(/[^\p{L}'-]/gu, '').toUpperCase();
        const lead = clean(it?.lead || it?.source, 300);
        if (!key || !lead || !/___/.test(q)) return null;
        out.key = key; out.lead = lead;
    }
    if (f.needsLead || format === 'error_correction' || format === 'sentence_rewrite') {
        const lead = clean(it?.lead || it?.source || (!/___/.test(q) ? q : ''), 400);
        if (!lead) return null;
        out.lead = lead;
        if (!/___/.test(out.q) || out.q === lead) out.q = /___/.test(q) && q !== lead ? q : '';
        const rule = clean(it?.rule || it?.focus || it?.transform || '', 40).toUpperCase();
        if (rule) out.rule = rule;
    }
    if (format === 'error_correction') {
        const errorFrom = clean(it?.errorFrom || it?.wrong || it?.error, 80);
        if (errorFrom) out.errorFrom = errorFrom;
        // Prefer fragment answers: if the AI returned the full corrected sentence, keep it as corrected and try to recover a fragment.
        const enriched = enrichErrorItem(out);
        if (!enriched.errorFrom && !errorFrom) return null;
        return enriched;
    }
    if (format === 'lexical_set' && (q.match(/___/g) || []).length < 2) return null;
    if (format === 'two_sentences' && (q.match(/___/g) || []).length < 2) return null;
    return out;
}

/** Repair a 1–4 task lesson towards 5 by splitting sentence-based closed tasks with 4+ items in two. */
function splitToMinimum(tasks) {
    const out = tasks.slice();
    let guard = 0;
    while (out.length < OWN_TIME_TASKS_MIN && guard++ < 6) {
        let best = -1;
        out.forEach((t, i) => {
            const textGaps = /\{\{\s*\d+\s*\}\}/.test(t.prompt);
            if (t.items.length >= 4 && !textGaps && t.type !== 'reading' && t.type !== 'writing' && (best < 0 || t.items.length > out[best].items.length)) best = i;
        });
        if (best < 0) break;
        const t = out[best];
        const half = Math.ceil(t.items.length / 2);
        out.splice(best, 1, { ...t, items: t.items.slice(0, half) }, { ...t, items: t.items.slice(half), example: '' });
    }
    return out.map((t, i) => ({ ...t, n: i + 1 }));
}

/* ---------- Word cues for gap-fill tasks ---------- */
const CUE_EXEMPT_FORMATS = new Set(['mc_sentences', 'mc_dialogue', 'mc_translation', 'mc_text', 'two_sentences', 'translation', 'transformation', 'error_correction', 'sentence_rewrite', 'grammar_mc']);
const CUE_REQUIRED_FORMATS = new Set(['brackets', 'word_formation', 'tense_form']);
const BRACKET_AFTER_GAP = /(_{3,})\s*\(([^()]{1,40})\)/;
const BRACKET_BEFORE_GAP = /\(([^()]{1,40})\)\s*(_{3,})/;
/** Strip inline (cue) from the gap sentence so the UI shows the cue at most once (via item.cue). */
export function dedupeBracketCue(it) {
    if (!it || typeof it !== 'object') return it;
    const out = { ...it };
    let q = String(out.q || '');
    let cue = String(out.cue || '').replace(/^\(|\)$/g, '').trim();
    const after = q.match(BRACKET_AFTER_GAP);
    if (after) {
        if (!cue) cue = after[2].trim();
        q = q.replace(after[0], after[1]);
    }
    const before = q.match(BRACKET_BEFORE_GAP);
    if (before) {
        if (!cue) cue = before[1].trim();
        q = q.replace(before[0], before[2]);
    }
    if (cue) {
        const esc = cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Remove every remaining copy of (cue) / （cue） so render won't double up.
        q = q.replace(new RegExp('\\s*\\(\\s*' + esc + '\\s*\\)', 'gi'), '');
        out.cue = cue;
    }
    out.q = q.replace(/\s{2,}/g, ' ').trim();
    // Count remaining bracket pairs next to a gap — must be zero after dedupe.
    out._bracketPairsNearGap = ((out.q.match(BRACKET_AFTER_GAP) ? 1 : 0) + (out.q.match(BRACKET_BEFORE_GAP) ? 1 : 0));
    return out;
}
const lowKey = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, '').replace(/\s+/g, ' ').trim();

/**
 * Stable shuffle that never leaves the words in answer order (so the box doesn't give the key away).
 * Repeated words are kept (a word that fills two gaps appears twice); pass { dedupe: true } to collapse them.
 */
export function shuffleWordBank(words, seedText = '', { dedupe = false } = {}) {
    const raw = words.map((w) => String(w || '').trim()).filter(Boolean);
    const list = dedupe ? [...new Set(raw)] : raw;
    if (list.length < 2) return list;
    let seed = 0;
    for (const ch of seedText + list.join('|')) seed = (seed * 31 + ch.codePointAt(0)) >>> 0;
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        const j = seed % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    if (new Set(list).size > 1 && out.every((w, i) => w === list[i])) out.push(out.shift());
    return out;
}

/**
 * Validate a word box against the gaps: every answer is present as many times as it is needed,
 * distractors that equal ANY correct answer (answer / alts / acceptedAnswers) are stripped,
 * duplicate distractors collapse, and distractors are capped at maxDistractors.
 * Returns { bank, distractors, added } (bank not yet shuffled).
 */
export function validateWordBank(given, items, maxDistractors = 0) {
    const answers = items.map((it) => clean(it.answer, 40)).filter(Boolean);
    const correctKeys = new Set();
    items.forEach((it) => [it.answer, ...(Array.isArray(it.alts) ? it.alts : []), ...(Array.isArray(it.acceptedAnswers) ? it.acceptedAnswers : [])]
        .forEach((a) => { const k = lowKey(a); if (k) correctKeys.add(k); }));
    const need = new Map();
    answers.forEach((a) => need.set(lowKey(a), (need.get(lowKey(a)) || 0) + 1));
    const have = new Map();
    const bank = [];
    const distractors = [];
    const seenD = new Set();
    for (const w of given) {
        const k = lowKey(w);
        if (!k) continue;
        if (need.has(k)) {
            if ((have.get(k) || 0) < need.get(k)) { bank.push(w); have.set(k, (have.get(k) || 0) + 1); }
            continue;
        }
        if (correctKeys.has(k) || seenD.has(k)) continue; // would fit a gap / repeated distractor
        if (distractors.length >= maxDistractors) continue;
        seenD.add(k); distractors.push(w);
    }
    const added = [];
    for (const a of answers) {
        const k = lowKey(a);
        if ((have.get(k) || 0) < need.get(k)) { bank.push(a); added.push(a); have.set(k, (have.get(k) || 0) + 1); }
    }
    return { bank: bank.concat(distractors), distractors, added };
}

/** Is this task a gap-fill that needs a word cue (box or bracket)? Translation / options / tile tasks are exempt. */
export function needsWordCue(task) {
    if (!task || !Array.isArray(task.items) || !task.items.length) return false;
    if (!['vocab_drill', 'uoe'].includes(task.type)) return false;
    if (task.format && CUE_EXEMPT_FORMATS.has(task.format)) return false;
    if (task.items.some((it) => Array.isArray(it.options) || it.pl)) return false;
    if (/przetłumacz|tłumacz|translat/i.test(String(task.instruction || ''))) return false;
    const textGaps = /\{\{\s*\d+\s*\}\}/.test(String(task.prompt || ''));
    return textGaps || task.items.some((it) => /_{3,}/.test(String(it.q || '')));
}

/**
 * Gap-fill cues: bracket / root cue on each gap (preferred), or open cloze (no cue).
 * There is NO word box ("Use these words") — never invent or keep a wordBank.
 * Bracket cues written into the sentence ("___ (go)") move into item.cue; a cue that simply equals
 * the answer is dropped (it would give the answer away). Verb-form / word-formation tasks drop
 * cue-less items when at least 2 cued items remain; otherwise they request a cue-repair call.
 */
/**
 * How much help a gap-fill cue gives, rising gradually with the level (0 = most help … 3 = exam):
 * A0–A2 or under 12 → 0, B1 → 1, B2 → 2, C1 → 3; "Łatwiej" (light) one step down, "Wyzwanie" (stretch) one up.
 */
export function cueTier({ cefr, age, intensity } = {}) {
    const base = { A0: 0, A1: 0, A2: 0, B1: 1, B2: 2, C1: 3 }[String(cefr || 'A2').toUpperCase()] ?? 0;
    let tier = Number.isFinite(Number(age)) && age != null && Number(age) < 12 ? Math.min(base, 0) : base;
    if (intensity === 'light') tier -= 1;
    if (intensity === 'stretch') tier += 1;
    return Math.max(0, Math.min(3, tier));
}
/** @deprecated Word boxes removed from In your own time — kept empty so old tests/imports do not crash. */
export const BOX_DISTRACTORS = [[0, 0], [0, 0], [0, 0], [0, 0]];
/** Formats with no cue at all at this tier (exam-style): B2+ open cloze, C1 open cloze + lexical sets. */
function cueFreeFormat(format, tier) {
    return (tier >= 2 && format === 'open_cloze') || (tier >= 3 && format === 'lexical_set');
}

/** Prompt text for the cue rule at this tier (no word boxes — bracket cues or open cloze only). */
export function cueRuleText(tier) {
    return [
        'LEVEL CUES (most help): give a base-form bracket cue on EVERY gap (verb forms: base verb in brackets; vocab: base/root in brackets). Never use a word box / word bank / "use these words" list. open_cloze may use short bracket cues too.',
        'LEVEL CUES (B1): prefer base-form bracket cues on every gap (verb forms: base verb). Never a word box. open_cloze: bracket cues OR open gaps with no list of words.',
        'LEVEL CUES (B2): bracket / root cues (base verb, word-family root). open_cloze has NO cues (exam format). Never a word box / word bank / "extra words".',
        'LEVEL CUES (C1 exam format): open_cloze and lexical_set have NO cues. Give cues only where the CKE exam has them (word_formation: root in CAPITALS; transformation: key word; brackets: words in brackets). Never a word box / "use these words" / distractors list.',
    ][tier] || '';
}

/**
 * Randomise the order of multiple-choice options so the key is not always in the same slot:
 * the correct option never lands in the same position twice in a row. The answer is stored as option TEXT,
 * so checking is unaffected by the order. Seeded from the item text (stable per lesson).
 */
export function shuffleChoices(items, seedText = '') {
    let prev = -1;
    return items.map((it, n) => {
        if (!it || !Array.isArray(it.options) || it.options.length < 2) return it;
        const opts = it.options;
        const k = opts.length;
        let seed = n + 17;
        for (const ch of `${seedText}|${it.q}|${it.answer}|${opts.join('|')}`) seed = (seed * 31 + ch.codePointAt(0)) >>> 0;
        const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        const others = opts.filter((o) => o !== it.answer);
        for (let i = others.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
        const slots = [...Array(k).keys()].filter((s) => s !== prev);
        const pos = slots[Math.floor(rnd() * slots.length)];
        prev = pos;
        others.splice(pos, 0, it.answer);
        return { ...it, options: others };
    });
}

/* ---------- Use of English: the given word must change form ---------- */
const cueWords = (cue) => lowKey(String(cue || '').replace(/[\/,+]/g, ' ')).split(' ').filter(Boolean);
/**
 * A gap whose answer just repeats the given word(s) unchanged (cue "play" → answer "play"; cue "not / like" → "not like").
 * Not used for "transformation" (its key word stays unchanged by design).
 */
export function isUnchangedGap(it) {
    const inQ = String(it?.q || '').match(BRACKET_AFTER_GAP);
    const cue = cueWords(it?.cue || (inQ ? inQ[2] : ''));
    const ans = lowKey(it?.answer).split(' ').filter(Boolean);
    if (!cue.length || !ans.length) return false;
    if (ans.length !== cue.length) return false;
    return [...ans].sort().join(' ') === [...cue].sort().join(' ');
}

/**
 * Safety net: in Use of English gap tasks every item with a given word must need a changed form.
 * Unchanged items are removed (text gaps are filled in and the remaining {{n}} renumbered); if that would
 * leave no items the task is dropped by the normaliser (never shown with an unchanged cue).
 */
export function enforceFormChange(task) {
    if (!task || task.type !== 'uoe' || task.format === 'transformation' || !Array.isArray(task.items)) return task;
    const bad = task.items.map((it, i) => (isUnchangedGap(it) ? i : -1)).filter((i) => i >= 0);
    if (!bad.length) return task;
    return dropItems(task, bad, { formChangeDropped: bad.length });
}

/** Remove items (by index) from a task; text gaps are filled with their answers and the {{n}} renumbered. */
export function dropItems(task, bad, extra = {}) {
    const textGaps = /\{\{\s*\d+\s*\}\}/.test(String(task.prompt || ''));
    let prompt = task.prompt;
    if (textGaps) {
        // Fill the dropped gaps with their answers, then renumber the remaining markers in order.
        bad.forEach((i) => { prompt = prompt.replace(new RegExp(`\\{\\{\\s*${i + 1}\\s*\\}\\}`), () => task.items[i].answer); });
        let n = 0;
        prompt = prompt.replace(/\{\{\s*\d+\s*\}\}/g, () => `{{${++n}}}`);
    }
    return { ...task, prompt, items: task.items.filter((_, i) => !bad.includes(i)), ...extra };
}

/** The bracket cue of an item (item.cue or "___ (cue)" in the sentence), normalised for comparison. */
const itemCueKey = (it) => { const m = String(it?.q || '').match(BRACKET_AFTER_GAP); return lowKey(String(it?.cue || (m ? m[2] : '')).replace(/[\/,+]/g, ' ')); };
/** Within a task every bracket cue must be different: later gaps repeating a cue word are dropped. */
export function enforceUniqueCues(task) {
    if (!task || !Array.isArray(task.items) || task.format === 'transformation') return task;
    const seen = new Set();
    const bad = [];
    task.items.forEach((it, i) => { const k = itemCueKey(it); if (!k) return; if (seen.has(k)) bad.push(i); else seen.add(k); });
    return bad.length ? dropItems(task, bad, { duplicateCuesDropped: bad.length }) : task;
}

/* ---------- Instruction ↔ word box consistency ---------- */
const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, jeden: 1, jedno: 1, dwa: 2, dwie: 2, trzy: 3, cztery: 4, 'pięć': 5, 'sześć': 6, siedem: 7, osiem: 8, 'dziewięć': 9, 'dziesięć': 10 };
const NUM_RE = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|jeden|jedno|dwa|dwie|trzy|cztery|pięć|sześć|siedem|osiem|dziewięć|dziesięć)';
const numOf = (w) => Number(w) || NUM_WORDS[String(w).toLowerCase()] || null;
// Total-count phrasings: "There are 6 words in the box", "the box has six words", "Use 4 of the 6 words", "W ramce jest 6 wyrazów", "z sześciu"…
const TOTAL_RES = [
    new RegExp(`${NUM_RE}\\s+(?:words?|wyraz\\p{L}*|słów|słowa|słowo)\\s+(?:(?:are\\s+|jest\\s+|są\\s+)?(?:in|w)\\s+(?:the\\s+)?(?:box|ramce))`, 'iu'),
    new RegExp(`(?:box|ramce|ramka)\\s+(?:has|contains|includes|ma|zawiera|jest|są)\\s+${NUM_RE}\\s+(?:words?|wyraz\\p{L}*|słów|słowa)`, 'iu'),
    new RegExp(`(?:of|spośród|z)\\s+(?:the\\s+|tych\\s+|podanych\\s+)?${NUM_RE}\\s+(?:words?|wyraz\\p{L}*|słów)`, 'iu'),
];
const sentences = (s) => String(s || '').match(/[^.!?]+[.!?]?\s*/g) || [];
// Sentences that state how many extra words the box has ("There are two extra words." / "Dwa wyrazy są zbędne." / "W ramce są 2 dodatkowe słowa.").
const EXTRA_SENTENCE = /[^.!?]*(\b(extra|additional|spare)\s+words?\b|\bwords?\b[^.!?]*\b(not needed|do(?:es)? not fit|you (?:do not|don't) need)|\bwords?\s+(?:are|is)\s+(?:extra|spare)|\bsą\s+dodatkow|you (?:do not|don't) need \w+ of the words|zbędn|dodatkow\w*\s+(?:wyraz|słow)|nie pasuj\w*\s+do\s+żadnej)[^.!?]*[.!?]?\s*/giu;
// Phrases that point at a box ("from the box", "z ramki", "podanymi w ramce").
const BOX_REF = /\s*(?:from|in)\s+the\s+(?:word\s+)?box\b|\s*(?:z\s+ramki|podanymi\s+w\s+ramce|w\s+ramce)\b/giu;
const BRACKET_REF = /\b(?:in\s+brackets|from\s+the\s+brackets|z\s+nawias\w*|w\s+nawias\w*)\b/iu;

/** Does the instruction talk about a word box / extra words / brackets? (number of extra words if stated, else null) */
export function instructionCueRefs(text) {
    const s = String(text || '');
    const box = new RegExp(BOX_REF.source, 'iu').test(s) || /\bbox\b|ramk/iu.test(s);
    const m = s.match(new RegExp(`${NUM_RE}\\s+words?\\s+(?:are|is)\\s+(?:extra|spare|not needed)`, 'iu'))
        || s.match(new RegExp(`${NUM_RE}\\s+(?:extra|additional|spare|dodatkow\\p{L}*|zbędn\\p{L}*)`, 'iu'))
        || s.match(new RegExp(`${NUM_RE}\\s+(?:wyraz\\p{L}*|słow\\p{L}*|słów)\\s+(?:jest\\s+|są\\s+)?(?:zbędn|niepotrzebn|dodatkow)`, 'iu'));
    const extra = m ? numOf(m[1]) : (new RegExp(EXTRA_SENTENCE.source, 'iu').test(s) ? -1 : null);
    let total = null;
    for (const re of TOTAL_RES) { const t = s.match(re); if (t) { total = numOf(t[1]); break; } }
    return { box, extra, total, brackets: BRACKET_REF.test(s) };
}

/** The extra-word sentence for a box with n distractors, in the instruction language. */
export function extraWordsSentence(n, lang = 'pl') {
    if (lang === 'en') return n === 0 ? 'Every word in the box is used.' : `There ${n === 1 ? 'is 1 extra word' : `are ${n} extra words`} in the box that you do not need.`;
    if (n === 0) return 'Wykorzystaj wszystkie wyrazy z ramki.';
    const form = n === 1 ? 'wyraz jest zbędny' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'wyrazy są zbędne' : 'wyrazów jest zbędnych');
    return `W ramce ${n} ${form}.`;
}

/**
 * Make the instruction match the cue actually shown: with a box, the stated number of extra words is
 * rewritten to the real distractor count (task.boxExtra) and a box reference is added if missing;
 * without a box, references to a box / extra words are removed (bracket-cue tasks keep their bracket wording).
 */
export function alignInstructionWithBox(task, lang) {
    if (!task || typeof task.instruction !== 'string' || !task.instruction) {
        if (!task) return task;
        const { wordBank, autoWordBank, boxExtra, ...rest } = task;
        return rest;
    }
    const L = lang || (/[ąćęłńóśźż]|uzupełnij|wpisz|przeczytaj/iu.test(task.instruction) ? 'pl' : 'en');
    const fallback = L === 'en' ? 'Complete the gaps.' : 'Uzupełnij luki.';
    const bracketInstr = L === 'en'
        ? 'Complete the gaps with the correct form of the words in brackets.'
        : 'Uzupełnij każde zdanie poprawną formą wyrazu z nawiasu.';
    const origRefs = instructionCueRefs(task.instruction);
    const hadBoxTalk = origRefs.box || origRefs.total != null || origRefs.extra != null
        || new RegExp(EXTRA_SENTENCE.source, 'iu').test(task.instruction)
        || new RegExp(BOX_REF.source, 'iu').test(task.instruction);
    // Word boxes are gone: strip every box / bank / extra-word phrasing (legacy + AI slips).
    let instr = task.instruction.replace(EXTRA_SENTENCE, '').trim();
    instr = sentences(instr).filter((x) => !TOTAL_RES.some((re) => re.test(x))).join('').trim() || instr;
    const cued = (task.items || []).some((it) => it.cue);
    if (hadBoxTalk && origRefs.box && cued && !origRefs.brackets) {
        instr = bracketInstr;
    } else {
        instr = instr
            .replace(BOX_REF, '')
            .replace(/\b(?:use|wykorzystaj|użyj|wpisz)\s+\d+\s+(?:of|z|spośród)\s+(?:the\s+|tych\s+|podanych\s+)?\d+\s+(?:words?|wyraz\p{L}*|słów)\b/giu, '')
            .replace(/\b(?:use|wykorzystaj|użyj)\s+(?:the\s+|tych\s+|these\s+)?(?:words?|wyrazy?|słów|słowa)\b/giu, '')
            .replace(/\b(Use the words|Użyj wyrazów|Użyj słów|Use these words|Użyj tych słów)\.?$/iu, '')
            .replace(/\b(with|using)\s+(the\s+)?words\.?$/iu, '')
            .replace(/\b(słowami|wyrazami)\.?$/iu, '')
            .replace(/\s+([.,!?])/g, '$1')
            .replace(/\s{2,}/g, ' ')
            .trim();
        const refs = instructionCueRefs(instr);
        const looksLikeInstr = /^(Complete|Fill|Write|Read|Choose|Match|Translate|Przekształć|Uzupełnij|Wpisz|Przeczytaj|Wybierz|Dopasuj|Przetłumacz)\b/u.test(instr);
        const remnant = hadBoxTalk && (
            !instr
            || instr.length < 10
            || instr === '.'
            || refs.box
            || refs.total != null
            || refs.extra != null
            || !looksLikeInstr
            || /\b(words?|wyrazy?|wyrazami|słów|słowa|słowami)\s*\.?$/iu.test(instr)
        );
        if (remnant) instr = cued ? bracketInstr : fallback;
    }
    const { wordBank, autoWordBank, boxExtra, ...rest } = task;
    return { ...rest, instruction: instr };
}

export function applyWordCues(task, ctx = {}) {
    const out = applyWordCuesRaw(task, ctx);
    const aligned = ctx.alignInstruction === false ? out : alignInstructionWithBox(out, ctx.lang);
    if (ctx.adaptInstruction === false) return aligned;
    return adaptTaskInstruction(aligned, { age: ctx.age, cefr: ctx.cefr || 'A2', instrLang: ctx.lang || 'pl' });
}

function applyWordCuesRaw(task, ctx = {}) {
    const tier = Number.isInteger(ctx.tier) ? ctx.tier : 0;
    if (!task) return task;
    // Always drop any word box (legacy stored lessons + AI slips).
    const stripBank = (obj) => {
        if (!obj) return obj;
        const { wordBank, autoWordBank, boxExtra, ...rest } = obj;
        return rest;
    };
    if (task?.type === 'uoe' && cueFreeFormat(task.format, tier)) {
        const { needsCueRepair, ...rest } = stripBank(task);
        return rest;
    }
    if (!needsWordCue(task)) return stripBank(task);

    const textGaps = /\{\{\s*\d+\s*\}\}/.test(String(task.prompt || ''));
    let items = task.items.map((it) => {
        const out = dedupeBracketCue({ ...it });
        delete out._bracketPairsNearGap;
        if (out.cue && lowKey(out.cue) === lowKey(out.answer) && task.format !== 'word_formation') {
            delete out.cue;
        }
        return out;
    });
    const isGap = (it) => textGaps || /_{3,}/.test(String(it.q || ''));
    const cued = (it) => !isGap(it) || Boolean(it.cue) || (textGaps && it.q && !/_{3,}/.test(it.q) && it.q.length <= 24);
    const verbForm = isVerbFormTask(task);
    if ((verbForm || CUE_REQUIRED_FORMATS.has(task.format)) && !textGaps) {
        const withCue = items.filter(cued);
        if (withCue.length >= 2 && withCue.length < items.length) items = withCue;
    }
    const { needsCueRepair: _rep, ...base } = stripBank(task);
    const out = { ...base, items };
    // Verb-form gaps still missing cues → ask the AI for base-form cues (no box fallback).
    if (verbForm && items.some((it) => isGap(it) && !cued(it))) out.needsCueRepair = true;
    return out;
}

/** "Correct form" tasks (verb forms, tenses, word in brackets) — their cue should be the base form. */
export function isVerbFormTask(task) {
    if (task?.format === 'brackets' || task?.format === 'tense_form') return true;
    return /\b(correct|right) (verb )?form|verb form|tense|odpowiedniej formie|właściwej formie|poprawnej formie|form[ęie] czasownik|czas(ie|u) /i.test(String(task?.instruction || ''));
}


/** Common irregular past/participle → base (enough to skip an AI cue-repair round-trip). */
const IRREGULAR_BASE = {
    was: 'be', were: 'be', been: 'be', am: 'be', is: 'be', are: 'be',
    went: 'go', gone: 'go', going: 'go',
    had: 'have', has: 'have', having: 'have',
    did: 'do', done: 'do', does: 'do', doing: 'do',
    said: 'say', saying: 'say',
    made: 'make', making: 'make',
    took: 'take', taken: 'take', taking: 'take',
    came: 'come', coming: 'come',
    saw: 'see', seen: 'see', seeing: 'see',
    got: 'get', gotten: 'get', getting: 'get',
    gave: 'give', given: 'give', giving: 'give',
    found: 'find', finding: 'find',
    thought: 'think', thinking: 'think',
    told: 'tell', telling: 'tell',
    became: 'become', becoming: 'become',
    showed: 'show', shown: 'show', showing: 'show',
    left: 'leave', leaving: 'leave',
    felt: 'feel', feeling: 'feel',
    put: 'put', putting: 'put',
    brought: 'bring', bringing: 'bring',
    began: 'begin', begun: 'begin', beginning: 'begin',
    kept: 'keep', keeping: 'keep',
    held: 'hold', holding: 'hold',
    wrote: 'write', written: 'write', writing: 'write',
    stood: 'stand', standing: 'stand',
    heard: 'hear', hearing: 'hear',
    let: 'let', letting: 'let',
    meant: 'mean', meaning: 'mean',
    set: 'set', setting: 'set',
    met: 'meet', meeting: 'meet',
    ran: 'run', running: 'run',
    paid: 'pay', paying: 'pay',
    sat: 'sit', sitting: 'sit',
    spoke: 'speak', spoken: 'speak', speaking: 'speak',
    lay: 'lie', lain: 'lie', lying: 'lie',
    led: 'lead', leading: 'lead',
    read: 'read', reading: 'read',
    grew: 'grow', grown: 'grow', growing: 'grow',
    lost: 'lose', losing: 'lose',
    fell: 'fall', fallen: 'fall', falling: 'fall',
    sent: 'send', sending: 'send',
    built: 'build', building: 'build',
    understood: 'understand', understanding: 'understand',
    drew: 'draw', drawn: 'draw', drawing: 'draw',
    broke: 'break', broken: 'break', breaking: 'break',
    spent: 'spend', spending: 'spend',
    cut: 'cut', cutting: 'cut',
    drove: 'drive', driven: 'drive', driving: 'drive',
    bought: 'buy', buying: 'buy',
    wore: 'wear', worn: 'wear', wearing: 'wear',
    chose: 'choose', chosen: 'choose', choosing: 'choose',
    ate: 'eat', eaten: 'eat', eating: 'eat',
    taught: 'teach', teaching: 'teach',
    caught: 'catch', catching: 'catch',
    slept: 'sleep', sleeping: 'sleep',
    sold: 'sell', selling: 'sell',
};

/**
 * Guess a BASE-form bracket cue from an answer (e.g. "went" → "go", "are playing" → "play",
 * "doesn't like" → "not / like"). Returns '' when unsure — caller may fall back to AI repair.
 */
export function guessBaseCue(answer) {
    const raw = String(answer || '').trim();
    if (!raw) return '';
    let s = raw.toLowerCase().replace(/[\u2018\u2019\u02bc`´]/g, "'");
    // Aux + verb → cue the main verb (with optional "not /")
    const neg = /^(do|does|did|is|are|was|were|has|have|had|will|would|can|could|shall|should|may|might|must)\s+not\s+([\p{L}']+)$/u.exec(s)
        || /^(don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|won't|wouldn't|can't|couldn't|shouldn't)\s+([\p{L}']+)$/u.exec(s);
    if (neg) {
        const v = neg[2] || neg[neg.length - 1];
        const base = guessBaseCue(v) || v;
        return base && base !== raw.toLowerCase() ? `not / ${base}` : '';
    }
    const prog = /^(am|is|are|was|were|be|'s|'re|'m)\s+([\p{L}']+)$/u.exec(s);
    if (prog) {
        const v = prog[2];
        const base = guessBaseCue(v) || v.replace(/ing$/i, '') || v;
        return base && lowKey(base) !== lowKey(raw) ? base : '';
    }
    const perf = /^(has|have|had|'s|'ve)\s+([\p{L}']+)$/u.exec(s);
    if (perf) {
        const base = guessBaseCue(perf[2]) || perf[2];
        return base && lowKey(base) !== lowKey(raw) ? base : '';
    }
    // Single token
    const w = s.replace(/[^\p{L}']+/gu, '');
    if (!w) return '';
    if (IRREGULAR_BASE[w]) return IRREGULAR_BASE[w];
    // Regular morphology
    if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
    if (w.endsWith('ied') && w.length > 4) return `${w.slice(0, -3)}y`;
    if (w.endsWith('ing') && w.length > 5) {
        const stem = w.slice(0, -3);
        if (/(.)\1$/.test(stem) && !/(ee|oo)$/.test(stem)) return stem.slice(0, -1); // running → run
        if (stem.endsWith('y') || stem.length <= 2) return stem;
        return stem.endsWith('e') ? stem : `${stem}`; // playing → play; making kept via irregular
    }
    if (w.endsWith('ed') && w.length > 4) {
        const stem = w.slice(0, -2);
        if (/(.)\1$/.test(stem)) return stem.slice(0, -1); // stopped → stop
        if (stem.endsWith('i')) return `${stem.slice(0, -1)}y`;
        return stem.endsWith('e') ? stem : stem; // liked → like if we had e; walked → walk
    }
    if (w.endsWith('es') && w.length > 4) {
        if (w.endsWith('ches') || w.endsWith('shes') || w.endsWith('sses') || w.endsWith('xes') || w.endsWith('zes')) return w.slice(0, -2);
        return w.slice(0, -1);
    }
    // 3rd-person -s only — skip noun/adjective suffixes so "happiness" does not become "happines".
    if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')
        && !/(ness|tion|sion|ment|ship|hood|ance|ence|ity|ism|ist|ful|less|ous|ive|able|ible|ing)$/.test(w)) {
        return w.slice(0, -1);
    }
    return '';
}

/** Fill missing verb-form cues locally; clears needsCueRepair when every gap has a cue. */
export function applyLocalCueRepair(lesson) {
    if (!lesson?.tasks?.length) return lesson;
    const tasks = lesson.tasks.map((t) => {
        if (!t?.needsCueRepair) return t;
        const items = (t.items || []).map((it) => {
            if (it.cue) return it;
            const cue = guessBaseCue(it.answer);
            if (!cue || lowKey(cue) === lowKey(it.answer)) return it;
            return { ...it, cue };
        });
        const still = items.some((it) => {
            const textGaps = /\{\{\s*\d+\s*\}\}/.test(String(t.prompt || ''));
            const isGap = textGaps || /_{3,}/.test(String(it.q || ''));
            return isGap && !it.cue;
        });
        if (!still) {
            const { needsCueRepair, wordBank, autoWordBank, ...rest } = t;
            return { ...rest, items };
        }
        return { ...t, items, needsCueRepair: true };
    });
    return { ...lesson, tasks };
}

/** Prompt asking for base-form cues for the items of verb-form tasks that arrived without cues. */
export function buildCueRepairPrompt(lesson) {
    const todo = (lesson?.tasks || []).map((t, i) => ({ t, i })).filter(({ t }) => t.needsCueRepair);
    if (!todo.length) return '';
    const list = todo.map(({ t, i }) => ({ task: i + 1, instruction: t.instruction, items: t.items.map((it) => ({ q: it.q, answer: it.answer })) }));
    return `For each gap sentence below, give the bracket cue a student needs: the BASE form of the word(s) to put in the right form (e.g. answer "went" → cue "go"; "are playing" → "play"; "doesn't like" → "not / like"). The cue must not be the answer itself.
${JSON.stringify(list)}
Return ONLY valid JSON: {"tasks": [{"task": 1, "cues": ["go", "play"]}]} — one cue per item, same order.`;
}

/** Merge AI cue repairs: attach base-form cues; never restore a word box. */
export function applyCueRepair(lesson, reply) {
    const byTask = new Map((Array.isArray(reply?.tasks) ? reply.tasks : []).map((r) => [Number(r?.task) - 1, Array.isArray(r?.cues) ? r.cues : []]));
    const tasks = (lesson?.tasks || []).map((t, i) => {
        if (!t.needsCueRepair) return t;
        const cues = byTask.get(i) || [];
        const items = t.items.map((it, k) => {
            const cue = clean(cues[k], 60).replace(/^\(|\)$/g, '');
            return it.cue || !cue || lowKey(cue) === lowKey(it.answer) ? it : { ...it, cue };
        });
        if (items.every((it) => it.cue)) {
            const { wordBank, autoWordBank, needsCueRepair, ...rest } = t;
            return alignInstructionWithBox({ ...rest, items });
        }
        const { wordBank, autoWordBank, ...rest } = t;
        return alignInstructionWithBox({ ...rest, items, needsCueRepair: true });
    });
    return { ...lesson, tasks };
}

/** Drop server-internal flags before a lesson goes to the browser. */
export function publicOwnTimeLesson(lesson) {
    return {
        ...lesson,
        tasks: (lesson?.tasks || []).map(({ needsCueRepair, wordBank, autoWordBank, boxExtra, ...t }) => t),
    };
}


/** Content words used to check a reading answer is grounded in the passage. */
function readingContentWords(s) {
    const stop = new Set('a an the in on at to of for by with from into near about is are was were be been am do does did has have had he she it they we you i his her its their our my your this that these those there and or but because so very who what where when why how which'.split(' '));
    return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter((w) => w && !stop.has(w));
}

/**
 * Drop / rewrite poorly posed reading questions: must look like a question or gap,
 * and the key answer's content words must appear in the passage (answerable from THAT text).
 */
export function sanitizeReadingItems(prompt, items) {
    const text = String(prompt || '');
    const textWords = new Set(readingContentWords(text));
    const list = Array.isArray(items) ? items : [];
    const out = [];
    for (const it of list) {
        if (!it) continue;
        let q = String(it.q || it.question || '').replace(/\s+/g, ' ').trim();
        const answer = String(it.answer || it.expected || '').replace(/\s+/g, ' ').trim();
        if (!q || !answer) continue;
        const looksAsked = /^(who|what|where|when|why|how|which|whose|is|are|was|were|do|does|did|can|could|will|would|have|has|had|name|find|complete|true|false)\b/i.test(q)
            || /\?$/.test(q)
            || /_{3,}/.test(q)
            || /^(kto|co|gdzie|kiedy|dlaczego|jak|który|która|które|czy)\b/i.test(q);
        if (!looksAsked) continue; // not a properly posed question — drop
        const need = readingContentWords(answer);
        const grounded = !need.length || need.every((w) => [...textWords].some((tw) => tw === w || (w.length >= 4 && (tw.startsWith(w.slice(0, 4)) || w.startsWith(tw.slice(0, 4))))));
        if (!grounded) continue; // answer not in the text
        // Question must not introduce content the passage never mentions (e.g. "moon", "car").
        const qNeed = readingContentWords(q).filter((w) => w.length >= 4);
        const qGrounded = qNeed.every((w) => [...textWords].some((tw) => tw === w || tw.startsWith(w.slice(0, 4)) || w.startsWith(tw.slice(0, 4)))
            || /^(where|what|when|why|which|whose|does|did|have|has|had|name|find|favourite|favorite|often|usually)$/i.test(w));
        if (qNeed.length && !qGrounded) continue;
        // Reject questions that negate or contradict an explicit opposite in the stem vs text — light check: empty after trim already handled.
        out.push({
            ...it,
            q: q.slice(0, 500),
            answer: answer.slice(0, 300),
            alts: acceptedList(it).map((a) => String(a || '').slice(0, 300)).filter(Boolean).slice(0, 6),
        });
        if (out.length >= 4) break;
    }
    return out;
}

export function normalizeOwnTimeLesson(parsed, fallback = {}) {
    const raw = parsed && typeof parsed === 'object' ? parsed : {};
    const tasksIn = Array.isArray(raw.tasks) ? raw.tasks : [];
    const lessonCefr = String(raw.cefr || fallback.cefr || 'A2').toUpperCase();
    let tasks = tasksIn.slice(0, OWN_TIME_TASKS_MAX).map((t, i) => {
        const type = OWN_TIME_TASK_TYPES.includes(t?.type)
            ? t.type
            : 'writing';
        const isTile = type === 'word_order' || type === 'unscramble';
        let format = null;
        let items;
        if (isTile) {
            items = (Array.isArray(t?.items) ? t.items : []).map((it) => buildTileItem(type, it)).filter(Boolean).slice(0, type === 'word_order' ? 5 : 6);
        } else if (type === 'uoe') {
            format = resolveUoeFormat(t, lessonCefr);
            const cap = { mc_text: 5, word_formation: 5, transformation: 4, sentence_rewrite: 4, error_correction: 5, lexical_set: 3, two_sentences: 4, mc_dialogue: 4, tense_form: 5, grammar_mc: 5 }[format] || 6;
            const raws = Array.isArray(t?.items) ? t.items : [];
            items = raws.map((it) => buildUoeItem(format, it, lessonCefr)).filter(Boolean).slice(0, cap);
            if (items.length < Math.min(2, raws.length) && UOE_LEVELS[lessonCefr]) {
                // The AI's items don't fit the format: fall back to the level's plain open format.
                format = UOE_LEVELS[lessonCefr].open;
                items = raws.map((it) => buildUoeItem(format, it, lessonCefr)).filter(Boolean).slice(0, 6);
            }
        } else if (type === 'reading') {
            const rawItems = Array.isArray(t?.items) ? t.items.slice(0, 12) : [];
            const promptText = String(t?.prompt || t?.text || '');
            items = sanitizeReadingItems(promptText, rawItems.map((it) => ({
                ...it,
                q: normalizeGapMarker(it?.q || it?.question || '').slice(0, 500),
                answer: String(it?.answer || it?.expected || '').slice(0, 300),
            })));
        } else {
            items = Array.isArray(t?.items)
                ? t.items.slice(0, 12).map((it) => ({
                    q: normalizeGapMarker(it?.q || it?.question || '').slice(0, 500),
                    answer: String(it?.answer || it?.expected || '').slice(0, 300),
                    alts: acceptedList(it).length
                        ? acceptedList(it).map((a) => String(a || '').slice(0, 300)).filter(Boolean).slice(0, 6)
                        : [],
                    ...(clean(it?.cue, 60) ? { cue: clean(it.cue, 60).replace(/^\(|\)$/g, '') } : {}),
                })).filter((it) => it.q || it.answer)
                : [];
        }
        const strList = (arr, max, len) => (Array.isArray(arr) ? arr : [])
            .map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, len)).filter(Boolean).slice(0, max);
        const lang = raw.instrLang === 'en' || fallback.instrLang === 'en' ? 'en' : 'pl';
        const cefr = lessonCefr;
        const def = defaultGuidance(type, lang, cefr);
        const wt = writingTarget(cefr);
        const minS = Math.max(1, Math.min(10, Number(t?.target?.minSentences) || wt.sentences[0]));
        const maxS = Math.max(minS, Math.min(12, Number(t?.target?.maxSentences) || wt.sentences[1]));
        const steps = strList(t?.steps, 4, 160);
        const age = fallback.age;
        const rawInstr = String(t?.instruction || '').slice(0, 500);
        const drafted = {
            n: Number(t?.n) || (i + 1),
            type,
            ...(format ? { format, exam: UOE_LEVELS[cefr]?.exam || null } : {}),
            steps: steps.length >= 2 ? steps : (format && UOE_FORMATS[format].kind === 'mc'
                ? (lang === 'en' ? ['Read the whole sentence or text first.', 'Choose the right option for each gap.', 'Press “Check”.'] : ['Najpierw przeczytaj całe zdanie lub tekst.', 'Wybierz właściwą odpowiedź do każdej luki.', 'Kliknij „Sprawdź”.'])
                : def.steps),
            example: String(t?.example || '').replace(/\s+/g, ' ').trim().slice(0, 300),
            usefulLanguage: strList(t?.usefulLanguage, 6, 80),
            hint: String(t?.hint || def.hint || '').slice(0, 200),
            target: type === 'writing' ? { minSentences: minS, maxSentences: maxS, minWords: wt.words[0], maxWords: wt.words[1] } : null,
            instruction: rawInstr,
            prompt: String(t?.prompt || t?.text || '').slice(0, 4000),
            items,
            modelAnswers: Array.isArray(t?.modelAnswers)
                ? t.modelAnswers.map((a) => String(a || '').slice(0, 500)).filter(Boolean).slice(0, 8)
                : [],
        };
        return adaptTaskInstruction(drafted, { age, cefr, instrLang: lang });
    }).map((t) => (t.type === 'uoe' ? { ...t, items: shuffleChoices(t.items, t.prompt || t.instruction) } : t)).map(enforceFormChange).map(enforceUniqueCues).map((t) => applyWordCues(t, { tier: cueTier({ cefr: lessonCefr, age: fallback.age, intensity: fallback.intensity }), lang: raw.instrLang === 'en' || fallback.instrLang === 'en' ? 'en' : 'pl', age: fallback.age, cefr: lessonCefr })).filter((t) => ((t.type === 'word_order' || t.type === 'unscramble' || t.type === 'uoe') ? t.items.length > 0 : (t.instruction || t.prompt || t.items.length)));
    if (tasks.length && tasks.length < OWN_TIME_TASKS_MIN) tasks = splitToMinimum(tasks);
    const oc = ensureOpenCloze(tasks, lessonCefr);
    tasks = oc.tasks;
    const prefs = Array.isArray(fallback.taskPrefs) ? fallback.taskPrefs : [];
    const gr = ensureGrammarTasks(tasks, lessonCefr, prefs);
    tasks = gr.tasks;

    return {
        title: String(raw.title || 'Practice').slice(0, 120),
        cefr: lessonCefr,
        instrLang: raw.instrLang === 'en' || fallback.instrLang === 'en' ? 'en' : 'pl',
        focus: String(raw.focus || '').slice(0, 80),
        goal: String(raw.goal || '').slice(0, 200),
        coachNote: String(raw.coachNote || '').slice(0, 400),
        ...(oc.openClozeShort ? { openClozeShort: oc.openClozeShort } : {}),
        ...(gr.grammarShort ? { grammarShort: gr.grammarShort } : {}),
        taskCountOk: tasks.length >= OWN_TIME_TASKS_MIN && tasks.length <= OWN_TIME_TASKS_MAX,
        tasks: tasks.length ? tasks : [{
            n: 1,
            type: 'writing',
            ...(() => { const d = defaultGuidance('writing', fallback.instrLang === 'en' ? 'en' : 'pl', fallback.cefr); return { steps: d.steps, hint: d.hint }; })(),
            example: '',
            usefulLanguage: ['This week I…', 'First,', 'After that,', 'It was…because…'],
            target: (() => { const w = writingTarget(fallback.cefr); return { minSentences: w.sentences[0], maxSentences: w.sentences[1], minWords: w.words[0], maxWords: w.words[1] }; })(),
            instruction: taskInstruction('writing', { age: fallback.age, cefr: fallback.cefr || lessonCefr, instrLang: fallback.instrLang === 'en' ? 'en' : 'pl' }),
            prompt: 'Write a short paragraph about something you did this week.',
            items: [],
            modelAnswers: [],
        }],
    };
}
