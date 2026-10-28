/**
 * The Bridge (internal id `tide-bridge`) — "Storybook Dusk" artwork (plain SVG strings, no libraries).
 * Pure presentation: six themed chasm scenes (one per round) + the sunny-beach "Mid-Bridge Obstacle" scene.
 *
 *   R1 footbridge  wooden footbridge over calm shallow dusk water
 *   R2 arch        cobblestone arch over a coastal inlet (golden hour, sailboats)
 *   R3 viaduct     high stone viaduct, deeper water, mist
 *   R4 rapids      raging rapids crossing: rope-and-plank bridge, whitecaps, rocks, fast waves
 *   R5 storm       iron cliff span in a dark stormy sky (rain + lightning flicker)
 *   R6 citadel     grand citadel bridge toward a glowing citadel (golden light)
 *
 * The bridge grows one segment per span; the number of segments is the round's span count (1..5).
 * The water surface rises with the ROUND tide ratio; at 1.0 it covers the deck ("the tide took the bridge").
 */
(function (global) {
    'use strict';

    const W = 1366;
    const H = 768;
    const X0 = 330;           // left end of the bridge deck
    const SPAN = 702;         // deck length (330 -> 1032)
    const BASE_DECK_Y = 342;  // the original art is drawn for this deck height; other themes shift the landscape
    const TIDE_MIN = 700;     // water surface y at the start of a round (near the bottom of the chasm)

    const rnd = (s) => {
        let a = (s * 2654435761) >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const f1 = (v) => Number(v).toFixed(1);
    const stops = (arr, offs) => arr.map((c, i) => `<stop offset="${offs ? offs[i] : (i / (arr.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('');

    /* ------------------------------------------------------------------------------ themes */
    const THEMES = {
        footbridge: {
            id: 'footbridge', style: 'plank', deckY: 392, h: 22, wave: [3, 112, 8], night: 0.1,
            sky: ['#2a2467', '#6a4399', '#d9638c', '#ff9f6e', '#ffd698'], sun: { x: 790, glow: '#ffe08a', core: '#fff2b8', ring: '#ffd36a', r: 58 },
            mtn: ['#8a4f94', '#6a3f86'], fjord: ['#ffd7a0', '#e48b86', '#6b4a8c', '#2b2457'], water: ['#3a8aa0', '#25607f', '#15294f'],
            cliffL: ['#6e3236', '#b9603e', '#e49456'], cliffLine: '#5a2630', grass: ['#b4c062', '#5d8a47'],
            unit: { fill: ['#e9b46a', '#b9783a'], stroke: '#6b3f18', tone: ['#f3c98a', '#e2a85c', '#f0bd78', '#d99a50'], line: '#7a4a20', hi: '#ffe7b8', rail: '#5a3a1e', rope: '#c9a05c' },
            pier: ['#8a5a30', '#b98550'], cloud: ['#ffb8b8', '#ffc6a8', '#ffd0b0', '#ffe0b8'],
        },
        arch: {
            id: 'arch', style: 'arch', deckY: 356, h: 84, wave: [4, 150, 10], night: 0,
            sky: ['#3b3a85', '#8a5aa8', '#f08a7a', '#ffb36b', '#ffe2a8'], sun: { x: 820, glow: '#ffe6a0', core: '#fff6c8', ring: '#ffc468', r: 62 },
            mtn: ['#9a5a8a', '#7a4a82'], fjord: ['#ffe0a8', '#f0a086', '#6f5a96', '#2b2d5e'], water: ['#3f9bb0', '#28708c', '#173660'],
            cliffL: ['#7a4a3a', '#c27a4a', '#f0b070'], cliffLine: '#5a3226', grass: ['#b8c870', '#648e48'],
            unit: { fill: ['#e4dccb', '#aaa190'], stroke: '#5e5648', tone: ['#efe7d6', '#d6cdb9', '#e6dcc6', '#c9bfa8'], line: '#6a604e', hi: '#fffaf0', rail: '#8a806c', rope: '#c9bfa8' },
            pier: ['#9c9482', '#cfc6b2'], cloud: ['#ffc0a8', '#ffcfa0', '#ffd8b0', '#ffe6bc'],
        },
        viaduct: {
            id: 'viaduct', style: 'viaduct', deckY: 360, h: 150, wave: [4, 170, 10], night: 0.25,
            sky: ['#161a4f', '#3a3f8c', '#7b5fb0', '#d38aa6', '#f5c0a0'], sun: { x: 760, glow: '#ffd9b0', core: '#fff0d8', ring: '#ffb98a', r: 50 },
            mtn: ['#4a4a8a', '#3a3a78'], fjord: ['#f2c0a0', '#a07aa8', '#4a4a86', '#1c2050'], water: ['#2a7490', '#17486a', '#0a1c3c'],
            cliffL: ['#3f3a5e', '#7a6f95', '#b3a6c4'], cliffLine: '#2c2848', grass: ['#7aa070', '#486c4c'],
            unit: { fill: ['#d3d0ea', '#8f8bb6'], stroke: '#3f3b66', tone: ['#e0def5', '#c2bfe0', '#d6d3ee', '#b4b0d8'], line: '#4f4b7a', hi: '#ffffff', rail: '#6d6a98', rope: '#b4b0d8' },
            pier: ['#8a86ae', '#bdb9dc'], cloud: ['#b8a0d8', '#c8a8d0', '#d8b0c8', '#e8c0c0'],
        },
        rapids: {
            id: 'rapids', style: 'rope', deckY: 366, h: 18, wave: [10, 70, 6], night: 0.1,
            sky: ['#243f50', '#476f7b', '#86aaa8', '#c0d4c4', '#e4eadb'], sun: { x: 800, glow: '#f4f0d0', core: '#fffbe8', ring: '#e8e6bc', r: 44 },
            mtn: ['#4f6f6a', '#3e5a58'], fjord: ['#c8dcc8', '#7fa6a0', '#3e6a70', '#1c3a4e'], water: ['#4fa0aa', '#2a6a82', '#12304c'],
            cliffL: ['#2f3f30', '#62784c', '#9db06b'], cliffLine: '#26362a', grass: ['#9cb860', '#4f7a3c'],
            unit: { fill: ['#b88a56', '#7a5230'], stroke: '#3e2812', tone: ['#c99a62', '#a87a46', '#bd8c54', '#946a3c'], line: '#4e341a', hi: '#e8c898', rail: '#4a3016', rope: '#d8c08a' },
            pier: ['#6a4a2a', '#9a7448'], cloud: ['#b8cccc', '#c8d8d0', '#d6e2d4', '#e4ece0'],
        },
        storm: {
            id: 'storm', style: 'iron', deckY: 356, h: 64, wave: [12, 90, 6], night: 0.5,
            sky: ['#0b0c20', '#1b1f42', '#363c64', '#55597f', '#74769a'], sun: null,
            mtn: ['#2a2c4c', '#1e2040'], fjord: ['#5a5c80', '#3a3c62', '#22264a', '#10132c'], water: ['#2c4c68', '#16304a', '#08122a'],
            cliffL: ['#16151f', '#38334a', '#575070'], cliffLine: '#0c0b14', grass: ['#3a5a46', '#223a2c'],
            unit: { fill: ['#6d7694', '#2f3553'], stroke: '#10142a', tone: ['#808aa8', '#6a7492', '#7a84a2', '#5c6684'], line: '#a4aed0', hi: '#c4cce8', rail: '#444c6e', rope: '#8c96b8' },
            pier: ['#2a3050', '#566088'], cloud: ['#2a2c4a', '#34385a', '#3e4268', '#4a4e74'],
        },
        citadel: {
            id: 'citadel', style: 'citadel', deckY: 356, h: 100, wave: [4, 140, 9], night: 0,
            sky: ['#3a2a6a', '#9a4a8a', '#ff8a5a', '#ffc04a', '#fff0a0'], sun: { x: 800, glow: '#fff0b0', core: '#fffbe0', ring: '#ffd84a', r: 70 },
            mtn: ['#a4558a', '#7a3f80'], fjord: ['#fff0b0', '#f6b070', '#9a5a90', '#2e2060'], water: ['#4ab0b0', '#2a7c94', '#163862'],
            cliffL: ['#6a3a4a', '#c0704a', '#f5b060'], cliffLine: '#5a2a30', grass: ['#cfd070', '#6c9448'],
            unit: { fill: ['#fff6d8', '#e8c46a'], stroke: '#8a6414', tone: ['#fffbe6', '#f6e2a0', '#fff0c0', '#eacd78'], line: '#a47a20', hi: '#ffffff', rail: '#c89a30', rope: '#f0d078' },
            pier: ['#d8c48c', '#f6ead0'], cloud: ['#ffc0a8', '#ffd0a0', '#ffe0a8', '#fff0c0'],
        },
    };
    const THEME_BY_ROUND = ['footbridge', 'arch', 'viaduct', 'rapids', 'storm', 'citadel'];
    const themeOf = (id) => THEMES[id] || THEMES[THEME_BY_ROUND[Math.max(0, Math.min(5, (Number(id) || 1) - 1))]] || THEMES.arch;

    /** water surface y for a 0..1 round-tide ratio: starts at the chasm bottom, at 1.0 it covers the deck */
    function tideY(ratio, themeId) {
        const t = themeOf(themeId);
        const top = t.deckY - 16;
        const p = Math.max(0, Math.min(1, Number(ratio) || 0));
        return TIDE_MIN - p * (TIDE_MIN - top);
    }

    function geom(n, themeId) {
        const t = themeOf(themeId);
        const count = Math.max(1, Math.round(Number(n) || 3));
        const w = SPAN / count;
        const arches = (t.style === 'arch' || t.style === 'citadel') ? Math.max(1, Math.round(w / 104)) : t.style === 'viaduct' ? Math.max(1, Math.round(w / 118)) : 0;
        const r = arches ? Math.min(t.style === 'viaduct' ? 44 : 30, (w / arches) * 0.36) : 0;
        return { n: count, w, r, arches, x0: X0, deckY: t.deckY, h: t.h, floor: 720, style: t.style, theme: t.id };
    }
    const unitX = (g, i) => g.x0 + i * g.w;

    function unitPath(g, i) {
        const x = unitX(g, i), y = g.deckY, w = g.w;
        if (!g.arches) return `M${f1(x)},${y} H${f1(x + w)} V${y + g.h} H${f1(x)} Z`;
        let d = `M${f1(x)},${y} H${f1(x + w)} V${y + g.h}`;
        for (let j = g.arches - 1; j >= 0; j--) {
            const cx = x + (j + 0.5) * w / g.arches;
            d += ` H${f1(cx + g.r)} A${f1(g.r)},${f1(g.r)} 0 0 0 ${f1(cx - g.r)},${y + g.h}`;
        }
        return `${d} H${f1(x)} Z`;
    }

    function wavePath(y, amp, wl, phase, x0, x1, yb, step = 8) {
        let d = `M${x0},${yb} L${x0},${(y + amp * Math.sin(phase)).toFixed(1)}`;
        for (let x = x0 + step; x <= x1 + step; x += step) d += ` L${x},${(y + amp * Math.sin(phase + (x - x0) / wl * Math.PI * 2)).toFixed(1)}`;
        return `${d} L${x1},${yb} Z`;
    }
    function waveLine(y, amp, wl, phase, x0, x1, step = 8) {
        let d = `M${x0},${(y + amp * Math.sin(phase)).toFixed(1)}`;
        for (let x = x0 + step; x <= x1 + step; x += step) d += ` L${x},${(y + amp * Math.sin(phase + (x - x0) / wl * Math.PI * 2)).toFixed(1)}`;
        return d;
    }

    function pine(x, y, s, dark) {
        const a = dark ? '#1c3a32' : '#2c5a48', b = dark ? '#122a24' : '#1f4637';
        return `<g transform="translate(${x},${y}) scale(${s})"><rect x="-3" y="-6" width="6" height="14" fill="#5a3a2a"/><path d="M0-62 L-18-30 H-8 L-24 0 H24 L8-30 H18Z" fill="${a}"/><path d="M0-62 L18-30 H8 L24 0 H6 Z" fill="${b}" opacity=".65"/></g>`;
    }
    function cloud(x, y, s, c, o) {
        return `<g transform="translate(${x},${y}) scale(${s})" fill="${c}" opacity="${o}"><ellipse cx="0" cy="0" rx="70" ry="16"/><ellipse cx="-26" cy="-12" rx="34" ry="16"/><ellipse cx="18" cy="-17" rx="40" ry="20"/></g>`;
    }

    /* ------------------------------------------------------------------------------ bridge segments */
    function lampMarkup(g, x, w, y, uid, red) {
        const lx = x + w * 0.84;
        return `<g><rect x="${f1(lx)}" y="${y - 44}" width="4" height="32" fill="#2e1c10"/><circle cx="${f1(lx + 2)}" cy="${y - 48}" r="14" fill="url(#${uid}${red ? 'lampR' : 'lamp'})"/><circle cx="${f1(lx + 2)}" cy="${y - 48}" r="5.5" fill="${red ? '#ff9a8a' : '#fff2b0'}"/></g>`;
    }

    function segmentBuilt(g, i, uid, withLamp) {
        const t = themeOf(g.theme);
        const u = t.unit;
        const x = unitX(g, i), y = g.deckY, w = g.w, cx = x + w / 2;
        const tone = u.tone[i % 4];
        const p = unitPath(g, i);
        const every = w >= 140 ? 1 : (w >= 60 ? 3 : 4);
        const hasLamp = withLamp && i % every === (every === 1 ? 0 : 1);
        const base = `<path d="${p}" fill="url(#${uid}unit)" stroke="${u.stroke}" stroke-width="2.4" stroke-linejoin="round"/><path d="${p}" fill="${tone}" opacity=".32"/>`;
        if (g.style === 'plank' || g.style === 'rope') {
            const rope = g.style === 'rope';
            const planks = Math.max(3, Math.round(w / 15));
            let lines = '';
            for (let k = 1; k < planks; k++) lines += `<path d="M${f1(x + k * w / planks)},${y} V${y + g.h}" stroke="${u.line}" stroke-width="1.6" opacity=".55"/>`;
            const post = (px, tall) => `<rect x="${f1(px - 3)}" y="${y - tall}" width="6" height="${tall}" rx="2" fill="${u.rail}"/>`;
            const sag = rope ? 16 : 7;
            const rail = `<path d="M${f1(x)},${y - 30} Q${f1(cx)},${y - 30 + sag} ${f1(x + w)},${y - 30}" fill="none" stroke="${u.rope}" stroke-width="${rope ? 3.4 : 2.6}" stroke-linecap="round"/><path d="M${f1(x)},${y - 14} Q${f1(cx)},${y - 14 + sag * 0.7} ${f1(x + w)},${y - 14}" fill="none" stroke="${u.rope}" stroke-width="2" opacity=".75"/>`;
            return `<g>${post(x + 3, 36)}${post(x + w - 3, 36)}${rail}${base}${lines}<path d="M${f1(x + 3)},${y + 4} H${f1(x + w - 3)}" stroke="${u.hi}" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>${hasLamp ? lampMarkup(g, x, w, y, uid, false) : ''}</g>`;
        }
        if (g.style === 'iron') {
            const bays = Math.max(2, Math.round(w / 50));
            const bw = w / bays;
            let truss = '';
            for (let k = 0; k < bays; k++) {
                const bx = x + k * bw;
                truss += `<path d="M${f1(bx)},${y + 9} L${f1(bx + bw)},${y + g.h - 9} M${f1(bx + bw)},${y + 9} L${f1(bx)},${y + g.h - 9}" stroke="${u.line}" stroke-width="3" opacity=".85"/><path d="M${f1(bx)},${y + 6} V${y + g.h - 6}" stroke="${u.line}" stroke-width="3.4"/>`;
            }
            let rivets = '';
            for (let k = 0; k <= Math.round(w / 18); k++) { const rx = x + 6 + k * (w - 12) / Math.max(1, Math.round(w / 18)); rivets += `<circle cx="${f1(rx)}" cy="${y + 5}" r="1.8" fill="${u.hi}" opacity=".8"/><circle cx="${f1(rx)}" cy="${y + g.h - 5}" r="1.8" fill="${u.hi}" opacity=".6"/>`; }
            return `<g><rect x="${f1(x)}" y="${y - 12}" width="${f1(w)}" height="10" rx="2" fill="${u.rail}" stroke="${u.stroke}" stroke-width="2"/>${base}${truss}${rivets}<path d="M${f1(x)},${y + 1} H${f1(x + w)}" stroke="${u.hi}" stroke-width="2.6" opacity=".7"/>${hasLamp ? lampMarkup(g, x, w, y, uid, true) : ''}</g>`;
        }
        // arch / viaduct / citadel (stone with arches)
        const arcsShade = g.arches ? Array.from({ length: g.arches }, (_, j) => {
            const acx = x + (j + 0.5) * w / g.arches;
            return `<path d="M${f1(acx - g.r + 3)},${y + g.h} A${f1(g.r - 3)},${f1(g.r - 3)} 0 0 1 ${f1(acx + g.r - 3)},${y + g.h}" fill="none" stroke="${u.line}" stroke-width="3" opacity=".25" transform="translate(0,-2)"/>`;
        }).join('') : '';
        let courses = `<path d="M${f1(x)},${y + 28} H${f1(x + w)}" stroke="${u.line}" stroke-width="1.6" opacity=".35"/>`;
        let extra = '';
        if (g.style === 'viaduct') {
            courses += `<path d="M${f1(x)},${y + 62} H${f1(x + w)} M${f1(x)},${y + 98} H${f1(x + w)}" stroke="${u.line}" stroke-width="1.6" opacity=".35"/>`;
            const wins = Math.max(2, Math.round(w / 34));
            for (let k = 0; k < wins; k++) { const wx = x + (k + 0.5) * w / wins; extra += `<path d="M${f1(wx - 6)},${y + 58} V${y + 40} A6,6 0 0 1 ${f1(wx + 6)},${y + 40} V${y + 58}Z" fill="${u.stroke}" opacity=".35"/>`; }
        } else {
            courses += `<path d="M${f1(cx)},${y + 2} V${y + 40}" stroke="${u.line}" stroke-width="1.6" opacity=".35"/>`;
        }
        let crest = '';
        if (g.style === 'citadel') {
            const m = Math.max(3, Math.round(w / 22));
            for (let k = 0; k < m; k++) crest += `<rect x="${f1(x + 2 + k * (w - 4) / m)}" y="${y - 16}" width="${f1((w - 4) / m * 0.55)}" height="16" fill="url(#${uid}unit)" stroke="${u.stroke}" stroke-width="1.8"/>`;
            if (withLamp && i % 2 === 0) crest += `<g><rect x="${f1(cx - 1.5)}" y="${y - 74}" width="3" height="58" fill="#7a5410"/><path d="M${f1(cx + 1.5)},${y - 74} L${f1(cx + 30)},${y - 64} L${f1(cx + 1.5)},${y - 52}Z" fill="${i % 4 === 0 ? '#e63946' : '#7a3fd0'}" stroke="#4a1a6a" stroke-width="1.6"/></g>`;
        } else {
            crest = `<rect x="${f1(x + 3)}" y="${y - 13}" width="${f1(w - 6)}" height="14" rx="4" fill="${u.rail}" stroke="${u.stroke}" stroke-width="2"/><rect x="${f1(x + 7)}" y="${y - 11}" width="${f1(w - 14)}" height="3" rx="1.5" fill="${u.hi}" opacity=".8"/>`;
        }
        const speck = `<circle cx="${f1(x + w * 0.18)}" cy="${y + 40}" r="1.6" fill="${u.line}" opacity=".5"/><circle cx="${f1(x + w * 0.8)}" cy="${y + 18}" r="1.4" fill="${u.line}" opacity=".5"/><circle cx="${f1(x + w * 0.28)}" cy="${y + 15}" r="1.2" fill="${u.line}" opacity=".5"/>`;
        return `<g>${crest}${base}<path d="M${f1(x + 4)},${y + 5} H${f1(x + w - 4)}" stroke="${u.hi}" stroke-width="3" stroke-linecap="round" opacity=".8"/>${courses}${arcsShade}${extra}${speck}${hasLamp && g.style !== 'citadel' ? lampMarkup(g, x, w, y, uid, false) : ''}</g>`;
    }

    function segmentNext(g, i, fill, uid) {
        const top = g.deckY - 40 + (g.h + 44) * (1 - Math.max(0, Math.min(1, fill)));
        return `<g>
    <path d="${unitPath(g, i)}" fill="rgba(255,238,190,.16)" stroke="#fff0c2" stroke-width="3" stroke-dasharray="9 7" stroke-linejoin="round"/>
    <clipPath id="${uid}clip"><rect x="${f1(unitX(g, i) - 2)}" y="${f1(top)}" width="${f1(g.w + 4)}" height="${f1(g.h + 50)}"/></clipPath>
    <g clip-path="url(#${uid}clip)">${segmentBuilt(g, i, uid, false)}</g>
    <path d="${unitPath(g, i)}" fill="none" stroke="#fff6d6" stroke-width="2" opacity=".9" filter="url(#${uid}glow)"/>
  </g>`;
    }
    function segmentGhost(g, i) {
        return `<path d="${unitPath(g, i)}" fill="rgba(255,230,180,.08)" stroke="rgba(255,236,190,.5)" stroke-width="2" stroke-dasharray="6 7" stroke-linejoin="round"/>`;
    }

    function unitsMarkup(g, built, nextFill, uid, dropIdx) {
        let s = '';
        const done = Math.min(g.n, Math.max(0, built));
        for (let i = 0; i < g.n; i++) {
            if (i < done) {
                const m = segmentBuilt(g, i, uid, true);
                s += dropIdx === i ? `<g class="tbs-drop">${m}</g>` : m;
            } else if (i === done && nextFill != null) s += segmentNext(g, i, nextFill, uid);
            else s += segmentGhost(g, i);
        }
        return s;
    }
    function piersMarkup(g, built) {
        const t = themeOf(g.theme);
        let s = '';
        const done = Math.min(g.n, Math.max(0, built));
        const wide = g.style === 'arch' || g.style === 'viaduct' || g.style === 'citadel';
        const pw = wide ? Math.min(30, g.w * 0.16) : g.style === 'iron' ? 18 : 12;
        for (let i = 1; i < done + 1 && i < g.n; i++) {          // a pier under every joint between built segments
            const px = unitX(g, i - 1) + g.w - pw / 2;
            const top = g.deckY + g.h - 6;
            const ph = g.floor - top + 60;
            s += `<rect x="${f1(px)}" y="${top}" width="${f1(pw)}" height="${ph}" fill="${t.pier[0]}"/><rect x="${f1(px)}" y="${top}" width="${f1(pw * 0.32)}" height="${ph}" fill="${t.pier[1]}" opacity=".7"/>`;
            if (g.style === 'iron') s += `<path d="M${f1(px - 14)},${g.floor + 40} L${f1(px + pw / 2)},${top + 40} L${f1(px + pw + 14)},${g.floor + 40}" fill="none" stroke="${t.pier[1]}" stroke-width="3" opacity=".7"/>`;
            if (g.style === 'rope') s += `<ellipse cx="${f1(px + pw / 2)}" cy="${g.floor - 40}" rx="${f1(pw * 1.8)}" ry="5" fill="#fff" opacity=".35"/>`;
        }
        return s;
    }

    function glitter(t) {
        const r = rnd(7);
        let s = '';
        const sx = t.sun ? t.sun.x : 790;
        for (let k = 0; k < 46; k++) {
            const y = 14 + r() * 330;
            const spread = 30 + y * 0.6;
            const x = sx + (r() - 0.5) * spread * 2;
            if (x < 340 || x > 1030) continue;
            s += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(5 + r() * 14).toFixed(0)}" ry="1.8" fill="#ffe9b0" opacity="${(t.sun ? 0.25 + r() * 0.5 : 0.08 + r() * 0.12).toFixed(2)}"/>`;
        }
        return s;
    }

    function sparkles(cx, cy) {
        const r = rnd(5);
        let s = '<g filter="url(#__glow)">';
        for (let k = 0; k < 26; k++) {
            const a = r() * Math.PI * 2, d = 20 + r() * 120;
            const x = cx + Math.cos(a) * d * 1.3, y = cy + Math.sin(a) * d * 0.8 - 20;
            const z = 3 + r() * 7;
            s += `<path d="M${x},${y - z} L${x + z * .35},${y - z * .35} L${x + z},${y} L${x + z * .35},${y + z * .35} L${x},${y + z} L${x - z * .35},${y + z * .35} L${x - z},${y} L${x - z * .35},${y - z * .35}Z" fill="${['#fff6c9', '#ffd23f', '#ffffff', '#ffb3c6'][k % 4]}"/>`;
        }
        s += `</g><g stroke="#fff3b0" stroke-width="3" stroke-linecap="round" opacity=".7">${Array.from({ length: 12 }, (_, k) => {
            const a = k / 12 * Math.PI * 2;
            return `<path d="M${cx + Math.cos(a) * 62},${cy + Math.sin(a) * 40} L${cx + Math.cos(a) * 92},${cy + Math.sin(a) * 60}"/>`;
        }).join('')}</g>`;
        return s;
    }

    /* ------------------------------------------------------------------------------ per-theme decoration */
    function skyDecor(t, uid) {
        const dy = t.deckY - BASE_DECK_Y;
        const r = rnd(t.id.length * 31 + 3);
        let s = '';
        const nStars = t.night > 0.3 ? 12 : 30;
        if (t.id !== 'storm' && t.id !== 'rapids') {
            for (let k = 0; k < nStars; k++) {
                const q = rnd(k + 3);
                s += `<circle cx="${(q() * 1366).toFixed(0)}" cy="${(q() * 110).toFixed(0)}" r="${(0.8 + q() * 1.4).toFixed(1)}" fill="#fff" opacity="${(t.id === 'citadel' || t.id === 'arch' ? 0.25 : 0.4 + q() * 0.5).toFixed(2)}"/>`;
            }
        }
        const sunY = t.deckY - 16;
        if (t.sun) {
            s += `<circle cx="${t.sun.x}" cy="${sunY}" r="${t.sun.r * 4}" fill="url(#${uid}sun)"/><circle cx="${t.sun.x}" cy="${sunY - 4}" r="${t.sun.r}" fill="${t.sun.core}"/><circle cx="${t.sun.x}" cy="${sunY - 4}" r="${t.sun.r}" fill="none" stroke="${t.sun.ring}" stroke-width="3" opacity=".6"/>`;
            if (t.id === 'citadel') s += `<g class="tbs-sunrays2" opacity=".35" stroke="#fff3b0" stroke-width="6" stroke-linecap="round">${Array.from({ length: 14 }, (_, k) => { const a = (k / 14) * Math.PI * 2; return `<path d="M${t.sun.x + Math.cos(a) * 110},${sunY + Math.sin(a) * 110} L${t.sun.x + Math.cos(a) * 190},${sunY + Math.sin(a) * 190}"/>`; }).join('')}</g>`;
        }
        const cc = t.cloud;
        s += cloud(180, 120 + dy * 0.2, 1.4, cc[0], t.id === 'storm' ? 0.95 : 0.55) + cloud(1180, 170 + dy * 0.2, 1.7, cc[1], t.id === 'storm' ? 0.95 : 0.6) + cloud(560, 230 + dy * 0.3, 1.1, cc[2], t.id === 'storm' ? 0.85 : 0.75) + cloud(1010, 250 + dy * 0.3, 0.9, cc[3], t.id === 'storm' ? 0.85 : 0.8);
        if (t.id === 'storm') {
            s += cloud(420, 70, 2.2, '#1a1c38', 0.95) + cloud(900, 60, 2.6, '#1a1c38', 0.95) + cloud(1250, 100, 2.0, '#22264a', 0.9) + cloud(120, 60, 2.0, '#22264a', 0.9);
        } else if (t.id === 'rapids') {
            s += cloud(300, 90, 2.0, '#9ab4b4', 0.55) + cloud(1000, 110, 2.3, '#a8c0bc', 0.5);
        } else {
            s += [[430, 150], [470, 138], [520, 160], [1000, 110]].map(([x, y]) => `<path d="M${x},${y + dy * 0.2} q8,-9 16,0 q8,-9 16,0" fill="none" stroke="${t.night > 0.2 ? '#2a2060' : '#5b3a6e'}" stroke-width="2.2" stroke-linecap="round"/>`).join('');
        }
        if (t.id === 'arch') {
            // sailboats on the inlet
            const boat = (x, y, sc) => `<g transform="translate(${x},${y}) scale(${sc})"><path d="M-22,0 H26 L18,10 H-14Z" fill="#7a3a30"/><path d="M0,-4 V-46 L24,-6Z" fill="#fff3e0"/><path d="M-2,-4 V-36 L-20,-6Z" fill="#ffd2a0"/></g>`;
            s += boat(520, 392 + dy, 0.9) + boat(660, 408 + dy, 0.6);
        }
        return s;
    }

    function frontDecor(t, uid) {
        let s = '';
        if (t.id === 'storm') {
            s += `<rect class="tbs-rain" x="-60" y="-140" width="1500" height="1000" fill="url(#${uid}rain)" opacity=".5"/>`;
            s += `<g class="tbs-flash"><rect width="${W}" height="${H}" fill="#cfe0ff"/><path d="M742,0 L702,150 L744,150 L690,300 L780,130 L736,130 L776,0Z" fill="#fff"/></g>`;
        }
        if (t.id === 'viaduct') {
            s += `<rect x="0" y="${t.deckY + 150}" width="${W}" height="150" fill="url(#${uid}mist)"/>`;
        }
        if (t.id === 'rapids') {
            s += `<g class="tbs-spray" fill="#fff" opacity=".5">${Array.from({ length: 16 }, (_, k) => { const q = rnd(k + 51); return `<circle cx="${(300 + q() * 780).toFixed(0)}" cy="${(560 + q() * 150).toFixed(0)}" r="${(2 + q() * 4).toFixed(1)}"/>`; }).join('')}</g>`;
        }
        return s;
    }

    function citadelDecor(t, uid) {
        const gx = X0 + SPAN + 40;   // right cliff top starts at ~1032
        const y = t.deckY + 12;
        const tower = (x, w, h, roof) => `<g><rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="#f2dca0" stroke="#8a6414" stroke-width="3"/><path d="M${x - 6},${y - h} h${w + 12} v-12 h-8 v6 h-8 v-6 h-8 v6 h-${(w + 12) / 2 - 16} v-6 h-8 v6 h-8 v-6 h-8Z" fill="#f2dca0" stroke="#8a6414" stroke-width="2.4"/><path d="M${x - 4},${y - h - 12} L${x + w / 2},${y - h - 12 - roof} L${x + w + 4},${y - h - 12}Z" fill="#7a3fd0" stroke="#3a1a70" stroke-width="3"/><rect x="${x + w / 2 - 6}" y="${y - h + 24}" width="12" height="22" rx="6" fill="#ffd23f"/><rect x="${x + w / 2 - 6}" y="${y - h + 24}" width="12" height="22" rx="6" fill="url(#${uid}lamp)" opacity=".9"/><path d="M${x + w / 2},${y - h - 12 - roof} v-26" stroke="#5a3a2a" stroke-width="3"/><path d="M${x + w / 2},${y - h - 12 - roof - 26} l26,8 l-26,8Z" fill="#e63946"/></g>`;
        return `<g class="tbs-citadel"><circle cx="${gx + 190}" cy="${y - 120}" r="190" fill="url(#${uid}lamp)" opacity=".55"/>
      ${tower(gx + 120, 70, 230, 74)}${tower(gx + 36, 54, 140, 52)}${tower(gx + 248, 60, 168, 60)}
      <rect x="${gx + 30}" y="${y - 90}" width="290" height="92" fill="#f6e6b4" stroke="#8a6414" stroke-width="3"/>
      <path d="M${gx + 150},${y} v-52 a26,26 0 0 1 52,0 v52Z" fill="#6a3a90" stroke="#3a1a70" stroke-width="3"/><path d="M${gx + 176},${y} v-52" stroke="#ffd23f" stroke-width="3"/>
      ${[0, 1, 2, 3, 4, 5].map((k) => `<rect x="${gx + 48 + k * 44}" y="${y - 78}" width="12" height="20" rx="6" fill="#ffd23f"/>`).join('')}</g>`;
    }

    /* ------------------------------------------------------------------------------ scene */
    function bridgeSvg(uid, opts = {}) {
        const t = themeOf(opts.theme || (opts.round ? THEME_BY_ROUND[opts.round - 1] : 'arch'));
        const g = geom(opts.n, t.id);
        const vb = opts.vb || `0 0 ${W} ${H}`;
        const cls = opts.cls || 'tbs-svg';
        const dy = t.deckY - BASE_DECK_Y;
        const wave = opts.wave || ROUND_WAVE_DEFAULT[t.id] || 7;
        const [amp, wl, step] = t.wave;
        const back = wavePath(0, amp, wl, 0.6, 120, 1250 + wl, 800, step);
        const mid = wavePath(10, amp * 0.75, wl * 0.7, 2.2, 120, 1250 + wl * 0.7, 800, step);
        const foam = waveLine(0, amp, wl * 1.6, 0.6, 120, 1250 + wl * 1.6, step * 2);
        const goalX = g.x0 + SPAN + 68;
        const flowers = t.id === 'storm' ? '' : Array.from({ length: 22 }, (_, k) => {
            const r = rnd(k + 90);
            const left = k % 2 === 0;
            const x = left ? 20 + r() * 290 : 1050 + r() * 300;
            const y = (left ? 340 + x * 0.02 : 332 - (x - 1050) * 0.01) + 3 + r() * 8;
            return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="2.6" fill="${['#ffd2e0', '#fff1a8', '#ffffff'][k % 3]}"/>`;
        }).join('');
        const dark = t.id === 'storm' || t.id === 'viaduct';
        const trees = `${pine(60, 336, 1.15, dark)}${pine(112, 331, .85, dark)}${pine(244, 342, .7, dark)}${t.id === 'citadel' ? '' : pine(1262, 330, 1.2, dark) + pine(1318, 326, .9, dark)}${pine(1130, 338, .7, dark)}`;
        const rocks = t.id === 'rapids' ? Array.from({ length: 9 }, (_, k) => { const q = rnd(k + 31); const rx = 350 + q() * 640, ry = 600 + q() * 90; return `<g><path d="M${rx.toFixed(0)},${ry.toFixed(0)} q12,-30 36,-26 q24,2 30,26Z" fill="#46564e"/><path d="M${(rx + 6).toFixed(0)},${(ry - 2).toFixed(0)} q10,-18 26,-18" fill="none" stroke="#7e9086" stroke-width="3" opacity=".7"/><ellipse cx="${(rx + 34).toFixed(0)}" cy="${(ry + 4).toFixed(0)}" rx="40" ry="6" fill="#fff" opacity=".5"/></g>`; }).join('') : '';
        const cliffBottom = 1100;
        const lo = t.cliffL, cl = t.cliffLine;
        const rainPattern = t.id === 'storm' ? `<pattern id="${uid}rain" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M10,6 l-8,26 M52,40 l-8,26 M96,12 l-8,26 M28,84 l-8,26 M80,92 l-8,26 M112,66 l-8,26" stroke="#bcd0ff" stroke-width="2" stroke-linecap="round"/></pattern>` : '';
        const mist = t.id === 'viaduct' ? `<linearGradient id="${uid}mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfc8f0" stop-opacity="0"/><stop offset=".6" stop-color="#cfc8f0" stop-opacity=".22"/><stop offset="1" stop-color="#cfc8f0" stop-opacity="0"/></linearGradient>` : '';
        const waterOp = t.id === 'storm' ? 0.4 : 0.3;
        return `<svg class="${cls}" data-uid="${uid}" data-theme="${t.id}" style="--tbs-wave:${wave}s;--tbs-wl:${wl}px;--tbs-wl2:${(wl * 0.7).toFixed(1)}px;--tbs-wl3:${(wl * 1.6).toFixed(1)}px" viewBox="${vb}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${uid}sky" x1="0" y1="0" x2="0" y2="1">${stops(t.sky, ['0', '.16', '.34', '.47', '.58'])}</linearGradient>
    <radialGradient id="${uid}sun"><stop offset="0" stop-color="${t.sun ? t.sun.core : '#fff'}"/><stop offset=".35" stop-color="${t.sun ? t.sun.glow : '#fff'}" stop-opacity=".8"/><stop offset="1" stop-color="${t.sun ? t.sun.ring : '#fff'}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${uid}fjord" x1="0" y1="0" x2="0" y2="1">${stops(t.fjord, ['0', '.22', '.55', '1'])}</linearGradient>
    <linearGradient id="${uid}water" x1="0" y1="0" x2="0" y2="1">${stops(t.water, ['0', '.35', '1'])}</linearGradient>
    <linearGradient id="${uid}cliffL" x1="0" y1="0" x2="1" y2="0">${stops(lo, ['0', '.6', '1'])}</linearGradient>
    <linearGradient id="${uid}cliffR" x1="1" y1="0" x2="0" y2="0">${stops(lo, ['0', '.6', '1'])}</linearGradient>
    <linearGradient id="${uid}grass" x1="0" y1="0" x2="0" y2="1">${stops(t.grass)}</linearGradient>
    <linearGradient id="${uid}unit" x1="0" y1="0" x2="0" y2="1">${stops(t.unit.fill)}</linearGradient>
    <radialGradient id="${uid}lamp"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".95"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
    <radialGradient id="${uid}lampR"><stop offset="0" stop-color="#ff8a7a" stop-opacity=".95"/><stop offset="1" stop-color="#ff4a3a" stop-opacity="0"/></radialGradient>
    <filter id="${uid}glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="${uid}chan"><rect x="280" y="${346 + dy}" width="810" height="${430 - dy}"/></clipPath>
    <linearGradient id="${uid}fmg" gradientUnits="userSpaceOnUse" x1="300" y1="0" x2="1066" y2="0"><stop offset="0" stop-color="#000"/><stop offset=".08" stop-color="#fff"/><stop offset=".92" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
    <mask id="${uid}chanf" maskUnits="userSpaceOnUse" x="280" y="${346 + dy}" width="810" height="${430 - dy}"><rect x="300" y="${346 + dy}" width="766" height="${430 - dy}" fill="url(#${uid}fmg)"/></mask>
    ${rainPattern}${mist}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#${uid}sky)"/>${skyDecor(t, uid)}
  <g transform="translate(0,${dy})">
    <path d="M0,330 L90,292 L170,322 L260,282 L350,330 L440,300 L540,336 L640,306 L760,340 L900,298 L1000,330 L1120,290 L1230,326 L1366,296 V400 H0Z" fill="${t.mtn[0]}" opacity=".85"/>
    <path d="M0,350 L120,318 L240,346 L380,314 L520,350 L700,326 L880,352 L1040,320 L1200,348 L1366,322 V420 H0Z" fill="${t.mtn[1]}"/>
  </g>
  <rect x="280" y="${346 + dy}" width="810" height="${430 - dy}" fill="url(#${uid}fjord)"/>
  <g class="tbs-piers"></g>
  <g clip-path="url(#${uid}chan)"><g class="tbs-water" style="transform:translateY(${TIDE_MIN}px)">
    <g class="tbs-wv tbs-wv--a"><path d="${back}" fill="url(#${uid}water)"/></g>
    ${glitter(t)}
    <g class="tbs-wv tbs-wv--b"><path d="${mid}" fill="#7cc4cf" opacity=".28"/></g>
    <g class="tbs-wv tbs-wv--c"><path d="${foam}" fill="none" stroke="#e6fbff" stroke-width="${t.id === 'rapids' ? 4.4 : 2.4}" opacity="${t.id === 'rapids' ? 0.85 : 0.55}"/></g>
    ${t.id === 'rapids' ? `<g class="tbs-wv tbs-wv--b"><path d="${waveLine(26, amp, wl * 0.7, 1.7, 120, 1340 + wl, 8)}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="26 40" opacity=".8"/></g>` : ''}
  </g>${rocks}</g>
  <g transform="translate(0,${dy})">
  <path d="M-10,330 C80,322 200,334 330,342 L336,352 C338,380 318,420 326,470 C334,520 306,580 316,640 C320,690 300,730 306,${cliffBottom} L-10,${cliffBottom}Z" fill="url(#${uid}cliffL)"/>
  <path d="M40,420 C120,410 200,430 322,418 M20,500 C110,488 220,510 316,498 M0,590 C100,580 210,600 310,588 M0,680 C100,672 200,690 304,676" fill="none" stroke="${cl}" stroke-width="3" opacity=".22"/>
  <path d="M-10,330 C80,322 200,334 330,342 L333,362 C330,372 322,372 316,364 C300,370 290,362 270,366 C240,360 200,356 160,350 C100,346 50,340 -10,344Z" fill="url(#${uid}grass)"/>
  <path d="M1376,326 C1280,320 1150,330 1032,342 L1028,352 C1026,380 1046,420 1038,470 C1030,520 1058,580 1048,640 C1044,690 1064,730 1058,${cliffBottom} L1376,${cliffBottom}Z" fill="url(#${uid}cliffR)"/>
  <path d="M1044,418 C1120,410 1240,430 1376,416 M1050,498 C1130,488 1250,510 1376,498 M1056,588 C1140,580 1260,600 1376,588 M1060,676 C1140,672 1260,690 1376,676" fill="none" stroke="${cl}" stroke-width="3" opacity=".22"/>
  <path d="M1376,326 C1280,320 1150,330 1032,342 L1029,362 C1034,372 1042,372 1048,364 C1066,370 1080,362 1100,366 C1140,360 1200,354 1260,348 C1310,344 1340,340 1376,342Z" fill="url(#${uid}grass)"/>
  ${flowers}${trees}${t.id === 'citadel' ? citadelDecor(t, uid) : ''}
  <g transform="translate(${goalX - (t.id === 'citadel' ? 20 : 0)},350)"><rect x="-2" y="-92" width="4" height="92" fill="#5a3a2a"/><path class="tbs-flag" d="M2,-92 L52,-78 L2,-62Z" fill="#e63946" stroke="#9d1d2b" stroke-width="2" stroke-linejoin="round"/><path d="M20,-80 l3,6 6,1 -4.500,4 1,6 -5.500,-3 -5.500,3 1,-6 -4.500,-4 6,-1z" fill="#fff" transform="scale(.9) translate(2,-2)"/></g>
  <g transform="translate(${g.x0 - 68},342)"><rect x="-2" y="-52" width="4" height="52" fill="#5a3a2a"/><path d="M2,-52 L34,-43 L2,-33Z" fill="#ffd23f" stroke="#a87812" stroke-width="2" stroke-linejoin="round"/></g>
  </g>
  <g class="tbs-units"></g>
  <g mask="url(#${uid}chanf)"><g class="tbs-water tbs-water--front" style="transform:translateY(${TIDE_MIN}px)"><g class="tbs-wv tbs-wv--b"><path d="${back}" fill="${t.water[0]}" opacity="${waterOp}"/></g><g class="tbs-wv tbs-wv--c"><path d="${foam}" fill="none" stroke="#e6fbff" stroke-width="2.4" opacity=".5"/></g></g></g>
  <g class="tbs-fx"></g>
  ${frontDecor(t, uid)}
</svg>`;
    }

    const ROUND_WAVE_DEFAULT = { footbridge: 9, arch: 7.5, viaduct: 6, rapids: 4, storm: 3, citadel: 2.6 };

    /** Sunny beach used for the Shore challenge (a different place from the bridge). */
    function beachSvg(uid, opts = {}) {
        const vb = opts.vb || `0 0 ${W} ${H}`;
        const cls = opts.cls || 'tbs-svg';
        const bunting = (x1, y1, x2, y2, sag, n, off = 0) => {
            const cols = ['#ff6b6b', '#ffd23f', '#2ec4b6', '#ffffff', '#ff9f1c'];
            let s = `<path d="M${x1},${y1} Q${(x1 + x2) / 2},${(y1 + y2) / 2 + sag} ${x2},${y2}" fill="none" stroke="#5a3a2a" stroke-width="3"/>`;
            for (let k = 1; k <= n; k++) {
                const t = k / (n + 1);
                const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * ((x1 + x2) / 2) + t * t * x2;
                const y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * ((y1 + y2) / 2 + sag) + t * t * y2;
                s += `<path d="M${x - 14},${y} L${x + 14},${y} L${x},${y + 34}Z" fill="${cols[(k + off) % 5]}" stroke="#13204f" stroke-width="2" stroke-linejoin="round"/>`;
            }
            return s;
        };
        const r = rnd(11);
        let ripples = '';
        for (let k = 0; k < 18; k++) ripples += `<path d="M${(r() * 1300).toFixed(0)},${(520 + r() * 230).toFixed(0)} q14,-6 28,0" fill="none" stroke="#e0a860" stroke-width="3" stroke-linecap="round" opacity=".6"/>`;
        let seaDash = '';
        for (let k = 0; k < 26; k++) seaDash += `<path d="M${(r() * 1300).toFixed(0)},${(372 + r() * 80).toFixed(0)} h${(20 + r() * 40).toFixed(0)}" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>`;
        return `<svg class="${cls}" data-uid="${uid}" viewBox="${vb}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${uid}bsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4cc3e6"/><stop offset="1" stop-color="#d9f6ee"/></linearGradient>
    <linearGradient id="${uid}bsea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1fa7c2"/><stop offset="1" stop-color="#63d6d2"/></linearGradient>
    <linearGradient id="${uid}bsand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffeab5"/><stop offset="1" stop-color="#f1bf72"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#${uid}bsky)"/>
  <g transform="translate(1180,120)"><g class="tbs-sunrays" stroke="#ffd23f" stroke-width="7" stroke-linecap="round">${Array.from({ length: 12 }, (_, k) => { const a = k / 12 * Math.PI * 2; return `<path d="M${Math.cos(a) * 78},${Math.sin(a) * 78} L${Math.cos(a) * 102},${Math.sin(a) * 102}"/>`; }).join('')}</g><circle r="62" fill="#ffd23f" stroke="#f2a60c" stroke-width="4"/><circle cx="-20" cy="-8" r="6" fill="#13204f"/><circle cx="20" cy="-8" r="6" fill="#13204f"/><path d="M-22,14 Q0,34 22,14" fill="none" stroke="#13204f" stroke-width="5" stroke-linecap="round"/><circle cx="-38" cy="12" r="8" fill="#ff9a8a" opacity=".6"/><circle cx="38" cy="12" r="8" fill="#ff9a8a" opacity=".6"/></g>
  <g fill="#fff" opacity=".95"><g transform="translate(260,170)"><ellipse rx="80" ry="20"/><ellipse cx="-30" cy="-16" rx="40" ry="20"/><ellipse cx="22" cy="-22" rx="46" ry="24"/></g><g transform="translate(860,150) scale(.8)"><ellipse rx="80" ry="20"/><ellipse cx="-30" cy="-16" rx="40" ry="20"/><ellipse cx="22" cy="-22" rx="46" ry="24"/></g></g>
  <rect y="352" width="1366" height="150" fill="url(#${uid}bsea)"/>${seaDash}
  <path d="M0,470 C200,440 380,500 640,478 C900,456 1100,500 1366,466 V768 H0Z" fill="url(#${uid}bsand)"/>
  <path d="M0,470 C200,440 380,500 640,478 C900,456 1100,500 1366,466" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".9"/>
  <path d="M0,486 C200,456 380,516 640,494 C900,472 1100,516 1366,482" fill="none" stroke="#bff0f0" stroke-width="5" stroke-linecap="round" opacity=".8"/>
  ${ripples}
  ${bunting(0, 196, 316, 250, 40, 7)}${bunting(1366, 190, 1050, 250, 40, 7, 2)}
  <g transform="translate(1290,470)"><path d="M0,0 C-10,-60 8,-120 -6,-190" fill="none" stroke="#8a5a2b" stroke-width="16" stroke-linecap="round"/>${[[-90, -30], [-60, -70], [-10, -90], [50, -60], [80, -20]].map(([dx, dy]) => `<path d="M-6,-190 Q${dx - 6},${-190 + dy - 40} ${dx * 1.4 - 6},${-190 + dy + 30}" fill="none" stroke="#2f9e5a" stroke-width="16" stroke-linecap="round"/>`).join('')}<circle cx="-12" cy="-184" r="9" fill="#7a4a20"/><circle cx="6" cy="-180" r="9" fill="#7a4a20"/></g>
  <g transform="translate(110,600)" stroke="#b07a34" stroke-width="3" stroke-linejoin="round"><path d="M-70,50 V-10 H-50 V-24 H-34 V-10 H-14 V-34 H4 V-50 H20 V-34 H40 V-10 H56 V-24 H72 V-10 H90 V50Z" fill="#f6cf86"/><path d="M0,50 V20 Q0,4 14,4 Q28,4 28,20 V50Z" fill="#c98f42"/><path d="M4,-50 V-84" stroke="#5a3a2a" stroke-width="4"/><path d="M4,-84 L34,-74 L4,-64Z" fill="#ff6b6b" stroke="#13204f" stroke-width="2"/></g>
  <g transform="translate(1110,610)"><circle r="46" fill="#fff" stroke="#13204f" stroke-width="4"/><path d="M0,-46 A46,46 0 0 1 40,-23 L0,0Z" fill="#ff6b6b"/><path d="M40,23 A46,46 0 0 1 0,46 L0,0Z" fill="#ffd23f"/><path d="M-40,23 A46,46 0 0 1 -40,-23 L0,0Z" fill="#2ec4b6"/><circle r="9" fill="#fff" stroke="#13204f" stroke-width="3"/></g>
  <g transform="translate(300,690)"><path d="M0,-26 L8,-8 L28,-8 L12,4 L18,24 L0,12 L-18,24 L-12,4 L-28,-8 L-8,-8Z" fill="#ff8f6b" stroke="#c4492a" stroke-width="3" stroke-linejoin="round"/></g>
  <g transform="translate(540,716) scale(.9)"><path d="M0,-20 C-22,-20 -28,2 -22,12 Q-12,22 0,22 Q12,22 22,12 C28,2 22,-20 0,-20Z" fill="#fbe3e0" stroke="#d98a8a" stroke-width="3"/><path d="M0,-18 V20 M-10,-14 L-12,18 M10,-14 L12,18" stroke="#e8aaaa" stroke-width="2" fill="none"/></g>
  <g transform="translate(900,660)" stroke="#13204f" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"><path d="M-34,10 L-52,26 M-20,16 L-30,34 M20,16 L30,34 M34,10 L52,26" fill="none" stroke="#e5484d" stroke-width="5"/><ellipse rx="40" ry="26" fill="#ff6b6b"/><path d="M-36,-6 Q-62,-30 -48,-50 Q-30,-46 -28,-22Z" fill="#ff6b6b"/><path d="M36,-6 Q62,-30 48,-50 Q30,-46 28,-22Z" fill="#ff6b6b"/><circle cx="-12" cy="-26" r="6" fill="#fff"/><circle cx="12" cy="-26" r="6" fill="#fff"/><circle cx="-12" cy="-26" r="2.5" fill="#13204f"/><circle cx="12" cy="-26" r="2.5" fill="#13204f"/><path d="M-10,0 Q0,8 10,0" fill="none"/></g>
</svg>`;
    }

    /** Update the dynamic groups of an SVG made by bridgeSvg(). Cheap enough to call on every state change. */
    function updateBridge(svg, s) {
        if (!svg) return;
        const uid = svg.getAttribute('data-uid') || '';
        const themeId = svg.getAttribute('data-theme') || 'arch';
        const g = geom(s.n, themeId);
        const built = Math.min(g.n, Math.max(0, s.built | 0));
        const fill = s.nextFill == null ? null : Math.max(0, Math.min(1, s.nextFill));
        if (s.justLaid && built > 0) {
            svg.__tbsDrop = built - 1;
            clearTimeout(svg.__tbsDropT);
            svg.__tbsDropT = setTimeout(() => { svg.__tbsDrop = null; }, 1100);
        }
        const key = `${g.n}|${built}|${fill == null ? 'x' : fill.toFixed(2)}|${svg.__tbsDrop == null ? 'x' : svg.__tbsDrop}`;
        if (svg.__tbsKey !== key) {
            svg.__tbsKey = key;
            const units = svg.querySelector('.tbs-units');
            const piers = svg.querySelector('.tbs-piers');
            if (units) units.innerHTML = unitsMarkup(g, built, built >= g.n ? null : fill, uid, svg.__tbsDrop);
            if (piers) piers.innerHTML = piersMarkup(g, built);
            svg.classList.toggle('is-complete', built >= g.n);
        }
        if (s.wave != null) svg.style.setProperty('--tbs-wave', `${s.wave}s`);
        if (s.ratio != null) {
            const y = `translateY(${tideY(s.ratio, themeId).toFixed(1)}px)`;
            svg.querySelectorAll('.tbs-water').forEach((w) => { w.style.transform = y; });
        }
        if (s.sparkle) {
            const fx = svg.querySelector('.tbs-fx');
            if (fx) {
                const cx = unitX(g, Math.max(0, built - 1)) + g.w / 2;
                fx.innerHTML = sparkles(cx, g.deckY - 20).replace('__glow', `${uid}glow`);
                fx.classList.remove('is-on');
                void fx.getBoundingClientRect();
                fx.classList.add('is-on');
                clearTimeout(fx.__t);
                fx.__t = setTimeout(() => { fx.innerHTML = ''; fx.classList.remove('is-on'); }, 2600);
            }
        }
    }

    global.TideBridgeScene = { bridgeSvg, beachSvg, updateBridge, tideY, geom, themeOf, THEMES, THEME_BY_ROUND, W, H };
})(typeof window !== 'undefined' ? window : globalThis);
