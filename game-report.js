/**
 * Live Spark game reports (server side, authoritative).
 * Stats are collected while the game runs (questions sent, answers, accepted challenges) and turned
 * into a report when the game finishes. The host can download it as CSV (UTF-8 + BOM) or PDF.
 */
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT = {
    regular: path.join(HERE, 'fonts', 'Poppins-Regular.ttf'),
    semibold: path.join(HERE, 'fonts', 'Poppins-SemiBold.ttf'),
    bold: path.join(HERE, 'fonts', 'Poppins-Bold.ttf'),
};
const LOGO = path.join(HERE, 'assets', 'brand', 'lingospark-logo-red.png');

export const GAME_LABELS = {
    race: 'Solo race',
    'captain-crew': 'Captain & Crew',
    'hot-spark-relay': 'Hot Spark Relay',
    'lucky-lanterns': 'Lucky Lanterns',
    'word-cannon': 'Word Cannon Battle',
};
export const REPORT_TIME_ZONE = 'Europe/Warsaw';
const TOP_MISSES = 10;

/* ---------------- collection ---------------- */

export function initReportStats(room, now = Date.now()) {
    room.reportStats = { startedAt: now, players: new Map(), misses: new Map(), questions: new Map() };
    return room.reportStats;
}

function playerRow(stats, playerId) {
    let row = stats.players.get(playerId);
    if (!row) {
        row = { answers: 0, correct: 0, timedMs: 0, timedCount: 0 };
        stats.players.set(playerId, row);
    }
    return row;
}

/** A question reached a player (first time per question id starts their answer clock). */
export function noteQuestionSent(room, playerId, questionId, now = Date.now()) {
    const stats = room?.reportStats;
    if (!stats || playerId == null || questionId == null) return;
    const prev = stats.questions.get(playerId);
    if (prev && prev.id === questionId) return;
    stats.questions.set(playerId, { id: questionId, at: now });
}

/** A player submitted an answer; `result` is the engine's answer result. */
export function noteAnswer(room, playerId, result, now = Date.now()) {
    const stats = room?.reportStats;
    if (!stats || playerId == null || !result) return;
    const row = playerRow(stats, playerId);
    row.answers += 1;
    if (result.correct) row.correct += 1;
    const q = stats.questions.get(playerId);
    if (q && !q.answered) {
        const ms = now - q.at;
        if (ms >= 0 && ms < 10 * 60 * 1000) {
            row.timedMs += ms;
            row.timedCount += 1;
        }
        q.answered = true;
    }
    if (!result.correct) {
        const term = String(result.correctTerm || result.term || '').trim();
        if (term) {
            const key = term.toLowerCase();
            const miss = stats.misses.get(key) || { term, count: 0, prompt: '' };
            miss.count += 1;
            if (!miss.prompt && result.definition) miss.prompt = String(result.definition).trim().slice(0, 200);
            stats.misses.set(key, miss);
        }
    }
}

/** The teacher accepted a challenge: that answer counts as correct after all. */
export function noteChallengeAccepted(room, playerId, term) {
    const stats = room?.reportStats;
    if (!stats || playerId == null) return;
    const row = playerRow(stats, playerId);
    row.correct = Math.min(row.answers, row.correct + 1);
    const key = String(term || '').trim().toLowerCase();
    const miss = key && stats.misses.get(key);
    if (miss) {
        miss.count -= 1;
        if (miss.count <= 0) stats.misses.delete(key);
    }
}

/* ---------------- building ---------------- */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round1 = (v) => Math.round(v * 10) / 10;

export function formatWarsaw(ms) {
    if (!ms) return '';
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(ms)).replace(',', '');
}

