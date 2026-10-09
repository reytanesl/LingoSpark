import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import './live-entry.js';
import {
    LIVE_AVATARS,
    createRoom,
    destroyRoom,
    initLiveGame,
    joinRoom,
    lookupRoom,
    normalizeRoomCode,
    publicRoomSnapshot,
    registerLiveLookupRoute,
    resetLiveRateLimits,
    sanitizeAvatar,
    sanitizeHostName,
    setRoomSettings,
} from './live-game.js';
import { LANTERN_AVATARS, createLanternMatch, leaderboardRows } from './lucky-lanterns.js';

const C = globalThis.LiveEntryCode;

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

function once(socket, event) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 4000);
        socket.once(event, (payload) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });
}

/* ---------------- code input (client helpers) ---------------- */

test('code boxes: typing fills forward, uppercases, ignores non-letters and auto-advances', () => {
    let s = C.fillFrom(['', '', '', ''], 0, 'k');
    assert.deepEqual(s.chars, ['K', '', '', '']);
    assert.equal(s.focus, 1);
    s = C.fillFrom(s.chars, 1, '7');
    assert.deepEqual(s.chars, ['K', '', '', ''], 'digits are ignored');
    assert.equal(s.focus, 1);
    s = C.fillFrom(s.chars, 1, 't');
    s = C.fillFrom(s.chars, 2, 'J');
    s = C.fillFrom(s.chars, 3, 'w');
    assert.deepEqual(s.chars, ['K', 'T', 'J', 'W']);
    assert.equal(s.focus, 3, 'caret stays on the last box');
    assert.equal(C.codeFromChars(s.chars), 'KTJW');
    assert.ok(C.isComplete(s.chars));
    assert.ok(!C.isComplete(['K', 'T', '', 'W']));
});

test('code boxes: pasting a full code (any case, with spaces/dashes) fills every box from the first', () => {
    const s = C.fillFrom(['', '', 'X', ''], 2, ' kt-jw \n');
    assert.deepEqual(s.chars, ['K', 'T', 'J', 'W']);
    assert.equal(C.normalizeCode('https://x/#/live/join?code=abcd'), 'HTTP', 'normalizeCode keeps letters only, max 4');
    assert.equal(C.normalizeCode('k t j w z'), 'KTJW');
    const partial = C.fillFrom(['K', '', '', ''], 1, 'tj');
    assert.deepEqual(partial.chars, ['K', 'T', 'J', '']);
    assert.equal(partial.focus, 3);
});

test('code boxes: backspace clears the box, then steps back into the previous one', () => {
    let s = C.backspace(['K', 'T', 'J', 'W'], 3);
    assert.deepEqual(s.chars, ['K', 'T', 'J', '']);
    assert.equal(s.focus, 3);
    s = C.backspace(s.chars, 3);
    assert.deepEqual(s.chars, ['K', 'T', '', '']);
    assert.equal(s.focus, 2);
    s = C.backspace(['', '', '', ''], 0);
    assert.deepEqual(s.chars, ['', '', '', '']);
    assert.equal(s.focus, 0);
});

test('join button label follows the form state', () => {
    assert.deepEqual(C.joinButtonState({ code: 'KT' }), { enabled: false, label: 'Enter the room code to join' });
    assert.deepEqual(C.joinButtonState({ code: 'ZZQX', lookup: { status: 'missing' }, name: 'Maya' }), { enabled: false, label: 'Fix the room code' });
    assert.equal(C.joinButtonState({ code: 'KTJW', lookup: { status: 'checking' }, name: 'Maya' }).enabled, false);
    assert.deepEqual(C.joinButtonState({ code: 'KTJW', lookup: { status: 'found', phase: 'lobby' }, name: ' ' }), { enabled: false, label: 'Type your name to join' });
    assert.deepEqual(
        C.joinButtonState({ code: 'KTJW', lookup: { status: 'found', phase: 'lobby' }, name: 'Maya', avatar: '🦊' }),
        { enabled: true, label: 'Join as Maya', avatar: '🦊' },
    );
    assert.equal(C.joinButtonState({ code: 'KTJW', lookup: { status: 'found', phase: 'playing' }, name: 'Maya' }).label, 'Rejoin as Maya');
    // Lookup failed (offline / rate limited): let the server decide on Join.
    assert.equal(C.joinButtonState({ code: 'KTJW', lookup: { status: 'unknown' }, name: 'Maya' }).enabled, true);
    assert.equal(C.joinButtonState({ code: 'KTJW', lookup: { status: 'found' }, name: 'Maya', avatar: '<b>' }).avatar, '');
});

