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
    setRoomSettings,
} from './live-game.js';

function once(socket, event) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 4000);
        socket.once(event, (payload) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });
}

function waitFor(socket, event, predicate) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(event, onEvent);
            reject(new Error(`Timed out waiting for ${event}`));
        }, 4000);
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

test('Lucky Lanterns runs a question, challenge, pick, reveal, and finish', async () => {
    const httpServer = createServer();
    const io = new Server(httpServer);
    initLiveGame(io);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const port = httpServer.address().port;
    const url = `http://127.0.0.1:${port}`;

    const room = createRoom('host-1', {
        deck: DECK,
        level: 'beginner',
        answerMode: 'realise',
        gameFormat: 'lucky-lanterns',
        lanternRounds: 3,
    });
    setRoomSettings(room, { gameFormat: 'lucky-lanterns', answerMode: 'realise', lanternRounds: 3 });

    const ada = joinRoom(room.code, 'Ada', '10.0.0.1');
    const bea = joinRoom(room.code, 'Bea', '10.0.0.2');
    const cam = joinRoom(room.code, 'Cam', '10.0.0.3');
    const host = ioClient(url, { transports: ['websocket'] });
    const adaSock = ioClient(url, { transports: ['websocket'] });
    const beaSock = ioClient(url, { transports: ['websocket'] });
    const camSock = ioClient(url, { transports: ['websocket'] });

    try {
        await Promise.all([host, adaSock, beaSock, camSock].map((sock) => once(sock, 'connect')));
        host.emit('live:host-join', { code: room.code, hostToken: room.hostToken });
        await once(host, 'live:host-joined');
        for (const [sock, joined] of [[adaSock, ada], [beaSock, bea], [camSock, cam]]) {
            sock.emit('live:player-join', {
                code: room.code,
                playerId: joined.player.id,
                playerToken: joined.player.playerToken,
            });
            await once(sock, 'live:player-joined');
        }

        const startedPromise = once(host, 'live:game-started');
        const openingPromise = once(host, 'live:lantern-state');
        const adaQuestionPromise = once(adaSock, 'live:your-question');
        host.emit('live:start-game');
        const started = await startedPromise;
        assert.equal(started.gameFormat, 'lucky-lanterns');
        const opening = await openingPromise;
        assert.equal(opening.phase, 'question');
        assert.equal(opening.inputMode, 'typed');
        assert.equal(opening.round, 1);
        assert.ok(opening.correctTerm);

        const adaQuestion = await adaQuestionPromise;
        assert.equal(adaQuestion.gameFormat, 'lucky-lanterns');
        assert.equal(adaQuestion.inputMode, 'typed');
        assert.equal(adaQuestion.definition, opening.definition);

        const adaWrongPromise = once(adaSock, 'live:answer-result');
        adaSock.emit('live:submit-answer', { text: 'not-the-word' });
        const adaWrong = await adaWrongPromise;
        assert.equal(adaWrong.challengeable, true);
        assert.equal(adaWrong.lantern, true);
        assert.equal(adaWrong.correctTerm, opening.correctTerm);

        beaSock.emit('live:submit-answer', { text: opening.correctTerm });
        camSock.emit('live:submit-answer', { text: opening.correctTerm.toUpperCase() });
        const review = await waitFor(host, 'live:lantern-state', (state) => state.phase === 'review');
        assert.equal(review.correctCount, 2);

        const pendingPromise = once(host, 'live:challenge-pending');
        adaSock.emit('live:challenge-answer');
        const pending = await pendingPromise;
        assert.equal(pending.answerText, 'not-the-word');
        assert.equal(pending.correctTerm, opening.correctTerm);
        assert.equal(review.phase, 'review');

        host.emit('live:resolve-challenge', { challengeId: pending.id, accept: true });
        const picking = await waitFor(host, 'live:lantern-state', (state) => state.phase === 'picking');
        assert.equal(picking.correctCount, 3);
        assert.equal(picking.phaseEndsAt == null, false);

        adaSock.emit('live:lantern-pick', { pick: 'safe' });
        beaSock.emit('live:lantern-pick', { pick: 'safe' });
        camSock.emit('live:lantern-pick', { pick: 'safe' });
        const reveal = await waitFor(host, 'live:lantern-state', (state) => state.phase === 'reveal');
        assert.equal(reveal.reveal.steps.length, 3);
        assert.ok(reveal.reveal.steps.every((step) => step.group === 'safe' && step.delta === 100));
        assert.ok(reveal.finalLeaderboard.every((row) => row.score === 100));

        const adaReveal = await waitFor(adaSock, 'live:lantern-state', (state) => state.phase === 'reveal');
        assert.equal(adaReveal.correctTerm, undefined);
        assert.equal(adaReveal.you.result.finalScore, 100);

        host.emit('live:lantern-next');
        const round2 = await waitFor(host, 'live:lantern-state', (state) => state.phase === 'question' && state.round === 2);
        assert.equal(round2.leaderboard.every((row) => row.score === 100), true);

        // Nobody answered round 2: skipping the question jumps straight to the board (no empty pick window).
        host.emit('live:lantern-skip');
        const emptyReveal = await waitFor(host, 'live:lantern-state', (state) => state.phase !== 'question' && state.round === 2);
        assert.equal(emptyReveal.phase, 'reveal');
        assert.equal(emptyReveal.reveal.steps.length, 0);
        host.emit('live:lantern-next');
        const finalRound = await waitFor(host, 'live:lantern-state', (state) => state.phase === 'question' && state.round === 3);
        assert.equal(finalRound.isFinal, true);

        beaSock.emit('live:submit-answer', { text: finalRound.correctTerm });
        host.emit('live:lantern-skip');
        const finalPick = await waitFor(host, 'live:lantern-state', (state) => state.phase === 'picking' && state.isFinal);
        assert.equal(finalPick.correctCount, 1);
        beaSock.emit('live:lantern-pick', { pick: 'allin' });
        const allIn = await waitFor(host, 'live:lantern-state', (state) => state.phase === 'reveal' && state.isFinal);
        assert.equal(allIn.reveal.steps.some((step) => step.group === 'allin'), true);

        host.emit('live:lantern-next');
        const finished = await once(host, 'live:game-finished');
        assert.equal(finished.lantern, true);
        assert.equal(finished.gameFormat, 'lucky-lanterns');
        assert.ok(finished.winnerNickname);
        assert.equal(finished.players.length, 3);
        assert.ok(finished.players.every((row) => row.score >= 0));
    } finally {
        host.close();
        adaSock.close();
        beaSock.close();
        camSock.close();
        destroyRoom(room.code, room.hostToken);
        await new Promise((resolve) => io.close(resolve));
        await new Promise((resolve) => httpServer.close(resolve));
    }
});

