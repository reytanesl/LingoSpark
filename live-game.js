import crypto from 'crypto';
import {
    loadBuiltinDeck,
    matchesTermAnswer,
    parseGlossaryTerms,
    sanitizeAnswerText,
    shuffleDeck,
} from './vocab-quiz-utils.js';

export const LIVE_TERMS_TO_WIN = 12;
export const LIVE_MIN_PLAYERS = 2;
const MAX_PLAYERS = 40;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const JOIN_RATE_WINDOW_MS = 60_000;
const JOIN_RATE_MAX = 30;

/** @type {Map<string, object>} */
const rooms = new Map();
/** @type {Map<string, { count: number, resetAt: number }>} */
const joinRateByIp = new Map();

function randomToken() {
    return crypto.randomBytes(16).toString('hex');
}

function generateCode() {
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (rooms.has(code)) return generateCode();
    return code;
}

function touchRoom(room) {
    room.lastActivityAt = Date.now();
}

export function sanitizeNickname(raw) {
    const cleaned = String(raw || '')
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, 20);
    if (cleaned.length < 2) return null;
    return cleaned;
}

function checkJoinRate(ip) {
    const now = Date.now();
    const entry = joinRateByIp.get(ip);
    if (!entry || now > entry.resetAt) {
        joinRateByIp.set(ip, { count: 1, resetAt: now + JOIN_RATE_WINDOW_MS });
        return true;
    }
    entry.count++;
    return entry.count <= JOIN_RATE_MAX;
}

function playerProgress(player) {
    return {
        id: player.id,
        nickname: player.nickname,
        progress: player.termIndex,
        termsToWin: LIVE_TERMS_TO_WIN,
        finished: Boolean(player.finished),
        connected: Boolean(player.socketId),
    };
}

function playerList(room) {
    return Array.from(room.players.values()).map((p) => playerProgress(p));
}

function progressSnapshot(room) {
    return {
        players: playerList(room),
        termsToWin: LIVE_TERMS_TO_WIN,
        phase: room.phase,
        winnerId: room.winnerId,
        winnerNickname: room.winnerNickname,
    };
}

export function publicRoomSnapshot(room) {
    return {
        code: room.code,
        phase: room.phase,
        playerCount: room.players.size,
        termsToWin: LIVE_TERMS_TO_WIN,
        minPlayers: LIVE_MIN_PLAYERS,
        canStart: room.phase === 'lobby' && room.players.size >= LIVE_MIN_PLAYERS,
        winnerId: room.winnerId,
        winnerNickname: room.winnerNickname,
        players: playerList(room),
    };
}

function playerQuestionPayload(player) {
    const entry = player.terms[player.termIndex];
    if (!entry) return null;
    return {
        progress: player.termIndex,
        termsToWin: LIVE_TERMS_TO_WIN,
        termIndex: player.termIndex,
        definition: entry.definition,
        inputMode: 'typed',
        caseSensitive: false,
    };
}

function hostQuestionPayload(player) {
    const q = playerQuestionPayload(player);
    if (!q) return null;
    const entry = player.terms[player.termIndex];
    return { ...q, playerId: player.id, nickname: player.nickname, correctTerm: entry.term };
}

function emitProgress(io, room) {
    const payload = progressSnapshot(room);
    io.to(`room:${room.code}`).emit('live:progress-update', payload);
    if (room.hostSocketId) {
        io.to(room.hostSocketId).emit('live:progress-update', payload);
    }
}

function finishGame(room, winnerPlayer) {
    room.phase = 'finished';
    room.finishedAt = Date.now();
    room.winnerId = winnerPlayer.id;
    room.winnerNickname = winnerPlayer.nickname;
    winnerPlayer.finished = true;
}

function gameFinishedPayload(room) {
    return {
        winnerId: room.winnerId,
        winnerNickname: room.winnerNickname,
        termsToWin: LIVE_TERMS_TO_WIN,
        players: playerList(room).sort((a, b) => b.progress - a.progress || a.nickname.localeCompare(b.nickname)),
    };
}

export function buildDeckFromRequest(body) {
    const source = body.source || 'builtin';
    if (source === 'builtin') {
        const level = body.level || 'intermediate';
        return { deck: loadBuiltinDeck(level), level };
    }
    if (source === 'paste') {
        const deck = parseGlossaryTerms(body.terms || body.glossary || '');
        return { deck, level: body.level || 'intermediate' };
    }
    if (source === 'wordset' && Array.isArray(body.items)) {
        const deck = body.items
            .map((item) => ({
                term: String(item.term || '').trim(),
                definition: String(item.definition || item.def || '').trim(),
            }))
            .filter((d) => d.term && d.definition);
        return { deck, level: body.level || 'intermediate' };
    }
    throw new Error('Invalid word source.');
}

