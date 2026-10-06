import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import {
    LIVE_QUESTION_SECONDS_MAX,
    LIVE_QUESTION_SECONDS_MIN,
    createRoom,
    destroyRoom,
    initLiveGame,
    joinRoom,
    normalizeQuestionSeconds,
    publicRoomSnapshot,
    questionSecondsForRoom,
    setRoomSettings,
} from './live-game.js';
import { LANTERN_QUESTION_MS, createLanternMatch, lanternPublicView, lanternQuestionPayload } from './lucky-lanterns.js';

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
    ['forest', 'A large area covered with trees'],
    ['desert', 'A dry place with very little rain'],
].map(([term, definition]) => ({ term, definition }));

function waitFor(socket, event, predicate = () => true, ms = 6000) {
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

/** Starts a socket server, a room with `names` joined, and connects host + player sockets. */
async function setup({ gameFormat, answerMode = 'recognise', names = ['Ada', 'Bea'], configure }) {
    const httpServer = createServer();
    const io = new Server(httpServer);
    initLiveGame(io);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${httpServer.address().port}`;
    const room = createRoom('host-t', { deck: DECK, answerMode, gameFormat });
    const joined = names.map((name, i) => joinRoom(room.code, name, `10.9.0.${i + 1}`));
    if (configure) configure(room);
    const host = ioClient(url, { transports: ['websocket'] });
    const socks = joined.map(() => ioClient(url, { transports: ['websocket'] }));
    await Promise.all([host, ...socks].map((s) => waitFor(s, 'connect')));
    host.emit('live:host-join', { code: room.code, hostToken: room.hostToken });
    await waitFor(host, 'live:host-joined');
    for (const [i, s] of socks.entries()) {
        s.emit('live:player-join', { code: room.code, playerId: joined[i].player.id, playerToken: joined[i].player.playerToken });
        await waitFor(s, 'live:player-joined');
    }
    const close = async () => {
        host.close();
        socks.forEach((s) => s.close());
        clearTimeout(room.lanternTimer); // a 45 s lantern phase timer would keep the test process alive
        destroyRoom(room.code, room.hostToken);
        await new Promise((resolve) => io.close(resolve));
        await new Promise((resolve) => httpServer.close(resolve));
    };
    return { room, host, socks, joined, close };
}

test('question time normalises to 5–120 s, and empty means the format default', () => {
    assert.equal(normalizeQuestionSeconds(null), null);
    assert.equal(normalizeQuestionSeconds(''), null);
    assert.equal(normalizeQuestionSeconds('default'), null);
    assert.equal(normalizeQuestionSeconds(0), null);
    assert.equal(normalizeQuestionSeconds('abc'), null);
    assert.equal(normalizeQuestionSeconds(2), LIVE_QUESTION_SECONDS_MIN);
    assert.equal(normalizeQuestionSeconds(999), LIVE_QUESTION_SECONDS_MAX);
    assert.equal(normalizeQuestionSeconds('30'), 30);
    assert.equal(normalizeQuestionSeconds(22.4), 22);
});

test('defaults keep the old timers: races untimed, Lucky Lanterns 20 s', () => {
    for (const gameFormat of ['race', 'captain-crew', 'hot-spark-relay']) {
        const room = createRoom('host-d', { deck: DECK, gameFormat });
        assert.equal(questionSecondsForRoom(room), null, gameFormat);
        assert.equal(publicRoomSnapshot(room).questionTimeSec, null);
        destroyRoom(room.code, room.hostToken);
    }
    const lantern = createRoom('host-d', { deck: DECK, gameFormat: 'lucky-lanterns' });
    assert.equal(questionSecondsForRoom(lantern), LANTERN_QUESTION_MS / 1000);
    setRoomSettings(lantern, { questionSeconds: 45 });
    assert.equal(questionSecondsForRoom(lantern), 45);
    assert.equal(publicRoomSnapshot(lantern).questionSeconds, 45);
    setRoomSettings(lantern, { lanternRounds: 5 }); // not sent: keep the time
    assert.equal(lantern.questionSeconds, 45);
    setRoomSettings(lantern, { gameFormat: 'race' }); // the chosen time carries over to another format
    assert.equal(questionSecondsForRoom(lantern), 45);
    setRoomSettings(lantern, { questionSeconds: null });
    assert.equal(questionSecondsForRoom(lantern), null);
    destroyRoom(lantern.code, lantern.hostToken);
});

test('Lucky Lanterns question phase uses the configured time', () => {
    const players = [{ id: 'a', nickname: 'A' }, { id: 'b', nickname: 'B' }];
    const def = createLanternMatch({ players, deck: DECK, now: 1000 });
    assert.equal(def.phaseEndsAt, 1000 + LANTERN_QUESTION_MS);
    const match = createLanternMatch({ players, deck: DECK, questionMs: 45_000, now: 1000 });
    assert.equal(match.phaseEndsAt, 46_000);
    assert.equal(lanternQuestionPayload(match).timeLimitSec, 45);
    assert.equal(lanternPublicView(match).questionMs, 45_000);
});

test('an untimed solo race sends no deadline', async () => {
    const ctx = await setup({ gameFormat: 'race' });
    try {
        const q = waitFor(ctx.socks[0], 'live:your-question');
        ctx.host.emit('live:start-game');
        const question = await q;
        assert.equal(question.endsAt, null);
        assert.equal(question.timeLimitSec, null);
        assert.equal(question.timeLeftMs, null);
    } finally {
        await ctx.close();
    }
});

test('solo race: time out keeps progress, shows the answer, swaps the question, and rejects a late answer', async () => {
    // 1 s keeps the test quick; hosts can only pick 5–120 s.
    const ctx = await setup({ gameFormat: 'race', configure: (room) => { room.questionSeconds = 1; } });
    const [ada] = ctx.socks;
    try {
        const started = waitFor(ctx.host, 'live:game-started');
        const firstQ = waitFor(ada, 'live:your-question');
        ctx.host.emit('live:start-game');
        assert.equal((await started).questionTimeSec, 1);
        const q1 = await firstQ;
        assert.equal(q1.timeLimitSec, 1);
        assert.ok(q1.timeLeftMs > 0 && q1.timeLeftMs <= 1000);
        const adaPlayer = ctx.room.players.get(ctx.joined[0].player.id);
        const firstTerm = adaPlayer.terms[0].term;
        const feed = waitFor(ctx.host, 'live:host-answer', (d) => d.timedOut);
        const result = await waitFor(ada, 'live:answer-result');
        assert.equal(result.timedOut, true);
        assert.equal(result.reset, false);
        assert.equal(result.progress, 0);
        assert.equal(result.correctTerm, firstTerm);
        assert.ok(result.nextQuestion.questionId > q1.questionId);
        assert.notEqual(adaPlayer.terms[0].term, firstTerm);
        assert.equal((await feed).timedOut, true);
        // An answer sent for the expired question is refused instead of being marked wrong.
        const err = waitFor(ada, 'live:error');
        ada.emit('live:submit-answer', { text: firstTerm, questionId: q1.questionId });
        assert.match((await err).error, /Time's up/);
        assert.equal(adaPlayer.termIndex, 0);
        assert.ok(!adaPlayer.pendingChallenge);
        // The current question still scores normally.
        const ok = waitFor(ada, 'live:answer-result');
        ada.emit('live:submit-answer', { text: adaPlayer.terms[0].term, questionId: result.nextQuestion.questionId });
        const good = await ok;
        assert.equal(good.correct, true);
        assert.equal(good.progress, 1);
    } finally {
        await ctx.close();
    }
});

test('solo race: the clock pauses while a wrong answer waits for Challenge / Continue', async () => {
    const ctx = await setup({ gameFormat: 'race', answerMode: 'realise', configure: (room) => { room.questionSeconds = 1; } });
    const [ada] = ctx.socks;
    try {
        const firstQ = waitFor(ada, 'live:your-question');
        ctx.host.emit('live:start-game');
        const q1 = await firstQ;
        const wrong = waitFor(ada, 'live:answer-result');
        ada.emit('live:submit-answer', { text: 'nope', questionId: q1.questionId });
        assert.equal((await wrong).challengeable, true);
        let timedOut = false;
        const onResult = (r) => { if (r.timedOut) timedOut = true; };
        ada.on('live:answer-result', onResult);
        await new Promise((r) => setTimeout(r, 1600));
        ada.off('live:answer-result', onResult);
        assert.equal(timedOut, false);
        assert.ok(ctx.room.players.get(ctx.joined[0].player.id).pendingChallenge);
    } finally {
        await ctx.close();
    }
});

test('Hot Spark: time out passes the spark and brings a new question', async () => {
    const ctx = await setup({
        gameFormat: 'hot-spark-relay',
        names: ['Ada', 'Bea', 'Cal', 'Dee'],
        configure: (room) => { room.questionSeconds = 1; },
    });
    const [ada] = ctx.socks;
    try {
        const firstQ = waitFor(ada, 'live:your-question');
        ctx.host.emit('live:start-game');
        const q1 = await firstQ;
        assert.equal(q1.timeLimitSec, 1);
        const result = await waitFor(ada, 'live:answer-result', (r) => r.timedOut);
        assert.equal(result.progress, 0);
        const q2 = await waitFor(ada, 'live:your-question', (q) => q.questionId > q1.questionId);
        assert.notEqual(q2.relay.activePlayerId, q1.relay.activePlayerId);
        assert.ok(q2.timeLeftMs > 0);
    } finally {
        await ctx.close();
    }
});

test('Captain & Crew: time out before the captain submits gives the crew a new question', async () => {
    const ctx = await setup({
        gameFormat: 'captain-crew',
        names: ['Ada', 'Bea', 'Cal', 'Dee'],
        configure: (room) => { room.questionSeconds = 1; },
    });
    const [ada] = ctx.socks;
    try {
        const firstQ = waitFor(ada, 'live:your-question');
        ctx.host.emit('live:start-game');
        const q1 = await firstQ;
        assert.equal(q1.timeLimitSec, 1);
        const result = await waitFor(ada, 'live:answer-result', (r) => r.timedOut);
        assert.equal(result.reset, false);
        const q2 = await waitFor(ada, 'live:your-question', (q) => q.questionId > q1.questionId);
        assert.equal(q2.progress, 0);
        assert.equal(q2.crew.votedCount, 0);
    } finally {
        await ctx.close();
    }
});

test('Lucky Lanterns room uses the host time for the question phase', async () => {
    const ctx = await setup({
        gameFormat: 'lucky-lanterns',
        names: ['Ada', 'Bea'],
        configure: (room) => setRoomSettings(room, { questionSeconds: 45 }),
    });
    try {
        const state = waitFor(ctx.host, 'live:lantern-state', (s) => s.phase === 'question');
        const q = waitFor(ctx.socks[0], 'live:your-question');
        const before = Date.now();
        ctx.host.emit('live:start-game');
        const view = await state;
        assert.equal(view.questionMs, 45_000);
        assert.ok(view.phaseEndsAt - before >= 44_000 && view.phaseEndsAt - before <= 46_000);
        assert.equal((await q).timeLimitSec, 45);
    } finally {
        await ctx.close();
    }
});
