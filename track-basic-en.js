/* A1/A2 high-frequency English words (lemmas + common forms) with short Polish glosses.
   Used to (1) reject Track sentences that pile on extra vocabulary and (2) cheaply
   backfill tap-to-translate hint segments when the model did not return them. */
export const BASIC_EN_PHRASES = ['have got', 'there is', 'there are', 'going to', 'a lot', 'a lot of', 'put on', 'get up'];

/** lemma -> short Polish gloss. Irregular forms are listed as their own keys where the lemma would not expand to them. */
const GLOSS = {
    a: 'jakiś', an: 'jakiś', the: 'ten', this: 'ten', that: 'tamten', these: 'te', those: 'tamte',
    i: 'ja', me: 'mnie', my: 'mój', mine: 'mój', myself: 'się',
    you: 'ty', your: 'twój', yours: 'twój', yourself: 'się',
    he: 'on', him: 'jego', his: 'jego', himself: 'się',
    she: 'ona', her: 'jej', hers: 'jej', herself: 'się',
    it: 'to', its: 'jego', itself: 'się',
    we: 'my', us: 'nas', our: 'nasz', ours: 'nasz', ourselves: 'się',
    they: 'oni', them: 'ich', their: 'ich', theirs: 'ich', themselves: 'się',
    who: 'kto', what: 'co', which: 'który', where: 'gdzie', when: 'kiedy', why: 'dlaczego', how: 'jak',
    whose: 'czyj', whom: 'kogo',
    be: 'być', am: 'jestem', is: 'jest', are: 'są', was: 'był', were: 'byli', been: 'być', being: 'będąc',
    have: 'mieć', has: 'ma', had: 'miał', having: 'mając',
    do: 'robić', does: 'robi', did: 'zrobił', done: 'zrobiony', doing: 'robiąc',
    can: 'móc', could: 'mógł', cannot: 'nie móc',
    will: 'będzie', would: 'by', shall: 'będzie', should: 'powinien',
    may: 'móc', might: 'mógłby', must: 'musieć',
    'let\'s': 'chodźmy', let: 'pozwolić',
    not: 'nie', no: 'nie', yes: 'tak', ok: 'dobrze', please: 'proszę', thanks: 'dziękuję', thank: 'dziękować',
    and: 'i', or: 'lub', but: 'ale', so: 'więc', because: 'bo', if: 'jeśli', then: 'potem', than: 'niż',
    as: 'jak', than: 'niż', though: 'chociaż', although: 'chociaż',
    of: 'z', in: 'w', on: 'na', at: 'w', to: 'do', for: 'dla', from: 'z', with: 'z', without: 'bez',
    about: 'o', into: 'do', onto: 'na', over: 'nad', under: 'pod', up: 'w górę', down: 'w dół',
    out: 'na zewnątrz', off: 'z', by: 'przy', near: 'blisko', next: 'następny', between: 'między',
    behind: 'za', in: 'w', front: 'przód', after: 'po', before: 'przed', during: 'podczas',
    through: 'przez', across: 'przez', around: 'wokół', along: 'wzdłuż', against: 'przeciw',
    among: 'wśród', above: 'nad', below: 'poniżej', inside: 'w środku', outside: 'na zewnątrz',
    here: 'tutaj', there: 'tam', everywhere: 'wszędzie', somewhere: 'gdzieś', nowhere: 'nigdzie',
    away: 'precz', back: 'z powrotem', again: 'znowu', still: 'nadal', already: 'już', yet: 'jeszcze',
    just: 'właśnie', only: 'tylko', also: 'też', too: 'też', very: 'bardzo', really: 'naprawdę',
    quite: 'całkiem', almost: 'prawie', always: 'zawsze', never: 'nigdy', often: 'często',
    sometimes: 'czasem', usually: 'zwykle', today: 'dziś', tomorrow: 'jutro', yesterday: 'wczoraj',
    now: 'teraz', then: 'potem', soon: 'wkrótce', later: 'później', early: 'wcześnie', late: 'późno',
    once: 'raz', twice: 'dwa razy',
    one: 'jeden', two: 'dwa', three: 'trzy', four: 'cztery', five: 'pięć', six: 'sześć',
    seven: 'siedem', eight: 'osiem', nine: 'dziewięć', ten: 'dziesięć', eleven: 'jedenaście', twelve: 'dwanaście',
    first: 'pierwszy', second: 'drugi', third: 'trzeci', last: 'ostatni', next: 'następny',
    many: 'wiele', much: 'dużo', more: 'więcej', most: 'najwięcej', some: 'trochę', any: 'jakiś',
    few: 'kilka', little: 'mało', lot: 'dużo', all: 'wszystko', every: 'każdy', each: 'każdy',
    both: 'oba', other: 'inny', another: 'inny', same: 'ten sam', such: 'taki', own: 'własny',
    something: 'coś', anything: 'cokolwiek', nothing: 'nic', everything: 'wszystko',
    someone: 'ktoś', anyone: 'ktokolwiek', everyone: 'wszyscy', nobody: 'nikt',
    somebody: 'ktoś', anybody: 'ktokolwiek', everybody: 'wszyscy',
    big: 'duży', small: 'mały', little: 'mały', long: 'długi', short: 'krótki', tall: 'wysoki',
    high: 'wysoki', low: 'niski', new: 'nowy', old: 'stary', young: 'młody',
    good: 'dobry', better: 'lepszy', best: 'najlepszy', bad: 'zły', worse: 'gorszy', worst: 'najgorszy',
    nice: 'miły', great: 'świetny', fine: 'w porządku', well: 'dobrze', right: 'prawidłowy', wrong: 'zły',
    happy: 'szczęśliwy', sad: 'smutny', tired: 'zmęczony', hungry: 'głodny', thirsty: 'spragniony',
    hot: 'gorący', cold: 'zimny', warm: 'ciepły', cool: 'chłodny',
    easy: 'łatwy', hard: 'trudny', difficult: 'trudny', important: 'ważny', interesting: 'ciekawy',
    beautiful: 'piękny', pretty: 'ładny', clean: 'czysty', dirty: 'brudny',
    open: 'otwarty', closed: 'zamknięty', full: 'pełny', empty: 'pusty',
    early: 'wczesny', late: 'późny', ready: 'gotowy', busy: 'zajęty', free: 'wolny',
    fast: 'szybki', quick: 'szybki', slow: 'wolny', strong: 'silny', weak: 'słaby',
    heavy: 'ciężki', light: 'lekki', dark: 'ciemny', bright: 'jasny',
    thick: 'gęsty', thin: 'cienki', soft: 'miękki', hard: 'twardy',
    left: 'lewy', right: 'prawy', far: 'daleko', close: 'blisko',
    red: 'czerwony', blue: 'niebieski', green: 'zielony', yellow: 'żółty', black: 'czarny',
    white: 'biały', brown: 'brązowy', orange: 'pomarańczowy', pink: 'różowy', grey: 'szary', gray: 'szary',
    go: 'iść', come: 'przyjść', get: 'dostać', got: 'dostał', give: 'dać', take: 'brać', make: 'robić',
    see: 'widzieć', look: 'patrzeć', watch: 'oglądać', listen: 'słuchać', hear: 'słyszeć',
    know: 'wiedzieć', think: 'myśleć', say: 'mówić', tell: 'powiedzieć', talk: 'rozmawiać', speak: 'mówić',
    ask: 'pytać', answer: 'odpowiadać', call: 'dzwonić',
    want: 'chcieć', like: 'lubić', love: 'kochać', need: 'potrzebować', hope: 'mieć nadzieję',
    feel: 'czuć', find: 'znaleźć', try: 'próbować', use: 'używać', help: 'pomagać',
    start: 'zaczynać', begin: 'zaczynać', stop: 'zatrzymać się', finish: 'skończyć', end: 'kończyć',
    open: 'otwierać', close: 'zamykać', put: 'kłaść', keep: 'trzymać', leave: 'wychodzić',
    live: 'mieszkać', stay: 'zostać', wait: 'czekać', sit: 'siedzieć', stand: 'stać',
    walk: 'iść', run: 'biegać', jump: 'skakać', swim: 'pływać', ride: 'jechać', drive: 'prowadzić',
    fly: 'latać', travel: 'podróżować', visit: 'odwiedzać', meet: 'spotykać',
    eat: 'jeść', drink: 'pić', cook: 'gotować', sleep: 'spać', wake: 'budzić się',
    work: 'pracować', play: 'grać', read: 'czytać', write: 'pisać', learn: 'uczyć się',
    study: 'uczyć się', teach: 'uczyć', draw: 'rysować', sing: 'śpiewać', dance: 'tańczyć',
    buy: 'kupować', sell: 'sprzedawać', pay: 'płacić', spend: 'wydawać', cost: 'kosztować',
    bring: 'przynieść', carry: 'nosić', send: 'wysyłać', show: 'pokazywać',
    wear: 'nosić', wash: 'myć', clean: 'sprzątać',
    come: 'przychodzić', arrive: 'przyjeżdżać', leave: 'wyjeżdżać', return: 'wracać',
    remember: 'pamiętać', forget: 'zapominać', understand: 'rozumieć',
    choose: 'wybierać', change: 'zmieniać', move: 'przenosić', turn: 'skręcać',
    break: 'łamać', cut: 'ciąć', hit: 'uderzać', catch: 'łapać', throw: 'rzucać',
    build: 'budować', grow: 'rosnąć', fall: 'upadać', happen: 'zdarzać się',
    become: 'stawać się', seem: 'wydawać się', look: 'wyglądać',
    lose: 'gubić', win: 'wygrywać', follow: 'iść za',
    smile: 'uśmiechać się', laugh: 'śmiać się', cry: 'płakać',
    rain: 'padać', snow: 'śnieżyć', shine: 'świecić',
    cover: 'przykrywać', fill: 'napełniać',
    must: 'musieć', should: 'powinien',
    // nouns
    man: 'mężczyzna', men: 'mężczyźni', woman: 'kobieta', women: 'kobiety',
    boy: 'chłopiec', girl: 'dziewczynka', child: 'dziecko', children: 'dzieci',
    baby: 'niemowlę', person: 'osoba', people: 'ludzie', friend: 'przyjaciel',
    family: 'rodzina', mother: 'matka', father: 'ojciec', mum: 'mama', dad: 'tata',
    sister: 'siostra', brother: 'brat', son: 'syn', daughter: 'córka',
    parent: 'rodzic', grandmother: 'babcia', grandfather: 'dziadek',
    wife: 'żona', husband: 'mąż',
    teacher: 'nauczyciel', student: 'uczeń', doctor: 'lekarz',
    name: 'imię', word: 'słowo', sentence: 'zdanie', question: 'pytanie', answer: 'odpowiedź',
    number: 'liczba', letter: 'list', story: 'opowiadanie', book: 'książka', page: 'strona',
    school: 'szkoła', class: 'klasa', lesson: 'lekcja', homework: 'praca domowa', test: 'sprawdzian',
    home: 'dom', house: 'dom', room: 'pokój', door: 'drzwi', window: 'okno', wall: 'ściana',
    floor: 'podłoga', table: 'stół', chair: 'krzesło', bed: 'łóżko', kitchen: 'kuchnia',
    bathroom: 'łazienka', garden: 'ogród', street: 'ulica', town: 'miasto', city: 'miasto',
    village: 'wieś', country: 'kraj', world: 'świat', place: 'miejsce',
    shop: 'sklep', park: 'park', station: 'stacja', airport: 'lotnisko', hospital: 'szpital',
    bank: 'bank', hotel: 'hotel', restaurant: 'restauracja', cafe: 'kawiarnia',
    car: 'samochód', bus: 'autobus', train: 'pociąg', bike: 'rower', plane: 'samolot',
    boat: 'łódź', road: 'droga', way: 'droga', map: 'mapa', ticket: 'bilet',
    day: 'dzień', night: 'noc', morning: 'ranek', afternoon: 'popołudnie', evening: 'wieczór',
    week: 'tydzień', month: 'miesiąc', year: 'rok', time: 'czas', hour: 'godzina',
    minute: 'minuta', moment: 'chwila', birthday: 'urodziny',
    monday: 'poniedziałek', tuesday: 'wtorek', wednesday: 'środa', thursday: 'czwartek',
    friday: 'piątek', saturday: 'sobota', sunday: 'niedziela',
    spring: 'wiosna', summer: 'lato', autumn: 'jesień', winter: 'zima',
    weather: 'pogoda', sun: 'słońce', moon: 'księżyc', star: 'gwiazda', sky: 'niebo',
    rain: 'deszcz', snow: 'śnieg', wind: 'wiatr', cloud: 'chmura', water: 'woda',
    fire: 'ogień', air: 'powietrze', ice: 'lód', sea: 'morze', river: 'rzeka',
    tree: 'drzewo', flower: 'kwiat', animal: 'zwierzę', dog: 'pies', cat: 'kot',
    bird: 'ptak', fish: 'ryba', food: 'jedzenie', breakfast: 'śniadanie', lunch: 'obiad',
    dinner: 'kolacja', meal: 'posiłek', bread: 'chleb', butter: 'masło', cheese: 'ser',
    milk: 'mleko', tea: 'herbata', coffee: 'kawa', juice: 'sok', fruit: 'owoc',
    apple: 'jabłko', banana: 'banan', orange: 'pomarańcza', vegetable: 'warzywo',
    meat: 'mięso', egg: 'jajko', rice: 'ryż', potato: 'ziemniak', tomato: 'pomidor',
    cake: 'ciasto', sugar: 'cukier', salt: 'sól',
    body: 'ciało', head: 'głowa', face: 'twarz', eye: 'oko', ear: 'ucho', nose: 'nos',
    mouth: 'usta', hair: 'włosy', hand: 'ręka', arm: 'ramię', leg: 'noga', foot: 'stopa',
    feet: 'stopy', back: 'plecy',
    clothes: 'ubrania', shirt: 'koszula', shoe: 'but', hat: 'czapka', coat: 'płaszcz',
    bag: 'torba', phone: 'telefon', computer: 'komputer', television: 'telewizor', tv: 'telewizor',
    music: 'muzyka', film: 'film', game: 'gra', sport: 'sport', ball: 'piłka',
    match: 'mecz', team: 'drużyna', photo: 'zdjęcie', picture: 'obraz',
    job: 'praca', work: 'praca', money: 'pieniądze', price: 'cena',
    problem: 'problem', idea: 'pomysł', thing: 'rzecz', part: 'część',
    colour: 'kolor', color: 'kolor', size: 'rozmiar',
    language: 'język', english: 'angielski', polish: 'polski',
    paper: 'papier', pen: 'długopis', pencil: 'ołówek',
    harbour: 'port', harbor: 'port', port: 'port',
    news: 'wiadomości', plan: 'plan', help: 'pomoc',
    trip: 'wycieczka', holiday: 'wakacje', party: 'impreza',
    sand: 'piasek', mud: 'błoto', hay: 'siano',
    // leftover verbs / adjectives used in existing banked fixtures
    really: 'naprawdę', everybody: 'wszyscy',
};

