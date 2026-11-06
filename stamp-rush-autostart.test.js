import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import {
    createRoom,
    destroyRoom,
    getRoom,
    initLiveGame,
    joinRoom,
    publicRoomSnapshot,
    setRoomSettings,
    hostDisconnectGraceMs,
} from './live-game.js';

const DECK = [
    'school', 'bakery', 'garden', 'harbour', 'library', 'kitchen',
    'market', 'station', 'museum', 'bridge', 'castle', 'island',
].map((term) => ({ term, definition: `def ${term}` }));

function waitFor(socket, event, predicate = () => true, ms = 8000) {
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

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

test('selecting Stamp Rush stays in lobby and does not emit stamp-preparing / game-started', async () => {
    const httpServer = createServer();
    const io = new Server(httpServer);
    initLiveGame(io, {});
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${httpServer.address().port}`;
    const room = createRoom('host-as', { deck: DECK, gameFormat: 'race' });
    joinRoom(room.code, 'Ann', '10.20.0.1');
    const host = ioClient(url, { transports: ['websocket'] });
    const events = [];
    try {
        await waitFor(host, 'connect');
        for (const ev of ['live:stamp-preparing', 'live:game-started', 'live:stamp-state', 'live:settings-updated']) {
            host.on(ev, (payload) => events.push({ ev, phase: payload?.phase, gameFormat: payload?.gameFormat || payload?.snapshot?.gameFormat }));
        }
        host.emit('live:host-join', { code: room.code, hostToken: room.hostToken });
        await waitFor(host, 'live:host-joined');
        host.emit('live:set-settings', { gameFormat: 'stamp-rush', answerMode: 'randomise', settingsSeq: 1 });
        await waitFor(host, 'live:settings-updated', (p) => p?.gameFormat === 'stamp-rush');
        await sleep(80); // let lobby pre-gen schedule + any mistaken emits settle
        assert.equal(room.phase, 'lobby', 'room stays in lobby');
        assert.equal(publicRoomSnapshot(room).gameFormat, 'stamp-rush');
        assert.equal(room.stamp, null, 'no stamp match until Start');
        assert.ok(!events.some((e) => e.ev === 'live:game-started'), 'must not auto-start');
        assert.ok(!events.some((e) => e.ev === 'live:stamp-preparing'), 'lobby pre-gen must be silent (no preparing UI)');
        assert.ok(!events.some((e) => e.ev === 'live:stamp-state'), 'no stamp board state in lobby');
    } finally {
        host.close();
        destroyRoom(room.code, room.hostToken);
        await new Promise((r) => io.close(r));
        await new Promise((r) => httpServer.close(r));
    }
});

test('host disconnect destroys the room after grace; reconnect within grace keeps it', async () => {
    process.env.LIVE_HOST_DISCONNECT_GRACE_MS = '600';
    assert.equal(hostDisconnectGraceMs(), 600);

    const httpServer = createServer();
    const io = new Server(httpServer);
    initLiveGame(io);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${httpServer.address().port}`;

    // Reconnect within grace
    {
        const room = createRoom('host-rc', { deck: DECK, gameFormat: 'stamp-rush' });
        const code = room.code;
        const token = room.hostToken;
        const host = ioClient(url, { transports: ['websocket'] });
        await waitFor(host, 'connect');
        host.emit('live:host-join', { code, hostToken: token });
        await waitFor(host, 'live:host-joined');
        host.close();
        await sleep(200);
        assert.ok(getRoom(code), 'room still alive during grace');
        const host2 = ioClient(url, { transports: ['websocket'] });
        await waitFor(host2, 'connect');
        host2.emit('live:host-join', { code, hostToken: token });
        await waitFor(host2, 'live:host-joined');
        await sleep(700);
        assert.ok(getRoom(code), 'room kept after host reconnected within grace');
        host2.close();
        destroyRoom(code, token);
    }

    // No reconnect → destroyed
    {
        const room = createRoom('host-gone', { deck: DECK, gameFormat: 'lucky-lanterns' });
        const code = room.code;
        const token = room.hostToken;
        const host = ioClient(url, { transports: ['websocket'] });
        await waitFor(host, 'connect');
        host.emit('live:host-join', { code, hostToken: token });
        await waitFor(host, 'live:host-joined');
        host.close();
        await sleep(900);
        assert.equal(getRoom(code), null, 'room destroyed after grace with no host return');
        // token no longer needed
        destroyRoom(code, token);
    }

    delete process.env.LIVE_HOST_DISCONNECT_GRACE_MS;
    await new Promise((r) => io.close(r));
    await new Promise((r) => httpServer.close(r));
});

test('live:close-room destroys immediately for any format', async () => {
    const httpServer = createServer();
    const io = new Server(httpServer);
    initLiveGame(io);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${httpServer.address().port}`;
    for (const gameFormat of ['race', 'stamp-rush', 'lucky-lanterns', 'word-cannon']) {
        const room = createRoom(`h-${gameFormat}`, { deck: DECK, gameFormat });
        const code = room.code;
        const host = ioClient(url, { transports: ['websocket'] });
        await waitFor(host, 'connect');
        host.emit('live:host-join', { code, hostToken: room.hostToken });
        await waitFor(host, 'live:host-joined');
        const closed = waitFor(host, 'live:room-closed');
        host.emit('live:close-room');
        await closed;
        assert.equal(getRoom(code), null, `${gameFormat} room destroyed on close`);
        host.close();
    }
    await new Promise((r) => io.close(r));
    await new Promise((r) => httpServer.close(r));
});
