/* Live Spark entry page (#/live, #/live/join, #/live/host).
   1. LiveEntryCode — pure helpers for the 4-letter code boxes + button/hint copy (unit-tested in node).
   2. LiveEntry — DOM controller for #screen-live-join (student join + teacher sign-in/setup).
   Classic script: sets globalThis.LiveEntryCode (importable from node for tests) and window.LiveEntry. */
(function (root) {
    'use strict';

    /* ------------------------------------------------------------------
       1. Pure helpers
       ------------------------------------------------------------------ */
    const CODE_LEN = 4;
    /** Buddies shown on the join page (all are Lucky Lanterns avatars, so LL can draw them). */
    const AVATARS = ['🦊', '🐼', '🐸', '🦄', '🐯', '🐧', '🐵'];
    const AVATAR_NAMES = { '🦊': 'Fox', '🐼': 'Panda', '🐸': 'Frog', '🦄': 'Unicorn', '🐯': 'Tiger', '🐧': 'Penguin', '🐵': 'Monkey' };

    function lettersOnly(raw) {
        return String(raw || '').toUpperCase().replace(/[^A-Z]/g, '');
    }

    function normalizeCode(raw) {
        return lettersOnly(raw).slice(0, CODE_LEN);
    }

    function emptyChars() {
        return Array.from({ length: CODE_LEN }, () => '');
    }

    function charsFromCode(code) {
        const clean = normalizeCode(code);
        return emptyChars().map((_, i) => clean[i] || '');
    }

    function codeFromChars(chars) {
        return (chars || []).map((c) => normalizeCode(c).slice(0, 1)).join('');
    }

    function isComplete(chars) {
        return codeFromChars(chars).length === CODE_LEN && (chars || []).every((c) => /^[A-Z]$/.test(c));
    }

    /**
     * Type or paste `text` into box `index`. A full code (4+ letters) always fills from box 1,
     * shorter input fills forward from `index`. Non-letters are dropped, letters uppercased.
     * Returns { chars, focus } — focus is the box that should get the caret next.
     */
    function fillFrom(chars, index, text) {
        const next = (chars || emptyChars()).slice(0, CODE_LEN);
        while (next.length < CODE_LEN) next.push('');
        const letters = lettersOnly(text);
        if (!letters) return { chars: next, focus: clampIndex(index) };
        let start = clampIndex(index);
        if (letters.length >= CODE_LEN) start = 0;
        let i = start;
        for (const ch of letters) {
            if (i >= CODE_LEN) break;
            next[i] = ch;
            i++;
        }
        return { chars: next, focus: clampIndex(i) };
    }

    /** Backspace in box `index`: clear it, or (if already empty) clear and move to the previous box. */
    function backspace(chars, index) {
        const next = (chars || emptyChars()).slice(0, CODE_LEN);
        const i = clampIndex(index);
        if (next[i]) {
            next[i] = '';
            return { chars: next, focus: i };
        }
        if (i === 0) return { chars: next, focus: 0 };
        next[i - 1] = '';
        return { chars: next, focus: i - 1 };
    }

    function clampIndex(i) {
        return Math.max(0, Math.min(CODE_LEN - 1, Number(i) || 0));
    }

    function cleanName(raw) {
        return String(raw || '').replace(/<[^>]*>/g, '').trim().slice(0, 20);
    }

    function possessive(name) {
        return /s$/i.test(name) ? `${name}'` : `${name}'s`;
    }

    function playersText(n) {
        const count = Number(n) || 0;
        if (count <= 0) return 'be the first to join!';
        return count === 1 ? '1 player waiting' : `${count} players waiting`;
    }

    /** Hint under the code boxes for a lookup result: { tone: ok|warn|err, text }. */
    function lookupHint(code, data) {
        const clean = normalizeCode(code);
        if (!data || data.exists === false) {
            return { tone: 'err', text: `We can't find room ${clean}. Check the code on the board — it may have ended.` };
        }
        if (data.full && data.phase === 'lobby') {
            return { tone: 'err', text: `Room ${clean} is full. Ask your teacher for help.` };
        }
        const who = data.hostName ? `Room found — ${possessive(data.hostName)} class` : 'Room found';
        if (data.phase && data.phase !== 'lobby') {
            return { tone: 'warn', text: `${who} · game in progress. Use the name you joined with to jump back in.` };
        }
        return { tone: 'ok', text: `${who} · ${playersText(data.playerCount)}` };
    }

    /**
     * Main button for the student form.
     * lookup.status: idle | checking | found | missing | full | unknown (network/rate limit — let the server decide)
     */
    function joinButtonState({ code = '', lookup = {}, name = '', avatar = '' } = {}) {
        const status = lookup.status || 'idle';
        if (normalizeCode(code).length < CODE_LEN) return { enabled: false, label: 'Enter the room code to join' };
        if (status === 'missing') return { enabled: false, label: 'Fix the room code' };
        if (status === 'full') return { enabled: false, label: 'This room is full' };
        if (status === 'checking') return { enabled: false, label: 'Checking the room…' };
        const nick = cleanName(name);
        if (nick.length < 2) return { enabled: false, label: 'Type your name to join' };
        const rejoin = status === 'found' && lookup.phase && lookup.phase !== 'lobby';
        return {
            enabled: true,
            label: `${rejoin ? 'Rejoin' : 'Join'} as ${nick}`,
            avatar: AVATARS.includes(avatar) ? avatar : '',
        };
    }

    const api = {
        CODE_LEN, AVATARS, AVATAR_NAMES,
        normalizeCode, charsFromCode, codeFromChars, isComplete, fillFrom, backspace, cleanName, lookupHint, joinButtonState,
    };
    root.LiveEntryCode = api;

    /* ------------------------------------------------------------------
       2. DOM controller
       ------------------------------------------------------------------ */
    if (typeof document === 'undefined') return;

    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const state = {
        role: 'student',
        chars: emptyChars(),
        lookup: { status: 'idle' },
        lookupSeq: 0,
        advanceAfterLookup: false,
        avatar: '',
        nameError: '',
    };

    function boxes() {
        return Array.from(document.querySelectorAll('#lse-code .lse-box'));
    }

    function focusBox(i) {
        const box = boxes()[clampIndex(i)];
        if (!box) return;
        box.focus({ preventScroll: true });
        try { box.select(); } catch { /* ignore */ }
    }

    function syncBoxes() {
        boxes().forEach((box, i) => {
            if (box.value !== state.chars[i]) box.value = state.chars[i];
        });
        const hidden = $('live-join-code');
        if (hidden) hidden.value = codeFromChars(state.chars);
    }

    function setStepState(step, status, numLabel) {
        if (!step) return;
        step.classList.toggle('done', status === 'done');
        step.classList.toggle('bad', status === 'bad');
        step.classList.toggle('checking', status === 'checking');
        const num = step.querySelector('.lse-num');
        if (num) {
            if (status === 'done') num.innerHTML = '<i class="fa-solid fa-check"></i>';
            else if (status === 'bad') num.textContent = '!';
            else num.textContent = numLabel;
        }
    }

    function setHint(el, tone, text) {
        if (!el) return;
        if (!text) {
            el.hidden = true;
            el.className = 'lse-hint';
            el.innerHTML = '';
            return;
        }
        const icon = tone === 'ok' ? 'fa-circle-check' : tone === 'err' ? 'fa-triangle-exclamation' : 'fa-circle-info';
        el.className = `lse-hint ${tone || ''}`;
        el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${esc(text)}</span>`;
        el.hidden = false;
    }

    function shakeCode() {
        const ctl = $('lse-code-ctl');
        if (!ctl) return;
        ctl.classList.remove('lse-shake');
        void ctl.offsetWidth;
        ctl.classList.add('lse-shake');
    }

    function renderStudent() {
        const code = codeFromChars(state.chars);
        const nameInput = $('live-join-nickname');
        const name = nameInput ? nameInput.value : '';
        const { status } = state.lookup;

        let codeStatus = '';
        if (status === 'found') codeStatus = 'done';
        else if (status === 'missing' || status === 'full') codeStatus = 'bad';
        else if (status === 'checking') codeStatus = 'checking';
        setStepState($('lse-step-code'), codeStatus, '1');
        if (status === 'found' || status === 'missing' || status === 'full') {
            const hint = lookupHint(code, state.lookup.data);
            setHint($('live-join-code-hint'), hint.tone, hint.text);
        } else if (state.lookup.prefilled && code.length === CODE_LEN) {
            setHint($('live-join-code-hint'), '', 'Room code filled from your link.');
        } else {
            setHint($('live-join-code-hint'), '', '');
        }

        const nameOk = cleanName(name).length >= 2;
        setStepState($('lse-step-name'), state.nameError ? 'bad' : (nameOk && status === 'found' ? 'done' : ''), '2');
        setHint($('lse-name-hint'), 'err', state.nameError);
        setStepState($('lse-step-buddy'), state.avatar ? 'done' : '', '3');

        const btnState = joinButtonState({ code, lookup: { status, phase: state.lookup.data?.phase }, name, avatar: state.avatar });
        const btn = $('live-join-btn');
        if (btn) {
            btn.classList.toggle('off', !btnState.enabled);
            btn.setAttribute('aria-disabled', btnState.enabled ? 'false' : 'true');
            if (btnState.enabled) {
                const lead = btnState.avatar
                    ? `<span class="lse-btn-av" aria-hidden="true">${btnState.avatar}</span>`
                    : '<i class="fa-solid fa-bolt" aria-hidden="true"></i>';
                btn.innerHTML = `${lead}<span class="lse-btn-name">${esc(btnState.label)}</span>`;
            } else {
                btn.textContent = btnState.label;
            }
        }
    }

    async function lookupCode(code) {
        const seq = ++state.lookupSeq;
        state.lookup = { status: 'checking', prefilled: state.lookup.prefilled };
        renderStudent();
        let next;
        try {
            const res = await fetch(`/api/live/lookup/${encodeURIComponent(code)}`, { credentials: 'same-origin' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) next = { status: 'unknown' };
            else if (!data.exists) next = { status: 'missing', data };
            else if (data.full && data.phase === 'lobby') next = { status: 'full', data };
            else next = { status: 'found', data };
        } catch {
            next = { status: 'unknown' };
        }
        if (seq !== state.lookupSeq || codeFromChars(state.chars) !== code) return;
        state.lookup = { ...next, prefilled: state.lookup.prefilled };
        renderStudent();
        const inBoxes = document.activeElement?.classList?.contains('lse-box');
        const advance = state.advanceAfterLookup && inBoxes;
        state.advanceAfterLookup = false;
        if (next.status === 'missing' || next.status === 'full') {
            shakeCode();
            if (inBoxes) focusBox(CODE_LEN - 1);
        } else if (advance) {
            $('live-join-nickname')?.focus({ preventScroll: true });
        }
    }

    function onCodeChanged({ fromTyping = false } = {}) {
        syncBoxes();
        const code = codeFromChars(state.chars);
        state.lookup = { status: 'idle' };
        state.lookupSeq++;
        if (isComplete(state.chars)) {
            // Stay in the boxes until the room is checked: a wrong code can then be fixed
            // straight away, a good one moves the caret on to the name.
            state.advanceAfterLookup = fromTyping;
            lookupCode(code);
        }
        renderStudent();
    }

    function applyText(i, text) {
        const res = fillFrom(state.chars, i, text);
        state.chars = res.chars;
        onCodeChanged({ fromTyping: true });
        // Auto-advance; once all 4 are in, onCodeChanged moves the caret to the name field.
        if (!isComplete(state.chars)) focusBox(res.focus);
    }

    function bindCodeBoxes() {
        boxes().forEach((box, i) => {
            box.addEventListener('focus', () => {
                // select() would re-focus a box the caret already left, so check first.
                setTimeout(() => {
                    if (document.activeElement !== box) return;
                    try { box.select(); } catch { /* ignore */ }
                }, 0);
            });
            box.addEventListener('keydown', (e) => {
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                if (e.key === 'Backspace' || e.key === 'Delete') {
                    e.preventDefault();
                    const res = e.key === 'Delete'
                        ? { chars: state.chars.map((c, j) => (j === i ? '' : c)), focus: i }
                        : backspace(state.chars, i);
                    state.chars = res.chars;
                    onCodeChanged();
                    focusBox(res.focus);
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    focusBox(i - 1);
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    focusBox(i + 1);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (isComplete(state.chars)) $('live-join-nickname')?.focus();
                } else if (e.key && e.key.length === 1) {
                    e.preventDefault();
                    if (/^[a-z]$/i.test(e.key)) applyText(i, e.key);
                }
            });
            // Mobile keyboards (key "Unidentified") and autofill land here.
            box.addEventListener('input', () => {
                const letters = lettersOnly(box.value);
                if (!letters) {
                    state.chars[i] = '';
                    onCodeChanged();
                    return;
                }
                applyText(i, letters.length > 1 && letters.length < CODE_LEN ? letters.slice(-1) : letters);
            });
            box.addEventListener('paste', (e) => {
                const text = e.clipboardData?.getData('text') || '';
                e.preventDefault();
                applyText(i, text);
            });
        });
    }

    function renderAvatars() {
        const host = $('lse-avatars');
        if (!host) return;
        host.innerHTML = AVATARS.map((av, i) => `<label class="lse-av" title="${esc(AVATAR_NAMES[av] || 'Buddy')}">
            <input type="radio" name="live-join-avatar" value="${av}" aria-label="${esc(AVATAR_NAMES[av] || `Buddy ${i + 1}`)}">
            <span aria-hidden="true">${av}</span>
        </label>`).join('');
        host.querySelectorAll('input').forEach((input) => {
            input.addEventListener('click', () => {
                // Buddy is optional: tapping the chosen one again clears it.
                if (state.avatar === input.value) {
                    input.checked = false;
                    state.avatar = '';
                } else {
                    state.avatar = input.value;
                }
                try { sessionStorage.setItem('ls_live_avatar', state.avatar); } catch { /* ignore */ }
                renderStudent();
            });
        });
    }

    function setAvatar(av) {
        state.avatar = AVATARS.includes(av) ? av : '';
        document.querySelectorAll('input[name="live-join-avatar"]').forEach((el) => {
            el.checked = el.value === state.avatar;
        });
    }

    function onJoinClick() {
        const btn = $('live-join-btn');
        if (btn?.disabled) return;
        const code = codeFromChars(state.chars);
        const nameInput = $('live-join-nickname');
        const btnState = joinButtonState({ code, lookup: { status: state.lookup.status, phase: state.lookup.data?.phase }, name: nameInput?.value, avatar: state.avatar });
        if (!btnState.enabled) {
            if (code.length < CODE_LEN) focusBox(state.chars.findIndex((c) => !c));
            else if (state.lookup.status === 'missing' || state.lookup.status === 'full') { shakeCode(); focusBox(CODE_LEN - 1); }
            else nameInput?.focus();
            return;
        }
        state.nameError = '';
        if (window.LiveGame?.joinRoom) window.LiveGame.joinRoom();
    }

    /** Called by live-game-client when /api/live/join fails. Returns true when shown inline. */
    function handleJoinError(message) {
        const msg = String(message || '');
        if (/not found|expired/i.test(msg)) {
            state.lookup = { status: 'missing', data: { exists: false } };
            renderStudent();
            shakeCode();
            return true;
        }
        if (/full/i.test(msg)) {
            state.lookup = { status: 'full', data: { exists: true, full: true, phase: 'lobby' } };
            renderStudent();
            shakeCode();
            return true;
        }
        if (/nickname|already started|2–20/i.test(msg)) {
            state.nameError = msg.replace(/nickname/gi, 'name');
            renderStudent();
            $('live-join-nickname')?.focus();
            return true;
        }
        return false;
    }

    /* ---------- teacher ---------- */
    function isSignedIn() {
        return Boolean(window.authState?.user);
    }

    function initials(name) {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'LS';
        return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
    }

    function renderTitle() {
        const title = $('lse-title-text');
        const sub = $('lse-title-sub');
        if (!title || !sub) return;
        if (state.role === 'student') {
            title.textContent = 'Join a Live Spark game';
            sub.textContent = "No account needed — just the code from your teacher's screen.";
        } else {
            title.textContent = 'Host a Live Spark game';
            sub.textContent = isSignedIn()
                ? 'Pick your words, create the room, then share the code with your class.'
                : 'Sign in so your word sets and class results are saved.';
        }
    }

    function renderTeacher() {
        const signedIn = isSignedIn();
        const signin = $('lse-signin-form');
        const setup = $('live-host-setup-form');
        const forgot = $('lse-forgot-form');
        if (forgot && signedIn) forgot.hidden = true;
        if (signin) signin.hidden = signedIn || Boolean(forgot && !forgot.hidden);
        if (setup) setup.hidden = !signedIn;
        if (!signedIn) applySigninPrefill();
        const google = window.authState?.googleConfigured;
        if ($('lse-google-btn')) $('lse-google-btn').hidden = !google;
        if ($('lse-or')) $('lse-or').hidden = !google;
        if (signedIn) {
            const user = window.authState.user;
            const display = user.name || String(user.email || '').split('@')[0] || 'teacher';
            $('lse-hello-name').textContent = `Hi, ${display} 👋`;
            const pic = $('lse-hello-pic');
            if (user.picture) {
                pic.style.backgroundImage = `url("${String(user.picture).replace(/"/g, '%22')}")`;
                pic.textContent = '';
            } else {
                pic.style.backgroundImage = '';
                pic.textContent = initials(display);
            }
            syncSourceLayout();
            checkResume();
        } else {
            setResume(null);
        }
        renderTitle();
    }

    function syncSourceLayout() {
        const source = document.querySelector('input[name="live-source"]:checked')?.value || 'builtin';
        const card = $('lse-teacher-card');
        if (card) card.classList.toggle('is-paste', source === 'paste' || source === 'wordset');
        const label = $('lse-paste-label');
        const num = $('lse-paste-num');
        if (label) label.textContent = source === 'wordset' ? 'Check the list' : 'Paste your list';
        if (num) num.textContent = source === 'wordset' ? '3' : '2';
        syncPasteDone();
    }

    /** Paste step turns green once the list has 12+ lines; the word-set step once a set is picked. */
    function syncPasteDone() {
        const lines = String($('live-host-glossary')?.value || '').split('\n').filter((l) => l.trim()).length;
        $('live-host-paste-row')?.classList.toggle('done', lines >= 12);
        $('live-host-wordset-row')?.classList.toggle('done', Boolean($('live-host-wordset')?.value));
    }

    function setResume(code) {
        document.querySelectorAll('#lse-teacher-card .lse-resume').forEach((el) => {
            el.hidden = !code;
            const b = el.querySelector('.lse-resume-code');
            if (b) b.textContent = code || '';
        });
    }

    let resumeSeq = 0;
    async function checkResume() {
        const seq = ++resumeSeq;
        let code = '';
        let token = '';
        try {
            code = sessionStorage.getItem('ls_live_host_code') || '';
            token = sessionStorage.getItem('ls_live_host_token') || '';
        } catch { /* ignore */ }
        if (!code || !token) { setResume(null); return; }
        try {
            const res = await fetch(`/api/live/room/${encodeURIComponent(code)}`, { credentials: 'same-origin' });
            if (seq !== resumeSeq) return;
            setResume(res.ok ? code : null);
        } catch {
            if (seq === resumeSeq) setResume(null);
        }
    }

    function setSigninError(text) {
        const banner = $('lse-signin-error');
        if (banner) {
            banner.hidden = !text;
            if (text) $('lse-signin-error-text').textContent = text;
        }
        $('lse-step-email')?.classList.toggle('bad', Boolean(text));
        $('lse-step-password')?.classList.toggle('bad', Boolean(text));
    }

    async function onSignin(e) {
        e.preventDefault();
        const email = $('lse-email').value.trim();
        const password = $('lse-password').value;
        if (!email || !password) {
            setSigninError('Enter your email and password to sign in.');
            (!email ? $('lse-email') : $('lse-password')).focus();
            return;
        }
        const btn = $('lse-signin-btn');
        btn.disabled = true;
        setSigninError('');
        try {
            const res = await fetch('/auth/login', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSigninError(res.status === 401
                    ? "That email and password don't match. Try again."
                    : (data.error || 'Sign in failed. Please try again.'));
                $('lse-password').focus();
                $('lse-password').select();
                return;
            }
            $('lse-password').value = '';
            if (typeof window.refreshAuth === 'function') await window.refreshAuth();
            renderTeacher();
            window.LiveGame?.prepareHostSetup?.();
        } catch {
            setSigninError('Could not reach LingoSpark. Check your connection and try again.');
        } finally {
            btn.disabled = false;
        }
    }

    /** After a password reset ("Sign in" on the reset page) the email is already filled in. */
    function applySigninPrefill() {
        let email = '';
        let openForgot = false;
        try {
            email = sessionStorage.getItem('ls_signin_prefill') || '';
            openForgot = sessionStorage.getItem('ls_live_open_forgot') === '1';
            sessionStorage.removeItem('ls_signin_prefill');
            sessionStorage.removeItem('ls_live_open_forgot');
        } catch { /* ignore */ }
        const input = $('lse-email');
        if (email && !openForgot && $('lse-forgot-form') && !$('lse-forgot-form').hidden) {
            $('lse-forgot-form').hidden = true;
            if ($('lse-signin-form')) $('lse-signin-form').hidden = false;
        }
        if (email && input) {
            input.value = email;
            requestAnimationFrame(() => $('lse-password')?.focus({ preventScroll: true }));
        }
        if (openForgot) showForgot(true);
    }

    // ---- "Forgot password?" (inline in the teacher card) ----
    function setForgotBanner(kind, text) {
        const err = $('lse-forgot-error');
        const ok = $('lse-forgot-ok');
        if (err) err.hidden = kind !== 'err' || !text;
        if (ok) ok.hidden = kind !== 'ok' || !text;
        if (kind === 'err' && text) $('lse-forgot-error-text').textContent = text;
        if (kind === 'ok' && text) $('lse-forgot-ok-text').textContent = text;
        $('lse-step-forgot-email')?.classList.toggle('bad', kind === 'err' && Boolean(text));
    }

    function showForgot(on) {
        const signin = $('lse-signin-form');
        const forgot = $('lse-forgot-form');
        if (!forgot) return;
        if (on && isSignedIn()) return;
        forgot.hidden = !on;
        if (signin) signin.hidden = on || isSignedIn();
        if (on) {
            const typed = $('lse-email')?.value.trim() || '';
            const input = $('lse-forgot-email');
            if (input && typed) input.value = typed;
            setForgotBanner('', '');
            const btn = $('lse-forgot-btn');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send reset link'; }
            requestAnimationFrame(() => input?.focus({ preventScroll: true }));
        } else {
            const email = $('lse-forgot-email')?.value.trim();
            if (email && $('lse-email') && !$('lse-email').value) $('lse-email').value = email;
            requestAnimationFrame(() => ($('lse-email')?.value ? $('lse-password') : $('lse-email'))?.focus({ preventScroll: true }));
        }
    }

    async function onForgot(e) {
        e.preventDefault();
        const input = $('lse-forgot-email');
        const email = input.value.trim();
        const valid = window.PasswordReset?.looksLikeEmail
            ? window.PasswordReset.looksLikeEmail(email)
            : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!valid) {
            setForgotBanner('err', 'Please enter a valid email address.');
            input.focus();
            return;
        }
        const btn = $('lse-forgot-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…';
        setForgotBanner('', '');
        const r = window.PasswordReset
            ? await window.PasswordReset.requestReset(email, 'live')
            : { ok: false, error: 'Please reload the page and try again.' };
        btn.disabled = false;
        if (r.ok) {
            setForgotBanner('ok', r.message);
            btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Send again';
            try { sessionStorage.setItem('ls_signin_prefill', email); } catch { /* ignore */ }
            if ($('lse-email')) $('lse-email').value = email;
        } else {
            setForgotBanner('err', r.error);
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send reset link';
        }
    }

    async function onNotYou(e) {
        e.preventDefault();
        try { await fetch('/auth/logout', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
        if (typeof window.refreshAuth === 'function') await window.refreshAuth();
        window.LiveGame?.onAuthChanged?.();
        renderTeacher();
        $('lse-email')?.focus();
    }

    /* ---------- role + open ---------- */
    function setRole(role, { remember = true } = {}) {
        state.role = role === 'teacher' ? 'teacher' : 'student';
        const screen = $('screen-live-join');
        if (screen) screen.dataset.role = state.role;
        const student = state.role === 'student';
        $('lse-role-student')?.classList.toggle('on', student);
        $('lse-role-teacher')?.classList.toggle('on', !student);
        $('lse-role-student')?.setAttribute('aria-selected', String(student));
        $('lse-role-teacher')?.setAttribute('aria-selected', String(!student));
        if ($('lse-student-card')) $('lse-student-card').hidden = !student;
        if ($('lse-teacher-card')) $('lse-teacher-card').hidden = student;
        if (remember) {
            try { localStorage.setItem('ls_live_role', state.role); } catch { /* ignore */ }
        }
        if (!student) renderTeacher();
        renderTitle();
    }

    function getRole() {
        return state.role;
    }

    function rememberedRole() {
        try { return localStorage.getItem('ls_live_role') === 'teacher' ? 'teacher' : 'student'; } catch { return 'student'; }
    }

    function syncHash() {
        if (typeof window.setAppHash !== 'function') return;
        if (state.role === 'teacher') window.setAppHash('live/host');
        else {
            const code = codeFromChars(state.chars);
            window.setAppHash(code.length === CODE_LEN ? `live/join?code=${encodeURIComponent(code)}` : 'live/join');
        }
    }

    /** Show the entry page. opts: { role, code, prefilled } */
    function open(opts = {}) {
        const role = opts.role || rememberedRole();
        setRole(role, { remember: Boolean(opts.role) });
        if (role === 'student') {
            const code = normalizeCode(opts.code || '');
            if (code.length === CODE_LEN) {
                state.chars = charsFromCode(code);
                state.lookup = { status: 'idle', prefilled: Boolean(opts.prefilled) };
                syncBoxes();
                lookupCode(code);
            } else {
                syncBoxes();
                renderStudent();
            }
            const name = $('live-join-nickname');
            try {
                if (name && !name.value) name.value = sessionStorage.getItem('ls_live_nickname') || '';
                if (!state.avatar) setAvatar(sessionStorage.getItem('ls_live_avatar') || '');
            } catch { /* ignore */ }
            state.nameError = '';
            renderStudent();
        }
        if (typeof window.showScreen === 'function') window.showScreen('live-join');
        if (opts.focus !== false) {
            requestAnimationFrame(() => {
                if (state.role === 'teacher') {
                    if (!isSignedIn()) ($('lse-email')?.value ? $('lse-password') : $('lse-email'))?.focus({ preventScroll: true });
                } else if (isComplete(state.chars)) {
                    $('live-join-nickname')?.focus({ preventScroll: true });
                } else {
                    focusBox(Math.max(0, state.chars.findIndex((c) => !c)));
                }
            });
        }
    }

    function onRoleClick(role) {
        if (role === state.role) return;
        if (role === 'teacher') {
            if (window.LiveGame?.openHost) window.LiveGame.openHost({ fresh: true });
            else { setRole('teacher'); syncHash(); }
        } else {
            open({ role: 'student' });
            syncHash();
        }
    }

    function init() {
        if (!$('lse-code')) return;
        renderAvatars();
        bindCodeBoxes();
        $('live-join-nickname')?.addEventListener('input', () => {
            state.nameError = '';
            renderStudent();
        });
        $('live-join-nickname')?.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            onJoinClick();
        });
        $('live-join-btn')?.addEventListener('click', onJoinClick);
        $('lse-role-student')?.addEventListener('click', () => onRoleClick('student'));
        $('lse-role-teacher')?.addEventListener('click', () => onRoleClick('teacher'));
        // Arrow keys move between the two tabs (WAI-ARIA tabs pattern).
        document.querySelector('.lse-roles')?.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const role = state.role === 'student' ? 'teacher' : 'student';
            onRoleClick(role);
            $(role === 'student' ? 'lse-role-student' : 'lse-role-teacher')?.focus();
        });
        $('lse-signin-form')?.addEventListener('submit', onSignin);
        $('lse-forgot-form')?.addEventListener('submit', onForgot);
        $('lse-forgot-link')?.addEventListener('click', (e) => { e.preventDefault(); showForgot(true); });
        $('lse-forgot-back')?.addEventListener('click', (e) => { e.preventDefault(); showForgot(false); });
        $('lse-forgot-email')?.addEventListener('input', () => { if (!$('lse-forgot-error')?.hidden) setForgotBanner('', ''); });
        ['lse-email', 'lse-password'].forEach((id) => $(id)?.addEventListener('input', () => setSigninError('')));
        $('lse-register-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.openAuthModal === 'function') window.openAuthModal('register');
        });
        $('lse-not-you')?.addEventListener('click', onNotYou);
        document.querySelectorAll('#lse-teacher-card .lse-resume-link').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                window.LiveGame?.resumeHost?.();
            });
        });
        document.querySelectorAll('input[name="live-source"]').forEach((el) => {
            el.addEventListener('change', syncSourceLayout);
        });
        $('live-host-glossary')?.addEventListener('input', syncPasteDone);
        $('live-host-wordset')?.addEventListener('change', () => setTimeout(syncPasteDone, 400));
        renderStudent();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.LiveEntry = {
        open, setRole, getRole, renderTeacher, syncPasteDone, renderStudent, handleJoinError, checkResume, syncHash, showForgot,
        getAvatar: () => state.avatar,
        getCode: () => codeFromChars(state.chars),
    };
})(typeof window !== 'undefined' ? window : globalThis);
