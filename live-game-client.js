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

    function rankingRowsHtml(players, winnerId, { limit = 0, scoreMode = false } = {}) {
        const ranked = [...(players || [])].sort(
            (a, b) => (b.score ?? b.progress ?? 0) - (a.score ?? a.progress ?? 0) || String(a.nickname || '').localeCompare(String(b.nickname || ''))
        );
        const rows = limit > 0 ? ranked.slice(0, limit) : ranked;
        if (!rows.length) return '<li><span>No scores yet</span></li>';
        return rows.map((p, i) => {
            const isWinner = p.id === winnerId || (scoreMode && (p.rank === 1));
            const members = Array.isArray(p.memberNicknames) && p.memberNicknames.length
                ? `<span class="live-rank-members">${esc(p.memberNicknames.join(', '))}</span>`
                : '';
            const scoreLabel = scoreMode
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
        if (!screen || !content || !winnerNickname) return;
        const teamMode = Boolean(options.teamMode);
        const lantern = Boolean(options.lantern);
        const youMsg = isYou ? (teamMode ? " That's your team!" : " That's you!") : '';
        const ranking = options.ranking || [];
        screen.classList.toggle('live-winner-screen--lanterns', lantern);
        LiveAudio.stopAll();
        LiveAudio.playFanfare();
        launchConfetti(12000);
        const podium = lantern ? lanternPodiumHtml(ranking) : '';
        const headline = lantern
            ? `<h2>Festival champion</h2><p><strong>${esc(winnerNickname)}</strong> lit up the night.${youMsg}</p>${podium}`
            : `<h2>🏆 Champion!</h2><p><strong>${esc(winnerNickname)}</strong> completed all 12 terms first!${youMsg}</p>`;
        content.innerHTML = `
            ${headline}
            <ol class="live-winner-scores" aria-label="${teamMode ? 'Team scores' : 'Player scores'}">${rankingRowsHtml(ranking, options.winnerId, { scoreMode: lantern })}</ol>
            <button type="button" class="btn btn-blue" id="live-winner-dismiss" style="padding:0.75rem 2rem;">Continue</button>`;
        screen.hidden = false;
        $('live-winner-dismiss')?.addEventListener('click', () => {
            hideLiveWinnerScreen();
            showLiveRankingScreen(ranking, options.winnerId, { teamMode, lantern });
        }, { once: true });
    }

    function hideLiveWinnerScreen() {
        const screen = $('live-winner-screen');
        if (screen) screen.hidden = true;
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
        if (title) title.textContent = options.lantern ? 'Lucky Lanterns ranking' : (options.teamMode ? 'Final team ranking' : 'Final ranking');
        list.innerHTML = rankingRowsHtml(players, winnerId, { scoreMode: Boolean(options.lantern) });
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

        /** Short WebAudio cues for Lucky Lanterns. No extra audio files. */
        playLanternSfx(name) {
            try {
                const ctx = this._ensureAudioCtx();
                if (!ctx) return;
                const now = ctx.currentTime;
                const tone = (freq, start, dur, type = 'sine', volume = 0.18, slideTo = null) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = type;
                    osc.frequency.setValueAtTime(freq, now + start);
                    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + start + dur);
                    gain.gain.setValueAtTime(0.0001, now + start);
                    gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + start);
                    osc.stop(now + start + dur + 0.02);
                };
                if (name === 'pick') {
                    tone(660, 0, 0.09, 'triangle', 0.16);
                    tone(880, 0.08, 0.14, 'triangle', 0.16);
                } else if (name === 'safe') {
                    tone(523.25, 0, 0.16, 'triangle', 0.2);
                    tone(659.25, 0.12, 0.22, 'triangle', 0.2);
                } else if (name === 'coin') {
                    [0, 0.12, 0.24, 0.36].forEach((start, i) => tone(700 + i * 40, start, 0.08, 'square', 0.06));
                } else if (name === 'double') {
                    tone(523.25, 0, 0.12, 'triangle', 0.18);
                    tone(659.25, 0.1, 0.12, 'triangle', 0.18);
                    tone(783.99, 0.2, 0.22, 'triangle', 0.2);
                } else if (name === 'bust') {
                    tone(392, 0, 0.28, 'sawtooth', 0.08, 110);
                } else if (name === 'mystery') {
                    tone(880, 0, 0.1, 'sine', 0.14);
                    tone(1174, 0.08, 0.12, 'sine', 0.14);
                    tone(1568, 0.16, 0.2, 'triangle', 0.12);
                } else if (name === 'drumroll') {
                    const length = Math.floor(ctx.sampleRate * 1.15);
                    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
                    const data = buffer.getChannelData(0);
                    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (0.25 + (i / length) * 0.75);
                    const src = ctx.createBufferSource();
                    src.buffer = buffer;
                    const filter = ctx.createBiquadFilter();
                    filter.type = 'bandpass';
                    filter.frequency.value = 220;
                    const gain = ctx.createGain();
                    gain.gain.setValueAtTime(0.0001, now);
                    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
                    src.connect(filter);
                    filter.connect(gain);
                    gain.connect(ctx.destination);
                    src.start(now);
                    for (let i = 0; i < 7; i++) tone(140 + i * 8, i * 0.14, 0.09, 'square', 0.04);
                }
            } catch { /* ignore autoplay / AudioContext errors */ }
        },
    };

    // --- Confetti ---
    function launchConfetti(durationMs = 4500) {
        const canvas = $('live-confetti-canvas');
        if (!canvas) return;
        canvas.classList.add('active');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const colors = ['#012169', '#C8102E', '#d4a017', '#00823B', '#5F7FFF', '#FFD700'];
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
        if (isTeamFormatValue(snap?.gameFormat) && snap?.teamAssignment === 'pick') {
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
        const isPickTeams = isTeamGame && (snapshot?.teamAssignment || hostState?.teamAssignment) === 'pick';
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
                ? `${count} players · ${lanternGame ? 'Lucky Lanterns' : (isTeamGame ? 'team race' : 'solo race')}`
                : `${count} player${count === 1 ? '' : 's'} joined (minimum ${minPlayers} to start)`;
        }
        if (playing) {
            btn.textContent = 'Game in progress…';
            if (status) {
                status.textContent = lanternGame
                    ? `Lucky Lanterns — ${snapshot?.lanternRounds || hostState?.lanternRounds || 10} rounds`
                    : isTeamGame
                    ? `${gameFormatLabel(format, snapshot?.teamAssignment || hostState?.teamAssignment)} — teams race to 12!`
                    : 'Race underway — first to 12 terms in a row wins!';
            }
        } else if (count < minPlayers) {
            btn.textContent = `Start game (need ${minPlayers}+ players)`;
            if (status) status.textContent = `Waiting for players (${count} / ${minPlayers} minimum)…`;
        } else if (isPickTeams && !canStart && !finished) {
            btn.textContent = 'Start game (teams not ready)';
            if (status) status.textContent = 'Players are choosing teams (2–4 per team, all players assigned)…';
        } else {
            btn.textContent = 'Start game';
            if (status) {
                status.textContent = finished
                    ? 'Game over — change format if you like, then Start game (players stay in the room).'
                    : lanternGame
                        ? `${count} players ready for Lucky Lanterns.`
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
        ['live:host-joined', 'live:progress-update', 'live:room-state', 'live:game-started', 'live:game-finished', 'live:lobby-reset', 'live:host-answer', 'live:challenge-pending', 'live:challenge-resolved', 'live:settings-updated', 'live:lantern-state', 'live:error'].forEach((ev) => s.off(ev));

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
            if (data.snapshot?.phase === 'playing') {
                if (isLuckyLanternsFormat(hostState.gameFormat)) setHostLanternMode(true);
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
            if (!data.challengeable) {
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
                if (!isLuckyLanternsFormat(hostState?.gameFormat)) {
                    const board = $('live-host-race-board');
                    if (board) board._lastPlayers = data.players || [];
                    renderHostRaceBoard(data.players || [], { flashId: hostState.lastFlashId });
                }
                hostState.lastFlashId = null;
            } else if (isTeamFormatValue(hostState?.gameFormat) && hostState?.teamAssignment === 'pick') {
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
            hostRaceColors = new Map();
            hostPendingChallenges = new Map();
            renderHostChallengePanel();
            hideLiveWinnerScreen();
            const ranking = $('live-ranking-screen');
            if (ranking) ranking.hidden = true;
            const playAgain = $('live-host-play-again');
            if (playAgain) playAgain.hidden = true;
            stopHostLobbyPoll();
            LiveAudio.stopLobby();
            LiveAudio.startGame();
            if (isLuckyLanternsFormat(hostState.gameFormat)) setHostLanternMode(true);
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

        s.on('live:game-finished', (data) => {
            hostState.phase = 'finished';
            hostPendingChallenges = new Map();
            renderHostChallengePanel();
            stopHostLobbyPoll();
            LiveAudio.stopAll();
            setHostRaceMode(false);
            if (data.winnerNickname) {
                showLiveWinnerScreen(data.winnerNickname, false, {
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
        });

        s.on('live:lobby-reset', (data) => {
            noteLobbySettingsAck(data.settingsSeq);
            hostState.phase = 'lobby';
            hostState.gameFormat = data.snapshot?.gameFormat || hostState.gameFormat || 'race';
            hostState.teamAssignment = data.snapshot?.teamAssignment || hostState.teamAssignment || 'random';
            hostState.answerMode = data.snapshot?.answerMode || hostState.answerMode || 'randomise';
            hostState.lanternRounds = data.snapshot?.lanternRounds || hostState.lanternRounds || 10;
            hostPendingChallenges = new Map();
            document.body.classList.remove('live-lantern-player');
            clearLanternReveal();
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
        ['live:player-joined', 'live:room-state', 'live:game-started', 'live:your-question', 'live:answer-result', 'live:crew-vote-update', 'live:progress-update', 'live:game-finished', 'live:lobby-reset', 'live:player-removed', 'live:challenge-submitted', 'live:challenge-resolved', 'live:lantern-state', 'live:error'].forEach((ev) => s.off(ev));

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
            if (isLuckyLanternsFormat(playerState.gameFormat)) document.body.classList.add('live-lantern-player');
            setLiveGameActive(true);
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

        s.on('live:answer-result', (result) => {
            answerPending = false;
            if (result?.lantern || result?.gameFormat === 'lucky-lanterns') {
                if (result.challengeable) showChallengeActions(result);
                else hideChallengeActions();
                return;
            }
            playerCrewVote = null;
            const status = $('live-play-status');
            const resultEl = $('live-play-result');
            const teamLabel = isTeamMode() ? 'Team' : 'You';

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
            if (data.winnerNickname) {
                showLiveWinnerScreen(data.winnerNickname, isWinner, {
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
        });

        s.on('live:lobby-reset', (data) => {
            hideLiveWinnerScreen();
            const ranking = $('live-ranking-screen');
            if (ranking) ranking.hidden = true;
            setLiveGameActive(false);
            document.body.classList.remove('live-lantern-player');
            const phone = $('live-play-lantern');
            if (phone) phone.hidden = true;
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
    };

    function answerModeLabel(mode) {
        return ANSWER_MODE_LABELS[mode] || ANSWER_MODE_LABELS.randomise;
    }

    function updateHostModeLabel() {
        const modeEl = $('live-host-answer-mode');
        if (!modeEl || !hostState) return;
        modeEl.hidden = false;
        modeEl.textContent = isTeamFormatValue(hostState.gameFormat)
            ? `Format: ${gameFormatLabel(hostState.gameFormat, hostState.teamAssignment)} · ${answerModeLabel(hostState.answerMode)}`
            : `Mode: ${answerModeLabel(hostState.answerMode)} · ${gameFormatLabel(hostState.gameFormat)}`;
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
        if (teamRow) teamRow.hidden = !isTeamFormatValue(format);
        const lanternRow = $('live-host-lobby-lantern-row');
        if (lanternRow) lanternRow.hidden = format !== 'lucky-lanterns';
        const roundsInput = $('live-lobby-rounds');
        if (roundsInput && document.activeElement !== roundsInput) {
            roundsInput.value = String(snap?.lanternRounds || hostState?.lanternRounds || 10);
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
        if (isTeamFormatValue(gameFormat) && !document.querySelector('input[name="live-lobby-team"]:checked')) {
            teamAssignment = 'random';
            document.querySelectorAll('input[name="live-lobby-team"]').forEach((el) => {
                el.checked = el.value === 'random';
            });
        }
        if (!isTeamFormatValue(gameFormat)) teamAssignment = 'random';
        const answerMode = document.querySelector('input[name="live-lobby-answer"]:checked')?.value
            || hostState.answerMode
            || 'randomise';
        const lanternRounds = Number($('live-lobby-rounds')?.value || hostState.lanternRounds || 10);
        const settingsSeq = ++lobbySettingsSeq;
        ensureSocket().emit('live:set-settings', { gameFormat, teamAssignment, answerMode, lanternRounds, settingsSeq });
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
        if (isTeamFormatValue(format)) {
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
        ensureSocket().emit('live:crew-vote', { text });
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
        ensureSocket().emit('live:submit-answer', { text });
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
        ensureSocket().emit('live:submit-answer', { text });
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
        if (lanternMode) document.body.classList.add('live-lantern-player');
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
            } else {
                const modeHint = choiceMode ? 'Tap the matching term' : 'Type the matching term';
                status.textContent = `Term ${(q.progress || 0) + 1} of ${q.termsToWin || TERMS_TO_WIN} — ${modeHint}`;
            }
        }
        if (!lanternMode) updateOwnProgress(q.progress || 0, q.termsToWin || TERMS_TO_WIN);
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

    let lanternHostState = null;
    let lanternPlayerState = null;
    let lanternClockTimer = null;
    let lanternRevealSeq = -1;
    let lanternPlayerRevealSeq = -1;
    let lanternRevealTimers = [];

    function formatLanternPoints(value) {
        return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-US');
    }

    function lanternClockText(state) {
        if (!state?.phaseEndsAt) return state?.phase === 'review' ? '…' : '0:00';
        const seconds = Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000));
        const mins = Math.floor(seconds / 60);
        const rest = seconds % 60;
        return `${mins}:${String(rest).padStart(2, '0')}`;
    }

    function lanternPodiumHtml(players) {
        const ranked = [...(players || [])].sort((a, b) => (a.rank || 99) - (b.rank || 99)).slice(0, 3);
        if (!ranked.length) return '';
        const order = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
        return `<div class="ll-podium">${order.map((row) => `
            <div class="ll-podium-slot place-${row.rank || 1}">
                <span>${row.avatar || '🏮'}</span>
                <b>${esc(row.nickname)}</b>
                <span>${formatLanternPoints(row.score ?? row.progress)}</span>
            </div>`).join('')}</div>`;
    }

    function clearLanternReveal() {
        lanternRevealTimers.forEach((timer) => clearTimeout(timer));
        lanternRevealTimers = [];
    }

    function startLanternClock() {
        if (lanternClockTimer) return;
        lanternClockTimer = setInterval(() => {
            const hostTime = $('ll-timer');
            if (hostTime && lanternHostState) {
                hostTime.textContent = lanternClockText(lanternHostState);
                const left = lanternHostState.phaseEndsAt ? lanternHostState.phaseEndsAt - Date.now() : 99999;
                hostTime.classList.toggle('is-low', Boolean(lanternHostState.phaseEndsAt) && left < 5000);
            }
            const phoneTime = $('ll-phone-time');
            if (phoneTime && lanternPlayerState) phoneTime.textContent = lanternClockText(lanternPlayerState);
        }, 250);
    }

    function stopLanternClock() {
        if (!lanternClockTimer) return;
        clearInterval(lanternClockTimer);
        lanternClockTimer = null;
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
        if (race) race.hidden = true;
        if (board) board.hidden = false;
        if (grid) grid.hidden = true;
        stopRaceBgBlobs();
        startLanternClock();
    }

    function lanternFiguresHtml(highlight) {
        const figs = [
            { key: 'safe', name: 'SAFE', sub: '+100', cls: 'safe' },
            { key: 'risk', name: 'x2', sub: 'or 0', cls: 'risk' },
            { key: 'mystery', name: '?', sub: 'mystery', cls: 'mystery' },
        ];
        return figs.map((fig) => `
            <div class="ll-fig ${fig.cls}${highlight && highlight !== fig.key ? ' is-dim' : ''}${highlight === fig.key ? ' is-hot' : ''}">
                <div class="ll-fig-body"><strong>${fig.name}</strong><span>${fig.sub}</span></div>
                <div class="ll-fig-tassel"></div>
            </div>`).join('');
    }

    function renderLanternBoard(rows, { pop = false } = {}) {
        const list = $('ll-board-list');
        if (!list) return;
        list.innerHTML = (rows || []).map((row) => `
            <li class="ll-row${row.rank === 1 ? ' is-lead' : ''}${pop ? ' is-move' : ''}">
                <span class="ll-rank">${row.rank || ''}</span>
                <span class="ll-av">${row.avatar || '🏮'}</span>
                <span class="ll-name">${esc(row.nickname || '')}${row.shield ? ' 🛡️' : ''}</span>
                <span class="ll-score">${formatLanternPoints(row.score)}</span>
            </li>`).join('') || '<li class="ll-row"><span class="ll-name">Waiting for players…</span></li>';
    }

    function renderLanternPicked(state) {
        const strip = $('ll-picked');
        if (!strip) return;
        const picking = state.phase === 'picking' || state.phase === 'reveal';
        const ids = new Set(picking ? (state.pickedIds || []) : []);
        const people = (state.leaderboard || []).filter((row) => (
            picking ? ids.has(row.id) : row.status && row.status !== 'answering'
        ));
        const label = picking ? '★ Already picked a lantern' : '★ Answered';
        strip.innerHTML = `<span class="ll-picked-label">${label}</span>${
            people.map((row) => `<span class="ll-chip" title="${esc(row.nickname)}">${row.avatar || '🏮'}</span>`).join('')
            || '<span>Waiting…</span>'
        }`;
    }

    function renderLanternStage(state) {
        const card = $('ll-stage-card');
        const row = $('ll-lantern-row');
        if (row) row.innerHTML = lanternFiguresHtml(state.phase === 'question' || state.phase === 'review' ? null : null);
        if (!card) return;
        if (state.phase === 'question' || state.phase === 'review') {
            if (row) row.classList.add('is-dim');
            const mode = state.inputMode === 'choice' ? 'Recognise' : 'Realise';
            const answer = state.correctTerm ? `<p class="ll-teacher-answer">Answer: <strong>${esc(state.correctTerm)}</strong></p>` : '';
            const wait = state.phase === 'review'
                ? '<p class="ll-qwait">Challenges first — lanterns open when the teacher is done, so nobody loses pick time.</p>'
                : '';
            card.innerHTML = `
                <div class="ll-qcard">
                    <div class="ll-qmeta"><span>${mode}</span><span>${state.answeredCount || 0} / ${state.playerCount || 0} answered</span></div>
                    <p class="ll-qdef">${esc(state.definition || '')}</p>
                    ${answer}${wait}
                </div>`;
            return;
        }
        if (row) row.classList.remove('is-dim');
        if (state.phase === 'picking') {
            card.innerHTML = `
                <div class="ll-reveal-card">
                    <p class="ll-reveal-kicker">${state.correctCount || 0} correct</p>
                    <p class="ll-reveal-title">Pick a lantern</p>
                    <p>${state.isFinal ? 'Final round — ALL IN is on the phones.' : 'Green is safe. Orange is a coin flip. Purple is a mystery.'}</p>
                    ${state.correctTerm ? `<p class="ll-teacher-answer">Answer was <strong>${esc(state.correctTerm)}</strong></p>` : ''}
                </div>`;
        }
    }

    function revealCardHtml(steps) {
        const cards = (steps || []).map((step) => {
            const tone = step.tone || 'neutral';
            const allin = step.group === 'allin' ? '<p class="ll-allin-label">ALL IN?</p>' : '';
            return `<div class="ll-reveal-card ${tone}${step.group === 'allin' ? ' allin' : ''}">
                ${allin}
                <p class="ll-reveal-kicker">${esc(step.nickname || '')}</p>
                <p class="ll-reveal-title">${esc(step.title || '')}</p>
                <p>${esc(step.detail || '')}</p>
            </div>`;
        }).join('');
        return cards || '<div class="ll-reveal-card"><p>No lanterns this round.</p></div>';
    }

    function playHostReveal(state) {
        if (state.phase !== 'reveal' || !state.reveal) return;
        if (lanternRevealSeq === state.reveal.seq) return;
        clearLanternReveal();
        lanternRevealSeq = state.reveal.seq;
        const row = $('ll-lantern-row');
        if (row) row.innerHTML = lanternFiguresHtml(null);
        const card = $('ll-stage-card');
        if (card) {
            card.innerHTML = `<div class="ll-reveal-card"><p class="ll-reveal-kicker">Reveal</p><p class="ll-reveal-title">Watch the lanterns</p></div>`;
        }
        const steps = state.reveal.steps || [];
        for (const beat of state.reveal.beats || []) {
            lanternRevealTimers.push(setTimeout(() => {
                const shown = (beat.stepIndexes || []).map((index) => steps[index]).filter(Boolean);
                const highlight = shown[0]?.group === 'safe' ? 'safe' : shown[0]?.group === 'risk' ? 'risk' : shown[0]?.group === 'mystery' ? 'mystery' : null;
                if (row) row.innerHTML = lanternFiguresHtml(highlight);
                if (card) card.innerHTML = revealCardHtml(shown);
                LiveAudio.playLanternSfx(beat.sfx);
                const step = shown[0];
                if (beat.sfx === 'coin' || beat.sfx === 'drumroll') {
                    lanternRevealTimers.push(setTimeout(() => {
                        LiveAudio.playLanternSfx(step?.tone === 'bust' && !step?.savedByShield ? 'bust' : 'double');
                    }, beat.sfx === 'drumroll' ? 1500 : 650));
                }
            }, beat.at || 0));
        }
        lanternRevealTimers.push(setTimeout(() => {
            renderLanternBoard(state.finalLeaderboard || state.leaderboard, { pop: true });
            if (row) row.innerHTML = lanternFiguresHtml(null);
        }, state.reveal.leaderboardAt || 0));
    }

    function renderLanternHost(state) {
        lanternHostState = state;
        if (state.phase !== 'reveal') clearLanternReveal();
        const round = $('ll-round');
        if (round) round.innerHTML = `Round <strong>${state.round || 1}</strong> of ${state.rounds || 10}`;
        const timer = $('ll-timer');
        if (timer) timer.textContent = lanternClockText(state);
        renderLanternBoard(state.phase === 'reveal' ? state.leaderboard : (state.finalLeaderboard || state.leaderboard));
        renderLanternPicked(state);
        const skip = $('ll-skip');
        const next = $('ll-next');
        if (skip) {
            skip.hidden = false;
            skip.textContent = state.phase === 'reveal'
                ? 'Skip reveal'
                : state.phase === 'review'
                    ? 'Resolve & continue'
                    : 'Skip';
        }
        if (next) next.hidden = state.phase !== 'reveal';
        if (state.phase === 'reveal') playHostReveal(state);
        else renderLanternStage(state);
        startLanternClock();
    }

    function paintPlayerResult(result) {
        const body = $('ll-phone-body');
        if (!body) return;
        const title = result?.title || '0';
        const detail = result?.detail || 'No points this round.';
        body.innerHTML = `
            <div class="ll-result-card">
                <strong>${esc(title)}</strong>
                <p>${esc(detail)}</p>
                <p>Score ${formatLanternPoints(result?.finalScore ?? result?.scoreAfter)} · rank ${result?.rank || '—'}</p>
            </div>`;
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
            lanternRevealTimers.push(setTimeout(() => {
                paintPlayerResult(mine);
                LiveAudio.playLanternSfx(beat.sfx);
            }, beat.at || 0));
        }
        lanternRevealTimers.push(setTimeout(() => {
            paintPlayerResult(state.you?.result);
            const score = $('ll-phone-score');
            const rank = $('ll-phone-rank');
            if (score) score.textContent = formatLanternPoints(state.you?.finalScore);
            if (rank) rank.textContent = state.you?.finalRank ? `#${state.you.finalRank}` : '—';
        }, state.reveal.leaderboardAt || 0));
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
        if (!root) return;
        root.hidden = false;
        document.body.classList.add('live-lantern-player');
        const you = state.you || {};
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

        const showPick = state.phase === 'picking' && you.eligible && !you.pick;
        const asking = state.phase === 'question' && !you.decision;
        const pickName = { safe: 'SAFE +100', risk: 'x2 or 0', mystery: '?', allin: 'ALL IN' };
        root.innerHTML = `
            <div class="ll-phone-top">
                <span class="ll-phone-round">Round ${state.round || 1} of ${state.rounds || 10}</span>
                <span id="ll-phone-time" class="ll-phone-time">${lanternClockText(state)}</span>
            </div>
            <div class="ll-phone-meta">
                <span id="ll-phone-score">${formatLanternPoints(you.score)} pts${you.shield ? ' 🛡️' : ''}</span>
                <span id="ll-phone-rank">${you.rank ? `#${you.rank}` : '—'}</span>
            </div>
            <div id="ll-phone-body">
                ${showPick ? `
                    <div class="ll-pick-grid">
                        <button type="button" class="ll-lantern-btn" data-lantern="safe"><div class="ll-fig safe"><div class="ll-fig-body"><strong>SAFE</strong><span>+100</span></div><div class="ll-fig-tassel"></div></div></button>
                        <button type="button" class="ll-lantern-btn" data-lantern="risk"><div class="ll-fig risk"><div class="ll-fig-body"><strong>x2</strong><span>or 0</span></div><div class="ll-fig-tassel"></div></div></button>
                        <button type="button" class="ll-lantern-btn" data-lantern="mystery"><div class="ll-fig mystery"><div class="ll-fig-body"><strong>?</strong><span>mystery</span></div><div class="ll-fig-tassel"></div></div></button>
                    </div>
                    ${state.isFinal ? '<button type="button" class="ll-allin-btn" data-lantern="allin">ALL IN? Bet your score</button>' : ''}
                ` : you.pick ? `<p class="ll-phone-note">You picked ${esc(pickName[you.pick] || you.pick)}.</p>` : (asking ? '' : `<p class="ll-phone-note">${esc(note)}</p>`)}
            </div>`;
        root.querySelectorAll('[data-lantern]').forEach((btn) => {
            btn.addEventListener('click', () => {
                LiveAudio.playLanternSfx('pick');
                ensureSocket().emit('live:lantern-pick', { pick: btn.getAttribute('data-lantern') });
                root.querySelectorAll('[data-lantern]').forEach((other) => { other.disabled = true; });
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
                        const teamMode = isTeamFormatValue(el.value);
                        if (teamRow) teamRow.hidden = !teamMode;
                        const lanternRow = $('live-host-lobby-lantern-row');
                        if (lanternRow) lanternRow.hidden = el.value !== 'lucky-lanterns';
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
        $('ll-end')?.addEventListener('click', hostEnd);
        $('ll-skip')?.addEventListener('click', () => {
            if (lanternHostState?.phase === 'reveal') ensureSocket().emit('live:lantern-next');
            else ensureSocket().emit('live:lantern-skip');
        });
        $('ll-next')?.addEventListener('click', () => ensureSocket().emit('live:lantern-next'));
        $('ll-full')?.addEventListener('click', () => {
            toggleLiveFullscreen($('live-host-lanterns') || document.documentElement).catch(() => {
                showLiveError('Fullscreen is not available in this browser.');
            });
        });
        $('live-lobby-rounds')?.addEventListener('change', emitHostLobbySettings);
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
