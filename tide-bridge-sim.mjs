// Headless simulation of The Bridge server state machine (no sockets, no browser, no real time).
// Used by tide-bridge.test.js; run `node tide-bridge-sim.mjs` to print a summary of the three canonical endings.
import {
    createTideMatch, tickTide, submitTideAnswer, tideQuestionPayload, tidePublicView, tideWinners, finishTideEarly, ROUND_COUNT,
} from './tide-bridge.js';

export const DECK = Array.from({ length: 20 }, (_, i) => ({ term: `term${i}`, definition: `definition of term${i}` }));

/**
 * Plays a whole match on a fake clock (250 ms steps). Every vocab span / shore challenge, players answer one after
 * another every `answerEveryMs(match)` ms (correct unless `wrongFirst`), starting one interval after the phase begins.
 */
export function simulate({
    minutes = 10, playerCount = 5, answerMode = 'randomise', seed = 1, answerEveryMs = () => 1500, wrongFirst = false,
    stopAfterMs = 30 * 60_000, onStep = null,
} = {}) {
    const players = Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, nickname: `P${i}` }));
    let now = 1_000_000;
    const match = createTideMatch({ players, deck: DECK, answerMode, gameMinutes: minutes, seed, now });
    const t0 = now;
    const log = { phases: new Set(), events: [], shores: [], maxTideRatio: 0, errors: [], wrongSeen: 0, tideTicksWhilePaused: 0 };
    let nextAnswerAt = now + answerEveryMs(match);
    let lastKey = '';
    let guard = 0;
    while (!match.finished && now - t0 < stopAfterMs && guard++ < 200000) {
        now += 250;
        const before = tidePublicView(match, { now: now - 250 });
        const out = tickTide(match, now);
        const view = tidePublicView(match, { now });
        log.phases.add(match.phase);
        log.maxTideRatio = Math.max(log.maxTideRatio, view.tideRatio);
        // the round tide must not move while paused (between / roundTransition) — compare consecutive views
        if ((before.phase === 'between' || before.phase === 'roundTransition') && (view.phase === before.phase) && view.tideElapsedMs !== before.tideElapsedMs) {
            log.tideTicksWhilePaused += 1;
        }
        const key = `${match.round}|${match.phase}|${match.spanIndex}|${match.shoreDone}`;
        if (key !== lastKey) { lastKey = key; nextAnswerAt = now + answerEveryMs(match); log.events.push({ t: now - t0, round: match.round, phase: match.phase, span: match.spanIndex }); }
        if (onStep) onStep(match, now, out);
        if (match.finished) break;
        if ((match.phase === 'vocab' || match.phase === 'breaker') && now >= nextAnswerAt) {
            const pid = match.playerOrder.find((id) => !match.players[id].locked);
            if (pid) {
                const q = tideQuestionPayload(match, pid);
                const term = match.phase === 'breaker' ? match.breaker.answer : match.assignments[pid].entry.term;
                if (match.phase === 'breaker') log.shores.push(match.breaker.id);
                try {
                    if (wrongFirst && !log.wrongSeen) {
                        log.wrongSeen += 1;
                        const w = submitTideAnswer(match, pid, 'definitely-wrong', q?.questionId, now);
                        if (w.result.correct) log.errors.push('wrong accepted');
                    }
                    submitTideAnswer(match, pid, term, q?.questionId, now);
                } catch (e) { log.errors.push(String(e.message)); }
                nextAnswerAt = now + answerEveryMs(match);
            }
        }
    }
    if (!match.finished) finishTideEarly(match);
    return { match, log, elapsedMs: now - t0, view: tidePublicView(match, { now }), winners: tideWinners(match) };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
    const fmt = (r) => `tier=${r.match.tier.id} (${r.match.tier.title}) roundsCompleted=${r.match.roundsCompleted}/${ROUND_COUNT} spansLaid=${r.match.spansLaid} endReason=${r.match.endReason} failedRound=${r.match.failedRound} roundResults=[${r.match.roundResults.join(',')}] simulated=${(r.elapsedMs / 1000).toFixed(1)}s errors=${r.log.errors.length} pausedTideDrift=${r.log.tideTicksWhilePaused} phases=${[...r.log.phases].join('/')}`;
    console.log('GOLD   (10 min, fast class):  ', fmt(simulate({ minutes: 10, answerEveryMs: () => 1800, wrongFirst: true })));
    console.log('GOLD   (3 min, very fast):    ', fmt(simulate({ minutes: 3, answerEveryMs: () => 900, playerCount: 4 })));
    console.log('FAILURE(tide, slow from R3):  ', fmt(simulate({ minutes: 10, answerEveryMs: (m) => (m.round >= 3 ? 40_000 : 1800) })));
    console.log('CLOCK  (5 min, steady class): ', fmt(simulate({ minutes: 5, playerCount: 2, answerEveryMs: () => 8000 })));
}
