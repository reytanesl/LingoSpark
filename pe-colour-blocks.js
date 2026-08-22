/**
 * Colour Blocks — Primary English sentence builder.
 * Same colours and icons on cards, room map, and text tasks.
 */
(function (global) {
    'use strict';

    const CSS_ID = 'cb-colour-blocks-css';

    const COL = {
        is:   { bg: '#1d4ed8', light: '#dbeafe', ink: '#1e3a8a', icon: '🔹', label: 'There is' },
        are:  { bg: '#15803d', light: '#dcfce7', ink: '#14532d', icon: '🔷', label: 'There are' },
        have: { bg: '#7c3aed', light: '#ede9fe', ink: '#5b21b6', icon: '🔑', label: 'Have got' },
        prep: { bg: '#c2410c', light: '#ffedd5', ink: '#9a3412' },
        obj:  { bg: '#0f766e', light: '#ccfbf1', ink: '#115e59' }
    };

    const STRUCTURES = [
        { id: 'there-is',     sheet: 'A', family: 'is',   number: 'sg', form: 'stmt', text: 'There is',                    speak: 'There is' },
        { id: 'is-there',     sheet: 'A', family: 'is',   number: 'sg', form: 'q',    text: 'Is there…?',                  speak: 'Is there' },
        { id: 'there-isnt',   sheet: 'A', family: 'is',   number: 'sg', form: 'neg',  text: "There isn't…",                speak: "There isn't" },
        { id: 'there-are',    sheet: 'A', family: 'are',  number: 'pl', form: 'stmt', text: 'There are',                   speak: 'There are' },
        { id: 'are-there',    sheet: 'A', family: 'are',  number: 'pl', form: 'q',    text: 'Are there (any)…?',           speak: 'Are there any' },
        { id: 'there-arent',  sheet: 'A', family: 'are',  number: 'pl', form: 'neg',  text: "There aren't (any)…",         speak: "There aren't any" },
        { id: 'i-have',       sheet: 'A', family: 'have', number: 'sg', form: 'stmt', text: 'I have got',                  speak: 'I have got' },
        { id: 'you-have',     sheet: 'A', family: 'have', number: 'sg', form: 'stmt', text: 'You have got',                speak: 'You have got' },
        { id: 'he-has',       sheet: 'A', family: 'have', number: 'sg', form: 'stmt', text: 'He/She has got',              speak: 'He has got' },
        { id: 'have-you',     sheet: 'A', family: 'have', number: 'sg', form: 'q',    text: 'Have you got…?',              speak: 'Have you got' },
        { id: 'has-he',       sheet: 'A', family: 'have', number: 'sg', form: 'q',    text: 'Has he/she got…?',            speak: 'Has she got' },
        { id: 'havent-got',   sheet: 'A', family: 'have', number: 'sg', form: 'neg',  text: "I/He/She haven't/hasn't got", speak: "I haven't got" }
    ];

    const PREPS = [
        { id: 'in',          text: 'in',          icon: '📦', adverb: false },
        { id: 'on',          text: 'on',          icon: '🧲', adverb: false },
        { id: 'under',       text: 'under',       icon: '🔻', adverb: false },
        { id: 'above',       text: 'above',       icon: '🪄', adverb: false },
        { id: 'next-to',     text: 'next to',     icon: '👯', adverb: false },
        { id: 'between',     text: 'between',     icon: '↔️', adverb: false },
        { id: 'behind',      text: 'behind',      icon: '🙈', adverb: false },
        { id: 'in-front-of', text: 'in front of', icon: '👀', adverb: false },
        { id: 'near',        text: 'near',        icon: '📍', adverb: false },
        { id: 'upstairs',    text: 'upstairs',    icon: '⬆️', adverb: true },
        { id: 'downstairs',  text: 'downstairs',  icon: '⬇️', adverb: true },
        { id: 'outside',     text: 'outside',     icon: '🚪', adverb: true }
    ];

    const OBJECTS = [
        { id: 'chair',        sheet: 'C', sg: 'chair',        pl: 'chairs',        emoji: '🪑', article: 'a',  place: true,  movable: true },
        { id: 'desk',         sheet: 'C', sg: 'desk',         pl: 'desks',         emoji: '🖥️', article: 'a',  place: true,  movable: true },
        { id: 'lamp',         sheet: 'C', sg: 'lamp',         pl: 'lamps',         emoji: '💡', article: 'a',  place: false, movable: true },
        { id: 'bin',          sheet: 'C', sg: 'bin',          pl: 'bins',          emoji: '🗑️', article: 'a',  place: true,  movable: true },
        { id: 'table',        sheet: 'C', sg: 'table',        pl: 'tables',        emoji: '🪵', article: 'a',  place: true,  movable: true },
        { id: 'sofa',         sheet: 'C', sg: 'sofa',         pl: 'sofas',         emoji: '🛋️', article: 'a',  place: true,  movable: true },
        { id: 'cushion',      sheet: 'C', sg: 'cushion',      pl: 'cushions',      emoji: '🟧', article: 'a',  place: false, movable: true },
        { id: 'shelf',        sheet: 'C', sg: 'shelf',        pl: 'shelves',       emoji: '📚', article: 'a',  place: true,  movable: true },
        { id: 'mirror',       sheet: 'C', sg: 'mirror',       pl: 'mirrors',       emoji: '🪞', article: 'a',  place: false, movable: true },
        { id: 'poster',       sheet: 'C', sg: 'poster',       pl: 'posters',       emoji: '🖼️', article: 'a',  place: false, movable: true },
        { id: 'pictures',     sheet: 'C', sg: 'picture',      pl: 'pictures',      emoji: '🌄', article: 'a',  place: false, movable: true, forcePl: true },
        { id: 'noticeboard',  sheet: 'C', sg: 'noticeboard',  pl: 'noticeboards',  emoji: '📋', article: 'a',  place: true,  movable: true },
        { id: 'bed',          sheet: 'D', sg: 'bed',          pl: 'beds',          emoji: '🛏️', article: 'a',  place: true,  movable: true },
        { id: 'wardrobe',     sheet: 'D', sg: 'wardrobe',     pl: 'wardrobes',     emoji: '👔', article: 'a',  place: true,  movable: true },
        { id: 'door',         sheet: 'D', sg: 'door',         pl: 'doors',         emoji: '🚪', article: 'a',  place: true,  movable: false, fixture: true },
        { id: 'window',       sheet: 'D', sg: 'window',       pl: 'windows',       emoji: '🪟', article: 'a',  place: true,  movable: false, fixture: true },
        { id: 'key',          sheet: 'D', sg: 'key',          pl: 'keys',          emoji: '🗝️', article: 'a',  place: false, movable: true },
        { id: 'laptop',       sheet: 'D', sg: 'laptop',       pl: 'laptops',       emoji: '💻', article: 'a',  place: false, movable: true },
        { id: 'tv',           sheet: 'D', sg: 'TV',           pl: 'TVs',           emoji: '📺', article: 'a',  place: true,  movable: true },
        { id: 'box',          sheet: 'D', sg: 'box',          pl: 'boxes',         emoji: '📦', article: 'a',  place: true,  movable: true },
        { id: 'mat',          sheet: 'D', sg: 'mat',          pl: 'mats',          emoji: '🟩', article: 'a',  place: true,  movable: true },
        { id: 'floor',        sheet: 'D', sg: 'floor',        pl: 'floors',        emoji: '🟫', article: 'the',place: true,  movable: false, fixture: true },
        { id: 'mobile',       sheet: 'D', sg: 'mobile',       pl: 'mobiles',       emoji: '📱', article: 'a',  place: false, movable: true },
        { id: 'car',          sheet: 'D', sg: 'car',          pl: 'cars',          emoji: '🚗', article: 'a',  place: false, movable: true }
    ];

    const YOUNG_STRUCT = ['there-is', 'there-are', 'i-have', 'he-has', 'is-there', 'have-you'];
    const YOUNG_PREP = ['in', 'on', 'under', 'next-to', 'above', 'behind'];
    const YOUNG_OBJ = ['chair', 'desk', 'lamp', 'sofa', 'bed', 'box', 'key', 'table', 'cushion', 'window'];

    const FIXTURES = {
        door:   { x: 16.5, y: 42, w: 9, h: 40 },
        window: { x: 50, y: 5, w: 16, h: 18 },
        floor:  { x: 16, y: 28, w: 68, h: 70 }
    };

    const ROOM_TASKS = [
        { item: 'lamp', prep: 'on', place: 'desk', family: 'is' },
        { item: 'cushion', prep: 'next-to', place: 'sofa', family: 'is' },
        { item: 'pictures', prep: 'above', place: 'sofa', family: 'are' },
        { item: 'key', prep: 'in', place: 'box', family: 'is' },
        { item: 'bin', prep: 'under', place: 'desk', family: 'is' },
        { item: 'mat', prep: 'in-front-of', place: 'bed', family: 'is' },
        { item: 'poster', prep: 'behind', place: 'chair', family: 'is' },
        { item: 'lamp', prep: 'between', place: 'sofa', place2: 'table', family: 'is' },
        { item: 'laptop', prep: 'on', place: 'table', family: 'is' },
        { item: 'mobile', prep: 'on', place: 'desk', family: 'is' },
        { item: 'car', prep: 'outside', family: 'is' },
        { item: 'bed', prep: 'upstairs', family: 'is' },
        { item: 'tv', prep: 'downstairs', family: 'is' },
        { item: 'mirror', prep: 'on', place: 'wall', family: 'is' },
        { item: 'box', prep: 'near', place: 'door', family: 'is' },
        { item: 'chair', prep: 'next-to', place: 'desk', family: 'is' },
        { item: 'cushions', itemId: 'cushion', prep: 'on', place: 'sofa', family: 'are' },
        { item: 'keys', itemId: 'key', prep: 'on', place: 'table', family: 'are' }
    ];

    const TEXT_GAPS = [
        { parts: ['There ', { gap: true }, ' a lamp on the desk.'], options: ['is', 'are', 'has'], answer: 'is', family: 'is',
            en: 'Use There is with one thing.', pl: 'There is używamy, gdy jest jedna rzecz.' },
        { parts: ['There ', { gap: true }, ' two cushions next to the sofa.'], options: ['is', 'are', 'have'], answer: 'are', family: 'are',
            en: 'Use There are with more than one thing.', pl: 'There are używamy, gdy jest więcej rzeczy.' },
        { parts: ['I ', { gap: true }, ' got a pink mobile.'], options: ['have', 'has', 'are'], answer: 'have', family: 'have',
            en: 'I / you / we / they → have got.', pl: 'I / you / we / they → have got.' },
        { parts: ['She ', { gap: true }, ' got a key.'], options: ['have', 'has', 'is'], answer: 'has', family: 'have',
            en: 'He / she / it → has got.', pl: 'He / she / it → has got.' },
        { parts: ['There is ', { gap: true }, ' chair by the window.'], options: ['a', 'an', 'some'], answer: 'a', family: 'is',
            en: 'a comes before a consonant sound (chair).', pl: 'a stawiamy przed spółgłoską (chair).' },
        { parts: ['There is ', { gap: true }, ' orange box on the mat.'], options: ['a', 'an', 'any'], answer: 'an', family: 'is',
            en: 'an comes before a vowel sound (orange).', pl: 'an stawiamy przed samogłoską (orange).' },
        { parts: ['There are ', { gap: true }, ' pictures upstairs.'], options: ['some', 'any', 'a'], answer: 'some', family: 'are',
            en: 'some is for positive sentences with plural / uncountable nouns.', pl: 'some w zdaniach twierdzących (lm. / niepoliczalne).' },
        { parts: ['Are there ', { gap: true }, ' chairs in the garden?'], options: ['some', 'any', 'a'], answer: 'any', family: 'are',
            en: 'any is for questions and negatives.', pl: 'any w pytaniach i przeczeniach.' },
        { parts: ['There aren’t ', { gap: true }, ' posters on the wall.'], options: ['some', 'any', 'an'], answer: 'any', family: 'are',
            en: 'Use any after not / n’t.', pl: 'Po przeczeniu używamy any.' },
        { parts: ['Has he got ', { gap: true }, ' laptop?'], options: ['a', 'an', 'some'], answer: 'a', family: 'have',
            en: 'laptop starts with a consonant sound → a.', pl: 'laptop zaczyna się od spółgłoski → a.' },
        { parts: ['The lamp is ', { gap: true }, ' the desk.'], options: ['on', 'in', 'under'], answer: 'on', family: 'is',
            en: 'on = touching the top.', pl: 'on = leży na wierzchu, dotyka.' },
        { parts: ['The bin is ', { gap: true }, ' the desk.'], options: ['on', 'under', 'above'], answer: 'under', family: 'is',
            en: 'under = lower than something.', pl: 'under = pod spodem.' }
    ];

    const TEXT_MCQ = [
        { q: 'Choose the correct sentence.', family: 'is',
            options: ['There is a lamp above the desk.', 'There are a lamp above the desk.', 'There is lamps above the desk.'], answer: 0,
            en: 'One lamp → There is + a.', pl: 'Jedna lampa → There is + a.' },
        { q: 'Choose the correct sentence.', family: 'are',
            options: ['There is two cushions next to the sofa.', 'There are two cushions next to the sofa.', 'There are a cushion next to the sofa.'], answer: 1,
            en: 'Two cushions → There are.', pl: 'Dwie poduszki → There are.' },
        { q: 'Choose the correct sentence.', family: 'have',
            options: ['She have got a key.', 'She has got a key.', 'She is got a key.'], answer: 1,
            en: 'She → has got.', pl: 'She → has got.' },
        { q: 'Choose the correct question.', family: 'is',
            options: ['Is there a message in the bin?', 'Are there a message in the bin?', 'Has there a message in the bin?'], answer: 0,
            en: 'One message → Is there…?', pl: 'Jedna wiadomość → Is there…?' },
        { q: 'Choose the correct sentence.', family: 'are',
            options: ['There are some books on the shelf.', 'There are any books on the shelf.', 'There is some book on the shelf.'], answer: 0,
            en: 'Positive plural → some.', pl: 'Twierdzenie w liczbie mnogiej → some.' },
        { q: 'Choose the correct sentence.', family: 'is',
            options: ['There is an clock on the wall.', 'There is a clock on the wall.', 'There are a clock on the wall.'], answer: 1,
            en: 'clock = consonant sound → a.', pl: 'clock = spółgłoska → a.' },
        { q: 'Where is the cat? Choose.', family: 'is',
            options: ['The cat is on the box. (touching)', 'The cat is above the box. (not touching)', 'Both can be true — look at the picture.'], answer: 2,
            en: 'on = touching; above = over, not touching.', pl: 'on = dotyka; above = nad, bez dotyku.' },
        { q: 'Choose the negative.', family: 'have',
            options: ['I have got a car.', "I haven't got a car.", 'Have you got a car?'], answer: 1,
            en: "haven't / hasn't got = do not possess.", pl: "haven't / hasn't got = nie mam / nie ma." }
    ];

    const TEXT_REORDER = [
        { words: ['There', 'is', 'a', 'lamp', 'above', 'the', 'desk'], family: 'is' },
        { words: ['There', 'are', 'two', 'cushions', 'next', 'to', 'the', 'sofa'], family: 'are' },
        { words: ['I', 'have', 'got', 'a', 'pink', 'mobile'], family: 'have' },
        { words: ['Has', 'she', 'got', 'a', 'key'], family: 'have', extra: '?' },
        { words: ['Is', 'there', 'a', 'message', 'in', 'the', 'bin'], family: 'is', extra: '?' },
        { words: ['The', 'box', 'is', 'under', 'the', 'table'], family: 'is' },
        { words: ['There', 'are', 'some', 'pictures', 'upstairs'], family: 'are' },
        { words: ['There', "aren't", 'any', 'chairs', 'outside'], family: 'are' }
    ];

    const TEXT_MATCH = [
        { left: 'There is', right: 'one thing 🔹', family: 'is' },
        { left: 'There are', right: 'many things 🔷', family: 'are' },
        { left: 'have got / has got', right: 'possession 🔑', family: 'have' },
        { left: 'on 🧲', right: 'touching the top', family: 'is' },
        { left: 'above 🪄', right: 'over, not touching', family: 'is' },
        { left: 'a', right: 'before a consonant (a chair)', family: 'is' },
        { left: 'an', right: 'before a vowel (an orange)', family: 'is' },
        { left: 'some', right: 'positive sentences', family: 'are' },
        { left: 'any', right: 'questions and negatives', family: 'are' },
        { left: 'under 🔻', right: 'lower than something', family: 'is' },
        { left: 'next to 👯', right: 'beside', family: 'is' },
        { left: 'in 📦', right: 'inside', family: 'is' }
    ];

    const CB_CSS = `
#screen-pe-colour.engine-container { max-width: 1180px; }
.cb-wrap { font-family: var(--font-secondary); }
.cb-legend {
    display: flex; flex-wrap: wrap; gap: 0.55rem; margin: 0 0 1rem;
    padding: 0.75rem 0.85rem; background: var(--light-grey); border-radius: 12px;
}
.cb-legend span {
    display: inline-flex; align-items: center; gap: 0.35rem;
    font-family: var(--font-primary); font-weight: 700; font-size: 0.88rem;
    padding: 0.35rem 0.7rem; border-radius: 999px; color: #fff;
}
.cb-tabs { display: flex; gap: 0.45rem; flex-wrap: wrap; margin-bottom: 1rem; }
.cb-tab {
    font-family: var(--font-primary); font-weight: 700; font-size: 0.95rem;
    padding: 0.55rem 1rem; border-radius: 999px; cursor: pointer; border: 2px solid var(--royal-blue);
    background: #fff; color: var(--royal-blue);
}
.cb-tab:hover { background: rgba(1,33,105,0.06); }
.cb-tab.on { background: var(--royal-blue); color: #fff; }
.cb-coach {
    background: #fff; border: 2px solid var(--border-light); border-left: 5px solid var(--royal-blue);
    border-radius: 10px; padding: 0.85rem 1rem; margin-bottom: 1rem; display: flex; gap: 0.75rem; align-items: flex-start;
}
.cb-coach p { margin: 0; font-size: 1.02rem; line-height: 1.5; }
.cb-coach .cb-flag {
    margin-left: auto; border: 2px solid var(--border-light); background: #fff; border-radius: 8px;
    cursor: pointer; padding: 0.2rem 0.45rem; font-size: 1.15rem; flex-shrink: 0;
}
.cb-coach .cb-flag.on { border-color: var(--pillarbox-red); }
.cb-goals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.65rem; margin-bottom: 1rem; }
@media (max-width: 720px) { .cb-goals { grid-template-columns: 1fr; } }
.cb-goal {
    border: 3px solid; border-radius: 14px; padding: 0.9rem 0.7rem; cursor: pointer; text-align: center;
    font-family: var(--font-primary); font-weight: 700; background: #fff;
}
.cb-goal small { display: block; font-family: var(--font-secondary); font-weight: 400; margin-top: 0.25rem; font-size: 0.85rem; }
.cb-slots { display: flex; flex-wrap: wrap; gap: 0.55rem; margin: 0 0 1rem; align-items: stretch; }
.cb-slot {
    min-width: 8.4rem; min-height: 4.4rem; border: 3px dashed #cbd5e1; border-radius: 14px;
    padding: 0.4rem; display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: #f8fafc; cursor: pointer;
}
.cb-slot .hint { font-size: 0.72rem; color: var(--text-muted); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.cb-slot.on { box-shadow: 0 0 0 3px rgba(1,33,105,0.25); }
.cb-slot.filled { border-style: solid; background: #fff; }
.cb-sheet { margin-bottom: 1rem; }
.cb-sheet h3 {
    font-family: var(--font-primary); font-size: 1rem; color: var(--royal-blue);
    margin: 0 0 0.5rem; display: flex; align-items: center; gap: 0.4rem;
}
.cb-cards { display: flex; flex-wrap: wrap; gap: 0.45rem; }
.cb-card {
    display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.15rem;
    min-width: 6.8rem; padding: 0.5rem 0.6rem; border-radius: 12px; border: 3px solid; cursor: pointer;
    font-family: var(--font-primary); font-weight: 700; font-size: 0.88rem; user-select: none; background: #fff;
    color: var(--text-dark);
}
.cb-card .ico { font-size: 1.25rem; line-height: 1; }
.cb-card.sel { outline: 3px solid #012169; outline-offset: 1px; }
.cb-card[disabled] { opacity: 0.38; cursor: not-allowed; }
.cb-picture {
    display: flex; align-items: center; justify-content: center; gap: 0.6rem; flex-wrap: wrap;
    background: linear-gradient(180deg, #e0f2fe, #fff); border: 2px solid #bae6fd; border-radius: 16px;
    padding: 1rem; margin-bottom: 1rem; min-height: 5.5rem; font-size: 2.4rem;
}
.cb-picture .plus { font-size: 1.4rem; color: var(--text-muted); }
.cb-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.5rem 0 0.75rem; }
.cb-sentence {
    font-family: var(--font-primary); font-size: 1.25rem; font-weight: 700; text-align: center;
    padding: 0.85rem; border-radius: 12px; margin: 0.5rem 0 0; min-height: 2.4rem;
}
.cb-sentence .tok { display: inline-block; padding: 0.15rem 0.45rem; border-radius: 8px; margin: 0 0.12rem; color: #fff; }
.cb-fb { font-family: var(--font-primary); font-weight: 700; text-align: center; min-height: 1.6rem; margin-top: 0.5rem; }
.cb-fb.ok { color: var(--success-green); }
.cb-fb.bad { color: var(--pillarbox-red); }
.cb-map-tools { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 0.75rem; align-items: center; }
.cb-palette { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.75rem; }
.cb-chip {
    border: 2px solid var(--border-light); background: #fff; border-radius: 10px; padding: 0.3rem 0.5rem;
    cursor: pointer; font-family: var(--font-primary); font-weight: 700; font-size: 0.82rem;
}
.cb-chip.on { border-color: var(--royal-blue); box-shadow: 0 0 0 2px rgba(1,33,105,0.2); }
.cb-room-wrap { position: relative; }
.cb-room {
    position: relative; width: 100%; aspect-ratio: 16 / 10; border-radius: 8px 8px 4px 4px; overflow: hidden;
    box-shadow: 0 10px 28px rgba(0,0,0,0.18), inset 0 0 0 3px #5c4033;
    background:
        repeating-linear-gradient(90deg, #c9a36b 0 22px, #b8925c 22px 24px),
        linear-gradient(#c9a36b, #b08950);
}
.cb-wall-top {
    position: absolute; left: 14%; right: 16%; top: 0; height: 26%;
    background: linear-gradient(#e8dcc8, #d4c4a8); border-bottom: 8px solid #8b6914;
    box-shadow: inset 0 -6px 0 #6b4f12;
}
.cb-wall-left {
    position: absolute; left: 0; top: 0; width: 14%; height: 100%;
    background: linear-gradient(90deg, #6b5344, #8a6a54); z-index: 2;
}
.cb-garden {
    position: absolute; right: 0; top: 0; width: 16%; height: 100%; z-index: 2;
    background:
        repeating-linear-gradient(180deg, #4ade80 0 10px, #22c55e 10px 12px),
        #16a34a;
    border-left: 4px solid #166534;
}
.cb-stairs {
    position: absolute; left: 1%; top: 8%; width: 12%; height: 84%; z-index: 3; display: flex; flex-direction: column;
}
.cb-stairs i { flex: 1; background: linear-gradient(#d6d3d1, #a8a29e); border: 1px solid #78716c; border-radius: 2px; margin: 1px 0; }
.cb-door {
    position: absolute; left: 16.5%; top: 42%; width: 9%; height: 40%; z-index: 4;
    background: linear-gradient(#8b5a2b, #6b3f16); border: 3px solid #4a2c0a; border-radius: 2px 2px 0 0;
}
.cb-door::before, .cb-door::after {
    content: ''; position: absolute; left: 12%; right: 12%; border: 2px solid #5c3a12; border-radius: 2px;
}
.cb-door::before { top: 10%; height: 32%; }
.cb-door::after { bottom: 12%; height: 32%; }
.cb-knob { position: absolute; right: 10%; top: 48%; width: 12%; aspect-ratio: 1; background: #eab308; border-radius: 50%; }
.cb-window {
    position: absolute; left: 50%; top: 5%; width: 16%; height: 18%; z-index: 4;
    background: linear-gradient(135deg, rgba(186,230,253,0.85), rgba(56,189,248,0.45));
    border: 5px solid #fff; box-shadow: 0 0 0 3px #78716c, inset 0 0 12px rgba(255,255,255,0.5);
}
.cb-window .bar-h, .cb-window .bar-v { position: absolute; background: #fff; }
.cb-window .bar-h { left: 0; right: 0; top: 50%; height: 4px; }
.cb-window .bar-v { top: 0; bottom: 0; left: 50%; width: 4px; }
.cb-base { position: absolute; left: 14%; right: 16%; bottom: 0; height: 4%; background: #5c4033; z-index: 3; }
.cb-glow { position: absolute; left: 40%; top: 30%; width: 20%; height: 20%; background: radial-gradient(circle, rgba(254,240,138,0.35), transparent 70%); pointer-events: none; }
.cb-item {
    position: absolute; z-index: 6; cursor: grab; user-select: none; touch-action: none;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-size: 1.7rem; line-height: 1; filter: drop-shadow(1px 2px 2px rgba(0,0,0,0.25));
}
.cb-item.drag { cursor: grabbing; z-index: 9; }
.cb-item .lab { font-size: 0.62rem; font-family: var(--font-primary); font-weight: 700; color: #1c1917; background: rgba(255,255,255,0.85); border-radius: 6px; padding: 0 0.25rem; }
.cb-zone-lab {
    position: absolute; z-index: 3; font-family: var(--font-primary); font-weight: 700; font-size: 0.68rem;
    color: rgba(255,255,255,0.9); letter-spacing: 0.04em; text-transform: uppercase; pointer-events: none;
}
.cb-text-kinds { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.85rem; }
.cb-opt {
    font-family: var(--font-primary); font-weight: 700; padding: 0.55rem 0.9rem; border-radius: 10px;
    border: 2px solid var(--border-light); background: #fff; cursor: pointer;
}
.cb-opt.on { border-width: 3px; }
.cb-gap-line { font-size: 1.2rem; font-family: var(--font-primary); font-weight: 700; text-align: center; margin: 0.75rem 0 1rem; line-height: 1.8; }
.cb-blank { display: inline-block; min-width: 4.5rem; border-bottom: 3px solid var(--royal-blue); text-align: center; color: var(--royal-blue); }
.cb-match { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.cb-word {
    display: inline-flex; margin: 0.2rem; padding: 0.4rem 0.65rem; border-radius: 8px; border: 2px solid var(--royal-blue);
    background: #fff; cursor: pointer; font-family: var(--font-primary); font-weight: 700;
}
.cb-word.used { opacity: 0.35; }
.cb-build-row { min-height: 3.2rem; border: 2px dashed var(--border-light); border-radius: 10px; padding: 0.4rem; margin-bottom: 0.7rem; }
`;

    let S = null;
    let drag = null;

    function byId(id) { return OBJECTS.find((o) => o.id === id); }
    function prepById(id) { return PREPS.find((p) => p.id === id); }
    function stById(id) { return STRUCTURES.find((x) => x.id === id); }

    function articleFor(obj, number) {
        if (number === 'pl') return '';
        if (obj.article === 'the') return 'the';
        const w = obj.sg;
        return /^[aeiou]/i.test(w) ? 'an' : 'a';
    }

    function objLabel(obj, number) {
        if (number === 'pl' || obj.forcePl) return obj.pl;
        return obj.sg;
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function buildSpoken(slots) {
        const st = slots.structure;
        const obj = slots.object;
        if (!st || !obj) return '';
        const n = st.number === 'pl' || obj.forcePl ? 'pl' : 'sg';
        const art = articleFor(obj, n);
        const noun = objLabel(obj, n);
        let core = st.speak;
        if (st.family === 'are' && (st.form === 'q' || st.form === 'neg')) {
            core = st.speak;
        }
        const nounBit = n === 'pl' ? noun : (art ? art + ' ' + noun : noun);
        let out = core + ' ' + nounBit;
        if (slots.prep) {
            if (slots.prep.adverb) out += ' ' + slots.prep.text;
            else if (slots.prep.id === 'between' && slots.place && slots.place2) {
                out += ' between the ' + slots.place.sg + ' and the ' + slots.place2.sg;
            } else if (slots.place) {
                const pArt = slots.place.article === 'the' ? 'the' : 'the';
                out += ' ' + slots.prep.text + ' ' + pArt + ' ' + slots.place.sg;
            }
        }
        if (st.form === 'q') out = out.replace(/\.\s*$/, '') + '?';
        else out = out.replace(/\?\s*$/, '') + '.';
        out = out.replace(/\s+/g, ' ').replace(' ?', '?');
        return out.charAt(0).toUpperCase() + out.slice(1);
    }

    function validateSlots(slots) {
        const st = slots.structure;
        const obj = slots.object;
        if (!st) return { ok: false, en: 'Start with a blue, green or purple block.', pl: 'Zacznij od niebieskiego, zielonego lub fioletowego bloku.' };
        if (!obj) return { ok: false, en: 'Now choose the thing.', pl: 'Teraz wybierz przedmiot.' };
        const pluralObj = obj.forcePl || false;
        if (st.number === 'sg' && pluralObj) {
            return { ok: false, en: 'Pictures are more than one — use There are (green).', pl: 'Pictures to liczba mnoga — użyj There are (zielony).' };
        }
        if (st.number === 'pl' && !pluralObj) {
            /* allow regular objects as plural form */
        }
        if (st.family === 'is' && (pluralObj)) {
            return { ok: false, en: 'There is is for one thing. Try There are.', pl: 'There is jest dla jednej rzeczy. Spróbuj There are.' };
        }
        if (st.family !== 'have') {
            if (!slots.prep) return { ok: false, en: 'Where is it? Pick a preposition.', pl: 'Gdzie to jest? Wybierz przyimek.' };
            if (!slots.prep.adverb && !slots.place) {
                return { ok: false, en: 'Pick the place (desk, sofa, window…).', pl: 'Wybierz miejsce (biurko, sofa, okno…).' };
            }
            if (slots.prep.id === 'between' && (!slots.place || !slots.place2)) {
                return { ok: false, en: 'Between needs two places.', pl: 'Between potrzebuje dwóch miejsc.' };
            }
            if (slots.place && slots.place.id === obj.id && !slots.prep.adverb) {
                return { ok: false, en: 'Use a different place from the thing.', pl: 'Miejsce musi być inne niż przedmiot.' };
            }
        }
        return { ok: true, sentence: buildSpoken(slots) };
    }

    function promptMatches(slots, prompt) {
        if (!prompt) return true;
        if (slots.structure && slots.structure.id !== prompt.structureId) return false;
        if (slots.object && slots.object.id !== prompt.objectId) return false;
        if (prompt.prepId) {
            if (!slots.prep || slots.prep.id !== prompt.prepId) return false;
        }
        if (prompt.placeId) {
            if (!slots.place || slots.place.id !== prompt.placeId) return false;
        }
        if (prompt.place2Id) {
            if (!slots.place2 || slots.place2.id !== prompt.place2Id) return false;
        }
        return true;
    }

    function makeBuildPrompt(goal) {
        const family = goal || pick(['is', 'are', 'have']);
        const pool = visibleStructures().filter((s) => s.family === family && s.form === 'stmt');
        const st = pick(pool.length ? pool : visibleStructures().filter((s) => s.form === 'stmt'));
        const objs = visibleObjects().filter((o) => {
            if (st.family === 'is' && o.forcePl) return false;
            if (st.family === 'are') return true;
            return !o.forcePl;
        });
        const obj = pick(objs);
        if (st.family === 'have') {
            return { structureId: st.id, objectId: obj.id, family: st.family };
        }
        const preps = visiblePreps();
        const prep = pick(preps);
        if (prep.adverb) {
            return { structureId: st.id, objectId: obj.id, prepId: prep.id, family: st.family };
        }
        const places = visibleObjects().filter((o) => o.place && o.id !== obj.id);
        const place = pick(places);
        if (prep.id === 'between') {
            const rest = places.filter((o) => o.id !== place.id);
            const place2 = pick(rest.length ? rest : places);
            return { structureId: st.id, objectId: obj.id, prepId: prep.id, placeId: place.id, place2Id: place2.id, family: st.family };
        }
        return { structureId: st.id, objectId: obj.id, prepId: prep.id, placeId: place.id, family: st.family };
    }

    function visibleStructures() {
        const all = STRUCTURES;
        let list = S.ageBand === 'young' ? all.filter((s) => YOUNG_STRUCT.includes(s.id)) : all;
        if (S.goal) list = list.filter((s) => s.family === S.goal);
        return list;
    }
    function visiblePreps() {
        return S.ageBand === 'young' ? PREPS.filter((p) => YOUNG_PREP.includes(p.id)) : PREPS;
    }
    function visibleObjects() {
        return S.ageBand === 'young' ? OBJECTS.filter((o) => YOUNG_OBJ.includes(o.id)) : OBJECTS;
    }

    function speak(text) {
        if (!text || !global.speechSynthesis) return;
        global.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-GB';
        u.rate = 0.92;
        global.speechSynthesis.speak(u);
    }

    function award(n, result) {
        if (typeof global.peAddPoints === 'function') global.peAddPoints('colour', n);
        if (typeof global.incrementGameCount === 'function') global.incrementGameCount();
        if (typeof global.recordGameSessionApi === 'function') {
            global.recordGameSessionApi('pe_colour', { score: n, pointsEarned: n, result: result || {} });
        }
    }

    function emptySlots() {
        return { structure: null, object: null, prep: null, place: null, place2: null };
    }

    function nextSlot(slots) {
        if (!slots.structure) return 'structure';
        if (!slots.object) return 'object';
        if (slots.structure.family === 'have') return 'done';
        if (!slots.prep) return 'prep';
        if (slots.prep.adverb) return 'done';
        if (!slots.place) return 'place';
        if (slots.prep.id === 'between' && !slots.place2) return 'place2';
        return 'done';
    }

    function coach() {
        const pl = S.polish;
        if (S.tab === 'build') {
            if (!S.goal) {
                return pl
                    ? 'Co chcesz powiedzieć? Jedna rzecz, wiele rzeczy, czy że ktoś coś ma?'
                    : 'What do you want to say? One thing, many things, or that someone has something?';
            }
            if (S.buildPrompt && S.ageBand === 'young') {
                const step = nextSlot(S.slots);
                if (step === 'structure') return pl ? 'Spójrz na obrazek. Wybierz niebieski, zielony albo fioletowy blok.' : 'Look at the picture. Pick a blue, green or purple block.';
                if (step === 'object') return pl ? 'Teraz wybierz przedmiot z obrazka.' : 'Now pick the thing in the picture.';
                if (step === 'prep') return pl ? 'Gdzie to jest? Wybierz przyimek z ikoną.' : 'Where is it? Pick a preposition icon.';
                if (step === 'place' || step === 'place2') return pl ? 'Wybierz mebel albo miejsce.' : 'Pick the furniture or place.';
                return pl ? 'Świetnie. Kliknij Check, a potem powiedz zdanie na głos.' : 'Great. Click Check, then say the sentence aloud.';
            }
            const step = nextSlot(S.slots);
            if (S.ageBand === 'older' && step === 'structure') {
                return pl ? 'Złóż zdanie z kart. Na końcu kliknij Check.' : 'Build your sentence with the cards. Click Check when you finish.';
            }
            if (step === 'structure') return pl ? 'Wybierz strukturę — kolor mówi, jaki to typ zdania.' : 'Pick a structure — the colour tells you the sentence type.';
            if (step === 'object') return pl ? 'Wybierz rzecz.' : 'Pick the thing.';
            if (step === 'prep') return pl ? 'Gdzie to stoi? Wybierz przyimek.' : 'Where is it? Pick a preposition.';
            if (step === 'place' || step === 'place2') return pl ? 'Wybierz miejsce.' : 'Pick the place.';
            return pl ? 'Sprawdź zdanie.' : 'Check your sentence.';
        }
        if (S.tab === 'map') {
            if (S.mapMode === 'listen') {
                return pl
                    ? 'Przeczytaj zdanie. Przeciągnij przedmiot w odpowiednie miejsce w pokoju.'
                    : 'Read the sentence. Drag the thing to the right place in the room.';
            }
            return pl
                ? 'Ustaw meble, potem złóż zdanie o tym, co widać.'
                : 'Place the furniture, then build a sentence about what you see.';
        }
        const kinds = { gap: 'Fill the gap.', mcq: 'Choose the correct sentence.', reorder: 'Tap the words in order.', match: 'Match each pair.' };
        const kindsPl = { gap: 'Uzupełnij lukę.', mcq: 'Wybierz poprawne zdanie.', reorder: 'Klikaj wyrazy w kolejności.', match: 'Dopasuj pary.' };
        return pl ? kindsPl[S.textKind] : kinds[S.textKind];
    }

    function colorStyle(family) {
        const c = COL[family] || COL.obj;
        return 'border-color:' + c.bg + ';background:' + c.light + ';color:' + c.ink;
    }

    function tokHtml(family, text, icon) {
        const c = COL[family] || COL.obj;
        return '<span class="tok" style="background:' + c.bg + '">' + (icon ? icon + ' ' : '') + esc(text) + '</span>';
    }

    function ensureCss() {
        if (document.getElementById(CSS_ID)) return;
        const el = document.createElement('style');
        el.id = CSS_ID;
        el.textContent = CB_CSS;
        document.head.appendChild(el);
    }

    function rootEl() { return document.getElementById('colour-blocks-root'); }

    function render() {
        const root = rootEl();
        if (!root) return;
        root.innerHTML = [
            legendHtml(),
            tabsHtml(),
            coachHtml(),
            S.tab === 'build' ? buildHtml() : '',
            S.tab === 'map' ? mapHtml() : '',
            S.tab === 'text' ? textHtml() : ''
        ].join('');
        bind(root);
        if (S.tab === 'map') bindRoomDrag(root);
    }

    function legendHtml() {
        return '<div class="cb-legend" aria-label="Colour key">' +
            '<span style="background:' + COL.is.bg + '">' + COL.is.icon + ' There is · 1</span>' +
            '<span style="background:' + COL.are.bg + '">' + COL.are.icon + ' There are · many</span>' +
            '<span style="background:' + COL.have.bg + '">' + COL.have.icon + ' have got</span>' +
            '</div>';
    }

    function tabsHtml() {
        const t = (id, label) => '<button type="button" class="cb-tab' + (S.tab === id ? ' on' : '') + '" data-cb="tab" data-id="' + id + '">' + label + '</button>';
        return '<div class="cb-tabs">' +
            t('build', 'Build a sentence') +
            t('map', 'Room map') +
            t('text', 'Text tasks') +
            '</div>';
    }

    function coachHtml() {
        return '<div class="cb-coach"><p>' + esc(coach()) + '</p>' +
            '<button type="button" class="cb-flag' + (S.polish ? ' on' : '') + '" data-cb="pl" title="Polish">🇵🇱</button></div>';
    }

    function buildHtml() {
        if (!S.goal) return goalsHtml();
        let html = '';
        if (S.buildPrompt) html += pictureHtml(S.buildPrompt);
        html += slotsHtml(S.slots, 'build');
        html += sheetHtml();
        html += '<div class="cb-actions">' +
            '<button type="button" class="btn btn-blue" data-cb="check-build">Check</button>' +
            '<button type="button" class="btn btn-outline" data-cb="speak-build"><i class="fa-solid fa-volume-high"></i> Say it</button>' +
            '<button type="button" class="btn btn-outline" data-cb="clear-build">Clear</button>' +
            '<button type="button" class="btn btn-outline" data-cb="new-prompt">New picture</button>' +
            '<button type="button" class="btn btn-grey" data-cb="new-goal">Change goal</button>' +
            '</div>';
        if (S.buildSpoken) {
            html += '<div class="cb-sentence">' + colorSentence(S.slots) + '</div>';
        }
        html += '<div class="cb-fb' + (S.buildOk ? ' ok' : (S.buildFb ? ' bad' : '')) + '">' + esc(S.buildFb || '') + '</div>';
        return html;
    }

    function goalsHtml() {
        const items = [
            { id: 'is', title: 'I see one thing', sub: 'There is 🔹', col: COL.is },
            { id: 'are', title: 'I see many things', sub: 'There are 🔷', col: COL.are },
            { id: 'have', title: 'Someone has something', sub: 'have got 🔑', col: COL.have }
        ];
        return '<div class="cb-goals">' + items.map((g) =>
            '<button type="button" class="cb-goal" data-cb="goal" data-id="' + g.id + '" style="border-color:' + g.col.bg + ';color:' + g.col.ink + ';background:' + g.col.light + '">' +
            esc(g.title) + '<small>' + esc(g.sub) + '</small></button>'
        ).join('') + '</div>';
    }

    function pictureHtml(prompt) {
        const obj = byId(prompt.objectId);
        const prep = prompt.prepId ? prepById(prompt.prepId) : null;
        const place = prompt.placeId ? byId(prompt.placeId) : null;
        const place2 = prompt.place2Id ? byId(prompt.place2Id) : null;
        const bits = ['<span>' + (obj ? obj.emoji : '') + '</span>'];
        if (prep) bits.push('<span class="plus">' + prep.icon + '</span>');
        if (place) bits.push('<span>' + place.emoji + '</span>');
        if (place2) bits.push('<span class="plus">&amp;</span><span>' + place2.emoji + '</span>');
        return '<div class="cb-picture" aria-label="Look first">' + bits.join('') + '</div>';
    }

    function slotsHtml(slots, prefix) {
        const n = nextSlot(slots);
        const mk = (key, hint, family) => {
            const filled = slots[key];
            const on = S.activeSlot === key || n === key;
            let inner = '<span class="hint">' + esc(hint) + '</span>';
            if (filled) {
                if (key === 'structure') inner += '<strong>' + esc(filled.text) + '</strong>';
                else if (key === 'prep') inner += '<strong>' + filled.icon + ' ' + esc(filled.text) + '</strong>';
                else {
                    const num = slots.structure && slots.structure.number === 'pl' ? 'pl' : 'sg';
                    inner += '<strong>' + filled.emoji + ' ' + esc(objLabel(filled, num)) + '</strong>';
                }
            }
            const st = family ? 'border-color:' + (COL[family] || COL.obj).bg : '';
            return '<div class="cb-slot' + (on ? ' on' : '') + (filled ? ' filled' : '') + '" data-cb="slot" data-prefix="' + prefix + '" data-id="' + key + '" style="' + st + '">' + inner + '</div>';
        };
        const fam = slots.structure ? slots.structure.family : (S.goal || 'is');
        let html = '<div class="cb-slots">';
        html += mk('structure', 'structure', fam);
        html += mk('object', 'thing', 'obj');
        const showPrep = !slots.structure || slots.structure.family !== 'have';
        if (showPrep) {
            html += mk('prep', 'where?', 'prep');
            if (!slots.prep || !slots.prep.adverb) html += mk('place', 'place', 'obj');
            if (slots.prep && slots.prep.id === 'between') html += mk('place2', 'and', 'obj');
        }
        html += '</div>';
        return html;
    }

    function sheetHtml() {
        const stNum = S.slots.structure && S.slots.structure.number === 'pl' ? 'pl' : 'sg';
        const step = S.activeSlot;
        const showA = S.ageBand !== 'young' || step === 'structure';
        const showB = S.ageBand !== 'young' || step === 'prep';
        const showCD = S.ageBand !== 'young' || step === 'object' || step === 'place' || step === 'place2';

        let html = '';
        if (showA) {
            html += '<div class="cb-sheet"><h3>Sheet A — structures</h3><div class="cb-cards">';
            visibleStructures().forEach((s) => {
                const sel = S.slots.structure && S.slots.structure.id === s.id ? ' sel' : '';
                html += '<button type="button" class="cb-card' + sel + '" data-cb="card-st" data-id="' + s.id + '" style="' + colorStyle(s.family) + '">' +
                    '<span class="ico">' + COL[s.family].icon + '</span>' + esc(s.text) + '</button>';
            });
            html += '</div></div>';
        }
        if (showB && (!S.slots.structure || S.slots.structure.family !== 'have')) {
            html += '<div class="cb-sheet"><h3>Sheet B — prepositions</h3><div class="cb-cards">';
            visiblePreps().forEach((p) => {
                const sel = S.slots.prep && S.slots.prep.id === p.id ? ' sel' : '';
                html += '<button type="button" class="cb-card' + sel + '" data-cb="card-prep" data-id="' + p.id + '" style="' + colorStyle('prep') + '">' +
                    '<span class="ico">' + p.icon + '</span>' + esc(p.text) + '</button>';
            });
            html += '</div></div>';
        }
        if (showCD) {
            const sheets = S.ageBand === 'young' ? ['C'] : ['C', 'D'];
            sheets.forEach((sh) => {
                const list = visibleObjects().filter((o) => o.sheet === sh || (S.ageBand === 'young' && YOUNG_OBJ.includes(o.id)));
                const unique = [];
                const seen = {};
                list.forEach((o) => { if (!seen[o.id] && o.sheet === sh) { seen[o.id] = 1; unique.push(o); } });
                if (S.ageBand === 'young' && sh === 'D') return;
                html += '<div class="cb-sheet"><h3>Sheet ' + sh + ' — things</h3><div class="cb-cards">';
                (S.ageBand === 'young' ? visibleObjects() : unique).forEach((o) => {
                    const sel = (S.slots.object && S.slots.object.id === o.id && (S.activeSlot === 'object' || nextSlot(S.slots) === 'object')) ||
                        (S.slots.place && S.slots.place.id === o.id && S.activeSlot === 'place') ||
                        (S.slots.place2 && S.slots.place2.id === o.id);
                    html += '<button type="button" class="cb-card' + (sel ? ' sel' : '') + '" data-cb="card-obj" data-id="' + o.id + '" style="' + colorStyle('obj') + '">' +
                        '<span class="ico">' + o.emoji + '</span>' + esc(objLabel(o, stNum)) + '</button>';
                });
                html += '</div></div>';
                if (S.ageBand === 'young') return;
            });
        }
        return html;
    }

    function colorSentence(slots) {
        if (!slots.structure || !slots.object) return '';
        const fam = slots.structure.family;
        let html = tokHtml(fam, slots.structure.text, COL[fam].icon);
        const n = slots.structure.number === 'pl' || slots.object.forcePl ? 'pl' : 'sg';
        const art = articleFor(slots.object, n);
        const noun = (art ? art + ' ' : '') + objLabel(slots.object, n);
        html += tokHtml('obj', noun, slots.object.emoji);
        if (slots.prep) {
            html += tokHtml('prep', slots.prep.text, slots.prep.icon);
            if (!slots.prep.adverb && slots.place) {
                html += tokHtml('obj', 'the ' + slots.place.sg, slots.place.emoji);
            }
            if (slots.place2) html += tokHtml('obj', 'and the ' + slots.place2.sg, slots.place2.emoji);
        }
        return html;
    }

    function mapHtml() {
        const task = S.mapTask;
        let html = '<div class="cb-map-tools">' +
            '<button type="button" class="cb-tab' + (S.mapMode === 'listen' ? ' on' : '') + '" data-cb="map-mode" data-id="listen">Sentence → room</button>' +
            '<button type="button" class="cb-tab' + (S.mapMode === 'say' ? ' on' : '') + '" data-cb="map-mode" data-id="say">Room → sentence</button>' +
            '<button type="button" class="btn btn-outline" data-cb="map-new">New task</button>' +
            '<button type="button" class="btn btn-blue" data-cb="map-check">Check</button>' +
            '<button type="button" class="btn btn-grey" data-cb="map-clear">Clear room</button>' +
            '</div>';
        if (S.mapMode === 'listen' && task) {
            html += '<div class="cb-sentence">' + mapTaskSentenceHtml(task) + '</div>';
        }
        html += '<div class="cb-palette">';
        movablePalette().forEach((o) => {
            const on = S.mapPlacing === o.id ? ' on' : '';
            html += '<button type="button" class="cb-chip' + on + '" data-cb="pal" data-id="' + o.id + '">' + o.emoji + ' ' + esc(o.sg) + '</button>';
        });
        html += '</div>';
        html += '<p style="font-size:0.85rem;color:var(--text-muted);margin:0 0 0.5rem;">Click a thing, then click the room to place it. Drag to move. Double-click to remove.</p>';
        html += roomSvg();
        if (S.mapMode === 'say') {
            html += '<h3 style="font-family:var(--font-primary);color:var(--royal-blue);margin:1rem 0 0.5rem;">Say what you see</h3>';
            html += slotsHtml(S.mapSlots, 'map');
            html += miniMapCards();
        }
        html += '<div class="cb-fb' + (S.mapOk ? ' ok' : (S.mapFb ? ' bad' : '')) + '">' + esc(S.mapFb || '') + '</div>';
        return html;
    }

    function movablePalette() {
        const list = OBJECTS.filter((o) => o.movable);
        return S.ageBand === 'young' ? list.filter((o) => YOUNG_OBJ.includes(o.id) || ['lamp', 'cushion', 'box', 'key', 'desk', 'sofa', 'table', 'bed', 'chair'].includes(o.id)) : list;
    }

    function mapTaskSentenceHtml(task) {
        const fam = task.family;
        const obj = byId(task.itemId || task.item) || byId(task.item);
        const prep = task.prep ? prepById(task.prep) : null;
        const place = task.place && task.place !== 'wall' ? byId(task.place) : null;
        const place2 = task.place2 ? byId(task.place2) : null;
        const st = fam === 'are' ? stById('there-are') : stById('there-is');
        const n = fam === 'are' ? 'pl' : 'sg';
        let html = tokHtml(fam, st.text, COL[fam].icon);
        if (obj) html += tokHtml('obj', (n === 'sg' ? articleFor(obj, 'sg') + ' ' : '') + objLabel(obj, n), obj.emoji);
        if (prep) html += tokHtml('prep', prep.text, prep.icon);
        if (prep && prep.adverb) { /* no place */ }
        else if (task.place === 'wall') html += tokHtml('obj', 'the wall', '🧱');
        else if (place) html += tokHtml('obj', 'the ' + place.sg, place.emoji);
        if (place2) html += tokHtml('obj', 'and the ' + place2.sg, place2.emoji);
        return html;
    }

    function roomSvg() {
        let html = '<div class="cb-room-wrap"><div class="cb-room" data-cb="room">';
        html += '<div class="cb-wall-top"></div>';
        html += '<div class="cb-wall-left"></div>';
        html += '<div class="cb-garden"><span class="cb-zone-lab" style="top:8px;right:6px;">outside</span></div>';
        html += '<div class="cb-stairs">' + '<i></i>'.repeat(8) + '<span class="cb-zone-lab" style="position:absolute;bottom:6px;left:4px;">upstairs</span></div>';
        html += '<div class="cb-door"><span class="cb-knob"></span></div>';
        html += '<div class="cb-window"><span class="bar-h"></span><span class="bar-v"></span></div>';
        html += '<div class="cb-glow"></div><div class="cb-base"></div>';
        html += '<span class="cb-zone-lab" style="left:18%;bottom:8%;color:#5c4033;">downstairs</span>';
        S.mapItems.forEach((it) => {
            const o = byId(it.id);
            if (!o) return;
            html += '<div class="cb-item" data-cb="item" data-id="' + it.uid + '" style="left:' + it.x + '%;top:' + it.y + '%;width:' + it.w + '%;height:' + it.h + '%;">' +
                o.emoji + '<span class="lab">' + esc(o.sg) + '</span></div>';
        });
        html += '</div></div>';
        return html;
    }

    function miniMapCards() {
        let html = '<div class="cb-sheet"><div class="cb-cards">';
        visibleStructures().slice(0, 6).forEach((s) => {
            html += '<button type="button" class="cb-card" data-cb="map-st" data-id="' + s.id + '" style="' + colorStyle(s.family) + '">' + COL[s.family].icon + ' ' + esc(s.text) + '</button>';
        });
        html += '</div></div><div class="cb-sheet"><div class="cb-cards">';
        visiblePreps().forEach((p) => {
            html += '<button type="button" class="cb-card" data-cb="map-prep" data-id="' + p.id + '" style="' + colorStyle('prep') + '">' + p.icon + ' ' + esc(p.text) + '</button>';
        });
        html += '</div></div><div class="cb-sheet"><div class="cb-cards">';
        movablePalette().concat(OBJECTS.filter((o) => o.fixture)).forEach((o) => {
            html += '<button type="button" class="cb-card" data-cb="map-obj" data-id="' + o.id + '" style="' + colorStyle('obj') + '">' + o.emoji + ' ' + esc(o.sg) + '</button>';
        });
        html += '</div></div>';
        return html;
    }

    function textHtml() {
        const kinds = [
            ['gap', 'Gap fill'],
            ['mcq', 'Multiple choice'],
            ['reorder', 'Rearrange'],
            ['match', 'Matching']
        ];
        let html = '<div class="cb-text-kinds">';
        kinds.forEach(([id, lab]) => {
            html += '<button type="button" class="cb-tab' + (S.textKind === id ? ' on' : '') + '" data-cb="text-kind" data-id="' + id + '">' + lab + '</button>';
        });
        html += '<button type="button" class="btn btn-outline" data-cb="text-next">New task</button></div>';
        if (S.textKind === 'gap') html += gapHtml();
        if (S.textKind === 'mcq') html += mcqHtml();
        if (S.textKind === 'reorder') html += reorderHtml();
        if (S.textKind === 'match') html += matchHtml();
        html += '<div class="cb-actions"><button type="button" class="btn btn-blue" data-cb="text-check">Check</button></div>';
        html += '<div class="cb-fb' + (S.textOk ? ' ok' : (S.textFb ? ' bad' : '')) + '">' + esc(S.textFb || '') + '</div>';
        return html;
    }

    function gapHtml() {
        const g = S.gap;
        if (!g) return '';
        const line = g.parts.map((p) => {
            if (typeof p === 'string') return esc(p);
            return '<span class="cb-blank">' + esc(S.gapPick || '___') + '</span>';
        }).join('');
        let html = '<div class="cb-gap-line">' + line + '</div><div class="cb-cards">';
        g.options.forEach((op) => {
            const fam = op === 'is' || op === 'a' || op === 'an' || op === 'the' ? 'is' : (op === 'are' || op === 'some' || op === 'any' ? 'are' : (op === 'have' || op === 'has' ? 'have' : 'prep'));
            html += '<button type="button" class="cb-opt' + (S.gapPick === op ? ' on' : '') + '" data-cb="gap-pick" data-id="' + esc(op) + '" style="' + colorStyle(fam) + '">' + esc(op) + '</button>';
        });
        html += '</div>';
        return html;
    }

    function mcqHtml() {
        const m = S.mcq;
        if (!m) return '';
        let html = '<p style="font-family:var(--font-primary);font-weight:700;margin-bottom:0.75rem;">' + esc(m.q) + '</p>';
        m.options.forEach((op, i) => {
            html += '<div><button type="button" class="cb-opt' + (S.mcqPick === i ? ' on' : '') + '" data-cb="mcq-pick" data-id="' + i + '" style="width:100%;text-align:left;margin-bottom:0.4rem;' + colorStyle(m.family) + '">' + esc(op) + '</button></div>';
        });
        return html;
    }

    function reorderHtml() {
        const r = S.reorder;
        if (!r) return '';
        let html = '<div class="cb-build-row">';
        (S.reorderBuilt || []).forEach((w, i) => {
            html += '<button type="button" class="cb-word" data-cb="reorder-pop" data-id="' + i + '">' + esc(w) + '</button>';
        });
        html += '</div><div>';
        r.shuffled.forEach((w, i) => {
            const used = S.reorderUsed && S.reorderUsed[i];
            html += '<button type="button" class="cb-word' + (used ? ' used' : '') + '" data-cb="reorder-push" data-id="' + i + '"' + (used ? ' disabled' : '') + '>' + esc(w) + '</button>';
        });
        html += '</div>';
        return html;
    }

    function matchHtml() {
        const m = S.match;
        if (!m) return '';
        let html = '<div class="cb-match"><div>';
        m.left.forEach((item, i) => {
            const done = S.matchDone[item.i];
            html += '<button type="button" class="cb-opt' + (S.matchSel === 'L' + i ? ' on' : '') + '" data-cb="match-l" data-id="' + i + '" style="width:100%;margin-bottom:0.35rem;' + colorStyle(item.family) + (done ? ';opacity:0.45;' : '') + '">' + esc(item.left) + '</button>';
        });
        html += '</div><div>';
        m.right.forEach((item, i) => {
            const done = S.matchDone[item.i];
            html += '<button type="button" class="cb-opt' + (S.matchSel === 'R' + i ? ' on' : '') + '" data-cb="match-r" data-id="' + i + '" style="width:100%;margin-bottom:0.35rem;' + (done ? 'opacity:0.45;' : '') + '">' + esc(item.right) + '</button>';
        });
        html += '</div></div>';
        return html;
    }

    function bind(root) {
        root.onclick = (e) => {
            const t = e.target.closest('[data-cb]');
            if (!t) return;
            const a = t.dataset.cb;
            const id = t.dataset.id;
            if (a === 'tab') { S.tab = id; S.activeSlot = 'structure'; S.buildFb = ''; S.mapFb = ''; S.textFb = ''; render(); return; }
            if (a === 'pl') { S.polish = !S.polish; render(); return; }
            if (a === 'goal') { chooseGoal(id); return; }
            if (a === 'slot') { S.activeSlot = id; render(); return; }
            if (a === 'card-st') { putSlot('structure', stById(id)); return; }
            if (a === 'card-prep') { putSlot('prep', prepById(id)); return; }
            if (a === 'card-obj') { putObject(byId(id)); return; }
            if (a === 'check-build') { checkBuild(); return; }
            if (a === 'speak-build') { speak(S.buildSpoken || buildSpoken(S.slots)); return; }
            if (a === 'clear-build') { resetBuild(false); render(); return; }
            if (a === 'new-prompt') { S.buildPrompt = makeBuildPrompt(S.goal); resetBuild(true); render(); return; }
            if (a === 'new-goal') { S.goal = null; resetBuild(false); render(); return; }
            if (a === 'map-mode') { S.mapMode = id; S.mapFb = ''; if (id === 'listen' && !S.mapTask) newMapTask(); render(); return; }
            if (a === 'map-new') { newMapTask(); render(); return; }
            if (a === 'map-check') { checkMap(); return; }
            if (a === 'map-clear') { S.mapItems = []; S.mapFb = ''; render(); return; }
            if (a === 'pal') { S.mapPlacing = S.mapPlacing === id ? null : id; render(); return; }
            if (a === 'room') { placeOnRoom(e); return; }
            if (a === 'item') { /* drag handles separately */ return; }
            if (a === 'map-st') { putMapSlot('structure', stById(id)); return; }
            if (a === 'map-prep') { putMapSlot('prep', prepById(id)); return; }
            if (a === 'map-obj') { putMapObject(byId(id)); return; }
            if (a === 'text-kind') { S.textKind = id; loadTextTask(); render(); return; }
            if (a === 'text-next') { loadTextTask(); render(); return; }
            if (a === 'text-check') { checkText(); return; }
            if (a === 'gap-pick') { S.gapPick = id; S.textFb = ''; render(); return; }
            if (a === 'mcq-pick') { S.mcqPick = Number(id); S.textFb = ''; render(); return; }
            if (a === 'reorder-push') { pushReorder(Number(id)); return; }
            if (a === 'reorder-pop') { popReorder(Number(id)); return; }
            if (a === 'match-l') { tapMatch('L', Number(id)); return; }
            if (a === 'match-r') { tapMatch('R', Number(id)); return; }
        };
        root.ondblclick = (e) => {
            const item = e.target.closest('[data-cb="item"]');
            if (!item) return;
            S.mapItems = S.mapItems.filter((x) => x.uid !== item.dataset.id);
            render();
        };
    }

    function chooseGoal(id) {
        S.goal = id;
        S.activeSlot = 'structure';
        resetBuild(false);
        if (S.ageBand === 'young') S.buildPrompt = makeBuildPrompt(id);
        else S.buildPrompt = null;
        render();
    }

    function resetBuild(keepPrompt) {
        S.slots = emptySlots();
        S.activeSlot = 'structure';
        S.buildFb = '';
        S.buildOk = false;
        S.buildSpoken = '';
        S.buildAwarded = false;
        if (!keepPrompt && S.ageBand === 'young' && S.goal) S.buildPrompt = makeBuildPrompt(S.goal);
    }

    function putSlot(key, val) {
        S.slots[key] = val;
        if (key === 'structure') {
            S.activeSlot = 'object';
            if (val && val.family === 'have') {
                S.slots.prep = null; S.slots.place = null; S.slots.place2 = null;
            }
        } else if (key === 'prep') {
            if (val && val.adverb) { S.slots.place = null; S.slots.place2 = null; }
            if (val && val.id !== 'between') S.slots.place2 = null;
            S.activeSlot = val && val.adverb ? 'prep' : 'place';
        } else if (key === 'object') {
            S.activeSlot = (S.slots.structure && S.slots.structure.family === 'have') ? 'object' : 'prep';
        }
        S.buildFb = ''; S.buildOk = false; S.buildSpoken = ''; S.buildAwarded = false;
        render();
    }

    function putObject(obj) {
        const slot = S.activeSlot;
        const next = nextSlot(S.slots);
        const target = (slot === 'place' || slot === 'place2') ? slot
            : (next === 'place' || next === 'place2' ? next : 'object');
        if (target === 'place' || target === 'place2') {
            S.slots[target] = obj;
            if (target === 'place' && S.slots.prep && S.slots.prep.id === 'between') S.activeSlot = 'place2';
            else S.activeSlot = target;
        } else {
            S.slots.object = obj;
            S.activeSlot = (S.slots.structure && S.slots.structure.family === 'have') ? 'object' : 'prep';
        }
        S.buildFb = ''; S.buildOk = false; S.buildSpoken = ''; S.buildAwarded = false;
        render();
    }

    function putMapSlot(key, val) {
        S.mapSlots[key] = val;
        if (key === 'structure') S.activeSlot = 'object';
        if (key === 'prep') S.activeSlot = val && val.adverb ? 'prep' : 'place';
        render();
    }
    function putMapObject(obj) {
        if (S.activeSlot === 'place' || S.activeSlot === 'place2') S.mapSlots[S.activeSlot] = obj;
        else { S.mapSlots.object = obj; S.activeSlot = 'prep'; }
        render();
    }

    function checkBuild() {
        const v = validateSlots(S.slots);
        if (!v.ok) {
            S.buildOk = false;
            S.buildFb = S.polish ? v.pl : v.en;
            S.buildSpoken = '';
            render();
            return;
        }
        if (S.buildPrompt && !promptMatches(S.slots, S.buildPrompt)) {
            S.buildOk = false;
            S.buildFb = S.polish
                ? 'Prawie! Ułóż zdanie dokładnie o obrazku.'
                : 'Almost! Make the sentence match the picture.';
            S.buildSpoken = '';
            render();
            return;
        }
        S.buildOk = true;
        S.buildSpoken = v.sentence;
        S.buildFb = S.polish ? 'Tak! Powiedz zdanie na głos.' : 'Yes! Say the sentence aloud.';
        if (!S.buildAwarded) {
            S.buildAwarded = true;
            award(10, { tab: 'build', sentence: v.sentence });
        }
        speak(v.sentence);
        render();
    }

    function newMapTask() {
        const pool = S.ageBand === 'young'
            ? ROOM_TASKS.filter((t) => ['on', 'under', 'next-to', 'in'].includes(t.prep) || !t.prep)
            : ROOM_TASKS;
        S.mapTask = pick(pool);
        S.mapFb = '';
        S.mapOk = false;
        S.mapPlacing = null;
        if (S.mapMode === 'listen') S.mapItems = [];
        S.mapAwarded = false;
        seedReferenceFurniture(S.mapTask);
    }

    function seedReferenceFurniture(task) {
        const keepIds = new Set();
        ['place', 'place2'].forEach((k) => {
            if (!task[k] || task[k] === 'wall') return;
            const o = byId(task[k]);
            if (!o || o.fixture) return;
            keepIds.add(o.id);
            if (!S.mapItems.some((x) => x.id === o.id)) {
                S.mapItems.push(makeItem(o.id, 40 + keepIds.size * 12, 55));
            }
        });
    }

    function makeItem(id, x, y) {
        return { uid: id + '-' + Math.random().toString(36).slice(2, 7), id, x: x, y: y, w: 11, h: 16 };
    }

    function placeOnRoom(e) {
        if (!S.mapPlacing) return;
        const room = e.currentTarget && e.currentTarget.classList && e.currentTarget.classList.contains('cb-room')
            ? e.currentTarget
            : e.target.closest('.cb-room');
        if (!room) return;
        if (e.target.closest('.cb-item')) return;
        const r = room.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 100 - 5;
        const y = ((e.clientY - r.top) / r.height) * 100 - 8;
        S.mapItems.push(makeItem(S.mapPlacing, clamp(x, 1, 88), clamp(y, 4, 82)));
        S.mapPlacing = null;
        render();
    }

    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

    function bindRoomDrag(root) {
        const room = root.querySelector('.cb-room');
        if (!room) return;
        room.addEventListener('pointerdown', (e) => {
            const el = e.target.closest('.cb-item');
            if (!el) return;
            e.preventDefault();
            const it = S.mapItems.find((x) => x.uid === el.dataset.id);
            if (!it) return;
            const r = room.getBoundingClientRect();
            drag = {
                uid: it.uid, el, room,
                dx: e.clientX - r.left - (it.x / 100) * r.width,
                dy: e.clientY - r.top - (it.y / 100) * r.height
            };
            el.classList.add('drag');
            el.setPointerCapture(e.pointerId);
        });
        room.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const r = drag.room.getBoundingClientRect();
            const it = S.mapItems.find((x) => x.uid === drag.uid);
            if (!it) return;
            it.x = clamp(((e.clientX - r.left - drag.dx) / r.width) * 100, 0, 90);
            it.y = clamp(((e.clientY - r.top - drag.dy) / r.height) * 100, 0, 84);
            drag.el.style.left = it.x + '%';
            drag.el.style.top = it.y + '%';
        });
        const end = () => {
            if (!drag) return;
            if (drag.el) drag.el.classList.remove('drag');
            const now = Date.now();
            const prev = room._cbLastTap;
            if (prev && prev.uid === drag.uid && now - prev.t < 400) {
                const uid = drag.uid;
                drag = null;
                S.mapItems = S.mapItems.filter((x) => x.uid !== uid);
                render();
                return;
            }
            room._cbLastTap = { uid: drag.uid, t: now };
            drag = null;
        };
        room.addEventListener('pointerup', end);
        room.addEventListener('pointercancel', end);
    }

    function itemRect(it) { return { id: it.id, x: it.x, y: it.y, w: it.w, h: it.h }; }

    function findItems(id) {
        if (FIXTURES[id]) return [{ id, ...FIXTURES[id], fixture: true }];
        return S.mapItems.filter((x) => x.id === id);
    }

    function centersClose(a, b, max) {
        const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
        const bx = b.x + b.w / 2, by = b.y + b.h / 2;
        return Math.hypot(ax - bx, ay - by) <= max;
    }
    function overlapX(a, b, pad) {
        return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x;
    }

    function relationOk(item, place, prepId, extra) {
        if (prepId === 'upstairs') return item.x < 16;
        if (prepId === 'downstairs') return item.x >= 16 && item.x < 82;
        if (prepId === 'outside') return item.x + item.w > 82;
        if (prepId === 'on' && place && place.id === 'wall') {
            return item.y < 28 && item.x >= 16 && item.x < 82;
        }
        if (prepId === 'on' && (!place || place.id === 'floor')) {
            return item.y > 50 && item.x >= 16 && item.x < 82;
        }
        if (!place) return false;
        if (prepId === 'on') {
            return overlapX(item, place, 8) && Math.abs((item.y + item.h) - place.y) < 16 && item.y <= place.y + 6;
        }
        if (prepId === 'under') return overlapX(item, place, 8) && item.y >= place.y + place.h * 0.45;
        if (prepId === 'above') return overlapX(item, place, 10) && (place.y - (item.y + item.h)) > 1 && (place.y - (item.y + item.h)) < 32;
        if (prepId === 'next-to') {
            const side = Math.abs((item.x + item.w) - place.x) < 18 || Math.abs((place.x + place.w) - item.x) < 18;
            return side && Math.abs((item.y + item.h / 2) - (place.y + place.h / 2)) < 22;
        }
        if (prepId === 'near') return centersClose(item, place, 28);
        if (prepId === 'in') {
            const cx = item.x + item.w / 2, cy = item.y + item.h / 2;
            return cx >= place.x && cx <= place.x + place.w && cy >= place.y && cy <= place.y + place.h;
        }
        if (prepId === 'behind') return overlapX(item, place, 10) && item.y + item.h <= place.y + 10;
        if (prepId === 'in-front-of') return overlapX(item, place, 10) && item.y >= place.y + place.h - 12;
        if (prepId === 'between' && extra) {
            const left = place.x <= extra.x ? place : extra;
            const right = place.x <= extra.x ? extra : place;
            const cx = item.x + item.w / 2;
            return cx > left.x + left.w * 0.4 && cx < right.x + right.w * 0.6;
        }
        return false;
    }

    function checkMap() {
        if (S.mapMode === 'say') return checkMapSay();
        const task = S.mapTask;
        if (!task) return;
        const objId = task.itemId || task.item;
        const items = findItems(objId);
        if (!items.length) {
            S.mapOk = false;
            S.mapFb = S.polish ? 'Najpierw postaw przedmiot z zdania w pokoju.' : 'First put the thing from the sentence into the room.';
            render();
            return;
        }
        const item = items[0];
        let place = null, extra = null;
        if (task.place === 'wall') {
            place = { x: 20, y: 2, w: 60, h: 26, id: 'wall' };
        } else if (task.place) {
            const ps = findItems(task.place);
            place = ps[0] || null;
        }
        if (task.place2) extra = (findItems(task.place2)[0] || null);
        const ok = relationOk(itemRect(item), place && itemRect(place), task.prep, extra && itemRect(extra));
        S.mapOk = ok;
        if (ok) {
            S.mapFb = S.polish ? 'Tak! Przedmiot jest we właściwym miejscu.' : 'Yes! The thing is in the right place.';
            if (!S.mapAwarded) { S.mapAwarded = true; award(15, { tab: 'map', prep: task.prep }); }
        } else {
            S.mapFb = S.polish
                ? 'Jeszcze nie. Popatrz na ikonę przyimka i przesuń przedmiot.'
                : 'Not yet. Look at the preposition icon and move the thing.';
        }
        render();
    }

    function checkMapSay() {
        const v = validateSlots(S.mapSlots);
        if (!v.ok) {
            S.mapOk = false;
            S.mapFb = S.polish ? v.pl : v.en;
            render();
            return;
        }
        const obj = S.mapSlots.object;
        const items = findItems(obj.id);
        if (!items.length) {
            S.mapOk = false;
            S.mapFb = S.polish ? 'Ten przedmiot nie stoi jeszcze w pokoju.' : 'That thing is not in the room yet.';
            render();
            return;
        }
        if (S.mapSlots.structure.family === 'have') {
            S.mapOk = true;
            S.mapFb = S.polish ? 'Tak — ten przedmiot jest w pokoju.' : 'Yes — that thing is in the room.';
            if (!S.mapAwarded) { S.mapAwarded = true; award(15, { tab: 'map-say' }); }
            render();
            return;
        }
        const item = items[0];
        const prep = S.mapSlots.prep;
        let place = S.mapSlots.place ? (findItems(S.mapSlots.place.id)[0] || null) : null;
        const extra = S.mapSlots.place2 ? (findItems(S.mapSlots.place2.id)[0] || null) : null;
        const ok = relationOk(itemRect(item), place && itemRect(place), prep.id, extra && itemRect(extra));
        S.mapOk = ok;
        if (ok) {
            S.mapFb = S.polish ? 'Zdanie pasuje do pokoju!' : 'The sentence matches the room!';
            if (!S.mapAwarded) { S.mapAwarded = true; award(15, { tab: 'map-say' }); }
        } else {
            S.mapFb = S.polish ? 'Zdanie jest poprawne, ale meble stoją inaczej. Przesuń je albo zmień przyimek.' : 'Good grammar, but the furniture does not match. Move it or change the preposition.';
        }
        render();
    }

    function loadTextTask() {
        S.textFb = '';
        S.textOk = false;
        S.textAwarded = false;
        S.gapPick = '';
        S.mcqPick = -1;
        S.reorderBuilt = [];
        S.reorderUsed = {};
        S.matchSel = '';
        S.matchDone = {};
        if (S.textKind === 'gap') S.gap = pick(TEXT_GAPS);
        if (S.textKind === 'mcq') S.mcq = pick(TEXT_MCQ);
        if (S.textKind === 'reorder') {
            const src = pick(TEXT_REORDER);
            S.reorder = { words: src.words, extra: src.extra || '', shuffled: shuffle(src.words), family: src.family };
        }
        if (S.textKind === 'match') {
            const set = shuffle(TEXT_MATCH).slice(0, 6).map((p, i) => Object.assign({ i }, p));
            S.match = { left: shuffle(set), right: shuffle(set.slice()) };
        }
    }

    function pushReorder(i) {
        if (S.reorderUsed[i]) return;
        S.reorderUsed[i] = true;
        S.reorderBuilt.push(S.reorder.shuffled[i]);
        S.textFb = '';
        render();
    }
    function popReorder(i) {
        const w = S.reorderBuilt.splice(i, 1)[0];
        const idx = S.reorder.shuffled.findIndex((x, n) => x === w && S.reorderUsed[n]);
        if (idx >= 0) S.reorderUsed[idx] = false;
        render();
    }

    function tapMatch(side, i) {
        const key = side + i;
        if (S.matchSel && S.matchSel[0] !== side) {
            const a = S.matchSel;
            const left = a[0] === 'L' ? S.match.left[Number(a.slice(1))] : S.match.right[Number(a.slice(1))];
            const right = side === 'L' ? S.match.left[i] : S.match.right[i];
            const L = a[0] === 'L' ? left : right;
            const R = a[0] === 'L' ? right : left;
            if (L.i === R.i) {
                S.matchDone[L.i] = true;
            }
            S.matchSel = '';
            render();
            return;
        }
        S.matchSel = key;
        render();
    }

    function checkText() {
        let ok = false;
        let en = '';
        let pl = '';
        if (S.textKind === 'gap') {
            ok = S.gapPick === S.gap.answer;
            en = ok ? S.gap.en : 'Try again. ' + S.gap.en;
            pl = ok ? S.gap.pl : 'Spróbuj jeszcze raz. ' + S.gap.pl;
        } else if (S.textKind === 'mcq') {
            ok = S.mcqPick === S.mcq.answer;
            en = ok ? S.mcq.en : 'Try again. ' + S.mcq.en;
            pl = ok ? S.mcq.pl : 'Spróbuj jeszcze raz. ' + S.mcq.pl;
        } else if (S.textKind === 'reorder') {
            const got = S.reorderBuilt.join(' ');
            const want = S.reorder.words.join(' ');
            ok = got === want;
            en = ok ? 'Perfect order!' : 'Tap Clear in your head — try the words again in sentence order.';
            pl = ok ? 'Świetna kolejność!' : 'Ułóż wyrazy tak, jak w zdaniu.';
        } else if (S.textKind === 'match') {
            const n = S.match.left.length;
            ok = Object.keys(S.matchDone).length === n;
            en = ok ? 'All pairs match.' : 'Keep matching — click one from each side.';
            pl = ok ? 'Wszystkie pary się zgadzają.' : 'Kliknij po jednym z każdej strony.';
        }
        S.textOk = ok;
        S.textFb = S.polish ? pl : en;
        if (ok && !S.textAwarded) {
            S.textAwarded = true;
            award(10, { tab: 'text', kind: S.textKind });
        }
        render();
    }

    function defaultState(ageBand) {
        return {
            ageBand: ageBand === 'older' ? 'older' : 'young',
            tab: 'build',
            polish: false,
            goal: null,
            slots: emptySlots(),
            mapSlots: emptySlots(),
            activeSlot: 'structure',
            buildPrompt: null,
            buildFb: '',
            buildOk: false,
            buildSpoken: '',
            buildAwarded: false,
            mapMode: 'listen',
            mapTask: null,
            mapItems: [],
            mapPlacing: null,
            mapFb: '',
            mapOk: false,
            mapAwarded: false,
            textKind: 'gap',
            gap: null,
            gapPick: '',
            mcq: null,
            mcqPick: -1,
            reorder: null,
            reorderBuilt: [],
            reorderUsed: {},
            match: null,
            matchSel: '',
            matchDone: {},
            textFb: '',
            textOk: false,
            textAwarded: false
        };
    }

    function initColourBlocks() {
        ensureCss();
        const age = (document.querySelector('input[name="colour-age"]:checked') || {}).value || 'young';
        S = defaultState(age);
        const badge = document.getElementById('colour-age-badge');
        if (badge) badge.textContent = S.ageBand === 'older' ? '10–12' : '8–9';
        loadTextTask();
        newMapTask();
        render();
    }

    global.initColourBlocks = initColourBlocks;
})(typeof window !== 'undefined' ? window : globalThis);