const IRREGULAR_EXTRA = `
am is are was were been being
has had having
does did done doing
got gotten getting
goes went gone going
gives gave given giving
takes took taken taking
makes made making
comes came coming
sees saw seen seeing
looks looked looking
watches watched watching
listens listened listening
hears heard hearing
knows knew known knowing
thinks thought thinking
says said saying
tells told telling
talks talked talking
speaks spoke spoken speaking
asks asked asking
answers answered answering
calls called calling
wants wanted wanting
likes liked liking
loves loved loving
needs needed needing
hopes hoped hoping
feels felt feeling
finds found finding
tries tried trying
uses used using
helps helped helping
starts started starting
begins began begun beginning
stops stopped stopping
finishes finished finishing
ends ended ending
opens opened opening
closes closed closing
puts putting
keeps kept keeping
leaves left leaving
lives lived living
stays stayed staying
waits waited waiting
sits sat sitting
stands stood standing
walks walked walking
runs ran running
jumps jumped jumping
swims swam swum swimming
rides rode ridden riding
drives drove driven driving
flies flew flown flying
travels travelled traveled traveling travelling
visits visited visiting
meets met meeting
eats ate eaten eating
drinks drank drunk drinking
cooks cooked cooking
sleeps slept sleeping
wakes woke woken waking
works worked working
plays played playing
reads reading
writes wrote written writing
learns learned learnt learning
studies studied studying
teaches taught teaching
draws drew drawn drawing
sings sang sung singing
dances danced dancing
buys bought buying
sells sold selling
pays paid paying
spends spent spending
costs cost costing
brings brought bringing
carries carried carrying
sends sent sending
shows showed shown showing
wears wore worn wearing
washes washed washing
cleans cleaned cleaning
arrives arrived arriving
returns returned returning
remembers remembered remembering
forgets forgot forgotten forgetting
understands understood understanding
chooses chose chosen choosing
changes changed changing
moves moved moving
turns turned turning
breaks broke broken breaking
cuts cutting
hits hitting
catches caught catching
throws threw thrown throwing
builds built building
grows grew grown growing
falls fell fallen falling
happens happened happening
becomes became becoming
seems seemed seeming
loses lost losing
wins won winning
follows followed following
smiles smiled smiling
laughs laughed laughing
cries cried crying
rains rained raining
snows snowed snowing
shines shone shining
covers covered covering
fills filled filling
cannot don't doesn't didn't can't won't isn't aren't wasn't weren't
haven't hasn't hadn't let's there's they're we're he's she's that's
what's who's where's i'm you're it's we'll they'll we'll
`.trim();

