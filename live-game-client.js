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
    let captainSuggestedAnswer = null;
    let currentQuestion = null;

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
        $('live-host-finished').hidden = true;
        if ($('live-host-champion')) $('live-host-champion').hidden = true;
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
                if (document.body.classList.contains('live-game-active')) {
                    requestPlayerQuestion();
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

    function showLiveWinnerScreen(winnerNickname, isYou, options = {}) {
        const screen = $('live-winner-screen');
        const content = $('live-winner-content');
        if (!screen || !content || !winnerNickname) return;
        const teamMode = Boolean(options.teamMode);
        const youMsg = isYou ? (teamMode ? " That's your team!" : " That's you!") : '';
        launchConfetti(12000);
        content.innerHTML = `
            <h2>🏆 Champion!</h2>
            <p><strong>${esc(winnerNickname)}</strong> completed all 12 terms first!${youMsg}</p>
            <button type="button" class="btn btn-blue" id="live-winner-dismiss" style="padding:0.75rem 2rem;">Continue</button>`;
        screen.hidden = false;
        $('live-winner-dismiss')?.addEventListener('click', hideLiveWinnerScreen, { once: true });
    }

    function hideLiveWinnerScreen() {
        const screen = $('live-winner-screen');
        if (screen) screen.hidden = true;
        const canvas = $('live-confetti-canvas');
        if (canvas) {
            canvas.classList.remove('active');
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        if (confettiAnim) cancelAnimationFrame(confettiAnim);
        confettiAnim = null;
    }

    function applyGlossaryPrefill() {
        const terms = sessionStorage.getItem('ls_live_prefill_glossary');
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
        VOLUME: 0.45,

        _track(src) {
            const a = new Audio(src);
            a.loop = true;
            a.preload = 'auto';
            return a;
        },

        _play(audio) {
            if (!audio) return;
            audio.volume = this.VOLUME;
            audio.play().catch(() => {});
        },

        _pause(audio) {
            if (!audio) return;
            audio.pause();
            try { audio.currentTime = 0; } catch { /* ignore */ }
        },

        startLobby() {
            this.stopGame();
            if (!this.lobby) this.lobby = this._track('/audio/live-lobby.mp3');
            this._play(this.lobby);
        },

        startGame() {
            this.stopLobby();
            if (!this.game) this.game = this._track('/audio/live-gameplay.mp3');
            this._play(this.game);
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
            const members = team.memberNicknames?.length
                ? esc(team.memberNicknames.join(', '))
                : '<em>No members yet</em>';
            html += `<div class="live-team-card">
                <div class="live-team-card-head">
                    <span class="live-team-card-name">${esc(team.name)}</span>
                    <span class="live-muted">${team.memberCount || 0}/${maxMembers}</span>
                </div>
                <div class="live-team-card-members">${members}</div>
            </div>`;
        }
        html += '</div>';
        if (unassigned.length) {
            html += `<p class="live-team-unassigned"><strong>Waiting for a team:</strong> ${unassigned.map((p) => esc(p.nickname)).join(', ')}</p>`;
            html += unassigned.map((p) => {
                const offline = p.connected === false ? ' <span class="live-muted">(offline)</span>' : '';
                return `<div class="live-lobby-player-row" data-player-id="${esc(p.id)}">
                    <span class="live-lobby-player-name"><strong>${esc(p.nickname)}</strong>${offline}</span>
                    <button type="button" class="live-remove-player-btn btn btn-grey" data-remove-player="${esc(p.id)}">Remove</button>
                </div>`;
            }).join('');
        }
        container.innerHTML = html;
    }

    function renderHostLobbyFromSnapshot(snap) {
        const board = $('live-host-progress-board');
        if (!board) return;
        if (snap?.gameFormat === 'captain-crew' && snap?.teamAssignment === 'pick') {
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
        container.innerHTML = sorted.map((p) => {
            const offline = p.connected === false ? ' <span class="live-muted">(offline)</span>' : '';
            return `<div class="live-lobby-player-row" data-player-id="${esc(p.id)}">
                <span class="live-lobby-player-name"><strong>${esc(p.nickname)}</strong>${offline}</span>
                <button type="button" class="live-remove-player-btn btn btn-grey" data-remove-player="${esc(p.id)}">Remove</button>
            </div>`;
        }).join('');
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
            race.classList.toggle('live-host-race--teams', active && hostState?.gameFormat === 'captain-crew');
        }
        const grid = document.querySelector('.live-host-grid');
        if (grid) grid.hidden = active;
        if (active) {
            const code = hostState?.code || $('live-host-code')?.textContent || '';
            const codeEl = $('live-host-race-code');
            if (codeEl) codeEl.textContent = code;
            const status = $('live-host-race-status');
            if (status) {
                status.textContent = hostState?.gameFormat === 'captain-crew'
                    ? 'Captain & Crew — teams race to 12!'
                    : 'First to 12 in a row wins!';
            }
            startRaceBgBlobs(document.querySelector('#live-host-race .live-race-bg'));
        } else {
            const bubbles = $('live-host-race-bubbles');
            if (bubbles) bubbles.innerHTML = '';
            stopRaceBgBlobs();
        }
    }

    function pickHostFeedback(correct) {
        const pool = correct ? HOST_POSITIVE_FEEDBACK : HOST_NEGATIVE_FEEDBACK;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function spawnHostFeedbackBubble(playerId, correct, progress, termsToWin, won) {
        const row = document.querySelector(`.live-host-race-row[data-player-id="${CSS.escape(playerId)}"]`);
        const track = row?.querySelector('.live-host-race-track');
        const container = $('live-host-race-bubbles');
        if (!track || !container) return;

        const rect = track.getBoundingClientRect();
        const total = termsToWin || TERMS_TO_WIN;
        const pct = progressPct(progress ?? 0, total);
        const x = rect.left + Math.max(20, (rect.width * pct) / 100);

        const bubble = document.createElement('div');
        bubble.className = `live-host-feedback-bubble ${correct ? 'positive' : 'negative'}`;
        bubble.textContent = won ? 'Winner!' : pickHostFeedback(correct);
        bubble.style.left = `${Math.min(x, rect.right - 20)}px`;
        bubble.style.top = `${rect.top + rect.height / 2}px`;
        container.appendChild(bubble);
        bubble.addEventListener('animationend', () => bubble.remove());
    }

    function renderHostRaceBoard(players, options = {}) {
        const board = $('live-host-race-board');
        if (!board) return;
        if (!players || !players.length) {
            board.innerHTML = '<p class="live-host-race-status" style="text-align:center;width:100%;">Waiting for players…</p>';
            return;
        }
        const sorted = [...players].sort((a, b) => b.progress - a.progress || a.nickname.localeCompare(b.nickname));
        board.innerHTML = sorted.map((p) => {
            const total = p.termsToWin || TERMS_TO_WIN;
            const pct = progressPct(p.progress || 0, total);
            const color = raceColorForPlayer(p.id);
            const flash = options.flashId === p.id;
            const isWinner = options.winnerId === p.id || p.progress >= total;
            const fillCls = `live-host-race-fill${flash ? ' reset-flash' : ''}${isWinner ? ' winner' : ''}`;
            const fillStyle = isWinner ? '' : `background:${color}`;
            return `<div class="live-host-race-row" data-player-id="${esc(p.id)}">
                <div class="live-host-race-name" title="${esc(p.nickname)}">${esc(p.nickname)}</div>
                <div class="live-host-race-track">
                    <div class="${fillCls}" style="width:${pct}%;${fillStyle}"></div>
                </div>
                <div class="live-host-race-score">${p.progress || 0}/${total}</div>
            </div>`;
        }).join('');
    }

    function bindHostLobbyBoard() {
        const board = $('live-host-progress-board');
        if (!board || board._removeBound) return;
        board._removeBound = true;
        board.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove-player]');
            if (!btn || hostState?.phase !== 'lobby') return;
            const playerId = btn.getAttribute('data-remove-player');
            if (playerId) hostRemovePlayer(playerId);
        });
    }

    function hostRemovePlayer(playerId) {
        if (!hostState || hostState.phase !== 'lobby') return;
        emitWhenConnected('live:remove-player', { playerId });
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
        if (snapshot?.gameFormat === 'captain-crew') return 4;
        return MIN_PLAYERS;
    }

    function isCaptainCrewPickLobby(snap) {
        const s = snap || playerState;
        return s?.gameFormat === 'captain-crew' && s?.teamAssignment === 'pick';
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

    function updateHostStartButton(snapshot) {
        const btn = $('live-host-start');
        const status = $('live-host-status');
        const countEl = $('live-host-player-count');
        if (!btn) return;
        const count = snapshot?.playerCount ?? snapshot?.players?.length ?? 0;
        const minPlayers = minPlayersForSnapshot(snapshot || hostState);
        const isTeamMode = (snapshot?.gameFormat || hostState?.gameFormat) === 'captain-crew';
        const isPickTeams = isTeamMode && (snapshot?.teamAssignment || hostState?.teamAssignment) === 'pick';
        const playing = snapshot?.phase === 'playing';
        const canStart = snapshot?.canStart != null
            ? snapshot.canStart
            : !isPickTeams && count >= minPlayers && snapshot?.phase === 'lobby';
        btn.disabled = !canStart || playing;
        if (countEl) {
            countEl.textContent = playing
                ? `${count} players · ${isTeamMode ? 'team race' : 'solo race'}`
                : `${count} player${count === 1 ? '' : 's'} joined (minimum ${minPlayers} to start)`;
        }
        if (playing) {
            btn.textContent = 'Game in progress…';
            if (status) {
                status.textContent = isTeamMode
                    ? 'Captain & Crew — teams race to 12 in a row!'
                    : 'Race underway — first to 12 terms in a row wins!';
            }
        } else if (count < minPlayers) {
            btn.textContent = `Start game (need ${minPlayers}+ players)`;
            if (status) status.textContent = `Waiting for players (${count} / ${minPlayers} minimum)…`;
        } else if (isPickTeams && !canStart) {
            btn.textContent = 'Start game (teams not ready)';
            if (status) status.textContent = 'Players are choosing teams (2–4 per team, all players assigned)…';
        } else {
            btn.textContent = 'Start game';
            if (status) {
                status.textContent = isPickTeams
                    ? 'All teams ready — start when you are.'
                    : `${count} players ready. Start when everyone has joined.`;
            }
        }
    }

    function showChampionBanner(container, winnerNickname, isYou) {
        if (!container) return;
        const youMsg = isYou
            ? (isCaptainCrewMode() || hostState?.gameFormat === 'captain-crew' ? ' That\'s your team!' : ' That\'s you!')
            : '';
        container.hidden = false;
        container.innerHTML = `
            <h2>🏆 Champion!</h2>
            <p><strong>${esc(winnerNickname)}</strong> completed all 12 terms first!${youMsg}</p>`;
    }

    function bindHostSocket() {
        const s = ensureSocket();
        bindSocketReconnect('host');
        ['live:host-joined', 'live:progress-update', 'live:room-state', 'live:game-started', 'live:game-finished', 'live:host-answer', 'live:error'].forEach((ev) => s.off(ev));

        s.on('live:host-joined', (data) => {
            showLiveError('');
            hostState.phase = data.snapshot?.phase || 'lobby';
            hostState.gameFormat = data.snapshot?.gameFormat || hostState?.gameFormat || 'race';
            hostState.teamAssignment = data.snapshot?.teamAssignment || hostState?.teamAssignment || 'random';
            if (data.snapshot?.phase === 'playing') {
                setHostRaceMode(true);
                renderHostRaceBoard(data.snapshot?.players || data.progress?.players || []);
            } else {
                setHostRaceMode(false);
                renderHostLobbyFromSnapshot(data.snapshot);
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
            if (hostState?.phase === 'playing') {
                renderHostRaceBoard(snap.players || []);
            } else {
                renderHostLobbyFromSnapshot(snap);
            }
            updateHostStartButton(snap);
        });

        s.on('live:host-answer', (data) => {
            if (hostState?.phase !== 'playing') return;
            spawnHostFeedbackBubble(data.playerId, data.correct, data.progress, TERMS_TO_WIN, data.won);
            if (!data.correct && data.reset) hostState.lastFlashId = data.playerId;
        });

        s.on('live:progress-update', (data) => {
            if (hostState?.phase === 'playing') {
                renderHostRaceBoard(data.players || [], { flashId: hostState.lastFlashId });
                hostState.lastFlashId = null;
            } else if (hostState?.gameFormat === 'captain-crew' && hostState?.teamAssignment === 'pick') {
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
            hostRaceColors = new Map();
            stopHostLobbyPoll();
            LiveAudio.stopLobby();
            LiveAudio.startGame();
            setHostRaceMode(true);
            renderHostRaceBoard(data.progress?.players || []);
            updateHostStartButton({ phase: 'playing', players: data.progress?.players, gameFormat: data.gameFormat, minPlayers: data.minPlayers });
        });

        s.on('live:game-finished', (data) => {
            hostState.phase = 'finished';
            stopHostLobbyPoll();
            LiveAudio.stopAll();
            setHostRaceMode(false);
            $('live-host-finished').hidden = false;
            if (data.winnerNickname) {
                showChampionBanner($('live-host-champion'), data.winnerNickname, false);
                showLiveWinnerScreen(data.winnerNickname, false, {
                    teamMode: hostState?.gameFormat === 'captain-crew',
                });
            }
            renderProgressBoard($('live-host-final-board'), data.players || [], { winnerId: data.winnerId });
            updateHostStartButton({ phase: 'finished' });
        });

        s.on('live:error', (data) => handleHostSocketError(data.error));
    }

    function bindPlayerSocket() {
        const s = ensureSocket();
        bindSocketReconnect('player');
        ['live:player-joined', 'live:room-state', 'live:game-started', 'live:your-question', 'live:answer-result', 'live:crew-vote-update', 'live:progress-update', 'live:game-finished', 'live:player-removed', 'live:error'].forEach((ev) => s.off(ev));

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
                else {
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

        s.on('live:answer-result', (result) => {
            answerPending = false;
            playerCrewVote = null;
            playerState.progress = result.progress;
            updateOwnProgress(result.progress, TERMS_TO_WIN, result.reset);
            spawnPlayerFeedbackBubble(result.correct, result.won);
            const status = $('live-play-status');
            const resultEl = $('live-play-result');
            const teamLabel = isCaptainCrewMode() ? 'Team' : 'You';

            if (result.reset) {
                if (status) status.textContent = `Wrong — ${teamLabel.toLowerCase()} back to the start!`;
                if (resultEl) {
                    resultEl.innerHTML = `<div class="live-choice wrong">The answer was <strong>${esc(result.correctTerm)}</strong>. ${teamLabel} ${teamLabel === 'Team' ? 'is' : 'are'} back at term 1.</div>`;
                }
            } else if (result.correct && !result.won) {
                if (status) status.textContent = `Correct! ${result.progress} / ${TERMS_TO_WIN}`;
                if (resultEl) resultEl.innerHTML = '';
            }

            if (result.won) {
                setAnswerInputsEnabled(false);
                hideCrewPanel();
                if (status) status.textContent = isCaptainCrewMode() ? 'Your team won!' : 'You won!';
            } else {
                setAnswerInputsEnabled(true);
                if (result.nextQuestion && typeof result.nextQuestion === 'object') {
                    showPlayerQuestion(result.nextQuestion);
                }
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
            const isWinner = isCaptainCrewMode()
                ? data.winnerId === playerState?.teamId
                : data.winnerId === playerState?.playerId;
            if (data.winnerNickname) {
                showLiveWinnerScreen(data.winnerNickname, isWinner, {
                    teamMode: isCaptainCrewMode(),
                });
            }
            renderProgressBoard($('live-play-progress-board'), data.players || [], { winnerId: data.winnerId });
            const def = $('live-play-definition');
            if (def) def.textContent = 'Game over!';
            setAnswerInputsEnabled(false);
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
    };

    function answerModeLabel(mode) {
        return ANSWER_MODE_LABELS[mode] || ANSWER_MODE_LABELS.randomise;
    }

    function gameFormatLabel(format, teamAssignment) {
        if (format === 'captain-crew') {
            const mode = teamAssignment === 'pick' ? 'players choose teams' : 'random teams';
            return `${GAME_FORMAT_LABELS['captain-crew']} · ${mode}`;
        }
        return GAME_FORMAT_LABELS[format] || GAME_FORMAT_LABELS.race;
    }

    function updateHostSetupFormatUI() {
        const format = document.querySelector('input[name="live-game-format"]:checked')?.value || 'race';
        const isCrew = format === 'captain-crew';
        const teamRow = $('live-host-team-assignment-row');
        if (teamRow) teamRow.hidden = !isCrew;
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
            if (crew.isCaptain && crew.suggestedAnswer) {
                submitBtn.textContent = `Submit team answer (${crew.suggestedAnswer})`;
            } else if (crew.isCaptain) {
                submitBtn.textContent = 'Submit team answer';
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
        if (label) label.textContent = isCaptainCrewMode() ? 'Team progress' : 'Your progress';
    }

    function applyQuestionInputMode(inputMode, q = null) {
        const choiceMode = inputMode === 'choice';
        const crewMode = q && (q.gameFormat === 'captain-crew' || isCaptainCrewMode());
        const typeSection = $('live-play-type-section');
        const typeHint = $('live-play-type-hint');
        const submitBtn = $('live-play-submit');
        const crewVoteBtn = $('live-play-crew-vote-btn');
        const captainSubmit = $('live-play-captain-submit');

        if (typeSection) typeSection.hidden = choiceMode;
        if (typeHint) {
            if (crewMode && !choiceMode) {
                typeHint.textContent = q?.isCaptain
                    ? 'Type your answer, or submit the crew majority'
                    : 'Type your answer, then vote';
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
        const text = (playerCrewVote || captainSuggestedAnswer || input?.value || '').trim();
        if (!text) {
            showLiveError('Wait for crew votes, or enter an answer first.');
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
            if (status) {
                status.textContent = playerState?.teamName
                    ? `On ${playerState.teamName} — waiting for the host…`
                    : 'Join a team below, then wait for the host…';
            }
        } else {
            $('live-play-team-lobby').hidden = true;
            if (status) status.textContent = pickLobby ? '' : msg;
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
        currentQuestion = q;
        playerState.gameFormat = q.gameFormat || playerState?.gameFormat || 'race';
        playerState.teamId = q.teamId || playerState?.teamId || null;
        playerState.teamName = q.teamName || playerState?.teamName || null;
        playerIsCaptain = Boolean(q.isCaptain);
        playerCrewVote = null;
        setLiveGameActive(true);
        updateProgressLabel();
        const def = $('live-play-definition');
        const input = $('live-play-answer');
        const status = $('live-play-status');
        const crewMode = q.gameFormat === 'captain-crew' || isCaptainCrewMode();
        const choiceMode = q.inputMode === 'choice';
        if (def) def.textContent = q.definition;
        if (def) def.hidden = false;
        $('live-play-team-lobby').hidden = true;
        if (status) {
            if (crewMode) {
                const modeHint = choiceMode ? 'crew votes, captain submits' : 'crew types & votes, captain submits';
                status.textContent = `Term ${(q.progress || 0) + 1} of ${q.termsToWin || TERMS_TO_WIN} — ${modeHint}`;
            } else {
                const modeHint = choiceMode ? 'Tap the matching term' : 'Type the matching term';
                status.textContent = `Term ${(q.progress || 0) + 1} of ${q.termsToWin || TERMS_TO_WIN} — ${modeHint}`;
            }
        }
        updateOwnProgress(q.progress || 0, q.termsToWin || TERMS_TO_WIN);
        if (input) input.value = '';
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
        setAnswerInputsEnabled(true);
        if (!choiceMode && input) input.focus();
        $('live-play-result').innerHTML = '';
    }

    function submitPlayerAnswer(choiceText) {
        if (!playerState || answerPending) return;
        const input = $('live-play-answer');
        const text = (choiceText != null ? String(choiceText) : (input?.value || '')).trim();
        if (!text) {
            showLiveError(choiceText != null ? 'Choose an answer first.' : 'Type an answer first.');
            return;
        }
        showLiveError('');
        answerPending = true;
        setAnswerInputsEnabled(false);
        ensureSocket().emit('live:submit-answer', { text });
    }

    async function loadWordSetsForHost() {
        const sel = $('live-host-wordset');
        if (!sel) return;
        sel.innerHTML = '<option value="">— Select a saved set —</option>';
        if (!isHostSignedIn()) { sel.disabled = true; return; }
        sel.disabled = false;
        try {
            const res = await fetch('/api/word-sets', { credentials: 'include' });
            if (!res.ok) return;
            const data = await res.json();
            for (const s of data.sets || []) {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.name} (${s.item_count || 0})`;
                sel.appendChild(opt);
            }
        } catch { /* ignore */ }
    }

    function updateHostAuthUI() {
        const signedIn = isHostSignedIn();
        if ($('live-host-setup-form')) $('live-host-setup-form').hidden = !signedIn;
    }

    function onAuthChanged() {
        updateHostAuthUI();
        if (isHostSignedIn()) loadWordSetsForHost();
    }

    async function createHostRoom() {
        showLiveError('');
        await ensureAuthLoaded();
        updateHostAuthUI();
        if (!isHostSignedIn()) {
            showLiveError('Sign in to host a live game.');
            if (typeof openAuthModal === 'function') openAuthModal('login');
            return;
        }
        const source = document.querySelector('input[name="live-source"]:checked')?.value || 'builtin';
        const level = $('live-host-level')?.value || 'intermediate';
        const gameFormat = document.querySelector('input[name="live-game-format"]:checked')?.value || 'race';
        const teamAssignment = document.querySelector('input[name="live-team-assignment"]:checked')?.value || 'random';
        const answerMode = document.querySelector('input[name="live-answer-mode"]:checked')?.value || 'randomise';
        const body = { source, level, gameFormat, teamAssignment, answerMode };
        if (source === 'wordset') {
            const setId = $('live-host-wordset')?.value;
            if (!setId) { showLiveError('Choose a Word Set.'); return; }
            body.setId = Number(setId);
        } else if (source === 'paste') {
            body.terms = $('live-host-glossary')?.value || '';
        }

        const btn = $('live-host-create-btn');
        if (btn) btn.disabled = true;
        try {
            const res = await fetch('/api/live/create', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not create room.');

            hostState = {
                code: data.code,
                hostToken: data.hostToken,
                phase: 'lobby',
                answerMode: data.answerMode || answerMode,
                gameFormat: data.gameFormat || gameFormat,
                teamAssignment: data.teamAssignment || teamAssignment,
                minPlayers: data.minPlayers,
            };
            sessionStorage.setItem('ls_live_host_code', data.code);
            sessionStorage.setItem('ls_live_host_token', data.hostToken);

            $('live-host-code').textContent = data.code;
            const modeEl = $('live-host-answer-mode');
            if (modeEl) {
                modeEl.hidden = false;
                modeEl.textContent = hostState.gameFormat === 'captain-crew'
                    ? `Format: ${gameFormatLabel(hostState.gameFormat, hostState.teamAssignment)}`
                    : `Mode: ${answerModeLabel(hostState.answerMode)} · ${gameFormatLabel(hostState.gameFormat)}`;
            }
            const joinUrl = data.joinUrl || `${location.origin}${location.pathname}#/live/join?code=${data.code}`;
            const linkEl = $('live-host-join-link');
            if (linkEl) { linkEl.href = joinUrl; linkEl.textContent = joinUrl.replace(/^https?:\/\//, ''); }
            const qr = $('live-host-qr');
            if (qr) {
                qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}`;
                qr.hidden = false;
            }

            $('live-host-setup-form').hidden = true;
            $('live-host-room-panel').hidden = false;
            $('live-host-finished').hidden = true;
            $('live-host-champion').hidden = true;

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
            const modeEl = $('live-host-answer-mode');
            if (modeEl) {
                modeEl.hidden = false;
                modeEl.textContent = hostState.gameFormat === 'captain-crew'
                    ? `Format: ${gameFormatLabel(hostState.gameFormat, hostState.teamAssignment)}`
                    : `Mode: ${answerModeLabel(hostState.answerMode)} · ${gameFormatLabel(hostState.gameFormat)}`;
            }
            const joinUrl = `${location.origin}${location.pathname}#/live/join?code=${code}`;
            const linkEl = $('live-host-join-link');
            if (linkEl) { linkEl.href = joinUrl; linkEl.textContent = joinUrl.replace(/^https?:\/\//, ''); }
            const qr = $('live-host-qr');
            if (qr) {
                qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}`;
                qr.hidden = false;
            }
            $('live-host-setup-form').hidden = true;
            $('live-host-room-panel').hidden = false;
            $('live-host-finished').hidden = snap.phase !== 'finished';
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

    async function openHost() {
        showLiveError('');
        LiveAudio.stopAll();
        if ($('live-host-setup-form')) $('live-host-setup-form').hidden = true;
        $('live-host-room-panel').hidden = true;

        await ensureAuthLoaded();
        updateHostAuthUI();
        loadWordSetsForHost();

        if (!isHostSignedIn()) {
            clearStoredHostRoom();
            if (typeof showScreen === 'function') showScreen('live-host');
            if (typeof openAuthModal === 'function') openAuthModal('login');
            return;
        }

        const resumed = await resumeHostRoomAsync();
        if (!resumed) {
            $('live-host-room-panel').hidden = true;
            $('live-host-setup-form').hidden = false;
            applyGlossaryPrefill();
        }
        if (typeof showScreen === 'function') showScreen('live-host');
    }

    async function openHostWithGlossary(terms) {
        if (terms) sessionStorage.setItem('ls_live_prefill_glossary', terms);
        await openHost();
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

    function openJoin() {
        showLiveError('');
        const prefill = getQueryParam('code');
        if (prefill && $('live-join-code')) $('live-join-code').value = prefill.toUpperCase();
        if (typeof showScreen === 'function') showScreen('live-join');
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
        emitWhenConnected('live:start-game');
    }

    function hostEnd() {
        if (!hostState) return;
        ensureSocket().emit('live:end-game');
    }

    function toggleLiveSourcePanels() {
        const source = document.querySelector('input[name="live-source"]:checked')?.value || 'builtin';
        $('live-host-level-row').hidden = source !== 'builtin';
        $('live-host-wordset-row').hidden = source !== 'wordset';
        $('live-host-paste-row').hidden = source !== 'paste';
    }

    function toggleLiveFormatPanels() {
        updateHostSetupFormatUI();
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('input[name="live-source"]').forEach((el) => {
            el.addEventListener('change', toggleLiveSourcePanels);
        });
        document.querySelectorAll('input[name="live-game-format"]').forEach((el) => {
            el.addEventListener('change', toggleLiveFormatPanels);
        });
        $('live-host-create-btn')?.addEventListener('click', createHostRoom);
        $('live-join-btn')?.addEventListener('click', joinRoom);
        $('live-host-start')?.addEventListener('click', hostStartGame);
        $('live-host-end')?.addEventListener('click', hostEnd);
        $('live-host-race-end')?.addEventListener('click', hostEnd);
        bindHostLobbyBoard();
        $('live-play-submit')?.addEventListener('click', submitPlayerAnswer);
        $('live-play-captain-submit')?.addEventListener('click', submitCaptainAnswer);
        $('live-play-crew-vote-btn')?.addEventListener('click', submitCrewVoteFromInput);
        $('live-play-create-team')?.addEventListener('click', () => ensureSocket().emit('live:create-team'));
        $('live-play-answer')?.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const crewVoteBtn = $('live-play-crew-vote-btn');
            const captainBtn = $('live-play-captain-submit');
            if (playerIsCaptain && captainBtn && !captainBtn.hidden) {
                const input = $('live-play-answer');
                if (input?.value?.trim()) playerCrewVote = input.value.trim();
                submitCaptainAnswer();
            } else if (crewVoteBtn && !crewVoteBtn.hidden) submitCrewVoteFromInput();
            else submitPlayerAnswer();
        });
        toggleLiveSourcePanels();
        toggleLiveFormatPanels();
    });

    window.LiveGame = { openHost, openHostWithGlossary, openJoin, openPlay, createHostRoom, joinRoom, onAuthChanged };
})();
