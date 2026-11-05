/**
 * Stamp Rush AI cloze prompts — meaningful unique sentences + word-formation realise cards.
 * Pure helpers; server.js runs the model via runVisionJsonPrompt (CURSOR_API_KEY).
 * Prefer AI for every card: generateStampClozePack retries rejected/missing slots and
 * only fills curated fallbacks when the AI is completely unavailable or still incomplete.
 */

export function buildStampClozePrompt({ box, variantCount = 2, level = 'intermediate', topic = '' } = {}) {
    const terms = (box || []).map((b, i) => `${i + 1}. ${b.term} — ${b.definition}`).join('\n');
    const k = Math.max(1, Math.min(8, Number(variantCount) || 2));
    const levelHint = level === 'beginner' || level === 'easy'
        ? 'A2–B1 school English'
        : level === 'advanced'
            ? 'B2–C1 school English'
            : 'B1–B2 school English';
    const topicLine = String(topic || '').trim()
        ? `Lesson topic / theme: ${String(topic).trim()}. Every sentence must feel natural for this topic and for the word's definition.`
        : 'Lesson topic: use the shared theme of the word list (infer it from the definitions). Every sentence must fit that theme.';
    return `You write cloze cards for Stamp Rush, a classroom vocabulary race (${levelHint}).

${topicLine}

VOCAB BOX (exactly these ${box?.length || 0} terms — use each one; keep the meaning in the definition):
${terms}

For EACH term write exactly ${k} UNIQUE variants. Every sentence must be different (no recycled frames).

Each variant has two modes:
1) recognise — one natural English sentence (10–20 words) with exactly one blank "___" where the BASE TERM fits as written. The surrounding words must make that meaning unmistakable from the definition (do NOT quote or paste the definition). Answer = the base term exactly as listed.
2) realise — a DIFFERENT natural sentence (10–20 words) with exactly one blank "___" that needs a CHANGED FORM of the base term (exam-style word formation: noun↔adjective, verb→noun/-ing, adverb, plural, comparative, etc.). Cue = base term in CAPS. Answer = the changed form only (one word preferred; hyphenated OK). Answer must NOT equal the base term (ignore case). Never put the base form in the blank.

Word-formation quality (prime importance):
- The gap answer must be the ONE natural form that completes the sentence; another form of the same word must NOT also fit.
- The sentence situation must match the word's meaning and the lesson topic (travel words → travel scenes; feelings → people/feelings; school words → school life, etc.).
- Prefer common, teachable word families. If a rare term has no natural family, use a clear inflection (plural, 3rd-person -s, -ing, -ed) that still changes the spelling AND fits the sentence meaning.

Rules:
- Exactly one "___" per sentence; grammatical; no meta talk about stamps, postcards, vocabulary, lessons, gaps or blanks.
- Do not invent a meaning that contradicts the given definition.
- Sentences must be meaningful and unique across the whole reply.

Return ONLY valid JSON:
{"cards":[{"term":"<exact term from list>","variants":[{"recognise":{"sentence":"... ___ ...","answer":"<base term>"},"realise":{"sentence":"... ___ ...","cue":"<BASE TERM CAPS>","answer":"<changed form>"}}]}]}`;
}

function oneGap(s) {
    return (String(s || '').match(/_{3,}/g) || []).length === 1;
}

function cleanSentence(s) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .replace(/_{4,}/g, '___')
        .trim()
        .slice(0, 220);
}

function cleanAnswer(s) {
    return String(s || '').replace(/<[^>]*>/g, '').trim().slice(0, 80);
}

