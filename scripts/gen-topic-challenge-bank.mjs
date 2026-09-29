/**
 * Generates pe-topic-challenge-banks.js with curated Primary English items.
 * Run: node scripts/gen-topic-challenge-bank.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'pe-topic-challenge-banks.js');

const TOPICS = [
  { id: 'school', label: 'School', labelPl: 'Szkoła' },
  { id: 'family_home', label: 'Family & home', labelPl: 'Rodzina i dom' },
  { id: 'food', label: 'Food', labelPl: 'Jedzenie' },
  { id: 'free_time', label: 'Free time', labelPl: 'Czas wolny' },
  { id: 'clothes_weather', label: 'Clothes & weather', labelPl: 'Ubrania i pogoda' },
  { id: 'town', label: 'Town', labelPl: 'Miasto' },
  { id: 'animals', label: 'Animals', labelPl: 'Zwierzęta' },
  { id: 'routines', label: 'Routines', labelPl: 'Rutyny' },
  { id: 'time', label: 'Time', labelPl: 'Czas' },
];

const GRAMMARS = [
  { id: 'be', label: 'to be', labelPl: 'to be' },
  { id: 'have_got', label: 'have got', labelPl: 'have got' },
  { id: 'can', label: 'can / can\'t', labelPl: 'can / can\'t' },
  { id: 'like', label: 'like', labelPl: 'like' },
  { id: 'present_simple', label: 'Present simple', labelPl: 'Present simple' },
  { id: 'negatives', label: 'Negatives', labelPl: 'Przeczenia' },
  { id: 'questions', label: 'Questions', labelPl: 'Pytania' },
];

const MODES = [
  { id: 'picture', label: 'Picture', labelPl: 'Obrazek' },
  { id: 'tiles', label: 'Tiles', labelPl: 'Kafelki' },
  { id: 'text', label: 'Text', labelPl: 'Tekst' },
  { id: 'transform', label: 'Transform', labelPl: 'Przekształć' },
];

/** @type {Array<object>} */
const RAW = [];

