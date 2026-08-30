import crypto from 'crypto';
import {
    buildChoices,
    loadBuiltinDeck,
    matchesTermAnswer,
    parseGlossaryTerms,
    sanitizeAnswerText,
    shuffleDeck,
} from './vocab-quiz-utils.js';

export const LIVE_TERMS_TO_WIN = 12;
export const LIVE_MIN_PLAYERS = 2;
export const LIVE_ANSWER_MODES = ['recognise', 'realise', 'randomise'];
export const LIVE_GAME_FORMATS = ['race', 'captain-crew'];
export const LIVE_TEAM_ASSIGNMENT = ['random', 'pick'];
export const LIVE_TEAM_MIN = 2;
export const LIVE_TEAM_MAX = 4;
export const LIVE_CAPTAIN_CREW_MIN_PLAYERS = 4;

const BRITISH_TEAM_NAMES = [
    'The Rowan Atkinsons',
    'The Benedict Cumberbatches',
    'The David Beckhams',
    'The Kate Bushes',
    'The Elton Johns',
    'The Freddie Mercurys',
    'The David Bowies',
    'The Emma Watsons',
    'The Daniel Radcliffes',
    'The Tom Hollands',
    'The Idris Elbas',
    'The Helen Mirrens',
    'The Judi Denchs',
    'The Mick Jaggers',
    'The Paul McCartneys',
    'The Ed Sheerans',
    'The Adeles',
    'The Harry Styleses',
    'The James Bonds',
    'The Mr Beans',
    'The Doctor Whos',
    'The Sherlock Holmeses',
    'The James Cordens',
    'The Graham Nortons',
];
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

function teamProgress(team, room) {
    const members = team.memberIds
        .map((id) => room.players.get(id))
        .filter(Boolean)
        .map((p) => p.nickname);
    return {
        id: team.id,
        nickname: team.name,
        memberNicknames: members,
        progress: team.termIndex,
        termsToWin: LIVE_TERMS_TO_WIN,
        finished: Boolean(team.finished),
        connected: team.memberIds.some((id) => Boolean(room.players.get(id)?.socketId)),
    };
}

function teamList(room) {
    if (!room.teams) return [];
    return Array.from(room.teams.values()).map((t) => teamProgress(t, room));
}

function raceEntities(room) {
    return isCaptainCrew(room) ? teamList(room) : playerList(room);
}

function minPlayersForRoom(room) {
    if (isCaptainCrew(room)) return LIVE_CAPTAIN_CREW_MIN_PLAYERS;
    return LIVE_MIN_PLAYERS;
}

function normalizeTeamAssignment(mode) {
    const m = String(mode || 'random').toLowerCase();
    return LIVE_TEAM_ASSIGNMENT.includes(m) ? m : 'random';
}

function usedTeamNames(room) {
    return new Set(Array.from(room.teams?.values() || []).map((t) => t.name));
}

function pickTeamName(room) {
    const used = usedTeamNames(room);
    const available = BRITISH_TEAM_NAMES.filter((n) => !used.has(n));
    const pool = available.length ? available : BRITISH_TEAM_NAMES;
    return pool[Math.floor(Math.random() * pool.length)];
}

function computeTeamSizes(playerCount) {
    if (playerCount < LIVE_CAPTAIN_CREW_MIN_PLAYERS) {
        throw new Error(`At least ${LIVE_CAPTAIN_CREW_MIN_PLAYERS} players are required for team mode.`);
    }
    for (let teamCount = Math.ceil(playerCount / LIVE_TEAM_MAX); teamCount <= Math.floor(playerCount / LIVE_TEAM_MIN); teamCount++) {
        const base = Math.floor(playerCount / teamCount);
        const extra = playerCount % teamCount;
        const sizes = Array.from({ length: teamCount }, (_, i) => base + (i < extra ? 1 : 0));
        if (sizes.every((s) => s >= LIVE_TEAM_MIN && s <= LIVE_TEAM_MAX)) {
            return sizes;
        }
    }
    throw new Error(`Could not form teams of ${LIVE_TEAM_MIN}–${LIVE_TEAM_MAX} players.`);
}