test('a solo race room still marks a wrong typed answer as challengeable', async () => {
    const httpServer = createServer();
    const io = new Server(httpServer);
    initLiveGame(io);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const port = httpServer.address().port;
    const url = `http://127.0.0.1:${port}`;
    const room = createRoom('host-2', {
        deck: DECK,
        answerMode: 'realise',
        gameFormat: 'race',
    });
    const ada = joinRoom(room.code, 'Ada', '10.1.0.1');
    const bea = joinRoom(room.code, 'Bea', '10.1.0.2');
    const host = ioClient(url, { transports: ['websocket'] });
    const adaSock = ioClient(url, { transports: ['websocket'] });
    const beaSock = ioClient(url, { transports: ['websocket'] });
    try {
        await Promise.all([host, adaSock, beaSock].map((sock) => once(sock, 'connect')));
        host.emit('live:host-join', { code: room.code, hostToken: room.hostToken });
        await once(host, 'live:host-joined');
        adaSock.emit('live:player-join', { code: room.code, playerId: ada.player.id, playerToken: ada.player.playerToken });
        beaSock.emit('live:player-join', { code: room.code, playerId: bea.player.id, playerToken: bea.player.playerToken });
        await once(adaSock, 'live:player-joined');
        await once(beaSock, 'live:player-joined');
        const questionPromise = once(adaSock, 'live:your-question');
        const resultPromise = once(adaSock, 'live:answer-result');
        host.emit('live:start-game');
        await questionPromise;
        adaSock.emit('live:submit-answer', { text: 'nope' });
        const result = await resultPromise;
        assert.equal(result.challengeable, true);
        assert.equal(result.lantern, undefined);
        assert.equal(result.gameFormat, undefined);
        const pendingPromise = once(host, 'live:challenge-pending');
        adaSock.emit('live:challenge-answer');
        const pending = await pendingPromise;
        assert.equal(pending.answerText, 'nope');
        assert.ok(pending.correctTerm);
    } finally {
        host.close();
        adaSock.close();
        beaSock.close();
        destroyRoom(room.code, room.hostToken);
        await new Promise((resolve) => io.close(resolve));
        await new Promise((resolve) => httpServer.close(resolve));
    }
});

