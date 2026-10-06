/**
 * Lucky Lanterns visual kit (host projector + phone).
 *
 * Pure DOM / SVG / canvas helpers, no image assets. Palette, shapes and timings
 * follow the Lucky Lanterns concept clip (night festival, glowing paper lanterns,
 * round animal avatars, Luckiest Guy / Lilita One / Fredoka type).
 *
 * Exposed as window.LLFX and used by live-game-client.js.
 */
(function () {
    'use strict';

    const SVGNS = 'http://www.w3.org/2000/svg';
    const LLFX = {};

    LLFX.reduced = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // ---------- small utils ----------
    function seeded(seed) {
        let s = (seed >>> 0) || 1;
        return () => {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }
    function hexToRgb(hex) {
        const h = hex.replace('#', '');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    function mix(a, b, u) {
        const x = hexToRgb(a);
        const y = hexToRgb(b);
        return `#${x.map((v, i) => Math.round(v + (y[i] - v) * u).toString(16).padStart(2, '0')).join('')}`;
    }
    function rgba(hex, a) {
        const [r, g, b] = hexToRgb(hex);
        return `rgba(${r},${g},${b},${a})`;
    }
    const easeIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) ** 3) / 2);
    const easeOut = (u) => 1 - (1 - u) ** 3;
    LLFX.mix = mix;
    LLFX.easeIO = easeIO;
    LLFX.easeOut = easeOut;
    function escText(value) {
        return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ---------- palette ----------
    LLFX.LANTERN_COLORS = {
        safe: { light: '#d8ff8f', main: '#7ed321', dark: '#2f7d0c' },
        risk: { light: '#ffe0a0', main: '#ff7a1a', dark: '#b8360a' },
        mystery: { light: '#efc8ff', main: '#a64dff', dark: '#4d1696' },
        grey: { light: '#d9d6e6', main: '#8d88a6', dark: '#46405e' },
    };
    LLFX.TILE_COLORS = ['#06c98f', '#ff4d6d', '#3a86ff', '#ffaa00'];
    LLFX.CONFETTI = ['#ff4d6d', '#ffd23f', '#3a86ff', '#06d6a0', '#a64dff', '#ff8c1a', '#ffffff'];

    // ---------- shared <defs> ----------
    LLFX.ensureDefs = function ensureDefs() {
        if (document.getElementById('llfx-defs')) return;
        const R = 181.5; // max(rx, ry) * 1.1 for the 150 x 165 lantern
        const body = (key) => {
            const c = LLFX.LANTERN_COLORS[key];
            return `<radialGradient id="llg-${key}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${R}" fx="-22.5" fy="-41.25">
                <stop offset="0" stop-color="${c.light}"/><stop offset="0.5" stop-color="${c.main}"/><stop offset="1" stop-color="${c.dark}"/></radialGradient>`;
        };
        const svg = document.createElementNS(SVGNS, 'svg');
        svg.setAttribute('id', 'llfx-defs');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        svg.style.position = 'absolute';
        svg.innerHTML = `<defs>
            ${['safe', 'risk', 'mystery', 'grey'].map(body).join('')}
            <linearGradient id="llg-cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2c14e"/><stop offset="1" stop-color="#8a5a12"/></linearGradient>
            <linearGradient id="llg-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a3"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient>
            <radialGradient id="llg-skyglow"><stop offset="0" stop-color="#ffb347" stop-opacity="0.55"/><stop offset="0.4" stop-color="#ffb347" stop-opacity="0.22"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
            <clipPath id="llav-clip" clipPathUnits="userSpaceOnUse"><circle r="0.86"/></clipPath>
        </defs>`;
        document.body.appendChild(svg);
    };

    // ---------- avatars ----------
    const EYE = (x, y, r = 0.085) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#140f1f"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.35}" fill="#fff"/>`;
    const PAIR = (fn) => fn(-1) + fn(1);
    const BLK = '#1a141f';
    const FACES = {
        panda: () => PAIR((s) => `<circle cx="${s * 0.5}" cy="-0.45" r="0.22" fill="${BLK}"/>`)
            + '<circle cx="0" cy="0.12" r="0.66" fill="#fff"/><rect x="-0.66" y="-0.36" width="1.32" height="0.13" fill="#e63946"/>'
            + PAIR((s) => `<ellipse cx="${s * 0.25}" cy="0.1" rx="0.14" ry="0.19" transform="rotate(${s * 28.6} ${s * 0.25} 0.1)" fill="${BLK}"/><circle cx="${s * 0.25}" cy="0.08" r="0.06" fill="#fff"/>`)
            + `<ellipse cx="0" cy="0.33" rx="0.11" ry="0.075" fill="${BLK}"/>`,
        turtle: () => '<circle cx="0" cy="0.15" r="0.68" fill="#6fcf4f"/>'
            + '<circle cx="-0.35" cy="-0.25" r="0.1" fill="#3f9e3a"/><circle cx="0.38" cy="-0.2" r="0.08" fill="#3f9e3a"/><circle cx="0.05" cy="-0.4" r="0.07" fill="#3f9e3a"/>'
            + PAIR((s) => `<circle cx="${s * 0.24}" cy="0.05" r="0.15" fill="#fff"/>${EYE(s * 0.22, 0.07, 0.08)}`)
            + '<path d="M 0.176 0.316 A 0.18 0.18 0 0 1 -0.176 0.316" fill="none" stroke="#245e22" stroke-width="0.06" stroke-linecap="round"/>',
        fox: () => PAIR((s) => `<path d="M ${s * 0.2} -0.3 L ${s * 0.62} -0.78 L ${s * 0.68} -0.1 Z" fill="#ff7a1a"/><path d="M ${s * 0.3} -0.3 L ${s * 0.58} -0.62 L ${s * 0.6} -0.2 Z" fill="#5a2d1a"/>`)
            + '<circle cx="0" cy="0.12" r="0.64" fill="#ff8a2a"/>'
            + PAIR((s) => `<ellipse cx="${s * 0.24}" cy="0.42" rx="0.34" ry="0.26" fill="#fff"/>${EYE(s * 0.24, 0.02)}`)
            + `<circle cx="0" cy="0.3" r="0.085" fill="${BLK}"/>`,
        penguin: () => '<circle cx="0" cy="0.15" r="0.7" fill="#1d2b5a"/>'
            + PAIR((s) => `<circle cx="${s * 0.22}" cy="0.25" r="0.36" fill="#fff"/>`)
            + PAIR((s) => EYE(s * 0.22, 0.1))
            + '<path d="M -0.14 0.3 L 0.14 0.3 L 0 0.48 Z" fill="#ff9f1c"/>',
        bunny: () => PAIR((s) => `<g transform="translate(${s * 0.26} -0.6) rotate(${s * 8.6})"><ellipse rx="0.17" ry="0.45" fill="#fff"/><ellipse rx="0.09" ry="0.34" fill="#ff9ecb"/></g>`)
            + '<circle cx="0" cy="0.2" r="0.62" fill="#fff"/>'
            + PAIR((s) => `${EYE(s * 0.22, 0.12)}<circle cx="${s * 0.36}" cy="0.34" r="0.09" fill="#ffb3d1"/>`)
            + '<ellipse cx="0" cy="0.32" rx="0.08" ry="0.06" fill="#ff6fa8"/>',
        tiger: () => PAIR((s) => `<circle cx="${s * 0.5}" cy="-0.48" r="0.2" fill="#ff9f1c"/><circle cx="${s * 0.5}" cy="-0.48" r="0.1" fill="#ffd9a0"/>`)
            + '<circle cx="0" cy="0.12" r="0.66" fill="#ff9f1c"/>'
            + '<path d="M -0.08 -0.52 L 0 -0.3 L 0.08 -0.52 Z M -0.3 -0.45 L -0.2 -0.3 L -0.36 -0.32 Z M 0.3 -0.45 L 0.2 -0.3 L 0.36 -0.32 Z" fill="#3b2412"/>'
            + PAIR((s) => `<path d="M ${s * 0.66} 0.0 L ${s * 0.42} 0.06 L ${s * 0.64} 0.16 Z" fill="#3b2412"/><ellipse cx="${s * 0.17}" cy="0.4" rx="0.22" ry="0.17" fill="#fff"/>${EYE(s * 0.24, 0.02)}`)
            + '<path d="M -0.09 0.25 L 0.09 0.25 L 0 0.35 Z" fill="#e2557a"/>',
        frog: () => PAIR((s) => `<circle cx="${s * 0.32}" cy="-0.3" r="0.25" fill="#4ade80"/><circle cx="${s * 0.32}" cy="-0.3" r="0.15" fill="#fff"/>${EYE(s * 0.32, -0.28, 0.085)}`)
            + '<ellipse cx="0" cy="0.24" rx="0.74" ry="0.55" fill="#4ade80"/>'
            + '<path d="M -0.3 0.3 Q 0 0.52 0.3 0.3" fill="none" stroke="#166534" stroke-width="0.06" stroke-linecap="round"/>'
            + PAIR((s) => `<circle cx="${s * 0.46}" cy="0.32" r="0.09" fill="#ff9ecb" opacity="0.8"/>`),
        owl: () => PAIR((s) => `<path d="M ${s * 0.28} -0.4 L ${s * 0.55} -0.78 L ${s * 0.62} -0.3 Z" fill="#8a5a1c"/>`)
            + '<circle cx="0" cy="0.15" r="0.68" fill="#a8742e"/><ellipse cx="0" cy="0.58" rx="0.42" ry="0.32" fill="#f1d39b"/>'
            + PAIR((s) => `<circle cx="${s * 0.27}" cy="0.02" r="0.25" fill="#fff"/>${EYE(s * 0.27, 0.04, 0.12)}`)
            + '<path d="M -0.09 0.22 L 0.09 0.22 L 0 0.38 Z" fill="#f59e0b"/>',
        koala: () => PAIR((s) => `<circle cx="${s * 0.55}" cy="-0.32" r="0.3" fill="#94a3b8"/><circle cx="${s * 0.55}" cy="-0.32" r="0.17" fill="#f1d5e0"/>`)
            + '<circle cx="0" cy="0.15" r="0.62" fill="#a8b3c4"/>'
            + PAIR((s) => EYE(s * 0.26, 0.02))
            + '<ellipse cx="0" cy="0.25" rx="0.16" ry="0.22" fill="#1f2937"/>',
        lion: () => '<circle cx="0" cy="0.1" r="0.84" fill="#d97706"/>'
            + PAIR((s) => `<circle cx="${s * 0.38}" cy="-0.34" r="0.15" fill="#fbbf24"/>`)
            + '<circle cx="0" cy="0.16" r="0.56" fill="#fbbf24"/>'
            + PAIR((s) => `<ellipse cx="${s * 0.14}" cy="0.4" rx="0.18" ry="0.14" fill="#fff3d6"/>${EYE(s * 0.22, 0.06)}`)
            + `<path d="M -0.09 0.27 L 0.09 0.27 L 0 0.36 Z" fill="${BLK}"/>`,
        monkey: () => PAIR((s) => `<circle cx="${s * 0.62}" cy="0.08" r="0.2" fill="#8b5a2b"/><circle cx="${s * 0.62}" cy="0.08" r="0.1" fill="#f5c99a"/>`)
            + '<circle cx="0" cy="0.12" r="0.6" fill="#8b5a2b"/>'
            + PAIR((s) => `<circle cx="${s * 0.18}" cy="0.0" r="0.25" fill="#f5c99a"/>`)
            + '<ellipse cx="0" cy="0.33" rx="0.38" ry="0.26" fill="#f5c99a"/>'
            + PAIR((s) => `${EYE(s * 0.18, 0.02)}<circle cx="${s * 0.06}" cy="0.3" r="0.03" fill="#5a3415"/>`)
            + '<path d="M -0.14 0.42 Q 0 0.5 0.14 0.42" fill="none" stroke="#5a3415" stroke-width="0.045" stroke-linecap="round"/>',
        unicorn: () => '<path d="M -0.1 -0.42 L 0 -0.98 L 0.1 -0.42 Z" fill="#fbbf24"/>'
            + '<path d="M -0.62 -0.1 Q -0.7 -0.6 -0.2 -0.55 Q -0.45 -0.2 -0.62 -0.1 Z" fill="#c084fc"/>'
            + '<circle cx="0" cy="0.18" r="0.6" fill="#fff"/>'
            + '<path d="M -0.5 -0.15 Q -0.3 -0.6 0.15 -0.48 Q -0.2 -0.3 -0.5 -0.15 Z" fill="#f472b6"/>'
            + PAIR((s) => `${EYE(s * 0.22, 0.12)}<circle cx="${s * 0.36}" cy="0.34" r="0.09" fill="#ffb3d1"/>`)
            + PAIR((s) => `<circle cx="${s * 0.08}" cy="0.38" r="0.03" fill="#e879a6"/>`),
        bear: () => PAIR((s) => `<circle cx="${s * 0.5}" cy="-0.45" r="0.22" fill="#a0522d"/><circle cx="${s * 0.5}" cy="-0.45" r="0.11" fill="#e7b98f"/>`)
            + '<circle cx="0" cy="0.12" r="0.64" fill="#a0522d"/><ellipse cx="0" cy="0.36" rx="0.28" ry="0.2" fill="#e7b98f"/>'
            + PAIR((s) => EYE(s * 0.24, 0.04))
            + `<ellipse cx="0" cy="0.29" rx="0.1" ry="0.07" fill="${BLK}"/>`,
        chick: () => '<path d="M -0.05 -0.5 Q 0 -0.75 0.08 -0.5 Q 0.18 -0.7 0.15 -0.45 Z" fill="#facc15"/>'
            + '<circle cx="0" cy="0.18" r="0.64" fill="#fde047"/>'
            + PAIR((s) => `${EYE(s * 0.24, 0.08)}<circle cx="${s * 0.4}" cy="0.32" r="0.09" fill="#fdba74"/>`)
            + '<path d="M -0.12 0.26 L 0 0.18 L 0.12 0.26 L 0 0.36 Z" fill="#f97316"/>',
    };
    const AVATAR_INFO = {
        '🐼': { kind: 'panda', ring: '#3fbf4a', bg: '#bfeaf5' },
        '🐢': { kind: 'turtle', ring: '#2e9e44', bg: '#d9f7c4' },
        '🦊': { kind: 'fox', ring: '#ff7a1a', bg: '#ffe2b8' },
        '🐧': { kind: 'penguin', ring: '#2f6bff', bg: '#cfe0ff' },
        '🐰': { kind: 'bunny', ring: '#a64dff', bg: '#f7d6ff' },
        '🐯': { kind: 'tiger', ring: '#f59e0b', bg: '#fff1c9' },
        '🐸': { kind: 'frog', ring: '#16a34a', bg: '#dcfce7' },
        '🦉': { kind: 'owl', ring: '#b45309', bg: '#fde7c8' },
        '🐨': { kind: 'koala', ring: '#64748b', bg: '#e2e8f0' },
        '🦁': { kind: 'lion', ring: '#ea580c', bg: '#ffedd5' },
        '🐵': { kind: 'monkey', ring: '#a16207', bg: '#fef3c7' },
        '🦄': { kind: 'unicorn', ring: '#ec4899', bg: '#fce7f3' },
        '🐻': { kind: 'bear', ring: '#92400e', bg: '#fde2c4' },
        '🐤': { kind: 'chick', ring: '#eab308', bg: '#fef9c3' },
    };
    LLFX.avatarInfo = (emoji) => AVATAR_INFO[emoji] || { kind: null, ring: '#7b3fe4', bg: '#ede4ff' };
    /** Score colour = avatar ring darkened 15% (as in the concept leaderboard). */
    LLFX.avatarScoreColor = (emoji) => mix(LLFX.avatarInfo(emoji).ring, '#000000', 0.15);
    LLFX.avatarSvg = function avatarSvg(emoji) {
        const info = LLFX.avatarInfo(emoji);
        const face = info.kind && FACES[info.kind]
            ? FACES[info.kind]()
            : `<text x="0" y="0.1" text-anchor="middle" dominant-baseline="middle" font-size="1.05">${escText(emoji || '🏮')}</text>`;
        return `<svg class="ll-av-svg" viewBox="-1.16 -1.16 2.32 2.32" aria-hidden="true">
            <circle cx="0" cy="0.08" r="1.06" fill="rgba(0,0,0,0.3)"/>
            <circle r="1.06" fill="${info.ring}"/><circle r="0.95" fill="#fff"/>
            <circle r="0.86" fill="${info.bg}"/>
            <g clip-path="url(#llav-clip)">${face}</g>
        </svg>`;
    };
    /** Avatar bubble element HTML. size in px (diameter). */
    LLFX.avatarHtml = function avatarHtml(emoji, { size = null, cls = '', title = '' } = {}) {
        // Without an explicit size the stylesheet decides (--av on the context), defaulting to 88px.
        const style = size ? ` style="--av:${size}px"` : '';
        return `<span class="ll-av ${cls}"${style}${title ? ` title="${escText(title)}"` : ''}>${LLFX.avatarSvg(emoji)}</span>`;
    };

    // ---------- lanterns ----------
    const LRX = 150;
    const LRY = 165;
    LLFX.LANTERN_LABELS = {
        safe: ['SAFE', '+100'],
        risk: ['x2', 'or 0'],
        mystery: ['?'],
        allin: ['x2', 'or 0'],
    };
    /**
     * Big paper lantern as SVG. Coordinates match the concept renderer (rx 150, ry 165).
     * The viewBox origin is the lantern centre.
     */
    LLFX.lanternSvg = function lanternSvg(kind, { label = null, size = 78, bigSize = 150 } = {}) {
        const colorKey = kind === 'allin' ? 'risk' : kind;
        const c = LLFX.LANTERN_COLORS[colorKey] || LLFX.LANTERN_COLORS.grey;
        const lines = label || LLFX.LANTERN_LABELS[kind] || [];
        const tasselCol = mix(c.main, c.dark, 0.3);
        let tassels = '';
        for (let i = 0; i < 9; i++) {
            const x = -LRX * 0.28 + (LRX * 0.56 * i) / 8;
            tassels += `<path d="M ${x.toFixed(1)} ${LRY * 0.95} C ${x.toFixed(1)} ${LRY * 1.2}, ${x.toFixed(1)} ${LRY * 1.35}, ${x.toFixed(1)} ${LRY * 1.55}"/>`;
        }
        const ribs = [0.33, 0.66].map((k) => `<ellipse rx="${LRX * k}" ry="${LRY}"/>`).join('');
        const fs = lines.length === 1 && lines[0].length <= 2 ? bigSize : size;
        const outline = mix(c.dark, '#000000', 0.2);
        const text = lines.map((s, i) => {
            const y = (i - (lines.length - 1) / 2) * fs * 1.05;
            return `<text class="ll-lantern-shadow" y="${(y + 5).toFixed(1)}" font-size="${fs}" stroke-width="14">${escText(s)}</text>`
                + `<text class="ll-lantern-label" y="${y.toFixed(1)}" font-size="${fs}" stroke="${outline}" stroke-width="14">${escText(s)}</text>`;
        }).join('');
        return `<svg class="ll-lantern-svg" viewBox="-190 -200 380 470" aria-hidden="true">
            <g class="ll-tassel" stroke="${tasselCol}" stroke-width="6" stroke-linecap="round" fill="none">${tassels}</g>
            <ellipse rx="${LRX}" ry="${LRY}" fill="url(#llg-${colorKey})"/>
            <g fill="none" stroke="${c.dark}" stroke-opacity="0.35" stroke-width="4">${ribs}<path d="M0 -${LRY} L0 ${LRY}" stroke-opacity="0.85"/></g>
            <ellipse cx="${-LRX * 0.42}" cy="${-LRY * 0.38}" rx="${LRX * 0.16}" ry="${LRY * 0.3}" transform="rotate(-22.9 ${-LRX * 0.42} ${-LRY * 0.38})" fill="#fff" fill-opacity="0.22"/>
            <ellipse class="ll-flash" rx="${LRX}" ry="${LRY}" fill="#fff"/>
            <rect x="${-LRX * 0.42}" y="${-LRY - LRY * 0.07}" width="${LRX * 0.84}" height="${LRY * 0.16}" rx="10" fill="url(#llg-cap)"/>
            <rect x="${-LRX * 0.42}" y="${LRY - LRY * 0.09}" width="${LRX * 0.84}" height="${LRY * 0.16}" rx="10" fill="url(#llg-cap)"/>
            <g class="ll-lantern-text">${text}</g>
        </svg>`;
    };
    /** Lantern + glow + string in one rig. */
    LLFX.lanternRigHtml = function lanternRigHtml(kind, opts = {}) {
        const colorKey = kind === 'allin' ? 'risk' : kind;
        const c = LLFX.LANTERN_COLORS[colorKey] || LLFX.LANTERN_COLORS.grey;
        return `<div class="ll-rig ll-rig--${kind}" data-kind="${kind}" style="--glow:${rgba(c.main, 0.5)};--glow-mid:${rgba(c.main, 0.22)};--glow2:${rgba(c.main, 0)}">
            <div class="ll-rig-swing">
                <div class="ll-rig-string"></div>
                <div class="ll-rig-glow"></div>
                <div class="ll-rig-body">${LLFX.lanternSvg(kind, opts)}</div>
            </div>
        </div>`;
    };

    // ---------- coin ----------
    LLFX.coinHtml = function coinHtml() {
        return `<div class="ll-coin"><div class="ll-coin-spin">
            <div class="ll-coin-face ll-coin-front"><span>x2</span></div>
            <div class="ll-coin-face ll-coin-back"><span>0</span></div>
        </div></div>`;
    };

    // ---------- outlined festival text ----------
    /** Letters that drop in one by one (title style). */
    LLFX.lettersHtml = function lettersHtml(text, { cls = '', stagger = 0.06, delay = 0 } = {}) {
        let i = 0;
        return `<span class="ll-letters ${cls}">${[...String(text)].map((ch) => {
            if (ch === ' ') return '<span class="ll-letter-space"> </span>';
            const d = (delay + stagger * i++).toFixed(3);
            return `<span class="ll-letter" data-ch="${escText(ch)}" style="animation-delay:${d}s">${escText(ch)}</span>`;
        }).join('')}</span>`;
    };
    /** Whole-word outlined text (one layer stroke + one gradient fill). */
    LLFX.popTextHtml = function popTextHtml(text, cls = '') {
        return `<span class="ll-pop ${cls}" data-text="${escText(text)}">${escText(text)}</span>`;
    };

    // ---------- backdrop ----------
    function roofs(ctx, W, H, y0, col, winCol, seed, scale) {
        const r = seeded(seed);
        let x = -60;
        while (x < W + 60) {
            const w = (160 + r() * 140) * scale;
            const hgt = (80 + r() * 120) * scale;
            const top = y0 - hgt;
            ctx.fillStyle = col;
            ctx.fillRect(x + w * 0.1, top, w * 0.8, H - top);
            ctx.beginPath();
            ctx.moveTo(x - w * 0.05, top + 6);
            ctx.bezierCurveTo(x + w * 0.2, top - 4, x + w * 0.35, top - 40 * scale, x + w * 0.5, top - 52 * scale);
            ctx.bezierCurveTo(x + w * 0.65, top - 40 * scale, x + w * 0.8, top - 4, x + w * 1.05, top + 6);
            ctx.closePath();
            ctx.fill();
            for (let wy = top + 30 * scale; wy < H; wy += 46 * scale) {
                for (let wx = x + w * 0.2; wx < x + w * 0.8 - 20 * scale; wx += 42 * scale) {
                    if (r() < 0.55) {
                        ctx.fillStyle = rgba(winCol, 0.5 + r() * 0.5);
                        ctx.fillRect(wx, wy, 20 * scale, 26 * scale);
                    }
                }
            }
            x += w * (0.85 + r() * 0.2);
        }
    }
    function paintPlate(canvas, W, H, unit) {
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        const r = seeded(3);
        const g = ctx.createLinearGradient(0, 0, 0, H);
        [[0, '#100834'], [0.42, '#2b136b'], [0.7, '#56207e'], [0.82, '#8a3482'], [1, '#3a1450']].forEach(([o, c]) => g.addColorStop(o, c));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        const stars = Math.round(220 * (W * H) / (1920 * 1080));
        for (let i = 0; i < stars; i++) {
            const x = r() * W;
            const y = r() * H * 0.6;
            const rad = (0.8 + r() * 1.8) * Math.max(0.7, unit);
            ctx.beginPath();
            ctx.arc(x, y, rad, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,242,${(0.25 + r() * 0.65).toFixed(2)})`;
            ctx.fill();
        }
        const bokeh = ['#ffb347', '#ff7ab6', '#ffd56b', '#c58bff', '#ff8f4d'];
        const nb = Math.round(70 * Math.max(0.5, W / 1920));
        for (let i = 0; i < nb; i++) {
            const x = r() * W;
            const y = H * (0.35 + r() * 0.58);
            const rad = (12 + r() * 34) * unit + 7 * unit;
            const a = 0.25 + r() * 0.35;
            const col = bokeh[i % 5];
            const rg = ctx.createRadialGradient(x, y, 0, x, y, rad);
            rg.addColorStop(0, rgba(col, a));
            rg.addColorStop(0.62, rgba(col, a * 0.85));
            rg.addColorStop(1, rgba(col, 0));
            ctx.fillStyle = rg;
            ctx.beginPath();
            ctx.arc(x, y, rad, 0, Math.PI * 2);
            ctx.fill();
        }
        roofs(ctx, W, H, H * (900 / 1080), '#3b1659', '#ffb05c', 5, 0.8 * unit);
        roofs(ctx, W, H, H * (1000 / 1080), '#1c0a30', '#ffc46b', 9, 1.1 * unit);
        const haze = ctx.createLinearGradient(0, H * 0.65, 0, H);
        haze.addColorStop(0, 'rgba(21,7,24,0)');
        haze.addColorStop(1, 'rgba(21,7,24,1)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = haze;
        ctx.fillRect(0, H * 0.65, W, H * 0.35);
        ctx.globalCompositeOperation = 'source-over';
    }
    function stringLightsSvg(W, H, strands) {
        const cols = ['#ff5c8a', '#ffd23f', '#5cf0ff', '#9dff5c', '#c58bff'];
        let wires = '';
        let bulbs = '';
        strands.forEach(([x0, y0, x1, y1, sag, off], si) => {
            const pts = [];
            for (let i = 0; i <= 40; i++) {
                const u = i / 40;
                pts.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + sag * 4 * u * (1 - u)]);
            }
            wires += `<polyline points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}"/>`;
            for (let i = 2; i < 40; i += 2) {
                const [x, y] = pts[i];
                const col = cols[(i / 2 + off) % 5];
                const d = (-((i * 1.3 + off + si) % 4) * 0.4).toFixed(2);
                bulbs += `<circle class="ll-bulb-glow" cx="${x.toFixed(1)}" cy="${(y + 10).toFixed(1)}" r="26" fill="url(#llg-bulb-${(i / 2 + off) % 5})" style="animation-delay:${d}s"/>`
                    + `<circle cx="${x.toFixed(1)}" cy="${(y + 10).toFixed(1)}" r="7" fill="${mix(col, '#ffffff', 0.3)}"/>`;
            }
        });
        const defs = cols.map((c, i) => `<radialGradient id="llg-bulb-${i}"><stop offset="0" stop-color="${c}" stop-opacity="0.55"/><stop offset="0.4" stop-color="${c}" stop-opacity="0.25"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join('');
        return `<svg class="ll-lights" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
            <defs>${defs}</defs>
            <g fill="none" stroke="rgba(26,13,51,0.8)" stroke-width="3">${wires}</g>${bulbs}</svg>`;
    }
    function skyLanternsHtml(count, seed) {
        const r = seeded(seed);
        let html = '';
        for (let i = 0; i < count; i++) {
            const x = (r() * 100).toFixed(1);
            const s = (0.5 + r() * 0.8).toFixed(2);
            const dur = (1300 / (18 + r() * 22)).toFixed(1);
            const delay = (-r() * Number(dur)).toFixed(1);
            const sway = (3 + r() * 3).toFixed(1);
            html += `<span class="ll-sky-lantern" style="left:${x}%;--s:${s};animation-duration:${dur}s;animation-delay:${delay}s">
                <span class="ll-sky-sway" style="animation-duration:${sway}s;animation-delay:${(-r() * 4).toFixed(1)}s">
                    <svg viewBox="-60 -60 120 120"><circle r="60" fill="url(#llg-skyglow)"/><path d="M -14 -20 L 14 -20 L 18 18 C 10 24 -10 24 -18 18 Z" fill="url(#llg-sky)"/></svg>
                </span></span>`;
        }
        return html;
    }
    function twinkleStarsSvg(W, H, n, seed) {
        const r = seeded(seed);
        let out = '';
        for (let i = 0; i < n; i++) {
            const x = r() * W;
            const y = r() * H * 0.55;
            const rad = 1.4 + r() * 1.8;
            out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad.toFixed(1)}" style="animation-delay:${(-r() * 3).toFixed(2)}s;animation-duration:${(2 + r() * 2.5).toFixed(2)}s"/>`;
        }
        return `<svg class="ll-twinkle" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="#fffbe8">${out}</g></svg>`;
    }
    /**
     * Mount the festival backdrop into `el` (full-bleed). portrait=true for phones.
     * Static parts are painted once to a canvas; only small layers animate.
     */
    LLFX.mountBackdrop = function mountBackdrop(el, { portrait = false } = {}) {
        if (!el || el.dataset.llMounted === (portrait ? 'p' : 'l')) return;
        LLFX.ensureDefs();
        el.dataset.llMounted = portrait ? 'p' : 'l';
        el.classList.add('ll-backdrop');
        const W = portrait ? 780 : 1920;
        const H = portrait ? 1688 : 1080;
        const unit = portrait ? 0.72 : 1;
        el.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.className = 'll-plate';
        paintPlate(canvas, W, H, unit);
        el.appendChild(canvas);
        el.insertAdjacentHTML('beforeend', twinkleStarsSvg(W, H, portrait ? 26 : 44, 7));
        el.insertAdjacentHTML('beforeend', `<div class="ll-sky-lanterns">${skyLanternsHtml(portrait ? 8 : 16, 21)}</div>`);
        const strands = portrait
            ? [[-30, 26, 810, 18, 120, 0], [-30, 210, 810, 230, 70, 3]]
            : [[-40, 30, 1000, 20, 110, 0], [940, 10, 1960, 40, 100, 3]];
        el.insertAdjacentHTML('beforeend', stringLightsSvg(W, H, strands));
    };

    // ---------- motion helpers ----------
    /** Count a number up/down inside el, formatted en-US. */
    LLFX.countUp = function countUp(el, from, to, ms = 700, { suffix = '', prefix = '' } = {}) {
        if (!el) return;
        const fmt = (v) => `${prefix}${Math.max(0, Math.round(v)).toLocaleString('en-US')}${suffix}`;
        if (el._llCount) cancelAnimationFrame(el._llCount);
        if (LLFX.reduced() || from === to || ms <= 0) {
            el.textContent = fmt(to);
            return;
        }
        const start = performance.now();
        const step = (now) => {
            const u = Math.min(1, (now - start) / ms);
            el.textContent = fmt(from + (to - from) * easeIO(u));
            if (u < 1) el._llCount = requestAnimationFrame(step);
            else el._llCount = null;
        };
        el._llCount = requestAnimationFrame(step);
    };
    /** Move an absolutely positioned element along an arc (left/top in px of its container). */
    LLFX.flyArc = function flyArc(el, from, to, { height = 230, duration = 600, delay = 0 } = {}) {
        if (!el) return null;
        el.style.left = `${to.x}px`;
        el.style.top = `${to.y}px`;
        if (LLFX.reduced() || !el.animate) return null;
        const frames = [];
        for (let i = 0; i <= 12; i++) {
            const u = i / 12;
            const e = easeIO(u);
            const x = from.x + (to.x - from.x) * e - to.x;
            const y = from.y + (to.y - from.y) * e - Math.sin(u * Math.PI) * height - to.y;
            frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`, offset: u });
        }
        return el.animate(frames, { duration, delay, easing: 'linear', fill: 'backwards' });
    };
    /** 4-point star burst (concept sparkle_burst). */
    LLFX.sparkles = function sparkles(layer, x, y, { color = '#ffe066', n = 14, r0 = 40, r1 = 220, size = 16, dur = 700, ring = true, seed = 1 } = {}) {
        if (!layer || LLFX.reduced()) return;
        const r = seeded(seed + Math.round(x + y));
        const wrap = document.createElement('div');
        wrap.className = 'll-sparkles';
        wrap.style.left = `${x}px`;
        wrap.style.top = `${y}px`;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.4;
            const rr = r1 * (0.7 + r() * 0.4);
            const s = size * (0.6 + r() * 0.6);
            const star = document.createElement('span');
            star.className = 'll-spark';
            star.style.cssText = `width:${s * 2}px;height:${s * 2}px;margin:${-s}px 0 0 ${-s}px;background:${color}`;
            wrap.appendChild(star);
            star.animate([
                { transform: `translate(${Math.cos(a) * r0}px, ${Math.sin(a) * r0}px) rotate(0deg) scale(1)`, opacity: 1 },
                { transform: `translate(${Math.cos(a) * rr}px, ${Math.sin(a) * rr}px) rotate(170deg) scale(0)`, opacity: 0.4 },
            ], { duration: dur, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
        }
        if (ring) {
            const ringEl = document.createElement('span');
            ringEl.className = 'll-spark-ring';
            ringEl.style.borderColor = color;
            wrap.appendChild(ringEl);
            ringEl.animate([
                { width: `${r0 * 2}px`, height: `${r0 * 2}px`, margin: `${-r0}px 0 0 ${-r0}px`, opacity: 0.5, borderWidth: '7px' },
                { width: `${r1 * 2.2}px`, height: `${r1 * 2.2}px`, margin: `${-r1 * 1.1}px 0 0 ${-r1 * 1.1}px`, opacity: 0, borderWidth: '1px' },
            ], { duration: dur, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
        }
        layer.appendChild(wrap);
        setTimeout(() => wrap.remove(), dur + 80);
    };
    /** Grey sad puff (bust). */
    LLFX.puff = function puff(layer, x, y, { scale = 1 } = {}) {
        if (!layer || LLFX.reduced()) return;
        const wrap = document.createElement('div');
        wrap.className = 'll-sparkles';
        wrap.style.left = `${x}px`;
        wrap.style.top = `${y}px`;
        const r = seeded(9);
        for (let k = 0; k < 9; k++) {
            const ang = (k / 9) * Math.PI * 2 + (r() - 0.5) * 0.6;
            const b = document.createElement('span');
            b.className = 'll-puff';
            wrap.appendChild(b);
            const R = 110 * scale;
            b.animate([
                { transform: `translate(${Math.cos(ang) * 40 * scale}px, ${Math.sin(ang) * 28 * scale}px) scale(${0.45 * scale})`, opacity: 0.8 },
                { transform: `translate(${Math.cos(ang) * (40 + R) * scale}px, ${Math.sin(ang) * (40 + R) * 0.7 * scale - 30 * scale}px) scale(${1.1 * scale})`, opacity: 0 },
            ], { duration: 1050, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
        }
        layer.appendChild(wrap);
        setTimeout(() => wrap.remove(), 1150);
    };

    /**
     * Confetti on a canvas (burst from a point and/or rain from the top).
     * Stops itself; returns a cancel function.
     */
    LLFX.confetti = function confetti(canvas, { burst = null, rain = true, duration = 3800, count = 160, width = null, height = null } = {}) {
        if (!canvas || LLFX.reduced()) return () => {};
        const W = width || canvas.width;
        const H = height || canvas.height;
        const ctx = canvas.getContext('2d');
        const r = Math.random;
        const P = [];
        if (burst) {
            for (let i = 0; i < count; i++) {
                const a = -Math.PI * (0.05 + r() * 0.9);
                const sp = 500 + r() * 900;
                P.push({ b: true, x: burst.x, y: burst.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: r() * 6.28, vr: (r() - 0.5) * 20, w: 14 + r() * 12, h: 8 + r() * 6, c: LLFX.CONFETTI[i % 7], ph: r() * 6.28, d: r() * 0.08 });
            }
        }
        if (rain) {
            for (let i = 0; i < Math.round(count * 1.2); i++) {
                P.push({ b: false, x: -50 + r() * (W + 100), y: -500 + r() * 480, vx: (r() - 0.5) * 160, vy: 150 + r() * 270, rot: r() * 6.28, vr: (r() - 0.5) * 16, w: 14 + r() * 12, h: 8 + r() * 6, c: LLFX.CONFETTI[i % 7], ph: r() * 6.28, d: r() * 0.25 });
            }
        }
        let raf = 0;
        const t0 = performance.now();
        const frame = (now) => {
            const dt = (now - t0) / 1000;
            ctx.clearRect(0, 0, W, H);
            const fade = Math.min(1, Math.max(0, (duration / 1000 - dt) / 0.6));
            for (const p of P) {
                const t = dt - p.d;
                if (t < 0) continue;
                let x;
                let y;
                if (p.b) {
                    const k = 1.6;
                    x = p.x + (p.vx * (1 - Math.exp(-k * t))) / k + Math.sin(t * 3 + p.ph) * 20;
                    y = p.y + (p.vy * (1 - Math.exp(-k * t))) / k + 0.5 * 600 * t * t * 0.55;
                } else {
                    x = p.x + p.vx * t + Math.sin(t * 2.5 + p.ph) * 40;
                    y = p.y + p.vy * t;
                }
                if (y > H + 40 || x < -60 || x > W + 60) continue;
                ctx.save();
                ctx.globalAlpha = fade;
                ctx.translate(x, y);
                ctx.rotate(p.rot + p.vr * t);
                ctx.scale(1, Math.abs(Math.cos(t * 6 + p.ph)) * 0.9 + 0.1);
                ctx.fillStyle = p.c;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            }
            if (dt * 1000 < duration) raf = requestAnimationFrame(frame);
            else ctx.clearRect(0, 0, W, H);
        };
        raf = requestAnimationFrame(frame);
        return () => {
            cancelAnimationFrame(raf);
            ctx.clearRect(0, 0, W, H);
        };
    };

    LLFX.rgba = rgba;
    LLFX.escText = escText;
    window.LLFX = LLFX;
}());