function normAccept(answer, extra = []) {
  const a = [answer, ...extra].filter(Boolean);
  const out = new Set();
  for (const s of a) {
    out.add(s);
    out.add(s.replace(/'/g, "'"));
    out.add(s.replace(/'/g, "'"));
    if (s.includes("n't")) out.add(s.replace(/n't/g, ' not'));
    if (s.includes("It's")) out.add(s.replace(/It's/g, 'It is'));
    if (s.includes("He's")) out.add(s.replace(/He's/g, 'He is'));
    if (s.includes("She's")) out.add(s.replace(/She's/g, 'She is'));
    if (s.includes("I'm")) out.add(s.replace(/I'm/g, 'I am'));
    if (s.includes("We're")) out.add(s.replace(/We're/g, 'We are'));
    if (s.includes("They're")) out.add(s.replace(/They're/g, 'They are'));
    if (s.includes("haven't")) out.add(s.replace(/haven't/g, 'have not'));
    if (s.includes("hasn't")) out.add(s.replace(/hasn't/g, 'has not'));
    if (s.includes("don't")) out.add(s.replace(/don't/g, 'do not'));
    if (s.includes("doesn't")) out.add(s.replace(/doesn't/g, 'does not'));
    if (s.includes("can't")) out.add(s.replace(/can't/g, 'cannot'));
    if (s.includes("Can't")) out.add(s.replace(/Can't/g, 'Cannot'));
  }
  return [...out].filter((x) => x !== answer);
}

function tilesFrom(answer) {
  // Split keeping punctuation as own tiles when present
  const cleaned = answer.replace(/([.?!,])/g, ' $1 ').replace(/\s+/g, ' ').trim();
  return cleaned.split(' ').filter(Boolean);
}

function add(item) {
  const answer = item.answer.trim();
  const tiles = item.tiles || tilesFrom(answer);
  const modeHints = item.modeHints || ['picture', 'tiles', 'text', 'speak'];
  RAW.push({
    id: item.id,
    topic: item.topic,
    grammar: item.grammar,
    modeHints,
    cue: item.cue || '📝',
    promptEn: item.promptEn,
    promptPl: item.promptPl,
    answer,
    accept: normAccept(answer, item.accept || []),
    speakPromptEn: item.speakPromptEn || `Say: ${answer}`,
    speakPromptPl: item.speakPromptPl || `Powiedz: ${answer}`,
    distractors: item.distractors || [],
    tiles,
    gap: item.gap || null,
    transformFrom: item.transformFrom || null,
    transformTo: item.transformTo || null,
    pairCueEn: item.pairCueEn || null,
    pairCuePl: item.pairCuePl || null,
  });
}

function batch(topic, grammar, rows) {
  rows.forEach((r, i) => {
    const id = `${topic.slice(0, 3)}-${grammar.slice(0, 3)}-${String(i + 1).padStart(2, '0')}`;
    add({ id, topic, grammar, ...r });
  });
}

// ---------- SCHOOL ----------
batch('school', 'be', [
  { cue: '🏫', promptEn: 'What is this place?', promptPl: 'Co to za miejsce?', answer: 'It is a school.', accept: ["It's a school.", 'This is a school.'], distractors: ['It is a park.', 'It is a shop.', 'They are schools.'] },
  { cue: '👩‍🏫', promptEn: 'Who is she?', promptPl: 'Kim ona jest?', answer: 'She is a teacher.', accept: ["She's a teacher."], distractors: ['He is a teacher.', 'She is a pupil.', 'They are teachers.'] },
  { cue: '👦', promptEn: 'Who is he at school?', promptPl: 'Kim on jest w szkole?', answer: 'He is a pupil.', accept: ["He's a pupil.", 'He is a student.'], distractors: ['She is a pupil.', 'He is a teacher.', 'They are pupils.'] },
  { cue: '📘', promptEn: 'Where is the book?', promptPl: 'Gdzie jest książka?', answer: 'The book is on the desk.', distractors: ['The book is under the desk.', 'The books are on the desk.', 'The book is in the bag.'] },
  { cue: '🚪', promptEn: 'Is the classroom door open?', promptPl: 'Czy drzwi klasy są otwarte?', answer: 'The door is open.', distractors: ['The door is closed.', 'The window is open.', 'The doors are open.'] },
]);
batch('school', 'have_got', [
  { cue: '✏️', promptEn: 'Talk about your pencil.', promptPl: 'Powiedz o swoim ołówku.', answer: 'I have got a pencil.', accept: ["I've got a pencil.", 'I have a pencil.'], distractors: ['She has got a pencil.', 'I have got pencils.', "I haven't got a pencil."] },
  { cue: '🎒', promptEn: 'Talk about her bag.', promptPl: 'Powiedz o jej torbie.', answer: 'She has got a bag.', accept: ["She's got a bag.", 'She has a bag.'], distractors: ['He has got a bag.', 'She have got a bag.', "She hasn't got a bag."] },
  { cue: '📐', promptEn: 'Talk about his ruler.', promptPl: 'Powiedz o jego linijce.', answer: 'He has got a ruler.', accept: ["He's got a ruler.", 'He has a ruler.'], distractors: ['She has got a ruler.', 'He have got a ruler.', 'He has got a pen.'] },
  { cue: '📗', promptEn: 'Talk about their books.', promptPl: 'Powiedz o ich książkach.', answer: 'They have got three books.', accept: ["They've got three books.", 'They have three books.'], distractors: ['They has got three books.', 'They have got two books.', 'He has got three books.'] },
  { cue: '🖍️', promptEn: 'Talk about your crayons.', promptPl: 'Powiedz o swoich kredkach.', answer: 'We have got ten crayons.', accept: ["We've got ten crayons.", 'We have ten crayons.'], distractors: ['We has got ten crayons.', 'We have got five crayons.', 'I have got ten crayons.'] },
]);
batch('school', 'can', [
  { cue: '📖', promptEn: 'Can you read?', promptPl: 'Czy umiesz czytać?', answer: 'I can read.', distractors: ["I can't read.", 'I can write.', 'She can read.'] },
  { cue: '✍️', promptEn: 'Can she write?', promptPl: 'Czy ona umie pisać?', answer: 'She can write.', distractors: ["She can't write.", 'He can write.', 'She can read.'] },
  { cue: '🔢', promptEn: 'Can he count?', promptPl: 'Czy on umie liczyć?', answer: 'He can count.', distractors: ["He can't count.", 'She can count.', 'He can draw.'] },
  { cue: '🗣️', promptEn: 'Can they speak English?', promptPl: 'Czy oni mówią po angielsku?', answer: 'They can speak English.', distractors: ["They can't speak English.", 'They can speak Polish.', 'He can speak English.'] },
  { cue: '🚫✍️', promptEn: 'Say you cannot write now.', promptPl: 'Powiedz, że nie możesz teraz pisać.', answer: "I can't write now.", accept: ['I cannot write now.', 'I can not write now.'], distractors: ['I can write now.', "She can't write now.", "I can't read now."] },
]);
batch('school', 'like', [
  { cue: '📚', promptEn: 'Do you like English?', promptPl: 'Czy lubisz angielski?', answer: 'I like English.', distractors: ["I don't like English.", 'I like maths.', 'She likes English.'] },
  { cue: '🎨', promptEn: 'Does she like art?', promptPl: 'Czy ona lubi plastykę?', answer: 'She likes art.', distractors: ['She like art.', "She doesn't like art.", 'He likes art.'] },
  { cue: '⚽', promptEn: 'Does he like PE?', promptPl: 'Czy on lubi WF?', answer: 'He likes PE.', distractors: ['He like PE.', "He doesn't like PE.", 'She likes PE.'] },
  { cue: '🧮', promptEn: 'Do they like maths?', promptPl: 'Czy oni lubią matematykę?', answer: 'They like maths.', distractors: ['They likes maths.', "They don't like maths.", 'He likes maths.'] },
  { cue: '📖', promptEn: 'Do you like reading at school?', promptPl: 'Czy lubisz czytać w szkole?', answer: 'We like reading.', distractors: ['We likes reading.', "We don't like reading.", 'I like writing.'] },
]);
batch('school', 'present_simple', [
  { cue: '🚌', promptEn: 'How do you go to school?', promptPl: 'Jak chodzisz do szkoły?', answer: 'I go to school by bus.', distractors: ['I goes to school by bus.', 'She goes to school by bus.', 'I go to school by car.'] },
  { cue: '🕗', promptEn: 'When does school start?', promptPl: 'Kiedy zaczyna się szkoła?', answer: 'School starts at eight o\'clock.', accept: ['School starts at 8 o\'clock.', 'School starts at eight.'], distractors: ['School start at eight o\'clock.', 'School starts at nine o\'clock.', 'School starts at eight oclock.'] },
  { cue: '📝', promptEn: 'What does she do after lessons?', promptPl: 'Co ona robi po lekcjach?', answer: 'She does her homework.', distractors: ['She do her homework.', 'He does his homework.', 'She does her house.'] },
  { cue: '🙋', promptEn: 'What do they do in class?', promptPl: 'Co robią na lekcji?', answer: 'They listen to the teacher.', distractors: ['They listens to the teacher.', 'They listen the teacher.', 'He listens to the teacher.'] },
  { cue: '🏫', promptEn: 'Where do we learn English?', promptPl: 'Gdzie uczymy się angielskiego?', answer: 'We learn English at school.', distractors: ['We learns English at school.', 'We learn English at home.', 'They learn English at school.'] },
]);
batch('school', 'negatives', [
  { cue: '🤫', promptEn: 'Make it negative: I am noisy in class.', promptPl: 'Zrób przeczenie: I am noisy in class.', answer: "I am not noisy in class.", accept: ["I'm not noisy in class."], transformFrom: 'I am noisy in class.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['I am noisy in class.', "I don't noisy in class.", 'I not am noisy in class.'] },
  { cue: '📕', promptEn: 'Make it negative: She has got a red book.', promptPl: 'Zrób przeczenie.', answer: "She hasn't got a red book.", accept: ['She has not got a red book.', "She hasn't a red book."], transformFrom: 'She has got a red book.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['She has got a red book.', "She haven't got a red book.", "She doesn't got a red book."] },
  { cue: '✏️', promptEn: 'Make it negative: He can write Chinese.', promptPl: 'Zrób przeczenie.', answer: "He can't write Chinese.", accept: ['He cannot write Chinese.'], transformFrom: 'He can write Chinese.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['He can write Chinese.', "He don't write Chinese.", "He can't writes Chinese."] },
  { cue: '📚', promptEn: 'Make it negative: They like homework.', promptPl: 'Zrób przeczenie.', answer: "They don't like homework.", accept: ['They do not like homework.'], transformFrom: 'They like homework.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['They like homework.', "They doesn't like homework.", "They not like homework."] },
  { cue: '🏫', promptEn: 'Make it negative: We go to school on Sunday.', promptPl: 'Zrób przeczenie.', answer: "We don't go to school on Sunday.", accept: ['We do not go to school on Sunday.'], transformFrom: 'We go to school on Sunday.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['We go to school on Sunday.', "We doesn't go to school on Sunday.", "We don't goes to school on Sunday."] },
]);
batch('school', 'questions', [
  { cue: '❓', promptEn: 'Make a question: You are ready.', promptPl: 'Zrób pytanie.', answer: 'Are you ready?', transformFrom: 'You are ready.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], pairCueEn: 'Ask your partner if they are ready.', pairCuePl: 'Zapytaj partnera, czy jest gotowy.', distractors: ['You are ready?', 'Is you ready?', 'Do you ready?'] },
  { cue: '❓', promptEn: 'Make a question: She has got a pen.', promptPl: 'Zrób pytanie.', answer: 'Has she got a pen?', transformFrom: 'She has got a pen.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Have she got a pen?', 'Does she has got a pen?', 'She has got a pen?'] },
  { cue: '❓', promptEn: 'Make a question: He can swim.', promptPl: 'Zrób pytanie.', answer: 'Can he swim?', transformFrom: 'He can swim.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does he can swim?', 'Can he swims?', 'He can swim?'] },
  { cue: '❓', promptEn: 'Make a question: They like English.', promptPl: 'Zrób pytanie.', answer: 'Do they like English?', transformFrom: 'They like English.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does they like English?', 'Do they likes English?', 'They like English?'] },
  { cue: '❓', promptEn: 'Make a question: She goes to school.', promptPl: 'Zrób pytanie.', answer: 'Does she go to school?', transformFrom: 'She goes to school.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Do she go to school?', 'Does she goes to school?', 'She goes to school?'] },
]);

// ---------- FAMILY & HOME ----------
batch('family_home', 'be', [
  { cue: '👨', promptEn: 'Who is he?', promptPl: 'Kim on jest?', answer: 'He is my dad.', accept: ["He's my dad.", 'He is my father.'], distractors: ['She is my dad.', 'He is my mum.', 'They are my dad.'] },
  { cue: '👩', promptEn: 'Who is she?', promptPl: 'Kim ona jest?', answer: 'She is my mum.', accept: ["She's my mum.", 'She is my mother.'], distractors: ['He is my mum.', 'She is my sister.', 'They are my mum.'] },
  { cue: '🏠', promptEn: 'What is this?', promptPl: 'Co to jest?', answer: 'It is my house.', accept: ["It's my house.", 'This is my house.'], distractors: ['It is my school.', 'They are my house.', 'It is my flat.'] },
  { cue: '🛏️', promptEn: 'Where is your bedroom?', promptPl: 'Gdzie jest twoja sypialnia?', answer: 'My bedroom is upstairs.', distractors: ['My bedroom is downstairs.', 'My kitchen is upstairs.', 'My bedrooms are upstairs.'] },
  { cue: '😊', promptEn: 'How are you at home?', promptPl: 'Jak się czujesz w domu?', answer: 'I am happy at home.', accept: ["I'm happy at home."], distractors: ['I am sad at home.', 'He is happy at home.', 'I am happy at school.'] },
]);
batch('family_home', 'have_got', [
  { cue: '🐕', promptEn: 'Talk about your pet.', promptPl: 'Powiedz o swoim zwierzaku.', answer: 'I have got a dog.', accept: ["I've got a dog.", 'I have a dog.'], distractors: ['I have got a cat.', 'She has got a dog.', "I haven't got a dog."] },
  { cue: '👶', promptEn: 'Talk about her baby brother.', promptPl: 'Powiedz o jej braciszku.', answer: 'She has got a baby brother.', accept: ["She's got a baby brother."], distractors: ['He has got a baby brother.', 'She have got a baby brother.', 'She has got a baby sister.'] },
  { cue: '🔑', promptEn: 'Talk about the house key.', promptPl: 'Powiedz o kluczu.', answer: 'We have got a key.', accept: ["We've got a key.", 'We have a key.'], distractors: ['We has got a key.', "We haven't got a key.", 'They have got a key.'] },
  { cue: '🛋️', promptEn: 'Talk about the sofa.', promptPl: 'Powiedz o sofie.', answer: 'They have got a big sofa.', accept: ["They've got a big sofa."], distractors: ['They has got a big sofa.', 'They have got a small sofa.', 'He has got a big sofa.'] },
  { cue: '🪴', promptEn: 'Talk about plants at home.', promptPl: 'Powiedz o roślinach w domu.', answer: 'We have got two plants.', accept: ["We've got two plants."], distractors: ['We has got two plants.', 'We have got three plants.', 'I have got two plants.'] },
]);
batch('family_home', 'can', [
  { cue: '🧹', promptEn: 'Can you help at home?', promptPl: 'Czy możesz pomóc w domu?', answer: 'I can help at home.', distractors: ["I can't help at home.", 'She can help at home.', 'I can cook at school.'] },
  { cue: '🍳', promptEn: 'Can mum cook?', promptPl: 'Czy mama umie gotować?', answer: 'Mum can cook.', accept: ['My mum can cook.', 'She can cook.'], distractors: ["Mum can't cook.", 'Dad can cook.', 'Mum can swim.'] },
  { cue: '🔧', promptEn: 'Can dad fix things?', promptPl: 'Czy tata umie naprawiać?', answer: 'Dad can fix things.', accept: ['My dad can fix things.', 'He can fix things.'], distractors: ["Dad can't fix things.", 'Mum can fix things.', 'Dad can cook.'] },
  { cue: '🚪', promptEn: 'Can they open the door?', promptPl: 'Czy mogą otworzyć drzwi?', answer: 'They can open the door.', distractors: ["They can't open the door.", 'He can open the door.', 'They can close the door.'] },
  { cue: '🚫🐕', promptEn: 'Say the dog cannot come in.', promptPl: 'Powiedz, że pies nie może wejść.', answer: "The dog can't come in.", accept: ['The dog cannot come in.'], distractors: ['The dog can come in.', "The cat can't come in.", "The dog can't go out."] },
]);
batch('family_home', 'like', [
  { cue: '🏡', promptEn: 'Do you like your home?', promptPl: 'Czy lubisz swój dom?', answer: 'I like my home.', distractors: ["I don't like my home.", 'I like my school.', 'She likes my home.'] },
  { cue: '👵', promptEn: 'Does she like grandma?', promptPl: 'Czy ona lubi babcię?', answer: 'She likes grandma.', accept: ['She likes her grandma.'], distractors: ['She like grandma.', "She doesn't like grandma.", 'He likes grandma.'] },
  { cue: '🎮', promptEn: 'Does he like playing at home?', promptPl: 'Czy on lubi bawić się w domu?', answer: 'He likes playing at home.', distractors: ['He like playing at home.', "He doesn't like playing at home.", 'She likes playing at home.'] },
  { cue: '📺', promptEn: 'Do they like watching TV?', promptPl: 'Czy lubią oglądać TV?', answer: 'They like watching TV.', distractors: ['They likes watching TV.', "They don't like watching TV.", 'He likes watching TV.'] },
  { cue: '👪', promptEn: 'Do you like family dinners?', promptPl: 'Czy lubisz rodzinne obiady?', answer: 'We like family dinners.', distractors: ['We likes family dinners.', "We don't like family dinners.", 'I like school dinners.'] },
]);
batch('family_home', 'present_simple', [
  { cue: '🌅', promptEn: 'What do you do in the morning?', promptPl: 'Co robisz rano?', answer: 'I get up early.', distractors: ['I gets up early.', 'She gets up early.', 'I go to bed early.'] },
  { cue: '🍽️', promptEn: 'Where does the family eat?', promptPl: 'Gdzie je rodzina?', answer: 'We eat in the kitchen.', distractors: ['We eats in the kitchen.', 'We eat in the bedroom.', 'They eat in the kitchen.'] },
  { cue: '🧼', promptEn: 'What does she do after dinner?', promptPl: 'Co ona robi po obiedzie?', answer: 'She washes the dishes.', distractors: ['She wash the dishes.', 'He washes the dishes.', 'She washes the clothes.'] },
  { cue: '🧹', promptEn: 'What do they do on Saturday?', promptPl: 'Co robią w sobotę?', answer: 'They clean the house.', distractors: ['They cleans the house.', 'They clean the school.', 'He cleans the house.'] },
  { cue: '🌙', promptEn: 'What does dad do in the evening?', promptPl: 'Co tata robi wieczorem?', answer: 'Dad reads a book.', accept: ['He reads a book.', 'My dad reads a book.'], distractors: ['Dad read a book.', 'Mum reads a book.', 'Dad watches a book.'] },
]);
batch('family_home', 'negatives', [
  { cue: '🏠', promptEn: 'Make it negative: I am at school.', promptPl: 'Zrób przeczenie.', answer: "I am not at school.", accept: ["I'm not at school."], transformFrom: 'I am at school.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['I am at school.', "I don't at school.", 'I not am at school.'] },
  { cue: '🐱', promptEn: 'Make it negative: We have got a cat.', promptPl: 'Zrób przeczenie.', answer: "We haven't got a cat.", accept: ['We have not got a cat.'], transformFrom: 'We have got a cat.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['We have got a cat.', "We hasn't got a cat.", "We don't got a cat."] },
  { cue: '🍳', promptEn: 'Make it negative: He can cook.', promptPl: 'Zrób przeczenie.', answer: "He can't cook.", accept: ['He cannot cook.'], transformFrom: 'He can cook.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['He can cook.', "He don't cook.", "He can't cooks."] },
  { cue: '📺', promptEn: 'Make it negative: She likes TV.', promptPl: 'Zrób przeczenie.', answer: "She doesn't like TV.", accept: ['She does not like TV.'], transformFrom: 'She likes TV.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['She likes TV.', "She don't like TV.", "She doesn't likes TV."] },
  { cue: '🧹', promptEn: 'Make it negative: They clean every day.', promptPl: 'Zrób przeczenie.', answer: "They don't clean every day.", accept: ['They do not clean every day.'], transformFrom: 'They clean every day.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['They clean every day.', "They doesn't clean every day.", "They don't cleans every day."] },
]);
batch('family_home', 'questions', [
  { cue: '❓', promptEn: 'Make a question: He is your brother.', promptPl: 'Zrób pytanie.', answer: 'Is he your brother?', transformFrom: 'He is your brother.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], pairCueEn: 'Ask if he is their brother.', pairCuePl: 'Zapytaj, czy to ich brat.', distractors: ['He is your brother?', 'Are he your brother?', 'Does he your brother?'] },
  { cue: '❓', promptEn: 'Make a question: You have got a sister.', promptPl: 'Zrób pytanie.', answer: 'Have you got a sister?', transformFrom: 'You have got a sister.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Has you got a sister?', 'Do you have got a sister?', 'You have got a sister?'] },
  { cue: '❓', promptEn: 'Make a question: Mum can cook.', promptPl: 'Zrób pytanie.', answer: 'Can mum cook?', accept: ['Can your mum cook?', 'Can she cook?'], transformFrom: 'Mum can cook.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does mum can cook?', 'Can mum cooks?', 'Mum can cook?'] },
  { cue: '❓', promptEn: 'Make a question: They like their house.', promptPl: 'Zrób pytanie.', answer: 'Do they like their house?', transformFrom: 'They like their house.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does they like their house?', 'Do they likes their house?', 'They like their house?'] },
  { cue: '❓', promptEn: 'Make a question: She lives here.', promptPl: 'Zrób pytanie.', answer: 'Does she live here?', transformFrom: 'She lives here.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Do she live here?', 'Does she lives here?', 'She lives here?'] },
]);

// ---------- FOOD ----------
batch('food', 'be', [
  { cue: '🍎', promptEn: 'What colour is the apple?', promptPl: 'Jakiego koloru jest jabłko?', answer: 'The apple is red.', distractors: ['The apple is green.', 'The apples are red.', 'The banana is red.'] },
  { cue: '🍌', promptEn: 'What is this fruit?', promptPl: 'Co to za owoc?', answer: 'It is a banana.', accept: ["It's a banana.", 'This is a banana.'], distractors: ['It is an apple.', 'It is a banana cake.', 'They are bananas.'] },
  { cue: '🥛', promptEn: 'Is the milk cold?', promptPl: 'Czy mleko jest zimne?', answer: 'The milk is cold.', distractors: ['The milk is hot.', 'The juice is cold.', 'The milks are cold.'] },
  { cue: '🍰', promptEn: 'How is the cake?', promptPl: 'Jaki jest tort?', answer: 'The cake is delicious.', distractors: ['The cake is salty.', 'The cakes are delicious.', 'The soup is delicious.'] },
  { cue: '🥗', promptEn: 'Is the salad healthy?', promptPl: 'Czy sałatka jest zdrowa?', answer: 'The salad is healthy.', distractors: ['The salad is unhealthy.', 'The pizza is healthy.', 'The salads are healthy.'] },
]);
batch('food', 'have_got', [
  { cue: '🥪', promptEn: 'Talk about your lunch.', promptPl: 'Powiedz o swoim lunchu.', answer: 'I have got a sandwich.', accept: ["I've got a sandwich.", 'I have a sandwich.'], distractors: ['She has got a sandwich.', 'I have got an apple.', "I haven't got a sandwich."] },
  { cue: '🧃', promptEn: 'Talk about her juice.', promptPl: 'Powiedz o jej soku.', answer: 'She has got orange juice.', accept: ["She's got orange juice.", 'She has orange juice.'], distractors: ['He has got orange juice.', 'She have got orange juice.', 'She has got apple juice.'] },
  { cue: '🧀', promptEn: 'Talk about cheese at home.', promptPl: 'Powiedz o serze w domu.', answer: 'We have got some cheese.', accept: ["We've got some cheese.", 'We have some cheese.'], distractors: ['We has got some cheese.', 'We have got some bread.', "We haven't got some cheese."] },
  { cue: '🍕', promptEn: 'Talk about their pizza.', promptPl: 'Powiedz o ich pizzy.', answer: 'They have got a big pizza.', accept: ["They've got a big pizza."], distractors: ['They has got a big pizza.', 'They have got a small pizza.', 'He has got a big pizza.'] },
  { cue: '🍪', promptEn: 'Talk about biscuits.', promptPl: 'Powiedz o ciasteczkach.', answer: 'He has got five biscuits.', accept: ["He's got five biscuits."], distractors: ['He have got five biscuits.', 'He has got four biscuits.', 'She has got five biscuits.'] },
]);
batch('food', 'can', [
  { cue: '🍳', promptEn: 'Can you cook eggs?', promptPl: 'Czy umiesz smażyć jajka?', answer: 'I can cook eggs.', distractors: ["I can't cook eggs.", 'I can cook pasta.', 'She can cook eggs.'] },
  { cue: '🔪', promptEn: 'Can she cut bread?', promptPl: 'Czy ona umie kroić chleb?', answer: 'She can cut bread.', distractors: ["She can't cut bread.", 'He can cut bread.', 'She can bake bread.'] },
  { cue: '🥤', promptEn: 'Can he make a drink?', promptPl: 'Czy on umie zrobić napój?', answer: 'He can make a drink.', distractors: ["He can't make a drink.", 'She can make a drink.', 'He can make a cake.'] },
  { cue: '🍽️', promptEn: 'Can they set the table?', promptPl: 'Czy potrafią nakryć do stołu?', answer: 'They can set the table.', distractors: ["They can't set the table.", 'He can set the table.', 'They can clean the table.'] },
  { cue: '🚫🌶️', promptEn: 'Say you cannot eat spicy food.', promptPl: 'Powiedz, że nie jesz ostrego.', answer: "I can't eat spicy food.", accept: ['I cannot eat spicy food.'], distractors: ['I can eat spicy food.', "She can't eat spicy food.", "I can't eat sweet food."] },
]);
batch('food', 'like', [
  { cue: '🍕', promptEn: 'Do you like pizza?', promptPl: 'Czy lubisz pizzę?', answer: 'I like pizza.', distractors: ["I don't like pizza.", 'I like pasta.', 'She likes pizza.'] },
  { cue: '🍎', promptEn: 'Does she like apples?', promptPl: 'Czy ona lubi jabłka?', answer: 'She likes apples.', distractors: ['She like apples.', "She doesn't like apples.", 'He likes apples.'] },
  { cue: '🥦', promptEn: 'Does he like broccoli?', promptPl: 'Czy on lubi brokuły?', answer: 'He likes broccoli.', distractors: ['He like broccoli.', "He doesn't like broccoli.", 'She likes broccoli.'] },
  { cue: '🍦', promptEn: 'Do they like ice cream?', promptPl: 'Czy lubią lody?', answer: 'They like ice cream.', distractors: ['They likes ice cream.', "They don't like ice cream.", 'He likes ice cream.'] },
  { cue: '🥛', promptEn: 'Do you like milk?', promptPl: 'Czy lubisz mleko?', answer: 'We like milk.', distractors: ['We likes milk.', "We don't like milk.", 'I like juice.'] },
]);
batch('food', 'present_simple', [
  { cue: '🍳', promptEn: 'What do you eat for breakfast?', promptPl: 'Co jesz na śniadanie?', answer: 'I eat eggs for breakfast.', distractors: ['I eats eggs for breakfast.', 'She eats eggs for breakfast.', 'I eat pizza for breakfast.'] },
  { cue: '🥪', promptEn: 'What does she eat for lunch?', promptPl: 'Co ona je na lunch?', answer: 'She eats a sandwich for lunch.', distractors: ['She eat a sandwich for lunch.', 'He eats a sandwich for lunch.', 'She eats a pizza for lunch.'] },
  { cue: '🍲', promptEn: 'What do they have for dinner?', promptPl: 'Co mają na obiad?', answer: 'They have soup for dinner.', distractors: ['They has soup for dinner.', 'They have cake for dinner.', 'He has soup for dinner.'] },
  { cue: '💧', promptEn: 'What do you drink every day?', promptPl: 'Co pijesz codziennie?', answer: 'I drink water every day.', distractors: ['I drinks water every day.', 'She drinks water every day.', 'I drink juice every day.'] },
  { cue: '🛒', promptEn: 'Where do we buy food?', promptPl: 'Gdzie kupujemy jedzenie?', answer: 'We buy food at the shop.', distractors: ['We buys food at the shop.', 'We buy food at school.', 'They buy food at the shop.'] },
]);
batch('food', 'negatives', [
  { cue: '🧅', promptEn: 'Make it negative: I like onions.', promptPl: 'Zrób przeczenie.', answer: "I don't like onions.", accept: ['I do not like onions.'], transformFrom: 'I like onions.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['I like onions.', "I doesn't like onions.", "I not like onions."] },
  { cue: '🍰', promptEn: 'Make it negative: The cake is cold.', promptPl: 'Zrób przeczenie.', answer: 'The cake is not cold.', accept: ["The cake isn't cold."], transformFrom: 'The cake is cold.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['The cake is cold.', 'The cake are not cold.', "The cake don't cold."] },
  { cue: '🧀', promptEn: 'Make it negative: We have got cheese.', promptPl: 'Zrób przeczenie.', answer: "We haven't got cheese.", accept: ['We have not got cheese.'], transformFrom: 'We have got cheese.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['We have got cheese.', "We hasn't got cheese.", "We don't got cheese."] },
  { cue: '🍳', promptEn: 'Make it negative: He can cook fish.', promptPl: 'Zrób przeczenie.', answer: "He can't cook fish.", accept: ['He cannot cook fish.'], transformFrom: 'He can cook fish.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['He can cook fish.', "He don't cook fish.", "He can't cooks fish."] },
  { cue: '🍕', promptEn: 'Make it negative: She eats pizza every day.', promptPl: 'Zrób przeczenie.', answer: "She doesn't eat pizza every day.", accept: ['She does not eat pizza every day.'], transformFrom: 'She eats pizza every day.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['She eats pizza every day.', "She don't eat pizza every day.", "She doesn't eats pizza every day."] },
]);
batch('food', 'questions', [
  { cue: '❓', promptEn: 'Make a question: The soup is hot.', promptPl: 'Zrób pytanie.', answer: 'Is the soup hot?', transformFrom: 'The soup is hot.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['The soup is hot?', 'Are the soup hot?', 'Does the soup hot?'] },
  { cue: '❓', promptEn: 'Make a question: You have got an apple.', promptPl: 'Zrób pytanie.', answer: 'Have you got an apple?', transformFrom: 'You have got an apple.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Has you got an apple?', 'Do you got an apple?', 'You have got an apple?'] },
  { cue: '❓', promptEn: 'Make a question: She can cook.', promptPl: 'Zrób pytanie.', answer: 'Can she cook?', transformFrom: 'She can cook.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does she can cook?', 'Can she cooks?', 'She can cook?'] },
  { cue: '❓', promptEn: 'Make a question: They like bananas.', promptPl: 'Zrób pytanie.', answer: 'Do they like bananas?', transformFrom: 'They like bananas.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does they like bananas?', 'Do they likes bananas?', 'They like bananas?'] },
  { cue: '❓', promptEn: 'Make a question: He drinks milk.', promptPl: 'Zrób pytanie.', answer: 'Does he drink milk?', transformFrom: 'He drinks milk.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Do he drink milk?', 'Does he drinks milk?', 'He drinks milk?'] },
]);

// Continue remaining topics in same pattern — free_time, clothes_weather, town, animals, routines, time
batch('free_time', 'be', [
  { cue: '⚽', promptEn: 'What is this sport?', promptPl: 'Jaki to sport?', answer: 'It is football.', accept: ["It's football.", 'This is football.'], distractors: ['It is tennis.', 'It is basketball.', 'They are football.'] },
  { cue: '🎮', promptEn: 'Is the game fun?', promptPl: 'Czy gra jest fajna?', answer: 'The game is fun.', distractors: ['The game is boring.', 'The games are fun.', 'The book is fun.'] },
  { cue: '🎵', promptEn: 'How is the music?', promptPl: 'Jaka jest muzyka?', answer: 'The music is loud.', distractors: ['The music is quiet.', 'The musics are loud.', 'The song is sad.'] },
  { cue: '😊', promptEn: 'How are you after the match?', promptPl: 'Jak się czujesz po meczu?', answer: 'I am tired but happy.', accept: ["I'm tired but happy."], distractors: ['I am sad but happy.', 'He is tired but happy.', 'I am tired but angry.'] },
  { cue: '🏞️', promptEn: 'Where is the park?', promptPl: 'Gdzie jest park?', answer: 'The park is near my house.', distractors: ['The park is far from my house.', 'The school is near my house.', 'The parks are near my house.'] },
]);
batch('free_time', 'have_got', [
  { cue: '🏀', promptEn: 'Talk about your ball.', promptPl: 'Powiedz o swojej piłce.', answer: 'I have got a ball.', accept: ["I've got a ball.", 'I have a ball.'], distractors: ['She has got a ball.', 'I have got a bike.', "I haven't got a ball."] },
  { cue: '🚲', promptEn: 'Talk about his bike.', promptPl: 'Powiedz o jego rowerze.', answer: 'He has got a new bike.', accept: ["He's got a new bike."], distractors: ['She has got a new bike.', 'He have got a new bike.', 'He has got an old bike.'] },
  { cue: '🎸', promptEn: 'Talk about her guitar.', promptPl: 'Powiedz o jej gitarze.', answer: 'She has got a guitar.', accept: ["She's got a guitar."], distractors: ['He has got a guitar.', 'She have got a guitar.', 'She has got a piano.'] },
  { cue: '🎲', promptEn: 'Talk about board games.', promptPl: 'Powiedz o grach planszowych.', answer: 'We have got three board games.', accept: ["We've got three board games."], distractors: ['We has got three board games.', 'We have got two board games.', 'They have got three board games.'] },
  { cue: '🎧', promptEn: 'Talk about headphones.', promptPl: 'Powiedz o słuchawkach.', answer: 'They have got headphones.', accept: ["They've got headphones."], distractors: ['They has got headphones.', "They haven't got headphones.", 'He has got headphones.'] },
]);
batch('free_time', 'can', [
  { cue: '🏊', promptEn: 'Can you swim?', promptPl: 'Czy umiesz pływać?', answer: 'I can swim.', distractors: ["I can't swim.", 'I can run.', 'She can swim.'] },
  { cue: '🏃', promptEn: 'Can he run fast?', promptPl: 'Czy on umie szybko biegać?', answer: 'He can run fast.', distractors: ["He can't run fast.", 'She can run fast.', 'He can jump high.'] },
  { cue: '💃', promptEn: 'Can she dance?', promptPl: 'Czy ona umie tańczyć?', answer: 'She can dance.', distractors: ["She can't dance.", 'He can dance.', 'She can sing.'] },
  { cue: '🚴', promptEn: 'Can they ride a bike?', promptPl: 'Czy potrafią jeździć na rowerze?', answer: 'They can ride a bike.', distractors: ["They can't ride a bike.", 'He can ride a bike.', 'They can ride a horse.'] },
  { cue: '🚫🎾', promptEn: 'Say you cannot play tennis.', promptPl: 'Powiedz, że nie umiesz grać w tenisa.', answer: "I can't play tennis.", accept: ['I cannot play tennis.'], distractors: ['I can play tennis.', "She can't play tennis.", "I can't play football."] },
]);
batch('free_time', 'like', [
  { cue: '⚽', promptEn: 'Do you like football?', promptPl: 'Czy lubisz piłkę nożną?', answer: 'I like football.', distractors: ["I don't like football.", 'I like tennis.', 'She likes football.'] },
  { cue: '🎶', promptEn: 'Does she like music?', promptPl: 'Czy ona lubi muzykę?', answer: 'She likes music.', distractors: ['She like music.', "She doesn't like music.", 'He likes music.'] },
  { cue: '🎮', promptEn: 'Does he like computer games?', promptPl: 'Czy on lubi gry komputerowe?', answer: 'He likes computer games.', distractors: ['He like computer games.', "He doesn't like computer games.", 'She likes computer games.'] },
  { cue: '📚', promptEn: 'Do they like reading?', promptPl: 'Czy lubią czytać?', answer: 'They like reading.', distractors: ['They likes reading.', "They don't like reading.", 'He likes reading.'] },
  { cue: '🎬', promptEn: 'Do you like films?', promptPl: 'Czy lubisz filmy?', answer: 'We like films.', distractors: ['We likes films.', "We don't like films.", 'I like books.'] },
]);
batch('free_time', 'present_simple', [
  { cue: '⚽', promptEn: 'What do you play after school?', promptPl: 'W co grasz po szkole?', answer: 'I play football after school.', distractors: ['I plays football after school.', 'She plays football after school.', 'I play tennis after school.'] },
  { cue: '📺', promptEn: 'What does she watch in the evening?', promptPl: 'Co ona ogląda wieczorem?', answer: 'She watches cartoons in the evening.', distractors: ['She watch cartoons in the evening.', 'He watches cartoons in the evening.', 'She watches news in the evening.'] },
  { cue: '🏞️', promptEn: 'Where do they play?', promptPl: 'Gdzie się bawią?', answer: 'They play in the park.', distractors: ['They plays in the park.', 'They play in the kitchen.', 'He plays in the park.'] },
  { cue: '🎵', promptEn: 'What do we do on Friday?', promptPl: 'Co robimy w piątek?', answer: 'We listen to music on Friday.', distractors: ['We listens to music on Friday.', 'We listen to music on Monday.', 'They listen to music on Friday.'] },
  { cue: '🚴', promptEn: 'What does he do at the weekend?', promptPl: 'Co on robi w weekend?', answer: 'He rides his bike at the weekend.', distractors: ['He ride his bike at the weekend.', 'She rides her bike at the weekend.', 'He rides his bike on Monday.'] },
]);
batch('free_time', 'negatives', [
  { cue: '🎮', promptEn: 'Make it negative: I play games all day.', promptPl: 'Zrób przeczenie.', answer: "I don't play games all day.", accept: ['I do not play games all day.'], transformFrom: 'I play games all day.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['I play games all day.', "I doesn't play games all day.", "I not play games all day."] },
  { cue: '⚽', promptEn: 'Make it negative: Football is boring.', promptPl: 'Zrób przeczenie.', answer: 'Football is not boring.', accept: ["Football isn't boring."], transformFrom: 'Football is boring.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['Football is boring.', 'Football are not boring.', "Football don't boring."] },
  { cue: '🎸', promptEn: 'Make it negative: She has got a guitar.', promptPl: 'Zrób przeczenie.', answer: "She hasn't got a guitar.", accept: ['She has not got a guitar.'], transformFrom: 'She has got a guitar.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['She has got a guitar.', "She haven't got a guitar.", "She doesn't got a guitar."] },
  { cue: '🏊', promptEn: 'Make it negative: He can swim.', promptPl: 'Zrób przeczenie.', answer: "He can't swim.", accept: ['He cannot swim.'], transformFrom: 'He can swim.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['He can swim.', "He don't swim.", "He can't swims."] },
  { cue: '🎬', promptEn: 'Make it negative: They like films.', promptPl: 'Zrób przeczenie.', answer: "They don't like films.", accept: ['They do not like films.'], transformFrom: 'They like films.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['They like films.', "They doesn't like films.", "They not like films."] },
]);
batch('free_time', 'questions', [
  { cue: '❓', promptEn: 'Make a question: The park is open.', promptPl: 'Zrób pytanie.', answer: 'Is the park open?', transformFrom: 'The park is open.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['The park is open?', 'Are the park open?', 'Does the park open?'] },
  { cue: '❓', promptEn: 'Make a question: You have got a ball.', promptPl: 'Zrób pytanie.', answer: 'Have you got a ball?', transformFrom: 'You have got a ball.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Has you got a ball?', 'Do you got a ball?', 'You have got a ball?'] },
  { cue: '❓', promptEn: 'Make a question: She can dance.', promptPl: 'Zrób pytanie.', answer: 'Can she dance?', transformFrom: 'She can dance.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does she can dance?', 'Can she dances?', 'She can dance?'] },
  { cue: '❓', promptEn: 'Make a question: They like football.', promptPl: 'Zrób pytanie.', answer: 'Do they like football?', transformFrom: 'They like football.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does they like football?', 'Do they likes football?', 'They like football?'] },
  { cue: '❓', promptEn: 'Make a question: He plays tennis.', promptPl: 'Zrób pytanie.', answer: 'Does he play tennis?', transformFrom: 'He plays tennis.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Do he play tennis?', 'Does he plays tennis?', 'He plays tennis?'] },
]);

batch('clothes_weather', 'be', [
  { cue: '☀️', promptEn: 'How is the weather?', promptPl: 'Jaka jest pogoda?', answer: 'It is sunny today.', accept: ["It's sunny today.", 'It is sunny.'], distractors: ['It is rainy today.', 'It is cold today.', 'They are sunny today.'] },
  { cue: '🌧️', promptEn: 'How is the weather?', promptPl: 'Jaka jest pogoda?', answer: 'It is rainy today.', accept: ["It's rainy today.", 'It is raining today.'], distractors: ['It is sunny today.', 'It is snowy today.', 'It are rainy today.'] },
  { cue: '🧥', promptEn: 'What colour is the coat?', promptPl: 'Jakiego koloru jest płaszcz?', answer: 'The coat is blue.', distractors: ['The coat is red.', 'The coats are blue.', 'The hat is blue.'] },
  { cue: '🧣', promptEn: 'Is the scarf warm?', promptPl: 'Czy szalik jest ciepły?', answer: 'The scarf is warm.', distractors: ['The scarf is cold.', 'The scarves are warm.', 'The hat is warm.'] },
  { cue: '❄️', promptEn: 'How is it outside?', promptPl: 'Jak jest na zewnątrz?', answer: 'It is cold outside.', accept: ["It's cold outside."], distractors: ['It is hot outside.', 'It is warm outside.', 'It are cold outside.'] },
]);
batch('clothes_weather', 'have_got', [
  { cue: '🧢', promptEn: 'Talk about your hat.', promptPl: 'Powiedz o swojej czapce.', answer: 'I have got a hat.', accept: ["I've got a hat.", 'I have a hat.'], distractors: ['She has got a hat.', 'I have got a coat.', "I haven't got a hat."] },
  { cue: '👟', promptEn: 'Talk about her shoes.', promptPl: 'Powiedz o jej butach.', answer: 'She has got new shoes.', accept: ["She's got new shoes."], distractors: ['He has got new shoes.', 'She have got new shoes.', 'She has got old shoes.'] },
  { cue: '🧤', promptEn: 'Talk about his gloves.', promptPl: 'Powiedz o jego rękawiczkach.', answer: 'He has got warm gloves.', accept: ["He's got warm gloves."], distractors: ['She has got warm gloves.', 'He have got warm gloves.', 'He has got cold gloves.'] },
  { cue: '👕', promptEn: 'Talk about T-shirts.', promptPl: 'Powiedz o koszulkach.', answer: 'We have got two T-shirts.', accept: ["We've got two T-shirts.", 'We have got two t-shirts.'], distractors: ['We has got two T-shirts.', 'We have got three T-shirts.', 'They have got two T-shirts.'] },
  { cue: '☂️', promptEn: 'Talk about an umbrella.', promptPl: 'Powiedz o parasolu.', answer: 'They have got an umbrella.', accept: ["They've got an umbrella."], distractors: ['They has got an umbrella.', "They haven't got an umbrella.", 'He has got an umbrella.'] },
]);
batch('clothes_weather', 'can', [
  { cue: '🧥', promptEn: 'Can you put on your coat?', promptPl: 'Czy możesz założyć płaszcz?', answer: 'I can put on my coat.', distractors: ["I can't put on my coat.", 'She can put on her coat.', 'I can take off my coat.'] },
  { cue: '👒', promptEn: 'Can she wear a hat today?', promptPl: 'Czy ona może założyć kapelusz?', answer: 'She can wear a hat today.', distractors: ["She can't wear a hat today.", 'He can wear a hat today.', 'She can wear a coat today.'] },
  { cue: '👟', promptEn: 'Can he tie his shoes?', promptPl: 'Czy on umie zawiązać buty?', answer: 'He can tie his shoes.', distractors: ["He can't tie his shoes.", 'She can tie her shoes.', 'He can clean his shoes.'] },
  { cue: '☂️', promptEn: 'Can they use an umbrella?', promptPl: 'Czy mogą użyć parasola?', answer: 'They can use an umbrella.', distractors: ["They can't use an umbrella.", 'He can use an umbrella.', 'They can use a coat.'] },
  { cue: '🚫🩳', promptEn: 'Say you cannot wear shorts in winter.', promptPl: 'Powiedz, że zimą nie nosisz szortów.', answer: "I can't wear shorts in winter.", accept: ['I cannot wear shorts in winter.'], distractors: ['I can wear shorts in winter.', "She can't wear shorts in winter.", "I can't wear coats in winter."] },
]);
batch('clothes_weather', 'like', [
  { cue: '☀️', promptEn: 'Do you like sunny days?', promptPl: 'Czy lubisz słoneczne dni?', answer: 'I like sunny days.', distractors: ["I don't like sunny days.", 'I like rainy days.', 'She likes sunny days.'] },
  { cue: '🧥', promptEn: 'Does she like her coat?', promptPl: 'Czy ona lubi swój płaszcz?', answer: 'She likes her coat.', distractors: ['She like her coat.', "She doesn't like her coat.", 'He likes her coat.'] },
  { cue: '❄️', promptEn: 'Does he like snow?', promptPl: 'Czy on lubi śnieg?', answer: 'He likes snow.', distractors: ['He like snow.', "He doesn't like snow.", 'She likes snow.'] },
  { cue: '👢', promptEn: 'Do they like boots?', promptPl: 'Czy lubią kozaki?', answer: 'They like boots.', distractors: ['They likes boots.', "They don't like boots.", 'He likes boots.'] },
  { cue: '🌬️', promptEn: 'Do you like windy weather?', promptPl: 'Czy lubisz wietrzną pogodę?', answer: 'We like windy weather.', distractors: ['We likes windy weather.', "We don't like windy weather.", 'I like rainy weather.'] },
]);
batch('clothes_weather', 'present_simple', [
  { cue: '🧥', promptEn: 'What do you wear in winter?', promptPl: 'Co nosisz zimą?', answer: 'I wear a warm coat in winter.', distractors: ['I wears a warm coat in winter.', 'She wears a warm coat in winter.', 'I wear shorts in winter.'] },
  { cue: '👕', promptEn: 'What does she wear in summer?', promptPl: 'Co ona nosi latem?', answer: 'She wears a T-shirt in summer.', accept: ['She wears a t-shirt in summer.'], distractors: ['She wear a T-shirt in summer.', 'He wears a T-shirt in summer.', 'She wears a coat in summer.'] },
  { cue: '☂️', promptEn: 'What do they take when it rains?', promptPl: 'Co biorą, gdy pada?', answer: 'They take an umbrella when it rains.', distractors: ['They takes an umbrella when it rains.', 'They take a hat when it rains.', 'He takes an umbrella when it rains.'] },
  { cue: '🧢', promptEn: 'What does he put on in the sun?', promptPl: 'Co zakłada na słońcu?', answer: 'He puts on a hat in the sun.', distractors: ['He put on a hat in the sun.', 'She puts on a hat in the sun.', 'He puts on gloves in the sun.'] },
  { cue: '🧦', promptEn: 'What do we put on our feet?', promptPl: 'Co zakładamy na stopy?', answer: 'We put on socks and shoes.', distractors: ['We puts on socks and shoes.', 'We put on hats and shoes.', 'They put on socks and shoes.'] },
]);
batch('clothes_weather', 'negatives', [
  { cue: '☀️', promptEn: 'Make it negative: It is cold today.', promptPl: 'Zrób przeczenie.', answer: 'It is not cold today.', accept: ["It isn't cold today."], transformFrom: 'It is cold today.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['It is cold today.', 'It are not cold today.', "It don't cold today."] },
  { cue: '🧤', promptEn: 'Make it negative: I have got gloves.', promptPl: 'Zrób przeczenie.', answer: "I haven't got gloves.", accept: ['I have not got gloves.'], transformFrom: 'I have got gloves.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['I have got gloves.', "I hasn't got gloves.", "I don't got gloves."] },
  { cue: '🩳', promptEn: 'Make it negative: She can wear shorts now.', promptPl: 'Zrób przeczenie.', answer: "She can't wear shorts now.", accept: ['She cannot wear shorts now.'], transformFrom: 'She can wear shorts now.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['She can wear shorts now.', "She don't wear shorts now.", "She can't wears shorts now."] },
  { cue: '🌧️', promptEn: 'Make it negative: He likes rain.', promptPl: 'Zrób przeczenie.', answer: "He doesn't like rain.", accept: ['He does not like rain.'], transformFrom: 'He likes rain.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['He likes rain.', "He don't like rain.", "He doesn't likes rain."] },
  { cue: '🧥', promptEn: 'Make it negative: They wear coats in summer.', promptPl: 'Zrób przeczenie.', answer: "They don't wear coats in summer.", accept: ['They do not wear coats in summer.'], transformFrom: 'They wear coats in summer.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['They wear coats in summer.', "They doesn't wear coats in summer.", "They don't wears coats in summer."] },
]);
batch('clothes_weather', 'questions', [
  { cue: '❓', promptEn: 'Make a question: It is windy.', promptPl: 'Zrób pytanie.', answer: 'Is it windy?', transformFrom: 'It is windy.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['It is windy?', 'Are it windy?', 'Does it windy?'] },
  { cue: '❓', promptEn: 'Make a question: You have got a scarf.', promptPl: 'Zrób pytanie.', answer: 'Have you got a scarf?', transformFrom: 'You have got a scarf.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Has you got a scarf?', 'Do you got a scarf?', 'You have got a scarf?'] },
  { cue: '❓', promptEn: 'Make a question: She can wear boots.', promptPl: 'Zrób pytanie.', answer: 'Can she wear boots?', transformFrom: 'She can wear boots.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does she can wear boots?', 'Can she wears boots?', 'She can wear boots?'] },
  { cue: '❓', promptEn: 'Make a question: They like snow.', promptPl: 'Zrób pytanie.', answer: 'Do they like snow?', transformFrom: 'They like snow.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does they like snow?', 'Do they likes snow?', 'They like snow?'] },
  { cue: '❓', promptEn: 'Make a question: He wears a jumper.', promptPl: 'Zrób pytanie.', answer: 'Does he wear a jumper?', transformFrom: 'He wears a jumper.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Do he wear a jumper?', 'Does he wears a jumper?', 'He wears a jumper?'] },
]);

batch('town', 'be', [
  { cue: '🏪', promptEn: 'What is this place?', promptPl: 'Co to za miejsce?', answer: 'It is a shop.', accept: ["It's a shop.", 'This is a shop.'], distractors: ['It is a school.', 'It is a park.', 'They are shops.'] },
  { cue: '🏥', promptEn: 'What is this building?', promptPl: 'Co to za budynek?', answer: 'It is a hospital.', accept: ["It's a hospital."], distractors: ['It is a library.', 'It is a cinema.', 'They are hospitals.'] },
  { cue: '🚏', promptEn: 'Where is the bus stop?', promptPl: 'Gdzie jest przystanek?', answer: 'The bus stop is near the park.', distractors: ['The bus stop is near the school.', 'The bus stops are near the park.', 'The cinema is near the park.'] },
  { cue: '🚦', promptEn: 'Is the light red?', promptPl: 'Czy światło jest czerwone?', answer: 'The light is red.', distractors: ['The light is green.', 'The lights are red.', 'The car is red.'] },
  { cue: '🏛️', promptEn: 'Is the museum big?', promptPl: 'Czy muzeum jest duże?', answer: 'The museum is big.', distractors: ['The museum is small.', 'The museums are big.', 'The library is big.'] },
]);
batch('town', 'have_got', [
  { cue: '🗺️', promptEn: 'Talk about a map.', promptPl: 'Powiedz o mapie.', answer: 'I have got a map.', accept: ["I've got a map.", 'I have a map.'], distractors: ['She has got a map.', 'I have got a ticket.', "I haven't got a map."] },
  { cue: '🎫', promptEn: 'Talk about her ticket.', promptPl: 'Powiedz o jej bilecie.', answer: 'She has got a ticket.', accept: ["She's got a ticket."], distractors: ['He has got a ticket.', 'She have got a ticket.', 'She has got a map.'] },
  { cue: '🚌', promptEn: 'Talk about buses in town.', promptPl: 'Powiedz o autobusach.', answer: 'The town has got many buses.', accept: ['The town has many buses.'], distractors: ['The town have got many buses.', 'The town has got many trains.', 'The village has got many buses.'] },
  { cue: '🏪', promptEn: 'Talk about shops.', promptPl: 'Powiedz o sklepach.', answer: 'We have got a shop on our street.', accept: ["We've got a shop on our street."], distractors: ['We has got a shop on our street.', 'We have got a school on our street.', 'They have got a shop on our street.'] },
  { cue: '🅿️', promptEn: 'Talk about a car park.', promptPl: 'Powiedz o parkingu.', answer: 'They have got a car park.', accept: ["They've got a car park."], distractors: ['They has got a car park.', "They haven't got a car park.", 'He has got a car park.'] },
]);
batch('town', 'can', [
  { cue: '🚶', promptEn: 'Can you walk to the shop?', promptPl: 'Czy możesz dojść do sklepu?', answer: 'I can walk to the shop.', distractors: ["I can't walk to the shop.", 'She can walk to the shop.', 'I can run to the park.'] },
  { cue: '🚌', promptEn: 'Can she take the bus?', promptPl: 'Czy ona może wziąć autobus?', answer: 'She can take the bus.', distractors: ["She can't take the bus.", 'He can take the bus.', 'She can take the train.'] },
  { cue: '🗺️', promptEn: 'Can he read the map?', promptPl: 'Czy on umie czytać mapę?', answer: 'He can read the map.', distractors: ["He can't read the map.", 'She can read the map.', 'He can buy the map.'] },
  { cue: '🚦', promptEn: 'Can they cross the street?', promptPl: 'Czy mogą przejść przez ulicę?', answer: 'They can cross the street.', distractors: ["They can't cross the street.", 'He can cross the street.', 'They can cross the park.'] },
  { cue: '🚫🚗', promptEn: 'Say you cannot drive a car.', promptPl: 'Powiedz, że nie możesz prowadzić.', answer: "I can't drive a car.", accept: ['I cannot drive a car.'], distractors: ['I can drive a car.', "She can't drive a car.", "I can't ride a bike."] },
]);
batch('town', 'like', [
  { cue: '🏙️', promptEn: 'Do you like your town?', promptPl: 'Czy lubisz swoje miasto?', answer: 'I like my town.', distractors: ["I don't like my town.", 'I like my village.', 'She likes my town.'] },
  { cue: '🎬', promptEn: 'Does she like the cinema?', promptPl: 'Czy ona lubi kino?', answer: 'She likes the cinema.', distractors: ['She like the cinema.', "She doesn't like the cinema.", 'He likes the cinema.'] },
  { cue: '🏊', promptEn: 'Does he like the swimming pool?', promptPl: 'Czy on lubi basen?', answer: 'He likes the swimming pool.', distractors: ['He like the swimming pool.', "He doesn't like the swimming pool.", 'She likes the swimming pool.'] },
  { cue: '🌳', promptEn: 'Do they like the park?', promptPl: 'Czy lubią park?', answer: 'They like the park.', distractors: ['They likes the park.', "They don't like the park.", 'He likes the park.'] },
  { cue: '📚', promptEn: 'Do you like the library?', promptPl: 'Czy lubisz bibliotekę?', answer: 'We like the library.', distractors: ['We likes the library.', "We don't like the library.", 'I like the museum.'] },
]);
batch('town', 'present_simple', [
  { cue: '🚌', promptEn: 'How do you go to town?', promptPl: 'Jak jedziesz do miasta?', answer: 'I go to town by bus.', distractors: ['I goes to town by bus.', 'She goes to town by bus.', 'I go to town by train.'] },
  { cue: '🛒', promptEn: 'Where does she buy bread?', promptPl: 'Gdzie ona kupuje chleb?', answer: 'She buys bread at the bakery.', distractors: ['She buy bread at the bakery.', 'He buys bread at the bakery.', 'She buys bread at the cinema.'] },
  { cue: '🚶', promptEn: 'Where do they walk?', promptPl: 'Gdzie chodzą?', answer: 'They walk in the town centre.', accept: ['They walk in the town center.'], distractors: ['They walks in the town centre.', 'They walk in the forest.', 'He walks in the town centre.'] },
  { cue: '📮', promptEn: 'What do we post at the post office?', promptPl: 'Co nadajemy na poczcie?', answer: 'We post letters at the post office.', distractors: ['We posts letters at the post office.', 'We post letters at the bank.', 'They post letters at the post office.'] },
  { cue: '🏥', promptEn: 'Where does he work?', promptPl: 'Gdzie on pracuje?', answer: 'He works at the hospital.', distractors: ['He work at the hospital.', 'She works at the hospital.', 'He works at the library.'] },
]);
batch('town', 'negatives', [
  { cue: '🏪', promptEn: 'Make it negative: The shop is open.', promptPl: 'Zrób przeczenie.', answer: 'The shop is not open.', accept: ["The shop isn't open."], transformFrom: 'The shop is open.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['The shop is open.', 'The shop are not open.', "The shop don't open."] },
  { cue: '🎫', promptEn: 'Make it negative: I have got a ticket.', promptPl: 'Zrób przeczenie.', answer: "I haven't got a ticket.", accept: ['I have not got a ticket.'], transformFrom: 'I have got a ticket.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['I have got a ticket.', "I hasn't got a ticket.", "I don't got a ticket."] },
  { cue: '🚌', promptEn: 'Make it negative: She can take the bus.', promptPl: 'Zrób przeczenie.', answer: "She can't take the bus.", accept: ['She cannot take the bus.'], transformFrom: 'She can take the bus.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['She can take the bus.', "She don't take the bus.", "She can't takes the bus."] },
  { cue: '🎬', promptEn: 'Make it negative: He likes the cinema.', promptPl: 'Zrób przeczenie.', answer: "He doesn't like the cinema.", accept: ['He does not like the cinema.'], transformFrom: 'He likes the cinema.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['He likes the cinema.', "He don't like the cinema.", "He doesn't likes the cinema."] },
  { cue: '🚶', promptEn: 'Make it negative: They walk to town every day.', promptPl: 'Zrób przeczenie.', answer: "They don't walk to town every day.", accept: ['They do not walk to town every day.'], transformFrom: 'They walk to town every day.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['They walk to town every day.', "They doesn't walk to town every day.", "They don't walks to town every day."] },
]);
batch('town', 'questions', [
  { cue: '❓', promptEn: 'Make a question: The library is free.', promptPl: 'Zrób pytanie.', answer: 'Is the library free?', transformFrom: 'The library is free.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['The library is free?', 'Are the library free?', 'Does the library free?'] },
  { cue: '❓', promptEn: 'Make a question: You have got a map.', promptPl: 'Zrób pytanie.', answer: 'Have you got a map?', transformFrom: 'You have got a map.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Has you got a map?', 'Do you got a map?', 'You have got a map?'] },
  { cue: '❓', promptEn: 'Make a question: She can walk there.', promptPl: 'Zrób pytanie.', answer: 'Can she walk there?', transformFrom: 'She can walk there.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does she can walk there?', 'Can she walks there?', 'She can walk there?'] },
  { cue: '❓', promptEn: 'Make a question: They like this town.', promptPl: 'Zrób pytanie.', answer: 'Do they like this town?', transformFrom: 'They like this town.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does they like this town?', 'Do they likes this town?', 'They like this town?'] },
  { cue: '❓', promptEn: 'Make a question: He works here.', promptPl: 'Zrób pytanie.', answer: 'Does he work here?', transformFrom: 'He works here.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Do he work here?', 'Does he works here?', 'He works here?'] },
]);

batch('animals', 'be', [
  { cue: '🐕', promptEn: 'What is this animal?', promptPl: 'Co to za zwierzę?', answer: 'It is a dog.', accept: ["It's a dog.", 'This is a dog.'], distractors: ['It is a cat.', 'It is a bird.', 'They are dogs.'] },
  { cue: '🐈', promptEn: 'What is this animal?', promptPl: 'Co to za zwierzę?', answer: 'It is a cat.', accept: ["It's a cat."], distractors: ['It is a dog.', 'It is a rabbit.', 'They are cats.'] },
  { cue: '🐦', promptEn: 'Is the bird small?', promptPl: 'Czy ptak jest mały?', answer: 'The bird is small.', distractors: ['The bird is big.', 'The birds are small.', 'The dog is small.'] },
  { cue: '🐘', promptEn: 'Is the elephant strong?', promptPl: 'Czy słoń jest silny?', answer: 'The elephant is strong.', distractors: ['The elephant is weak.', 'The elephants are strong.', 'The mouse is strong.'] },
  { cue: '🐸', promptEn: 'What colour is the frog?', promptPl: 'Jakiego koloru jest żaba?', answer: 'The frog is green.', distractors: ['The frog is blue.', 'The frogs are green.', 'The fish is green.'] },
]);
batch('animals', 'have_got', [
  { cue: '🐇', promptEn: 'Talk about your rabbit.', promptPl: 'Powiedz o swoim króliku.', answer: 'I have got a rabbit.', accept: ["I've got a rabbit.", 'I have a rabbit.'], distractors: ['She has got a rabbit.', 'I have got a mouse.', "I haven't got a rabbit."] },
  { cue: '🐴', promptEn: 'Talk about her horse.', promptPl: 'Powiedz o jej koniu.', answer: 'She has got a horse.', accept: ["She's got a horse."], distractors: ['He has got a horse.', 'She have got a horse.', 'She has got a cow.'] },
  { cue: '🐟', promptEn: 'Talk about fish.', promptPl: 'Powiedz o rybach.', answer: 'He has got two fish.', accept: ["He's got two fish."], distractors: ['He have got two fish.', 'He has got three fish.', 'She has got two fish.'] },
  { cue: '🐶', promptEn: 'Talk about pets.', promptPl: 'Powiedz o zwierzakach.', answer: 'We have got a pet dog.', accept: ["We've got a pet dog."], distractors: ['We has got a pet dog.', 'We have got a pet cat.', 'They have got a pet dog.'] },
  { cue: '🐢', promptEn: 'Talk about a tortoise.', promptPl: 'Powiedz o żółwiu.', answer: 'They have got a tortoise.', accept: ["They've got a tortoise."], distractors: ['They has got a tortoise.', "They haven't got a tortoise.", 'He has got a tortoise.'] },
]);
batch('animals', 'can', [
  { cue: '🐦', promptEn: 'Can a bird fly?', promptPl: 'Czy ptak umie latać?', answer: 'A bird can fly.', accept: ['Birds can fly.', 'The bird can fly.'], distractors: ["A bird can't fly.", 'A fish can fly.', 'A bird can swim.'] },
  { cue: '🐟', promptEn: 'Can a fish swim?', promptPl: 'Czy ryba umie pływać?', answer: 'A fish can swim.', accept: ['Fish can swim.', 'The fish can swim.'], distractors: ["A fish can't swim.", 'A dog can swim.', 'A fish can fly.'] },
  { cue: '🐕', promptEn: 'Can the dog run?', promptPl: 'Czy pies umie biegać?', answer: 'The dog can run.', distractors: ["The dog can't run.", 'The cat can run.', 'The dog can fly.'] },
  { cue: '🐈', promptEn: 'Can cats climb?', promptPl: 'Czy koty umieją wspinać się?', answer: 'Cats can climb.', accept: ['A cat can climb.', 'The cat can climb.'], distractors: ["Cats can't climb.", 'Dogs can climb.', 'Cats can fly.'] },
  { cue: '🚫🐘', promptEn: 'Say an elephant cannot fly.', promptPl: 'Powiedz, że słoń nie lata.', answer: "An elephant can't fly.", accept: ['An elephant cannot fly.', "Elephants can't fly."], distractors: ['An elephant can fly.', "A bird can't fly.", "An elephant can't swim."] },
]);
batch('animals', 'like', [
  { cue: '🐕', promptEn: 'Do you like dogs?', promptPl: 'Czy lubisz psy?', answer: 'I like dogs.', distractors: ["I don't like dogs.", 'I like cats.', 'She likes dogs.'] },
  { cue: '🐈', promptEn: 'Does she like cats?', promptPl: 'Czy ona lubi koty?', answer: 'She likes cats.', distractors: ['She like cats.', "She doesn't like cats.", 'He likes cats.'] },
  { cue: '🐴', promptEn: 'Does he like horses?', promptPl: 'Czy on lubi konie?', answer: 'He likes horses.', distractors: ['He like horses.', "He doesn't like horses.", 'She likes horses.'] },
  { cue: '🐦', promptEn: 'Do they like birds?', promptPl: 'Czy lubią ptaki?', answer: 'They like birds.', distractors: ['They likes birds.', "They don't like birds.", 'He likes birds.'] },
  { cue: '🐇', promptEn: 'Do you like rabbits?', promptPl: 'Czy lubisz króliki?', answer: 'We like rabbits.', distractors: ['We likes rabbits.', "We don't like rabbits.", 'I like mice.'] },
]);
batch('animals', 'present_simple', [
  { cue: '🐕', promptEn: 'What does a dog eat?', promptPl: 'Co je pies?', answer: 'A dog eats meat.', accept: ['Dogs eat meat.', 'The dog eats meat.'], distractors: ['A dog eat meat.', 'A dog eats grass.', 'A cat eats meat.'] },
  { cue: '🐈', promptEn: 'What does a cat drink?', promptPl: 'Co pije kot?', answer: 'A cat drinks milk.', accept: ['Cats drink milk.', 'The cat drinks milk.'], distractors: ['A cat drink milk.', 'A cat drinks water only.', 'A dog drinks milk.'] },
  { cue: '🐦', promptEn: 'Where do birds live?', promptPl: 'Gdzie mieszkają ptaki?', answer: 'Birds live in trees.', accept: ['A bird lives in a tree.'], distractors: ['Birds lives in trees.', 'Birds live in water.', 'Fish live in trees.'] },
  { cue: '🐟', promptEn: 'Where do fish swim?', promptPl: 'Gdzie pływają ryby?', answer: 'Fish swim in water.', accept: ['A fish swims in water.'], distractors: ['Fish swims in water.', 'Fish swim in air.', 'Birds swim in water.'] },
  { cue: '🐴', promptEn: 'What does a horse eat?', promptPl: 'Co je koń?', answer: 'A horse eats grass.', accept: ['Horses eat grass.', 'The horse eats grass.'], distractors: ['A horse eat grass.', 'A horse eats meat.', 'A cow eats grass.'] },
]);
batch('animals', 'negatives', [
  { cue: '🐟', promptEn: 'Make it negative: A fish can fly.', promptPl: 'Zrób przeczenie.', answer: "A fish can't fly.", accept: ['A fish cannot fly.', "Fish can't fly."], transformFrom: 'A fish can fly.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['A fish can fly.', "A fish don't fly.", "A fish can't flies."] },
  { cue: '🐕', promptEn: 'Make it negative: The dog is small.', promptPl: 'Zrób przeczenie.', answer: 'The dog is not small.', accept: ["The dog isn't small."], transformFrom: 'The dog is small.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['The dog is small.', 'The dog are not small.', "The dog don't small."] },
  { cue: '🐈', promptEn: 'Make it negative: I have got a cat.', promptPl: 'Zrób przeczenie.', answer: "I haven't got a cat.", accept: ['I have not got a cat.'], transformFrom: 'I have got a cat.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['I have got a cat.', "I hasn't got a cat.", "I don't got a cat."] },
  { cue: '🐦', promptEn: 'Make it negative: She likes birds.', promptPl: 'Zrób przeczenie.', answer: "She doesn't like birds.", accept: ['She does not like birds.'], transformFrom: 'She likes birds.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['She likes birds.', "She don't like birds.", "She doesn't likes birds."] },
  { cue: '🐘', promptEn: 'Make it negative: Elephants live in the sea.', promptPl: 'Zrób przeczenie.', answer: "Elephants don't live in the sea.", accept: ['Elephants do not live in the sea.'], transformFrom: 'Elephants live in the sea.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['Elephants live in the sea.', "Elephants doesn't live in the sea.", "Elephants don't lives in the sea."] },
]);
batch('animals', 'questions', [
  { cue: '❓', promptEn: 'Make a question: The cat is hungry.', promptPl: 'Zrób pytanie.', answer: 'Is the cat hungry?', transformFrom: 'The cat is hungry.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['The cat is hungry?', 'Are the cat hungry?', 'Does the cat hungry?'] },
  { cue: '❓', promptEn: 'Make a question: You have got a dog.', promptPl: 'Zrób pytanie.', answer: 'Have you got a dog?', transformFrom: 'You have got a dog.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Has you got a dog?', 'Do you got a dog?', 'You have got a dog?'] },
  { cue: '❓', promptEn: 'Make a question: A bird can sing.', promptPl: 'Zrób pytanie.', answer: 'Can a bird sing?', transformFrom: 'A bird can sing.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does a bird can sing?', 'Can a bird sings?', 'A bird can sing?'] },
  { cue: '❓', promptEn: 'Make a question: They like rabbits.', promptPl: 'Zrób pytanie.', answer: 'Do they like rabbits?', transformFrom: 'They like rabbits.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does they like rabbits?', 'Do they likes rabbits?', 'They like rabbits?'] },
  { cue: '❓', promptEn: 'Make a question: He feeds the dog.', promptPl: 'Zrób pytanie.', answer: 'Does he feed the dog?', transformFrom: 'He feeds the dog.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Do he feed the dog?', 'Does he feeds the dog?', 'He feeds the dog?'] },
]);

batch('routines', 'be', [
  { cue: '🌅', promptEn: 'How are you in the morning?', promptPl: 'Jak się czujesz rano?', answer: 'I am sleepy in the morning.', accept: ["I'm sleepy in the morning."], distractors: ['I am sleepy at night.', 'He is sleepy in the morning.', 'I am hungry in the morning.'] },
  { cue: '😊', promptEn: 'How is she after breakfast?', promptPl: 'Jak ona się czuje po śniadaniu?', answer: 'She is ready for school.', accept: ["She's ready for school."], distractors: ['He is ready for school.', 'She is ready for bed.', 'She are ready for school.'] },
  { cue: '🌙', promptEn: 'How is it at night?', promptPl: 'Jak jest w nocy?', answer: 'It is quiet at night.', accept: ["It's quiet at night."], distractors: ['It is noisy at night.', 'It is quiet in the morning.', 'It are quiet at night.'] },
  { cue: '🛁', promptEn: 'Is the bathroom free?', promptPl: 'Czy łazienka jest wolna?', answer: 'The bathroom is free.', distractors: ['The bathroom is busy.', 'The bedrooms are free.', 'The kitchen is free.'] },
  { cue: '🏫', promptEn: 'Are you late for school?', promptPl: 'Czy spóźniasz się do szkoły?', answer: 'I am not late for school.', accept: ["I'm not late for school."], distractors: ['I am late for school.', 'He is not late for school.', 'I am not late for bed.'] },
]);
batch('routines', 'have_got', [
  { cue: '⏰', promptEn: 'Talk about your alarm clock.', promptPl: 'Powiedz o budziku.', answer: 'I have got an alarm clock.', accept: ["I've got an alarm clock.", 'I have an alarm clock.'], distractors: ['She has got an alarm clock.', 'I have got a watch.', "I haven't got an alarm clock."] },
  { cue: '🪥', promptEn: 'Talk about her toothbrush.', promptPl: 'Powiedz o jej szczoteczce.', answer: 'She has got a toothbrush.', accept: ["She's got a toothbrush."], distractors: ['He has got a toothbrush.', 'She have got a toothbrush.', 'She has got a comb.'] },
  { cue: '🧼', promptEn: 'Talk about soap.', promptPl: 'Powiedz o mydle.', answer: 'We have got soap in the bathroom.', accept: ["We've got soap in the bathroom."], distractors: ['We has got soap in the bathroom.', 'We have got soap in the kitchen.', 'They have got soap in the bathroom.'] },
  { cue: '🛏️', promptEn: 'Talk about beds.', promptPl: 'Powiedz o łóżkach.', answer: 'They have got clean beds.', accept: ["They've got clean beds."], distractors: ['They has got clean beds.', 'They have got dirty beds.', 'He has got clean beds.'] },
  { cue: '🎒', promptEn: 'Talk about a school bag ready.', promptPl: 'Powiedz o gotowym tornistrze.', answer: 'He has got his bag ready.', accept: ["He's got his bag ready."], distractors: ['She has got his bag ready.', 'He have got his bag ready.', 'He has got his book ready.'] },
]);
batch('routines', 'can', [
  { cue: '⏰', promptEn: 'Can you get up early?', promptPl: 'Czy potrafisz wstać wcześnie?', answer: 'I can get up early.', distractors: ["I can't get up early.", 'She can get up early.', 'I can go to bed early.'] },
  { cue: '🦷', promptEn: 'Can she brush her teeth alone?', promptPl: 'Czy ona sama myje zęby?', answer: 'She can brush her teeth alone.', distractors: ["She can't brush her teeth alone.", 'He can brush his teeth alone.', 'She can wash her face alone.'] },
  { cue: '🛏️', promptEn: 'Can he make his bed?', promptPl: 'Czy on umie zaścielić łóżko?', answer: 'He can make his bed.', distractors: ["He can't make his bed.", 'She can make her bed.', 'He can clean his room.'] },
  { cue: '🎒', promptEn: 'Can they pack their bags?', promptPl: 'Czy potrafią spakować torby?', answer: 'They can pack their bags.', distractors: ["They can't pack their bags.", 'He can pack his bag.', 'They can open their bags.'] },
  { cue: '🚫😴', promptEn: 'Say you cannot sleep late today.', promptPl: 'Powiedz, że dziś nie możesz spać długo.', answer: "I can't sleep late today.", accept: ['I cannot sleep late today.'], distractors: ['I can sleep late today.', "She can't sleep late today.", "I can't wake up late today."] },
]);
batch('routines', 'like', [
  { cue: '🌅', promptEn: 'Do you like mornings?', promptPl: 'Czy lubisz poranki?', answer: 'I like mornings.', distractors: ["I don't like mornings.", 'I like evenings.', 'She likes mornings.'] },
  { cue: '🍳', promptEn: 'Does she like breakfast?', promptPl: 'Czy ona lubi śniadanie?', answer: 'She likes breakfast.', distractors: ['She like breakfast.', "She doesn't like breakfast.", 'He likes breakfast.'] },
  { cue: '🚿', promptEn: 'Does he like showers?', promptPl: 'Czy on lubi prysznic?', answer: 'He likes showers.', distractors: ['He like showers.', "He doesn't like showers.", 'She likes showers.'] },
  { cue: '📚', promptEn: 'Do they like homework time?', promptPl: 'Czy lubią czas na zadanie?', answer: 'They like homework time.', distractors: ['They likes homework time.', "They don't like homework time.", 'He likes homework time.'] },
  { cue: '🌙', promptEn: 'Do you like bedtime stories?', promptPl: 'Czy lubisz bajki na dobranoc?', answer: 'We like bedtime stories.', distractors: ['We likes bedtime stories.', "We don't like bedtime stories.", 'I like morning stories.'] },
]);
batch('routines', 'present_simple', [
  { cue: '⏰', promptEn: 'What time do you get up?', promptPl: 'O której wstajesz?', answer: 'I get up at seven o\'clock.', accept: ['I get up at 7 o\'clock.', 'I get up at seven.'], distractors: ['I gets up at seven o\'clock.', 'She gets up at seven o\'clock.', 'I get up at eight o\'clock.'] },
  { cue: '🦷', promptEn: 'What does she do after breakfast?', promptPl: 'Co ona robi po śniadaniu?', answer: 'She brushes her teeth after breakfast.', distractors: ['She brush her teeth after breakfast.', 'He brushes his teeth after breakfast.', 'She washes her hair after breakfast.'] },
  { cue: '🚌', promptEn: 'How does he go to school?', promptPl: 'Jak on jedzie do szkoły?', answer: 'He goes to school by bus.', distractors: ['He go to school by bus.', 'She goes to school by bus.', 'He goes to school by car.'] },
  { cue: '📝', promptEn: 'When do they do homework?', promptPl: 'Kiedy robią zadanie?', answer: 'They do homework after school.', distractors: ['They does homework after school.', 'They do homework before school.', 'He does homework after school.'] },
  { cue: '🌙', promptEn: 'What time do we go to bed?', promptPl: 'O której idziemy spać?', answer: 'We go to bed at nine o\'clock.', accept: ['We go to bed at 9 o\'clock.', 'We go to bed at nine.'], distractors: ['We goes to bed at nine o\'clock.', 'We go to bed at ten o\'clock.', 'They go to bed at nine o\'clock.'] },
]);
batch('routines', 'negatives', [
  { cue: '⏰', promptEn: 'Make it negative: I get up late.', promptPl: 'Zrób przeczenie.', answer: "I don't get up late.", accept: ['I do not get up late.'], transformFrom: 'I get up late.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['I get up late.', "I doesn't get up late.", "I not get up late."] },
  { cue: '😴', promptEn: 'Make it negative: She is tired now.', promptPl: 'Zrób przeczenie.', answer: 'She is not tired now.', accept: ["She isn't tired now."], transformFrom: 'She is tired now.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['She is tired now.', 'She are not tired now.', "She don't tired now."] },
  { cue: '🪥', promptEn: 'Make it negative: He has got a toothbrush.', promptPl: 'Zrób przeczenie.', answer: "He hasn't got a toothbrush.", accept: ['He has not got a toothbrush.'], transformFrom: 'He has got a toothbrush.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['He has got a toothbrush.', "He haven't got a toothbrush.", "He doesn't got a toothbrush."] },
  { cue: '🚿', promptEn: 'Make it negative: They like cold showers.', promptPl: 'Zrób przeczenie.', answer: "They don't like cold showers.", accept: ['They do not like cold showers.'], transformFrom: 'They like cold showers.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['They like cold showers.', "They doesn't like cold showers.", "They not like cold showers."] },
  { cue: '📺', promptEn: 'Make it negative: We watch TV before bed.', promptPl: 'Zrób przeczenie.', answer: "We don't watch TV before bed.", accept: ['We do not watch TV before bed.'], transformFrom: 'We watch TV before bed.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['We watch TV before bed.', "We doesn't watch TV before bed.", "We don't watches TV before bed."] },
]);
batch('routines', 'questions', [
  { cue: '❓', promptEn: 'Make a question: You are ready.', promptPl: 'Zrób pytanie.', answer: 'Are you ready?', transformFrom: 'You are ready.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], pairCueEn: 'Ask your partner if they are ready.', pairCuePl: 'Zapytaj partnera, czy jest gotowy.', distractors: ['You are ready?', 'Is you ready?', 'Do you ready?'] },
  { cue: '❓', promptEn: 'Make a question: She has got an alarm clock.', promptPl: 'Zrób pytanie.', answer: 'Has she got an alarm clock?', transformFrom: 'She has got an alarm clock.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Have she got an alarm clock?', 'Does she has got an alarm clock?', 'She has got an alarm clock?'] },
  { cue: '❓', promptEn: 'Make a question: He can get up early.', promptPl: 'Zrób pytanie.', answer: 'Can he get up early?', transformFrom: 'He can get up early.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does he can get up early?', 'Can he gets up early?', 'He can get up early?'] },
  { cue: '❓', promptEn: 'Make a question: They like mornings.', promptPl: 'Zrób pytanie.', answer: 'Do they like mornings?', transformFrom: 'They like mornings.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does they like mornings?', 'Do they likes mornings?', 'They like mornings?'] },
  { cue: '❓', promptEn: 'Make a question: She brushes her teeth.', promptPl: 'Zrób pytanie.', answer: 'Does she brush her teeth?', transformFrom: 'She brushes her teeth.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Do she brush her teeth?', 'Does she brushes her teeth?', 'She brushes her teeth?'] },
]);

batch('time', 'be', [
  { cue: '🕐', promptEn: 'What time is it?', promptPl: 'Która godzina?', answer: 'It is one o\'clock.', accept: ["It's one o'clock.", 'It is 1 o\'clock.'], distractors: ['It is two o\'clock.', 'It is half past one.', 'It are one o\'clock.'] },
  { cue: '🕒', promptEn: 'What time is it?', promptPl: 'Która godzina?', answer: 'It is three o\'clock.', accept: ["It's three o'clock.", 'It is 3 o\'clock.'], distractors: ['It is four o\'clock.', 'It is half past three.', 'It are three o\'clock.'] },
  { cue: '🕔', promptEn: 'Is it five o\'clock?', promptPl: 'Czy jest piąta?', answer: 'It is five o\'clock.', accept: ["It's five o'clock.", 'It is 5 o\'clock.'], distractors: ['It is six o\'clock.', 'It is half past five.', 'It are five o\'clock.'] },
  { cue: '☀️', promptEn: 'Is it morning?', promptPl: 'Czy to poranek?', answer: 'It is morning.', accept: ["It's morning."], distractors: ['It is evening.', 'It is night.', 'It are morning.'] },
  { cue: '🌙', promptEn: 'Is it night time?', promptPl: 'Czy to noc?', answer: 'It is night time.', accept: ["It's night time.", 'It is night.'], distractors: ['It is day time.', 'It is morning.', 'It are night time.'] },
]);
batch('time', 'have_got', [
  { cue: '⌚', promptEn: 'Talk about your watch.', promptPl: 'Powiedz o swoim zegarku.', answer: 'I have got a watch.', accept: ["I've got a watch.", 'I have a watch.'], distractors: ['She has got a watch.', 'I have got a clock.', "I haven't got a watch."] },
  { cue: '🕰️', promptEn: 'Talk about the clock.', promptPl: 'Powiedz o zegarze.', answer: 'We have got a big clock.', accept: ["We've got a big clock."], distractors: ['We has got a big clock.', 'We have got a small clock.', 'They have got a big clock.'] },
  { cue: '📅', promptEn: 'Talk about a calendar.', promptPl: 'Powiedz o kalendarzu.', answer: 'She has got a calendar.', accept: ["She's got a calendar."], distractors: ['He has got a calendar.', 'She have got a calendar.', 'She has got a diary.'] },
  { cue: '🗓️', promptEn: 'Talk about free time.', promptPl: 'Powiedz o wolnym czasie.', answer: 'They have got free time on Sunday.', accept: ["They've got free time on Sunday."], distractors: ['They has got free time on Sunday.', 'They have got free time on Monday.', 'He has got free time on Sunday.'] },
  { cue: '⏱️', promptEn: 'Talk about a timer.', promptPl: 'Powiedz o stoperze.', answer: 'He has got a timer.', accept: ["He's got a timer."], distractors: ['She has got a timer.', 'He have got a timer.', 'He has got a clock.'] },
]);
batch('time', 'can', [
  { cue: '🕐', promptEn: 'Can you tell the time?', promptPl: 'Czy umiesz mówić, która godzina?', answer: 'I can tell the time.', distractors: ["I can't tell the time.", 'She can tell the time.', 'I can tell a story.'] },
  { cue: '⌚', promptEn: 'Can she read a watch?', promptPl: 'Czy ona umie czytać zegarek?', answer: 'She can read a watch.', distractors: ["She can't read a watch.", 'He can read a watch.', 'She can read a book.'] },
  { cue: '⏰', promptEn: 'Can he set the alarm?', promptPl: 'Czy on umie nastawić budzik?', answer: 'He can set the alarm.', distractors: ["He can't set the alarm.", 'She can set the alarm.', 'He can break the alarm.'] },
  { cue: '📅', promptEn: 'Can they plan the week?', promptPl: 'Czy potrafią zaplanować tydzień?', answer: 'They can plan the week.', distractors: ["They can't plan the week.", 'He can plan the week.', 'They can plan the day.'] },
  { cue: '🚫🕓', promptEn: 'Say you cannot stay up late.', promptPl: 'Powiedz, że nie możesz siedzieć długo.', answer: "I can't stay up late.", accept: ['I cannot stay up late.'], distractors: ['I can stay up late.', "She can't stay up late.", "I can't get up late."] },
]);
batch('time', 'like', [
  { cue: '🌅', promptEn: 'Do you like early mornings?', promptPl: 'Czy lubisz wczesne poranki?', answer: 'I like early mornings.', distractors: ["I don't like early mornings.", 'I like late nights.', 'She likes early mornings.'] },
  { cue: '🕔', promptEn: 'Does she like five o\'clock?', promptPl: 'Czy ona lubi piątą?', answer: 'She likes five o\'clock.', accept: ['She likes 5 o\'clock.'], distractors: ['She like five o\'clock.', "She doesn't like five o\'clock.", 'He likes five o\'clock.'] },
  { cue: '🌙', promptEn: 'Does he like night time?', promptPl: 'Czy on lubi noc?', answer: 'He likes night time.', distractors: ['He like night time.', "He doesn't like night time.", 'She likes night time.'] },
  { cue: '📅', promptEn: 'Do they like weekends?', promptPl: 'Czy lubią weekendy?', answer: 'They like weekends.', distractors: ['They likes weekends.', "They don't like weekends.", 'He likes weekends.'] },
  { cue: '🕒', promptEn: 'Do you like free afternoons?', promptPl: 'Czy lubisz wolne popołudnia?', answer: 'We like free afternoons.', distractors: ['We likes free afternoons.', "We don't like free afternoons.", 'I like busy mornings.'] },
]);
batch('time', 'present_simple', [
  { cue: '🕐', promptEn: 'What time does school start?', promptPl: 'O której zaczyna się szkoła?', answer: 'School starts at eight o\'clock.', accept: ['School starts at 8 o\'clock.'], distractors: ['School start at eight o\'clock.', 'School starts at nine o\'clock.', 'School starts at eight.'] },
  { cue: '🕛', promptEn: 'What time do you have lunch?', promptPl: 'O której jesz lunch?', answer: 'I have lunch at twelve o\'clock.', accept: ['I have lunch at 12 o\'clock.', 'I have lunch at twelve.'], distractors: ['I has lunch at twelve o\'clock.', 'She has lunch at twelve o\'clock.', 'I have lunch at one o\'clock.'] },
  { cue: '🕕', promptEn: 'What time does she have dinner?', promptPl: 'O której ona je kolację?', answer: 'She has dinner at six o\'clock.', accept: ['She has dinner at 6 o\'clock.'], distractors: ['She have dinner at six o\'clock.', 'He has dinner at six o\'clock.', 'She has dinner at seven o\'clock.'] },
  { cue: '🕘', promptEn: 'What time do they go to bed?', promptPl: 'O której idą spać?', answer: 'They go to bed at nine o\'clock.', accept: ['They go to bed at 9 o\'clock.'], distractors: ['They goes to bed at nine o\'clock.', 'They go to bed at ten o\'clock.', 'He goes to bed at nine o\'clock.'] },
  { cue: '🕞', promptEn: 'What time do we finish school?', promptPl: 'O której kończymy szkołę?', answer: 'We finish school at half past three.', accept: ['We finish school at 3:30.', 'We finish school at three thirty.'], distractors: ['We finishes school at half past three.', 'We finish school at half past two.', 'They finish school at half past three.'] },
]);
batch('time', 'negatives', [
  { cue: '🕐', promptEn: 'Make it negative: It is two o\'clock.', promptPl: 'Zrób przeczenie.', answer: 'It is not two o\'clock.', accept: ["It isn't two o'clock."], transformFrom: "It is two o'clock.", transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ["It is two o'clock.", 'It are not two o\'clock.', "It don't two o'clock."] },
  { cue: '⌚', promptEn: 'Make it negative: I have got a watch.', promptPl: 'Zrób przeczenie.', answer: "I haven't got a watch.", accept: ['I have not got a watch.'], transformFrom: 'I have got a watch.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['I have got a watch.', "I hasn't got a watch.", "I don't got a watch."] },
  { cue: '🕐', promptEn: 'Make it negative: She can tell the time.', promptPl: 'Zrób przeczenie.', answer: "She can't tell the time.", accept: ['She cannot tell the time.'], transformFrom: 'She can tell the time.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['She can tell the time.', "She don't tell the time.", "She can't tells the time."] },
  { cue: '🌙', promptEn: 'Make it negative: He likes late nights.', promptPl: 'Zrób przeczenie.', answer: "He doesn't like late nights.", accept: ['He does not like late nights.'], transformFrom: 'He likes late nights.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['He likes late nights.', "He don't like late nights.", "He doesn't likes late nights."] },
  { cue: '📅', promptEn: 'Make it negative: We start at nine every day.', promptPl: 'Zrób przeczenie.', answer: "We don't start at nine every day.", accept: ['We do not start at nine every day.'], transformFrom: 'We start at nine every day.', transformTo: 'negative', modeHints: ['transform', 'text', 'speak'], distractors: ['We start at nine every day.', "We doesn't start at nine every day.", "We don't starts at nine every day."] },
]);
batch('time', 'questions', [
  { cue: '❓', promptEn: 'Make a question: It is half past four.', promptPl: 'Zrób pytanie.', answer: 'Is it half past four?', transformFrom: 'It is half past four.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['It is half past four?', 'Are it half past four?', 'Does it half past four?'] },
  { cue: '❓', promptEn: 'Make a question: You have got a watch.', promptPl: 'Zrób pytanie.', answer: 'Have you got a watch?', transformFrom: 'You have got a watch.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Has you got a watch?', 'Do you got a watch?', 'You have got a watch?'] },
  { cue: '❓', promptEn: 'Make a question: She can tell the time.', promptPl: 'Zrób pytanie.', answer: 'Can she tell the time?', transformFrom: 'She can tell the time.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does she can tell the time?', 'Can she tells the time?', 'She can tell the time?'] },
  { cue: '❓', promptEn: 'Make a question: They like weekends.', promptPl: 'Zrób pytanie.', answer: 'Do they like weekends?', transformFrom: 'They like weekends.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Does they like weekends?', 'Do they likes weekends?', 'They like weekends?'] },
  { cue: '❓', promptEn: 'Make a question: School finishes at three.', promptPl: 'Zrób pytanie.', answer: 'Does school finish at three?', transformFrom: 'School finishes at three.', transformTo: 'question', modeHints: ['transform', 'text', 'speak'], distractors: ['Do school finish at three?', 'Does school finishes at three?', 'School finishes at three?'] },
]);

// Ensure speak is in modeHints for all non-transform-only; already included.
// Add a few pure picture extras for denser picture mode (~add 0 — already 5 per cell = 315)

const SCENES = {
  school: [
    'assets/topic-scenes/school-classroom.png',
    'assets/topic-scenes/school-playground.png'
  ],
  family_home: [
    'assets/topic-scenes/family-livingroom.png',
    'assets/topic-scenes/family-picnic.png',
    'assets/topic-scenes/home-house.png',
    'assets/topic-scenes/home-kitchen.png'
  ],
  food: [
    'assets/topic-scenes/food-market.png',
    'assets/topic-scenes/food-restaurant.png',
    'assets/topic-scenes/food-supermarket.png'
  ],
  free_time: [
    'assets/topic-scenes/freetime-beach.png',
    'assets/topic-scenes/freetime-park.png'
  ],
  clothes_weather: [
    'assets/topic-scenes/clothes-bedroom.png',
    'assets/topic-scenes/clothes-shop.png',
    'assets/topic-scenes/weather-rainy.png',
    'assets/topic-scenes/weather-seasons.png'
  ],
  town: [
    'assets/topic-scenes/town-centre.png',
    'assets/topic-scenes/town-station.png'
  ],
  animals: [
    'assets/topic-scenes/animals-farm.png',
    'assets/topic-scenes/animals-forest.png',
    'assets/topic-scenes/animals-zoo.png'
  ],
  routines: [
    'assets/topic-scenes/routines-morning.png',
    'assets/topic-scenes/routines-evening.png'
  ],
  time: [
    'assets/topic-scenes/time-birthday.png',
    'assets/topic-scenes/time-schoolday.png'
  ]
};

const file = `/**
 * Topic Challenge — curated Primary English task bank (ages ~9–11).
 * Auto-generated by scripts/gen-topic-challenge-bank.mjs — edit that script to regenerate.
 */
(function (global) {
  'use strict';

  var TOPICS = ${JSON.stringify(TOPICS, null, 2)};
  var GRAMMARS = ${JSON.stringify(GRAMMARS, null, 2)};
  var MODES = ${JSON.stringify(MODES, null, 2)};
  var BANK = ${JSON.stringify(RAW, null, 2)};

  global.PE_TOPIC_CHALLENGE_TOPICS = TOPICS;
  global.PE_TOPIC_CHALLENGE_GRAMMARS = GRAMMARS;
  global.PE_TOPIC_CHALLENGE_MODES = MODES;
  global.PE_TOPIC_CHALLENGE_BANK = BANK;
  global.PE_TOPIC_CHALLENGE_SCENES = ${JSON.stringify(SCENES, null, 2)};
})(typeof window !== 'undefined' ? window : globalThis);
`;

fs.writeFileSync(outPath, file, 'utf8');
console.log('Wrote', RAW.length, 'items to', outPath);

// coverage check
const missing = [];
for (const t of TOPICS) {
  for (const g of GRAMMARS) {
    const n = RAW.filter((x) => x.topic === t.id && x.grammar === g.id).length;
    if (n < 3) missing.push(`${t.id}×${g.id}=${n}`);
  }
}
console.log('Coverage gaps (<3):', missing.length ? missing.join(', ') : 'none');
const byMode = {};
for (const m of ['picture', 'tiles', 'text', 'transform', 'speak']) {
  byMode[m] = RAW.filter((x) => (x.modeHints || []).includes(m) || (m !== 'transform' && m !== 'speak')).length;
}
// recount properly
for (const m of ['picture', 'tiles', 'text', 'transform', 'speak']) {
  byMode[m] = RAW.filter((x) => (x.modeHints || []).includes(m)).length;
}
console.log('By modeHints:', byMode);
