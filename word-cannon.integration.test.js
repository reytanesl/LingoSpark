import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import {
    createRoom,
    destroyRoom,
    initLiveGame,
    joinRoom,
    publicRoomSnapshot,
    questionSecondsForRoom,
    setRoomSettings,
} from './live-game.js';

function waitFor(socket, event, predicate = () => true, ms = 4000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(event, onEvent);
            reject(new Error(`Timed out waiting for ${event}`));
        }, ms);
        function onEvent(payload) {
            if (!predicate(payload)) return;
            clearTimeout(timer);
            socket.off(event, onEvent);
            resolve(payload);
        }
        socket.on(event, onEvent);
    });
}

const DECK = [
    ['school', 'A place where children learn'],
    ['bakery', 'A shop that sells bread'],
    ['garden', 'A place where flowers grow'],
    ['harbour', 'A place where boats stay'],
    ['library', 'A place where people borrow books'],
    ['kitchen', 'A room where food is cooked'],
    ['market', 'A place where people buy food'],
    ['station', 'A place where trains stop'],
    ['museum', 'A place where old objects are shown'],
    ['bridge', 'A structure that crosses a river'],
    ['castle', 'A large old building with towers'],
    ['island', 'Land with water all around it'],
].map(([term, definition]) => ({ term, definition }));

test('Word Cannon lobby: fixed Red/Blue teams, defaults and format switching', () => {
    const room = createRoom('host-0', { deck: DECK, gameFormat: 'word-cannon', teamAssignment: 'pick' });
    let snap = publicRoomSnapshot(room);
    assert.deepEqual(snap.teams.map((t) => t.id), ['red', 'blue']);
    assert.equal(snap.minPlayers, 2);
    assert.equal(snap.gameMinutes, 5);
    assert.equal(questionSecondsForRoom(room), 20);
    assert.equal(snap.canStart, false);
    setRoomSettings(room, { gameMinutes: 8, questionSeconds: 30 });
    assert.equal(room.gameMinutes, 8);
    assert.equal(questionSecondsForRoom(room), 30);
    setRoomSettings(room, { gameFormat: 'captain-crew' });
    snap = publicRoomSnapshot(room);
    assert.equal(snap.teams.length, 0, 'fixed teams are dropped when leaving Word Cannon');
    setRoomSettings(room, { gameFormat: 'word-cannon', teamAssignment: 'random' });
    assert.equal(publicRoomSnapshot(room).teams.length, 0);
    joinRoom(room.code, 'Ann', '10.1.0.1');
    joinRoom(room.code, 'Bo', '10.1.0.2');
    assert.equal(publicRoomSnapshot(room).canStart, true, 'random mode starts with two players');
    destroyRoom(room.code, room.hostToken);
});

