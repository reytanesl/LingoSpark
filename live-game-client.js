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
                renderProgressBoard($('live-host-progress-board'), snap.players || []);
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

    function setLiveGameActive(active) {
        document.body.classList.toggle('live-game-active', Boolean(active));
        const codeEl = $('live-play-room-code');
        if (codeEl) {
            codeEl.textContent = playerState?.code || sessionStorage.getItem('ls_live_room_code') || '';
            codeEl.hidden = !active;
        }
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
            if (flashReset) {
                setTimeout(() => bar.classList.remove('reset-flash'), 600);
            }
        }
    }

    function updateHostStartButton(snapshot) {
        const btn = $('live-host-start');
        const status = $('live-host-status');
        const countEl = $('live-host-player-count');
        if (!btn) return;
        const count = snapshot?.playerCount ?? snapshot?.players?.length ?? 0;
        const canStart = snapshot?.canStart ?? (count >= MIN_PLAYERS && snapshot?.phase === 'lobby');
        const playing = snapshot?.phase === 'playing';
        btn.disabled = !canStart || playing;
        if (countEl) {
            countEl.textContent = playing
                ? `${count} players racing`
                : `${count} player${count === 1 ? '' : 's'} joined (minimum ${MIN_PLAYERS} to start)`;
        }
        if (playing) {
            btn.textContent = 'Game in progress…';
            if (status) status.textContent = 'Race underway — first to 12 terms in a row wins!';
        } else if (count < MIN_PLAYERS) {
            btn.textContent = `Start game (need ${MIN_PLAYERS}+ players)`;
            if (status) status.textContent = `Waiting for players (${count} / ${MIN_PLAYERS} minimum)…`;
        } else {
            btn.textContent = 'Start game';
            if (status) status.textContent = `${count} players ready. Start when everyone has joined.`;
        }
    }

    function showChampionBanner(container, winnerNickname, isYou) {
        if (!container) return;
        container.hidden = false;
        container.innerHTML = `
            <h2>🏆 Champion!</h2>
            <p><strong>${esc(winnerNickname)}</strong> completed all 12 terms first!${isYou ? ' That\'s you!' : ''}</p>`;
    }

    function bindHostSocket() {
        const s = ensureSocket();
        bindSocketReconnect('host');
        ['live:host-joined', 'live:progress-update', 'live:room-state', 'live:game-started', 'live:game-finished', 'live:error'].forEach((ev) => s.off(ev));

        s.on('live:host-joined', (data) => {
            showLiveError('');
            hostState.phase = data.snapshot?.phase || 'lobby';
            renderProgressBoard($('live-host-progress-board'), data.snapshot?.players || data.progress?.players || []);
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
            renderProgressBoard($('live-host-progress-board'), snap.players || []);
            updateHostStartButton(snap);
        });

        s.on('live:progress-update', (data) => {
            renderProgressBoard($('live-host-progress-board'), data.players || []);
            updateHostStartButton({ ...data, playerCount: data.players?.length, phase: data.phase || hostState?.phase });
        });

        s.on('live:game-started', (data) => {
            hostState.phase = 'playing';
            stopHostLobbyPoll();
            LiveAudio.stopLobby();
            LiveAudio.startGame();
            renderProgressBoard($('live-host-progress-board'), data.progress?.players || []);
            updateHostStartButton({ phase: 'playing', players: data.progress?.players });
        });

        s.on('live:game-finished', (data) => {
            hostState.phase = 'finished';
            stopHostLobbyPoll();
            LiveAudio.stopAll();
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
        ['live:player-joined', 'live:game-started', 'live:your-question', 'live:answer-result', 'live:progress-update', 'live:game-finished', 'live:error'].forEach((ev) => s.off(ev));

        s.on('live:player-joined', (data) => {
            showLiveError('');
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

        s.on('live:game-started', () => {
            activeQuestionId = 0;
            answerPending = false;
            setLiveGameActive(true);
            LiveAudio.startGame();
            showLiveError('');
            showPlayerWaiting('Starting…');
            requestPlayerQuestion();
        });

        s.on('live:your-question', (q) => {
            if (q) showPlayerQuestion(q);
        });

        s.on('live:answer-result', (result) => {
            answerPending = false;
            playerState.progress = result.progress;
            updateOwnProgress(result.progress, TERMS_TO_WIN, result.reset);
            const status = $('live-play-status');
            const resultEl = $('live-play-result');

            if (result.reset) {
                if (status) status.textContent = 'Wrong — back to the start!';
                if (resultEl) {
                    resultEl.innerHTML = `<div class="live-choice wrong">The answer was <strong>${esc(result.correctTerm)}</strong>. You\'re back at term 1.</div>`;
                }
            } else if (result.correct && !result.won) {
                if (status) status.textContent = `Correct! ${result.progress} / ${TERMS_TO_WIN}`;
                if (resultEl) resultEl.innerHTML = '';
            }

            if (result.won) {
                setAnswerInputsEnabled(false);
                if (status) status.textContent = 'You won!';
            } else if (result.nextQuestion) {
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
            const isWinner = data.winnerId === playerState?.playerId;
            if (data.winnerNickname) {
                showChampionBanner($('live-play-champion'), data.winnerNickname, isWinner);
                launchConfetti();
            }
            renderProgressBoard($('live-play-progress-board'), data.players || [], { winnerId: data.winnerId });
            const def = $('live-play-definition');
            if (def) def.textContent = 'Game over!';
            setAnswerInputsEnabled(false);
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
        if (input && !typeSection?.hidden) input.disabled = !enabled;
        if (btn && !typeSection?.hidden) btn.disabled = !enabled;
        if (choices && !choices.hidden) {
            choices.querySelectorAll('button').forEach((b) => { b.disabled = !enabled; });
        }
    }

    const ANSWER_MODE_LABELS = {
        recognise: 'Recognise (choose)',
        realise: 'Realise (type)',
        randomise: 'Randomise',
    };

    function answerModeLabel(mode) {
        return ANSWER_MODE_LABELS[mode] || ANSWER_MODE_LABELS.randomise;
    }

    function applyQuestionInputMode(inputMode) {
        const choiceMode = inputMode === 'choice';
        const typeSection = $('live-play-type-section');
        const typeHint = $('live-play-type-hint');
        if (typeSection) typeSection.hidden = choiceMode;
        if (typeHint) typeHint.textContent = choiceMode ? '' : 'Type the word';
    }

    function renderChoiceButtons(choices) {
        const container = $('live-play-choices');
        if (!container) return;
        if (!choices || !choices.length) {
            container.innerHTML = '';
            container.hidden = true;
            return;
        }
        container.hidden = false;
        container.innerHTML = choices.map((term, i) =>
            `<button type="button" class="live-answer-btn" style="background:${CHOICE_COLORS[i % CHOICE_COLORS.length]}"></button>`
        ).join('');
        container.querySelectorAll('button').forEach((btn, i) => {
            btn.textContent = choices[i];
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                submitPlayerAnswer(choices[i]);
            });
        });
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
        if ($('live-play-type-section')) $('live-play-type-section').hidden = true;
    }

    function showPlayerQuestion(q) {
        if (!q) return;
        if (q.questionId != null && q.questionId < activeQuestionId) return;
        if (q.questionId != null) activeQuestionId = q.questionId;
        answerPending = false;
        setLiveGameActive(true);
        const def = $('live-play-definition');
        const input = $('live-play-answer');
        const status = $('live-play-status');
        const choiceMode = q.inputMode === 'choice';
        if (def) def.textContent = q.definition;
        if (status) {
            const modeHint = choiceMode ? 'Tap the matching term' : 'Type the matching term';
            status.textContent = `Term ${(q.progress || 0) + 1} of ${q.termsToWin || TERMS_TO_WIN} — ${modeHint}`;
        }
        updateOwnProgress(q.progress || 0, q.termsToWin || TERMS_TO_WIN);
        if (input) input.value = '';
        applyQuestionInputMode(q.inputMode);
        if (choiceMode) renderChoiceButtons(q.choices || []);
        else renderChoiceButtons([]);
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
        const answerMode = document.querySelector('input[name="live-answer-mode"]:checked')?.value || 'randomise';
        const body = { source, level, answerMode };
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

            hostState = { code: data.code, hostToken: data.hostToken, phase: 'lobby', answerMode: data.answerMode || answerMode };
            sessionStorage.setItem('ls_live_host_code', data.code);
            sessionStorage.setItem('ls_live_host_token', data.hostToken);

            $('live-host-code').textContent = data.code;
            const modeEl = $('live-host-answer-mode');
            if (modeEl) {
                modeEl.textContent = `Mode: ${answerModeLabel(hostState.answerMode)}`;
                modeEl.hidden = false;
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
            hostState = { code, hostToken, phase: snap.phase || 'lobby', answerMode: snap.answerMode || 'randomise' };
            $('live-host-code').textContent = code;
            const modeEl = $('live-host-answer-mode');
            if (modeEl) {
                modeEl.textContent = `Mode: ${answerModeLabel(hostState.answerMode)}`;
                modeEl.hidden = false;
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

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('input[name="live-source"]').forEach((el) => {
            el.addEventListener('change', toggleLiveSourcePanels);
        });
        $('live-host-create-btn')?.addEventListener('click', createHostRoom);
        $('live-join-btn')?.addEventListener('click', joinRoom);
        $('live-host-start')?.addEventListener('click', hostStartGame);
        $('live-host-end')?.addEventListener('click', hostEnd);
        $('live-play-submit')?.addEventListener('click', submitPlayerAnswer);
        $('live-play-answer')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submitPlayerAnswer(); }
        });
        toggleLiveSourcePanels();
    });

    window.LiveGame = { openHost, openJoin, openPlay, createHostRoom, joinRoom, onAuthChanged };
})();
