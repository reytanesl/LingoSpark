import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { createRoom, destroyRoom, initLiveGame, joinRoom } from './live-game.js';
import {
    initReportStats, noteQuestionSent, noteAnswer, noteChallengeAccepted, buildGameReport,
    reportToCsv, reportToPdf, reportFileBase, formatWarsaw, formatDuration,
} from './game-report.js';

const DECK = ['school', 'bakery', 'garden', 'harbour', 'library', 'kitchen', 'market', 'station', 'museum', 'bridge', 'castle', 'island']
    .map((term, i) => ({ term, definition: `Definition number ${i + 1} for ${term.length} letters` }));
const termOf = (q) => DECK.find((d) => d.definition === q.definition).term;

function waitFor(socket, event, predicate = () => true, ms = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.off(event, on); reject(new Error(`Timed out waiting for ${event}`)); }, ms);
        function on(p) { if (!predicate(p)) return; clearTimeout(timer); socket.off(event, on); resolve(p); }
        socket.on(event, on);
    });
}

test('stats collection: answers, % correct, avg time, missed words, accepted challenges', () => {
    const room = createRoom('h', { deck: DECK, gameFormat: 'race', deckLabel: 'Słówka – Unit 3' });
    const a = joinRoom(room.code, 'Zażółć', '10.9.0.1').player;
    const b = joinRoom(room.code, 'Ben', '10.9.0.2').player;
    initReportStats(room, 1_000);
    noteQuestionSent(room, a.id, 'q1', 1_000);
    noteAnswer(room, a.id, { correct: true, correctTerm: 'school' }, 3_000);
    noteQuestionSent(room, b.id, 'q1', 1_000);
    noteAnswer(room, b.id, { correct: false, correctTerm: 'school' }, 5_000);
    noteQuestionSent(room, b.id, 'q2', 5_000);
    noteAnswer(room, b.id, { correct: false, correctTerm: 'bakery' }, 6_000);
    noteAnswer(room, a.id, { correct: false, correctTerm: 'school' }, 7_000);
    noteChallengeAccepted(room, b.id, 'bakery');
    room.finishedAt = 61_000 + 1_000;
    const r = buildGameReport(room, { winnerNickname: 'Zażółć', players: [] }, { questionSeconds: 20, challengesEnabled: true });
    assert.equal(r.wordSet, 'Słówka – Unit 3');
    assert.equal(r.winner, 'Zażółć');
    assert.equal(r.settings.challenges, 'On');
    assert.equal(r.durationMs, 61_000);
    const pa = r.players.find((p) => p.name === 'Zażółć');
    const pb = r.players.find((p) => p.name === 'Ben');
    assert.equal(pa.answers, 2); assert.equal(pa.correct, 1);
    assert.equal(pb.answers, 2); assert.equal(pb.correct, 1, 'accepted challenge counts as correct');
    assert.equal(r.missedWords[0].term, 'school');
    assert.equal(r.missedWords[0].misses, 2);
    assert.ok(!r.missedWords.some((m) => m.term === 'bakery' && m.misses > 0), 'accepted challenge is not a miss');
    assert.ok(r.missedWords.length <= 10);
    destroyRoom?.(room.code);
});

test('CSV is UTF-8 with BOM, CRLF and escaped; PDF is a real PDF; Warsaw time', async () => {
    const room = createRoom('h', { deck: DECK, deckLabel: 'Set "A", ąę' });
    const a = joinRoom(room.code, 'Łucja, "Ł"', '10.9.1.1').player;
    initReportStats(room, Date.UTC(2026, 9, 14, 9, 0, 0));
    noteAnswer(room, a.id, { correct: false, correctTerm: 'garden' });
    room.finishedAt = Date.UTC(2026, 9, 14, 9, 5, 30);
    const r = buildGameReport(room, { winnerNickname: 'Łucja, "Ł"' }, { challengesEnabled: false });
    const csv = reportToCsv(r);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.match(csv, /\r\n/);
    assert.ok(csv.includes('"Łucja, ""Ł"""'));
    assert.ok(csv.includes('"Set ""A"", ąę"'));
    assert.match(formatWarsaw(Date.UTC(2026, 9, 14, 9, 0, 0)), /11:00/);
    assert.equal(formatDuration(330_000), '5:30');
    const pdf = await reportToPdf(r);
    assert.ok(Buffer.isBuffer(pdf) && pdf.length > 2000);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.match(reportFileBase(r), /^lingospark-.*[0-9]/);
    destroyRoom?.(room.code);
});

test('race over sockets: server builds the report on finish and hands it to onGameEnd', async () => {
    const httpServer = createServer();
    const io = new Server(httpServer);
    let ended = null;
    initLiveGame(io, { onGameEnd(room) { ended = room.lastReport; } });
    await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${httpServer.address().port}`;
    const room = createRoom('host-gr', { deck: DECK, level: 'beginner', answerMode: 'realise', gameFormat: 'race', deckLabel: 'Test set' });
    const joined = ['Ada', 'Bea'].map((n, i) => joinRoom(room.code, n, `10.9.2.${i + 1}`));
    const host = ioClient(url, { transports: ['websocket'] });
    const socks = joined.map(() => ioClient(url, { transports: ['websocket'] }));
    try {
        await Promise.all([host, ...socks].map((s) => waitFor(s, 'connect')));
        host.emit('live:host-join', { code: room.code, hostToken: room.hostToken });
        await waitFor(host, 'live:host-joined');
        for (const [i, s] of socks.entries()) {
            s.emit('live:player-join', { code: room.code, playerId: joined[i].player.id, playerToken: joined[i].player.playerToken });
            await waitFor(s, 'live:player-joined');
        }
        let latest = null;
        socks[0].on('live:your-question', (p) => { latest = p; });
        const finished = waitFor(host, 'live:game-finished', () => true, 15000);
        host.emit('live:start-game');
        const until = async (fn) => { for (let i = 0; i < 15 && !fn(); i++) await new Promise((r) => setTimeout(r, 20)); };
        await until(() => latest);
        // Ada misses one word once (declines the challenge), then answers everything.
        let q = latest; latest = null;
        const missRes = waitFor(socks[0], 'live:answer-result');
        socks[0].emit('live:submit-answer', { text: 'qqqqqqqq', questionId: q.questionId });
        if ((await missRes).challengeable) socks[0].emit('live:skip-challenge');
        for (let i = 0; i < 40 && !room.lastReport; i++) {
            await until(() => latest || room.lastReport);
            if (room.lastReport) break;
            if (latest) q = latest;
            latest = null;
            socks[0].emit('live:submit-answer', { text: termOf(q), questionId: q.questionId });
        }
        await finished;
        const r = room.lastReport;
        assert.ok(r, 'room keeps the last report');
        assert.equal(ended, r, 'report is passed on for account history');
        assert.equal(r.wordSet, 'Test set');
        const ada = r.players.find((p) => p.name === 'Ada');
        assert.equal(ada.rank, 1);
        assert.ok(ada.correct >= 12);
        assert.equal(ada.answers, ada.correct + 1);
        assert.equal(r.missedWords.length, 1);
        assert.equal(r.missedWords[0].misses, 1);
        assert.equal(r.players.find((p) => p.name === 'Bea').answers, 0);
    } finally {
        [host, ...socks].forEach((s) => s.close());
        io.close();
        destroyRoom?.(room.code);
    }
});
