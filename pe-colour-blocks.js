/**
 * Colour Blocks — Primary English sentence builder.
 * One word or set phrase per tile. Colours and icons stay the same everywhere.
 */
(function (global) {
    'use strict';

    const CSS_ID = 'cb-colour-blocks-css';

    const COL = {
        is:   { bg: '#1d4ed8', light: '#dbeafe', ink: '#1e3a8a', fa: 'fa-circle', label: 'There is · 1' },
        are:  { bg: '#15803d', light: '#dcfce7', ink: '#14532d', fa: 'fa-ellipsis', label: 'There are · many' },
        have: { bg: '#7c3aed', light: '#ede9fe', ink: '#5b21b6', fa: 'fa-key', label: 'have got' },
        can:  { bg: '#b45309', light: '#ffedd5', ink: '#9a3412', fa: 'fa-hand-fist', label: 'can / can\'t' },
        like: { bg: '#be123c', light: '#ffe4e6', ink: '#9f1239', fa: 'fa-heart', label: 'like' },
        must: { bg: '#b91c1c', light: '#fee2e2', ink: '#7f1d1d', fa: 'fa-exclamation', label: 'must / have to' },
        art:  { bg: '#ca8a04', light: '#fef9c3', ink: '#854d0e', fa: 'fa-font', label: 'a / an / the' },
        prep: { bg: '#c2410c', light: '#ffedd5', ink: '#9a3412', fa: 'fa-location-dot', label: 'place words' },
        noun: { bg: '#0f766e', light: '#ccfbf1', ink: '#115e59', fa: 'fa-cube', label: 'things' },
        verb: { bg: '#0369a1', light: '#e0f2fe', ink: '#0c4a6e', fa: 'fa-person-running', label: 'actions' },
        subj: { bg: '#475569', light: '#e2e8f0', ink: '#1e293b', fa: 'fa-user', label: 'who' },
        neg:  { bg: '#9f1239', light: '#ffe4e6', ink: '#881337', fa: 'fa-ban', label: "don't" },
        num:  { bg: '#4f46e5', light: '#e0e7ff', ink: '#312e81', fa: 'fa-hashtag', label: 'numbers' }
    };

    function tile(id, text, kind, family, extra) {
        return Object.assign({
            id: id,
            text: text,
            speak: text,
            kind: kind,
            family: family,
            ages: ['young', 'older'],
            goals: null,
            gloss: '',
            fa: COL[family] ? COL[family].fa : 'fa-cube',
            icon: '',
            vowel: false,
            number: '',
            guess: false
        }, extra || {});
    }

    const TILES = [
        tile('there-is', 'There is', 'struct', 'is', { fa: 'fa-circle', gloss: '1 thing', goals: ['is'] }),
        tile('there-are', 'There are', 'struct', 'are', { fa: 'fa-ellipsis', gloss: 'many', goals: ['are'] }),
        tile('is-there', 'Is there', 'struct', 'is', { fa: 'fa-circle-question', gloss: 'ask · 1', goals: ['is'], speak: 'Is there' }),
        tile('are-there', 'Are there', 'struct', 'are', { fa: 'fa-circle-question', gloss: 'ask · many', goals: ['are'], speak: 'Are there' }),
        tile('there-isnt', "There isn't", 'struct', 'is', { fa: 'fa-circle-xmark', gloss: 'not 1', goals: ['is'] }),
        tile('there-arent', "There aren't", 'struct', 'are', { fa: 'fa-circle-xmark', gloss: 'not many', goals: ['are'] }),

        tile('i', 'I', 'subj', 'subj', { fa: 'fa-user', gloss: 'me', icon: '👤', guess: true, goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('you', 'you', 'subj', 'subj', { fa: 'fa-user', gloss: 'you', icon: '🙂', guess: true, goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('he', 'he', 'subj', 'subj', { fa: 'fa-child', gloss: 'boy', icon: '👦', guess: true, goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('she', 'she', 'subj', 'subj', { fa: 'fa-child-dress', gloss: 'girl', icon: '👧', guess: true, goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('we', 'we', 'subj', 'subj', { fa: 'fa-users', gloss: 'us', icon: '👥', guess: true, goals: ['have', 'can', 'like', 'must', 'haveto'], ages: ['older'] }),
        tile('they', 'they', 'subj', 'subj', { fa: 'fa-users', gloss: 'them', icon: '👪', guess: true, goals: ['have', 'can', 'like', 'must', 'haveto'], ages: ['older'] }),

        tile('a', 'a', 'art', 'art', { fa: 'fa-font', icon: 'a', gloss: 'before b, c, d…', goals: ['is', 'have', 'like'] }),
        tile('an', 'an', 'art', 'art', { fa: 'fa-font', icon: 'an', gloss: 'before a, e, i, o, u', goals: ['is', 'have', 'like'] }),
        tile('the', 'the', 'art', 'art', { fa: 'fa-font', icon: 'the', gloss: 'that one', goals: ['is', 'are', 'have'] }),
        tile('some', 'some', 'art', 'art', { fa: 'fa-plus', gloss: 'in yes-sentences', goals: ['are'] }),
        tile('any', 'any', 'art', 'art', { fa: 'fa-question', gloss: 'in questions / no', goals: ['are'] }),

        tile('one', 'one', 'num', 'num', { fa: 'fa-hashtag', icon: '1', gloss: '1', goals: ['is'], ages: ['older'] }),
        tile('two', 'two', 'num', 'num', { fa: 'fa-hashtag', icon: '2', gloss: '2', goals: ['are'] }),
        tile('three', 'three', 'num', 'num', { fa: 'fa-hashtag', icon: '3', gloss: '3', goals: ['are'], ages: ['older'] }),

        tile('have-got', 'have got', 'verbp', 'have', { fa: 'fa-key', gloss: 'I / you / we / they', goals: ['have'] }),
        tile('has-got', 'has got', 'verbp', 'have', { fa: 'fa-key', gloss: 'he / she', goals: ['have'] }),
        tile('havent-got', "haven't got", 'verbp', 'have', { fa: 'fa-key', gloss: 'I / you · no', goals: ['have'] }),
        tile('hasnt-got', "hasn't got", 'verbp', 'have', { fa: 'fa-key', gloss: 'he / she · no', goals: ['have'] }),

        tile('can', 'can', 'modal', 'can', { fa: 'fa-hand-fist', gloss: 'able to', icon: '💪', guess: true, goals: ['can'] }),
        tile('cant', "can't", 'modal', 'can', { fa: 'fa-hand-fist', gloss: 'not able', icon: '🚫', guess: true, goals: ['can'] }),
        tile('like', 'like', 'verbp', 'like', { fa: 'fa-heart', gloss: 'enjoy', icon: '❤️', guess: true, goals: ['like'] }),
        tile('dont', "don't", 'neg', 'neg', { fa: 'fa-ban', gloss: 'not', icon: '🚫', guess: true, goals: ['like', 'haveto'] }),

        tile('must', 'must', 'modal', 'must', { fa: 'fa-exclamation', gloss: 'necessary', icon: '❗', guess: true, goals: ['must'], ages: ['older'] }),
        tile('have-to', 'have to', 'modal', 'must', { fa: 'fa-clipboard-list', gloss: 'it is necessary', icon: '📋', guess: true, goals: ['haveto'], ages: ['older'] }),

        tile('in', 'in', 'prep', 'prep', { fa: 'fa-box', gloss: 'inside', icon: '📦', guess: true, goals: ['is', 'are'] }),
        tile('on', 'on', 'prep', 'prep', { fa: 'fa-arrow-up', gloss: 'touching the top', icon: '⬆️', guess: true, goals: ['is', 'are'] }),
        tile('under', 'under', 'prep', 'prep', { fa: 'fa-arrow-down', gloss: 'below', icon: '⬇️', guess: true, goals: ['is', 'are'] }),
        tile('above', 'above', 'prep', 'prep', { fa: 'fa-cloud', gloss: 'over, not touching', icon: '☁️', guess: true, goals: ['is', 'are'] }),
        tile('next-to', 'next to', 'prep', 'prep', { fa: 'fa-arrows-left-right', gloss: 'beside', icon: '↔️', guess: true, goals: ['is', 'are'] }),
        tile('between', 'between', 'prep', 'prep', { fa: 'fa-grip', gloss: 'in the middle', icon: '🔀', guess: true, goals: ['is', 'are'], ages: ['older'] }),
        tile('behind', 'behind', 'prep', 'prep', { fa: 'fa-user-secret', gloss: 'at the back', icon: '🙈', guess: true, goals: ['is', 'are'] }),
        tile('in-front-of', 'in front of', 'prep', 'prep', { fa: 'fa-eye', gloss: 'at the front', icon: '👀', guess: true, goals: ['is', 'are'] }),
        tile('near', 'near', 'prep', 'prep', { fa: 'fa-location-dot', gloss: 'close', icon: '📍', guess: true, goals: ['is', 'are'] }),
        tile('upstairs', 'upstairs', 'prep', 'prep', { fa: 'fa-stairs', gloss: 'up', icon: '⬆️', adverb: true, guess: true, goals: ['is', 'are'], ages: ['older'] }),
        tile('downstairs', 'downstairs', 'prep', 'prep', { fa: 'fa-stairs', gloss: 'down', icon: '⬇️', adverb: true, guess: true, goals: ['is', 'are'], ages: ['older'] }),
        tile('outside', 'outside', 'prep', 'prep', { fa: 'fa-tree', gloss: 'not in the house', icon: '🌳', adverb: true, guess: true, goals: ['is', 'are'] }),
        tile('and', 'and', 'link', 'art', { fa: 'fa-plus', gloss: 'plus', goals: ['is', 'are'], ages: ['older'] }),

        noun('chair', 'chair', 'chairs', '🪑', false, true),
        noun('chairs', 'chairs', 'chairs', '🪑', false, true, { number: 'pl' }),
        noun('desk', 'desk', 'desks', '🖥️', false, true),
        noun('lamp', 'lamp', 'lamps', '💡', false, false),
        noun('lamps', 'lamps', 'lamps', '💡', false, false, { number: 'pl', ages: ['older'] }),
        noun('bin', 'bin', 'bins', '🗑️', false, true),
        noun('table', 'table', 'tables', '🪵', false, true),
        noun('sofa', 'sofa', 'sofas', '🛋️', false, true),
        noun('cushion', 'cushion', 'cushions', '🟧', false, false),
        noun('cushions', 'cushions', 'cushions', '🟧', false, false, { number: 'pl' }),
        noun('shelf', 'shelf', 'shelves', '📚', false, true),
        noun('mirror', 'mirror', 'mirrors', '🪞', false, false),
        noun('poster', 'poster', 'posters', '🖼️', false, false),
        noun('picture', 'picture', 'pictures', '🌄', false, false),
        noun('pictures', 'pictures', 'pictures', '🌄', false, false, { number: 'pl' }),
        noun('noticeboard', 'noticeboard', 'noticeboards', '📋', false, true, { ages: ['older'] }),
        noun('bed', 'bed', 'beds', '🛏️', false, true),
        noun('wardrobe', 'wardrobe', 'wardrobes', '👔', false, true, { ages: ['older'] }),
        noun('door', 'door', 'doors', '🚪', false, true),
        noun('window', 'window', 'windows', '🪟', false, true),
        noun('key', 'key', 'keys', '🗝️', false, false),
        noun('keys', 'keys', 'keys', '🗝️', false, false, { number: 'pl', ages: ['older'] }),
        noun('laptop', 'laptop', 'laptops', '💻', false, false),
        noun('tv', 'TV', 'TVs', '📺', false, true),
        noun('box', 'box', 'boxes', '📦', false, true),
        noun('mat', 'mat', 'mats', '🟩', false, true),
        noun('floor', 'floor', 'floors', '🟫', false, true),
        noun('mobile', 'mobile', 'mobiles', '📱', false, false),
        noun('car', 'car', 'cars', '🚗', false, false),
        noun('book', 'book', 'books', '📖', false, false),
        noun('books', 'books', 'books', '📖', false, false, { number: 'pl' }),
        noun('clock', 'clock', 'clocks', '⏰', false, false),
        noun('bag', 'bag', 'bags', '🎒', false, false),
        noun('pen', 'pen', 'pens', '🖊️', false, false),
        noun('apple', 'apple', 'apples', '🍎', true, false),
        noun('orange', 'orange', 'oranges', '🍊', true, false),
        noun('cat', 'cat', 'cats', '🐱', false, false),
        noun('dog', 'dog', 'dogs', '🐶', false, false),
        noun('ball', 'ball', 'balls', '⚽', false, false),
        noun('bike', 'bike', 'bikes', '🚲', false, false),
        noun('pizza', 'pizza', 'pizzas', '🍕', false, false, { goals: ['like', 'have'] }),
        noun('ice-cream', 'ice cream', 'ice creams', '🍦', true, false, { vowel: true, goals: ['like', 'have'] }),
        noun('football', 'football', 'football', '⚽', false, false, { goals: ['like', 'can'] }),
        noun('music', 'music', 'music', '🎵', false, false, { number: 'unc', goals: ['like'] }),
        noun('school', 'school', 'schools', '🏫', false, false, { goals: ['like', 'must', 'haveto'] }),
        noun('garden', 'garden', 'gardens', '🌳', false, true, { ages: ['older'] }),
        noun('kitchen', 'kitchen', 'kitchens', '🍳', false, true, { ages: ['older'] }),
        noun('bedroom', 'bedroom', 'bedrooms', '🛏️', false, true, { ages: ['older'] }),
        noun('photo', 'photo', 'photos', '📷', false, false, { ages: ['older'] }),
        noun('ticket', 'ticket', 'tickets', '🎫', false, false, { ages: ['older'] }),
        noun('message', 'message', 'messages', '✉️', false, false),
        noun('friend', 'friend', 'friends', '😊', false, false, { goals: ['like', 'have'] }),
        noun('homework', 'homework', 'homework', '📝', false, false, { number: 'unc', goals: ['must', 'haveto'], ages: ['older'] }),

        verb('swim', 'swim', '🏊', ['can', 'must', 'haveto']),
        verb('run', 'run', '🏃', ['can', 'must', 'haveto']),
        verb('jump', 'jump', '🦘', ['can']),
        verb('draw', 'draw', '✏️', ['can', 'like']),
        verb('sing', 'sing', '🎤', ['can', 'like']),
        verb('ride', 'ride', '🚲', ['can']),
        verb('play', 'play', '🎮', ['can', 'like', 'must']),
        verb('read', 'read', '📖', ['can', 'like', 'must', 'haveto']),
        verb('write', 'write', '✍️', ['can', 'must', 'haveto']),
        verb('cook', 'cook', '🍳', ['can', 'like'], ['older']),
        verb('dance', 'dance', '💃', ['can', 'like']),
        verb('walk', 'walk', '🚶', ['can', 'must', 'haveto']),
        verb('help', 'help', '🤝', ['must', 'haveto'], ['older']),
        verb('tidy', 'tidy', '🧹', ['must', 'haveto'], ['older']),
        verb('listen', 'listen', '👂', ['must', 'haveto'], ['older']),
        verb('eat', 'eat', '🍽️', ['can', 'like', 'must'])
    ];

    function noun(id, sg, pl, icon, vowel, place, extra) {
        const number = extra && extra.number ? extra.number : 'sg';
        const t = tile(id, sg, 'noun', 'noun', Object.assign({
            fa: 'fa-cube',
            gloss: number === 'pl' ? 'more than one' : (vowel ? 'starts with a vowel' : 'a thing'),
            icon: icon,
            vowel: vowel,
            number: number,
            place: place,
            guess: true,
            goals: (extra && extra.goals) || ['is', 'are', 'have', 'like']
        }, extra || {}));
        return t;
    }

    function verb(id, text, icon, goals, ages) {
        return tile(id, text, 'verb', 'verb', {
            fa: 'fa-person-running',
            gloss: 'an action',
            icon: icon,
            guess: true,
            goals: goals,
            ages: ages || ['young', 'older']
        });
    }

    const TEXT_GAPS = [
        { parts: ['There ', { gap: true }, ' a lamp on the desk.'], options: ['is', 'are', 'has'], answer: 'is', family: 'is',
            en: 'Use There is with one thing.', pl: 'There is — jedna rzecz.' },
        { parts: ['There ', { gap: true }, ' two cushions next to the sofa.'], options: ['is', 'are', 'have'], answer: 'are', family: 'are',
            en: 'Use There are with more than one thing.', pl: 'There are — wiele rzeczy.' },
        { parts: ['There is ', { gap: true }, ' chair by the window.'], options: ['a', 'an', 'some'], answer: 'a', family: 'art',
            en: 'a comes before a consonant sound (chair).', pl: 'a przed spółgłoską (chair).' },
        { parts: ['There is ', { gap: true }, ' orange box on the mat.'], options: ['a', 'an', 'any'], answer: 'an', family: 'art',
            en: 'an comes before a vowel sound (orange).', pl: 'an przed samogłoską (orange).' },
        { parts: ['There are ', { gap: true }, ' pictures upstairs.'], options: ['some', 'any', 'a'], answer: 'some', family: 'are',
            en: 'some is for positive sentences.', pl: 'some w zdaniach twierdzących.' },
        { parts: ['Are there ', { gap: true }, ' chairs in the garden?'], options: ['some', 'any', 'a'], answer: 'any', family: 'are',
            en: 'any is for questions and negatives.', pl: 'any w pytaniach i przeczeniach.' },
        { parts: ['I ', { gap: true }, ' got a pink mobile.'], options: ['have', 'has', 'are'], answer: 'have', family: 'have',
            en: 'I / you / we / they → have got.', pl: 'I / you / we / they → have got.' },
        { parts: ['She ', { gap: true }, ' got a key.'], options: ['have', 'has', 'is'], answer: 'has', family: 'have',
            en: 'He / she → has got.', pl: 'He / she → has got.' },
        { parts: ['I ', { gap: true }, ' swim.'], options: ['can', 'must', 'are'], answer: 'can', family: 'can',
            en: 'can = you are able to.', pl: 'can = potrafię / umiem.' },
        { parts: ['He ', { gap: true }, ' ride a bike.'], options: ['can', "can't", "don't"], answer: "can't", family: 'can',
            en: "can't = not able to.", pl: "can't = nie potrafi." },
        { parts: ['I ', { gap: true }, ' pizza.'], options: ['like', "don't", 'can'], answer: 'like', family: 'like',
            en: 'like = enjoy.', pl: 'like = lubię.' },
        { parts: ['I don’t ', { gap: true }, ' football.'], options: ['like', 'can', 'must'], answer: 'like', family: 'like',
            en: "don't + like = I do not enjoy it.", pl: "don't like = nie lubię." },
        { parts: ['You ', { gap: true }, ' listen at school. (10–12)'], options: ['must', 'can', 'like'], answer: 'must', family: 'must',
            en: 'must = it is necessary.', pl: 'must = musisz.' },
        { parts: ['We ', { gap: true }, ' tidy our bedroom. (10–12)'], options: ['have to', 'can', 'like'], answer: 'have to', family: 'must',
            en: 'have to is one idea: it is necessary.', pl: 'have to to jeden kafel: musimy.' },
        { parts: ["They don't ", { gap: true }, ' do homework today. (10–12)'], options: ['have to', 'must', 'can'], answer: 'have to', family: 'must',
            en: "don't + have to = it is not necessary.", pl: "don't + have to = nie musimy." }
    ];

    const TEXT_MCQ = [
        { q: 'Choose the correct sentence.', family: 'is',
            options: ['There is a lamp above the desk.', 'There are a lamp above the desk.', 'There is lamps above the desk.'], answer: 0,
            en: 'One lamp → There is + a.', pl: 'Jedna lampa → There is + a.' },
        { q: 'Choose the correct article.', family: 'art',
            options: ['There is an clock on the wall.', 'There is a clock on the wall.', 'There is clock on the wall.'], answer: 1,
            en: 'clock = consonant sound → a.', pl: 'clock = spółgłoska → a.' },
        { q: 'Choose the correct sentence.', family: 'have',
            options: ['She have got a key.', 'She has got a key.', 'She is got a key.'], answer: 1,
            en: 'She → has got.', pl: 'She → has got.' },
        { q: 'Choose the correct sentence.', family: 'can',
            options: ['I can swim.', 'I can swimming.', 'I swimming can.'], answer: 0,
            en: 'can + action word (swim, run, draw).', pl: 'can + czasownik (swim, run, draw).' },
        { q: 'Choose the negative.', family: 'like',
            options: ['I like pizza.', "I don't like pizza.", 'I like don\'t pizza.'], answer: 1,
            en: "don't is its own tile, then like.", pl: "don't to osobny kafel, potem like." },
        { q: 'Choose the correct sentence. (10–12)', family: 'must',
            options: ['I must to tidy my room.', 'I must tidy my room.', 'I must tidying my room.'], answer: 1,
            en: 'must + action (no to).', pl: 'must + czasownik (bez to).' },
        { q: 'How many tiles is “don’t have to”?', family: 'must',
            options: ['One tile: don’t have to', 'Two tiles: don’t + have to', 'Three tiles: do + not + have to'], answer: 1,
            en: 'have to stays one tile. don’t is a second tile.', pl: 'have to to jeden kafel. don’t to drugi.' },
        { q: 'Choose the correct sentence.', family: 'are',
            options: ['There are some books on the shelf.', 'There are any books on the shelf.', 'There is some book on the shelf.'], answer: 0,
            en: 'Positive plural → some.', pl: 'Twierdzenie w lm. → some.' }
    ];

    const TEXT_REORDER = [
        { words: ['There is', 'a', 'lamp', 'above', 'the', 'desk'], family: 'is' },
        { words: ['There are', 'two', 'cushions', 'next to', 'the', 'sofa'], family: 'are' },
        { words: ['I', 'have got', 'a', 'mobile'], family: 'have' },
        { words: ['She', 'has got', 'an', 'apple'], family: 'have' },
        { words: ['Is there', 'a', 'message', 'in', 'the', 'bin'], family: 'is', extra: '?' },
        { words: ['I', 'can', 'swim'], family: 'can' },
        { words: ['He', "can't", 'ride', 'a', 'bike'], family: 'can' },
        { words: ['I', 'like', 'pizza'], family: 'like' },
        { words: ['I', "don't", 'like', 'football'], family: 'like' },
        { words: ['You', 'must', 'listen'], family: 'must' },
        { words: ['We', 'have to', 'tidy'], family: 'must' },
        { words: ['They', "don't", 'have to', 'run'], family: 'must' },
        { words: ['There is', 'an', 'orange', 'on', 'the', 'table'], family: 'art' },
        { words: ['There aren\'t', 'any', 'chairs', 'outside'], family: 'are' }
    ];

    const CB_CSS = `
#screen-pe-colour.engine-container { max-width: 1180px; }
.cb-legend { display: flex; flex-wrap: wrap; gap: 0.45rem; margin: 0 0 1rem; padding: 0.7rem 0.8rem; background: var(--light-grey); border-radius: 12px; }
.cb-legend span {
    display: inline-flex; align-items: center; gap: 0.35rem;
    font-family: var(--font-primary); font-weight: 700; font-size: 0.8rem;
    padding: 0.3rem 0.65rem; border-radius: 999px; color: #fff;
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
.cb-goals { display: grid; grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr)); gap: 0.55rem; margin-bottom: 1rem; }
.cb-goal {
    border: 3px solid; border-radius: 14px; padding: 0.8rem 0.55rem; cursor: pointer; text-align: center;
    font-family: var(--font-primary); font-weight: 700; background: #fff; font-size: 0.92rem;
}
.cb-goal small { display: block; font-family: var(--font-secondary); font-weight: 400; margin-top: 0.25rem; font-size: 0.8rem; }
.cb-chain {
    min-height: 5.2rem; border: 3px dashed #cbd5e1; border-radius: 14px; padding: 0.5rem;
    display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; background: #f8fafc; margin-bottom: 0.85rem;
}
.cb-chain.empty::after { content: attr(data-empty); color: var(--text-muted); font-size: 0.9rem; padding: 0.4rem; }
.cb-sheet { margin-bottom: 0.85rem; }
.cb-sheet h3 { font-family: var(--font-primary); font-size: 0.95rem; color: var(--royal-blue); margin: 0 0 0.45rem; }
.cb-cards { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.cb-card {
    display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.12rem;
    min-width: 5.6rem; max-width: 8.4rem; padding: 0.45rem 0.5rem; border-radius: 12px; border: 3px solid; cursor: pointer;
    font-family: var(--font-primary); font-weight: 700; font-size: 0.92rem; user-select: none; background: #fff;
    color: var(--text-dark); line-height: 1.15;
}
.cb-card .ico { font-size: 1.35rem; line-height: 1; min-height: 1.4rem; }
.cb-card .gloss { font-family: var(--font-secondary); font-weight: 400; font-size: 0.68rem; color: var(--text-muted); text-align: center; }
.cb-card.in-chain { cursor: pointer; }
.cb-picture {
    display: flex; align-items: center; justify-content: center; gap: 0.55rem; flex-wrap: wrap;
    background: linear-gradient(180deg, #e0f2fe, #fff); border: 2px solid #bae6fd; border-radius: 16px;
    padding: 0.85rem; margin-bottom: 0.85rem; min-height: 4.8rem; font-size: 2.1rem;
}
.cb-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.5rem 0 0.75rem; }
.cb-sentence { font-family: var(--font-primary); font-size: 1.2rem; font-weight: 700; text-align: center; padding: 0.75rem; min-height: 2.2rem; }
.cb-sentence .tok { display: inline-block; padding: 0.15rem 0.45rem; border-radius: 8px; margin: 0 0.1rem; color: #fff; }
.cb-fb { font-family: var(--font-primary); font-weight: 700; text-align: center; min-height: 1.6rem; margin-top: 0.5rem; }
.cb-fb.ok { color: var(--success-green); }
.cb-fb.bad { color: var(--pillarbox-red); }
.cb-text-kinds { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.85rem; }
.cb-opt { font-family: var(--font-primary); font-weight: 700; padding: 0.55rem 0.9rem; border-radius: 10px; border: 2px solid var(--border-light); background: #fff; cursor: pointer; }
.cb-opt.on { border-width: 3px; }
.cb-gap-line { font-size: 1.2rem; font-family: var(--font-primary); font-weight: 700; text-align: center; margin: 0.75rem 0 1rem; line-height: 1.8; }
.cb-blank { display: inline-block; min-width: 4.5rem; border-bottom: 3px solid var(--royal-blue); text-align: center; color: var(--royal-blue); }
.cb-word {
    display: inline-flex; margin: 0.2rem; padding: 0.4rem 0.65rem; border-radius: 8px; border: 2px solid var(--royal-blue);
    background: #fff; cursor: pointer; font-family: var(--font-primary); font-weight: 700;
}
.cb-word.used { opacity: 0.35; }
.cb-build-row { min-height: 3.2rem; border: 2px dashed var(--border-light); border-radius: 10px; padding: 0.4rem; margin-bottom: 0.7rem; }
.cb-hintbox { background: #fffbeb; border-left: 4px solid #ca8a04; border-radius: 8px; padding: 0.75rem 1rem; margin-top: 0.6rem; }
.cb-icon-bank { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.75rem; }
.cb-guess-icon {
    width: 4.4rem; height: 4.4rem; border: 3px solid var(--border-light); border-radius: 12px; background: #fff;
    cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.1rem;
    font-size: 1.55rem;
}
.cb-guess-icon small { font-size: 0.62rem; font-family: var(--font-primary); font-weight: 700; color: var(--text-muted); }
.cb-guess-icon.on { border-color: var(--royal-blue); }
`;

    let S = null;

    function byId(id) { return TILES.find((t) => t.id === id); }

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

    function articleWanted(word) {
        const w = String(word || '').replace(/^(an|a)\s+/i, '');
        return /^[aeiou]/i.test(w) ? 'an' : 'a';
    }

    function visibleTiles() {
        return TILES.filter((t) => {
            if (t.ages && t.ages.indexOf(S.ageBand) === -1) return false;
            if (S.goal && t.goals && t.goals.indexOf(S.goal) === -1) return false;
            return true;
        });
    }

    function chainTiles(ids) {
        return (ids || []).map(byId).filter(Boolean);
    }

    function joinSpeak(tiles, question) {
        let out = tiles.map((t) => t.speak).join(' ').replace(/\s+/g, ' ').trim();
        if (!out) return '';
        out = out.charAt(0).toUpperCase() + out.slice(1);
        if (question || /^(Is |Are |Have |Has |Can |Must )/i.test(out)) {
            if (!/[?]$/.test(out)) out += '?';
        } else if (!/[.]$/.test(out)) out += '.';
        return out;
    }

    function validateChain(tiles) {
        if (!tiles.length) {
            return { ok: false, en: 'Add tiles to make a sentence.', pl: 'Dodaj kafelki, aby złożyć zdanie.' };
        }
        for (let i = 0; i < tiles.length; i++) {
            const t = tiles[i];
            if (t.id === 'a' || t.id === 'an') {
                const next = tiles[i + 1];
                if (!next || (next.kind !== 'noun' && next.kind !== 'verb')) {
                    return { ok: false, en: 'Put a thing after a / an.', pl: 'Po a / an wstaw rzecz.' };
                }
                const want = next.vowel || articleWanted(next.speak) === 'an' ? 'an' : 'a';
                if (next.vowel) {
                    if (t.id !== 'an') return { ok: false, en: 'Use an before a vowel sound (apple, orange, ice cream).', pl: 'Użyj an przed samogłoską (apple, orange).' };
                } else if (t.id !== want) {
                    return { ok: false, en: 'Use a before a consonant sound, an before a vowel sound.', pl: 'a przed spółgłoską, an przed samogłoską.' };
                }
                if (next.number === 'pl') {
                    return { ok: false, en: 'a / an is for one thing, not chairs / pictures.', pl: 'a / an jest dla jednej rzeczy, nie dla chairs / pictures.' };
                }
            }
        }

        const ids = tiles.map((t) => t.id);
        const first = tiles[0];
        const has = (id) => ids.indexOf(id) !== -1;

        if (first.kind === 'struct') {
            const nouns = tiles.filter((t) => t.kind === 'noun');
            if (!nouns.length) return { ok: false, en: 'Add the thing.', pl: 'Dodaj przedmiot.' };
            if (first.family === 'is') {
                const n = nouns[0];
                if (n.number === 'pl') return { ok: false, en: 'There is is for one thing. Try There are + chairs / pictures.', pl: 'There is = jedna rzecz. There are = chairs / pictures.' };
                if (!has('a') && !has('an') && !has('the') && !has('one')) {
                    return { ok: false, en: 'Add a or an (or the) before the thing.', pl: 'Dodaj a lub an (albo the) przed rzeczą.' };
                }
            }
            if (first.family === 'are') {
                const n = nouns[0];
                if (n.number !== 'pl' && n.number !== 'unc' && !has('two') && !has('three')) {
                    return { ok: false, en: 'There are needs a plural (chairs, pictures) or two / three.', pl: 'There are potrzebuje liczby mnogiej (chairs) albo two / three.' };
                }
                if ((first.id === 'are-there' || first.id === 'there-arent') && !has('any') && S.ageBand === 'older') {
                    return { ok: false, en: 'Questions and negatives often need any.', pl: 'Pytania i przeczenia często mają any.' };
                }
            }
            const prep = tiles.find((t) => t.kind === 'prep');
            if (prep && !prep.adverb) {
                const prepI = tiles.indexOf(prep);
                const after = tiles.slice(prepI + 1).find((t) => t.kind === 'noun');
                if (!after && prep.id !== 'between') {
                    return { ok: false, en: 'After on / in / under… add the place (the desk).', pl: 'Po on / in / under… dodaj miejsce (the desk).' };
                }
                if (prep.id === 'between') {
                    if (!has('and')) return { ok: false, en: 'between needs two places with and.', pl: 'between potrzebuje dwóch miejsc i and.' };
                }
            }
            return { ok: true, sentence: joinSpeak(tiles, first.id === 'is-there' || first.id === 'are-there') };
        }

        if (first.kind === 'subj') {
            const sg = first.id === 'he' || first.id === 'she';
            if (has('have-got') && sg) return { ok: false, en: 'he / she → has got.', pl: 'he / she → has got.' };
            if (has('has-got') && !sg) return { ok: false, en: 'I / you / we / they → have got.', pl: 'I / you / we / they → have got.' };
            if (has('havent-got') && sg) return { ok: false, en: 'he / she → hasn’t got.', pl: 'he / she → hasn’t got.' };
            if (has('hasnt-got') && !sg) return { ok: false, en: 'I / you / we / they → haven’t got.', pl: 'I / you / we / they → haven’t got.' };

            if (has('have-got') || has('has-got') || has('havent-got') || has('hasnt-got')) {
                const n = tiles.find((t) => t.kind === 'noun');
                if (!n) return { ok: false, en: 'What have they got? Add a thing.', pl: 'Co ktoś ma? Dodaj rzecz.' };
                if (n.number !== 'pl' && n.number !== 'unc' && !has('a') && !has('an') && !has('the')) {
                    return { ok: false, en: 'Add a or an before one thing.', pl: 'Dodaj a lub an przed jedną rzeczą.' };
                }
                return { ok: true, sentence: joinSpeak(tiles, false) };
            }

            if (has('can') || has('cant') || has('must') || has('have-to') || (has('dont') && has('have-to'))) {
                if (has('must') && has('have-to')) {
                    return { ok: false, en: 'Use must or have to, not both.', pl: 'Użyj must albo have to, nie obu.' };
                }
                if (has('dont') && has('must')) {
                    return { ok: false, en: 'For “not necessary” use don’t + have to (two tiles).', pl: 'Na „nie muszę” użyj don’t + have to (dwa kafelki).' };
                }
                const v = tiles.find((t) => t.kind === 'verb');
                if (!v) return { ok: false, en: 'Add an action (swim, tidy, listen…).', pl: 'Dodaj czynność (swim, tidy, listen…).' };
                return { ok: true, sentence: joinSpeak(tiles, false) };
            }

            if (has('like') || (has('dont') && tiles.some((t) => t.id === 'like'))) {
                if (has('dont') && ids.indexOf('dont') > ids.indexOf('like') && has('like')) {
                    return { ok: false, en: 'Order: I + don’t + like + pizza.', pl: 'Kolejność: I + don’t + like + pizza.' };
                }
                const n = tiles.find((t) => t.kind === 'noun' || t.kind === 'verb');
                if (!n) return { ok: false, en: 'What do they like? Add a thing or an action.', pl: 'Co lubią? Dodaj rzecz albo czynność.' };
                return { ok: true, sentence: joinSpeak(tiles, false) };
            }

            return { ok: false, en: 'Add have got, can, like, must or have to after I / he / she…', pl: 'Po I / he / she dodaj have got, can, like, must albo have to.' };
        }

        return { ok: false, en: 'Start with There is / There are, or I / he / she…', pl: 'Zacznij od There is / There are albo I / he / she…' };
    }

    function promptMatches(tiles, prompt) {
        if (!prompt || !prompt.ids) return true;
        const got = tiles.map((t) => t.id).join(' ');
        const want = prompt.ids.join(' ');
        return got === want;
    }

    function makeBuildPrompt(goal) {
        const g = goal || 'is';
        if (g === 'is') {
            const n = pick(visibleTiles().filter((t) => t.kind === 'noun' && t.number === 'sg'));
            const art = n && n.vowel ? 'an' : 'a';
            const prep = pick(visibleTiles().filter((t) => t.kind === 'prep' && !t.adverb));
            const place = pick(visibleTiles().filter((t) => t.kind === 'noun' && t.place && t.number === 'sg' && t.id !== (n && n.id)));
            if (!n || !prep || !place) return { ids: ['there-is', 'a', 'lamp'], picture: ['💡'] };
            return { ids: ['there-is', art, n.id, prep.id, 'the', place.id], picture: [n.icon, prep.icon || prep.text, place.icon] };
        }
        if (g === 'are') {
            const n = pick(visibleTiles().filter((t) => t.kind === 'noun' && t.number === 'pl'));
            const prep = pick(visibleTiles().filter((t) => t.kind === 'prep'));
            if (!n) return { ids: ['there-are', 'two', 'chairs'], picture: ['🪑🪑'] };
            if (prep && prep.adverb) return { ids: ['there-are', n.id, prep.id], picture: [n.icon, prep.icon] };
            const place = pick(visibleTiles().filter((t) => t.kind === 'noun' && t.place && t.number === 'sg'));
            return { ids: ['there-are', n.id, (prep && prep.id) || 'on', 'the', (place && place.id) || 'sofa'], picture: [n.icon, prep && prep.icon, place && place.icon] };
        }
        if (g === 'have') {
            const sub = pick(['i', 'she']);
            const got = sub === 'she' ? 'has-got' : 'have-got';
            const n = pick(visibleTiles().filter((t) => t.kind === 'noun' && t.number === 'sg' && t.goals && t.goals.indexOf('have') !== -1));
            const art = n && n.vowel ? 'an' : 'a';
            return { ids: [sub, got, art, n ? n.id : 'key'], picture: [sub === 'she' ? '👧' : '👤', '🔑', n && n.icon] };
        }
        if (g === 'can') {
            const sub = pick(['i', 'he']);
            const modal = pick(['can', 'cant']);
            const v = pick(visibleTiles().filter((t) => t.kind === 'verb' && t.goals.indexOf('can') !== -1));
            return { ids: [sub, modal, v ? v.id : 'swim'], picture: [sub === 'he' ? '👦' : '👤', modal === 'can' ? '💪' : '🚫', v && v.icon] };
        }
        if (g === 'like') {
            const n = pick(visibleTiles().filter((t) => t.kind === 'noun' && t.goals && t.goals.indexOf('like') !== -1));
            const neg = Math.random() < 0.4;
            const ids = neg ? ['i', 'dont', 'like', n ? n.id : 'pizza'] : ['i', 'like', n ? n.id : 'pizza'];
            return { ids: ids, picture: ['👤', neg ? '🚫' : '❤️', n && n.icon] };
        }
        if (g === 'must') {
            const v = pick(visibleTiles().filter((t) => t.kind === 'verb' && t.goals.indexOf('must') !== -1));
            return { ids: ['you', 'must', v ? v.id : 'listen'], picture: ['🙂', '❗', v && v.icon] };
        }
        if (g === 'haveto') {
            const v = pick(visibleTiles().filter((t) => t.kind === 'verb' && t.goals.indexOf('haveto') !== -1));
            const neg = Math.random() < 0.4;
            const ids = neg ? ['we', 'dont', 'have-to', v ? v.id : 'run'] : ['we', 'have-to', v ? v.id : 'tidy'];
            return { ids: ids, picture: ['👥', neg ? '🚫' : '📋', v && v.icon] };
        }
        return { ids: ['there-is', 'a', 'lamp'], picture: ['💡'] };
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

    function colorStyle(family) {
        const c = COL[family] || COL.noun;
        return 'border-color:' + c.bg + ';background:' + c.light + ';color:' + c.ink;
    }

    function tokHtml(family, text) {
        const c = COL[family] || COL.noun;
        return '<span class="tok" style="background:' + c.bg + '">' + esc(text) + '</span>';
    }

    function cardHtml(t, extraClass, action) {
        const ico = t.icon
            ? '<span class="ico" aria-hidden="true">' + t.icon + '</span>'
            : '<span class="ico" aria-hidden="true"><i class="fa-solid ' + t.fa + '"></i></span>';
        return '<button type="button" class="cb-card' + (extraClass || '') + '" data-cb="' + action + '" data-id="' + t.id + '" style="' + colorStyle(t.family) + '">' +
            ico + esc(t.text) + (t.gloss ? '<span class="gloss">' + esc(t.gloss) + '</span>' : '') + '</button>';
    }

    function ensureCss() {
        if (document.getElementById(CSS_ID)) return;
        const el = document.createElement('style');
        el.id = CSS_ID;
        el.textContent = CB_CSS;
        document.head.appendChild(el);
    }

    function rootEl() { return document.getElementById('colour-blocks-root'); }

    function coach() {
        const pl = S.polish;
        if (S.tab === 'build') {
            if (!S.goal) {
                return pl ? 'Co chcesz powiedzieć? Wybierz cel, potem układaj kafelki od lewej.' : 'What do you want to say? Pick a goal, then line the tiles up from the left.';
            }
            if (S.buildPrompt && S.ageBand === 'young') {
                return pl ? 'Spójrz na obrazek. Każde słowo to osobny kafel — a i an też. Klikaj w kolejności.' : 'Look at the picture. Each word is its own tile — a and an too. Tap them in order.';
            }
            return pl ? 'Klikaj kafelki, żeby złożyć zdanie. Kliknij kafel w pasku, aby go zdjąć.' : 'Tap tiles to build the sentence. Tap a tile in the strip to take it out.';
        }
        if (S.tab === 'guess') {
            if (S.guessPhase === 'icons') {
                return pl ? 'Ułóż ikony w swojej kolejności. Potem napiszesz zdanie o tym, co ułożyłaś / ułożyłeś.' : 'Line up the icons in your own order. Next you will make a sentence about them.';
            }
            return pl ? 'Teraz złóż zdanie kafelkami. Nauczyciel albo AI sprawdzi i podpowie, co poprawić.' : 'Now make the sentence with tiles. A teacher or AI will mark it and give a hint if you need one.';
        }
        if (S.textKind === 'reorder') {
            return pl ? 'Ułóż wyrazy. Możesz odsłuchać zdanie, jeśli potrzebujesz pomocy.' : 'Put the words in order. You can hear the sentence if you need help.';
        }
        const kinds = { gap: 'Fill the gap.', mcq: 'Choose the correct sentence.', reorder: 'Tap the words in order.' };
        const kindsPl = { gap: 'Uzupełnij lukę.', mcq: 'Wybierz poprawne zdanie.', reorder: 'Klikaj wyrazy w kolejności.' };
        return pl ? kindsPl[S.textKind] : kinds[S.textKind];
    }

    function render() {
        const root = rootEl();
        if (!root) return;
        root.innerHTML = legendHtml() + tabsHtml() + coachHtml() +
            (S.tab === 'build' ? buildHtml() : '') +
            (S.tab === 'guess' ? guessHtml() : '') +
            (S.tab === 'text' ? textHtml() : '');
        bind(root);
    }

    function legendHtml() {
        const keys = S.ageBand === 'young'
            ? ['is', 'are', 'have', 'can', 'like', 'art', 'prep']
            : ['is', 'are', 'have', 'can', 'like', 'must', 'art', 'prep'];
        return '<div class="cb-legend" aria-label="Colour key">' + keys.map((k) => {
            const c = COL[k];
            return '<span style="background:' + c.bg + '"><i class="fa-solid ' + c.fa + '"></i> ' + esc(c.label) + '</span>';
        }).join('') + '</div>';
    }

    function tabsHtml() {
        const t = (id, label) => '<button type="button" class="cb-tab' + (S.tab === id ? ' on' : '') + '" data-cb="tab" data-id="' + id + '">' + label + '</button>';
        return '<div class="cb-tabs">' + t('build', 'Build a sentence') + t('guess', 'Icon guess') + t('text', 'Text tasks') + '</div>';
    }

    function coachHtml() {
        return '<div class="cb-coach"><p>' + esc(coach()) + '</p>' +
            '<button type="button" class="cb-flag' + (S.polish ? ' on' : '') + '" data-cb="pl" title="Polish">🇵🇱</button></div>';
    }

    function goalsHtml() {
        const items = [
            { id: 'is', title: 'I see one thing', sub: 'There is', col: 'is' },
            { id: 'are', title: 'I see many things', sub: 'There are', col: 'are' },
            { id: 'have', title: 'Someone has something', sub: 'have got', col: 'have' },
            { id: 'can', title: 'I can / I can’t', sub: 'ability', col: 'can' },
            { id: 'like', title: 'I like / I don’t like', sub: "don't + like", col: 'like' }
        ];
        if (S.ageBand === 'older') {
            items.push({ id: 'must', title: 'I must', sub: 'necessary', col: 'must' });
            items.push({ id: 'haveto', title: 'have to / don’t have to', sub: "don't + have to", col: 'must' });
        }
        return '<div class="cb-goals">' + items.map((g) => {
            const c = COL[g.col];
            return '<button type="button" class="cb-goal" data-cb="goal" data-id="' + g.id + '" style="border-color:' + c.bg + ';color:' + c.ink + ';background:' + c.light + '">' +
                esc(g.title) + '<small>' + esc(g.sub) + '</small></button>';
        }).join('') + '</div>';
    }

    function chainHtml(ids, action, emptyMsg) {
        const tiles = chainTiles(ids);
        const cls = tiles.length ? '' : ' empty';
        let html = '<div class="cb-chain' + cls + '" data-empty="' + esc(emptyMsg) + '">';
        tiles.forEach((t, i) => { html += cardHtml(t, ' in-chain', action) .replace('data-id="' + t.id + '"', 'data-id="' + i + '"'); });
        html += '</div>';
        return html;
    }

    function pictureHtml(prompt) {
        if (!prompt || !prompt.picture) return '';
        return '<div class="cb-picture" aria-label="Look first">' + prompt.picture.filter(Boolean).map((p) => '<span>' + p + '</span>').join('<span style="color:#94a3b8">→</span>') + '</div>';
    }

    function sheetsHtml() {
        const groups = [
            { title: 'Who', kinds: ['subj'] },
            { title: 'Sentence starters', kinds: ['struct'] },
            { title: 'a · an · the · some · any', kinds: ['art'] },
            { title: 'Numbers', kinds: ['num'] },
            { title: 'Grammar', kinds: ['verbp', 'modal', 'neg'] },
            { title: 'Place words', kinds: ['prep', 'link'] },
            { title: 'Things', kinds: ['noun'] },
            { title: 'Actions', kinds: ['verb'] }
        ];
        const list = visibleTiles();
        let html = '';
        groups.forEach((g) => {
            const tiles = list.filter((t) => g.kinds.indexOf(t.kind) !== -1);
            if (!tiles.length) return;
            html += '<div class="cb-sheet"><h3>' + esc(g.title) + '</h3><div class="cb-cards">';
            tiles.forEach((t) => { html += cardHtml(t, '', 'add'); });
            html += '</div></div>';
        });
        return html;
    }

    function buildHtml() {
        if (!S.goal) return goalsHtml();
        let html = '';
        if (S.buildPrompt) html += pictureHtml(S.buildPrompt);
        html += chainHtml(S.chain, 'pop', S.polish ? 'Kliknij kafelki poniżej…' : 'Tap tiles below…');
        html += sheetsHtml();
        html += '<div class="cb-actions">' +
            '<button type="button" class="btn btn-blue" data-cb="check-build">Check</button>' +
            '<button type="button" class="btn btn-outline" data-cb="speak-build"><i class="fa-solid fa-volume-high"></i> Say it</button>' +
            '<button type="button" class="btn btn-outline" data-cb="clear-build">Clear</button>' +
            '<button type="button" class="btn btn-outline" data-cb="new-prompt">New picture</button>' +
            '<button type="button" class="btn btn-grey" data-cb="new-goal">Change goal</button>' +
            '</div>';
        if (S.buildSpoken) {
            html += '<div class="cb-sentence">' + chainTiles(S.chain).map((t) => tokHtml(t.family, t.text)).join(' ') + '</div>';
        }
        html += '<div class="cb-fb' + (S.buildOk ? ' ok' : (S.buildFb ? ' bad' : '')) + '">' + esc(S.buildFb || '') + '</div>';
        return html;
    }

    function guessHtml() {
        let html = '';
        if (S.guessPhase === 'icons') {
            html += chainHtml(S.guessIcons, 'guess-pop', S.polish ? 'Ułóż tu swoje ikony.' : 'Line your icons up here.');
            html += '<div class="cb-icon-bank">';
            guessIconTiles().forEach((t) => {
                html += '<button type="button" class="cb-guess-icon" data-cb="guess-add" data-id="' + t.id + '" title="' + esc(t.text) + '">' +
                    (t.icon || '<i class="fa-solid ' + t.fa + '"></i>') + '<small>' + esc(t.text) + '</small></button>';
            });
            html += '</div>';
            html += '<div class="cb-actions"><button type="button" class="btn btn-blue" data-cb="guess-lock">These icons — now make a sentence</button>' +
                '<button type="button" class="btn btn-outline" data-cb="guess-clear-icons">Clear icons</button></div>';
        } else {
            html += '<p style="font-weight:700;font-family:var(--font-primary);color:var(--royal-blue);margin:0 0 0.4rem;">Your icons</p>';
            html += '<div class="cb-picture">' + chainTiles(S.guessIcons).map((t) => '<span title="' + esc(t.text) + '">' + (t.icon || '') + '</span>').join('<span style="color:#94a3b8">→</span>') + '</div>';
            html += chainHtml(S.guessChain, 'guess-chain-pop', S.polish ? 'Złóż zdanie kafelkami.' : 'Build the sentence with tiles.');
            const keepGoal = S.goal;
            S.goal = null;
            html += sheetsHtml();
            S.goal = keepGoal;
            html += '<div class="cb-actions">' +
                '<button type="button" class="btn btn-blue" data-cb="guess-check">Check</button>' +
                '<button type="button" class="btn btn-outline" data-cb="guess-ai"><i class="fa-solid fa-robot"></i> Ask AI</button>' +
                '<button type="button" class="btn btn-outline" data-cb="guess-teacher-ok">Teacher: correct</button>' +
                '<button type="button" class="btn btn-outline" data-cb="guess-teacher-hint">Teacher: hint</button>' +
                '<button type="button" class="btn btn-grey" data-cb="guess-back">Change icons</button>' +
                '</div>';
        }
        html += '<div class="cb-fb' + (S.guessOk ? ' ok' : (S.guessFb ? ' bad' : '')) + '">' + esc(S.guessFb || '') + '</div>';
        if (S.guessHint) html += '<div class="cb-hintbox">' + esc(S.guessHint) + '</div>';
        if (S.guessModel) html += '<div class="cb-sentence">' + esc(S.guessModel) + '</div>';
        return html;
    }

    function guessIconTiles() {
        const pool = TILES.filter((t) => t.guess && t.ages.indexOf(S.ageBand) !== -1 && t.icon);
        return pool;
    }

    function textHtml() {
        const kinds = [['gap', 'Gap fill'], ['mcq', 'Multiple choice'], ['reorder', 'Rearrange']];
        let html = '<div class="cb-text-kinds">';
        kinds.forEach(([id, lab]) => {
            html += '<button type="button" class="cb-tab' + (S.textKind === id ? ' on' : '') + '" data-cb="text-kind" data-id="' + id + '">' + lab + '</button>';
        });
        html += '<button type="button" class="btn btn-outline" data-cb="text-next">New task</button></div>';
        if (S.textKind === 'gap') html += gapHtml();
        if (S.textKind === 'mcq') html += mcqHtml();
        if (S.textKind === 'reorder') html += reorderHtml();
        html += '<div class="cb-actions"><button type="button" class="btn btn-blue" data-cb="text-check">Check</button></div>';
        html += '<div class="cb-fb' + (S.textOk ? ' ok' : (S.textFb ? ' bad' : '')) + '">' + esc(S.textFb || '') + '</div>';
        return html;
    }

    function gapHtml() {
        const g = S.gap;
        if (!g) return '';
        const line = g.parts.map((p) => typeof p === 'string' ? esc(p) : '<span class="cb-blank">' + esc(S.gapPick || '___') + '</span>').join('');
        let html = '<div class="cb-gap-line">' + line + '</div><div class="cb-cards">';
        g.options.forEach((op) => {
            html += '<button type="button" class="cb-opt' + (S.gapPick === op ? ' on' : '') + '" data-cb="gap-pick" data-id="' + esc(op) + '" style="' + colorStyle(g.family) + '">' + esc(op) + '</button>';
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
        let html = '<div class="cb-actions" style="margin-top:0;"><button type="button" class="btn btn-outline" data-cb="reorder-listen"><i class="fa-solid fa-volume-high"></i> Read sentence</button></div>';
        html += '<div class="cb-build-row">';
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

    function bind(root) {
        root.onclick = (e) => {
            const t = e.target.closest('[data-cb]');
            if (!t) return;
            const a = t.dataset.cb;
            const id = t.dataset.id;
            if (a === 'tab') { S.tab = id; S.buildFb = ''; S.guessFb = ''; S.textFb = ''; render(); return; }
            if (a === 'pl') { S.polish = !S.polish; render(); return; }
            if (a === 'goal') { S.goal = id; S.chain = []; S.buildPrompt = S.ageBand === 'young' ? makeBuildPrompt(id) : null; S.buildFb = ''; S.buildOk = false; S.buildSpoken = ''; render(); return; }
            if (a === 'add') {
                if (S.tab === 'guess' && S.guessPhase === 'sentence') {
                    S.guessChain.push(id);
                    S.guessFb = ''; S.guessOk = false; S.guessHint = ''; S.guessModel = '';
                    render(); return;
                }
                S.chain.push(id); S.buildFb = ''; S.buildOk = false; S.buildSpoken = ''; S.buildAwarded = false; render(); return;
            }
            if (a === 'pop') { S.chain.splice(Number(id), 1); S.buildFb = ''; S.buildOk = false; S.buildSpoken = ''; render(); return; }
            if (a === 'check-build') { checkBuild(); return; }
            if (a === 'speak-build') { speak(S.buildSpoken || joinSpeak(chainTiles(S.chain))); return; }
            if (a === 'clear-build') { S.chain = []; S.buildFb = ''; S.buildOk = false; S.buildSpoken = ''; S.buildAwarded = false; render(); return; }
            if (a === 'new-prompt') { S.buildPrompt = makeBuildPrompt(S.goal); S.chain = []; S.buildFb = ''; S.buildOk = false; S.buildSpoken = ''; S.buildAwarded = false; render(); return; }
            if (a === 'new-goal') { S.goal = null; S.chain = []; S.buildPrompt = null; render(); return; }
            if (a === 'guess-add') { S.guessIcons.push(id); render(); return; }
            if (a === 'guess-pop') { S.guessIcons.splice(Number(id), 1); render(); return; }
            if (a === 'guess-clear-icons') { S.guessIcons = []; render(); return; }
            if (a === 'guess-lock') {
                if (S.guessIcons.length < 2) {
                    S.guessFb = S.polish ? 'Ułóż co najmniej dwie ikony.' : 'Line up at least two icons.';
                    render(); return;
                }
                S.guessPhase = 'sentence'; S.guessChain = []; S.guessFb = ''; S.guessHint = ''; S.guessModel = ''; S.guessOk = false; S.guessAwarded = false;
                render(); return;
            }
            if (a === 'guess-chain-pop') { S.guessChain.splice(Number(id), 1); render(); return; }
            if (a === 'guess-back') { S.guessPhase = 'icons'; S.guessFb = ''; S.guessHint = ''; render(); return; }
            if (a === 'guess-check') { checkGuess(false); return; }
            if (a === 'guess-ai') { checkGuess(true); return; }
            if (a === 'guess-teacher-ok') { teacherMark(true); return; }
            if (a === 'guess-teacher-hint') { teacherMark(false); return; }
            if (a === 'text-kind') { S.textKind = id; loadTextTask(); render(); return; }
            if (a === 'text-next') { loadTextTask(); render(); return; }
            if (a === 'text-check') { checkText(); return; }
            if (a === 'gap-pick') { S.gapPick = id; S.textFb = ''; render(); return; }
            if (a === 'mcq-pick') { S.mcqPick = Number(id); S.textFb = ''; render(); return; }
            if (a === 'reorder-push') { pushReorder(Number(id)); return; }
            if (a === 'reorder-pop') { popReorder(Number(id)); return; }
            if (a === 'reorder-listen') {
                if (!S.reorder) return;
                speak(S.reorder.words.join(' ') + (S.reorder.extra || ''));
            }
        };
    }

    function checkBuild() {
        const tiles = chainTiles(S.chain);
        const v = validateChain(tiles);
        if (!v.ok) {
            S.buildOk = false;
            S.buildFb = S.polish ? v.pl : v.en;
            S.buildSpoken = '';
            render();
            return;
        }
        if (S.buildPrompt && !promptMatches(tiles, S.buildPrompt)) {
            S.buildOk = false;
            S.buildFb = S.polish ? 'Prawie! Ułóż kafelki dokładnie o obrazku, w tej samej kolejności.' : 'Almost! Match the picture, tile by tile.';
            S.buildSpoken = '';
            render();
            return;
        }
        S.buildOk = true;
        S.buildSpoken = v.sentence;
        S.buildFb = S.polish ? 'Tak! Powiedz zdanie na głos.' : 'Yes! Say the sentence aloud.';
        if (!S.buildAwarded) { S.buildAwarded = true; award(10, { tab: 'build', sentence: v.sentence }); }
        speak(v.sentence);
        render();
    }

    function localGuessCheck() {
        const icons = chainTiles(S.guessIcons);
        const sent = chainTiles(S.guessChain);
        const grammar = validateChain(sent);
        if (!grammar.ok) return grammar;
        const needed = icons.map((t) => t.id);
        const got = sent.map((t) => t.id);
        const missing = needed.filter((id) => {
            const tile = byId(id);
            if (!tile) return false;
            if (tile.kind === 'subj') return !sent.some((x) => x.kind === 'subj');
            if (tile.kind === 'noun' || tile.kind === 'verb' || tile.kind === 'prep' || tile.kind === 'modal' || tile.kind === 'neg' || tile.kind === 'verbp') {
                return got.indexOf(id) === -1;
            }
            return false;
        });
        if (missing.length) {
            const names = missing.map((id) => byId(id).text).join(', ');
            return {
                ok: false,
                en: 'Your sentence does not use every icon yet. Missing: ' + names + '. Change a tile and check again.',
                pl: 'Zdanie nie używa jeszcze wszystkich ikon. Brakuje: ' + names + '. Zmień kafel i sprawdź ponownie.',
                sentence: grammar.sentence
            };
        }
        return { ok: true, sentence: grammar.sentence };
    }

    function teacherHintFromIcons() {
        const icons = chainTiles(S.guessIcons);
        const words = icons.map((t) => t.text).join(' → ');
        return {
            en: 'Start with who (I / he / she), then the grammar tile, then the thing or action. Your icons: ' + words + '.',
            pl: 'Zacznij od kto (I / he / she), potem kafel gramatyki, potem rzecz lub czynność. Twoje ikony: ' + words + '.'
        };
    }

    function teacherMark(ok) {
        if (ok) {
            const v = validateChain(chainTiles(S.guessChain));
            S.guessOk = true;
            S.guessFb = S.polish ? 'Nauczyciel: poprawnie.' : 'Teacher: correct.';
            S.guessHint = '';
            S.guessModel = v.ok ? v.sentence : joinSpeak(chainTiles(S.guessChain));
            if (!S.guessAwarded) { S.guessAwarded = true; award(15, { tab: 'guess', by: 'teacher' }); }
        } else {
            const h = teacherHintFromIcons();
            S.guessOk = false;
            S.guessFb = S.polish ? 'Nauczyciel: jeszcze nie. Popraw zdanie.' : 'Teacher: not yet. Change the sentence.';
            S.guessHint = S.polish ? h.pl : h.en;
        }
        render();
    }

    async function checkGuess(useAi) {
        const local = localGuessCheck();
        if (!useAi) {
            S.guessOk = local.ok;
            S.guessFb = S.polish ? local.pl : local.en;
            S.guessHint = local.ok ? '' : (S.polish ? 'Spróbuj zmienić jeden kafel i sprawdź znowu.' : 'Change one tile and check again.');
            S.guessModel = local.ok ? local.sentence : '';
            if (local.ok && !S.guessAwarded) { S.guessAwarded = true; award(15, { tab: 'guess' }); }
            if (local.ok) speak(local.sentence);
            render();
            return;
        }
        S.guessFb = S.polish ? 'AI sprawdza…' : 'AI is checking…';
        S.guessHint = '';
        render();
        const icons = chainTiles(S.guessIcons).map((t) => t.text + (t.icon ? ' ' + t.icon : '')).join(' | ');
        const sentence = joinSpeak(chainTiles(S.guessChain));
        const age = S.ageBand === 'young' ? '8-9' : '10-12';
        const grammar = S.ageBand === 'young'
            ? "there is/are, have got, can/can't, like, don't like, a/an, prepositions"
            : "there is/are, have got, can/can't, like, don't like, must, have to, don't + have to, a/an/some/any";
        const prompt = `You mark a child's English colour-tile sentence. Be kind and specific.
Age: ${age}. Allowed grammar: ${grammar}.
Icon sequence the child invented (in order): ${icons}
Sentence they built: "${sentence}"
Rules: "have to" is one phrase. "don't have to" is two tiles: don't + have to. a and an are separate. don't like is don't + like.
Return JSON: { "valid": boolean, "hintEn": "one short hint if invalid, else empty", "hintPl": "Polish hint", "model": "one correct sentence matching the icons" }`;
        if (typeof global.fetchGenerativeAI !== 'function') {
            S.guessFb = S.polish ? 'AI niedostępne — użyj Check albo znaku nauczyciela.' : 'AI is not available — use Check or a teacher mark.';
            render();
            return;
        }
        const data = await global.fetchGenerativeAI(prompt);
        if (data && data.__error) {
            S.guessOk = false;
            S.guessFb = data.__error;
            render();
            return;
        }
        const valid = !!data.valid;
        S.guessOk = valid;
        S.guessFb = valid
            ? (S.polish ? 'AI: poprawnie.' : 'AI: correct.')
            : (S.polish ? 'AI: jeszcze nie. Popraw zdanie według wskazówki.' : 'AI: not yet. Use the hint and change your tiles.');
        S.guessHint = S.polish ? (data.hintPl || '') : (data.hintEn || '');
        S.guessModel = data.model || '';
        if (valid && !S.guessAwarded) { S.guessAwarded = true; award(15, { tab: 'guess', by: 'ai' }); }
        if (valid && data.model) speak(data.model);
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
        let gaps = TEXT_GAPS;
        let mcq = TEXT_MCQ;
        let reorder = TEXT_REORDER;
        if (S.ageBand === 'young') {
            gaps = gaps.filter((g) => g.family !== 'must');
            mcq = mcq.filter((g) => g.family !== 'must');
            reorder = reorder.filter((g) => g.family !== 'must');
        }
        if (S.textKind === 'gap') S.gap = pick(gaps);
        if (S.textKind === 'mcq') S.mcq = pick(mcq);
        if (S.textKind === 'reorder') {
            const src = pick(reorder);
            S.reorder = { words: src.words, extra: src.extra || '', shuffled: shuffle(src.words), family: src.family };
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

    function checkText() {
        let ok = false;
        let en = '';
        let pl = '';
        if (S.textKind === 'gap') {
            const ans = String(S.gap.answer).replace(/'/g, "'");
            ok = S.gapPick === S.gap.answer || S.gapPick === ans;
            en = ok ? S.gap.en : 'Try again. ' + S.gap.en;
            pl = ok ? S.gap.pl : 'Spróbuj jeszcze raz. ' + S.gap.pl;
        } else if (S.textKind === 'mcq') {
            ok = S.mcqPick === S.mcq.answer;
            en = ok ? S.mcq.en : 'Try again. ' + S.mcq.en;
            pl = ok ? S.mcq.pl : 'Spróbuj jeszcze raz. ' + S.mcq.pl;
        } else if (S.textKind === 'reorder') {
            ok = S.reorderBuilt.join(' ') === S.reorder.words.join(' ');
            en = ok ? 'Perfect order!' : 'Hear the sentence, then try the tiles again.';
            pl = ok ? 'Świetna kolejność!' : 'Odsłuchaj zdanie i ułóż kafelki jeszcze raz.';
        }
        S.textOk = ok;
        S.textFb = S.polish ? pl : en;
        if (ok && !S.textAwarded) { S.textAwarded = true; award(10, { tab: 'text', kind: S.textKind }); }
        render();
    }

    function defaultState(ageBand) {
        return {
            ageBand: ageBand === 'older' ? 'older' : 'young',
            tab: 'build',
            polish: false,
            goal: null,
            chain: [],
            buildPrompt: null,
            buildFb: '',
            buildOk: false,
            buildSpoken: '',
            buildAwarded: false,
            guessPhase: 'icons',
            guessIcons: [],
            guessChain: [],
            guessFb: '',
            guessHint: '',
            guessModel: '',
            guessOk: false,
            guessAwarded: false,
            textKind: 'gap',
            gap: null,
            gapPick: '',
            mcq: null,
            mcqPick: -1,
            reorder: null,
            reorderBuilt: [],
            reorderUsed: {},
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
        render();
    }

    global.initColourBlocks = initColourBlocks;
})(typeof window !== 'undefined' ? window : globalThis);
