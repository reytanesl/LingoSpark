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
    const teamMembers = (team) => (team?.memberIds || []).map((id, i) => ({ id, nickname: team.memberNicknames?.[i] || 'Player' }));

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
    };
    WCB.hostRevealDoneAt = () => H.revealDoneAt;
    WCB.clearHostReveal = () => { H.revealDoneAt = 0; };

    function barHtml(team) {
        return `<div class="wc-bar wc-bar--${team}" id="wc-bar-${team}"><div class="wc-bar-fill"></div><div class="wc-bar-text"><span>${team.toUpperCase()}</span><span class="wc-bar-pct">100%</span></div></div>
            <div class="wc-score wc-score--${team}" id="wc-score-${team}">
                <span class="wc-wins" id="wc-wins-${team}"><span class="wc-wins-label">WINS</span><b class="wc-wins-num">0</b></span>
                <span class="wc-score-label">PTS</span><b class="wc-score-num">0</b>
            </div>`;
    }
    function phonesHtml(team) {
        return `<div class="wc-phones wc-phones--${team}" id="wc-phones-${team}" hidden><div class="wc-phone-ic"><span class="wc-phone-check">✓</span></div><span class="wc-phone-count">0/0</span></div>`;
    }

    function buildHost() {
        const root = $('live-host-cannon');
        if (!root || !FX()) return false;
        // Rebuild if an older scaffold (ammo trays) is still mounted.
        if (H.built && root.querySelector('#wc-wins-red, .wc-wins, #wc-rain-layer')) return true;
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
            const phase = H.state?.phase;
            if (phase === 'volley') ctx.emit('live:cannon-next');
            else ctx.emit('live:cannon-skip');
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
        const show = state.phase === 'question' || state.phase === 'review';
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

    function caption(text) {
        const el = $('wc-caption-text');
        if (!el || el.dataset.text === text) return;
        el.dataset.text = text;
        el.innerHTML = `<span class="wc-caption-star">★</span>${esc(text)}`;
        el.classList.remove('is-swap');
        void el.offsetWidth;
        el.classList.add('is-swap');
    }
    function phaseCaption(state) {
        if (!state) return;
        if (state.phase === 'intro') return caption('Score points: correct answers, damage, and fort WINS. Timer decides the winner!');
        if (state.suddenDeath && state.phase !== 'volley') return caption('Points tied! Sudden death: the fastest correct answer fires the LAST SHOT!');
        if (state.phase === 'review') return caption('Checking challenges… the cannons are waiting');
        if (state.phase === 'volley') {
            const v = state.volley;
            if (v?.shots?.some((s) => s.final)) return; // the shot itself sets "Last shot decides the battle!"
            if (H.stormOn) return caption('STORM! Shots are wild — get answers right before the weather hits');
            return caption('Every 0.1s weaker force — faster answers hit harder');
        }
        if (H.stormOn) return caption('STORM! Shots are wild — get answers right before the weather hits');
        const tips = [
            'Every 0.1s weaker force — faster answers hit harder',
            'Destroy a fort for a WIN (+20 pts) — it rebuilds and play goes on!',
            'Most points when the timer ends wins',
        ];
        caption(tips[H.captionAlt % tips.length]);
    }

    function startHostClock() {
        stopHostClock();
        H.clockTimer = setInterval(tickHost, 200);
        H.captionTimer = setInterval(() => {
            H.captionAlt += 1;
            if (H.state?.phase === 'question') phaseCaption(H.state);
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
        const ring = document.querySelector('#wc-question .wc-ring');
        if (ring && state.phase === 'question') {
            paintRing(ring, Math.max(0, (state.phaseEndsAt || 0) - (Date.now() + H.offset)), state.questionMs || 20000, false);
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
            caption('STORM! Shots are wild — get answers right before the weather hits');
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

    function banner(kind, text, { cls = '', pill = '', pillCls = '' } = {}) {
        const box = $('wc-banners');
        if (!box) return null;
        const el = document.createElement('div');
        el.className = `wc-banner wc-banner--${kind} ${cls}`;
        el.innerHTML = popText(text);
        box.appendChild(el);
        let pillEl = null;
        if (pill) {
            pillEl = document.createElement('div');
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

    function label(at, text, cls, { long = false } = {}) {
        const box = $('wc-labels');
        if (!box) return;
        const el = document.createElement('div');
        el.className = `wc-label ${cls}${long ? ' is-long' : ''}`;
        el.style.left = `${at.x}px`;
        el.style.top = `${at.y}px`;
        el.textContent = text;
        box.appendChild(el);
        setTimeout(() => el.remove(), long ? 3900 : 2000);
    }
    function damageNumber(team, dmg, lucky) {
        const box = $('wc-labels');
        const bar = FX().G[team].bar;
        if (!box || !(dmg > 0)) return;
        const el = document.createElement('div');
        el.className = `wc-dmgnum${lucky ? ' is-lucky' : ''}`;
        el.style.left = `${bar.x + 180}px`;
        el.style.top = `${bar.y - 96}px`;
        el.textContent = `-${Math.round(dmg)}`;
        box.appendChild(el);
        setTimeout(() => el.remove(), 1700);
    }

    // ---------------- question card ----------------
    function renderQuestion(state) {
        const box = $('wc-question');
        if (!box) return;
        const phase = state.phase;
        if (phase === 'intro' || phase === 'finished' || (!state.definition && !state.volley)) {
            if (box.firstChild && phase !== 'finished') box.innerHTML = '';
            H.questionKey = null;
            return;
        }
        const volley = phase === 'volley' ? state.volley : null;
        const def = volley ? (volley.definition || state.definition) : state.definition;
        const key = `${state.questionId}|${volley ? 'v' + volley.seq : 'q'}`;
        const sudden = state.suddenDeath || volley?.suddenDeath;
        if (H.questionKey !== key) {
            const fresh = !String(H.questionKey || '').startsWith(`${state.questionId}|`);
            H.questionKey = key;
            const pill = sudden ? '<span class="wc-qcard-pill is-sudden">SUDDEN DEATH</span>' : '<span class="wc-qcard-pill">QUESTION</span>';
            box.innerHTML = `
                <div class="wc-qcard" style="${fresh ? '' : 'animation:none'}">${pill}
                    <div class="wc-qcard-text ${textSizeClass(def)}">${esc(def)}</div>
                    <div class="wc-ring"${volley ? ' hidden' : ''}>${ringSvg()}<span class="wc-ring-num"></span></div>
                </div>
                <div class="wc-qmeta" id="wc-qmeta"></div>`;
            if (volley) {
                const term = volley.answerTerm || '';
                if (term) {
                    const pillEl = document.createElement('div');
                    pillEl.className = 'wc-answer';
                    pillEl.innerHTML = `<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" fill="#fff"/><path d="M14,27 L23,36 L39,17" fill="none" stroke="#22b357" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>${esc(term)}`;
                    box.appendChild(pillEl);
                }
            }
        }
        const meta = $('wc-qmeta');
        if (!meta) return;
        if (phase === 'question') {
            const counter = `<span class="wc-count"><b>${state.answeredCount || 0}</b> / ${state.playerCount || 0} answered</span>`;
            const choices = (state.choices || []).map((c) => `<span class="wc-choice">${esc(c)}</span>`).join('');
            const html = counter + choices;
            if (meta.dataset.html !== html) { meta.dataset.html = html; meta.innerHTML = html; }
        } else if (phase === 'review') {
            const html = '<span class="wc-review">⏳ Waiting for the teacher to check a challenge…</span>';
            if (meta.dataset.html !== html) { meta.dataset.html = html; meta.innerHTML = html; }
            const ring = box.querySelector('.wc-ring');
            if (ring) ring.hidden = true;
        } else {
            meta.innerHTML = '';
            meta.dataset.html = '';
        }
    }

    // ---------------- intro ----------------
    function showIntro(state) {
        const intro = $('wc-intro');
        if (!intro) return;
        const left = Math.max(800, (state.phaseEndsAt || 0) - (Date.now() + H.offset));
        const names = (t) => (state.teams?.[t]?.members || []).map((m) => m.nickname).join(' · ') || '—';
        intro.classList.remove('is-out');
        intro.innerHTML = `${FX().logoHtml()}${FX().titleHtml(['WORD CANNON', 'BATTLE'])}
            <div class="wc-vs">
                <div class="wc-vs-team wc-vs-team--red"><h3>RED TEAM</h3><p>${esc(names('red'))}</p></div>
                <div class="wc-vs-mid">VS</div>
                <div class="wc-vs-team wc-vs-team--blue"><h3>BLUE TEAM</h3><p>${esc(names('blue'))}</p></div>
            </div>
            <div class="wc-intro-sub">Answer right · fire faster for more force · WINS for fort takedowns!</div>`;
        intro.hidden = false;
        $('wc-stage')?.classList.add('is-intro');
        sfx('fanfare', { volume: 0.5 });
        clearTimeout(H.introTimer);
        H.introTimer = setTimeout(() => hideIntro(), left - 500);
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

        const inVolley = state.phase === 'volley' && state.volley;
        if (!inVolley || (prev && prev.phase !== 'volley')) {
            if (!inVolley) {
                if (H.volleySeq != null && state.phase !== 'finished') clearVolley();
                TEAMS.forEach((t) => {
                    const hp = state.teams?.[t]?.hp ?? 100;
                    setBar(t, hp);
                    FX().setFortDamage($('wc-scene'), t, hp);
                });
            }
        }
        TEAMS.forEach((t) => {
            const team = state.teams?.[t];
            const prevPts = prev?.teams?.[t]?.points;
            setScore(t, team?.points || 0, team?.fortKills || 0, {
                pop: prev != null && (team?.points || 0) > (prevPts || 0),
            });
        });
        if (!inVolley && state.phase === 'question' && prev?.phase === 'question') {
            TEAMS.forEach((t) => {
                const nowLoaded = state.teams?.[t]?.loaded || 0;
                const wasLoaded = prev.teams?.[t]?.loaded || 0;
                if (nowLoaded > wasLoaded) sfx('pop', { volume: 0.7 });
            });
        }
        renderPhones(state);
        renderQuestion(state);
        if (state.storm && !H.stormOn) setStorm(true, { silent: Boolean(prev == null) });
        const nextBtn = $('wc-next');
        if (nextBtn) nextBtn.hidden = state.phase !== 'volley';
        const skipBtn = $('wc-skip');
        if (skipBtn) skipBtn.hidden = state.phase === 'finished';
        if (inVolley && state.volley.seq !== H.volleySeq) {
            H.volleySeq = state.volley.seq;
            playVolley(state);
        }
        phaseCaption(state);
        tickHost();
    };

    // ---------------- volley choreography ----------------
    const MISS_SPOT = { red: { x: 1150, y: 846 }, blue: { x: 770, y: 840 } };
    const LABEL_AT = { red: { x: 760, y: 500 }, blue: { x: 1170, y: 520 } };

    function playVolley(state) {
        clearVolley();
        const v = state.volley;
        const nowServer = Date.now() + H.offset;
        const start = (state.phaseEndsAt || nowServer) - (v.durationMs || 0);
        const elapsed = Math.max(0, nowServer - start);
        H.revealDoneAt = Date.now() + Math.max(0, (v.durationMs || 0) - elapsed);
        TEAMS.forEach((t) => {
            const hp0 = v.hpBefore?.[t] ?? 100;
            setBar(t, hp0, { quiet: true });
            FX().setFortDamage($('wc-scene'), t, hp0);
        });
        if (!v.shots.length) {
            schedule(500 - elapsed, () => {
                const msg = v.suddenDeath ? 'No correct answers: try again!' : 'No shots this round!';
                banner('timeup', '', { pill: msg, pillCls: 'is-sub' });
                sfx('miss');
            });
        } else if (elapsed < 400) {
            schedule(200, () => {
                const n = v.shots.length;
                banner('timeup', '', {
                    pill: v.suddenDeath ? 'LAST SHOT!' : `FIRE! ${n} shot${n === 1 ? '' : 's'}`,
                    pillCls: 'is-sub',
                });
            });
        }
        let hpNow = { ...(v.hpBefore || { red: 100, blue: 100 }) };
        for (const shot of v.shots) {
            const end = shot.at + shot.dur;
            if (end <= elapsed) {
                // Already happened before we joined: jump to its end state.
                hpNow[shot.target] = shot.hpAfter;
                setBar(shot.target, shot.hpAfter, { quiet: true });
                FX().setFortDamage($('wc-scene'), shot.target, shot.hpAfter);
                if (shot.final && shot.hpAfter <= 0) downFlag(shot.target, true);
                continue;
            }
            schedule(shot.at - elapsed, () => fireShot(shot, v));
        }
        const last = v.shots[v.shots.length - 1];
        const endAt = last ? last.at + last.dur : 600;
        if (v.rebuild && v.fortDown) {
            const rebuildAt = endAt + 900;
            schedule(rebuildAt - elapsed, () => rebuildFort(v.fortDown));
            TEAMS.forEach((t) => {
                const pts = v.points?.[t] ?? state.teams?.[t]?.points ?? 0;
                const kills = state.teams?.[t]?.fortKills || 0;
                setScore(t, pts, kills, { pop: true });
            });
        }
        if (v.next === 'finished') schedule(endAt - elapsed, () => endSequence(v));
        else if (v.next === 'sudden') {
            schedule(endAt - elapsed, () => {
                banner('timeup', "TIME'S UP!", { pill: 'Points tied! SUDDEN DEATH', pillCls: '' });
                sfx('thud');
            });
        }
    }

    function fireShot(shot, v) {
        const G = FX().G;
        const team = shot.team;
        const target = shot.target;
        const dir = team === 'red' ? 1 : -1;
        const final = Boolean(shot.final);
        const reduced = FX().reduced();
        const flight = final ? (reduced ? 1400 : 2400) : 950;
        const delay = final ? 700 : 0;
        if (final) {
            $('wc-vignette')?.classList.add('is-on');
            $('wc-slowmo')?.classList.add('is-on');
            if (shot.lastShot) {
                banner('last', 'LAST SHOT!');
                caption('Last shot decides the battle!');
            } else {
                banner('last', `${target.toUpperCase()} FORT DOWN!`);
                caption('Fort down! +20 points — it rebuilds and the battle goes on');
            }
            sfx('thud');
            setTimeout(() => sfx('thud', { volume: 0.8 }), 420);
        }
        schedule(delay, () => {
            const cannon = document.querySelector(`#wc-scene .wc-cannon--${team}`);
            if (cannon) { cannon.classList.remove('is-recoil'); void cannon.offsetWidth; cannon.classList.add('is-recoil'); }
            const from = G[team].muzzle;
            FX().muzzleFlash(H.fx, from, dir);
            FX().smoke(H.fx, from, { dir, n: final ? 14 : 9 });
            sfx('boom', final ? { rate: 0.8 } : undefined);
            setTimeout(() => sfx('whoosh', final ? { rate: 0.7 } : undefined), 80);
            if (shot.outcome === 'blown') setTimeout(() => sfx('wind'), 200);
            let to;
            let height = 300;
            let wobble = 0;
            if (shot.outcome === 'hit' || shot.outcome === 'lucky') {
                to = { x: G[target].hit.x + (Math.random() - 0.5) * 50, y: G[target].hit.y + (Math.random() - 0.5) * 30 };
                height = shot.outcome === 'lucky' ? 420 : final ? 380 : 300;
                if (v.storm || shot.outcome === 'lucky') wobble = 60;
            } else if (shot.outcome === 'blown') {
                to = { x: 960 + dir * (220 + Math.random() * 260), y: 700 + Math.random() * 60 };
                height = 420;
                wobble = 190;
            } else {
                to = { x: MISS_SPOT[team].x + (Math.random() - 0.5) * 140, y: MISS_SPOT[team].y + (Math.random() - 0.5) * 30 };
                height = 240;
                if (v.storm) wobble = 70;
            }
            FX().shoot(H.fx, {
                from, to, height, wobble, duration: flight,
                r: final ? 30 : 24,
                onLand: (pos) => land(shot, v, pos, final),
            });
        });
    }

    function land(shot, v, pos, final) {
        const team = shot.team;
        const target = shot.target;
        const hitLike = shot.outcome === 'hit' || shot.outcome === 'lucky';
        const tierCls = shot.lastShot ? 'is-last' : shot.outcome === 'blown' ? 'is-blown' : shot.outcome === 'lucky' ? 'is-lucky' : shot.outcome === 'miss' ? 'is-miss' : `is-${shot.tier || 'fast'}`;
        const who = shot.nickname ? `${shot.nickname}: ` : '';
        const text = shot.lastShot ? `LAST SHOT! ${who.replace(/: $/, '')}`.trim() : shot.label;
        label(LABEL_AT[team], text, tierCls, { long: final });
        if (hitLike) {
            FX().explosion(H.fx, pos, { scale: final ? 1.7 : shot.outcome === 'lucky' ? 1.35 : 1 });
            FX().smoke(H.fx, pos, { n: 10, spread: 90, color: '90,90,95', size: 46 });
            FX().shake($('wc-shake'), { power: final ? 36 : shot.outcome === 'lucky' ? 26 : 16, duration: final ? 900 : 500 });
            sfx('explosion', final ? { rate: 0.8 } : undefined);
            const fort = document.querySelector(`#wc-scene .wc-fort--${target}`);
            if (fort) { fort.classList.remove('is-hit'); void fort.offsetWidth; fort.classList.add('is-hit'); }
            setBar(target, shot.hpAfter, { hit: true });
            FX().setFortDamage($('wc-scene'), target, shot.hpAfter);
            damageNumber(target, shot.damage, shot.outcome === 'lucky');
            if (shot.outcome === 'lucky') {
                FX().lightning(H.fx, { x: pos.x, toY: pos.y - 20 });
                sfx('thunder', { volume: 0.8 });
                banner('lucky', 'LUCKY HIT!');
            }
            if (final && shot.hpAfter <= 0) {
                setTimeout(() => downFlag(target), 300);
            }
        } else {
            FX().splash(H.fx, pos, { scale: shot.outcome === 'blown' ? 0.8 : 1 });
            sfx('splash');
            if (shot.outcome === 'blown') banner('blown', 'BLOWN AWAY!');
        }
        if (final) {
            setTimeout(() => {
                $('wc-vignette')?.classList.remove('is-on');
                $('wc-slowmo')?.classList.remove('is-on');
            }, 1100);
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
        raiseFlag(team);
        setBar(team, 100, { hit: true });
        FX().setFortDamage($('wc-scene'), team, 100);
        sfx('chime', { volume: 0.6 });
        caption('Fort rebuilt! Keep scoring until the timer ends');
    }

    function endSequence(v) {
        const winner = v.winner;
        const go = () => {
            if (!winner) {
                banner('win', "IT'S A DRAW!", { cls: 'is-draw' });
                caption("It's a draw on points!");
            } else {
                banner('win', `${winner.toUpperCase()} TEAM WINS!`, { cls: `is-${winner}` });
                const pts = v.points?.[winner];
                caption(pts != null ? `${NAMES[winner]} wins with ${pts} points!` : `${NAMES[winner]} wins the battle!`);
            }
            sfx('fanfare');
            if (H.cancelConfetti) H.cancelConfetti();
            H.cancelConfetti = FX().confetti(H.fx, { duration: 5200, burst: { x: 960, y: 420 } });
        };
        if (v.reason === 'time' && !v.shots.some((s) => s.final)) {
            banner('timeup', "TIME'S UP!");
            sfx('thud');
            schedule(1600, go);
        } else {
            schedule(500, go);
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
            title.innerHTML = `${FX().titleHtml(['WORD CANNON BATTLE'])}<p>Red vs Blue · every correct answer fires a shot · faster = more force · storm in the final minute</p>`;
        }
    };

    /** Red / Blue columns for the host lobby (pick and random modes). */
    WCB.lobbyTeamsHtml = function lobbyTeamsHtml(snapshot, { removable = true } = {}) {
        const teams = snapshot?.teams || [];
        const byId = Object.fromEntries(teams.map((t) => [t.id, t]));
        const col = (id) => {
            const members = teamMembers(byId[id]);
            const rows = members.length
                ? members.map((m) => `<div class="live-team-member-row"><span>${esc(m.nickname)}</span>${removable ? `<button type="button" class="live-remove-player-btn" data-remove-player="${esc(m.id)}" title="Remove player" aria-label="Remove ${esc(m.nickname)}">✕</button>` : ''}</div>`).join('')
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
    const P = { state: null, offset: 0, key: null, result: null, timer: null, volleySeq: null, shotTimers: [], loadedSeen: null, stormOn: false };

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
        P.result = result || null;
        if (result?.eligible) sfx('chime', { volume: 0.7 });
        else if (result && !result.challengeable && result.correct === false) sfx('miss', { volume: 0.6 });
        // Merge the answer into local you.* so renderPhone does not wipe the
        // challenge panel with a stale "no decision yet" state that arrives
        // before the next live:cannon-state push.
        if (P.state && result && result.questionId === P.state.questionId) {
            const decision = result.challengeable ? 'prompt'
                : result.eligible ? 'correct'
                : result.correct ? 'correct' : 'wrong';
            P.state = {
                ...P.state,
                you: {
                    ...(P.state.you || {}),
                    decision,
                    eligible: Boolean(result.eligible),
                    ms: result.ms ?? P.state.you?.ms ?? null,
                    tier: result.tier ?? P.state.you?.tier ?? null,
                    status: result.challengeable ? 'deciding' : (result.eligible ? 'loaded' : 'out'),
                },
            };
        }
        if (P.state) WCB.renderPhone(P.state);
    };
    WCB.phoneChallengeResolved = function phoneChallengeResolved(result) {
        if (P.result) P.result = { ...P.result, correct: Boolean(result?.correct), eligible: Boolean(result?.correct), challengeable: false, challengeAccepted: result?.challengeAccepted, challengeDeclined: result?.challengeDeclined };
        if (result?.correct) sfx('chime', { volume: 0.7 });
        if (P.state) WCB.renderPhone(P.state);
    };

    WCB.resetPhone = function resetPhone() {
        P.state = null;
        P.key = null;
        P.result = null;
        P.volleySeq = null;
        P.shotTimers.forEach(clearTimeout);
        P.shotTimers = [];
        clearInterval(P.timer);
        P.timer = null;
        const root = $('live-play-cannon');
        if (root) { root.hidden = true; root.innerHTML = ''; }
        document.body.classList.remove('live-cannon-player', 'wc-phone-storm');
    };

    WCB.isPhoneActive = () => document.body.classList.contains('live-cannon-player');

    function phoneBodyHtml(state, you, team) {
        const phase = state.phase;
        const r = P.result && P.result.questionId === state.questionId ? P.result : null;
        const ball = `<span class="wcp-ball">${FX().ballSvg()}</span>`;
        if (phase === 'intro') {
            return `<div class="wcp-card is-good">${ball}<b>Battle stations!</b><p>You're on the <strong>${esc(NAMES[team] || 'crew')}</strong>. Answer correctly — faster answers hit harder.</p></div>`;
        }
        if (phase === 'question' || phase === 'review') {
            if (you.decision === 'prompt' || you.decision === 'pending') return '';
            if (you.eligible) {
                const tier = you.tier || r?.tier || 'good';
                const force = you.force ?? r?.force;
                const secs = you.ms != null ? `${(you.ms / 1000).toFixed(1)}s` : '';
                const forcePct = force != null ? `${Math.round(force * 100)}% force` : '';
                return `<div class="wcp-card is-good">${ball}<div class="wcp-plus">SHOT READY!</div>
                    <span class="wcp-tier is-${tier}">${tier.toUpperCase()} ${secs}</span>
                    <p>${forcePct ? `${forcePct}. ` : ''}${tier === 'fast' ? 'Full power!' : tier === 'good' ? 'Solid shot.' : 'Weaker shot — answer faster next time.'}</p></div>`;
            }
            if (you.status === 'out' || (r && !r.eligible && !r.challengeable)) {
                const term = r?.correctTerm ? `<p>The answer was <strong>${esc(r.correctTerm)}</strong>.</p>` : '';
                return `<div class="wcp-card is-bad"><b>No shot this time</b>${term}<p>Get the next one!</p></div>`;
            }
            if (phase === 'review') return '<div class="wcp-card"><b>Hold fire…</b><p>The teacher is checking a challenge.</p></div>';
            return '';
        }
        if (phase === 'volley') {
            const v = state.volley || {};
            const mine = (v.shots || []).filter((s) => String(s.shooterId) === String(you.id || ctx.playerId()));
            const teamShots = (v.shots || []).filter((s) => s.team === team).length;
            const rows = mine.map((s, i) => `<div class="wcp-shot is-wait" data-shot="${i}">🔥 Your shot is flying…</div>`).join('');
            return `<div class="wcp-card ${mine.length ? 'is-good' : ''}"><b>${v.suddenDeath ? 'LAST SHOT!' : 'FIRE!'}</b>
                <p>${teamShots ? `Your team fires ${teamShots} shot${teamShots === 1 ? '' : 's'}.` : 'Your team has no shots this round.'} Watch the big screen!</p>
                ${rows ? `<div class="wcp-shots">${rows}</div>` : ''}</div>`;
        }
        return '';
    }

    function scheduleShotReveals(state) {
        P.shotTimers.forEach(clearTimeout);
        P.shotTimers = [];
        const v = state.volley;
        if (!v) return;
        const youId = String(state.you?.id || ctx.playerId() || '');
        const mine = (v.shots || []).filter((s) => String(s.shooterId) === youId);
        const start = (state.phaseEndsAt || 0) - (v.durationMs || 0);
        mine.forEach((s, i) => {
            const impact = s.at + (s.final ? 3100 : 950);
            const wait = start + impact - (Date.now() + P.offset);
            P.shotTimers.push(setTimeout(() => {
                const el = document.querySelector(`#live-play-cannon [data-shot="${i}"]`);
                if (!el) return;
                const cls = s.outcome === 'hit' || s.outcome === 'lucky' ? 'is-hit' : s.outcome === 'blown' ? 'is-blown' : 'is-miss';
                el.className = `wcp-shot ${cls}`;
                el.textContent = `${s.label}${s.damage > 0 ? `  −${Math.round(s.damage)}%` : ''}`;
                sfx(cls === 'is-hit' ? 'explosion' : 'splash', { volume: 0.5 });
                if (navigator.vibrate && cls === 'is-hit') { try { navigator.vibrate(60); } catch (_) { /* optional */ } }
            }, Math.max(0, wait)));
        });
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
                <div class="wcp-ringrow"><div class="wcp-ring" id="wcp-ring" hidden>${ringSvg()}<b></b></div></div>
                <div class="wcp-body" id="wcp-body"></div>`;
            P.key = null;
        }
        const teamEl = $('wcp-team');
        if (teamEl) {
            teamEl.className = `wcp-team is-${team || 'blue'}`;
            const html = `${esc((NAMES[team] || 'Team').toUpperCase())} <small>${esc(ctx.nickname() || '')}</small>`;
            if (teamEl.dataset.html !== html) { teamEl.dataset.html = html; teamEl.innerHTML = html; }
        }
        const inVolley = state.phase === 'volley' && state.volley;
        TEAMS.forEach((t) => {
            const bar = $(`wcp-bar-${t}`);
            if (!bar) return;
            const hp = inVolley ? (state.volley.hpBefore?.[t] ?? 100) : (state.teams?.[t]?.hp ?? 100);
            bar.querySelector('i').style.width = `${Math.max(0, Math.min(100, hp))}%`;
            bar.querySelector('span').textContent = `${t.toUpperCase()} ${Math.round(hp)}%`;
            bar.classList.toggle('is-mine', t === team);
            const ptsEl = $(`wcp-pts-${t}`);
            if (ptsEl) {
                const pts = state.teams?.[t]?.points ?? 0;
                const kills = state.teams?.[t]?.fortKills || 0;
                ptsEl.innerHTML = `<span class="wcp-wins">${kills}W</span><span>${pts} pts</span>`;
            }
        });
        if (inVolley && P.volleySeq !== state.volley.seq) {
            // Move the bars to the end of the volley once the shots land.
            const v = state.volley;
            const start = (state.phaseEndsAt || 0) - (v.durationMs || 0);
            const last = v.shots[v.shots.length - 1];
            const landAt = last ? last.at + (last.final ? 3100 : 950) : 0;
            const wait = start + landAt - (Date.now() + P.offset);
            P.shotTimers.push(setTimeout(() => {
                TEAMS.forEach((t) => {
                    const bar = $(`wcp-bar-${t}`);
                    if (!bar) return;
                    const hp = v.hpAfter?.[t] ?? 100;
                    bar.querySelector('i').style.width = `${Math.max(0, hp)}%`;
                    bar.querySelector('span').textContent = `${t.toUpperCase()} ${Math.round(hp)}%`;
                });
            }, Math.max(0, wait)));
        }
        const body = $('wcp-body');
        const key = [state.questionId, state.phase, you.status || '', you.decision || '', you.eligible ? 1 : 0, state.volley?.seq ?? '', P.result?.questionId === state.questionId ? (P.result.eligible ? 'y' : 'n') : ''].join('|');
        if (body && P.key !== key) {
            P.key = key;
            body.innerHTML = phoneBodyHtml(state, you, team);
            if (inVolley && P.volleySeq !== state.volley.seq) {
                P.volleySeq = state.volley.seq;
                scheduleShotReveals(state);
            }
        }
        if (inVolley) P.volleySeq = state.volley.seq;
        // Question chrome: hide definition/answers once this phone has answered.
        const asking = state.phase === 'question' && !you.decision && you.status !== 'out';
        const def = $('live-play-definition');
        const typeSection = $('live-play-type-section');
        const choices = $('live-play-choices');
        if (!asking) {
            const keepDef = you.decision === 'prompt' || you.decision === 'pending';
            if (def) def.hidden = !keepDef;
            if (typeSection) typeSection.hidden = true;
            if (choices) choices.hidden = true;
            if (ctx.setAnswerInputsEnabled) ctx.setAnswerInputsEnabled(false);
        } else if (def) def.hidden = false;
        const status = $('live-play-status');
        if (status) {
            let note = '';
            if (state.phase === 'question' && asking) note = state.suddenDeath ? 'Sudden death! Fastest correct answer fires the LAST SHOT.' : 'Answer right — every 0.1s weaker shot force!';
            else if (you.decision === 'prompt') note = 'Marked wrong. Challenge it, or continue.';
            else if (you.decision === 'pending') note = 'Waiting for the teacher…';
            else if (state.phase === 'question') note = 'Waiting for the others…';
            status.textContent = note;
        }
        if (you.decision !== 'prompt' && you.decision !== 'pending' && ctx.hideChallengeActions) ctx.hideChallengeActions();
        if (!P.timer) P.timer = setInterval(tickPhone, 250);
        tickPhone();
    };

    function tickPhone() {
        const state = P.state;
        if (!state || !document.body.classList.contains('live-cannon-player')) return;
        const chip = $('wcp-storm');
        const left = clockLeft(state, P.offset);
        const stormLeft = left - (state.clock?.stormMs || 60000);
        const started = Boolean(state.clock?.gameEndsAt);
        const storm = started && (stormLeft <= 0 || state.storm);
        if (chip) {
            const html = state.suddenDeath ? `${FX().stormIconSvg()}SUDDEN DEATH`
                : storm ? `${FX().stormIconSvg()}STORM! ${fmtClock(left)}` : `${FX().stormIconSvg()}STORM IN ${fmtClock(stormLeft)}`;
            if (chip.dataset.html !== html) { chip.dataset.html = html; chip.innerHTML = html; }
            chip.classList.toggle('is-storm', storm || state.suddenDeath);
        }
        document.body.classList.toggle('wc-phone-storm', storm);
        const ring = $('wcp-ring');
        if (ring) {
            const asking = state.phase === 'question';
            ring.hidden = !asking;
            if (asking) paintRing(ring, Math.max(0, (state.phaseEndsAt || 0) - (Date.now() + P.offset)), state.questionMs || 20000);
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
                <div class="wcpl-rules"><span>💣 Every correct answer fires a shot</span><span>🎯 Every 0.1s weaker force — answer fast</span><span>⛈️ Final minute: storm makes shots wild</span></div>`;
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
        const reason = data?.reason === 'sudden' ? 'Won with the LAST SHOT in sudden death!'
            : data?.reason === 'time' ? "Time's up — most points wins!"
            : data?.reason === 'ended' ? 'Host ended the battle — most points wins!'
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
                <p class="wc-win-team-stats">🏆 ${kills} WIN${kills === 1 ? '' : 'S'} · 💥 ${dmg}% damage</p>
                <ol>${list}</ol></div>`;
        };
        const mvp = data?.mvp;
        const mvpHtml = mvp ? `<div class="wc-mvp"><span class="wc-mvp-badge">MVP</span><span class="wc-mvp-ball">${FX().ballSvg()}</span>
                <span class="wc-mvp-name">${esc(mvp.nickname)}</span><span class="wc-mvp-team is-${esc(mvp.team)}">${esc(NAMES[mvp.team] || '')}</span>
                <div class="wc-mvp-stats"><span>🎯 ${mvp.hits || 0} hits</span><span>💥 ${Math.round(mvp.damage || 0)}% damage</span><span>✔ ${mvp.correct || 0} correct</span></div></div>`
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
