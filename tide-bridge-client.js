/**
 * The Bridge (Tide Bridge, internal id `tide-bridge`) — host board, phone chrome and end screen for Live Spark ("Storybook Dusk" art).
 *
 * PRESENTATION ONLY. All mechanics (rounds, scoring, tide timing, tiers, sockets) live in
 * tide-bridge.js / live-game.js; this file just draws the public state those emit.
 * The server only emits `live:tide-state` when something changes, so the clock and the tide
 * are advanced locally between emits from `remainingMs` + the time the state arrived.
 */
(function (global) {
    'use strict';

    const STAGE_W = 1366;
    const STAGE_H = 768;
    const GOLD_STONES = { 3: 7, 5: 10, 8: 14, 10: 17 };   // = gold threshold per game length (tide-bridge.js tideTier)
    const AV_COLORS = ['#7c4dff', '#ff7043', '#26a69a', '#ec407a', '#42a5f5', '#9ccc65', '#ffa726'];
    const ctx = { hostEnd: null, fullscreen: null, roomCode: null };
    // soundtrack: HOST BOARD only (projector); players get no music. Mute persists in localStorage.
    const MUSIC_SRC = '/audio/the-bridge-theme.mp3';
    const MUSIC_VOLUME = 0.35;
    const MUTE_KEY = 'ls_the_bridge_muted';
    let musicWanted = false;
    let gestureArmed = false;

    const last = { state: null, recvAt: 0, gameMinutes: 5 };
    const seen = { host: null, phone: null };
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
    const ICON_STAR = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 1l3 7 7 1-5.3 4.8L18 21l-6-3.7L6 21l1.3-7.2L2 9l7-1z" fill="#ffd23f"/></svg>';
    const LOGO = '<div class="logo">Lingo<span>Spark</span><svg viewBox="0 0 24 24"><path d="M12 1l3 7 7 1-5.3 4.8L18 21l-6-3.7L6 21l1.3-7.2L2 9l7-1z" fill="#ffd23f"/></svg></div>';
    const ICON_SOUND_ON = '<svg class="ico-on" viewBox="0 0 24 24" width="20" height="20"><path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    const ICON_SOUND_OFF = '<svg class="ico-off" viewBox="0 0 24 24" width="20" height="20"><path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
    const ICON_FULL = '<svg viewBox="0 0 20 20" width="18" height="18"><path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

    /* ---------------------------------------------------------------- state helpers */

    function stonesFor(gameMinutes) {
        return GOLD_STONES[Number(gameMinutes)] || GOLD_STONES[5];
    }

    function remember(state) {
        if (!state) return;
        if (state.gameMinutes) last.gameMinutes = Number(state.gameMinutes) || last.gameMinutes;
        last.state = { ...state, gameMinutes: last.gameMinutes };
        last.recvAt = Date.now();
    }

    /** Derived values for the current moment (clock and tide advance between emits). */
    function liveView() {
        const st = last.state;
        if (!st) return null;
        const total = Math.max(1, last.gameMinutes * 60000);
        const finished = Boolean(st.finished) || st.phase === 'finished';
        const elapsed = finished ? 0 : Date.now() - last.recvAt;
        const remaining = finished ? Math.max(0, Number(st.remainingMs) || 0) : Math.max(0, (Number(st.remainingMs) || 0) - elapsed);
        let ratio = clamp01(1 - remaining / total);
        if (finished && st.remainingMs === 0) ratio = 1;
        const n = stonesFor(last.gameMinutes);
        const cleared = Math.max(0, Number(st.cleared) || 0);
        const need = Math.max(1, Number(st.neededCorrect) || 3);
        const got = Math.max(0, Math.min(need, Number(st.gotCorrect) || 0));
        return {
            st, total, finished, remaining, ratio, n, cleared, need, got,
            phase: st.phase || 'vocab',
            breaker: st.phase === 'breaker',
            between: st.phase === 'between',
            built: Math.min(n, cleared),
        };
    }

    function phaseTexts(v) {
        if (v.breaker) return { title: 'Shore challenge!', sub: 'Fun break · bonus round', icon: ICON_SHELL };
        if (v.between) return { title: 'Next span…', sub: 'Get ready', icon: ICON_STONE };
        if (v.finished) return { title: 'Tide in!', sub: 'Time is up', icon: ICON_STONE };
        const sub = v.cleared >= v.n ? 'Bridge complete · keep going!' : `Vocabulary span ${Math.min(v.cleared + 1, v.n)} of ${v.n}`;
        return { title: 'Lay the next stone!', sub, icon: ICON_STONE };
    }

    function pipsHtml(got, need) {
        return Array.from({ length: need }, (_, i) => `<i class="${i < got ? 'on' : ''}"></i>`).join('');
    }

    function countHtml(got, need) {
        return `${got}<em>/${need}</em>`;
    }

    function initial(name) {
        const t = String(name || '?').trim();
        return (t[0] || '?').toUpperCase();
    }

    function avatarsHtml(players) {
        const helped = (players || []).filter((p) => p.contributed).slice(0, 5);
        return helped.map((p, i) => `<span style="background:${AV_COLORS[i % AV_COLORS.length]}" title="${esc(p.nickname)}">${esc(initial(p.nickname))}</span>`).join('');
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
                    <div class="tb-scene tb-scene--bridge" id="tb-scene-bridge">${S.bridgeSvg('tbh', { n: 10 })}</div>
                    <div class="tb-scene tb-scene--beach" id="tb-scene-beach">${S.beachSvg('tbhb')}</div>
                </div>
                ${LOGO}
                <div class="rounds"><i>${ICON_STONE}</i><div><small>ROUNDS CLEARED</small><b id="tb-host-spans">0</b></div></div>
                <div class="phase" id="tb-phase"><i id="tb-phase-ico">${ICON_STONE}</i><div><b id="tb-host-phase">Lay the next stone!</b><small id="tb-phase-sub"></small></div></div>
                <div class="clock"><small id="tb-clock-label">TIDE RETURNS IN</small><b id="tb-host-clock">5:00</b><div class="clockbar"><i id="tb-clockbar" style="width:100%"></i></div></div>
                <div class="center">
                    <div class="prompt" id="tb-prompt"><span class="tag" id="tb-tag">EVERYONE'S OWN WORD</span><p id="tb-host-msg"></p></div>
                    <div class="progress" id="tb-progress"><div class="pips" id="tb-pips"></div><b id="tb-host-clear">0<em>/3</em></b><small id="tb-prog-sub">correct for this stone</small></div>
                </div>
                <div class="gauge"><span>TIDE</span><div class="track"><i id="tb-gfill"></i><u id="tb-gmark"></u><em>BRIDGE</em></div></div>
                <div class="answers" id="tb-answers"><b id="tb-ans-text">Helped 0/0</b><div class="av" id="tb-av"></div></div>
                <div class="burst" id="tb-burst" hidden><b>SPAN CLEARED!</b><small id="tb-burst-sub">+1 stone — the bridge grows</small></div>
                <div class="bar">
                    <div class="room"><small>Room</small><b id="tb-room">----</b></div>
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
        if (v.finished) return 'Great teamwork, class!';
        if (v.breaker) return 'Fun break! Type fast — every correct word counts for the class.';
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

        const inc = seen.host != null && v.cleared > seen.host;
        if (stateChanged) seen.host = v.cleared;

        // live parts (every tick)
        $('tb-host-clock').textContent = formatClock(v.remaining);
        $('tb-clockbar').style.width = `${(clamp01(v.remaining / v.total) * 100).toFixed(1)}%`;
        const gp = Math.round(v.ratio * 1000) / 10;
        $('tb-gfill').style.height = `${gp}%`;
        $('tb-gmark').style.bottom = `${gp}%`;
        const bridgeSvg = root.querySelector('#tb-scene-bridge svg');
        const nextFill = v.breaker || v.finished ? null : (v.between ? null : v.got / v.need);
        S.updateBridge(bridgeSvg, { n: v.n, built: v.built, nextFill, ratio: v.ratio, justLaid: inc && v.cleared <= v.n, sparkle: inc });

        if (!stateChanged) return;
        const ph = phaseTexts(v);
        $('tb-host-phase').textContent = ph.title;
        $('tb-phase-sub').textContent = ph.sub;
        $('tb-phase-ico').innerHTML = ph.icon;
        $('tb-host-spans').textContent = String(v.cleared);
        $('tb-clock-label').textContent = v.finished ? 'TIME' : 'TIDE RETURNS IN';

        const st = v.st;
        const prompt = $('tb-prompt');
        const msg = $('tb-host-msg');
        let tag = "EVERYONE'S OWN WORD";
        let text = 'Answer your own word — help the class clear the span!';
        if (v.breaker) {
            tag = 'SHORE CHALLENGE · TYPE IT!';
            text = st.breakerPrompt || 'Everyone — shore challenge!';
        } else if (v.between) {
            tag = 'WELL DONE';
            text = 'Nice work — get ready…';
        } else if (v.finished) {
            tag = 'THE BRIDGE';
            text = 'Time! How far did you get?';
        }
        prompt.classList.toggle('breaker', v.breaker);
        prompt.classList.toggle('long', text.length > 70);
        $('tb-tag').textContent = tag;
        msg.textContent = text;

        const got = v.between ? v.need : v.got;
        $('tb-pips').innerHTML = pipsHtml(got, v.need);
        $('tb-host-clear').innerHTML = countHtml(got, v.need);
        $('tb-progress').classList.toggle('done', got >= v.need);
        $('tb-prog-sub').textContent = v.breaker ? 'beach treasures found' : 'correct for this stone';

        const players = st.players || [];
        const helped = players.filter((p) => p.contributed).length;
        $('tb-answers').hidden = !players.length || v.finished;
        $('tb-ans-text').textContent = `Helped ${helped}/${players.length}`;
        $('tb-av').innerHTML = avatarsHtml(players);

        $('tb-room').textContent = hostCode();
        $('tb-caption').textContent = hostCaption(v);
        $('tb-lobby').hidden = !v.finished;
        $('tb-end').textContent = v.finished ? 'Close' : 'End';
        $('tb-end').hidden = v.finished;

        if (inc) celebrate(v);
    }

    function celebrate(v) {
        const burst = $('tb-burst');
        if (!burst) return;
        $('tb-burst-sub').textContent = v.cleared <= v.n ? '+1 stone — the bridge grows' : 'Bridge complete — bonus round cleared!';
        burst.hidden = false;
        burst.classList.remove('is-on');
        void burst.offsetWidth;
        burst.classList.add('is-on');
        clearTimeout(hostBurstTimer);
        hostBurstTimer = setTimeout(() => { burst.hidden = true; burst.classList.remove('is-on'); }, 2800);
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
            <div class="ptop">${LOGO}<div class="proom"><small>Room</small><b id="tb-p-room">----</b></div><div class="prounds"><i>${ICON_STONE}</i><b id="tb-p-rounds">0</b></div></div>
            <div class="phase" id="tb-p-phase"><i id="tb-p-ico">${ICON_STONE}</i><div><b id="tb-p-title">Lay the next stone!</b><small id="tb-p-sub"></small></div></div>
            <div class="pscene" aria-hidden="true">
                <div class="tb-scene tb-scene--bridge">${S.bridgeSvg('tbp', { n: 10, vb: '292 268 780 440' })}</div>
                <div class="tb-scene tb-scene--beach">${S.beachSvg('tbpb', { vb: '250 290 880 478' })}</div>
                <div class="mini">
                    <div class="clock"><small id="tb-p-clock-l">TIDE</small><b id="tb-p-clock">5:00</b></div>
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
            document.body.classList.remove('tb-phone-breaker', 'tb-phone-between');
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
        el.classList.toggle('is-between', v.between);
        document.body.classList.toggle('tb-phone-breaker', v.breaker);
        document.body.classList.toggle('tb-phone-between', v.between);
        const inc = seen.phone != null && v.cleared > seen.phone;
        if (stateChanged) seen.phone = v.cleared;
        $('tb-p-clock').textContent = formatClock(v.remaining);
        const nextFill = v.breaker || v.finished || v.between ? null : v.got / v.need;
        S.updateBridge(el.querySelector('.tb-scene--bridge svg'), { n: v.n, built: v.built, nextFill, ratio: v.ratio, justLaid: inc && v.cleared <= v.n, sparkle: inc });
        if (!stateChanged) return;
        const ph = phaseTexts(v);
        $('tb-p-title').textContent = ph.title;
        $('tb-p-sub').textContent = ph.sub;
        $('tb-p-ico').innerHTML = ph.icon;
        $('tb-p-rounds').textContent = String(v.cleared);
        $('tb-p-room').textContent = String($('lsp-room-code')?.textContent || hostCode()).trim() || '----';
        const got = v.between ? v.need : v.got;
        $('tb-p-pips').innerHTML = pipsHtml(got, v.need);
        $('tb-p-count').innerHTML = countHtml(got, v.need);
        const foot = $('tb-phone-foot');
        if (foot) foot.textContent = v.breaker ? 'Your word counts for the whole class' : 'Your answer helps the whole class — no teams!';
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
        const T = {
            gold: { name: 'GOLD', line: 'Reached the far cliff', sub: 'The whole class crossed before the tide came back!' },
            silver: { name: 'SILVER', line: 'Mid-channel', sub: 'So close — the tide got us halfway. Try again!' },
            bronze: { name: 'BRONZE', line: 'Swept back to shore', sub: 'The tide won this time — build faster next round!' },
        };
        return { id: T[id] ? id : 'bronze', ...(T[id] || T.bronze) };
    }

    function winnerHtml(data) {
        const t = tierInfo(data);
        const n = stonesFor(last.gameMinutes);
        const cleared = Math.max(0, Number(data?.cleared ?? last.state?.cleared) || 0);
        const players = Array.isArray(data?.players) ? data.players : [];
        const correct = players.reduce((a, p) => a + (Number(p.correct ?? p.progress) || 0), 0);
        const chips = ['gold', 'silver', 'bronze'].map((k) => `<div class="tier ${k}${k === t.id ? ' me' : ''}"><i></i><b>${k.toUpperCase()}</b><small>${{ gold: 'Far cliff', silver: 'Mid-channel', bronze: 'Swept back' }[k]}</small></div>`).join('');
        return `
        <div class="tb-end tb-hud endcard ${t.id}">
            <div class="medal"><svg viewBox="0 0 120 150" aria-hidden="true"><path d="M30 0 L52 52 L68 52 L90 0 Z" class="rib"/><circle cx="60" cy="88" r="46" class="m1"/><circle cx="60" cy="88" r="36" class="m2"/><path d="M36 100 V86 Q36 78 44 78 H76 Q84 78 84 86 V100 H73 A6 6 0 0 0 61 100 H49 A6 6 0 0 0 36 100Z" class="m3" transform="translate(0,-4)"/></svg></div>
            <div class="ec-main"><small class="kick">THE BRIDGE · RESULT</small>
                <h1>${t.name}</h1>
                <h2>${esc(data?.tier?.title || t.line)}</h2>
                <p>${t.sub}</p></div>
            <div class="stats">
                <div><b>${cleared}</b><small>rounds cleared</small></div>
                <div><b>${Math.min(cleared, n)}/${n}</b><small>stones laid</small></div>
                <div><b>${correct}</b><small>correct answers</small></div>
                <div><b>${players.length}</b><small>players</small></div>
            </div>
            <div class="tiers">${chips}</div>
        </div>`;
    }

    /** Scenic backdrop behind the end card (same art as the board, bridge as far as the class got). */
    function mountWinBackdrop(screen, data) {
        const S = SCENE();
        if (!screen || !S) return;
        screen.querySelector('.tb-win-backdrop')?.remove();
        const cleared = Math.max(0, Number(data?.cleared ?? last.state?.cleared) || 0);
        const n = stonesFor(last.gameMinutes);
        const portrait = window.innerWidth < window.innerHeight;
        const el = document.createElement('div');
        el.className = `tb-win-backdrop${portrait ? ' is-portrait' : ''}`;
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML = portrait
            ? `<div class="tb-win-sky"></div>${S.bridgeSvg('tbw', { n, vb: '290 262 800 470', cls: 'tbs-svg tbs-svg--win' })}`
            : S.bridgeSvg('tbw', { n, vb: '0 -100 1366 768', cls: 'tbs-svg tbs-svg--win' });
        screen.prepend(el);
        const ratio = last.state && last.state.finished ? 1 : liveView()?.ratio ?? 1;
        S.updateBridge(el.querySelector('svg'), { n, built: Math.min(n, cleared), nextFill: null, ratio });
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
    };
})(typeof window !== 'undefined' ? window : globalThis);