test('Word Cannon runs teams, a challenge, a volley and a finish over sockets', async () => {
    const httpServer = createServer();
    const io = new Server(httpServer);
    initLiveGame(io);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${httpServer.address().port}`;

    const room = createRoom('host-1', { deck: DECK, level: 'beginner', answerMode: 'realise', gameFormat: 'word-cannon', teamAssignment: 'pick', questionSeconds: 15 });
    room.cannonSeed = 1234;
    const names = ['Ada', 'Bea', 'Cam', 'Dev'];
    const joined = names.map((n, i) => joinRoom(room.code, n, `10.0.0.${i + 1}`));
    const host = ioClient(url, { transports: ['websocket'] });
    const socks = names.map(() => ioClient(url, { transports: ['websocket'] }));
    const all = [host, ...socks];
    try {
        await Promise.all(all.map((s) => waitFor(s, 'connect')));
        host.emit('live:host-join', { code: room.code, hostToken: room.hostToken });
        await waitFor(host, 'live:host-joined');
        for (const [i, sock] of socks.entries()) {
            sock.emit('live:player-join', { code: room.code, playerId: joined[i].player.id, playerToken: joined[i].player.playerToken });
            await waitFor(sock, 'live:player-joined');
        }
        // Players cannot make extra teams.
        socks[0].emit('live:create-team');
        const err = await waitFor(socks[0], 'live:error');
        assert.match(err.error, /Red or Blue/);
        // Ada + Bea -> Red, Cam + Dev -> Blue.
        for (const [i, team] of ['red', 'red', 'blue', 'blue'].entries()) {
            const update = waitFor(host, 'live:room-state', (s) => s.teams.find((t) => t.id === team)?.memberIds.includes(joined[i].player.id));
            socks[i].emit('live:join-team', { teamId: team });
            await update;
        }
        assert.equal(publicRoomSnapshot(room).canStart, true);

        const intro = waitFor(host, 'live:cannon-state', (s) => s.phase === 'intro');
        host.emit('live:start-game');
        const introState = await intro;
        assert.deepEqual(introState.teams.red.members.map((m) => m.nickname), ['Ada', 'Bea']);
        assert.equal(introState.teams.blue.hp, 100);

        const qPromise = waitFor(socks[0], 'live:your-question');
        const opening = waitFor(host, 'live:cannon-state', (s) => s.phase === 'question');
        host.emit('live:cannon-skip');
        const q = await qPromise;
        const state = await opening;
        assert.equal(q.gameFormat, 'word-cannon');
        assert.equal(q.team, 'red');
        assert.equal(q.timeLimitSec, 15);
        assert.equal(state.questionMs, 15_000);
        assert.ok(state.correctTerm);
        assert.ok(state.clock.gameEndsAt > Date.now());

        // Ada right, Bea right, Cam wrong -> challenge -> accepted, Dev wrong -> continue.
        const adaRes = waitFor(socks[0], 'live:answer-result');
        socks[0].emit('live:submit-answer', { text: state.correctTerm, questionId: q.questionId });
        const adaResult = await adaRes;
        assert.equal(adaResult.correct, true);
        assert.equal(adaResult.tier, 'fast');
        assert.equal(adaResult.cannon, true);
        socks[1].emit('live:submit-answer', { text: state.correctTerm, questionId: q.questionId });
        const camRes = waitFor(socks[2], 'live:answer-result');
        socks[2].emit('live:submit-answer', { text: `${state.correctTerm}x`, questionId: q.questionId });
        assert.equal((await camRes).challengeable, true);
        const pending = waitFor(host, 'live:challenge-pending');
        socks[2].emit('live:challenge-answer');
        const challenge = await pending;
        const devRes = waitFor(socks[3], 'live:answer-result');
        socks[3].emit('live:submit-answer', { text: 'nothing', questionId: q.questionId });
        await devRes;
        const devResolved = waitFor(socks[3], 'live:challenge-resolved');
        socks[3].emit('live:skip-challenge');
        await devResolved;
        const review = await waitFor(host, 'live:cannon-state', (s) => s.phase === 'review');
        assert.equal(review.phaseEndsAt, null, 'waiting for the teacher');
        assert.ok(review.clock.pausedAt);

        const camResolved = waitFor(socks[2], 'live:challenge-resolved');
        const volleyPromise = waitFor(host, 'live:cannon-state', (s) => s.phase === 'volley');
        host.emit('live:resolve-challenge', { challengeId: challenge.id || challenge.challengeId, accept: true });
        assert.equal((await camResolved).challengeAccepted, true);
        const volley = await volleyPromise;
        assert.equal(volley.volley.loaded.red, 2);
        assert.equal(volley.volley.loaded.blue, 1);
        assert.equal(volley.volley.shots.length, 3);
        assert.equal(volley.volley.first, 'red');
        assert.ok(volley.volley.shots.every((s) => typeof s.label === 'string' && s.at > 0));
        assert.equal(volley.teams.blue.hpBefore, 100);

        // Phones see their own shots.
        const adaVolley = await waitFor(socks[0], 'live:cannon-state', (s) => s.phase === 'volley');
        assert.equal(adaVolley.you.team, 'red');
        assert.equal(adaVolley.you.shots.length, 1);

        const next = waitFor(host, 'live:cannon-state', (s) => s.phase === 'question' && s.round === 2);
        host.emit('live:cannon-next');
        await next;

        const finished = waitFor(socks[1], 'live:game-finished');
        host.emit('live:end-game');
        const fin = await finished;
        assert.equal(fin.gameFormat, 'word-cannon');
        assert.equal(fin.cannon, true);
        assert.ok(['red', 'blue', null].includes(fin.winner));
        assert.deepEqual(fin.teams.red.memberIds, [joined[0].player.id, joined[1].player.id]);
        assert.ok(fin.mvp, 'an MVP is named');
        assert.equal(fin.players.length, 4);
        // Reconnecting after the end gets the result again.
        const late = ioClient(url, { transports: ['websocket'] });
        all.push(late);
        await waitFor(late, 'connect');
        const again = waitFor(late, 'live:game-finished');
        socks[0].disconnect();
        await new Promise((r) => setTimeout(r, 50));
        late.emit('live:player-join', { code: room.code, playerId: joined[0].player.id, playerToken: joined[0].player.playerToken });
        assert.equal((await again).gameFormat, 'word-cannon');
    } finally {
        clearTimeout(room.cannonTimer);
        for (const s of all) s.close();
        destroyRoom(room.code, room.hostToken);
        io.close();
        await new Promise((resolve) => httpServer.close(resolve));
    }
});

test('Word Cannon random teams split players evenly', async () => {
    const room = createRoom('host-2', { deck: DECK, gameFormat: 'word-cannon' });
    for (const n of ['Al', 'Bo', 'Cy', 'Di', 'Ed']) joinRoom(room.code, n, `10.2.0.${n}`);
    const httpServer = createServer();
    const io = new Server(httpServer);
    initLiveGame(io);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const host = ioClient(`http://127.0.0.1:${httpServer.address().port}`, { transports: ['websocket'] });
    try {
        await waitFor(host, 'connect');
        host.emit('live:host-join', { code: room.code, hostToken: room.hostToken });
        await waitFor(host, 'live:host-joined');
        const intro = waitFor(host, 'live:cannon-state', (s) => s.phase === 'intro');
        host.emit('live:start-game');
        const s = await intro;
        const sizes = [s.teams.red.members.length, s.teams.blue.members.length].sort();
        assert.deepEqual(sizes, [2, 3]);
        assert.equal(s.teams.red.slots + s.teams.blue.slots, 5);
    } finally {
        clearTimeout(room.cannonTimer);
        host.close();
        destroyRoom(room.code, room.hostToken);
        io.close();
        await new Promise((resolve) => httpServer.close(resolve));
    }
});

