/**
 * Server-only helpers for handwritten essay transcription (Writing Suite matura assessment).
 * Crossed-out text must never reach the transcript, the assessment, or the word count.
 * The vision prompt asks the model to omit struck text, and — as a second layer — to wrap
 * anything it still copies in ~~…~~ and list it in removedFragments. Everything here strips
 * those marks plus any stray strikethrough markup the model may emit.
 */

const COMBINING_STRIKE = /[\u0335\u0336\u0337\u0338]/;

/** Remove characters overlaid with combining strike/slash marks (e.g. "w̶o̶r̶d̶"). */
function stripCombiningStrikes(text) {
    if (!COMBINING_STRIKE.test(text)) return text;
    // A struck character is a base char followed by one or more combining strike marks.
    return text
        .replace(/[^\s\u0335-\u0338][\u0300-\u036f]*[\u0335-\u0338][\u0300-\u036f\u0335-\u0338]*/gu, '')
        .replace(/[\u0335-\u0338]/g, '');
}

/** Strip every strikethrough / deletion marker together with the text it marks. */
export function stripStruckText(input) {
    let text = String(input ?? '');
    if (!text) return '';
    const before = text;
    let prev;
    do {
        prev = text;
        text = text
            .replace(/~~[\s\S]*?~~/g, ' ')
            .replace(/<\s*(s|strike|del)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
            .replace(/\[\s*(?:deleted|crossed[\s-]*out|struck(?:[\s-]*through)?|strikethrough|scribbled(?:[\s-]*out)?|skreślone|przekreślone)\b[^\]]*\]/gi, ' ')
            .replace(/\{\s*(?:deleted|crossed[\s-]*out|struck)\b[^}]*\}/gi, ' ');
    } while (text !== prev);
    // Unpaired leftovers: lone ~~ or stray tags.
    text = text
        .replace(/~~/g, ' ')
        .replace(/<\s*\/?\s*(s|strike|del)\b[^>]*>/gi, ' ');
    text = stripCombiningStrikes(text);
    if (text === before) return text;
    return tidyWhitespace(text);
}

function tidyWhitespace(text) {
    return text
        .split('\n')
        .map((line) => line.replace(/[ \t\u00a0]{2,}/g, ' ').replace(/ +([,.;:!?)])/g, '$1').replace(/\( +/g, '(').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Text the model wrapped in strike markup (already removed by stripStruckText). */
function markedSpans(text) {
    const out = [];
    const re = /~~([\s\S]*?)~~|<\s*(?:s|strike|del)\b[^>]*>([\s\S]*?)<\s*\/\s*(?:s|strike|del)\s*>/gi;
    let m;
    while ((m = re.exec(String(text ?? '')))) out.push(norm(m[1] ?? m[2] ?? ''));
    return out;
}

function norm(s) {
    return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Remove fragments the model reported as crossed out but copied without marking them.
 * Guarded so a legitimate occurrence is not deleted: whole-word verbatim match, the
 * fragment must occur exactly once, and be either ≥ 2 words or ≥ 4 characters long.
 * Fragments the model already wrapped in markup are skipped (markup stripping removed them).
 */
export function removeReportedFragments(input, fragments, alreadyMarked = []) {
    let text = String(input ?? '');
    const skip = new Set(alreadyMarked.map(norm));
    const list = (Array.isArray(fragments) ? fragments : [])
        .map((f) => String(f ?? '').replace(/~~|<\/?\s*(?:s|strike|del)\s*>/gi, '').trim())
        .filter((f) => f && !skip.has(norm(f)))
        .sort((a, b) => b.length - a.length);
    let changed = false;
    for (const frag of list) {
        const words = frag.split(/\s+/).filter(Boolean);
        if (words.length < 2 && frag.length < 4) continue;
        const re = new RegExp(`(^|[^\\p{L}\\p{N}'’])${escapeRegExp(frag).replace(/\\?\s+/g, '\\s+')}(?=$|[^\\p{L}\\p{N}'’])`, 'giu');
        const hits = text.match(re) || [];
        if (hits.length !== 1) continue;
        text = text.replace(re, '$1 ');
        changed = true;
    }
    return changed ? tidyWhitespace(text) : text;
}

/** Full clean: strip strike markup, then drop reported fragments the model copied unmarked. */
export function cleanHandwrittenTranscript(input, removedFragments = []) {
    const raw = String(input ?? '');
    return removeReportedFragments(stripStruckText(raw), removedFragments, markedSpans(raw));
}

/** Word count used for the assessment (letters/digits, apostrophes and hyphens inside words). */
export function countEssayWords(text) {
    const m = String(text ?? '').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
    return m ? m.length : 0;
}

export const HANDWRITING_STRIKE_RULES = `CROSSED-OUT TEXT — STRICT RULES (most important):
1. NEVER copy text that is struck through, crossed out, scribbled over, blacked out, erased, bracketed for deletion, or otherwise marked as deleted. It is NOT part of the essay.
2. If the student wrote a replacement above, below or beside a crossed-out word, use ONLY the replacement, in the crossed-out word's place.
3. Words inserted with a caret (^, ∧, ⋎) or an arrow go exactly where the caret/arrow points.
4. Do not mention, describe or mark deletions in the transcript ("[crossed out]", "(deleted)", "~~", etc. are forbidden in "transcript" except as described in rule 6).
5. If you are unsure whether something is crossed out, treat it as crossed out and leave it out.
6. Safety net: if you did copy any crossed-out fragment by mistake, wrap it in ~~double tildes~~ and also list it in "removedFragments". List EVERY crossed-out fragment you saw in "removedFragments" (the exact struck words), even when you correctly left it out.`;
