/**
 * Live Game client — 12-term typed race with progress bars, BGM, and confetti.
 */
(function () {
    const TERMS_TO_WIN = 12;
    const MIN_PLAYERS = 2;

    let socket = null;
    let hostState = null;
    let playerState = null;
    let answerPending = false;
    let activeQuestionId = 0;
    let confettiAnim = null;
    let hostLobbyPoll = null;
    let hostRaceColors = new Map();
    let playerCrewVote = null;
    let playerIsCaptain = false;
    let playerIsRelayActive = false;
    let captainSuggestedAnswer = null;
    let currentQuestion = null;
    let hostPendingChallenges = new Map();
    let playerChallengePending = false;
    let hostSelectedWordSetId = '';
    let hostWordSetsLoadedForUser = null;

    const RACE_BAR_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#9c27b0', '#ff6600', '#06b6d4', '#ec4899'];
    const HOST_POSITIVE_FEEDBACK = ['Way to go!', "That's right!", 'Nice one!', 'Spot on!', 'Keep going!', 'Brilliant!', 'Yes!'];
    const HOST_NEGATIVE_FEEDBACK = ['Ouch!', "That's unfortunate.", 'Back to the start!', 'So close!', 'Not this time.'];
    const RACE_BLOB_DEFS = [
        { cls: 'live-race-blob--yellow', size: 0.14, x: 0.14, y: 0.18, vx: 0.00022, vy: 0.00016 },
        { cls: 'live-race-blob--cyan', size: 0.13, x: 0.82, y: 0.14, vx: -0.00018, vy: 0.0002 },
        { cls: 'live-race-blob--rose', size: 0.13, x: 0.76, y: 0.78, vx: -0.0002, vy: -0.00017 },
        { cls: 'live-race-blob--green', size: 0.14, x: 0.16, y: 0.74, vx: 0.00019, vy: -0.00021 },
    ];
    const raceBlobAnim = { raf: null, blobs: [], container: null };

    function isHostSignedIn() {
        return Boolean(window.authState?.user?.id);
    }

    async function ensureAuthLoaded() {
        if (typeof window.refreshAuth === 'function') {
            await window.refreshAuth();
            return isHostSignedIn();
        }
        try {
            const res = await fetch('/api/auth/me', { credentials: 'include' });
            const data = await res.json();
            window.authState = data;
            return isHostSignedIn();
        } catch {
            return false;
        }
    }

    function clearStoredHostRoom() {
        sessionStorage.removeItem('ls_live_host_code');
        sessionStorage.removeItem('ls_live_host_token');
        hostState = null;
        stopHostLobbyPoll();
        LiveAudio.stopLobby();
    }

    function resetHostToSetup(message) {
        clearStoredHostRoom();
        setHostRaceMode(false);
        hostRaceColors = new Map();
        $('live-host-room-panel').hidden = true;
        updateHostAuthUI();
        if (message) showLiveError(message);
    }

    function handleHostSocketError(msg) {
        const text = String(msg || '');
        if (/invalid host credentials|room not found|expired/i.test(text)) {
            resetHostToSetup('Your previous room expired. Create a new room below.');
            return;
        }
        showLiveError(text || 'Something went wrong.');
    }

    function bindSocketReconnect(role) {
        const s = ensureSocket();
        if (s._liveReconnectHandler) s.off('connect', s._liveReconnectHandler);
        s._liveReconnectHandler = () => {
            if (role === 'host' && hostState) {
                emitHostJoin();
            }
            if (role === 'player' && playerState) {
                emitPlayerJoin();
                if (document.body.classList.contains('live-game-active') && !playerChallengePending) {
                    const challengePanel = $('live-play-challenge-actions');
                    if (!challengePanel?.classList.contains('live-play-challenge-actions--visible')) {
                        requestPlayerQuestion();
                    }
                }
            }
        };
        s.on('connect', s._liveReconnectHandler);
    }

    function startHostLobbyPoll(code) {
        stopHostLobbyPoll();
        if (!code) return;
        hostLobbyPoll = setInterval(async () => {
            if (hostState?.phase === 'playing') return;
            try {
                const res = await fetch(`/api/live/room/${encodeURIComponent(code)}`);
                if (!res.ok) return;
                const snap = await res.json();
                renderHostLobbyFromSnapshot(snap);
                updateHostStartButton(snap);
            } catch { /* ignore */ }
        }, 2000);
    }

    function stopHostLobbyPoll() {
        if (hostLobbyPoll) clearInterval(hostLobbyPoll);
        hostLobbyPoll = null;
    }

    function $(id) {
        return document.getElementById(id);
    }

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = String(s || '');
        return d.innerHTML;
    }

    function getQueryParam(name) {
        const hash = location.hash || '';
        const q = hash.includes('?') ? hash.split('?')[1] : (location.search || '').replace(/^\?/, '');
        return new URLSearchParams(q).get(name);
    }

    function ensureSocket() {
        if (typeof io === 'undefined') throw new Error('Socket.IO not loaded.');
        if (!socket) {
            socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });
            socket.on('connect_error', () => {
                showLiveError('Could not connect to the server. Check your connection.');
            });
        }
        return socket;
    }

    function emitWhenConnected(event, payload) {
        const s = ensureSocket();
        const send = () => s.emit(event, payload);
        if (s.connected) send();
        else s.once('connect', send);
    }

    function requestPlayerQuestion() {
        if (!playerState) return;
        emitWhenConnected('live:request-question', {
            code: playerState.code,
            playerId: playerState.playerId,
            playerToken: sessionStorage.getItem('ls_live_player_token'),
        });
    }

    function emitPlayerJoin() {
        if (!playerState) return;
        emitWhenConnected('live:player-join', {
            code: playerState.code,
            playerId: playerState.playerId,
            playerToken: sessionStorage.getItem('ls_live_player_token'),
        });
    }

    function emitHostJoin() {
        if (!hostState) return;
        emitWhenConnected('live:host-join', {
            code: hostState.code,
            hostToken: hostState.hostToken,
        });
    }

    function raceColorForPlayer(playerId) {
        if (!hostRaceColors.has(playerId)) {
            hostRaceColors.set(playerId, RACE_BAR_COLORS[hostRaceColors.size % RACE_BAR_COLORS.length]);
        }
        return hostRaceColors.get(playerId);
    }

    function playerBarColor() {
        const id = playerState?.playerId;
        if (!id) return RACE_BAR_COLORS[0];
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
        return RACE_BAR_COLORS[hash % RACE_BAR_COLORS.length];
    }

    function setLiveGameActive(active) {
        document.body.classList.toggle('live-game-active', Boolean(active));
        const codeEl = $('live-play-room-code');
        const codeVal = $('live-play-room-code-value');
        if (codeVal) {
            codeVal.textContent = playerState?.code || sessionStorage.getItem('ls_live_room_code') || '';
        }
        if (codeEl) {
            codeEl.hidden = !active;
        }
        const bubbles = $('live-play-bubbles');
        if (bubbles && !active) bubbles.innerHTML = '';
        if (active) startRaceBgBlobs($('live-play-race-bg'));
        else stopRaceBgBlobs();
        applyPlayerBarColor();
    }

    function startRaceBgBlobs(container) {
        if (!container || raceBlobAnim.raf) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        stopRaceBgBlobs();
        raceBlobAnim.container = container;
        raceBlobAnim.blobs = RACE_BLOB_DEFS.map((def) => {
            const el = document.createElement('div');
            el.className = `live-race-blob ${def.cls}`;
            container.appendChild(el);
            return { el, size: def.size, x: def.x, y: def.y, vx: def.vx, vy: def.vy };
        });
        const tick = () => {
            const host = raceBlobAnim.container;
            if (!host) return;
            const w = host.clientWidth || window.innerWidth;
            const h = host.clientHeight || window.innerHeight;
            raceBlobAnim.blobs.forEach((b) => {
                b.x += b.vx;
                b.y += b.vy;
                const sizePx = Math.min(w, h) * b.size;
                const half = sizePx / 2;
                const px = b.x * w;
                const py = b.y * h;
                if (px <= half) { b.x = half / w; b.vx = Math.abs(b.vx); }
                if (px >= w - half) { b.x = (w - half) / w; b.vx = -Math.abs(b.vx); }
                if (py <= half) { b.y = half / h; b.vy = Math.abs(b.vy); }
                if (py >= h - half) { b.y = (h - half) / h; b.vy = -Math.abs(b.vy); }
                b.el.style.width = `${sizePx}px`;
                b.el.style.height = `${sizePx}px`;
                b.el.style.transform = `translate(${b.x * w - half}px, ${b.y * h - half}px)`;
            });
            raceBlobAnim.raf = requestAnimationFrame(tick);
        };
        raceBlobAnim.raf = requestAnimationFrame(tick);
    }

    function stopRaceBgBlobs() {
        if (raceBlobAnim.raf) cancelAnimationFrame(raceBlobAnim.raf);
        raceBlobAnim.raf = null;
        raceBlobAnim.blobs.forEach((b) => b.el.remove());
        raceBlobAnim.blobs = [];
        raceBlobAnim.container = null;
    }

    function rankingRowsHtml(players, winnerId, { limit = 0, scoreMode = false, cannonMode = false } = {}) {
        const ranked = [...(players || [])].sort(
            (a, b) => (b.score ?? b.progress ?? 0) - (a.score ?? a.progress ?? 0) || String(a.nickname || '').localeCompare(String(b.nickname || ''))
        );
        const rows = limit > 0 ? ranked.slice(0, limit) : ranked;
        if (!rows.length) return '<li><span>No scores yet</span></li>';
        return rows.map((p, i) => {
            // Score mode (Lucky Lanterns): ties share rank 1, but only one row gets the trophy.
            const isWinner = winnerId != null ? p.id === winnerId : (scoreMode && i === 0 && p.rank === 1);
            const members = Array.isArray(p.memberNicknames) && p.memberNicknames.length
                ? `<span class="live-rank-members">${esc(p.memberNicknames.join(', '))}</span>`
                : '';
            const scoreLabel = cannonMode
                ? `${p.hits || 0} hits · ${p.correct || 0} correct`
                : scoreMode
                ? formatLanternPoints(p.score ?? p.progress)
                : `${p.progress || 0}/${p.termsToWin || TERMS_TO_WIN}`;
            const avatar = scoreMode && p.avatar ? `${p.avatar} ` : '';
            return `<li class="${isWinner ? 'is-winner' : ''}">
                <span>
                    <span class="live-rank-pos">${p.rank || (i + 1)}.</span>
                    ${avatar}${esc(p.nickname)}${isWinner ? ' 🏆' : ''}
                    ${members}
                </span>
                <span class="live-rank-score">${scoreLabel}</span>
            </li>`;
        }).join('');
    }

    function showLiveWinnerScreen(winnerNickname, isYou, options = {}) {
        const screen = $('live-winner-screen');
        const content = $('live-winner-content');
        const cannon = Boolean(options.cannon) && Boolean(window.WCB && window.WCFX);
        if (!screen || !content || (!winnerNickname && !cannon)) return;
        const teamMode = Boolean(options.teamMode);
        const lantern = !cannon && Boolean(options.lantern) && Boolean(window.LLFX);
        const youMsg = isYou ? (teamMode ? " That's your team!" : " That's you!") : '';
        const ranking = options.ranking || [];
        screen.classList.toggle('live-winner-screen--lanterns', lantern);
        screen.classList.toggle('live-winner-screen--cannon', cannon);
        document.body.classList.toggle('ll-winner', lantern);
        document.body.classList.toggle('wc-winner', cannon);
        screen.querySelector('.ll-win-backdrop')?.remove();
        screen.querySelector('.wc-win-backdrop')?.remove();
        LiveAudio.stopAll();
        window.WCFX?.rainLoop(false);
        LiveAudio.playFanfare();
        launchConfetti(lantern || cannon ? 9000 : 12000, lantern ? LLFX.CONFETTI : cannon ? WCFX.CONFETTI : null);
        let headline;
        if (cannon) {
            WCB.mountWinBackdrop(screen, options.cannonData?.winner || null);
            headline = WCB.winnerHtml(options.cannonData || {}, { playerId: options.playerId });
        } else if (lantern) {
            LLFX.ensureDefs();
            const backdrop = document.createElement('div');
            backdrop.className = 'll-win-backdrop ll-backdrop';
            backdrop.setAttribute('aria-hidden', 'true');
            screen.prepend(backdrop);
            const portrait = window.innerWidth < window.innerHeight;
            LLFX.mountBackdrop(backdrop, { portrait });
            backdrop.style.setProperty('--llu', String((portrait ? Math.max(window.innerWidth / 780, window.innerHeight / 1688) : Math.max(window.innerWidth / 1920, window.innerHeight / 1080)).toFixed(3)));
            headline = `<h2 class="ll-win-title">${LLFX.lettersHtml('CHAMPION!', { stagger: 0.05 })}</h2>
                <p class="ll-win-sub"><b>${esc(winnerNickname)}</b> lit up the night!${youMsg}</p>${lanternPodiumHtml(ranking)}`;
        } else {
            headline = `<h2>🏆 Champion!</h2><p><strong>${esc(winnerNickname)}</strong> completed all 12 terms first!${youMsg}</p>`;
        }
        const podiumIds = new Set(llPodiumOrder(ranking).slice(0, 3).map((row) => row.id));
        const rest = cannon ? [] : lantern ? ranking.filter((row) => !podiumIds.has(row.id)) : ranking;
        content.innerHTML = `
            ${headline}
            ${rest.length ? `<ol class="live-winner-scores" aria-label="${teamMode ? 'Team scores' : 'Player scores'}">${rankingRowsHtml(rest, options.winnerId, { scoreMode: lantern })}</ol>` : ''}
            <button type="button" class="btn btn-blue" id="live-winner-dismiss" style="padding:0.75rem 2rem;">Continue</button>`;
        screen.hidden = false;
        $('live-winner-dismiss')?.addEventListener('click', () => {
            hideLiveWinnerScreen();
            showLiveRankingScreen(ranking, options.winnerId, { teamMode, lantern, cannon });
        }, { once: true });
    }

    function hideLiveWinnerScreen() {
        const screen = $('live-winner-screen');
        if (screen) screen.hidden = true;
        document.body.classList.remove('ll-winner', 'wc-winner');
        LiveAudio.stopFanfare();
        const canvas = $('live-confetti-canvas');
        if (canvas) {
            canvas.classList.remove('active');
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        if (confettiAnim) cancelAnimationFrame(confettiAnim);
        confettiAnim = null;
    }

    function showLiveRankingScreen(players, winnerId, options = {}) {
        const screen = $('live-ranking-screen');
        const list = $('live-ranking-list');
        if (!screen || !list) return;
        const title = screen.querySelector('h2');
        if (title) title.textContent = options.cannon ? 'Word Cannon Battle: top gunners' : options.lantern ? 'Lucky Lanterns ranking' : (options.teamMode ? 'Final team ranking' : 'Final ranking');
        screen.classList.toggle('live-ranking-screen--lanterns', Boolean(options.lantern));
        screen.classList.toggle('live-ranking-screen--cannon', Boolean(options.cannon));
        list.innerHTML = rankingRowsHtml(players, winnerId, { scoreMode: Boolean(options.lantern), cannonMode: Boolean(options.cannon) });
        screen.hidden = false;
        const dismiss = $('live-ranking-dismiss');
        if (dismiss) {
            dismiss.onclick = () => { screen.hidden = true; };
        }
    }

    function buildJoinUrl(code) {
        return `${location.origin}/#/live/join?code=${encodeURIComponent(String(code || '').toUpperCase())}`;
    }

    function setHostJoinArtifacts(code, joinUrl) {
        const url = joinUrl || buildJoinUrl(code);
        const linkEl = $('live-host-join-link');
        if (linkEl) {
            linkEl.href = url;
            linkEl.textContent = url.replace(/^https?:\/\//, '');
        }
        const qr = $('live-host-qr');
        if (qr) {
            qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}`;
            qr.hidden = false;
            qr.alt = 'Scan to join Live Spark';
        }
    }

    function applyGlossaryPrefill() {
        const terms = (
            sessionStorage.getItem('ls_live_prefill_glossary')
            || sessionStorage.getItem('ls_shared_glossary')
            || document.getElementById('glossary-input')?.value
            || ''
        ).trim();
        if (!terms) return;
        sessionStorage.removeItem('ls_live_prefill_glossary');
        const pasteRadio = document.querySelector('input[name="live-source"][value="paste"]');
        if (pasteRadio) pasteRadio.checked = true;
        toggleLiveSourcePanels();
        const ta = $('live-host-glossary');
        if (ta) ta.value = terms;
    }

    function applyPlayerBarColor() {
        const bar = $('live-play-progress-bar');
        if (!bar || !document.body.classList.contains('live-game-active')) return;
        if (bar.classList.contains('winner')) return;
        bar.style.background = playerBarColor();
    }

    function spawnPlayerFeedbackBubble(correct, won) {
        const track = document.querySelector('.live-own-progress .live-progress-track');
        const container = $('live-play-bubbles');
        const bar = $('live-play-progress-bar');
        if (!track || !container || !bar) return;

        const rect = track.getBoundingClientRect();
        const pct = parseFloat(bar.style.width) || 0;
        const x = rect.left + Math.max(20, (rect.width * pct) / 100);

        const bubble = document.createElement('div');
        bubble.className = `live-race-feedback-bubble ${correct ? 'positive' : 'negative'}`;
        bubble.textContent = won ? 'Winner!' : pickHostFeedback(correct);
        bubble.style.left = `${Math.min(x, rect.right - 20)}px`;
        bubble.style.top = `${rect.top + rect.height / 2}px`;
        container.appendChild(bubble);
        bubble.addEventListener('animationend', () => bubble.remove());
    }

    function showLiveError(msg) {
        const text = msg || '';
        for (const id of ['live-error-banner', 'live-play-error', 'live-join-error']) {
            const el = $(id);
            if (el) {
                el.textContent = text;
                el.hidden = !text;
            }
        }
        if (msg && !$('live-error-banner') && !$('live-play-error') && typeof window.appAlert === 'function') {
            window.appAlert(msg);
        }
    }

    const CHOICE_COLORS = ['#C8102E', '#012169', '#00823B', '#E8A317']; // legacy fallback

    const LiveAudio = {
        lobby: null,
        game: null,
        fanfare: null,
        _audioCtx: null,
        VOLUME: 0.45,
        FANFARE_VOLUME: 0.7,
        CHALLENGE_VOLUME: 0.55,

        _track(src, { loop = true } = {}) {
            const a = new Audio(src);
            a.loop = loop;
            a.preload = 'auto';
            return a;
        },

        _play(audio, volume = this.VOLUME) {
            if (!audio) return;
            audio.volume = volume;
            audio.play().catch(() => {});
        },

        _pause(audio) {
            if (!audio) return;
            audio.pause();
            try { audio.currentTime = 0; } catch { /* ignore */ }
        },

        _ensureAudioCtx() {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            if (!this._audioCtx) this._audioCtx = new Ctx();
            if (this._audioCtx.state === 'suspended') {
                this._audioCtx.resume().catch(() => {});
            }
            return this._audioCtx;
        },

        /** Short two-tone chime when a challenge pops up for the host. */
        playChallengeAlert() {
            try {
                const ctx = this._ensureAudioCtx();
                if (!ctx) return;
                const now = ctx.currentTime;
                const master = ctx.createGain();
                master.gain.setValueAtTime(0.0001, now);
                master.gain.exponentialRampToValueAtTime(this.CHALLENGE_VOLUME, now + 0.02);
                master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
                master.connect(ctx.destination);

                const tones = [
                    { freq: 880, start: 0, dur: 0.16 },
                    { freq: 1174.66, start: 0.14, dur: 0.28 },
                ];
                tones.forEach(({ freq, start, dur }) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, now + start);
                    gain.gain.setValueAtTime(0.0001, now + start);
                    gain.gain.exponentialRampToValueAtTime(0.9, now + start + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
                    osc.connect(gain);
                    gain.connect(master);
                    osc.start(now + start);
                    osc.stop(now + start + dur + 0.02);
                });
            } catch { /* ignore autoplay / AudioContext errors */ }
        },

        startLobby() {
            this.stopGame();
            this.stopFanfare();
            if (!this.lobby) this.lobby = this._track('/audio/live-lobby.mp3');
            this._play(this.lobby);
        },

        startGame() {
            this.stopLobby();
            this.stopFanfare();
            if (!this.game) this.game = this._track('/audio/live-gameplay.mp3');
            this._play(this.game);
        },

        playFanfare() {
            this.stopLobby();
            this.stopGame();
            if (!this.fanfare) this.fanfare = this._track('/audio/live-champions-fanfare.mp3', { loop: false });
            try { this.fanfare.currentTime = 0; } catch { /* ignore */ }
            this._play(this.fanfare, this.FANFARE_VOLUME);
        },

        stopFanfare() {
            this._pause(this.fanfare);
        },

        stopLobby() {
            this._pause(this.lobby);
        },

        stopGame() {
            this._pause(this.game);
        },

        stopAll() {
            this.stopLobby();
            this.stopGame();
            this.stopFanfare();
        },

        /** Short WebAudio cues for Lucky Lanterns (synthesised; no audio files). */
        playLanternSfx(name) {
            try {
                const ctx = this._ensureAudioCtx();
                if (!ctx) return;
                const now = ctx.currentTime;
                const out = ctx.createGain();
                out.gain.value = 0.9;
                out.connect(ctx.destination);
                const tone = (freq, start, dur, type = 'sine', volume = 0.18, slideTo = null, dest = out) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = type;
                    osc.frequency.setValueAtTime(freq, now + start);
                    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + start + dur);
                    gain.gain.setValueAtTime(0.0001, now + start);
                    gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.015);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
                    osc.connect(gain);
                    gain.connect(dest);
                    osc.start(now + start);
                    osc.stop(now + start + dur + 0.03);
                    return osc;
                };
                const noise = (start, dur, { type = 'bandpass', freq = 1200, q = 1, volume = 0.2, freqTo = null, attack = 0.01 } = {}) => {
                    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
                    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
                    const data = buffer.getChannelData(0);
                    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
                    const src = ctx.createBufferSource();
                    src.buffer = buffer;
                    const filter = ctx.createBiquadFilter();
                    filter.type = type;
                    filter.Q.value = q;
                    filter.frequency.setValueAtTime(freq, now + start);
                    if (freqTo) filter.frequency.exponentialRampToValueAtTime(freqTo, now + start + dur);
                    const gain = ctx.createGain();
                    gain.gain.setValueAtTime(0.0001, now + start);
                    gain.gain.exponentialRampToValueAtTime(volume, now + start + attack);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
                    src.connect(filter);
                    filter.connect(gain);
                    gain.connect(out);
                    src.start(now + start);
                    src.stop(now + start + dur + 0.02);
                };
                if (name === 'pick' || name === 'land') {
                    tone(660, 0, 0.08, 'triangle', 0.14);
                    tone(990, 0.06, 0.12, 'triangle', 0.12);
                } else if (name === 'blip' || name === 'tick') {
                    tone(1320, 0, 0.06, 'sine', 0.07);
                } else if (name === 'whoosh') {
                    noise(0, 0.45, { freq: 400, freqTo: 2400, q: 0.8, volume: 0.12, attack: 0.18 });
                } else if (name === 'ding') {
                    tone(1046.5, 0, 0.5, 'sine', 0.16);
                    tone(1568, 0.02, 0.4, 'sine', 0.06);
                } else if (name === 'safe') {
                    tone(523.25, 0, 0.14, 'triangle', 0.18);
                    tone(659.25, 0.1, 0.14, 'triangle', 0.18);
                    tone(783.99, 0.2, 0.28, 'triangle', 0.18);
                } else if (name === 'coin') {
                    // flip "ting"s that speed up as the coin spins
                    [0, 0.16, 0.3, 0.42, 0.52, 0.6, 0.67].forEach((start, i) => tone(1800 + (i % 2) * 300, start, 0.07, 'sine', 0.07));
                    tone(2637, 0.78, 0.5, 'sine', 0.12);
                } else if (name === 'double') {
                    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.08, 0.22, 'triangle', 0.17));
                    tone(2093, 0.32, 0.45, 'sine', 0.07);
                } else if (name === 'bust') {
                    // sad trombone "wah-wah-wah-waaah"
                    const lp = ctx.createBiquadFilter();
                    lp.type = 'lowpass';
                    lp.frequency.value = 1100;
                    lp.connect(out);
                    [[392, 0, 0.3], [370, 0.32, 0.3], [349.2, 0.64, 0.3], [329.6, 0.96, 0.75]].forEach(([f, start, dur], i) => {
                        const osc = tone(f, start, dur, 'sawtooth', 0.11, i === 3 ? 300 : null, lp);
                        if (i === 3) {
                            const lfo = ctx.createOscillator();
                            const depth = ctx.createGain();
                            lfo.frequency.value = 6;
                            depth.gain.value = 6;
                            lfo.connect(depth);
                            depth.connect(osc.frequency);
                            lfo.start(now + start);
                            lfo.stop(now + start + dur);
                        }
                    });
                } else if (name === 'mystery') {
                    [880, 1108.7, 1318.5, 1760].forEach((f, i) => tone(f, i * 0.07, 0.35, 'sine', 0.09));
                    noise(0, 0.5, { type: 'highpass', freq: 5000, volume: 0.04, attack: 0.2 });
                } else if (name === 'chime') {
                    tone(1568, 0, 0.6, 'sine', 0.1);
                    tone(2093, 0.08, 0.6, 'sine', 0.08);
                    tone(2637, 0.16, 0.7, 'sine', 0.06);
                } else if (name === 'slam') {
                    tone(110, 0, 0.35, 'sine', 0.32, 45);
                    noise(0, 0.25, { type: 'lowpass', freq: 900, volume: 0.25 });
                } else if (name === 'drumroll') {
                    // ~1.1s snare roll that swells into the reveal
                    const hits = 30;
                    for (let i = 0; i < hits; i++) {
                        const t = i * 0.037;
                        noise(t, 0.05, { freq: 1800, q: 0.7, volume: 0.05 + 0.13 * (i / hits), attack: 0.003 });
                    }
                    tone(80, 0, 1.1, 'sine', 0.06);
                } else if (name === 'fanfare') {
                    [[523.25, 0, 0.14], [659.25, 0.13, 0.14], [783.99, 0.26, 0.14], [1046.5, 0.4, 0.6]].forEach(([f, start, dur]) => {
                        tone(f, start, dur, 'square', 0.06);
                        tone(f, start, dur, 'triangle', 0.12);
                    });
                    tone(523.25, 0.4, 0.6, 'triangle', 0.08);
                    tone(659.25, 0.4, 0.6, 'triangle', 0.08);
                    noise(0.4, 0.9, { type: 'highpass', freq: 4000, volume: 0.1 });
                }
            } catch { /* ignore autoplay / AudioContext errors */ }
        },
    };

    // --- Confetti ---
    function launchConfetti(durationMs = 4500, palette = null) {
        const canvas = $('live-confetti-canvas');
        if (!canvas) return;
        canvas.classList.add('active');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const colors = palette || ['#012169', '#C8102E', '#d4a017', '#00823B', '#5F7FFF', '#FFD700'];
        const particles = [];
        for (let i = 0; i < 160; i++) {
            particles.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight * 0.4 - window.innerHeight * 0.2,
                vx: (Math.random() - 0.5) * 9,
                vy: Math.random() * 4 + 2,
                rot: Math.random() * 360,
                vr: (Math.random() - 0.5) * 14,
                w: Math.random() * 10 + 5,
                h: Math.random() * 6 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
            });
        }

        const start = performance.now();
        if (confettiAnim) cancelAnimationFrame(confettiAnim);

        function frame(now) {
            const elapsed = now - start;
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            for (const p of particles) {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.12;
                p.rot += p.vr;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rot * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            }
            if (elapsed < durationMs) {
                confettiAnim = requestAnimationFrame(frame);
            } else {
                canvas.classList.remove('active');
                ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
                confettiAnim = null;
            }
        }
        confettiAnim = requestAnimationFrame(frame);
    }

    function progressPct(progress, total) {
        return Math.min(100, Math.round((progress / total) * 100));
    }

    function renderHostTeamLobbyBoard(container, snap) {
        if (!container) return;
        const teams = snap?.teams || [];
        const unassigned = snap?.unassignedPlayers || [];
        const maxMembers = snap?.teamMax || 4;
        if (!teams.length && !unassigned.length) {
            container.innerHTML = '<p class="live-muted">No players yet.</p>';
            return;
        }
        let html = '<div class="live-team-lobby">';
        for (const team of teams) {
            const members = (team.memberIds || []).map((id, idx) => {
                const nick = team.memberNicknames?.[idx] || 'Player';
                return `<div class="live-team-member-row" data-player-id="${esc(id)}">
                    <span>${esc(nick)}</span>
                    <span style="display:inline-flex;gap:0.25rem;">
                        <button type="button" class="live-remove-player-btn" data-unassign-player="${esc(id)}" title="Remove from team" aria-label="Remove ${esc(nick)} from team"><i class="fa-solid fa-user-minus"></i></button>
                        <button type="button" class="live-remove-player-btn" data-remove-player="${esc(id)}" title="Remove from room" aria-label="Remove ${esc(nick)} from room"><i class="fa-solid fa-xmark"></i></button>
                    </span>
                </div>`;
            }).join('');
            html += `<div class="live-team-card">
                <div class="live-team-card-head">
                    <span class="live-team-card-name">${esc(team.name)}</span>
                    <span class="live-muted">${team.memberCount || 0}/${maxMembers}</span>
                </div>
                <div class="live-team-card-members">${members || '<em>No members yet</em>'}</div>
            </div>`;
        }
        html += '</div>';
        if (unassigned.length) {
            html += `<p class="live-team-unassigned"><strong>Waiting for a team:</strong></p>`;
            html += `<div class="live-lobby-player-tiles">${unassigned.map((p) => {
                const offline = p.connected === false ? ' <span class="live-muted">(offline)</span>' : '';
                return `<div class="live-lobby-player-tile" data-player-id="${esc(p.id)}">
                    <strong title="${esc(p.nickname)}">${esc(p.nickname)}${offline}</strong>
                    <button type="button" class="live-remove-player-btn" data-remove-player="${esc(p.id)}" title="Remove from room" aria-label="Remove ${esc(p.nickname)}"><i class="fa-solid fa-xmark"></i></button>
                </div>`;
            }).join('')}</div>`;
        }
        container.innerHTML = html;
    }

    function renderHostLobbyFromSnapshot(snap) {
        const board = $('live-host-progress-board');
        if (!board) return;
        if (isWordCannonFormat(snap?.gameFormat) && snap?.teamAssignment === 'pick' && window.WCB) {
            board.innerHTML = WCB.lobbyTeamsHtml(snap);
        } else if (isTeamFormatValue(snap?.gameFormat) && snap?.teamAssignment === 'pick') {
            renderHostTeamLobbyBoard(board, snap);
        } else {
            renderHostLobbyBoard(board, snap?.players || []);
        }
    }

    function renderHostLobbyBoard(container, players) {
        if (!container) return;
        if (!players || !players.length) {
            container.innerHTML = '<p class="live-muted">No players yet.</p>';
            return;
        }
        const sorted = [...players].sort((a, b) => a.nickname.localeCompare(b.nickname));
        container.innerHTML = `<div class="live-lobby-player-tiles">${sorted.map((p) => {
            const offline = p.connected === false ? ' <span class="live-muted">(offline)</span>' : '';
            return `<div class="live-lobby-player-tile" data-player-id="${esc(p.id)}">
                <strong title="${esc(p.nickname)}">${esc(p.nickname)}${offline}</strong>
                <button type="button" class="live-remove-player-btn" data-remove-player="${esc(p.id)}" title="Remove from room" aria-label="Remove ${esc(p.nickname)}"><i class="fa-solid fa-xmark"></i></button>
            </div>`;
        }).join('')}</div>`;
    }

    function renderPlayerRosterTiles(players) {
        const host = $('live-play-roster');
        if (!host) return;
        const list = Array.isArray(players) ? players : [];
        if (!list.length) {
            host.hidden = true;
            host.innerHTML = '';
            return;
        }
        const sorted = [...list].sort((a, b) => String(a.nickname || '').localeCompare(String(b.nickname || '')));
        host.hidden = false;
        host.innerHTML = `<div class="live-play-roster-tiles">${sorted.map((p) => {
            const isYou = p.id && playerState?.playerId && p.id === playerState.playerId;
            const offline = p.connected === false ? ' (offline)' : '';
            return `<div class="live-play-roster-tile${isYou ? ' is-you' : ''}" title="${esc(p.nickname)}${offline}">${esc(p.nickname)}</div>`;
        }).join('')}</div>`;
    }

    function renderHostPlayerBoard(snap, options = {}) {
        const board = $('live-host-progress-board');
        if (!board) return;
        const players = snap?.players || snap || [];
        const inLobby = (hostState?.phase || 'lobby') === 'lobby' && !options.playing;
        if (inLobby) renderHostLobbyFromSnapshot(snap);
        else renderHostRaceBoard(players, options);
    }

    function setHostRaceMode(active) {
        document.body.classList.toggle('live-host-race', active);
        const race = $('live-host-race');
        if (race) {
            race.hidden = !active;
            race.classList.toggle('live-host-race--teams', active && isTeamFormatValue(hostState?.gameFormat));
        }
        const grid = document.querySelector('.live-host-grid');
        if (grid) grid.hidden = active;
        window.WCB?.setHostMode(false);
        if (active) {
            document.body.classList.remove('live-host-lanterns');
            const lanterns = $('live-host-lanterns');
            if (lanterns) lanterns.hidden = true;
            const code = hostState?.code || $('live-host-code')?.textContent || '';
            const codeEl = $('live-host-race-code');
            if (codeEl) codeEl.textContent = code;
            const status = $('live-host-race-status');
            if (status) {
                status.textContent = isTeamFormatValue(hostState?.gameFormat)
                    ? `${gameFormatLabel(hostState?.gameFormat, hostState?.teamAssignment)} — teams race to 12!`
                    : 'First to 12 in a row wins!';
            }
            startRaceBgBlobs(document.querySelector('#live-host-race .live-race-bg'));
        } else {
            document.body.classList.remove('live-host-lanterns');
            const lanterns = $('live-host-lanterns');
            if (lanterns) lanterns.hidden = true;
            const bubbles = $('live-host-race-bubbles');
            if (bubbles) bubbles.innerHTML = '';
            stopRaceBgBlobs();
            clearLanternReveal();
            stopLanternClock();
        }
    }

    function pickHostFeedback(correct) {
        const pool = correct ? HOST_POSITIVE_FEEDBACK : HOST_NEGATIVE_FEEDBACK;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function spawnHostFeedbackBubble(playerId, correct, progress, termsToWin, won, customText) {
        const row = document.querySelector(`.live-host-race-row[data-player-id="${CSS.escape(playerId)}"]`);
        const track = row?.querySelector('.live-host-race-track');
        const container = $('live-host-race-bubbles');
        if (!row || !container) return;

        const anchor = track || row;
        const rect = anchor.getBoundingClientRect();
        const total = termsToWin || TERMS_TO_WIN;
        const pct = progressPct(progress ?? 0, total);
        const x = track
            ? rect.left + Math.max(16, (rect.width * pct) / 100)
            : rect.left + rect.width / 2;

        const bubble = document.createElement('div');
        bubble.className = `live-host-feedback-bubble ${customText ? 'challenge' : (correct ? 'positive' : 'negative')}`;
        bubble.textContent = customText || (won ? 'Winner!' : pickHostFeedback(correct));
        bubble.style.left = `${Math.min(x, rect.right - 16)}px`;
        bubble.style.top = `${rect.top + rect.height / 2}px`;
        container.appendChild(bubble);
        bubble.addEventListener('animationend', () => bubble.remove());
    }

    function renderHostRaceBoard(players, options = {}) {
        const board = $('live-host-race-board');
        if (!board) return;
        if (!players || !players.length) {
            board.removeAttribute('data-count');
            board.removeAttribute('data-dense');
            board.innerHTML = '<p class="live-host-race-status" style="text-align:center;width:100%;">Waiting for players…</p>';
            return;
        }
        const sorted = [...players].sort((a, b) => b.progress - a.progress || a.nickname.localeCompare(b.nickname));
        board.dataset.count = String(Math.min(sorted.length, 16));
        board.dataset.dense = sorted.length > 16 ? '1' : '0';
        board._lastPlayers = sorted;
        board.innerHTML = sorted.map((p) => {
            const total = p.termsToWin || TERMS_TO_WIN;
            const pct = progressPct(p.progress || 0, total);
            const color = raceColorForPlayer(p.id);
            const flash = options.flashId === p.id;
            const isWinner = options.winnerId === p.id || p.progress >= total;
            const fillCls = `live-host-race-fill${flash ? ' reset-flash' : ''}${isWinner ? ' winner' : ''}`;
            const fillStyle = isWinner ? '' : `background:${color}`;
            const hasChallenge = hostPendingChallenges.has(p.id);
            const rowCls = `live-host-race-row${hasChallenge ? ' live-host-race-row--challenge' : ''}`;
            const challengeBadge = hasChallenge
                ? '<span class="live-host-challenge-badge">Challenge</span>'
                : '';
            return `<div class="${rowCls}" data-player-id="${esc(p.id)}">
                <div class="live-host-race-name" title="${esc(p.nickname)}">${challengeBadge}${esc(p.nickname)}</div>
                <div class="live-host-race-track">
                    <div class="${fillCls}" style="width:${pct}%;${fillStyle}"></div>
                </div>
                <div class="live-host-race-score">${p.progress || 0}/${total}</div>
            </div>`;
        }).join('');
    }

    function renderHostChallengePanel() {
        const panel = $('live-host-challenge-panel');
        if (!panel) return;
        const challenges = Array.from(hostPendingChallenges.values());
        if (!challenges.length) {
            panel.hidden = true;
            panel.innerHTML = '';
            return;
        }
        panel.hidden = false;
        panel.innerHTML = challenges.map((c) => `
            <div class="live-host-challenge-card" data-challenge-id="${esc(c.id)}">
                <div class="live-host-challenge-card-head">
                    <span class="live-host-challenge-badge">Challenge</span>
                    <strong>${esc(c.nickname)}</strong>
                </div>
                <p class="live-host-challenge-def">${esc(c.definition)}</p>
                <p class="live-host-challenge-answers">
                    Submitted: <strong>${esc(c.answerText)}</strong>
                    <span class="live-muted">· Expected: ${esc(c.correctTerm)}</span>
                </p>
                <div class="live-host-challenge-actions">
                    <button type="button" class="btn btn-blue live-challenge-accept" data-challenge-id="${esc(c.id)}">Accept</button>
                    <button type="button" class="btn btn-grey live-challenge-decline" data-challenge-id="${esc(c.id)}">Decline</button>
                </div>
            </div>
        `).join('');
        panel.querySelectorAll('.live-challenge-accept').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-challenge-id');
                if (id) ensureSocket().emit('live:resolve-challenge', { challengeId: id, accept: true });
            });
        });
        panel.querySelectorAll('.live-challenge-decline').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-challenge-id');
                if (id) ensureSocket().emit('live:resolve-challenge', { challengeId: id, accept: false });
            });
        });
    }

    function canPlayerChallengeAction() {
        if (isHotSparkRelayMode()) return playerIsRelayActive;
        if (!isCaptainCrewMode()) return true;
        return playerIsCaptain;
    }

    function showChallengeActions(result) {
        const panel = $('live-play-challenge-actions');
        const resultEl = $('live-play-result');
        if (!panel) return;
        playerChallengePending = false;
        panel.hidden = false;
        panel.classList.add('live-play-challenge-actions--visible');
        if (resultEl) resultEl.classList.add('live-play-result--visible');
        const teamLabel = isTeamMode() ? 'Team' : 'You';
        const canAct = canPlayerChallengeAction();
        const waitingMsg = isHotSparkRelayMode()
            ? 'Waiting for the teammate who answered…'
            : 'Waiting for captain to decide…';
        panel.innerHTML = `
            <p class="live-challenge-prompt">Marked wrong. Think your answer should count?</p>
            <p class="live-challenge-detail">Your answer: <strong>${esc(result.answerText)}</strong></p>
            <p class="live-challenge-detail live-muted">Expected: ${esc(result.correctTerm)}</p>
            <div class="live-challenge-btns">
                ${canAct
                    ? `<button type="button" id="live-play-challenge-btn" class="btn btn-blue">Challenge</button>
                       <button type="button" id="live-play-skip-challenge-btn" class="btn btn-grey">Continue</button>`
                    : `<p class="live-muted" style="margin:0;">${waitingMsg}</p>`}
            </div>`;
        if (canAct) {
            $('live-play-challenge-btn')?.addEventListener('click', submitChallenge);
            $('live-play-skip-challenge-btn')?.addEventListener('click', skipChallenge);
        }
        if (resultEl) {
            resultEl.innerHTML = `<div class="live-choice wrong">Marked incorrect. ${teamLabel} can challenge or continue.</div>`;
        }
        const status = $('live-play-status');
        if (status) status.textContent = 'Review your answer';
        setAnswerInputsEnabled(false);
        hideCrewPanel();
        renderChoiceButtons([]);
        if ($('live-play-type-section')) $('live-play-type-section').hidden = true;
    }

    function showChallengeWaiting() {
        const panel = $('live-play-challenge-actions');
        if (!panel) return;
        playerChallengePending = true;
        panel.hidden = false;
        panel.classList.add('live-play-challenge-actions--visible');
        panel.innerHTML = `
            <p class="live-challenge-prompt"><span class="live-host-challenge-badge">Challenge</span> sent to teacher</p>
            <p class="live-muted" style="margin:0;">Waiting for review…</p>`;
        const status = $('live-play-status');
        if (status) status.textContent = 'Challenge pending';
        setAnswerInputsEnabled(false);
    }

    function hideChallengeActions() {
        playerChallengePending = false;
        const panel = $('live-play-challenge-actions');
        if (panel) {
            panel.hidden = true;
            panel.classList.remove('live-play-challenge-actions--visible');
            panel.innerHTML = '';
        }
        const resultEl = $('live-play-result');
        if (resultEl) resultEl.classList.remove('live-play-result--visible');
    }

    function submitChallenge() {
        if (!playerState || playerChallengePending) return;
        showLiveError('');
        ensureSocket().emit('live:challenge-answer');
    }

    function skipChallenge() {
        if (!playerState || playerChallengePending) return;
        showLiveError('');
        ensureSocket().emit('live:skip-challenge');
    }

    function applyChallengeResolved(result) {
        hideChallengeActions();
        answerPending = false;
        playerCrewVote = null;
        playerState.progress = result.progress;
        updateOwnProgress(result.progress, TERMS_TO_WIN, result.reset);
        const status = $('live-play-status');
        const resultEl = $('live-play-result');
        const teamLabel = isTeamMode() ? 'Team' : 'You';

        if (result.challengeAccepted) {
            spawnPlayerFeedbackBubble(true, result.won);
            if (result.won) {
                setAnswerInputsEnabled(false);
                hideCrewPanel();
                if (status) status.textContent = isTeamMode() ? 'Your team won!' : 'You won!';
                if (resultEl) resultEl.innerHTML = '';
            } else {
                if (status) status.textContent = `Challenge accepted! ${result.progress} / ${TERMS_TO_WIN}`;
                if (resultEl) resultEl.innerHTML = '';
            }
        } else if (result.reset) {
            spawnPlayerFeedbackBubble(false, false);
            if (status) status.textContent = `Challenge declined — ${teamLabel.toLowerCase()} back to the start!`;
            if (resultEl) {
                resultEl.innerHTML = `<div class="live-choice wrong">The answer was <strong>${esc(result.correctTerm)}</strong>. ${teamLabel} ${teamLabel === 'Team' ? 'is' : 'are'} back at term 1.</div>`;
                resultEl.classList.add('live-play-result--visible');
            }
        }

        if (result.won) return;
        if (result.nextQuestion && typeof result.nextQuestion === 'object') {
            showPlayerQuestion(result.nextQuestion);
        }
    }

    function bindHostLobbyBoard() {
        const board = $('live-host-progress-board');
        if (!board || board._removeBound) return;
        board._removeBound = true;
        board.addEventListener('click', (e) => {
            if (hostState?.phase !== 'lobby') return;
            const unassignBtn = e.target.closest('[data-unassign-player]');
            if (unassignBtn) {
                const playerId = unassignBtn.getAttribute('data-unassign-player');
                if (playerId) hostUnassignPlayer(playerId);
                return;
            }
            const btn = e.target.closest('[data-remove-player]');
            if (!btn) return;
            const playerId = btn.getAttribute('data-remove-player');
            if (playerId) hostRemovePlayer(playerId);
        });
    }

    function hostRemovePlayer(playerId) {
        if (!hostState || hostState.phase !== 'lobby') return;
        emitWhenConnected('live:remove-player', { playerId });
    }

    function hostUnassignPlayer(playerId) {
        if (!hostState || hostState.phase !== 'lobby') return;
        emitWhenConnected('live:unassign-player', { playerId });
    }

    function renderProgressBar(player, { flashReset = false, isWinner = false } = {}) {
        const total = player.termsToWin || TERMS_TO_WIN;
        const pct = progressPct(player.progress || 0, total);
        const fillClass = flashReset ? 'live-progress-fill reset-flash' : isWinner ? 'live-progress-fill winner' : 'live-progress-fill';
        const offline = player.connected === false ? ' · offline' : '';
        return `<div class="live-player-progress" data-player-id="${esc(player.id)}">
            <div class="live-player-progress-head">
                <strong>${esc(player.nickname)}</strong>
                <span class="live-muted">${player.progress || 0} / ${total}${offline}</span>
            </div>
            <div class="live-progress-track">
                <div class="${fillClass}" style="width:${pct}%"></div>
            </div>
        </div>`;
    }

    function renderProgressBoard(container, players, options = {}) {
        if (!container) return;
        if (!players || !players.length) {
            container.innerHTML = '<p class="live-muted">No players yet.</p>';
            return;
        }
        const sorted = [...players].sort((a, b) => b.progress - a.progress || a.nickname.localeCompare(b.nickname));
        container.innerHTML = sorted
            .map((p) => renderProgressBar(p, {
                flashReset: options.flashId === p.id,
                isWinner: options.winnerId === p.id,
            }))
            .join('');
    }

    function updateOwnProgress(progress, termsToWin, flashReset) {
        const total = termsToWin || TERMS_TO_WIN;
        const label = $('live-play-progress-label');
        const bar = $('live-play-progress-bar');
        if (label) label.textContent = `${progress} / ${total}`;
        if (bar) {
            bar.style.width = progressPct(progress, total) + '%';
            bar.classList.toggle('reset-flash', Boolean(flashReset));
            bar.classList.toggle('winner', progress >= total);
            if (progress >= total) {
                bar.style.background = '';
            } else {
                applyPlayerBarColor();
            }
            if (flashReset) {
                setTimeout(() => bar.classList.remove('reset-flash'), 600);
            }
        }
    }

    function minPlayersForSnapshot(snapshot) {
        if (snapshot?.minPlayers) return snapshot.minPlayers;
        if (snapshot?.gameFormat === 'captain-crew' || snapshot?.gameFormat === 'hot-spark-relay') return 4;
        return MIN_PLAYERS;
    }

    function isTeamFormatValue(format) {
        return format === 'captain-crew' || format === 'hot-spark-relay';
    }

    function isLuckyLanternsFormat(format) {
        return format === 'lucky-lanterns';
    }

    function isWordCannonFormat(format) {
        return format === 'word-cannon';
    }

    /** Formats whose lobby has teams (Captain & Crew, Hot Spark, Word Cannon's Red vs Blue). */
    function usesTeamLobbyValue(format) {
        return isTeamFormatValue(format) || isWordCannonFormat(format);
    }

    function isCaptainCrewPickLobby(snap) {
        const s = snap || playerState;
        return isTeamFormatValue(s?.gameFormat) && s?.teamAssignment === 'pick';
    }

    function renderPlayerTeamLobby(snap) {
        const panel = $('live-play-team-lobby');
        const list = $('live-play-team-list');
        const createBtn = $('live-play-create-team');
        if (!panel || !list) return;
        if (!isCaptainCrewPickLobby(snap)) {
            panel.hidden = true;
            return;
        }
        panel.hidden = false;
        const teams = snap?.teams || [];
        const maxMembers = snap?.teamMax || 4;
        const hint = '<p class="live-team-join-hint">Tap a team to join</p>';
        if (!teams.length) {
            list.innerHTML = `${hint}<p class="live-muted" style="margin:0;">No teams yet — start one below.</p>`;
        } else {
            list.innerHTML = hint + teams.map((team) => {
                const onTeam = team.memberIds?.includes(playerState?.playerId);
                const members = team.memberNicknames?.length
                    ? team.memberNicknames.map((n) => `<span class="live-team-member-pill">${esc(n)}</span>`).join('')
                    : '<span class="live-muted">No members yet</span>';
                const joinBtn = !onTeam && team.canJoin
                    ? `<button type="button" class="btn btn-blue live-join-team-btn" data-team-id="${esc(team.id)}" style="width:100%;margin-top:0.5rem;">Join ${esc(team.name)}</button>`
                    : '';
                const joined = onTeam
                    ? '<span class="live-muted" style="display:block;margin-top:0.35rem;font-weight:600;color:var(--success-green);">✓ You\'re on this team</span>'
                    : '';
                const cardCls = `live-team-card${onTeam ? ' on-team' : ''}${!onTeam && team.canJoin ? ' joinable' : ''}`;
                const dataTeam = !onTeam && team.canJoin ? ` data-team-id="${esc(team.id)}"` : '';
                return `<div class="${cardCls}"${dataTeam}>
                    <div class="live-team-card-head">
                        <span class="live-team-card-name">${esc(team.name)}</span>
                        <span class="live-muted">${team.memberCount || 0}/${maxMembers}</span>
                    </div>
                    <div class="live-team-member-pills">${members}</div>
                    ${joinBtn}${joined}
                </div>`;
            }).join('');
        }
        if (createBtn) createBtn.hidden = Boolean(playerState?.teamId);
        const joinTeam = (teamId) => {
            if (teamId) ensureSocket().emit('live:join-team', { teamId });
        };
        list.querySelectorAll('.live-join-team-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                joinTeam(btn.getAttribute('data-team-id'));
            });
        });
        list.querySelectorAll('.live-team-card.joinable').forEach((card) => {
            card.addEventListener('click', () => joinTeam(card.getAttribute('data-team-id')));
        });
    }

    function applyPlayerLobbySnapshot(snap) {
        if (!playerState || !snap) return;
        playerState.gameFormat = snap.gameFormat || playerState.gameFormat || 'race';
        playerState.teamAssignment = snap.teamAssignment || playerState.teamAssignment || 'random';
        playerState.lastSnapshot = snap;
        const myTeam = (snap.teams || []).find((t) => t.memberIds?.includes(playerState.playerId));
        playerState.teamId = myTeam?.id || null;
        playerState.teamName = myTeam?.name || null;
        renderPlayerTeamLobby(snap);
    }

    function isCaptainCrewMode() {
        return playerState?.gameFormat === 'captain-crew';
    }

    function isHotSparkRelayMode() {
        return playerState?.gameFormat === 'hot-spark-relay';
    }

    function isTeamMode() {
        return isCaptainCrewMode() || isHotSparkRelayMode();
    }

    function updateHostStartButton(snapshot) {
        const btn = $('live-host-start');
        const status = $('live-host-status');
        const countEl = $('live-host-player-count');
        if (!btn) return;
        const count = snapshot?.playerCount ?? snapshot?.players?.length ?? 0;
        const minPlayers = minPlayersForSnapshot(snapshot || hostState);
        const format = snapshot?.gameFormat || hostState?.gameFormat;
        const isTeamGame = isTeamFormatValue(format);
        const cannonGame = isWordCannonFormat(format);
        const isPickTeams = usesTeamLobbyValue(format) && (snapshot?.teamAssignment || hostState?.teamAssignment) === 'pick';
        const playing = snapshot?.phase === 'playing';
        const finished = snapshot?.phase === 'finished' || hostState?.phase === 'finished';
        const canStart = snapshot?.canStart != null
            ? snapshot.canStart
            : !isPickTeams && count >= minPlayers && (snapshot?.phase === 'lobby' || finished);
        // After a game, Start still works (server resets lobby first).
        btn.disabled = playing ? true : (finished ? count < minPlayers : !canStart);
        if (finished && !playing) btn.hidden = false;
        const lanternGame = isLuckyLanternsFormat(format);
        if (countEl) {
            countEl.textContent = playing
                ? `${count} players · ${lanternGame ? 'Lucky Lanterns' : cannonGame ? 'Word Cannon Battle' : (isTeamGame ? 'team race' : 'solo race')}`
                : `${count} player${count === 1 ? '' : 's'} joined (minimum ${minPlayers} to start)`;
        }
        if (playing) {
            btn.textContent = 'Game in progress…';
            if (status) {
                const timeSec = snapshot?.questionTimeSec ?? hostState?.questionTimeSec;
                const timeNote = timeSec ? ` · ${timeSec} s per question` : '';
                status.textContent = (lanternGame
                    ? `Lucky Lanterns — ${snapshot?.lanternRounds || hostState?.lanternRounds || 10} rounds`
                    : cannonGame
                    ? `Word Cannon Battle — ${snapshot?.gameMinutes || hostState?.gameMinutes || 5} min, Red vs Blue`
                    : isTeamGame
                    ? `${gameFormatLabel(format, snapshot?.teamAssignment || hostState?.teamAssignment)} — teams race to 12!`
                    : 'Race underway — first to 12 terms in a row wins!') + timeNote;
            }
        } else if (count < minPlayers) {
            btn.textContent = `Start game (need ${minPlayers}+ players)`;
            if (status) status.textContent = `Waiting for players (${count} / ${minPlayers} minimum)…`;
        } else if (isPickTeams && !canStart && !finished) {
            btn.textContent = 'Start game (teams not ready)';
            if (status) {
                status.textContent = cannonGame
                    ? 'Players are choosing Red or Blue (everyone needs a side, at least 1 per team)…'
                    : 'Players are choosing teams (2–4 per team, all players assigned)…';
            }
        } else {
            btn.textContent = 'Start game';
            if (status) {
                status.textContent = finished
                    ? 'Game over — change format if you like, then Start game (players stay in the room).'
                    : lanternGame
                        ? `${count} players ready for Lucky Lanterns.`
                        : cannonGame && !isPickTeams
                        ? `${count} players ready. Red and Blue teams are drawn at random on Start.`
                        : isPickTeams
                        ? 'All teams ready — start when you are.'
                        : `${count} players ready. Start when everyone has joined.`;
            }
        }
    }

    function showChampionBanner(container, winnerNickname, isYou) {
        if (!container) return;
        const youMsg = isYou
            ? (isTeamMode() || isTeamFormatValue(hostState?.gameFormat) ? ' That\'s your team!' : ' That\'s you!')
            : '';
        container.hidden = false;
        container.innerHTML = `
            <h2>🏆 Champion!</h2>
            <p><strong>${esc(winnerNickname)}</strong> completed all 12 terms first!${youMsg}</p>`;
    }

    function bindHostSocket() {
        const s = ensureSocket();
        bindSocketReconnect('host');
        ['live:host-joined', 'live:progress-update', 'live:room-state', 'live:game-started', 'live:game-finished', 'live:lobby-reset', 'live:host-answer', 'live:challenge-pending', 'live:challenge-resolved', 'live:settings-updated', 'live:lantern-state', 'live:cannon-state', 'live:error'].forEach((ev) => s.off(ev));

        s.on('live:host-joined', (data) => {
            showLiveError('');
            hostPendingChallenges = new Map();
            (data.pendingChallenges || []).forEach((c) => {
                if (c?.id) hostPendingChallenges.set(c.entityId, c);
            });
            renderHostChallengePanel();
            hostState.phase = data.snapshot?.phase || 'lobby';
            hostState.gameFormat = data.snapshot?.gameFormat || hostState?.gameFormat || 'race';
            hostState.teamAssignment = data.snapshot?.teamAssignment || hostState?.teamAssignment || 'random';
            hostState.answerMode = data.snapshot?.answerMode || hostState?.answerMode || 'randomise';
            hostState.lanternRounds = data.snapshot?.lanternRounds || hostState?.lanternRounds || 10;
            if (data.snapshot?.gameMinutes) hostState.gameMinutes = data.snapshot.gameMinutes;
            applyHostTiming(data.snapshot);
            if (data.snapshot?.phase === 'playing') {
                if (isLuckyLanternsFormat(hostState.gameFormat)) setHostLanternMode(true);
                else if (isWordCannonFormat(hostState.gameFormat)) setHostCannonMode(true);
                else {
                    setHostRaceMode(true);
                    renderHostRaceBoard(data.progress?.players || []);
                }
            } else {
                setHostRaceMode(false);
                renderHostLobbyFromSnapshot(data.snapshot);
                syncHostLobbySettingsUI(data.snapshot);
                updateHostModeLabel();
            }
            updateHostStartButton(data.snapshot);
            if (data.snapshot?.phase === 'playing') {
                stopHostLobbyPoll();
                LiveAudio.stopLobby();
                LiveAudio.startGame();
            } else {
                LiveAudio.startLobby();
                startHostLobbyPoll(hostState?.code);
            }
        });

        s.on('live:room-state', (snap) => {
            hostState.canStart = snap.canStart;
            hostState.gameFormat = snap.gameFormat || hostState?.gameFormat || 'race';
            hostState.teamAssignment = snap.teamAssignment || hostState?.teamAssignment || 'random';
            hostState.answerMode = snap.answerMode || hostState?.answerMode || 'randomise';
            hostState.lanternRounds = snap.lanternRounds || hostState?.lanternRounds || 10;
            if (snap.gameMinutes) hostState.gameMinutes = snap.gameMinutes;
            applyHostTiming(snap);
            hostState.phase = snap.phase || hostState?.phase || 'lobby';
            if (hostState?.phase === 'playing') {
                // Race board is driven by progress-update (teams/players as race entities).
                // Do not re-render from room-state.players (always individuals) — that flashes team → solo.
                updateHostStartButton(snap);
                return;
            }
            setHostRaceMode(false);
            renderHostLobbyFromSnapshot(snap);
            syncHostLobbySettingsUI(snap);
            updateHostModeLabel();
            updateHostStartButton(snap);
        });

        s.on('live:host-answer', (data) => {
            if (hostState?.phase !== 'playing') return;
            if (data.timedOut) {
                spawnHostFeedbackBubble(data.playerId, false, data.progress, TERMS_TO_WIN, false, "Time's up");
            } else if (!data.challengeable) {
                spawnHostFeedbackBubble(data.playerId, data.correct, data.progress, TERMS_TO_WIN, data.won);
            }
            if (!data.correct && data.reset) hostState.lastFlashId = data.playerId;
        });

        s.on('live:challenge-pending', (data) => {
            if (!data?.id) return;
            const isNew = !hostPendingChallenges.has(data.entityId)
                || hostPendingChallenges.get(data.entityId)?.id !== data.id;
            hostPendingChallenges.set(data.entityId, data);
            if (isNew) LiveAudio.playChallengeAlert();
            spawnHostFeedbackBubble(data.entityId, true, data.progress, TERMS_TO_WIN, false, 'Challenge!');
            renderHostChallengePanel();
            const board = $('live-host-race-board');
            if (board && hostState?.phase === 'playing') {
                renderHostRaceBoard(
                    board._lastPlayers || [],
                    { flashId: hostState.lastFlashId },
                );
            }
        });

        s.on('live:challenge-resolved', (data) => {
            if (!data?.id) return;
            const existing = hostPendingChallenges.get(data.entityId)
                || Array.from(hostPendingChallenges.values()).find((c) => c.id === data.id);
            if (existing) hostPendingChallenges.delete(existing.entityId);
            renderHostChallengePanel();
            const board = $('live-host-race-board');
            if (board && hostState?.phase === 'playing') {
                renderHostRaceBoard(board._lastPlayers || []);
            }
        });

        s.on('live:progress-update', (data) => {
            if (hostState?.phase === 'playing') {
                if (!isLuckyLanternsFormat(hostState?.gameFormat) && !isWordCannonFormat(hostState?.gameFormat)) {
                    const board = $('live-host-race-board');
                    if (board) board._lastPlayers = data.players || [];
                    renderHostRaceBoard(data.players || [], { flashId: hostState.lastFlashId });
                }
                hostState.lastFlashId = null;
            } else if (usesTeamLobbyValue(hostState?.gameFormat) && hostState?.teamAssignment === 'pick') {
                /* teams view comes from live:room-state */
            } else {
                renderHostLobbyBoard($('live-host-progress-board'), data.players || []);
            }
            updateHostStartButton({
                ...data,
                playerCount: data.players?.length,
                phase: data.phase || hostState?.phase,
                gameFormat: hostState?.gameFormat,
                teamAssignment: hostState?.teamAssignment,
                canStart: hostState?.canStart,
                minPlayers: hostState?.minPlayers,
            });
        });

        s.on('live:game-started', (data) => {
            hostState.phase = 'playing';
            hostState.gameFormat = data.gameFormat || hostState.gameFormat || 'race';
            hostState.lanternRounds = data.lanternRounds || hostState.lanternRounds;
            applyHostTiming(data);
            hostRaceColors = new Map();
            hostPendingChallenges = new Map();
            renderHostChallengePanel();
            llResetHost();
            window.WCB?.resetHost();
            document.body.classList.remove('ll-lobby', 'wc-lobby');
            hideLiveWinnerScreen();
            const ranking = $('live-ranking-screen');
            if (ranking) ranking.hidden = true;
            const playAgain = $('live-host-play-again');
            if (playAgain) playAgain.hidden = true;
            stopHostLobbyPoll();
            LiveAudio.stopLobby();
            LiveAudio.startGame();
            if (isLuckyLanternsFormat(hostState.gameFormat)) setHostLanternMode(true);
            else if (isWordCannonFormat(hostState.gameFormat)) setHostCannonMode(true);
            else {
                setHostRaceMode(true);
                renderHostRaceBoard(data.progress?.players || []);
            }
            syncHostLobbySettingsUI({ phase: 'playing' });
            updateHostStartButton({ phase: 'playing', players: data.progress?.players, gameFormat: data.gameFormat, minPlayers: data.minPlayers });
        });

        s.on('live:lantern-state', (state) => {
            if (!state || !hostState) return;
            hostState.gameFormat = 'lucky-lanterns';
            if (state.phase === 'finished') return;
            hostState.phase = 'playing';
            setHostLanternMode(true);
            renderLanternHost(state);
        });

        s.on('live:cannon-state', (state) => {
            if (!state || !hostState || !window.WCB) return;
            hostState.gameFormat = 'word-cannon';
            if (state.phase === 'finished') return;
            hostState.phase = 'playing';
            if (!document.body.classList.contains('live-host-cannon')) setHostCannonMode(true);
            WCB.renderHost(state);
        });

        s.on('live:game-finished', (data) => {
            // Let the last Lucky Lanterns reveal finish on screen before the podium.
            clearTimeout(llHost.finishTimer);
            const lanternFinish = Boolean(data.lantern) || isLuckyLanternsFormat(hostState?.gameFormat);
            const cannonFinish = Boolean(data.cannon) || isWordCannonFormat(hostState?.gameFormat);
            const wait = lanternFinish ? llHost.revealDoneAt - Date.now()
                : cannonFinish && window.WCB ? WCB.hostRevealDoneAt() - Date.now() : 0;
            if (wait > 0) {
                llHost.finishTimer = setTimeout(() => hostGameFinished(data), Math.min(wait, 9000));
                return;
            }
            hostGameFinished(data);
        });
        function hostGameFinished(data) {
            llHost.finishTimer = null;
            llHost.revealDoneAt = 0;
            window.WCB?.clearHostReveal();
            hostState.phase = 'finished';
            hostPendingChallenges = new Map();
            renderHostChallengePanel();
            stopHostLobbyPoll();
            LiveAudio.stopAll();
            setHostRaceMode(false);
            const cannonWin = Boolean(data.cannon) || isWordCannonFormat(hostState?.gameFormat);
            if (data.winnerNickname || cannonWin) {
                showLiveWinnerScreen(data.winnerNickname, false, {
                    cannon: cannonWin,
                    cannonData: data,
                    teamMode: isTeamFormatValue(hostState?.gameFormat),
                    lantern: Boolean(data.lantern) || isLuckyLanternsFormat(hostState?.gameFormat),
                    ranking: data.players || [],
                    winnerId: data.winnerId,
                });
            }
            // Keep Start + format controls available — starting or changing settings resets to lobby.
            const playAgain = $('live-host-play-again');
            if (playAgain) playAgain.hidden = false;
            const startBtn = $('live-host-start');
            if (startBtn) startBtn.hidden = false;
            syncHostLobbySettingsUI({ phase: 'finished' });
            updateHostStartButton({
                phase: 'finished',
                canStart: true,
                playerCount: data.players?.length,
                players: data.players,
                gameFormat: hostState?.gameFormat,
                teamAssignment: hostState?.teamAssignment,
                minPlayers: hostState?.minPlayers,
            });
                }
        s.on('live:lobby-reset', (data) => {
            noteLobbySettingsAck(data.settingsSeq);
            hostState.phase = 'lobby';
            hostState.gameFormat = data.snapshot?.gameFormat || hostState.gameFormat || 'race';
            hostState.teamAssignment = data.snapshot?.teamAssignment || hostState.teamAssignment || 'random';
            hostState.answerMode = data.snapshot?.answerMode || hostState.answerMode || 'randomise';
            hostState.lanternRounds = data.snapshot?.lanternRounds || hostState.lanternRounds || 10;
            applyHostTiming(data.snapshot);
            hostPendingChallenges = new Map();
            document.body.classList.remove('live-lantern-player');
            clearTimeout(llHost.finishTimer);
            llResetHost();
            window.WCB?.resetHost();
            renderHostChallengePanel();
            setHostRaceMode(false);
            hideLiveWinnerScreen();
            const ranking = $('live-ranking-screen');
            if (ranking) ranking.hidden = true;
            renderHostLobbyFromSnapshot(data.snapshot);
            syncHostLobbySettingsUI(data.snapshot, data.settingsSeq);
            updateHostModeLabel();
            updateHostStartButton(data.snapshot);
            const playAgain = $('live-host-play-again');
            if (playAgain) playAgain.hidden = true;
            const startBtn = $('live-host-start');
            if (startBtn) startBtn.hidden = false;
            LiveAudio.startLobby();
            startHostLobbyPoll(hostState?.code);
        });

        s.on('live:settings-updated', (data) => {
            if (!hostState) return;
            noteLobbySettingsAck(data.settingsSeq);
            hostState.gameFormat = data.gameFormat || hostState.gameFormat;
            hostState.teamAssignment = data.teamAssignment || hostState.teamAssignment;
            hostState.answerMode = data.answerMode || hostState.answerMode;
            hostState.lanternRounds = data.lanternRounds || data.snapshot?.lanternRounds || hostState.lanternRounds;
            hostState.gameMinutes = data.gameMinutes || data.snapshot?.gameMinutes || hostState.gameMinutes;
            applyHostTiming(data.snapshot || data);
            syncHostLobbySettingsUI(data.snapshot || data, data.settingsSeq);
            updateHostModeLabel();
            if (data.snapshot) {
                renderHostLobbyFromSnapshot(data.snapshot);
                updateHostStartButton(data.snapshot);
            }
        });

        s.on('live:error', (data) => handleHostSocketError(data.error));
    }

    function bindPlayerSocket() {
        const s = ensureSocket();
        bindSocketReconnect('player');
        ['live:player-joined', 'live:room-state', 'live:game-started', 'live:your-question', 'live:answer-result', 'live:crew-vote-update', 'live:progress-update', 'live:game-finished', 'live:lobby-reset', 'live:player-removed', 'live:challenge-submitted', 'live:challenge-resolved', 'live:lantern-state', 'live:cannon-state', 'live:error'].forEach((ev) => s.off(ev));

        s.on('live:player-joined', (data) => {
            showLiveError('');
            playerState.gameFormat = data.gameFormat || data.snapshot?.gameFormat || 'race';
            playerState.teamAssignment = data.teamAssignment || data.snapshot?.teamAssignment || 'random';
            playerState.teamId = data.teamId || null;
            playerState.teamName = data.teamName || null;
            playerState.progress = data.player?.progress || 0;
            updateOwnProgress(playerState.progress, TERMS_TO_WIN);
            renderProgressBoard($('live-play-progress-board'), data.progress?.players || []);
            if (data.phase === 'playing') {
                setLiveGameActive(true);
                LiveAudio.startGame();
                if (data.question) showPlayerQuestion(data.question);
                else if (!data.awaitingChallenge) {
                    showPlayerWaiting('Starting…');
                    requestPlayerQuestion();
                }
            } else {
                setLiveGameActive(false);
                applyPlayerLobbySnapshot(data.snapshot);
                showPlayerWaiting('Waiting for the host to start…', data.snapshot);
            }
        });

        s.on('live:room-state', (snap) => {
            applyPlayerLobbySnapshot(snap);
            if (playerState && snap?.phase === 'lobby') {
                showPlayerWaiting('Waiting for the host to start…', snap);
            }
        });

        s.on('live:game-started', (data) => {
            activeQuestionId = 0;
            answerPending = false;
            playerState.gameFormat = data.gameFormat || playerState.gameFormat || 'race';
            clearTimeout(llPhone.finishTimer);
            llPhone.revealDoneAt = 0;
            llPhone.key = null;
            window.WCB?.resetPhone();
            if (isLuckyLanternsFormat(playerState.gameFormat)) document.body.classList.add('live-lantern-player');
            if (isWordCannonFormat(playerState.gameFormat)) document.body.classList.add('live-cannon-player');
            setLiveGameActive(true);
            syncPlayerLanternLobby();
            syncPlayerCannonLobby();
            LiveAudio.startGame();
            showLiveError('');
            showPlayerWaiting('Starting…');
            requestPlayerQuestion();
        });

        s.on('live:crew-vote-update', (data) => {
            if (!data || data.questionId !== activeQuestionId) return;
            playerIsCaptain = Boolean(data.isCaptain);
            updateCrewVoteUI(data);
        });

        s.on('live:your-question', (q) => {
            if (q) showPlayerQuestion(q);
        });

        s.on('live:lantern-state', (state) => {
            if (!state || !playerState) return;
            playerState.gameFormat = 'lucky-lanterns';
            document.body.classList.add('live-lantern-player');
            renderLanternPlayer(state);
        });

        s.on('live:cannon-state', (state) => {
            if (!state || !playerState || !window.WCB) return;
            playerState.gameFormat = 'word-cannon';
            if (state.phase === 'finished') return;
            WCB.renderPhone(state);
            syncPlayerCannonLobby();
        });

        s.on('live:answer-result', (result) => {
            answerPending = false;
            if (result?.lantern || result?.gameFormat === 'lucky-lanterns') {
                if (result.challengeable) showChallengeActions(result);
                else hideChallengeActions();
                return;
            }
            if (result?.cannon || result?.gameFormat === 'word-cannon') {
                stopPlayTimer();
                if (result.challengeable) showChallengeActions(result);
                else hideChallengeActions();
                window.WCB?.phoneResult(result);
                return;
            }
            playerCrewVote = null;
            const status = $('live-play-status');
            const resultEl = $('live-play-result');
            const teamLabel = isTeamMode() ? 'Team' : 'You';

            if (result.timedOut) {
                stopPlayTimer();
                spawnPlayerFeedbackBubble(false, false);
                showTimeUp(result);
                setAnswerInputsEnabled(true);
                if (result.nextQuestion && typeof result.nextQuestion === 'object') showPlayerQuestion(result.nextQuestion);
                return;
            }
            stopPlayTimer();
            if (result.challengeable) {
                playerState.progress = result.progress;
                updateOwnProgress(result.progress, TERMS_TO_WIN, false);
                spawnPlayerFeedbackBubble(false, false);
                showChallengeActions(result);
                return;
            }

            hideChallengeActions();
            playerState.progress = result.progress;
            updateOwnProgress(result.progress, TERMS_TO_WIN, result.reset);
            spawnPlayerFeedbackBubble(result.correct, result.won);

            if (result.reset) {
                if (status) status.textContent = `Wrong — ${teamLabel.toLowerCase()} back to the start!`;
                if (resultEl) {
                    resultEl.innerHTML = `<div class="live-choice wrong">The answer was <strong>${esc(result.correctTerm)}</strong>. ${teamLabel} ${teamLabel === 'Team' ? 'is' : 'are'} back at term 1.</div>`;
                    resultEl.classList.add('live-play-result--visible');
                }
            } else if (result.correct && !result.won) {
                if (status) status.textContent = `Correct! ${result.progress} / ${TERMS_TO_WIN}`;
                if (resultEl) resultEl.innerHTML = '';
            }

            if (result.won) {
                setAnswerInputsEnabled(false);
                hideCrewPanel();
                if (status) status.textContent = isTeamMode() ? 'Your team won!' : 'You won!';
            } else {
                setAnswerInputsEnabled(true);
                if (result.nextQuestion && typeof result.nextQuestion === 'object') {
                    showPlayerQuestion(result.nextQuestion);
                }
            }
        });

        s.on('live:challenge-submitted', () => {
            showChallengeWaiting();
        });

        s.on('live:challenge-resolved', (result) => {
            if (result?.lantern || result?.gameFormat === 'lucky-lanterns') {
                hideChallengeActions();
                answerPending = false;
                return;
            }
            if (result?.cannon || result?.gameFormat === 'word-cannon') {
                hideChallengeActions();
                answerPending = false;
                window.WCB?.phoneChallengeResolved(result);
                return;
            }
            applyChallengeResolved(result);
            if (result.won) {
                LiveAudio.stopGame();
                setLiveGameActive(false);
                hideCrewPanel();
                const isWinner = isTeamMode()
                    ? result.teamId === playerState?.teamId
                    : result.won;
                if (playerState && isWinner) {
                    // game-finished event follows
                }
            } else if (!result.nextQuestion) {
                setAnswerInputsEnabled(true);
            }
        });

        s.on('live:progress-update', (data) => {
            renderProgressBoard($('live-play-progress-board'), data.players || [], {
                flashId: playerState?.lastFlashId,
            });
            playerState.lastFlashId = null;
        });

        s.on('live:game-finished', (data) => {
            stopPlayTimer();
            hideTimeUp();
            // Let the last Lucky Lanterns reveal finish on screen before the podium.
            clearTimeout(llPhone.finishTimer);
            const lanternFinish = Boolean(data.lantern) || isLuckyLanternsFormat(playerState?.gameFormat);
            const wait = lanternFinish ? llPhone.revealDoneAt - Date.now() : 0;
            if (wait > 0) {
                llPhone.finishTimer = setTimeout(() => playerGameFinished(data), Math.min(wait, 9000));
                return;
            }
            playerGameFinished(data);
        });
        function playerGameFinished(data) {
            llPhone.finishTimer = null;
            llPhone.revealDoneAt = 0;
            LiveAudio.stopGame();
            setLiveGameActive(false);
            hideCrewPanel();
            const lanternWin = Boolean(data.lantern) || isLuckyLanternsFormat(playerState?.gameFormat);
            const isWinner = lanternWin
                ? (data.tiedIds || [data.winnerId]).includes(playerState?.playerId)
                : isTeamMode()
                    ? data.winnerId === playerState?.teamId
                    : data.winnerId === playerState?.playerId;
            document.body.classList.remove('live-lantern-player');
            const phone = $('live-play-lantern');
            if (phone) phone.hidden = true;
            const cannonWin = Boolean(data.cannon) || isWordCannonFormat(playerState?.gameFormat);
            if (cannonWin) window.WCB?.resetPhone();
            if (data.winnerNickname || cannonWin) {
                const myCannonTeam = (data.players || []).find((p) => p.id === playerState?.playerId)?.team;
                showLiveWinnerScreen(data.winnerNickname, cannonWin ? Boolean(data.winner) && data.winner === myCannonTeam : isWinner, {
                    cannon: cannonWin,
                    cannonData: data,
                    playerId: playerState?.playerId,
                    teamMode: isTeamMode(),
                    lantern: lanternWin,
                    ranking: data.players || [],
                    winnerId: data.winnerId,
                });
            }
            renderProgressBoard($('live-play-progress-board'), data.players || [], { winnerId: data.winnerId });
            const def = $('live-play-definition');
            if (def) def.textContent = 'Game over — wait for the host to play again, or stay for ranking.';
            setAnswerInputsEnabled(false);
                }
        s.on('live:lobby-reset', (data) => {
            clearTimeout(llPhone.finishTimer);
            llPhone.revealDoneAt = 0;
            llPhone.key = null;
            hideLiveWinnerScreen();
            const ranking = $('live-ranking-screen');
            if (ranking) ranking.hidden = true;
            setLiveGameActive(false);
            document.body.classList.remove('live-lantern-player');
            const phone = $('live-play-lantern');
            if (phone) phone.hidden = true;
            window.WCB?.resetPhone();
            hideCrewPanel();
            hideChallengeActions();
            answerPending = false;
            activeQuestionId = 0;
            playerState.progress = 0;
            updateOwnProgress(0, TERMS_TO_WIN);
            applyPlayerLobbySnapshot(data.snapshot);
            showPlayerWaiting('Waiting for the host to start…', data.snapshot);
            LiveAudio.stopGame();
            LiveAudio.startLobby();
        });

        s.on('live:player-removed', (data) => {
            sessionStorage.removeItem('ls_live_player_id');
            sessionStorage.removeItem('ls_live_player_token');
            sessionStorage.removeItem('ls_live_room_code');
            playerState = null;
            answerPending = false;
            LiveAudio.stopGame();
            LiveAudio.stopLobby();
            setLiveGameActive(false);
            if (typeof showScreen === 'function') showScreen('live-join');
            showLiveError(data.message || 'You were removed from the lobby.');
        });

        s.on('live:error', (data) => {
            answerPending = false;
            setAnswerInputsEnabled(true);
            showLiveError(data.error || 'Something went wrong.');
        });
    }

    function setAnswerInputsEnabled(enabled) {
        const input = $('live-play-answer');
        const btn = $('live-play-submit');
        const choices = $('live-play-choices');
        const typeSection = $('live-play-type-section');
        const captainBtn = $('live-play-captain-submit');
        const crewVoteBtn = $('live-play-crew-vote-btn');
        if (input && !typeSection?.hidden) input.disabled = !enabled;
        if (btn && !typeSection?.hidden && !btn.hidden) btn.disabled = !enabled;
        if (captainBtn && playerIsCaptain && !captainBtn.hidden) captainBtn.disabled = !enabled;
        if (crewVoteBtn && !crewVoteBtn.hidden) crewVoteBtn.disabled = !enabled;
        if (choices && !choices.hidden) {
            choices.querySelectorAll('button').forEach((b) => { b.disabled = !enabled; });
        }
    }

    const ANSWER_MODE_LABELS = {
        recognise: 'Recognise (choose)',
        realise: 'Realise (type)',
        randomise: 'Randomise',
    };

    const GAME_FORMAT_LABELS = {
        race: 'Solo race',
        'captain-crew': 'Captain & Crew',
        'hot-spark-relay': 'Hot Spark Relay',
        'lucky-lanterns': 'Lucky Lanterns',
        'word-cannon': 'Word Cannon Battle',
    };

    function answerModeLabel(mode) {
        return ANSWER_MODE_LABELS[mode] || ANSWER_MODE_LABELS.randomise;
    }

    function updateHostModeLabel() {
        const modeEl = $('live-host-answer-mode');
        if (!modeEl || !hostState) return;
        modeEl.hidden = false;
        modeEl.textContent = usesTeamLobbyValue(hostState.gameFormat)
            ? `Format: ${gameFormatLabel(hostState.gameFormat, hostState.teamAssignment)} · ${answerModeLabel(hostState.answerMode)}`
            : `Mode: ${answerModeLabel(hostState.answerMode)} · ${gameFormatLabel(hostState.gameFormat)}`;
        syncLanternLobbyTheme();
        syncCannonLobbyTheme();
    }

    function syncHostLobbySettingsUI(snap, seq) {
        const panel = $('live-host-lobby-settings');
        if (!panel) return;
        const phase = hostState?.phase || snap?.phase || 'lobby';
        const canEdit = phase === 'lobby' || phase === 'finished';
        panel.hidden = !canEdit || !hostState?.code;
        if (!canEdit) return;
        // A slower settings echo must not put an older round count back in the box.
        if (settingsSnapshotIsStale(seq)) return;

        const format = snap?.gameFormat || hostState?.gameFormat || 'race';
        const teamAssignment = snap?.teamAssignment || hostState?.teamAssignment || 'random';
        const answerMode = snap?.answerMode || hostState?.answerMode || 'randomise';

        document.querySelectorAll('input[name="live-lobby-format"]').forEach((el) => {
            el.checked = el.value === format;
        });
        document.querySelectorAll('input[name="live-lobby-team"]').forEach((el) => {
            el.checked = el.value === teamAssignment;
        });
        document.querySelectorAll('input[name="live-lobby-answer"]').forEach((el) => {
            el.checked = el.value === answerMode;
        });
        const teamRow = $('live-host-lobby-team-row');
        if (teamRow) teamRow.hidden = !usesTeamLobbyValue(format);
        const lanternRow = $('live-host-lobby-lantern-row');
        if (lanternRow) lanternRow.hidden = format !== 'lucky-lanterns';
        const cannonRow = $('live-host-lobby-cannon-row');
        if (cannonRow) cannonRow.hidden = !isWordCannonFormat(format);
        const minutesSelect = $('live-lobby-game-minutes');
        if (minutesSelect && document.activeElement !== minutesSelect) {
            const minutes = String(snap?.gameMinutes || hostState?.gameMinutes || 5);
            if (!minutesSelect.querySelector(`option[value="${minutes}"]`)) {
                const opt = document.createElement('option');
                opt.value = minutes;
                opt.textContent = `${minutes} minutes`;
                minutesSelect.appendChild(opt);
            }
            minutesSelect.value = minutes;
        }
        const roundsInput = $('live-lobby-rounds');
        if (roundsInput && document.activeElement !== roundsInput) {
            roundsInput.value = String(snap?.lanternRounds || hostState?.lanternRounds || 10);
        }
        syncQuestionTimeUI(format, snap && 'questionSeconds' in snap ? snap.questionSeconds : hostState?.questionSeconds);
    }

    /** Host keeps the chosen seconds; '' means each format's own default (Lucky Lanterns 20 s, races untimed). */
    function applyHostTiming(src) {
        if (!hostState || !src) return;
        if ('questionSeconds' in src) hostState.questionSeconds = src.questionSeconds ?? null;
        if ('questionTimeSec' in src) hostState.questionTimeSec = src.questionTimeSec ?? null;
    }

    function syncQuestionTimeUI(format, seconds) {
        const select = $('live-lobby-question-time');
        if (!select) return;
        const lantern = format === 'lucky-lanterns';
        const cannon = isWordCannonFormat(format);
        const defaultOption = select.querySelector('[data-default-option]');
        if (defaultOption) defaultOption.textContent = lantern || cannon ? 'Default (20 seconds)' : 'Default (no time limit)';
        if (document.activeElement !== select) {
            const value = seconds ? String(seconds) : '';
            if (value && !select.querySelector(`option[value="${value}"]`)) {
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = `${value} seconds`;
                select.appendChild(opt);
            }
            select.value = value;
        }
        const hint = $('live-lobby-question-time-hint');
        if (hint) {
            const timed = Boolean(select.value);
            hint.textContent = lantern
                ? 'Time to answer before the lanterns open. Lantern picks keep their own 12 s.'
                : cannon
                ? 'Time to answer before the cannons fire. Answering in the first third of the time is a FAST sure hit.'
                : !timed
                    ? 'No limit: players take as long as they need.'
                    : format === 'hot-spark-relay'
                        ? "Time's up: no progress lost, a new question appears and the spark passes to the next teammate."
                        : format === 'captain-crew'
                            ? "Time's up before the captain submits: no progress lost, the crew gets a new question."
                            : "Time's up: no progress lost, a new question appears.";
        }
    }

    function emitHostLobbySettings() {
        if (!hostState || (hostState.phase !== 'lobby' && hostState.phase !== 'finished')) return;
        const gameFormat = document.querySelector('input[name="live-lobby-format"]:checked')?.value
            || hostState.gameFormat
            || 'race';
        let teamAssignment = document.querySelector('input[name="live-lobby-team"]:checked')?.value
            || hostState.teamAssignment
            || 'random';
        // Switching into a team format defaults to random so Start stays usable.
        if (usesTeamLobbyValue(gameFormat) && !document.querySelector('input[name="live-lobby-team"]:checked')) {
            teamAssignment = 'random';
            document.querySelectorAll('input[name="live-lobby-team"]').forEach((el) => {
                el.checked = el.value === 'random';
            });
        }
        if (!usesTeamLobbyValue(gameFormat)) teamAssignment = 'random';
        const answerMode = document.querySelector('input[name="live-lobby-answer"]:checked')?.value
            || hostState.answerMode
            || 'randomise';
        const lanternRounds = Number($('live-lobby-rounds')?.value || hostState.lanternRounds || 10);
        const timeValue = $('live-lobby-question-time')?.value || '';
        const questionSeconds = timeValue ? Number(timeValue) : null;
        hostState.questionSeconds = questionSeconds;
        syncQuestionTimeUI(gameFormat, questionSeconds);
        const gameMinutes = Number($('live-lobby-game-minutes')?.value || hostState.gameMinutes || 5);
        hostState.gameMinutes = gameMinutes;
        const settingsSeq = ++lobbySettingsSeq;
        ensureSocket().emit('live:set-settings', { gameFormat, teamAssignment, answerMode, lanternRounds, questionSeconds, gameMinutes, settingsSeq });
    }

    function getFullscreenElement() {
        return document.fullscreenElement
            || document.webkitFullscreenElement
            || document.msFullscreenElement
            || null;
    }

    function requestLiveFullscreen(el) {
        const node = el || document.documentElement;
        const req = node.requestFullscreen
            || node.webkitRequestFullscreen
            || node.msRequestFullscreen;
        if (!req) return Promise.reject(new Error('Fullscreen is not supported on this device.'));
        return Promise.resolve(req.call(node));
    }

    function exitLiveFullscreen() {
        const exit = document.exitFullscreen
            || document.webkitExitFullscreen
            || document.msExitFullscreen;
        if (!exit || !getFullscreenElement()) return Promise.resolve();
        return Promise.resolve(exit.call(document));
    }

    function toggleLiveFullscreen(targetEl) {
        if (getFullscreenElement()) return exitLiveFullscreen();
        return requestLiveFullscreen(targetEl || document.documentElement);
    }

    function updateFullscreenButtons() {
        const active = Boolean(getFullscreenElement());
        const label = active ? 'Exit full' : 'Fullscreen';
        const icon = active ? 'fa-compress' : 'fa-expand';
        [['live-host-fullscreen-btn', true], ['live-play-fullscreen-btn', false]].forEach(([id, withText]) => {
            const btn = $(id);
            if (!btn) return;
            btn.innerHTML = withText
                ? `<i class="fa-solid ${icon}"></i> ${label}`
                : `<i class="fa-solid ${icon}"></i>`;
            btn.title = active ? 'Exit fullscreen' : 'Fullscreen';
        });
    }

    function gameFormatLabel(format, teamAssignment) {
        if (usesTeamLobbyValue(format)) {
            const mode = teamAssignment === 'pick' ? 'players choose teams' : 'random teams';
            return `${GAME_FORMAT_LABELS[format] || GAME_FORMAT_LABELS['captain-crew']} · ${mode}`;
        }
        return GAME_FORMAT_LABELS[format] || GAME_FORMAT_LABELS.race;
    }

    function hideCrewPanel() {
        const panel = $('live-play-crew-panel');
        const role = $('live-play-crew-role');
        if (panel) panel.hidden = true;
        if (role) role.hidden = true;
    }

    function updateCrewVoteUI(crew) {
        const votesEl = $('live-play-crew-votes');
        const submitBtn = $('live-play-captain-submit');
        const panel = $('live-play-crew-panel');
        if (!votesEl || !panel) return;

        panel.hidden = false;
        const voteParts = Object.entries(crew.votes || {})
            .map(([term, count]) => `${count}× ${term}`)
            .join(' · ');
        const progress = `${crew.votedCount || 0} / ${crew.crewSize || 0} voted`;
        votesEl.textContent = voteParts
            ? `${progress} — ${voteParts}`
            : `${progress} — discuss, then vote`;

        if (submitBtn) {
            submitBtn.hidden = !crew.isCaptain;
            captainSuggestedAnswer = crew.suggestedAnswer || null;
            if (crew.isCaptain) {
                submitBtn.textContent = crew.suggestedAnswer
                    ? `Submit team answer`
                    : 'Submit team answer';
                const input = $('live-play-answer');
                if (input && crew.suggestedAnswer && !input.value.trim() && !input.dataset.captainTouched) {
                    input.placeholder = `Suggested: ${crew.suggestedAnswer}`;
                }
            }
        }

        const container = $('live-play-choices');
        if (container) {
            container.querySelectorAll('button').forEach((btn) => {
                btn.classList.toggle('crew-voted', btn.textContent === playerCrewVote);
            });
        }
    }

    function updateCrewRoleUI(q) {
        const role = $('live-play-crew-role');
        if (!role) return;
        if (!isCaptainCrewMode()) {
            role.hidden = true;
            return;
        }
        role.hidden = false;
        const team = q.teamName || playerState?.teamName || 'Your team';
        if (q.isCaptain) {
            role.textContent = `${team} — You are the captain this round`;
        } else {
            role.textContent = `${team} — Captain: ${q.captainNickname || '…'} — ${q.inputMode === 'choice' ? 'vote below' : 'type & vote below'}`;
        }
    }

    function updateProgressLabel() {
        const label = document.querySelector('.live-own-progress-label > span:first-child');
        if (label) label.textContent = isTeamMode() ? 'Team progress' : 'Your progress';
    }

    function applyQuestionInputMode(inputMode, q = null) {
        const choiceMode = inputMode === 'choice';
        const crewMode = q && (q.gameFormat === 'captain-crew' || isCaptainCrewMode());
        const typeSection = $('live-play-type-section');
        const typeHint = $('live-play-type-hint');
        const submitBtn = $('live-play-submit');
        const crewVoteBtn = $('live-play-crew-vote-btn');
        const captainSubmit = $('live-play-captain-submit');

        if (typeSection) {
            // Captains keep a type box so they can override the suggested crew answer.
            typeSection.hidden = choiceMode && !(crewMode && q?.isCaptain);
        }
        if (typeHint) {
            if (crewMode && q?.isCaptain) {
                typeHint.textContent = choiceMode
                    ? 'Type your own answer, or submit the crew suggestion'
                    : 'Type the team answer (edit suggested text if needed)';
            } else if (crewMode && !choiceMode) {
                typeHint.textContent = 'Type your answer, then vote';
            } else {
                typeHint.textContent = choiceMode ? '' : 'Type the word';
            }
        }

        if (crewMode) {
            if (submitBtn) submitBtn.hidden = true;
            if (crewVoteBtn) crewVoteBtn.hidden = choiceMode || Boolean(q?.isCaptain);
            if (captainSubmit) captainSubmit.hidden = !q?.isCaptain;
        } else {
            if (submitBtn) submitBtn.hidden = choiceMode;
            if (crewVoteBtn) crewVoteBtn.hidden = true;
            if (captainSubmit) captainSubmit.hidden = true;
        }
    }

    function renderChoiceButtons(choices, options = {}) {
        const container = $('live-play-choices');
        if (!container) return;
        const crewMode = Boolean(options.crewMode);
        if (!choices || !choices.length) {
            container.innerHTML = '';
            container.hidden = true;
            return;
        }
        container.hidden = false;
        container.innerHTML = choices.map((term, i) =>
            `<button type="button" class="live-answer-btn live-answer-btn--${i % 4}${playerCrewVote === term ? ' crew-voted' : ''}"></button>`
        ).join('');
        container.querySelectorAll('button').forEach((btn, i) => {
            btn.textContent = choices[i];
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                if (crewMode) {
                    if (playerIsCaptain) {
                        playerCrewVote = choices[i];
                        submitCaptainAnswer();
                    } else {
                        submitCrewVote(choices[i]);
                    }
                    return;
                }
                submitPlayerAnswer(choices[i]);
            });
        });
    }

    function submitCrewVoteFromInput() {
        const input = $('live-play-answer');
        submitCrewVote(input?.value || '');
    }

    function submitCrewVote(choiceText) {
        if (!playerState || answerPending) return;
        const text = String(choiceText || '').trim();
        if (!text) return;
        playerCrewVote = text;
        showLiveError('');
        ensureSocket().emit('live:crew-vote', { text, questionId: activeQuestionId || undefined });
        const container = $('live-play-choices');
        if (container) {
            container.querySelectorAll('button').forEach((btn) => {
                btn.classList.toggle('crew-voted', btn.textContent === text);
            });
        }
    }

    function submitCaptainAnswer() {
        if (!playerState || answerPending || !playerIsCaptain) return;
        const input = $('live-play-answer');
        const typed = (input?.value || '').trim();
        const text = typed || playerCrewVote || captainSuggestedAnswer || '';
        if (!text) {
            showLiveError('Type an answer, pick a crew vote, or wait for a suggested answer.');
            return;
        }
        showLiveError('');
        answerPending = true;
        setAnswerInputsEnabled(false);
        ensureSocket().emit('live:submit-answer', { text, questionId: activeQuestionId || undefined });
    }

    function submitPlayerAnswer(choiceText) {
        if (!playerState || answerPending) return;
        const input = $('live-play-answer');
        const fromChoice = typeof choiceText === 'string' ? choiceText.trim() : '';
        const text = (fromChoice || (input?.value || '')).trim();
        if (!text) {
            showLiveError(fromChoice ? 'Choose an answer first.' : 'Type an answer first.');
            return;
        }
        showLiveError('');
        answerPending = true;
        setAnswerInputsEnabled(false);
        ensureSocket().emit('live:submit-answer', { text, questionId: activeQuestionId || undefined });
    }

    function showPlayerWaiting(msg, snap) {
        const def = $('live-play-definition');
        const status = $('live-play-status');
        const pickLobby = isCaptainCrewPickLobby(snap);
        if (def) {
            def.hidden = pickLobby;
            if (!pickLobby) def.textContent = msg;
        }
        if (pickLobby) {
            applyPlayerLobbySnapshot(snap || playerState?.lastSnapshot);
            renderPlayerRosterTiles([]);
            if (status) {
                status.textContent = playerState?.teamName
                    ? `On ${playerState.teamName} — waiting for the host…`
                    : 'Join a team below, then wait for the host…';
            }
        } else {
            $('live-play-team-lobby').hidden = true;
            if (status) status.textContent = pickLobby ? '' : msg;
            const roster = snap?.players || playerState?.lastSnapshot?.players || [];
            renderPlayerRosterTiles(roster);
        }
        setAnswerInputsEnabled(false);
        $('live-play-result').innerHTML = '';
        renderChoiceButtons([]);
        applyQuestionInputMode('typed');
        hideCrewPanel();
        const crewVoteBtn = $('live-play-crew-vote-btn');
        if (crewVoteBtn) crewVoteBtn.hidden = true;
        if ($('live-play-type-section')) $('live-play-type-section').hidden = true;
        stopPlayTimer();
        hideTimeUp();
        syncPlayerLanternLobby(msg, snap);
        syncPlayerCannonLobby(msg, snap);
    }

    // ---- per-question countdown for the race formats (Lucky Lanterns has its own ring) ----
    let playTimerInterval = null;
    let playTimerDeadline = 0;
    let playTimerTotal = 0;
    let playTimeUpTimer = null;

    function stopPlayTimer() {
        clearInterval(playTimerInterval);
        playTimerInterval = null;
        const el = $('live-play-timer');
        if (el) el.hidden = true;
    }

    function paintPlayTimer() {
        const el = $('live-play-timer');
        if (!el) return;
        const left = Math.max(0, playTimerDeadline - Date.now());
        const secs = Math.ceil(left / 1000);
        const num = el.querySelector('.live-play-timer-num');
        const bar = el.querySelector('.live-play-timer-bar');
        if (num) num.textContent = `${secs}s`;
        if (bar) bar.style.transform = `scaleX(${playTimerTotal ? Math.max(0, Math.min(1, left / playTimerTotal)).toFixed(3) : 0})`;
        el.classList.toggle('is-low', secs <= 5);
        if (left <= 0) {
            clearInterval(playTimerInterval);
            playTimerInterval = null;
        }
    }

    /** Server sends time left (not just a wall-clock deadline) so a phone with a wrong clock still counts correctly. */
    function startPlayTimer(q) {
        stopPlayTimer();
        if (!q || q.timeLeftMs == null || !q.timeLimitSec) return;
        playTimerTotal = Number(q.timeLimitSec) * 1000;
        playTimerDeadline = Date.now() + Math.max(0, Number(q.timeLeftMs) || 0);
        const el = $('live-play-timer');
        if (!el) return;
        el.hidden = false;
        paintPlayTimer();
        playTimerInterval = setInterval(paintPlayTimer, 200);
    }

    function showTimeUp(result) {
        const el = $('live-play-timeup');
        if (!el) return;
        const relay = isHotSparkRelayMode();
        el.innerHTML = `⏰ Time's up! It was <strong>${esc(result.correctTerm || '')}</strong>. ${relay ? 'The spark moves on.' : 'New question!'}`;
        el.hidden = false;
        clearTimeout(playTimeUpTimer);
        playTimeUpTimer = setTimeout(() => { el.hidden = true; }, 2800);
    }

    function hideTimeUp() {
        clearTimeout(playTimeUpTimer);
        const el = $('live-play-timeup');
        if (el) el.hidden = true;
    }

    function showPlayerQuestion(q) {
        if (!q) return;
        if (q.questionId != null && q.questionId < activeQuestionId) return;
        if (q.questionId != null) activeQuestionId = q.questionId;
        answerPending = false;
        hideChallengeActions();
        currentQuestion = q;
        playerState.gameFormat = q.gameFormat || playerState?.gameFormat || 'race';
        playerState.teamId = q.teamId || playerState?.teamId || null;
        playerState.teamName = q.teamName || playerState?.teamName || null;
        playerIsCaptain = Boolean(q.isCaptain);
        playerIsRelayActive = Boolean(q?.relay?.isActivePlayer);
        playerCrewVote = null;
        setLiveGameActive(true);
        updateProgressLabel();
        const def = $('live-play-definition');
        const input = $('live-play-answer');
        const status = $('live-play-status');
        const crewMode = q.gameFormat === 'captain-crew' || isCaptainCrewMode();
        const relayMode = q.gameFormat === 'hot-spark-relay' || isHotSparkRelayMode();
        const lanternMode = q.gameFormat === 'lucky-lanterns' || isLuckyLanternsFormat(playerState?.gameFormat);
        const choiceMode = q.inputMode === 'choice';
        const cannonMode = q.gameFormat === 'word-cannon' || isWordCannonFormat(playerState?.gameFormat);
        if (lanternMode) document.body.classList.add('live-lantern-player');
        if (cannonMode) document.body.classList.add('live-cannon-player');
        if (lanternMode || cannonMode) stopPlayTimer();
        else startPlayTimer(q);
        if (def) def.textContent = q.definition;
        if (def) def.hidden = false;
        $('live-play-team-lobby').hidden = true;
        renderPlayerRosterTiles([]);
        if (status) {
            if (crewMode) {
                const modeHint = choiceMode ? 'crew votes, captain submits' : 'crew types & votes, captain submits';
                status.textContent = `Term ${(q.progress || 0) + 1} of ${q.termsToWin || TERMS_TO_WIN} — ${modeHint}`;
            } else if (relayMode) {
                const holder = q?.relay?.activeNickname || 'teammate';
                if (q?.relay?.isActivePlayer) {
                    const modeHint = choiceMode ? 'your turn: pick the matching term' : 'your turn: type the matching term';
                    status.textContent = `Term ${(q.progress || 0) + 1} of ${q.termsToWin || TERMS_TO_WIN} — ${modeHint}`;
                } else {
                    status.textContent = `Term ${(q.progress || 0) + 1} of ${q.termsToWin || TERMS_TO_WIN} — waiting for ${holder}`;
                }
            } else if (lanternMode) {
                const modeHint = choiceMode ? 'Tap the matching word' : 'Type the word';
                status.textContent = `Round ${q.round || 1} of ${q.rounds || q.termsToWin || 10} — ${modeHint}`;
            } else if (cannonMode) {
                status.textContent = q.suddenDeath
                    ? 'Sudden death! Fastest correct answer fires the LAST SHOT.'
                    : 'Answer fast: faster answers aim better!';
            } else {
                const modeHint = choiceMode ? 'Tap the matching term' : 'Type the matching term';
                status.textContent = `Term ${(q.progress || 0) + 1} of ${q.termsToWin || TERMS_TO_WIN} — ${modeHint}`;
            }
        }
        if (!lanternMode && !cannonMode) updateOwnProgress(q.progress || 0, q.termsToWin || TERMS_TO_WIN);
        if (input) {
            input.value = '';
            delete input.dataset.captainTouched;
            if (captainSuggestedAnswer) input.placeholder = `Suggested: ${captainSuggestedAnswer}`;
            else if (relayMode && !q?.relay?.isActivePlayer) input.placeholder = `Waiting for ${q?.relay?.activeNickname || 'teammate'}…`;
            else input.placeholder = 'Type the word';
        }
        applyQuestionInputMode(q.inputMode, q);
        if (choiceMode) {
            renderChoiceButtons(q.choices || [], { crewMode });
            if (crewMode) {
                const panel = $('live-play-crew-panel');
                if (panel) panel.hidden = false;
                updateCrewRoleUI(q);
                updateCrewVoteUI(q.crew || { votes: {}, votedCount: 0, crewSize: 0, isCaptain: q.isCaptain, suggestedAnswer: null });
            } else {
                hideCrewPanel();
            }
        } else {
            renderChoiceButtons([]);
            if (crewMode) {
                const panel = $('live-play-crew-panel');
                if (panel) panel.hidden = false;
                updateCrewRoleUI(q);
                updateCrewVoteUI(q.crew || { votes: {}, votedCount: 0, crewSize: 0, isCaptain: q.isCaptain, suggestedAnswer: null });
            } else {
                hideCrewPanel();
            }
        }
        const canAnswerNow = relayMode ? Boolean(q?.relay?.isActivePlayer) : true;
        setAnswerInputsEnabled(canAnswerNow);
        if (canAnswerNow && !choiceMode && input) input.focus();
        $('live-play-result').innerHTML = '';
    }

    async function loadWordSetsForHost(options = {}) {
        const force = Boolean(options.force);
        const sel = $('live-host-wordset');
        if (!sel) return;
        if (!isHostSignedIn()) {
            hostSelectedWordSetId = '';
            hostWordSetsLoadedForUser = null;
            sel.innerHTML = '<option value="">— Select a saved set —</option>';
            sel.disabled = true;
            const hint = $('live-host-wordset-hint');
            if (hint) { hint.hidden = false; hint.textContent = 'Sign in to load your saved word sets.'; }
            return;
        }

        const userId = window.authState?.user?.id;
        // Avoid wiping a teacher's selection on every auth refresh / Create click.
        if (!force && hostWordSetsLoadedForUser === userId && sel.options.length > 1) {
            if (hostSelectedWordSetId) sel.value = hostSelectedWordSetId;
            sel.disabled = false;
            return;
        }

        const previous = hostSelectedWordSetId || sel.value;
        sel.innerHTML = '<option value="">— Select a saved set —</option>';
        sel.disabled = false;
        try {
            const res = await fetch('/api/word-sets', { credentials: 'same-origin' });
            if (!res.ok) {
                const hint = $('live-host-wordset-hint');
                if (hint) { hint.hidden = false; hint.textContent = 'Could not load word sets. Try signing in again.'; }
                return;
            }
            const data = await res.json();
            const sets = data.sets || [];
            if (!sets.length) {
                const hint = $('live-host-wordset-hint');
                if (hint) { hint.hidden = false; hint.textContent = 'No saved sets yet — create one in Word Sets, or paste a glossary.'; }
            } else {
                const hint = $('live-host-wordset-hint');
                if (hint && !hostSelectedWordSetId) hint.hidden = true;
            }
            for (const s of sets) {
                const opt = document.createElement('option');
                opt.value = String(s.id);
                const meta = [s.category, s.class_name].filter(Boolean).join(' · ');
                opt.textContent = meta
                    ? `${s.name} (${s.item_count || 0}) — ${meta}`
                    : `${s.name} (${s.item_count || 0})`;
                sel.appendChild(opt);
            }
            hostWordSetsLoadedForUser = userId;
            if (previous && [...sel.options].some((o) => o.value === previous)) {
                sel.value = previous;
                hostSelectedWordSetId = previous;
            }
        } catch {
            const hint = $('live-host-wordset-hint');
            if (hint) { hint.hidden = false; hint.textContent = 'Could not load word sets.'; }
        }
    }

    async function onHostWordSetSelected() {
        const setId = String($('live-host-wordset')?.value || '').trim();
        hostSelectedWordSetId = setId;
        const hint = $('live-host-wordset-hint');
        const paste = $('live-host-glossary');
        if (!setId) {
            if (hint) hint.hidden = true;
            return;
        }
        try {
            const res = await fetch(`/api/word-sets/${encodeURIComponent(setId)}`, { credentials: 'same-origin' });
            const data = await res.json();
            if (!res.ok || !data.set) {
                if (hint) { hint.hidden = false; hint.textContent = data.error || 'Could not open that word set.'; }
                return;
            }
            const items = data.set.items || [];
            const lines = items
                .map((i) => {
                    const term = String(i.term || '').trim();
                    const def = String(i.definition || i.def || '').trim();
                    if (!term) return '';
                    return def ? `${term} = ${def}` : term;
                })
                .filter(Boolean);
            const withDefs = items.filter((i) => String(i.term || '').trim() && String(i.definition || i.def || '').trim()).length;
            if (paste) paste.value = lines.join('\n');
            if (hint) {
                hint.hidden = false;
                hint.textContent = withDefs >= 12
                    ? `Loaded ${withDefs} term/definition pairs — ready to create the room.`
                    : `This set has ${withDefs} pairs with definitions (need 12+). Edit below or pick another set.`;
            }
        } catch {
            if (hint) { hint.hidden = false; hint.textContent = 'Failed to load that word set.'; }
        }
    }

    function readHostSetupForm() {
        const source = document.querySelector('input[name="live-source"]:checked')?.value || 'builtin';
        const level = $('live-host-level')?.value || 'intermediate';
        // Format / answer mode are chosen on the host lobby screen after create.
        const gameFormat = 'race';
        const teamAssignment = 'random';
        const answerMode = 'randomise';
        const setId = String(hostSelectedWordSetId || $('live-host-wordset')?.value || '').trim();
        const terms = String($('live-host-glossary')?.value || '');
        return { source, level, gameFormat, teamAssignment, answerMode, setId, terms };
    }

    function updateHostAuthUI() {
        const signedIn = isHostSignedIn();
        if ($('live-host-setup-form')) $('live-host-setup-form').hidden = !signedIn;
    }

    function onAuthChanged() {
        updateHostAuthUI();
        if (isHostSignedIn()) loadWordSetsForHost({ force: false });
        else {
            hostSelectedWordSetId = '';
            hostWordSetsLoadedForUser = null;
        }
    }

    async function closePreviousHostRoom() {
        const code = sessionStorage.getItem('ls_live_host_code');
        const hostToken = sessionStorage.getItem('ls_live_host_token');
        if (!code || !hostToken) {
            clearStoredHostRoom();
            hostState = null;
            return;
        }
        try {
            if (socket?.connected && hostState?.code === code) {
                await new Promise((resolve) => {
                    const done = () => resolve();
                    socket.once('live:room-closed', done);
                    socket.emit('live:close-room');
                    setTimeout(done, 800);
                });
            } else {
                await fetch('/api/live/destroy', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, hostToken }),
                });
            }
        } catch { /* ignore */ }
        clearStoredHostRoom();
        hostState = null;
        stopHostLobbyPoll();
        setHostRaceMode(false);
        hideLiveWinnerScreen();
        const ranking = $('live-ranking-screen');
        if (ranking) ranking.hidden = true;
    }

    async function createHostRoom() {
        showLiveError('');
        // Snapshot the form BEFORE auth refresh / room teardown — those can rebuild the
        // word-set <select> and clear the teacher's choice mid-click.
        const setup = readHostSetupForm();
        const body = {
            source: setup.source,
            level: setup.level,
            gameFormat: setup.gameFormat,
            teamAssignment: setup.teamAssignment,
            answerMode: setup.answerMode,
        };
        if (setup.source === 'wordset') {
            const pasted = setup.terms.trim();
            if (pasted) {
                body.source = 'paste';
                body.terms = pasted;
            } else if (setup.setId) {
                body.setId = Number(setup.setId);
            } else {
                showLiveError('Choose a Word Set.');
                return;
            }
        } else if (setup.source === 'paste') {
            body.terms = setup.terms;
        }

        await ensureAuthLoaded();
        updateHostAuthUI();
        if (!isHostSignedIn()) {
            showLiveError('Sign in to host Live Spark.');
            if (typeof openAuthModal === 'function') openAuthModal('login');
            return;
        }
        await closePreviousHostRoom();

        const btn = $('live-host-create-btn');
        if (btn) btn.disabled = true;
        try {
            const res = await fetch('/api/live/create', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not create room.');

            hostState = {
                code: data.code,
                hostToken: data.hostToken,
                phase: 'lobby',
                answerMode: data.answerMode || setup.answerMode,
                gameFormat: data.gameFormat || setup.gameFormat,
                teamAssignment: data.teamAssignment || setup.teamAssignment,
                minPlayers: data.minPlayers,
            };
            sessionStorage.setItem('ls_live_host_code', data.code);
            sessionStorage.setItem('ls_live_host_token', data.hostToken);

            $('live-host-code').textContent = data.code;
            updateHostModeLabel();
            setHostJoinArtifacts(data.code, buildJoinUrl(data.code));

            $('live-host-setup-form').hidden = true;
            $('live-host-room-panel').hidden = false;
            syncHostLobbySettingsUI({
                phase: 'lobby',
                gameFormat: hostState.gameFormat,
                teamAssignment: hostState.teamAssignment,
                answerMode: hostState.answerMode,
            });
            const playAgain = $('live-host-play-again');
            if (playAgain) playAgain.hidden = true;
            const startBtn = $('live-host-start');
            if (startBtn) startBtn.hidden = false;

            bindHostSocket();
            emitHostJoin();
            startHostLobbyPoll(hostState.code);
            LiveAudio.startLobby();
        } catch (err) {
            showLiveError(err.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function resumeHostRoomAsync() {
        const code = sessionStorage.getItem('ls_live_host_code');
        const hostToken = sessionStorage.getItem('ls_live_host_token');
        if (!code || !hostToken) return false;

        try {
            const res = await fetch(`/api/live/room/${encodeURIComponent(code)}`);
            if (!res.ok) {
                clearStoredHostRoom();
                return false;
            }
            const snap = await res.json();
            hostState = {
                code,
                hostToken,
                phase: snap.phase || 'lobby',
                answerMode: snap.answerMode || 'randomise',
                gameFormat: snap.gameFormat || 'race',
                teamAssignment: snap.teamAssignment || 'random',
                minPlayers: snap.minPlayers,
            };
            $('live-host-code').textContent = code;
            updateHostModeLabel();
            const joinUrl = buildJoinUrl(code);
            setHostJoinArtifacts(code, joinUrl);
            $('live-host-setup-form').hidden = true;
            $('live-host-room-panel').hidden = false;
            syncHostLobbySettingsUI({
                phase: hostState.phase,
                gameFormat: hostState.gameFormat,
                teamAssignment: hostState.teamAssignment,
                answerMode: hostState.answerMode,
            });
            bindHostSocket();
            emitHostJoin();
            startHostLobbyPoll(code);
            if (hostState.phase !== 'playing') LiveAudio.startLobby();
            return true;
        } catch {
            clearStoredHostRoom();
            return false;
        }
    }

    async function openHost(options = {}) {
        const fresh = Boolean(options.fresh);
        showLiveError('');
        LiveAudio.stopAll();
        if ($('live-host-setup-form')) $('live-host-setup-form').hidden = true;
        $('live-host-room-panel').hidden = true;

        await ensureAuthLoaded();
        updateHostAuthUI();

        if (!isHostSignedIn()) {
            clearStoredHostRoom();
            if (typeof showScreen === 'function') showScreen('live-host');
            if (typeof openAuthModal === 'function') openAuthModal('login');
            return;
        }

        if (fresh) {
            await closePreviousHostRoom();
            hostSelectedWordSetId = '';
            hostWordSetsLoadedForUser = null;
            $('live-host-room-panel').hidden = true;
            $('live-host-setup-form').hidden = false;
            applyGlossaryPrefill();
            await loadWordSetsForHost({ force: true });
        } else {
            const resumed = await resumeHostRoomAsync();
            if (!resumed) {
                $('live-host-room-panel').hidden = true;
                $('live-host-setup-form').hidden = false;
                applyGlossaryPrefill();
                await loadWordSetsForHost({ force: true });
            }
        }
        if (typeof showScreen === 'function') showScreen('live-host');
        if (typeof setAppHash === 'function') setAppHash('live/host');
    }

    async function openHostWithGlossary(terms, options = {}) {
        if (terms) sessionStorage.setItem('ls_live_prefill_glossary', terms);
        await openHost({ ...options, fresh: options.fresh !== false });
    }

    async function joinRoom() {
        showLiveError('');
        const code = ($('live-join-code')?.value || '').trim().toUpperCase();
        const nickname = ($('live-join-nickname')?.value || '').trim();
        if (!code || code.length < 4) { showLiveError('Enter a 4-letter room code.'); return; }
        if (!nickname) { showLiveError('Enter a nickname.'); return; }

        const btn = $('live-join-btn');
        if (btn) btn.disabled = true;
        try {
            const res = await fetch('/api/live/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, nickname }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not join.');

            sessionStorage.setItem('ls_live_player_id', data.playerId);
            sessionStorage.setItem('ls_live_player_token', data.playerToken);
            sessionStorage.setItem('ls_live_room_code', data.code);
            sessionStorage.setItem('ls_live_nickname', data.nickname);

            playerState = {
                playerId: data.playerId,
                playerToken: data.playerToken,
                code: data.code,
                nickname: data.nickname,
                progress: 0,
                gameFormat: data.snapshot?.gameFormat || 'race',
                teamAssignment: data.snapshot?.teamAssignment || 'random',
                teamId: null,
                teamName: null,
            };

            if (typeof showScreen === 'function') showScreen('live-play');
            openPlay();
        } catch (err) {
            showLiveError(err.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function normalizeJoinCode(raw) {
        return String(raw || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z]/g, '')
            .slice(0, 4);
    }

    function applyJoinCodePrefill(code) {
        const input = $('live-join-code');
        const hint = $('live-join-code-hint');
        const clean = normalizeJoinCode(code);
        if (!input) return false;
        if (clean.length === 4) {
            input.value = clean;
            input.readOnly = true;
            input.setAttribute('aria-readonly', 'true');
            input.classList.add('live-join-code--locked');
            sessionStorage.setItem('ls_live_join_code_prefill', clean);
            if (hint) {
                hint.hidden = false;
                hint.textContent = 'Room code filled from your link — just enter your nickname.';
            }
            return true;
        }
        input.readOnly = false;
        input.removeAttribute('aria-readonly');
        input.classList.remove('live-join-code--locked');
        sessionStorage.removeItem('ls_live_join_code_prefill');
        if (hint) {
            hint.hidden = true;
            hint.textContent = '';
        }
        return false;
    }

    function openJoin() {
        showLiveError('');
        const fromUrl = getQueryParam('code');
        const fromStore = sessionStorage.getItem('ls_live_join_code_prefill');
        const prefilled = applyJoinCodePrefill(fromUrl || fromStore || '');
        if (typeof showScreen === 'function') showScreen('live-join');
        requestAnimationFrame(() => {
            if (prefilled) $('live-join-nickname')?.focus();
            else $('live-join-code')?.focus();
        });
    }

    function openPlay() {
        showLiveError('');
        const playerId = sessionStorage.getItem('ls_live_player_id');
        const playerToken = sessionStorage.getItem('ls_live_player_token');
        const code = sessionStorage.getItem('ls_live_room_code');
        if (!playerId || !playerToken || !code) {
            if (typeof showScreen === 'function') showScreen('live-join');
            return;
        }
        playerState = {
            playerId,
            playerToken,
            code,
            progress: 0,
        };
        $('live-play-nickname').textContent = sessionStorage.getItem('ls_live_nickname') || 'Player';
        $('live-play-champion').hidden = true;
        setLiveGameActive(false);
        showPlayerWaiting('Connecting…');
        bindPlayerSocket();
        emitPlayerJoin();
        if (typeof showScreen === 'function') showScreen('live-play');
    }

    function hostStartGame() {
        if (!hostState) return;
        // Server accepts start from finished (auto-resets lobby); keep players + code.
        emitWhenConnected('live:start-game');
    }

    function hostEnd() {
        if (!hostState) return;
        ensureSocket().emit('live:end-game');
    }

    function hostPlayAgain() {
        if (!hostState || hostState.phase !== 'finished') return;
        emitWhenConnected('live:play-again');
    }

    function toggleLiveSourcePanels() {
        const source = document.querySelector('input[name="live-source"]:checked')?.value || 'builtin';
        $('live-host-level-row').hidden = source !== 'builtin';
        $('live-host-wordset-row').hidden = source !== 'wordset';
        // Keep paste visible for wordset so loaded lists can be reviewed/edited.
        $('live-host-paste-row').hidden = source !== 'paste' && source !== 'wordset';
        if (source === 'wordset') loadWordSetsForHost({ force: false });
    }

    let lobbySettingsSeq = 0;
    let lobbySettingsAck = 0;

    function settingsSnapshotIsStale(seq) {
        if (lobbySettingsAck >= lobbySettingsSeq) return false;
        return seq == null || Number(seq) < lobbySettingsSeq;
    }

    function noteLobbySettingsAck(seq) {
        if (seq == null) return;
        lobbySettingsAck = Math.max(lobbySettingsAck, Number(seq) || 0);
    }

    // ===================== Lucky Lanterns: host projector + phone presentation =====================
    // Game rules and timing live on the server (lucky-lanterns.js). Everything below only draws
    // the state it is sent, following the Lucky Lanterns concept clip.
    let lanternHostState = null;
    let lanternPlayerState = null;
    let lanternClockTimer = null;
    let lanternRevealSeq = -1;
    let lanternPlayerRevealSeq = -1;
    let lanternRevealTimers = [];

    /** Avatars fly to their lanterns before the first reveal beat (host and phones stay in sync). */
    const LL_LEAD_MS = 700;
    const LL_PHASE_MS = { question: 20000, review: 12000, picking: 12000 };
    const LL_LX = { safe: 300, risk: 715, mystery: 1130 };
    const LL_LCY = 420;
    const LL_TRAY_Y = 830;
    const LL_SVG = {
        check: '<svg viewBox="-1 -1 2 2" aria-hidden="true"><path d="M-0.5 0 L-0.12 0.38 L0.55 -0.42" fill="none" stroke="#fff" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        cross: '<svg viewBox="-1 -1 2 2" aria-hidden="true"><path d="M-0.4 -0.4 L0.4 0.4 M0.4 -0.4 L-0.4 0.4" fill="none" stroke="#fff" stroke-width="0.3" stroke-linecap="round"/></svg>',
        crown: '<svg viewBox="-31 -23 62 40" aria-hidden="true"><path d="M-24 14 L-28 -14 L-12 0 L0 -20 L12 0 L28 -14 L24 14 Z" fill="#ffc531" stroke="#b07800" stroke-width="3" stroke-linejoin="round"/></svg>',
        arrows: '<svg class="ll-arrows" viewBox="-55 -35 110 70" aria-hidden="true"><g fill="none" stroke="#ff8c1a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><path d="M-45 -14 L45 -14 M30 -26 L45 -14 L30 -2"/><path d="M45 14 L-45 14 M-30 2 L-45 14 L-30 26"/></g></svg>',
        arrowLeft: '<svg class="ll-arrows" viewBox="-55 -35 110 70" aria-hidden="true"><g fill="none" stroke="#ff8c1a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><path d="M45 0 L-45 0 M-30 -12 L-45 0 L-30 12"/></g></svg>',
        shapes: [
            '<svg viewBox="-34 -34 68 68"><path d="M0,-34 L8.8,-12.1 32.3,-10.5 14.3,4.6 20,27.5 0,15 -20,27.5 -14.3,4.6 -32.3,-10.5 -8.8,-12.1Z" fill="rgba(255,255,255,0.9)"/></svg>',
            '<svg viewBox="-34 -34 68 68"><path d="M0,-32 L32,26 L-32,26Z" fill="rgba(255,255,255,0.9)"/></svg>',
            '<svg viewBox="-34 -34 68 68"><circle r="30" fill="rgba(255,255,255,0.9)"/></svg>',
            '<svg viewBox="-34 -34 68 68"><rect x="-27" y="-27" width="54" height="54" fill="rgba(255,255,255,0.9)"/></svg>',
        ],
    };

    const llHost = {
        built: false,
        questionId: null,
        correctShown: false,
        lanternsUp: false,
        pickSwapTimer: null,
        board: new Map(),
        tray: new Map(),
        slots: new Map(),
        answered: new Map(),
        working: null,
        introDone: false,
        allinActive: false,
        revealDoneAt: 0,
        cancelConfetti: null,
        lastBlip: 0,
        finishTimer: null,
    };
    const llPhone = { key: null, revealDoneAt: 0, avatar: null, cancelConfetti: null, finishTimer: null };

    function llRestart(el, cls) {
        if (!el) return;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
    }

    function llLater(fn, ms) {
        lanternRevealTimers.push(setTimeout(fn, Math.max(0, ms)));
    }

    function formatLanternPoints(value) {
        return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-US');
    }

    function llTimerRingHtml(id) {
        return `<div class="ll-timer-ring" id="${id}"><svg viewBox="-60 -60 120 120" aria-hidden="true"><circle r="56" class="ll-timer-bg"/><circle r="46" class="ll-timer-arc" transform="rotate(-90)"/></svg><span class="ll-timer-num"></span></div>`;
    }

    function paintTimerRing(el, state) {
        if (!el || !state) return;
        const secs = state.phaseEndsAt ? Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000)) : null;
        const total = (state.phase === 'question' && state.questionMs) || LL_PHASE_MS[state.phase] || 20000;
        const frac = state.phaseEndsAt ? Math.max(0, Math.min(1, (state.phaseEndsAt - Date.now()) / total)) : 1;
        const num = el.querySelector('.ll-timer-num');
        const arc = el.querySelector('.ll-timer-arc');
        const text = secs == null ? '…' : String(secs);
        if (num && num.textContent !== text) num.textContent = text;
        if (arc) arc.style.strokeDashoffset = String((289.03 * (1 - frac)).toFixed(1));
        el.classList.toggle('is-low', secs != null && secs <= 5 && state.phase !== 'reveal');
    }

    /** Same order as the server leaderboard: rank, then score, then name. The first entry is the single crowned winner. */
    function llPodiumOrder(players) {
        return [...(players || [])].sort((a, b) => (a.rank || 99) - (b.rank || 99)
            || (Number(b.score ?? b.progress) || 0) - (Number(a.score ?? a.progress) || 0)
            || String(a.nickname || '').localeCompare(String(b.nickname || ''))
            || String(a.id).localeCompare(String(b.id)));
    }

    function lanternPodiumHtml(players) {
        const ranked = llPodiumOrder(players).slice(0, 3);
        if (!ranked.length) return '';
        const order = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
        const fx = window.LLFX;
        return `<div class="ll-podium">${order.map((row) => {
            const place = row === ranked[0] ? 1 : (row === ranked[1] ? 2 : 3);
            return `
            <div class="ll-podium-slot place-${place}">
                <div class="ll-podium-who">
                    ${place === 1 ? `<span class="ll-podium-crown">${LL_SVG.crown}</span>` : ''}
                    ${fx ? fx.avatarHtml(row.avatar) : `<span>${row.avatar || '🏮'}</span>`}
                </div>
                <div class="ll-podium-name">${esc(row.nickname)}</div>
                <div class="ll-podium-score">${formatLanternPoints(row.score ?? row.progress)}</div>
                <div class="ll-podium-block">${row.rank || place}</div>
            </div>`;
        }).join('')}</div>`;
    }

    function clearLanternReveal() {
        lanternRevealTimers.forEach((timer) => clearTimeout(timer));
        lanternRevealTimers = [];
    }

    function startLanternClock() {
        if (lanternClockTimer) return;
        lanternClockTimer = setInterval(() => {
            if (lanternHostState) {
                paintTimerRing($('ll-q-timer'), lanternHostState);
                paintTimerRing($('ll-side-ring'), lanternHostState);
            }
            if (lanternPlayerState) paintTimerRing($('ll-phone-ring'), lanternPlayerState);
        }, 250);
    }

    function stopLanternClock() {
        if (!lanternClockTimer) return;
        clearInterval(lanternClockTimer);
        lanternClockTimer = null;
    }

    // ---------------- host scaffold ----------------
    function llFitStage() {
        const stage = $('ll-stage');
        const host = $('live-host-lanterns');
        if (!stage || !host || host.hidden) return;
        const w = host.clientWidth || window.innerWidth;
        const h = host.clientHeight || window.innerHeight;
        const s = Math.min(w / 1920, h / 1080);
        stage.style.transform = `translate(${((w - 1920 * s) / 2).toFixed(1)}px, ${((h - 1080 * s) / 2).toFixed(1)}px) scale(${s.toFixed(4)})`;
        const backdrop = $('ll-host-backdrop');
        if (backdrop) backdrop.style.setProperty('--llu', String(Math.max(w / 1920, h / 1080).toFixed(3)));
    }

    function ensureLanternHostScaffold() {
        if (!window.LLFX) return false;
        LLFX.ensureDefs();
        LLFX.mountBackdrop($('ll-host-backdrop'));
        if (!llHost.built) {
            llHost.built = true;
            window.addEventListener('resize', llFitStage);
            document.addEventListener('fullscreenchange', llFitStage);
            const side = $('ll-side-timer');
            if (side) side.innerHTML = llTimerRingHtml('ll-side-ring');
        }
        const code = $('ll-room-code');
        if (code) code.textContent = hostState?.code || $('live-host-code')?.textContent || '----';
        llFitStage();
        return true;
    }

    /** Forget everything drawn for the previous match (new game / lobby). */
    function llResetHost() {
        clearLanternReveal();
        clearTimeout(llHost.pickSwapTimer);
        llHost.pickSwapTimer = null;
        llHost.questionId = null;
        llHost.correctShown = false;
        llHost.lanternsUp = false;
        llHost.board.clear();
        llHost.tray.clear();
        llHost.slots.clear();
        llHost.answered.clear();
        llHost.working = null;
        llHost.introDone = false;
        llHost.allinActive = false;
        llHost.revealDoneAt = 0;
        if (llHost.cancelConfetti) llHost.cancelConfetti();
        llHost.cancelConfetti = null;
        lanternRevealSeq = -1;
        ['ll-board-list', 'll-question', 'll-lanterns', 'll-tray', 'll-fx', 'll-card', 'll-allin', 'll-intro'].forEach((id) => {
            const el = $(id);
            if (el) el.innerHTML = '';
        });
        const allin = $('ll-allin');
        if (allin) allin.hidden = true;
        $('ll-zoom')?.classList.remove('is-drumroll');
        $('ll-vignette')?.classList.remove('is-on');
        $('ll-stage')?.classList.remove('is-intro');
        $('ll-question')?.classList.remove('is-out');
        const round = $('ll-round');
        if (round) round.classList.remove('is-final', 'is-popping');
    }

    function setHostLanternMode(active) {
        const board = $('live-host-lanterns');
        const race = $('live-host-race');
        const grid = document.querySelector('.live-host-grid');
        if (!active) {
            if (board) board.hidden = true;
            document.body.classList.remove('live-host-lanterns');
            clearLanternReveal();
            stopLanternClock();
            return;
        }
        document.body.classList.add('live-host-race', 'live-host-lanterns');
        document.body.classList.remove('ll-lobby');
        if (race) race.hidden = true;
        if (board) board.hidden = false;
        if (grid) grid.hidden = true;
        stopRaceBgBlobs();
        ensureLanternHostScaffold();
        startLanternClock();
    }

    function llCaption(text) {
        const el = $('ll-caption-text');
        if (!el || el.dataset.text === text) return;
        el.dataset.text = text;
        el.innerHTML = `<span class="ll-caption-star">★</span>${esc(text)}`;
        llRestart(el, 'is-swap');
    }

    function llSetRound(state) {
        const el = $('ll-round');
        if (!el) return;
        const final = Boolean(state.isFinal);
        const text = final ? 'FINAL ROUND' : `Round ${state.round || 1} of ${state.rounds || 10}`;
        if (el.textContent !== text) {
            el.textContent = text;
            if (final) {
                el.classList.add('is-final');
                llRestart(el, 'is-popping');
            }
        }
        if (!final) el.classList.remove('is-final');
    }

    // ---------------- leaderboard (FLIP rows + count-up) ----------------
    function llRankRows(rows) {
        const sorted = [...rows].sort((a, b) => b.score - a.score
            || String(a.nickname || '').localeCompare(String(b.nickname || ''))
            || String(a.id).localeCompare(String(b.id)));
        let rank = 0;
        let prev = null;
        return sorted.map((row, i) => {
            if (prev == null || row.score !== prev) rank = i + 1;
            prev = row.score;
            return { ...row, rank };
        });
    }

    function renderLanternBoard(rows, { animate = true } = {}) {
        const list = $('ll-board-list');
        if (!list || !window.LLFX) return;
        const all = rows || [];
        const pitch = Math.max(56, Math.min(134, Math.floor(670 / Math.max(1, all.length))));
        const shown = all.slice(0, Math.floor(670 / pitch));
        list.style.setProperty('--rs', (pitch / 134).toFixed(3));
        const seen = new Set();
        shown.forEach((row, index) => {
            seen.add(row.id);
            let entry = llHost.board.get(row.id);
            const isNew = !entry;
            if (!entry) {
                const li = document.createElement('li');
                li.className = 'll-row';
                li.dataset.id = row.id;
                li.innerHTML = `<div class="ll-row-in"><span class="ll-rank"></span>${LLFX.avatarHtml(row.avatar)}<span class="ll-name"></span><span class="ll-score"></span></div>`;
                li.style.transform = `translateY(${index * pitch}px)`;
                list.appendChild(li);
                entry = { el: li, score: Number(row.score) || 0, index, timer: null };
                llHost.board.set(row.id, entry);
                const scoreEl = li.querySelector('.ll-score');
                scoreEl.textContent = formatLanternPoints(row.score);
                scoreEl.style.color = LLFX.avatarScoreColor(row.avatar);
            }
            const el = entry.el;
            const nameEl = el.querySelector('.ll-name');
            const name = `${row.nickname || ''}${row.shield ? ' 🛡️' : ''}`;
            if (nameEl.textContent !== name) nameEl.textContent = name;
            // Ties share rank 1, but only the first row (server order: score, then name) wears the crown.
            const crowned = index === 0 && row.rank === 1 && Number(row.score) > 0;
            const rankHtml = crowned ? LL_SVG.crown : String(row.rank || index + 1);
            const rankEl = el.querySelector('.ll-rank');
            if (rankEl.dataset.v !== rankHtml) {
                rankEl.dataset.v = rankHtml;
                rankEl.innerHTML = rankHtml;
            }
            el.classList.toggle('is-offline', row.connected === false);
            if (!isNew && entry.index !== index) {
                el.style.zIndex = index < entry.index ? '3' : '1';
                if (index < entry.index && animate) llRestart(el.querySelector('.ll-row-in'), 'is-rising');
            }
            el.style.transform = `translateY(${index * pitch}px)`;
            entry.index = index;
            const score = Number(row.score) || 0;
            if (!isNew && entry.score !== score) {
                const from = entry.score;
                entry.score = score;
                LLFX.countUp(el.querySelector('.ll-score'), from, score, animate ? 750 : 0);
                if (animate) {
                    el.classList.add('is-changing');
                    clearTimeout(entry.timer);
                    entry.timer = setTimeout(() => el.classList.remove('is-changing'), 1300);
                }
            }
        });
        for (const [id, entry] of llHost.board) {
            if (!seen.has(id)) {
                entry.el.remove();
                llHost.board.delete(id);
            }
        }
        const more = $('ll-board-more');
        if (more) {
            more.hidden = all.length <= shown.length;
            more.textContent = `+${all.length - shown.length} more`;
        }
    }

    function llBoardHighlight(playerId, on) {
        const entry = llHost.board.get(playerId);
        if (entry) entry.el.classList.toggle('is-hl', Boolean(on));
    }

    // ---------------- question card ----------------
    function llFitQuestionText() {
        const el = document.querySelector('#ll-question .ll-qtext');
        if (el) {
            let size = 66;
            el.style.fontSize = `${size}px`;
            while (size > 30 && (el.scrollHeight > 150 || el.scrollWidth > 1090)) {
                size -= 4;
                el.style.fontSize = `${size}px`;
            }
        }
        document.querySelectorAll('#ll-question .ll-tile-word .ll-pop, #ll-question .ll-typed-answer .ll-pop').forEach((pop) => {
            let fs = 74;
            pop.style.fontSize = `${fs}px`;
            while (fs > 34 && pop.offsetWidth > 440) {
                fs -= 4;
                pop.style.fontSize = `${fs}px`;
            }
        });
    }

    function llQuestionHtml(state) {
        const choices = state.inputMode === 'choice' && Array.isArray(state.choices) ? state.choices.slice(0, 4) : [];
        const tiles = choices.length
            ? choices.map((term, i) => `
                <div class="ll-tile ll-tile--${i}" data-term="${esc(String(term).trim().toLowerCase())}" style="animation-delay:${(0.35 + i * 0.12).toFixed(2)}s">
                    <span class="ll-tile-icon">${LL_SVG.shapes[i]}</span>
                    <span class="ll-tile-word">${LLFX.popTextHtml(term)}</span>
                    <span class="ll-tick">${LL_SVG.check}</span>
                </div>`).join('')
            : `<div class="ll-typed">
                    <div class="ll-typed-hint"><i class="fa-solid fa-keyboard"></i> Type the word on your phone</div>
                    <div class="ll-typed-answer"><span class="ll-tile-word"></span><span class="ll-tick">${LL_SVG.check}</span></div>
               </div>`;
        return `
            <div class="ll-qcard"><span class="ll-qtag">QUESTION</span><p class="ll-qtext">${esc(state.definition || '')}</p>${llTimerRingHtml('ll-q-timer')}</div>
            ${tiles}
            <div class="ll-answers"><span class="ll-answers-label">Answers&nbsp;<b>0</b>/${state.playerCount || 0}</span><div class="ll-answers-avs"></div></div>
            <p class="ll-qnote" hidden></p>`;
    }

    function llHideQuestion() {
        const q = $('ll-question');
        if (!q || !q.firstChild || q.classList.contains('is-out')) return;
        q.classList.add('is-out');
        const qid = llHost.questionId;
        setTimeout(() => {
            if (q.classList.contains('is-out') && llHost.questionId === qid) q.innerHTML = '';
        }, 650);
    }

    function llSyncAnswered(state) {
        const wrap = document.querySelector('#ll-question .ll-answers-avs');
        const label = document.querySelector('#ll-question .ll-answers-label b');
        if (label) label.textContent = String(state.answeredCount || 0);
        if (!wrap) return;
        const answered = (state.leaderboard || []).filter((row) => row.status && row.status !== 'answering');
        const max = 9;
        const gap = answered.length > 5 ? Math.max(52, Math.floor(540 / Math.min(answered.length, max))) : 118;
        answered.slice(0, max).forEach((row, i) => {
            let el = llHost.answered.get(row.id);
            if (!el || !el.isConnected) {
                el = document.createElement('span');
                el.className = 'll-ans-av';
                el.innerHTML = `${LLFX.avatarHtml(row.avatar)}<span class="ll-badge"></span>`;
                wrap.appendChild(el);
                llHost.answered.set(row.id, el);
                const now = Date.now();
                if (now - llHost.lastBlip > 120) {
                    llHost.lastBlip = now;
                    LiveAudio.playLanternSfx('blip');
                }
            }
            el.style.left = `${i * gap}px`;
            el.style.zIndex = String(i + 1);
        });
        let more = wrap.querySelector('.ll-ans-more');
        if (answered.length > max) {
            if (!more) {
                more = document.createElement('span');
                more.className = 'll-ans-more';
                wrap.appendChild(more);
            }
            more.textContent = `+${answered.length - max}`;
            more.style.left = `${max * gap + 20}px`;
        } else if (more) more.remove();
    }

    function llMarkAnswered(state) {
        for (const row of state.leaderboard || []) {
            const el = llHost.answered.get(row.id);
            if (!el) continue;
            const right = row.eligible || row.status === 'ready' || row.status === 'picking' || row.status === 'picked';
            const deciding = row.status === 'deciding' || row.status === 'challenging';
            el.classList.toggle('is-right', right);
            el.classList.toggle('is-wrong', !right && !deciding);
            const badge = el.querySelector('.ll-badge');
            const html = right ? LL_SVG.check : (deciding ? '' : LL_SVG.cross);
            if (badge && badge.dataset.v !== html) {
                badge.dataset.v = html;
                badge.innerHTML = html;
            }
        }
    }

    function llRevealCorrect(state) {
        const q = $('ll-question');
        if (!q) return;
        if (!llHost.correctShown) {
            const term = String(state.correctTerm || '').trim();
            if (!term && state.inputMode === 'choice') return;
            llHost.correctShown = true;
            const lower = term.toLowerCase();
            const tiles = q.querySelectorAll('.ll-tile');
            if (tiles.length) {
                tiles.forEach((tile) => {
                    const hit = tile.dataset.term === lower;
                    tile.classList.toggle('is-correct', hit);
                    tile.classList.toggle('is-dim', !hit);
                });
            } else {
                const typed = q.querySelector('.ll-typed');
                const word = q.querySelector('.ll-typed-answer .ll-tile-word');
                if (word && term) word.innerHTML = LLFX.popTextHtml(term);
                typed?.classList.add('is-revealed');
                llFitQuestionText();
            }
            LiveAudio.playLanternSfx('ding');
        }
        llMarkAnswered(state);
    }

    function llShowQuestion(state) {
        const q = $('ll-question');
        if (!q || !window.LLFX) return;
        if (llHost.questionId !== state.questionId || !q.firstChild || q.classList.contains('is-out')) {
            llHost.questionId = state.questionId;
            llHost.correctShown = false;
            llHost.answered.clear();
            clearTimeout(llHost.pickSwapTimer);
            llHost.pickSwapTimer = null;
            llExitLanterns();
            llClearAllIn();
            q.classList.remove('is-out');
            q.innerHTML = llQuestionHtml(state);
            llFitQuestionText();
            paintTimerRing($('ll-q-timer'), state);
            LiveAudio.playLanternSfx('whoosh');
        }
        llSyncAnswered(state);
        const note = q.querySelector('.ll-qnote');
        if (note) {
            note.hidden = state.phase !== 'review';
            note.textContent = 'Challenges first — lanterns open when the teacher is done.';
        }
        if (state.phase === 'review' || state.phase === 'picking') llRevealCorrect(state);
    }

    // ---------------- lanterns + avatars ----------------
    function llRig(kind) {
        return document.querySelector(`#ll-lanterns .ll-rig--${kind}`);
    }

    function llDropLanterns() {
        const wrap = $('ll-lanterns');
        if (!wrap || llHost.lanternsUp || !window.LLFX) return;
        llHost.lanternsUp = true;
        wrap.innerHTML = ['safe', 'risk', 'mystery'].map((kind) => LLFX.lanternRigHtml(kind)).join('');
        wrap.querySelectorAll('.ll-rig').forEach((rig, i) => {
            rig.style.left = `${LL_LX[rig.dataset.kind]}px`;
            rig.style.setProperty('--i', String(i));
            rig.classList.add('is-in');
        });
        const tray = $('ll-tray');
        if (tray) {
            tray.classList.remove('is-out');
            tray.innerHTML = '';
        }
        llHost.tray.clear();
        llHost.slots.clear();
        LiveAudio.playLanternSfx('whoosh');
    }

    function llExitLanterns() {
        const wrap = $('ll-lanterns');
        const tray = $('ll-tray');
        if (wrap && llHost.lanternsUp) {
            wrap.querySelectorAll('.ll-rig').forEach((rig) => {
                rig.classList.remove('is-in', 'is-static', 'is-dim');
                rig.classList.add('is-out');
            });
        }
        llHost.lanternsUp = false;
        if (tray && tray.firstChild) tray.classList.add('is-out');
        llHost.tray.clear();
        llHost.slots.clear();
        setTimeout(() => {
            if (!llHost.lanternsUp) {
                if (wrap) wrap.innerHTML = '';
                if (tray && tray.classList.contains('is-out')) {
                    tray.innerHTML = '';
                    tray.classList.remove('is-out');
                }
            }
        }, 700);
    }

    function llSyncTray(state) {
        const tray = $('ll-tray');
        if (!tray || !window.LLFX) return;
        const eligible = (state.leaderboard || []).filter((row) => row.eligible);
        const picked = new Set(state.pickedIds || []);
        const n = eligible.length;
        const gap = Math.min(120, 1240 / Math.max(1, n));
        const x0 = 715 - (gap * (n - 1)) / 2;
        const size = n > 10 ? 64 : 88;
        eligible.forEach((row, i) => {
            const x = x0 + gap * i;
            let item = llHost.tray.get(row.id);
            if (!item) {
                const el = document.createElement('div');
                el.className = 'll-tray-av is-waiting';
                el.innerHTML = `${LLFX.avatarHtml(row.avatar, { size })}<span class="ll-tray-check">${LL_SVG.check}</span><span class="ll-tray-name">${esc(row.nickname || '')}</span>`;
                el.style.left = `${x}px`;
                el.style.top = `${LL_TRAY_Y}px`;
                el.style.animationDelay = `${(0.6 + i * 0.08).toFixed(2)}s`;
                tray.appendChild(el);
                item = { el, picked: false, x, y: LL_TRAY_Y, avatar: row.avatar };
                llHost.tray.set(row.id, item);
            } else if (Math.abs(item.x - x) > 0.5 && !item.el.classList.contains('is-flown')) {
                item.el.style.left = `${x}px`;
                item.x = x;
            }
            const isPicked = picked.has(row.id) || row.picked;
            if (isPicked && !item.picked) {
                item.picked = true;
                item.el.classList.remove('is-waiting');
                item.el.classList.add('is-picked');
                llRestart(item.el, 'is-hop');
                LiveAudio.playLanternSfx('land');
            }
        });
        let label = tray.querySelector('.ll-tray-label');
        if (state.phase === 'picking' && n) {
            if (!label) {
                label = document.createElement('div');
                label.className = 'll-tray-label';
                tray.appendChild(label);
            }
            const count = eligible.filter((row) => picked.has(row.id) || row.picked).length;
            label.innerHTML = `★ Picked <b>${count}</b> of ${n}`;
        } else if (label) label.remove();
    }

    function llSlotPositions(count) {
        const perRow = count > 6 ? 4 : 3;
        const gap = count > 6 ? 72 : 96;
        const out = [];
        for (let i = 0; i < count; i++) {
            const row = Math.floor(i / perRow);
            const inRow = Math.min(perRow, count - row * perRow);
            const col = i % perRow;
            out.push({ dx: (col - (inRow - 1) / 2) * gap, y: LL_TRAY_Y - 95 * row });
        }
        return { out, size: count > 6 ? 64 : 88 };
    }

    function llFlyToLanterns(steps, rowsById) {
        const tray = $('ll-tray');
        if (!tray) return;
        tray.classList.remove('is-out');
        tray.querySelector('.ll-tray-label')?.remove();
        const groups = { safe: [], risk: [], mystery: [] };
        const allin = [];
        for (const step of steps) {
            if (groups[step.group]) {
                if (!groups[step.group].includes(step.playerId)) groups[step.group].push(step.playerId);
            } else if (step.group === 'allin') allin.push(step.playerId);
        }
        const flying = [];
        Object.entries(groups).forEach(([kind, ids]) => {
            const { out, size } = llSlotPositions(ids.length);
            ids.forEach((id, i) => flying.push({ id, kind, x: LL_LX[kind] + out[i].dx, y: out[i].y, size }));
        });
        const stagger = Math.min(80, 320 / Math.max(1, flying.length));
        flying.forEach((f, i) => {
            let item = llHost.tray.get(f.id);
            const row = rowsById.get(f.id);
            if (!item) {
                const el = document.createElement('div');
                el.className = 'll-tray-av is-picked';
                el.innerHTML = `${LLFX.avatarHtml(row?.avatar, { size: f.size })}<span class="ll-tray-check">${LL_SVG.check}</span><span class="ll-tray-name"></span>`;
                el.style.left = '715px';
                el.style.top = '1010px';
                tray.appendChild(el);
                item = { el, picked: true, x: 715, y: 1010, avatar: row?.avatar };
                llHost.tray.set(f.id, item);
            }
            const from = { x: item.x, y: item.y };
            item.el.classList.remove('is-waiting');
            item.el.classList.add('is-flown');
            const av = item.el.querySelector('.ll-av');
            if (av) av.style.setProperty('--av', `${f.size}px`);
            LLFX.flyArc(item.el, from, { x: f.x, y: f.y }, { height: 230, duration: 560, delay: i * stagger });
            item.x = f.x;
            item.y = f.y;
            llHost.slots.set(f.id, { el: item.el, x: f.x, y: f.y });
        });
        if (flying.length) LiveAudio.playLanternSfx('whoosh');
        for (const [id, item] of llHost.tray) {
            if (allin.includes(id)) item.el.classList.add('is-allin');
            else if (!llHost.slots.has(id)) item.el.classList.add('is-missed');
        }
    }

    function llFloatText(text, x, y, cls, mode = 'rise', layer = $('ll-fx')) {
        if (!layer) return null;
        const el = document.createElement('div');
        el.className = `ll-ft ${cls} is-${mode}`;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.innerHTML = LLFX.popTextHtml(text);
        layer.appendChild(el);
        setTimeout(() => el.remove(), mode === 'pop' ? 1600 : 1150);
        return el;
    }

    // ---------------- incremental scores during the reveal ----------------
    function llFindByName(name) {
        if (!name || !llHost.working) return null;
        for (const row of llHost.working.values()) if (row.nickname === name) return row;
        return null;
    }

    function llStepTarget(step) {
        const detail = String(step?.detail || '');
        let match = null;
        if (step?.card === 'swapLeader') match = detail.match(/with (.+)\.$/);
        else if (step?.card === 'steal100') match = detail.match(/from (.+)\.$/);
        return match ? llFindByName(match[1]) : null;
    }

    function llApplyStep(step) {
        if (!llHost.working) return;
        const self = llHost.working.get(step.playerId);
        if (step.tone === 'magic' && (step.card === 'swapLeader' || step.card === 'steal100')) {
            const target = llStepTarget(step);
            if (target) {
                if (step.card === 'swapLeader') target.score = Number(step.scoreBefore) || 0;
                else target.score = Math.max(0, target.score - (Number(step.delta) || 0));
            }
        }
        if (self && Number.isFinite(Number(step.scoreAfter))) self.score = Number(step.scoreAfter);
        llLater(() => {
            if (llHost.working) renderLanternBoard(llRankRows([...llHost.working.values()]), { animate: true });
        }, 380);
    }

    // ---------------- reveal beats ----------------
    function llDismissCard() {
        const layer = $('ll-card');
        if (layer) {
            layer.querySelectorAll('.ll-mcard, .ll-center-note').forEach((card) => {
                card.classList.add('is-leaving');
                setTimeout(() => card.remove(), 380);
            });
        }
        document.querySelectorAll('#ll-lanterns .ll-rig.is-dim').forEach((rig) => rig.classList.remove('is-dim'));
    }

    function llBeatSafe(shown) {
        const rig = llRig('safe');
        if (rig) {
            llRestart(rig, 'is-flash');
            llRestart(rig, 'is-pop');
        }
        LiveAudio.playLanternSfx('safe');
        const fx = $('ll-fx');
        llFloatText(`+${shown[0].delta || 100}`, LL_LX.safe, LL_LCY - 60, 'll-ft--safe', 'rise');
        LLFX.sparkles(fx, LL_LX.safe, LL_LCY, { color: '#c6ff7a', n: 16, r0: 60, r1: 260, seed: 4 });
        shown.forEach((step, i) => {
            const slot = llHost.slots.get(step.playerId);
            if (slot) {
                llLater(() => {
                    llRestart(slot.el, 'is-bounce');
                    llFloatText(`+${step.delta || 0}`, slot.x, slot.y - 78, 'll-ft--mini', 'rise');
                }, 120 + i * 60);
            }
            llApplyStep(step);
        });
    }

    function llBeatRisk(step) {
        const rig = llRig('risk');
        if (rig) llRestart(rig, 'is-flash');
        const slot = llHost.slots.get(step.playerId);
        if (slot) llRestart(slot.el, 'is-focus');
        llBoardHighlight(step.playerId, true);
        const fx = $('ll-fx');
        const holder = document.createElement('div');
        holder.innerHTML = LLFX.coinHtml();
        const coin = holder.firstElementChild;
        const double = step.coin === 'double';
        coin.classList.add(double ? 'lands-x2' : 'lands-0');
        coin.style.left = `${LL_LX.risk}px`;
        coin.style.top = `${LL_LCY - 175}px`;
        fx?.appendChild(coin);
        LiveAudio.playLanternSfx('coin');
        llLater(() => {
            const sx = slot ? slot.x : LL_LX.risk;
            const sy = slot ? slot.y : LL_TRAY_Y;
            if (double) {
                LiveAudio.playLanternSfx('double');
                llFloatText('x2!', sx, sy - 140, 'll-ft--x2', 'pop');
                LLFX.sparkles(fx, sx, sy - 140, { color: '#ffd23f', n: 14, r0: 40, r1: 200, seed: 6 });
                LLFX.sparkles(fx, LL_LX.risk, LL_LCY - 175, { color: '#ffe066', n: 12, r0: 70, r1: 220, seed: 2, ring: false });
            } else if (step.savedByShield) {
                LiveAudio.playLanternSfx('safe');
                llFloatText('🛡️ +100', sx, sy - 140, 'll-ft--shield', 'pop');
            } else {
                LiveAudio.playLanternSfx('bust');
                llFloatText('0', sx, sy - 140, 'll-ft--zero', 'pop');
                LLFX.puff(fx, sx, sy);
                if (slot) {
                    slot.el.classList.add('is-bust');
                    llLater(() => slot.el.classList.remove('is-bust'), 1500);
                }
            }
            llApplyStep(step);
        }, 820);
        llLater(() => llBoardHighlight(step.playerId, false), 1600);
        setTimeout(() => coin.remove(), 1700);
    }

    function llMysteryContent(step) {
        const rows = llHost.working || new Map();
        const self = rows.get(step.playerId) || (llPhone.avatar && { avatar: llPhone.avatar });
        const target = llStepTarget(step);
        const av = (row) => (row ? LLFX.avatarHtml(row.avatar) : '');
        let title = step.title || '';
        let detail = step.detail || '';
        let avs = `${av(self)}<span class="ll-mcard-who">${esc(step.nickname || '')}</span>`;
        if (step.card === 'swapLeader' && step.tone === 'magic') {
            title = 'SWAP with the leader!';
            if (target) {
                detail = '';
                avs = `${av(self)}${LL_SVG.arrows}${av(target)}`;
            }
        } else if (step.card === 'steal100' && step.tone === 'magic') {
            title = `STEAL +${step.delta || 100}!`;
            if (target) avs = `${av(self)}${LL_SVG.arrowLeft}${av(target)}`;
        } else if (step.card === 'shield') {
            title = 'SHIELD!';
        } else if (step.card === 'plus150' || step.card === 'plus50') {
            title = `${step.title} BONUS!`;
        }
        return { title, detail, avs };
    }

    function llMysteryCardHtml(step, { phone = false } = {}) {
        const c = llMysteryContent(step);
        return `<div class="${phone ? 'llp-mcard' : 'll-mcard'}"><div class="ll-mcard-flip">
            <div class="ll-mcard-face ll-mcard-back">${LLFX.popTextHtml('?')}</div>
            <div class="ll-mcard-face ll-mcard-front">
                <span class="ll-mcard-tag">MYSTERY CARD</span>
                <p class="ll-mcard-title${c.title.length > 14 ? ' is-long' : ''}">${esc(c.title)}</p>
                ${c.detail ? `<p class="ll-mcard-detail">${esc(c.detail)}</p>` : ''}
                <div class="ll-mcard-avs">${c.avs}</div>
            </div>
        </div></div>`;
    }

    function llBeatMystery(step) {
        const rig = llRig('mystery');
        if (rig) {
            llRestart(rig, 'is-flash');
            llRestart(rig, 'is-pop');
        }
        ['safe', 'risk'].forEach((kind) => llRig(kind)?.classList.add('is-dim'));
        LiveAudio.playLanternSfx('mystery');
        LLFX.sparkles($('ll-fx'), LL_LX.mystery, LL_LCY, { color: '#e3b8ff', n: 18, r0: 60, r1: 300, seed: 8 });
        const slot = llHost.slots.get(step.playerId);
        if (slot) llRestart(slot.el, 'is-bounce');
        llBoardHighlight(step.playerId, true);
        $('ll-card')?.insertAdjacentHTML('beforeend', llMysteryCardHtml(step));
        llLater(() => {
            LiveAudio.playLanternSfx('chime');
            llApplyStep(step);
        }, 820);
        llLater(() => llBoardHighlight(step.playerId, false), 1600);
    }

    function llClearAllIn() {
        const stage = $('ll-allin');
        if (stage) {
            stage.hidden = true;
            stage.innerHTML = '';
        }
        llHost.allinActive = false;
        $('ll-zoom')?.classList.remove('is-drumroll');
        $('ll-vignette')?.classList.remove('is-on');
    }

    function llResultHtml(win, saved) {
        if (win) return `<div class="ll-res-main">${LLFX.popTextHtml('WIN!')}</div><div class="ll-res-sub">${LLFX.popTextHtml('x2')}</div>`;
        if (saved) return `<div class="ll-res-main">${LLFX.popTextHtml('SAVED!')}</div><div class="ll-res-sub">${LLFX.popTextHtml('+100')}</div>`;
        return `<div class="ll-res-main">${LLFX.popTextHtml('BUST!')}</div><div class="ll-res-sub">${LLFX.popTextHtml('0')}</div>`;
    }

    function llBeatAllIn(step, state) {
        const stage = $('ll-allin');
        if (!stage) return;
        if (!llHost.allinActive) {
            llHost.allinActive = true;
            $('ll-lanterns')?.querySelectorAll('.ll-rig').forEach((rig) => {
                rig.classList.remove('is-in', 'is-static', 'is-dim');
                rig.classList.add('is-out');
            });
            llHost.lanternsUp = false;
            $('ll-tray')?.classList.add('is-out');
        }
        const row = llHost.working?.get(step.playerId) || (state.leaderboard || []).find((r) => r.id === step.playerId);
        const name = step.nickname || row?.nickname || '';
        stage.hidden = false;
        stage.innerHTML = `
            <div class="ll-allin-title is-slam">${LLFX.popTextHtml('ALL IN?')}</div>
            <div class="ll-allin-av">${LLFX.avatarHtml(row?.avatar)}</div>
            <div class="ll-allin-pill">${esc(name)} bets it all: ${formatLanternPoints(step.scoreBefore)}</div>
            ${LLFX.lanternRigHtml('allin')}
            <div class="ll-allin-result"></div>`;
        const rig = stage.querySelector('.ll-rig');
        rig?.classList.add('is-in');
        llCaption('Last round: go ALL IN for the win');
        llBoardHighlight(step.playerId, true);
        LiveAudio.playLanternSfx('slam');
        const zoom = $('ll-zoom');
        const vignette = $('ll-vignette');
        llLater(() => {
            stage.querySelector('.ll-allin-title')?.classList.add('is-throb');
            stage.querySelector('.ll-allin-av')?.classList.add('is-throb');
            rig?.classList.add('is-pulse');
            zoom?.classList.add('is-drumroll');
            vignette?.classList.add('is-on');
            LiveAudio.playLanternSfx('drumroll');
        }, 380);
        llLater(() => {
            zoom?.classList.remove('is-drumroll');
            vignette?.classList.remove('is-on');
            stage.querySelector('.ll-allin-title')?.classList.add('is-gone');
            stage.querySelector('.ll-allin-av')?.classList.remove('is-throb');
            rig?.classList.remove('is-pulse');
            rig?.classList.add('is-boom');
            const result = stage.querySelector('.ll-allin-result');
            const pill = stage.querySelector('.ll-allin-pill');
            const win = step.coin === 'double' || step.tone === 'win';
            const saved = !win && Boolean(step.savedByShield);
            if (result) {
                result.classList.add(win ? 'is-win' : (saved ? 'is-saved' : 'is-bust'));
                result.innerHTML = llResultHtml(win, saved);
            }
            if (pill) {
                pill.className = `ll-allin-pill ${win || saved ? 'is-result' : 'is-bust'}`;
                pill.innerHTML = `${esc(name)}:&nbsp;<span class="ll-allin-score">${formatLanternPoints(step.scoreBefore)}</span>!`;
                LLFX.countUp(pill.querySelector('.ll-allin-score'), Number(step.scoreBefore) || 0, Number(step.scoreAfter) || 0, 800);
            }
            const fx = $('ll-fx');
            if (win) {
                const flash = document.createElement('div');
                flash.className = 'll-gold-flash';
                fx?.appendChild(flash);
                setTimeout(() => flash.remove(), 700);
                LLFX.sparkles(fx, 990, 520, { color: '#ffe066', n: 24, r0: 100, r1: 520, size: 26, dur: 900, ring: false, seed: 11 });
                if (llHost.cancelConfetti) llHost.cancelConfetti();
                llHost.cancelConfetti = LLFX.confetti($('ll-confetti'), { burst: { x: 990, y: 520 }, rain: true, duration: 4200, count: 150 });
                LiveAudio.playLanternSfx('fanfare');
            } else if (saved) {
                LiveAudio.playLanternSfx('safe');
            } else {
                LLFX.puff(fx, 990, 520, { scale: 2 });
                stage.querySelector('.ll-allin-av')?.classList.add('is-bust');
                LiveAudio.playLanternSfx('bust');
            }
            llApplyStep(step);
        }, 1500);
        llLater(() => llBoardHighlight(step.playerId, false), 2700);
    }

    function llPlayBeat(beat, steps, state) {
        const shown = (beat.stepIndexes || []).map((index) => steps[index]).filter(Boolean);
        const first = shown[0];
        if (!first) return;
        llDismissCard();
        if (first.group === 'safe') llBeatSafe(shown);
        else if (first.group === 'risk') llBeatRisk(first);
        else if (first.group === 'mystery') llBeatMystery(first);
        else if (first.group === 'allin') llBeatAllIn(first, state);
    }

    function playHostReveal(state) {
        if (state.phase !== 'reveal' || !state.reveal) return;
        if (lanternRevealSeq === state.reveal.seq) return;
        clearLanternReveal();
        lanternRevealSeq = state.reveal.seq;
        clearTimeout(llHost.pickSwapTimer);
        llHost.pickSwapTimer = null;
        llHideQuestion();
        llClearAllIn();
        llDropLanterns();
        const rows = state.leaderboard || [];
        renderLanternBoard(rows, { animate: false });
        llHost.working = new Map(rows.map((row) => [row.id, { ...row, score: Number(row.score) || 0 }]));
        const steps = state.reveal.steps || [];
        const stepIds = new Set(steps.map((step) => step.playerId));
        llSyncTray({ ...state, phase: 'reveal', leaderboard: rows.filter((row) => row.eligible || stepIds.has(row.id)) });
        llFlyToLanterns(steps, new Map(rows.map((row) => [row.id, row])));
        const finalRows = state.finalLeaderboard || state.leaderboard;
        const hasAllIn = steps.some((step) => step.group === 'allin');
        llCaption(state.isFinal && hasAllIn ? 'Last round: go ALL IN for the win' : 'Reveal! Doubles, busts and surprises');
        if (!steps.length) {
            const layer = $('ll-card');
            if (layer) layer.innerHTML = `<div class="ll-ft ll-ft--note ll-center-note">${LLFX.popTextHtml('No lanterns this round')}</div>`;
        }
        for (const beat of state.reveal.beats || []) {
            llLater(() => llPlayBeat(beat, steps, state), LL_LEAD_MS + (beat.at || 0));
        }
        const boardAt = LL_LEAD_MS + (state.reveal.leaderboardAt || 0);
        llLater(() => {
            llDismissCard();
            llHost.working = null;
            renderLanternBoard(finalRows, { animate: true });
        }, boardAt);
        llHost.revealDoneAt = Date.now() + boardAt + (state.isFinal ? 2600 : 1500);
    }

    function llPlayIntro(state) {
        const el = $('ll-intro');
        const stage = $('ll-stage');
        if (!el || !stage || !window.LLFX || LLFX.reduced()) return;
        const star = document.querySelector('.ll-logo svg')?.outerHTML || '';
        el.innerHTML = `
            <div class="ll-intro-logo"><div class="ll-logo">Lingo<span>Spark</span>${star}</div></div>
            ${LLFX.lanternRigHtml('safe')}${LLFX.lanternRigHtml('mystery')}
            <div class="ll-intro-title">
                <div class="ll-intro-line">${LLFX.lettersHtml('LUCKY', { delay: 0.15 })}</div>
                <div class="ll-intro-line">${LLFX.lettersHtml('LANTERNS', { delay: 0.4 })}</div>
            </div>
            <div class="ll-intro-pill">${state.rounds || 10} rounds · answer, pick, reveal!</div>`;
        el.querySelectorAll('.ll-rig').forEach((rig, i) => {
            rig.style.left = i === 0 ? '300px' : '1620px';
            rig.style.setProperty('--i', String(i));
            rig.classList.add('is-in');
        });
        el.hidden = false;
        el.classList.remove('is-out');
        stage.classList.add('is-intro');
        LiveAudio.playLanternSfx('whoosh');
        setTimeout(() => LiveAudio.playLanternSfx('chime'), 900);
        setTimeout(() => {
            LLFX.sparkles(el, 960, 450, { color: '#ffe066', n: 18, r0: 200, r1: 700, size: 22, dur: 1000, ring: false, seed: 3 });
        }, 1000);
        setTimeout(() => {
            el.classList.add('is-out');
            stage.classList.remove('is-intro');
        }, 2350);
        setTimeout(() => {
            el.hidden = true;
            el.innerHTML = '';
            el.classList.remove('is-out');
        }, 2800);
    }

    function renderLanternHost(state) {
        lanternHostState = state;
        if (!ensureLanternHostScaffold()) return;
        if (state.phase !== 'reveal') {
            clearLanternReveal();
            lanternRevealSeq = -1;
            llHost.working = null;
        }
        if (!llHost.introDone) {
            llHost.introDone = true;
            if (state.round === 1 && state.phase === 'question' && !state.answeredCount) llPlayIntro(state);
        }
        llSetRound(state);
        const side = $('ll-side-timer');
        if (side) side.hidden = !(state.phase === 'picking' || (state.phase === 'review' && state.phaseEndsAt));
        paintTimerRing($('ll-side-ring'), state);
        const skip = $('ll-skip');
        const next = $('ll-next');
        if (skip) {
            skip.hidden = false;
            skip.textContent = state.phase === 'reveal' ? 'Skip reveal' : state.phase === 'review' ? 'Resolve & continue' : 'Skip';
        }
        if (next) next.hidden = state.phase !== 'reveal';
        if (state.phase === 'question' || state.phase === 'review') {
            llCaption(state.phase === 'review' ? 'Checking challenges — lanterns open next' : 'Answer correctly to earn a lantern pick');
            llShowQuestion(state);
            renderLanternBoard(state.finalLeaderboard || state.leaderboard);
        } else if (state.phase === 'picking') {
            llCaption(state.isFinal ? 'Last round: pick a lantern or go ALL IN' : 'Pick a lantern: safe, risky or mystery');
            const q = $('ll-question');
            const showing = q && q.firstChild && !q.classList.contains('is-out') && llHost.questionId === state.questionId;
            if (showing && !llHost.lanternsUp) {
                llShowQuestion(state);
                if (!llHost.pickSwapTimer) {
                    llHost.pickSwapTimer = setTimeout(() => {
                        llHost.pickSwapTimer = null;
                        if (lanternHostState?.phase !== 'picking') return;
                        llHideQuestion();
                        llDropLanterns();
                        llSyncTray(lanternHostState);
                    }, 1600);
                }
            } else if (!llHost.pickSwapTimer) {
                if (llHost.questionId !== state.questionId) {
                    llHost.questionId = state.questionId;
                    llClearAllIn();
                }
                llHideQuestion();
                llDropLanterns();
            }
            if (llHost.lanternsUp) llSyncTray(state);
            renderLanternBoard(state.finalLeaderboard || state.leaderboard);
        } else if (state.phase === 'reveal') {
            llHost.questionId = state.questionId;
            playHostReveal(state);
        }
        startLanternClock();
    }

    // ---------------- host lobby theme ----------------
    function syncLanternLobbyTheme() {
        const inLobby = Boolean(hostState?.code) && isLuckyLanternsFormat(hostState?.gameFormat)
            && hostState?.phase !== 'playing' && hostState?.phase !== 'finished';
        document.body.classList.toggle('ll-lobby', inLobby);
        if (!inLobby || !window.LLFX) return;
        LLFX.ensureDefs();
        const backdrop = $('ll-lobby-backdrop');
        LLFX.mountBackdrop(backdrop);
        if (backdrop) backdrop.style.setProperty('--llu', String(Math.max(window.innerWidth / 1920, window.innerHeight / 1080).toFixed(3)));
        const title = $('ll-lobby-title');
        if (title && !title.firstChild) {
            const mini = (kind) => `<span class="ll-mini-lantern">${LLFX.lanternSvg(kind)}</span>`;
            title.innerHTML = `<div class="ll-lobby-letters">${LLFX.lettersHtml('LUCKY LANTERNS', { stagger: 0.04 })}</div>
                <div class="ll-lobby-row">${mini('safe')}${mini('risk')}${mini('mystery')}</div>
                <p>Answer to earn a lantern · safe, risky or mystery · last round: ALL IN</p>`;
        }
    }

    function syncCannonLobbyTheme() {
        const inLobby = Boolean(hostState?.code) && isWordCannonFormat(hostState?.gameFormat)
            && hostState?.phase !== 'playing' && hostState?.phase !== 'finished';
        window.WCB?.syncLobbyTheme(inLobby);
    }

    function setHostCannonMode(active) {
        if (!window.WCB) return;
        if (!active) {
            WCB.setHostMode(false);
            return;
        }
        document.body.classList.add('live-host-race');
        document.body.classList.remove('ll-lobby', 'wc-lobby', 'live-host-lanterns');
        const race = $('live-host-race');
        if (race) race.hidden = true;
        const lanterns = $('live-host-lanterns');
        if (lanterns) lanterns.hidden = true;
        const grid = document.querySelector('.live-host-grid');
        if (grid) grid.hidden = true;
        stopRaceBgBlobs();
        stopLanternClock();
        WCB.setHostMode(true);
    }

    /** Sea-battle waiting screen (with Red / Blue buttons when players choose teams). */
    function syncPlayerCannonLobby(msg, snap) {
        if (!window.WCB) return;
        const body = document.body;
        const snapshot = snap || playerState?.lastSnapshot;
        const on = Boolean(playerState) && isWordCannonFormat(playerState?.gameFormat)
            && !body.classList.contains('live-game-active') && !body.classList.contains('live-cannon-player')
            && (snapshot?.phase || 'lobby') === 'lobby';
        WCB.syncPlayerLobby({
            on,
            snapshot,
            playerId: playerState?.playerId,
            nickname: playerState?.nickname || sessionStorage.getItem('ls_live_nickname') || $('live-play-nickname')?.textContent || 'Player',
            code: playerState?.code || sessionStorage.getItem('ls_live_room_code') || '',
            msg: msg && msg !== 'Waiting for the host to start…' ? msg : '',
            pickMode: snapshot?.teamAssignment === 'pick',
            onPick: (teamId) => ensureSocket().emit('live:join-team', { teamId }),
        });
    }

    // ---------------- phone ----------------
    /** Festival-themed waiting screen for players who joined a Lucky Lanterns room before it starts. */
    function syncPlayerLanternLobby(msg, snap) {
        const el = $('ll-player-lobby');
        const body = document.body;
        const snapshot = snap || playerState?.lastSnapshot;
        const on = Boolean(playerState) && isLuckyLanternsFormat(playerState?.gameFormat)
            && !body.classList.contains('live-game-active') && !body.classList.contains('live-lantern-player')
            && (snapshot?.phase || 'lobby') === 'lobby' && Boolean(window.LLFX);
        body.classList.toggle('ll-player-lobby', on);
        if (!el) return;
        el.hidden = !on;
        if (!on) return;
        LLFX.ensureDefs();
        llMountPhoneBackdrop();
        if (!el.firstChild) {
            const mini = (kind, label) => `<span class="llpl-lantern"><span class="llpl-lantern-art">${LLFX.lanternSvg(kind)}</span><span class="llpl-lantern-cap">${label}</span></span>`;
            el.innerHTML = `
                <div class="llpl-top"><span class="llp-logo">Lingo<span>Spark</span></span><span class="llpl-room">Room <b class="llpl-room-code"></b></span></div>
                <div class="llpl-title">
                    <div>${LLFX.lettersHtml('LUCKY', { delay: 0.1 })}</div>
                    <div>${LLFX.lettersHtml('LANTERNS', { delay: 0.35 })}</div>
                </div>
                <div class="llpl-lanterns">${mini('safe', 'Play safe')}${mini('risk', 'Go big')}${mini('mystery', 'Surprise')}</div>
                <div class="llpl-card">
                    <span class="llpl-label">You're in as</span>
                    <b class="llpl-name"></b>
                    <div class="llpl-wait"><span class="llpl-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="llpl-msg"></span></div>
                </div>
                <p class="llpl-count"></p>`;
        }
        const code = playerState?.code || sessionStorage.getItem('ls_live_room_code') || '';
        const codeEl = el.querySelector('.llpl-room-code');
        if (codeEl) codeEl.textContent = code || '----';
        const nameEl = el.querySelector('.llpl-name');
        if (nameEl) nameEl.textContent = playerState?.nickname || sessionStorage.getItem('ls_live_nickname') || $('live-play-nickname')?.textContent || 'Player';
        const msgEl = el.querySelector('.llpl-msg');
        if (msgEl && msg) msgEl.textContent = msg;
        else if (msgEl && !msgEl.textContent) msgEl.textContent = 'Waiting for the host to start…';
        const count = (snapshot?.players || []).length;
        const countEl = el.querySelector('.llpl-count');
        if (countEl) countEl.textContent = count ? `${count} ${count === 1 ? 'player' : 'players'} in the room` : '';
    }

    function llMountPhoneBackdrop() {
        const sky = $('ll-phone-sky');
        if (!sky || !window.LLFX) return;
        LLFX.ensureDefs();
        LLFX.mountBackdrop(sky, { portrait: true });
        sky.style.setProperty('--llu', String((Math.max(window.innerWidth / 780, window.innerHeight / 1688)).toFixed(3)));
    }

    const LL_PICK_NAMES = { safe: 'SAFE +100', risk: 'x2 or 0', mystery: 'Mystery', allin: 'ALL IN' };

    function llPhoneLanternBtn(kind, i, caption) {
        const c = LLFX.LANTERN_COLORS[kind];
        return `<button type="button" class="llp-lantern-btn" data-lantern="${kind}" style="--i:${i};--glow:${LLFX.rgba(c.main, 0.45)}" aria-label="${esc(caption)}">
            <span class="llp-lantern-art">${LLFX.lanternSvg(kind)}</span><span class="llp-cap">${esc(caption)}</span></button>`;
    }

    function llPhoneBig(kind) {
        const key = kind === 'allin' ? 'risk' : (kind || 'grey');
        const c = LLFX.LANTERN_COLORS[key] || LLFX.LANTERN_COLORS.grey;
        return `<div class="llp-big" style="--glow:${LLFX.rgba(c.main, 0.5)}">${LLFX.lanternSvg(kind === 'allin' ? 'allin' : (kind || 'grey'))}</div>`;
    }

    function llPhoneBodyHtml(state, you, avatar) {
        const mini = (kind) => `<span class="llp-mini">${LLFX.lanternSvg(kind)}</span>`;
        const outCard = (text) => `<div class="llp-card llp-card--out"><span class="llp-greylantern">${LLFX.lanternSvg('grey', { label: ['–'] })}</span>
                <b>No lantern this round</b><p>${esc(text)}</p></div>`;
        if (state.phase === 'picking' && you.eligible && !you.pick) {
            return `<div class="llp-hint">${LLFX.popTextHtml('Pick a lantern!')}</div>
                <div class="llp-lanterns">
                    ${llPhoneLanternBtn('safe', 0, 'SAFE +100')}
                    ${llPhoneLanternBtn('risk', 1, 'x2 or 0')}
                    ${llPhoneLanternBtn('mystery', 2, 'Mystery')}
                </div>
                ${state.isFinal ? `<button type="button" class="llp-allin" data-lantern="allin">${LLFX.popTextHtml('ALL IN?')}<small>Double your score — or lose it all</small></button>` : ''}`;
        }
        if (you.pick && (state.phase === 'picking' || state.phase === 'reveal')) {
            return `<div class="llp-stage" id="llp-stage">
                    ${llPhoneBig(you.pick)}
                    <div class="llp-av-sit is-fly">${LLFX.avatarHtml(avatar)}</div>
                    <div class="llp-fx" id="llp-fx"></div>
                </div>
                <p class="llp-caption" id="llp-caption">${state.phase === 'reveal' ? 'Here it comes…' : `You picked ${esc(LL_PICK_NAMES[you.pick] || you.pick)}. Watch the big screen!`}</p>`;
        }
        if (state.phase === 'reveal') {
            return outCard(you.eligible ? 'No pick in time — 0 points this round.' : 'Get the next one right to pick a lantern!');
        }
        if (state.phase === 'question' && !you.decision) return '';
        if (you.decision === 'prompt' || you.decision === 'pending') return '';
        if (you.status === 'ready' || you.eligible) {
            return `<div class="llp-card llp-card--good"><span class="llp-badge">${LL_SVG.check}</span><b>Correct!</b>
                <p>${state.phase === 'picking' ? 'Lantern picked!' : 'Lanterns open after any challenges.'}</p><div class="llp-minis">${mini('safe')}${mini('risk')}${mini('mystery')}</div></div>`;
        }
        if (you.status === 'out' || state.phase === 'picking' || state.phase === 'review') {
            return outCard('Get the next one right to pick a lantern!');
        }
        return '';
    }

    function paintPlayerResult(result, enteringScore) {
        const body = $('ll-phone-body');
        if (!body || !window.LLFX) return;
        const delta = Number(result?.delta) || 0;
        const title = String(result?.title || '0');
        const end = Number(result?.finalScore ?? result?.scoreAfter) || 0;
        const start = Number(enteringScore ?? result?.scoreBefore ?? end) || 0;
        const bust = result?.tone === 'bust' || (end < start);
        const headline = delta > 0 ? `+${formatLanternPoints(delta)}` : (end < start ? `-${formatLanternPoints(start - end)}` : title);
        body.innerHTML = `
            <div class="llp-card llp-summary ${bust ? 'is-bust' : (delta > 0 || end > start ? 'is-win' : '')}">
                <div class="llp-delta">${LLFX.popTextHtml(headline)}</div>
                <p>${esc(result?.detail || 'No points this round.')}</p>
                <div class="llp-stats">
                    <span class="llp-stat"><strong id="llp-final-score">${formatLanternPoints(start)}</strong>score</span>
                    <span class="llp-stat"><strong>#${result?.rank || '—'}</strong>rank</span>
                </div>
            </div>`;
        LLFX.countUp($('llp-final-score'), start, end, 800);
    }

    function llPhoneConfetti() {
        let canvas = document.querySelector('.llp-confetti');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.className = 'llp-confetti';
            document.body.appendChild(canvas);
        }
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        if (llPhone.cancelConfetti) llPhone.cancelConfetti();
        llPhone.cancelConfetti = LLFX.confetti(canvas, { burst: { x: window.innerWidth / 2, y: window.innerHeight * 0.4 }, rain: true, count: 70, duration: 3200 });
    }

    function llPhoneBeat(step, sfx) {
        const stage = $('llp-stage');
        const fx = $('llp-fx');
        const caption = $('llp-caption');
        const big = stage?.querySelector('.llp-big');
        const sit = stage?.querySelector('.llp-av-sit');
        const root = $('live-play-lantern');
        if (!stage || !step || !window.LLFX) {
            LiveAudio.playLanternSfx(sfx);
            return;
        }
        const cx = stage.clientWidth / 2;
        const shake = () => { if (root) llRestart(root, 'is-shake'); };
        if (step.group === 'safe') {
            LiveAudio.playLanternSfx('safe');
            if (big) llRestart(big, 'is-flash');
            llFloatText(`+${step.delta || 100}`, cx, 110, 'll-ft--safe', 'rise', fx);
            LLFX.sparkles(fx, cx, 120, { color: '#c6ff7a', n: 14, r0: 40, r1: 150, seed: 4 });
            if (caption) caption.textContent = step.detail || 'Safe lantern!';
        } else if (step.group === 'risk') {
            LiveAudio.playLanternSfx('coin');
            if (big) big.classList.add('is-dimmed');
            const wrap = document.createElement('div');
            wrap.className = 'llp-coin';
            wrap.innerHTML = LLFX.coinHtml();
            wrap.firstElementChild.classList.add(step.coin === 'double' ? 'lands-x2' : 'lands-0');
            fx?.appendChild(wrap);
            if (caption) caption.textContent = 'Flipping the coin…';
            llLater(() => {
                if (step.coin === 'double') {
                    LiveAudio.playLanternSfx('double');
                    llFloatText('x2!', cx, 240, 'll-ft--x2', 'pop', fx);
                    LLFX.sparkles(fx, cx, 110, { color: '#ffd23f', n: 16, r0: 50, r1: 170, seed: 6 });
                } else if (step.savedByShield) {
                    LiveAudio.playLanternSfx('safe');
                    llFloatText('🛡️ +100', cx, 240, 'll-ft--shield', 'pop', fx);
                } else {
                    LiveAudio.playLanternSfx('bust');
                    llFloatText('0', cx, 240, 'll-ft--zero', 'pop', fx);
                    LLFX.puff(fx, cx, 270, { scale: 0.8 });
                    sit?.classList.add('is-bust');
                    shake();
                }
                if (caption) caption.textContent = step.detail || '';
            }, 820);
        } else if (step.group === 'mystery') {
            LiveAudio.playLanternSfx('mystery');
            if (big) big.classList.add('is-hidden');
            if (sit) sit.classList.add('is-hidden');
            stage.insertAdjacentHTML('beforeend', llMysteryCardHtml(step, { phone: true }));
            if (caption) caption.textContent = '';
            llLater(() => LiveAudio.playLanternSfx('chime'), 700);
        } else if (step.group === 'allin') {
            LiveAudio.playLanternSfx('slam');
            if (caption) caption.textContent = 'ALL IN… drumroll!';
            llLater(() => {
                big?.classList.add('is-pulse');
                LiveAudio.playLanternSfx('drumroll');
            }, 380);
            llLater(() => {
                big?.classList.remove('is-pulse');
                big?.classList.add('is-boom');
                const win = step.coin === 'double' || step.tone === 'win';
                const saved = !win && Boolean(step.savedByShield);
                const res = document.createElement('div');
                res.className = `llp-allin-res ${win ? 'is-win' : (saved ? 'is-saved' : 'is-bust')}`;
                res.innerHTML = llResultHtml(win, saved);
                fx?.appendChild(res);
                if (win) {
                    LiveAudio.playLanternSfx('fanfare');
                    llPhoneConfetti();
                } else if (saved) {
                    LiveAudio.playLanternSfx('safe');
                } else {
                    LiveAudio.playLanternSfx('bust');
                    sit?.classList.add('is-bust');
                    shake();
                }
                if (caption) caption.textContent = step.detail || '';
            }, 1500);
        } else {
            LiveAudio.playLanternSfx(sfx);
        }
    }

    function schedulePlayerReveal(state) {
        if (state.phase !== 'reveal' || !state.reveal) return;
        if (lanternPlayerRevealSeq === state.reveal.seq) return;
        clearLanternReveal();
        lanternPlayerRevealSeq = state.reveal.seq;
        const youId = state.you?.id;
        const steps = state.reveal.steps || [];
        const mine = steps.find((step) => step.playerId === youId);
        for (const beat of state.reveal.beats || []) {
            const hits = (beat.stepIndexes || []).some((index) => steps[index]?.playerId === youId);
            if (!hits) continue;
            llLater(() => llPhoneBeat(mine, beat.sfx), LL_LEAD_MS + (beat.at || 0));
        }
        const boardAt = LL_LEAD_MS + (state.reveal.leaderboardAt || 0);
        const entering = Number(state.you?.score) || 0;
        llLater(() => {
            paintPlayerResult(state.you?.result, entering);
            const score = $('ll-phone-score');
            const rank = $('ll-phone-rank');
            if (score) LLFX.countUp(score, entering, Number(state.you?.finalScore) || 0, 800);
            if (rank) {
                rank.textContent = state.you?.finalRank ? `#${state.you.finalRank}` : '—';
                rank.classList.toggle('is-lead', state.you?.finalRank === 1 && Number(state.you?.finalScore) > 0);
            }
        }, boardAt);
        llPhone.revealDoneAt = Date.now() + boardAt + (state.isFinal ? 2600 : 1400);
    }

    function syncLanternQuestionChrome(state) {
        const you = state.you || {};
        const asking = state.phase === 'question' && !you.decision;
        const def = $('live-play-definition');
        const typeSection = $('live-play-type-section');
        const choices = $('live-play-choices');
        if (asking) {
            if (def) def.hidden = false;
            return;
        }
        if (you.decision === 'prompt' || you.decision === 'pending') {
            if (def) def.hidden = false;
            if (typeSection) typeSection.hidden = true;
            if (choices) choices.hidden = true;
            setAnswerInputsEnabled(false);
            return;
        }
        if (def) def.hidden = true;
        if (typeSection) typeSection.hidden = true;
        if (choices) choices.hidden = true;
        setAnswerInputsEnabled(false);
    }

    function renderLanternPlayer(state) {
        lanternPlayerState = state;
        if (state.phase !== 'reveal') {
            clearLanternReveal();
            lanternPlayerRevealSeq = -1;
        }
        const root = $('live-play-lantern');
        if (!root || !window.LLFX) return;
        root.hidden = false;
        document.body.classList.add('live-lantern-player');
        llMountPhoneBackdrop();
        const you = state.you || {};
        const me = (state.leaderboard || []).find((row) => row.id === you.id);
        if (me?.avatar) llPhone.avatar = me.avatar;
        const avatar = llPhone.avatar;
        const status = $('live-play-status');
        let note = '';
        if (state.phase === 'question' && !you.decision) note = 'Answer to earn a lantern.';
        else if (you.decision === 'prompt') note = 'Marked wrong. Challenge it, or continue.';
        else if (you.decision === 'pending') note = 'Waiting for the teacher.';
        else if (you.status === 'ready') note = 'Correct! Lanterns open after any challenges.';
        else if (you.status === 'out') note = 'No lantern this round.';
        else if (state.phase === 'picking' && you.eligible && !you.pick) note = state.isFinal ? 'Final round — pick a lantern or go ALL IN.' : 'Pick a lantern.';
        else if (you.pick) note = 'Lantern locked in. Watch the reveal.';
        else if (state.phase === 'reveal') note = 'Reveal!';
        if (status && note && !(state.phase === 'question' && !you.decision)) status.textContent = note;

        if (!root.querySelector('.llp-top')) {
            root.innerHTML = `
                <div class="llp-top"><span class="llp-logo">Lingo<span>Spark</span></span><span class="llp-round"></span>${llTimerRingHtml('ll-phone-ring')}</div>
                <div class="llp-me"><span class="llp-av"></span><span class="llp-name"></span><span id="ll-phone-rank" class="llp-rank"></span><span id="ll-phone-score" class="llp-score"></span></div>
                <div id="ll-phone-body" class="llp-body"></div>`;
            llPhone.key = null;
        }
        const roundEl = root.querySelector('.llp-round');
        if (roundEl) {
            roundEl.textContent = state.isFinal ? 'FINAL ROUND' : `Round ${state.round || 1} of ${state.rounds || 10}`;
            roundEl.classList.toggle('is-final', Boolean(state.isFinal));
        }
        const avEl = root.querySelector('.llp-av');
        if (avEl && avEl.dataset.av !== String(avatar || '')) {
            avEl.dataset.av = String(avatar || '');
            avEl.innerHTML = LLFX.avatarHtml(avatar);
        }
        const nameEl = root.querySelector('.llp-name');
        const nick = me?.nickname || playerState?.nickname || '';
        if (nameEl) nameEl.textContent = `${nick}${you.shield ? ' 🛡️' : ''}`;
        const revealing = state.phase === 'reveal' && lanternPlayerRevealSeq === state.reveal?.seq;
        if (!revealing) {
            const scoreEl = $('ll-phone-score');
            const rankEl = $('ll-phone-rank');
            if (scoreEl) {
                scoreEl.textContent = formatLanternPoints(you.score);
                scoreEl.style.color = LLFX.avatarScoreColor(avatar);
            }
            if (rankEl) {
                rankEl.textContent = you.rank ? `#${you.rank}` : '—';
                rankEl.classList.toggle('is-lead', you.rank === 1 && Number(you.score) > 0);
            }
        }
        paintTimerRing($('ll-phone-ring'), state);

        const body = $('ll-phone-body');
        const showPick = state.phase === 'picking' && you.eligible && !you.pick;
        const key = [state.questionId, state.phase, showPick ? 'pick' : '', you.pick || '', you.status || '', you.decision || '', state.reveal?.seq ?? ''].join('|');
        if (body && llPhone.key !== key) {
            llPhone.key = key;
            body.innerHTML = llPhoneBodyHtml(state, you, avatar);
        }
        body?.querySelectorAll('[data-lantern]').forEach((btn) => {
            if (btn.dataset.bound) return;
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                LiveAudio.playLanternSfx('pick');
                ensureSocket().emit('live:lantern-pick', { pick: btn.getAttribute('data-lantern') });
                body.querySelectorAll('[data-lantern]').forEach((other) => {
                    other.disabled = true;
                    if (other !== btn) other.classList.add('is-faded');
                });
                btn.classList.add('is-chosen');
            });
        });
        syncLanternQuestionChrome(state);
        if (you.decision !== 'prompt' && you.decision !== 'pending') hideChallengeActions();
        if (state.phase === 'reveal') schedulePlayerReveal(state);
        startLanternClock();
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('input[name="live-source"]').forEach((el) => {
            el.addEventListener('change', toggleLiveSourcePanels);
        });
        ['live-lobby-format', 'live-lobby-team', 'live-lobby-answer'].forEach((name) => {
            document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
                el.addEventListener('change', () => {
                    if (name === 'live-lobby-format') {
                        const teamRow = $('live-host-lobby-team-row');
                        const teamMode = usesTeamLobbyValue(el.value);
                        if (teamRow) teamRow.hidden = !teamMode;
                        const lanternRow = $('live-host-lobby-lantern-row');
                        if (lanternRow) lanternRow.hidden = el.value !== 'lucky-lanterns';
                        const cannonRow = $('live-host-lobby-cannon-row');
                        if (cannonRow) cannonRow.hidden = !isWordCannonFormat(el.value);
                        if (teamMode) {
                            // Prefer random teams when entering a team format so Start is not blocked.
                            const checked = document.querySelector('input[name="live-lobby-team"]:checked');
                            if (!checked) {
                                document.querySelectorAll('input[name="live-lobby-team"]').forEach((r) => {
                                    r.checked = r.value === 'random';
                                });
                            }
                        }
                    }
                    emitHostLobbySettings();
                });
            });
        });
        $('live-host-fullscreen-btn')?.addEventListener('click', () => {
            toggleLiveFullscreen($('live-host-race') || document.documentElement).catch(() => {
                showLiveError('Fullscreen is not available in this browser.');
            });
        });
        $('live-play-fullscreen-btn')?.addEventListener('click', () => {
            toggleLiveFullscreen($('screen-live-play') || document.documentElement).catch(() => {
                showLiveError('Fullscreen is not available in this browser.');
            });
        });
        document.addEventListener('fullscreenchange', updateFullscreenButtons);
        document.addEventListener('webkitfullscreenchange', updateFullscreenButtons);
        $('live-host-wordset')?.addEventListener('change', onHostWordSetSelected);
        $('live-host-create-btn')?.addEventListener('click', createHostRoom);
        $('live-join-btn')?.addEventListener('click', joinRoom);
        ['live-join-code', 'live-join-nickname'].forEach((id) => {
            $(id)?.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                joinRoom();
            });
        });
        $('live-host-start')?.addEventListener('click', hostStartGame);
        $('live-host-play-again')?.addEventListener('click', hostPlayAgain);
        $('live-host-end')?.addEventListener('click', hostEnd);
        $('live-host-race-end')?.addEventListener('click', hostEnd);
        // Teacher-driven skips should not wait for the reveal animation before the podium.
        $('ll-end')?.addEventListener('click', () => {
            llHost.revealDoneAt = 0;
            hostEnd();
        });
        $('ll-skip')?.addEventListener('click', () => {
            llHost.revealDoneAt = 0;
            if (lanternHostState?.phase === 'reveal') ensureSocket().emit('live:lantern-next');
            else ensureSocket().emit('live:lantern-skip');
        });
        $('ll-next')?.addEventListener('click', () => {
            llHost.revealDoneAt = 0;
            ensureSocket().emit('live:lantern-next');
        });
        $('ll-full')?.addEventListener('click', () => {
            toggleLiveFullscreen($('live-host-lanterns') || document.documentElement).catch(() => {
                showLiveError('Fullscreen is not available in this browser.');
            });
        });
        $('live-lobby-rounds')?.addEventListener('change', emitHostLobbySettings);
        $('live-lobby-game-minutes')?.addEventListener('change', emitHostLobbySettings);
        window.WCB?.init({
            emit: (event, payload) => ensureSocket().emit(event, payload),
            hostEnd,
            fullscreen: (el) => toggleLiveFullscreen(el || document.documentElement).catch(() => {
                showLiveError('Fullscreen is not available in this browser.');
            }),
            playerId: () => playerState?.playerId ?? null,
            nickname: () => playerState?.nickname || sessionStorage.getItem('ls_live_nickname') || '',
            roomCode: () => hostState?.code || $('live-host-code')?.textContent || '',
            setAnswerInputsEnabled,
            hideChallengeActions,
        });
        $('live-lobby-question-time')?.addEventListener('change', emitHostLobbySettings);
        bindHostLobbyBoard();
        $('live-play-submit')?.addEventListener('click', () => submitPlayerAnswer());
        $('live-play-captain-submit')?.addEventListener('click', submitCaptainAnswer);
        $('live-play-crew-vote-btn')?.addEventListener('click', submitCrewVoteFromInput);
        $('live-play-create-team')?.addEventListener('click', () => ensureSocket().emit('live:create-team'));
        $('live-play-answer')?.addEventListener('input', () => {
            const input = $('live-play-answer');
            if (input) input.dataset.captainTouched = input.value.trim() ? '1' : '';
        });
        $('live-play-answer')?.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const crewVoteBtn = $('live-play-crew-vote-btn');
            const captainBtn = $('live-play-captain-submit');
            if (playerIsCaptain && captainBtn && !captainBtn.hidden) {
                submitCaptainAnswer();
            } else if (crewVoteBtn && !crewVoteBtn.hidden) submitCrewVoteFromInput();
            else submitPlayerAnswer();
        });
        toggleLiveSourcePanels();
    });

    window.LiveGame = { openHost, openHostWithGlossary, openJoin, openPlay, createHostRoom, joinRoom, onAuthChanged };
})();
