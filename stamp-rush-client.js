/**
 * Stamp Rush — host board (postcard piles) + phone chrome for Live Spark.
 * Mechanics live in stamp-rush.js / live-game.js; this file only draws `live:stamp-state`
 * and routes answers through the shared Live Spark sockets.
 */
(function (global) {
    'use strict';

    const ROUNDS = 12;
    const ctx = { hostEnd: null, fullscreen: null, roomCode: null, emit: null };
    const last = { state: null };
    let phoneQ = null;

    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    const AV_COLORS = ['#c45c26', '#2a6f97', '#52796f', '#9b2226', '#bc6c25', '#3d405b', '#6a994e', '#e07a5f'];

    function colorFor(id) {
        let h = 0;
        const s = String(id || '');
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return AV_COLORS[h % AV_COLORS.length];
    }

    function pileSvg(stamps, max = ROUNDS) {
        const n = Math.max(0, Math.min(max, Number(stamps) || 0));
        const cards = [];
        for (let i = 0; i < n; i++) {
            const dx = (i % 3) * 3;
            const dy = -i * 4;
            const rot = ((i * 7) % 11) - 5;
            cards.push(`<g class="sr-card" transform="translate(${dx},${dy}) rotate(${rot} 40 28)">
                <rect x="8" y="6" width="64" height="44" rx="4" fill="#f4e9d8" stroke="#8b5e34" stroke-width="1.5"/>
                <rect x="14" y="12" width="28" height="18" rx="2" fill="#e8d5b7"/>
                <circle cx="58" cy="18" r="9" fill="#c45c26" opacity=".85"/>
                <path d="M52 18 h12 M58 12 v12" stroke="#f4e9d8" stroke-width="1.5"/>
            </g>`);
        }
        if (!n) {
            cards.push(`<g class="sr-card sr-card--empty" opacity=".35">
                <rect x="8" y="20" width="64" height="44" rx="4" fill="none" stroke="#8b5e34" stroke-width="1.5" stroke-dasharray="4 3"/>
            </g>`);
        }
        return `<svg class="sr-pile-svg" viewBox="0 -48 80 100" aria-hidden="true">${cards.join('')}</svg>`;
    }

    function ensureHostDom() {
        let root = $('live-host-stamp');
        if (!root) {
            root = document.createElement('div');
            root.id = 'live-host-stamp';
            const stage = $('live-host-stage') || $('live-host-race')?.parentElement || document.body;
            stage.appendChild(root);
        }
        if (root.dataset.ready === '1') return root;
        root.className = 'sr-host';
        root.hidden = true;
        root.innerHTML = `
            <div class="sr-sky" aria-hidden="true"></div>
            <header class="sr-top">
                <div class="sr-brand">Lingo<span>Spark</span></div>
                <div class="sr-title">
                    <b>Stamp Rush</b>
                    <small id="sr-host-sub">Shared stamp tray · first to stamp 12 postcards wins</small>
                </div>
                <div class="sr-top-actions">
                    <button type="button" id="sr-full" class="sr-btn" title="Fullscreen">${esc('⛶')}</button>
                    <button type="button" id="sr-end" class="sr-btn sr-btn--warn">End</button>
                    <button type="button" id="sr-lobby" class="sr-btn">Lobby</button>
                </div>
            </header>
            <section class="sr-tray-wrap">
                <div class="sr-tray-label">Shared stamp tray</div>
                <div id="sr-tray" class="sr-tray"></div>
            </section>
            <section id="sr-piles" class="sr-piles" aria-live="polite"></section>
            <footer class="sr-foot">
                <p id="sr-caption">Players stamp their own postcards — speed earns bonus points.</p>
            </footer>`;
        root.querySelector('#sr-lobby')?.addEventListener('click', () => setHostMode(false));
        root.querySelector('#sr-end')?.addEventListener('click', () => ctx.hostEnd?.());
        root.querySelector('#sr-full')?.addEventListener('click', () => ctx.fullscreen?.(root));
        root.dataset.ready = '1';
        return root;
    }

    function setHostMode(on) {
        const root = ensureHostDom();
        root.hidden = !on;
        document.body.classList.toggle('live-host-stamp', Boolean(on));
        if (!on) return;
        const race = $('live-host-race');
        const lanterns = $('live-host-lanterns');
        const cannon = $('live-host-cannon');
        const tide = $('live-host-tide');
        if (race) race.hidden = true;
        if (lanterns) lanterns.hidden = true;
        if (cannon) cannon.hidden = true;
        if (tide) tide.hidden = true;
        // Keep challenge panel inside host stage for fullscreen.
        const panel = $('live-host-challenge-panel');
        if (panel && panel.parentElement !== root) root.appendChild(panel);
    }

    function renderTray(box) {
        const el = $('sr-tray');
        if (!el) return;
        const terms = Array.isArray(box) ? box : [];
        el.innerHTML = terms.map((t, i) =>
            `<span class="sr-stamp" style="--i:${i}"><i></i><b>${esc(t)}</b></span>`
        ).join('');
    }

    function renderPiles(players) {
        const el = $('sr-piles');
        if (!el) return;
        const rows = (players || []).slice().sort((a, b) =>
            (b.points - a.points) || (b.stamps - a.stamps) || String(a.nickname).localeCompare(String(b.nickname))
        );
        el.innerHTML = rows.map((p, idx) => {
            const stamps = Number(p.stamps) || 0;
            const done = Boolean(p.finished);
            const gain = Number(p.lastGain) || 0;
            const color = colorFor(p.id);
            return `<article class="sr-desk ${done ? 'is-done' : ''} ${gain ? 'is-gain' : ''}" style="--ink:${color}" data-id="${esc(p.id)}">
                <div class="sr-desk-rank">#${idx + 1}</div>
                <div class="sr-desk-pile">${pileSvg(stamps)}</div>
                <div class="sr-desk-meta">
                    <strong>${esc(p.nickname)}</strong>
                    <span>${stamps}/${ROUNDS} stamps · <b>${Number(p.points) || 0}</b> pts</span>
                    ${gain ? `<em class="sr-gain">+${gain}${p.lastMult > 1 ? ` · ×${p.lastMult}` : ''}</em>` : ''}
                    ${done ? '<em class="sr-done">Done!</em>' : ''}
                </div>
            </article>`;
        }).join('');
    }

    function renderHost(state) {
        if (!state) return;
        last.state = state;
        ensureHostDom();
        setHostMode(true);
        renderTray(state.box);
        renderPiles(state.players);
        const cap = $('sr-caption');
        const sub = $('sr-host-sub');
        if (state.finished) {
            if (cap) cap.textContent = `${state.winnerNickname || 'Stamp Rush'} — race complete!`;
            if (sub) sub.textContent = 'Final piles';
        } else {
            const lead = (state.players || []).slice().sort((a, b) => b.points - a.points)[0];
            if (cap) {
                cap.textContent = lead
                    ? `${lead.nickname} leads with ${lead.points} pts · ${lead.stamps}/${ROUNDS} stamps`
                    : 'Stamp your postcards — faster answers score more!';
            }
            if (sub) sub.textContent = 'Shared stamp tray · first to stamp 12 postcards wins';
        }
    }

    /* -------------------- phone -------------------- */

    function ensurePhoneDom() {
        let root = $('live-play-stamp');
        if (!root) {
            root = document.createElement('div');
            root.id = 'live-play-stamp';
            const body = document.querySelector('#screen-live-play .live-play-body') || $('screen-live-play') || document.body;
            body.prepend(root);
        }
        if (root.dataset.ready === '1') return root;
        root.className = 'sr-phone';
        root.hidden = true;
        root.innerHTML = `
            <div class="srp-head">
                <span class="srp-brand">Stamp Rush</span>
                <span id="srp-progress" class="srp-progress">0 / 12</span>
                <span id="srp-points" class="srp-points">0 pts</span>
            </div>
            <article id="srp-card" class="srp-card">
                <div class="srp-stamp-corner" aria-hidden="true"></div>
                <p id="srp-lead" class="srp-lead"></p>
                <p id="srp-body" class="srp-body"></p>
                <p id="srp-hint" class="srp-hint"></p>
            </article>
            <div id="srp-tray" class="srp-tray" hidden></div>
            <form id="srp-form" class="srp-form" hidden>
                <input id="srp-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type the stamp…" maxlength="120">
                <button type="submit" class="srp-send">Stamp</button>
            </form>
            <div id="srp-note" class="srp-note" hidden></div>`;
        root.querySelector('#srp-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = $('srp-input');
            const text = String(input?.value || '').trim();
            if (!text || !phoneQ) return;
            ctx.emit?.('live:submit-answer', { text, questionId: phoneQ.questionId });
            if (input) input.value = '';
        });
        root.dataset.ready = '1';
        return root;
    }

    function setPhoneActive(on) {
        const root = ensurePhoneDom();
        root.hidden = !on;
        document.body.classList.toggle('live-stamp-player', Boolean(on));
        if (on) {
            const hero = $('live-play-hero');
            const lantern = $('live-play-lantern');
            const cannon = $('live-play-cannon');
            if (hero) hero.hidden = true;
            if (lantern) lantern.hidden = true;
            if (cannon) cannon.hidden = true;
        }
    }

    function resetPhone() {
        phoneQ = null;
        const root = $('live-play-stamp');
        if (root) root.hidden = true;
        document.body.classList.remove('live-stamp-player');
        const note = $('srp-note');
        if (note) { note.hidden = true; note.textContent = ''; }
    }

    function onQuestion(q) {
        if (!q || !(q.stamp || q.gameFormat === 'stamp-rush')) return;
        phoneQ = q;
        setPhoneActive(true);
        const lead = $('srp-lead');
        const body = $('srp-body');
        const hint = $('srp-hint');
        const prog = $('srp-progress');
        const pts = $('srp-points');
        const tray = $('srp-tray');
        const form = $('srp-form');
        const note = $('srp-note');
        if (lead) lead.textContent = q.lead || 'Postcard';
        if (body) body.textContent = q.body || q.prompt || '_____';
        if (hint) hint.textContent = q.hint ? `Hint: ${q.hint}` : '';
        if (prog) prog.textContent = `${q.round || 0} / ${q.roundsTotal || ROUNDS}`;
        if (pts) pts.textContent = `${q.points || 0} pts`;
        if (note) { note.hidden = true; note.textContent = ''; }

        const typed = q.inputMode === 'typed' || q.answerMode === 'realise';
        if (form) form.hidden = !typed;
        if (tray) {
            tray.hidden = typed;
            if (!typed) {
                const stamps = Array.isArray(q.choices) && q.choices.length
                    ? q.choices
                    : (Array.isArray(q.box) ? q.box : []);
                tray.innerHTML = stamps.map((t) =>
                    `<button type="button" class="srp-stamp-btn" data-term="${esc(t)}"><i></i><span>${esc(t)}</span></button>`
                ).join('');
                tray.querySelectorAll('.srp-stamp-btn').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        if (!phoneQ) return;
                        ctx.emit?.('live:submit-answer', { text: btn.dataset.term, questionId: phoneQ.questionId });
                    });
                });
            }
        }
        if (typed) {
            const input = $('srp-input');
            if (input) { input.value = ''; input.focus(); }
        }
    }

    function showResult(result, { onChallenge } = {}) {
        if (!result || !(result.stamp || result.gameFormat === 'stamp-rush')) return;
        setPhoneActive(true);
        const note = $('srp-note');
        const pts = $('srp-points');
        const prog = $('srp-progress');
        if (pts && result.points != null) pts.textContent = `${result.points} pts`;
        if (prog && result.stamps != null) prog.textContent = `${result.stamps} / ${ROUNDS}`;
        if (!note) return;
        note.hidden = false;
        if (result.correct) {
            note.className = 'srp-note is-ok';
            note.textContent = result.finished
                ? 'All 12 postcards stamped!'
                : `Stamped! +${result.gain || 0}${result.mult > 1 ? ` (×${result.mult})` : ''}`;
        } else if (result.challengeable && onChallenge) {
            note.className = 'srp-note is-wrong';
            note.innerHTML = `${esc(result.message || 'Wrong stamp')} <button type="button" class="srp-ask">Ask teacher</button>`;
            note.querySelector('.srp-ask')?.addEventListener('click', () => onChallenge());
        } else {
            note.className = 'srp-note is-wrong';
            note.textContent = result.message || 'Wrong stamp — try again!';
        }
    }

    function showNote(kind) {
        const note = $('srp-note');
        if (!note) return;
        note.hidden = false;
        if (kind === 'sent') {
            note.className = 'srp-note';
            note.textContent = 'Sent to your teacher — keep going!';
        } else if (kind === 'accepted') {
            note.className = 'srp-note is-ok';
            note.textContent = 'Teacher accepted — stamped!';
        } else {
            note.className = 'srp-note is-wrong';
            note.textContent = 'Teacher said not this time — try again!';
        }
    }

    function syncPlayerBanner(state) {
        if (!state) return;
        last.state = state;
        // Host board drives piles; phones only need personal progress via questions/results.
    }

    function winnerHtml(data) {
        const ranking = data?.ranking || data?.players || [];
        const top = ranking[0];
        const rows = ranking.slice(0, 8).map((r, i) =>
            `<li><span>#${i + 1}</span><b>${esc(r.nickname)}</b><em>${Number(r.points) || 0} pts · ${Number(r.stamps) || 0}/12</em></li>`
        ).join('');
        return `<div class="sr-win">
            <div class="sr-win-mark" aria-hidden="true">✉</div>
            <h2>${esc(top?.nickname || data?.winnerNickname || 'Stamp Rush')}</h2>
            <p>Post office champion</p>
            <ol class="sr-win-list">${rows}</ol>
        </div>`;
    }

    function mountWinBackdrop(screen) {
        if (!screen) return;
        screen.classList.add('live-winner-screen--stamp');
        document.body.classList.add('sr-winner');
    }

    function removeWinBackdrop(screen) {
        screen?.classList.remove('live-winner-screen--stamp');
        document.body.classList.remove('sr-winner');
    }

    const StampRushUI = {
        init(opts = {}) {
            Object.assign(ctx, opts);
            ensureHostDom();
            ensurePhoneDom();
        },
        setHostMode,
        ensureHostDom,
        renderHost,
        onQuestion,
        showResult,
        showNote,
        resetPhone,
        syncPlayerBanner,
        winnerHtml,
        mountWinBackdrop,
        removeWinBackdrop,
        isPhoneActive: () => document.body.classList.contains('live-stamp-player'),
    };

    global.StampRushUI = StampRushUI;
})(typeof window !== 'undefined' ? window : globalThis);
