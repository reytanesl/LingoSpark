/**
 * The Bridge (Tide Bridge, internal id `tide-bridge`) — host board, phone chrome and end screen for Live Spark ("Storybook Dusk" art).
 *
 * PRESENTATION ONLY. All mechanics (rounds, scoring, tide timing, tiers, sockets) live in
 * tide-bridge.js / live-game.js; this file just draws the public state those emit (6 rounds, 6 bridges,
 * a global match clock + a per-round tide gauge). The server only emits `live:tide-state` when something
 * changes, so the clock and the round tide are advanced locally between emits from `remainingMs` /
 * `tideElapsedMs` (+ `tideRunning`) and the time the state arrived.
 */
(function (global) {
    'use strict';

    const STAGE_W = 1366;
    const STAGE_H = 768;
    const ROUNDS_TOTAL = 6;
    const ROUND_NAMES = ['Gentle Start', 'Warming Up', 'Speed Test', 'Pressure On', 'Storm Surge', 'Final Escape'];
    const ROUND_THEMES = ['footbridge', 'arch', 'viaduct', 'rapids', 'storm', 'citadel'];
    const ROUND_BRIDGES = ['Wooden Footbridge', 'Cobblestone Arch', 'High Stone Viaduct', 'Raging Rapids Crossing', 'Iron Cliff Span', 'The Grand Citadel Bridge'];
    const ROUND_WAVE = [9, 7.5, 6, 4, 3, 2.4];   // fallback seconds per wave cycle (the server sends waveSeconds)
    const AV_COLORS = ['#7c4dff', '#ff7043', '#26a69a', '#ec407a', '#42a5f5', '#9ccc65', '#ffa726'];
    const ctx = { hostEnd: null, fullscreen: null, roomCode: null };
    // soundtrack: HOST BOARD only (projector); players get no music. Mute persists in localStorage.
    const MUSIC_SRC = '/audio/the-bridge-theme.mp3';
    const MUSIC_VOLUME = 0.35;
    const MUTE_KEY = 'ls_the_bridge_muted';
    let musicWanted = false;
    let gestureArmed = false;

    const last = { state: null, recvAt: 0, gameMinutes: 5 };
    const seen = { host: null, phone: null, moment: null };
    let hostBurstTimer = null;
    let ticker = null;

    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function formatClock(ms) {
        const sec = Math.max(0, Math.ceil(Number(ms) / 1000));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }
    const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
    const SCENE = () => global.TideBridgeScene;

    const ICON_STONE = '<svg viewBox="0 0 32 24" width="1.4em" height="1em"><path d="M3 8 Q3 3 8 3 H24 Q29 3 29 8 V21 H22 A6 6 0 0 0 10 21 H3Z" fill="currentColor"/></svg>';
    const ICON_SHELL = '<svg viewBox="0 0 32 28" width="1.4em" height="1.2em"><path d="M16 3 C6 3 2 12 3 19 Q4 25 16 25 Q28 25 29 19 C30 12 26 3 16 3Z" fill="currentColor"/><path d="M16 6 V24 M10 8 L12 24 M22 8 L20 24" stroke="rgba(0,0,0,.25)" stroke-width="1.6" fill="none"/></svg>';
    const ICON_BRIDGE = '<svg viewBox="0 0 36 24" width="1.5em" height="1em"><path d="M2 7 H34 V11 H31 Q27 22 23 11 H13 Q9 22 5 11 H2Z" fill="currentColor"/></svg>';
    const ICON_WAVE = '<svg viewBox="0 0 32 24" width="1.4em" height="1em"><path d="M1 10 Q6 3 11 10 T21 10 T31 10 V13 Q26 20 21 13 T11 13 T1 13Z" fill="currentColor"/></svg>';
    const ICON_STAR = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 1l3 7 7 1-5.3 4.8L18 21l-6-3.7L6 21l1.3-7.2L2 9l7-1z" fill="#ffd23f"/></svg>';
    const LOGO = '<div class="logo">Lingo<span>Spark</span><svg viewBox="0 0 24 24"><path d="M12 1l3 7 7 1-5.3 4.8L18 21l-6-3.7L6 21l1.3-7.2L2 9l7-1z" fill="#ffd23f"/></svg></div>';
    const ICON_SOUND_ON = '<svg class="ico-on" viewBox="0 0 24 24" width="20" height="20"><path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    const ICON_SOUND_OFF = '<svg class="ico-off" viewBox="0 0 24 24" width="20" height="20"><path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
    const ICON_FULL = '<svg viewBox="0 0 20 20" width="18" height="18"><path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

    /* ---------------------------------------------------------------- state helpers */

    function remember(state) {
        if (!state) return;
        if (state.gameMinutes) last.gameMinutes = Number(state.gameMinutes) || last.gameMinutes;
        // merge: the final game-finished payload does not repeat every field the live state carried
        last.state = { ...(last.state || {}), ...state, gameMinutes: last.gameMinutes };
        last.recvAt = Date.now();
    }

    /** Derived values for the current moment (match clock and round tide advance between emits). */
    function liveView() {
        const st = last.state;
        if (!st) return null;
        const total = Math.max(1, last.gameMinutes * 60000);
        const finished = Boolean(st.finished) || st.phase === 'finished';
        const elapsed = finished ? 0 : Date.now() - last.recvAt;
        const remaining = finished ? Math.max(0, Number(st.remainingMs) || 0) : Math.max(0, (Number(st.remainingMs) || 0) - elapsed);
        const round = Math.max(1, Math.min(ROUNDS_TOTAL, Number(st.round) || 1));
        const limit = Math.max(1, Number(st.tideLimitMs) || 60000);
        const running = Boolean(st.tideRunning) && !finished;
        const tideElapsed = Math.min(limit, Math.max(0, (Number(st.tideElapsedMs) || 0) + (running ? elapsed : 0)));
        let ratio = clamp01(tideElapsed / limit);
        if (finished && st.endReason === 'tide') ratio = 1;
        else if (finished && !st.tideElapsedMs && st.tideRatio != null) ratio = clamp01(st.tideRatio);
        const n = Math.max(1, Number(st.spansInRound) || 3);
        const need = Math.max(1, Number(st.neededCorrect) || 3);
        const got = Math.max(0, Math.min(need, Number(st.gotCorrect) || 0));
        const phase = st.phase || 'vocab';
        const transition = st.transition || null;
        const spansDone = Math.max(0, Math.min(n, Number(st.spanIndex) || 0));
        const built = phase === 'roundTransition' && transition && transition.kind !== 'failed' ? n : spansDone;
        return {
            st, total, finished, remaining, ratio, n, need, got, phase, round, transition, built,
            tideLeft: Math.max(0, limit - tideElapsed),
            theme: st.roundTheme || ROUND_THEMES[round - 1],
            roundName: st.roundName || ROUND_NAMES[round - 1],
            bridgeName: st.roundBridge || ROUND_BRIDGES[round - 1],
            wave: Number(st.waveSeconds) || ROUND_WAVE[round - 1],
            spansDone,
            spanNo: Math.min(n, spansDone + 1),
            spans: Math.max(0, Number(st.cleared) || 0),
            done: Math.max(0, Number(st.roundsCompleted) || 0),
            breaker: phase === 'breaker',
            between: phase === 'between',
            moment: phase === 'roundTransition',
            failedMoment: phase === 'roundTransition' && transition?.kind === 'failed',
        };
    }

    function phaseTexts(v) {
        if (v.failedMoment) return { title: 'Round failed!', sub: 'The tide took the bridge', icon: ICON_WAVE };
        if (v.moment) return { title: 'Bridge cleared!', sub: v.transition?.kind === 'victory' ? 'The far cliff!' : `Crossing to chasm ${Math.min(ROUNDS_TOTAL, v.round + 1)}`, icon: ICON_BRIDGE };
        if (v.finished) return { title: v.st.endReason === 'tide' ? 'Tide took the bridge' : 'Match over', sub: 'Final scoring', icon: ICON_WAVE };
        if (v.breaker) return { title: 'Mid-Bridge Obstacle!', sub: 'Shore challenge · bonus', icon: ICON_SHELL };
        if (v.between) return { title: 'Stone laid!', sub: 'Get ready', icon: ICON_STONE };
        return { title: 'Lay the next stone!', sub: `${v.roundName} · span ${v.spanNo} of ${v.n}`, icon: ICON_STONE };
    }

    function pipsHtml(got, need) {
        return Array.from({ length: need }, (_, i) => `<i class="${i < got ? 'on' : ''}"></i>`).join('');
    }

    function countHtml(got, need) {
        return `${got}<em>/${need}</em>`;
    }

    function stripHtml(results, round) {
        const names = ROUND_NAMES;
        return Array.from({ length: ROUNDS_TOTAL }, (_, i) => {
            const r = (results && results[i]) || (i + 1 === round ? 'current' : 'pending');
            return `<i class="${r}" title="Round ${i + 1}: ${esc(names[i])}${r === 'done' ? ' — bridge built' : r === 'failed' ? ' — tide took it' : ''}"><u>${i + 1}</u></i>`;
        }).join('');
    }

    function segHtml(n, built, current) {
        return Array.from({ length: n }, (_, i) => `<i class="${i < built ? 'on' : i === current ? 'cur' : ''}"></i>`).join('');
    }

    function initial(name) {
        const t = String(name || '?').trim();
        return (t[0] || '?').toUpperCase();
    }

    function avatarsHtml(players) {
        const helped = (players || []).filter((p) => p.contributed).slice(0, 5);
        return helped.map((p, i) => `<span style="background:${AV_COLORS[i % AV_COLORS.length]}" title="${esc(p.nickname)}">${esc(initial(p.nickname))}</span>`).join('');
    }

    /** (Re)build a bridge scene SVG when the round's theme / span count changes; returns the svg. */
    function ensureScene(box, uid, v, vb) {
        const S = SCENE();
        if (!box || !S) return null;
        let svg = box.querySelector('svg');
        if (!svg || svg.getAttribute('data-theme') !== v.theme || box.__tbN !== v.n) {
            const box2 = typeof vb === 'function' ? vb(v) : vb;
            box.innerHTML = S.bridgeSvg(uid, { n: v.n, theme: v.theme, wave: v.wave, ...(box2 ? { vb: box2 } : {}) });
            box.__tbN = v.n;
            svg = box.querySelector('svg');
            box.classList.remove('tb-fadein'); void box.offsetWidth; box.classList.add('tb-fadein');
            return svg;
        }
        return svg;
    }

    /* ---------------------------------------------------------------- host board */

    function hostCode() {
        return String((ctx.roomCode && ctx.roomCode()) || $('live-host-code')?.textContent || '').trim() || '----';
    }

    function ensureHostDom() {
        let root = $('live-host-tide');
        if (root) return root;
        const panel = $('live-host-room-panel');
        const S = SCENE();
        if (!panel || !S) return null;
        root = document.createElement('div');
        root.id = 'live-host-tide';
        root.className = 'tb-host';
        root.hidden = true;
        root.innerHTML = `
            <div class="tb-stage tb-hud" id="tb-stage">
                <div class="tb-scenes" aria-hidden="true">
                    <div class="tb-scene tb-scene--bridge" id="tb-scene-bridge">${S.bridgeSvg('tbh', { n: 2, theme: 'footbridge' })}</div>
                    <div class="tb-scene tb-scene--beach" id="tb-scene-beach">${S.beachSvg('tbhb')}</div>
                </div>
                ${LOGO}
                <div class="rounds"><i>${ICON_BRIDGE}</i><div><small id="tb-round-kick">ROUND 1 · GENTLE START</small><b id="tb-round-name">Wooden Footbridge</b></div></div>
                <div class="phase" id="tb-phase"><i id="tb-phase-ico">${ICON_STONE}</i><div><b id="tb-host-phase">Lay the next stone!</b><small id="tb-phase-sub"></small></div></div>
                <div class="clock"><small id="tb-clock-label">MATCH CLOCK</small><b id="tb-host-clock">5:00</b><div class="clockbar"><i id="tb-clockbar" style="width:100%"></i></div></div>
                <div class="center">
                    <div class="prompt" id="tb-prompt"><span class="tag" id="tb-tag">EVERYONE'S OWN WORD</span><p id="tb-host-msg"></p></div>
                    <div class="progress" id="tb-progress"><div class="pips" id="tb-pips"></div><b id="tb-host-clear">0<em>/3</em></b><small id="tb-prog-sub">correct for this stone</small></div>
                </div>
                <div class="gauge" id="tb-gauge"><span>ROUND TIDE</span><div class="track"><i id="tb-gfill"></i><u id="tb-gmark"></u><em id="tb-tide-left">0:00</em></div></div>
                <div class="answers" id="tb-answers"><b id="tb-ans-text">Helped 0/0</b><div class="av" id="tb-av"></div></div>
                <div class="burst" id="tb-burst" hidden><b id="tb-burst-title">SPAN CLEARED!</b><small id="tb-burst-sub">+1 stone — the bridge grows</small></div>
                <div class="bar">
                    <div class="room"><small>Room</small><b id="tb-room">----</b></div>
                    <div class="tally"><small>Round</small><b id="tb-bar-round">1 / 6</b></div>
                    <div class="tally"><small>Span</small><b id="tb-bar-span">1/2</b></div>
                    <div class="strip" id="tb-strip" title="Round progress"></div>
                    <div class="cap">${ICON_STAR}<span id="tb-caption"></span></div>
                    <div class="btns">
                        <button type="button" id="tb-lobby" hidden>Back to lobby</button>
                        <button type="button" id="tb-mute" class="sq" title="Mute music" aria-label="Mute music" aria-pressed="false">${ICON_SOUND_ON}${ICON_SOUND_OFF}</button>
                        <button type="button" id="tb-end">End</button>
                        <button type="button" id="tb-full" class="sq" title="Fullscreen" aria-label="Fullscreen">${ICON_FULL}</button>
                    </div>
                </div>
                <audio id="tb-music" loop preload="none" src="${MUSIC_SRC}" hidden></audio>
            </div>`;
        panel.appendChild(root);
        root.querySelector('#tb-end').addEventListener('click', () => { if (ctx.hostEnd) ctx.hostEnd(); else $('live-host-end')?.click(); });
        root.querySelector('#tb-mute').addEventListener('click', toggleMute);
        syncMuteButton();
        root.querySelector('#tb-lobby').addEventListener('click', () => setHostMode(false));
        root.querySelector('#tb-full').addEventListener('click', () => {
            if (ctx.fullscreen) ctx.fullscreen(root);
            else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
        });
        window.addEventListener('resize', fitStage);
        document.addEventListener('fullscreenchange', fitStage);
        return root;
    }

    function fitStage() {
        const root = $('live-host-tide');
        const stage = $('tb-stage');
        if (!root || !stage || root.hidden) return;
        const w = root.clientWidth || window.innerWidth;
        const h = root.clientHeight || window.innerHeight;
        const s = Math.min(w / STAGE_W, h / STAGE_H);
        stage.style.transform = `translate(${((w - STAGE_W * s) / 2).toFixed(1)}px, ${((h - STAGE_H * s) / 2).toFixed(1)}px) scale(${s.toFixed(4)})`;
    }

    /* ---------------------------------------------------------------- soundtrack (host only) */

    function isMuted() {
        try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
    }

    function musicEl() {
        return $('tb-music');
    }

    function syncMuteButton() {
        const btn = $('tb-mute');
        if (!btn) return;
        const muted = isMuted();
        btn.classList.toggle('is-muted', muted);
        btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        const label = muted ? 'Unmute music' : 'Mute music';
        btn.title = label;
        btn.setAttribute('aria-label', label);
    }

    function armGesture() {
        if (gestureArmed) return;
        gestureArmed = true;
        const retry = () => {
            document.removeEventListener('pointerdown', retry, true);
            document.removeEventListener('keydown', retry, true);
            gestureArmed = false;
            if (musicWanted) startMusic();
        };
        document.addEventListener('pointerdown', retry, true);
        document.addEventListener('keydown', retry, true);
    }

    // ---- Web Audio engine (sample-accurate loop, no MP3 padding gap) ----------------------
    // The theme is a pre-crossfaded seamless loop. <audio loop> can leave a ~25 ms gap from MP3
    // encoder padding, so we decode the file once and loop an AudioBufferSourceNode between the
    // first and last non-silent samples (this also strips any decoder padding). If Web Audio or
    // the fetch/decode fails, the hidden <audio loop> element is used instead.
    const web = { ctx: null, gain: null, buffer: null, source: null, loading: null, failed: false, loopStart: 0, loopEnd: 0 };

    function webSupported() {
        return !web.failed && !!(window.AudioContext || window.webkitAudioContext);
    }

    function trimEdges(buf) {
        const eps = 1e-3;
        let first = buf.length;
        let last = 0;
        for (let c = 0; c < buf.numberOfChannels; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < d.length; i++) { if (Math.abs(d[i]) > eps) { if (i < first) first = i; break; } }
            for (let i = d.length - 1; i >= 0; i--) { if (Math.abs(d[i]) > eps) { if (i > last) last = i; break; } }
        }
        if (last <= first) { first = 0; last = buf.length - 1; }
        return { start: first / buf.sampleRate, end: (last + 1) / buf.sampleRate };
    }

    function webLoad() {
        if (web.buffer) return Promise.resolve(web.buffer);
        if (web.loading) return web.loading;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        web.loading = (async () => {
            web.ctx = web.ctx || new Ctx();
            web.gain = web.ctx.createGain();
            web.gain.gain.value = MUSIC_VOLUME;
            web.gain.connect(web.ctx.destination);
            const res = await fetch(MUSIC_SRC);
            if (!res.ok) throw new Error('theme ' + res.status);
            const data = await res.arrayBuffer();
            const buf = await new Promise((resolve, reject) => {
                const p = web.ctx.decodeAudioData(data, resolve, reject);   // callback form for old Safari
                if (p && p.catch) p.catch(reject);
            });
            const edges = trimEdges(buf);
            web.loopStart = edges.start;
            web.loopEnd = edges.end;
            web.buffer = buf;
            return buf;
        })().catch((err) => { web.failed = true; web.loading = null; throw err; });
        return web.loading;
    }

    function webSource() {
        if (web.source) return web.source;
        const src = web.ctx.createBufferSource();
        src.buffer = web.buffer;
        src.loop = true;
        src.loopStart = web.loopStart;
        src.loopEnd = web.loopEnd;
        src.connect(web.gain);
        src.start(0, web.loopStart);
        web.source = src;
        return src;
    }

    function webPlay() {
        if (!web.buffer || !musicWanted || isMuted()) return;
        webSource();
        if (web.ctx.state !== 'running') {
            const p = web.ctx.resume();
            if (p && p.catch) p.catch(() => armGesture());
            armGesture();   // resume() stays pending until a user gesture; the next click retries
        }
    }

    function webStop() {
        if (web.source) {
            try { web.source.stop(); } catch { /* already stopped */ }
            try { web.source.disconnect(); } catch { /* ignore */ }
            web.source = null;
        }
        if (web.ctx && web.ctx.state === 'running') web.ctx.suspend().catch(() => {});
    }

    function webPause() {
        if (web.ctx && web.source && web.ctx.state === 'running') web.ctx.suspend().catch(() => {});
    }

    function elementPlay() {
        const a = musicEl();
        if (!a) return;
        a.preload = 'auto';
        a.loop = true;
        a.volume = MUSIC_VOLUME;
        if (!a.paused) return;
        const p = a.play();
        if (p && p.catch) p.catch(() => armGesture());   // autoplay blocked until the first click/key
    }

    function elementStop() {
        const a = musicEl();
        if (!a) return;
        a.pause();
        try { a.currentTime = 0; } catch { /* ignore */ }
    }

    function startMusic() {
        ensureHostDom();
        musicWanted = true;
        if (isMuted()) return;
        if (!webSupported()) { elementPlay(); return; }
        if (web.buffer) { webPlay(); return; }
        webLoad().then(() => { if (musicWanted && !isMuted()) webPlay(); })
            .catch(() => { if (musicWanted && !isMuted()) elementPlay(); });
    }

    function stopMusic() {
        musicWanted = false;
        webStop();
        elementStop();
    }

    function musicState() {
        const a = musicEl();
        return {
            engine: web.source ? 'webaudio' : (a && !a.paused ? 'element' : 'none'),
            webAudioSupported: webSupported(),
            ctxState: web.ctx ? web.ctx.state : null,
            sourceLoop: web.source ? web.source.loop : null,
            loopStart: web.loopStart,
            loopEnd: web.loopEnd,
            bufferDuration: web.buffer ? web.buffer.duration : null,
            volume: web.gain ? web.gain.gain.value : null,
            elementLoop: a ? a.loop : null,
            elementPaused: a ? a.paused : null,
            wanted: musicWanted,
            muted: isMuted(),
        };
    }

    function toggleMute() {
        const muted = !isMuted();
        try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
        syncMuteButton();
        if (muted) {
            webPause();
            const a = musicEl();
            if (a) a.pause();
        } else if (musicWanted) {
            startMusic();
        }
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
            // keep the challenge Accept/Reject card inside the board so fullscreen still shows it
            const panel = $('live-host-challenge-panel');
            if (panel && root && panel.parentElement !== root) {
                if (!panel.dataset.tbHome && panel.parentElement) panel.dataset.tbHome = panel.parentElement.id || '';
                root.appendChild(panel);
            }
            fitStage();
            startTicker();
        } else {
            const panel = $('live-host-challenge-panel');
            const home = panel && panel.dataset.tbHome ? $(panel.dataset.tbHome) : $('live-host-room-panel');
            if (panel && home && panel.parentElement !== home) home.appendChild(panel);
            seen.host = null;
            clearTimeout(hostBurstTimer);
            stopMusic();
        }
    }

    function renderHost(state) {
        const root = ensureHostDom();
        if (!root || !state) return;
        remember(state);
        root.hidden = false;
        setHostMode(true);
        applyHost(true);
        if (state.finished || state.phase === 'finished') stopMusic();
        else if (!musicWanted) startMusic();
    }

    function hostCaption(v) {
        if (v.finished) return v.st.endReason === 'tide' ? 'The tide won this round — great effort, class!' : 'Great teamwork, class!';
        if (v.failedMoment) return `Round ${v.round} is lost to the tide…`;
        if (v.moment) return v.transition?.kind === 'victory' ? 'The far cliff — every bridge built!' : `Bridge ${v.round} built — crossing to chasm ${Math.min(ROUNDS_TOTAL, v.round + 1)}`;
        if (v.breaker) return 'Mid-bridge obstacle! Type fast — every correct answer counts.';
        if (v.between) return 'Nice work — get ready…';
        return `Everyone answers their own word — ${v.need} correct lay the next stone!`;
    }

    function applyHost(stateChanged) {
        const root = $('live-host-tide');
        const v = liveView();
        if (!root || !v) return;
        const S = SCENE();
        const stage = $('tb-stage');
        stage.classList.toggle('is-breaker', v.breaker);
        stage.classList.toggle('is-finished', v.finished);
        stage.classList.toggle('is-between', v.between);
        stage.classList.toggle('is-moment', v.moment);
        stage.classList.toggle('is-failed', v.failedMoment || (v.finished && v.st.endReason === 'tide'));
        stage.dataset.round = String(v.round);
        stage.dataset.theme = v.theme;

        // scene: one themed bridge per round (rebuilt when the round changes)
        const sceneBox = $('tb-scene-bridge');
        const sceneKey = `${v.theme}|${v.n}`;
        const roundChanged = sceneBox && sceneBox.__tbKey !== sceneKey;
        const svg = ensureScene(sceneBox, 'tbh', v);
        if (sceneBox) sceneBox.__tbKey = sceneKey;
        if (roundChanged && stateChanged) seen.host = v.spans;
        const inc = !roundChanged && seen.host != null && v.spans > seen.host;
        if (stateChanged) seen.host = v.spans;

        // live parts (every tick)
        $('tb-host-clock').textContent = formatClock(v.remaining);
        $('tb-clockbar').style.width = `${(clamp01(v.remaining / v.total) * 100).toFixed(1)}%`;
        const gp = Math.round(v.ratio * 1000) / 10;
        $('tb-gfill').style.height = `${gp}%`;
        $('tb-gmark').style.bottom = `${gp}%`;
        $('tb-tide-left').textContent = v.finished && !v.st.tideLimitMs ? '' : formatClock(v.tideLeft);
        $('tb-gauge').classList.toggle('is-high', v.ratio >= 0.75);
        $('tb-gauge').classList.toggle('is-paused', !v.st.tideRunning);
        const nextFill = v.breaker || v.finished || v.moment || v.between ? null : v.got / v.need;
        S.updateBridge(svg, { n: v.n, built: v.built, nextFill, ratio: v.ratio, wave: v.wave, justLaid: inc && v.built > 0, sparkle: inc });

        if (!stateChanged) return;
        const ph = phaseTexts(v);
        $('tb-host-phase').textContent = ph.title;
        $('tb-phase-sub').textContent = ph.sub;
        $('tb-phase-ico').innerHTML = ph.icon;
        $('tb-round-kick').textContent = `ROUND ${v.round} · ${String(v.roundName).toUpperCase()}`;
        $('tb-round-name').textContent = v.bridgeName;
        $('tb-clock-label').textContent = v.finished ? 'MATCH TIME' : 'MATCH CLOCK';

        const st = v.st;
        const prompt = $('tb-prompt');
        const msg = $('tb-host-msg');
        let tag = "EVERYONE'S OWN WORD";
        let text = 'Answer your own word — help the class clear the span!';
        if (v.breaker) {
            tag = 'MID-BRIDGE OBSTACLE · TYPE IT!';
            text = st.breakerPrompt || 'Everyone — mid-bridge obstacle!';
        } else if (v.failedMoment) {
            tag = 'ROUND FAILED';
            text = 'The tide rose over the bridge before it was finished.';
        } else if (v.moment) {
            tag = 'BRIDGE CLEARED';
            text = v.transition?.kind === 'victory' ? 'Every chasm crossed — you reached the far cliff!' : `Nice work — crossing to chasm ${Math.min(ROUNDS_TOTAL, v.round + 1)}…`;
        } else if (v.between) {
            tag = 'WELL DONE';
            text = 'Nice work — get ready…';
        } else if (v.finished) {
            tag = 'THE BRIDGE';
            text = st.endReason === 'tide' ? 'The tide took the bridge!' : 'Time! How far did you get?';
        }
        prompt.classList.toggle('breaker', v.breaker);
        prompt.classList.toggle('failed', v.failedMoment);
        prompt.classList.toggle('long', text.length > 70);
        $('tb-tag').textContent = tag;
        msg.textContent = text;

        const got = v.between || (v.moment && !v.failedMoment) ? v.need : v.got;
        $('tb-pips').innerHTML = pipsHtml(got, v.need);
        $('tb-host-clear').innerHTML = countHtml(got, v.need);
        $('tb-progress').classList.toggle('done', got >= v.need);
        $('tb-progress').hidden = v.failedMoment;
        $('tb-prog-sub').textContent = v.breaker ? 'beach treasures found' : 'correct for this stone';

        const players = st.players || [];
        const helped = players.filter((p) => p.contributed).length;
        $('tb-answers').hidden = !players.length || v.finished || v.moment;
        $('tb-ans-text').textContent = `Helped ${helped}/${players.length}`;
        $('tb-av').innerHTML = avatarsHtml(players);

        $('tb-room').textContent = hostCode();
        $('tb-bar-round').textContent = `${v.round} / ${ROUNDS_TOTAL}`;
        $('tb-bar-span').textContent = `${v.moment && !v.failedMoment ? v.n : v.spanNo}/${v.n}`;
        $('tb-strip').innerHTML = stripHtml(st.roundResults, v.round);
        $('tb-caption').textContent = hostCaption(v);
        $('tb-lobby').hidden = !v.finished;
        $('tb-end').textContent = v.finished ? 'Close' : 'End';
        $('tb-end').hidden = v.finished;

        if (v.failedMoment && seen.moment !== 'failed') celebrate(v, 'failed');
        else if (inc && v.moment) celebrate(v, 'bridge');
        else if (inc) celebrate(v, 'span');
        seen.moment = v.failedMoment ? 'failed' : null;
    }

    function celebrate(v, kind) {
        const burst = $('tb-burst');
        if (!burst) return;
        const failed = kind === 'failed';
        const bridge = kind === 'bridge';
        $('tb-burst-title').textContent = failed ? 'THE TIDE TOOK THE BRIDGE!' : bridge ? (v.transition?.kind === 'victory' ? 'THE FAR CLIFF!' : 'BRIDGE CLEARED!') : 'SPAN CLEARED!';
        $('tb-burst-sub').textContent = failed ? `Round ${v.round} failed — final scoring…`
            : bridge ? (v.transition?.kind === 'victory' ? 'All six bridges built!' : `Crossing to chasm ${Math.min(ROUNDS_TOTAL, v.round + 1)}`)
                : '+1 stone — the bridge grows';
        const ms = failed ? 2900 : bridge ? 3400 : 2800;
        burst.classList.toggle('is-failed', failed);
        burst.classList.toggle('is-bridge', bridge);
        burst.hidden = false;
        burst.classList.remove('is-on');
        burst.style.animationDuration = `${ms}ms`;
        void burst.offsetWidth;
        burst.classList.add('is-on');
        clearTimeout(hostBurstTimer);
        hostBurstTimer = setTimeout(() => { burst.hidden = true; burst.classList.remove('is-on'); }, ms);
    }

    /* ---------------------------------------------------------------- player phone */

    function surface() {
        return document.querySelector('#screen-live-play .live-play-surface') || $('screen-live-play');
    }

    function ensurePhoneDom() {
        let el = $('tb-phone');
        if (el) return el;
        const host = surface();
        const S = SCENE();
        if (!host || !S) return null;
        el = document.createElement('div');
        el.id = 'tb-phone';
        el.className = 'tb-phone tb-hud';
        el.innerHTML = `
            <div class="ptop">${LOGO}<div class="proom"><small>Room</small><b id="tb-p-room">----</b></div><div class="prounds"><i>${ICON_BRIDGE}</i><div><small>ROUND</small><b id="tb-p-rounds">1/6</b></div></div></div>
            <div class="phase" id="tb-p-phase"><i id="tb-p-ico">${ICON_STONE}</i><div><b id="tb-p-title">Lay the next stone!</b><small id="tb-p-sub"></small></div></div>
            <div class="pscene" aria-hidden="true">
                <div class="tb-scene tb-scene--bridge" id="tb-p-scene">${S.bridgeSvg('tbp', { n: 2, theme: 'footbridge', vb: '292 268 780 440' })}</div>
                <div class="tb-scene tb-scene--beach">${S.beachSvg('tbpb', { vb: '250 290 880 478' })}</div>
                <div class="pstrip">
                    <div class="pspan"><small id="tb-p-spanl">SPAN 1/2</small><div class="seg" id="tb-p-seg"></div></div>
                    <div class="ptide"><small>TIDE</small><div class="tbar"><i id="tb-p-tide"></i></div><b id="tb-p-tidep">0%</b></div>
                </div>
                <div class="mini">
                    <div class="clock"><small id="tb-p-clock-l">MATCH</small><b id="tb-p-clock">5:00</b></div>
                    <div class="progress"><div class="pips" id="tb-p-pips"></div><b id="tb-p-count">0<em>/3</em></b></div>
                </div>
            </div>`;
        const body = host.querySelector('.live-play-body');
        if (body) host.insertBefore(el, body);
        else host.prepend(el);
        const foot = document.createElement('div');
        foot.id = 'tb-phone-foot';
        foot.className = 'tb-pfoot';
        foot.textContent = 'Your answer helps the whole class — no teams!';
        host.appendChild(foot);
        return el;
    }

    function syncPlayerBanner(state) {
        const el = ensurePhoneDom();
        if (!el) return;
        if (!state) {
            el.hidden = true;
            $('tb-phone-foot')?.setAttribute('hidden', '');
            document.body.classList.remove('tb-phone-breaker', 'tb-phone-between', 'tb-phone-failed');
            return;
        }
        remember(state);
        el.hidden = false;
        $('tb-phone-foot')?.removeAttribute('hidden');
        startTicker();
        applyPhone(true);
    }

    function applyPhone(stateChanged) {
        const el = $('tb-phone');
        const v = liveView();
        if (!el || !v || el.hidden) return;
        const S = SCENE();
        el.classList.toggle('is-breaker', v.breaker);
        el.classList.toggle('is-between', v.between || v.moment);
        el.classList.toggle('is-failed', v.failedMoment);
        el.dataset.theme = v.theme;
        document.body.classList.toggle('tb-phone-breaker', v.breaker);
        document.body.classList.toggle('tb-phone-between', v.between || v.moment);
        document.body.classList.toggle('tb-phone-failed', v.failedMoment);
        const box = $('tb-p-scene');
        const key = `${v.theme}|${v.n}`;
        const changed = box && box.__tbKey !== key;
        const svg = ensureScene(box, 'tbp', v, (view) => `292 ${Math.round(SCENE().geom(view.n, view.theme).deckY - 160)} 780 440`);
        if (box) box.__tbKey = key;
        if (changed && stateChanged) seen.phone = v.spans;
        const inc = !changed && seen.phone != null && v.spans > seen.phone;
        if (stateChanged) seen.phone = v.spans;
        $('tb-p-clock').textContent = formatClock(v.remaining);
        const pct = Math.round(v.ratio * 100);
        $('tb-p-tide').style.width = `${pct}%`;
        $('tb-p-tidep').textContent = `${pct}%`;
        el.classList.toggle('tide-high', v.ratio >= 0.75);
        const nextFill = v.breaker || v.finished || v.between || v.moment ? null : v.got / v.need;
        S.updateBridge(svg, { n: v.n, built: v.built, nextFill, ratio: v.ratio, wave: v.wave, justLaid: inc && v.built > 0, sparkle: inc });
        if (!stateChanged) return;
        const ph = phaseTexts(v);
        $('tb-p-title').textContent = ph.title;
        $('tb-p-sub').textContent = ph.sub;
        $('tb-p-ico').innerHTML = ph.icon;
        $('tb-p-rounds').textContent = `${v.round}/${ROUNDS_TOTAL}`;
        $('tb-p-spanl').textContent = `SPAN ${v.moment && !v.failedMoment ? v.n : v.spanNo}/${v.n}`;
        $('tb-p-seg').innerHTML = segHtml(v.n, v.built, v.breaker || v.moment || v.finished ? -1 : v.spansDone ?? v.built);
        $('tb-p-room').textContent = String($('lsp-room-code')?.textContent || hostCode()).trim() || '----';
        const got = v.between || (v.moment && !v.failedMoment) ? v.need : v.got;
        $('tb-p-pips').innerHTML = pipsHtml(got, v.need);
        $('tb-p-count').innerHTML = countHtml(got, v.need);
        $('tb-p-clock-l').textContent = 'MATCH';
        const foot = $('tb-phone-foot');
        if (foot) foot.textContent = v.breaker ? 'Your answer counts for the whole class' : v.failedMoment ? 'The tide took the bridge…' : 'Your answer helps the whole class — no teams!';
    }

    /* ---------------------------------------------------------------- shared ticker */

    function tick() {
        const v = liveView();
        if (!v) return;
        const hostRoot = $('live-host-tide');
        if (hostRoot && !hostRoot.hidden) applyHost(false);
        const phone = $('tb-phone');
        if (phone && !phone.hidden && document.body.classList.contains('live-tide-player')) applyPhone(false);
        if (v.finished && ticker) { clearInterval(ticker); ticker = null; }
    }

    function startTicker() {
        if (ticker) return;
        ticker = setInterval(tick, 250);
    }

    /* ---------------------------------------------------------------- end screen */

    function tierInfo(data) {
        const id = (data?.tier?.id || 'bronze');
        const done = Math.max(0, Number(data?.roundsCompleted ?? last.state?.roundsCompleted) || 0);
        const failed = Number(data?.failedRound ?? last.state?.failedRound) || 0;
        const T = {
            gold: { name: 'GOLD', line: 'Reached the Far Cliff', sub: `Full mastery — the class built ${done} of 6 bridges!` },
            silver: { name: 'SILVER', line: 'Mid-Channel Explorers', sub: failed ? `The tide took the bridge in round ${failed}. So close — try again!` : 'Time ran out mid-channel. So close — try again!' },
            bronze: { name: 'BRONZE', line: 'Swept Back to Shore', sub: failed ? `The tide took the bridge in round ${failed} — build faster next time!` : 'The clock won this time — build faster next round!' },
        };
        return { id: T[id] ? id : 'bronze', ...(T[id] || T.bronze) };
    }

    function winnerHtml(data) {
        const t = tierInfo(data);
        const st = last.state || {};
        const done = Math.max(0, Number(data?.roundsCompleted ?? st.roundsCompleted) || 0);
        const spans = Math.max(0, Number(data?.cleared ?? st.cleared) || 0);
        const failed = Number(data?.failedRound ?? st.failedRound) || 0;
        const players = Array.isArray(data?.players) ? data.players : [];
        const correct = players.reduce((a, p) => a + (Number(p.correct ?? p.progress) || 0), 0);
        const chips = [['gold', '5–6 bridges'], ['silver', '3–4 bridges'], ['bronze', '0–2 bridges']].map(([k, r]) => `<div class="tier ${k}${k === t.id ? ' me' : ''}"><i></i><b>${k.toUpperCase()}</b><small>${r}</small></div>`).join('');
        return `
        <div class="tb-end tb-hud endcard ${t.id}">
            <div class="medal"><svg viewBox="0 0 120 150" aria-hidden="true"><path d="M30 0 L52 52 L68 52 L90 0 Z" class="rib"/><circle cx="60" cy="88" r="46" class="m1"/><circle cx="60" cy="88" r="36" class="m2"/><path d="M36 100 V86 Q36 78 44 78 H76 Q84 78 84 86 V100 H73 A6 6 0 0 0 61 100 H49 A6 6 0 0 0 36 100Z" class="m3" transform="translate(0,-4)"/></svg></div>
            <div class="ec-main"><small class="kick">THE BRIDGE · RESULT</small>
                <h1>${t.name}</h1>
                <h2>${esc(data?.tier?.title || t.line)}</h2>
                <p>${esc(t.sub)}</p>
                <div class="rstrip" aria-label="Rounds">${stripHtml(st.roundResults || Array.from({ length: ROUNDS_TOTAL }, (_, i) => (i < done ? 'done' : i + 1 === failed ? 'failed' : 'pending')), 0)}</div></div>
            <div class="stats">
                <div><b>${done}/${ROUNDS_TOTAL}</b><small>bridges completed</small></div>
                <div><b>${spans}</b><small>spans laid</small></div>
                <div><b>${correct}</b><small>correct answers</small></div>
                <div><b>${players.length}</b><small>players</small></div>
            </div>
            <div class="tiers">${chips}</div>
        </div>`;
    }

    /** Scenic backdrop behind the end card (the last chasm the class reached, bridge as far as they got). */
    function mountWinBackdrop(screen, data) {
        const S = SCENE();
        if (!screen || !S) return;
        screen.querySelector('.tb-win-backdrop')?.remove();
        const v = liveView();
        const st = last.state || {};
        const round = Math.max(1, Math.min(ROUNDS_TOTAL, Number(st.round) || 1));
        const n = Math.max(1, Number(st.spansInRound) || 3);
        const done = Math.max(0, Number(data?.roundsCompleted ?? st.roundsCompleted) || 0);
        const failed = Number(data?.failedRound ?? st.failedRound) || 0;
        const built = done >= round ? n : Math.max(0, Math.min(n, Number(st.spanIndex) || 0));
        const theme = st.roundTheme || ROUND_THEMES[round - 1];
        const portrait = window.innerWidth < window.innerHeight;
        const el = document.createElement('div');
        el.className = `tb-win-backdrop${portrait ? ' is-portrait' : ''}`;
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML = portrait
            ? `<div class="tb-win-sky"></div>${S.bridgeSvg('tbw', { n, theme, vb: '290 190 800 540', cls: 'tbs-svg tbs-svg--win' })}`
            : S.bridgeSvg('tbw', { n, theme, vb: '0 -100 1366 768', cls: 'tbs-svg tbs-svg--win' });
        screen.prepend(el);
        const ratio = failed || data?.endReason === 'tide' || st.endReason === 'tide' ? 1 : (v ? Math.min(0.85, v.ratio) : 0.5);
        S.updateBridge(el.querySelector('svg'), { n, built, nextFill: null, ratio, wave: ROUND_WAVE[round - 1] });
    }

    /* ---------------------------------------------------------------- instant answer feedback (phone) */

    let resultTimer = null;

    /** Small floating card; never takes focus and never blocks the answer inputs. */
    function showNote(text, tone, extraHtml, onClick) {
        document.getElementById('tb-result')?.remove();
        clearTimeout(resultTimer);
        const el = document.createElement('div');
        el.id = 'tb-result';
        el.className = `tb-result${tone === 'wrong' ? ' is-wrong' : ''}`;
        el.setAttribute('role', 'status');
        el.innerHTML = `<i>${tone === 'wrong' ? '✗' : '✓'}</i><span>${esc(text)}${extraHtml || ''}</span>`;
        document.body.appendChild(el);
        resultTimer = setTimeout(() => el.remove(), 2200);
        return el;
    }

    function showResult(result, opts) {
        if (!result) return null;
        const need = Number(result.neededCorrect) || Number(last.state?.neededCorrect) || 0;
        const got = Number(result.gotCorrect) || 0;
        const what = result.wasPhase === 'breaker' || result.phase === 'breaker' || last.state?.phase === 'breaker' ? 'the obstacle' : 'this span';
        if (result.correct) {
            const sub = result.cleared ? (result.roundCleared ? 'Bridge cleared!' : 'Span cleared!') : need ? `${got}/${need} correct for ${what}` : '';
            return showNote('Correct!', 'ok', sub ? `<small>${esc(sub)}</small>` : '');
        }
        const ans = result.correctTerm ? `Answer: ${result.correctTerm} — try again!` : 'Try again — no penalty!';
        const canAsk = typeof opts?.onChallenge === 'function';
        const el = showNote('Not quite', 'wrong', `<small>${esc(ans)}</small>`);
        if (canAsk) {
            el.classList.add('has-btn');
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tb-result-btn';
            b.textContent = 'Ask teacher';
            b.addEventListener('click', () => { el.remove(); opts.onChallenge(); });
            el.appendChild(b);
            clearTimeout(resultTimer);
            resultTimer = setTimeout(() => el.remove(), 4500);
        }
        return el;
    }

    function removeWinBackdrop(screen) {
        (screen || $('live-winner-screen'))?.querySelector('.tb-win-backdrop')?.remove();
    }

    function init(opts) {
        Object.assign(ctx, opts || {});
        document.addEventListener('fullscreenchange', fitStage);
    }

    global.TideBridgeUI = {
        init,
        setHostMode,
        renderHost,
        syncPlayerBanner,
        winnerHtml,
        mountWinBackdrop,
        removeWinBackdrop,
        ensureHostDom,
        formatClock,
        fitStage,
        startMusic,
        stopMusic,
        toggleMute,
        isMuted,
        musicState,
        showResult,
        showNote,
    };
})(typeof window !== 'undefined' ? window : globalThis);
