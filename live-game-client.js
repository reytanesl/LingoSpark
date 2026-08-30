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
                renderHostPlayerBoard(snap.players || []);
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
        applyPlayerBarColor();
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

    const CHOICE_COLORS = ['#C8102E', '#012169', '#00823B', '#E8A317'];

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

    function renderHostPlayerBoard(players, options = {}) {
        const board = $('live-host-progress-board');
        if (!board) return;
        const inLobby = (hostState?.phase || 'lobby') === 'lobby' && !options.playing;
        if (inLobby) renderHostLobbyBoard(board, players);
        else renderHostRaceBoard(players, options);
    }

    function setHostRaceMode(active) {
        document.body.classList.toggle('live-host-race', active);
        const race = $('live-host-race');
        if (race) race.hidden = !active;
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
        } else {
            const bubbles = $('live-host-race-bubbles');
            if (bubbles) bubbles.innerHTML = '';
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
                <div class="live-host-race-name" title="${esc(p.nickname)}">${esc(p.nickname)}${p.memberNicknames?.length ? `<span style="display:block;font-size:0.68em;font-weight:600;opacity:0.9;margin-top:0.1rem;">${esc(p.memberNicknames.join(', '))}</span>` : ''}</div>
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
        if (snapshot?.gameFormat === 'captain-crew') {
            return (snapshot?.teamSize || hostState?.teamSize || 2) * 2;
        }
        return MIN_PLAYERS;
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
        const canStart = snapshot?.canStart ?? (count >= minPlayers && snapshot?.phase === 'lobby');
        const playing = snapshot?.phase === 'playing';
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
        } else {
            btn.textContent = 'Start game';
            if (status) status.textContent = `${count} players ready. Start when everyone has joined.`;
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
            if (data.snapshot?.phase === 'playing') {
                setHostRaceMode(true);
                renderHostRaceBoard(data.snapshot?.players || data.progress?.players || []);
            } else {
                setHostRaceMode(false);
                renderHostLobbyBoard($('live-host-progress-board'), data.snapshot?.players || data.progress?.players || []);
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
            if (hostState?.phase === 'playing') {
                renderHostRaceBoard(snap.players || []);
            } else {
                renderHostLobbyBoard($('live-host-progress-board'), snap.players || []);
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
            } else {
                renderHostLobbyBoard($('live-host-progress-board'), data.players || []);
            }
            updateHostStartButton({ ...data, playerCount: data.players?.length, phase: data.phase || hostState?.phase });
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
                launchConfetti();
            }
            renderProgressBoard($('live-host-final-board'), data.players || [], { winnerId: data.winnerId });
            updateHostStartButton({ phase: 'finished' });
        });

        s.on('live:error', (data) => handleHostSocketError(data.error));
    }

    function bindPlayerSocket() {
        const s = ensureSocket();
        bindSocketReconnect('player');
        ['live:player-joined', 'live:game-started', 'live:your-question', 'live:answer-result', 'live:crew-vote-update', 'live:progress-update', 'live:game-finished', 'live:player-removed', 'live:error'].forEach((ev) => s.off(ev));

        s.on('live:player-joined', (data) => {
            showLiveError('');
            playerState.gameFormat = data.gameFormat || data.snapshot?.gameFormat || 'race';
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
                showPlayerWaiting('Waiting for the host to start…');
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
            } else if (result.nextQuestion && typeof result.nextQuestion === 'object') {
                showPlayerQuestion(result.nextQuestion);
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
                showChampionBanner($('live-play-champion'), data.winnerNickname, isWinner);
                launchConfetti();
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
        if (input && !typeSection?.hidden) input.disabled = !enabled;
        if (btn && !typeSection?.hidden) btn.disabled = !enabled;
        if (captainBtn && playerIsCaptain) captainBtn.disabled = !enabled;
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

    function gameFormatLabel(format, teamSize) {
        if (format === 'captain-crew') {
            return `${GAME_FORMAT_LABELS['captain-crew']} (teams of ${teamSize || 2})`;
        }
        return GAME_FORMAT_LABELS[format] || GAME_FORMAT_LABELS.race;
    }

    function updateHostSetupFormatUI() {
        const format = document.querySelector('input[name="live-game-format"]:checked')?.value || 'race';
        const isCrew = format === 'captain-crew';
        const teamRow = $('live-host-team-size-row');
        const answerSection = $('live-host-answer-mode-section');
        if (teamRow) teamRow.hidden = !isCrew;
        if (answerSection) answerSection.hidden = isCrew;
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
            role.textContent = `${team} — Captain: ${q.captainNickname || '…'} — vote below`;
        }
    }

    function updateProgressLabel() {
        const label = document.querySelector('.live-own-progress-label > span:first-child');
        if (label) label.textContent = isCaptainCrewMode() ? 'Team progress' : 'Your progress';
    }

    function applyQuestionInputMode(inputMode) {
        const choiceMode = inputMode === 'choice';
        const typeSection = $('live-play-type-section');
        const typeHint = $('live-play-type-hint');
        if (typeSection) typeSection.hidden = choiceMode;
        if (typeHint) typeHint.textContent = choiceMode ? '' : 'Type the word';
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
            `<button type="button" class="live-answer-btn${playerCrewVote === term ? ' crew-voted' : ''}" style="background:${CHOICE_COLORS[i % CHOICE_COLORS.length]}"></button>`
        ).join('');
        container.querySelectorAll('button').forEach((btn, i) => {
            btn.textContent = choices[i];
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                if (crewMode) {
                    submitCrewVote(choices[i]);
                    return;
                }
                submitPlayerAnswer(choices[i]);
            });
        });
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
        const text = (playerCrewVote || captainSuggestedAnswer || '').trim();
        if (!text) {
            showLiveError('Wait for crew votes, or tap an answer first.');
            return;
        }
        showLiveError('');
        answerPending = true;
        setAnswerInputsEnabled(false);
        ensureSocket().emit('live:submit-answer', { text });
    }

    function showPlayerWaiting(msg) {
        const def = $('live-play-definition');
        const status = $('live-play-status');
        if (def) def.textContent = msg;
        setAnswerInputsEnabled(false);
        if (status) status.textContent = '';
        $('live-play-result').innerHTML = '';
        renderChoiceButtons([]);
        applyQuestionInputMode('typed');
        hideCrewPanel();
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
        const choiceMode = crewMode || q.inputMode === 'choice';
        if (def) def.textContent = q.definition;
        if (status) {
            if (crewMode) {
                status.textContent = `Term ${(q.progress || 0) + 1} of ${q.termsToWin || TERMS_TO_WIN} — crew votes, captain submits`;
            } else {
                const modeHint = choiceMode ? 'Tap the matching term' : 'Type the matching term';
                status.textContent = `Term ${(q.progress || 0) + 1} of ${q.termsToWin || TERMS_TO_WIN} — ${modeHint}`;
            }
        }
        updateOwnProgress(q.progress || 0, q.termsToWin || TERMS_TO_WIN);
        if (input) input.value = '';
        applyQuestionInputMode(crewMode ? 'choice' : q.inputMode);
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
            hideCrewPanel();
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
        const teamSize = Number($('live-host-team-size')?.value) || 2;
        const answerMode = document.querySelector('input[name="live-answer-mode"]:checked')?.value || 'randomise';
        const body = { source, level, gameFormat, teamSize, answerMode };
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
                teamSize: data.teamSize || teamSize,
                minPlayers: data.minPlayers,
            };
            sessionStorage.setItem('ls_live_host_code', data.code);
            sessionStorage.setItem('ls_live_host_token', data.hostToken);

            $('live-host-code').textContent = data.code;
            const modeEl = $('live-host-answer-mode');
            if (modeEl) {
                modeEl.hidden = false;
                modeEl.textContent = hostState.gameFormat === 'captain-crew'
                    ? `Format: ${gameFormatLabel(hostState.gameFormat, hostState.teamSize)}`
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
                teamSize: snap.teamSize || 2,
                minPlayers: snap.minPlayers,
            };
            $('live-host-code').textContent = code;
            const modeEl = $('live-host-answer-mode');
            if (modeEl) {
                modeEl.hidden = false;
                modeEl.textContent = hostState.gameFormat === 'captain-crew'
                    ? `Format: ${gameFormatLabel(hostState.gameFormat, hostState.teamSize)}`
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
        }
        if (typeof showScreen === 'function') showScreen('live-host');
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
        $('live-play-answer')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submitPlayerAnswer(); }
        });
        toggleLiveSourcePanels();
        toggleLiveFormatPanels();
    });

    window.LiveGame = { openHost, openJoin, openPlay, createHostRoom, joinRoom, onAuthChanged };
})();