function expandRegular(w) {
    const out = new Set([w]);
    if (!/^[a-z]+$/.test(w) || w.length < 2) return out;
    out.add(w + 's');
    if (w.endsWith('y') && w.length > 2 && !/[aeiou]y$/.test(w)) {
        out.add(w.slice(0, -1) + 'ies');
        out.add(w.slice(0, -1) + 'ied');
    } else {
        out.add(w + 'es');
        out.add(w + 'ed');
    }
    if (w.endsWith('e')) out.add(w + 'd'), out.add(w + 's'), out.add(w.slice(0, -1) + 'ing');
    else out.add(w + 'ing');
    if (w.endsWith('y') && !/[aeiou]y$/.test(w)) out.add(w.slice(0, -1) + 'ier'), out.add(w.slice(0, -1) + 'iest');
    else { out.add(w + 'er'); out.add(w + 'est'); }
    return out;
}

const FORM_TO_PL = new Map();
const BASIC_SET = new Set();

function addForm(form, pl) {
    const f = String(form || '').toLowerCase().replace(/’/g, "'");
    if (!f) return;
    BASIC_SET.add(f);
    if (pl && !FORM_TO_PL.has(f)) FORM_TO_PL.set(f, pl);
}

for (const [lemma, pl] of Object.entries(GLOSS)) {
    for (const f of expandRegular(lemma)) addForm(f, pl);
    addForm(lemma, pl);
}
const CONTRACTION_PL = {
    "don't": 'nie', "doesn't": 'nie', "didn't": 'nie', "can't": 'nie móc', cannot: 'nie móc',
    "won't": 'nie będzie', "isn't": 'nie jest', "aren't": 'nie są', "wasn't": 'nie był', "weren't": 'nie byli',
    "haven't": 'nie mieć', "hasn't": 'nie ma', "hadn't": 'nie miał', "let's": 'chodźmy',
    "there's": 'jest', "they're": 'oni są', "we're": 'jesteśmy', "he's": 'on jest', "she's": 'ona jest',
    "that's": 'to jest', "what's": 'co jest', "who's": 'kto jest', "where's": 'gdzie jest',
    "i'm": 'jestem', "you're": 'jesteś', "it's": 'to jest', "we'll": 'będziemy', "they'll": 'oni będą',
};
for (const line of IRREGULAR_EXTRA.split('\n')) {
    const forms = line.trim().split(/\s+/).filter(Boolean);
    if (!forms.length) continue;
    const pl = forms.map((f) => FORM_TO_PL.get(f) || GLOSS[f] || CONTRACTION_PL[f] || '').find(Boolean) || '';
    for (const f of forms) addForm(f, CONTRACTION_PL[f] || pl);
}
for (const ph of BASIC_EN_PHRASES) {
    addForm(ph, ph === 'have got' ? 'mieć' : ph === 'going to' ? 'zamierzać' : ph === 'put on' ? 'założyć' : ph === 'get up' ? 'wstać' : ph === 'a lot' || ph === 'a lot of' ? 'dużo' : ph);
}

export const BASIC_EN = BASIC_SET;
export const BASIC_EN_COUNT = BASIC_SET.size;
export const BASIC_EN_LEMMA_COUNT = Object.keys(GLOSS).length;

export function isBasicEn(token) {
    const t = String(token || '').toLowerCase().replace(/^[^\p{L}']+|[^\p{L}']+$/gu, '').replace(/’/g, "'");
    return Boolean(t) && BASIC_SET.has(t);
}

export function basicPl(token) {
    const t = String(token || '').toLowerCase().replace(/^[^\p{L}']+|[^\p{L}']+$/gu, '').replace(/’/g, "'");
    return FORM_TO_PL.get(t) || '';
}