function sameWord(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/* ---------- fallback word formation (no AI): real English forms + sentences that fit them ---------- */
const ADJ_Y = new Set(['happy', 'easy', 'busy', 'angry', 'funny', 'lucky', 'heavy', 'tidy', 'lazy', 'noisy', 'sunny', 'rainy', 'windy', 'cloudy', 'dirty', 'hungry', 'healthy', 'friendly', 'pretty', 'ugly', 'tiny', 'crazy', 'sleepy', 'thirsty', 'ready', 'empty', 'shy', 'messy', 'silly', 'lonely', 'tasty', 'wealthy', 'sticky', 'scary']);
const ADJ_LY = new Set(['quick', 'slow', 'quiet', 'loud', 'kind', 'polite', 'rude', 'brave', 'calm', 'clear', 'strong', 'weak', 'bright', 'soft', 'safe', 'warm', 'cold', 'sad', 'glad', 'proud', 'honest', 'patient', 'quiet', 'polite', 'serious', 'simple', 'gentle', 'nervous', 'rapid', 'sudden', 'usual', 'final', 'real', 'quick', 'careful', 'careless', 'beautiful', 'dangerous', 'famous', 'polite', 'perfect', 'certain', 'recent', 'correct', 'exact', 'main', 'fair', 'free', 'open', 'secret', 'silent', 'smooth', 'sweet', 'tight', 'violent', 'wise', 'eager', 'equal', 'formal', 'normal', 'natural', 'physical', 'basic', 'tragic', 'dramatic']);
const VERBS = new Set(['decide', 'prepare', 'arrive', 'depart', 'explain', 'describe', 'improve', 'choose', 'travel', 'visit', 'open', 'close', 'remember', 'forget', 'begin', 'finish', 'listen', 'answer', 'help', 'learn', 'teach', 'read', 'write', 'speak', 'talk', 'walk', 'run', 'swim', 'play', 'study', 'try', 'cry', 'carry', 'worry', 'hurry', 'stop', 'plan', 'shop', 'sit', 'get', 'cook', 'clean', 'wash', 'watch', 'catch', 'fix', 'mix', 'pass', 'relax', 'prevent', 'pretend', 'present', 'protect', 'collect', 'invent', 'discover', 'explore', 'imagine', 'practise', 'practice', 'organise', 'organize', 'complain', 'agree', 'argue', 'apologise', 'apologize', 'borrow', 'lend', 'deliver', 'post', 'send', 'receive', 'check', 'count', 'jump', 'climb', 'dance', 'sing', 'build', 'grow', 'paint', 'draw', 'fly', 'drive', 'ride', 'save', 'spend', 'pay', 'order', 'book', 'pack', 'enjoy', 'hate', 'like', 'love', 'need', 'want', 'wait', 'work', 'move', 'change', 'compare', 'create', 'develop', 'discuss', 'include', 'increase', 'reduce', 'repeat', 'return', 'solve', 'support', 'suggest']);
const ALREADY_PLURAL = new Set(['customs', 'goods', 'clothes', 'trousers', 'scissors', 'glasses', 'sunglasses', 'stairs', 'premises', 'thanks', 'congratulations', 'outskirts', 'surroundings', 'belongings']);
const UNCOUNTABLE = new Set(['luggage', 'baggage', 'information', 'advice', 'homework', 'furniture', 'news', 'equipment', 'knowledge', 'money', 'music', 'traffic', 'weather', 'rice', 'bread', 'water', 'milk', 'research', 'evidence', 'progress', 'software', 'jewellery', 'jewelry', 'accommodation', 'rubbish', 'garbage', 'grammar', 'vocabulary', 'health', 'happiness', 'fun']);
const DOUBLE_FINAL = new Set(['begin', 'forget', 'prefer', 'refer', 'occur', 'admit', 'permit', 'regret', 'upset', 'control', 'travel', 'commit', 'submit', 'equip']);
const F_PLURAL_KEEP = new Set(['roof', 'chief', 'belief', 'proof', 'chef', 'cliff', 'giraffe', 'safe', 'cafe', 'café']);
const IRREGULAR_PLURAL = { child: 'children', person: 'people', man: 'men', woman: 'women', foot: 'feet', tooth: 'teeth', mouse: 'mice', goose: 'geese' };
/** Irregular or loosely related forms accepted as word-formation answers. */
const IRREGULAR_FORMS = {
    afraid: ['fear', 'fearful', 'fearlessly', 'fears'],
    high: ['height', 'highly'],
    wide: ['width', 'widely'],
    long: ['length', 'lengthy'],
    strong: ['strength', 'strongly'],
    hungry: ['hunger'],
    thirsty: ['thirst'],
    proud: ['pride', 'proudly'],
    brave: ['bravery', 'bravely'],
};

const isVowel = (c) => /[aeiou]/.test(c);
const consonantY = (w) => /[^aeiou]y$/.test(w);

export function pluralOf(word) {
    const w = String(word).toLowerCase();
    if (ALREADY_PLURAL.has(w)) return w;
    if (IRREGULAR_PLURAL[w]) return IRREGULAR_PLURAL[w];
    if (consonantY(w)) return `${w.slice(0, -1)}ies`;
    if (/(s|x|z|ch|sh)$/.test(w)) return `${w}es`;
    if (!F_PLURAL_KEEP.has(w) && /[^f]fe$/.test(w)) return `${w.slice(0, -2)}ves`;
    if (!F_PLURAL_KEEP.has(w) && /[^f]f$/.test(w)) return `${w.slice(0, -1)}ves`;
    if (/[^aeiou]o$/.test(w) && ['potato', 'tomato', 'hero', 'echo'].includes(w)) return `${w}es`;
    return `${w}s`;
}

export function ingOf(verb) {
    const w = String(verb).toLowerCase();
    if (/ie$/.test(w)) return `${w.slice(0, -2)}ying`;
    if (/[^aeiouy]e$/.test(w) && !/(ee|ye|oe)$/.test(w)) return `${w.slice(0, -1)}ing`;
    const groups = (w.match(/[aeiou]+/g) || []).length;
    const cvc = w.length >= 3 && !isVowel(w.at(-1)) && !/[wxy]$/.test(w) && isVowel(w.at(-2)) && !isVowel(w.at(-3));
    if (cvc && (groups === 1 || DOUBLE_FINAL.has(w))) return `${w}${w.at(-1)}ing`;
    return `${w}ing`;
}

export function adverbOf(adj) {
    const w = String(adj).toLowerCase();
    if (w === 'true') return 'truly';
    if (w === 'full') return 'fully';
    if (consonantY(w)) return `${w.slice(0, -1)}ily`;
    if (/[^aeiou]le$/.test(w)) return `${w.slice(0, -1)}y`;
    if (/ic$/.test(w)) return `${w}ally`;
    if (/ll$/.test(w)) return `${w}y`;
    return `${w}ly`;
}

/** Guess the word class of a base term from the word itself and its definition. */
export function guessWordClass(term, definition = '') {
    const w = String(term).toLowerCase().trim();
    const d = String(definition || '').toLowerCase().trim();
    if (ADJ_Y.has(w)) return 'adj-y';
    if (/^to\s/.test(d) || VERBS.has(w) || /(ate|ise|ize|ify)$/.test(w)) return 'verb';
    if (ADJ_LY.has(w) || /(ful|ous|ive|able|ible|less|al|ic|ent|ant)$/.test(w) || /^(very\s|feeling\s|describes?\s)/.test(d)) return 'adj';
    return 'noun';
}

/**
 * Curated word-formation + recognise cards for common classroom vocab.
 * Each entry is word-specific (no shared templates). `id` is unique across the bank for frame tracking.
 */
export const CURATED_CLOZE = {
    passport: {
        realise: [
            { id: 'passport-r0', answer: 'passports', sentence: 'Travellers must show their ___ at the control desk before boarding.' },
            { id: 'passport-r1', answer: 'passports', sentence: 'Lost ___ cause long queues at embassies every summer.' },
            { id: 'passport-r2', answer: 'passport photo', sentence: 'You need a recent ___ for the visa form at the embassy.' },
        ],
        recognise: [
            { id: 'passport-g0', sentence: 'Keep your ___ safe in the inside pocket of your jacket.' },
            { id: 'passport-g1', sentence: 'Without a valid ___, the airline will not let you board the plane.' },
        ],
    },
    border: {
        realise: [
            { id: 'border-r0', answer: 'borders', sentence: 'We crossed two ___ before we finally reached the coast.' },
            { id: 'border-r1', answer: 'borders', sentence: 'Mountain ___ between the two countries are often closed in winter.' },
            { id: 'border-r2', answer: 'border control', sentence: 'Officers at ___ asked us why we were visiting the country.' },
        ],
        recognise: [
            { id: 'border-g0', sentence: 'The river forms a natural ___ between the two countries.' },
            { id: 'border-g1', sentence: 'Soldiers guarded the ___ day and night during the conflict.' },
        ],
    },
    journey: {
        realise: [
            { id: 'journey-r0', answer: 'journeys', sentence: 'Long train ___ across Europe can be tiring but exciting.' },
            { id: 'journey-r1', answer: 'journeys', sentence: 'Many short ___ by bus are cheaper than taking a taxi.' },
            { id: 'journey-r2', answer: 'journeying', sentence: 'After weeks of ___, the explorers finally saw the ocean.' },
        ],
        recognise: [
            { id: 'journey-g0', sentence: 'The ___ from London to Edinburgh took about four and a half hours.' },
            { id: 'journey-g1', sentence: 'Our overnight ___ through the mountains was surprisingly comfortable.' },
        ],
    },
    delay: {
        realise: [
            { id: 'delay-r0', answer: 'delays', sentence: 'Flight ___ at Heathrow made hundreds of passengers miss their connections.' },
            { id: 'delay-r1', answer: 'delayed', sentence: 'Our train was ___ by nearly two hours because of signal problems.' },
            { id: 'delay-r2', answer: 'delays', sentence: 'Roadworks caused serious ___ on the motorway this morning.' },
        ],
        recognise: [
            { id: 'delay-g0', sentence: 'There was a long ___ before the plane was ready for take-off.' },
            { id: 'delay-g1', sentence: 'A short ___ at the control desk made us run for the gate.' },
        ],
    },
    ticket: {
        realise: [
            { id: 'ticket-r0', answer: 'tickets', sentence: 'Please keep your ___ until you leave the railway station.' },
            { id: 'ticket-r1', answer: 'tickets', sentence: 'Online ___ for the ferry sold out within ten minutes.' },
            { id: 'ticket-r2', answer: 'ticketing', sentence: 'The ___ office opens an hour before the first train.' },
        ],
        recognise: [
            { id: 'ticket-g0', sentence: 'Show your ___ to the inspector when he walks through the carriage.' },
            { id: 'ticket-g1', sentence: 'I bought a return ___ because I am coming back on Sunday.' },
        ],
    },
    arrive: {
        realise: [
            { id: 'arrive-r0', answer: 'arriving', sentence: 'The overnight coach is ___ in the city centre at six.' },
            { id: 'arrive-r1', answer: 'arrival', sentence: 'Please wait in the hall until the ___ of flight BA472 is announced.' },
            { id: 'arrive-r2', answer: 'arrived', sentence: 'We ___ at the hostel just as it started to rain heavily.' },
        ],
        recognise: [
            { id: 'arrive-g0', sentence: 'What time does the next train ___ at platform three?' },
            { id: 'arrive-g1', sentence: 'Most guests ___ at the hotel in the late afternoon.' },
        ],
    },
    depart: {
        realise: [
            { id: 'depart-r0', answer: 'departing', sentence: 'All passengers for Rome should go to gate twelve — the plane is ___ soon.' },
            { id: 'depart-r1', answer: 'departure', sentence: 'Our ___ was moved from 9:00 to 11:30 because of fog.' },
            { id: 'depart-r2', answer: 'departed', sentence: 'The ferry ___ from the harbour before sunrise.' },
        ],
        recognise: [
            { id: 'depart-g0', sentence: 'The bus will ___ from stand B in fifteen minutes.' },
            { id: 'depart-g1', sentence: 'Cruise ships ___ from this port every Saturday morning.' },
        ],
    },
    luggage: {
        realise: [
            { id: 'luggage-r0', answer: 'luggage-free', sentence: 'With only a small backpack she enjoyed a completely ___ weekend away.' },
            { id: 'luggage-r1', answer: 'hand luggage', sentence: 'Only one piece of ___ is allowed in the cabin on this airline.' },
            { id: 'luggage-r2', answer: 'luggage rack', sentence: 'Put the heavy suitcase on the ___ above your seat.' },
        ],
        recognise: [
            { id: 'luggage-g0', sentence: 'We waited twenty minutes at the belt for our ___ to appear.' },
            { id: 'luggage-g1', sentence: 'Heavy ___ must be checked in before you go through security.' },
        ],
    },
    customs: {
        realise: [
            { id: 'customs-r0', answer: 'customs officer', sentence: 'The ___ asked us to open the suitcase and show what was inside.' },
            { id: 'customs-r1', answer: 'customs officers', sentence: 'Two ___ checked every bag coming off the international flight.' },
            { id: 'customs-r2', answer: 'customs declaration', sentence: 'Fill in the ___ if you are bringing gifts worth more than the limit.' },
        ],
        recognise: [
            { id: 'customs-g0', sentence: 'Go through ___ after you collect your bags at the airport.' },
            { id: 'customs-g1', sentence: 'Nothing to declare? Then take the green channel at ___.' },
        ],
    },
    prepare: {
        realise: [
            { id: 'prepare-r0', answer: 'preparing', sentence: 'Mum is ___ sandwiches for the long car trip tomorrow.' },
            { id: 'prepare-r1', answer: 'preparation', sentence: 'Good ___ for the exam includes revising a little every day.' },
            { id: 'prepare-r2', answer: 'prepared', sentence: 'We ___ a packing list so we would not forget our passports.' },
        ],
        recognise: [
            { id: 'prepare-g0', sentence: 'Please ___ your documents the night before you travel.' },
            { id: 'prepare-g1', sentence: 'Athletes ___ carefully for months before the competition.' },
        ],
    },
    prevent: {
        realise: [
            { id: 'prevent-r0', answer: 'preventing', sentence: 'Extra locks are useful for ___ thieves from opening the suitcase.' },
            { id: 'prevent-r1', answer: 'prevention', sentence: 'Fire ___ on planes includes no smoking in the toilets.' },
            { id: 'prevent-r2', answer: 'preventable', sentence: 'Most passport problems are ___ if you check the expiry date early.' },
        ],
        recognise: [
            { id: 'prevent-g0', sentence: 'A strong lock can ___ someone from stealing your bag.' },
            { id: 'prevent-g1', sentence: 'Vaccinations help ___ serious diseases when you travel abroad.' },
        ],
    },
    pretend: {
        realise: [
            { id: 'pretend-r0', answer: 'pretending', sentence: 'The child was ___ to be a pilot with a paper hat.' },
            { id: 'pretend-r1', answer: 'pretence', sentence: 'His friendly ___ did not hide how nervous he really felt.' },
            { id: 'pretend-r2', answer: 'pretended', sentence: 'She ___ to sleep so she would not have to talk.' },
        ],
        recognise: [
            { id: 'pretend-g0', sentence: 'Do not ___ you understand if the question is unclear.' },
            { id: 'pretend-g1', sentence: 'Little children often ___ that a box is a racing car.' },
        ],
    },
    present: {
        realise: [
            { id: 'present-r0', answer: 'presents', sentence: 'She wrapped the birthday ___ carefully in blue paper.' },
            { id: 'present-r1', answer: 'presentation', sentence: 'His ___ about the school trip impressed the whole class.' },
            { id: 'present-r2', answer: 'presented', sentence: 'The mayor ___ medals to the winning football team.' },
        ],
        recognise: [
            { id: 'present-g0', sentence: 'I bought a small ___ for my host family in Spain.' },
            { id: 'present-g1', sentence: 'Please be ___ when the teacher calls the register.' },
        ],
    },
    happy: {
        realise: [
            { id: 'happy-r0', answer: 'happiness', sentence: 'You could see the ___ on her face when she opened the acceptance letter.' },
            { id: 'happy-r1', answer: 'happily', sentence: 'The children played ___ in the garden until sunset.' },
            { id: 'happy-r2', answer: 'happier', sentence: 'He felt ___ after talking the problem through with a friend.' },
        ],
        recognise: [
            { id: 'happy-g0', sentence: 'She looked really ___ after hearing the good news.' },
            { id: 'happy-g1', sentence: 'A ___ ending made the whole class smile.' },
        ],
    },
    sad: {
        realise: [
            { id: 'sad-r0', answer: 'sadness', sentence: 'A quiet ___ filled the room when they said goodbye at the station.' },
            { id: 'sad-r1', answer: 'sadly', sentence: '___ , the last bus had already left when we arrived.' },
            { id: 'sad-r2', answer: 'sadder', sentence: 'The second letter made her even ___ than the first.' },
        ],
        recognise: [
            { id: 'sad-g0', sentence: 'He felt ___ when his best friend moved to another city.' },
            { id: 'sad-g1', sentence: 'The film has a ___ scene near the end.' },
        ],
    },
    angry: {
        realise: [
            { id: 'angry-r0', answer: 'anger', sentence: 'He spoke with rising ___ when nobody admitted the mistake.' },
            { id: 'angry-r1', answer: 'angrily', sentence: 'She shut the door ___ after the unfair decision.' },
            { id: 'angry-r2', answer: 'angrier', sentence: 'Each new delay made the passengers ___ than before.' },
        ],
        recognise: [
            { id: 'angry-g0', sentence: 'The coach looked ___ when the team arrived late again.' },
            { id: 'angry-g1', sentence: 'Try not to get ___ about small problems on a group trip.' },
        ],
    },
    afraid: {
        realise: [
            { id: 'afraid-r0', answer: 'fear', sentence: 'Her ___ of flying made the short hop feel endless.' },
            { id: 'afraid-r1', answer: 'fearful', sentence: 'A ___ look crossed his face when the plane shook.' },
            { id: 'afraid-r2', answer: 'fearlessly', sentence: 'The guide walked ___ along the narrow mountain path.' },
        ],
        recognise: [
            { id: 'afraid-g0', sentence: 'Many first-time flyers feel ___ during take-off.' },
            { id: 'afraid-g1', sentence: 'Do not be ___ to ask the teacher for help.' },
        ],
    },
    excited: {
        realise: [
            { id: 'excited-r0', answer: 'excitement', sentence: 'The ___ before the school trip kept everyone talking at once.' },
            { id: 'excited-r1', answer: 'excitedly', sentence: 'They packed ___ the night before the holiday began.' },
            { id: 'excited-r2', answer: 'exciting', sentence: 'An ___ ferry ride across the bay started the adventure.' },
        ],
        recognise: [
            { id: 'excited-g0', sentence: 'The pupils were ___ about visiting the science museum.' },
            { id: 'excited-g1', sentence: 'I get ___ every time the plane leaves the ground.' },
        ],
    },
    careful: {
        realise: [
            { id: 'careful-r0', answer: 'carefully', sentence: 'Read the visa form ___ before you sign at the bottom.' },
            { id: 'careful-r1', answer: 'carefulness', sentence: 'His ___ with money saved the group from unexpected costs.' },
            { id: 'careful-r2', answer: 'careless', sentence: 'A ___ mistake on the form delayed the whole application.' },
        ],
        recognise: [
            { id: 'careful-g0', sentence: 'Be ___ with your documents on crowded trains.' },
            { id: 'careful-g1', sentence: 'A ___ driver slows down near schools and crossings.' },
        ],
    },
    lonely: {
        realise: [
            { id: 'lonely-r0', answer: 'loneliness', sentence: 'The ___ of the empty hostel room hit him on the first night.' },
            { id: 'lonely-r1', answer: 'lonelier', sentence: 'She felt ___ after all her friends left for university.' },
            { id: 'lonely-r2', answer: 'loneliness', sentence: 'Months of ___ abroad made him call home every evening.' },
        ],
        recognise: [
            { id: 'lonely-g0', sentence: 'Living abroad can feel ___ at the beginning.' },
            { id: 'lonely-g1', sentence: 'The ___ cottage stood far from the nearest village.' },
        ],
    },
    school: {
        realise: [
            { id: 'school-r0', answer: 'schools', sentence: 'Primary ___ in the area close for two weeks in winter.' },
            { id: 'school-r1', answer: 'schooling', sentence: 'Her early ___ in a small village shaped how she teaches now.' },
            { id: 'school-r2', answer: 'preschool', sentence: 'He started ___ at the age of three near his grandparents.' },
        ],
        recognise: [
            { id: 'school-g0', sentence: 'Our ___ day starts at eight and finishes at three.' },
            { id: 'school-g1', sentence: 'The new ___ has a large library and a science lab.' },
        ],
    },
    teacher: {
        realise: [
            { id: 'teacher-r0', answer: 'teachers', sentence: 'Three ___ accompanied the class on the museum visit.' },
            { id: 'teacher-r1', answer: 'teaching', sentence: 'She has been ___ English in this town for twelve years.' },
            { id: 'teacher-r2', answer: 'taught', sentence: 'Mr Kowalski ___ us how to write a formal email.' },
        ],
        recognise: [
            { id: 'teacher-g0', sentence: 'Ask your ___ if you do not understand the task.' },
            { id: 'teacher-g1', sentence: 'A good ___ explains difficult ideas with clear examples.' },
        ],
    },
    student: {
        realise: [
            { id: 'student-r0', answer: 'students', sentence: 'Twenty ___ boarded the coach for the geography field trip.' },
            { id: 'student-r1', answer: 'studying', sentence: 'She is ___ for her final exams in the library every evening.' },
            { id: 'student-r2', answer: 'studies', sentence: 'His ___ improved after he started making weekly plans.' },
        ],
        recognise: [
            { id: 'student-g0', sentence: 'Every ___ must bring a signed permission slip.' },
            { id: 'student-g1', sentence: 'The exchange ___ from Spain joined our class in March.' },
        ],
    },
    homework: {
        realise: [
            { id: 'homework-r0', answer: 'homework-free', sentence: 'Friday was a rare ___ evening after the big test.' },
            { id: 'homework-r1', answer: 'homeworks', sentence: 'Two short ___ on irregular verbs are due on Monday.' },
            { id: 'homework-r2', answer: 'homework diary', sentence: 'Write the task in your ___ before you leave the classroom.' },
        ],
        recognise: [
            { id: 'homework-g0', sentence: 'Finish your ___ before you watch any films this evening.' },
            { id: 'homework-g1', sentence: 'Too much ___ left little time for football practice.' },
        ],
    },
    exam: {
        realise: [
            { id: 'exam-r0', answer: 'exams', sentence: 'Final ___ start next week, so the library is always full.' },
            { id: 'exam-r1', answer: 'examination', sentence: 'The written ___ lasted ninety minutes without a break.' },
            { id: 'exam-r2', answer: 'examine', sentence: 'Doctors will ___ the injured player before the next match.' },
        ],
        recognise: [
            { id: 'exam-g0', sentence: 'The history ___ covers everything from September to May.' },
            { id: 'exam-g1', sentence: 'Bring a spare pen into the ___ room just in case.' },
        ],
    },
    lesson: {
        realise: [
            { id: 'lesson-r0', answer: 'lessons', sentence: 'Two extra ___ after school helped him catch up in maths.' },
            { id: 'lesson-r1', answer: 'lesson plan', sentence: 'The trainee wrote a detailed ___ for the observed class.' },
            { id: 'lesson-r2', answer: 'learned', sentence: 'We ___ a useful rule about countable nouns today.' },
        ],
        recognise: [
            { id: 'lesson-g0', sentence: 'Today\'s ___ is about writing a short travel blog.' },
            { id: 'lesson-g1', sentence: 'The piano ___ starts at five o\'clock every Thursday.' },
        ],
    },
    classroom: {
        realise: [
            { id: 'classroom-r0', answer: 'classrooms', sentence: 'All the ___ on the second floor have interactive boards.' },
            { id: 'classroom-r1', answer: 'classroom rules', sentence: 'Clear ___ help everyone feel safe and ready to learn.' },
            { id: 'classroom-r2', answer: 'classmates', sentence: 'My ___ organised a surprise party for our form tutor.' },
        ],
        recognise: [
            { id: 'classroom-g0', sentence: 'Please leave the ___ tidy before you go to lunch.' },
            { id: 'classroom-g1', sentence: 'Our ___ faces the playground and gets morning sun.' },
        ],
    },
};

function frameKey(sentence) {
    return cleanSentence(sentence)
        .toLowerCase()
        .replace(/___+/g, '___')
        .replace(/[^a-z0-9_\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function contentBits(definition = '') {
    const stop = new Set(['a','an','the','to','of','in','on','for','and','or','that','which','who','when','with','from','into','about','your','you','they','their','this','used','lets','means','place','piece','paper','something','someone','especially','where','what']);
    return String(definition || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w && w.length > 2 && !stop.has(w));
}

/** Build word-specific invent cards from a definition when no curated entry exists. Returns [] if nothing sensible. */
export function inventClozeFromDefinition(term, definition = '') {
    const t = String(term || '').trim();
    const lower = t.toLowerCase();
    const def = String(definition || '').trim();
    const cls = guessWordClass(lower, def);
    const bits = contentBits(def);
    const out = { realise: [], recognise: [] };
    if (!t) return out;

    if (cls === 'verb') {
        const rest = def.replace(/^to\s+/i, '').trim();
        const answerIng = ingOf(lower);
        const answerEd = /e$/.test(lower) ? `${lower}d` : /[^aeiou][aeiou][b-df-hj-np-tv-z]$/.test(lower) && lower.length <= 5
            ? `${lower}${lower.at(-1)}ed`
            : `${lower}ed`;
        if (rest && !sameWord(rest, lower)) {
            out.realise.push({
                id: `inv-${lower}-r0`,
                answer: answerIng,
                sentence: cleanSentence(`At this moment people are ___ in order to ${rest}.`),
            });
            out.realise.push({
                id: `inv-${lower}-r1`,
                answer: answerEd,
                sentence: cleanSentence(`Yesterday they finally ___ so they could ${rest}.`),
            });
            out.recognise.push({
                id: `inv-${lower}-g0`,
                sentence: cleanSentence(`Many people ___ early so they can ${rest}.`),
            });
        } else {
            out.realise.push({
                id: `inv-${lower}-r0`,
                answer: answerIng,
                sentence: cleanSentence(`Right now the whole group is ___ before the next announcement.`),
            });
            out.realise.push({
                id: `inv-${lower}-r1`,
                answer: answerEd,
                sentence: cleanSentence(`They ___ as soon as the signal appeared on the board.`),
            });
            out.recognise.push({
                id: `inv-${lower}-g0`,
                sentence: cleanSentence(`Please ___ carefully when the instructions appear on screen.`),
            });
        }
    } else if (cls === 'adj-y') {
        const answer = `${lower.slice(0, -1)}iness`;
        out.realise.push({
            id: `inv-${lower}-r0`,
            answer,
            sentence: cleanSentence(`You could read the ___ in her eyes after she heard the news.`),
        });
        out.recognise.push({
            id: `inv-${lower}-g0`,
            sentence: cleanSentence(`The children looked ___ when the weekend trip was confirmed.`),
        });
    } else if (cls === 'adj') {
        const answer = adverbOf(lower);
        out.realise.push({
            id: `inv-${lower}-r0`,
            answer,
            sentence: cleanSentence(`She answered every question ___ so nobody was left confused.`),
        });
        out.recognise.push({
            id: `inv-${lower}-g0`,
            sentence: cleanSentence(`A ___ plan saved the group from missing the connection.`),
        });
    } else if (UNCOUNTABLE.has(lower)) {
        out.realise.push({
            id: `inv-${lower}-r0`,
            answer: `${lower}-free`,
            sentence: cleanSentence(`After days of stress they booked a quiet ___ weekend in the countryside.`),
        });
        out.recognise.push({
            id: `inv-${lower}-g0`,
            sentence: bits.length
                ? cleanSentence(`Check your ___ carefully — especially anything related to ${bits.slice(0, 3).join(' ')}.`)
                : cleanSentence(`Leave heavy ___ with the desk before you explore the city.`),
        });
    } else if (lower === 'customs' || ALREADY_PLURAL.has(lower)) {
        return out; // only curated paths for these
    } else {
        const answer = pluralOf(lower);
        if (isFormOf(answer, lower)) {
            // Weave 2–3 definition keywords into a noun-plural scene unique to this term.
            const hook = bits.slice(0, 3).join(' ');
            if (hook) {
                out.realise.push({
                    id: `inv-${lower}-r0`,
                    answer,
                    sentence: cleanSentence(`Several ___ — needed for ${hook} — were checked before departure.`),
                });
                out.realise.push({
                    id: `inv-${lower}-r1`,
                    answer,
                    sentence: cleanSentence(`Without enough ___, nobody involved in ${hook} could continue.`),
                });
            }
        }
        out.recognise.push({
            id: `inv-${lower}-g0`,
            sentence: bits.length
                ? cleanSentence(`A clear ___ is important whenever you deal with ${bits.slice(0, 3).join(' ')}.`)
                : cleanSentence(`Make sure you understand ___ before the next exercise begins.`),
        });
    }

    out.realise = out.realise.filter((c) => isFormOf(c.answer, lower) && isStrongClozeSentence(c.sentence, { term: t, answer: c.answer, formation: true }));
    out.recognise = out.recognise.filter((c) => isStrongClozeSentence(c.sentence, { term: t, answer: t, formation: false }));
    return out;
}

function candidatesFor(term, definition, mode) {
    const key = String(term || '').toLowerCase().trim();
    const curated = CURATED_CLOZE[key];
    const invent = inventClozeFromDefinition(term, definition);
    const list = [
        ...((curated && curated[mode]) || []),
        ...((invent && invent[mode]) || []),
    ];
    // Prefer curated (they come first). Drop weak ones.
    return list.filter((c) => {
        if (mode === 'realise') {
            return c.answer && isFormOf(c.answer, key) && isStrongClozeSentence(c.sentence, { term, answer: c.answer, formation: true });
        }
        return isStrongClozeSentence(c.sentence, { term, answer: term, formation: false });
    });
}

/**
 * Pick a fallback cloze card that has not used a sentence frame yet.
 * @param {'realise'|'recognise'} mode
 * @param {{ used?: Set<string>, preferIndex?: number }} opts
 * @returns {object|null}
 */
export function pickFallbackCard(term, definition, mode, opts = {}) {
    const used = opts.used || new Set();
    const list = candidatesFor(term, definition, mode);
    if (!list.length) return null;
    const start = Math.max(0, Number(opts.preferIndex) || 0) % list.length;
    for (let i = 0; i < list.length; i++) {
        const c = list[(start + i) % list.length];
        const key = c.id || frameKey(c.sentence);
        if (used.has(key) || used.has(frameKey(c.sentence))) continue;
        used.add(key);
        used.add(frameKey(c.sentence));
        if (mode === 'realise') {
            return {
                sentence: cleanSentence(c.sentence),
                cue: String(term).toUpperCase(),
                answer: cleanAnswer(c.answer),
                lead: 'Word formation',
                body: cleanSentence(c.sentence),
                hint: definition || '',
                prompt: cleanSentence(c.sentence),
                frameId: key,
            };
        }
        return {
            sentence: cleanSentence(c.sentence),
            answer: String(term || '').trim(),
            lead: 'Postcard',
            body: cleanSentence(c.sentence),
            hint: definition || '',
            prompt: cleanSentence(c.sentence),
            frameId: key,
        };
    }
    return null;
}

/** @deprecated single-call API kept for tests — prefers curated, may reuse if called alone. */
export function fallbackRealise(term, definition, n = 0) {
    const used = new Set();
    // Burn the first n candidates so n still rotates when called in isolation.
    for (let i = 0; i < n; i++) pickFallbackCard(term, definition, 'realise', { used, preferIndex: i });
    return pickFallbackCard(term, definition, 'realise', { used, preferIndex: n })
        || inventLastResortRealise(term, definition);
}

export function fallbackRecognise(term, definition, n = 0) {
    const used = new Set();
    for (let i = 0; i < n; i++) pickFallbackCard(term, definition, 'recognise', { used, preferIndex: i });
    return pickFallbackCard(term, definition, 'recognise', { used, preferIndex: n })
        || inventLastResortRecognise(term, definition);
}

function inventLastResortRealise(term, definition) {
    // Only used if the bank + invent path are empty; still word-specific via the term itself.
    const lower = String(term || '').toLowerCase();
    const answer = UNCOUNTABLE.has(lower) ? `${lower}-free` : pluralOf(lower);
    const sentence = UNCOUNTABLE.has(lower)
        ? `After a difficult week they planned a short ___ break with no ${lower} involved.`
        : `In the story, three different ___ changed how people thought about ${lower}.`;
    if (!isFormOf(answer, lower) || !isStrongClozeSentence(sentence, { term, answer, formation: true })) {
        return {
            sentence: cleanSentence(`The word family of "${term}" includes the form ___ in this exercise.`),
            cue: String(term).toUpperCase(),
            answer: cleanAnswer(answer),
            lead: 'Word formation',
            body: '',
            hint: definition || '',
            prompt: '',
            unusable: true,
        };
    }
    return {
        sentence: cleanSentence(sentence),
        cue: String(term).toUpperCase(),
        answer: cleanAnswer(answer),
        lead: 'Word formation',
        body: cleanSentence(sentence),
        hint: definition || '',
        prompt: cleanSentence(sentence),
    };
}

function inventLastResortRecognise(term, definition) {
    const sentence = cleanSentence(`In this unit the key idea of ___ appears again and again.`);
    return {
        sentence,
        answer: String(term || '').trim(),
        lead: 'Postcard',
        body: sentence,
        hint: definition || '',
        prompt: sentence,
    };
}

/** Short clean definition snippet (for hints / AI context, not dumped into gaps). */
export function shortDef(definition, max = 48) {
    let d = String(definition || '')
        .replace(/^to\s+/i, '')
        .replace(/[.;:].*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!d) return '';
    if (d.length > max) d = `${d.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
    return d;
}

/** Coarse semantic field from a definition — used by invent heuristics. */
export function semanticField(definition = '', term = '') {
    const d = `${definition} ${term}`.toLowerCase();
    if (/\b(travel|journey|trip|flight|airport|train|passport|ticket|luggage|baggage|border|customs|depart|arrive|hotel|holiday|tourist)\b/.test(d)) return 'travel';
    if (/\b(feel|feeling|emotion|happy|sad|angry|afraid|pleasure|mood|excited|lonely)\b/.test(d)) return 'feelings';
    if (/\b(school|lesson|class|teacher|student|homework|exam|study|classroom)\b/.test(d)) return 'school';
    if (/\b(food|eat|meal|cook|kitchen|restaurant)\b/.test(d)) return 'food';
    return 'general';
}

/** Reject weak / meta / off-topic cloze sentences (AI or fallback). */
export function isStrongClozeSentence(sentence, { term = '', answer = '', formation = false } = {}) {
    const s = cleanSentence(sentence);
    if (!oneGap(s)) return false;
    const words = s.replace(/___/g, ' GAP ').split(/\s+/).filter(Boolean);
    if (words.length < 7 || words.length > 28) return false;
    if (/\b(stamp|postcard|vocabulary|vocab|gap|blank|cloze|word formation|type the|fill in|this topic|word family|lesson topic|key idea of)\b/i.test(s)) return false;
    if (formation && term) {
        const re = new RegExp(`\\b${String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        // Allow the base word only inside compounds that are the answer (handled separately); bare base word is banned.
        if (re.test(s.replace(String(answer || ''), 'ANSWER'))) return false;
    }
    if (/\bfor (reach|get|leave|feel|give|make|take|lets)\b/i.test(s)) return false;
    if (/\b(several|two important|five) ___ (waiting at the airport desk|mentioned in yesterday)/i.test(s)) return false;
    return true;
}

/** Is `answer` a genuine changed form of `term` (shares its stem, not identical)? */
export function isFormOf(answer, term) {
    const a = String(answer || '').trim().toLowerCase();
    const b = String(term || '').trim().toLowerCase();
    if (!a || !b || a === b) return false;
    const bw = b.split(/\s+/);
    const aw = a.split(/\s+/);
    if (bw.length > 1) return aw.length === bw.length && aw.slice(0, -1).join(' ') === bw.slice(0, -1).join(' ') && isFormOf(aw.at(-1), bw.at(-1));
    if (IRREGULAR_PLURAL[b] === a) return true;
    if ((IRREGULAR_FORMS[b] || []).includes(a)) return true;
    if (/ie$/.test(b) && a.startsWith(`${b.slice(0, -2)}y`)) return true;
    if (a.startsWith(`${b} `) || a.startsWith(`${b}-`)) return true;
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    const need = Math.max(2, Math.min(4, b.length - 2));
    return p >= need;
}

/**
 * Parse AI JSON into { [termLower]: variants[] } where each variant has recognise + realise payloads.
 */
export function parseStampClozeReply(reply, box, { usedFrames = null } = {}) {
    const used = usedFrames || new Set();
    const byTerm = new Map();
    for (const entry of box || []) {
        byTerm.set(String(entry.term).toLowerCase(), []);
    }
    const cards = Array.isArray(reply?.cards) ? reply.cards : [];
    for (const card of cards) {
        const termKey = String(card?.term || '').trim().toLowerCase();
        if (!byTerm.has(termKey)) continue;
        const entry = box.find((b) => b.term.toLowerCase() === termKey);
        const variants = Array.isArray(card.variants) ? card.variants : [];
        for (let i = 0; i < variants.length; i++) {
            const v = variants[i] || {};
            const recRaw = v.recognise || {};
            const realRaw = v.realise || {};
            let recognise = {
                sentence: cleanSentence(recRaw.sentence),
                answer: cleanAnswer(recRaw.answer || entry.term),
            };
            let realise = {
                sentence: cleanSentence(realRaw.sentence),
                cue: cleanAnswer(realRaw.cue || entry.term).toUpperCase(),
                answer: cleanAnswer(realRaw.answer),
            };
            if (!oneGap(recognise.sentence)
                || !sameWord(recognise.answer, entry.term)
                || !isStrongClozeSentence(recognise.sentence, { term: entry.term, answer: entry.term, formation: false })) {
                recognise = pickFallbackCard(entry.term, entry.definition, 'recognise', { used, preferIndex: i })
                    || fallbackRecognise(entry.term, entry.definition, i);
            } else {
                recognise.answer = entry.term;
                used.add(frameKey(recognise.sentence));
            }
            if (!oneGap(realise.sentence)
                || !realise.answer
                || !isFormOf(realise.answer, entry.term)
                || !isStrongClozeSentence(realise.sentence, { term: entry.term, answer: realise.answer, formation: true })) {
                realise = pickFallbackCard(entry.term, entry.definition, 'realise', { used, preferIndex: i })
                    || fallbackRealise(entry.term, entry.definition, i);
            } else {
                realise.cue = entry.term.toUpperCase();
                used.add(frameKey(realise.sentence));
            }
            byTerm.get(termKey).push({
                recognise: {
                    ...recognise,
                    lead: 'Postcard',
                    body: recognise.sentence,
                    hint: entry.definition,
                    prompt: recognise.sentence,
                },
                realise: {
                    ...realise,
                    lead: 'Word formation',
                    body: realise.sentence,
                    hint: entry.definition,
                    prompt: realise.sentence,
                },
            });
        }
    }
    // Fill missing terms / empty variant lists.
    for (const entry of box || []) {
        const key = entry.term.toLowerCase();
        const list = byTerm.get(key) || [];
        if (!list.length) {
            const recognise = pickFallbackCard(entry.term, entry.definition, 'recognise', { used })
                || fallbackRecognise(entry.term, entry.definition, 0);
            const realise = pickFallbackCard(entry.term, entry.definition, 'realise', { used })
                || fallbackRealise(entry.term, entry.definition, 0);
            if (recognise?.sentence && realise?.sentence && !realise.unusable) {
                list.push({
                    recognise: { ...recognise, lead: 'Postcard', body: recognise.sentence, hint: entry.definition, prompt: recognise.sentence },
                    realise: { ...realise, lead: 'Word formation', body: realise.sentence, hint: entry.definition, prompt: realise.sentence },
                });
            }
        }
        byTerm.set(key, list);
    }
    return byTerm;
}

/** Build a cloze pack Map → plain object for match storage. Guarantees unique sentence frames. */
export function stampClozePackFromReply(reply, box, variantCount = 2) {
    const map = parseStampClozeReply(reply, box, { usedFrames: new Set() });
    const used = new Set();
    for (const entry of box || []) {
        for (const v of map.get(String(entry.term).toLowerCase()) || []) {
            if (v.recognise?.sentence) used.add(frameKey(v.recognise.sentence));
            if (v.realise?.sentence) used.add(frameKey(v.realise.sentence));
        }
    }
    const out = {};
    for (const entry of box || []) {
        const key = entry.term.toLowerCase();
        let list = (map.get(key) || []).filter((v) => v?.recognise?.sentence && v?.realise?.sentence && !v.realise?.unusable);
        while (list.length < variantCount) {
            const n = list.length;
            const recognise = pickFallbackCard(entry.term, entry.definition, 'recognise', { used, preferIndex: n });
            const realise = pickFallbackCard(entry.term, entry.definition, 'realise', { used, preferIndex: n });
            if (!recognise || !realise) break;
            list = list.concat([{
                recognise: { ...recognise, lead: 'Postcard', body: recognise.sentence, hint: entry.definition, prompt: recognise.sentence },
                realise: { ...realise, lead: 'Word formation', body: realise.sentence, hint: entry.definition, prompt: realise.sentence },
            }]);
        }
        if (!list.length) {
            const recognise = pickFallbackCard(entry.term, entry.definition, 'recognise', { used }) || fallbackRecognise(entry.term, entry.definition, 0);
            const realise = pickFallbackCard(entry.term, entry.definition, 'realise', { used }) || fallbackRealise(entry.term, entry.definition, 0);
            if (recognise?.sentence && realise?.sentence && !realise.unusable) {
                list = [{
                    recognise: { ...recognise, lead: 'Postcard', body: recognise.sentence, hint: entry.definition, prompt: recognise.sentence },
                    realise: { ...realise, lead: 'Word formation', body: realise.sentence, hint: entry.definition, prompt: realise.sentence },
                }];
            }
        }
        out[key] = list.slice(0, Math.max(1, Math.min(variantCount, list.length)));
    }
    return out;
}

/** Frames (normalised sentences) used across a cloze pack — for tests. */
export function collectPackFrames(pack) {
    const frames = [];
    for (const list of Object.values(pack || {})) {
        for (const v of list || []) {
            if (v.recognise?.sentence) frames.push(frameKey(v.recognise.sentence));
            if (v.realise?.sentence) frames.push(frameKey(v.realise.sentence));
        }
    }
    return frames;
}


/* ---------- AI-first pack building (retries; fallback only as last resort) ---------- */

function decorateRecognise(entry, recognise, source = 'ai') {
    return {
        sentence: recognise.sentence,
        answer: entry.term,
        lead: 'Postcard',
        body: recognise.sentence,
        hint: entry.definition,
        prompt: recognise.sentence,
        source,
    };
}

function decorateRealise(entry, realise, source = 'ai') {
    return {
        sentence: realise.sentence,
        cue: String(entry.term).toUpperCase(),
        answer: realise.answer,
        lead: 'Word formation',
        body: realise.sentence,
        hint: entry.definition,
        prompt: realise.sentence,
        source,
    };
}

function emptyStampPack(box) {
    const pack = {};
    for (const entry of box || []) {
        pack[String(entry.term).toLowerCase()] = [];
    }
    return pack;
}

function cloneStampPack(pack) {
    const out = {};
    for (const [k, list] of Object.entries(pack || {})) {
        out[k] = (list || []).map((v) => ({
            recognise: { ...(v.recognise || {}) },
            realise: { ...(v.realise || {}) },
        }));
    }
    return out;
}

function framesFromPack(pack, used) {
    for (const f of collectPackFrames(pack)) used.add(f);
    return used;
}

/**
 * Try to accept one AI variant (recognise + realise). Returns null if either side is weak.
 */
export function acceptAiStampVariant(entry, raw, usedFrames = new Set()) {
    const recRaw = raw?.recognise || {};
    const realRaw = raw?.realise || {};
    const recognise = {
        sentence: cleanSentence(recRaw.sentence),
        answer: cleanAnswer(recRaw.answer || entry.term),
    };
    const realise = {
        sentence: cleanSentence(realRaw.sentence),
        cue: cleanAnswer(realRaw.cue || entry.term).toUpperCase(),
        answer: cleanAnswer(realRaw.answer),
    };
    if (!oneGap(recognise.sentence)
        || !sameWord(recognise.answer, entry.term)
        || !isStrongClozeSentence(recognise.sentence, { term: entry.term, answer: entry.term, formation: false })) {
        return null;
    }
    if (!oneGap(realise.sentence)
        || !realise.answer
        || !isFormOf(realise.answer, entry.term)
        || !isStrongClozeSentence(realise.sentence, { term: entry.term, answer: realise.answer, formation: true })) {
        return null;
    }
    const rk = frameKey(recognise.sentence);
    const zk = frameKey(realise.sentence);
    if (usedFrames.has(rk) || usedFrames.has(zk) || rk === zk) return null;
    usedFrames.add(rk);
    usedFrames.add(zk);
    return {
        recognise: decorateRecognise(entry, recognise, 'ai'),
        realise: decorateRealise(entry, realise, 'ai'),
    };
}

/** Merge accepted AI cards into pack (AI only — never inserts curated fallbacks). */
export function mergeAiStampReply(pack, reply, box, usedFrames = new Set()) {
    const byTerm = new Map((box || []).map((e) => [String(e.term).toLowerCase(), e]));
    let added = 0;
    const cards = Array.isArray(reply?.cards) ? reply.cards : [];
    for (const card of cards) {
        const termKey = String(card?.term || '').trim().toLowerCase();
        const entry = byTerm.get(termKey);
        if (!entry) continue;
        if (!pack[termKey]) pack[termKey] = [];
        const variants = Array.isArray(card.variants) ? card.variants : [];
        for (const raw of variants) {
            const accepted = acceptAiStampVariant(entry, raw, usedFrames);
            if (!accepted) continue;
            pack[termKey].push(accepted);
            added += 1;
        }
    }
    return added;
}

/** Terms still short of variantCount AI/accepted cards. */
export function listStampClozeGaps(pack, box, variantCount = 2) {
    const needN = Math.max(1, Number(variantCount) || 2);
    const gaps = [];
    for (const entry of box || []) {
        const key = String(entry.term).toLowerCase();
        const have = (pack?.[key] || []).length;
        const need = Math.max(0, needN - have);
        if (need > 0) {
            gaps.push({ term: entry.term, definition: entry.definition, need, have });
        }
    }
    return gaps;
}

/** Retry prompt: only the rejected/missing terms, exact counts. */
export function buildStampClozeRetryPrompt({ gaps, level = 'intermediate', topic = '' } = {}) {
    const rows = (gaps || []).map((g, i) => `${i + 1}. ${g.term} — ${g.definition} → write exactly ${g.need} new unique variant(s)`).join('\n');
    const levelHint = level === 'beginner' || level === 'easy'
        ? 'A2–B1 school English'
        : level === 'advanced'
            ? 'B2–C1 school English'
            : 'B1–B2 school English';
    const topicLine = String(topic || '').trim()
        ? `Lesson topic / theme: ${String(topic).trim()}.`
        : 'Lesson topic: infer from the definitions.';
    return `You are repairing Stamp Rush cloze cards (${levelHint}). Previous AI output was incomplete or failed validation.

${topicLine}

ONLY these terms still need cards (do not invent others):
${rows || '(none)'}

For EACH listed term write exactly the requested number of NEW unique variants.
Each variant needs:
1) recognise — one natural sentence (10–20 words) with exactly one "___" for the BASE TERM. Answer = base term.
2) realise — a DIFFERENT sentence (10–20 words) with exactly one "___" for a CHANGED FORM of the base term. Cue = BASE TERM CAPS. Answer = changed form only (not equal to the base).

Rules: exactly one "___"; no meta talk about stamps/gaps/vocabulary; topic-relevant; unambiguous word-formation; unique sentences.

Return ONLY valid JSON:
{"cards":[{"term":"<exact term>","variants":[{"recognise":{"sentence":"... ___ ...","answer":"<base>"},"realise":{"sentence":"... ___ ...","cue":"<BASE>","answer":"<form>"}}]}]}`;
}

/** Last-resort curated fill for remaining gaps. */
export function fillStampClozeFallbacks(pack, box, variantCount = 2, usedFrames = new Set()) {
    const needN = Math.max(1, Number(variantCount) || 2);
    framesFromPack(pack, usedFrames);
    for (const entry of box || []) {
        const key = String(entry.term).toLowerCase();
        if (!pack[key]) pack[key] = [];
        let list = pack[key];
        while (list.length < needN) {
            const n = list.length;
            const recognise = pickFallbackCard(entry.term, entry.definition, 'recognise', { used: usedFrames, preferIndex: n })
                || fallbackRecognise(entry.term, entry.definition, n);
            const realise = pickFallbackCard(entry.term, entry.definition, 'realise', { used: usedFrames, preferIndex: n })
                || fallbackRealise(entry.term, entry.definition, n);
            if (!recognise?.sentence || !realise?.sentence || realise.unusable) break;
            usedFrames.add(frameKey(recognise.sentence));
            usedFrames.add(frameKey(realise.sentence));
            list.push({
                recognise: decorateRecognise(entry, recognise, 'fallback'),
                realise: decorateRealise(entry, realise, 'fallback'),
            });
        }
        pack[key] = list.slice(0, needN);
    }
    return pack;
}

function withTimeout(promise, timeoutMs, label) {
    const ms = Math.max(5_000, Number(timeoutMs) || 60_000);
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label || 'Stamp Rush AI'} timed out after ${ms}ms`)), ms);
        Promise.resolve(promise).then(
            (v) => { clearTimeout(t); resolve(v); },
            (e) => { clearTimeout(t); reject(e); },
        );
    });
}

/**
 * AI-first cloze pack: runPrompt(prompt, label) → JSON reply.
 * Retries only rejected/missing cards (up to maxAttempts). Curated fallback only if still incomplete
 * or runPrompt is missing — always console.warns in that case.
 */
export async function generateStampClozePack({
    box,
    variantCount = 2,
    level = 'intermediate',
    topic = '',
    runPrompt = null,
    maxAttempts = 3,
    timeoutMs = 60_000,
    existingPack = null,
    warn = console.warn.bind(console),
} = {}) {
    const needN = Math.max(1, Number(variantCount) || 2);
    const pack = existingPack ? cloneStampPack(existingPack) : emptyStampPack(box);
    for (const entry of box || []) {
        const key = String(entry.term).toLowerCase();
        if (!pack[key]) pack[key] = [];
    }
    const used = framesFromPack(pack, new Set());
    const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));

    if (typeof runPrompt !== 'function') {
        warn('Stamp Rush: AI unavailable (no runner) — using curated fallback sentences.');
        fillStampClozeFallbacks(pack, box, needN, used);
        return pack;
    }

    let gaps = listStampClozeGaps(pack, box, needN);
    for (let attempt = 0; attempt < attempts && gaps.length; attempt++) {
        const fullFirst = attempt === 0 && gaps.length === (box || []).length && gaps.every((g) => g.have === 0);
        const prompt = fullFirst
            ? buildStampClozePrompt({ box, variantCount: needN, level, topic })
            : buildStampClozeRetryPrompt({ gaps, level, topic });
        const label = fullFirst ? 'stamp-rush-cloze' : `stamp-rush-cloze-retry-${attempt}`;
        try {
            const reply = await withTimeout(runPrompt(prompt, label), timeoutMs, label);
            const added = mergeAiStampReply(pack, reply, box, used);
            if (!added) {
                warn(`Stamp Rush: AI attempt ${attempt + 1}/${attempts} returned no usable cards.`);
            }
        } catch (err) {
            warn(`Stamp Rush: AI attempt ${attempt + 1}/${attempts} failed: ${err?.message || err}`);
        }
        gaps = listStampClozeGaps(pack, box, needN);
    }

    if (gaps.length) {
        const terms = gaps.map((g) => g.term).join(', ');
        warn(`Stamp Rush: AI incomplete after ${attempts} attempt(s) — filling curated fallbacks for: ${terms}`);
        fillStampClozeFallbacks(pack, box, needN, used);
    }

    for (const entry of box || []) {
        const key = String(entry.term).toLowerCase();
        pack[key] = (pack[key] || []).slice(0, needN);
    }
    return pack;
}
