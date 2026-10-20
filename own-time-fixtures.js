/**
 * Mock AI reply for "In your own time" (tests + local runs without CURSOR_API_KEY:
 * start the server with OWN_TIME_MOCK=1). Server-only; never served to browsers.
 */
export const OWN_TIME_MOCK_REPLY = {
    title: 'Wakacyjna praca w kawiarni',
    minutes: 17,
    cefr: 'A2',
    instrLang: 'pl',
    focus: 'work · past simple',
    goal: 'Po tej lekcji opowiesz po angielsku o pracy wakacyjnej w 4 zdaniach.',
    coachNote: 'Nie musisz być idealny/a — liczy się, że próbujesz. Błędy to część nauki!',
    tasks: [
        {
            n: 1,
            type: 'vocab_drill',
            minutes: 4,
            instruction: 'Wpisz angielskie słowo pasujące do opisu.',
            steps: ['Przeczytaj przykład.', 'Wpisz jedno słowo przy każdym opisie.', 'Kliknij „Sprawdź” i popraw czerwone pola.'],
            example: 'a person who serves food in a café → waiter',
            usefulLanguage: ['customer', 'tip', 'shift', 'well-paid', 'summer job'],
            hint: 'Wszystkie słowa są w ramce „Przydatne słowa”.',
            prompt: '',
            items: [
                { q: 'a person who buys something in a shop or café', answer: 'customer', alts: ['a customer'] },
                { q: 'extra money for good service', answer: 'tip', alts: ['a tip', 'tips'] },
                { q: 'the hours when you work, e.g. 8 am – 2 pm', answer: 'shift', alts: ['a shift'] },
                { q: 'giving you a lot of money', answer: 'well-paid', alts: ['well paid'] },
            ],
            modelAnswers: [],
        },
        {
            n: 2,
            type: 'reading',
            minutes: 6,
            instruction: 'Przeczytaj tekst i odpowiedz krótko po angielsku.',
            steps: ['Najpierw przeczytaj pytania.', 'Przeczytaj tekst i znajdź odpowiedzi.', 'Odpowiedz 1–3 słowami i kliknij „Sprawdź”.'],
            example: 'Q: Where is the café? → near the beach',
            usefulLanguage: ['at eight o’clock', 'friendly', 'a new bike'],
            hint: 'Odpowiedzi są w tekście w tej samej kolejności co pytania.',
            prompt: 'Last summer Ola worked in a small café near the beach. Her shift started at eight o’clock, so she got up early. The customers were friendly and often left tips. At the end of August she bought a new bike.',
            items: [
                { q: 'When did Ola’s shift start?', answer: 'at eight o’clock', alts: ['at eight', 'eight', "at eight o'clock", "eight o'clock", 'at 8', '8'] },
                { q: 'What were the customers like?', answer: 'friendly', alts: ['they were friendly'] },
                { q: 'What did Ola buy?', answer: 'a new bike', alts: ['a bike', 'new bike', 'bike'] },
            ],
            modelAnswers: [],
        },
        {
            n: 3,
            type: 'writing',
            minutes: 7,
            instruction: 'Napisz do kolegi z Anglii o pracy wakacyjnej, którą chcesz mieć.',
            steps: ['Zapisz 2–3 słowa-klucze w planie.', 'Napisz 3–4 zdania: gdzie, co będziesz robić, dlaczego.', 'Przeczytaj tekst i sprawdź pisownię.'],
            example: 'I’d like to work in a hotel because I want to practise my English.',
            usefulLanguage: ['I’d like to work in…', 'I will…', 'because…', 'I think it will be…', 'With the money, I’ll buy…'],
            hint: 'Zacznij od: “This summer I’d like to work in…”',
            target: { minSentences: 3, maxSentences: 4 },
            prompt: 'Write to your English friend Jake. Tell him: where you want to work this summer, what you will do there, and why you want this job.',
            items: [],
            modelAnswers: ['Hi Jake! This summer I’d like to work in an ice-cream shop near the lake. I will serve customers and clean the tables. I want this job because I love ice cream and I want to save money for a new phone.'],
        },
    ],
};
