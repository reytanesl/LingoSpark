/* Vocab Auction — casino chips: rules helpers (pure, unit-tested) + chip art + chip motion.
   Classic script: sets globalThis.AuctionChips (also importable from node for tests). */
(function (root) {
    'use strict';

    /* ------------------------------------------------------------------
       1. Chips + betting rules (pure)
       ------------------------------------------------------------------ */
    const CHIP_VALUES = [10, 50, 100, 500, 1000];
    const BET_STEP = 10;
    const DENOMS = {
        1000: { name: 'Violet', base: '#6B2FB3', dark: '#45197A', edge: '#FFD86B', inlay: '#F3E8FF', ink: '#45197A', label: '1K' },
        500: { name: 'Onyx', base: '#1C1C22', dark: '#050507', edge: '#E8B931', inlay: '#FFF3C9', ink: '#1C1C22', label: '500' },
        100: { name: 'Royal', base: '#1E4FD8', dark: '#12318A', edge: '#FFFFFF', inlay: '#EAF0FF', ink: '#12318A', label: '100' },
        50: { name: 'Ruby', base: '#D0213F', dark: '#8A0F25', edge: '#FFFFFF', inlay: '#FFEAEE', ink: '#8A0F25', label: '50' },
        10: { name: 'Ivory', base: '#F4EBD6', dark: '#C9B88F', edge: '#1B2A6B', inlay: '#FFFFFF', ink: '#1B2A6B', label: '10' },
    };

    const toStep = (n) => Math.max(0, Math.floor((Number(n) || 0) / BET_STEP) * BET_STEP);

    /** Greedy split of an amount into chips using the allowed denominations (largest first). */
    function breakdown(amount, allowed = [1000, 500, 100, 50, 10]) {
        const out = [];
        let left = toStep(amount);
        for (const v of allowed) {
            while (left >= v) { out.push(v); left -= v; }
        }
        return out;
    }

    /** Chips for a stack/flight: small denominations first, bigger ones only when the pile gets too tall. */
    function chipsFor(amount, maxCount = 14) {
        const sets = [[100, 50, 10], [500, 100, 50, 10], [1000, 500, 100, 50, 10]];
        for (const set of sets) {
            const chips = breakdown(amount, set);
            if (chips.length <= maxCount) return chips;
        }
        return breakdown(amount).slice(0, maxCount * 2);
    }

    function sumBets(bets, exceptKey) {
        return Object.entries(bets || {}).reduce((s, [k, v]) => (k === exceptKey ? s : s + (Number(v) || 0)), 0);
    }

    /** New bet on `word` after dropping a chip of `value` on it: 10-chip steps, total never above the bankroll. */
    function addChip(bets, word, value, bankroll) {
        const current = Number(bets?.[word]) || 0;
        const room = toStep(Math.max(0, (Number(bankroll) || 0) - sumBets(bets, word) - current));
        return current + Math.min(toStep(value), room);
    }

    /** New bet on `word` after taking a chip of `value` back off it (never below 0). */
    function removeChip(bets, word, value) {
        const current = Number(bets?.[word]) || 0;
        return Math.max(0, current - toStep(value));
    }

    /**
     * Settle a multiple-choice round. Every chip on the table is paid in; the bet on the right
     * word comes back doubled. Net on a correct bet X = +X, on a wrong/missed bet = −X.
     */
    function settleBets(bets, correctWord, bankroll) {
        const key = String(correctWord || '').toLowerCase();
        let wagered = 0;
        let correctBet = 0;
        const lost = [];
        for (const [word, raw] of Object.entries(bets || {})) {
            const amt = Number(raw) || 0;
            if (amt <= 0) continue;
            wagered += amt;
            if (word.toLowerCase() === key) correctBet += amt;
            else lost.push({ word, amount: amt });
        }
        const before = Number(bankroll) || 0;
        const after = Math.max(0, before - wagered + correctBet * 2);
        return { before, after, net: after - before, wagered, correctBet, payout: correctBet * 2, won: correctBet > 0, lost };
    }

    /** Settle a typed round: one bet, paid double when the typed answer is right. */
    function settleTyped(bet, isCorrect, bankroll) {
        return settleBets({ answer: bet }, isCorrect ? 'answer' : '', bankroll);
    }

    /* ------------------------------------------------------------------
       2. Chip art (inline SVG)
       ------------------------------------------------------------------ */
    function chipTop(v, size = 64) {
        const d = DENOMS[v] || DENOMS[10];
        let inserts = '';
        for (let i = 0; i < 8; i += 1) {
            inserts += `<rect x="44" y="2.5" width="12" height="11" rx="2" fill="${d.edge}" transform="rotate(${i * 45 + 22.5} 50 50)"/>`;
        }
        const fs = d.label.length > 2 ? 17 : 21;
        return `<svg class="chip-top" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <circle cx="50" cy="52" r="47" fill="rgba(0,0,0,.35)"/>
            <circle cx="50" cy="50" r="47" fill="${d.base}" stroke="${d.dark}" stroke-width="2.5"/>${inserts}
            <circle cx="50" cy="50" r="33" fill="none" stroke="${d.edge}" stroke-width="2.6" stroke-dasharray="5 4.2"/>
            <circle cx="50" cy="50" r="27" fill="${d.inlay}" stroke="${d.dark}" stroke-width="1.6"/>
            <text x="50" y="${50 + fs * 0.36}" text-anchor="middle" font-family="Lilita One, Fredoka, sans-serif" font-size="${fs}" fill="${d.ink}">${d.label}</text>
            <path d="M18 34 A36 36 0 0 1 46 13" stroke="rgba(255,255,255,.55)" stroke-width="4" fill="none" stroke-linecap="round"/>
        </svg>`;
    }

    function chipSide(v, w = 84) {
        const d = DENOMS[v] || DENOMS[10];
        let stripes = '';
        for (const x of [9, 27, 45, 63, 81]) stripes += `<rect x="${x}" y="11" width="7" height="11" fill="${d.edge}"/>`;
        return `<svg class="chip-side" width="${w}" height="${w * 0.36}" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <ellipse cx="50" cy="22" rx="48" ry="11" fill="${d.dark}"/><rect x="2" y="11" width="96" height="11" fill="${d.base}"/>${stripes}
            <rect x="2" y="19" width="96" height="3" fill="rgba(0,0,0,.18)"/>
            <ellipse cx="50" cy="11" rx="48" ry="11" fill="${d.base}" stroke="${d.dark}" stroke-width="1"/>
            <ellipse cx="50" cy="11" rx="34" ry="7.4" fill="none" stroke="${d.edge}" stroke-width="1.6" stroke-dasharray="4 3"/>
            <ellipse cx="50" cy="11" rx="25" ry="5.2" fill="${d.inlay}" opacity=".95"/>
        </svg>`;
    }

    /** Side-view stack(s). `mixed` piles different chips in one column, like a real bet. */
    function stackHtml(amount, { w = 84, step = 0.21, maxPerCol = 7, gap = 8, mixed = true, maxCount = 14 } = {}) {
        const chips = chipsFor(amount, maxCount);
        if (!chips.length) return '';
        const cols = [];
        for (const v of chips) {
            let col = mixed ? cols.find((c) => c.list.length < maxPerCol) : cols.find((c) => c.v === v && c.list.length < maxPerCol);
            if (!col) { col = { v, list: [] }; cols.push(col); }
            col.list.push(v);
        }
        const h = w * 0.36;
        const dy = w * step;
        return `<div class="va-stack" style="gap:${gap}px">${cols.map((c) =>
            `<div class="va-stack-col" style="width:${w}px;height:${h + (c.list.length - 1) * dy}px">${c.list.map((v, i) =>
                `<div class="va-stack-chip" style="bottom:${i * dy}px">${chipSide(v, w)}</div>`).join('')}</div>`).join('')}</div>`;
    }

    /* ------------------------------------------------------------------
       3. Chip motion (browser only)
       ------------------------------------------------------------------ */
    let fxLayer = null;
    const live = new Set();
    const timers = new Set();

    function reducedMotion() {
        return Boolean(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    function layer() {
        if (!fxLayer) {
            fxLayer = root.document.getElementById('va-fx');
            if (!fxLayer) {
                fxLayer = root.document.createElement('div');
                fxLayer.id = 'va-fx';
                fxLayer.className = 'va-fx';
                fxLayer.setAttribute('aria-hidden', 'true');
                root.document.body.appendChild(fxLayer);
            }
        }
        return fxLayer;
    }
    function centerOf(target) {
        const r = target.getBoundingClientRect ? target.getBoundingClientRect() : target;
        return [r.left + r.width / 2, r.top + r.height / 2];
    }
    function wait(ms) {
        return new Promise((resolve) => {
            const id = setTimeout(() => { timers.delete(id); resolve(); }, ms);
            timers.add(id);
        });
    }
    function addFx(html) {
        const holder = root.document.createElement('div');
        holder.innerHTML = html.trim();
        const el = holder.firstElementChild;
        layer().appendChild(el);
        live.add(el);
        return el;
    }
    function dropFx(el) { live.delete(el); el.remove(); }

    function arcFrames(p0, p1, lift, size, n = 14, spin = 26, scaleTo = 1) {
        const cx = (p0[0] + p1[0]) / 2;
        const cy = Math.min(p0[1], p1[1]) - lift;
        const frames = [];
        for (let i = 0; i <= n; i += 1) {
            const p = i / n;
            const u = 1 - p;
            const x = u * u * p0[0] + 2 * u * p * cx + p * p * p1[0];
            const y = u * u * p0[1] + 2 * u * p * cy + p * p * p1[1];
            const s = (1 + Math.sin(p * Math.PI) * 0.22) * (1 + (scaleTo - 1) * p);
            frames.push({ transform: `translate(${x - size / 2}px, ${y - size / 2}px) rotate(${Math.sin(p * Math.PI * 2) * spin}deg) scale(${s})`, offset: p });
        }
        return frames;
    }

    /** Fly chips along arcs from → to (staggered). onLand(i) fires as each one lands. */
    async function fly(from, to, values, { size = 56, lift = 140, dur = 560, gap = 90, onLand = null, ghosts = true, scaleTo = 1, fadeOut = false } = {}) {
        if (!values.length) return;
        if (reducedMotion()) { values.forEach((_, i) => onLand && onLand(i)); return; }
        const p0 = centerOf(from);
        const p1 = centerOf(to);
        const jobs = values.map((v, i) => wait(i * gap).then(() => {
            const frames = arcFrames([p0[0] + (i % 3 - 1) * 8, p0[1]], p1, lift, size, 14, 26, scaleTo);
            if (fadeOut) frames[frames.length - 1].opacity = 0;
            const els = [];
            const trail = ghosts ? [[70, 0.18], [35, 0.34], [0, 1]] : [[0, 1]];
            const runs = trail.map(([lag, op]) => {
                const el = addFx(`<div class="va-fly${lag ? ' is-ghost' : ''}" style="opacity:0">${chipTop(v, size)}</div>`);
                els.push(el);
                const anim = el.animate(frames.map((f) => ({ ...f, opacity: f.opacity ?? op })), { duration: dur, delay: lag, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'both' });
                return anim.finished.catch(() => {});
            });
            return Promise.all(runs).then(() => { els.forEach(dropFx); if (onLand) onLand(i); });
        }));
        await Promise.all(jobs);
    }

    /** Croupier rake: reaches out from the bank, hooks the chips on `spot`, drags them home. */
    async function rake(spot, bank, values, { onGrab = null } = {}) {
        if (reducedMotion()) { if (onGrab) onGrab(); return; }
        const [sx, sy] = centerOf(spot);
        const [bx, by] = centerOf(bank);
        const start = [bx, by + 40];
        const behind = [sx, sy + Math.min(70, spot.getBoundingClientRect().height * 0.28)];
        const pivot = [bx, by - 900];
        const OUT = 420, PULL = 700;
        const pathAt = (t) => {
            if (t <= OUT) { const p = 1 - Math.pow(1 - t / OUT, 3); return [start[0] + (behind[0] - start[0]) * p, start[1] + (behind[1] - start[1]) * p]; }
            const q = Math.min(1, (t - OUT) / PULL);
            const p = q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
            return [behind[0] + (bx - behind[0]) * p, behind[1] + (by - behind[1]) * p];
        };
        const total = OUT + PULL;
        const N = 24;
        const headF = [], handF = [];
        for (let i = 0; i <= N; i += 1) {
            const t = (i / N) * total;
            const [hx, hy] = pathAt(t);
            const dx = pivot[0] - hx, dy = pivot[1] - hy;
            const ang = Math.atan2(dy, dx) * 180 / Math.PI;
            const op = t > total - 140 ? Math.max(0, (total - t) / 140) : 1;
            headF.push({ transform: `translate(${hx}px, ${hy}px) rotate(${ang + 90}deg)`, opacity: op, offset: i / N });
            handF.push({ transform: `translate(${hx}px, ${hy}px) rotate(${ang}deg)`, width: `${Math.hypot(dx, dy)}px`, opacity: op, offset: i / N });
        }
        const handle = addFx('<div class="va-rake-handle"></div>');
        const head = addFx('<div class="va-rake-head"></div>');
        const a1 = handle.animate(handF, { duration: total, fill: 'both' });
        const a2 = head.animate(headF, { duration: total, fill: 'both' });
        await wait(OUT);
        if (onGrab) onGrab();
        const shown = values.slice(0, 6);
        const chips = shown.map((v, k) => {
            const off = (k - (shown.length - 1) / 2) * 34;
            const frames = [];
            for (let i = 0; i <= 16; i += 1) {
                const q = i / 16;
                const [hx, hy] = pathAt(OUT + q * PULL);
                const lagged = Math.max(0, q - k * 0.03);
                const x = hx + off * (1 - lagged * 0.7);
                const y = hy - 30 - Math.abs(off) * 0.12;
                const s = 1 - Math.max(0, q - 0.82) * 3;
                frames.push({ transform: `translate(${x - 26}px, ${y - 26}px) rotate(${lagged * 140 + k * 20}deg) scale(${Math.max(0.2, s)})`, offset: q });
            }
            const el = addFx(`<div class="va-fly">${chipTop(v, 52)}</div>`);
            return el.animate(frames, { duration: PULL, easing: 'linear', fill: 'both' }).finished.catch(() => {}).then(() => dropFx(el));
        });
        await Promise.all([...chips, a1.finished.catch(() => {}), a2.finished.catch(() => {})]);
        dropFx(handle);
        dropFx(head);
        bank.classList?.add('is-gulp');
        wait(450).then(() => bank.classList?.remove('is-gulp'));
    }

    /** Phone: the losing chips slide sideways off the felt into the BANK tab. */
    async function slideOff(spot, edge, values, { onGrab = null } = {}) {
        if (onGrab) onGrab();
        if (reducedMotion()) return;
        const [sx, sy] = centerOf(spot);
        const [ex, ey] = centerOf(edge);
        const shown = values.slice(0, 5);
        await Promise.all(shown.map((v, k) => wait(k * 70).then(() => {
            const el = addFx(`<div class="va-fly">${chipTop(v, 40)}</div>`);
            const y = sy + (k % 2 ? -8 : 8);
            return el.animate([
                { transform: `translate(${sx - 60 - 20 + k * 10}px, ${y - 20}px) rotate(0deg)`, opacity: 1 },
                { transform: `translate(${ex - 30}px, ${(y + ey) / 2 - 20}px) rotate(${120 + k * 30}deg)`, opacity: 1, offset: 0.8 },
                { transform: `translate(${ex + 10}px, ${(y + ey) / 2 - 20}px) rotate(${160 + k * 30}deg) scale(.6)`, opacity: 0 },
            ], { duration: 620, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'both' }).finished.catch(() => {}).then(() => dropFx(el));
        })));
        edge.classList?.add('is-gulp');
        wait(450).then(() => edge.classList?.remove('is-gulp'));
    }

    /** Float a big number (e.g. "−150") over an element. */
    function floatText(target, text, cls) {
        if (reducedMotion()) return;
        const [x, y] = centerOf(target);
        const el = addFx(`<div class="va-float ${cls}" style="left:${x}px;top:${y}px">${text}</div>`);
        el.animate([
            { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 },
            { transform: 'translate(-50%, -60%) scale(1.08)', opacity: 1, offset: 0.2 },
            { transform: 'translate(-50%, -90%) scale(1)', opacity: 1, offset: 0.75 },
            { transform: 'translate(-50%, -120%) scale(1)', opacity: 0 },
        ], { duration: 1300, easing: 'ease-out', fill: 'both' }).finished.catch(() => {}).then(() => dropFx(el));
    }

    function sparkles(target) {
        if (reducedMotion()) return;
        const [x, y] = centerOf(target);
        for (let k = 0; k < 12; k += 1) {
            const a = (k / 12) * Math.PI * 2 + 0.3;
            const r = 70 + (k % 3) * 30;
            const el = addFx(`<div class="va-sparkle" style="left:${x}px;top:${y}px"></div>`);
            el.animate([
                { transform: 'translate(-50%,-50%) rotate(45deg) scale(1)', opacity: 1 },
                { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r * 0.6}px)) rotate(45deg) scale(.4)`, opacity: 0 },
            ], { duration: 850, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' }).finished.catch(() => {}).then(() => dropFx(el));
        }
    }

    /** Roll a number up/down on screen. */
    function countUp(el, from, to, ms = 900, fmt = (n) => Math.round(n).toLocaleString('en-GB')) {
        if (!el) return Promise.resolve();
        if (reducedMotion() || ms <= 0 || from === to) { el.textContent = fmt(to); return Promise.resolve(); }
        const t0 = performance.now();
        return new Promise((resolve) => {
            const tick = (now) => {
                if (el.dataset.countCancel === '1') { el.dataset.countCancel = ''; resolve(); return; }
                const p = Math.min(1, (now - t0) / ms);
                const e = 1 - Math.pow(1 - p, 3);
                el.textContent = fmt(from + (to - from) * e);
                if (p < 1) requestAnimationFrame(tick); else resolve();
            };
            requestAnimationFrame(tick);
        });
    }

    /** Stop every running chip animation (used when the player moves on early). */
    function cancelAll() {
        timers.forEach((id) => clearTimeout(id));
        timers.clear();
        live.forEach((el) => el.remove());
        live.clear();
    }

    const api = {
        CHIP_VALUES, BET_STEP, DENOMS, breakdown, chipsFor, sumBets, addChip, removeChip, settleBets, settleTyped,
        chipTop, chipSide, stackHtml, reducedMotion, fly, rake, slideOff, floatText, sparkles, countUp, cancelAll, wait,
    };
    root.AuctionChips = api;
})(typeof window !== 'undefined' ? window : globalThis);
