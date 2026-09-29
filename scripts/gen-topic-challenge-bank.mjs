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
  { cue: '✏️', promptEn: 'Talk about the pencil case.', promptPl: 'Powiedz o piórniku.', answer: 'We have got a pencil case.', accept: ["We've got a pencil case.", 'We have a pencil case.'], distractors: ['We has got a pencil case.', 'We have got a bag.', 'I have got a pencil case.'] },
]);
batch('school', 'can', [
  { cue: '📖', promptEn: 'Can you read this book?', promptPl: 'Czy umiesz czytać tę książkę?', answer: 'I can read this book.', distractors: ["I can't read this book.", 'I can write this book.', 'She can read this book.'] },
  { cue: '✍️', promptEn: 'Can she write in the notebook?', promptPl: 'Czy ona umie pisać w zeszycie?', answer: 'She can write in the notebook.', distractors: ["She can't write in the notebook.", 'He can write in the notebook.', 'She can read the notebook.'] },
  { cue: '🔢', promptEn: 'Can he use the ruler?', promptPl: 'Czy on umie użyć linijki?', answer: 'He can use the ruler.', distractors: ["He can't use the ruler.", 'She can use the ruler.', 'He can use the globe.'] },
  { cue: '🗣️', promptEn: 'Can they listen to the teacher?', promptPl: 'Czy potrafią słuchać nauczyciela?', answer: 'They can listen to the teacher.', distractors: ["They can't listen to the teacher.", 'They can listen to the boy.', 'He can listen to the teacher.'] },
  { cue: '🚫✍️', promptEn: 'Say you cannot open the window.', promptPl: 'Powiedz, że nie możesz otworzyć okna.', answer: "I can't open the window.", accept: ['I cannot open the window.', 'I can not open the window.'], distractors: ['I can open the window.', "She can't open the window.", "I can't open the door."] },
]);
batch('school', 'like', [
  { cue: '👩‍🏫', promptEn: 'Do you like your teacher?', promptPl: 'Czy lubisz swoją nauczycielkę?', answer: 'I like my teacher.', distractors: ["I don't like my teacher.", 'I like my desk.', 'She likes my teacher.'] },
  { cue: '🎨', promptEn: 'Does she like the globe?', promptPl: 'Czy ona lubi globus?', answer: 'She likes the globe.', distractors: ['She like the globe.', "She doesn't like the globe.", 'He likes the globe.'] },
  { cue: '⚽', promptEn: 'Does he like the ball?', promptPl: 'Czy on lubi piłkę?', answer: 'He likes the ball.', distractors: ['He like the ball.', "He doesn't like the ball.", 'She likes the ball.'] },
  { cue: '🪟', promptEn: 'Do they like the classroom window?', promptPl: 'Czy lubią okno w klasie?', answer: 'They like the window.', distractors: ['They likes the window.', "They don't like the window.", 'He likes the window.'] },
  { cue: '📖', promptEn: 'Do you like reading books at school?', promptPl: 'Czy lubisz czytać książki w szkole?', answer: 'We like reading books.', distractors: ['We likes reading books.', "We don't like reading books.", 'I like writing books.'] },
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
  { cue: '🛋️', promptEn: 'What is this in the living room?', promptPl: 'Co to jest w salonie?', answer: 'It is a sofa.', accept: ["It's a sofa.", 'This is a sofa.'], distractors: ['It is a bed.', 'They are sofas.', 'It is a table.'] },
  { cue: '🛏️', promptEn: 'Where is the bed?', promptPl: 'Gdzie jest łóżko?', answer: 'The bed is upstairs.', distractors: ['The bed is downstairs.', 'The kitchen is upstairs.', 'The beds are upstairs.'] },
  { cue: '🐕', promptEn: 'How is the dog at home?', promptPl: 'Jaki jest pies w domu?', answer: 'The dog is happy.', distractors: ['The dog is sad.', 'The cat is happy.', 'The dogs are happy.'] },
]);
batch('family_home', 'have_got', [
  { cue: '🐕', promptEn: 'Talk about your pet.', promptPl: 'Powiedz o swoim zwierzaku.', answer: 'I have got a dog.', accept: ["I've got a dog.", 'I have a dog.'], distractors: ['I have got a cat.', 'She has got a dog.', "I haven't got a dog."] },
  { cue: '👶', promptEn: 'Talk about her baby brother.', promptPl: 'Powiedz o jej braciszku.', answer: 'She has got a baby brother.', accept: ["She's got a baby brother."], distractors: ['He has got a baby brother.', 'She have got a baby brother.', 'She has got a baby sister.'] },
  { cue: '🚪', promptEn: 'Talk about the door.', promptPl: 'Powiedz o drzwiach.', answer: 'We have got a door.', accept: ["We've got a door.", 'We have a door.'], distractors: ['We has got a door.', "We haven't got a door.", 'They have got a door.'] },
  { cue: '🛋️', promptEn: 'Talk about the sofa.', promptPl: 'Powiedz o sofie.', answer: 'They have got a big sofa.', accept: ["They've got a big sofa."], distractors: ['They has got a big sofa.', 'They have got a small sofa.', 'He has got a big sofa.'] },
  { cue: '🪴', promptEn: 'Talk about plants at home.', promptPl: 'Powiedz o roślinach w domu.', answer: 'We have got two plants.', accept: ["We've got two plants."], distractors: ['We has got two plants.', 'We have got three plants.', 'I have got two plants.'] },
]);
batch('family_home', 'can', [
  { cue: '🍳', promptEn: 'Can you cook on the stove?', promptPl: 'Czy możesz gotować na kuchence?', answer: 'I can cook on the stove.', distractors: ["I can't cook on the stove.", 'She can cook on the stove.', 'I can cook on the bed.'] },
  { cue: '🍳', promptEn: 'Can mum cook?', promptPl: 'Czy mama umie gotować?', answer: 'Mum can cook.', accept: ['My mum can cook.', 'She can cook.'], distractors: ["Mum can't cook.", 'Dad can cook.', 'Mum can swim.'] },
  { cue: '📺', promptEn: 'Can dad watch television?', promptPl: 'Czy tata może oglądać telewizję?', answer: 'Dad can watch television.', accept: ['My dad can watch television.', 'He can watch television.'], distractors: ["Dad can't watch television.", 'Mum can watch television.', 'Dad can cook.'] },
  { cue: '🚪', promptEn: 'Can they open the door?', promptPl: 'Czy mogą otworzyć drzwi?', answer: 'They can open the door.', distractors: ["They can't open the door.", 'He can open the door.', 'They can close the door.'] },
  { cue: '🚫🐕', promptEn: 'Say the dog cannot come in.', promptPl: 'Powiedz, że pies nie może wejść.', answer: "The dog can't come in.", accept: ['The dog cannot come in.'], distractors: ['The dog can come in.', "The cat can't come in.", "The dog can't go out."] },
]);
batch('family_home', 'like', [
  { cue: '🛋️', promptEn: 'Do you like the sofa?', promptPl: 'Czy lubisz sofę?', answer: 'I like the sofa.', distractors: ["I don't like the sofa.", 'I like the bed.', 'She likes the sofa.'] },
  { cue: '👵', promptEn: 'Does she like grandma?', promptPl: 'Czy ona lubi babcię?', answer: 'She likes grandma.', accept: ['She likes her grandma.', 'She likes grandmother.'], distractors: ['She like grandma.', "She doesn't like grandma.", 'He likes grandma.'] },
  { cue: '🐈', promptEn: 'Does he like the cat?', promptPl: 'Czy on lubi kota?', answer: 'He likes the cat.', distractors: ['He like the cat.', "He doesn't like the cat.", 'She likes the cat.'] },
  { cue: '📺', promptEn: 'Do they like watching TV?', promptPl: 'Czy lubią oglądać TV?', answer: 'They like watching TV.', distractors: ['They likes watching TV.', "They don't like watching TV.", 'He likes watching TV.'] },
  { cue: '🍽️', promptEn: 'Do you like the kitchen table?', promptPl: 'Czy lubisz stół w kuchni?', answer: 'We like the table.', distractors: ['We likes the table.', "We don't like the table.", 'I like the bed.'] },
]);
batch('family_home', 'present_simple', [
  { cue: '🛏️', promptEn: 'What do you do in the morning?', promptPl: 'Co robisz rano?', answer: 'I get up from bed.', distractors: ['I gets up from bed.', 'She gets up from bed.', 'I go to bed early.'] },
  { cue: '🍽️', promptEn: 'Where does the family eat?', promptPl: 'Gdzie je rodzina?', answer: 'We eat at the table.', distractors: ['We eats at the table.', 'We eat on the bed.', 'They eat at the table.'] },
  { cue: '🧼', promptEn: 'What does she wash in the sink?', promptPl: 'Co ona myje w zlewie?', answer: 'She washes cups in the sink.', distractors: ['She wash cups in the sink.', 'He washes cups in the sink.', 'She washes shoes in the sink.'] },
  { cue: '🧹', promptEn: 'What do they clean?', promptPl: 'Co sprzątają?', answer: 'They clean the table.', distractors: ['They cleans the table.', 'They clean the school.', 'He cleans the table.'] },
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
  { cue: '🍕', promptEn: 'Talk about your pizza.', promptPl: 'Powiedz o swojej pizzy.', answer: 'I have got a pizza.', accept: ["I've got a pizza.", 'I have a pizza.'], distractors: ['She has got a pizza.', 'I have got an apple.', "I haven't got a pizza."] },
  { cue: '🧃', promptEn: 'Talk about her juice.', promptPl: 'Powiedz o jej soku.', answer: 'She has got orange juice.', accept: ["She's got orange juice.", 'She has orange juice.'], distractors: ['He has got orange juice.', 'She have got orange juice.', 'She has got apple juice.'] },
  { cue: '🧀', promptEn: 'Talk about cheese at home.', promptPl: 'Powiedz o serze w domu.', answer: 'We have got some cheese.', accept: ["We've got some cheese.", 'We have some cheese.'], distractors: ['We has got some cheese.', 'We have got some bread.', "We haven't got some cheese."] },
  { cue: '🍕', promptEn: 'Talk about their pizza.', promptPl: 'Powiedz o ich pizzy.', answer: 'They have got a big pizza.', accept: ["They've got a big pizza."], distractors: ['They has got a big pizza.', 'They have got a small pizza.', 'He has got a big pizza.'] },
  { cue: '🍎', promptEn: 'Talk about apples.', promptPl: 'Powiedz o jabłkach.', answer: 'He has got five apples.', accept: ["He's got five apples."], distractors: ['He have got five apples.', 'He has got four apples.', 'She has got five apples.'] },
]);
batch('food', 'can', [
  { cue: '🍳', promptEn: 'Can you cook eggs?', promptPl: 'Czy umiesz smażyć jajka?', answer: 'I can cook eggs.', distractors: ["I can't cook eggs.", 'I can cook pasta.', 'She can cook eggs.'] },
  { cue: '🔪', promptEn: 'Can she cut bread?', promptPl: 'Czy ona umie kroić chleb?', answer: 'She can cut bread.', distractors: ["She can't cut bread.", 'He can cut bread.', 'She can bake bread.'] },
  { cue: '🥤', promptEn: 'Can he pour milk?', promptPl: 'Czy on umie nalać mleko?', answer: 'He can pour milk.', distractors: ["He can't pour milk.", 'She can pour milk.', 'He can pour soup.'] },
  { cue: '🍽️', promptEn: 'Can they set the table?', promptPl: 'Czy potrafią nakryć do stołu?', answer: 'They can set the table.', distractors: ["They can't set the table.", 'He can set the table.', 'They can clean the table.'] },
  { cue: '🚫🐟', promptEn: 'Say you cannot eat fish.', promptPl: 'Powiedz, że nie jesz ryb.', answer: "I can't eat fish.", accept: ['I cannot eat fish.'], distractors: ['I can eat fish.', "She can't eat fish.", "I can't eat cheese."] },
]);
batch('food', 'like', [
  { cue: '🍕', promptEn: 'Do you like pizza?', promptPl: 'Czy lubisz pizzę?', answer: 'I like pizza.', distractors: ["I don't like pizza.", 'I like pasta.', 'She likes pizza.'] },
  { cue: '🍎', promptEn: 'Does she like apples?', promptPl: 'Czy ona lubi jabłka?', answer: 'She likes apples.', distractors: ['She like apples.', "She doesn't like apples.", 'He likes apples.'] },
  { cue: '🧀', promptEn: 'Does he like cheese?', promptPl: 'Czy on lubi ser?', answer: 'He likes cheese.', distractors: ['He like cheese.', "He doesn't like cheese.", 'She likes cheese.'] },
  { cue: '🍦', promptEn: 'Do they like ice cream?', promptPl: 'Czy lubią lody?', answer: 'They like ice cream.', distractors: ['They likes ice cream.', "They don't like ice cream.", 'He likes ice cream.'] },
  { cue: '🥛', promptEn: 'Do you like milk?', promptPl: 'Czy lubisz mleko?', answer: 'We like milk.', distractors: ['We likes milk.', "We don't like milk.", 'I like juice.'] },
]);
batch('food', 'present_simple', [
  { cue: '🍳', promptEn: 'What do you eat for breakfast?', promptPl: 'Co jesz na śniadanie?', answer: 'I eat eggs for breakfast.', distractors: ['I eats eggs for breakfast.', 'She eats eggs for breakfast.', 'I eat pizza for breakfast.'] },
  { cue: '🍞', promptEn: 'What does she eat for lunch?', promptPl: 'Co ona je na lunch?', answer: 'She eats bread for lunch.', distractors: ['She eat bread for lunch.', 'He eats bread for lunch.', 'She eats pizza for lunch.'] },
  { cue: '🍲', promptEn: 'What do they have for dinner?', promptPl: 'Co mają na obiad?', answer: 'They have soup for dinner.', distractors: ['They has soup for dinner.', 'They have cake for dinner.', 'He has soup for dinner.'] },
  { cue: '🥛', promptEn: 'What do you drink every day?', promptPl: 'Co pijesz codziennie?', answer: 'I drink milk every day.', distractors: ['I drinks milk every day.', 'She drinks milk every day.', 'I drink soup every day.'] },
  { cue: '🛒', promptEn: 'Where do we buy food?', promptPl: 'Gdzie kupujemy jedzenie?', answer: 'We buy food at the supermarket.', accept: ['We buy food at the fridge.', 'We buy bread at the shop.'], distractors: ['We buys food at the supermarket.', 'We buy food at school.', 'They buy food at the supermarket.'] },
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
  { cue: '⚽', promptEn: 'What is this?', promptPl: 'Co to jest?', answer: 'It is a ball.', accept: ["It's a ball.", 'This is a ball.'], distractors: ['It is a bike.', 'It is a kite.', 'They are balls.'] },
  { cue: '🪁', promptEn: 'Is the kite high?', promptPl: 'Czy latawiec jest wysoko?', answer: 'The kite is high.', distractors: ['The kite is low.', 'The kites are high.', 'The ball is high.'] },
  { cue: '🎸', promptEn: 'How is the guitar?', promptPl: 'Jaka jest gitara?', answer: 'The guitar is loud.', distractors: ['The guitar is quiet.', 'The guitars are loud.', 'The book is loud.'] },
  { cue: '🚴', promptEn: 'Where is the bicycle?', promptPl: 'Gdzie jest rower?', answer: 'The bicycle is in the park.', distractors: ['The bicycle is in the kitchen.', 'The ball is in the park.', 'The bicycles are in the park.'] },
  { cue: '🏞️', promptEn: 'Where is the pond?', promptPl: 'Gdzie jest staw?', answer: 'The pond is in the park.', distractors: ['The pond is at the beach.', 'The school is in the park.', 'The ponds are in the park.'] },
]);
batch('free_time', 'have_got', [
  { cue: '🏀', promptEn: 'Talk about your ball.', promptPl: 'Powiedz o swojej piłce.', answer: 'I have got a ball.', accept: ["I've got a ball.", 'I have a ball.'], distractors: ['She has got a ball.', 'I have got a bike.', "I haven't got a ball."] },
  { cue: '🚲', promptEn: 'Talk about his bike.', promptPl: 'Powiedz o jego rowerze.', answer: 'He has got a new bike.', accept: ["He's got a new bike.", 'He has got a new bicycle.'], distractors: ['She has got a new bike.', 'He have got a new bike.', 'He has got an old bike.'] },
  { cue: '🎸', promptEn: 'Talk about her guitar.', promptPl: 'Powiedz o jej gitarze.', answer: 'She has got a guitar.', accept: ["She's got a guitar."], distractors: ['He has got a guitar.', 'She have got a guitar.', 'She has got a piano.'] },
  { cue: '🪁', promptEn: 'Talk about kites.', promptPl: 'Powiedz o latawcach.', answer: 'We have got a kite.', accept: ["We've got a kite."], distractors: ['We has got a kite.', 'We have got a ball.', 'They have got a kite.'] },
  { cue: '🪣', promptEn: 'Talk about the bucket.', promptPl: 'Powiedz o wiaderku.', answer: 'They have got a bucket.', accept: ["They've got a bucket."], distractors: ['They has got a bucket.', "They haven't got a bucket.", 'He has got a bucket.'] },
]);
batch('free_time', 'can', [
  { cue: '🏖️', promptEn: 'Can you build a sandcastle?', promptPl: 'Czy umiesz zbudować zamek z piasku?', answer: 'I can build a sandcastle.', distractors: ["I can't build a sandcastle.", 'I can build a house.', 'She can build a sandcastle.'] },
  { cue: '🏃', promptEn: 'Can he ride a bicycle?', promptPl: 'Czy on umie jeździć na rowerze?', answer: 'He can ride a bicycle.', distractors: ["He can't ride a bicycle.", 'She can ride a bicycle.', 'He can ride a horse.'] },
  { cue: '💃', promptEn: 'Can she fly a kite?', promptPl: 'Czy ona umie puszczać latawiec?', answer: 'She can fly a kite.', distractors: ["She can't fly a kite.", 'He can fly a kite.', 'She can fly a ball.'] },
  { cue: '🚴', promptEn: 'Can they ride a bike?', promptPl: 'Czy potrafią jeździć na rowerze?', answer: 'They can ride a bike.', distractors: ["They can't ride a bike.", 'He can ride a bike.', 'They can ride a horse.'] },
  { cue: '🚫⚽', promptEn: 'Say you cannot throw the ball.', promptPl: 'Powiedz, że nie umiesz rzucić piłki.', answer: "I can't throw the ball.", accept: ['I cannot throw the ball.'], distractors: ['I can throw the ball.', "She can't throw the ball.", "I can't throw the kite."] },
]);
batch('free_time', 'like', [
  { cue: '⚽', promptEn: 'Do you like football?', promptPl: 'Czy lubisz piłkę nożną?', answer: 'I like football.', distractors: ["I don't like football.", 'I like tennis.', 'She likes football.'] },
  { cue: '🎸', promptEn: 'Does she like the guitar?', promptPl: 'Czy ona lubi gitarę?', answer: 'She likes the guitar.', distractors: ['She like the guitar.', "She doesn't like the guitar.", 'He likes the guitar.'] },
  { cue: '🪁', promptEn: 'Does he like the kite?', promptPl: 'Czy on lubi latawiec?', answer: 'He likes the kite.', distractors: ['He like the kite.', "He doesn't like the kite.", 'She likes the kite.'] },
  { cue: '📚', promptEn: 'Do they like reading books?', promptPl: 'Czy lubią czytać książki?', answer: 'They like reading books.', distractors: ['They likes reading books.', "They don't like reading books.", 'He likes reading books.'] },
  { cue: '🎨', promptEn: 'Do you like the painting?', promptPl: 'Czy lubisz obraz?', answer: 'We like the painting.', distractors: ['We likes the painting.', "We don't like the painting.", 'I like the ball.'] },
]);
batch('free_time', 'present_simple', [
  { cue: '⚽', promptEn: 'What do you play after school?', promptPl: 'W co grasz po szkole?', answer: 'I play with a ball after school.', distractors: ['I plays with a ball after school.', 'She plays with a ball after school.', 'I play with a kite after school.'] },
  { cue: '🎸', promptEn: 'What does she play in the park?', promptPl: 'Na czym ona gra w parku?', answer: 'She plays the guitar in the park.', distractors: ['She play the guitar in the park.', 'He plays the guitar in the park.', 'She plays the ball in the park.'] },
  { cue: '🏞️', promptEn: 'Where do they play?', promptPl: 'Gdzie się bawią?', answer: 'They play in the park.', distractors: ['They plays in the park.', 'They play in the kitchen.', 'He plays in the park.'] },
  { cue: '🦆', promptEn: 'What do we watch at the pond?', promptPl: 'Co oglądamy przy stawie?', answer: 'We watch the ducks at the pond.', distractors: ['We watches the ducks at the pond.', 'We watch the ducks at school.', 'They watch the ducks at the pond.'] },
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
  { cue: '❄️', promptEn: 'How is the cloud?', promptPl: 'Jaka jest chmura?', answer: 'The cloud is grey.', distractors: ['The cloud is blue.', 'The clouds are grey.', 'The sun is grey.'] },
]);
batch('clothes_weather', 'have_got', [
  { cue: '🧢', promptEn: 'Talk about your hat.', promptPl: 'Powiedz o swojej czapce.', answer: 'I have got a hat.', accept: ["I've got a hat.", 'I have a hat.'], distractors: ['She has got a hat.', 'I have got a coat.', "I haven't got a hat."] },
  { cue: '👟', promptEn: 'Talk about her shoes.', promptPl: 'Powiedz o jej butach.', answer: 'She has got new shoes.', accept: ["She's got new shoes."], distractors: ['He has got new shoes.', 'She have got new shoes.', 'She has got old shoes.'] },
  { cue: '🧤', promptEn: 'Talk about his mittens.', promptPl: 'Powiedz o jego rękawiczkach.', answer: 'He has got warm mittens.', accept: ["He's got warm mittens.", 'He has got warm gloves.'], distractors: ['She has got warm mittens.', 'He have got warm mittens.', 'He has got cold mittens.'] },
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
  { cue: '🌬️', promptEn: 'Do you like the rainbow?', promptPl: 'Czy lubisz tęczę?', answer: 'We like the rainbow.', distractors: ['We likes the rainbow.', "We don't like the rainbow.", 'I like the puddle.'] },
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
  { cue: '🚦', promptEn: 'Is the traffic light red?', promptPl: 'Czy światła są czerwone?', answer: 'The traffic light is red.', distractors: ['The traffic light is green.', 'The traffic lights are red.', 'The car is red.'] },
  { cue: '⛪', promptEn: 'Is the church big?', promptPl: 'Czy kościół jest duży?', answer: 'The church is big.', distractors: ['The church is small.', 'The churches are big.', 'The hospital is big.'] },
]);
batch('town', 'have_got', [
  { cue: '🗺️', promptEn: 'Talk about a map.', promptPl: 'Powiedz o mapie.', answer: 'I have got a map.', accept: ["I've got a map.", 'I have a map.'], distractors: ['She has got a map.', 'I have got a ticket.', "I haven't got a map."] },
  { cue: '🧳', promptEn: 'Talk about her suitcase.', promptPl: 'Powiedz o jej walizce.', answer: 'She has got a suitcase.', accept: ["She's got a suitcase."], distractors: ['He has got a suitcase.', 'She have got a suitcase.', 'She has got a map.'] },
  { cue: '🚌', promptEn: 'Talk about buses in town.', promptPl: 'Powiedz o autobusach.', answer: 'The town has got many buses.', accept: ['The town has many buses.'], distractors: ['The town have got many buses.', 'The town has got many trains.', 'The village has got many buses.'] },
  { cue: '🏪', promptEn: 'Talk about shops.', promptPl: 'Powiedz o sklepach.', answer: 'We have got a shop on our street.', accept: ["We've got a shop on our street."], distractors: ['We has got a shop on our street.', 'We have got a school on our street.', 'They have got a shop on our street.'] },
  { cue: '🚕', promptEn: 'Talk about a taxi.', promptPl: 'Powiedz o taksówce.', answer: 'They have got a taxi.', accept: ["They've got a taxi."], distractors: ['They has got a taxi.', "They haven't got a taxi.", 'He has got a taxi.'] },
]);
batch('town', 'can', [
  { cue: '🚶', promptEn: 'Can you walk to the shop?', promptPl: 'Czy możesz dojść do sklepu?', answer: 'I can walk to the shop.', distractors: ["I can't walk to the shop.", 'She can walk to the shop.', 'I can run to the park.'] },
  { cue: '🚌', promptEn: 'Can she take the bus?', promptPl: 'Czy ona może wziąć autobus?', answer: 'She can take the bus.', distractors: ["She can't take the bus.", 'He can take the bus.', 'She can take the train.'] },
  { cue: '🗺️', promptEn: 'Can he read the map?', promptPl: 'Czy on umie czytać mapę?', answer: 'He can read the map.', distractors: ["He can't read the map.", 'She can read the map.', 'He can buy the map.'] },
  { cue: '🦓', promptEn: 'Can they use the crosswalk?', promptPl: 'Czy mogą skorzystać z przejścia?', answer: 'They can use the crosswalk.', distractors: ["They can't use the crosswalk.", 'He can use the crosswalk.', 'They can use the bridge.'] },
  { cue: '🚫🚗', promptEn: 'Say you cannot drive a car.', promptPl: 'Powiedz, że nie możesz prowadzić.', answer: "I can't drive a car.", accept: ['I cannot drive a car.'], distractors: ['I can drive a car.', "She can't drive a car.", "I can't ride a bike."] },
]);
batch('town', 'like', [
  { cue: '🌉', promptEn: 'Do you like the bridge?', promptPl: 'Czy lubisz most?', answer: 'I like the bridge.', distractors: ["I don't like the bridge.", 'I like the river.', 'She likes the bridge.'] },
  { cue: '🚂', promptEn: 'Does she like the train?', promptPl: 'Czy ona lubi pociąg?', answer: 'She likes the train.', distractors: ['She like the train.', "She doesn't like the train.", 'He likes the train.'] },
  { cue: '🚲', promptEn: 'Does he like the bicycle?', promptPl: 'Czy on lubi rower?', answer: 'He likes the bicycle.', distractors: ['He like the bicycle.', "He doesn't like the bicycle.", 'She likes the bicycle.'] },
  { cue: '🌳', promptEn: 'Do they like the park bench?', promptPl: 'Czy lubią ławkę w parku?', answer: 'They like the bench.', distractors: ['They likes the bench.', "They don't like the bench.", 'He likes the bench.'] },
  { cue: '📚', promptEn: 'Do you like reading a book here?', promptPl: 'Czy lubisz czytać tu książkę?', answer: 'We like the book.', distractors: ['We likes the book.', "We don't like the book.", 'I like the map.'] },
]);
batch('town', 'present_simple', [
  { cue: '🚌', promptEn: 'How do you go to town?', promptPl: 'Jak jedziesz do miasta?', answer: 'I go to town by bus.', distractors: ['I goes to town by bus.', 'She goes to town by bus.', 'I go to town by train.'] },
  { cue: '🛒', promptEn: 'Where does she buy bread?', promptPl: 'Gdzie ona kupuje chleb?', answer: 'She buys bread at the bakery.', distractors: ['She buy bread at the bakery.', 'He buys bread at the bakery.', 'She buys bread at the cinema.'] },
  { cue: '🚶', promptEn: 'Where do they walk?', promptPl: 'Gdzie chodzą?', answer: 'They walk on the bridge.', distractors: ['They walks on the bridge.', 'They walk in the forest.', 'He walks on the bridge.'] },
  { cue: '🏥', promptEn: 'Where do we see the hospital?', promptPl: 'Gdzie widzimy szpital?', answer: 'We see the hospital in town.', distractors: ['We sees the hospital in town.', 'We see the hospital at school.', 'They see the hospital in town.'] },
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
  { cue: '🐦', promptEn: 'Is the parrot colourful?', promptPl: 'Czy papuga jest kolorowa?', answer: 'The parrot is colourful.', accept: ['The parrot is colorful.', 'The bird is colourful.'], distractors: ['The parrot is grey.', 'The parrots are colourful.', 'The dog is colourful.'] },
  { cue: '🐘', promptEn: 'Is the elephant strong?', promptPl: 'Czy słoń jest silny?', answer: 'The elephant is strong.', distractors: ['The elephant is weak.', 'The elephants are strong.', 'The mouse is strong.'] },
  { cue: '🐸', promptEn: 'What colour is the frog?', promptPl: 'Jakiego koloru jest żaba?', answer: 'The frog is green.', distractors: ['The frog is blue.', 'The frogs are green.', 'The fish is green.'] },
]);
batch('animals', 'have_got', [
  { cue: '🐇', promptEn: 'Talk about your rabbit.', promptPl: 'Powiedz o swoim króliku.', answer: 'I have got a rabbit.', accept: ["I've got a rabbit.", 'I have a rabbit.'], distractors: ['She has got a rabbit.', 'I have got a mouse.', "I haven't got a rabbit."] },
  { cue: '🐴', promptEn: 'Talk about her horse.', promptPl: 'Powiedz o jej koniu.', answer: 'She has got a horse.', accept: ["She's got a horse."], distractors: ['He has got a horse.', 'She have got a horse.', 'She has got a cow.'] },
  { cue: '🐟', promptEn: 'Talk about fish.', promptPl: 'Powiedz o rybach.', answer: 'He has got two fish.', accept: ["He's got two fish."], distractors: ['He have got two fish.', 'He has got three fish.', 'She has got two fish.'] },
  { cue: '🐶', promptEn: 'Talk about pets.', promptPl: 'Powiedz o zwierzakach.', answer: 'We have got a pet dog.', accept: ["We've got a pet dog."], distractors: ['We has got a pet dog.', 'We have got a pet cat.', 'They have got a pet dog.'] },
  { cue: '🦊', promptEn: 'Talk about a fox.', promptPl: 'Powiedz o lisie.', answer: 'They have got a fox.', accept: ["They've got a fox."], distractors: ['They has got a fox.', "They haven't got a fox.", 'He has got a fox.'] },
]);
batch('animals', 'can', [
  { cue: '🐦', promptEn: 'Can a parrot fly?', promptPl: 'Czy papuga umie latać?', answer: 'A parrot can fly.', accept: ['Parrots can fly.', 'The parrot can fly.', 'A bird can fly.'], distractors: ["A parrot can't fly.", 'A fish can fly.', 'A parrot can swim.'] },
  { cue: '🐟', promptEn: 'Can a fish swim?', promptPl: 'Czy ryba umie pływać?', answer: 'A fish can swim.', accept: ['Fish can swim.', 'The fish can swim.'], distractors: ["A fish can't swim.", 'A dog can swim.', 'A fish can fly.'] },
  { cue: '🐕', promptEn: 'Can the dog run?', promptPl: 'Czy pies umie biegać?', answer: 'The dog can run.', distractors: ["The dog can't run.", 'The cat can run.', 'The dog can fly.'] },
  { cue: '🐈', promptEn: 'Can cats climb?', promptPl: 'Czy koty umieją wspinać się?', answer: 'Cats can climb.', accept: ['A cat can climb.', 'The cat can climb.'], distractors: ["Cats can't climb.", 'Dogs can climb.', 'Cats can fly.'] },
  { cue: '🚫🐘', promptEn: 'Say an elephant cannot fly.', promptPl: 'Powiedz, że słoń nie lata.', answer: "An elephant can't fly.", accept: ['An elephant cannot fly.', "Elephants can't fly."], distractors: ['An elephant can fly.', "A bird can't fly.", "An elephant can't swim."] },
]);
batch('animals', 'like', [
  { cue: '🐕', promptEn: 'Do you like dogs?', promptPl: 'Czy lubisz psy?', answer: 'I like dogs.', distractors: ["I don't like dogs.", 'I like cats.', 'She likes dogs.'] },
  { cue: '🐈', promptEn: 'Does she like cats?', promptPl: 'Czy ona lubi koty?', answer: 'She likes cats.', distractors: ['She like cats.', "She doesn't like cats.", 'He likes cats.'] },
  { cue: '🐴', promptEn: 'Does he like horses?', promptPl: 'Czy on lubi konie?', answer: 'He likes horses.', distractors: ['He like horses.', "He doesn't like horses.", 'She likes horses.'] },
  { cue: '🦆', promptEn: 'Do they like ducks?', promptPl: 'Czy lubią kaczki?', answer: 'They like ducks.', distractors: ['They likes ducks.', "They don't like ducks.", 'He likes ducks.'] },
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
  { cue: '🛏️', promptEn: 'Where is the boy?', promptPl: 'Gdzie jest chłopiec?', answer: 'The boy is in bed.', distractors: ['The boy is in the bath.', 'The girl is in bed.', 'The boys are in bed.'] },
  { cue: '😊', promptEn: 'How is she after breakfast?', promptPl: 'Jak ona się czuje po śniadaniu?', answer: 'She is ready for school.', accept: ["She's ready for school."], distractors: ['He is ready for school.', 'She is ready for bed.', 'She are ready for school.'] },
  { cue: '🌙', promptEn: 'What is in the sky at night?', promptPl: 'Co jest na niebie w nocy?', answer: 'The moon is in the sky.', distractors: ['The sun is in the sky.', 'The moons are in the sky.', 'The clock is in the sky.'] },
  { cue: '🛁', promptEn: 'Is the bathtub free?', promptPl: 'Czy wanna jest wolna?', answer: 'The bathtub is free.', distractors: ['The bathtub is busy.', 'The beds are free.', 'The kitchen is free.'] },
  { cue: '⏰', promptEn: 'Is the clock on the wall?', promptPl: 'Czy zegar jest na ścianie?', answer: 'The clock is on the wall.', distractors: ['The clock is under the bed.', 'The clocks are on the wall.', 'The bag is on the wall.'] },
]);
batch('routines', 'have_got', [
  { cue: '⏰', promptEn: 'Talk about the clock.', promptPl: 'Powiedz o zegarze.', answer: 'I have got a clock.', accept: ["I've got a clock.", 'I have a clock.'], distractors: ['She has got a clock.', 'I have got a bag.', "I haven't got a clock."] },
  { cue: '🪥', promptEn: 'Talk about her toothbrush.', promptPl: 'Powiedz o jej szczoteczce.', answer: 'She has got a toothbrush.', accept: ["She's got a toothbrush."], distractors: ['He has got a toothbrush.', 'She have got a toothbrush.', 'She has got a comb.'] },
  { cue: '🧼', promptEn: 'Talk about soap.', promptPl: 'Powiedz o mydle.', answer: 'We have got soap in the bathroom.', accept: ["We've got soap in the bathroom."], distractors: ['We has got soap in the bathroom.', 'We have got soap in the kitchen.', 'They have got soap in the bathroom.'] },
  { cue: '🛏️', promptEn: 'Talk about beds.', promptPl: 'Powiedz o łóżkach.', answer: 'They have got clean beds.', accept: ["They've got clean beds."], distractors: ['They has got clean beds.', 'They have got dirty beds.', 'He has got clean beds.'] },
  { cue: '🎒', promptEn: 'Talk about a school bag ready.', promptPl: 'Powiedz o gotowym tornistrze.', answer: 'He has got his bag ready.', accept: ["He's got his bag ready."], distractors: ['She has got his bag ready.', 'He have got his bag ready.', 'He has got his book ready.'] },
]);
batch('routines', 'can', [
  { cue: '🛏️', promptEn: 'Can you make the bed?', promptPl: 'Czy potrafisz zaścielić łóżko?', answer: 'I can make the bed.', distractors: ["I can't make the bed.", 'She can make the bed.', 'I can make the table.'] },
  { cue: '🦷', promptEn: 'Can she brush her teeth alone?', promptPl: 'Czy ona sama myje zęby?', answer: 'She can brush her teeth alone.', distractors: ["She can't brush her teeth alone.", 'He can brush his teeth alone.', 'She can wash her face alone.'] },
  { cue: '🛏️', promptEn: 'Can he make his bed?', promptPl: 'Czy on umie zaścielić łóżko?', answer: 'He can make his bed.', distractors: ["He can't make his bed.", 'She can make her bed.', 'He can clean his room.'] },
  { cue: '🎒', promptEn: 'Can they pack their bags?', promptPl: 'Czy potrafią spakować torby?', answer: 'They can pack their bags.', distractors: ["They can't pack their bags.", 'He can pack his bag.', 'They can open their bags.'] },
  { cue: '🚫😴', promptEn: 'Say you cannot stay in bed.', promptPl: 'Powiedz, że nie możesz zostać w łóżku.', answer: "I can't stay in bed.", accept: ['I cannot stay in bed.'], distractors: ['I can stay in bed.', "She can't stay in bed.", "I can't stay on the sofa."] },
]);
batch('routines', 'like', [
  { cue: '☀️', promptEn: 'Do you like the sun in the morning?', promptPl: 'Czy lubisz słońce rano?', answer: 'I like the sun.', distractors: ["I don't like the sun.", 'I like the moon.', 'She likes the sun.'] },
  { cue: '🍳', promptEn: 'Does she like cereal?', promptPl: 'Czy ona lubi płatki?', answer: 'She likes cereal.', distractors: ['She like cereal.', "She doesn't like cereal.", 'He likes cereal.'] },
  { cue: '🛁', promptEn: 'Does he like the bathtub?', promptPl: 'Czy on lubi wannę?', answer: 'He likes the bathtub.', distractors: ['He like the bathtub.', "He doesn't like the bathtub.", 'She likes the bathtub.'] },
  { cue: '📚', promptEn: 'Do they like the notebook?', promptPl: 'Czy lubią zeszyt?', answer: 'They like the notebook.', distractors: ['They likes the notebook.', "They don't like the notebook.", 'He likes the notebook.'] },
  { cue: '🌙', promptEn: 'Do you like the moon at bedtime?', promptPl: 'Czy lubisz księżyc przed snem?', answer: 'We like the moon.', distractors: ['We likes the moon.', "We don't like the moon.", 'I like the sun.'] },
]);
batch('routines', 'present_simple', [
  { cue: '⏰', promptEn: 'What time do you get up?', promptPl: 'O której wstajesz?', answer: 'I get up at seven o\'clock.', accept: ['I get up at 7 o\'clock.', 'I get up at seven.'], distractors: ['I gets up at seven o\'clock.', 'She gets up at seven o\'clock.', 'I get up at eight o\'clock.'] },
  { cue: '🦷', promptEn: 'What does she do after breakfast?', promptPl: 'Co ona robi po śniadaniu?', answer: 'She brushes her teeth after breakfast.', distractors: ['She brush her teeth after breakfast.', 'He brushes his teeth after breakfast.', 'She washes her hair after breakfast.'] },
  { cue: '🚌', promptEn: 'How does he go to school?', promptPl: 'Jak on jedzie do szkoły?', answer: 'He goes to school by bus.', distractors: ['He go to school by bus.', 'She goes to school by bus.', 'He goes to school by car.'] },
  { cue: '📝', promptEn: 'When do they use the notebook?', promptPl: 'Kiedy używają zeszytu?', answer: 'They use the notebook after school.', distractors: ['They uses the notebook after school.', 'They use the notebook before school.', 'He uses the notebook after school.'] },
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
  { cue: '🕐', promptEn: 'What time is on the clock?', promptPl: 'Która godzina jest na zegarze?', answer: 'The clock shows one o\'clock.', accept: ['It is one o\'clock.', "It's one o'clock.", 'It is 1 o\'clock.'], distractors: ['The clock shows two o\'clock.', 'The clock shows half past one.', 'The clocks show one o\'clock.'] },
  { cue: '🕒', promptEn: 'What time is on the clock?', promptPl: 'Która godzina jest na zegarze?', answer: 'The clock shows three o\'clock.', accept: ['It is three o\'clock.', "It's three o'clock.", 'It is 3 o\'clock.'], distractors: ['The clock shows four o\'clock.', 'The clock shows half past three.', 'The clocks show three o\'clock.'] },
  { cue: '🕔', promptEn: 'Is it five on the clock?', promptPl: 'Czy na zegarze jest piąta?', answer: 'The clock shows five o\'clock.', accept: ['It is five o\'clock.', "It's five o'clock.", 'It is 5 o\'clock.'], distractors: ['The clock shows six o\'clock.', 'The clock shows half past five.', 'The clocks show five o\'clock.'] },
  { cue: '☀️', promptEn: 'What is in the morning sky?', promptPl: 'Co jest na porannym niebie?', answer: 'The sun is in the sky.', distractors: ['The moon is in the sky.', 'The suns are in the sky.', 'The cake is in the sky.'] },
  { cue: '🌙', promptEn: 'What is in the night sky?', promptPl: 'Co jest na nocnym niebie?', answer: 'The moon is in the sky.', distractors: ['The sun is in the sky.', 'The moons are in the sky.', 'The clock is in the sky.'] },
]);
batch('time', 'have_got', [
  { cue: '🕰️', promptEn: 'Talk about the clock.', promptPl: 'Powiedz o zegarze.', answer: 'I have got a clock.', accept: ["I've got a clock.", 'I have a clock.'], distractors: ['She has got a clock.', 'I have got a cake.', "I haven't got a clock."] },
  { cue: '🕰️', promptEn: 'Talk about the big clock.', promptPl: 'Powiedz o dużym zegarze.', answer: 'We have got a big clock.', accept: ["We've got a big clock."], distractors: ['We has got a big clock.', 'We have got a small clock.', 'They have got a big clock.'] },
  { cue: '📅', promptEn: 'Talk about a calendar.', promptPl: 'Powiedz o kalendarzu.', answer: 'She has got a calendar.', accept: ["She's got a calendar."], distractors: ['He has got a calendar.', 'She have got a calendar.', 'She has got a diary.'] },
  { cue: '🎈', promptEn: 'Talk about birthday balloons.', promptPl: 'Powiedz o urodzinowych balonach.', answer: 'They have got balloons.', accept: ["They've got balloons.", 'They have got a balloon.'], distractors: ['They has got balloons.', 'They have got cakes.', 'He has got balloons.'] },
  { cue: '🎁', promptEn: 'Talk about a gift.', promptPl: 'Powiedz o prezencie.', answer: 'He has got a gift.', accept: ["He's got a gift."], distractors: ['She has got a gift.', 'He have got a gift.', 'He has got a clock.'] },
]);
batch('time', 'can', [
  { cue: '🕐', promptEn: 'Can you read the clock?', promptPl: 'Czy umiesz czytać zegar?', answer: 'I can read the clock.', distractors: ["I can't read the clock.", 'She can read the clock.', 'I can read the cake.'] },
  { cue: '📅', promptEn: 'Can she read the calendar?', promptPl: 'Czy ona umie czytać kalendarz?', answer: 'She can read the calendar.', distractors: ["She can't read the calendar.", 'He can read the calendar.', 'She can read a book.'] },
  { cue: '🎂', promptEn: 'Can he cut the cake?', promptPl: 'Czy on umie pokroić tort?', answer: 'He can cut the cake.', distractors: ["He can't cut the cake.", 'She can cut the cake.', 'He can cut the clock.'] },
  { cue: '📅', promptEn: 'Can they use the calendar?', promptPl: 'Czy potrafią użyć kalendarza?', answer: 'They can use the calendar.', distractors: ["They can't use the calendar.", 'He can use the calendar.', 'They can use the cake.'] },
  { cue: '🚫🎂', promptEn: 'Say you cannot eat the cake now.', promptPl: 'Powiedz, że nie możesz teraz zjeść tortu.', answer: "I can't eat the cake now.", accept: ['I cannot eat the cake now.'], distractors: ['I can eat the cake now.', "She can't eat the cake now.", "I can't eat the gift now."] },
]);
batch('time', 'like', [
  { cue: '☀️', promptEn: 'Do you like the morning sun?', promptPl: 'Czy lubisz poranne słońce?', answer: 'I like the sun.', distractors: ["I don't like the sun.", 'I like the moon.', 'She likes the sun.'] },
  { cue: '🎂', promptEn: 'Does she like the birthday cake?', promptPl: 'Czy ona lubi urodzinowy tort?', answer: 'She likes the cake.', distractors: ['She like the cake.', "She doesn't like the cake.", 'He likes the cake.'] },
  { cue: '🌙', promptEn: 'Does he like the moon?', promptPl: 'Czy on lubi księżyc?', answer: 'He likes the moon.', distractors: ['He like the moon.', "He doesn't like the moon.", 'She likes the moon.'] },
  { cue: '🎈', promptEn: 'Do they like balloons?', promptPl: 'Czy lubią balony?', answer: 'They like balloons.', distractors: ['They likes balloons.', "They don't like balloons.", 'He likes balloons.'] },
  { cue: '🎁', promptEn: 'Do you like gifts?', promptPl: 'Czy lubisz prezenty?', answer: 'We like gifts.', distractors: ['We likes gifts.', "We don't like gifts.", 'I like clocks.'] },
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
    'assets/vocab-scenes/school-classroom.jpg',
    'assets/vocab-scenes/school-playground.jpg'
  ],
  family_home: [
    'assets/vocab-scenes/family-livingroom.jpg',
    'assets/vocab-scenes/family-picnic.jpg',
    'assets/vocab-scenes/home-house.jpg',
    'assets/vocab-scenes/home-kitchen.jpg'
  ],
  food: [
    'assets/vocab-scenes/food-market.jpg',
    'assets/vocab-scenes/food-restaurant.jpg',
    'assets/vocab-scenes/food-supermarket.jpg'
  ],
  free_time: [
    'assets/vocab-scenes/freetime-beach.jpg',
    'assets/vocab-scenes/freetime-park.jpg'
  ],
  clothes_weather: [
    'assets/vocab-scenes/clothes-bedroom.jpg',
    'assets/vocab-scenes/clothes-shop.jpg',
    'assets/vocab-scenes/weather-rainy.jpg',
    'assets/vocab-scenes/weather-seasons.jpg'
  ],
  town: [
    'assets/vocab-scenes/town-centre.jpg',
    'assets/vocab-scenes/town-station.jpg'
  ],
  animals: [
    'assets/vocab-scenes/animals-farm.jpg',
    'assets/vocab-scenes/animals-forest.jpg',
    'assets/vocab-scenes/animals-zoo.jpg'
  ],
  routines: [
    'assets/vocab-scenes/routines-morning.jpg',
    'assets/vocab-scenes/routines-evening.jpg'
  ],
  time: [
    'assets/vocab-scenes/time-birthday.jpg',
    'assets/vocab-scenes/time-schoolday.jpg'
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
