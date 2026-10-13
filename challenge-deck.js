/**
 * Host challenge cards as a stacked deck (Word Cannon host).
 * The OLDEST pending challenge is the top card: fully visible, actionable and never re-rendered
 * or moved while newer challenges arrive. Newer cards slide in underneath as offset edges
 * (max MAX_EDGES visible + "+N" counter). When the top card resolves it flies away and the
 * next one lifts up.
 * Browser: window.ChallengeDeck. Node tests: import then read globalThis.ChallengeDeck.
 */
(function (root) {
    'use strict';

    const MAX_EDGES = 3;
    const LEAVE_MS = 380;

    /** Pure: diff the shown card ids against the pending ones (both oldest first). */
    function planDeck(prevIds, nextIds, maxEdges = MAX_EDGES) {
        const prev = (prevIds || []).map(String);
        const next = (nextIds || []).map(String);
        const nextSet = new Set(next);
        const prevSet = new Set(prev);
        const removed = prev.filter((id) => !nextSet.has(id));
        const added = next.filter((id) => !prevSet.has(id));
        const slots = next.map((id, i) => ({ id, depth: i, visible: i <= maxEdges }));
        return {
            order: next,
            added,
            removed,
            topId: next[0] || null,
            topChanged: (prev[0] ?? null) !== (next[0] ?? null),
            slots,
            extra: Math.max(0, next.length - 1 - maxEdges),
        };
    }

    /**
     * Keyed render into `panel`. `cardHtml(c)` returns the inner HTML of one card;
     * `bind(cardEl, c)` wires its buttons. Existing card elements are reused untouched.
     */
    function render(panel, challenges, { cardHtml, bind, idOf = (c) => c.id, maxEdges = MAX_EDGES } = {}) {
        if (!panel) return null;
        const doc = panel.ownerDocument;
        panel.classList.add('live-challenge-deck');
        const live = Array.from(panel.querySelectorAll(':scope > .live-host-challenge-card:not(.is-leaving)'));
        const prevIds = live.map((el) => el.dataset.challengeId);
        const byId = new Map(challenges.map((c) => [String(idOf(c)), c]));
        const plan = planDeck(prevIds, challenges.map((c) => String(idOf(c))), maxEdges);

        plan.removed.forEach((id) => {
            const el = live.find((x) => x.dataset.challengeId === id);
            if (!el) return;
            const wasTop = el.dataset.depth === '0';
            el.classList.add('is-leaving');
            el.classList.toggle('is-leaving-top', wasTop);
            el.setAttribute('aria-hidden', 'true');
            el.inert = true;
            setTimeout(() => el.remove(), LEAVE_MS);
        });

        plan.added.forEach((id) => {
            const c = byId.get(id);
            const el = doc.createElement('div');
            el.className = 'live-host-challenge-card is-entering';
            el.dataset.challengeId = id;
            el.innerHTML = cardHtml(c);
            if (bind) bind(el, c);
            panel.appendChild(el);
            el.addEventListener('animationend', () => el.classList.remove('is-entering'), { once: true });
        });

        let topHeight = 0;
        plan.slots.forEach(({ id, depth, visible }) => {
            const el = panel.querySelector(`:scope > .live-host-challenge-card[data-challenge-id="${CSS.escape(id)}"]:not(.is-leaving)`);
            if (!el) return;
            const prevDepth = el.dataset.depth;
            if (prevDepth !== String(depth)) {
                el.dataset.depth = String(depth);
                el.style.setProperty('--depth', String(Math.min(depth, maxEdges)));
            }
            const isTop = depth === 0;
            el.classList.toggle('is-top', isTop);
            el.classList.toggle('is-under', !isTop);
            el.classList.toggle('is-hidden-deep', !visible);
            el.style.zIndex = String(100 - depth);
            if (isTop) {
                el.removeAttribute('aria-hidden');
                el.inert = false;
                if (prevDepth && prevDepth !== '0') el.classList.add('is-lifting');
                topHeight = el.offsetHeight;
            } else {
                el.setAttribute('aria-hidden', 'true');
                el.inert = true;
            }
        });
        panel.querySelectorAll(':scope > .is-lifting').forEach((el) => {
            setTimeout(() => el.classList.remove('is-lifting'), LEAVE_MS);
        });
        if (topHeight) panel.style.setProperty('--deck-h', `${topHeight}px`);
        // Under-cards match the top card's height so their edges peek out; re-measure when it lays out/resizes.
        const topEl = panel.querySelector(':scope > .live-host-challenge-card.is-top:not(.is-leaving)');
        const measure = () => {
            const t = panel.querySelector(':scope > .live-host-challenge-card.is-top:not(.is-leaving)');
            if (t && t.offsetHeight) panel.style.setProperty('--deck-h', `${t.offsetHeight}px`);
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(measure);
        if (typeof ResizeObserver === 'function') {
            if (!panel._deckRO) panel._deckRO = new ResizeObserver(measure);
            panel._deckRO.disconnect();
            if (topEl) panel._deckRO.observe(topEl);
        }

        let counter = panel.querySelector(':scope > .live-challenge-deck-more');
        if (plan.extra > 0) {
            if (!counter) {
                counter = doc.createElement('div');
                counter.className = 'live-challenge-deck-more';
                panel.appendChild(counter);
            }
            counter.textContent = `+${plan.extra}`;
            counter.setAttribute('aria-label', `${plan.extra} more challenge${plan.extra === 1 ? '' : 's'} waiting`);
        } else if (counter) counter.remove();
        panel.dataset.count = String(plan.order.length);
        panel.setAttribute('aria-label', plan.order.length > 1
            ? `Challenges: ${plan.order.length} waiting, oldest shown first`
            : 'Challenge waiting');
        return plan;
    }

    root.ChallengeDeck = { planDeck, render, MAX_EDGES, LEAVE_MS };
})(typeof window !== 'undefined' ? window : globalThis);