function createEmptyTeam(room, memberIds = []) {
    const teamId = `team-${crypto.randomBytes(4).toString('hex')}`;
    const team = {
        id: teamId,
        name: pickTeamName(room),
        memberIds: [...memberIds],
        termIndex: 0,
        terms: [],
        finished: false,
        questionForTermIndex: -1,
        questionChoices: null,
        questionId: 0,
        answerLocked: false,
        crewVotes: new Map(),
    };
    room.teams.set(teamId, team);
    for (const memberId of memberIds) {
        const player = room.players.get(memberId);
        if (player) player.teamId = teamId;
    }
    return team;
}

function lobbyTeamSnapshot(team, room) {
    const members = team.memberIds
        .map((id) => room.players.get(id))
        .filter(Boolean);
    return {
        id: team.id,
        name: team.name,
        memberIds: [...team.memberIds],
        memberNicknames: members.map((p) => p.nickname),
        memberCount: team.memberIds.length,
        maxMembers: LIVE_TEAM_MAX,
        canJoin: team.memberIds.length < LIVE_TEAM_MAX,
    };
}

function lobbyTeamsList(room) {
    if (!room.teams) return [];
    return Array.from(room.teams.values()).map((t) => lobbyTeamSnapshot(t, room));
}

function unassignedPlayerList(room) {
    return Array.from(room.players.values())
        .filter((p) => !p.teamId)
        .map((p) => playerProgress(p));
}

function validateTeamsForStart(room) {
    const teams = Array.from(room.teams?.values() || []);
    if (teams.length < 2) {
        return { ok: false, error: 'Need at least 2 teams before starting.' };
    }
    const assigned = new Set();
    for (const team of teams) {
        if (team.memberIds.length < LIVE_TEAM_MIN || team.memberIds.length > LIVE_TEAM_MAX) {
            return { ok: false, error: `Each team needs ${LIVE_TEAM_MIN}–${LIVE_TEAM_MAX} players.` };
        }
        for (const id of team.memberIds) assigned.add(id);
    }
    if (assigned.size !== room.players.size) {
        return { ok: false, error: 'Every player must join a team before starting.' };
    }
    return { ok: true };
}

function canStartRoom(room) {
    if (room.phase !== 'lobby') return false;
    if (!isCaptainCrew(room)) return room.players.size >= LIVE_MIN_PLAYERS;
    if (room.teamAssignment === 'pick') return validateTeamsForStart(room).ok;
    return room.players.size >= LIVE_CAPTAIN_CREW_MIN_PLAYERS;
}

function progressSnapshot(room) {
    return {
        players: raceEntities(room),
        termsToWin: LIVE_TERMS_TO_WIN,
        phase: room.phase,
        winnerId: room.winnerId,
        winnerNickname: room.winnerNickname,
        gameFormat: room.gameFormat,
    };
}

export function publicRoomSnapshot(room) {
    const minPlayers = minPlayersForRoom(room);
    return {
        code: room.code,
        phase: room.phase,
        playerCount: room.players.size,
        termsToWin: LIVE_TERMS_TO_WIN,
        minPlayers,
        canStart: canStartRoom(room),
        winnerId: room.winnerId,
        winnerNickname: room.winnerNickname,
        answerMode: room.answerMode,
        gameFormat: room.gameFormat || 'race',
        teamAssignment: room.teamAssignment || 'random',
        teamMin: LIVE_TEAM_MIN,
        teamMax: LIVE_TEAM_MAX,
        players: playerList(room),
        teams: room.phase === 'lobby' && isCaptainCrew(room) ? lobbyTeamsList(room) : teamList(room),
        unassignedPlayers: room.phase === 'lobby' && isCaptainCrew(room) ? unassignedPlayerList(room) : [],
    };
}

function normalizeAnswerMode(mode) {
    const m = String(mode || 'randomise').toLowerCase();
    return LIVE_ANSWER_MODES.includes(m) ? m : 'randomise';
}

function normalizeGameFormat(format) {
    const f = String(format || 'race').toLowerCase();
    return LIVE_GAME_FORMATS.includes(f) ? f : 'race';
}

function isCaptainCrew(room) {
    return room?.gameFormat === 'captain-crew';
}

function resolveQuestionInputMode(room) {
    const mode = room.answerMode || 'randomise';
    if (mode === 'recognise') return 'choice';
    if (mode === 'realise') return 'typed';
    return Math.random() < 0.5 ? 'choice' : 'typed';
}

