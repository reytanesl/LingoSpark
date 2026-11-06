import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { loadBuiltinDeck } from './vocab-quiz-utils.js';

const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const ownTimeJs = fs.readFileSync(new URL('./own-time.js', import.meta.url), 'utf8');
const liveClientJs = fs.readFileSync(new URL('./live-game-client.js', import.meta.url), 'utf8');
const serverJs = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8');

test('Word Sets cards expose View / clickable title for glossary', () => {
    assert.match(indexHtml, /id="ws-glossary-viewer"/);
    assert.match(indexHtml, /function openWordSetGlossary/);
    assert.match(indexHtml, /function viewDemoWordSet/);
    assert.match(indexHtml, /function viewSavedWordSet/);
    assert.match(indexHtml, /function viewBuiltinDeck/);
    assert.match(indexHtml, /onclick="viewDemoWordSet\(/);
    assert.match(indexHtml, /onclick="viewSavedWordSet\(/);
    assert.match(indexHtml, /onclick="viewBuiltinDeck\(/);
    assert.match(indexHtml, /fa-book-open[\s\S]*View/);
    assert.match(indexHtml, /renderBuiltinDeckCardsHtml/);
    assert.match(indexHtml, /ws-glossary-term/);
    assert.match(indexHtml, /ws-glossary-def/);
    assert.match(indexHtml, /window\.WordSetGlossary/);
});

test('own-time and Live keep select/use and add a View control', () => {
    assert.match(ownTimeJs, /data-ot-ws-view/);
    assert.match(ownTimeJs, /viewSelectedWordSet/);
    assert.match(ownTimeJs, /WordSetGlossary/);
    assert.match(ownTimeJs, /ot-wordset-select/);
    assert.match(ownTimeJs, /Word boxes \("Use these words"\) were removed|wordBoxHtml/);
    assert.doesNotMatch(ownTimeJs, /Use these words from the box|words from the box above/i);
    assert.match(liveClientJs, /viewHostSelectedWordSet/);
    assert.match(liveClientJs, /viewHostBuiltinLevel/);
    assert.match(liveClientJs, /live-host-wordset-view/);
    assert.match(indexHtml, /id="live-host-wordset-view"/);
    assert.match(indexHtml, /id="live-host-level-view"/);
});

test('server exposes read-only builtin deck glossary API', () => {
    assert.match(serverJs, /\/api\/builtin-decks\/:level/);
});

test('GET /api/builtin-decks/:level returns term + definition rows', async () => {
    const app = express();
    app.get('/api/builtin-decks/:level', (req, res) => {
        const allowed = new Set(['beginner', 'easy', 'intermediate', 'advanced']);
        const level = String(req.params.level || '').toLowerCase();
        if (!allowed.has(level)) return res.status(400).json({ error: 'Unknown built-in level.' });
        const labels = { beginner: 'Beginner', easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced' };
        const items = loadBuiltinDeck(level).map((row) => ({ term: row.term, definition: row.definition }));
        res.json({ level, name: labels[level], items });
    });
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
        const bad = await fetch(`http://127.0.0.1:${port}/api/builtin-decks/nope`);
        assert.equal(bad.status, 400);
        const res = await fetch(`http://127.0.0.1:${port}/api/builtin-decks/beginner`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.level, 'beginner');
        assert.equal(data.name, 'Beginner');
        assert.ok(Array.isArray(data.items) && data.items.length > 5);
        assert.ok(data.items[0].term);
        assert.ok(data.items[0].definition);
        const live = loadBuiltinDeck('beginner');
        assert.equal(data.items.length, live.length);
        assert.equal(data.items[0].term, live[0].term);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