test('room hints read like the design', () => {
    assert.equal(C.lookupHint('ZZQX', { exists: false }).text, "We can't find room ZZQX. Check the code on the board — it may have ended.");
    assert.equal(C.lookupHint('KTJW', { exists: true, phase: 'lobby', hostName: 'Ms. Novak', playerCount: 7 }).text, "Room found — Ms. Novak's class · 7 players waiting");
    assert.equal(C.lookupHint('KTJW', { exists: true, phase: 'lobby', hostName: null, playerCount: 1 }).text, 'Room found · 1 player waiting');
    assert.equal(C.lookupHint('KTJW', { exists: true, phase: 'lobby', hostName: 'James', playerCount: 0 }).text, "Room found — James' class · be the first to join!");
    assert.equal(C.lookupHint('KTJW', { exists: true, phase: 'playing', playerCount: 4 }).tone, 'warn');
});

test('every buddy on the join page is accepted by the server and drawable by Lucky Lanterns', () => {
    for (const av of C.AVATARS) {
        assert.ok(LIVE_AVATARS.includes(av), `${av} accepted`);
        assert.ok(LANTERN_AVATARS.includes(av), `${av} drawable`);
    }
});

/* ---------------- lookup endpoint ---------------- */

test('room codes are 4 letters without I/O and normalise like the client', () => {
    resetLiveRateLimits();
    const room = createRoom('host-code', { deck: DECK, level: 'beginner' });
    try {
        assert.match(room.code, /^[A-HJ-NP-Z]{4}$/);
        assert.equal(normalizeRoomCode(` ${room.code.toLowerCase()} `), room.code);
        assert.equal(C.normalizeCode(room.code.toLowerCase()), room.code);
    } finally {
        destroyRoom(room.code, room.hostToken);
    }
});

test('GET /api/live/lookup/:code reports found/missing rooms without leaking secrets, and is rate-limited', async () => {
    resetLiveRateLimits();
    const app = express();
    registerLiveLookupRoute(app);
    const server = createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const room = createRoom('host-lookup', { deck: DECK, level: 'beginner', hostName: 'Ms. Novak <b>x</b> novak@school.pl' });
    try {
        joinRoom(room.code, 'Ada', '10.1.0.1', '🦊');
        joinRoom(room.code, 'Bea', '10.1.0.2');

        let res = await fetch(`${base}/api/live/lookup/${room.code.toLowerCase()}`);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        const found = await res.json();
        assert.deepEqual(found, {
            exists: true,
            code: room.code,
            phase: 'lobby',
            joinable: true,
            full: false,
            hostName: 'Ms. Novak x',
            playerCount: 2,
            gameFormat: 'race',
        });
        const raw = JSON.stringify(found);
        assert.ok(!raw.includes(room.hostToken), 'no host token');
        assert.ok(!raw.includes('Ada'), 'no player names');
        assert.ok(!raw.includes('@'), 'no emails');

        const missingCode = room.code === 'ZZQX' ? 'ZZQY' : 'ZZQX';
        res = await fetch(`${base}/api/live/lookup/${missingCode}`);
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { exists: false, code: missingCode });

        res = await fetch(`${base}/api/live/lookup/IOIO`);
        assert.deepEqual(await res.json(), { exists: false, code: 'IOIO' }, 'I/O never appear in codes');

        let limited = null;
        for (let i = 0; i < 70; i++) {
            res = await fetch(`${base}/api/live/lookup/${room.code}`);
            if (res.status === 429) { limited = await res.json(); break; }
        }
        assert.ok(limited, 'rate limit kicks in');
        assert.match(limited.error, /Too many/);
    } finally {
        destroyRoom(room.code, room.hostToken);
        resetLiveRateLimits();
        await new Promise((resolve) => server.close(resolve));
    }
});

