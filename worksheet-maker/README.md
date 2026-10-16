# Lesson Creator

One tool for classroom English: a **printable worksheet**, and optionally a **classroom presentation**, from the same source and the same ticked tasks.

Tick **Create a presentation** if you also want 16:9 slides (present in the browser, or download a PDF).

## What you get

Numbered student activities (no lesson-plan subheadings on the sheet). Choose any mix of:

- Introduction, pre-teach vocabulary, pre-reading / pre-watching
- The unabridged text (reading) or a listen-only box (listening), unless you untick **Include the source text on the worksheet**
- Gap-fill, multiple choice, true/false, open-ended questions
- Vocabulary building, vocab and definition match, word formation, hypothesizing (What if…?)
- Discussion / critical thinking
- Use of English (cloze and word bank), grammar practice, scenario, debate, reflection

Leave **Adapt** off to keep the original text. Turn it on only when you want a levelled version that takes about **3 minutes to read at A1** and about **6 minutes at C1**.

Tick **Include a topic-related image** to put a photo under the worksheet header and on the presentation title slide.

If you tick **Create a presentation**, the slides use the **same tasks and answers** as the worksheet: title (with the topic photo if you asked for one), then reading chunks only if **Include the source text on the slides** is ticked, then the selected tasks, then the source. Use **Presentation** in the toolbar, **Present** for the classroom screen, and **Download PDF** for a printable handout of the slides.

A small LingoSpark mark sits in the bottom-right corner of every printed page and every slide.

## Run locally

Double-click **Start Lesson Creator.bat**. It starts the server and opens **http://localhost:3050**. Keep that window open while you work; close it to stop.

First-time setup: `.env` already needs `CURSOR_API_KEY` (the same Cursor AI key as LingoSpark).

## Cursor chat

Ask for a **worksheet**, a **slide deck**, or both. Output follows `.cursor/skills/create-lesson/SKILL.md` and/or `.cursor/skills/create-slide-deck/SKILL.md` and is saved under `lessons/`.
