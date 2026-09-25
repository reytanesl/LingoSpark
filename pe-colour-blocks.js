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
        num:  { bg: '#4f46e5', light: '#e0e7ff', ink: '#312e81', fa: 'fa-hashtag', label: 'numbers', labelPl: 'liczby' },
        be:   { bg: '#0e7490', light: '#cffafe', ink: '#155e75', fa: 'fa-equals', label: 'to be', labelPl: 'to be' },
        wh:   { bg: '#6d28d9', light: '#ede9fe', ink: '#4c1d95', fa: 'fa-circle-question', label: 'question words', labelPl: 'pytania' },
        punct:{ bg: '#334155', light: '#e2e8f0', ink: '#0f172a', fa: 'fa-circle', label: '. / ?', labelPl: '. / ?' }
    };

    const ICONIFY = 'https://api.iconify.design/';
    const PACK_DEFAULT = 'fluent-emoji';
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
        'havent-got': 'prohibited', 'hasnt-got': 'prohibited',
        can: 'flexed-biceps', cant: 'prohibited', like: 'red-heart', dont: 'prohibited',
        must: 'red-exclamation-mark', 'have-to': 'clipboard',
        in: 'inbox-tray', on: 'up-arrow', under: 'down-arrow', above: 'cloud',
        'next-to': 'left-right-arrow', between: 'balance-scale',
        behind: 'face-with-peeking-eye', 'in-front-of': 'eyes', near: 'round-pushpin',
        upstairs: 'ladder', downstairs: 'down-arrow', outside: 'sun-behind-cloud', and: 'plus', or: 'twisted-rightwards-arrows',
        am: 'blue-circle', is: 'blue-circle', are: 'green-circle',
        'am-not': 'prohibited', isnt: 'prohibited', arent: 'prohibited',
        who: 'bust-in-silhouette', what: 'red-question-mark', where: 'round-pushpin',
        when: 'alarm-clock', why: 'thinking-face', how: 'gear',
        dot: 'black-circle', qmark: 'red-question-mark',
        chair: 'chair', desk: 'icon-park:workbench', lamp: 'light-bulb', bin: 'wastebasket',
        table: 'icon-park:table', sofa: 'couch-and-lamp', cushion: 'tabler:pillow',
        shelf: 'books', mirror: 'mirror', poster: 'framed-picture', picture: 'framed-picture',
        noticeboard: 'pushpin', bed: 'bed', wardrobe: 'streamline-color:closet', door: 'door', window: 'window',
        key: 'key', laptop: 'laptop', tv: 'television', box: 'package', mat: 'ph:rug-duotone',
        floor: 'icon-park:floor-tile', mobile: 'mobile-phone', car: 'automobile', book: 'open-book',
        clock: 'alarm-clock', bag: 'backpack', pen: 'fountain-pen', pencil: 'pencil',
        rubber: 'solar:eraser-bold-duotone', ruler: 'straight-ruler', notebook: 'notebook',
        'pencil-case': 'clutch-bag', crayon: 'crayon', plant: 'potted-plant',
        cup: 'hot-beverage', plate: 'fork-and-knife-with-plate', bottle: 'lotion-bottle',
        hat: 'billed-cap', coat: 'coat', shoe: 'mans-shoe', apple: 'red-apple',
        orange: 'tangerine', banana: 'banana', sandwich: 'sandwich', cake: 'shortcake',
        juice: 'beverage-box', water: 'droplet', cat: 'cat', dog: 'dog', bird: 'bird',
        fish: 'fish', ball: 'basketball', bike: 'bicycle', teddy: 'teddy-bear',
        doll: 'nesting-dolls', computer: 'desktop-computer', pizza: 'pizza',
        'ice-cream': 'ice-cream', football: 'soccer-ball', music: 'musical-notes',
        school: 'school', message: 'envelope', friend: 'people-hugging',
        garden: 'house-with-garden', kitchen: 'cooking', bedroom: 'night-with-stars', bathroom: 'bathtub',
        'living-room': 'couch-and-lamp', balcony: 'bridge-at-night', fridge: 'icon-park:refrigerator', cooker: 'icon-park:oven',
        sink: 'potable-water', towel: 'icon-park:towel', photo: 'camera', ticket: 'ticket',
        tablet: 'mobile-phone', headphone: 'headphone', charger: 'electric-plug',
        umbrella: 'umbrella', scooter: 'kick-scooter', guitar: 'guitar',
        magazine: 'newspaper', dictionary: 'blue-book', map: 'world-map',
        uniform: 'necktie', jumper: 'icon-park:sweater', trainer: 'running-shoe', homework: 'memo',
        swim: 'person-swimming', run: 'person-running', jump: 'person-cartwheeling', draw: 'crayon',
        sing: 'microphone', ride: 'person-biking', play: 'video-game', read: 'open-book',
        write: 'writing-hand', dance: 'woman-dancing', walk: 'person-walking',
        eat: 'fork-and-knife', cook: 'cooking', help: 'handshake', tidy: 'broom',
        listen: 'ear', clean: 'sparkles', wash: 'soap', wait: 'hourglass-not-done',
        study: 'books', practise: 'bullseye', start: 'play-button', finish: 'chequered-flag',
        speak: 'speaking-head', watch: 'eyes', wear: 't-shirt', make: 'hammer-and-wrench',
        buy: 'shopping-cart', open: 'open-file-folder', close: 'locked', sleep: 'sleeping-face',
        sit: 'seat', stand: 'person-standing', share: 'open-hands', visit: 'house', brush: 'toothbrush',
        // Expanded lexicon — each slug unique vs existing values above
        mug: 'cup-with-straw', bowl: 'bowl-with-spoon', spoon: 'spoon', glass: 'tumbler-glass',
        sock: 'socks', glove: 'gloves', scarf: 'icon-park:scarf', skirt: 'icon-park:skirt',
        't-shirt': 'mdi:tshirt-crew', radio: 'radio', candle: 'candle',
        pillow: 'noto:pillow', blanket: 'mdi:blanket', toy: 'yo-yo', puzzle: 'jigsaw',
        postcard: 'incoming-envelope', flower: 'tulip', leaf: 'fallen-leaf',
        bus: 'bus', train: 'locomotive', boat: 'sailboat',
        rabbit: 'rabbit', mouse: 'mouse', duck: 'duck',
        egg: 'egg', cheese: 'cheese-wedge', bread: 'bread',
        milk: 'glass-of-milk', tea: 'teapot', biscuit: 'cookie',
        grape: 'grapes', pear: 'pear', tomato: 'tomato', carrot: 'carrot',
        sticker: 'label', glue: 'mdi:glue', sharpener: 'mdi:pencil-sharpener',
        cupboard: 'file-cabinet', drawer: 'card-file-box', rug: 'mdi:rug',
        wall: 'brick', park: 'national-park', stairs: 'icon-park:stairs',
        whiteboard: 'mdi:whiteboard', camera: 'camera-with-flash', stamp: 'noto:stamp',
        climb: 'person-climbing', throw: 'flying-disc', catch: 'softball',
        kick: 'footprints', paint: 'artist-palette', colour: 'rainbow',
        clap: 'clapping-hands', shout: 'megaphone', whisper: 'shushing-face',
        carry: 'luggage', push: 'rightwards-pushing-hand', pull: 'leftwards-pushing-hand',
        drink: 'tropical-drink', smile: 'grinning-face', laugh: 'face-with-tears-of-joy',
        cry: 'crying-face', pack: 'suitcase', ask: 'thinking-face'
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
            number: ''
        }, extra || {});
    }

    const TILES = [
        tile('there-is', 'There is', 'struct', 'is', { fa: 'fa-circle', gloss: '1 thing', glossPl: '1 rzecz', goals: ['is'] }),
        tile('there-are', 'There are', 'struct', 'are', { fa: 'fa-ellipsis', gloss: 'many', glossPl: 'wiele', goals: ['are'] }),
        tile('is-there', 'Is there', 'struct', 'is', { fa: 'fa-circle-question', gloss: 'ask · 1', glossPl: 'pytanie · 1', goals: ['is'], speak: 'Is there' }),
        tile('are-there', 'Are there', 'struct', 'are', { fa: 'fa-circle-question', gloss: 'ask · many', glossPl: 'pytanie · wiele', goals: ['are'], speak: 'Are there' }),
        tile('there-isnt', "There isn't", 'struct', 'is', { fa: 'fa-circle-xmark', gloss: 'not 1', glossPl: 'nie ma 1', goals: ['is'] }),
        tile('there-arent', "There aren't", 'struct', 'are', { fa: 'fa-circle-xmark', gloss: 'not many', glossPl: 'nie ma wielu', goals: ['are'] }),

        tile('i', 'I', 'subj', 'subj', { fa: 'fa-user', gloss: 'me', glossPl: 'ja', icon: '👤', goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('you', 'You', 'subj', 'subj', { fa: 'fa-hand-point-right', gloss: 'you', glossPl: 'ty / wy', icon: '👉', goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('he', 'He', 'subj', 'subj', { fa: 'fa-child', gloss: 'a boy', glossPl: 'on', icon: '👦', goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('she', 'She', 'subj', 'subj', { fa: 'fa-child-dress', gloss: 'a girl', glossPl: 'ona', icon: '👧', goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('we', 'We', 'subj', 'subj', { fa: 'fa-users', gloss: 'we', glossPl: 'my', icon: '👥', goals: ['have', 'can', 'like', 'must', 'haveto'] }),
        tile('they', 'They', 'subj', 'subj', { fa: 'fa-people-group', gloss: 'they', glossPl: 'oni / one', icon: '🧑‍🤝‍🧑', goals: ['have', 'can', 'like', 'must', 'haveto'] }),

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

        tile('can', 'can', 'modal', 'can', { fa: 'fa-hand-fist', gloss: 'able to', glossPl: 'potrafię', icon: '💪', goals: ['can'] }),
        tile('cant', "can't", 'modal', 'can', { fa: 'fa-hand-fist', gloss: 'not able', glossPl: 'nie potrafię', icon: '🚫', goals: ['can'] }),
        tile('like', 'like', 'verbp', 'like', { fa: 'fa-heart', gloss: 'enjoy', glossPl: 'lubię', icon: '❤️', goals: ['like'] }),
        tile('dont', "don't", 'neg', 'neg', { fa: 'fa-ban', gloss: 'not', glossPl: 'nie', icon: '🚫', goals: ['like', 'haveto'] }),

        tile('must', 'must', 'modal', 'must', { fa: 'fa-exclamation', gloss: 'necessary', glossPl: 'muszę', icon: '❗', goals: ['must'], ages: ['older'] }),
        tile('have-to', 'have to', 'modal', 'must', { fa: 'fa-clipboard-list', gloss: 'it is necessary', glossPl: 'muszę / musimy', icon: '📋', goals: ['haveto'], ages: ['older'] }),

        tile('in', 'in', 'prep', 'prep', { fa: 'fa-box', gloss: 'inside', glossPl: 'w środku', icon: '📥', goals: ['is', 'are'] }),
        tile('on', 'on', 'prep', 'prep', { fa: 'fa-arrow-up', gloss: 'touching the top', glossPl: 'na (dotyka)', pic: 'on', goals: ['is', 'are'] }),
        tile('under', 'under', 'prep', 'prep', { fa: 'fa-arrow-down', gloss: 'below', glossPl: 'pod', pic: 'under', goals: ['is', 'are'] }),
        tile('above', 'above', 'prep', 'prep', { fa: 'fa-cloud', gloss: 'over, not touching', glossPl: 'nad (nie dotyka)', icon: '☁️', goals: ['is', 'are'] }),
        tile('next-to', 'next to', 'prep', 'prep', { fa: 'fa-arrows-left-right', gloss: 'beside', glossPl: 'obok', icon: '↔️', goals: ['is', 'are'] }),
        tile('between', 'between', 'prep', 'prep', { fa: 'fa-grip', gloss: 'in the middle', glossPl: 'pomiędzy', pic: 'between', goals: ['is', 'are'], ages: ['older'] }),
        tile('behind', 'behind', 'prep', 'prep', { fa: 'fa-user-secret', gloss: 'at the back', glossPl: 'za', icon: '🫣', goals: ['is', 'are'] }),
        tile('in-front-of', 'in front of', 'prep', 'prep', { fa: 'fa-eye', gloss: 'at the front', glossPl: 'przed', icon: '👀', goals: ['is', 'are'] }),
        tile('near', 'near', 'prep', 'prep', { fa: 'fa-location-dot', gloss: 'close', glossPl: 'blisko', icon: '📍', goals: ['is', 'are'] }),
        tile('upstairs', 'upstairs', 'prep', 'prep', { fa: 'fa-stairs', gloss: 'up', glossPl: 'na górze', icon: '🪜', adverb: true, goals: ['is', 'are'], ages: ['older'] }),
        tile('downstairs', 'downstairs', 'prep', 'prep', { fa: 'fa-stairs', gloss: 'down', glossPl: 'na dole', icon: '⬇️', adverb: true, goals: ['is', 'are'], ages: ['older'] }),
        tile('outside', 'outside', 'prep', 'prep', { fa: 'fa-tree', gloss: 'not in the house', glossPl: 'na dworze', icon: '🌤️', adverb: true, goals: ['is', 'are'] }),
        tile('and', 'and', 'link', 'art', { fa: 'fa-plus', gloss: 'plus', glossPl: 'i', wordPl: 'i', goals: null }),
        tile('or', 'or', 'link', 'art', { fa: 'fa-code-branch', gloss: 'choice', glossPl: 'lub', wordPl: 'lub', goals: null }),

        tile('am', 'am', 'be', 'be', { fa: 'fa-equals', gloss: 'I + am', glossPl: 'ja + am', wordPl: 'jestem', goals: null }),
        tile('is', 'is', 'be', 'be', { fa: 'fa-equals', gloss: 'he / she / it', glossPl: 'on / ona / to', wordPl: 'jest', goals: null }),
        tile('are', 'are', 'be', 'be', { fa: 'fa-equals', gloss: 'you / we / they', glossPl: 'ty / my / oni', wordPl: 'są / jesteś', goals: null }),
        tile('am-not', "am not", 'be', 'be', { fa: 'fa-ban', gloss: 'I · no', glossPl: 'ja · nie', wordPl: 'nie jestem', goals: null }),
        tile('isnt', "isn't", 'be', 'be', { fa: 'fa-ban', gloss: 'he / she · no', glossPl: 'on / ona · nie', wordPl: 'nie jest', goals: null }),
        tile('arent', "aren't", 'be', 'be', { fa: 'fa-ban', gloss: 'you / we / they · no', glossPl: 'ty / my / oni · nie', wordPl: 'nie są', goals: null }),

        tile('who', 'Who', 'wh', 'wh', { fa: 'fa-user', gloss: 'which person', glossPl: 'kto', wordPl: 'Kto', goals: null }),
        tile('what', 'What', 'wh', 'wh', { fa: 'fa-cube', gloss: 'which thing', glossPl: 'co', wordPl: 'Co', goals: null }),
        tile('where', 'Where', 'wh', 'wh', { fa: 'fa-location-dot', gloss: 'which place', glossPl: 'gdzie', wordPl: 'Gdzie', goals: null }),
        tile('when', 'When', 'wh', 'wh', { fa: 'fa-clock', gloss: 'which time', glossPl: 'kiedy', wordPl: 'Kiedy', goals: null, ages: ['older'] }),
        tile('why', 'Why', 'wh', 'wh', { fa: 'fa-question', gloss: 'reason', glossPl: 'dlaczego', wordPl: 'Dlaczego', goals: null, ages: ['older'] }),
        tile('how', 'How', 'wh', 'wh', { fa: 'fa-gear', gloss: 'in what way', glossPl: 'jak', wordPl: 'Jak', goals: null }),

        tile('dot', '.', 'punct', 'punct', {
            fa: 'fa-circle', gloss: 'statement', glossPl: 'twierdzenie', wordPl: '.',
            speak: '', goals: null, icon: '.'
        }),
        tile('qmark', '?', 'punct', 'punct', {
            fa: 'fa-question', gloss: 'question', glossPl: 'pytanie', wordPl: '?',
            speak: '', goals: null, icon: '?'
        }),

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
        noun('boy', 'boy', 'boys', '👦', false, false, { wordPl: 'chłopiec', goals: ['is', 'are', 'have', 'like'] }),
        noun('girl', 'girl', 'girls', '👧', false, false, { wordPl: 'dziewczynka', goals: ['is', 'are', 'have', 'like'] }),
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

        noun('mug', 'mug', 'mugs', '🥤', false, false, { wordPl: 'kubek' }),
        noun('bowl', 'bowl', 'bowls', '🥣', false, false, { wordPl: 'miska' }),
        noun('spoon', 'spoon', 'spoons', '🥄', false, false, { wordPl: 'łyżka' }),
        noun('glass', 'glass', 'glasses', '🥃', false, false, { wordPl: 'szklanka' }),
        noun('sock', 'sock', 'socks', '🧦', false, false, { wordPl: 'skarpeta' }),
        noun('glove', 'glove', 'gloves', '🧤', false, false, { wordPl: 'rękawiczka' }),
        noun('scarf', 'scarf', 'scarves', '🧣', false, false, { wordPl: 'szalik' }),
        noun('skirt', 'skirt', 'skirts', '', false, false, { ages: ['older'], wordPl: 'spódnica', pic: 'skirt' }),
        noun('t-shirt', 'T-shirt', 'T-shirts', '👕', false, false, { wordPl: 'koszulka' }),
        noun('radio', 'radio', 'radios', '📻', false, false, { ages: ['older'], wordPl: 'radio' }),
        noun('candle', 'candle', 'candles', '🕯️', false, false, { ages: ['older'], wordPl: 'świeca' }),
        noun('pillow', 'pillow', 'pillows', '', false, false, { pic: 'pillow', wordPl: 'poduszka' }),
        noun('blanket', 'blanket', 'blankets', '🛌', false, false, { wordPl: 'koc' }),
        noun('toy', 'toy', 'toys', '🪀', false, false, { wordPl: 'zabawka' }),
        noun('puzzle', 'puzzle', 'puzzles', '🧩', false, false, { wordPl: 'puzzle' }),
        noun('postcard', 'postcard', 'postcards', '📨', false, false, { ages: ['older'], wordPl: 'pocztówka' }),
        noun('flower', 'flower', 'flowers', '🌷', false, false, { wordPl: 'kwiat' }),
        noun('leaf', 'leaf', 'leaves', '🍂', false, false, { wordPl: 'liść' }),
        noun('bus', 'bus', 'buses', '🚌', false, false, { wordPl: 'autobus' }),
        noun('train', 'train', 'trains', '🚂', false, false, { wordPl: 'pociąg' }),
        noun('boat', 'boat', 'boats', '⛵', false, false, { wordPl: 'łódka' }),
        noun('rabbit', 'rabbit', 'rabbits', '🐰', false, false, { wordPl: 'królik' }),
        noun('mouse', 'mouse', 'mice', '🐭', false, false, { wordPl: 'mysz' }),
        noun('duck', 'duck', 'ducks', '🦆', false, false, { wordPl: 'kaczka' }),
        noun('egg', 'egg', 'eggs', '🥚', true, false, { goals: ['like', 'have', 'is', 'are'], wordPl: 'jajko' }),
        noun('cheese', 'cheese', 'cheese', '🧀', false, false, { number: 'unc', goals: ['like', 'have'], wordPl: 'ser' }),
        noun('bread', 'bread', 'bread', '🍞', false, false, { number: 'unc', goals: ['like', 'have'], wordPl: 'chleb' }),
        noun('milk', 'milk', 'milk', '🥛', false, false, { number: 'unc', goals: ['like', 'have'], wordPl: 'mleko' }),
        noun('tea', 'tea', 'tea', '🫖', false, false, { number: 'unc', goals: ['like', 'have'], ages: ['older'], wordPl: 'herbata' }),
        noun('biscuit', 'biscuit', 'biscuits', '🍪', false, false, { goals: ['like', 'have', 'is', 'are'], wordPl: 'ciastko' }),
        noun('grape', 'grape', 'grapes', '🍇', false, false, { goals: ['like', 'have', 'is', 'are'], wordPl: 'winogrono' }),
        noun('pear', 'pear', 'pears', '🍐', false, false, { goals: ['like', 'have', 'is', 'are'], wordPl: 'gruszka' }),
        noun('tomato', 'tomato', 'tomatoes', '🍅', false, false, { goals: ['like', 'have', 'is', 'are'], wordPl: 'pomidor' }),
        noun('carrot', 'carrot', 'carrots', '🥕', false, false, { goals: ['like', 'have', 'is', 'are'], wordPl: 'marchewka' }),
        noun('sticker', 'sticker', 'stickers', '🏷️', false, false, { wordPl: 'naklejka' }),
        noun('glue', 'glue', 'glue', '', false, false, { number: 'unc', goals: ['have', 'must', 'haveto'], ages: ['older'], wordPl: 'klej', pic: 'glue' }),
        noun('sharpener', 'sharpener', 'sharpeners', '', false, false, { ages: ['older'], wordPl: 'temperówka', pic: 'sharpener' }),
        noun('cupboard', 'cupboard', 'cupboards', '🗄️', false, true, { ages: ['older'], wordPl: 'szafka' }),
        noun('drawer', 'drawer', 'drawers', '🗃️', false, true, { ages: ['older'], wordPl: 'szuflada' }),
        noun('rug', 'rug', 'rugs', '', false, true, { wordPl: 'dywanik', pic: 'rug' }),
        noun('wall', 'wall', 'walls', '🧱', false, true, { wordPl: 'ściana' }),
        noun('park', 'park', 'parks', '🏞️', false, true, { ages: ['older'], wordPl: 'park' }),
        noun('stairs', 'stairs', 'stairs', '', false, true, { ages: ['older'], wordPl: 'schody', pic: 'stairs', goals: ['is', 'are'] }),
        noun('whiteboard', 'whiteboard', 'whiteboards', '', false, true, { ages: ['older'], wordPl: 'tablica', pic: 'whiteboard' }),
        noun('camera', 'camera', 'cameras', '📸', false, false, { ages: ['older'], wordPl: 'aparat' }),
        noun('stamp', 'stamp', 'stamps', '', false, false, { ages: ['older'], wordPl: 'znaczek', pic: 'stamp' }),

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
        verb('brush', 'brush', '🪥', ['must', 'haveto'], ['older'], 'szczotkować'),
        verb('climb', 'climb', '🧗', ['can', 'must'], null, 'wspinać się'),
        verb('throw', 'throw', '🥏', ['can'], null, 'rzucać'),
        verb('catch', 'catch', '🥎', ['can'], null, 'łapać'),
        verb('kick', 'kick', '👣', ['can'], null, 'kopać'),
        verb('paint', 'paint', '🎨', ['can', 'like'], null, 'malować'),
        verb('colour', 'colour', '🌈', ['can', 'like'], null, 'kolorować'),
        verb('clap', 'clap', '👏', ['can'], null, 'klaskać'),
        verb('shout', 'shout', '📣', ['can', 'must'], ['older'], 'krzyczeć'),
        verb('whisper', 'whisper', '🤫', ['can', 'must'], ['older'], 'szeptać'),
        verb('carry', 'carry', '🧳', ['can', 'must', 'haveto'], ['older'], 'nieść'),
        verb('push', 'push', '🫸', ['can', 'must'], ['older'], 'pchać'),
        verb('pull', 'pull', '🫷', ['can', 'must'], ['older'], 'ciągnąć'),
        verb('drink', 'drink', '🍹', ['can', 'like', 'must'], null, 'pić'),
        verb('smile', 'smile', '😀', ['can', 'like'], null, 'uśmiechać się'),
        verb('laugh', 'laugh', '😂', ['can', 'like'], null, 'śmiać się'),
        verb('cry', 'cry', '😢', ['can'], null, 'płakać'),
        verb('pack', 'pack', '💼', ['must', 'haveto'], ['older'], 'pakować'),
        verb('ask', 'ask', '🤔', ['can', 'must', 'haveto'], ['older'], 'pytać')
    ];
    expandNounPlurals(TILES);
    assignNounCats(TILES);

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
            dictionary: 'słowniki', map: 'mapy', uniform: 'mundurki', jumper: 'swetry', trainer: 'buty sportowe',
            mug: 'kubki', bowl: 'miski', spoon: 'łyżki', glass: 'szklanki', sock: 'skarpetki',
            glove: 'rękawiczki', scarf: 'szaliki', skirt: 'spódnice', 't-shirt': 'koszulki',
            radio: 'radia', candle: 'świece', pillow: 'poduszki', blanket: 'koce', toy: 'zabawki',
            puzzle: 'puzzle', postcard: 'pocztówki', flower: 'kwiaty', leaf: 'liście',
            bus: 'autobusy', train: 'pociągi', boat: 'łodzie', rabbit: 'króliki', mouse: 'myszy',
            duck: 'kaczki', egg: 'jajka', biscuit: 'ciastka', grape: 'winogrona', pear: 'gruszki',
            tomato: 'pomidory', carrot: 'marchewki', sticker: 'naklejki', sharpener: 'temperówki',
            cupboard: 'szafki', drawer: 'szuflady', rug: 'dywaniki', wall: 'ściany', park: 'parki',
            whiteboard: 'tablice', camera: 'aparaty', stamp: 'znaczki'
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
                sgId: t.id
            }));
        });
        extra.forEach((t) => list.push(t));
    }

    function assignNounCats(list) {
        const map = {
            chair: 'furniture', desk: 'furniture', table: 'furniture', sofa: 'furniture', bed: 'furniture',
            wardrobe: 'furniture', shelf: 'furniture', lamp: 'furniture', bin: 'furniture', cushion: 'furniture',
            mat: 'furniture', cupboard: 'furniture', drawer: 'furniture', rug: 'furniture', pillow: 'furniture',
            blanket: 'furniture',
            door: 'room', window: 'room', floor: 'room', mirror: 'room', poster: 'room', picture: 'room',
            plant: 'room', clock: 'room', noticeboard: 'room', box: 'room', wall: 'room', stairs: 'room',
            whiteboard: 'room', candle: 'room',
            book: 'school', bag: 'school', pen: 'school', pencil: 'school', rubber: 'school', ruler: 'school',
            notebook: 'school', 'pencil-case': 'school', crayon: 'school', school: 'school', dictionary: 'school',
            homework: 'school', map: 'school', sticker: 'school', glue: 'school', sharpener: 'school',
            apple: 'food', orange: 'food', banana: 'food', sandwich: 'food', cake: 'food', pizza: 'food',
            'ice-cream': 'food', juice: 'food', water: 'food', cup: 'food', plate: 'food', bottle: 'food',
            mug: 'food', bowl: 'food', spoon: 'food', glass: 'food', egg: 'food', cheese: 'food',
            bread: 'food', milk: 'food', tea: 'food', biscuit: 'food', grape: 'food', pear: 'food',
            tomato: 'food', carrot: 'food',
            hat: 'clothes', coat: 'clothes', shoe: 'clothes', jumper: 'clothes', trainer: 'clothes', uniform: 'clothes',
            sock: 'clothes', glove: 'clothes', scarf: 'clothes', skirt: 'clothes', 't-shirt': 'clothes',
            ball: 'toys', bike: 'toys', teddy: 'toys', doll: 'toys', football: 'toys', scooter: 'toys',
            guitar: 'toys', music: 'toys', toy: 'toys', puzzle: 'toys',
            cat: 'animals', dog: 'animals', bird: 'animals', fish: 'animals',
            rabbit: 'animals', mouse: 'animals', duck: 'animals',
            laptop: 'tech', tv: 'tech', mobile: 'tech', computer: 'tech', tablet: 'tech', headphone: 'tech',
            charger: 'tech', key: 'tech', radio: 'tech', camera: 'tech',
            garden: 'house', kitchen: 'house', bedroom: 'house', bathroom: 'house', 'living-room': 'house',
            balcony: 'house', fridge: 'house', cooker: 'house', sink: 'house', towel: 'house',
            car: 'other', friend: 'other', boy: 'other', girl: 'other', message: 'other', photo: 'other', ticket: 'other',
            umbrella: 'other', magazine: 'other', bus: 'other', train: 'other', boat: 'other',
            flower: 'other', leaf: 'other', postcard: 'other', stamp: 'other', park: 'other'
        };
        list.forEach((t) => {
            if (t.kind !== 'noun') return;
            t.cat = map[t.sgId || t.id] || 'other';
        });
    }

    function verb(id, text, icon, goals, ages, wordPl) {
        const plWord = wordPl || '';
        return tile(id, text, 'verb', 'verb', {
            fa: 'fa-person-running',
            gloss: 'an action',
            glossPl: plWord || 'czynność',
            wordPl: plWord,
            icon: icon,
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
            en: "don't + have to = it is not necessary.", pl: "don't + have to = nie musimy." },
        { parts: ['There ', { gap: true }, ' a mug on the table.'], options: ['is', 'are', 'has'], answer: 'is', family: 'is',
            en: 'One mug → There is.', pl: 'Jeden kubek → There is.' },
        { parts: ['There ', { gap: true }, ' two rabbits in the garden.'], options: ['is', 'are', 'have'], answer: 'are', family: 'are',
            en: 'More than one → There are.', pl: 'Więcej niż jeden → There are.' },
        { parts: ['There is ', { gap: true }, ' egg in the bowl.'], options: ['a', 'an', 'some'], answer: 'an', family: 'art',
            en: 'egg starts with a vowel sound → an.', pl: 'egg zaczyna się na samogłoskę → an.' },
        { parts: ['There is ', { gap: true }, ' biscuit on the plate.'], options: ['a', 'an', 'any'], answer: 'a', family: 'art',
            en: 'biscuit = consonant sound → a.', pl: 'biscuit = spółgłoska → a.' },
        { parts: ['There are ', { gap: true }, ' flowers next to the window.'], options: ['some', 'any', 'a'], answer: 'some', family: 'are',
            en: 'some in positive plural sentences.', pl: 'some w twierdzeniach w lm.' },
        { parts: ['Are there ', { gap: true }, ' stickers in the drawer? (10–12)'], options: ['some', 'any', 'a'], answer: 'any', family: 'are',
            en: 'any in questions.', pl: 'any w pytaniach.' },
        { parts: ['She ', { gap: true }, ' got a scarf.'], options: ['have', 'has', 'is'], answer: 'has', family: 'have',
            en: 'She → has got.', pl: 'She → has got.' },
        { parts: ['They ', { gap: true }, ' got a puzzle.'], options: ['have', 'has', 'are'], answer: 'have', family: 'have',
            en: 'They → have got.', pl: 'They → have got.' },
        { parts: ['I ', { gap: true }, ' got a toy rabbit.'], options: ['have', 'has', 'can'], answer: 'have', family: 'have',
            en: 'I → have got.', pl: 'I → have got.' },
        { parts: ['We ', { gap: true }, ' climb.'], options: ['can', 'must', 'are'], answer: 'can', family: 'can',
            en: 'can + action.', pl: 'can + czynność.' },
        { parts: ['He ', { gap: true }, ' catch the ball.'], options: ['can', "can't", "don't"], answer: "can't", family: 'can',
            en: "can't = not able to.", pl: "can't = nie potrafi." },
        { parts: ['You ', { gap: true }, ' paint.'], options: ['can', 'must', 'like'], answer: 'can', family: 'can',
            en: 'You can + action.', pl: 'You can + czynność.' },
        { parts: ['I ', { gap: true }, ' biscuits.'], options: ['like', "don't", 'can'], answer: 'like', family: 'like',
            en: 'like + a thing.', pl: 'like + rzecz.' },
        { parts: ['We don’t ', { gap: true }, ' milk.'], options: ['like', 'can', 'must'], answer: 'like', family: 'like',
            en: "don't + like.", pl: "don't + like." },
        { parts: ['They ', { gap: true }, ' grapes.'], options: ['like', "don't", 'are'], answer: 'like', family: 'like',
            en: 'They like + a thing.', pl: 'They like + rzecz.' },
        { parts: ['You ', { gap: true }, ' pack your bag. (10–12)'], options: ['must', 'can', 'like'], answer: 'must', family: 'must',
            en: 'must = it is necessary.', pl: 'must = musisz.' },
        { parts: ['I ', { gap: true }, ' ask the teacher. (10–12)'], options: ['have to', 'can', 'like'], answer: 'have to', family: 'must',
            en: 'have to = it is necessary.', pl: 'have to = muszę.' },
        { parts: ["We don't ", { gap: true }, ' shout in class. (10–12)'], options: ['have to', 'must', 'can'], answer: 'have to', family: 'must',
            en: "don't + have to = not necessary.", pl: "don't + have to = nie musimy." }
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
            en: 'Positive plural → some.', pl: 'Twierdzenie w lm. → some.' },
        { q: 'Choose the correct sentence.', qPl: 'Wybierz poprawne zdanie.', family: 'is',
            options: ['There is a flower on the rug.', 'There are a flower on the rug.', 'There is flowers on the rug.'], answer: 0,
            en: 'One flower → There is + a.', pl: 'Jeden kwiat → There is + a.' },
        { q: 'Choose the correct article.', qPl: 'Wybierz poprawny rodzajnik.', family: 'art',
            options: ['There is a egg in the bowl.', 'There is an egg in the bowl.', 'There is egg in the bowl.'], answer: 1,
            en: 'egg = vowel sound → an.', pl: 'egg = samogłoska → an.' },
        { q: 'Choose the correct sentence.', qPl: 'Wybierz poprawne zdanie.', family: 'have',
            options: ['He have got a stamp.', 'He has got a stamp.', 'He is got a stamp.'], answer: 1,
            en: 'He → has got.', pl: 'He → has got.' },
        { q: 'Choose the correct sentence.', qPl: 'Wybierz poprawne zdanie.', family: 'have',
            options: ['You has got a camera.', 'You have got a camera.', 'You are got a camera.'], answer: 1,
            en: 'You → have got.', pl: 'You → have got.' },
        { q: 'Choose the correct sentence.', qPl: 'Wybierz poprawne zdanie.', family: 'can',
            options: ['I can throw.', 'I can throwing.', 'I throwing can.'], answer: 0,
            en: 'can + action word.', pl: 'can + czasownik.' },
        { q: 'Choose the correct sentence.', qPl: 'Wybierz poprawne zdanie.', family: 'can',
            options: ['She can clap.', 'She cans clap.', 'She can clapping.'], answer: 0,
            en: 'She takes can (no -s on can).', pl: 'She bierze can (bez -s).' },
        { q: 'Choose the negative.', qPl: 'Wybierz przeczenie.', family: 'like',
            options: ['We like tea.', "We don't like tea.", 'We like don\'t tea.'], answer: 1,
            en: "don't is its own tile, then like.", pl: "don't to osobny kafel, potem like." },
        { q: 'Choose the correct sentence. (10–12)', qPl: 'Wybierz poprawne zdanie. (10–12)', family: 'must',
            options: ['You must to pack.', 'You must pack.', 'You must packing.'], answer: 1,
            en: 'must + action (no to).', pl: 'must + czasownik (bez to).' },
        { q: 'Choose the correct sentence. (10–12)', qPl: 'Wybierz poprawne zdanie. (10–12)', family: 'must',
            options: ["They don't must ask.", "They don't have to ask.", 'They must not have to ask.'], answer: 1,
            en: "don't + have to = not necessary.", pl: "don't + have to = nie trzeba." },
        { q: 'Choose the correct sentence.', qPl: 'Wybierz poprawne zdanie.', family: 'are',
            options: ['There are some carrots in the bowl.', 'There is some carrots in the bowl.', 'There are any carrots in the bowl.'], answer: 0,
            en: 'Positive plural → There are + some.', pl: 'Twierdzenie w lm. → There are + some.' }
    ];

    const TEXT_REORDER = [
        { words: ['There is', 'a', 'lamp', 'above', 'the', 'desk'], family: 'is' },
        { words: ['There are', 'two', 'cushions', 'next to', 'the', 'sofa'], family: 'are' },
        { words: ['I', 'have got', 'a', 'mobile'], family: 'have' },
        { words: ['She', 'has got', 'an', 'apple'], family: 'have' },
        { words: ['We', 'have got', 'a', 'laptop'], family: 'have' },
        { words: ['You', 'have got', 'a', 'key'], family: 'have' },
        { words: ['They', 'have got', 'a', 'mobile'], family: 'have' },
        { words: ['Is there', 'a', 'message', 'on', 'the', 'desk'], family: 'is', extra: '?' },
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
        { words: ['There aren\'t', 'any', 'chairs', 'outside'], family: 'are' },
        { words: ['There is', 'a', 'mug', 'on', 'the', 'table'], family: 'is' },
        { words: ['There are', 'two', 'rabbits', 'in', 'the', 'garden'], family: 'are' },
        { words: ['There is', 'an', 'egg', 'in', 'the', 'bowl'], family: 'art' },
        { words: ['There is', 'a', 'flower', 'on', 'the', 'rug'], family: 'is' },
        { words: ['I', 'have got', 'a', 'scarf'], family: 'have' },
        { words: ['She', 'has got', 'a', 'stamp'], family: 'have' },
        { words: ['We', 'have got', 'a', 'puzzle'], family: 'have' },
        { words: ['They', 'have got', 'a', 'toy'], family: 'have' },
        { words: ['You', 'have got', 'a', 'camera'], family: 'have' },
        { words: ['I', 'can', 'climb'], family: 'can' },
        { words: ['He', "can't", 'catch'], family: 'can' },
        { words: ['You', 'can', 'paint'], family: 'can' },
        { words: ['They', 'can', 'clap'], family: 'can' },
        { words: ['I', 'like', 'biscuits'], family: 'like' },
        { words: ['I', "don't", 'like', 'milk'], family: 'like' },
        { words: ['We', 'like', 'grapes'], family: 'like' },
        { words: ['They', "don't", 'like', 'tea'], family: 'like' },
        { words: ['You', 'must', 'pack'], family: 'must' },
        { words: ['I', 'have to', 'ask'], family: 'must' },
        { words: ['We', "don't", 'have to', 'shout'], family: 'must' },
        { words: ['Is there', 'a', 'postcard', 'in', 'the', 'drawer'], family: 'is', extra: '?' },
        { words: ['Are there', 'any', 'stickers', 'on', 'the', 'whiteboard'], family: 'are', extra: '?' },
        { words: ['There aren\'t', 'any', 'buses', 'near', 'the', 'park'], family: 'are' }
    ];

    /** Drag tiles into gaps — ids = full sentence tile ids; gaps = blank indices; distractors = wrong bank tiles. */
    const FILL_TASKS = [
        // to be
        { ids: ['i', 'am', 'a', 'girl', 'dot'], gaps: [1], distractors: ['is', 'are', 'qmark'], family: 'be' },
        { ids: ['he', 'is', 'a', 'boy', 'dot'], gaps: [1], distractors: ['am', 'are', 'qmark'], family: 'be' },
        { ids: ['they', 'are', 'friend-pl', 'dot'], gaps: [1], distractors: ['am', 'is', 'qmark'], family: 'be' },
        { ids: ['she', 'isnt', 'a', 'cat', 'dot'], gaps: [1], distractors: ['am-not', 'arent', 'is'], family: 'be' },
        { ids: ['you', 'arent', 'a', 'dog', 'dot'], gaps: [1], distractors: ['am-not', 'isnt', 'are'], family: 'be' },
        { ids: ['i', 'am-not', 'a', 'bird', 'dot'], gaps: [1], distractors: ['isnt', 'arent', 'qmark'], family: 'be' },
        { ids: ['we', 'are', 'friend-pl', 'dot'], gaps: [1], distractors: ['am', 'is', 'qmark'], family: 'be' },
        // Wh-
        { ids: ['where', 'is', 'the', 'bag', 'qmark'], gaps: [0], distractors: ['who', 'what', 'dot'], family: 'wh' },
        { ids: ['what', 'is', 'on', 'the', 'table', 'qmark'], gaps: [0, 5], distractors: ['who', 'where', 'dot', 'are'], family: 'wh' },
        { ids: ['who', 'are', 'you', 'qmark'], gaps: [0, 3], distractors: ['what', 'where', 'dot', 'is'], family: 'wh' },
        { ids: ['how', 'are', 'you', 'qmark'], gaps: [0], distractors: ['who', 'what', 'dot'], family: 'wh' },
        { ids: ['where', 'are', 'the', 'book-pl', 'qmark'], gaps: [1], distractors: ['is', 'am', 'dot'], family: 'wh' },
        { ids: ['when', 'is', 'the', 'train', 'qmark'], gaps: [0], distractors: ['who', 'what', 'dot'], family: 'wh', ages: ['older'] },
        { ids: ['why', 'is', 'the', 'bag', 'on', 'the', 'floor', 'qmark'], gaps: [0], distractors: ['who', 'where', 'dot'], family: 'wh', ages: ['older'] },
        // and / or
        { ids: ['i', 'like', 'pizza', 'and', 'cake', 'dot'], gaps: [3], distractors: ['or', 'qmark', 'is'], family: 'art' },
        { ids: ['i', 'like', 'tea', 'or', 'milk', 'dot'], gaps: [3], distractors: ['and', 'qmark', 'is'], family: 'art' },
        { ids: ['they', 'like', 'apple-pl', 'and', 'grape-pl', 'dot'], gaps: [3], distractors: ['or', 'qmark', 'is'], family: 'like' },
        // There is / are + prep + furniture / room
        { ids: ['there-is', 'a', 'lamp', 'on', 'the', 'desk', 'dot'], gaps: [6], distractors: ['qmark', 'are', 'and'], family: 'is' },
        { ids: ['there-is', 'a', 'lamp', 'on', 'the', 'desk', 'dot'], gaps: [3], distractors: ['under', 'in', 'qmark'], family: 'prep' },
        { ids: ['there-are', 'two', 'cushion-pl', 'next-to', 'the', 'sofa', 'dot'], gaps: [3], distractors: ['on', 'under', 'in'], family: 'prep' },
        { ids: ['there-is', 'a', 'cat', 'under', 'the', 'table', 'dot'], gaps: [3], distractors: ['on', 'in', 'above'], family: 'prep' },
        { ids: ['there-is', 'a', 'poster', 'above', 'the', 'bed', 'dot'], gaps: [3], distractors: ['under', 'in', 'next-to'], family: 'prep' },
        { ids: ['there-is', 'a', 'plant', 'near', 'the', 'window', 'dot'], gaps: [3], distractors: ['under', 'between', 'qmark'], family: 'prep' },
        { ids: ['there-is', 'a', 'bin', 'behind', 'the', 'door', 'dot'], gaps: [3], distractors: ['in-front-of', 'on', 'under'], family: 'prep' },
        { ids: ['there-is', 'a', 'mat', 'in-front-of', 'the', 'wardrobe', 'dot'], gaps: [3], distractors: ['behind', 'on', 'under'], family: 'prep', ages: ['older'] },
        { ids: ['there-are', 'book-pl', 'between', 'the', 'lamp', 'and', 'the', 'clock', 'dot'], gaps: [2], distractors: ['next-to', 'on', 'under'], family: 'prep', ages: ['older'] },
        { ids: ['is-there', 'a', 'cat', 'on', 'the', 'sofa', 'qmark'], gaps: [6], distractors: ['dot', 'are', 'and'], family: 'is' },
        { ids: ['are-there', 'any', 'chair-pl', 'in', 'the', 'garden', 'qmark'], gaps: [1], distractors: ['some', 'a', 'dot'], family: 'are', ages: ['older'] },
        { ids: ['there-are', 'some', 'picture-pl', 'on', 'the', 'wall', 'dot'], gaps: [1], distractors: ['any', 'a', 'qmark'], family: 'are' },
        { ids: ['there-arent', 'any', 'pen-pl', 'in', 'the', 'bag', 'dot'], gaps: [1], distractors: ['some', 'a', 'the'], family: 'are' },
        { ids: ['there-is', 'an', 'apple', 'on', 'the', 'plate', 'dot'], gaps: [1], distractors: ['a', 'some', 'any'], family: 'art' },
        { ids: ['there-is', 'a', 'biscuit', 'on', 'the', 'plate', 'dot'], gaps: [1], distractors: ['an', 'some', 'any'], family: 'art' },
        // food
        { ids: ['i', 'like', 'pizza', 'dot'], gaps: [2], distractors: ['milk', 'water', 'qmark'], family: 'like' },
        { ids: ['i', 'dont', 'like', 'milk', 'dot'], gaps: [3], distractors: ['pizza', 'cake', 'swim'], family: 'like' },
        { ids: ['they', 'like', 'grape-pl', 'dot'], gaps: [2], distractors: ['tea', 'water', 'qmark'], family: 'like' },
        { ids: ['we', 'like', 'sandwich-pl', 'and', 'juice', 'dot'], gaps: [2], distractors: ['swim', 'run', 'qmark'], family: 'like' },
        // have got + tech / toys / clothes
        { ids: ['she', 'has-got', 'a', 'key', 'dot'], gaps: [1], distractors: ['have-got', 'is', 'qmark'], family: 'have' },
        { ids: ['i', 'have-got', 'a', 'mobile', 'dot'], gaps: [3], distractors: ['laptop', 'bag', 'qmark'], family: 'have' },
        { ids: ['he', 'has-got', 'a', 'bike', 'dot'], gaps: [3], distractors: ['ball', 'teddy', 'qmark'], family: 'have' },
        { ids: ['we', 'have-got', 'a', 'dog', 'and', 'a', 'cat', 'dot'], gaps: [4], distractors: ['or', 'qmark', 'is'], family: 'have' },
        { ids: ['you', 'have-got', 'a', 'hat', 'dot'], gaps: [3], distractors: ['coat', 'shoe', 'qmark'], family: 'have' },
        { ids: ['they', 'havent-got', 'a', 'tablet', 'dot'], gaps: [1], distractors: ['hasnt-got', 'have-got', 'is'], family: 'have', ages: ['older'] },
        { ids: ['she', 'hasnt-got', 'a', 'scarf', 'dot'], gaps: [1], distractors: ['havent-got', 'has-got', 'are'], family: 'have' },
        // school
        { ids: ['there-is', 'a', 'pencil', 'in', 'the', 'pencil-case', 'dot'], gaps: [2], distractors: ['pen', 'ruler', 'rubber'], family: 'is' },
        { ids: ['there-are', 'two', 'book-pl', 'on', 'the', 'desk', 'dot'], gaps: [1], distractors: ['one', 'three', 'some'], family: 'are' },
        { ids: ['i', 'have-got', 'a', 'ruler', 'and', 'a', 'rubber', 'dot'], gaps: [3], distractors: ['crayon', 'glue', 'qmark'], family: 'have' },
        // animals
        { ids: ['there-is', 'a', 'rabbit', 'in', 'the', 'garden', 'dot'], gaps: [2], distractors: ['duck', 'mouse', 'dog'], family: 'is', ages: ['older'] },
        { ids: ['there-are', 'two', 'duck-pl', 'near', 'the', 'park', 'dot'], gaps: [2], distractors: ['cat-pl', 'bird-pl', 'qmark'], family: 'are', ages: ['older'] },
        // house
        { ids: ['there-is', 'a', 'fridge', 'in', 'the', 'kitchen', 'dot'], gaps: [5], distractors: ['bedroom', 'bathroom', 'garden'], family: 'is', ages: ['older'] },
        { ids: ['there-is', 'a', 'bed', 'in', 'the', 'bedroom', 'dot'], gaps: [5], distractors: ['kitchen', 'bathroom', 'balcony'], family: 'is', ages: ['older'] },
        { ids: ['there-is', 'a', 'towel', 'in', 'the', 'bathroom', 'dot'], gaps: [2], distractors: ['sink', 'mirror', 'qmark'], family: 'is', ages: ['older'] },
        // can + verbs
        { ids: ['i', 'can', 'swim', 'dot'], gaps: [3], distractors: ['qmark', 'and', 'or'], family: 'can' },
        { ids: ['i', 'can', 'swim', 'dot'], gaps: [2], distractors: ['run', 'jump', 'draw'], family: 'can' },
        { ids: ['he', 'cant', 'ride', 'a', 'bike', 'dot'], gaps: [1], distractors: ['can', 'dont', 'must'], family: 'can' },
        { ids: ['she', 'can', 'dance', 'dot'], gaps: [2], distractors: ['sing', 'read', 'paint'], family: 'can' },
        { ids: ['we', 'can', 'climb', 'dot'], gaps: [2], distractors: ['throw', 'catch', 'kick'], family: 'can' },
        { ids: ['can', 'you', 'swim', 'qmark'], gaps: [3], distractors: ['dot', 'and', 'must'], family: 'can', ages: ['older'] },
        { ids: ['they', 'can', 'clap', 'and', 'smile', 'dot'], gaps: [3], distractors: ['or', 'qmark', 'dont'], family: 'can' },
        // like + food/toys
        { ids: ['i', 'like', 'football', 'dot'], gaps: [1], distractors: ['dont', 'can', 'must'], family: 'like' },
        { ids: ['you', 'dont', 'like', 'tea', 'dot'], gaps: [1], distractors: ['like', 'can', 'must'], family: 'like' },
        // must / have to (older)
        { ids: ['you', 'must', 'listen', 'dot'], gaps: [1], distractors: ['can', 'like', 'dont'], family: 'must', ages: ['older'] },
        { ids: ['we', 'have-to', 'tidy', 'dot'], gaps: [1], distractors: ['must', 'can', 'like'], family: 'must', ages: ['older'] },
        { ids: ['they', 'dont', 'have-to', 'shout', 'dot'], gaps: [2], distractors: ['must', 'can', 'like'], family: 'must', ages: ['older'] },
        { ids: ['i', 'must', 'pack', 'dot'], gaps: [2], distractors: ['ask', 'wait', 'study'], family: 'must', ages: ['older'] },
        // clothes
        { ids: ['she', 'has-got', 'a', 'coat', 'and', 'a', 'hat', 'dot'], gaps: [3], distractors: ['shoe', 'sock', 'glove'], family: 'have' },
        { ids: ['he', 'has-got', 'a', 't-shirt', 'dot'], gaps: [3], distractors: ['jumper', 'skirt', 'qmark'], family: 'have', ages: ['older'] },
        // tech
        { ids: ['i', 'have-got', 'a', 'laptop', 'dot'], gaps: [3], distractors: ['tablet', 'camera', 'radio'], family: 'have', ages: ['older'] },
        { ids: ['there-is', 'a', 'charger', 'on', 'the', 'shelf', 'dot'], gaps: [2], distractors: ['headphone', 'mobile', 'key'], family: 'is', ages: ['older'] },
        // numbers
        { ids: ['there-are', 'three', 'pen-pl', 'in', 'the', 'bag', 'dot'], gaps: [1], distractors: ['one', 'two', 'some'], family: 'are', ages: ['older'] },
        { ids: ['there-is', 'one', 'clock', 'on', 'the', 'wall', 'dot'], gaps: [1], distractors: ['two', 'three', 'some'], family: 'is', ages: ['older'] },
        // punct + mix
        { ids: ['is-there', 'a', 'message', 'on', 'the', 'desk', 'qmark'], gaps: [0], distractors: ['there-is', 'there-are', 'dot'], family: 'is' },
        { ids: ['there-is', 'a', 'flower', 'on', 'the', 'rug', 'dot'], gaps: [2], distractors: ['leaf', 'plant', 'sticker'], family: 'is' },
        { ids: ['i', 'can', 'paint', 'or', 'draw', 'dot'], gaps: [3], distractors: ['and', 'qmark', 'dont'], family: 'can' },
        { ids: ['where', 'is', 'the', 'umbrella', 'qmark'], gaps: [3], distractors: ['bag', 'coat', 'ticket'], family: 'wh', ages: ['older'] }
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
.cb-slot {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 5.6rem; min-height: 3.55rem; max-width: 8.4rem; padding: 0.45rem 0.5rem;
    border-radius: 12px; border: 3px dashed rgba(15, 23, 42, 0.16);
    background: transparent; cursor: pointer; flex: 0 0 auto;
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.cb-slot:hover { border-color: rgba(15, 23, 42, 0.32); }
.cb-slot.hinted {
    border-style: solid;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}
.cb-slot.selected {
    border-color: var(--royal-blue);
    box-shadow: 0 0 0 2px rgba(1, 33, 105, 0.22);
}
.cb-slot.droppable {
    border-color: var(--royal-blue);
    border-style: dashed;
    background: rgba(1, 33, 105, 0.06);
}
.cb-card.moving { outline: 3px solid var(--royal-blue); outline-offset: 2px; }
.cb-holding {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;
    margin: 0 0 0.65rem; padding: 0.45rem 0.55rem;
    border-radius: 12px; border: 2px dashed var(--royal-blue); background: #eff6ff;
    font-family: var(--font-secondary); font-size: 0.9rem; color: var(--royal-blue);
}
.cb-holding .cb-card { cursor: pointer; }
.cb-actions-top { margin: 0.15rem 0 0.85rem; }
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
.cb-card .cb-ico { width: 2rem; height: 2rem; }
.cb-ico {
    width: 1.7em; height: 1.7em; object-fit: contain; display: block;
    pointer-events: none; flex-shrink: 0;
}
.cb-picture .cb-ico { width: 2.85rem; height: 2.85rem; }
.cb-card .gloss { font-family: var(--font-secondary); font-weight: 400; font-size: 0.68rem; color: var(--text-muted); text-align: center; }
.cb-card .gloss.plhint { color: #0f766e; font-weight: 700; }
.cb-card .cb-1plus {
    font-family: var(--font-primary); font-weight: 700; font-size: 0.62rem;
    color: #0f766e; background: #ccfbf1; border-radius: 999px; padding: 0.05rem 0.4rem; margin-top: 0.05rem;
}
.cb-card.in-chain { cursor: grab; touch-action: none; }
.cb-card.in-chain.dragging { opacity: 0.45; cursor: grabbing; transform: scale(1.05); z-index: 2; }
.cb-chain.sorting { border-color: var(--royal-blue); background: #eff6ff; }
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
.cb-fill-line {
    display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; justify-content: center;
    min-height: 5.2rem; border: 3px dashed #cbd5e1; border-radius: 14px; padding: 0.65rem;
    background: #f8fafc; margin-bottom: 0.85rem;
}
.cb-fill-line.sorting { border-color: var(--royal-blue); background: #eff6ff; }
.cb-fill-fixed { cursor: default; pointer-events: none; opacity: 0.92; }
.cb-fill-slot {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 5.6rem; min-height: 3.55rem; max-width: 8.4rem; padding: 0.45rem 0.5rem;
    border-radius: 12px; border: 3px dashed rgba(15, 23, 42, 0.22);
    background: transparent; cursor: pointer; flex: 0 0 auto;
}
.cb-fill-slot.droppable {
    border-color: var(--royal-blue); border-style: dashed; background: rgba(1, 33, 105, 0.06);
}
.cb-fill-slot.selected { border-color: var(--royal-blue); box-shadow: 0 0 0 2px rgba(1, 33, 105, 0.22); }
.cb-fill-bank { margin-top: 0.35rem; }
.cb-fill-bank h3 {
    font-family: var(--font-primary); font-size: 0.95rem; color: var(--royal-blue);
    margin: 0 0 0.45rem;
}
.cb-card.fill-bank { cursor: grab; touch-action: none; }
.cb-card.fill-bank.used { opacity: 0.32; pointer-events: none; cursor: default; }
.cb-card.fill-bank.dragging, .cb-card.fill-placed.dragging { opacity: 0.45; cursor: grabbing; transform: scale(1.05); z-index: 2; }
.cb-card.fill-placed { cursor: grab; touch-action: none; }
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
`;

    let S = null;
    let chainSkipClick = false;

    function byId(id) { return TILES.find((t) => t.id === id); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function L(en, pl) {
        return (S && S.polish) ? (pl || en || '') : (en || '');
    }

    function packName(t) {
        if (!t) return '';
        return PACK_ICONS[t.id] || PACK_ICONS[t.sgId] || '';
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
        return '<img class="cb-ico" src="' + ICONIFY + encodeURIComponent(prefix) + '/' + encodeURIComponent(icon) + '.svg" alt="" draggable="false">';
    }

    function icoHtml(t) {
        if (!t) return '';
        if (typeof t === 'string') return packHtml(PACK_ICONS[t] || t) || '';
        const name = packName(t);
        if (name) return packHtml(name);
        if (t.icon) return '<span class="ico" aria-hidden="true">' + t.icon + '</span>';
        return '<span class="ico" aria-hidden="true"><i class="fa-solid ' + (t.fa || 'fa-cube') + '"></i></span>';
    }

    function pictureMark(p) {
        if (!p) return '';
        if (typeof p === 'object') return icoHtml(p);
        return icoHtml(p);
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

    function useSlots() {
        return !!(S && S.buildPrompt && S.buildPrompt.ids && S.buildPrompt.ids.length && S.tab === 'build');
    }

    function ensureSlots() {
        if (!useSlots()) return false;
        const n = S.buildPrompt.ids.length;
        if (!Array.isArray(S.slots) || S.slots.length !== n) {
            S.slots = [];
            for (let i = 0; i < n; i++) S.slots.push(null);
        }
        return true;
    }

    function currentBuildIds() {
        if (useSlots()) {
            ensureSlots();
            return (S.slots || []).slice();
        }
        return (S.chain || []).slice();
    }

    function currentBuildTiles() {
        if (useSlots()) {
            ensureSlots();
            return chainTiles(S.slots);
        }
        return chainTiles(S.chain);
    }

    function resetBuildWorkspace(keepGoal) {
        S.chain = [];
        S.slots = null;
        S.slotHints = {};
        S.activeSlot = null;
        S.movingFrom = null;
        S.heldId = null;
        S.buildFbEn = '';
        S.buildFbPl = '';
        S.buildOk = false;
        S.buildSpoken = '';
        S.buildAwarded = false;
        S.buildChecking = false;
        if (!keepGoal) S.buildPrompt = null;
        clearAskWhy();
    }

    function joinSpeak(tiles, question) {
        const list = tiles || [];
        const words = list.filter((t) => t.kind !== 'punct');
        let out = words.map((t) => t.speak || t.text).join(' ').replace(/\s+/g, ' ').trim();
        if (!out) return '';
        out = out.charAt(0).toUpperCase() + out.slice(1);
        const punct = list.filter((t) => t.kind === 'punct').pop();
        const startsQ = /^(Is |Are |Am |Have |Has |Can |Must |Who |What |Where |When |Why |How )/i.test(out);
        const isQ = !!(question || (punct && punct.id === 'qmark') || (!punct && startsQ));
        if (punct) {
            out = out.replace(/[.?!]+$/g, '') + punct.text;
        } else if (isQ) {
            if (!/[?]$/.test(out)) out += '?';
        } else if (!/[.]$/.test(out)) {
            out += '.';
        }
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
        behind: 'za', 'in-front-of': 'przed', near: 'blisko', upstairs: 'na górze', downstairs: 'na dole', outside: 'na dworze', and: 'i', or: 'lub'
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
        const question = first.id === 'is-there' || first.id === 'are-there' ||
            first.kind === 'wh' || tiles.some((t) => t.id === 'qmark');

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
            const logic = locationLogicIssue(tiles);
            if (logic) return { ok: false, en: logic.en, pl: logic.pl };
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

    // Places and prepositions that sound natural together for primary learners
    const PREP_FOR_PLACE = {
        floor: ['on', 'under'],
        mat: ['on', 'under'],
        desk: ['on', 'under', 'next-to', 'near', 'behind', 'in-front-of', 'above'],
        table: ['on', 'under', 'next-to', 'near', 'behind', 'in-front-of'],
        chair: ['on', 'under', 'next-to', 'near', 'behind', 'in-front-of'],
        sofa: ['on', 'under', 'next-to', 'near', 'behind', 'in-front-of'],
        bed: ['on', 'under', 'next-to', 'near', 'behind', 'in-front-of'],
        shelf: ['on', 'under', 'next-to', 'near', 'above'],
        bin: ['in', 'next-to', 'near', 'behind', 'in-front-of'],
        box: ['in', 'on', 'under', 'next-to', 'near'],
        wardrobe: ['in', 'next-to', 'near', 'behind', 'in-front-of'],
        fridge: ['in', 'on', 'next-to', 'near'],
        cooker: ['next-to', 'near', 'on'],
        sink: ['next-to', 'near', 'under'],
        noticeboard: ['on', 'next-to', 'near', 'above'],
        tv: ['next-to', 'near', 'above', 'under', 'behind', 'in-front-of'],
        plant: ['next-to', 'near', 'behind', 'in-front-of'],
        door: ['next-to', 'near', 'behind', 'in-front-of'],
        window: ['next-to', 'near', 'behind', 'in-front-of', 'above'],
        garden: ['in', 'near'],
        kitchen: ['in', 'near'],
        bedroom: ['in', 'near'],
        bathroom: ['in', 'near'],
        'living-room': ['in', 'near'],
        balcony: ['on', 'near'],
        cupboard: ['in', 'next-to', 'near', 'behind', 'in-front-of'],
        drawer: ['in', 'next-to', 'near'],
        rug: ['on', 'under', 'next-to', 'near'],
        wall: ['on', 'next-to', 'near', 'behind'],
        park: ['in', 'near'],
        stairs: ['on', 'near', 'next-to'],
        whiteboard: ['on', 'next-to', 'near', 'above']
    };

    // These work better as places than as the main "thing" in There is / There are
    const PLACE_ONLY_THINGS = {
        floor: 1, door: 1, window: 1, garden: 1, kitchen: 1, bedroom: 1,
        bathroom: 1, 'living-room': 1, balcony: 1, sink: 1, cooker: 1,
        wall: 1, stairs: 1, park: 1
    };

    function placeRootId(t) {
        if (!t) return '';
        return t.sgId || t.id;
    }

    function prepFitsPlace(prepId, placeTile) {
        if (!prepId || !placeTile) return false;
        if (prepId === 'between' || prepId === 'upstairs' || prepId === 'downstairs' || prepId === 'outside') return false;
        const allowed = PREP_FOR_PLACE[placeRootId(placeTile)];
        if (!allowed) return prepId === 'next-to' || prepId === 'near' || prepId === 'on';
        return allowed.indexOf(prepId) !== -1;
    }

    function isMovableThing(t) {
        if (!t || t.kind !== 'noun') return false;
        if (PLACE_ONLY_THINGS[placeRootId(t)]) return false;
        return true;
    }

    function pickLocationTrio(wantPlural) {
        const things = visibleTiles().filter((t) => {
            if (t.kind !== 'noun' || !isMovableThing(t)) return false;
            if (wantPlural) return t.number === 'pl';
            return t.number === 'sg';
        });
        const places = visibleTiles().filter((t) => t.kind === 'noun' && t.place && t.number === 'sg');
        const preps = visibleTiles().filter((t) => t.kind === 'prep' && !t.adverb && t.id !== 'between');
        const combos = [];
        things.forEach((thing) => {
            places.forEach((place) => {
                if (placeRootId(thing) === placeRootId(place)) return;
                preps.forEach((prep) => {
                    if (prepFitsPlace(prep.id, place)) combos.push({ thing: thing, prep: prep, place: place });
                });
            });
        });
        return combos.length ? pick(combos) : null;
    }

    function locationLogicIssue(tiles) {
        const prep = tiles.find((t) => t.kind === 'prep' && !t.adverb);
        if (!prep || prep.id === 'between') return null;
        const prepI = tiles.indexOf(prep);
        const place = tiles.slice(prepI + 1).find((t) => t.kind === 'noun');
        if (!place) return null;
        if (prepFitsPlace(prep.id, place)) return null;
        const tip = (PREP_FOR_PLACE[placeRootId(place)] || ['on', 'next to']).slice(0, 2).join(' / ');
        return {
            en: 'That place word does not fit. Try ' + tip + ' with ' + place.text + '.',
            pl: 'Ten przyimek nie pasuje. Z ' + place.text + ' spróbuj: ' + tip + '.'
        };
    }

    function makeBuildPrompt(goal) {
        const g = goal || 'is';
        if (g === 'is') {
            const trio = pickLocationTrio(false);
            if (!trio) return { ids: ['there-is', 'a', 'lamp', 'on', 'the', 'desk'], picture: [byId('lamp'), byId('on'), byId('desk')] };
            const art = trio.thing.vowel ? 'an' : 'a';
            return {
                ids: ['there-is', art, trio.thing.id, trio.prep.id, 'the', trio.place.id],
                picture: [trio.thing, trio.prep, trio.place]
            };
        }
        if (g === 'are') {
            if (Math.random() < 0.25) {
                const n = pick(visibleTiles().filter((t) => t.kind === 'noun' && t.number === 'pl' && isMovableThing(t)));
                const adv = pick(visibleTiles().filter((t) => t.kind === 'prep' && t.adverb));
                if (n && adv) return { ids: ['there-are', n.id, adv.id], picture: [n, adv] };
            }
            const trio = pickLocationTrio(true);
            if (!trio) return { ids: ['there-are', 'two', 'chair-pl', 'next-to', 'the', 'sofa'], picture: [byId('chair'), byId('next-to'), byId('sofa')] };
            return {
                ids: ['there-are', trio.thing.id, trio.prep.id, 'the', trio.place.id],
                picture: [trio.thing, trio.prep, trio.place]
            };
        }
        if (g === 'have') {
            const p = pickPerson();
            const got = gotTile(p.id);
            const n = pick(visibleTiles().filter((t) => t.kind === 'noun' && t.number === 'sg' && t.goals && t.goals.indexOf('have') !== -1 && isMovableThing(t)));
            const art = n && n.vowel ? 'an' : 'a';
            return { ids: [p.id, got, art, n ? n.id : 'key'], picture: [byId(p.id), byId(got), n || byId('key')] };
        }
        if (g === 'can') {
            const p = pickPerson();
            const modal = pick(['can', 'cant']);
            const v = pick(visibleTiles().filter((t) => t.kind === 'verb' && t.goals.indexOf('can') !== -1));
            return { ids: [p.id, modal, v ? v.id : 'swim'], picture: [byId(p.id), byId(modal), v || byId('swim')] };
        }
        if (g === 'like') {
            const p = pickPerson();
            const n = pick(visibleTiles().filter((t) => t.kind === 'noun' && t.number !== 'pl' && t.goals && t.goals.indexOf('like') !== -1));
            const neg = Math.random() < 0.4;
            const ids = neg ? [p.id, 'dont', 'like', n ? n.id : 'pizza'] : [p.id, 'like', n ? n.id : 'pizza'];
            return { ids: ids, picture: [byId(p.id), byId(neg ? 'dont' : 'like'), n || byId('pizza')] };
        }
        if (g === 'must') {
            const p = pickPerson();
            const v = pick(visibleTiles().filter((t) => t.kind === 'verb' && t.goals.indexOf('must') !== -1));
            return { ids: [p.id, 'must', v ? v.id : 'listen'], picture: [byId(p.id), byId('must'), v || byId('listen')] };
        }
        if (g === 'haveto') {
            const p = pickPerson();
            const v = pick(visibleTiles().filter((t) => t.kind === 'verb' && t.goals.indexOf('haveto') !== -1));
            const neg = Math.random() < 0.4;
            const ids = neg ? [p.id, 'dont', 'have-to', v ? v.id : 'run'] : [p.id, 'have-to', v ? v.id : 'tidy'];
            return { ids: ids, picture: [byId(p.id), byId(neg ? 'dont' : 'have-to'), v || byId('tidy')] };
        }
        return { ids: ['there-is', 'a', 'lamp', 'on', 'the', 'desk'], picture: [byId('lamp'), byId('on'), byId('desk')] };
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

    function fadedSlotStyle(family) {
        const c = COL[family] || COL.noun;
        return 'border-color:' + c.bg + ';background:' + c.bg + '33';
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
        S.buildFbEn = ''; S.buildFbPl = ''; S.buildOk = false; S.buildSpoken = ''; S.buildAwarded = false;
        if (useSlots()) {
            ensureSlots();
            S.movingFrom = null;
            if (S.heldId) {
                // Place the picked-up tile into the chosen / first empty blank
                let i = S.activeSlot;
                if (i == null || S.slots[i]) i = S.slots.findIndex((x) => !x);
                if (i < 0) {
                    S.buildFbEn = 'All spaces are full. Place the held tile first, or clear a space.';
                    S.buildFbPl = 'Wszystkie miejsca są zajęte. Najpierw połóż trzymany kafel albo zwolnij miejsce.';
                    render();
                    return;
                }
                placeHeldInSlot(i);
                const next = S.slots.findIndex((x) => !x);
                S.activeSlot = next < 0 ? null : next;
                render();
                return;
            }
            let i = S.activeSlot;
            if (i == null || S.slots[i]) i = S.slots.findIndex((x) => !x);
            if (i < 0) {
                S.buildFbEn = 'All spaces are full. Tap a tile in the sentence to move or remove it.';
                S.buildFbPl = 'Wszystkie miejsca są zajęte. Kliknij kafel w zdaniu, by go przenieść lub usunąć.';
                render();
                return;
            }
            S.slots[i] = id;
            const next = S.slots.findIndex((x) => !x);
            S.activeSlot = next < 0 ? null : next;
        } else {
            S.chain.push(id);
        }
        render();
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
        if (S.tab === 'lineup') {
            return pl
                ? 'Spójrz na obrazki. Przesuń kafelki na ponumerowane okienka, żeby złożyć zdanie. Możesz też stuknąć kafel, a potem okienko.'
                : 'Look at the pictures. Drag each tile into the right numbered box to make the sentence. You can also tap a tile, then tap a box.';
        }
        if (S.tab === 'fill') {
            return pl
                ? 'Uzupełnij niekompletne zdanie. Przesuń poprawny kafel w lukę (albo stuknij kafel, potem lukę). Kropka . = twierdzenie, znak ? = pytanie.'
                : 'Complete the sentence. Drag the right tile into each gap (or tap a tile, then a gap). Use . for a statement and ? for a question.';
        }
        if (S.tab === 'creator') {
            return pl
                ? 'Ułóż własne poprawne zdanie z kafelków — w tym to be (am / is / are), and / or, słowa pytające oraz . albo ?. Kliknij Sprawdź — AI oceni gramatykę.'
                : 'Build your own correct sentence — including to be (am / is / are), and / or, question words, and . or ?. Tap Check — AI will judge the grammar.';
        }
        if (S.tab === 'build') {
            if (!S.goal) {
                return pl ? 'Co chcesz powiedzieć? Wybierz cel, potem układaj kafelki od lewej.' : 'What do you want to say? Pick a goal, then line the tiles up from the left.';
            }
            if (S.buildPrompt && S.ageBand === 'young') {
                return pl
                    ? 'Spójrz na obrazek. Kliknij kafel w zdaniu, żeby go podnieść, potem kliknij dowolne puste miejsce (nawet puste na końcu), by go tam położyć. Puste miejsce bez kafelka pokazuje też podpowiedź koloru.'
                    : 'Look at the picture. Tap a tile in the sentence to pick it up, then tap any blank space (including empty ones) to put it there. An empty space also shows a colour hint.';
            }
            return pl
                ? 'Klikaj kafelki, żeby złożyć zdanie. Przeciągnij kafel w pasku, aby zmienić kolejność. Kliknij, aby go zdjąć.'
                : 'Tap tiles to build the sentence. Drag a tile in the strip to move it. Tap it to take it out.';
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
        if (S.tab !== 'build' && S.tab !== 'text' && S.tab !== 'lineup' && S.tab !== 'creator' && S.tab !== 'fill') S.tab = 'build';
        root.innerHTML = legendHtml() + tabsHtml() + coachHtml() +
            (S.tab === 'build' ? buildHtml() : '') +
            (S.tab === 'creator' ? creatorHtml() : '') +
            (S.tab === 'fill' ? fillHtml() : '') +
            (S.tab === 'text' ? textHtml() : '') +
            (S.tab === 'lineup' ? '<div id="cb-lineup-host"></div>' : '') +
            nounPickHtml();
        bind(root);
        if (S.tab === 'fill') bindFillDrag(root);
        if (S.tab === 'lineup' && global.LineUp) {
            global.LineUp.mount(document.getElementById('cb-lineup-host'), {
                ageBand: S.ageBand,
                polish: S.polish,
                hideCoach: true
            });
        }
    }

    function legendHtml() {
        let keys = S.ageBand === 'young'
            ? ['is', 'are', 'have', 'can', 'like', 'art', 'prep']
            : ['is', 'are', 'have', 'can', 'like', 'must', 'art', 'prep'];
        if (S.tab === 'creator' || S.tab === 'fill') {
            keys = keys.concat(['be', 'wh', 'punct', 'subj']);
        }
        return '<div class="cb-legend" aria-label="' + esc(L('Colour key', 'Kolory')) + '">' + keys.map((k) => {
            const c = COL[k];
            return '<span style="background:' + c.bg + '"><i class="fa-solid ' + c.fa + '"></i> ' + esc(L(c.label, c.labelPl)) + '</span>';
        }).join('') + '</div>';
    }

    function tabsHtml() {
        const t = (id, en, pl) => '<button type="button" class="cb-tab' + (S.tab === id ? ' on' : '') + '" data-cb="tab" data-id="' + id + '">' + esc(L(en, pl)) + '</button>';
        return '<div class="cb-tabs">' +
            t('build', 'Build a sentence', 'Złóż zdanie') +
            t('creator', 'Creator', 'Twórca') +
            t('fill', 'Fill the gaps', 'Uzupełnij') +
            t('text', 'Text tasks', 'Zadania tekstowe') +
            t('lineup', 'Line Up', 'Ułóż zdanie') +
            '</div>';
    }

    function coachHtml() {
        const tilePlOn = S.tilePl;
        const tilePlBtn = S.tab === 'lineup' ? '' :
            '<button type="button" class="cb-tilepl' + (tilePlOn ? ' on' : '') + '" data-cb="tilepl" title="' +
            esc(L('Show Polish words on tiles', 'Pokaż polskie słowa na kafelkach')) + '">' +
            esc(tilePlOn ? L('PL tiles on', 'PL na kafelkach') : L('PL tiles off', 'Bez PL na kafelkach')) +
            '</button>';
        return '<div class="cb-coach"><p>' + esc(coach()) + '</p>' +
            '<div class="cb-coach-tools">' +
            tilePlBtn +
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
        tiles.forEach((t, i) => {
            html += cardHtml(t, ' in-chain', action)
                .replace('data-id="' + t.id + '"', 'data-id="' + i + '" data-tid="' + esc(t.id) + '"');
        });
        html += '</div>';
        return html;
    }

    function moveTileToSlot(fromIndex, toIndex) {
        if (!ensureSlots()) return false;
        if (fromIndex == null || toIndex == null) return false;
        if (fromIndex === toIndex) return false;
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= S.slots.length || toIndex >= S.slots.length) return false;
        const moving = S.slots[fromIndex];
        if (!moving) return false;
        const dest = S.slots[toIndex];
        S.slots[toIndex] = moving;
        S.slots[fromIndex] = dest || null;
        return true;
    }

    function placeHeldInSlot(toIndex) {
        if (!ensureSlots() || !S.heldId) return false;
        if (toIndex == null || toIndex < 0 || toIndex >= S.slots.length) return false;
        const dest = S.slots[toIndex];
        S.slots[toIndex] = S.heldId;
        S.heldId = dest || null;
        return true;
    }

    function holdingHtml() {
        if (!S.heldId) return '';
        const t = byId(S.heldId);
        if (!t) return '';
        return '<div class="cb-holding">' +
            '<span>' + esc(L('Holding — tap any blank to place:', 'Trzymasz — kliknij puste miejsce:')) + '</span>' +
            cardHtml(t, ' moving', 'held-cancel') +
            '</div>';
    }

    function buildChainHtml() {
        const emptyMsg = L('Tap tiles below…', 'Kliknij kafelki poniżej…');
        if (!useSlots()) return chainHtml(S.chain, 'pop', emptyMsg);

        ensureSlots();
        const expected = S.buildPrompt.ids;
        const hints = S.slotHints || {};
        const canDrop = !!(S.heldId || (S.movingFrom != null));
        let html = holdingHtml();
        html += '<div class="cb-chain cb-chain-slots" data-empty="' + esc(emptyMsg) + '">';
        for (let i = 0; i < expected.length; i++) {
            const tid = S.slots[i];
            if (tid) {
                const t = byId(tid);
                if (!t) {
                    // keep the empty slot so indices stay aligned
                    const exp = byId(expected[i]);
                    const fam = exp ? exp.family : 'noun';
                    const hinted = !!hints[i];
                    const style = hinted ? fadedSlotStyle(fam) : '';
                    html += '<button type="button" class="cb-slot' + (hinted ? ' hinted' : '') + (canDrop ? ' droppable' : '') + '" data-cb="slot" data-id="' + i + '"' +
                        (style ? ' style="' + style + '"' : '') + '></button>';
                    continue;
                }
                const moving = S.movingFrom === i ? ' moving' : '';
                html += cardHtml(t, ' in-chain' + moving, 'slot-tile')
                    .replace('data-id="' + t.id + '"', 'data-id="' + i + '" data-tid="' + esc(tid) + '"');
            } else {
                const exp = byId(expected[i]);
                const fam = exp ? exp.family : 'noun';
                const hinted = !!hints[i];
                const sel = S.activeSlot === i ? ' selected' : '';
                const drop = canDrop ? ' droppable' : '';
                const style = hinted ? fadedSlotStyle(fam) : '';
                html += '<button type="button" class="cb-slot' + (hinted ? ' hinted' : '') + sel + drop + '" data-cb="slot" data-id="' + i + '"' +
                    (style ? ' style="' + style + '"' : '') +
                    ' title="' + esc(canDrop
                        ? L('Tap to place the tile here', 'Kliknij, by położyć tu kafel')
                        : L('Tap for colour hint, then choose a tile', 'Kliknij podpowiedź koloru, potem wybierz kafel')) + '"' +
                    ' aria-label="' + esc(L('Empty space', 'Puste miejsce') + ' ' + (i + 1)) + '"></button>';
            }
        }
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
            { id: 'be', title: 'to be (am / is / are)', titlePl: 'to be (am / is / are)', kinds: ['be'] },
            { id: 'wh', title: 'Question words', titlePl: 'Słowa pytające', kinds: ['wh'] },
            { id: 'struct', title: 'Sentence starters', titlePl: 'Początek zdania', kinds: ['struct'] },
            { id: 'art', title: 'a · an · the · some · any', titlePl: 'a · an · the · some · any', kinds: ['art'] },
            { id: 'link', title: 'and · or', titlePl: 'and · or', kinds: ['link'] },
            { id: 'punct', title: '. and ?', titlePl: '. i ?', kinds: ['punct'] },
            { id: 'num', title: 'Numbers', titlePl: 'Liczby', kinds: ['num'] },
            { id: 'grammar', title: 'Grammar', titlePl: 'Gramatyka', kinds: ['verbp', 'modal', 'neg'] },
            { id: 'prep', title: 'Place words', titlePl: 'Przyimki miejsca', kinds: ['prep'] },
            { id: 'food', title: 'Food', titlePl: 'Jedzenie', kinds: ['noun'], cat: 'food' },
            { id: 'furniture', title: 'Furniture', titlePl: 'Meble', kinds: ['noun'], cat: 'furniture' },
            { id: 'room', title: 'In the room', titlePl: 'W pokoju', kinds: ['noun'], cat: 'room' },
            { id: 'school', title: 'School', titlePl: 'Szkoła', kinds: ['noun'], cat: 'school' },
            { id: 'clothes', title: 'Clothes', titlePl: 'Ubrania', kinds: ['noun'], cat: 'clothes' },
            { id: 'toys', title: 'Toys & sport', titlePl: 'Zabawki i sport', kinds: ['noun'], cat: 'toys' },
            { id: 'animals', title: 'Animals', titlePl: 'Zwierzęta', kinds: ['noun'], cat: 'animals' },
            { id: 'tech', title: 'Tech', titlePl: 'Technika', kinds: ['noun'], cat: 'tech' },
            { id: 'house', title: 'House', titlePl: 'Dom', kinds: ['noun'], cat: 'house' },
            { id: 'other', title: 'Other things', titlePl: 'Inne rzeczy', kinds: ['noun'], cat: 'other' },
            { id: 'verb', title: 'Actions', titlePl: 'Czynności', kinds: ['verb'] }
        ];
    }

    function defaultSheetsOpen() {
        const open = {};
        sheetGroups().forEach((g) => { open[g.id] = false; });
        if (S.tab === 'creator') {
            open.who = true; open.be = true; open.wh = true; open.struct = true;
            open.art = true; open.link = true; open.punct = true; open.num = true; open.grammar = true;
            open.prep = true; open.food = true; open.furniture = true; open.room = true;
            open.school = true; open.clothes = true; open.toys = true; open.animals = true;
            open.tech = true; open.house = true; open.other = true; open.verb = true;
            return open;
        }
        const g = S.goal;
        if (g === 'have') {
            open.who = true; open.grammar = true; open.art = true; open.tech = true; open.toys = true;
        } else if (g === 'can' || g === 'must' || g === 'haveto') {
            open.who = true; open.grammar = true; open.verb = true;
        } else if (g === 'like') {
            open.who = true; open.grammar = true; open.food = true; open.toys = true; open.animals = true;
        } else {
            open.struct = true; open.art = true; open.prep = true; open.furniture = true; open.room = true;
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
            const tiles = list.filter((t) => {
                if (g.kinds.indexOf(t.kind) === -1 || t.number === 'pl') return false;
                if (g.cat && t.cat !== g.cat) return false;
                return true;
            });
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

    function buildActionsHtml(opts) {
        opts = opts || {};
        const checkBusy = !!S.buildChecking;
        const checkLabel = checkBusy
            ? L('Checking…', 'Sprawdzam…')
            : L('Check', 'Sprawdź');
        let html = '<div class="cb-actions cb-actions-top">' +
            '<button type="button" class="btn btn-blue" data-cb="check-build"' + (checkBusy ? ' disabled' : '') + '>' + esc(checkLabel) + '</button>' +
            '<button type="button" class="btn btn-outline" data-cb="speak-build"><i class="fa-solid fa-volume-high"></i> ' + esc(L('Say it', 'Powiedz')) + '</button>' +
            '<button type="button" class="btn btn-outline" data-cb="clear-build">' + esc(L('Clear', 'Wyczyść')) + '</button>';
        if (opts.newPrompt) {
            html += '<button type="button" class="btn btn-outline" data-cb="new-prompt">' + esc(L('New picture', 'Nowy obrazek')) + '</button>';
        }
        if (opts.newGoal) {
            html += '<button type="button" class="btn btn-grey" data-cb="new-goal">' + esc(L('Change goal', 'Zmień cel')) + '</button>';
        }
        html += '</div>';
        return html;
    }

    function buildFeedbackHtml() {
        const fb = L(S.buildFbEn, S.buildFbPl);
        let html = '';
        if (S.buildSpoken) {
            html += '<div class="cb-sentence">' + currentBuildTiles().map((t) => tokHtml(t.family, t.text)).join(' ') + '</div>';
        }
        html += '<div class="cb-fb' + (S.buildOk ? ' ok' : (fb ? ' bad' : '')) + '">' + esc(fb) + '</div>';
        html += whyHtml(!S.buildOk && !!fb && !S.buildChecking);
        return html;
    }

    function buildHtml() {
        if (!S.goal) return goalsHtml();
        let html = '';
        if (S.buildPrompt) html += pictureHtml(S.buildPrompt);
        html += buildChainHtml();
        html += buildActionsHtml({ newPrompt: true, newGoal: true });
        html += buildFeedbackHtml();
        html += sheetsHtml();
        return html;
    }

    function creatorHtml() {
        let html = '';
        html += chainHtml(S.chain, 'pop', L('Tap tiles below to invent a sentence…', 'Klikaj kafelki poniżej, by wymyślić zdanie…'));
        html += buildActionsHtml({});
        html += buildFeedbackHtml();
        html += sheetsHtml();
        return html;
    }

    function fillHtml() {
        const task = S.fillTask;
        if (!task) return '<p>' + esc(L('No task yet.', 'Brak zadania.')) + '</p>';
        const canDrop = !!(S.fillHeld || S.fillDragFrom != null);
        let html = '';
        if (S.fillHeld) {
            const ht = byId(S.fillHeld);
            if (ht) {
                html += '<div class="cb-holding">' +
                    '<span>' + esc(L('Holding — tap a gap to place:', 'Trzymasz — kliknij lukę:')) + '</span>' +
                    cardHtml(ht, ' moving', 'fill-held-cancel') +
                    '</div>';
            }
        }
        html += '<div class="cb-fill-line" id="cb-fill-line">';
        task.ids.forEach((tid, i) => {
            const isGap = task.gaps.indexOf(i) !== -1;
            if (!isGap) {
                const t = byId(tid);
                if (t) html += cardHtml(t, ' fill-fixed', 'noop');
                return;
            }
            const placed = S.fillPlaced && S.fillPlaced[i];
            if (placed) {
                const t = byId(placed);
                if (t) {
                    html += cardHtml(t, ' fill-placed' + (S.fillDragFrom === i ? ' dragging' : ''), 'fill-slot-tile')
                        .replace('data-id="' + t.id + '"', 'data-id="' + i + '" data-tid="' + esc(placed) + '"');
                    return;
                }
            }
            const exp = byId(tid);
            const fam = exp ? exp.family : 'be';
            html += '<button type="button" class="cb-fill-slot cb-slot' + (canDrop ? ' droppable' : '') + (S.fillActive === i ? ' selected' : '') +
                '" data-cb="fill-slot" data-id="' + i + '" style="' + fadedSlotStyle(fam) + '" title="' +
                esc(L('Drop a tile here', 'Upuść tu kafel')) + '"></button>';
        });
        html += '</div>';
        html += '<div class="cb-actions cb-actions-top">' +
            '<button type="button" class="btn btn-blue" data-cb="check-fill">' + esc(L('Check', 'Sprawdź')) + '</button>' +
            '<button type="button" class="btn btn-outline" data-cb="fill-clear">' + esc(L('Clear gaps', 'Wyczyść luki')) + '</button>' +
            '<button type="button" class="btn btn-outline" data-cb="fill-next">' + esc(L('New sentence', 'Nowe zdanie')) + '</button>' +
            '</div>';
        const fb = L(S.fillFbEn, S.fillFbPl);
        html += '<div class="cb-fb' + (S.fillOk ? ' ok' : (fb ? ' bad' : '')) + '">' + esc(fb) + '</div>';
        html += whyHtml(!S.fillOk && !!fb);
        html += '<div class="cb-fill-bank"><h3>' + esc(L('Tiles — drag into a gap', 'Kafelki — przeciągnij do luki')) + '</h3><div class="cb-cards">';
        const placedHeld = {};
        Object.keys(S.fillPlaced || {}).forEach((k) => {
            const tid = S.fillPlaced[k];
            if (tid) placedHeld[tid] = (placedHeld[tid] || 0) + 1;
        });
        if (S.fillHeld) placedHeld[S.fillHeld] = (placedHeld[S.fillHeld] || 0) + 1;
        const seen = {};
        (S.fillBank || []).forEach((tid) => {
            seen[tid] = (seen[tid] || 0) + 1;
            const earlier = seen[tid];
            const isUsed = earlier <= (placedHeld[tid] || 0);
            const t = byId(tid);
            if (!t) return;
            html += cardHtml(t, ' fill-bank' + (isUsed ? ' used' : ''), isUsed ? 'noop' : 'fill-bank');
        });
        html += '</div></div>';
        return html;
    }

    function loadFillTask() {
        S.fillFbEn = '';
        S.fillFbPl = '';
        S.fillOk = false;
        S.fillAwarded = false;
        S.fillHeld = null;
        S.fillActive = null;
        S.fillDragFrom = null;
        S.fillPlaced = {};
        clearAskWhy();
        let pool = FILL_TASKS.filter((t) => {
            if (t.ages && t.ages.indexOf(S.ageBand) === -1) return false;
            return (t.ids || []).every((id) => !!byId(id));
        });
        if (!pool.length) pool = FILL_TASKS.filter((t) => (t.ids || []).every((id) => !!byId(id)));
        const src = pick(pool);
        if (!src) {
            S.fillTask = null;
            S.fillBank = [];
            return;
        }
        const answers = src.gaps.map((gi) => src.ids[gi]);
        const bank = shuffle(answers.concat(src.distractors || []).filter((id) => !!byId(id)));
        S.fillTask = { ids: src.ids.slice(), gaps: src.gaps.slice(), family: src.family || 'be' };
        S.fillBank = bank;
    }

    function placeFillTile(slotIndex, tileId) {
        if (!S.fillTask || S.fillTask.gaps.indexOf(slotIndex) === -1) return false;
        const prev = S.fillPlaced[slotIndex];
        S.fillPlaced[slotIndex] = tileId;
        if (S.fillHeld === tileId) S.fillHeld = prev || null;
        else if (prev && !S.fillHeld) { /* returned to bank via counts */ }
        S.fillFbEn = '';
        S.fillFbPl = '';
        S.fillOk = false;
        clearAskWhy();
        return true;
    }

    function clearFillSlot(slotIndex) {
        if (S.fillPlaced[slotIndex]) {
            delete S.fillPlaced[slotIndex];
            S.fillFbEn = '';
            S.fillFbPl = '';
            S.fillOk = false;
            clearAskWhy();
        }
    }

    function checkFill() {
        clearAskWhy();
        const task = S.fillTask;
        if (!task) return;
        const missing = task.gaps.some((gi) => !S.fillPlaced[gi]);
        if (missing) {
            S.fillOk = false;
            S.fillFbEn = 'Fill every gap first.';
            S.fillFbPl = 'Najpierw wypełnij każdą lukę.';
            render();
            return;
        }
        const wrong = task.gaps.filter((gi) => S.fillPlaced[gi] !== task.ids[gi]);
        if (wrong.length) {
            S.fillOk = false;
            S.fillFbEn = 'Not quite. Check . vs ? and the missing word.';
            S.fillFbPl = 'Nie tym razem. Sprawdź . vs ? oraz brakujące słowo.';
            render();
            return;
        }
        const tiles = chainTiles(task.ids);
        const sentence = joinSpeak(tiles);
        S.fillOk = true;
        S.fillFbEn = 'Yes! ' + sentence;
        S.fillFbPl = 'Tak! ' + sentence;
        if (!S.fillAwarded) {
            S.fillAwarded = true;
            award(10, { tab: 'fill', sentence: sentence });
            rememberColourSentence(sentence, polishFromTiles(tiles), tiles);
        }
        speak(sentence);
        render();
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
            if (chainSkipClick) {
                chainSkipClick = false;
                return;
            }
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
                S.textFbEn = ''; S.textFbPl = '';
                S.fillFbEn = ''; S.fillFbPl = '';
                S.movingFrom = null;
                S.activeSlot = null;
                S.heldId = null;
                S.fillHeld = null;
                S.fillActive = null;
                S.fillDragFrom = null;
                if (changed && id === 'build') {
                    if (!S.goal) S.sheetsOpen = null;
                    else S.sheetsOpen = defaultSheetsOpen();
                }
                if (changed && id === 'creator') {
                    S.goal = null;
                    S.buildPrompt = null;
                    S.slots = null;
                    S.chain = S.chain || [];
                    S.slotHints = {};
                    S.heldId = null;
                    S.sheetsOpen = defaultSheetsOpen();
                    S.buildOk = false;
                    S.buildSpoken = '';
                    S.buildAwarded = false;
                }
                if (changed && id === 'fill') {
                    loadFillTask();
                }
                render(); return;
            }
            if (a === 'lang') { S.polish = id === 'pl'; render(); return; }
            if (a === 'tilepl') { S.tilePl = !S.tilePl; render(); return; }
            if (a === 'pl') { S.polish = !S.polish; render(); return; }
            if (a === 'goal') {
                resetBuildWorkspace(true);
                S.goal = id;
                S.buildPrompt = S.ageBand === 'young' ? makeBuildPrompt(id) : null;
                if (S.buildPrompt && S.buildPrompt.ids) {
                    S.slots = S.buildPrompt.ids.map(function () { return null; });
                }
                S.sheetsOpen = defaultSheetsOpen();
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
            if (a === 'held-cancel') {
                // Put held tile back into the first empty blank (or cancel into hand only)
                if (!ensureSlots() || !S.heldId) return;
                let i = S.slots.findIndex((x) => !x);
                if (i < 0) {
                    S.buildFbEn = 'No empty space — tap a blank after clearing one.';
                    S.buildFbPl = 'Brak pustego miejsca — najpierw zwolnij jedno.';
                    render();
                    return;
                }
                placeHeldInSlot(i);
                S.movingFrom = null;
                S.activeSlot = null;
                clearAskWhy();
                S.buildFbEn = ''; S.buildFbPl = ''; S.buildOk = false; S.buildSpoken = '';
                render();
                return;
            }
            if (a === 'slot') {
                const i = Number(id);
                if (!ensureSlots()) return;
                clearAskWhy();
                S.buildFbEn = ''; S.buildFbPl = ''; S.buildOk = false; S.buildSpoken = '';
                if (!S.slotHints) S.slotHints = {};
                S.slotHints[i] = true;
                if (S.heldId) {
                    placeHeldInSlot(i);
                    S.movingFrom = null;
                    S.activeSlot = S.slots.findIndex((x) => !x);
                    if (S.activeSlot < 0) S.activeSlot = null;
                } else if (S.movingFrom != null) {
                    moveTileToSlot(S.movingFrom, i);
                    S.movingFrom = null;
                    S.activeSlot = S.slots.findIndex((x) => !x);
                    if (S.activeSlot < 0) S.activeSlot = null;
                } else {
                    S.activeSlot = (S.activeSlot === i) ? null : i;
                }
                render();
                return;
            }
            if (a === 'slot-tile') {
                const i = Number(id);
                if (!ensureSlots()) return;
                clearAskWhy();
                S.buildFbEn = ''; S.buildFbPl = ''; S.buildOk = false; S.buildSpoken = '';
                const tid = S.slots[i];
                speakTile(byId(tid));
                if (S.heldId) {
                    // Swap held tile with this one
                    placeHeldInSlot(i);
                    S.movingFrom = null;
                    S.activeSlot = null;
                } else if (S.activeSlot != null && !S.slots[S.activeSlot] && S.activeSlot !== i) {
                    // Blank was pre-selected — move this tile into that blank
                    moveTileToSlot(i, S.activeSlot);
                    S.movingFrom = null;
                    S.activeSlot = S.slots.findIndex((x) => !x);
                    if (S.activeSlot < 0) S.activeSlot = null;
                } else {
                    // Pick up: lift out so every blank (including this space) can receive it
                    S.heldId = S.slots[i];
                    S.slots[i] = null;
                    S.movingFrom = null;
                    S.activeSlot = null;
                    if (!S.slotHints) S.slotHints = {};
                    S.slotHints[i] = true;
                }
                render();
                return;
            }
            if (a === 'pop') {
                speakTile(chainTiles(S.chain)[Number(id)]);
                S.chain.splice(Number(id), 1); S.buildFbEn = ''; S.buildFbPl = ''; S.buildOk = false; S.buildSpoken = ''; clearAskWhy(); render(); return;
            }
            if (a === 'check-build') { checkBuild(); return; }
            if (a === 'ask-why') { askWhy(); return; }
            if (a === 'speak-build') {
                speak(S.buildSpoken || joinSpeak(currentBuildTiles()));
                return;
            }
            if (a === 'clear-build') {
                if (useSlots()) {
                    ensureSlots();
                    S.slots = S.slots.map(function () { return null; });
                } else {
                    S.chain = [];
                }
                S.slotHints = {};
                S.activeSlot = null;
                S.movingFrom = null;
                S.heldId = null;
                S.buildFbEn = ''; S.buildFbPl = ''; S.buildOk = false; S.buildSpoken = ''; S.buildAwarded = false;
                S.buildChecking = false;
                clearAskWhy();
                render();
                return;
            }
            if (a === 'new-prompt') {
                S.buildPrompt = makeBuildPrompt(S.goal);
                S.chain = [];
                S.slots = (S.buildPrompt.ids || []).map(function () { return null; });
                S.slotHints = {};
                S.activeSlot = null;
                S.movingFrom = null;
                S.heldId = null;
                S.buildFbEn = ''; S.buildFbPl = ''; S.buildOk = false; S.buildSpoken = ''; S.buildAwarded = false;
                clearAskWhy();
                render();
                return;
            }
            if (a === 'new-goal') {
                S.goal = null;
                resetBuildWorkspace(false);
                S.sheetsOpen = null;
                render();
                return;
            }
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
            if (a === 'noop') return;
            if (a === 'fill-bank') {
                const tile = byId(id);
                speakTile(tile);
                if (S.fillHeld === id) S.fillHeld = null;
                else S.fillHeld = id;
                S.fillActive = null;
                S.fillFbEn = ''; S.fillFbPl = ''; S.fillOk = false;
                clearAskWhy();
                render();
                return;
            }
            if (a === 'fill-held-cancel') {
                S.fillHeld = null;
                render();
                return;
            }
            if (a === 'fill-slot') {
                const i = Number(id);
                if (S.fillHeld) {
                    placeFillTile(i, S.fillHeld);
                    S.fillHeld = null;
                    S.fillActive = null;
                } else {
                    S.fillActive = S.fillActive === i ? null : i;
                }
                render();
                return;
            }
            if (a === 'fill-slot-tile') {
                const i = Number(id);
                const tid = S.fillPlaced[i];
                speakTile(byId(tid));
                if (S.fillHeld) {
                    placeFillTile(i, S.fillHeld);
                    S.fillHeld = null;
                } else {
                    S.fillHeld = tid;
                    clearFillSlot(i);
                }
                S.fillActive = null;
                render();
                return;
            }
            if (a === 'check-fill') { checkFill(); return; }
            if (a === 'fill-clear') {
                S.fillPlaced = {};
                S.fillHeld = null;
                S.fillActive = null;
                S.fillFbEn = ''; S.fillFbPl = ''; S.fillOk = false; S.fillAwarded = false;
                clearAskWhy();
                render();
                return;
            }
            if (a === 'fill-next') { loadFillTask(); render(); return; }
        };
        bindChainSort(root);
    }

    function bindFillDrag(root) {
        const line = root.querySelector('#cb-fill-line');
        if (!line || S.tab !== 'fill') return;
        let card = null;
        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let moved = false;
        let fromSlot = null;
        let fromBankId = null;

        function slotAtPoint(x, y) {
            const slots = Array.prototype.slice.call(line.querySelectorAll('[data-cb="fill-slot"], .cb-card.fill-placed'));
            let best = null;
            let bestD = Infinity;
            slots.forEach((el) => {
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
                if (d < bestD) {
                    bestD = d;
                    best = el;
                }
            });
            if (!best || bestD > 160 * 160) return null;
            return Number(best.getAttribute('data-id'));
        }

        function finish(x, y) {
            if (!card) return;
            const didMove = moved;
            card.classList.remove('dragging');
            line.classList.remove('sorting');
            const bankId = fromBankId;
            const slotFrom = fromSlot;
            card = null;
            pointerId = null;
            moved = false;
            fromSlot = null;
            fromBankId = null;
            if (!didMove) return;
            chainSkipClick = true;
            setTimeout(function () { chainSkipClick = false; }, 400);
            const target = slotAtPoint(x, y);
            if (target == null) {
                render();
                return;
            }
            if (bankId) {
                const prev = S.fillPlaced[target];
                S.fillPlaced[target] = bankId;
                if (prev && prev !== bankId) S.fillHeld = null;
                S.fillHeld = null;
            } else if (slotFrom != null && slotFrom !== target) {
                const moving = S.fillPlaced[slotFrom];
                const dest = S.fillPlaced[target];
                S.fillPlaced[target] = moving;
                if (dest) S.fillPlaced[slotFrom] = dest;
                else delete S.fillPlaced[slotFrom];
            }
            S.fillFbEn = '';
            S.fillFbPl = '';
            S.fillOk = false;
            clearAskWhy();
            render();
        }

        root.addEventListener('pointerdown', (e) => {
            const el = e.target.closest('.cb-card.fill-bank:not(.used), .cb-card.fill-placed');
            if (!el || e.button) return;
            card = el;
            pointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            moved = false;
            fromBankId = el.classList.contains('fill-bank') ? el.getAttribute('data-id') : null;
            fromSlot = el.classList.contains('fill-placed') ? Number(el.getAttribute('data-id')) : null;
            try { el.setPointerCapture(e.pointerId); } catch (err) {}
        });
        root.addEventListener('pointermove', (e) => {
            if (!card || e.pointerId !== pointerId) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (!moved && (dx * dx + dy * dy) < 64) return;
            if (!moved) {
                moved = true;
                card.classList.add('dragging');
                line.classList.add('sorting');
            }
            e.preventDefault();
        });
        root.addEventListener('pointerup', (e) => {
            if (e.pointerId !== pointerId) return;
            finish(e.clientX, e.clientY);
        });
        root.addEventListener('pointercancel', (e) => {
            if (e.pointerId !== pointerId) return;
            moved = false;
            finish(e.clientX, e.clientY);
        });
    }

    function applyChainOrder(ids) {
        const same = ids.length === S.chain.length && ids.every((id, i) => id === S.chain[i]);
        if (same) return;
        S.chain = ids;
        S.buildFbEn = '';
        S.buildFbPl = '';
        S.buildOk = false;
        S.buildSpoken = '';
        clearAskWhy();
        render();
    }

    function bindChainSort(root) {
        const chain = root.querySelector('.cb-chain');
        if (!chain || (S.tab !== 'build' && S.tab !== 'creator')) return;
        if (useSlots()) return;
        let card = null;
        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let moved = false;

        function insertAtPoint(x, y) {
            const others = Array.prototype.slice.call(chain.querySelectorAll('.cb-card.in-chain'))
                .filter((el) => el !== card);
            if (!others.length) return;
            let best = others[0];
            let bestD = Infinity;
            others.forEach((el) => {
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
                if (d < bestD) {
                    bestD = d;
                    best = el;
                }
            });
            const r = best.getBoundingClientRect();
            if (x < r.left + r.width / 2) chain.insertBefore(card, best);
            else chain.insertBefore(card, best.nextSibling);
        }

        function finish() {
            if (!card) return;
            const el = card;
            const didMove = moved;
            el.classList.remove('dragging');
            chain.classList.remove('sorting');
            card = null;
            pointerId = null;
            moved = false;
            if (!didMove) return;
            const ids = Array.prototype.slice.call(chain.querySelectorAll('.cb-card.in-chain'))
                .map((c) => c.getAttribute('data-tid'))
                .filter(Boolean);
            chainSkipClick = true;
            setTimeout(function () { chainSkipClick = false; }, 400);
            applyChainOrder(ids);
        }

        chain.addEventListener('pointerdown', (e) => {
            const el = e.target.closest('.cb-card.in-chain');
            if (!el || e.button) return;
            card = el;
            pointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            moved = false;
            try { el.setPointerCapture(e.pointerId); } catch (err) {}
        });
        chain.addEventListener('pointermove', (e) => {
            if (!card || e.pointerId !== pointerId) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (!moved && (dx * dx + dy * dy) < 64) return;
            if (!moved) {
                moved = true;
                card.classList.add('dragging');
                chain.classList.add('sorting');
            }
            e.preventDefault();
            insertAtPoint(e.clientX, e.clientY);
        });
        chain.addEventListener('pointerup', (e) => {
            if (e.pointerId !== pointerId) return;
            finish();
        });
        chain.addEventListener('pointercancel', (e) => {
            if (e.pointerId !== pointerId) return;
            moved = false;
            finish();
        });
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
        if (S.tab === 'fill') {
            const task = S.fillTask || {};
            const attempt = (task.ids || []).map((tid, i) => {
                if ((task.gaps || []).indexOf(i) === -1) return (byId(tid) || {}).text || tid;
                return (byId(S.fillPlaced[i]) || {}).text || '___';
            }).join(' ');
            return {
                task: 'Fill the gaps by dragging tiles into the blanks. . means statement, ? means question.',
                attempt: attempt,
                extra: 'Checker note (EN): ' + (S.fillFbEn || '') + ' / (PL): ' + (S.fillFbPl || '')
            };
        }
        if (S.tab === 'build' || S.tab === 'creator') {
            const tiles = currentBuildTiles();
            const attempt = joinSpeak(tiles) || tiles.map((t) => t.text).join(' ');
            const picture = S.buildPrompt && S.buildPrompt.ids
                ? S.buildPrompt.ids.map((id) => (byId(id) || {}).text || id).join(' ')
                : '';
            return {
                task: S.tab === 'creator'
                    ? 'Creator mode: invent a grammatically correct English sentence with colour tiles (to be, and/or, Wh-words, . or ? allowed).'
                    : 'Build a sentence with colour tiles.',
                attempt: attempt,
                extra: (picture ? 'The picture wanted this order: ' + picture + '. ' : '') +
                    'Goal: ' + (S.goal || 'free creator') + '. Short checker note (EN): ' + (S.buildFbEn || '') +
                    ' / (PL): ' + (S.buildFbPl || '')
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
            ? "there is/are, am/is/are (to be), have got, can/can't, like, don't like, must, have to, don't + have to, a/an/some/any, and/or, Wh-questions (who/what/where/when/why/how), statement . vs question ?"
            : "there is/are, am/is/are (to be), have got, can/can't, like, don't like, a/an, and/or, Wh-questions (who/what/where/how), statement . vs question ?, place prepositions";
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
        if (S.tab === 'creator') {
            checkCreator();
            return;
        }
        if (useSlots()) {
            ensureSlots();
            if (S.slots.some((id) => !id)) {
                S.buildOk = false;
                S.buildFbEn = 'Fill every space. Tap a blank for a colour hint, then choose a tile.';
                S.buildFbPl = 'Wypełnij każde miejsce. Kliknij puste pole (podpowiedź koloru), potem wybierz kafel.';
                S.buildSpoken = '';
                render();
                return;
            }
            const tiles = chainTiles(S.slots);
            const v = validateChain(tiles);
            if (!v.ok) {
                S.buildOk = false;
                S.buildFbEn = v.en;
                S.buildFbPl = v.pl;
                S.buildSpoken = '';
                render();
                return;
            }
            if (!promptMatches(tiles, S.buildPrompt)) {
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
            return;
        }

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

    async function checkCreator() {
        if (S.buildChecking) return;
        const tiles = chainTiles(S.chain);
        if (!tiles.length) {
            S.buildOk = false;
            S.buildFbEn = 'Make a sentence with the tiles first.';
            S.buildFbPl = 'Najpierw ułóż zdanie z kafelków.';
            S.buildSpoken = '';
            render();
            return;
        }
        const attempt = joinSpeak(tiles) || tiles.map((t) => t.text).join(' ');
        S.buildChecking = true;
        S.buildOk = false;
        S.buildSpoken = '';
        S.buildFbEn = 'AI is checking your sentence…';
        S.buildFbPl = 'AI sprawdza Twoje zdanie…';
        const gen = (S.askWhyGen || 0);
        render();

        const age = S.ageBand === 'older' ? '10–12' : '8–9';
        const grammar = S.ageBand === 'older'
            ? "there is/are, am/is/are + negatives, have got, can/can't, like, don't like, must, have to, don't + have to, a/an/some/any, and/or, Wh-words, place prepositions, end with . or ?"
            : "there is/are, am/is/are + negatives, have got, can/can't, like, don't like, a/an, and/or, Who/What/Where/How, place prepositions, end with . or ?";
        const prompt = `You are a kind English teacher for a Polish child (age ${age}).
${ageWhyVoice()}
The child built this sentence with word tiles: "${attempt}"
Tile words in order: ${tiles.map((t) => t.text).join(' | ')}.

Decide if the sentence is grammatically correct for this age and these patterns: ${grammar}.
Treat tile "." as a full stop (statement) and "?" as a question mark — the ending must match the sentence type.
Accept natural capitalisation even if tiles omit it.
Reject nonsense, wrong word order, wrong agreement (is/are, am/is/are, have/has got), or grammar beyond the allowed list.

Return JSON only:
{ "ok": true/false, "explainEn": "1-3 short lines; if wrong, say what to fix and give ONE corrected example with **bold** English words", "explainPl": "same idea in simple Polish with **bold** English words", "sentence": "clean corrected English sentence if ok or a good fix if not" }`;

        if (typeof global.fetchGenerativeAI !== 'function') {
            if (S.askWhyGen !== gen) {
                S.buildChecking = false;
                return;
            }
            S.buildChecking = false;
            S.buildOk = false;
            S.buildFbEn = 'AI is not available right now. Try again later.';
            S.buildFbPl = 'AI jest teraz niedostępne. Spróbuj później.';
            render();
            return;
        }

        const data = await global.fetchGenerativeAI(prompt);
        if (S.askWhyGen !== gen) {
            S.buildChecking = false;
            return;
        }
        S.buildChecking = false;
        if (data && data.__error) {
            S.buildOk = false;
            S.buildFbEn = data.__error;
            S.buildFbPl = data.__error;
            render();
            return;
        }

        const ok = !!(data && data.ok);
        S.buildOk = ok;
        S.buildFbEn = (data && (data.explainEn || data.hintEn)) || (ok ? 'Yes! Great sentence.' : 'Not quite. Try again.');
        S.buildFbPl = (data && (data.explainPl || data.hintPl)) || S.buildFbEn;
        S.buildSpoken = (data && data.sentence) || attempt;
        if (ok) {
            if (!S.buildAwarded) {
                S.buildAwarded = true;
                award(10, { tab: 'creator', sentence: S.buildSpoken });
                rememberColourSentence(S.buildSpoken, polishFromTiles(tiles), tiles);
            }
            speak(S.buildSpoken);
        }
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
            slots: null,
            slotHints: {},
            activeSlot: null,
            movingFrom: null,
            heldId: null,
            buildPrompt: null,
            buildFbEn: '',
            buildFbPl: '',
            buildOk: false,
            buildSpoken: '',
            buildAwarded: false,
            buildChecking: false,
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
            fillTask: null,
            fillBank: [],
            fillPlaced: {},
            fillHeld: null,
            fillActive: null,
            fillDragFrom: null,
            fillFbEn: '',
            fillFbPl: '',
            fillOk: false,
            fillAwarded: false,
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
        const startTab = global.colourStartTab || (S && S.tab) || 'build';
        global.colourStartTab = null;
        S = defaultState(age);
        S.polish = keepPolish;
        S.tilePl = keepTilePl;
        S.sheetsOpen = keepSheets;
        const okTabs = { build: 1, creator: 1, fill: 1, text: 1, lineup: 1 };
        S.tab = okTabs[startTab] ? startTab : 'build';
        if (S.tab === 'creator') S.sheetsOpen = defaultSheetsOpen();
        const badge = document.getElementById('colour-age-badge');
        if (badge) badge.textContent = S.ageBand === 'older' ? '10–12' : '8–9';
        loadTextTask();
        if (S.tab === 'fill') loadFillTask();
        if (S.tab === 'lineup' && global.LineUp) global.LineUp.reset(S.ageBand, S.polish);
        render();
    }

    global.initColourBlocks = initColourBlocks;
})(typeof window !== 'undefined' ? window : globalThis);