test('a player who lets the timer run out gets a wrong-answer "time\'s up" result (timer and host skip)', async () => {
    const httpServer = createServer();
    const io = new Server(httpServer);
    initLiveGame(io);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${httpServer.address().port}`;
    const room = createRoom('host-3', { deck: DECK, answerMode: 'realise', gameFormat: 'lucky-lanterns', lanternRounds: 3 });
    setRoomSettings(room, { gameFormat: 'lucky-lanterns', answerMode: 'realise', lanternRounds: 3 });
    room.questionSeconds = 1; // test-only: below the 5 s UI minimum so the real timer fires fast
    const ada = joinRoom(room.code, 'Ada', '10.3.0.1');
    const bea = joinRoom(room.code, 'Bea', '10.3.0.2');
    const host = ioClient(url, { transports: ['websocket'] });
    const adaSock = ioClient(url, { transports: ['websocket'] });
    const beaSock = ioClient(url, { transports: ['websocket'] });
    try {
        await Promise.all([host, adaSock, beaSock].map((sock) => once(sock, 'connect')));
        host.emit('live:host-join', { code: room.code, hostToken: room.hostToken });
        await once(host, 'live:host-joined');
        for (const [sock, joined] of [[adaSock, ada], [beaSock, bea]]) {
            sock.emit('live:player-join', { code: room.code, playerId: joined.player.id, playerToken: joined.player.playerToken });
            await once(sock, 'live:player-joined');
        }
        const opening = waitFor(host, 'live:lantern-state', (s) => s.phase === 'question');
        host.emit('live:start-game');
        const q1 = await opening;

        // Round 1 (long tutorial grace): Ada answers, the host skips the question -> Bea counts as wrong.
        const adaRes = once(adaSock, 'live:answer-result');
        adaSock.emit('live:submit-answer', { text: q1.correctTerm });
        assert.equal((await adaRes).correct, true);
        const skipRes = once(beaSock, 'live:answer-result');
        host.emit('live:lantern-skip');
        const skipped = await skipRes;
        assert.equal(skipped.timedOut, true);
        assert.equal(skipped.correct, false);
        assert.equal(skipped.challengeable, false);
        assert.equal(skipped.correctTerm, q1.correctTerm);
        await waitFor(host, 'live:lantern-state', (s) => s.phase === 'picking');
        adaSock.emit('live:lantern-pick', { pick: 'safe' });
        await waitFor(host, 'live:lantern-state', (s) => s.phase === 'reveal');
        const round2 = waitFor(host, 'live:lantern-state', (s) => s.phase === 'question' && s.round === 2);
        host.emit('live:lantern-skip');
        const q2 = await round2;

        // Round 2: the real 1 s timer runs out on Bea.
        const beaRes = once(beaSock, 'live:answer-result');
        const beaState = waitFor(beaSock, 'live:lantern-state', (s) => s.round === 2 && s.phase !== 'question');
        adaSock.emit('live:submit-answer', { text: q2.correctTerm });
        const timedOut = await beaRes;
        assert.equal(timedOut.timedOut, true);
        assert.equal(timedOut.correct, false);
        assert.equal(timedOut.eligible, false);
        assert.equal(timedOut.challengeable, false);
        assert.equal(timedOut.answerText, '');
        assert.equal(timedOut.correctTerm, q2.correctTerm);
        assert.equal(timedOut.lantern, true);
        const state = await beaState;
        assert.equal(state.phase, 'picking', 'the timed-out player does not hold the round');
        assert.equal(state.you.status, 'out');
        assert.equal(state.you.decision, 'wrong');
        assert.equal(state.you.timedOut, true);
        assert.equal(state.you.correctTerm, q2.correctTerm);
        // A blank answer cannot be challenged, and earns no lantern.
        const challengeErr = once(beaSock, 'live:error');
        beaSock.emit('live:challenge-answer');
        assert.ok((await challengeErr).error);
        const pickErr = once(beaSock, 'live:error');
        beaSock.emit('live:lantern-pick', { pick: 'safe' });
        assert.ok((await pickErr).error);
    } finally {
        clearTimeout(room.lanternTimer);
        host.close();
        adaSock.close();
        beaSock.close();
        destroyRoom(room.code, room.hostToken);
        await new Promise((resolve) => io.close(resolve));
        await new Promise((resolve) => httpServer.close(resolve));
    }
});