test('Word Cannon: a player who lets the timer run out gets a wrong-answer "time\'s up" result', async () => {
    const httpServer = createServer();
    const io = new Server(httpServer);
    initLiveGame(io);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${httpServer.address().port}`;
    const room = createRoom('host-3', { deck: DECK, answerMode: 'realise', gameFormat: 'word-cannon', teamAssignment: 'pick' });
    room.cannonSeed = 99;
    room.questionSeconds = 1; // test-only: below the 5 s UI minimum so the real timer fires fast
    const joined = ['Ada', 'Bea'].map((n, i) => joinRoom(room.code, n, `10.4.0.${i + 1}`));
    const host = ioClient(url, { transports: ['websocket'] });
    const socks = joined.map(() => ioClient(url, { transports: ['websocket'] }));
    try {
        await Promise.all([host, ...socks].map((s) => waitFor(s, 'connect')));
        host.emit('live:host-join', { code: room.code, hostToken: room.hostToken });
        await waitFor(host, 'live:host-joined');
        for (const [i, sock] of socks.entries()) {
            sock.emit('live:player-join', { code: room.code, playerId: joined[i].player.id, playerToken: joined[i].player.playerToken });
            await waitFor(sock, 'live:player-joined');
            const update = waitFor(host, 'live:room-state', (s) => s.teams.find((t) => t.id === (i ? 'blue' : 'red'))?.memberIds.includes(joined[i].player.id));
            sock.emit('live:join-team', { teamId: i ? 'blue' : 'red' });
            await update;
        }
        const intro = waitFor(host, 'live:cannon-state', (s) => s.phase === 'intro');
        host.emit('live:start-game');
        await intro;
        const opening = waitFor(host, 'live:cannon-state', (s) => s.phase === 'question');
        host.emit('live:cannon-skip');
        const q = await opening;

        const beaRes = waitFor(socks[1], 'live:answer-result');
        const beaVolley = waitFor(socks[1], 'live:cannon-state', (s) => s.phase === 'volley');
        socks[0].emit('live:submit-answer', { text: q.correctTerm, questionId: q.questionId });
        const result = await beaRes;
        assert.equal(result.timedOut, true);
        assert.equal(result.correct, false);
        assert.equal(result.eligible, false);
        assert.equal(result.challengeable, false);
        assert.equal(result.answerText, '');
        assert.equal(result.correctTerm, q.correctTerm);
        assert.equal(result.cannon, true);
        assert.equal(result.team, 'blue');
        const state = await beaVolley;
        assert.equal(state.you.status, 'out');
        assert.equal(state.you.decision, 'wrong');
        assert.equal(state.you.timedOut, true);
        assert.equal(state.you.correctTerm, q.correctTerm);
        assert.equal(state.you.stats.answered, 1, 'counted like any wrong answer');
        assert.equal(state.you.stats.correct, 0);
        assert.equal(state.volley.loaded.blue, 0, 'no shot');
        assert.equal(state.volley.loaded.red, 1);
        const challengeErr = waitFor(socks[1], 'live:error');
        socks[1].emit('live:challenge-answer');
        assert.ok((await challengeErr).error);
    } finally {
        clearTimeout(room.cannonTimer);
        host.close();
        socks.forEach((s) => s.close());
        destroyRoom(room.code, room.hostToken);
        io.close();
        await new Promise((resolve) => httpServer.close(resolve));
    }
});
