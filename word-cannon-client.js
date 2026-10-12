/* Word Cannon Battle: host projector stage, phone screens, lobby themes and
 * winner screen. window.WCB. Drawn with window.WCFX (word-cannon-fx.js).
 * live-game-client.js owns the sockets and calls into this module; this
 * module only talks back through the ctx callbacks passed to WCB.init(). */
(function () {
    'use strict';
    const WCB = {};
    window.WCB = WCB;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const FX = () => window.WCFX;
    const TEAMS = ['red', 'blue'];
    const NAMES = { red: 'Red Team', blue: 'Blue Team' };
    const other = (t) => (t === 'red' ? 'blue' : 'red');
    const RING_C = 2 * Math.PI * 38;
    /** Lobby team snapshot -> [{id, nickname}] */
    const teamMembers = (team) => (team?.memberIds || []).map((id, i) => ({ id, nickname: team.memberNicknames?.[i] || 'Player', avatar: team.memberAvatars?.[i] || '' }));
    const buddy = (av) => (av ? `<span class="live-buddy" aria-hidden="true">${esc(av)}</span>` : '');

    let ctx = {
        emit: () => {},
        hostEnd: () => {},
        fullscreen: () => {},
        playerId: () => null,
        nickname: () => '',
        roomCode: () => '',
        stopMusic: () => {},
    };
    WCB.init = function init(options) { ctx = { ...ctx, ...(options || {}) }; };

    function fmtClock(ms) {
        const s = Math.max(0, Math.ceil((ms || 0) / 1000));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    function sfx(name, opts) { try { FX()?.sfx(name, opts); } catch (_) { /* audio optional */ } }
    function popText(text, cls = '') { return `<span class="wc-pop ${cls}" data-text="${esc(text)}">${esc(text)}</span>`; }
    function ringSvg(cls = 'wc-ring-arc') {
        return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47" fill="#24124f"/><circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="10"/><circle class="${cls}" cx="50" cy="50" r="38" fill="none" stroke="#3bd16f" stroke-width="10" stroke-linecap="round" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="0"/></svg>`;
    }
    function paintRing(el, leftMs, totalMs, paused) {
        if (!el) return;
        const arc = el.querySelector('circle:last-of-type');
        const num = el.querySelector('.wc-ring-num, b');
        const frac = totalMs > 0 ? Math.max(0, Math.min(1, leftMs / totalMs)) : 0;
        if (arc) {
            arc.setAttribute('stroke-dashoffset', (RING_C * (1 - frac)).toFixed(2));
            arc.setAttribute('stroke', leftMs <= 5000 ? '#ff4d4d' : leftMs <= 10000 ? '#ffd23f' : '#3bd16f');
        }
        const secs = String(Math.max(0, Math.ceil(leftMs / 1000)));
        if (num && num.textContent !== secs) num.textContent = secs;
        el.classList.toggle('is-low', leftMs <= 5000);
        el.classList.toggle('is-paused', Boolean(paused));
    }
    function clockLeft(state, offset) {
        const c = state?.clock;
        if (!c) return 0;
        if (!c.gameEndsAt) return c.gameMs || 0;
        const ref = c.pausedAt || (Date.now() + offset);
        return Math.max(0, c.gameEndsAt - ref);
    }
    /** Shrink text until it fits its box (max-height / width) — no clipped questions. */
    function fitText(el, max = 54, min = 24) {
        if (!el) return;
        let size = max;
        el.style.fontSize = `${size}px`;
        while (size > min && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
            size -= 2;
            el.style.fontSize = `${size}px`;
        }
    }
    function textSizeClass(text) {
        const n = String(text || '').length;
        return n > 150 ? 'is-xs' : n > 95 ? 'is-sm' : n > 55 ? 'is-md' : '';
    }

    // ==================================================================
    // HOST
    // ==================================================================
    const H = {
        built: false, state: null, offset: 0, fx: null,
        questionKey: null, introShown: false, introTimer: null,
        volleySeq: null, timers: [], revealDoneAt: 0,
        stormOn: false, stormTimer: null, clockTimer: null,
        captionTimer: null, captionAlt: 0,
        cancelConfetti: null, flagsDown: new Set(), active: false,
        shotSeq: null, inflight: { red: 0, blue: 0 }, rebuilding: new Set(), lastFireAt: {}, lastLandAt: 0,
        labelIdx: {}, ptsShown: {}, winsShown: {}, suddenShown: false, endShown: false,
    };
    WCB.hostRevealDoneAt = () => H.revealDoneAt;
    WCB.clearHostReveal = () => { H.revealDoneAt = 0; };

    function barHtml(team) {
        return `<div class="wc-bar wc-bar--${team}" id="wc-bar-${team}"><div class="wc-bar-fill"></div><div class="wc-bar-text"><span>${team.toUpperCase()}</span><span class="wc-bar-pct">100%</span></div></div>
            <div class="wc-score wc-score--${team}" id="wc-score-${team}">
                <span class="wc-wins" id="wc-wins-${team}" title="Forts destroyed"><span class="wc-wins-ic" aria-hidden="true">🏆</span><b class="wc-wins-num">0</b><span class="wc-wins-label">WINS</span></span>
                <span class="wc-score-label">PTS</span><b class="wc-score-num">0</b>
            </div>`;
    }
    function phonesHtml(team) {
        return `<div class="wc-phones wc-phones--${team}" id="wc-phones-${team}" hidden><div class="wc-phone-ic"><span class="wc-phone-check">✓</span></div><span class="wc-phone-count">0/0</span></div>`;
    }

    function buildHost() {
        const root = $('live-host-cannon');
        if (!root || !FX()) return false;
        const fresh = root.querySelector('.wc-wins-ic') && root.querySelector('#wc-rain-layer') && !root.querySelector('#wc-ammo-red');
        if (H.built && fresh) return true;
        if (H.built) { root.innerHTML = ''; H.fx = null; }
        H.built = true;
        root.innerHTML = `
            <div class="wc-stage" id="wc-stage">
                <div class="wc-shake" id="wc-shake">
                    <div class="wc-scene" id="wc-scene"></div>
                    <canvas class="wc-fx" id="wc-fx"></canvas>
                    <div class="wc-hud" id="wc-hud">${barHtml('red')}${barHtml('blue')}${phonesHtml('red')}${phonesHtml('blue')}</div>
                    <div class="wc-labels" id="wc-labels"></div>
                </div>
                <div class="wc-rain-layer" id="wc-rain-layer" aria-hidden="true"></div>
                <div class="wc-question" id="wc-question"></div>
                ${FX().logoHtml()}
                <div class="wc-storm-chip" id="wc-storm-chip"></div>
                <div class="wc-vignette" id="wc-vignette"></div>
                <div class="wc-slowmo" id="wc-slowmo">SLOW MOTION</div>
                <div class="wc-banners" id="wc-banners"></div>
                <footer class="wc-caption">
                    <div class="wc-caption-room">Room<b id="wc-room-code">----</b></div>
                    <p class="wc-caption-text" id="wc-caption-text"></p>
                    <div class="wc-host-actions">
                        <button type="button" class="btn" id="wc-skip" title="Skip"><i class="fa-solid fa-forward"></i> Skip</button>
                        <button type="button" class="btn btn-blue" id="wc-next" hidden><i class="fa-solid fa-forward-step"></i> Next</button>
                        <button type="button" class="btn" id="wc-end"><i class="fa-solid fa-flag-checkered"></i> End</button>
                        <button type="button" class="btn" id="wc-full" title="Fullscreen"><i class="fa-solid fa-expand"></i></button>
                    </div>
                </footer>
                <div class="wc-intro" id="wc-intro" hidden></div>
            </div>`;
        FX().mountScene($('wc-scene'));
        H.fx = new (FX().FxCanvas)($('wc-fx'));
        $('wc-skip').addEventListener('click', () => {
            H.revealDoneAt = 0;
            ctx.emit('live:cannon-skip');
        });
        $('wc-next').addEventListener('click', () => { H.revealDoneAt = 0; ctx.emit('live:cannon-next'); });
        $('wc-end').addEventListener('click', () => { H.revealDoneAt = 0; ctx.hostEnd(); });
        $('wc-full').addEventListener('click', () => ctx.fullscreen($('live-host-cannon')));
        window.addEventListener('resize', fitStage);
        document.addEventListener('fullscreenchange', fitStage);
        return true;
    }

    function fitStage() {
        const host = $('live-host-cannon');
        const stage = $('wc-stage');
        if (!host || !stage || host.hidden) return;
        const w = host.clientWidth || window.innerWidth;
        const h = host.clientHeight || window.innerHeight;
        const s = Math.min(w / 1920, h / 1080);
        stage.style.transform = `translate(${((w - 1920 * s) / 2).toFixed(1)}px, ${((h - 1080 * s) / 2).toFixed(1)}px) scale(${s.toFixed(4)})`;
    }
    WCB.fitStage = fitStage;

    WCB.setHostMode = function setHostMode(active) {
        const root = $('live-host-cannon');
        H.active = Boolean(active);
        if (!active) {
            if (root) root.hidden = true;
            document.body.classList.remove('live-host-cannon');
            stopHostClock();
            FX()?.rainLoop(false);
            return;
        }
        if (!buildHost()) return;
        document.body.classList.add('live-host-cannon');
        root.hidden = false;
        fitStage();
        startHostClock();
    };

    /** Forget everything drawn for the previous match. */
    WCB.resetHost = function resetHost() {
        clearVolley();
        clearTimeout(H.introTimer);
        H.state = null;
        H.questionKey = null;
        H.introShown = false;
        H.volleySeq = null;
        H.revealDoneAt = 0;
        H.flagsDown.clear();
        H.shotSeq = null;
        H.inflight = { red: 0, blue: 0 };
        H.rebuilding.clear();
        H.lastFireAt = {};
        H.lastLandAt = 0;
        H.labelIdx = {};
        H.ptsShown = {};
        H.winsShown = {};
        H.suddenShown = false;
        H.endShown = false;
        setStorm(false, { silent: true });
        if (H.cancelConfetti) H.cancelConfetti();
        H.cancelConfetti = null;
        if (!H.built) return;
        H.fx?.clear();
        ['wc-question', 'wc-labels', 'wc-banners'].forEach((id) => { const el = $(id); if (el) el.innerHTML = ''; });
        const intro = $('wc-intro');
        if (intro) { intro.hidden = true; intro.innerHTML = ''; intro.classList.remove('is-out'); }
        $('wc-stage')?.classList.remove('is-intro');
        document.querySelectorAll('#wc-scene .wc-flag').forEach((f) => f.classList.remove('is-falling', 'is-down'));
        TEAMS.forEach((t) => {
            setBar(t, 100, { quiet: true });
            setScore(t, 0, 0);
            FX().setFortDamage($('wc-scene'), t, 100);
        });
    };

    function schedule(ms, fn) {
        const id = setTimeout(() => {
            H.timers = H.timers.filter((x) => x !== id);
            fn();
        }, Math.max(0, ms));
        H.timers.push(id);
        return id;
    }
    function clearVolley() {
        H.timers.forEach((id) => clearTimeout(id));
        H.timers = [];
        $('wc-vignette')?.classList.remove('is-on');
        $('wc-slowmo')?.classList.remove('is-on');
        cardAway(false);
    }
    /** Slide the question card out while a big banner (slow-mo, fort down, time up, winner) owns the sky. */
    function cardAway(on) {
        $('wc-stage')?.classList.toggle('is-cardless', Boolean(on));
    }

    function setBar(team, hp, { hit = false, quiet = false } = {}) {
        const bar = $(`wc-bar-${team}`);
        if (!bar) return;
        const pct = Math.max(0, Math.min(100, Math.round(hp)));
        const fill = bar.querySelector('.wc-bar-fill');
        if (fill) {
            if (quiet) fill.style.transition = 'none';
            fill.style.width = `${pct}%`;
            if (quiet) { void fill.offsetWidth; fill.style.transition = ''; }
        }
        const label = bar.querySelector('.wc-bar-pct');
        if (label) label.textContent = `${pct}%`;
        bar.classList.toggle('is-low', pct > 0 && pct <= 25);
        if (hit) {
            bar.classList.remove('is-hit');
            void bar.offsetWidth;
            bar.classList.add('is-hit');
        }
    }

    function setScore(team, points, fortKills = 0, { pop = false } = {}) {
        const el = $(`wc-score-${team}`);
        if (!el) return;
        const num = el.querySelector('.wc-score-num');
        const wins = el.querySelector('.wc-wins-num');
        const pts = Math.max(0, Math.round(points || 0));
        const k = Math.max(0, Math.round(fortKills || 0));
        if (num && num.textContent !== String(pts)) {
            num.textContent = String(pts);
            if (pop) {
                el.classList.remove('is-pop');
                void el.offsetWidth;
                el.classList.add('is-pop');
            }
        }
        if (wins && wins.textContent !== String(k)) {
            wins.textContent = String(k);
            if (k > 0) {
                el.classList.remove('is-win-pop');
                void el.offsetWidth;
                el.classList.add('is-win-pop');
            }
        }
    }

    function renderPhones(state) {
        const show = false; // the live board shows who is answering
        TEAMS.forEach((t) => {
            const el = $(`wc-phones-${t}`);
            if (!el) return;
            const members = state.teams?.[t]?.members || [];
            el.hidden = !show || !members.length;
            const done = members.filter((m) => m.status !== 'answering').length;
            const count = el.querySelector('.wc-phone-count');
            if (count) count.textContent = `${done}/${members.length}`;
            el.classList.toggle('is-all', members.length > 0 && done === members.length);
        });
    }

    function caption(text, { tip = false } = {}) {
        const el = $('wc-caption-text');
        if (!el || el.dataset.text === text) return;
        el.dataset.text = text;
        if (!tip) H.captionHoldUntil = Date.now() + 3500;
        el.innerHTML = `<span class="wc-caption-star">★</span>${esc(text)}`;
        el.classList.remove('is-swap');
        void el.offsetWidth;
        el.classList.add('is-swap');
    }
    function phaseCaption(state) {
        if (!state) return;
        if (state.phase === 'intro') return caption('Destroy the other fort for a 🏆 WIN. Most WINS when the timer ends wins!', { tip: true });
        if (state.phase === 'ending' || state.phase === 'finished') return;
        if (state.suddenDeath) return caption('Sudden death! The first correct answer fires the LAST SHOT!', { tip: true });
        if (H.captionHoldUntil > Date.now()) return;
        if (H.stormOn) {
            const g = state.gust;
            return caption(g ? `STORM gust ×${Number(g).toFixed(1)}: ${g >= 1.15 ? 'wild wind — slow shots blow back!' : g <= 0.85 ? 'calmer gust — aim holds better' : 'shots are wild'}` : 'STORM! Shots are wild — answer fast!', { tip: true });
        }
        const tips = [
            'Correct = instant shot — faster hits harder',
            'Destroy a fort: +1 🏆 WIN (+20 pts) — it rebuilds!',
            'Challenge a typed answer — play goes on',
            'Time up: most 🏆 WINS wins, then points',
        ];
        caption(tips[H.captionAlt % tips.length], { tip: true });
    }

    function startHostClock() {
        stopHostClock();
        H.clockTimer = setInterval(tickHost, 200);
        H.captionTimer = setInterval(() => {
            H.captionAlt += 1;
            if (H.state?.phase === 'battle') phaseCaption(H.state);
        }, 6000);
        tickHost();
    }
    function stopHostClock() {
        clearInterval(H.clockTimer);
        clearInterval(H.captionTimer);
        H.clockTimer = null;
        H.captionTimer = null;
        clearTimeout(H.stormTimer);
    }

    function tickHost() {
        const state = H.state;
        if (!state || !H.built) return;
        const chip = $('wc-storm-chip');
        const left = clockLeft(state, H.offset);
        const stormMs = state.clock?.stormMs || 60000;
        const stormLeft = left - stormMs;
        const started = Boolean(state.clock?.gameEndsAt);
        if (chip) {
            let html;
            if (state.suddenDeath) html = `${FX().stormIconSvg()}<span>SUDDEN DEATH</span>`;
            else if (stormLeft > 0 || !started) html = `${FX().stormIconSvg()}<span>STORM IN</span> <b>${fmtClock(stormLeft)}</b>`;
            else html = `${FX().stormIconSvg()}<span>STORM!</span><small>${fmtClock(left)}</small>`;
            if (chip.dataset.html !== html) { chip.dataset.html = html; chip.innerHTML = html; }
            chip.classList.toggle('is-storm', started && (stormLeft <= 0 || state.suddenDeath));
            chip.classList.toggle('is-soon', started && stormLeft > 0 && stormLeft <= 10000);
        }
        // Storm starts by the clock, not just by a state push.
        if (started && stormLeft <= 0 && !H.stormOn && state.phase !== 'finished') setStorm(true);
        const clock = $('wc-live-clock');
        if (clock) {
            const sudden = state.suddenDeath && state.suddenEndsAt ? Math.max(0, state.suddenEndsAt - (Date.now() + H.offset)) : null;
            const txt = state.phase === 'ending' || state.phase === 'finished' ? '0:00' : fmtClock(sudden ?? left);
            if (clock.textContent !== txt) clock.textContent = txt;
            clock.classList.toggle('is-low', (sudden ?? left) <= 10000 && started);
        }
    }

    function setStorm(on, { silent = false } = {}) {
        if (on === H.stormOn) return;
        H.stormOn = on;
        $('wc-stage')?.classList.toggle('is-storm', on);
        $('live-host-cannon')?.classList.toggle('is-storm', on);
        clearTimeout(H.stormTimer);
        if (H.fx) H.fx.setRain(on);
        if (!on) { FX()?.rainLoop(false); return; }
        if (!silent) {
            FX().lightning(H.fx, { x: 960 + (Math.random() - 0.5) * 600 });
            sfx('thunder');
            banner('storm', 'STORM!');
            caption('STORM! Shots are wild — answer fast!');
        }
        FX().rainLoop(true);
        const strike = () => {
            if (!H.stormOn || !H.active) return;
            if (!FX().reduced() || Math.random() < 0.3) {
                FX().lightning(H.fx, {});
                setTimeout(() => sfx('thunder', { volume: 0.6 }), 250);
            }
            H.stormTimer = setTimeout(strike, 4500 + Math.random() * 5000);
        };
        H.stormTimer = setTimeout(strike, 3500);
    }

    /** Banners sharing a screen position replace each other (no "BOWN FORT!!" double text). */
    const BANNER_LANE = { blown: 'low', lucky: 'low', last: 'top', win: 'top', timeup: 'top', storm: 'mid' };

    function banner(kind, text, { cls = '', pill = '', pillCls = '' } = {}) {
        const box = $('wc-banners');
        if (!box) return null;
        const lane = BANNER_LANE[kind] || kind;
        box.querySelectorAll(`[data-lane="${lane}"]`).forEach((old) => old.remove());
        const el = document.createElement('div');
        el.dataset.lane = lane;
        el.className = `wc-banner wc-banner--${kind} ${cls}`;
        el.innerHTML = popText(text);
        box.appendChild(el);
        let pillEl = null;
        if (pill) {
            pillEl = document.createElement('div');
            pillEl.dataset.lane = lane;
            pillEl.className = `wc-banner-pill ${pillCls}`;
            pillEl.textContent = pill;
            box.appendChild(pillEl);
        }
        if (kind !== 'win') {
            const life = kind === 'last' ? 3100 : 2500;
            setTimeout(() => { el.remove(); pillEl?.remove(); }, life);
        }
        return el;
    }

    function label(at, text, cls, { long = false, detail = '', compact = false } = {}) {
        const box = $('wc-labels');
        if (!box) return;
        const el = document.createElement('div');
        el.className = `wc-label ${cls}${long ? ' is-long' : ''}${compact ? ' is-compact' : ''}`;
        el.style.left = `${at.x}px`;
        el.style.top = `${at.y}px`;
        el.innerHTML = `<span class="wc-label-main">${esc(text)}</span>${detail ? `<span class="wc-label-detail">${esc(detail)}</span>` : ''}`;
        box.appendChild(el);
        setTimeout(() => el.remove(), long ? 3900 : 2000);
    }
    /** Each ball of a salvo gets its own label slot (stacked per team) so labels never pile up. */
    function labelSlot(shot, v) {
        const mine = (v.shots || []).filter((s) => s.team === shot.team);
        const idx = Math.max(0, mine.indexOf(shot));
        const compact = mine.length > 4;
        const rows = compact ? 6 : 4;
        const gap = compact ? 70 : 100;
        const base = LABEL_AT[shot.team];
        return { at: { x: base.x, y: base.y + (idx % rows) * gap }, compact };
    }
    function damageNumber(team, dmg, lucky) {
        const box = $('wc-labels');
        const bar = FX().G[team].bar;
        if (!box || !(dmg > 0)) return;
        const el = document.createElement('div');
        el.className = `wc-dmgnum${lucky ? ' is-lucky' : ''}`;
        el.style.left = `${bar.x + 180}px`;
        el.style.top = `${bar.y - 96}px`;
        el.textContent = `-${fmtDmg(dmg)}`;
        box.appendChild(el);
        setTimeout(() => el.remove(), 1700);
    }

    // ---------------- live battle board (replaces the shared question card) ----------------
    function teamStatHtml(t, team) {
        const s = team?.stats || {};
        const members = team?.members || [];
        const answering = members.filter((m) => m.status === 'answering').length;
        return `<div class="wc-live-team wc-live-team--${t}">
            <h4>${t.toUpperCase()}</h4>
            <div class="wc-live-nums">
                <span title="Shots fired"><b>${s.shots || 0}</b>shots</span>
                <span title="Hits"><b>${s.hits || 0}</b>hits</span>
                <span title="Correct answers"><b>${s.accuracy || 0}%</b>right</span>
                <span title="Shots per minute"><b>${Number(s.perMin || 0).toFixed(1)}</b>/min</span>
            </div>
            <p class="wc-live-crew">${answering}/${members.length} answering</p>
        </div>`;
    }
    function feedRowHtml(shot) {
        const friendly = shot.friendly || shot.outcome === 'blown' || shot.outcome === 'own';
        const cls = shot.lastShot ? 'is-last' : friendly ? 'is-blown' : shot.outcome === 'lucky' ? 'is-lucky'
            : shot.outcome === 'miss' ? 'is-miss' : shot.outcome === 'shield' ? 'is-shield' : `is-${shot.tier || 'fast'}`;
        const what = shot.lastShot ? 'LAST SHOT!' : shot.fortDown ? 'FORT DOWN!'
            : shot.outcome === 'hit' ? `HIT −${fmtDmg(shot.damage)}`
            : shot.outcome === 'lucky' ? `LUCKY −${fmtDmg(shot.damage)}`
            : shot.outcome === 'shield' ? 'SHIELD'
            : friendly ? `OWN FORT −${fmtDmg(shot.damage)}` : 'MISS';
        return `<li class="wc-feed-row is-${shot.team} ${cls}"><span class="wc-feed-who">${esc(shot.nickname || '?')}${shot.retro ? ' ✓' : ''}</span><span class="wc-feed-what">${esc(what)}</span><span class="wc-feed-ms">${(Math.max(0, shot.ms || 0) / 1000).toFixed(1)}s</span></li>`;
    }
    function fmtDmg(d) {
        const n = Number(d) || 0;
        return n >= 10 || Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1);
    }
    function renderLive(state) {
        const box = $('wc-question');
        if (!box) return;
        const phase = state.phase;
        if (phase === 'intro' || phase === 'finished') {
            if (box.firstChild && phase !== 'finished') box.innerHTML = '';
            return;
        }
        if (!box.querySelector('.wc-live')) {
            box.innerHTML = `<div class="wc-live" id="wc-live">
                <div class="wc-live-head"><span class="wc-live-pill" id="wc-live-pill">LIVE BATTLE</span></div>
                <div class="wc-live-row"><div id="wc-live-red"></div><div class="wc-live-clock" id="wc-live-clock">0:00</div><div id="wc-live-blue"></div></div>
            </div>
            <ol class="wc-feed" id="wc-feed"></ol>`;
        }
        const pill = $('wc-live-pill');
        const pillText = state.suddenDeath ? 'SUDDEN DEATH' : state.storm ? 'STORM!' : 'LIVE BATTLE';
        if (pill && pill.textContent !== pillText) {
            pill.textContent = pillText;
            pill.classList.toggle('is-sudden', Boolean(state.suddenDeath));
            pill.classList.toggle('is-storm', Boolean(state.storm) && !state.suddenDeath);
        }
        TEAMS.forEach((t) => {
            const el = $(`wc-live-${t}`);
            if (!el) return;
            const html = teamStatHtml(t, state.teams?.[t]);
            if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
        });
    }
    /** Feed rows appear when the ball lands (never before the fort reacts). */
    function pushFeed(shot) {
        const feed = $('wc-feed');
        if (!feed) return;
        feed.insertAdjacentHTML('afterbegin', feedRowHtml(shot));
        while (feed.children.length > 4) feed.lastElementChild.remove();
    }

    // ---------------- intro ----------------
    function skipIntroTutorial() {
        hideIntro();
        if (H.state?.phase === 'intro') ctx.emit('live:cannon-skip');
    }

    function showIntro(state) {
        const intro = $('wc-intro');
        if (!intro) return;
        const left = Math.max(1200, (state.phaseEndsAt || 0) - (Date.now() + H.offset));
        const names = (t) => (state.teams?.[t]?.members || []).map((m) => m.nickname).join(' · ') || '—';
        intro.classList.remove('is-out');
        intro.innerHTML = `${FX().logoHtml()}${FX().titleHtml(['WORD CANNON', 'BATTLE'])}
            <div class="wc-vs">
                <div class="wc-vs-team wc-vs-team--red"><h3>RED TEAM</h3><p>${esc(names('red'))}</p></div>
                <div class="wc-vs-mid">VS</div>
                <div class="wc-vs-team wc-vs-team--blue"><h3>BLUE TEAM</h3><p>${esc(names('blue'))}</p></div>
            </div>
            <div class="wc-tutorial-card">
                <p class="wc-tutorial-kicker">Quick tutorial</p>
                <ul class="wc-tutorial-list">
                    <li><strong>Answer</strong> on your phone at your own pace — every correct answer fires your team's cannon <strong>right away</strong>.</li>
                    <li><strong>Faster answers</strong> = more force and damage. <strong>WINS</strong> = each time you destroy the other fort.</li>
                    <li><strong>Storm</strong> (last minute): wild shots — some can blow back onto your own fort.</li>
                    <li><strong>Challenge</strong> a typed answer — the teacher checks it while you keep playing.</li>
                </ul>
                <div class="wc-tutorial-actions">
                    <button type="button" class="btn btn-grey" id="wc-intro-skip">Skip</button>
                    <button type="button" class="btn btn-blue" id="wc-intro-go">Let's battle!</button>
                </div>
            </div>`;
        intro.hidden = false;
        $('wc-stage')?.classList.add('is-intro');
        sfx('fanfare', { volume: 0.5 });
        clearTimeout(H.introTimer);
        $('wc-intro-skip')?.addEventListener('click', () => skipIntroTutorial());
        $('wc-intro-go')?.addEventListener('click', () => skipIntroTutorial());
        H.introTimer = setTimeout(() => skipIntroTutorial(), left - 400);
    }
    function hideIntro() {
        const intro = $('wc-intro');
        clearTimeout(H.introTimer);
        if (!intro || intro.hidden) { $('wc-stage')?.classList.remove('is-intro'); return; }
        intro.classList.add('is-out');
        $('wc-stage')?.classList.remove('is-intro');
        setTimeout(() => { intro.hidden = true; intro.classList.remove('is-out'); }, 600);
    }

    // ---------------- main host render ----------------
    WCB.renderHost = function renderHost(state) {
        if (!state || !buildHost()) return;
        const prev = H.state;
        H.state = state;
        H.offset = (state.serverNow || Date.now()) - Date.now();
        const code = $('wc-room-code');
        if (code) code.textContent = ctx.roomCode() || '----';
        fitStage();

        if (state.phase === 'intro') {
            if (!H.introShown) { H.introShown = true; showIntro(state); }
        } else {
            H.introShown = true;
            hideIntro();
        }
        // First state of this match (or a reconnect): jump straight to the current picture.
        if (H.shotSeq == null) {
            H.shotSeq = state.shotSeq || 0;
            TEAMS.forEach((t) => {
                H.ptsShown[t] = state.teams?.[t]?.points || 0;
                H.winsShown[t] = state.teams?.[t]?.fortKills || 0;
            });
            (state.shots || []).slice(-4).forEach((s) => pushFeed(s));
        }
        // Fire every new shot as it happens (several balls may be in the air at once).
        const fresh = (state.shots || []).filter((s) => s.seq > H.shotSeq).sort((a, b) => a.seq - b.seq);
        if (fresh.length) {
            H.shotSeq = fresh[fresh.length - 1].seq;
            fresh.forEach((shot, i) => queueShot(shot, i));
        }
        syncBoard(state);
        renderPhones(state);
        renderLive(state);
        if (state.storm && !H.stormOn) setStorm(true, { silent: Boolean(prev == null) });
        if (state.suddenDeath && !H.suddenShown) {
            H.suddenShown = true;
            cardAway(true);
            setTimeout(() => { if (H.state?.phase === 'battle') cardAway(false); }, 2600);
            banner('timeup', "TIME'S UP!", { pill: 'Tied! SUDDEN DEATH — first correct answer wins', pillCls: '' });
            sfx('thud');
        }
        if ((state.phase === 'ending' || state.phase === 'finished') && state.result && !H.endShown) {
            H.endShown = true;
            const landing = Math.max(0, H.lastLandAt - Date.now());
            const hold = Math.max(0, (state.phaseEndsAt || 0) - (Date.now() + H.offset));
            H.revealDoneAt = Date.now() + Math.max(hold, landing + 2600);
            schedule(landing + 300, () => endSequence(state.result));
        }
        const nextBtn = $('wc-next');
        if (nextBtn) nextBtn.hidden = true;
        const skipBtn = $('wc-skip');
        if (skipBtn) skipBtn.hidden = !(state.phase === 'intro' || state.phase === 'ending');
        phaseCaption(state);
        tickHost();
    };

    /** HP bars / forts / scores follow the server unless a ball for that fort is still in the air. */
    function syncBoard(state) {
        TEAMS.forEach((t) => {
            if (!H.inflight[t] && !H.rebuilding.has(t)) {
                const hp = state.teams?.[t]?.hp ?? 100;
                setBar(t, hp);
                FX().setFortDamage($('wc-scene'), t, hp);
            }
        });
        if (!H.inflight.red && !H.inflight.blue) {
            TEAMS.forEach((t) => {
                const pts = state.teams?.[t]?.points || 0;
                const kills = state.teams?.[t]?.fortKills || 0;
                const pop = pts > (H.ptsShown[t] || 0);
                H.ptsShown[t] = pts;
                H.winsShown[t] = kills;
                setScore(t, pts, kills, { pop });
            });
        }
    }

    // ---------------- shot choreography (continuous) ----------------
    const MISS_SPOT = { red: { x: 1150, y: 846 }, blue: { x: 770, y: 840 } };
    const LABEL_AT = { red: { x: 760, y: 470 }, blue: { x: 1160, y: 470 } };
    const FLIGHT_MS = 950;
    const LAST_FLIGHT_MS = 2400;

    function queueShot(shot, i) {
        const nowServer = Date.now() + H.offset;
        const age = Math.max(0, nowServer - (shot.firedAt || nowServer));
        const flight = shot.lastShot ? (FX().reduced() ? 1400 : LAST_FLIGHT_MS) : FLIGHT_MS;
        if (age > flight + 1200) {
            // Fired long before we saw it (tab asleep / reconnect): just show the outcome.
            pushFeed(shot);
            if (shot.fortDown && shot.rebuildAt && shot.rebuildAt > nowServer) {
                H.rebuilding.add(shot.target);
                downFlag(shot.target, true);
                setBar(shot.target, 0, { quiet: true });
                schedule(shot.rebuildAt - nowServer, () => rebuildFort(shot.target));
            }
            return;
        }
        // Balls fired in the same instant leave the barrel a beat apart (no perfect overlap).
        const sameBarrel = Math.max(0, (H.lastFireAt[shot.team] || 0) + 160 - Date.now());
        const delay = Math.max(sameBarrel, i * 90);
        H.lastFireAt[shot.team] = Date.now() + delay;
        H.inflight[shot.target] = (H.inflight[shot.target] || 0) + 1;
        H.lastLandAt = Math.max(H.lastLandAt, Date.now() + delay + flight + 200);
        schedule(delay, () => fireShot(shot, flight));
    }

    function fireShot(shot, flight) {
        const G = FX().G;
        const team = shot.team;
        const target = shot.target;
        const dir = team === 'red' ? 1 : -1;
        const big = Boolean(shot.lastShot);
        if (big) {
            cardAway(true);
            $('wc-vignette')?.classList.add('is-on');
            $('wc-slowmo')?.classList.add('is-on');
            banner('last', 'LAST SHOT!');
            caption(`${shot.nickname || NAMES[team]} fires the LAST SHOT!`);
            sfx('thud');
        }
        const cannon = document.querySelector(`#wc-scene .wc-cannon--${team}`);
        if (cannon) { cannon.classList.remove('is-recoil'); void cannon.offsetWidth; cannon.classList.add('is-recoil'); }
        const from = G[team].muzzle;
        FX().muzzleFlash(H.fx, from, dir);
        FX().smoke(H.fx, from, { dir, n: big ? 14 : 7 });
        sfx('boom', big ? { rate: 0.8 } : { volume: 0.8 });
        setTimeout(() => sfx('whoosh', big ? { rate: 0.7 } : { volume: 0.6 }), 80);
        const friendly = Boolean(shot.friendly || shot.outcome === 'blown' || shot.outcome === 'own');
        if (friendly) setTimeout(() => sfx('wind'), 200);
        let to;
        let height = 300;
        let wobble = 0;
        if (shot.outcome === 'hit' || shot.outcome === 'lucky' || shot.outcome === 'shield' || (friendly && shot.damage > 0)) {
            to = { x: G[target].hit.x + (Math.random() - 0.5) * 60, y: G[target].hit.y + (Math.random() - 0.5) * 36 };
            height = shot.outcome === 'lucky' ? 420 : big ? 380 : friendly ? 360 : 280 + Math.random() * 60;
            if (shot.storm || shot.outcome === 'lucky' || friendly) wobble = friendly ? 140 : 60;
        } else if (shot.outcome === 'blown') {
            to = { x: 960 + dir * (220 + Math.random() * 260), y: 700 + Math.random() * 60 };
            height = 420;
            wobble = 190;
        } else {
            to = { x: MISS_SPOT[team].x + (Math.random() - 0.5) * 140, y: MISS_SPOT[team].y + (Math.random() - 0.5) * 30 };
            height = 240;
            if (shot.storm) wobble = 70;
        }
        FX().shoot(H.fx, {
            from, to, height, wobble, duration: flight,
            r: big ? 30 : 22,
            onLand: (pos) => land(shot, pos),
        });
    }

    function nextLabelSlot(team) {
        H.labelIdx[team] = ((H.labelIdx[team] || 0) + 1) % 4;
        const base = LABEL_AT[team];
        return { x: base.x, y: base.y + H.labelIdx[team] * 92 };
    }

    function land(shot, pos) {
        const target = shot.target;
        H.inflight[target] = Math.max(0, (H.inflight[target] || 0) - 1);
        const friendly = Boolean(shot.friendly || shot.outcome === 'blown' || shot.outcome === 'own');
        const hitLike = shot.damage > 0 && (shot.outcome === 'hit' || shot.outcome === 'lucky' || friendly);
        const down = Boolean(shot.fortDown) && !shot.lastShot;
        const tierCls = shot.lastShot ? 'is-last'
            : friendly ? 'is-blown'
            : shot.outcome === 'lucky' ? 'is-lucky'
            : shot.outcome === 'miss' ? 'is-miss'
            : shot.outcome === 'shield' ? 'is-blown'
            : `is-${shot.tier || 'fast'}`;
        const who = shot.nickname ? `${shot.nickname}: ` : '';
        const text = shot.lastShot ? `LAST SHOT! ${shot.nickname || ''}`.trim() : `${who}${shot.label}`;
        label(nextLabelSlot(shot.team), text, tierCls, { detail: shot.lastShot ? '' : (shot.detail || ''), long: shot.lastShot });
        pushFeed(shot);
        if (hitLike) {
            FX().explosion(H.fx, pos, { scale: shot.lastShot || down ? 1.7 : shot.outcome === 'lucky' ? 1.35 : 1 });
            FX().smoke(H.fx, pos, { n: 8, drift: 90, color: '90,90,95', size: 42 });
            FX().shake($('wc-shake'), { power: down || shot.lastShot ? 34 : shot.outcome === 'lucky' ? 24 : 12, duration: down ? 800 : 420 });
            sfx('explosion', down ? { rate: 0.8 } : { volume: 0.8 });
            const fort = document.querySelector(`#wc-scene .wc-fort--${target}`);
            if (fort) { fort.classList.remove('is-hit'); void fort.offsetWidth; fort.classList.add('is-hit'); }
            const hp = shot.hpAfter ?? 0;
            if (!H.rebuilding.has(target) || down) {
                setBar(target, hp, { hit: true });
                FX().setFortDamage($('wc-scene'), target, hp);
            }
            damageNumber(target, shot.damage, shot.outcome === 'lucky');
            if (shot.outcome === 'lucky') {
                FX().lightning(H.fx, { x: pos.x, toY: pos.y - 20 });
                sfx('thunder', { volume: 0.7 });
                banner('lucky', 'LUCKY HIT!');
            } else if (friendly) {
                banner('blown', shot.outcome === 'blown' ? 'BLOWN BACK!' : 'OWN FORT!');
            }
        } else if (shot.outcome === 'shield') {
            FX().splash(H.fx, pos, { scale: 0.6 });
            sfx('pop', { volume: 0.5 });
        } else {
            FX().splash(H.fx, pos, { scale: shot.outcome === 'blown' ? 0.8 : 1 });
            sfx('splash', { volume: 0.8 });
            if (shot.outcome === 'blown') banner('blown', 'BLOWN BACK!');
        }
        // Score chips move with the ball that earned them.
        TEAMS.forEach((t) => {
            const pts = Math.max(H.ptsShown[t] || 0, shot.pointsAfter?.[t] ?? 0);
            const kills = Math.max(H.winsShown[t] || 0, shot.winsAfter?.[t] ?? 0);
            const pop = pts > (H.ptsShown[t] || 0);
            H.ptsShown[t] = pts;
            H.winsShown[t] = kills;
            setScore(t, pts, kills, { pop });
        });
        if (down) {
            const killer = other(target);
            H.rebuilding.add(target);
            setTimeout(() => downFlag(target), 250);
            cardAway(true);
            setTimeout(() => { if (H.state?.phase === 'battle') cardAway(false); }, 2900);
            banner('last', `${target.toUpperCase()} FORT DOWN!`, { pill: `+1 🏆 WIN for ${NAMES[killer]}`, pillCls: `is-${killer}` });
            caption(`${NAMES[killer]}: +1 🏆 WIN (${shot.winsAfter?.[killer] ?? ''} total)! Fort rebuilds…`);
            sfx('thud');
            const nowServer = Date.now() + H.offset;
            schedule(Math.max(1600, (shot.rebuildAt || nowServer + 2200) - nowServer), () => rebuildFort(target));
        }
        if (shot.lastShot) {
            setTimeout(() => downFlag(target), 300);
            setTimeout(() => {
                $('wc-vignette')?.classList.remove('is-on');
                $('wc-slowmo')?.classList.remove('is-on');
            }, 1700);
        }
        if (H.state && !H.inflight[target] && !H.rebuilding.has(target)) {
            // All balls for this fort landed: settle on the server's number.
            const hp = H.state.teams?.[target]?.hp;
            if (hp != null && H.state.phase === 'battle') {
                setBar(target, hp);
                FX().setFortDamage($('wc-scene'), target, hp);
            }
        }
    }

    function downFlag(team, instant = false) {
        if (H.flagsDown.has(team)) return;
        H.flagsDown.add(team);
        const flag = document.querySelector(`#wc-scene .wc-flag--${team}`);
        if (!flag) return;
        if (instant) { flag.classList.add('is-down'); return; }
        flag.classList.add('is-falling');
        sfx('crumble');
        setTimeout(() => { flag.classList.remove('is-falling'); flag.classList.add('is-down'); }, 1500);
    }

    function raiseFlag(team) {
        H.flagsDown.delete(team);
        const flag = document.querySelector(`#wc-scene .wc-flag--${team}`);
        if (!flag) return;
        flag.classList.remove('is-falling', 'is-down');
    }

    function rebuildFort(team) {
        H.rebuilding.delete(team);
        if (H.state?.phase === 'ending' || H.state?.phase === 'finished') return;
        raiseFlag(team);
        const hp = H.state?.teams?.[team]?.hp ?? 100;
        setBar(team, hp, { hit: true });
        FX().setFortDamage($('wc-scene'), team, hp);
        sfx('chime', { volume: 0.6 });
    }

    function endSequence(result) {
        const winner = result?.winner || null;
        cardAway(true);
        const go = () => {
            if (!winner) {
                banner('win', "IT'S A DRAW!", { cls: 'is-draw' });
                caption("It's a draw!");
            } else {
                banner('win', `${winner.toUpperCase()} TEAM WINS!`, { cls: `is-${winner}` });
                const pts = result.points?.[winner];
                const w = result.wins || {};
                const byWins = (w.red ?? 0) !== (w.blue ?? 0);
                caption(byWins ? `${NAMES[winner]} wins with ${w[winner]} 🏆 WIN${w[winner] === 1 ? '' : 'S'}!`
                    : pts != null ? `${NAMES[winner]} wins on points: ${pts}!` : `${NAMES[winner]} wins the battle!`);
            }
            sfx('fanfare');
            if (H.cancelConfetti) H.cancelConfetti();
            H.cancelConfetti = FX().confetti(H.fx, { duration: 5200, burst: { x: 960, y: 420 } });
        };
        if (result?.reason === 'time' || result?.reason === 'draw') {
            banner('timeup', "TIME'S UP!");
            sfx('thud');
            schedule(1500, go);
        } else {
            schedule(400, go);
        }
    }

    // ---------------- host lobby theme ----------------
    WCB.syncLobbyTheme = function syncLobbyTheme(inLobby) {
        document.body.classList.toggle('wc-lobby', Boolean(inLobby));
        if (!inLobby || !FX()) return;
        const backdrop = $('wc-lobby-backdrop');
        if (backdrop) {
            let scene = backdrop.querySelector('.wc-scene');
            if (!scene) {
                scene = document.createElement('div');
                scene.className = 'wc-scene';
                backdrop.appendChild(scene);
                FX().mountScene(scene);
            }
            const s = Math.max(window.innerWidth / 1920, window.innerHeight / 1080);
            scene.style.transform = `scale(${s.toFixed(3)}) translate(-50%, -50%)`;
        }
        const title = $('wc-lobby-title');
        if (title && !title.firstChild) {
            title.innerHTML = `${FX().titleHtml(['WORD CANNON BATTLE'])}<p>Red vs Blue · every correct answer fires instantly · faster = more force · storm in the final minute</p>`;
        }
    };

    /** Red / Blue columns for the host lobby (pick and random modes). */
    WCB.lobbyTeamsHtml = function lobbyTeamsHtml(snapshot, { removable = true } = {}) {
        const teams = snapshot?.teams || [];
        const byId = Object.fromEntries(teams.map((t) => [t.id, t]));
        const col = (id) => {
            const members = teamMembers(byId[id]);
            const rows = members.length
                ? members.map((m) => `<div class="live-team-member-row"><span>${buddy(m.avatar)}${esc(m.nickname)}</span>${removable ? `<button type="button" class="live-remove-player-btn" data-remove-player="${esc(m.id)}" title="Remove player" aria-label="Remove ${esc(m.nickname)}">✕</button>` : ''}</div>`).join('')
                : '<em>No sailors yet</em>';
            return `<div class="wc-lobby-team wc-lobby-team--${id}"><h4>${id.toUpperCase()} TEAM <small>${members.length} ${members.length === 1 ? 'player' : 'players'}</small></h4>${rows}</div>`;
        };
        const waiting = snapshot?.unassignedPlayers || [];
        const rest = waiting.length
            ? `<p class="live-muted" style="margin:0.6rem 0 0.2rem;font-weight:700;">Still choosing (${waiting.length}): ${waiting.map((p) => esc(p.nickname)).join(', ')}</p>`
            : '';
        return `<div class="wc-lobby-teams">${col('red')}${col('blue')}</div>${rest}`;
    };

    // ==================================================================
    // PHONE
    // ==================================================================
    const P = { state: null, offset: 0, key: null, result: null, qid: null, qEndsAt: null, qMs: 20000, timer: null, toastTimer: null, shotTimers: [], stormOn: false };

    function phoneSkySvg() {
        const cl = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff"><circle cx="0" cy="0" r="40"/><circle cx="46" cy="-16" r="50"/><circle cx="98" cy="-2" r="40"/><circle cx="50" cy="18" r="36"/><ellipse cx="50" cy="30" rx="110" ry="14" fill="#d3e9fa"/></g>`;
        return `<svg viewBox="0 0 780 1688" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
            <defs><linearGradient id="wcpSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#47c3ee"/><stop offset="1" stop-color="#0866b3"/></linearGradient></defs>
            ${cl(70, 170, 1)}${cl(520, 120, 0.8)}${cl(600, 420, 0.6)}${cl(140, 520, 0.55)}
            <rect x="0" y="860" width="780" height="828" fill="url(#wcpSea)"/>
            <g fill="none" stroke="#bfeeff" stroke-width="5" stroke-linecap="round" opacity="0.6">
                <path d="M60,980 q30,-14 60,0 t60,0"/><path d="M480,1040 q30,-14 60,0 t60,0"/><path d="M250,1180 q30,-14 60,0 t60,0"/><path d="M560,1320 q30,-14 60,0 t60,0"/><path d="M90,1440 q30,-14 60,0 t60,0"/>
            </g>
            <path d="M-20,880 Q60,800 200,812 Q250,840 260,880 Z" fill="#f4d58d"/><path d="M-20,880 L260,880 L240,912 L-20,920Z" fill="#8a6a4a"/>
            <rect x="70" y="760" width="74" height="60" fill="#d64545" stroke="#7a1f1f" stroke-width="4"/><path d="M110,640 V762" stroke="#5a3a1a" stroke-width="6"/><path d="M112,642 h70 l-12,22 l12,22 h-70z" fill="#e23b3b"/>
            <path d="M800,890 Q720,812 580,824 Q530,850 520,890 Z" fill="#f4d58d"/><path d="M800,890 L520,890 L540,920 L800,928Z" fill="#8a6a4a"/>
            <rect x="630" y="772" width="78" height="60" fill="#3d6fe0" stroke="#183c8f" stroke-width="4"/><path d="M670,652 V774" stroke="#5a3a1a" stroke-width="6"/><path d="M672,654 h70 l-12,22 l12,22 h-70z" fill="#2f6bff"/>
        </svg>`;
    }
    function mountPhoneSky() {
        const sky = $('wc-phone-sky');
        if (sky && !sky.firstChild) sky.innerHTML = phoneSkySvg();
    }

    function myTeam(state) {
        if (state?.you?.team) return state.you.team;
        const id = String(ctx.playerId() ?? '');
        for (const t of TEAMS) {
            if ((state?.teams?.[t]?.members || []).some((m) => String(m.id) === id)) return t;
        }
        return P.result?.team || null;
    }

    WCB.phoneResult = function phoneResult(result) {
        if (!result) return;
        P.result = result;
        P.resultAt = Date.now();
        // The state push for this answer may still be on its way: move "you" on locally so the
        // render below keeps the Challenge panel (prompt) or the feedback card on screen.
        if (P.state?.you && result.questionId != null) {
            P.state = { ...P.state, you: { ...P.state.you, mode: result.challengeable ? 'prompt' : 'feedback', questionId: null } };
        }
        if (result.correct) {
            sfx('boom', { volume: 0.6 });
            if (navigator.vibrate) { try { navigator.vibrate(50); } catch (_) { /* optional */ } }
        } else if (!result.challengeable) sfx('miss', { volume: 0.6 });
        if (P.state) WCB.renderPhone(P.state);
    };
    /** A new own question arrived: drop the old feedback card. */
    WCB.phoneQuestion = function phoneQuestion(q) {
        P.qid = q?.questionId ?? null;
        P.qEndsAt = q?.endsAt ?? null;
        P.qMs = (q?.timeLimitSec || 20) * 1000;
        P.result = null;
        if (P.state?.you && q) {
            P.state = { ...P.state, you: { ...P.state.you, mode: 'answering', questionId: q.questionId, endsAt: q.endsAt ?? null } };
        }
        if (P.state) WCB.renderPhone(P.state);
    };
    WCB.phoneChallengeSent = function phoneChallengeSent() {
        phoneToast('📨 Challenge sent — the teacher will check it. Keep firing!', 'is-info');
    };
    WCB.phoneChallengeResolved = function phoneChallengeResolved(result) {
        if (result?.challengeAccepted) {
            const s = result.shot;
            const what = s ? (s.outcome === 'hit' || s.outcome === 'lucky' ? `HIT −${fmtDmg(s.damage)}` : s.label) : '';
            phoneToast(`✅ Challenge accepted! "${result.answerText}" counts${s ? ` — shot fired: ${what}` : ''}`, 'is-good');
            sfx('chime', { volume: 0.7 });
        } else if (result?.challengeDeclined) {
            phoneToast(`❌ Challenge rejected — the answer was ${result.correctTerm || '…'}`, 'is-bad');
        }
    };
    function phoneToast(text, cls = '') {
        const root = $('live-play-cannon');
        if (!root) return;
        let el = $('wcp-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'wcp-toast';
            el.className = 'wcp-toast';
            el.setAttribute('role', 'status');
            root.appendChild(el);
        }
        el.className = `wcp-toast ${cls} is-on`;
        el.textContent = text;
        clearTimeout(P.toastTimer);
        P.toastTimer = setTimeout(() => el.classList.remove('is-on'), 3200);
    }

    WCB.resetPhone = function resetPhone() {
        P.state = null;
        P.key = null;
        P.result = null;
        P.qid = null;
        P.qEndsAt = null;
        P.shotTimers.forEach(clearTimeout);
        P.shotTimers = [];
        clearInterval(P.timer);
        P.timer = null;
        clearTimeout(P.toastTimer);
        const root = $('live-play-cannon');
        if (root) { root.hidden = true; root.innerHTML = ''; }
        document.body.classList.remove('live-cannon-player', 'wc-phone-storm', 'wcp-feedback');
    };

    WCB.isPhoneActive = () => document.body.classList.contains('live-cannon-player');


    /** Feedback for this phone's last answer (null while answering). */
    function phoneBodyHtml(state, you, team) {
        const phase = state.phase;
        const ball = `<span class="wcp-ball">${FX().ballSvg()}</span>`;
        if (phase === 'intro') {
            return `<div class="wcp-card is-good wcp-tutorial">${ball}<b>Quick tutorial</b>
                <p>You're on <strong>${esc(NAMES[team] || 'crew')}</strong>.</p>
                <ul class="wcp-tutorial-list">
                    <li>Answer at your own pace — each correct answer fires <strong>right away</strong>.</li>
                    <li>Faster answers hit harder.</li>
                    <li>Each fort you destroy = <strong>1 WIN</strong> for your team.</li>
                </ul>
                <p class="wcp-tutorial-note">Watch the big screen — the battle starts in a moment.</p></div>`;
        }
        if (phase === 'ending') {
            const r = state.result;
            const head = r?.winner ? `${r.winner.toUpperCase()} TEAM WINS!` : "IT'S A DRAW!";
            return `<div class="wcp-card ${r?.winner === team ? 'is-good' : ''}"><b>${esc(head)}</b><p>Watch the big screen!</p></div>`;
        }
        const r = P.result;
        if (!r || (P.qid != null && r.questionId !== P.qid)) return '';
        if (r.challengeable) return '';
        if (r.correct) {
            const s = r.shot || {};
            const tier = r.tier || s.tier || 'good';
            const secs = r.ms != null ? `${(r.ms / 1000).toFixed(1)}s` : '';
            const out = s.lastShot ? 'LAST SHOT — you won it!'
                : s.fortDown && s.target !== team ? 'FORT DOWN! +1 🏆 WIN'
                : s.outcome === 'hit' ? `HIT −${fmtDmg(s.damage)}`
                : s.outcome === 'lucky' ? `LUCKY HIT −${fmtDmg(s.damage)}`
                : s.outcome === 'shield' ? 'Shield! Fort is rebuilding'
                : s.outcome === 'blown' ? `Blown back! −${fmtDmg(s.damage)} own fort`
                : s.outcome === 'own' ? `Own fort −${fmtDmg(s.damage)}`
                : 'MISS — splash!';
            const cls = s.outcome === 'hit' || s.outcome === 'lucky' ? 'is-hit' : s.outcome === 'miss' || s.outcome === 'shield' ? 'is-miss' : 'is-blown';
            return `<div class="wcp-card is-good wcp-fired"><div class="wcp-plus">BOOM! FIRED</div>
                <span class="wcp-tier is-${tier}">${tier.toUpperCase()} ${secs}</span>
                <div class="wcp-shot ${cls}"><b>${esc(out)}</b><small>${esc(s.detail || '')}</small></div></div>`;
        }
        const term = r.correctTerm ? `<p>The answer was <strong>${esc(r.correctTerm)}</strong>.</p>` : '';
        const head = r.timedOut ? '⏰ Time\'s up! No shot' : '✗ Not quite — no shot';
        return `<div class="wcp-card is-bad"><b>${head}</b>${term}<p class="wcp-next">Next question…</p></div>`;
    }

    WCB.renderPhone = function renderPhone(state) {
        const root = $('live-play-cannon');
        if (!root || !state || !FX()) return;
        P.state = state;
        P.offset = (state.serverNow || Date.now()) - Date.now();
        if (state.phase === 'finished') return;
        root.hidden = false;
        document.body.classList.add('live-cannon-player');
        document.body.classList.remove('wc-player-lobby');
        const lobby = $('wc-player-lobby');
        if (lobby) lobby.hidden = true;
        mountPhoneSky();
        const you = state.you || {};
        const team = myTeam(state);
        if (!root.querySelector('.wcp-top')) {
            root.innerHTML = `
                <div class="wcp-top"><span class="wcp-logo">Lingo<span>Spark</span></span><span class="wcp-storm" id="wcp-storm"></span></div>
                <div class="wcp-team" id="wcp-team"></div>
                <div class="wcp-score" id="wcp-score"><b class="is-red" id="wcp-pts-red">0</b><b class="is-blue" id="wcp-pts-blue">0</b></div>
                <div class="wcp-hp">
                    <div class="wcp-bar is-red" id="wcp-bar-red"><i></i><span></span></div>
                    <div class="wcp-bar is-blue" id="wcp-bar-blue"><i></i><span></span></div>
                </div>
                <div class="wcp-ringrow"><div class="wcp-mine" id="wcp-mine"></div><div class="wcp-ring" id="wcp-ring" hidden>${ringSvg()}<b></b></div></div>
                <div class="wcp-body" id="wcp-body"></div>`;
            P.key = null;
        }
        const teamEl = $('wcp-team');
        if (teamEl) {
            teamEl.className = `wcp-team is-${team || 'blue'}`;
            const html = `${esc((NAMES[team] || 'Team').toUpperCase())} <small>${esc(ctx.nickname() || '')}</small>`;
            if (teamEl.dataset.html !== html) { teamEl.dataset.html = html; teamEl.innerHTML = html; }
        }
        TEAMS.forEach((t) => {
            const bar = $(`wcp-bar-${t}`);
            if (!bar) return;
            const hp = state.teams?.[t]?.hp ?? 100;
            bar.querySelector('i').style.width = `${Math.max(0, Math.min(100, hp))}%`;
            bar.querySelector('span').textContent = `${t.toUpperCase()} ${Math.round(hp)}%`;
            bar.classList.toggle('is-mine', t === team);
            setPhoneScore(t, state.teams?.[t]?.points ?? 0, state.teams?.[t]?.fortKills || 0, true);
        });
        const mine = $('wcp-mine');
        if (mine) {
            const st = you.stats || {};
            const html = `<span>🎯 ${st.hits || 0}</span><span>✔ ${st.correct || 0}/${st.answered || 0}</span>${st.streak >= 2 ? `<span class="is-streak">🔥 ${st.streak}</span>` : ''}`;
            if (mine.dataset.html !== html) { mine.dataset.html = html; mine.innerHTML = html; }
        }
        // Question id the server is waiting on (when it is the one this phone shows).
        if (you.mode === 'answering' && you.questionId != null && P.qid == null) P.qid = you.questionId;
        const showingFeedback = Boolean(P.result && (P.qid == null || P.result.questionId === P.qid));
        const asking = state.phase === 'battle' && you.mode === 'answering' && !showingFeedback;
        const body = $('wcp-body');
        const key = [state.phase, P.qid ?? '', showingFeedback ? `${P.result.questionId}|${P.result.correct ? 1 : 0}|${P.result.challengeable ? 'c' : ''}` : '', state.result?.winner ?? ''].join('|');
        if (body && P.key !== key) {
            P.key = key;
            body.innerHTML = phoneBodyHtml(state, you, team);
        }
        document.body.classList.toggle('wcp-feedback', !asking);
        const def = $('live-play-definition');
        const typeSection = $('live-play-type-section');
        const choices = $('live-play-choices');
        if (!asking) {
            const keepDef = Boolean(P.result?.challengeable) && you.mode === 'prompt';
            if (def) def.hidden = !keepDef;
            if (typeSection) typeSection.hidden = true;
            if (choices) choices.hidden = true;
            if (ctx.setAnswerInputsEnabled) ctx.setAnswerInputsEnabled(false);
        } else {
            if (def) def.hidden = false;
            // Self-heal: make sure this phone shows the answer UI for its live question.
            ctx.ensureQuestion?.(you.questionId, null);
        }
        const status = $('live-play-status');
        if (status) {
            let note = '';
            if (asking) note = state.suddenDeath ? 'Sudden death! First correct answer fires the LAST SHOT.' : 'Answer fast — your shot fires the moment you are right!';
            status.textContent = note;
        }
        if (!(you.mode === 'prompt' && P.result?.challengeable) && ctx.hideChallengeActions) ctx.hideChallengeActions();
        if (!P.timer) P.timer = setInterval(tickPhone, 250);
        tickPhone();
    };

    function setPhoneScore(t, pts, kills, pop = false) {
        const el = $(`wcp-pts-${t}`);
        if (!el) return;
        const key = `${kills}|${pts}`;
        if (el.dataset.key === key) return;
        const grew = el.dataset.key != null && pop;
        el.dataset.key = key;
        el.innerHTML = `<span class="wcp-wins" title="Forts destroyed">🏆 ${Math.round(kills)}</span><span>${Math.round(pts)} pts</span>`;
        if (grew) { el.classList.remove('is-pop'); void el.offsetWidth; el.classList.add('is-pop'); }
    }

    function tickPhone() {
        const state = P.state;
        if (!state || !document.body.classList.contains('live-cannon-player')) return;
        const chip = $('wcp-storm');
        const left = clockLeft(state, P.offset);
        const stormLeft = left - (state.clock?.stormMs || 60000);
        const started = Boolean(state.clock?.gameEndsAt);
        const storm = started && !state.suddenDeath && (stormLeft <= 0 || state.storm);
        if (chip) {
            const html = state.suddenDeath ? `${FX().stormIconSvg()}SUDDEN DEATH`
                : storm ? `${FX().stormIconSvg()}STORM! ${fmtClock(left)}` : `${FX().stormIconSvg()}${fmtClock(left)} · storm in ${fmtClock(stormLeft)}`;
            if (chip.dataset.html !== html) { chip.dataset.html = html; chip.innerHTML = html; }
            chip.classList.toggle('is-storm', storm || state.suddenDeath);
        }
        document.body.classList.toggle('wc-phone-storm', storm);
        const me = state.you || {};
        const showingFeedback = Boolean(P.result && (P.qid == null || P.result.questionId === P.qid));
        const asking = state.phase === 'battle' && me.mode === 'answering' && !showingFeedback;
        const endsAt = asking ? (P.qid === me.questionId ? (me.endsAt ?? P.qEndsAt) : P.qEndsAt) : null;
        if (asking && endsAt && endsAt > Date.now() + P.offset) ctx.ensureQuestion?.(me.questionId, null);
        const ring = $('wcp-ring');
        if (ring) {
            ring.hidden = !asking || !endsAt;
            if (asking && endsAt) paintRing(ring, Math.max(0, endsAt - (Date.now() + P.offset)), state.questionMs || P.qMs || 20000);
        }
    }

    // ---------------- phone waiting screen ----------------
    /** opts: { on, snapshot, playerId, nickname, code, msg, pickMode, onPick(teamId) } */
    WCB.syncPlayerLobby = function syncPlayerLobby(opts) {
        const el = $('wc-player-lobby');
        const on = Boolean(opts?.on) && Boolean(FX());
        document.body.classList.toggle('wc-player-lobby', on);
        if (!el) return;
        el.hidden = !on;
        if (!on) return;
        mountPhoneSky();
        if (!el.querySelector('.wcpl-top')) {
            el.innerHTML = `
                <div class="wcpl-top"><span class="wcp-logo">Lingo<span>Spark</span></span><span class="wcpl-room">Room <b class="wcpl-room-code"></b></span></div>
                ${FX().titleHtml(['WORD CANNON', 'BATTLE'])}
                <div class="wcpl-cannon">${FX().cannonSvg('red')}</div>
                <div class="wcpl-card">
                    <span class="wcpl-label">You're in as</span>
                    <b class="wcpl-name"></b>
                    <div class="wcpl-teamline"></div>
                    <div class="wcpl-pick" hidden>
                        <button type="button" class="is-red" data-wc-team="red">RED TEAM<small></small></button>
                        <button type="button" class="is-blue" data-wc-team="blue">BLUE TEAM<small></small></button>
                    </div>
                    <div class="wcpl-wait"><span class="wcpl-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="wcpl-msg"></span></div>
                </div>
                <p class="wcpl-count"></p>
                <div class="wcpl-rules"><span>💣 Every correct answer fires instantly</span><span>🎯 Every 0.1s weaker force — answer fast</span><span>⛈️ Final minute: storm makes shots wild</span></div>`;
            el.querySelectorAll('[data-wc-team]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    if (btn.disabled) return;
                    sfx('pop');
                    el._onPick?.(btn.getAttribute('data-wc-team'));
                });
            });
        }
        el._onPick = opts.onPick;
        el.querySelector('.wcpl-room-code').textContent = opts.code || '----';
        el.querySelector('.wcpl-name').textContent = opts.nickname || 'Player';
        const snap = opts.snapshot || {};
        const teams = Object.fromEntries((snap.teams || []).map((t) => [t.id, t]));
        const pid = String(opts.playerId ?? '');
        let mine = null;
        for (const t of TEAMS) if ((teams[t]?.memberIds || []).some((id) => String(id) === pid)) mine = t;
        const pick = el.querySelector('.wcpl-pick');
        const pickMode = Boolean(opts.pickMode);
        pick.hidden = !pickMode;
        el.querySelectorAll('[data-wc-team]').forEach((btn) => {
            const t = btn.getAttribute('data-wc-team');
            const n = teams[t]?.memberCount ?? teamMembers(teams[t]).length;
            btn.querySelector('small').textContent = `${n} ${n === 1 ? 'player' : 'players'}`;
            btn.classList.toggle('is-on', mine === t);
        });
        const line = el.querySelector('.wcpl-teamline');
        if (mine) line.innerHTML = `<span class="wcp-team is-${mine}">${mine.toUpperCase()} TEAM</span>`;
        else line.innerHTML = pickMode ? '<span class="wcpl-label">Choose your side:</span>' : '<span class="wcpl-label">Teams are picked at random when the battle starts.</span>';
        const msg = el.querySelector('.wcpl-msg');
        msg.textContent = opts.msg || (pickMode && !mine ? 'Tap Red or Blue to join a team' : 'Waiting for the host to start…');
        const count = (snap.players || []).length;
        el.querySelector('.wcpl-count').textContent = count ? `${count} ${count === 1 ? 'sailor' : 'sailors'} in the room` : '';
    };

    // ==================================================================
    // WINNER SCREEN
    // ==================================================================
    /** data = gameFinishedPayload (cannon). Returns inner html for #live-winner-content. */
    WCB.winnerHtml = function winnerHtml(data, { playerId = null } = {}) {
        const winner = data?.winner || null;
        const players = data?.players || [];
        const pid = String(playerId ?? '');
        const myTeamId = players.find((p) => String(p.id) === pid)?.team || null;
        const title = winner ? `${winner.toUpperCase()} TEAM WINS!` : "IT'S A DRAW!";
        const w = data?.wins || { red: data?.teams?.red?.fortKills || 0, blue: data?.teams?.blue?.fortKills || 0 };
        const rule = winner && (w.red ?? 0) !== (w.blue ?? 0) ? 'most 🏆 WINS wins' : 'WINS tied — most points wins';
        const reason = data?.reason === 'sudden' ? 'Won with the LAST SHOT in sudden death!'
            : data?.reason === 'time' ? `Time's up — ${rule}!`
            : data?.reason === 'ended' ? `Host ended the battle — ${rule}!`
            : data?.reason === 'draw' ? 'Nobody fired the last shot.' : 'Battle over.';
        const you = myTeamId ? (winner === myTeamId ? ' That\'s your team!' : '') : '';
        const col = (t) => {
            const team = data?.teams?.[t] || {};
            const rows = players.filter((p) => p.team === t).sort((a, b) => (b.hits - a.hits) || (b.correct - a.correct) || String(a.nickname).localeCompare(String(b.nickname)));
            const list = rows.length ? rows.map((p) => `<li class="${String(p.id) === pid ? 'is-you' : ''}"><span>${esc(p.nickname)}${data?.mvp?.id === p.id ? ' ⭐' : ''}</span><span>🎯 ${p.hits || 0} · ✔ ${p.correct || 0}</span></li>`).join('') : '<li><span>—</span></li>';
            const pts = Math.round(team.points ?? data?.points?.[t] ?? 0);
            const kills = Math.round(team.fortKills || 0);
            const dmg = Math.round(team.damageDealt || 0);
            return `<div class="wc-win-team wc-win-team--${t}${winner === t ? ' is-winner' : ''}">${winner === t ? '<span class="wc-crown" aria-hidden="true">👑</span>' : ''}
                <h3>${t.toUpperCase()} TEAM <small>${pts} pts</small></h3>
                <p class="wc-win-team-stats"><span class="wc-win-wins">🏆 ${kills} WIN${kills === 1 ? '' : 'S'}</span><span>💥 ${dmg} damage</span></p>
                <ol>${list}</ol></div>`;
        };
        const mvp = data?.mvp;
        const mvpHtml = mvp ? `<div class="wc-mvp"><span class="wc-mvp-badge">MVP</span><span class="wc-mvp-ball">${FX().ballSvg()}</span>
                <span class="wc-mvp-name">${esc(mvp.nickname)}</span><span class="wc-mvp-team is-${esc(mvp.team)}">${esc(NAMES[mvp.team] || '')}</span>
                <div class="wc-mvp-stats"><span>🎯 ${mvp.hits || 0} hits</span><span>💥 ${Math.round(mvp.damage || 0)} damage</span><span>✔ ${mvp.correct || 0} correct</span></div></div>`
            : '<div class="wc-mvp"><span class="wc-mvp-badge">MVP</span><span class="wc-mvp-name">—</span></div>';
        return `<h2 class="wc-win-title ${winner ? `is-${winner}` : ''}">${popText(title)}</h2>
            <p class="wc-win-sub">${esc(reason)}${esc(you)}</p>
            <div class="wc-win-grid">${col('red')}${mvpHtml}${col('blue')}</div>`;
    };

    WCB.mountWinBackdrop = function mountWinBackdrop(screen, winner) {
        if (!screen || !FX()) return;
        screen.querySelector('.wc-win-backdrop')?.remove();
        const backdrop = document.createElement('div');
        backdrop.className = 'wc-win-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        const scene = document.createElement('div');
        scene.className = 'wc-scene';
        backdrop.appendChild(scene);
        screen.prepend(backdrop);
        FX().mountScene(scene);
        if (winner) scene.querySelector(`.wc-flag--${other(winner)}`)?.classList.add('is-down');
        const s = Math.max(window.innerWidth / 1920, window.innerHeight / 1080);
        scene.style.transform = `scale(${s.toFixed(3)}) translate(-50%, -50%)`;
    };
})();
