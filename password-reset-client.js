/* "Forgot password?" in the sign-in modal + the #/reset-password page.
   The Live Spark teacher sign-in has its own inline form (live-entry.js) that uses PasswordReset.requestReset. */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const MIN_LENGTH = 8;
    let token = '';
    let resetEmail = '';

    function remember(key, value, store = localStorage) {
        try { store.setItem(key, value); } catch { /* ignore */ }
    }
    function recall(key, store = localStorage) {
        try { return store.getItem(key) || ''; } catch { return ''; }
    }

    function looksLikeEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
    }

    async function requestReset(email, origin) {
        remember('ls_reset_origin', origin || 'modal');
        try {
            const res = await fetch('/auth/forgot-password', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: String(email || '').trim() }),
            });
            const data = await res.json().catch(() => ({}));
            return { ok: res.ok, status: res.status, message: data.message || '', error: data.error || (res.ok ? '' : 'Something went wrong. Please try again.') };
        } catch {
            return { ok: false, status: 0, error: 'No connection. Check your internet and try again.' };
        }
    }

    // ---------------- sign-in modal ----------------
    function openForgotPassword(event) {
        event?.preventDefault?.();
        const typed = $('auth-email')?.value.trim() || '';
        if (typeof window.setAuthTab === 'function') window.setAuthTab('forgot');
        const input = $('auth-forgot-email');
        if (input) input.value = typed;
        $('auth-forgot-ok').hidden = true;
        $('auth-forgot-error').textContent = '';
        const btn = $('auth-forgot-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'Send reset link'; }
        setTimeout(() => input?.focus(), 30);
        return false;
    }

    async function submitForgotPassword(event) {
        event?.preventDefault?.();
        const email = $('auth-forgot-email').value.trim();
        const err = $('auth-forgot-error');
        const ok = $('auth-forgot-ok');
        err.textContent = '';
        ok.hidden = true;
        if (!looksLikeEmail(email)) {
            err.textContent = 'Please enter a valid email address.';
            $('auth-forgot-email').focus();
            return false;
        }
        const btn = $('auth-forgot-btn');
        btn.disabled = true;
        btn.textContent = 'Sending…';
        const r = await requestReset(email, 'modal');
        btn.disabled = false;
        if (r.ok) {
            ok.textContent = r.message;
            ok.hidden = false;
            btn.textContent = 'Send again';
            remember('ls_signin_prefill', email, sessionStorage);
        } else {
            err.textContent = r.error;
            btn.textContent = 'Send reset link';
        }
        return false;
    }

    // ---------------- reset page ----------------
    function tokenFromHash(hash) {
        const query = String(hash || '').split('?')[1] || '';
        try { return new URLSearchParams(query).get('token') || ''; } catch { return ''; }
    }

    function showState(name) {
        ['rp-checking', 'rp-form', 'rp-invalid', 'rp-done'].forEach((id) => {
            const el = $(id);
            if (el) el.hidden = id !== name;
        });
    }

    function setHint(id, kind, text) {
        const el = $(id);
        if (!el) return;
        el.hidden = !text;
        el.className = `lse-hint${kind ? ` ${kind}` : ''}`;
        const icon = kind === 'ok' ? 'fa-circle-check' : kind === 'err' ? 'fa-circle-exclamation' : 'fa-circle-info';
        el.innerHTML = text ? `<i class="fa-solid ${icon}"></i><span></span>` : '';
        if (text) el.querySelector('span').textContent = text;
    }

    function setError(text) {
        $('rp-error').hidden = !text;
        $('rp-error-text').textContent = text || '';
    }

    function syncHints() {
        const pw = $('rp-password').value;
        const confirm = $('rp-confirm').value;
        if (!pw) setHint('rp-password-hint', '', 'Use 8+ characters. A short sentence is easy to remember.');
        else if (pw.length < MIN_LENGTH) setHint('rp-password-hint', 'warn', `${MIN_LENGTH - pw.length} more character${MIN_LENGTH - pw.length === 1 ? '' : 's'} to go.`);
        else setHint('rp-password-hint', 'ok', 'Long enough.');
        $('rp-step-password').classList.toggle('done', pw.length >= MIN_LENGTH);
        if (!confirm) setHint('rp-confirm-hint', '', '');
        else if (confirm === pw) setHint('rp-confirm-hint', 'ok', 'Passwords match.');
        else if (pw.startsWith(confirm)) setHint('rp-confirm-hint', '', '');
        else setHint('rp-confirm-hint', 'err', "Passwords don't match.");
        $('rp-step-confirm').classList.toggle('done', Boolean(confirm) && confirm === pw && pw.length >= MIN_LENGTH);
        $('rp-step-confirm').classList.remove('bad');
        $('rp-step-password').classList.remove('bad');
    }

    async function openResetPage(hash) {
        const fromUrl = tokenFromHash(hash || location.hash);
        if (fromUrl) {
            token = fromUrl;
            // Keep the secret out of the address bar, history and screenshots.
            history.replaceState(null, '', '#/reset-password');
        }
        if (typeof window.showScreen === 'function') window.showScreen('reset-password');
        setError('');
        if (!$('rp-done').hidden && !token) return;
        if (!token) { showState('rp-invalid'); return; }
        showState('rp-checking');
        try {
            const res = await fetch('/auth/reset-password/check', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && !data.valid) { showState('rp-invalid'); return; }
            showState('rp-form');
            if (!res.ok) setError(data.error || 'Could not check the link. You can still try to save a new password.');
        } catch {
            showState('rp-form');
        }
        $('rp-password').value = '';
        $('rp-confirm').value = '';
        syncHints();
        setTimeout(() => $('rp-password')?.focus(), 30);
    }

    async function onSubmit(event) {
        event.preventDefault();
        setError('');
        const password = $('rp-password').value;
        const confirm = $('rp-confirm').value;
        if (password.length < MIN_LENGTH) {
            $('rp-step-password').classList.add('bad');
            setError(`Password must be at least ${MIN_LENGTH} characters.`);
            $('rp-password').focus();
            return;
        }
        if (confirm !== password) {
            $('rp-step-confirm').classList.add('bad');
            setError('Passwords do not match.');
            $('rp-confirm').focus();
            return;
        }
        const btn = $('rp-submit');
        btn.disabled = true;
        btn.classList.add('off');
        const label = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
        try {
            const res = await fetch('/auth/reset-password', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password, confirm }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                token = '';
                resetEmail = data.email || '';
                $('rp-password').value = '';
                $('rp-confirm').value = '';
                showState('rp-done');
                // Old sessions were signed out on the server; refresh the header state too.
                if (typeof window.refreshAuth === 'function') window.refreshAuth().catch?.(() => {});
                setTimeout(() => $('rp-signin')?.focus(), 30);
            } else if (data.code === 'invalid_token') {
                token = '';
                showState('rp-invalid');
            } else {
                setError(data.error || 'Could not change the password. Please try again.');
            }
        } catch {
            setError('No connection. Check your internet and try again.');
        } finally {
            btn.disabled = false;
            btn.classList.remove('off');
            btn.innerHTML = label;
        }
    }

    function goSignIn() {
        const email = resetEmail || recall('ls_signin_prefill', sessionStorage);
        if (email) remember('ls_signin_prefill', email, sessionStorage);
        if (recall('ls_reset_origin') === 'live') {
            location.hash = '#/live/host';
            return;
        }
        if (typeof window.goHome === 'function') window.goHome();
        if (typeof window.openAuthModal === 'function') {
            window.openAuthModal('login');
            if (email) $('auth-email').value = email;
            setTimeout(() => (email ? $('auth-password') : $('auth-email'))?.focus(), 30);
        }
    }

    function askNewLink() {
        if (recall('ls_reset_origin') === 'live') {
            remember('ls_live_open_forgot', '1', sessionStorage);
            location.hash = '#/live/host';
            return;
        }
        if (typeof window.goHome === 'function') window.goHome();
        if (typeof window.openAuthModal === 'function') {
            window.openAuthModal('login');
            openForgotPassword();
        }
    }

    function bind() {
        $('rp-form')?.addEventListener('submit', onSubmit);
        $('rp-password')?.addEventListener('input', () => { setError(''); syncHints(); });
        $('rp-confirm')?.addEventListener('input', () => { setError(''); syncHints(); });
        $('rp-signin')?.addEventListener('click', goSignIn);
        $('rp-new-link')?.addEventListener('click', askNewLink);
        $('rp-back')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.goHome === 'function') window.goHome();
        });
        $('rp-eye')?.addEventListener('click', () => {
            const btn = $('rp-eye');
            const show = btn.getAttribute('aria-pressed') !== 'true';
            btn.setAttribute('aria-pressed', String(show));
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            btn.innerHTML = `<i class="fa-solid ${show ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
            $('rp-password').type = show ? 'text' : 'password';
            $('rp-confirm').type = show ? 'text' : 'password';
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();

    window.PasswordReset = { requestReset, openResetPage, looksLikeEmail };
    window.openForgotPassword = openForgotPassword;
    window.submitForgotPassword = submitForgotPassword;
})();
