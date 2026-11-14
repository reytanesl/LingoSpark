/* Synthetic, legacy-style bank rows for the audit script's SAMPLE mode (no database access). Not real learner data. */
const t = (en, pl) => ({ en, pl });
const row = (id, term, level, slot, item, pv = 'tg4') => ({ id: String(id), en: term.en, pl: term.pl, level, slot, pv, item });
const SKIRT = t('skirt', 'spódniczka'); const TRACK = t('tracksuit', 'dres'); const BELT = t('belt', 'pasek');
const FOG = t('fog', 'mgła'); const RADIO = t('radio', 'radio'); const GLASSES = t('glasses', 'okulary'); const PRESENT = t('present', 'prezent');
const GRATEFUL = t('grateful', 'wdzięczny'); const GIVEUP = t('give up', 'poddać się');
const opts = (a, ...d) => [a, ...d];

export const SAMPLE = [
    // fine rows
    row(1, SKIRT, 'A1', 'sentenceGap', { type: 'sentenceGap', template: 'The girl wears a ___ to school.', answer: 'skirt', options: opts('skirt', 'cap', 'sock', 'belt'), correctIndex: 0 }),
    row(2, TRACK, 'A2', 'translateType', { type: 'translateType', source: 'Mam nowy dres.', answer: 'I have a new tracksuit.', answers: ['I have a new tracksuit.'] }),
    row(3, FOG, 'A2', 'meaningPick:en-pl', { type: 'meaningPick', direction: 'en-pl', question: 'fog', answer: 'mgła', options: opts('mgła', 'deszcz', 'wiatr', 'piasek'), correctIndex: 0 }),
    row(4, GRATEFUL, 'B1', 'keyTransform', { type: 'keyTransform', sourceSentence: 'She thanked him for the help.', keyWord: 'GRATEFUL', template: 'She was ___ his help.', answer: 'grateful for', answers: ['grateful for'] }),
    row(5, GIVEUP, 'B1', 'letterScramble', { type: 'letterScramble', letters: ['v', 'g', 'e', 'i'], answer: 'give', hint: 'oddać' }),
    // generic gaps (no single clue; learner cannot tell which word)
    row(6, BELT, 'A1', 'sentenceGap', { type: 'sentenceGap', template: 'This is my ___.', answer: 'belt', options: opts('belt', 'bag', 'book', 'bike'), correctIndex: 0 }, 'tg3'),
    row(7, SKIRT, 'A1', 'sentenceGap', { type: 'sentenceGap', template: 'There is a ___ here.', answer: 'skirt', options: opts('skirt', 'cat', 'pen', 'car'), correctIndex: 0 }, 'tg3'),
    row(8, TRACK, 'A1', 'gapTranslate', { type: 'gapTranslate', template: 'We have got a ___.', answer: 'tracksuit', options: opts('tracksuit', 'dog', 'ball', 'house'), correctIndex: 0, plTranslation: 'Mamy dres.' }, 'tg3'),
    // this / that with no distance cue
    row(9, RADIO, 'A1', 'sentenceGap', { type: 'sentenceGap', template: '___ is my radio.', answer: 'This', options: opts('This', 'That', 'These', 'Those'), correctIndex: 0 }, 'tg3'),
    // broken setups
    row(10, SKIRT, 'A2', 'sentenceGap', { type: 'sentenceGap', template: 'My sister wears a skirt to school.', answer: 'skirt', options: opts('skirt', 'cap', 'sock', 'belt'), correctIndex: 0 }),
    row(11, BELT, 'A2', 'sentenceGap', { type: 'sentenceGap', template: 'He has a ___ and a ___ today.', answer: 'belt', options: opts('belt', 'hat', 'scarf', 'glove'), correctIndex: 0 }),
    row(12, FOG, 'B1', 'collocationPick', { type: 'collocationPick', template: 'thick ___', answer: 'fog', options: opts('rain', 'wind', 'snow', 'hail'), correctIndex: 0 }),
    row(13, TRACK, 'A2', 'gapTranslate', { type: 'gapTranslate', template: 'He runs in his ___ every morning.', answer: 'tracksuit', options: opts('tracksuit', 'suit', 'dress', 'coat'), correctIndex: 0 }),
    row(14, BELT, 'A1', 'letterScramble', { type: 'letterScramble', letters: ['b', 'l', 't'], answer: 'belt', hint: 'pasek do spodni' }),
    row(15, GLASSES, 'A2', 'sentenceOrder', { type: 'sentenceOrder', tokens: ['Where', 'are', 'my', 'glasses'], correctOrder: ['Where', 'are', 'my', 'glasses', 'now?'] }),
    // copy tasks (same word, same form, same language as shown)
    row(16, RADIO, 'A2', 'translateType', { type: 'translateType', source: 'radio', answer: 'radio', answers: ['radio'] }),
    row(17, PRESENT, 'A2', 'translateType', { type: 'translateType', source: 'present', answer: 'present', answers: ['present'] }),
    row(18, BELT, 'A1', 'letterScramble', { type: 'letterScramble', letters: ['b', 'e', 'l', 't'], answer: 'belt', hint: 'belt' }),
    // slash lists shown to the learner
    row(19, PRESENT, 'A2', 'meaningPick:pl-en', { type: 'meaningPick', direction: 'pl-en', question: 'prezent', answer: 'present / gift', options: opts('present / gift', 'letter', 'card', 'toy'), correctIndex: 0 }),
    row(20, GIVEUP, 'B1', 'translateType', { type: 'translateType', source: 'poddać się / zrezygnować', answer: 'give up / quit', answers: ['give up / quit'] }),
    // too hard for the level
    row(21, GRATEFUL, 'A2', 'sentenceGap', { type: 'sentenceGap', template: 'The refugees were deeply ___ for the unprecedented humanitarian assistance.', answer: 'grateful', options: opts('grateful', 'angry', 'tired', 'bored'), correctIndex: 0 }),
    row(22, FOG, 'A1', 'dictation', { type: 'dictation', speak: 'Visibility deteriorated considerably because of the dense fog.', answer: 'Visibility deteriorated considerably because of the dense fog.' }),
    // fine, several answers possible (must NOT be flagged)
    row(23, SKIRT, 'B1', 'gapTranslate', { type: 'gapTranslate', template: 'She bought a long ___ for the party.', answer: 'skirt', options: opts('skirt', 'dress', 'scarf', 'coat'), correctIndex: 0, plTranslation: 'Kupiła długą spódnicę na przyjęcie.' }),
    row(24, GIVEUP, 'B2', 'translateType', { type: 'translateType', source: 'Nigdy się nie poddam.', answer: "I will never give up.", answers: ["I will never give up."] }),
    // already stored AI-judge verdicts (shape only), to show how they are counted
    row(25, TRACK, 'A2', 'sentenceGap', { type: 'sentenceGap', template: 'He puts on his ___ before the match.', answer: 'tracksuit', options: opts('tracksuit', 'jacket', 'shirt', 'tie'), correctIndex: 0, clarity: { v: 1, verdict: 'unclear', issues: ['distractor_also_correct'], note: 'jacket też pasuje', widened: 0 } }),
    row(26, SKIRT, 'B2', 'translateType', { type: 'translateType', source: 'Ona nosi spódnicę.', answer: 'She wears a skirt.', answers: ['She wears a skirt.'], acceptedAnswers: ['She wears a skirt.', 'She is wearing a skirt.'], clarity: { v: 1, verdict: 'ok', issues: [], widened: 1 } }),
];