export function createRoom(hostUserId, { deck, level }) {
    if (!deck || deck.length < LIVE_TERMS_TO_WIN) {
        throw new Error(`At least ${LIVE_TERMS_TO_WIN} terms with definitions are required.`);
    }
    const code = generateCode();
    const room = {
        code,
        hostUserId,
        hostSocketId: null,
        hostToken: randomToken(),
        phase: 'lobby',
        level: level || 'intermediate',
        masterDeck: shuffleDeck(deck, deck.length),
        players: new Map(),
        winnerId: null,
        winnerNickname: null,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        startedAt: null,
        finishedAt: null,
    };
    rooms.set(code, room);
    return room;
}

export function getRoom(code) {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return null;
    if (Date.now() - room.lastActivityAt > ROOM_TTL_MS) {
        rooms.delete(room.code);
        return null;
    }
    return room;
}

export function joinRoom(code, nickname, ip) {
    if (!checkJoinRate(ip || 'unknown')) {
        throw new Error('Too many join attempts. Please wait a minute.');
    }
    const room = getRoom(code);
    if (!room) throw new Error('Room not found or expired.');
    if (room.phase !== 'lobby') {
        throw new Error('This game has already started.');
    }
    if (room.players.size >= MAX_PLAYERS) throw new Error('Room is full.');
    const clean = sanitizeNickname(nickname);
    if (!clean) throw new Error('Nickname must be 2–20 characters.');

    const playerId = crypto.randomBytes(8).toString('hex');
    const player = {
        id: playerId,
        nickname: clean,
        socketId: null,
        playerToken: randomToken(),
        termIndex: 0,
        terms: [],
        finished: false,
        connected: false,
    };
    room.players.set(playerId, player);
    touchRoom(room);
    return { room, player };
}

export function rejoinPlayer(room, playerId, playerToken) {
    const player = room.players.get(playerId);
    if (!player || player.playerToken !== playerToken) return null;
    return player;
}

function assignPlayerTerms(player, masterDeck) {
    player.terms = shuffleDeck(masterDeck, LIVE_TERMS_TO_WIN);
    player.termIndex = 0;
    player.finished = false;
}

function reshufflePlayerTerms(player, masterDeck) {
    assignPlayerTerms(player, masterDeck);
}

function startGame(room) {
    if (room.phase === 'finished') throw new Error('Game has ended.');
    if (room.phase === 'playing') throw new Error('Game is already in progress.');
    if (room.players.size < LIVE_MIN_PLAYERS) {
        throw new Error(`At least ${LIVE_MIN_PLAYERS} players are required to start.`);
    }
    for (const player of room.players.values()) {
        assignPlayerTerms(player, room.masterDeck);
    }
    room.phase = 'playing';
    room.startedAt = Date.now();
    room.winnerId = null;
    room.winnerNickname = null;
    touchRoom(room);
    return true;
}

function submitAnswer(room, playerId, rawText) {
    if (room.phase !== 'playing') throw new Error('The game is not in progress.');
    const player = room.players.get(playerId);
    if (!player) throw new Error('Player not found.');
    if (player.finished) throw new Error('You have already finished.');

    const entry = player.terms[player.termIndex];
    if (!entry) throw new Error('No active question.');

    const answerText = sanitizeAnswerText(rawText);
    if (!answerText) throw new Error('Type an answer first.');

    const correct = matchesTermAnswer(answerText, entry.term);

    if (correct) {
        player.termIndex += 1;
        if (player.termIndex >= LIVE_TERMS_TO_WIN) {
            finishGame(room, player);
            return {
                correct: true,
                reset: false,
                progress: LIVE_TERMS_TO_WIN,
                won: true,
                correctTerm: entry.term,
                answerText,
            };
        }
        return {
            correct: true,
            reset: false,
            progress: player.termIndex,
            won: false,
            correctTerm: entry.term,
            answerText,
            nextQuestion: playerQuestionPayload(player),
        };
    }

    player.termIndex = 0;
    reshufflePlayerTerms(player, room.masterDeck);
    return {
        correct: false,
        reset: true,
        progress: 0,
        won: false,
        correctTerm: entry.term,
        answerText,
        nextQuestion: playerQuestionPayload(player),
    };
}

function endGame(room) {
    room.phase = 'finished';
    room.finishedAt = Date.now();
    touchRoom(room);
}

let liveIo = null;