function clearPlayerQuestionState(player) {
    player.questionForTermIndex = -1;
    player.questionInputMode = null;
    player.questionChoices = null;
    player.answerLocked = false;
}

function clearTeamQuestionState(team) {
    team.questionForTermIndex = -1;
    team.questionInputMode = null;
    team.questionChoices = null;
    team.answerLocked = false;
    team.crewVotes = new Map();
}

function getPlayerTeam(room, player) {
    if (!player?.teamId || !room.teams) return null;
    return room.teams.get(player.teamId) || null;
}

function currentCaptainId(team) {
    if (!team?.memberIds?.length) return null;
    const idx = team.termIndex % team.memberIds.length;
    return team.memberIds[idx];
}

function majorityVote(team) {
    if (!team.crewVotes || team.crewVotes.size === 0) return null;
    const counts = new Map();
    for (const answer of team.crewVotes.values()) {
        const key = sanitizeAnswerText(answer);
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = null;
    let bestCount = 0;
    for (const [answer, count] of counts) {
        if (count > bestCount) {
            best = answer;
            bestCount = count;
        }
    }
    return best;
}

function crewVotePayload(team, room, viewerPlayerId) {
    const counts = {};
    const memberVotes = {};
    for (const [memberId, answer] of team.crewVotes.entries()) {
        const key = sanitizeAnswerText(answer);
        if (!key) continue;
        counts[key] = (counts[key] || 0) + 1;
        const member = room.players.get(memberId);
        if (member) memberVotes[memberId] = { nickname: member.nickname, answer: key };
    }
    const captainId = currentCaptainId(team);
    return {
        teamId: team.id,
        questionId: team.questionId,
        votes: counts,
        memberVotes,
        captainId,
        captainNickname: room.players.get(captainId)?.nickname || '',
        isCaptain: viewerPlayerId === captainId,
        suggestedAnswer: majorityVote(team),
        votedCount: team.crewVotes.size,
        crewSize: team.memberIds.length,
    };
}

function emitTeamVoteUpdate(io, room, team) {
    for (const memberId of team.memberIds) {
        const member = room.players.get(memberId);
        if (!member?.socketId) continue;
        io.to(member.socketId).emit('live:crew-vote-update', crewVotePayload(team, room, memberId));
    }
}

function ensureTeamQuestionState(team, room) {
    const entry = team.terms[team.termIndex];
    if (!entry || !room) return null;

    if (team.questionForTermIndex !== team.termIndex) {
        team.questionForTermIndex = team.termIndex;
        team.questionInputMode = resolveQuestionInputMode(room);
        team.questionChoices = null;
        team.questionId = (team.questionId || 0) + 1;
        team.crewVotes = new Map();
    }

    if (team.questionInputMode === 'choice' && !team.questionChoices) {
        const termPool = room.masterDeck.map((d) => d.term);
        team.questionChoices = buildChoices(entry.term, termPool, room.level || 'intermediate');
    }

    return entry;
}

function teamQuestionPayload(team, room, player) {
    const entry = ensureTeamQuestionState(team, room);
    if (!entry) return null;
    const captainId = currentCaptainId(team);
    return {
        progress: team.termIndex,
        termsToWin: LIVE_TERMS_TO_WIN,
        termIndex: team.termIndex,
        questionId: team.questionId,
        definition: entry.definition,
        inputMode: team.questionInputMode,
        answerMode: room.answerMode,
        gameFormat: 'captain-crew',
        caseSensitive: false,
        teamId: team.id,
        teamName: team.name,
        captainId,
        captainNickname: room.players.get(captainId)?.nickname || '',
        isCaptain: player.id === captainId,
        crew: crewVotePayload(team, room, player.id),
        ...(team.questionInputMode === 'choice' ? { choices: team.questionChoices } : {}),
    };
}

function ensurePlayerQuestionState(player, room) {
    const entry = player.terms[player.termIndex];
    if (!entry || !room) return null;

    if (player.questionForTermIndex !== player.termIndex) {
        player.questionForTermIndex = player.termIndex;
        player.questionInputMode = resolveQuestionInputMode(room);
        player.questionChoices = null;
        player.questionId = (player.questionId || 0) + 1;
    }

    if (player.questionInputMode === 'choice' && !player.questionChoices) {
        const termPool = room.masterDeck.map((d) => d.term);
        player.questionChoices = buildChoices(entry.term, termPool, room.level || 'intermediate');
    }

    return entry;
}

function playerQuestionPayload(player, room) {
    if (isCaptainCrew(room)) {
        const team = getPlayerTeam(room, player);
        if (!team) return null;
        return teamQuestionPayload(team, room, player);
    }
    const entry = ensurePlayerQuestionState(player, room);
    if (!entry) return null;
    const payload = {
        progress: player.termIndex,
        termsToWin: LIVE_TERMS_TO_WIN,
        termIndex: player.termIndex,
        questionId: player.questionId,
        definition: entry.definition,
        inputMode: player.questionInputMode,
        answerMode: room.answerMode,
        gameFormat: room.gameFormat || 'race',
        caseSensitive: false,
    };
    if (player.questionInputMode === 'choice') {
        payload.choices = player.questionChoices;
    }
    return payload;
}

function hostQuestionPayload(player, room) {
    const q = playerQuestionPayload(player, room);
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

function emitHostAnswerFeed(io, room, entity, result) {
    if (!room.hostSocketId) return;
    const isTeam = Boolean(result.teamId);
    io.to(room.hostSocketId).emit('live:host-answer', {
        playerId: isTeam ? result.teamId : entity.id,
        nickname: isTeam ? entity.name : entity.nickname,
        correct: Boolean(result.correct),
        reset: Boolean(result.reset),
        progress: result.progress,
        won: Boolean(result.won),
        teamId: result.teamId || null,
    });
}

function attachPlayerSocket(socket, room, player) {
    player.socketId = socket.id;
    player.connected = true;
    socket.join(`room:${room.code}`);
    socket.data.liveRole = 'player';
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
}

function emitPlayerSession(socket, room, player) {
    const team = getPlayerTeam(room, player);
    const entityProgress = isCaptainCrew(room) && team
        ? teamProgress(team, room)
        : playerProgress(player);
    const payload = {
        snapshot: publicRoomSnapshot(room),
        player: entityProgress,
        progress: progressSnapshot(room),
        phase: room.phase,
        gameFormat: room.gameFormat || 'race',
        teamId: player.teamId || null,
        teamName: team?.name || null,
        teamAssignment: room.teamAssignment || 'random',
    };
    let question = null;
    if (room.phase === 'playing') {
        question = playerQuestionPayload(player, room);
        payload.question = question;
    }
    socket.emit('live:player-joined', payload);
    if (question) socket.emit('live:your-question', question);
}

async function deliverQuestionsToAllPlayers(io, room) {
    const sockets = await io.in(`room:${room.code}`).fetchSockets();
    const sent = new Set();
    for (const sock of sockets) {
        if (sock.data.liveRole !== 'player' || !sock.data.playerId) continue;
        const player = room.players.get(sock.data.playerId);
        if (!player) continue;
        player.socketId = sock.id;
        player.connected = true;
        const q = playerQuestionPayload(player, room);
        if (q) {
            sock.emit('live:your-question', q);
            sent.add(player.id);
        }
    }
    for (const player of room.players.values()) {
        if (sent.has(player.id) || !player.socketId) continue;
        const q = playerQuestionPayload(player, room);
        if (q) io.to(player.socketId).emit('live:your-question', q);
    }
}

function finishGame(room, winnerEntity, { isTeam = false } = {}) {
    room.phase = 'finished';
    room.finishedAt = Date.now();
    room.winnerId = winnerEntity.id;
    room.winnerNickname = isTeam ? winnerEntity.name : winnerEntity.nickname;
    winnerEntity.finished = true;
}

function gameFinishedPayload(room) {
    return {
        winnerId: room.winnerId,
        winnerNickname: room.winnerNickname,
        termsToWin: LIVE_TERMS_TO_WIN,
        gameFormat: room.gameFormat || 'race',
        players: raceEntities(room).sort((a, b) => b.progress - a.progress || a.nickname.localeCompare(b.nickname)),
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

export function createRoom(hostUserId, { deck, level, answerMode, gameFormat, teamAssignment }) {
    if (!deck || deck.length < LIVE_TERMS_TO_WIN) {
        throw new Error(`At least ${LIVE_TERMS_TO_WIN} terms with definitions are required.`);
    }
    const normalizedFormat = normalizeGameFormat(gameFormat);
    const code = generateCode();
    const room = {
        code,
        hostUserId,
        hostSocketId: null,
        hostToken: randomToken(),
        phase: 'lobby',
        level: level || 'intermediate',
        answerMode: normalizeAnswerMode(answerMode),
        gameFormat: normalizedFormat,
        teamAssignment: normalizedFormat === 'captain-crew' ? normalizeTeamAssignment(teamAssignment) : 'random',
        masterDeck: shuffleDeck(deck, deck.length),
        players: new Map(),
        teams: new Map(),
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
        teamId: null,
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

export function removePlayer(room, playerId) {
    if (room.phase !== 'lobby') {
        throw new Error('Players can only be removed before the game starts.');
    }
    const player = room.players.get(playerId);
    if (!player) throw new Error('Player not found.');
    if (player.teamId) {
        leaveTeam(room, playerId, { skipBroadcast: true });
    }
    room.players.delete(playerId);
    touchRoom(room);
    return player;
}

function leaveTeam(room, playerId, { skipBroadcast = false } = {}) {
    const player = room.players.get(playerId);
    if (!player?.teamId) return null;
    const team = room.teams.get(player.teamId);
    player.teamId = null;
    if (team) {
        team.memberIds = team.memberIds.filter((id) => id !== playerId);
        if (!team.memberIds.length && room.phase === 'lobby') {
            room.teams.delete(team.id);
        }
    }
    touchRoom(room);
    if (!skipBroadcast) broadcastLobbyUpdate(room.code);
    return team;
}

function joinTeam(room, playerId, teamId) {
    if (room.phase !== 'lobby') throw new Error('Teams can only be changed before the game starts.');
    if (room.teamAssignment !== 'pick') throw new Error('This room uses random team assignment.');
    const player = room.players.get(playerId);
    if (!player) throw new Error('Player not found.');
    const team = room.teams.get(teamId);
    if (!team) throw new Error('Team not found.');
    if (team.memberIds.length >= LIVE_TEAM_MAX) throw new Error('That team is full.');
    if (player.teamId === teamId) return team;
    leaveTeam(room, playerId, { skipBroadcast: true });
    team.memberIds.push(playerId);
    player.teamId = teamId;
    touchRoom(room);
    broadcastLobbyUpdate(room.code);
    return team;
}

function createPlayerTeam(room, playerId) {
    if (room.phase !== 'lobby') throw new Error('Teams can only be changed before the game starts.');
    if (room.teamAssignment !== 'pick') throw new Error('This room uses random team assignment.');
    const player = room.players.get(playerId);
    if (!player) throw new Error('Player not found.');
    leaveTeam(room, playerId, { skipBroadcast: true });
    const team = createEmptyTeam(room, [playerId]);
    touchRoom(room);
    broadcastLobbyUpdate(room.code);
    return team;
}

function assignPlayerTerms(player, masterDeck) {
    player.terms = shuffleDeck(masterDeck, LIVE_TERMS_TO_WIN);
    player.termIndex = 0;
    player.finished = false;
    clearPlayerQuestionState(player);
}

function reshufflePlayerTerms(player, masterDeck) {
    assignPlayerTerms(player, masterDeck);
}

function assignTeamTerms(team, masterDeck) {
    team.terms = shuffleDeck(masterDeck, LIVE_TERMS_TO_WIN);
    team.termIndex = 0;
    team.finished = false;
    clearTeamQuestionState(team);
}

function reshuffleTeamTerms(team, masterDeck) {
    assignTeamTerms(team, masterDeck);
}

function buildRandomTeams(room) {
    const players = shuffleDeck(Array.from(room.players.values()), Array.from(room.players.values()).length);
    const sizes = computeTeamSizes(players.length);
    room.teams = new Map();
    for (const player of room.players.values()) {
        player.teamId = null;
    }
    let offset = 0;
    sizes.forEach((size) => {
        const members = players.slice(offset, offset + size);
        offset += size;
        createEmptyTeam(room, members.map((p) => p.id));
    });
}

function deliverTeamQuestion(io, room, team) {
    for (const memberId of team.memberIds) {
        const member = room.players.get(memberId);
        if (!member?.socketId) continue;
        const q = teamQuestionPayload(team, room, member);
        if (q) io.to(member.socketId).emit('live:your-question', q);
    }
}

function deliverTeamAnswerResult(io, room, team, result) {
    const payload = { ...result, teamId: team.id };
    for (const memberId of team.memberIds) {
        const member = room.players.get(memberId);
        if (!member?.socketId) continue;
        io.to(member.socketId).emit('live:answer-result', payload);
        if (result.nextQuestion) {
            const q = teamQuestionPayload(team, room, member);
            if (q) io.to(member.socketId).emit('live:your-question', q);
        }
    }
}

function submitCrewVote(room, playerId, rawText) {
    if (room.phase !== 'playing') throw new Error('The game is not in progress.');
    const player = room.players.get(playerId);
    if (!player) throw new Error('Player not found.');
    const team = getPlayerTeam(room, player);
    if (!team) throw new Error('You are not on a team.');
    if (team.finished) throw new Error('Your team has already finished.');

    const entry = ensureTeamQuestionState(team, room);
    if (!entry) throw new Error('No active question.');

    const answerText = sanitizeAnswerText(rawText);
    if (!answerText) throw new Error('Choose an answer first.');
    if (team.questionInputMode === 'choice') {
        if (!team.questionChoices?.some((c) => matchesTermAnswer(answerText, c))) {
            throw new Error('Invalid choice.');
        }
    }

    team.crewVotes.set(playerId, answerText);
    touchRoom(room);
    return crewVotePayload(team, room, playerId);
}

function submitTeamAnswer(room, playerId, rawText) {
    if (room.phase !== 'playing') throw new Error('The game is not in progress.');
    const player = room.players.get(playerId);
    if (!player) throw new Error('Player not found.');
    const team = getPlayerTeam(room, player);
    if (!team) throw new Error('You are not on a team.');
    if (team.finished) throw new Error('Your team has already finished.');
    if (currentCaptainId(team) !== playerId) {
        throw new Error('Only the captain can submit the team answer.');
    }
    if (team.answerLocked) throw new Error('Please wait for the next question.');

    const entry = team.terms[team.termIndex];
    if (!entry) throw new Error('No active question.');

    const answerText = sanitizeAnswerText(rawText);
    if (!answerText) throw new Error('Choose an answer first.');

    team.answerLocked = true;
    try {
        const correct = matchesTermAnswer(answerText, entry.term);

        if (correct) {
            team.termIndex += 1;
            if (team.termIndex >= LIVE_TERMS_TO_WIN) {
                finishGame(room, team, { isTeam: true });
                return {
                    correct: true,
                    reset: false,
                    progress: LIVE_TERMS_TO_WIN,
                    won: true,
                    correctTerm: entry.term,
                    answerText,
                    teamId: team.id,
                    teamName: team.name,
                };
            }
            clearTeamQuestionState(team);
            return {
                correct: true,
                reset: false,
                progress: team.termIndex,
                won: false,
                correctTerm: entry.term,
                answerText,
                teamId: team.id,
                teamName: team.name,
                nextQuestion: true,
            };
        }

        team.termIndex = 0;
        reshuffleTeamTerms(team, room.masterDeck);
        return {
            correct: false,
            reset: true,
            progress: 0,
            won: false,
            correctTerm: entry.term,
            answerText,
            teamId: team.id,
            teamName: team.name,
            nextQuestion: true,
        };
    } finally {
        team.answerLocked = false;
    }
}

function startGame(room) {
    if (room.phase === 'finished') throw new Error('Game has ended.');
    if (room.phase === 'playing') throw new Error('Game is already in progress.');
    const minPlayers = minPlayersForRoom(room);
    if (room.players.size < minPlayers) {
        throw new Error(`At least ${minPlayers} players are required to start.`);
    }
    if (isCaptainCrew(room)) {
        if (room.teamAssignment === 'random') {
            buildRandomTeams(room);
        } else {
            const check = validateTeamsForStart(room);
            if (!check.ok) throw new Error(check.error);
        }
        for (const team of room.teams.values()) {
            assignTeamTerms(team, room.masterDeck);
        }
    } else {
        for (const player of room.players.values()) {
            assignPlayerTerms(player, room.masterDeck);
        }
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
    if (player.answerLocked) throw new Error('Please wait for the next question.');

    const entry = player.terms[player.termIndex];
    if (!entry) throw new Error('No active question.');

    const answerText = sanitizeAnswerText(rawText);
    if (!answerText) throw new Error('Type an answer first.');

    player.answerLocked = true;
    try {
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
                nextQuestion: playerQuestionPayload(player, room),
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
            nextQuestion: playerQuestionPayload(player, room),
        };
    } finally {
        player.answerLocked = false;
    }
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
            attachPlayerSocket(socket, room, player);
            emitPlayerSession(socket, room, player);
            broadcastLobbyUpdate(room.code);
        });

        socket.on('live:request-question', ({ code, playerId, playerToken }) => {
            const room = getRoom(code || socket.data.roomCode);
            if (!room) {
                socket.emit('live:error', { error: 'Room not found.' });
                return;
            }
            const pid = playerId || socket.data.playerId;
            const player = rejoinPlayer(room, pid, playerToken);
            if (!player) {
                socket.emit('live:error', { error: 'Invalid player session.' });
                return;
            }
            if (room.phase !== 'playing') return;
            attachPlayerSocket(socket, room, player);
            const q = playerQuestionPayload(player, room);
            if (q) socket.emit('live:your-question', q);
        });

        socket.on('live:remove-player', ({ playerId }) => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'host' || socket.id !== room.hostSocketId) {
                socket.emit('live:error', { error: 'Host only.' });
                return;
            }
            try {
                const removed = removePlayer(room, playerId);
                if (removed.socketId) {
                    io.to(removed.socketId).emit('live:player-removed', {
                        message: 'The host removed you from the lobby.',
                    });
                    const playerSocket = io.sockets.sockets.get(removed.socketId);
                    if (playerSocket) {
                        playerSocket.leave(`room:${room.code}`);
                        playerSocket.data.liveRole = null;
                        playerSocket.data.playerId = null;
                    }
                }
                broadcastLobbyUpdate(room.code);
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:join-team', ({ teamId }) => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'player') {
                socket.emit('live:error', { error: 'Players only.' });
                return;
            }
            try {
                joinTeam(room, socket.data.playerId, teamId);
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:create-team', () => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'player') {
                socket.emit('live:error', { error: 'Players only.' });
                return;
            }
            try {
                createPlayerTeam(room, socket.data.playerId);
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:start-game', async () => {
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
                    minPlayers: minPlayersForRoom(room),
                    progress,
                    code: room.code,
                    gameFormat: room.gameFormat || 'race',
                });
                await deliverQuestionsToAllPlayers(io, room);
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:crew-vote', ({ text, answer }) => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'player') {
                socket.emit('live:error', { error: 'Players only.' });
                return;
            }
            if (!isCaptainCrew(room)) {
                socket.emit('live:error', { error: 'Crew votes are only used in Captain & Crew mode.' });
                return;
            }
            try {
                const player = room.players.get(socket.data.playerId);
                const team = player ? getPlayerTeam(room, player) : null;
                if (!team) throw new Error('You are not on a team.');
                submitCrewVote(room, socket.data.playerId, text ?? answer);
                emitTeamVoteUpdate(io, room, team);
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
                const player = room.players.get(socket.data.playerId);
                if (isCaptainCrew(room)) {
                    const team = player ? getPlayerTeam(room, player) : null;
                    if (!team) throw new Error('You are not on a team.');
                    const result = submitTeamAnswer(room, socket.data.playerId, text ?? answer);
                    emitHostAnswerFeed(io, room, team, result);
                    deliverTeamAnswerResult(io, room, team, result);

                    if (result.won) {
                        const finished = gameFinishedPayload(room);
                        io.to(`room:${room.code}`).emit('live:game-finished', finished);
                        if (onGameEnd) onGameEnd(room);
                        return;
                    }

                    emitProgress(io, room);
                    return;
                }

                const result = submitAnswer(room, socket.data.playerId, text ?? answer);
                if (player) emitHostAnswerFeed(io, room, player, result);
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
