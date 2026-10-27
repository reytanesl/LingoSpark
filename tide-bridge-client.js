/**
 * Tide Bridge — host board + player chrome for Live Spark.
 */
(function (global) {
    'use strict';

    const STONE_SLOTS = 12;

    function $(id) {
        return document.getElementById(id);
    }

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatClock(ms) {
        const sec = Math.max(0, Math.ceil(Number(ms) / 1000));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function ensureHostDom() {
        let root = $('live-host-tide');
        if (root) return root;
        const panel = $('live-host-room-panel');
        if (!panel) return null;
        root = document.createElement('div');
        root.id = 'live-host-tide';
        root.className = 'tb-host';
        root.hidden = true;
        root.innerHTML = `
            <div class="tb-host-top">
                <h2 class="tb-title"><i class="fa-solid fa-bridge-water"></i> Tide Bridge</h2>
                <div class="tb-clock" id="tb-host-clock">5:00</div>
                <div class="tb-meta">
                    <span class="tb-badge" id="tb-host-phase">Lay the next stone!</span>
                    <span class="tb-progress-chip" id="tb-host-clear">0 / 3</span>
                    <span class="tb-progress-chip" id="tb-host-spans">Spans: 0</span>
                </div>
            </div>
            <div class="tb-scene" aria-hidden="true">
                <div class="tb-cliffs">
                    <div class="tb-cliff tb-cliff--left"></div>
                    <div class="tb-cliff tb-cliff--right"></div>
                </div>
                <div class="tb-water" id="tb-host-water"></div>
                <div class="tb-bridge" id="tb-host-bridge"></div>
                <div class="tb-avatars" id="tb-host-avatars">🚶‍♂️🚶‍♀️🧒</div>
            </div>
            <p class="tb-phase-msg" id="tb-host-msg">Build the bridge before the tide returns!</p>
            <div class="tb-breaker-card" id="tb-host-breaker" hidden></div>
            <div class="tb-end" id="tb-host-end" hidden></div>
        `;
        const bridge = root.querySelector('#tb-host-bridge');
        for (let i = 0; i < STONE_SLOTS; i++) {
            const stone = document.createElement('div');
            stone.className = 'tb-stone';
            stone.dataset.i = String(i);
            bridge.appendChild(stone);
        }
        panel.appendChild(root);
        return root;
    }

    function setHostMode(on) {
        document.body.classList.toggle('live-host-tide', Boolean(on));
        const root = ensureHostDom();
        if (root) root.hidden = !on;
        if (on) {
            document.body.classList.remove('live-host-lanterns', 'live-host-cannon');
            const lan = $('live-host-lanterns');
            const can = $('live-host-cannon');
            if (lan) lan.hidden = true;
            if (can) can.hidden = true;
            const race = $('live-host-race');
            if (race) race.hidden = true;
        }
    }

    function renderHost(state) {
        const root = ensureHostDom();
        if (!root || !state) return;
        root.hidden = false;
        setHostMode(true);

        const clock = $('tb-host-clock');
        if (clock) clock.textContent = formatClock(state.remainingMs);

        const water = $('tb-host-water');
        if (water) {
            const h = 22 + (Number(state.tideRatio) || 0) * 48;
            water.style.height = `${h}%`;
        }

        const cleared = Number(state.cleared) || 0;
        const stones = root.querySelectorAll('.tb-stone');
        stones.forEach((el, i) => {
            el.classList.toggle('is-laid', i < Math.min(STONE_SLOTS, cleared));
        });

        const avatars = $('tb-host-avatars');
        if (avatars) {
            const ratio = Math.min(0.72, (cleared / STONE_SLOTS) * 0.72);
            avatars.style.left = `${18 + ratio * 55}%`;
        }

        const phaseEl = $('tb-host-phase');
        const msg = $('tb-host-msg');
        const breaker = $('tb-host-breaker');
        const end = $('tb-host-end');
        if (phaseEl) {
            phaseEl.classList.toggle('tb-badge--breaker', state.phase === 'breaker');
            if (state.phase === 'breaker') phaseEl.textContent = 'Shore challenge!';
            else if (state.phase === 'between') phaseEl.textContent = 'Next span…';
            else if (state.phase === 'finished') phaseEl.textContent = 'Tide in';
            else phaseEl.textContent = 'Lay the next stone!';
        }
        if (msg) {
            if (state.phase === 'breaker') msg.textContent = 'Everyone — shore challenge!';
            else if (state.phase === 'between') msg.textContent = 'Nice work — get ready…';
            else if (state.phase === 'finished') msg.textContent = 'Time! How far did you get?';
            else msg.textContent = 'Answer your own word — help the class clear the span!';
        }
        if (breaker) {
            if (state.phase === 'breaker' && state.breakerPrompt) {
                breaker.hidden = false;
                breaker.textContent = state.breakerPrompt;
            } else {
                breaker.hidden = true;
            }
        }

        const clearChip = $('tb-host-clear');
        if (clearChip) clearChip.textContent = `${state.gotCorrect || 0} / ${state.neededCorrect || 3}`;
        const spans = $('tb-host-spans');
        if (spans) spans.textContent = `Spans: ${cleared}`;

        if (end) {
            if (state.finished && state.tier) {
                end.hidden = false;
                const tierClass = `tb-end-tier--${esc(state.tier.id || 'bronze')}`;
                end.innerHTML = `
                    <p class="tb-end-tier ${tierClass}">${esc(state.tier.title || state.tier.label)}</p>
                    <p>Spans cleared: <strong>${cleared}</strong></p>`;
            } else {
                end.hidden = true;
            }
        }
    }

    function syncPlayerBanner(state) {
        let banner = $('tb-player-banner');
        if (!banner) {
            const play = $('live-play-panel') || $('live-player-panel') || document.querySelector('.live-play-main');
            banner = document.createElement('div');
            banner.id = 'tb-player-banner';
            banner.className = 'tb-player-banner';
            if (play) play.prepend(banner);
            else document.body.prepend(banner);
        }
        if (!state) {
            banner.hidden = true;
            return;
        }
        banner.hidden = false;
        const isBreaker = state.phase === 'breaker';
        banner.classList.toggle('tb-player-banner--breaker', isBreaker);
        const clock = formatClock(state.remainingMs);
        if (isBreaker) {
            banner.textContent = `Shore challenge · ${clock} · ${state.gotCorrect || 0}/${state.neededCorrect || 3}`;
        } else if (state.phase === 'between') {
            banner.textContent = `Tide Bridge · next span… · ${clock}`;
        } else {
            banner.textContent = `Tide Bridge · Lay the next stone · ${clock} · ${state.gotCorrect || 0}/${state.neededCorrect || 3} · spans ${state.cleared || 0}`;
        }
    }

    function winnerHtml(data) {
        const tier = data?.tier || {};
        const cleared = data?.cleared ?? 0;
        return `
            <p class="tb-end-tier tb-end-tier--${esc(tier.id || 'bronze')}">${esc(tier.title || tier.label || 'Tide Bridge')}</p>
            <p class="ll-win-sub">The class cleared <b>${esc(cleared)}</b> spans before the tide returned.</p>`;
    }

    global.TideBridgeUI = {
        setHostMode,
        renderHost,
        syncPlayerBanner,
        winnerHtml,
        ensureHostDom,
        formatClock,
    };
})(typeof window !== 'undefined' ? window : globalThis);
