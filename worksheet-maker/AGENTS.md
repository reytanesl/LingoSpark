# Lesson Creator

One classroom tool from a link, PDF, pasted text, or topic:

1. **Worksheet** — always generated first: a printable ESL/DaF reading or listening lesson, or a Polish primary (SP 4–8) practice sheet, plus the teacher key. You can move tasks up or down on the sheet.
2. **Presentation** — after the ESL/DaF worksheet is ready: finished 16:9 slides from that same sheet and answer key, plus a PDF download.

Work in the **web app** or in **Cursor chat**.

## Worksheet

Resource analysis stays internal. Student pages are numbered activities, not labelled lesson-plan sections.

- Unabridged source text unless the teacher asks to adapt.
- When adapting, reading time is about 3 minutes at A1 up to about 6 minutes at C1.
- No student-facing summary.
- Teacher chooses task types (introduction, pre-teach vocabulary, pre-reading, gap-fill, MCQ, true/false, open-ended, vocabulary building, vocab and definition match, word formation, hypothesizing, discussion, Use of English cloze and word bank, grammar practice, scenario, debate, reflection).
- Source text is included unless the teacher unticks it for the worksheet and/or the slides.
- Optional topic-related photo on the worksheet (under the header) and on the presentation title slide. The photo must show the **main idea of the article** (image libraries such as Wikimedia / Openverse); it does not have to come from the original article page.
- English tab: ESL worksheets and slides, English interface. **Deutsch** tab: DaF worksheets and slides, German interface. **Po polsku** tab: Polish SP classes 4–8 practice worksheets by subject and topic (podstawa programowa); Polish interface; age/subject colourful sheet design (doodles); silent ASD-friendly design without labelling it on the sheet. Math sheets include practical calculate/measure/draw tasks.
- Sans-serif throughout. LingoSpark mark in the bottom-right margin of every printed page (not overlapping tasks).

Skill: `.cursor/skills/create-lesson/SKILL.md`

## Presentation

Finished 16:9 slides plus a PDF download, built from the finished worksheet (same tasks, order, and keys). Title always; reading chunks only if the teacher included the source text on the slides; source attribution last. After each closed task, a same-layout follow-up slide reveals only the answers. No blueprint labels. A2/A2+ get Hints Boxes. LingoSpark mark on every slide.

Skill: `.cursor/skills/create-slide-deck/SKILL.md`

## Web app

```bash
copy .env.example .env
```

Put the same `CURSOR_API_KEY` you use for LingoSpark into `.env`, then:

```bash
npm install
npm start
```

Open http://localhost:3050

## Layout

| Path | Purpose |
|------|---------|
| `index.html` | One creator: worksheet + optional slides |
| `server.js` | Fetch source + Cursor AI generation |
| `lib/fetch-source.js` | Article extract / YouTube captions |
| `lib/topic-image.js` | Topic photo for worksheet and title slide |
| `lib/lesson-to-deck.js` | Build slides from the worksheet JSON |
| `lib/lesson-prompt.js` | Worksheet prompt and shared task list |
| `lib/slides-prompt.js` | Slide-deck prompt |
| `lib/pdf-text.js` | PDF text extract |
| `assets/lingospark-logo.png` | Corner mark on slides |
| `lessons/` | Files saved from Cursor chat |
