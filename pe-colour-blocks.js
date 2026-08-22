/**
 * Colour Blocks — Primary English sentence builder.
 * One word or set phrase per tile. Colours and icons stay the same everywhere.
 */
(function (global) {
    'use strict';

    const CSS_ID = 'cb-colour-blocks-css';

    const COL = {
        is:   { bg: '#1d4ed8', light: '#dbeafe', ink: '#1e3a8a', fa: 'fa-circle', label: 'There is · 1', labelPl: 'There is · 1' },
        are:  { bg: '#15803d', light: '#dcfce7', ink: '#14532d', fa: 'fa-ellipsis', label: 'There are · many', labelPl: 'There are · wiele' },
        have: { bg: '#7c3aed', light: '#ede9fe', ink: '#5b21b6', fa: 'fa-hand-holding', label: 'have got', labelPl: 'have got' },
        can:  { bg: '#b45309', light: '#ffedd5', ink: '#9a3412', fa: 'fa-hand-fist', label: 'can / can\'t', labelPl: 'can / can\'t' },
        like: { bg: '#be123c', light: '#ffe4e6', ink: '#9f1239', fa: 'fa-heart', label: 'like', labelPl: 'like' },
        must: { bg: '#b91c1c', light: '#fee2e2', ink: '#7f1d1d', fa: 'fa-exclamation', label: 'must / have to', labelPl: 'must / have to' },
        art:  { bg: '#ca8a04', light: '#fef9c3', ink: '#854d0e', fa: 'fa-font', label: 'a / an / the', labelPl: 'a / an / the' },
        prep: { bg: '#c2410c', light: '#ffedd5', ink: '#9a3412', fa: 'fa-location-dot', label: 'place words', labelPl: 'przyimki miejsca' },
        noun: { bg: '#0f766e', light: '#ccfbf1', ink: '#115e59', fa: 'fa-cube', label: 'things', labelPl: 'rzeczy' },
        verb: { bg: '#0369a1', light: '#e0f2fe', ink: '#0c4a6e', fa: 'fa-person-running', label: 'actions', labelPl: 'czynności' },
        subj: { bg: '#475569', light: '#e2e8f0', ink: '#1e293b', fa: 'fa-user', label: 'who', labelPl: 'kto' },
        neg:  { bg: '#9f1239', light: '#ffe4e6', ink: '#881337', fa: 'fa-ban', label: "don't", labelPl: "don't" },
        num:  { bg: '#4f46e5', light: '#e0e7ff', ink: '#312e81', fa: 'fa-hashtag', label: 'numbers', labelPl: 'liczby' }
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
            glossPl: '',
            wordPl: '',
            fa: COL[family] ? COL[family].fa : 'fa-cube',
            icon: '',
            pic: '',
            vowel: false,
            number: '',
            guess: false
        }, extra || {});
    }

    const TILES = [
        tile('there-is', 'There is', 'struct', 'is', { fa: 'fa-circle', gloss: '1 thing', glossPl: '1 rzecz', goals: ['is'] }),
        tile('there-are', 'There are', 'struct', 'are', { fa: 'fa-ellipsis', gloss: 'many', glossPl: 'wiele', goals: ['are'] }),
        tile('is-there', 'Is there', 'struct', 'is', { fa: 'fa-circle-question', gloss: 'ask · 1', glossPl: 'pytanie · 1', goals: ['is'], speak: 'Is there' }),
        tile('are-there', 'Are there', 'struct', 'are', { fa: 'fa-circle-question', gloss: 'ask · many', glossPl: 'pytanie · wiele', goals: ['are'], speak: 'Are there' }),
        tile('there-isnt', "There isn't", 'struct', 'is', { fa: 'fa-circle-xmark', gloss: 'not 1', glossPl: 'nie ma 1', goals: ['is'] }),
        tile('there-arent', "There aren't", 'struct', 'are', { fa: 'fa-circle-xmark', gloss: 'not many', glossPl: 'nie ma wielu', goals: ['are'] }),

        tile('i', 'I', 'subj', 'subj', { fa: 'fa-user', gloss: 'me', glossPl: 'ja', icon: '👤', guess: true, goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('you', 'You', 'subj', 'subj', { fa: 'fa-hand-point-right', gloss: 'you', glossPl: 'ty / wy', icon: '👉', guess: true, goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('he', 'He', 'subj', 'subj', { fa: 'fa-child', gloss: 'a boy', glossPl: 'on', icon: '👦', guess: true, goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('she', 'She', 'subj', 'subj', { fa: 'fa-child-dress', gloss: 'a girl', glossPl: 'ona', icon: '👧', guess: true, goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('we', 'We', 'subj', 'subj', { fa: 'fa-users', gloss: 'we', glossPl: 'my', icon: '👥', guess: true, goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('they', 'They', 'subj', 'subj', { fa: 'fa-people-group', gloss: 'they', glossPl: 'oni / one', icon: '🧑‍🤝‍🧑', guess: true, goals: ['have', 'can', 'like', 'must', 'haveto'] }),

        tile('a', 'a', 'art', 'art', { fa: 'fa-font', icon: 'a', gloss: 'before b, c, d…', glossPl: 'przed spółgłoską', goals: ['is', 'have', 'like'] }),
        tile('an', 'an', 'art', 'art', { fa: 'fa-font', icon: 'an', gloss: 'before a, e, i, o, u', glossPl: 'przed samogłoską', goals: ['is', 'have', 'like'] }),
        tile('the', 'the', 'art', 'art', { fa: 'fa-font', icon: 'the', gloss: 'that one', glossPl: 'ten / ta / to', goals: ['is', 'are', 'have'] }),
        tile('some', 'some', 'art', 'art', { fa: 'fa-plus', gloss: 'in yes-sentences', glossPl: 'w twierdzeniach', goals: ['are'] }),
        tile('any', 'any', 'art', 'art', { fa: 'fa-question', gloss: 'in questions / no', glossPl: 'w pytaniach i przeczeniach', goals: ['are'] }),

        tile('one', 'one', 'num', 'num', { fa: 'fa-hashtag', icon: '1', gloss: '1', goals: ['is'], ages: ['older'] }),
        tile('two', 'two', 'num', 'num', { fa: 'fa-hashtag', icon: '2', gloss: '2', goals: ['are'] }),
        tile('three', 'three', 'num', 'num', { fa: 'fa-hashtag', icon: '3', gloss: '3', goals: ['are'], ages: ['older'] }),

        tile('have-got', 'have got', 'verbp', 'have', { fa: 'fa-hand-holding', gloss: 'I / You / We / They', glossPl: 'ja / ty / my / oni', goals: ['have'] }),
        tile('has-got', 'has got', 'verbp', 'have', { fa: 'fa-hand-holding', gloss: 'He / She', glossPl: 'on / ona', goals: ['have'] }),
        tile('havent-got', "haven't got", 'verbp', 'have', { fa: 'fa-hand-holding', gloss: 'I / You / We / They · no', glossPl: 'ja / ty / my / oni · nie', goals: ['have'] }),
        tile('hasnt-got', "hasn't got", 'verbp', 'have', { fa: 'fa-hand-holding', gloss: 'He / She · no', glossPl: 'on / ona · nie', goals: ['have'] }),

        tile('can', 'can', 'modal', 'can', { fa: 'fa-hand-fist', gloss: 'able to', glossPl: 'potrafię', icon: '💪', guess: true, goals: ['can'] }),
        tile('cant', "can't", 'modal', 'can', { fa: 'fa-hand-fist', gloss: 'not able', glossPl: 'nie potrafię', icon: '🚫', guess: true, goals: ['can'] }),
        tile('like', 'like', 'verbp', 'like', { fa: 'fa-heart', gloss: 'enjoy', glossPl: 'lubię', icon: '❤️', guess: true, goals: ['like'] }),
        tile('dont', "don't", 'neg', 'neg', { fa: 'fa-ban', gloss: 'not', glossPl: 'nie', icon: '🚫', guess: true, goals: ['like', 'haveto'] }),

        tile('must', 'must', 'modal', 'must', { fa: 'fa-exclamation', gloss: 'necessary', glossPl: 'muszę', icon: '❗', guess: true, goals: ['must'], ages: ['older'] }),
        tile('have-to', 'have to', 'modal', 'must', { fa: 'fa-clipboard-list', gloss: 'it is necessary', glossPl: 'muszę / musimy', icon: '📋', guess: true, goals: ['haveto'], ages: ['older'] }),

        tile('in', 'in', 'prep', 'prep', { fa: 'fa-box', gloss: 'inside', glossPl: 'w środku', icon: '📥', guess: true, goals: ['is', 'are'] }),
        tile('on', 'on', 'prep', 'prep', { fa: 'fa-arrow-up', gloss: 'touching the top', glossPl: 'na (dotyka)', pic: 'on', guess: true, goals: ['is', 'are'] }),
        tile('under', 'under', 'prep', 'prep', { fa: 'fa-arrow-down', gloss: 'below', glossPl: 'pod', pic: 'under', guess: true, goals: ['is', 'are'] }),
        tile('above', 'above', 'prep', 'prep', { fa: 'fa-cloud', gloss: 'over, not touching', glossPl: 'nad (nie dotyka)', icon: '☁️', guess: true, goals: ['is', 'are'] }),
        tile('next-to', 'next to', 'prep', 'prep', { fa: 'fa-arrows-left-right', gloss: 'beside', glossPl: 'obok', icon: '↔️', guess: true, goals: ['is', 'are'] }),
        tile('between', 'between', 'prep', 'prep', { fa: 'fa-grip', gloss: 'in the middle', glossPl: 'pomiędzy', pic: 'between', guess: true, goals: ['is', 'are'], ages: ['older'] }),
        tile('behind', 'behind', 'prep', 'prep', { fa: 'fa-user-secret', gloss: 'at the back', glossPl: 'za', icon: '🫣', guess: true, goals: ['is', 'are'] }),
        tile('in-front-of', 'in front of', 'prep', 'prep', { fa: 'fa-eye', gloss: 'at the front', glossPl: 'przed', icon: '👀', guess: true, goals: ['is', 'are'] }),
        tile('near', 'near', 'prep', 'prep', { fa: 'fa-location-dot', gloss: 'close', glossPl: 'blisko', icon: '📍', guess: true, goals: ['is', 'are'] }),
        tile('upstairs', 'upstairs', 'prep', 'prep', { fa: 'fa-stairs', gloss: 'up', glossPl: 'na górze', icon: '🪜', adverb: true, guess: true, goals: ['is', 'are'], ages: ['older'] }),
        tile('downstairs', 'downstairs', 'prep', 'prep', { fa: 'fa-stairs', gloss: 'down', glossPl: 'na dole', icon: '⬇️', adverb: true, guess: true, goals: ['is', 'are'], ages: ['older'] }),
        tile('outside', 'outside', 'prep', 'prep', { fa: 'fa-tree', gloss: 'not in the house', glossPl: 'na dworze', icon: '🌤️', adverb: true, guess: true, goals: ['is', 'are'] }),
        tile('and', 'and', 'link', 'art', { fa: 'fa-plus', gloss: 'plus', glossPl: 'i', goals: ['is', 'are'], ages: ['older'] }),

        noun('chair', 'chair', 'chairs', '🪑', false, true, { wordPl: 'krzesło' }),
        noun('desk', 'desk', 'desks', '', false, true, { pic: 'desk', wordPl: 'biurko' }),
        noun('lamp', 'lamp', 'lamps', '💡', false, false, { wordPl: 'lampa' }),
        noun('bin', 'bin', 'bins', '🗑️', false, true, { wordPl: 'kosz' }),
        noun('table', 'table', 'tables', '', false, true, { pic: 'table', wordPl: 'stół' }),
        noun('sofa', 'sofa', 'sofas', '🛋️', false, true, { wordPl: 'sofa' }),
        noun('cushion', 'cushion', 'cushions', '', false, false, { pic: 'cushion', wordPl: 'poduszka' }),
        noun('shelf', 'shelf', 'shelves', '📚', false, true, { wordPl: 'półka' }),
        noun('mirror', 'mirror', 'mirrors', '🪞', false, false, { wordPl: 'lustro' }),
        noun('poster', 'poster', 'posters', '🪧', false, false, { wordPl: 'plakat' }),
        noun('picture', 'picture', 'pictures', '🖼️', false, false, { wordPl: 'obrazek' }),
        noun('noticeboard', 'noticeboard', 'noticeboards', '📌', false, true, { ages: ['older'], wordPl: 'tablica' }),
        noun('bed', 'bed', 'beds', '🛏️', false, true, { wordPl: 'łóżko' }),
        noun('wardrobe', 'wardrobe', 'wardrobes', '', false, true, { pic: 'wardrobe', ages: ['older'], wordPl: 'szafa' }),
        noun('door', 'door', 'doors', '🚪', false, true, { wordPl: 'drzwi' }),
        noun('window', 'window', 'windows', '🪟', false, true, { wordPl: 'okno' }),
        noun('key', 'key', 'keys', '🔑', false, false, { wordPl: 'klucz' }),
        noun('laptop', 'laptop', 'laptops', '💻', false, false, { wordPl: 'laptop' }),
        noun('tv', 'TV', 'TVs', '📺', false, true, { wordPl: 'telewizor' }),
        noun('box', 'box', 'boxes', '📦', false, true, { wordPl: 'pudełko' }),
        noun('mat', 'mat', 'mats', '', false, true, { pic: 'mat', wordPl: 'mata' }),
        noun('floor', 'floor', 'floors', '', false, true, { pic: 'floor', wordPl: 'podłoga' }),
        noun('mobile', 'mobile', 'mobiles', '📱', false, false, { wordPl: 'telefon' }),
        noun('car', 'car', 'cars', '🚗', false, false, { wordPl: 'samochód' }),
        noun('book', 'book', 'books', '📖', false, false, { wordPl: 'książka' }),
        noun('clock', 'clock', 'clocks', '⏰', false, false, { wordPl: 'zegar' }),
        noun('bag', 'bag', 'bags', '🎒', false, false, { wordPl: 'torba' }),
        noun('pen', 'pen', 'pens', '🖊️', false, false, { wordPl: 'długopis' }),
        noun('pencil', 'pencil', 'pencils', '✏️', false, false, { wordPl: 'ołówek' }),
        noun('rubber', 'rubber', 'rubbers', '', false, false, { pic: 'eraser', wordPl: 'gumka' }),
        noun('ruler', 'ruler', 'rulers', '📏', false, false, { wordPl: 'linijka' }),
        noun('notebook', 'notebook', 'notebooks', '📓', false, false, { wordPl: 'zeszyt' }),
        noun('pencil-case', 'pencil case', 'pencil cases', '👝', false, false, { wordPl: 'piórnik' }),
        noun('crayon', 'crayon', 'crayons', '🖍️', false, false, { wordPl: 'kredka' }),
        noun('plant', 'plant', 'plants', '🪴', false, true, { wordPl: 'roślina' }),
        noun('cup', 'cup', 'cups', '☕', false, false, { wordPl: 'kubek' }),
        noun('plate', 'plate', 'plates', '🍽️', false, false, { wordPl: 'talerz' }),
        noun('bottle', 'bottle', 'bottles', '🧴', false, false, { wordPl: 'butelka' }),
        noun('hat', 'hat', 'hats', '🧢', false, false, { wordPl: 'czapka' }),
        noun('coat', 'coat', 'coats', '🧥', false, false, { wordPl: 'płaszcz' }),
        noun('shoe', 'shoe', 'shoes', '👞', false, false, { wordPl: 'but' }),
        noun('apple', 'apple', 'apples', '🍎', true, false, { wordPl: 'jabłko' }),
        noun('orange', 'orange', 'oranges', '🍊', true, false, { wordPl: 'pomarańcza' }),
        noun('banana', 'banana', 'bananas', '🍌', false, false, { goals: ['like', 'have', 'is', 'are'], wordPl: 'banan' }),
        noun('sandwich', 'sandwich', 'sandwiches', '🥪', false, false, { goals: ['like', 'have', 'is', 'are'], wordPl: 'kanapka' }),
        noun('cake', 'cake', 'cakes', '🎂', false, false, { goals: ['like', 'have', 'is', 'are'], wordPl: 'ciasto' }),
        noun('juice', 'juice', 'juice', '🧃', false, false, { number: 'unc', goals: ['like', 'have'], wordPl: 'sok' }),
        noun('water', 'water', 'water', '💧', false, false, { number: 'unc', goals: ['like', 'have'], wordPl: 'woda' }),
        noun('cat', 'cat', 'cats', '🐱', false, false, { wordPl: 'kot' }),
        noun('dog', 'dog', 'dogs', '🐶', false, false, { wordPl: 'pies' }),
        noun('bird', 'bird', 'birds', '🐦', false, false, { wordPl: 'ptak' }),
        noun('fish', 'fish', 'fish', '🐟', false, false, { wordPl: 'ryba' }),
        noun('ball', 'ball', 'balls', '🏀', false, false, { wordPl: 'piłka' }),
        noun('bike', 'bike', 'bikes', '🚲', false, false, { wordPl: 'rower' }),
        noun('teddy', 'teddy', 'teddies', '🧸', false, false, { wordPl: 'miś' }),
        noun('doll', 'doll', 'dolls', '🪆', false, false, { wordPl: 'lalka' }),
        noun('computer', 'computer', 'computers', '🖥️', false, false, { wordPl: 'komputer' }),
        noun('pizza', 'pizza', 'pizzas', '🍕', false, false, { goals: ['like', 'have', 'is', 'are'], wordPl: 'pizza' }),
        noun('ice-cream', 'ice cream', 'ice creams', '🍦', true, false, { vowel: true, goals: ['like', 'have', 'is', 'are'], wordPl: 'lody' }),
        noun('football', 'football', 'football', '⚽', false, false, { number: 'unc', goals: ['like', 'can'], wordPl: 'piłka nożna' }),
        noun('music', 'music', 'music', '🎵', false, false, { number: 'unc', goals: ['like'], wordPl: 'muzyka' }),
        noun('school', 'school', 'schools', '🏫', false, false, { goals: ['like', 'must', 'haveto', 'is', 'are'], wordPl: 'szkoła' }),
        noun('message', 'message', 'messages', '✉️', false, false, { wordPl: 'wiadomość' }),
        noun('friend', 'friend', 'friends', '🫂', false, false, { goals: ['like', 'have', 'is', 'are'], wordPl: 'przyjaciel' }),
        noun('garden', 'garden', 'gardens', '🏡', false, true, { ages: ['older'], wordPl: 'ogród' }),
        noun('kitchen', 'kitchen', 'kitchens', '🍴', false, true, { ages: ['older'], wordPl: 'kuchnia' }),
        noun('bedroom', 'bedroom', 'bedrooms', '🌙', false, true, { ages: ['older'], wordPl: 'sypialnia' }),
        noun('bathroom', 'bathroom', 'bathrooms', '🛁', false, true, { ages: ['older'], wordPl: 'łazienka' }),
        noun('living-room', 'living room', 'living rooms', '', false, true, { pic: 'living', ages: ['older'], wordPl: 'salon' }),
        noun('balcony', 'balcony', 'balconies', '', false, true, { pic: 'balcony', ages: ['older'], wordPl: 'balkon' }),
        noun('fridge', 'fridge', 'fridges', '', false, true, { pic: 'fridge', ages: ['older'], wordPl: 'lodówka' }),
        noun('cooker', 'cooker', 'cookers', '', false, true, { pic: 'cooker', ages: ['older'], wordPl: 'kuchenka' }),
        noun('sink', 'sink', 'sinks', '🚰', false, true, { ages: ['older'], wordPl: 'zlew' }),
        noun('towel', 'towel', 'towels', '', false, false, { pic: 'towel', ages: ['older'], wordPl: 'ręcznik' }),
        noun('photo', 'photo', 'photos', '📷', false, false, { ages: ['older'], wordPl: 'zdjęcie' }),
        noun('ticket', 'ticket', 'tickets', '🎫', false, false, { ages: ['older'], wordPl: 'bilet' }),
        noun('tablet', 'tablet', 'tablets', '📲', false, false, { ages: ['older'], wordPl: 'tablet' }),
        noun('headphone', 'headphone', 'headphones', '🎧', false, false, { ages: ['older'], wordPl: 'słuchawka' }),
        noun('charger', 'charger', 'chargers', '🔌', false, false, { ages: ['older'], wordPl: 'ładowarka' }),
        noun('umbrella', 'umbrella', 'umbrellas', '☂️', true, false, { ages: ['older'], wordPl: 'parasol' }),
        noun('scooter', 'scooter', 'scooters', '🛴', false, false, { ages: ['older'], wordPl: 'hulajnoga' }),
        noun('guitar', 'guitar', 'guitars', '🎸', false, false, { ages: ['older'], goals: ['like', 'have', 'can', 'is', 'are'], wordPl: 'gitara' }),
        noun('magazine', 'magazine', 'magazines', '📰', false, false, { ages: ['older'], wordPl: 'gazeta' }),
        noun('dictionary', 'dictionary', 'dictionaries', '📘', false, false, { ages: ['older'], wordPl: 'słownik' }),
        noun('map', 'map', 'maps', '🗺️', false, false, { ages: ['older'], wordPl: 'mapa' }),
        noun('uniform', 'uniform', 'uniforms', '👔', false, false, { ages: ['older'], wordPl: 'mundurek' }),
        noun('jumper', 'jumper', 'jumpers', '', false, false, { pic: 'jumper', ages: ['older'], wordPl: 'sweter' }),
        noun('trainer', 'trainer', 'trainers', '👟', false, false, { ages: ['older'], wordPl: 'but sportowy' }),
        noun('homework', 'homework', 'homework', '📝', false, false, { number: 'unc', goals: ['must', 'haveto'], ages: ['older'], wordPl: 'zadanie' }),

        verb('swim', 'swim', '🏊', ['can', 'must', 'haveto'], null, 'pływać'),
        verb('run', 'run', '🏃', ['can', 'must', 'haveto'], null, 'biegać'),
        verb('jump', 'jump', '🦘', ['can'], null, 'skakać'),
        verb('draw', 'draw', '✏️', ['can', 'like'], null, 'rysować'),
        verb('sing', 'sing', '🎤', ['can', 'like'], null, 'śpiewać'),
        verb('ride', 'ride', '🚲', ['can'], null, 'jeździć'),
        verb('play', 'play', '🎮', ['can', 'like', 'must'], null, 'grać'),
        verb('read', 'read', '📖', ['can', 'like', 'must', 'haveto'], null, 'czytać'),
        verb('write', 'write', '✍️', ['can', 'must', 'haveto'], null, 'pisać'),
        verb('dance', 'dance', '💃', ['can', 'like'], null, 'tańczyć'),
        verb('walk', 'walk', '🚶', ['can', 'must', 'haveto'], null, 'chodzić'),
        verb('eat', 'eat', '🍽️', ['can', 'like', 'must'], null, 'jeść'),
        verb('cook', 'cook', '🍳', ['can', 'like'], ['older'], 'gotować'),
        verb('help', 'help', '🤝', ['must', 'haveto'], ['older'], 'pomagać'),
        verb('tidy', 'tidy', '🧹', ['must', 'haveto'], ['older'], 'sprzątać'),
        verb('listen', 'listen', '👂', ['must', 'haveto'], ['older'], 'słuchać'),
        verb('clean', 'clean', '✨', ['must', 'haveto'], ['older'], 'czyścić'),
        verb('wash', 'wash', '🧼', ['must', 'haveto'], ['older'], 'myć'),
        verb('wait', 'wait', '⏳', ['must', 'haveto'], ['older'], 'czekać'),
        verb('study', 'study', '📚', ['must', 'haveto', 'like'], ['older'], 'uczyć się'),
        verb('practise', 'practise', '🎯', ['must', 'haveto', 'can'], ['older'], 'ćwiczyć'),
        verb('start', 'start', '▶️', ['must', 'haveto'], ['older'], 'zaczynać'),
        verb('finish', 'finish', '🏁', ['must', 'haveto'], ['older'], 'kończyć'),
        verb('speak', 'speak', '🗣️', ['can', 'must', 'like'], ['older'], 'mówić'),
        verb('watch', 'watch', '👀', ['can', 'like', 'must'], ['older'], 'oglądać'),
        verb('wear', 'wear', '👕', ['must', 'haveto', 'can'], ['older'], 'nosić'),
        verb('make', 'make', '🛠️', ['can', 'must', 'like'], ['older'], 'robić'),
        verb('buy', 'buy', '🛒', ['can', 'must', 'haveto'], ['older'], 'kupować'),
        verb('open', 'open', '📂', ['can', 'must'], ['older'], 'otwierać'),
        verb('close', 'close', '🔒', ['can', 'must'], ['older'], 'zamykać'),
        verb('sleep', 'sleep', '😴', ['can', 'must', 'like'], ['older'], 'spać'),
        verb('sit', 'sit', '💺', ['can', 'must'], ['older'], 'siedzieć'),
        verb('stand', 'stand', '🧍', ['can', 'must'], ['older'], 'stać'),
        verb('share', 'share', '🤲', ['must', 'can', 'like'], ['older'], 'dzielić się'),
        verb('visit', 'visit', '🏠', ['must', 'haveto', 'like'], ['older'], 'odwiedzać'),
        verb('brush', 'brush', '🪥', ['must', 'haveto'], ['older'], 'szczotkować')
    ];
    expandNounPlurals(TILES);

    function noun(id, sg, plWord, icon, vowel, place, extra) {
        extra = extra || {};
        const number = extra.number || 'sg';
        const wordPl = extra.wordPl || '';
        const countable = number === 'sg';
        return tile(id, sg, 'noun', 'noun', Object.assign({
            fa: 'fa-cube',
            gloss: number === 'pl' ? 'more than one' : (vowel ? 'starts with a vowel' : 'a thing'),
            glossPl: wordPl || (number === 'pl' ? 'więcej niż jedna' : (vowel ? 'na samogłoskę' : 'rzecz')),
            wordPl: wordPl,
            wordPlPl: extra.wordPlPl || '',
            icon: icon,
            vowel: vowel,
            number: number,
            place: place,
            guess: true,
            plText: countable ? plWord : '',
            plId: countable ? (extra.plId || id + '-pl') : '',
            goals: extra.goals || ['is', 'are', 'have', 'like']
        }, extra));
    }

    function expandNounPlurals(list) {
        const plPl = {
            chair: 'krzesła', desk: 'biurka', lamp: 'lampy', bin: 'kosze', table: 'stoły',
            sofa: 'sofy', cushion: 'poduszki', shelf: 'półki', mirror: 'lustra', poster: 'plakaty',
            picture: 'obrazki', noticeboard: 'tablice', bed: 'łóżka', wardrobe: 'szafy',
            door: 'drzwi', window: 'okna', key: 'klucze', laptop: 'laptopy', tv: 'telewizory',
            box: 'pudełka', mat: 'maty', floor: 'podłogi', mobile: 'telefony', car: 'samochody',
            book: 'książki', clock: 'zegary', bag: 'torby', pen: 'długopisy', pencil: 'ołówki',
            rubber: 'gumki', ruler: 'linijki', notebook: 'zeszyty', 'pencil-case': 'piórniki',
            crayon: 'kredki', plant: 'rośliny', cup: 'kubki', plate: 'talerze', bottle: 'butelki',
            hat: 'czapki', coat: 'płaszcze', shoe: 'buty', apple: 'jabłka', orange: 'pomarańcze',
            banana: 'banany', sandwich: 'kanapki', cake: 'ciasta', cat: 'koty', dog: 'psy',
            bird: 'ptaki', fish: 'ryby', ball: 'piłki', bike: 'rowery', teddy: 'misie', doll: 'lalki',
            computer: 'komputery', pizza: 'pizze', 'ice-cream': 'lody', school: 'szkoły',
            message: 'wiadomości', friend: 'przyjaciele', garden: 'ogrody', kitchen: 'kuchnie',
            bedroom: 'sypialnie', bathroom: 'łazienki', 'living-room': 'salony', balcony: 'balkony',
            fridge: 'lodówki', cooker: 'kuchenki', sink: 'zlewy', towel: 'ręczniki', photo: 'zdjęcia',
            ticket: 'bilety', tablet: 'tablety', headphone: 'słuchawki', charger: 'ładowarki',
            umbrella: 'parasole', scooter: 'hulajnogi', guitar: 'gitary', magazine: 'gazety',
            dictionary: 'słowniki', map: 'mapy', uniform: 'mundurki', jumper: 'swetry', trainer: 'buty sportowe'
        };
        const extra = [];
        list.forEach((t) => {
            if (t.kind !== 'noun' || t.number !== 'sg' || !t.plText || !t.plId) return;
            if (list.some((x) => x.id === t.plId) || extra.some((x) => x.id === t.plId)) return;
            t.wordPlPl = t.wordPlPl || plPl[t.id] || t.wordPl;
            extra.push(tile(t.plId, t.plText, 'noun', 'noun', {
                speak: t.plText,
                ages: t.ages,
                goals: t.goals,
                gloss: 'more than one',
                glossPl: t.wordPlPl || 'więcej niż jedna',
                wordPl: t.wordPlPl || t.wordPl,
                fa: t.fa,
                icon: t.icon,
                pic: t.pic || '',
                vowel: false,
                number: 'pl',
                place: t.place,
                guess: true,
                sgId: t.id
            }));
        });
        extra.forEach((t) => list.push(t));
    }

    function verb(id, text, icon, goals, ages, wordPl) {
        const plWord = wordPl || '';
        return tile(id, text, 'verb', 'verb', {
            fa: 'fa-person-running',
            gloss: 'an action',
            glossPl: plWord || 'czynność',
            wordPl: plWord,
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
        { parts: ['We ', { gap: true }, ' got two keys.'], options: ['have', 'has', 'are'], answer: 'have', family: 'have',
            en: 'We / You / They → have got (same as I).', pl: 'We / You / They → have got (jak I).' },
        { parts: ['You ', { gap: true }, ' swim.'], options: ['can', 'must', 'are'], answer: 'can', family: 'can',
            en: 'You / We / They can + action.', pl: 'You / We / They can + czynność.' },
        { parts: ['They ', { gap: true }, ' pizza.'], options: ['like', "don't", 'can'], answer: 'like', family: 'like',
            en: 'They like + a thing.', pl: 'They like + rzecz.' },
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
        { q: 'Choose the correct sentence.', qPl: 'Wybierz poprawne zdanie.', family: 'is',
            options: ['There is a lamp above the desk.', 'There are a lamp above the desk.', 'There is lamps above the desk.'], answer: 0,
            en: 'One lamp → There is + a.', pl: 'Jedna lampa → There is + a.' },
        { q: 'Choose the correct article.', qPl: 'Wybierz poprawny rodzajnik.', family: 'art',
            options: ['There is an clock on the wall.', 'There is a clock on the wall.', 'There is clock on the wall.'], answer: 1,
            en: 'clock = consonant sound → a.', pl: 'clock = spółgłoska → a.' },
        { q: 'Choose the correct sentence.', qPl: 'Wybierz poprawne zdanie.', family: 'have',
            options: ['She have got a key.', 'She has got a key.', 'She is got a key.'], answer: 1,
            en: 'She → has got.', pl: 'She → has got.' },
        { q: 'Choose the correct sentence.', qPl: 'Wybierz poprawne zdanie.', family: 'have',
            options: ['We has got a laptop.', 'We have got a laptop.', 'We are got a laptop.'], answer: 1,
            en: 'We / You / They → have got.', pl: 'We / You / They → have got.' },
        { q: 'Choose the correct sentence.', qPl: 'Wybierz poprawne zdanie.', family: 'can',
            options: ['I can swim.', 'I can swimming.', 'I swimming can.'], answer: 0,
            en: 'can + action word (swim, run, draw).', pl: 'can + czasownik (swim, run, draw).' },
        { q: 'Choose the correct sentence.', qPl: 'Wybierz poprawne zdanie.', family: 'can',
            options: ['They can dance.', 'They cans dance.', 'They can dancing.'], answer: 0,
            en: 'They / We / You take can (no -s).', pl: 'They / We / You biorą can (bez -s).' },
        { q: 'Choose the negative.', qPl: 'Wybierz przeczenie.', family: 'like',
            options: ['I like pizza.', "I don't like pizza.", 'I like don\'t pizza.'], answer: 1,
            en: "don't is its own tile, then like.", pl: "don't to osobny kafel, potem like." },
        { q: 'Choose the correct sentence. (10–12)', qPl: 'Wybierz poprawne zdanie. (10–12)', family: 'must',
            options: ['I must to tidy my room.', 'I must tidy my room.', 'I must tidying my room.'], answer: 1,
            en: 'must + action (no to).', pl: 'must + czasownik (bez to).' },
        { q: 'How many tiles is “don’t have to”?', qPl: 'Ile kafelków to „don’t have to”?', family: 'must',
            options: ['One tile: don’t have to', 'Two tiles: don’t + have to', 'Three tiles: do + not + have to'], answer: 1,
            en: 'have to stays one tile. don’t is a second tile.', pl: 'have to to jeden kafel. don’t to drugi.' },
        { q: 'Choose the correct sentence.', qPl: 'Wybierz poprawne zdanie.', family: 'are',
            options: ['There are some books on the shelf.', 'There are any books on the shelf.', 'There is some book on the shelf.'], answer: 0,
            en: 'Positive plural → some.', pl: 'Twierdzenie w lm. → some.' }
    ];

    const TEXT_REORDER = [
        { words: ['There is', 'a', 'lamp', 'above', 'the', 'desk'], family: 'is' },
        { words: ['There are', 'two', 'cushions', 'next to', 'the', 'sofa'], family: 'are' },
        { words: ['I', 'have got', 'a', 'mobile'], family: 'have' },
        { words: ['She', 'has got', 'an', 'apple'], family: 'have' },
        { words: ['We', 'have got', 'a', 'laptop'], family: 'have' },
        { words: ['You', 'have got', 'a', 'key'], family: 'have' },
        { words: ['They', 'have got', 'a', 'mobile'], family: 'have' },
        { words: ['Is there', 'a', 'message', 'in', 'the', 'bin'], family: 'is', extra: '?' },
        { words: ['I', 'can', 'swim'], family: 'can' },
        { words: ['He', "can't", 'ride', 'a', 'bike'], family: 'can' },
        { words: ['You', 'can', 'draw'], family: 'can' },
        { words: ['They', 'can', 'dance'], family: 'can' },
        { words: ['I', 'like', 'pizza'], family: 'like' },
        { words: ['I', "don't", 'like', 'football'], family: 'like' },
        { words: ['We', 'like', 'pizza'], family: 'like' },
        { words: ['They', "don't", 'like', 'football'], family: 'like' },
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
.cb-coach-tools { margin-left: auto; display: flex; gap: 0.4rem; flex-shrink: 0; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.cb-coach .cb-flag {
    margin-left: auto; border: 2px solid var(--border-light); background: #fff; border-radius: 8px;
    cursor: pointer; padding: 0.2rem 0.45rem; font-size: 1.15rem; flex-shrink: 0;
}
.cb-coach .cb-flag.on { border-color: var(--pillarbox-red); }
.cb-lang {
    display: inline-flex; flex-shrink: 0; border: 2px solid var(--border-light); border-radius: 8px; overflow: hidden;
}
.cb-tilepl {
    border: 2px solid var(--border-light); background: #fff; border-radius: 8px;
    cursor: pointer; padding: 0.28rem 0.55rem; white-space: nowrap;
    font-family: var(--font-primary); font-weight: 700; font-size: 0.78rem; color: var(--royal-blue);
}
.cb-tilepl.on { background: #0f766e; color: #fff; border-color: #0f766e; }
.cb-lang button {
    border: none; background: #fff; padding: 0.28rem 0.6rem; cursor: pointer;
    font-family: var(--font-primary); font-weight: 700; font-size: 0.82rem; color: var(--royal-blue);
}
.cb-lang button.on { background: var(--royal-blue); color: #fff; }
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
.cb-sheet-bar { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 0.7rem; }
.cb-sheet-bar .btn { padding: 0.28rem 0.7rem; font-size: 0.82rem; }
.cb-sheet-head {
    display: flex; align-items: center; gap: 0.45rem; width: 100%;
    border: none; background: transparent; padding: 0.35rem 0.1rem;
    border-bottom: 1px solid var(--border-light); cursor: pointer;
    font-family: var(--font-primary); font-size: 0.95rem; font-weight: 700;
    color: var(--royal-blue); text-align: left;
}
.cb-sheet-head:hover { opacity: 0.85; }
.cb-sheet-head .cb-chev { width: 0.9rem; font-size: 0.7rem; color: var(--text-muted); }
.cb-sheet-head .cb-sheet-n { margin-left: auto; font-weight: 600; font-size: 0.75rem; color: var(--text-muted); }
.cb-sheet.closed { margin-bottom: 0.2rem; }
.cb-sheet.closed .cb-cards { display: none; }
.cb-sheet h3 { font-family: var(--font-primary); font-size: 0.95rem; color: var(--royal-blue); margin: 0 0 0.45rem; }
.cb-cards { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.cb-card {
    display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.12rem;
    min-width: 5.6rem; max-width: 8.4rem; padding: 0.45rem 0.5rem; border-radius: 12px; border: 3px solid; cursor: pointer;
    font-family: var(--font-primary); font-weight: 700; font-size: 0.92rem; user-select: none; background: #fff;
    color: var(--text-dark); line-height: 1.15;
}
.cb-card .ico { font-size: 1.35rem; line-height: 1; min-height: 1.4rem; }
.cb-card .cb-pic { font-size: 1.35rem; }
.cb-pic {
    display: inline-block; width: 1.4em; height: 1.2em; position: relative;
    vertical-align: middle; flex-shrink: 0; color: currentColor;
}
.cb-pic-table {
    background:
        linear-gradient(currentColor, currentColor) center 30% / 88% 0.22em no-repeat,
        linear-gradient(currentColor, currentColor) 20% 100% / 0.16em 0.65em no-repeat,
        linear-gradient(currentColor, currentColor) 80% 100% / 0.16em 0.65em no-repeat;
}
.cb-pic-desk {
    background:
        linear-gradient(currentColor, currentColor) 50% 6% / 0.5em 0.36em no-repeat,
        linear-gradient(currentColor, currentColor) center 44% / 92% 0.18em no-repeat,
        linear-gradient(currentColor, currentColor) 18% 100% / 0.14em 0.5em no-repeat,
        linear-gradient(currentColor, currentColor) 82% 100% / 0.14em 0.5em no-repeat;
}
.cb-pic-cushion {
    width: 1.25em; height: 0.82em; margin-top: 0.18em;
    background: currentColor; border-radius: 0.38em;
}
.cb-pic-mat {
    width: 1.35em; height: 0.38em; margin-top: 0.42em;
    background: currentColor; border-radius: 0.1em;
    box-shadow: 0 0 0 0.07em currentColor;
}
.cb-pic-floor {
    background:
        linear-gradient(currentColor, currentColor) 0 0 / 45% 45% no-repeat,
        linear-gradient(currentColor, currentColor) 100% 0 / 45% 45% no-repeat,
        linear-gradient(currentColor, currentColor) 0 100% / 45% 45% no-repeat,
        linear-gradient(currentColor, currentColor) 100% 100% / 45% 45% no-repeat;
}
.cb-pic-fridge {
    width: 0.78em; height: 1.18em; margin: 0 auto;
    background: currentColor; border-radius: 0.1em;
    box-shadow: inset -0.16em 0.22em 0 -0.06em #fff;
}
.cb-pic-cooker {
    background: currentColor; border-radius: 0.12em;
    box-shadow:
        inset 0.26em 0.26em 0 -0.12em #fff,
        inset -0.26em 0.26em 0 -0.12em #fff,
        inset 0.26em -0.2em 0 -0.12em #fff,
        inset -0.26em -0.2em 0 -0.12em #fff;
}
.cb-pic-wardrobe {
    width: 1em; height: 1.18em; margin: 0 auto;
    background: currentColor; border-radius: 0.08em 0.08em 0.05em 0.05em;
    box-shadow: inset 0.48em 0 0 -0.38em #fff;
}
.cb-pic-towel {
    width: 0.9em; height: 1.12em; margin: 0 auto;
    background: currentColor;
    clip-path: polygon(8% 0, 92% 0, 100% 18%, 88% 100%, 50% 78%, 12% 100%, 0 18%);
}
.cb-pic-jumper {
    background:
        linear-gradient(currentColor, currentColor) 50% 100% / 0.68em 0.82em no-repeat,
        linear-gradient(currentColor, currentColor) 0 42% / 0.36em 0.26em no-repeat,
        linear-gradient(currentColor, currentColor) 100% 42% / 0.36em 0.26em no-repeat;
}
.cb-pic-balcony {
    background:
        linear-gradient(currentColor, currentColor) 18% 8% / 0.55em 0.48em no-repeat,
        linear-gradient(currentColor, currentColor) 0 68% / 100% 0.12em no-repeat,
        linear-gradient(currentColor, currentColor) 10% 68% / 0.1em 0.38em no-repeat,
        linear-gradient(currentColor, currentColor) 36% 68% / 0.1em 0.38em no-repeat,
        linear-gradient(currentColor, currentColor) 62% 68% / 0.1em 0.38em no-repeat,
        linear-gradient(currentColor, currentColor) 88% 68% / 0.1em 0.38em no-repeat;
}
.cb-pic-living {
    background:
        linear-gradient(currentColor, currentColor) 0 100% / 100% 0.14em no-repeat,
        linear-gradient(currentColor, currentColor) 14% 58% / 0.72em 0.36em no-repeat,
        linear-gradient(currentColor, currentColor) 72% 18% / 0.28em 0.36em no-repeat;
}
.cb-pic-between {
    background:
        linear-gradient(currentColor, currentColor) 10% 50% / 0.2em 0.62em no-repeat,
        linear-gradient(currentColor, currentColor) 50% 50% / 0.32em 0.92em no-repeat,
        linear-gradient(currentColor, currentColor) 90% 50% / 0.2em 0.62em no-repeat;
}
.cb-pic-on {
    background:
        linear-gradient(currentColor, currentColor) 50% 16% / 0.52em 0.36em no-repeat,
        linear-gradient(currentColor, currentColor) 50% 82% / 100% 0.16em no-repeat;
}
.cb-pic-under {
    background:
        linear-gradient(currentColor, currentColor) 50% 12% / 100% 0.16em no-repeat,
        linear-gradient(currentColor, currentColor) 50% 78% / 0.52em 0.36em no-repeat;
}
.cb-pic-eraser {
    width: 1.15em; height: 0.5em; margin-top: 0.35em;
    background: currentColor; border-radius: 0.1em 0.28em 0.28em 0.1em;
}
.cb-card .gloss { font-family: var(--font-secondary); font-weight: 400; font-size: 0.68rem; color: var(--text-muted); text-align: center; }
.cb-card .gloss.plhint { color: #0f766e; font-weight: 700; }
.cb-card .cb-1plus {
    font-family: var(--font-primary); font-weight: 700; font-size: 0.62rem;
    color: #0f766e; background: #ccfbf1; border-radius: 999px; padding: 0.05rem 0.4rem; margin-top: 0.05rem;
}
.cb-card.in-chain { cursor: pointer; }
.cb-nounpick-back {
    position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); z-index: 80;
    display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.cb-nounpick {
    background: #fff; border-radius: 16px; padding: 1.1rem 1.15rem 1.2rem; width: min(22rem, 100%);
    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22); text-align: center;
}
.cb-nounpick h3 { font-family: var(--font-primary); margin: 0 0 0.35rem; color: var(--royal-blue); font-size: 1.15rem; }
.cb-nounpick p { margin: 0 0 0.85rem; color: var(--text-muted); font-size: 0.95rem; }
.cb-nounpick .cb-cards { justify-content: center; }
.cb-nounpick .cb-card { min-width: 7.2rem; }
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
.cb-why { text-align: center; margin-top: 0.55rem; }
.cb-why .btn { margin-top: 0.15rem; }
.cb-whybox {
    text-align: left; font-weight: 500; font-size: 1.05rem; line-height: 1.7;
    color: var(--text-dark);
}
.cb-whybox strong {
    font-weight: 800; color: var(--royal-blue);
    background: #dbeafe; padding: 0.05em 0.28em; border-radius: 5px;
    box-decoration-break: clone; -webkit-box-decoration-break: clone;
}
.cb-guess-icon .cb-pic { color: #0f766e; }
.cb-picture .cb-pic { color: #0f766e; font-size: 1em; }
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

    function L(en, pl) {
        return (S && S.polish) ? (pl || en || '') : (en || '');
    }

    function tilePic(t) {
        if (!t) return '';
        if (t.pic) return 'pic:' + t.pic;
        return t.icon || '';
    }

    function icoHtml(t) {
        if (!t) return '';
        if (t.pic) return '<span class="cb-pic cb-pic-' + t.pic + '" aria-hidden="true"></span>';
        if (t.icon) return '<span class="ico" aria-hidden="true">' + t.icon + '</span>';
        return '<span class="ico" aria-hidden="true"><i class="fa-solid ' + (t.fa || 'fa-cube') + '"></i></span>';
    }

    function pictureMark(p) {
        if (!p) return '';
        if (typeof p === 'object') return icoHtml(p);
        const s = String(p);
        if (s.indexOf('pic:') === 0) {
            return '<span class="cb-pic cb-pic-' + s.slice(4) + '" aria-hidden="true"></span>';
        }
        return '<span class="ico" aria-hidden="true">' + s + '</span>';
    }

    function richWhy(text) {
        return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    }

    const PERSONS = [
        { id: 'i', icon: '👤' },
        { id: 'you', icon: '👉' },
        { id: 'he', icon: '👦' },
        { id: 'she', icon: '👧' },
        { id: 'we', icon: '👥' },
        { id: 'they', icon: '🧑‍🤝‍🧑' }
    ];

    function pickPerson() { return pick(PERSONS); }
    function gotTile(personId) { return (personId === 'he' || personId === 'she') ? 'has-got' : 'have-got'; }

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

    const CB_SET_NAME = 'Colour Blocks';
    let colourSaveQueue = Promise.resolve();

    const PERSON_PL = { i: 'Ja', you: 'Ty', he: 'On', she: 'Ona', we: 'My', they: 'Oni' };
    const HAVE_PL = { i: 'mam', you: 'masz', he: 'ma', she: 'ma', we: 'mamy', they: 'mają' };
    const HAVE_NEG_PL = { i: 'nie mam', you: 'nie masz', he: 'nie ma', she: 'nie ma', we: 'nie mamy', they: 'nie mają' };
    const CAN_PL = { i: 'potrafię', you: 'potrafisz', he: 'potrafi', she: 'potrafi', we: 'potrafimy', they: 'potrafią' };
    const CAN_NEG_PL = { i: 'nie potrafię', you: 'nie potrafisz', he: 'nie potrafi', she: 'nie potrafi', we: 'nie potrafimy', they: 'nie potrafią' };
    const LIKE_PL = { i: 'lubię', you: 'lubisz', he: 'lubi', she: 'lubi', we: 'lubimy', they: 'lubią' };
    const LIKE_NEG_PL = { i: 'nie lubię', you: 'nie lubisz', he: 'nie lubi', she: 'nie lubi', we: 'nie lubimy', they: 'nie lubią' };
    const MUST_PL = { i: 'muszę', you: 'musisz', he: 'musi', she: 'musi', we: 'musimy', they: 'muszą' };
    const MUST_NEG_PL = { i: 'nie muszę', you: 'nie musisz', he: 'nie musi', she: 'nie musi', we: 'nie musimy', they: 'nie muszą' };
    const PREP_PL = {
        in: 'w', on: 'na', under: 'pod', above: 'nad', 'next-to': 'obok', between: 'między',
        behind: 'za', 'in-front-of': 'przed', near: 'blisko', upstairs: 'na górze', downstairs: 'na dole', outside: 'na dworze', and: 'i'
    };
    const PLACE_NA = {
        chair: 'krześle', desk: 'biurku', table: 'stole', sofa: 'sofie', bin: 'koszu', shelf: 'półce',
        bed: 'łóżku', wardrobe: 'szafie', door: 'drzwiach', window: 'oknie', box: 'pudełku', mat: 'macie',
        floor: 'podłodze', garden: 'ogrodzie', kitchen: 'kuchni', bedroom: 'sypialni', bathroom: 'łazience',
        'living-room': 'salonie', balcony: 'balkonie', fridge: 'lodówce', cooker: 'kuchence', sink: 'zlewie',
        school: 'szkole', bag: 'torbie', car: 'samochodzie'
    };
    const PLACE_POD = {
        chair: 'krzesłem', desk: 'biurkiem', table: 'stołem', sofa: 'sofą', bin: 'koszem', shelf: 'półką',
        bed: 'łóżkiem', box: 'pudełkiem', mat: 'matą', window: 'oknem'
    };
    const NUM_PL = { one: 'jeden', two: 'dwa', three: 'trzy', some: 'kilka', any: 'jakieś' };

    function nounPlWord(t) {
        if (!t) return '';
        if (t.kind === 'noun' && t.number === 'pl') return t.wordPl || t.wordPlPl || t.text;
        return (t.wordPl || t.text || '').trim();
    }

    function nounKey(t) {
        if (!t) return '';
        return t.sgId || t.id;
    }

    function placePolish(prepId, noun) {
        const key = nounKey(noun);
        if (prepId === 'under') return PLACE_POD[key] || nounPlWord(noun);
        if (prepId === 'upstairs' || prepId === 'downstairs' || prepId === 'outside') return PREP_PL[prepId];
        return PLACE_NA[key] || nounPlWord(noun);
    }

    function capPl(s, question) {
        let out = String(s || '').replace(/\s+/g, ' ').trim();
        if (!out) return '';
        out = out.charAt(0).toUpperCase() + out.slice(1);
        if (question) {
            if (!/[?]$/.test(out)) out += '?';
        } else if (!/[.?!]$/.test(out)) out += '.';
        return out;
    }

    function polishFromTiles(tiles) {
        if (!tiles || !tiles.length) return '';
        const ids = tiles.map((t) => t.id);
        const has = (id) => ids.indexOf(id) !== -1;
        const first = tiles[0];
        const subj = tiles.find((t) => t.kind === 'subj');
        const nouns = tiles.filter((t) => t.kind === 'noun');
        const verb = tiles.find((t) => t.kind === 'verb');
        const prep = tiles.find((t) => t.kind === 'prep' && !t.adverb);
        const adv = tiles.find((t) => t.kind === 'prep' && t.adverb);
        const num = tiles.find((t) => t.kind === 'num' || t.id === 'some' || t.id === 'any');
        const question = first.id === 'is-there' || first.id === 'are-there';

        if (first.kind === 'struct') {
            const thing = nouns[0];
            const place = nouns[1] || nouns.find((n) => n.place && n !== thing);
            let head = 'Jest';
            if (first.family === 'are' && first.id !== 'there-arent') head = 'Są';
            if (first.id === 'there-isnt' || first.id === 'there-arent') head = 'Nie ma';
            if (question) head = first.family === 'are' ? 'Czy są' : 'Czy jest';
            const bits = [head];
            if (num && NUM_PL[num.id] && first.id !== 'there-isnt') bits.push(NUM_PL[num.id]);
            if (thing) bits.push(nounPlWord(thing));
            if (adv) bits.push(PREP_PL[adv.id] || adv.wordPl || adv.text);
            else if (prep && place) {
                bits.push(PREP_PL[prep.id] || prep.text);
                if (prep.id === 'between') {
                    const second = nouns[2] || nouns[1];
                    bits.push(nounPlWord(place), 'i', nounPlWord(second));
                } else {
                    bits.push(placePolish(prep.id, place));
                }
            }
            return capPl(bits.filter(Boolean).join(' '), question);
        }

        if (subj) {
            const pid = subj.id;
            const who = PERSON_PL[pid] || subj.wordPl || subj.text;
            const action = verb ? (verb.wordPl || verb.text) : '';
            const thing = nouns[0];
            const thingW = thing ? nounPlWord(thing) : '';
            if (has('have-got') || has('has-got') || has('havent-got') || has('hasnt-got')) {
                const neg = has('havent-got') || has('hasnt-got');
                const v = (neg ? HAVE_NEG_PL : HAVE_PL)[pid];
                return capPl([who, v, thingW].filter(Boolean).join(' '));
            }
            if (has('can') || has('cant')) {
                const v = (has('cant') ? CAN_NEG_PL : CAN_PL)[pid];
                return capPl([who, v, action].filter(Boolean).join(' '));
            }
            if (has('like') || (has('dont') && has('like'))) {
                const v = (has('dont') ? LIKE_NEG_PL : LIKE_PL)[pid];
                return capPl([who, v, thingW || action].filter(Boolean).join(' '));
            }
            if (has('must') || has('have-to') || (has('dont') && has('have-to'))) {
                const v = (has('dont') ? MUST_NEG_PL : MUST_PL)[pid];
                return capPl([who, v, action].filter(Boolean).join(' '));
            }
        }
        return tiles.map((t) => t.wordPl || t.glossPl || t.text).filter(Boolean).join(' ');
    }

    function tilesFromEnglish(en) {
        let rest = tidyColourEn(en).replace(/[?.!]+$/g, '').trim();
        const pool = TILES.slice().sort((a, b) => String(b.text).length - String(a.text).length);
        const out = [];
        while (rest) {
            let hit = null;
            const low = rest.toLowerCase();
            for (let i = 0; i < pool.length; i++) {
                const w = String(pool[i].text).replace(/[’‘]/g, "'");
                const wl = w.toLowerCase();
                if (low === wl || low.indexOf(wl + ' ') === 0) {
                    hit = pool[i];
                    rest = rest.slice(w.length).trim();
                    break;
                }
            }
            if (!hit) {
                const sp = rest.indexOf(' ');
                if (sp < 0) break;
                rest = rest.slice(sp + 1).trim();
            } else out.push(hit);
        }
        return out;
    }

    function polishSentence(en, tiles) {
        const fromTiles = polishFromTiles(tiles && tiles.length ? tiles : tilesFromEnglish(en));
        return String(fromTiles || '').replace(/\s+/g, ' ').trim();
    }

    function tidyColourEn(en) {
        return String(en || '')
            .replace(/[’‘]/g, "'")
            .replace(/\s*\(10–12\)\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function looksLikeSentence(s) {
        return /^(There |Is there|Are there|I |You |He |She |We |They )/i.test(String(s || '').trim());
    }

    function rememberColourSentence(en, pl, tiles) {
        let term = tidyColourEn(en).slice(0, 198);
        if (!term) return;
        if (/^(Is there|Are there)/i.test(term)) {
            if (!/[?]$/.test(term)) term += '?';
        } else if (!/[.?!]$/.test(term)) term += '.';
        let definition = String(pl || '').replace(/\s+/g, ' ').trim();
        if (!definition) definition = polishSentence(term, tiles);
        definition = definition.slice(0, 500);
        if (!definition || !looksLikeSentence(term)) return;
        colourSaveQueue = colourSaveQueue.then(() => saveColourSentence(term, definition)).catch(() => null);
    }

    function colourLoggedIn() {
        if (typeof global.isLoggedIn === 'function') return !!global.isLoggedIn();
        return !!(global.authState && global.authState.user && global.authState.user.id);
    }

    async function saveColourSentence(term, definition) {
        if (!colourLoggedIn()) return;
        try {
            await fetch('/api/word-sets/append', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: CB_SET_NAME,
                    setType: 'vocab',
                    testDirection: 'def',
                    items: [{ term: term, definition: definition }]
                })
            });
        } catch (e) {
            console.warn('Colour Blocks set save failed:', e);
        }
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
                    return { ok: false, en: 'Order: I / You / We / They / He / She + don’t + like + pizza.', pl: 'Kolejność: I / You / We / They / He / She + don’t + like + pizza.' };
                }
                const n = tiles.find((t) => t.kind === 'noun' || t.kind === 'verb');
                if (!n) return { ok: false, en: 'What do they like? Add a thing or an action.', pl: 'Co lubią? Dodaj rzecz albo czynność.' };
                return { ok: true, sentence: joinSpeak(tiles, false) };
            }

            return { ok: false, en: 'Add have got, can, like, must or have to after I / You / We / They / He / She.', pl: 'Po I / You / We / They / He / She dodaj have got, can, like, must albo have to.' };
        }

        return { ok: false, en: 'Start with There is / There are, or I / You / We / They / He / She.', pl: 'Zacznij od There is / There are albo I / You / We / They / He / She.' };
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
            return { ids: ['there-is', art, n.id, prep.id, 'the', place.id], picture: [tilePic(n), tilePic(prep) || prep.text, tilePic(place)] };
        }
        if (g === 'are') {
            const n = pick(visibleTiles().filter((t) => t.kind === 'noun' && t.number === 'pl'));
            const prep = pick(visibleTiles().filter((t) => t.kind === 'prep'));
            if (!n) return { ids: ['there-are', 'two', 'chair-pl'], picture: ['🪑🪑'] };
            if (prep && prep.adverb) return { ids: ['there-are', n.id, prep.id], picture: [tilePic(n), tilePic(prep)] };
            const place = pick(visibleTiles().filter((t) => t.kind === 'noun' && t.place && t.number === 'sg'));
            return { ids: ['there-are', n.id, (prep && prep.id) || 'on', 'the', (place && place.id) || 'sofa'], picture: [tilePic(n), prep && tilePic(prep), place && tilePic(place)] };
        }
        if (g === 'have') {
            const p = pickPerson();
            const got = gotTile(p.id);
            const n = pick(visibleTiles().filter((t) => t.kind === 'noun' && t.number === 'sg' && t.goals && t.goals.indexOf('have') !== -1));
            const art = n && n.vowel ? 'an' : 'a';
            return { ids: [p.id, got, art, n ? n.id : 'key'], picture: [p.icon, '👜', n && tilePic(n)] };
        }
        if (g === 'can') {
            const p = pickPerson();
            const modal = pick(['can', 'cant']);
            const v = pick(visibleTiles().filter((t) => t.kind === 'verb' && t.goals.indexOf('can') !== -1));
            return { ids: [p.id, modal, v ? v.id : 'swim'], picture: [p.icon, modal === 'can' ? '💪' : '🚫', v && tilePic(v)] };
        }
        if (g === 'like') {
            const p = pickPerson();
            const n = pick(visibleTiles().filter((t) => t.kind === 'noun' && t.number !== 'pl' && t.goals && t.goals.indexOf('like') !== -1));
            const neg = Math.random() < 0.4;
            const ids = neg ? [p.id, 'dont', 'like', n ? n.id : 'pizza'] : [p.id, 'like', n ? n.id : 'pizza'];
            return { ids: ids, picture: [p.icon, neg ? '🚫' : '❤️', n && tilePic(n)] };
        }
        if (g === 'must') {
            const p = pickPerson();
            const v = pick(visibleTiles().filter((t) => t.kind === 'verb' && t.goals.indexOf('must') !== -1));
            return { ids: [p.id, 'must', v ? v.id : 'listen'], picture: [p.icon, '❗', v && tilePic(v)] };
        }
        if (g === 'haveto') {
            const p = pickPerson();
            const v = pick(visibleTiles().filter((t) => t.kind === 'verb' && t.goals.indexOf('haveto') !== -1));
            const neg = Math.random() < 0.4;
            const ids = neg ? [p.id, 'dont', 'have-to', v ? v.id : 'run'] : [p.id, 'have-to', v ? v.id : 'tidy'];
            return { ids: ids, picture: [p.icon, neg ? '🚫' : '📋', v && tilePic(v)] };
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

    function speakTile(t) {
        if (!t) return;
        let src = t;
        if (t.kind === 'noun' && t.number === 'pl' && t.sgId) src = byId(t.sgId) || t;
        speak(String(src.speak || src.text || '').replace(/\s+/g, ' ').trim());
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
        const ico = icoHtml(t);
        const gloss = (S && S.tilePl) ? (t.wordPl || t.glossPl) : t.gloss;
        const glossCls = (S && S.tilePl && gloss) ? 'gloss plhint' : 'gloss';
        const inBank = action === 'add' && (!extraClass || extraClass.indexOf('in-chain') === -1);
        const oneOrMore = inBank && t.kind === 'noun' && t.number === 'sg' && t.plId;
        return '<button type="button" class="cb-card' + (extraClass || '') + '" data-cb="' + action + '" data-id="' + t.id + '" style="' + colorStyle(t.family) + '">' +
            ico + esc(t.text) + (gloss ? '<span class="' + glossCls + '">' + esc(gloss) + '</span>' : '') +
            (oneOrMore ? '<span class="cb-1plus">' + esc(L('1 or +', '1 lub +')) + '</span>' : '') +
            '</button>';
    }

    function nounPickHtml() {
        if (!S || !S.nounPick) return '';
        const t = byId(S.nounPick);
        const pl = t && t.plId ? byId(t.plId) : null;
        if (!t || !pl) return '';
        const opt = (tile, labelEn, labelPl) => {
            const gloss = S.tilePl ? (tile.wordPl || '') : '';
            return '<button type="button" class="cb-card" data-cb="noun-pick" data-id="' + tile.id + '" style="' + colorStyle('noun') + '">' +
                icoHtml(tile) +
                esc(tile.text) +
                (gloss ? '<span class="gloss plhint">' + esc(gloss) + '</span>' : '') +
                '<span class="cb-1plus">' + esc(L(labelEn, labelPl)) + '</span></button>';
        };
        return '<div class="cb-nounpick-back" data-cb="noun-pick-cancel">' +
            '<div class="cb-nounpick" data-cb="noun-pick-box">' +
            '<h3>' + esc(t.text) + '</h3>' +
            '<p>' + esc(L('One thing, or more than one?', 'Jedna rzecz czy więcej niż jedna?')) + '</p>' +
            '<div class="cb-cards">' +
            opt(t, 'one', 'jedna') +
            opt(pl, 'more than one', 'więcej niż jedna') +
            '</div>' +
            '<div class="cb-actions" style="justify-content:center;margin-bottom:0;">' +
            '<button type="button" class="btn btn-grey" data-cb="noun-pick-cancel">' + esc(L('Cancel', 'Anuluj')) + '</button>' +
            '</div></div></div>';
    }

    function addToChain(id) {
        S.nounPick = null;
        clearAskWhy();
        if (S.tab === 'guess' && S.guessPhase === 'sentence') {
            S.guessChain.push(id);
            S.guessFbEn = ''; S.guessFbPl = ''; S.guessOk = false;
            S.guessHintEn = ''; S.guessHintPl = ''; S.guessModel = '';
        } else {
            S.chain.push(id);
            S.buildFbEn = ''; S.buildFbPl = ''; S.buildOk = false; S.buildSpoken = ''; S.buildAwarded = false;
        }
        render();
    }

    function sameNoun(a, b) {
        if (!a || !b || a.kind !== 'noun' || b.kind !== 'noun') return false;
        return a.id === b.id || a.plId === b.id || b.plId === a.id || (a.sgId && a.sgId === b.id) || (b.sgId && b.sgId === a.id) || (a.sgId && b.sgId && a.sgId === b.sgId);
    }

    function ensureCss() {
        let el = document.getElementById(CSS_ID);
        if (!el) {
            el = document.createElement('style');
            el.id = CSS_ID;
            document.head.appendChild(el);
        }
        el.textContent = CB_CSS;
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
            (S.tab === 'text' ? textHtml() : '') +
            nounPickHtml();
        bind(root);
    }

    function legendHtml() {
        const keys = S.ageBand === 'young'
            ? ['is', 'are', 'have', 'can', 'like', 'art', 'prep']
            : ['is', 'are', 'have', 'can', 'like', 'must', 'art', 'prep'];
        return '<div class="cb-legend" aria-label="' + esc(L('Colour key', 'Kolory')) + '">' + keys.map((k) => {
            const c = COL[k];
            return '<span style="background:' + c.bg + '"><i class="fa-solid ' + c.fa + '"></i> ' + esc(L(c.label, c.labelPl)) + '</span>';
        }).join('') + '</div>';
    }

    function tabsHtml() {
        const t = (id, en, pl) => '<button type="button" class="cb-tab' + (S.tab === id ? ' on' : '') + '" data-cb="tab" data-id="' + id + '">' + esc(L(en, pl)) + '</button>';
        return '<div class="cb-tabs">' +
            t('build', 'Build a sentence', 'Złóż zdanie') +
            t('guess', 'Icon guess', 'Zgadnij z ikon') +
            t('text', 'Text tasks', 'Zadania tekstowe') +
            '</div>';
    }

    function coachHtml() {
        const tilePlOn = S.tilePl;
        return '<div class="cb-coach"><p>' + esc(coach()) + '</p>' +
            '<div class="cb-coach-tools">' +
            '<button type="button" class="cb-tilepl' + (tilePlOn ? ' on' : '') + '" data-cb="tilepl" title="' +
            esc(L('Show Polish words on tiles', 'Pokaż polskie słowa na kafelkach')) + '">' +
            esc(tilePlOn ? L('PL tiles on', 'PL na kafelkach') : L('PL tiles off', 'Bez PL na kafelkach')) +
            '</button>' +
            '<div class="cb-lang" role="group" aria-label="' + esc(L('Language', 'Język')) + '">' +
            '<button type="button"' + (S.polish ? '' : ' class="on"') + ' data-cb="lang" data-id="en">EN</button>' +
            '<button type="button"' + (S.polish ? ' class="on"' : '') + ' data-cb="lang" data-id="pl">PL</button>' +
            '</div></div></div>';
    }

    function goalsHtml() {
        const items = [
            { id: 'is', title: 'I see one thing', titlePl: 'Widzę jedną rzecz', sub: 'There is', col: 'is' },
            { id: 'are', title: 'I see many things', titlePl: 'Widzę wiele rzeczy', sub: 'There are', col: 'are' },
            { id: 'have', title: 'Someone has something', titlePl: 'Ktoś coś ma', sub: 'I You We They He She', col: 'have' },
            { id: 'can', title: 'Someone can / can’t', titlePl: 'Ktoś potrafi / nie potrafi', sub: 'I You We They He She', col: 'can' },
            { id: 'like', title: 'Someone likes something', titlePl: 'Ktoś coś lubi', sub: "I You We They · don't + like", col: 'like' }
        ];
        if (S.ageBand === 'older') {
            items.push({ id: 'must', title: 'Someone must', titlePl: 'Ktoś musi', sub: 'I You We They He She', col: 'must' });
            items.push({ id: 'haveto', title: 'have to / don’t have to', titlePl: 'have to / don’t have to', sub: 'I You We They He She', col: 'must' });
        }
        return '<div class="cb-goals">' + items.map((g) => {
            const c = COL[g.col];
            return '<button type="button" class="cb-goal" data-cb="goal" data-id="' + g.id + '" style="border-color:' + c.bg + ';color:' + c.ink + ';background:' + c.light + '">' +
                esc(L(g.title, g.titlePl)) + '<small>' + esc(L(g.sub, g.subPl)) + '</small></button>';
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
        return '<div class="cb-picture" aria-label="' + esc(L('Look first', 'Najpierw popatrz')) + '">' + prompt.picture.filter(Boolean).map((p) => '<span>' + pictureMark(p) + '</span>').join('<span style="color:#94a3b8">→</span>') + '</div>';
    }

    function sheetGroups() {
        return [
            { id: 'who', title: 'Who', titlePl: 'Kto', kinds: ['subj'] },
            { id: 'struct', title: 'Sentence starters', titlePl: 'Początek zdania', kinds: ['struct'] },
            { id: 'art', title: 'a · an · the · some · any', titlePl: 'a · an · the · some · any', kinds: ['art'] },
            { id: 'num', title: 'Numbers', titlePl: 'Liczby', kinds: ['num'] },
            { id: 'grammar', title: 'Grammar', titlePl: 'Gramatyka', kinds: ['verbp', 'modal', 'neg'] },
            { id: 'prep', title: 'Place words', titlePl: 'Przyimki miejsca', kinds: ['prep', 'link'] },
            { id: 'noun', title: 'Things', titlePl: 'Rzeczy', kinds: ['noun'] },
            { id: 'verb', title: 'Actions', titlePl: 'Czynności', kinds: ['verb'] }
        ];
    }

    function defaultSheetsOpen() {
        const open = {};
        sheetGroups().forEach((g) => { open[g.id] = false; });
        if (S.tab === 'guess') {
            open.who = true;
            open.grammar = true;
            open.prep = true;
            open.noun = true;
            open.verb = true;
            return open;
        }
        const g = S.goal;
        if (g === 'have') {
            open.who = true; open.grammar = true; open.art = true; open.noun = true;
        } else if (g === 'can' || g === 'must' || g === 'haveto') {
            open.who = true; open.grammar = true; open.verb = true;
        } else if (g === 'like') {
            open.who = true; open.grammar = true; open.noun = true;
        } else {
            open.struct = true; open.art = true; open.prep = true; open.noun = true;
        }
        return open;
    }

    function ensureSheetsOpen() {
        if (!S.sheetsOpen) S.sheetsOpen = defaultSheetsOpen();
        return S.sheetsOpen;
    }

    function sheetsHtml() {
        const groups = sheetGroups();
        const open = ensureSheetsOpen();
        const list = visibleTiles();
        let html = '<div class="cb-sheet-bar">' +
            '<button type="button" class="btn btn-outline" data-cb="sheets" data-id="open">' + esc(L('Expand all', 'Rozwiń wszystkie')) + '</button>' +
            '<button type="button" class="btn btn-outline" data-cb="sheets" data-id="close">' + esc(L('Collapse all', 'Zwiń wszystkie')) + '</button>' +
            '</div>';
        groups.forEach((g) => {
            const tiles = list.filter((t) => g.kinds.indexOf(t.kind) !== -1 && t.number !== 'pl');
            if (!tiles.length) return;
            const isOpen = open[g.id] !== false;
            const chev = isOpen ? 'fa-chevron-down' : 'fa-chevron-right';
            html += '<div class="cb-sheet' + (isOpen ? '' : ' closed') + '">' +
                '<button type="button" class="cb-sheet-head" data-cb="sheet" data-id="' + g.id + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
                '<i class="fa-solid ' + chev + ' cb-chev" aria-hidden="true"></i>' +
                esc(L(g.title, g.titlePl)) +
                '<span class="cb-sheet-n">' + tiles.length + '</span>' +
                '</button><div class="cb-cards">';
            tiles.forEach((t) => { html += cardHtml(t, '', 'add'); });
            html += '</div></div>';
        });
        return html;
    }

    function buildHtml() {
        if (!S.goal) return goalsHtml();
        const fb = L(S.buildFbEn, S.buildFbPl);
        let html = '';
        if (S.buildPrompt) html += pictureHtml(S.buildPrompt);
        html += chainHtml(S.chain, 'pop', L('Tap tiles below…', 'Kliknij kafelki poniżej…'));
        html += sheetsHtml();
        html += '<div class="cb-actions">' +
            '<button type="button" class="btn btn-blue" data-cb="check-build">' + esc(L('Check', 'Sprawdź')) + '</button>' +
            '<button type="button" class="btn btn-outline" data-cb="speak-build"><i class="fa-solid fa-volume-high"></i> ' + esc(L('Say it', 'Powiedz')) + '</button>' +
            '<button type="button" class="btn btn-outline" data-cb="clear-build">' + esc(L('Clear', 'Wyczyść')) + '</button>' +
            '<button type="button" class="btn btn-outline" data-cb="new-prompt">' + esc(L('New picture', 'Nowy obrazek')) + '</button>' +
            '<button type="button" class="btn btn-grey" data-cb="new-goal">' + esc(L('Change goal', 'Zmień cel')) + '</button>' +
            '</div>';
        if (S.buildSpoken) {
            html += '<div class="cb-sentence">' + chainTiles(S.chain).map((t) => tokHtml(t.family, t.text)).join(' ') + '</div>';
        }
        html += '<div class="cb-fb' + (S.buildOk ? ' ok' : (fb ? ' bad' : '')) + '">' + esc(fb) + '</div>';
        html += whyHtml(!S.buildOk && !!fb);
        return html;
    }

    function guessHtml() {
        const fb = L(S.guessFbEn, S.guessFbPl);
        const hint = L(S.guessHintEn, S.guessHintPl);
        let html = '';
        if (S.guessPhase === 'icons') {
            html += chainHtml(S.guessIcons, 'guess-pop', L('Line your icons up here.', 'Ułóż tu swoje ikony.'));
            html += '<div class="cb-icon-bank">';
            guessIconTiles().forEach((t) => {
                html += '<button type="button" class="cb-guess-icon" data-cb="guess-add" data-id="' + t.id + '" title="' + esc(t.text) + '">' +
                    icoHtml(t) + '<small>' + esc(t.text) + '</small></button>';
            });
            html += '</div>';
            html += '<div class="cb-actions"><button type="button" class="btn btn-blue" data-cb="guess-lock">' + esc(L('These icons — now make a sentence', 'Te ikony — teraz złóż zdanie')) + '</button>' +
                '<button type="button" class="btn btn-outline" data-cb="guess-clear-icons">' + esc(L('Clear icons', 'Wyczyść ikony')) + '</button></div>';
        } else {
            html += '<p style="font-weight:700;font-family:var(--font-primary);color:var(--royal-blue);margin:0 0 0.4rem;">' + esc(L('Your icons', 'Twoje ikony')) + '</p>';
            html += '<div class="cb-picture">' + chainTiles(S.guessIcons).map((t) => '<span title="' + esc(t.text) + '">' + icoHtml(t) + '</span>').join('<span style="color:#94a3b8">→</span>') + '</div>';
            html += chainHtml(S.guessChain, 'guess-chain-pop', L('Build the sentence with tiles.', 'Złóż zdanie kafelkami.'));
            const keepGoal = S.goal;
            S.goal = null;
            html += sheetsHtml();
            S.goal = keepGoal;
            html += '<div class="cb-actions">' +
                '<button type="button" class="btn btn-blue" data-cb="guess-check">' + esc(L('Check', 'Sprawdź')) + '</button>' +
                '<button type="button" class="btn btn-outline" data-cb="guess-ai"><i class="fa-solid fa-robot"></i> ' + esc(L('Ask AI', 'Zapytaj AI')) + '</button>' +
                '<button type="button" class="btn btn-outline" data-cb="guess-teacher-ok">' + esc(L('Teacher: correct', 'Nauczyciel: poprawnie')) + '</button>' +
                '<button type="button" class="btn btn-outline" data-cb="guess-teacher-hint">' + esc(L('Teacher: hint', 'Nauczyciel: wskazówka')) + '</button>' +
                '<button type="button" class="btn btn-grey" data-cb="guess-back">' + esc(L('Change icons', 'Zmień ikony')) + '</button>' +
                '</div>';
        }
        html += '<div class="cb-fb' + (S.guessOk ? ' ok' : (fb ? ' bad' : '')) + '">' + esc(fb) + '</div>';
        if (hint) html += '<div class="cb-hintbox">' + esc(hint) + '</div>';
        if (S.guessModel) html += '<div class="cb-sentence">' + esc(S.guessModel) + '</div>';
        html += whyHtml(S.guessPhase === 'sentence' && !S.guessOk && !!fb && !/checking|sprawdza/i.test(fb));
        return html;
    }

    function guessIconTiles() {
        return TILES.filter((t) => t.guess && t.ages.indexOf(S.ageBand) !== -1 && (t.icon || t.pic) && t.number !== 'pl');
    }

    function textHtml() {
        const kinds = [
            ['gap', 'Gap fill', 'Luki'],
            ['mcq', 'Multiple choice', 'Wybór'],
            ['reorder', 'Rearrange', 'Ułóż']
        ];
        const fb = L(S.textFbEn, S.textFbPl);
        let html = '<div class="cb-text-kinds">';
        kinds.forEach(([id, en, pl]) => {
            html += '<button type="button" class="cb-tab' + (S.textKind === id ? ' on' : '') + '" data-cb="text-kind" data-id="' + id + '">' + esc(L(en, pl)) + '</button>';
        });
        html += '<button type="button" class="btn btn-outline" data-cb="text-next">' + esc(L('New task', 'Nowe zadanie')) + '</button></div>';
        if (S.textKind === 'gap') html += gapHtml();
        if (S.textKind === 'mcq') html += mcqHtml();
        if (S.textKind === 'reorder') html += reorderHtml();
        html += '<div class="cb-actions"><button type="button" class="btn btn-blue" data-cb="text-check">' + esc(L('Check', 'Sprawdź')) + '</button></div>';
        html += '<div class="cb-fb' + (S.textOk ? ' ok' : (fb ? ' bad' : '')) + '">' + esc(fb) + '</div>';
        html += whyHtml(!S.textOk && !!fb);
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
        let html = '<p style="font-family:var(--font-primary);font-weight:700;margin-bottom:0.75rem;">' + esc(L(m.q, m.qPl)) + '</p>';
        m.options.forEach((op, i) => {
            html += '<div><button type="button" class="cb-opt' + (S.mcqPick === i ? ' on' : '') + '" data-cb="mcq-pick" data-id="' + i + '" style="width:100%;text-align:left;margin-bottom:0.4rem;' + colorStyle(m.family) + '">' + esc(op) + '</button></div>';
        });
        return html;
    }

    function reorderHtml() {
        const r = S.reorder;
        if (!r) return '';
        let html = '<div class="cb-actions" style="margin-top:0;"><button type="button" class="btn btn-outline" data-cb="reorder-listen"><i class="fa-solid fa-volume-high"></i> ' + esc(L('Read sentence', 'Odsłuchaj zdanie')) + '</button></div>';
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
            if (a === 'tab') {
                const changed = S.tab !== id;
                S.tab = id;
                S.nounPick = null;
                clearAskWhy();
                S.buildFbEn = ''; S.buildFbPl = '';
                S.guessFbEn = ''; S.guessFbPl = '';
                S.guessHintEn = ''; S.guessHintPl = '';
                S.textFbEn = ''; S.textFbPl = '';
                if (changed && (id === 'build' || id === 'guess')) S.sheetsOpen = defaultSheetsOpen();
                render(); return;
            }
            if (a === 'lang') { S.polish = id === 'pl'; render(); return; }
            if (a === 'tilepl') { S.tilePl = !S.tilePl; render(); return; }
            if (a === 'pl') { S.polish = !S.polish; render(); return; }
            if (a === 'goal') {
                S.goal = id; S.chain = [];
                S.buildPrompt = S.ageBand === 'young' ? makeBuildPrompt(id) : null;
                S.buildFbEn = ''; S.buildFbPl = ''; S.buildOk = false; S.buildSpoken = '';
                S.sheetsOpen = defaultSheetsOpen();
                clearAskWhy();
                render(); return;
            }
            if (a === 'sheet') {
                ensureSheetsOpen();
                S.sheetsOpen[id] = S.sheetsOpen[id] === false;
                render(); return;
            }
            if (a === 'sheets') {
                const groups = sheetGroups();
                const on = id === 'open';
                S.sheetsOpen = {};
                groups.forEach((g) => { S.sheetsOpen[g.id] = on; });
                render(); return;
            }
            if (a === 'add') {
                const tile = byId(id);
                speakTile(tile);
                if (tile && tile.kind === 'noun' && tile.number === 'sg' && tile.plId) {
                    S.nounPick = id;
                    render();
                    return;
                }
                addToChain(id);
                return;
            }
            if (a === 'noun-pick-box') return;
            if (a === 'noun-pick-cancel') { S.nounPick = null; render(); return; }
            if (a === 'noun-pick') { speakTile(byId(id)); addToChain(id); return; }
            if (a === 'pop') {
                speakTile(chainTiles(S.chain)[Number(id)]);
                S.chain.splice(Number(id), 1); S.buildFbEn = ''; S.buildFbPl = ''; S.buildOk = false; S.buildSpoken = ''; clearAskWhy(); render(); return;
            }
            if (a === 'check-build') { checkBuild(); return; }
            if (a === 'ask-why') { askWhy(); return; }
            if (a === 'speak-build') { speak(S.buildSpoken || joinSpeak(chainTiles(S.chain))); return; }
            if (a === 'clear-build') { S.chain = []; S.buildFbEn = ''; S.buildFbPl = ''; S.buildOk = false; S.buildSpoken = ''; S.buildAwarded = false; clearAskWhy(); render(); return; }
            if (a === 'new-prompt') { S.buildPrompt = makeBuildPrompt(S.goal); S.chain = []; S.buildFbEn = ''; S.buildFbPl = ''; S.buildOk = false; S.buildSpoken = ''; S.buildAwarded = false; clearAskWhy(); render(); return; }
            if (a === 'new-goal') { S.goal = null; S.chain = []; S.buildPrompt = null; clearAskWhy(); render(); return; }
            if (a === 'guess-add') { speakTile(byId(id)); S.guessIcons.push(id); render(); return; }
            if (a === 'guess-pop') { speakTile(chainTiles(S.guessIcons)[Number(id)]); S.guessIcons.splice(Number(id), 1); render(); return; }
            if (a === 'guess-clear-icons') { S.guessIcons = []; render(); return; }
            if (a === 'guess-lock') {
                if (S.guessIcons.length < 2) {
                    S.guessFbEn = 'Line up at least two icons.';
                    S.guessFbPl = 'Ułóż co najmniej dwie ikony.';
                    render(); return;
                }
                S.guessPhase = 'sentence'; S.guessChain = [];
                S.guessFbEn = ''; S.guessFbPl = '';
                S.guessHintEn = ''; S.guessHintPl = '';
                S.guessModel = ''; S.guessOk = false; S.guessAwarded = false;
                clearAskWhy();
                render(); return;
            }
            if (a === 'guess-chain-pop') {
                speakTile(chainTiles(S.guessChain)[Number(id)]);
                S.guessChain.splice(Number(id), 1); clearAskWhy(); render(); return;
            }
            if (a === 'guess-back') {
                S.guessPhase = 'icons';
                S.guessFbEn = ''; S.guessFbPl = '';
                S.guessHintEn = ''; S.guessHintPl = '';
                clearAskWhy();
                render(); return;
            }
            if (a === 'guess-check') { checkGuess(false); return; }
            if (a === 'guess-ai') { checkGuess(true); return; }
            if (a === 'guess-teacher-ok') { teacherMark(true); return; }
            if (a === 'guess-teacher-hint') { teacherMark(false); return; }
            if (a === 'text-kind') { S.textKind = id; loadTextTask(); render(); return; }
            if (a === 'text-next') { loadTextTask(); render(); return; }
            if (a === 'text-check') { checkText(); return; }
            if (a === 'gap-pick') { S.gapPick = id; S.textFbEn = ''; S.textFbPl = ''; clearAskWhy(); render(); return; }
            if (a === 'mcq-pick') { S.mcqPick = Number(id); S.textFbEn = ''; S.textFbPl = ''; clearAskWhy(); render(); return; }
            if (a === 'reorder-push') { pushReorder(Number(id)); return; }
            if (a === 'reorder-pop') { popReorder(Number(id)); return; }
            if (a === 'reorder-listen') {
                if (!S.reorder) return;
                speak(S.reorder.words.join(' ') + (S.reorder.extra || ''));
            }
        };
    }

    function whyHtml(show) {
        if (!show) return '';
        const expl = L(S.askWhyEn, S.askWhyPl);
        const label = S.askWhyBusy
            ? L('AI is thinking…', 'AI myśli…')
            : L('Ask why', 'Dopytaj AI');
        return '<div class="cb-why">' +
            '<button type="button" class="btn btn-outline" data-cb="ask-why"' + (S.askWhyBusy ? ' disabled' : '') + '>' +
            '<i class="fa-solid fa-robot"></i> ' + esc(label) + '</button>' +
            (expl ? '<div class="cb-hintbox cb-whybox">' + richWhy(expl) + '</div>' : '') +
            '</div>';
    }

    function clearAskWhy() {
        S.askWhyEn = '';
        S.askWhyPl = '';
        S.askWhyBusy = false;
        S.askWhyGen = (S.askWhyGen || 0) + 1;
    }

    function ageWhyVoice() {
        if (S.ageBand === 'older') {
            return 'Speak like a kind teacher to a 10–12 year old. Short, clear sentences. You may name must, have to, some, any, a/an if needed.';
        }
        return 'Speak like a kind teacher to an 8–9 year old. Very short sentences. Easy words. One idea at a time. Do not use must or have to.';
    }

    function askWhyContext() {
        if (S.tab === 'build') {
            const tiles = chainTiles(S.chain);
            const attempt = joinSpeak(tiles) || tiles.map((t) => t.text).join(' ');
            const picture = S.buildPrompt && S.buildPrompt.ids
                ? S.buildPrompt.ids.map((id) => (byId(id) || {}).text || id).join(' ')
                : '';
            return {
                task: 'Build a sentence with colour tiles.',
                attempt: attempt,
                extra: (picture ? 'The picture wanted this order: ' + picture + '. ' : '') +
                    'Goal: ' + (S.goal || 'any') + '. Short checker note (EN): ' + (S.buildFbEn || '') +
                    ' / (PL): ' + (S.buildFbPl || '')
            };
        }
        if (S.tab === 'guess') {
            const icons = chainTiles(S.guessIcons).map((t) => t.text).join(' → ');
            const attempt = joinSpeak(chainTiles(S.guessChain)) || chainTiles(S.guessChain).map((t) => t.text).join(' ');
            return {
                task: 'Icon guess: make a sentence about the icon line.',
                attempt: attempt,
                extra: 'Icons in order: ' + icons + '. Checker note (EN): ' + (S.guessFbEn || '') +
                    ' / (PL): ' + (S.guessFbPl || '') + '. Hint: ' + (S.guessHintEn || '')
            };
        }
        if (S.textKind === 'gap') {
            const g = S.gap || {};
            const line = (g.parts || []).map((p) => typeof p === 'string' ? p : (S.gapPick || '___')).join('');
            return {
                task: 'Gap fill.',
                attempt: 'They chose "' + (S.gapPick || '') + '" in: ' + line,
                extra: 'Checker note (EN): ' + (S.textFbEn || '') + ' / (PL): ' + (S.textFbPl || '')
            };
        }
        if (S.textKind === 'mcq') {
            const m = S.mcq || {};
            const chosen = (m.options && m.options[S.mcqPick]) || '';
            return {
                task: 'Multiple choice: ' + (m.q || 'Choose the correct sentence.'),
                attempt: 'They chose: ' + chosen,
                extra: 'Checker note (EN): ' + (S.textFbEn || '') + ' / (PL): ' + (S.textFbPl || '')
            };
        }
        const r = S.reorder || {};
        return {
            task: 'Rearrange the words into a sentence.',
            attempt: (S.reorderBuilt || []).join(' '),
            extra: 'Checker note (EN): ' + (S.textFbEn || '') + ' / (PL): ' + (S.textFbPl || '')
        };
    }

    async function askWhy() {
        if (S.askWhyBusy) return;
        S.askWhyBusy = true;
        S.askWhyEn = 'One moment…';
        S.askWhyPl = 'Chwileczkę…';
        const gen = (S.askWhyGen || 0);
        render();
        const age = S.ageBand === 'older' ? '10–12' : '8–9';
        const ctx = askWhyContext();
        const grammar = S.ageBand === 'older'
            ? "there is/are, have got, can/can't, like, don't like, must, have to, don't + have to, a/an/some/any"
            : "there is/are, have got, can/can't, like, don't like, a/an, prepositions";
        const prompt = `You help a Polish child who got a Colour Blocks English task wrong. Be kind. Do not scold.
Age: ${age}. ${ageWhyVoice()}
Allowed grammar for this age: ${grammar}.
Task: ${ctx.task}
What the child did: ${ctx.attempt}
Extra context: ${ctx.extra}

Write a SIMPLE, easy-to-read explanation. A child of this age must understand it in one look.

LAYOUT
- 2 to 4 very short lines. One idea per line.
- Put a blank line between: (1) what is wrong, (2) the rule, (3) one example.
- No long paragraph. No lists with dashes or stars at the start of a line.

BOLD ENGLISH WORDS
- Wrap every English word or phrase the child should notice in double asterisks, like **has got** or **She**.
- Always bold: the tiles they used, the tiles they should use, and the example sentence.
- In explainPl write simple Polish, but keep those English words in English and bold them.
  Example: Po **She** użyj **has got**, nie **have got**.
- Do not bold Polish words. Only English words, phrases, and the example.

EXAMPLE
- Give ONE short correct sentence, fully bold: **She has got a key.**

Do not invent extra grammar beyond this age.
Return JSON only: { "explainEn": "short readable text with **bold** English", "explainPl": "the same idea in simple Polish with **bold** English words" }`;
        if (typeof global.fetchGenerativeAI !== 'function') {
            if (S.askWhyGen !== gen) return;
            S.askWhyBusy = false;
            S.askWhyEn = 'AI is not available right now. Read the red message and try one change.';
            S.askWhyPl = 'AI jest teraz niedostępne. Przeczytaj czerwony komunikat i zmień jeden kafel.';
            render();
            return;
        }
        const data = await global.fetchGenerativeAI(prompt);
        if (S.askWhyGen !== gen) return;
        S.askWhyBusy = false;
        if (data && data.__error) {
            S.askWhyEn = data.__error;
            S.askWhyPl = data.__error;
            render();
            return;
        }
        S.askWhyEn = data.explainEn || data.hintEn || '';
        S.askWhyPl = data.explainPl || data.hintPl || S.askWhyEn;
        if (!S.askWhyEn && !S.askWhyPl) {
            S.askWhyEn = 'Look at the red message. Change one tile, then Check again.';
            S.askWhyPl = 'Spójrz na czerwony komunikat. Zmień jeden kafel i sprawdź ponownie.';
        }
        render();
    }

    function checkBuild() {
        clearAskWhy();
        const tiles = chainTiles(S.chain);
        const v = validateChain(tiles);
        if (!v.ok) {
            S.buildOk = false;
            S.buildFbEn = v.en;
            S.buildFbPl = v.pl;
            S.buildSpoken = '';
            render();
            return;
        }
        if (S.buildPrompt && !promptMatches(tiles, S.buildPrompt)) {
            S.buildOk = false;
            S.buildFbEn = 'Almost! Match the picture, tile by tile.';
            S.buildFbPl = 'Prawie! Ułóż kafelki dokładnie o obrazku, w tej samej kolejności.';
            S.buildSpoken = '';
            render();
            return;
        }
        S.buildOk = true;
        S.buildSpoken = v.sentence;
        S.buildFbEn = 'Yes! Say the sentence aloud.';
        S.buildFbPl = 'Tak! Powiedz zdanie na głos.';
        if (!S.buildAwarded) {
            S.buildAwarded = true;
            award(10, { tab: 'build', sentence: v.sentence });
            rememberColourSentence(v.sentence, polishFromTiles(tiles), tiles);
        }
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
            if (tile.kind === 'noun') return !sent.some((x) => sameNoun(tile, x));
            if (tile.kind === 'verb' || tile.kind === 'prep' || tile.kind === 'modal' || tile.kind === 'neg' || tile.kind === 'verbp') {
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
            en: 'Start with who (I / You / We / They / He / She), then the grammar tile, then the thing or action. Your icons: ' + words + '.',
            pl: 'Zacznij od kto (I / You / We / They / He / She), potem kafel gramatyki, potem rzecz lub czynność. Twoje ikony: ' + words + '.'
        };
    }

    function teacherMark(ok) {
        if (ok) {
            const v = validateChain(chainTiles(S.guessChain));
            S.guessOk = true;
            S.guessFbEn = 'Teacher: correct.';
            S.guessFbPl = 'Nauczyciel: poprawnie.';
            S.guessHintEn = '';
            S.guessHintPl = '';
            S.guessModel = v.ok ? v.sentence : joinSpeak(chainTiles(S.guessChain));
            if (!S.guessAwarded) {
                S.guessAwarded = true;
                award(15, { tab: 'guess', by: 'teacher' });
                const gt = chainTiles(S.guessChain);
                rememberColourSentence(S.guessModel, polishFromTiles(gt), gt);
            }
        } else {
            const h = teacherHintFromIcons();
            S.guessOk = false;
            S.guessFbEn = 'Teacher: not yet. Change the sentence.';
            S.guessFbPl = 'Nauczyciel: jeszcze nie. Popraw zdanie.';
            S.guessHintEn = h.en;
            S.guessHintPl = h.pl;
        }
        render();
    }

    async function checkGuess(useAi) {
        clearAskWhy();
        const local = localGuessCheck();
        if (!useAi) {
            S.guessOk = local.ok;
            if (local.ok) {
                S.guessFbEn = 'Yes! That sentence matches your icons.';
                S.guessFbPl = 'Tak! To zdanie pasuje do ikon.';
                S.guessHintEn = '';
                S.guessHintPl = '';
            } else {
                S.guessFbEn = local.en || '';
                S.guessFbPl = local.pl || '';
                S.guessHintEn = 'Change one tile and check again.';
                S.guessHintPl = 'Spróbuj zmienić jeden kafel i sprawdź znowu.';
            }
            S.guessModel = local.ok ? local.sentence : '';
            if (local.ok && !S.guessAwarded) {
                S.guessAwarded = true;
                award(15, { tab: 'guess' });
                const gt = chainTiles(S.guessChain);
                rememberColourSentence(local.sentence, polishFromTiles(gt), gt);
            }
            if (local.ok) speak(local.sentence);
            render();
            return;
        }
        S.guessFbEn = 'AI is checking…';
        S.guessFbPl = 'AI sprawdza…';
        S.guessHintEn = '';
        S.guessHintPl = '';
        render();
        const icons = chainTiles(S.guessIcons).map((t) => t.text + (t.icon ? ' ' + t.icon : '')).join(' | ');
        const sentence = joinSpeak(chainTiles(S.guessChain));
        const age = S.ageBand === 'young' ? '8-9' : '10-12';
        const grammar = S.ageBand === 'young'
            ? "there is/are, have got, can/can't, like, don't like, a/an, prepositions"
            : "there is/are, have got, can/can't, like, don't like, must, have to, don't + have to, a/an/some/any";
        const prompt = `You mark a child's English colour-tile sentence. Be kind and specific.
Age: ${age}. Allowed grammar: ${grammar}.
Persons they may use: I, You, We, They, He, She.
Icon sequence the child invented (in order): ${icons}
Sentence they built: "${sentence}"
Rules: "have to" is one phrase. "don't have to" is two tiles: don't + have to. a and an are separate. don't like is don't + like.
Always return both hintEn and hintPl (Polish), even if valid (then leave both empty).
Return JSON: { "valid": boolean, "hintEn": "one short hint if invalid, else empty", "hintPl": "Polish hint", "model": "one correct sentence matching the icons" }`;
        if (typeof global.fetchGenerativeAI !== 'function') {
            S.guessFbEn = 'AI is not available — use Check or a teacher mark.';
            S.guessFbPl = 'AI niedostępne — użyj Check albo znaku nauczyciela.';
            render();
            return;
        }
        const data = await global.fetchGenerativeAI(prompt);
        if (data && data.__error) {
            S.guessOk = false;
            S.guessFbEn = data.__error;
            S.guessFbPl = data.__error;
            render();
            return;
        }
        const valid = !!data.valid;
        S.guessOk = valid;
        S.guessFbEn = valid ? 'AI: correct.' : 'AI: not yet. Use the hint and change your tiles.';
        S.guessFbPl = valid ? 'AI: poprawnie.' : 'AI: jeszcze nie. Popraw zdanie według wskazówki.';
        S.guessHintEn = data.hintEn || '';
        S.guessHintPl = data.hintPl || data.hintEn || '';
        S.guessModel = data.model || '';
        if (valid && !S.guessAwarded) {
            S.guessAwarded = true;
            award(15, { tab: 'guess', by: 'ai' });
            const gt = chainTiles(S.guessChain);
            rememberColourSentence(sentence || data.model, polishFromTiles(gt), gt);
        }
        if (valid && data.model) speak(data.model);
        render();
    }

    function loadTextTask() {
        S.textFbEn = '';
        S.textFbPl = '';
        S.textOk = false;
        S.textAwarded = false;
        clearAskWhy();
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
        S.textFbEn = '';
        S.textFbPl = '';
        clearAskWhy();
        render();
    }
    function popReorder(i) {
        const w = S.reorderBuilt.splice(i, 1)[0];
        const idx = S.reorder.shuffled.findIndex((x, n) => x === w && S.reorderUsed[n]);
        if (idx >= 0) S.reorderUsed[idx] = false;
        clearAskWhy();
        render();
    }

    function checkText() {
        clearAskWhy();
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
        S.textFbEn = en;
        S.textFbPl = pl;
        if (ok && !S.textAwarded) {
            S.textAwarded = true;
            award(10, { tab: 'text', kind: S.textKind });
            rememberColourText();
        }
        render();
    }

    function rememberColourText() {
        let en = '';
        if (S.textKind === 'gap' && S.gap) {
            en = (S.gap.parts || []).map((p) => typeof p === 'string' ? p : (S.gap.answer || S.gapPick || '')).join('');
        } else if (S.textKind === 'mcq' && S.mcq && Array.isArray(S.mcq.options)) {
            en = S.mcq.options[S.mcq.answer] || '';
        } else if (S.textKind === 'reorder' && S.reorder) {
            en = (S.reorder.words || []).join(' ') + (S.reorder.extra || '');
        }
        en = tidyColourEn(en);
        rememberColourSentence(en, polishSentence(en), tilesFromEnglish(en));
    }

    function defaultState(ageBand) {
        return {
            ageBand: ageBand === 'older' ? 'older' : 'young',
            tab: 'build',
            polish: false,
            tilePl: false,
            sheetsOpen: null,
            nounPick: null,
            goal: null,
            chain: [],
            buildPrompt: null,
            buildFbEn: '',
            buildFbPl: '',
            buildOk: false,
            buildSpoken: '',
            buildAwarded: false,
            guessPhase: 'icons',
            guessIcons: [],
            guessChain: [],
            guessFbEn: '',
            guessFbPl: '',
            guessHintEn: '',
            guessHintPl: '',
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
            textFbEn: '',
            textFbPl: '',
            textOk: false,
            textAwarded: false,
            askWhyEn: '',
            askWhyPl: '',
            askWhyBusy: false,
            askWhyGen: 0
        };
    }

    function initColourBlocks() {
        ensureCss();
        const age = (document.querySelector('input[name="colour-age"]:checked') || {}).value || 'young';
        const keepPolish = !!(S && S.polish);
        const keepTilePl = !!(S && S.tilePl);
        const keepSheets = S && S.sheetsOpen ? S.sheetsOpen : null;
        S = defaultState(age);
        S.polish = keepPolish;
        S.tilePl = keepTilePl;
        S.sheetsOpen = keepSheets;
        const badge = document.getElementById('colour-age-badge');
        if (badge) badge.textContent = S.ageBand === 'older' ? '10–12' : '8–9';
        loadTextTask();
        render();
    }

    global.initColourBlocks = initColourBlocks;
})(typeof window !== 'undefined' ? window : globalThis);
