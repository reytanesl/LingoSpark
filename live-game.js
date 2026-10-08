import crypto from 'crypto';
import {
    buildChoices,
    loadBuiltinDeck,
    matchesTermAnswer,
    parseGlossaryTerms,
    sanitizeAnswerText,
    shuffleDeck,
} from './vocab-quiz-utils.js';
import {
    LANTERN_DEFAULT_ROUNDS,
    LANTERN_QUESTION_MS,
    LANTERN_TUTORIAL_MS,
    advanceLantern,
    closeLanternAnswering,
    lanternTimeoutResults,
    closeLanternPicks,
    createLanternMatch,
    expireLanternReview,
    finishLanternEarly,
    hostSkipLantern,
    lanternPublicView,
    lanternQuestionPayload,
    lanternWinners,
    markLanternChallengePending,
    normalizeLanternRounds,
    pickLantern,
    renameLanternPlayer,
    settleLanternChallenge,
    skipLanternPrompt,
    submitLanternAnswer,
} from './lucky-lanterns.js';
import {
    CANNON_DEFAULT_MINUTES,
    CANNON_QUESTION_MS,
    CANNON_TEAM_NAMES,
    advanceCannon,
    cannonPublicView,
    cannonQuestionPayload,
    cannonWinners,
    closeCannonAnswering,
    cannonTimeoutResults,
    createCannonMatch,
    expireCannonReview,
    finishCannonEarly,
    hostSkipCannon,
    markCannonChallengePending,
    normalizeGameMinutes,
    renameCannonPlayer,
    settleCannonChallenge,
    skipCannonPrompt,
    submitCannonAnswer,
} from './word-cannon.js';

export const LIVE_TERMS_TO_WIN = 12;
export const LIVE_MIN_PLAYERS = 2;
export const LIVE_ANSWER_MODES = ['recognise', 'realise', 'randomise'];
export const LIVE_GAME_FORMATS = ['race', 'captain-crew', 'hot-spark-relay', 'lucky-lanterns', 'word-cannon'];
export const LIVE_TEAM_ASSIGNMENT = ['random', 'pick'];
export const LIVE_TEAM_MIN = 2;
export const LIVE_TEAM_MAX = 4;
export const LIVE_CAPTAIN_CREW_MIN_PLAYERS = 4;
/** Word Cannon Battle: two fixed teams (Red, Blue), at least one player each. */
export const LIVE_CANNON_TEAM_MAX = 20;
export const LIVE_CANNON_MIN_PLAYERS = 2;
/** Host-chosen time to answer each question. null = the format's default (see questionSecondsForRoom). */
export const LIVE_QUESTION_SECONDS_MIN = 5;
export const LIVE_QUESTION_SECONDS_MAX = 120;
const QUESTION_TIMER_TICK_MS = 250;