export function formatDuration(ms) {
    const s = Math.max(0, Math.round(num(ms) / 1000));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Build the report object.
 * @param room       live room (players, teams, settings, reportStats)
 * @param finished   gameFinishedPayload(room) — ranks/points per format
 * @param ctx        { questionSeconds, challengesEnabled, now }
 */
export function buildGameReport(room, finished = {}, ctx = {}) {
    const stats = room.reportStats || { players: new Map(), misses: new Map(), startedAt: room.startedAt };
    const format = room.gameFormat || 'race';
    const startedAt = stats.startedAt || room.startedAt || null;
    const endedAt = room.finishedAt || ctx.now || Date.now();
    const finishedRows = new Map((finished.players || []).map((p) => [p.id, p]));
    const cannonTeamOf = {};
    if (finished.teams && !Array.isArray(finished.teams)) {
        for (const t of Object.values(finished.teams)) for (const id of t.memberIds || []) cannonTeamOf[id] = t.name || t.id;
    }
    const teamOf = (player) => {
        if (cannonTeamOf[player.id]) return cannonTeamOf[player.id];
        for (const t of room.teams?.values?.() || []) {
            if ((t.memberIds || []).includes(player.id)) return t.name || t.id;
        }
        return '';
    };

    const players = Array.from(room.players.values()).map((p) => {
        const s = stats.players.get(p.id) || { answers: 0, correct: 0, timedMs: 0, timedCount: 0 };
        const f = finishedRows.get(p.id) || {};
        const points = format === 'word-cannon' ? num(f.damage ?? f.hits)
            : format === 'lucky-lanterns' ? num(f.score ?? f.progress)
            : num(f.progress ?? p.termIndex ?? s.correct);
        return {
            id: p.id,
            name: p.nickname || '?',
            team: teamOf(p),
            rank: f.rank ?? null,
            points: round1(points),
            ...(format === 'word-cannon' ? { hits: num(f.hits) } : {}),
            answers: s.answers,
            correct: s.correct,
            pctCorrect: s.answers ? Math.round((100 * s.correct) / s.answers) : 0,
            avgAnswerSec: s.timedCount ? round1(s.timedMs / s.timedCount / 1000) : null,
        };
    });
    // Rank: engine rank when it has one per player, else by points then correct answers.
    const ranked = [...players].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || b.points - a.points || b.correct - a.correct || a.name.localeCompare(b.name));
    let lastKey = null;
    let lastRank = 0;
    ranked.forEach((p, i) => {
        if (p.rank == null) {
            const key = `${p.points}|${p.correct}`;
            p.rank = key === lastKey ? lastRank : i + 1;
            lastKey = key;
            lastRank = p.rank;
        }
    });

    let teams = [];
    if (format === 'word-cannon' && finished.teams) {
        teams = Object.values(finished.teams).map((t) => ({
            name: t.name || t.id,
            members: (t.memberIds || []).length,
            points: round1(num(t.points)),
            wins: num(t.fortKills),
            winsLabel: 'Forts destroyed',
            winner: finished.winner === t.id,
        }));
    } else if (room.teams && room.teams.size) {
        teams = Array.from(room.teams.values()).map((t) => {
            const members = players.filter((p) => (t.memberIds || []).includes(p.id));
            return {
                name: t.name || t.id,
                members: members.length,
                points: num(t.termIndex ?? t.progress),
                wins: room.winnerId === t.id ? 1 : 0,
                winsLabel: 'Won',
                winner: room.winnerId === t.id,
                correct: members.reduce((a, p) => a + p.correct, 0),
            };
        });
    }
    for (const t of teams) {
        const members = players.filter((p) => p.team === t.name);
        t.answers = members.reduce((a, p) => a + p.answers, 0);
        t.correct = members.reduce((a, p) => a + p.correct, 0);
    }

    const missedWords = Array.from(stats.misses.values())
        .filter((m) => m.count > 0)
        .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
        .slice(0, TOP_MISSES)
        .map((m) => ({ term: m.term, prompt: m.prompt || '', misses: m.count }));

    const totals = players.reduce((a, p) => ({ answers: a.answers + p.answers, correct: a.correct + p.correct }), { answers: 0, correct: 0 });
    return {
        version: 1,
        code: room.code,
        game: GAME_LABELS[format] || format,
        gameFormat: format,
        startedAt,
        endedAt,
        dateLabel: formatWarsaw(startedAt || endedAt),
        timeZone: REPORT_TIME_ZONE,
        durationMs: startedAt ? Math.max(0, endedAt - startedAt) : 0,
        wordSet: room.deckLabel || `Built-in ${room.level || ''}`.trim(),
        settings: {
            questionSeconds: ctx.questionSeconds ?? null,
            challenges: ctx.challengesEnabled === false ? 'Off' : 'On',
            answerMode: room.answerMode || '',
            ...(format === 'lucky-lanterns' ? { rounds: room.lanternRounds } : {}),
            ...(format === 'word-cannon' ? { minutes: room.gameMinutes } : {}),
        },
        pointsLabel: format === 'word-cannon' ? 'Damage' : format === 'lucky-lanterns' ? 'Score' : 'Points',
        winner: finished.winnerNickname
            || (finished.winner && !Array.isArray(finished.teams) && finished.teams?.[finished.winner]?.name)
            || (finished.winner === 'draw' ? 'Draw' : '')
            || '',
        totals: { ...totals, pctCorrect: totals.answers ? Math.round((100 * totals.correct) / totals.answers) : 0 },
        players: ranked,
        teams,
        missedWords,
    };
}

/* ---------------- CSV ---------------- */

function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvLine = (cells) => cells.map(csvCell).join(',');

