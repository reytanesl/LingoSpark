/**
 * Line Up — Primary English scramble. Drag pictured word tiles onto numbered slots.
 */
(function (global) {
    'use strict';

    const CSS_ID = 'pe-line-up-css';
    const SET_NAME = 'Line Up';
    const ICONIFY = 'https://api.iconify.design/';
    const PACK_DEFAULT = 'fluent-emoji';

    const COL = {
        is:   { bg: '#1d4ed8', light: '#dbeafe', ink: '#1e3a8a' },
        are:  { bg: '#15803d', light: '#dcfce7', ink: '#14532d' },
        have: { bg: '#7c3aed', light: '#ede9fe', ink: '#5b21b6' },
        can:  { bg: '#b45309', light: '#ffedd5', ink: '#9a3412' },
        like: { bg: '#be123c', light: '#ffe4e6', ink: '#9f1239' },
        must: { bg: '#b91c1c', light: '#fee2e2', ink: '#7f1d1d' },
        art:  { bg: '#ca8a04', light: '#fef9c3', ink: '#854d0e' },
        prep: { bg: '#c2410c', light: '#ffedd5', ink: '#9a3412' },
        noun: { bg: '#0f766e', light: '#ccfbf1', ink: '#115e59' },
        verb: { bg: '#0369a1', light: '#e0f2fe', ink: '#0c4a6e' },
        subj: { bg: '#475569', light: '#e2e8f0', ink: '#1e293b' },
        neg:  { bg: '#9f1239', light: '#ffe4e6', ink: '#881337' },
        num:  { bg: '#4f46e5', light: '#e0e7ff', ink: '#312e81' }
    };

    const PACK_ICONS = {
        'there-is': 'blue-circle', 'there-are': 'green-circle',
        'is-there': 'red-question-mark', 'are-there': 'white-question-mark',
        'there-isnt': 'prohibited', 'there-arent': 'prohibited',
        i: 'person', you: 'waving-hand', he: 'boy', she: 'girl',
        we: 'busts-in-silhouette', they: 'people-hugging',
        a: 'input-latin-letters', an: 'input-latin-uppercase', the: 'input-latin-letters',
        some: 'plus', any: 'red-question-mark',
        one: 'keycap-1', two: 'keycap-2', three: 'keycap-3',
        'have-got': 'handbag', 'has-got': 'handbag',
        can: 'flexed-biceps', cant: 'prohibited', like: 'red-heart', dont: 'prohibited',
        must: 'red-exclamation-mark', 'have-to': 'clipboard',
        in: 'inbox-tray', on: 'up-arrow', under: 'down-arrow', above: 'cloud',
        'next-to': 'left-right-arrow', between: 'balance-scale',
        behind: 'face-with-peeking-eye', 'in-front-of': 'eyes', near: 'round-pushpin',
        upstairs: 'ladder', downstairs: 'down-arrow', outside: 'sun-behind-cloud',
        chair: 'chair', desk: 'icon-park:workbench', lamp: 'light-bulb', bin: 'wastebasket',
        table: 'icon-park:table', sofa: 'couch-and-lamp', cushion: 'tabler:pillow',
        shelf: 'books', bed: 'bed', window: 'window', key: 'key', laptop: 'laptop',
        mobile: 'mobile-phone', book: 'open-book', bag: 'backpack', apple: 'red-apple',
        orange: 'tangerine', cat: 'cat', dog: 'dog', ball: 'basketball', bike: 'bicycle',
        pizza: 'pizza', football: 'soccer-ball', message: 'envelope', garden: 'house-with-garden',
        swim: 'person-swimming', run: 'person-running', draw: 'crayon', ride: 'person-biking',
        dance: 'woman-dancing', tidy: 'broom', listen: 'ear', wait: 'hourglass-not-done',
        study: 'books', chairs: 'chair', cushions: 'tabler:pillow', books: 'books'
    };

    const FAMILY_BY_ID = {
        'there-is': 'is', 'is-there': 'is', 'there-isnt': 'is',
        'there-are': 'are', 'are-there': 'are', 'there-arent': 'are',
        'have-got': 'have', 'has-got': 'have',
        can: 'can', cant: 'can', like: 'like',
        must: 'must', 'have-to': 'must',
        a: 'art', an: 'art', the: 'art', some: 'art', any: 'art',
        in: 'prep', on: 'prep', under: 'prep', above: 'prep', 'next-to': 'prep',
        between: 'prep', behind: 'prep', 'in-front-of': 'prep', near: 'prep',
        upstairs: 'prep', downstairs: 'prep', outside: 'prep',
        i: 'subj', you: 'subj', he: 'subj', she: 'subj', we: 'subj', they: 'subj',
        dont: 'neg', one: 'num', two: 'num', three: 'num',
        swim: 'verb', run: 'verb', draw: 'verb', ride: 'verb', dance: 'verb',
        tidy: 'verb', listen: 'verb', wait: 'verb', study: 'verb'
    };

    function W(id, text) {
        return { id: id, text: text };
    }

    const BANK = [
        {
            ages: ['young', 'older'], family: 'is', cue: ['lamp', 'on', 'desk'],
            words: [W('there-is', 'There is'), W('a', 'a'), W('lamp', 'lamp'), W('on', 'on'), W('the', 'the'), W('desk', 'desk')],
            pl: 'Na biurku jest lampa.'
        },
        {
            ages: ['young', 'older'], family: 'art', cue: ['apple', 'on', 'table'],
            words: [W('there-is', 'There is'), W('an', 'an'), W('apple', 'apple'), W('on', 'on'), W('the', 'the'), W('table', 'table')],
            pl: 'Na stole jest jabłko.'
        },
        {
            ages: ['young', 'older'], family: 'are', cue: ['two', 'chair', 'next-to', 'sofa'],
            words: [W('there-are', 'There are'), W('two', 'two'), W('chairs', 'chairs'), W('next-to', 'next to'), W('the', 'the'), W('sofa', 'sofa')],
            pl: 'Obok sofy są dwa krzesła.'
        },
        {
            ages: ['young', 'older'], family: 'is', cue: ['cat', 'under', 'bed'],
            words: [W('there-is', 'There is'), W('a', 'a'), W('cat', 'cat'), W('under', 'under'), W('the', 'the'), W('bed', 'bed')],
            pl: 'Pod łóżkiem jest kot.'
        },
        {
            ages: ['young', 'older'], family: 'is', cue: ['book', 'on', 'shelf'],
            words: [W('there-is', 'There is'), W('a', 'a'), W('book', 'book'), W('on', 'on'), W('the', 'the'), W('shelf', 'shelf')],
            pl: 'Na półce jest książka.'
        },
        {
            ages: ['young', 'older'], family: 'have', cue: ['i', 'key'],
            words: [W('i', 'I'), W('have-got', 'have got'), W('a', 'a'), W('key', 'key')],
            pl: 'Mam klucz.'
        },
        {
            ages: ['young', 'older'], family: 'have', cue: ['she', 'orange'],
            words: [W('she', 'She'), W('has-got', 'has got'), W('an', 'an'), W('orange', 'orange')],
            pl: 'Ona ma pomarańczę.'
        },
        {
            ages: ['young', 'older'], family: 'have', cue: ['we', 'laptop'],
            words: [W('we', 'We'), W('have-got', 'have got'), W('a', 'a'), W('laptop', 'laptop')],
            pl: 'Mamy laptopa.'
        },
        {
            ages: ['young', 'older'], family: 'have', cue: ['you', 'mobile'],
            words: [W('you', 'You'), W('have-got', 'have got'), W('a', 'a'), W('mobile', 'mobile')],
            pl: 'Masz telefon.'
        },
        {
            ages: ['young', 'older'], family: 'have', cue: ['they', 'ball'],
            words: [W('they', 'They'), W('have-got', 'have got'), W('a', 'a'), W('ball', 'ball')],
            pl: 'Oni mają piłkę.'
        },
        {
            ages: ['young', 'older'], family: 'can', cue: ['i', 'swim'],
            words: [W('i', 'I'), W('can', 'can'), W('swim', 'swim')],
            pl: 'Potrafię pływać.'
        },
        {
            ages: ['young', 'older'], family: 'can', cue: ['he', 'cant', 'bike'],
            words: [W('he', 'He'), W('cant', "can't"), W('ride', 'ride'), W('a', 'a'), W('bike', 'bike')],
            pl: 'On nie potrafi jeździć na rowerze.'
        },
        {
            ages: ['young', 'older'], family: 'can', cue: ['you', 'draw'],
            words: [W('you', 'You'), W('can', 'can'), W('draw', 'draw')],
            pl: 'Potrafisz rysować.'
        },
        {
            ages: ['young', 'older'], family: 'can', cue: ['they', 'dance'],
            words: [W('they', 'They'), W('can', 'can'), W('dance', 'dance')],
            pl: 'Oni potrafią tańczyć.'
        },
        {
            ages: ['young', 'older'], family: 'like', cue: ['i', 'pizza'],
            words: [W('i', 'I'), W('like', 'like'), W('pizza', 'pizza')],
            pl: 'Lubię pizzę.'
        },
        {
            ages: ['young', 'older'], family: 'like', cue: ['i', 'dont', 'football'],
            words: [W('i', 'I'), W('dont', "don't"), W('like', 'like'), W('football', 'football')],
            pl: 'Nie lubię piłki nożnej.'
        },
        {
            ages: ['young', 'older'], family: 'like', cue: ['we', 'pizza'],
            words: [W('we', 'We'), W('like', 'like'), W('pizza', 'pizza')],
            pl: 'Lubimy pizzę.'
        },
        {
            ages: ['young', 'older'], family: 'like', cue: ['they', 'dont', 'football'],
            words: [W('they', 'They'), W('dont', "don't"), W('like', 'like'), W('football', 'football')],
            pl: 'Oni nie lubią piłki nożnej.'
        },
        {
            ages: ['older'], family: 'must', cue: ['you', 'listen'],
            words: [W('you', 'You'), W('must', 'must'), W('listen', 'listen')],
            pl: 'Musisz słuchać.'
        },
        {
            ages: ['older'], family: 'must', cue: ['we', 'tidy'],
            words: [W('we', 'We'), W('have-to', 'have to'), W('tidy', 'tidy')],
            pl: 'Musimy posprzątać.'
        },
        {
            ages: ['older'], family: 'must', cue: ['they', 'dont', 'run'],
            words: [W('they', 'They'), W('dont', "don't"), W('have-to', 'have to'), W('run', 'run')],
            pl: 'Oni nie muszą biegać.'
        },
        {
            ages: ['older'], family: 'must', cue: ['she', 'wait'],
            words: [W('she', 'She'), W('must', 'must'), W('wait', 'wait')],
            pl: 'Ona musi poczekać.'
        },
        {
            ages: ['older'], family: 'must', cue: ['i', 'study'],
            words: [W('i', 'I'), W('have-to', 'have to'), W('study', 'study')],
            pl: 'Muszę się uczyć.'
        },
        {
            ages: ['older'], family: 'is', cue: ['message', 'in', 'bin'], extra: '?',
            words: [W('is-there', 'Is there'), W('a', 'a'), W('message', 'message'), W('in', 'in'), W('the', 'the'), W('bin', 'bin')],
            pl: 'Czy w koszu jest wiadomość?'
        },
        {
            ages: ['older'], family: 'are', cue: ['chair', 'outside'],
            words: [W('there-arent', "There aren't"), W('any', 'any'), W('chairs', 'chairs'), W('outside', 'outside')],
            pl: 'Na dworze nie ma żadnych krzeseł.'
        },
        {
            ages: ['older'], family: 'are', cue: ['book', 'on', 'shelf'], extra: '?',
            words: [W('are-there', 'Are there'), W('any', 'any'), W('books', 'books'), W('on', 'on'), W('the', 'the'), W('shelf', 'shelf')],
            pl: 'Czy na półce są jakieś książki?'
        }
    ];

    const CSS = `
#screen-pe-line.engine-container { max-width: 1100px; }
.pl-coach {
    background: #fff; border: 2px solid var(--border-light); border-left: 5px solid var(--royal-blue);
    border-radius: 10px; padding: 0.85rem 1rem; margin-bottom: 1rem; display: flex; gap: 0.75rem; align-items: flex-start;
}
.pl-coach p { margin: 0; font-size: 1.02rem; line-height: 1.5; }
.pl-coach-tools { margin-left: auto; display: flex; gap: 0.4rem; flex-shrink: 0; align-items: center; }
.pl-lang { display: inline-flex; flex-shrink: 0; border: 2px solid var(--border-light); border-radius: 8px; overflow: hidden; }
.pl-lang button {
    border: none; background: #fff; padding: 0.28rem 0.6rem; cursor: pointer;
    font-family: var(--font-primary); font-weight: 700; font-size: 0.82rem; color: var(--royal-blue);
}
.pl-lang button.on { background: var(--royal-blue); color: #fff; }
.pl-cue {
    display: flex; align-items: center; justify-content: center; gap: 0.7rem; flex-wrap: wrap;
    background: linear-gradient(180deg, #e0f2fe, #fff); border: 2px solid #bae6fd; border-radius: 16px;
    padding: 0.9rem 1rem; margin-bottom: 1rem; min-height: 5rem;
}
.pl-cue .pl-ico { width: 3rem; height: 3rem; }
.pl-cue-arrow { color: #7dd3fc; font-size: 1.4rem; }
.pl-slots {
    display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center;
    margin-bottom: 1.1rem; min-height: 7.2rem;
}
.pl-slot {
    position: relative;
    min-width: 6.1rem; min-height: 7rem; flex: 0 1 6.4rem;
    border: 3px dashed #cbd5e1; border-radius: 14px;
    background: #f8fafc;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 0.35rem;
}
.pl-slot .pl-n {
    position: absolute; top: 0.28rem; left: 0.42rem;
    font-family: var(--font-primary); font-weight: 800; font-size: 0.72rem; color: #94a3b8;
}
.pl-slot.empty .pl-n { font-size: 1.35rem; left: 50%; top: 50%; transform: translate(-50%, -50%); color: #cbd5e1; }
.pl-slot.filled { border-style: solid; border-color: #94a3b8; background: #fff; }
.pl-slot.over { border-color: var(--royal-blue); background: #eff6ff; }
.pl-slot.ok { border-color: var(--success-green); border-style: solid; background: #f0fdf4; }
.pl-slot.bad { border-color: var(--pillarbox-red); border-style: solid; background: #fef2f2; }
.pl-bank-label {
    font-family: var(--font-primary); font-weight: 700; font-size: 0.85rem; color: var(--text-muted);
    margin: 0 0 0.45rem;
}
.pl-bank {
    display: flex; flex-wrap: wrap; gap: 0.45rem; justify-content: center;
    min-height: 7.2rem; border: 3px dashed #e2e8f0; border-radius: 14px;
    padding: 0.7rem; background: #fff; margin-bottom: 0.9rem;
}
.pl-bank.over { border-color: var(--royal-blue); background: #eff6ff; }
.pl-tile {
    display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.12rem;
    min-width: 5.5rem; max-width: 8.2rem; padding: 0.4rem 0.48rem; border-radius: 12px; border: 3px solid;
    cursor: grab; font-family: var(--font-primary); font-weight: 700; font-size: 0.92rem;
    user-select: none; line-height: 1.15; touch-action: none; background: #fff;
    -webkit-user-drag: none;
}
.pl-tile:active { cursor: grabbing; }
.pl-tile.selected { outline: 3px solid var(--royal-blue); outline-offset: 2px; }
.pl-tile.ghosting { opacity: 0.35; }
.pl-tile .pl-ico { width: 2rem; height: 2rem; object-fit: contain; pointer-events: none; flex-shrink: 0; }
.pl-ghost {
    position: fixed; z-index: 90; pointer-events: none; opacity: 0.92;
    transform: translate(-50%, -50%) scale(1.06); filter: drop-shadow(0 8px 16px rgba(15,23,42,0.22));
}
.pl-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin: 0.2rem 0 0.6rem; }
.pl-fb { font-family: var(--font-primary); font-weight: 700; text-align: center; min-height: 1.6rem; margin-top: 0.2rem; }
.pl-fb.ok { color: var(--success-green); }
.pl-fb.bad { color: var(--pillarbox-red); }
.pl-sentence { font-family: var(--font-primary); font-size: 1.15rem; font-weight: 700; text-align: center; margin-top: 0.35rem; }
`;

    let S = null;
    let skipClick = false;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function L(en, pl) {
        return (S && S.polish) ? (pl || en || '') : (en || '');
    }

    function familyOf(id) {
        return FAMILY_BY_ID[id] || 'noun';
    }

    function packHtml(name) {
        if (!name) return '';
        let prefix = PACK_DEFAULT;
        let icon = name;
        const colon = name.indexOf(':');
        if (colon > 0) {
            prefix = name.slice(0, colon);
            icon = name.slice(colon + 1);
        }
        return '<img class="pl-ico" src="' + ICONIFY + encodeURIComponent(prefix) + '/' + encodeURIComponent(icon) + '.svg" alt="" draggable="false">';
    }

    function icoHtml(id) {
        return packHtml(PACK_ICONS[id] || '');
    }

    function tileStyle(id) {
        const c = COL[familyOf(id)] || COL.noun;
        return 'border-color:' + c.bg + ';background:' + c.light + ';color:' + c.ink;
    }

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function sentenceText(item) {
        if (!item) return '';
        let out = item.words.map(function (w) { return w.text; }).join(' ').replace(/\s+/g, ' ').trim();
        if (item.extra === '?') {
            if (!/[?]$/.test(out)) out += '?';
        } else if (!/[.?!]$/.test(out)) out += '.';
        return out;
    }

    function ensureCss() {
        if (document.getElementById(CSS_ID)) return;
        const el = document.createElement('style');
        el.id = CSS_ID;
        el.textContent = CSS;
        document.head.appendChild(el);
    }

    function speak(text) {
        if (!text || !global.speechSynthesis) return;
        global.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-GB';
        u.rate = 0.92;
        global.speechSynthesis.speak(u);
    }

    function loggedIn() {
        if (typeof global.isLoggedIn === 'function') return !!global.isLoggedIn();
        return !!(global.authState && global.authState.user && global.authState.user.id);
    }

    let saveQueue = Promise.resolve();

    async function saveSentence(term, definition) {
        if (!loggedIn()) return;
        try {
            await fetch('/api/word-sets/append', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: SET_NAME,
                    setType: 'vocab',
                    testDirection: 'def',
                    items: [{ term: term, definition: definition }]
                })
            });
        } catch (e) {
            console.warn('Line Up set save failed:', e);
        }
    }

    function rememberSentence(item) {
        const term = sentenceText(item).slice(0, 198);
        const definition = String(item.pl || '').slice(0, 500);
        if (!term || !definition) return;
        saveQueue = saveQueue.then(function () { return saveSentence(term, definition); }).catch(function () { return null; });
    }

    function award(n, result) {
        if (typeof global.peAddPoints === 'function') global.peAddPoints('line', n);
        if (typeof global.incrementGameCount === 'function') global.incrementGameCount();
        if (typeof global.recordGameSessionApi === 'function') {
            global.recordGameSessionApi('pe_line', { score: n, pointsEarned: n, result: result || {} });
        }
    }

    function poolForAge(ageBand) {
        return BANK.filter(function (item) {
            return !item.ages || item.ages.indexOf(ageBand) !== -1;
        });
    }

    function itemKey(item) {
        return (item.words || []).map(function (w) { return w.id; }).join('|');
    }

    function loadItem() {
        const pool = poolForAge(S.ageBand);
        let choice = pick(pool);
        if (pool.length > 1) {
            let guard = 0;
            while (itemKey(choice) === S.lastKey && guard < 12) {
                choice = pick(pool);
                guard += 1;
            }
        }
        const words = choice.words.map(function (w, i) {
            return { uid: 't' + i, id: w.id, text: w.text };
        });
        let bank = shuffle(words.map(function (w) { return w.uid; }));
        let guard = 0;
        while (bank.join('|') === words.map(function (w) { return w.uid; }).join('|') && words.length > 1 && guard < 8) {
            bank = shuffle(bank);
            guard += 1;
        }
        S.item = {
            family: choice.family,
            cue: choice.cue || [],
            extra: choice.extra || '',
            pl: choice.pl || '',
            words: words,
            key: words.map(function (w) { return w.id; }).join('|')
        };
        S.lastKey = S.item.key;
        S.slots = words.map(function () { return null; });
        S.bank = bank;
        S.selected = null;
        S.checked = false;
        S.ok = false;
        S.awarded = false;
        S.fbEn = '';
        S.fbPl = '';
    }

    function wordByUid(uid) {
        if (!S || !S.item) return null;
        return S.item.words.filter(function (w) { return w.uid === uid; })[0] || null;
    }

    function findUid(uid) {
        const bi = S.bank.indexOf(uid);
        if (bi !== -1) return { where: 'bank', index: bi };
        const si = S.slots.indexOf(uid);
        if (si !== -1) return { where: 'slot', index: si };
        return null;
    }

    function takeUid(uid) {
        const loc = findUid(uid);
        if (!loc) return;
        if (loc.where === 'bank') S.bank.splice(loc.index, 1);
        else S.slots[loc.index] = null;
    }

    function placeUid(uid, slotIndex) {
        if (!S || slotIndex < 0 || slotIndex >= S.slots.length) return;
        if (S.slots[slotIndex] === uid) return;
        const occupant = S.slots[slotIndex];
        const from = findUid(uid);
        takeUid(uid);
        S.slots[slotIndex] = uid;
        if (occupant && occupant !== uid) {
            if (from && from.where === 'slot') S.slots[from.index] = occupant;
            else S.bank.push(occupant);
        }
        S.selected = null;
        S.checked = false;
        S.ok = false;
        S.fbEn = '';
        S.fbPl = '';
    }

    function returnToBank(uid) {
        const loc = findUid(uid);
        if (!loc || loc.where === 'bank') return;
        takeUid(uid);
        S.bank.push(uid);
        S.selected = null;
        S.checked = false;
        S.ok = false;
        S.fbEn = '';
        S.fbPl = '';
    }

    function allFilled() {
        return S.slots.every(Boolean);
    }

    function check() {
        if (!allFilled()) {
            S.checked = false;
            S.ok = false;
            S.fbEn = 'Fill every box first.';
            S.fbPl = 'Najpierw wypełnij wszystkie okienka.';
            render();
            return;
        }
        const ok = S.slots.every(function (uid, i) { return uid === S.item.words[i].uid; });
        S.checked = true;
        S.ok = ok;
        if (ok) {
            S.fbEn = 'Well done! That is the sentence.';
            S.fbPl = 'Brawo! To jest to zdanie.';
            if (!S.awarded) {
                S.awarded = true;
                award(10, { family: S.item.family, age: S.ageBand });
                rememberSentence(S.item);
            }
            speak(sentenceText(S.item));
        } else {
            S.fbEn = 'Not yet. Green boxes are right — move the red ones.';
            S.fbPl = 'Jeszcze nie. Zielone okienka są dobre — przesuń czerwone.';
        }
        render();
    }

    function tileHtml(uid, extraClass) {
        const w = wordByUid(uid);
        if (!w) return '';
        const sel = S.selected === uid ? ' selected' : '';
        return '<button type="button" class="pl-tile' + sel + (extraClass ? ' ' + extraClass : '') + '" data-uid="' + esc(uid) + '" style="' + tileStyle(w.id) + '">' +
            icoHtml(w.id) +
            '<span>' + esc(w.text) + '</span>' +
            '</button>';
    }

    function render() {
        const root = document.getElementById('line-up-root');
        if (!root || !S || !S.item) return;
        const cue = S.item.cue.map(function (id, i) {
            const arrow = i ? '<span class="pl-cue-arrow" aria-hidden="true">→</span>' : '';
            return arrow + '<span>' + icoHtml(id) + '</span>';
        }).join('');
        const slots = S.slots.map(function (uid, i) {
            const filled = !!uid;
            let cls = 'pl-slot' + (filled ? ' filled' : ' empty');
            if (S.checked && filled) cls += (uid === S.item.words[i].uid) ? ' ok' : ' bad';
            return '<div class="' + cls + '" data-slot="' + i + '" tabindex="0" aria-label="' + esc(L('Box', 'Okienko') + ' ' + (i + 1)) + '">' +
                '<span class="pl-n">' + (i + 1) + '</span>' +
                (filled ? tileHtml(uid) : '') +
                '</div>';
        }).join('');
        const bank = S.bank.map(function (uid) { return tileHtml(uid); }).join('');
        const fbCls = S.ok ? ' ok' : (S.fbEn ? ' bad' : '');
        root.innerHTML =
            '<div class="pl-coach">' +
                '<p>' + esc(L(
                    'Look at the pictures. Drag each tile into the right numbered box to make the sentence. You can also tap a tile, then tap a box.',
                    'Spójrz na obrazki. Przesuń każdy kafel do właściwego ponumerowanego okienka, żeby złożyć zdanie. Możesz też stuknąć kafel, a potem okienko.'
                )) + '</p>' +
                '<div class="pl-coach-tools">' +
                    '<div class="pl-lang">' +
                        '<button type="button" data-pl="lang" data-id="en"' + (S.polish ? '' : ' class="on"') + '>EN</button>' +
                        '<button type="button" data-pl="lang" data-id="pl"' + (S.polish ? ' class="on"' : '') + '>PL</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="pl-cue" aria-hidden="true">' + cue + '</div>' +
            '<div class="pl-slots">' + slots + '</div>' +
            '<div class="pl-actions">' +
                '<button type="button" class="btn btn-blue" data-pl="check"><i class="fa-solid fa-check"></i> ' + esc(L('Check', 'Sprawdź')) + '</button>' +
                '<button type="button" class="btn btn-outline" data-pl="hear"><i class="fa-solid fa-volume-high"></i> ' + esc(L('Hear it', 'Posłuchaj')) + '</button>' +
                '<button type="button" class="btn btn-outline" data-pl="next"><i class="fa-solid fa-rotate"></i> ' + esc(L('New sentence', 'Nowe zdanie')) + '</button>' +
            '</div>' +
            '<div class="pl-fb' + fbCls + '">' + esc(L(S.fbEn, S.fbPl)) + '</div>' +
            (S.ok ? '<div class="pl-sentence">' + esc(sentenceText(S.item)) + (S.polish ? '<div style="font-weight:500;color:var(--text-muted);margin-top:0.25rem;">' + esc(S.item.pl) + '</div>' : '') + '</div>' : '') +
            '<div class="pl-bank-label">' + esc(L('Tiles', 'Kafelki')) + '</div>' +
            '<div class="pl-bank">' + (bank || '<span style="color:var(--text-muted);font-size:0.9rem;">' + esc(L('All tiles are in the boxes.', 'Wszystkie kafelki są w okienkach.')) + '</span>') + '</div>';
        bind(root);
    }

    function bind(root) {
        root.onclick = function (e) {
            if (skipClick) return;
            const btn = e.target.closest('[data-pl]');
            if (btn) {
                const a = btn.getAttribute('data-pl');
                const id = btn.getAttribute('data-id');
                if (a === 'lang') { S.polish = id === 'pl'; render(); return; }
                if (a === 'check') { check(); return; }
                if (a === 'hear') { speak(sentenceText(S.item)); return; }
                if (a === 'next') { loadItem(); render(); return; }
            }
            const tile = e.target.closest('[data-uid]');
            const slot = e.target.closest('[data-slot]');
            const bank = e.target.closest('.pl-bank');
            if (tile) {
                const uid = tile.getAttribute('data-uid');
                const w = wordByUid(uid);
                if (w) speak(w.text);
                if (S.selected === uid) S.selected = null;
                else S.selected = uid;
                render();
                return;
            }
            if (slot) {
                const idx = Number(slot.getAttribute('data-slot'));
                if (S.selected) {
                    placeUid(S.selected, idx);
                    render();
                    return;
                }
                const occupant = S.slots[idx];
                if (occupant) {
                    returnToBank(occupant);
                    render();
                }
                return;
            }
            if (bank && S.selected) {
                returnToBank(S.selected);
                render();
            }
        };
        bindDrag(root);
    }

    function bindDrag(root) {
        let drag = null;

        function ghostFor(uid) {
            const g = document.createElement('div');
            g.className = 'pl-ghost';
            g.innerHTML = tileHtml(uid);
            document.body.appendChild(g);
            return g;
        }

        function clearOver() {
            root.querySelectorAll('.pl-slot.over, .pl-bank.over').forEach(function (el) {
                el.classList.remove('over');
            });
        }

        function highlight(x, y) {
            clearOver();
            const slot = slotAt(x, y);
            if (slot >= 0) {
                const el = root.querySelector('.pl-slot[data-slot="' + slot + '"]');
                if (el) el.classList.add('over');
                return;
            }
            if (bankAt(x, y)) {
                const bank = root.querySelector('.pl-bank');
                if (bank) bank.classList.add('over');
            }
        }

        function slotAt(x, y) {
            const els = root.querySelectorAll('.pl-slot');
            for (let i = 0; i < els.length; i++) {
                const r = els[i].getBoundingClientRect();
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
                    return Number(els[i].getAttribute('data-slot'));
                }
            }
            return -1;
        }

        function bankAt(x, y) {
            const bank = root.querySelector('.pl-bank');
            if (!bank) return false;
            const r = bank.getBoundingClientRect();
            return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        }

        function finish(x, y, moved) {
            if (!drag) return;
            const uid = drag.uid;
            if (drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
            clearOver();
            const src = drag.srcEl;
            if (src) src.classList.remove('ghosting');
            drag = null;
            if (!moved) return;
            skipClick = true;
            setTimeout(function () { skipClick = false; }, 350);
            const slot = slotAt(x, y);
            if (slot >= 0) {
                placeUid(uid, slot);
                render();
                return;
            }
            if (bankAt(x, y)) {
                returnToBank(uid);
                render();
            }
        }

        root.onpointerdown = function (e) {
            const tile = e.target.closest('[data-uid]');
            if (!tile || e.button) return;
            const uid = tile.getAttribute('data-uid');
            drag = {
                uid: uid,
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                moved: false,
                ghost: null,
                srcEl: tile
            };
            try { tile.setPointerCapture(e.pointerId); } catch (err) {}
        };
        root.onpointermove = function (e) {
            if (!drag || e.pointerId !== drag.pointerId) return;
            const dx = e.clientX - drag.startX;
            const dy = e.clientY - drag.startY;
            if (!drag.moved && (dx * dx + dy * dy) < 64) return;
            if (!drag.moved) {
                drag.moved = true;
                drag.srcEl.classList.add('ghosting');
                drag.ghost = ghostFor(drag.uid);
            }
            e.preventDefault();
            drag.ghost.style.left = e.clientX + 'px';
            drag.ghost.style.top = e.clientY + 'px';
            highlight(e.clientX, e.clientY);
        };
        root.onpointerup = function (e) {
            if (!drag || e.pointerId !== drag.pointerId) return;
            finish(e.clientX, e.clientY, drag.moved);
        };
        root.onpointercancel = function (e) {
            if (!drag || e.pointerId !== drag.pointerId) return;
            finish(e.clientX, e.clientY, false);
        };
    }

    function defaultState(ageBand) {
        return {
            ageBand: ageBand === 'older' ? 'older' : 'young',
            polish: false,
            item: null,
            slots: [],
            bank: [],
            selected: null,
            checked: false,
            ok: false,
            awarded: false,
            lastKey: '',
            fbEn: '',
            fbPl: ''
        };
    }

    function initLineUp() {
        ensureCss();
        const age = (document.querySelector('input[name="line-age"]:checked') || {}).value || 'young';
        const keepPolish = !!(S && S.polish);
        S = defaultState(age);
        S.polish = keepPolish;
        const badge = document.getElementById('line-age-badge');
        if (badge) badge.textContent = S.ageBand === 'older' ? '10–12' : '8–9';
        loadItem();
        render();
    }

    global.initLineUp = initLineUp;
})(typeof window !== 'undefined' ? window : globalThis);