export function broadcastLobbyUpdate(code) {
    const room = getRoom(code);
    if (!room || !liveIo) return;
    const progress = progressSnapshot(room);
    const snapshot = publicRoomSnapshot(room);
    liveIo.to(`room:${room.code}`).emit('live:progress-update', progress);
    liveIo.to(`room:${room.code}`).emit('live:room-state', snapshot);
    if (room.hostSocketId) {
        liveIo.to(room.hostSocketId).emit('live:progress-update', progress);
        liveIo.to(room.hostSocketId).emit('live:room-state', snapshot);
    }
}

export function initLiveGame(io, { onGameEnd } = {}) {
    liveIo = io;
    setInterval(() => {
        const now = Date.now();
        for (const [code, room] of rooms) {
            if (now - room.lastActivityAt > ROOM_TTL_MS) rooms.delete(code);
        }
        for (const [ip, entry] of joinRateByIp) {
            if (now > entry.resetAt) joinRateByIp.delete(ip);
        }
    }, 5 * 60_000);

    io.on('connection', (socket) => {
        socket.on('live:host-join', ({ code, hostToken }) => {
            const room = getRoom(code);
            if (!room || room.hostToken !== hostToken) {
                socket.emit('live:error', { error: 'Invalid host credentials.' });
                return;
            }
            room.hostSocketId = socket.id;
            room._io = io;
            socket.join(`room:${room.code}`);
            socket.data.liveRole = 'host';
            socket.data.roomCode = room.code;
            socket.emit('live:host-joined', {
                snapshot: publicRoomSnapshot(room),
                progress: progressSnapshot(room),
            });
        });

        socket.on('live:player-join', ({ code, playerId, playerToken }) => {
            const room = getRoom(code);
            if (!room) {
                socket.emit('live:error', { error: 'Room not found.' });
                return;
            }
            const player = rejoinPlayer(room, playerId, playerToken);
            if (!player) {
                socket.emit('live:error', { error: 'Invalid player session.' });
                return;
            }
            player.socketId = socket.id;
            player.connected = true;
            socket.join(`room:${room.code}`);
            socket.data.liveRole = 'player';
            socket.data.roomCode = room.code;
            socket.data.playerId = playerId;

            const payload = {
                snapshot: publicRoomSnapshot(room),
                player: playerProgress(player),
                progress: progressSnapshot(room),
                phase: room.phase,
            };
            if (room.phase === 'playing') {
                payload.question = playerQuestionPayload(player);
            }
            socket.emit('live:player-joined', payload);

            broadcastLobbyUpdate(room.code);
        });

        socket.on('live:start-game', () => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'host' || socket.id !== room.hostSocketId) {
                socket.emit('live:error', { error: 'Host only.' });
                return;
            }
            try {
                startGame(room);
                const progress = progressSnapshot(room);
                io.to(`room:${room.code}`).emit('live:game-started', {
                    termsToWin: LIVE_TERMS_TO_WIN,
                    minPlayers: LIVE_MIN_PLAYERS,
                    progress,
                });
                for (const player of room.players.values()) {
                    if (!player.socketId) continue;
                    io.to(player.socketId).emit('live:your-question', playerQuestionPayload(player));
                }
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:submit-answer', ({ text, answer }) => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'player') {
                socket.emit('live:error', { error: 'Players only.' });
                return;
            }
            try {
                const result = submitAnswer(room, socket.data.playerId, text ?? answer);
                socket.emit('live:answer-result', result);

                if (result.won) {
                    const finished = gameFinishedPayload(room);
                    io.to(`room:${room.code}`).emit('live:game-finished', finished);
                    if (onGameEnd) onGameEnd(room);
                    return;
                }

                if (result.nextQuestion) {
                    socket.emit('live:your-question', result.nextQuestion);
                }
                emitProgress(io, room);
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:end-game', () => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'host' || socket.id !== room.hostSocketId) {
                socket.emit('live:error', { error: 'Host only.' });
                return;
            }
            endGame(room);
            io.to(`room:${room.code}`).emit('live:game-finished', gameFinishedPayload(room));
            if (onGameEnd) onGameEnd(room);
        });

        socket.on('disconnect', () => {
            const code = socket.data.roomCode;
            if (!code) return;
            const room = getRoom(code);
            if (!room) return;
            if (socket.data.liveRole === 'host' && room.hostSocketId === socket.id) {
                room.hostSocketId = null;
            }
            if (socket.data.liveRole === 'player') {
                const player = room.players.get(socket.data.playerId);
                if (player && player.socketId === socket.id) {
                    player.socketId = null;
                    player.connected = false;
                    emitProgress(io, room);
                }
            }
        });
    });
}