/** UTF-8 with BOM so Excel opens Polish characters correctly. */
export function reportToCsv(r) {
    const lines = [];
    lines.push(csvLine(['LingoSpark — Live Spark game report']));
    lines.push(csvLine(['Game', r.game]));
    lines.push(csvLine(['Date', `${r.dateLabel} (${r.timeZone})`]));
    lines.push(csvLine(['Room', r.code]));
    lines.push(csvLine(['Word set', r.wordSet]));
    lines.push(csvLine(['Duration', formatDuration(r.durationMs)]));
    lines.push(csvLine(['Time per question', r.settings.questionSeconds ? `${r.settings.questionSeconds} s` : 'Game default']));
    lines.push(csvLine(['Challenges', r.settings.challenges]));
    if (r.winner) lines.push(csvLine(['Winner', r.winner]));
    lines.push('');
    lines.push(csvLine(['Players']));
    const hits = r.players.some((p) => p.hits != null);
    lines.push(csvLine(['Rank', 'Name', 'Team', ...(hits ? ['Hits'] : []), r.pointsLabel || 'Points', 'Answers', 'Correct', '% correct', 'Avg answer time (s)']));
    for (const p of r.players) {
        lines.push(csvLine([p.rank, p.name, p.team, ...(hits ? [p.hits] : []), p.points, p.answers, p.correct, `${p.pctCorrect}%`, p.avgAnswerSec ?? '']));
    }
    if (r.teams.length) {
        lines.push('');
        lines.push(csvLine(['Teams']));
        lines.push(csvLine(['Team', 'Players', 'Points', r.teams[0].winsLabel || 'Wins', 'Answers', 'Correct', 'Winner']));
        for (const t of r.teams) lines.push(csvLine([t.name, t.members, t.points, t.wins, t.answers, t.correct, t.winner ? 'Yes' : '']));
    }
    lines.push('');
    lines.push(csvLine(['Most-missed words']));
    lines.push(csvLine(['Correct answer', 'Misses', 'Prompt']));
    if (!r.missedWords.length) lines.push(csvLine(['(no missed words)', '', '']));
    for (const m of r.missedWords) lines.push(csvLine([m.term, m.misses, m.prompt || '']));
    return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/* ---------------- PDF ---------------- */

const RED = '#C8102E';
const NAVY = '#14213D';
const MUTED = '#6B7280';
const LINE = '#E5E7EB';

/** Render the report as a one-page-ish A4 PDF. Resolves with a Buffer. */
export function reportToPdf(r) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `LingoSpark report ${r.code}`, Author: 'LingoSpark' } });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.registerFont('R', FONT.regular);
        doc.registerFont('S', FONT.semibold);
        doc.registerFont('B', FONT.bold);
        const W = doc.page.width - 80;
        const X = 40;

        // header
        doc.rect(0, 0, doc.page.width, 6).fill(RED);
        try { doc.image(LOGO, X, 22, { height: 30 }); } catch { doc.font('B').fontSize(20).fillColor(RED).text('LingoSpark', X, 22); }
        doc.font('B').fontSize(18).fillColor(NAVY).text(`${r.game} — game report`, X, 62, { width: W });
        doc.font('R').fontSize(9.5).fillColor(MUTED)
            .text(`${r.dateLabel} (${r.timeZone})  ·  Room ${r.code}  ·  Duration ${formatDuration(r.durationMs)}`, X, doc.y + 2, { width: W });

        // summary chips
        const chips = [
            ['Word set', r.wordSet],
            ['Time per question', r.settings.questionSeconds ? `${r.settings.questionSeconds} s` : 'Game default'],
            ['Challenges', r.settings.challenges],
            ['Players', String(r.players.length)],
            ['Correct overall', `${r.totals.correct}/${r.totals.answers} (${r.totals.pctCorrect}%)`],
            ...(r.winner ? [['Winner', r.winner]] : []),
        ];
        let cy = doc.y + 10;
        const cw = (W - 10) / 3;
        chips.forEach(([k, v], i) => {
            const cx = X + (i % 3) * (cw + 5);
            if (i && i % 3 === 0) cy += 42;
            doc.roundedRect(cx, cy, cw, 36, 6).lineWidth(1).strokeColor(LINE).fillAndStroke('#FFF7F8', LINE);
            doc.font('S').fontSize(7.5).fillColor(RED).text(k.toUpperCase(), cx + 8, cy + 5, { width: cw - 16, characterSpacing: 0.4 });
            doc.font('S').fontSize(10).fillColor(NAVY).text(v, cx + 8, cy + 16, { width: cw - 16, height: 14, ellipsis: true, lineBreak: false });
        });
        doc.y = cy + 50;

        const section = (title) => {
            doc.moveDown(0.3);
            const y = doc.y;
            doc.rect(X, y + 3, 4, 13).fill(RED);
            doc.font('B').fontSize(12).fillColor(NAVY).text(title, X + 10, y, { width: W - 10 });
            doc.moveDown(0.25);
        };
        const table = (cols, rows) => {
            const totalW = cols.reduce((a, c) => a + c.w, 0);
            const scale = W / totalW;
            const xs = [];
            let acc = X;
            cols.forEach((c) => { xs.push(acc); acc += c.w * scale; });
            const drawRow = (cells, { head = false, zebra = false } = {}) => {
                const y = doc.y;
                if (y > doc.page.height - 60) { doc.addPage(); doc.y = 40; }
                const ry = doc.y;
                if (head) doc.rect(X, ry, W, 18).fill(NAVY);
                else if (zebra) doc.rect(X, ry, W, 17).fill('#F7F7FB');
                cells.forEach((cell, i) => {
                    doc.font(head ? 'S' : (i === 1 ? 'S' : 'R')).fontSize(head ? 8 : 8.8).fillColor(head ? '#FFFFFF' : NAVY)
                        .text(String(cell ?? ''), xs[i] + 5, ry + (head ? 4.5 : 3.5), {
                            width: cols[i].w * scale - 10, height: 11, align: cols[i].align || 'left', lineBreak: false, ellipsis: true,
                        });
                });
                doc.y = ry + (head ? 18 : 17);
            };
            drawRow(cols.map((c) => c.h), { head: true });
            rows.forEach((row, i) => drawRow(row, { zebra: i % 2 === 1 }));
            doc.moveTo(X, doc.y).lineTo(X + W, doc.y).lineWidth(1).strokeColor(LINE).stroke();
            doc.y += 6;
        };

        section('Players');
        const hasTeams = r.players.some((p) => p.team);
        table([
            { h: '#', w: 26, align: 'right' }, { h: 'Name', w: 130 }, ...(hasTeams ? [{ h: 'Team', w: 70 }] : []),
            ...(r.players.some((p) => p.hits != null) ? [{ h: 'Hits', w: 40, align: 'right' }] : []),
            { h: r.pointsLabel || 'Points', w: 52, align: 'right' }, { h: 'Answers', w: 56, align: 'right' }, { h: 'Correct', w: 54, align: 'right' },
            { h: '% correct', w: 60, align: 'right' }, { h: 'Avg time', w: 60, align: 'right' },
        ], r.players.map((p) => [
            p.rank, p.name, ...(hasTeams ? [p.team] : []), ...(p.hits != null ? [p.hits] : []), p.points, p.answers, p.correct, `${p.pctCorrect}%`,
            p.avgAnswerSec == null ? '—' : `${p.avgAnswerSec.toFixed(1)} s`,
        ]));

        if (r.teams.length) {
            section('Teams');
            table([
                { h: 'Team', w: 140 }, { h: 'Players', w: 60, align: 'right' }, { h: 'Points', w: 70, align: 'right' },
                { h: r.teams[0].winsLabel || 'Wins', w: 100, align: 'right' }, { h: 'Correct / answers', w: 110, align: 'right' },
            ], r.teams.map((t) => [`${t.name}${t.winner ? ' (winner)' : ''}`, t.members, t.points, t.wins, `${t.correct}/${t.answers}`]));
        }

        section('Most-missed words');
        if (!r.missedWords.length) {
            doc.font('R').fontSize(9.5).fillColor(MUTED).text('No missed words — great game!', X, doc.y, { width: W });
            doc.moveDown(0.5);
        } else {
            table([{ h: '#', w: 26, align: 'right' }, { h: 'Correct answer', w: 150 }, { h: 'Prompt', w: 290 }, { h: 'Misses', w: 50, align: 'right' }],
                r.missedWords.map((m, i) => [i + 1, m.term, m.prompt || '', m.misses]));
        }

        doc.page.margins.bottom = 0; // footer sits in the margin; don't spill onto a new page
        doc.font('R').fontSize(7.5).fillColor(MUTED)
            .text(`Generated by LingoSpark Live Spark · lingospark.study · times in ${r.timeZone}. Challenges accepted by the teacher count as correct.`,
                X, doc.page.height - 34, { width: W, align: 'center', lineBreak: false });
        doc.end();
    });
}

export function reportFileBase(r) {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .format(new Date(r.startedAt || r.endedAt)).replace(/[^0-9]+/g, '-').replace(/-+$/, '');
    const slug = String(r.gameFormat || 'game').replace(/[^a-z0-9-]/gi, '');
    return `lingospark-${slug}-${r.code}-${d}`;
}