const BRITISH_TEAM_NAMES = [
    'Rowan Atkinsons',
    'Benedict Cumberbatches',
    'David Beckhams',
    'Kate Bushes',
    'Elton Johns',
    'Freddie Mercurys',
    'David Bowies',
    'Emma Watsons',
    'Daniel Radcliffes',
    'Tom Hollands',
    'Idris Elbas',
    'Helen Mirrens',
    'Judi Denches',
    'Mick Jaggers',
    'Paul McCartneys',
    'Ed Sheerans',
    'Adeles',
    'Harry Styleses',
    'James Bonds',
    'Mr Beans',
    'Doctor Whos',
    'Sherlock Holmeses',
    'James Cordens',
    'Graham Nortons',
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

function isTeamFormat(room) {
    return room?.gameFormat === 'captain-crew' || room?.gameFormat === 'hot-spark-relay';
}

function isWordCannon(room) {
    return room?.gameFormat === 'word-cannon';
}

/** Formats whose lobby has teams (join / pick / random). */
function usesTeamLobby(room) {
    return isTeamFormat(room) || isWordCannon(room);
}

function teamMaxForRoom(room) {
    return isWordCannon(room) ? LIVE_CANNON_TEAM_MAX : LIVE_TEAM_MAX;
}

function raceEntities(room) {
    return isTeamFormat(room) ? teamList(room) : playerList(room);
}

function minPlayersForRoom(room) {
    if (isWordCannon(room)) return LIVE_CANNON_MIN_PLAYERS;
    if (isTeamFormat(room)) return LIVE_CAPTAIN_CREW_MIN_PLAYERS;
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
        relayTurnIndex: 0,
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
    const max = teamMaxForRoom(room);
    return {
        id: team.id,
        name: team.name,
        memberIds: [...team.memberIds],
        memberNicknames: members.map((p) => p.nickname),
        memberCount: team.memberIds.length,
        maxMembers: max,
        canJoin: team.memberIds.length < max,
        ...(team.fixed ? { fixed: true, color: team.id } : {}),
    };
}

/** Word Cannon keeps two fixed teams, Red and Blue, even when they are empty. */
function createCannonTeam(room, teamId) {
    const team = {
        id: teamId,
        name: CANNON_TEAM_NAMES[teamId],
        fixed: true,
        memberIds: [],
        termIndex: 0,
        terms: [],
        finished: false,
        questionForTermIndex: -1,
        questionChoices: null,
        questionId: 0,
        answerLocked: false,
        crewVotes: new Map(),
        relayTurnIndex: 0,
    };
    room.teams.set(teamId, team);
    return team;
}

function ensureCannonTeams(room) {
    if (!room.teams) room.teams = new Map();
    for (const [id, team] of [...room.teams.entries()]) {
        if (!team.fixed) {
            for (const memberId of team.memberIds) {
                const p = room.players.get(memberId);
                if (p) p.teamId = null;
            }
            room.teams.delete(id);
        }
    }
    for (const id of ['red', 'blue']) {
        if (!room.teams.has(id)) createCannonTeam(room, id);
    }
}

/** Random Red/Blue split, alternating after a shuffle (sizes differ by at most one). */
function buildRandomCannonTeams(room) {
    const list = Array.from(room.players.values());
    const players = shuffleDeck(list, list.length);
    room.teams = new Map();
    const red = createCannonTeam(room, 'red');
    const blue = createCannonTeam(room, 'blue');
    const first = Math.random() < 0.5 ? red : blue;
    const second = first === red ? blue : red;
    players.forEach((p, i) => {
        const team = i % 2 === 0 ? first : second;
        team.memberIds.push(p.id);
        p.teamId = team.id;
    });
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
    if (isWordCannon(room)) {
        const red = room.teams?.get('red');
        const blue = room.teams?.get('blue');
        if (!red?.memberIds.length || !blue?.memberIds.length) {
            return { ok: false, error: 'Red and Blue each need at least one player.' };
        }
        if (red.memberIds.length + blue.memberIds.length !== room.players.size) {
            return { ok: false, error: 'Every player must join Red or Blue before starting.' };
        }
        return { ok: true };
    }
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
    if (!usesTeamLobby(room)) return room.players.size >= LIVE_MIN_PLAYERS;
    if (validateTeamsForStart(room).ok) return true;
    if (room.teamAssignment === 'pick') return false;
    return room.players.size >= minPlayersForRoom(room);
}

function teamsCoverPlayers(room) {
    return validateTeamsForStart(room).ok;
}

function clearAllTeams(room) {
    for (const player of room.players.values()) {
        player.teamId = null;
    }
    room.teams = new Map();
}

function pruneEmptyTeams(room) {
    if (!room.teams) return;
    for (const [teamId, team] of [...room.teams.entries()]) {
        team.memberIds = team.memberIds.filter((id) => room.players.has(id));
        if (!team.memberIds.length && !team.fixed) room.teams.delete(teamId);
    }
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
        lanternRounds: room.lanternRounds || LANTERN_DEFAULT_ROUNDS,
        gameMinutes: room.gameMinutes || CANNON_DEFAULT_MINUTES,
        questionSeconds: room.questionSeconds || null,
        questionTimeSec: questionSecondsForRoom(room),
        teamAssignment: room.teamAssignment || 'random',
        teamMin: isWordCannon(room) ? 1 : LIVE_TEAM_MIN,
        teamMax: teamMaxForRoom(room),
        players: playerList(room),
        teams: room.phase === 'lobby' && usesTeamLobby(room) ? lobbyTeamsList(room) : teamList(room),
        unassignedPlayers: room.phase === 'lobby' && usesTeamLobby(room) ? unassignedPlayerList(room) : [],
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

function isHotSparkRelay(room) {
    return room?.gameFormat === 'hot-spark-relay';
}

export function normalizeQuestionSeconds(value) {
    if (value == null || value === '' || value === 'default') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.max(LIVE_QUESTION_SECONDS_MIN, Math.min(LIVE_QUESTION_SECONDS_MAX, Math.round(n)));
}

/**
 * Seconds allowed per question in the room's current format, or null for no limit.
 * Defaults keep the old behaviour: Lucky Lanterns 20 s, the race formats untimed.
 */
export function questionSecondsForRoom(room) {
    if (isLuckyLanterns(room)) return room?.questionSeconds || LANTERN_QUESTION_MS / 1000;
    if (isWordCannon(room)) return room?.questionSeconds || CANNON_QUESTION_MS / 1000;
    return room?.questionSeconds || null;
}

function questionDeadline(room, now = Date.now()) {
    const secs = questionSecondsForRoom(room);
    return secs ? now + secs * 1000 : null;
}

function questionTimingFields(entity, room) {
    const endsAt = entity?.questionEndsAt || null;
    return {
        endsAt,
        timeLimitSec: questionSecondsForRoom(room),
        timeLeftMs: endsAt ? Math.max(0, endsAt - Date.now()) : null,
    };
}

function isLuckyLanterns(room) {
    return room?.gameFormat === 'lucky-lanterns';
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
    player.questionEndsAt = null;
}

function clearTeamQuestionState(team) {
    team.questionForTermIndex = -1;
    team.questionInputMode = null;
    team.questionChoices = null;
    team.answerLocked = false;
    team.crewVotes = new Map();
    team.questionEndsAt = null;
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

function currentRelayPlayerId(team) {
    if (!team?.memberIds?.length) return null;
    const idx = ((team.relayTurnIndex || 0) % team.memberIds.length + team.memberIds.length) % team.memberIds.length;
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
        team.questionEndsAt = questionDeadline(room);
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
        ...questionTimingFields(team, room),
        ...(team.questionInputMode === 'choice' ? { choices: team.questionChoices } : {}),
    };
}

function teamRelayQuestionPayload(team, room, player) {
    const entry = ensureTeamQuestionState(team, room);
    if (!entry) return null;
    const activePlayerId = currentRelayPlayerId(team);
    const activeIdx = team.memberIds.indexOf(activePlayerId);
    const nextPlayerId = activeIdx >= 0
        ? team.memberIds[(activeIdx + 1) % team.memberIds.length]
        : null;
    return {
        progress: team.termIndex,
        termsToWin: LIVE_TERMS_TO_WIN,
        termIndex: team.termIndex,
        questionId: team.questionId,
        definition: entry.definition,
        inputMode: team.questionInputMode,
        answerMode: room.answerMode,
        gameFormat: 'hot-spark-relay',
        caseSensitive: false,
        teamId: team.id,
        teamName: team.name,
        relay: {
            activePlayerId,
            activeNickname: room.players.get(activePlayerId)?.nickname || '',
            isActivePlayer: player.id === activePlayerId,
            nextPlayerId,
            nextNickname: room.players.get(nextPlayerId)?.nickname || '',
        },
        ...questionTimingFields(team, room),
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
        player.questionEndsAt = questionDeadline(room);
    }

    if (player.questionInputMode === 'choice' && !player.questionChoices) {
        const termPool = room.masterDeck.map((d) => d.term);
        player.questionChoices = buildChoices(entry.term, termPool, room.level || 'intermediate');
    }

    return entry;
}

function playerQuestionPayload(player, room) {
    if (isWordCannon(room)) {
        const match = room.cannon;
        if (!match || match.phase !== 'question') return null;
        const answer = match.answers?.[player.id];
        if (answer?.submitted) return null;
        const q = cannonQuestionPayload(match);
        if (!q) return null;
        const team = match.playerTeam[player.id];
        return { ...q, progress: match.stats?.[player.id]?.correct || 0, team, teamName: CANNON_TEAM_NAMES[team] };
    }
    if (isLuckyLanterns(room)) {
        const match = room.lantern;
        if (!match || match.phase !== 'question') return null;
        const answer = match.answers?.[player.id];
        if (answer?.submitted) return null;
        const q = lanternQuestionPayload(match);
        if (!q) return null;
        return { ...q, progress: match.scores?.[player.id] || 0 };
    }
    if (isCaptainCrew(room) || isHotSparkRelay(room)) {
        const team = getPlayerTeam(room, player);
        if (!team) return null;
        if (isCaptainCrew(room)) return teamQuestionPayload(team, room, player);
        return teamRelayQuestionPayload(team, room, player);
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
        ...questionTimingFields(player, room),
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
        challengeable: Boolean(result.challengeable),
        timedOut: Boolean(result.timedOut),
    });
}

function setPendingChallenge(entity, entry, answerText) {
    entity.pendingChallenge = {
        answerText,
        correctTerm: entry.term,
        definition: entry.definition,
        progressBefore: entity.termIndex,
        questionId: entity.questionId,
        challenged: false,
        challengeId: null,
    };
}

function buildPendingWrongResult(entity, entry, answerText, isTeam) {
    return {
        correct: false,
        reset: false,
        challengeable: true,
        progress: entity.termIndex,
        won: false,
        correctTerm: entry.term,
        answerText,
        definition: entry.definition,
        ...(isTeam ? { teamId: entity.id, teamName: entity.name } : {}),
    };
}

function clearPendingChallenge(entity) {
    entity.pendingChallenge = null;
    entity.answerLocked = false;
}

function applyWrongAnswerReset(entity, room, isTeam) {
    if (isTeam) {
        entity.termIndex = 0;
        reshuffleTeamTerms(entity, room.masterDeck);
    } else {
        entity.termIndex = 0;
        reshufflePlayerTerms(entity, room.masterDeck);
    }
}

function processCorrectAnswerPlayer(room, player, entry, answerText) {
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
    clearPlayerQuestionState(player);
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

function processCorrectAnswerTeam(room, team, entry, answerText) {
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

function getChallengeEntity(room, challenge) {
    if (challenge.entityType === 'team') {
        return { entity: room.teams.get(challenge.entityId), isTeam: true };
    }
    return { entity: room.players.get(challenge.entityId), isTeam: false };
}

function challengePayload(challenge) {
    return {
        id: challenge.id,
        entityId: challenge.entityId,
        entityType: challenge.entityType,
        nickname: challenge.nickname,
        answerText: challenge.answerText,
        correctTerm: challenge.correctTerm,
        definition: challenge.definition,
        progress: challenge.progressBefore,
    };
}

function emitChallengePending(io, room, challenge) {
    if (!room.hostSocketId) return;
    io.to(room.hostSocketId).emit('live:challenge-pending', challengePayload(challenge));
}

function listPendingChallenges(room) {
    return Array.from(room.challenges.values())
        .filter((c) => c.status === 'pending')
        .map((c) => challengePayload(c));
}

function deliverEntityOutcome(io, room, entity, isTeam, result, onGameEnd) {
    if (isTeam) {
        emitHostAnswerFeed(io, room, entity, result);
        for (const memberId of entity.memberIds) {
            const member = room.players.get(memberId);
            if (!member?.socketId) continue;
            io.to(member.socketId).emit('live:challenge-resolved', result);
            if (result.nextQuestion) {
                const q = playerQuestionPayload(member, room);
                if (q) io.to(member.socketId).emit('live:your-question', q);
            }
        }
    } else {
        emitHostAnswerFeed(io, room, entity, result);
        if (entity.socketId) {
            io.to(entity.socketId).emit('live:challenge-resolved', result);
            if (result.nextQuestion) {
                io.to(entity.socketId).emit('live:your-question', result.nextQuestion);
            }
        }
    }

    if (result.won) {
        const finished = gameFinishedPayload(room);
        io.to(`room:${room.code}`).emit('live:game-finished', finished);
        if (onGameEnd) onGameEnd(room);
        return;
    }

    emitProgress(io, room);
}

function submitChallenge(room, playerId) {
    if (room.phase !== 'playing') throw new Error('The game is not in progress.');
    const player = room.players.get(playerId);
    if (!player) throw new Error('Player not found.');

    let entity;
    let isTeam = false;
    if (isCaptainCrew(room) || isHotSparkRelay(room)) {
        const team = getPlayerTeam(room, player);
        if (!team) throw new Error('You are not on a team.');
        if (isCaptainCrew(room) && currentCaptainId(team) !== playerId) {
            throw new Error('Only the captain can challenge a team answer.');
        }
        if (isHotSparkRelay(room) && currentRelayPlayerId(team) !== playerId) {
            throw new Error('Only the player who answered can challenge.');
        }
        entity = team;
        isTeam = true;
    } else {
        entity = player;
    }

    const pending = entity.pendingChallenge;
    if (!pending) throw new Error('There is no answer to challenge.');
    if (pending.challenged) throw new Error('Challenge already submitted.');

    const challengeId = `ch-${crypto.randomBytes(4).toString('hex')}`;
    const challenge = {
        id: challengeId,
        entityId: entity.id,
        entityType: isTeam ? 'team' : 'player',
        nickname: isTeam ? entity.name : entity.nickname,
        answerText: pending.answerText,
        correctTerm: pending.correctTerm,
        definition: pending.definition,
        progressBefore: pending.progressBefore,
        status: 'pending',
    };
    room.challenges.set(challengeId, challenge);
    pending.challenged = true;
    pending.challengeId = challengeId;
    touchRoom(room);
    return challenge;
}

function advanceHotSparkTurn(room, team) {
    if (!isHotSparkRelay(room) || !team) return;
    team.relayTurnIndex = (team.relayTurnIndex || 0) + 1;
}

function skipChallenge(room, playerId) {
    if (room.phase !== 'playing') throw new Error('The game is not in progress.');
    const player = room.players.get(playerId);
    if (!player) throw new Error('Player not found.');

    let entity;
    let isTeam = false;
    if (isCaptainCrew(room) || isHotSparkRelay(room)) {
        const team = getPlayerTeam(room, player);
        if (!team) throw new Error('You are not on a team.');
        if (isCaptainCrew(room) && currentCaptainId(team) !== playerId) {
            throw new Error('Only the captain can continue.');
        }
        if (isHotSparkRelay(room) && currentRelayPlayerId(team) !== playerId) {
            throw new Error('Only the player who answered can continue.');
        }
        entity = team;
        isTeam = true;
    } else {
        entity = player;
    }

    const pending = entity.pendingChallenge;
    if (!pending) throw new Error('No pending answer.');
    if (pending.challenged) throw new Error('Waiting for teacher review.');

    applyWrongAnswerReset(entity, room, isTeam);
    advanceHotSparkTurn(room, isTeam ? entity : null);
    clearPendingChallenge(entity);
    touchRoom(room);

    return {
        correct: false,
        reset: true,
        challengeable: false,
        progress: 0,
        won: false,
        correctTerm: pending.correctTerm,
        answerText: pending.answerText,
        definition: pending.definition,
        ...(isTeam
            ? { teamId: entity.id, teamName: entity.name, nextQuestion: true }
            : { nextQuestion: playerQuestionPayload(player, room) }),
    };
}

function resolveChallenge(io, room, challengeId, accept, onGameEnd) {
    if (room.phase !== 'playing') throw new Error('The game is not in progress.');
    const challenge = room.challenges.get(challengeId);
    if (!challenge || challenge.status !== 'pending') {
        throw new Error('Challenge not found or already resolved.');
    }

    const { entity, isTeam } = getChallengeEntity(room, challenge);
    if (!entity) throw new Error('Player or team not found.');

    const pending = entity.pendingChallenge;
    if (!pending || pending.challengeId !== challengeId) {
        throw new Error('Challenge state mismatch.');
    }

    const entry = entity.terms[pending.progressBefore];
    if (!entry) throw new Error('Question no longer available.');

    challenge.status = accept ? 'accepted' : 'declined';
    room.challenges.delete(challengeId);
    clearPendingChallenge(entity);

    let result;
    if (accept) {
        result = isTeam
            ? processCorrectAnswerTeam(room, entity, entry, pending.answerText)
            : processCorrectAnswerPlayer(room, entity, entry, pending.answerText);
        result.challengeAccepted = true;
        if (isTeam) advanceHotSparkTurn(room, entity);
    } else {
        applyWrongAnswerReset(entity, room, isTeam);
        if (isTeam) advanceHotSparkTurn(room, entity);
        result = {
            correct: false,
            reset: true,
            challengeable: false,
            progress: 0,
            won: false,
            correctTerm: pending.correctTerm,
            answerText: pending.answerText,
            definition: pending.definition,
            challengeDeclined: true,
            ...(isTeam
                ? { teamId: entity.id, teamName: entity.name, nextQuestion: true }
                : { nextQuestion: playerQuestionPayload(entity, room) }),
        };
    }

    touchRoom(room);
    deliverEntityOutcome(io, room, entity, isTeam, result, onGameEnd);
    io.to(room.hostSocketId).emit('live:challenge-resolved', {
        id: challengeId,
        accepted: accept,
        entityId: challenge.entityId,
    });
    return result;
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
    const entityProgress = isTeamFormat(room) && team
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
        awaitingChallenge: false,
    };
    let question = null;
    if (isWordCannon(room) && room.cannon && (room.phase === 'finished' || room.phase === 'playing')) {
        emitCannonPlayerSession(socket, room, player, payload);
        return;
    }
    if (room.phase === 'finished' && isLuckyLanterns(room) && room.lantern) {
        socket.emit('live:player-joined', payload);
        socket.emit('live:game-finished', gameFinishedPayload(room));
        return;
    }
    if (room.phase === 'playing' && isLuckyLanterns(room) && room.lantern) {
        renameLanternPlayer(room.lantern, player.id, player.nickname);
        const answer = room.lantern.answers?.[player.id];
        if (answer?.decision === 'prompt' || answer?.decision === 'pending') {
            payload.awaitingChallenge = true;
        }
        socket.emit('live:player-joined', payload);
        socket.emit('live:lantern-state', lanternPublicView(room.lantern, {
            playerId: player.id,
            connected: lanternConnectedMap(room),
        }));
        if (room.lantern.phase === 'question' && answer && !answer.submitted) {
            question = playerQuestionPayload(player, room);
            if (question) socket.emit('live:your-question', question);
        } else if (answer?.decision === 'prompt') {
            socket.emit('live:answer-result', {
                correct: false,
                reset: false,
                challengeable: true,
                lantern: true,
                gameFormat: 'lucky-lanterns',
                progress: room.lantern.scores[player.id] || 0,
                won: false,
                correctTerm: room.lantern.entry?.term || '',
                answerText: answer.answerText || '',
                definition: room.lantern.entry?.definition || '',
                questionId: room.lantern.questionId,
            });
        } else if (answer?.decision === 'pending') {
            socket.emit('live:challenge-submitted', { challengeId: player.pendingChallenge?.challengeId || null });
        }
        return;
    }
    if (room.phase === 'playing') {
        const entity = isTeamFormat(room) && team ? team : player;
        const isTeam = Boolean((isCaptainCrew(room) || isHotSparkRelay(room)) && team);
        if (entity?.pendingChallenge) {
            payload.awaitingChallenge = true;
            const pending = entity.pendingChallenge;
            const entry = { term: pending.correctTerm, definition: pending.definition };
            socket.emit('live:answer-result', buildPendingWrongResult(entity, entry, pending.answerText, isTeam));
            if (pending.challenged) {
                socket.emit('live:challenge-submitted', { challengeId: pending.challengeId });
            }
        } else {
            question = playerQuestionPayload(player, room);
            payload.question = question;
        }
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
    if (isWordCannon(room) && room.cannon) {
        const w = cannonWinners(room.cannon);
        return {
            winnerId: w.winner,
            winnerNickname: w.winnerNickname,
            gameFormat: 'word-cannon',
            cannon: true,
            teamMode: true,
            winner: w.winner,
            reason: w.reason,
            hp: w.hp,
            points: w.points,
            wins: w.wins,
            mvp: w.mvp,
            teams: {
                red: {
                    id: 'red',
                    name: CANNON_TEAM_NAMES.red,
                    hp: w.hp.red,
                    points: w.teams.red.points,
                    fortKills: w.teams.red.fortKills,
                    damageDealt: w.teams.red.damageDealt,
                    memberIds: [...room.cannon.teams.red.memberIds],
                },
                blue: {
                    id: 'blue',
                    name: CANNON_TEAM_NAMES.blue,
                    hp: w.hp.blue,
                    points: w.teams.blue.points,
                    fortKills: w.teams.blue.fortKills,
                    damageDealt: w.teams.blue.damageDealt,
                    memberIds: [...room.cannon.teams.blue.memberIds],
                },
            },
            termsToWin: 0,
            players: w.players.map((row) => ({
                id: row.id,
                nickname: row.nickname,
                team: row.team,
                progress: row.hits,
                hits: row.hits,
                correct: row.correct,
                damage: row.damage,
                avgMs: row.avgMs,
                rank: row.rank,
                termsToWin: 0,
            })),
        };
    }
    if (isLuckyLanterns(room) && room.lantern) {
        const winners = lanternWinners(room.lantern);
        return {
            winnerId: room.winnerId || winners.winnerId,
            winnerNickname: room.winnerNickname || winners.winnerNickname,
            tiedIds: winners.tiedIds,
            termsToWin: room.lantern.rounds,
            gameFormat: 'lucky-lanterns',
            lantern: true,
            players: winners.players.map((row) => ({
                id: row.id,
                nickname: row.nickname,
                progress: row.score,
                score: row.score,
                rank: row.rank,
                avatar: row.avatar,
                shield: Boolean(row.shield),
                termsToWin: room.lantern.rounds,
            })),
        };
    }
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

export function createRoom(hostUserId, { deck, level, answerMode, gameFormat, teamAssignment, lanternRounds, questionSeconds, gameMinutes }) {
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
        teamAssignment: usesTeamLobby({ gameFormat: normalizedFormat }) ? normalizeTeamAssignment(teamAssignment) : 'random',
        masterDeck: shuffleDeck(deck, deck.length),
        players: new Map(),
        teams: new Map(),
        winnerId: null,
        winnerNickname: null,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        startedAt: null,
        finishedAt: null,
        challenges: new Map(),
        lanternRounds: normalizeLanternRounds(lanternRounds),
        questionSeconds: normalizeQuestionSeconds(questionSeconds),
        lantern: null,
        lanternTimer: null,
        gameMinutes: normalizeGameMinutes(gameMinutes),
        cannon: null,
        cannonTimer: null,
    };
    if (isWordCannon(room) && room.teamAssignment === 'pick') ensureCannonTeams(room);
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
    const clean = sanitizeNickname(nickname);
    if (!clean) throw new Error('Nickname must be 2–20 characters.');

    const nickKey = clean.toLowerCase();
    const existing = Array.from(room.players.values()).find(
        (p) => String(p.nickname || '').toLowerCase() === nickKey
    );
    if (existing) {
        if (existing.connected && existing.socketId) {
            throw new Error('That nickname is already connected. If you disconnected, wait a moment and try again with the same nickname.');
        }
        // Reclaim seat (lobby or mid-game) — keeps team membership / captain-relay position.
        existing.nickname = clean;
        existing.playerToken = randomToken();
        existing.socketId = null;
        existing.connected = false;
        touchRoom(room);
        return { room, player: existing, reclaimed: true };
    }

    if (room.phase !== 'lobby') {
        throw new Error('This game has already started. Rejoin with the same nickname you used before to reconnect.');
    }
    if (room.players.size >= MAX_PLAYERS) throw new Error('Room is full.');

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
    return { room, player, reclaimed: false };
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

export function hostUnassignPlayer(room, playerId) {
    if (room.phase !== 'lobby') {
        throw new Error('Teams can only be changed before the game starts.');
    }
    if (room.teamAssignment !== 'pick') {
        throw new Error('This room uses random team assignment.');
    }
    const player = room.players.get(playerId);
    if (!player) throw new Error('Player not found.');
    leaveTeam(room, playerId, { skipBroadcast: true });
    touchRoom(room);
    return player;
}

export function resetRoomToLobby(room) {
    clearLanternTimer(room);
    room.lantern = null;
    clearCannonTimer(room);
    room.cannon = null;
    room.phase = 'lobby';
    room.winnerId = null;
    room.winnerNickname = null;
    room.startedAt = null;
    room.finishedAt = null;
    room.challenges = new Map();
    for (const player of room.players.values()) {
        player.termIndex = 0;
        player.terms = [];
        player.finished = false;
        player.pendingChallenge = null;
        clearPlayerQuestionState(player);
        // Keep teamId so teams stay intact across Play again / format switches.
    }
    pruneEmptyTeams(room);
    for (const team of room.teams.values()) {
        team.termIndex = 0;
        team.terms = [];
        team.finished = false;
        team.pendingChallenge = null;
        team.relayTurnIndex = 0;
        clearTeamQuestionState(team);
    }
    touchRoom(room);
    return room;
}

/** Lobby (or finished→lobby): change format / answer mode; keep room code + players. */
export function setRoomSettings(room, { gameFormat, teamAssignment, answerMode, lanternRounds, questionSeconds, gameMinutes } = {}) {
    if (room.phase === 'playing') {
        throw new Error('Settings can only be changed before the game starts.');
    }
    if (room.phase === 'finished') {
        resetRoomToLobby(room);
    }
    if (room.phase !== 'lobby') {
        throw new Error('Settings can only be changed in the lobby.');
    }

    const prevFormat = room.gameFormat;
    const prevAssignment = room.teamAssignment;

    if (gameFormat != null) {
        room.gameFormat = normalizeGameFormat(gameFormat);
    }
    if (answerMode != null) {
        room.answerMode = normalizeAnswerMode(answerMode);
    }
    if (lanternRounds != null) {
        room.lanternRounds = normalizeLanternRounds(lanternRounds);
    }
    if (gameMinutes != null) {
        room.gameMinutes = normalizeGameMinutes(gameMinutes);
    }
    // undefined = not sent (keep); null / '' / 0 = back to the format default.
    if (questionSeconds !== undefined) {
        room.questionSeconds = normalizeQuestionSeconds(questionSeconds);
    }

    if (!usesTeamLobby(room)) {
        // Solo race: drop team state so a later team mode starts clean.
        clearAllTeams(room);
        room.teamAssignment = 'random';
    } else {
        if (teamAssignment != null) {
            room.teamAssignment = normalizeTeamAssignment(teamAssignment);
        } else if (!LIVE_TEAM_ASSIGNMENT.includes(room.teamAssignment)) {
            room.teamAssignment = 'random';
        }
        const formatChanged = prevFormat !== room.gameFormat;
        const assignmentChanged = prevAssignment !== room.teamAssignment;
        // New format or switch to random: clear stale teams (Start rebuilds random teams).
        if (formatChanged || (assignmentChanged && room.teamAssignment === 'random')) {
            clearAllTeams(room);
        }
        // Pick mode with incomplete leftovers blocks Start — clear so players can re-form.
        // (Word Cannon's Red/Blue teams are fixed and may be half-empty in the lobby.)
        if (room.teamAssignment === 'pick' && !isWordCannon(room) && !validateTeamsForStart(room).ok) {
            clearAllTeams(room);
        }
        if (isWordCannon(room)) {
            if (room.teamAssignment === 'pick') ensureCannonTeams(room);
            else clearAllTeams(room);
        }
    }

    pruneEmptyTeams(room);
    touchRoom(room);
    return room;
}

export function destroyRoom(code, hostToken) {
    const room = getRoom(code);
    if (!room) return null;
    if (hostToken && room.hostToken !== hostToken) return null;
    rooms.delete(room.code);
    return room;
}

function leaveTeam(room, playerId, { skipBroadcast = false } = {}) {
    const player = room.players.get(playerId);
    if (!player?.teamId) return null;
    const team = room.teams.get(player.teamId);
    player.teamId = null;
    if (team) {
        team.memberIds = team.memberIds.filter((id) => id !== playerId);
        if (!team.memberIds.length && room.phase === 'lobby' && !team.fixed) {
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
    if (team.memberIds.length >= teamMaxForRoom(room)) throw new Error('That team is full.');
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
    if (isWordCannon(room)) throw new Error('Word Cannon Battle has two teams: join Red or Blue.');
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
    team.relayTurnIndex = 0;
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
        const q = playerQuestionPayload(member, room);
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
            const q = playerQuestionPayload(member, room);
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
    let keepLocked = false;
    try {
        const correct = matchesTermAnswer(answerText, entry.term);

        if (correct) {
            return processCorrectAnswerTeam(room, team, entry, answerText);
        }

        setPendingChallenge(team, entry, answerText);
        keepLocked = true;
        return buildPendingWrongResult(team, entry, answerText, true);
    } finally {
        if (!keepLocked) team.answerLocked = false;
    }
}

function processRelayAnswer(room, team, player, answerText) {
    if (team.answerLocked) throw new Error('Please wait for the next question.');
    const activePlayerId = currentRelayPlayerId(team);
    if (activePlayerId !== player.id) {
        const activeNickname = room.players.get(activePlayerId)?.nickname || 'your teammate';
        throw new Error(`Wait for ${activeNickname} — it is their turn.`);
    }

    const entry = team.terms[team.termIndex];
    if (!entry) throw new Error('No active question.');

    team.answerLocked = true;
    let keepLocked = false;
    try {
        const correct = matchesTermAnswer(answerText, entry.term);
        if (correct) {
            const result = processCorrectAnswerTeam(room, team, entry, answerText);
            advanceHotSparkTurn(room, team);
            return result;
        }

        // Written answers can be challenged; multiple-choice wrong answers reset to zero immediately.
        if (team.questionInputMode === 'typed') {
            setPendingChallenge(team, entry, answerText);
            keepLocked = true;
            return buildPendingWrongResult(team, entry, answerText, true);
        }

        applyWrongAnswerReset(team, room, true);
        advanceHotSparkTurn(room, team);
        clearTeamQuestionState(team);
        return {
            correct: false,
            reset: true,
            challengeable: false,
            progress: 0,
            won: false,
            correctTerm: entry.term,
            answerText,
            definition: entry.definition,
            teamId: team.id,
            teamName: team.name,
            nextQuestion: true,
        };
    } finally {
        if (!keepLocked) team.answerLocked = false;
    }
}

/** Swap the current (unanswered) term for one the entity has not seen in this run, so a timeout never repeats it. */
function replaceCurrentTerm(entity, masterDeck) {
    const current = entity.terms[entity.termIndex];
    const inUse = new Set(entity.terms.map((t) => t.term));
    const fresh = shuffleDeck(masterDeck.filter((d) => !inUse.has(d.term)), 1)[0]
        || shuffleDeck(masterDeck.filter((d) => d.term !== current?.term), 1)[0];
    if (fresh) entity.terms[entity.termIndex] = fresh;
}

/**
 * Time ran out on a race-format question: no progress is lost, the answer is shown, and a fresh
 * question replaces it. In Hot Spark the spark also passes to the next teammate.
 */
export function expireQuestion(room, entity, isTeam) {
    const entry = entity.terms[entity.termIndex];
    replaceCurrentTerm(entity, room.masterDeck);
    if (isTeam) {
        advanceHotSparkTurn(room, entity);
        clearTeamQuestionState(entity);
    } else {
        clearPlayerQuestionState(entity);
    }
    touchRoom(room);
    return {
        correct: false,
        reset: false,
        challengeable: false,
        timedOut: true,
        progress: entity.termIndex,
        won: false,
        correctTerm: entry?.term || '',
        answerText: '',
        definition: entry?.definition || '',
        ...(isTeam ? { teamId: entity.id, teamName: entity.name, nextQuestion: true } : {}),
    };
}

/** In a timed room, an answer sent for a question that already timed out must not be judged against its replacement. */
function assertCurrentQuestion(room, entity, questionId) {
    if (questionId == null || !entity || !questionSecondsForRoom(room)) return;
    if (entity.questionForTermIndex !== entity.termIndex || Number(questionId) !== entity.questionId) {
        throw new Error("Time's up for that question. Try the new one!");
    }
}

function handleQuestionTimeouts(io, room, now = Date.now()) {
    if (room.phase !== 'playing' || isLuckyLanterns(room) || isWordCannon(room) || !questionSecondsForRoom(room)) return;
    const isTeam = isTeamFormat(room);
    const entities = isTeam ? Array.from(room.teams.values()) : Array.from(room.players.values());
    for (const entity of entities) {
        if (room.phase !== 'playing') return;
        if (!entity.questionEndsAt || now < entity.questionEndsAt) continue;
        if (entity.answerLocked || entity.pendingChallenge || entity.finished) continue;
        const result = expireQuestion(room, entity, isTeam);
        emitHostAnswerFeed(io, room, entity, result);
        if (isTeam) {
            deliverTeamAnswerResult(io, room, entity, result);
        } else if (entity.socketId) {
            result.nextQuestion = playerQuestionPayload(entity, room);
            io.to(entity.socketId).emit('live:answer-result', result);
        }
    }
}

function startGame(room) {
    if (room.phase === 'playing') throw new Error('Game is already in progress.');
    if (room.phase === 'finished') {
        resetRoomToLobby(room);
    }
    if (room.phase !== 'lobby') throw new Error('Game has ended.');
    const minPlayers = minPlayersForRoom(room);
    if (room.players.size < minPlayers) {
        throw new Error(`At least ${minPlayers} players are required to start.`);
    }
    if (isWordCannon(room)) {
        if (room.teamAssignment === 'pick') {
            ensureCannonTeams(room);
            const check = validateTeamsForStart(room);
            if (!check.ok) throw new Error(check.error);
        } else {
            buildRandomCannonTeams(room);
        }
        clearCannonTimer(room);
        room.challenges = new Map();
        const memberRows = (teamId) => room.teams.get(teamId).memberIds
            .map((id) => room.players.get(id))
            .filter(Boolean)
            .map((p) => ({ id: p.id, nickname: p.nickname }));
        room.cannon = createCannonMatch({
            teams: { red: memberRows('red'), blue: memberRows('blue') },
            deck: room.masterDeck,
            answerMode: room.answerMode,
            level: room.level,
            questionMs: questionSecondsForRoom(room) * 1000,
            gameMinutes: room.gameMinutes,
            // LIVE_CANNON_SEED: optional fixed battle seed for demos / inspection recordings.
            seed: room.cannonSeed ?? (process.env.LIVE_CANNON_SEED ? Number(process.env.LIVE_CANNON_SEED) : null),
        });
        for (const player of room.players.values()) {
            player.pendingChallenge = null;
            player.answerLocked = false;
            player.finished = false;
            player.termIndex = 0;
        }
        room.phase = 'playing';
        room.startedAt = Date.now();
        room.winnerId = null;
        room.winnerNickname = null;
        touchRoom(room);
        return true;
    }
    if (isLuckyLanterns(room)) {
        clearLanternTimer(room);
        room.challenges = new Map();
        room.lantern = createLanternMatch({
            players: Array.from(room.players.values()).map((p) => ({ id: p.id, nickname: p.nickname })),
            deck: room.masterDeck,
            rounds: room.lanternRounds,
            answerMode: room.answerMode,
            level: room.level,
            questionMs: questionSecondsForRoom(room) * 1000,
            tutorialMs: LANTERN_TUTORIAL_MS,
        });
        for (const player of room.players.values()) {
            player.pendingChallenge = null;
            player.answerLocked = false;
            player.finished = false;
            player.termIndex = 0;
        }
        room.phase = 'playing';
        room.startedAt = Date.now();
        room.winnerId = null;
        room.winnerNickname = null;
        touchRoom(room);
        return true;
    }
    if (isTeamFormat(room)) {
        if (room.teamAssignment === 'random' || !teamsCoverPlayers(room)) {
            if (room.teamAssignment === 'random') {
                clearAllTeams(room);
                buildRandomTeams(room);
            } else {
                const check = validateTeamsForStart(room);
                throw new Error(check.error || 'Teams are not ready.');
            }
        }
        for (const team of room.teams.values()) {
            assignTeamTerms(team, room.masterDeck);
            team.relayTurnIndex = 0;
            team.pendingChallenge = null;
            clearTeamQuestionState(team);
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
    let keepLocked = false;
    try {
        const correct = matchesTermAnswer(answerText, entry.term);

        if (correct) {
            return processCorrectAnswerPlayer(room, player, entry, answerText);
        }

        setPendingChallenge(player, entry, answerText);
        keepLocked = true;
        return buildPendingWrongResult(player, entry, answerText, false);
    } finally {
        if (!keepLocked) player.answerLocked = false;
    }
}

function endGame(room) {
    if (isWordCannon(room) && room.cannon) {
        finishCannonEarly(room.cannon);
        const w = cannonWinners(room.cannon);
        room.winnerId = w.winner;
        room.winnerNickname = w.winnerNickname;
    }
    clearCannonTimer(room);
    if (isLuckyLanterns(room) && room.lantern) {
        finishLanternEarly(room.lantern);
        const winners = lanternWinners(room.lantern);
        room.winnerId = winners.winnerId;
        room.winnerNickname = winners.winnerNickname;
    }
    clearLanternTimer(room);
    room.phase = 'finished';
    room.finishedAt = Date.now();
    touchRoom(room);
}

let liveIo = null;
let questionClock = null;

function clearLanternTimer(room) {
    if (!room?.lanternTimer) return;
    clearTimeout(room.lanternTimer);
    room.lanternTimer = null;
}

function lanternConnectedMap(room) {
    const connected = {};
    for (const player of room.players.values()) {
        connected[player.id] = Boolean(player.socketId);
    }
    return connected;
}

function emitLanternState(io, room) {
    if (!io || !room?.lantern) return;
    const connected = lanternConnectedMap(room);
    if (room.hostSocketId) {
        io.to(room.hostSocketId).emit('live:lantern-state', lanternPublicView(room.lantern, { forHost: true, connected }));
    }
    for (const player of room.players.values()) {
        if (!player.socketId) continue;
        io.to(player.socketId).emit('live:lantern-state', lanternPublicView(room.lantern, {
            playerId: player.id,
            connected,
        }));
    }
}

function deliverLanternQuestions(io, room) {
    const match = room.lantern;
    if (!match || match.phase !== 'question') return;
    for (const player of room.players.values()) {
        if (!player.socketId) continue;
        const answer = match.answers[player.id];
        if (answer?.submitted) continue;
        const q = playerQuestionPayload(player, room);
        if (q) io.to(player.socketId).emit('live:your-question', q);
    }
}

function finishLanternRoom(io, room, onGameEnd) {
    if (!room?.lantern) return;
    clearLanternTimer(room);
    const winners = lanternWinners(room.lantern);
    room.lantern.phase = 'finished';
    room.phase = 'finished';
    room.finishedAt = Date.now();
    room.winnerId = winners.winnerId;
    room.winnerNickname = winners.winnerNickname;
    touchRoom(room);
    const payload = gameFinishedPayload(room);
    io.to(`room:${room.code}`).emit('live:game-finished', payload);
    if (onGameEnd) onGameEnd(room);
}

/** Tell every player who ran out of time: same wrong-answer result as a wrong answer ("Time's up"). */
function emitTimeoutResults(io, room, items) {
    for (const { playerId, result } of items || []) {
        const player = room.players.get(playerId);
        if (player?.socketId) io.to(player.socketId).emit('live:answer-result', result);
    }
}

function armLanternTimer(io, room, onGameEnd) {
    clearLanternTimer(room);
    const match = room?.lantern;
    if (!match || room.phase !== 'playing' || match.phaseEndsAt == null) return;
    const code = room.code;
    const expectedPhase = match.phase;
    const endsAt = match.phaseEndsAt;
    room.lanternTimer = setTimeout(() => {
        const live = getRoom(code);
        if (!live?.lantern || live.phase !== 'playing') return;
        if (live.lantern.phase !== expectedPhase || live.lantern.phaseEndsAt !== endsAt) return;
        if (expectedPhase === 'question') {
            closeLanternAnswering(live.lantern, Date.now());
            emitTimeoutResults(io, live, lanternTimeoutResults(live.lantern));
        } else if (expectedPhase === 'review') expireLanternReview(live.lantern, Date.now());
        else if (expectedPhase === 'picking') closeLanternPicks(live.lantern, Date.now());
        else if (expectedPhase === 'reveal') advanceLantern(live.lantern, Date.now());
        afterLanternChange(io, live, onGameEnd, { deliverQuestions: live.lantern.phase === 'question' });
    }, Math.max(0, endsAt - Date.now()));
}

function releaseLanternDecisions(io, room, playerIds, { accept = false } = {}) {
    for (const playerId of playerIds || []) {
        const player = room.players.get(playerId);
        if (!player) continue;
        const challengeId = player.pendingChallenge?.challengeId || null;
        if (challengeId) room.challenges.delete(challengeId);
        clearPendingChallenge(player);
        const result = {
            lantern: true,
            gameFormat: 'lucky-lanterns',
            correct: Boolean(accept),
            reset: false,
            challengeable: false,
            challengeAccepted: Boolean(accept),
            challengeDeclined: !accept,
            progress: room.lantern?.scores?.[playerId] || 0,
            won: false,
            correctTerm: room.lantern?.entry?.term || '',
            definition: room.lantern?.entry?.definition || '',
        };
        if (player.socketId) io.to(player.socketId).emit('live:challenge-resolved', result);
        if (room.hostSocketId && challengeId) {
            io.to(room.hostSocketId).emit('live:challenge-resolved', {
                id: challengeId,
                accepted: Boolean(accept),
                entityId: playerId,
            });
        }
    }
}

function afterLanternChange(io, room, onGameEnd, { deliverQuestions = false } = {}) {
    if (!room?.lantern) return;
    if (room.lantern.phase === 'finished') {
        finishLanternRoom(io, room, onGameEnd);
        return;
    }
    if (deliverQuestions) deliverLanternQuestions(io, room);
    emitLanternState(io, room);
    armLanternTimer(io, room, onGameEnd);
    touchRoom(room);
}

// ---------------------------------------------------------------------------
// Word Cannon Battle
// ---------------------------------------------------------------------------

function clearCannonTimer(room) {
    if (!room?.cannonTimer) return;
    clearTimeout(room.cannonTimer);
    room.cannonTimer = null;
}

function cannonViewFor(room, opts) {
    return cannonPublicView(room.cannon, { ...opts, connected: lanternConnectedMap(room), now: Date.now() });
}

function emitCannonState(io, room) {
    if (!io || !room?.cannon) return;
    if (room.hostSocketId) {
        io.to(room.hostSocketId).emit('live:cannon-state', cannonViewFor(room, { forHost: true }));
    }
    for (const player of room.players.values()) {
        if (!player.socketId) continue;
        io.to(player.socketId).emit('live:cannon-state', cannonViewFor(room, { playerId: player.id }));
    }
}

function deliverCannonQuestions(io, room) {
    const match = room.cannon;
    if (!match || match.phase !== 'question') return;
    for (const player of room.players.values()) {
        if (!player.socketId) continue;
        if (match.answers[player.id]?.submitted) continue;
        const q = playerQuestionPayload(player, room);
        if (q) io.to(player.socketId).emit('live:your-question', q);
    }
}

function finishCannonRoom(io, room, onGameEnd) {
    if (!room?.cannon) return;
    clearCannonTimer(room);
    finishCannonEarly(room.cannon);
    const w = cannonWinners(room.cannon);
    room.phase = 'finished';
    room.finishedAt = Date.now();
    room.winnerId = w.winner;
    room.winnerNickname = w.winnerNickname;
    touchRoom(room);
    emitCannonState(io, room);
    io.to(`room:${room.code}`).emit('live:game-finished', gameFinishedPayload(room));
    if (onGameEnd) onGameEnd(room);
}

function armCannonTimer(io, room, onGameEnd) {
    clearCannonTimer(room);
    const match = room?.cannon;
    if (!match || room.phase !== 'playing' || match.phaseEndsAt == null) return;
    const code = room.code;
    const expectedPhase = match.phase;
    const endsAt = match.phaseEndsAt;
    room.cannonTimer = setTimeout(() => {
        const live = getRoom(code);
        if (!live?.cannon || live.phase !== 'playing') return;
        if (live.cannon.phase !== expectedPhase || live.cannon.phaseEndsAt !== endsAt) return;
        let skipped = [];
        if (expectedPhase === 'question') {
            closeCannonAnswering(live.cannon, Date.now());
            emitTimeoutResults(io, live, cannonTimeoutResults(live.cannon));
        } else if (expectedPhase === 'review') skipped = expireCannonReview(live.cannon, Date.now()).skipped;
        else advanceCannon(live.cannon, Date.now());
        releaseCannonDecisions(io, live, skipped, { accept: false });
        afterCannonChange(io, live, onGameEnd, { deliverQuestions: live.cannon.phase === 'question' });
    }, Math.max(0, endsAt - Date.now()));
}

function releaseCannonDecisions(io, room, playerIds, { accept = false } = {}) {
    for (const playerId of playerIds || []) {
        const player = room.players.get(playerId);
        if (!player) continue;
        const challengeId = player.pendingChallenge?.challengeId || null;
        if (challengeId) room.challenges.delete(challengeId);
        clearPendingChallenge(player);
        const result = {
            cannon: true,
            gameFormat: 'word-cannon',
            correct: Boolean(accept),
            reset: false,
            challengeable: false,
            challengeAccepted: Boolean(accept),
            challengeDeclined: !accept,
            progress: room.cannon?.stats?.[playerId]?.correct || 0,
            won: false,
            correctTerm: room.cannon?.entry?.term || '',
            definition: room.cannon?.entry?.definition || '',
        };
        if (player.socketId) io.to(player.socketId).emit('live:challenge-resolved', result);
        if (room.hostSocketId && challengeId) {
            io.to(room.hostSocketId).emit('live:challenge-resolved', {
                id: challengeId,
                accepted: Boolean(accept),
                entityId: playerId,
            });
        }
    }
}

function afterCannonChange(io, room, onGameEnd, { deliverQuestions = false } = {}) {
    if (!room?.cannon) return;
    if (room.cannon.phase === 'finished') {
        finishCannonRoom(io, room, onGameEnd);
        return;
    }
    if (deliverQuestions) deliverCannonQuestions(io, room);
    emitCannonState(io, room);
    armCannonTimer(io, room, onGameEnd);
    touchRoom(room);
}

function emitCannonPlayerSession(socket, room, player, payload) {
    const match = room.cannon;
    renameCannonPlayer(match, player.id, player.nickname);
    const answer = match.answers?.[player.id];
    if (room.phase === 'finished') {
        socket.emit('live:player-joined', payload);
        socket.emit('live:cannon-state', cannonViewFor(room, { playerId: player.id }));
        socket.emit('live:game-finished', gameFinishedPayload(room));
        return;
    }
    if (answer?.decision === 'prompt' || answer?.decision === 'pending') payload.awaitingChallenge = true;
    socket.emit('live:player-joined', payload);
    socket.emit('live:cannon-state', cannonViewFor(room, { playerId: player.id }));
    if (match.phase === 'question' && answer && !answer.submitted) {
        const question = playerQuestionPayload(player, room);
        if (question) socket.emit('live:your-question', question);
    } else if (answer?.decision === 'prompt') {
        socket.emit('live:answer-result', {
            correct: false,
            reset: false,
            challengeable: true,
            cannon: true,
            gameFormat: 'word-cannon',
            progress: match.stats[player.id]?.correct || 0,
            won: false,
            correctTerm: match.entry?.term || '',
            answerText: answer.answerText || '',
            definition: match.entry?.definition || '',
            questionId: match.questionId,
            team: match.playerTeam[player.id],
        });
    } else if (answer?.decision === 'pending') {
        socket.emit('live:challenge-submitted', { challengeId: player.pendingChallenge?.challengeId || null });
    }
}

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
    const housekeeping = setInterval(() => {
        const now = Date.now();
        for (const [code, room] of rooms) {
            if (now - room.lastActivityAt > ROOM_TTL_MS) rooms.delete(code);
        }
        for (const [ip, entry] of joinRateByIp) {
            if (now > entry.resetAt) joinRateByIp.delete(ip);
        }
    }, 5 * 60_000);
    if (typeof housekeeping.unref === 'function') housekeeping.unref();
    // One clock for all rooms; it always talks through the latest io instance.
    if (!questionClock) {
        questionClock = setInterval(() => {
            if (!liveIo) return;
            const now = Date.now();
            for (const room of rooms.values()) {
                try {
                    handleQuestionTimeouts(liveIo, room, now);
                } catch (err) {
                    console.error('[live] question timer', err);
                }
            }
        }, QUESTION_TIMER_TICK_MS);
        if (typeof questionClock.unref === 'function') questionClock.unref();
    }

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
                pendingChallenges: listPendingChallenges(room),
            });
            if (isLuckyLanterns(room) && room.lantern && room.phase === 'playing') {
                socket.emit('live:lantern-state', lanternPublicView(room.lantern, {
                    forHost: true,
                    connected: lanternConnectedMap(room),
                }));
            }
            if (isWordCannon(room) && room.cannon && room.phase === 'playing') {
                socket.emit('live:cannon-state', cannonViewFor(room, { forHost: true }));
            }
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
            if (isLuckyLanterns(room) && room.lantern && room.phase === 'playing') {
                emitLanternState(io, room);
            }
            if (isWordCannon(room) && room.cannon && room.phase === 'playing') {
                emitCannonState(io, room);
            }
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
            if (isWordCannon(room) && room.cannon) {
                const answer = room.cannon.answers?.[player.id];
                if (answer?.decision === 'prompt' || answer?.decision === 'pending') return;
                const q = playerQuestionPayload(player, room);
                if (q) socket.emit('live:your-question', q);
                socket.emit('live:cannon-state', cannonViewFor(room, { playerId: player.id }));
                return;
            }
            if (isLuckyLanterns(room) && room.lantern) {
                const answer = room.lantern.answers?.[player.id];
                if (answer?.decision === 'prompt' || answer?.decision === 'pending') return;
                const q = playerQuestionPayload(player, room);
                if (q) socket.emit('live:your-question', q);
                socket.emit('live:lantern-state', lanternPublicView(room.lantern, {
                    playerId: player.id,
                    connected: lanternConnectedMap(room),
                }));
                return;
            }
            const team = getPlayerTeam(room, player);
            const entity = isCaptainCrew(room) && team ? team : player;
            if (entity?.pendingChallenge) return;
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

        socket.on('live:unassign-player', ({ playerId }) => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'host' || socket.id !== room.hostSocketId) {
                socket.emit('live:error', { error: 'Host only.' });
                return;
            }
            try {
                hostUnassignPlayer(room, playerId);
                broadcastLobbyUpdate(room.code);
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:play-again', () => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'host' || socket.id !== room.hostSocketId) {
                socket.emit('live:error', { error: 'Host only.' });
                return;
            }
            try {
                if (room.phase !== 'finished') {
                    throw new Error('Play again is only available after a game ends.');
                }
                resetRoomToLobby(room);
                io.to(`room:${room.code}`).emit('live:lobby-reset', {
                    snapshot: publicRoomSnapshot(room),
                    progress: progressSnapshot(room),
                });
                broadcastLobbyUpdate(room.code);
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:set-settings', ({ gameFormat, teamAssignment, answerMode, lanternRounds, questionSeconds, gameMinutes, settingsSeq }) => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'host' || socket.id !== room.hostSocketId) {
                socket.emit('live:error', { error: 'Host only.' });
                return;
            }
            try {
                const wasFinished = room.phase === 'finished';
                setRoomSettings(room, { gameFormat, teamAssignment, answerMode, lanternRounds, questionSeconds, gameMinutes });
                const snapshot = publicRoomSnapshot(room);
                // Always refresh lobby for host + players (also covers finished → lobby).
                io.to(`room:${room.code}`).emit('live:lobby-reset', {
                    snapshot,
                    progress: progressSnapshot(room),
                    settingsSeq,
                });
                broadcastLobbyUpdate(room.code);
                socket.emit('live:settings-updated', {
                    gameFormat: room.gameFormat,
                    teamAssignment: room.teamAssignment,
                    answerMode: room.answerMode,
                    lanternRounds: room.lanternRounds,
                    gameMinutes: room.gameMinutes,
                    questionSeconds: room.questionSeconds || null,
                    questionTimeSec: questionSecondsForRoom(room),
                    snapshot,
                    resetFromFinished: wasFinished,
                    settingsSeq,
                });
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
                    termsToWin: isLuckyLanterns(room) ? (room.lantern?.rounds || room.lanternRounds) : LIVE_TERMS_TO_WIN,
                    minPlayers: minPlayersForRoom(room),
                    progress,
                    code: room.code,
                    gameFormat: room.gameFormat || 'race',
                    lanternRounds: room.lanternRounds,
                    gameMinutes: room.gameMinutes,
                    questionTimeSec: questionSecondsForRoom(room),
                });
                if (isWordCannon(room)) {
                    broadcastLobbyUpdate(room.code);
                    afterCannonChange(io, room, onGameEnd, { deliverQuestions: true });
                    return;
                }
                if (isLuckyLanterns(room)) {
                    afterLanternChange(io, room, onGameEnd, { deliverQuestions: true });
                    return;
                }
                await deliverQuestionsToAllPlayers(io, room);
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:crew-vote', ({ text, answer, questionId }) => {
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
                assertCurrentQuestion(room, team, questionId);
                submitCrewVote(room, socket.data.playerId, text ?? answer);
                emitTeamVoteUpdate(io, room, team);
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:submit-answer', ({ text, answer, questionId }) => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'player') {
                socket.emit('live:error', { error: 'Players only.' });
                return;
            }
            try {
                const player = room.players.get(socket.data.playerId);
                if (isWordCannon(room)) {
                    if (!room.cannon) throw new Error('Word Cannon Battle has not started.');
                    if (questionId != null && Number(questionId) !== room.cannon.questionId) {
                        throw new Error("Time's up for that question. Try the new one!");
                    }
                    const { result } = submitCannonAnswer(room.cannon, socket.data.playerId, text ?? answer, Date.now());
                    if (result.challengeable && player) {
                        setPendingChallenge(player, {
                            term: room.cannon.entry.term,
                            definition: room.cannon.entry.definition,
                        }, result.answerText);
                        player.questionId = room.cannon.questionId;
                        player.answerLocked = true;
                    }
                    socket.emit('live:answer-result', result);
                    afterCannonChange(io, room, onGameEnd);
                    return;
                }
                if (isLuckyLanterns(room)) {
                    if (!room.lantern) throw new Error('Lucky Lanterns has not started.');
                    const { result } = submitLanternAnswer(room.lantern, socket.data.playerId, text ?? answer, Date.now());
                    if (result.challengeable && player) {
                        setPendingChallenge(player, {
                            term: room.lantern.entry.term,
                            definition: room.lantern.entry.definition,
                        }, result.answerText);
                        player.questionId = room.lantern.questionId;
                        player.answerLocked = true;
                    }
                    socket.emit('live:answer-result', result);
                    afterLanternChange(io, room, onGameEnd);
                    return;
                }
                if (isCaptainCrew(room)) {
                    const team = player ? getPlayerTeam(room, player) : null;
                    if (!team) throw new Error('You are not on a team.');
                    assertCurrentQuestion(room, team, questionId);
                    const result = submitTeamAnswer(room, socket.data.playerId, text ?? answer);
                    emitHostAnswerFeed(io, room, team, result);
                    deliverTeamAnswerResult(io, room, team, result);

                    if (result.won) {
                        const finished = gameFinishedPayload(room);
                        io.to(`room:${room.code}`).emit('live:game-finished', finished);
                        if (onGameEnd) onGameEnd(room);
                        return;
                    }

                    if (!result.challengeable) emitProgress(io, room);
                    return;
                }
                if (isHotSparkRelay(room)) {
                    const team = player ? getPlayerTeam(room, player) : null;
                    if (!team) throw new Error('You are not on a team.');
                    const answerText = sanitizeAnswerText(text ?? answer);
                    if (!answerText) throw new Error('Choose an answer first.');
                    assertCurrentQuestion(room, team, questionId);
                    const result = processRelayAnswer(room, team, player, answerText);
                    emitHostAnswerFeed(io, room, team, result);
                    deliverTeamAnswerResult(io, room, team, result);

                    if (result.won) {
                        const finished = gameFinishedPayload(room);
                        io.to(`room:${room.code}`).emit('live:game-finished', finished);
                        if (onGameEnd) onGameEnd(room);
                        return;
                    }

                    if (!result.challengeable) emitProgress(io, room);
                    return;
                }

                assertCurrentQuestion(room, player, questionId);
                const result = submitAnswer(room, socket.data.playerId, text ?? answer);
                if (player) emitHostAnswerFeed(io, room, player, result);
                socket.emit('live:answer-result', result);

                if (result.won) {
                    const finished = gameFinishedPayload(room);
                    io.to(`room:${room.code}`).emit('live:game-finished', finished);
                    if (onGameEnd) onGameEnd(room);
                    return;
                }

                if (!result.challengeable) {
                    if (result.nextQuestion) {
                        socket.emit('live:your-question', result.nextQuestion);
                    }
                    emitProgress(io, room);
                }
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:challenge-answer', () => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'player') {
                socket.emit('live:error', { error: 'Players only.' });
                return;
            }
            try {
                if (isWordCannon(room)) {
                    if (!room.cannon) throw new Error('Word Cannon Battle has not started.');
                    const challenge = submitChallenge(room, socket.data.playerId);
                    markCannonChallengePending(room.cannon, socket.data.playerId, Date.now());
                    emitChallengePending(io, room, challenge);
                    socket.emit('live:challenge-submitted', { challengeId: challenge.id });
                    afterCannonChange(io, room, onGameEnd);
                    return;
                }
                if (isLuckyLanterns(room)) {
                    if (!room.lantern) throw new Error('Lucky Lanterns has not started.');
                    const challenge = submitChallenge(room, socket.data.playerId);
                    markLanternChallengePending(room.lantern, socket.data.playerId, Date.now());
                    emitChallengePending(io, room, challenge);
                    socket.emit('live:challenge-submitted', { challengeId: challenge.id });
                    afterLanternChange(io, room, onGameEnd);
                    return;
                }
                const challenge = submitChallenge(room, socket.data.playerId);
                emitChallengePending(io, room, challenge);
                const player = room.players.get(socket.data.playerId);
                const team = player ? getPlayerTeam(room, player) : null;
                const payload = { challengeId: challenge.id };
                if ((isCaptainCrew(room) || isHotSparkRelay(room)) && team) {
                    for (const memberId of team.memberIds) {
                        const member = room.players.get(memberId);
                        if (member?.socketId) io.to(member.socketId).emit('live:challenge-submitted', payload);
                    }
                } else {
                    socket.emit('live:challenge-submitted', payload);
                }
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:skip-challenge', () => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'player') {
                socket.emit('live:error', { error: 'Players only.' });
                return;
            }
            try {
                const player = room.players.get(socket.data.playerId);
                if (isWordCannon(room)) {
                    if (!room.cannon) throw new Error('Word Cannon Battle has not started.');
                    const { result } = skipCannonPrompt(room.cannon, socket.data.playerId, Date.now());
                    if (player) clearPendingChallenge(player);
                    if (player?.socketId) io.to(player.socketId).emit('live:challenge-resolved', result);
                    afterCannonChange(io, room, onGameEnd);
                    return;
                }
                if (isLuckyLanterns(room)) {
                    if (!room.lantern) throw new Error('Lucky Lanterns has not started.');
                    const { result } = skipLanternPrompt(room.lantern, socket.data.playerId, Date.now());
                    if (player) clearPendingChallenge(player);
                    if (player?.socketId) io.to(player.socketId).emit('live:challenge-resolved', result);
                    afterLanternChange(io, room, onGameEnd);
                    return;
                }
                const result = skipChallenge(room, socket.data.playerId);
                if (isCaptainCrew(room) || isHotSparkRelay(room)) {
                    const team = player ? getPlayerTeam(room, player) : null;
                    if (!team) throw new Error('You are not on a team.');
                    deliverEntityOutcome(io, room, team, true, result, onGameEnd);
                } else if (player) {
                    deliverEntityOutcome(io, room, player, false, result, onGameEnd);
                }
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:resolve-challenge', (payload = {}) => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'host' || socket.id !== room.hostSocketId) {
                socket.emit('live:error', { error: 'Host only.' });
                return;
            }
            try {
                const challengeId = String(payload.challengeId || '');
                // Explicit reject / decline always wins over a missing accept flag.
                const accept = payload.reject || payload.decline
                    ? false
                    : Boolean(payload.accept);
                if (isWordCannon(room)) {
                    if (!room.cannon) throw new Error('Word Cannon Battle has not started.');
                    const challenge = room.challenges.get(challengeId);
                    if (!challenge || challenge.status !== 'pending') {
                        throw new Error('Challenge not found or already resolved.');
                    }
                    const { result } = settleCannonChallenge(room.cannon, challenge.entityId, accept, Date.now());
                    const player = room.players.get(challenge.entityId);
                    if (player) clearPendingChallenge(player);
                    room.challenges.delete(challengeId);
                    if (player?.socketId) io.to(player.socketId).emit('live:challenge-resolved', result);
                    io.to(room.hostSocketId).emit('live:challenge-resolved', {
                        id: challengeId,
                        accepted: accept,
                        entityId: challenge.entityId,
                    });
                    afterCannonChange(io, room, onGameEnd);
                    return;
                }
                if (isLuckyLanterns(room)) {
                    if (!room.lantern) throw new Error('Lucky Lanterns has not started.');
                    const challenge = room.challenges.get(challengeId);
                    if (!challenge || challenge.status !== 'pending') {
                        throw new Error('Challenge not found or already resolved.');
                    }
                    const { result } = settleLanternChallenge(room.lantern, challenge.entityId, accept, Date.now());
                    const player = room.players.get(challenge.entityId);
                    if (player) clearPendingChallenge(player);
                    room.challenges.delete(challengeId);
                    if (player?.socketId) io.to(player.socketId).emit('live:challenge-resolved', result);
                    io.to(room.hostSocketId).emit('live:challenge-resolved', {
                        id: challengeId,
                        accepted: accept,
                        entityId: challenge.entityId,
                    });
                    afterLanternChange(io, room, onGameEnd);
                    return;
                }
                resolveChallenge(io, room, challengeId, accept, onGameEnd);
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:lantern-pick', ({ pick, choice }) => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'player') {
                socket.emit('live:error', { error: 'Players only.' });
                return;
            }
            if (!isLuckyLanterns(room) || !room.lantern) {
                socket.emit('live:error', { error: 'Lantern picks are only used in Lucky Lanterns.' });
                return;
            }
            try {
                pickLantern(room.lantern, socket.data.playerId, pick ?? choice, Date.now());
                afterLanternChange(io, room, onGameEnd);
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:lantern-skip', () => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'host' || socket.id !== room.hostSocketId) {
                socket.emit('live:error', { error: 'Host only.' });
                return;
            }
            if (!isLuckyLanterns(room) || !room.lantern) {
                socket.emit('live:error', { error: 'Lucky Lanterns is not running.' });
                return;
            }
            try {
                const outcome = hostSkipLantern(room.lantern, Date.now());
                emitTimeoutResults(io, room, lanternTimeoutResults(room.lantern));
                releaseLanternDecisions(io, room, outcome.skipped, { accept: false });
                releaseLanternDecisions(io, room, outcome.declined, { accept: false });
                afterLanternChange(io, room, onGameEnd, { deliverQuestions: room.lantern.phase === 'question' });
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:lantern-next', () => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'host' || socket.id !== room.hostSocketId) {
                socket.emit('live:error', { error: 'Host only.' });
                return;
            }
            if (!isLuckyLanterns(room) || !room.lantern) {
                socket.emit('live:error', { error: 'Lucky Lanterns is not running.' });
                return;
            }
            try {
                if (room.lantern.phase !== 'reveal') {
                    socket.emit('live:error', { error: 'Next round is available after the reveal.' });
                    return;
                }
                advanceLantern(room.lantern, Date.now());
                afterLanternChange(io, room, onGameEnd, { deliverQuestions: room.lantern.phase === 'question' });
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:cannon-skip', () => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'host' || socket.id !== room.hostSocketId) {
                socket.emit('live:error', { error: 'Host only.' });
                return;
            }
            if (!isWordCannon(room) || !room.cannon || room.phase !== 'playing') {
                socket.emit('live:error', { error: 'Word Cannon Battle is not running.' });
                return;
            }
            try {
                const outcome = hostSkipCannon(room.cannon, Date.now());
                emitTimeoutResults(io, room, cannonTimeoutResults(room.cannon));
                releaseCannonDecisions(io, room, outcome.skipped, { accept: false });
                releaseCannonDecisions(io, room, outcome.declined, { accept: false });
                afterCannonChange(io, room, onGameEnd, { deliverQuestions: room.cannon.phase === 'question' });
            } catch (err) {
                socket.emit('live:error', { error: err.message });
            }
        });

        socket.on('live:cannon-next', () => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'host' || socket.id !== room.hostSocketId) {
                socket.emit('live:error', { error: 'Host only.' });
                return;
            }
            if (!isWordCannon(room) || !room.cannon || room.phase !== 'playing') {
                socket.emit('live:error', { error: 'Word Cannon Battle is not running.' });
                return;
            }
            try {
                if (room.cannon.phase !== 'volley' && room.cannon.phase !== 'intro') {
                    socket.emit('live:error', { error: 'Next is available after the volley.' });
                    return;
                }
                advanceCannon(room.cannon, Date.now());
                afterCannonChange(io, room, onGameEnd, { deliverQuestions: room.cannon.phase === 'question' });
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
            if (isWordCannon(room) && room.cannon) emitCannonState(io, room);
            io.to(`room:${room.code}`).emit('live:game-finished', gameFinishedPayload(room));
            if (onGameEnd) onGameEnd(room);
        });

        socket.on('live:close-room', () => {
            const room = getRoom(socket.data.roomCode);
            if (!room || socket.data.liveRole !== 'host' || socket.id !== room.hostSocketId) {
                socket.emit('live:error', { error: 'Host only.' });
                return;
            }
            for (const player of room.players.values()) {
                if (!player.socketId) continue;
                io.to(player.socketId).emit('live:player-removed', {
                    message: 'The host started a new Live Spark room.',
                });
                const playerSocket = io.sockets.sockets.get(player.socketId);
                if (playerSocket) {
                    playerSocket.leave(`room:${room.code}`);
                    playerSocket.data.liveRole = null;
                    playerSocket.data.playerId = null;
                }
            }
            destroyRoom(room.code, room.hostToken);
            socket.emit('live:room-closed', { ok: true });
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
                    if (isLuckyLanterns(room) && room.lantern && room.phase === 'playing') {
                        emitLanternState(io, room);
                    }
                    if (isWordCannon(room) && room.cannon && room.phase === 'playing') {
                        emitCannonState(io, room);
                    }
                }
            }
        });
    });
}
