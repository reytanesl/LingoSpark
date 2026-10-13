import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import {
    createRoom, destroyRoom, initLiveGame, joinRoom, publicRoomSnapshot, setRoomSettings,
    challengesEnabled, normalizeChallengesSetting, tagChallengeResult,
} from './live-game.js';

const DECK = ['school', 'bakery', 'garden', 'harbour', 'library', 'kitchen', 'market', 'station', 'museum', 'bridge', 'castle', 'island']
    .map((term, i) => ({ term, definition: `Definition number ${i + 1} for ${term.length} letters` }));
const termOf = (q) => DECK.find((d) => d.definition === q.definition).term;

function waitFor(socket, event, predicate = () => true, ms = 4000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.off(event, on); reject(new Error(`Timed out waiting for ${event}`)); }, ms);
        function on(p) { if (!predicate(p)) return; clearTimeout(timer); socket.off(event, on); resolve(p); }
        socket.on(event, on);
    });
}

test('challenges default on; host can switch them off per room (kept like answer time)', () => {
    const room = createRoom('h', { deck: DECK, gameFormat: 'lucky-lanterns' });
    assert.equal(challengesEnabled(room), true);
    assert.equal(publicRoomSnapshot(room).challengesEnabled, true);
    setRoomSettings(room, { challenges: false });
    assert.equal(publicRoomSnapshot(room).challengesEnabled, false);
    setRoomSettings(room, { questionSeconds: 30 });
    assert.equal(challengesEnabled(room), false, 'other setting changes keep the switch');
    setRoomSettings(room, { gameFormat: 'word-cannon' });
    assert.equal(challengesEnabled(room), false, 'format change keeps the switch');
    setRoomSettings(room, { challenges: true });
    assert.equal(challengesEnabled(room), true);
    assert.equal(challengesEnabled(createRoom('h', { deck: DECK, challenges: 'off' })), false);
    assert.equal(normalizeChallengesSetting('on'), true);
    assert.equal(normalizeChallengesSetting(0), false);
    destroyRoom?.(room.code);
});

test('tagChallengeResult marks challengeable results only when off', () => {
    const room = createRoom('h', { deck: DECK });
    const r = { correct: false, challengeable: true };
    assert.equal(tagChallengeResult(room, r).challengesOff, undefined);
    room.challengesEnabled = false;
    assert.equal(tagChallengeResult(room, r).challengesOff, true);
    assert.equal(tagChallengeResult(room, { correct: true }).challengesOff, undefined);
});

test('race over sockets with challenges off: no challenge accepted, Continue works, host gets no card', async () => {
    const httpServer = createServer();
    const io = new Server(httpServer);
    initLiveGame(io);
    await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${httpServer.address().port}`;
    const room = createRoom('host-ct', { deck: DECK, level: 'beginner', answerMode: 'realise', gameFormat: 'race', challenges: false });
    const joined = ['Ada', 'Bea'].map((n, i) => joinRoom(room.code, n, `10.1.0.${i + 1}`));
    const host = ioClient(url, { transports: ['websocket'] });
    const socks = joined.map(() => ioClient(url, { transports: ['websocket'] }));
    let hostCards = 0;
    host.on('live:challenge-pending', () => { hostCards++; });
    try {
        await Promise.all([host, ...socks].map((s) => waitFor(s, 'connect')));
        host.emit('live:host-join', { code: room.code, hostToken: room.hostToken });
        const joinedHost = await waitFor(host, 'live:host-joined');
        assert.equal(joinedHost.snapshot?.challengesEnabled ?? publicRoomSnapshot(room).challengesEnabled, false);
        for (const [i, s] of socks.entries()) {
            s.emit('live:player-join', { code: room.code, playerId: joined[i].player.id, playerToken: joined[i].player.playerToken });
            await waitFor(s, 'live:player-joined');
        }
        const q0 = waitFor(socks[0], 'live:your-question');
        host.emit('live:start-game');
        const q = await q0;
        const res = waitFor(socks[0], 'live:answer-result');
        socks[0].emit('live:submit-answer', { text: `${termOf(q)}x`, questionId: q.questionId });
        const r = await res;
        assert.equal(r.challengeable, true, 'answer is still a near miss');
        assert.equal(r.challengesOff, true, 'phone is told challenges are off');
        const err = waitFor(socks[0], 'live:error');
        socks[0].emit('live:challenge-answer');
        assert.match((await err).error, /switched off/);
        const after = waitFor(socks[0], 'live:challenge-resolved');
        socks[0].emit('live:skip-challenge');
        const cont = await after;
        assert.equal(cont.challengeable, false);
        await new Promise((r2) => setTimeout(r2, 150));
        assert.equal(hostCards, 0, 'host never sees a challenge card');
    } finally {
        [host, ...socks].forEach((s) => s.close());
        io.close();
        httpServer.close();
    }
});

test('lobby UI has the switch next to answer time and sends it', () => {
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.ok(html.indexOf('id="live-lobby-challenges"') > html.indexOf('id="live-lobby-question-time"'));
    assert.match(html, /role="switch"/);
    const client = readFileSync(new URL('./live-game-client.js', import.meta.url), 'utf8');
    assert.match(client, /gameMinutes, challenges, settingsSeq/);
    assert.match(client, /result\.challengesOff/);
});
