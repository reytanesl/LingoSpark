import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { createRoom, destroyRoom, initLiveGame, joinRoom } from './live-game.js';

const DECK = ['school', 'bakery', 'garden', 'harbour', 'library', 'kitchen', 'market', 'station', 'museum', 'bridge', 'castle', 'island']
    .map((term) => ({ term, definition: `def ${term}` }));

function waitFor(socket, event, ms = 6000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), ms);
        socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
    });
}

async function playOneWrongTypedAnswer(url, challenges) {
    const room = createRoom('host-sr', { deck: DECK, gameFormat: 'stamp-rush', answerMode: 'realise', challenges });
    const joined = joinRoom(room.code, 'Ann', '10.9.0.1');
    const host = ioClient(url, { transports: ['websocket'] });
    const player = ioClient(url, { transports: ['websocket'] });
    try {
        await Promise.all([waitFor(host, 'connect'), waitFor(player, 'connect')]);
        host.emit('live:host-join', { code: room.code, hostToken: room.hostToken });
        await waitFor(host, 'live:host-joined');
        player.emit('live:player-join', { code: room.code, playerId: joined.player.id, playerToken: joined.player.playerToken });
        await waitFor(player, 'live:player-joined');
        const qp = waitFor(player, 'live:your-question');
        host.emit('live:start-game');
        const q = await qp;
        assert.equal(q.inputMode, 'typed');
        const rp = waitFor(player, 'live:answer-result');
        player.emit('live:submit-answer', { text: 'zzz-not-it', questionId: q.questionId });
        const result = await rp;
        assert.equal(result.correct, false);
        let pending = null;
        if (challenges) {
            const pp = waitFor(host, 'live:challenge-pending');
            player.emit('live:challenge-answer');
            pending = await pp;
        } else {
            const ep = waitFor(player, 'live:error');
            player.emit('live:challenge-answer');
            pending = await ep;
        }
        return { result, pending };
    } finally {
        host.close();
        player.close();
        destroyRoom(room.code, room.hostToken);
    }
}

test('Stamp Rush honours the lobby Challenges switch (typed word-formation answers)', async () => {
    const httpServer = createServer();
    const io = new Server(httpServer);
    initLiveGame(io);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${httpServer.address().port}`;
    try {
        const on = await playOneWrongTypedAnswer(url, true);
        assert.equal(on.result.challengeable, true);
        assert.notEqual(on.result.challengesOff, true);
        assert.equal(on.pending.answerText, 'zzz-not-it');
        assert.equal(on.pending.nickname, 'Ann');

        const off = await playOneWrongTypedAnswer(url, false);
        assert.equal(off.result.challengesOff, true, 'phone hides the Ask teacher button');
        assert.equal(off.pending.code, 'challenges_off');
    } finally {
        io.close();
        httpServer.close();
    }
});