test('lookupRoom marks started games as not joinable (rejoin only)', () => {
    resetLiveRateLimits();
    const room = createRoom('host-phase', { deck: DECK, level: 'beginner' });
    try {
        room.phase = 'playing';
        const res = lookupRoom(room.code, '10.2.0.1');
        assert.equal(res.exists, true);
        assert.equal(res.joinable, false);
        assert.equal(res.hostName, null);
    } finally {
        destroyRoom(room.code, room.hostToken);
    }
});

test('host display names are trimmed and never include an email', () => {
    assert.equal(sanitizeHostName('  Karol   Sęk  '), 'Karol Sęk');
    assert.equal(sanitizeHostName('teacher@local.test'), null);
    assert.equal(sanitizeHostName(''), null);
    assert.equal(sanitizeHostName('x'.repeat(80)).length, 40);
});

/* ---------------- avatar on join ---------------- */

test('joinRoom stores an optional whitelisted buddy and keeps old clients working', () => {
    resetLiveRateLimits();
    const room = createRoom('host-avatar', { deck: DECK, level: 'beginner' });
    try {
        const maya = joinRoom(room.code, 'Maya', '10.3.0.1', '🦊').player;
        const olek = joinRoom(room.code, 'Olek', '10.3.0.2').player; // old client: no avatar field
        const evil = joinRoom(room.code, 'Evil', '10.3.0.3', '<img src=x onerror=alert(1)>').player;
        assert.equal(maya.avatar, '🦊');
        assert.equal(olek.avatar, null);
        assert.equal(evil.avatar, null);
        assert.equal(sanitizeAvatar('🐙'), null, 'only the known set is accepted');

        const snap = publicRoomSnapshot(room);
        const byName = Object.fromEntries(snap.players.map((p) => [p.nickname, p]));
        assert.equal(byName.Maya.avatar, '🦊');
        assert.equal(byName.Olek.avatar, null);

        // Rejoin (seat reclaim) keeps the buddy, or swaps it when a new one is sent.
        maya.socketId = null;
        maya.connected = false;
        const again = joinRoom(room.code, 'maya', '10.3.0.1');
        assert.equal(again.reclaimed, true);
        assert.equal(again.player.avatar, '🦊');
        const swapped = joinRoom(room.code, 'Maya', '10.3.0.1', '🐼');
        assert.equal(swapped.player.avatar, '🐼');
    } finally {
        destroyRoom(room.code, room.hostToken);
    }
});

test('Lucky Lanterns uses the picked buddy and falls back to the old order', () => {
    const match = createLanternMatch({
        players: [
            { id: 'a', nickname: 'Ada', avatar: '🦄' },
            { id: 'b', nickname: 'Bea' },
            { id: 'c', nickname: 'Cam', avatar: 'nope' },
        ],
        deck: DECK,
        rounds: 3,
        seed: 1,
    });
    const rows = Object.fromEntries(leaderboardRows(match).map((r) => [r.id, r.avatar]));
    assert.equal(rows.a, '🦄');
    assert.equal(rows.b, LANTERN_AVATARS[1]);
    assert.equal(rows.c, LANTERN_AVATARS[2]);
});

test('host lobby snapshot over the socket carries each player buddy', async () => {
    resetLiveRateLimits();
    const httpServer = createServer();
    const io = new Server(httpServer);
    initLiveGame(io);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${httpServer.address().port}`;
    const room = createRoom('host-sock', { deck: DECK, level: 'beginner' });
    setRoomSettings(room, { gameFormat: 'race' });
    joinRoom(room.code, 'Maya', '10.4.0.1', '🐸');
    joinRoom(room.code, 'Olek', '10.4.0.2');
    const host = ioClient(url, { transports: ['websocket'] });
    try {
        const joined = once(host, 'live:host-joined');
        host.emit('live:host-join', { code: room.code, hostToken: room.hostToken });
        const { snapshot } = await joined;
        const byName = Object.fromEntries(snapshot.players.map((p) => [p.nickname, p.avatar]));
        assert.deepEqual(byName, { Maya: '🐸', Olek: null });
    } finally {
        host.close();
        destroyRoom(room.code, room.hostToken);
        io.close();
        await new Promise((resolve) => httpServer.close(resolve));
    }
});
