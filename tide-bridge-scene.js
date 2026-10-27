/**
 * The Bridge (Tide Bridge, internal id `tide-bridge`) — "Storybook Dusk" artwork (plain SVG strings, no libraries).
 * Pure presentation: builds the dusk fjord scene + the sunny-beach Shore challenge scene.
 * The bridge geometry scales to the number of stones the class needs for GOLD.
 */
(function (global) {
    'use strict';

    const W = 1366;
    const H = 768;
    const X0 = 330;           // left end of the bridge deck
    const SPAN = 702;         // deck length (330 → 1032)
    const DECK_Y = 342;
    const UNIT_H = 84;
    const TIDE_MIN = 690;     // water surface y at the start of the game
    const TIDE_MAX = 432;     // water surface y when the tide is fully in

    const rnd = (s) => {
        let a = (s * 2654435761) >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    function geom(n) {
        const count = Math.max(3, Math.round(Number(n) || 9));
        const w = SPAN / count;
        return { n: count, w, r: Math.min(28, w * 0.36), x0: X0, deckY: DECK_Y, h: UNIT_H, floor: 700 };
    }
    const unitX = (g, i) => g.x0 + i * g.w;
    const f1 = (v) => Number(v).toFixed(1);

    function unitPath(g, i) {
        const x = unitX(g, i), y = g.deckY, w = g.w, cx = x + w / 2, r = g.r;
        return `M${f1(x)},${y} H${f1(x + w)} V${y + g.h} H${f1(cx + r)} A${f1(r)},${f1(r)} 0 0 0 ${f1(cx - r)},${y + g.h} H${f1(x)} Z`;
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

    /** water surface y for a 0..1 tide ratio */
    function tideY(ratio) {
        const p = Math.max(0, Math.min(1, Number(ratio) || 0));
        return TIDE_MIN - p * (TIDE_MIN - TIDE_MAX);
    }

    function pine(x, y, s) {
        return `<g transform="translate(${x},${y}) scale(${s})"><rect x="-3" y="-6" width="6" height="14" fill="#5a3a2a"/><path d="M0-62 L-18-30 H-8 L-24 0 H24 L8-30 H18Z" fill="#2c5a48"/><path d="M0-62 L18-30 H8 L24 0 H6 Z" fill="#1f4637" opacity=".65"/></g>`;
    }
    function cloud(x, y, s, c, o) {
        return `<g transform="translate(${x},${y}) scale(${s})" fill="${c}" opacity="${o}"><ellipse cx="0" cy="0" rx="70" ry="16"/><ellipse cx="-26" cy="-12" rx="34" ry="16"/><ellipse cx="18" cy="-17" rx="40" ry="20"/></g>`;
    }

    function stoneBuilt(g, i, uid, withLamp) {
        const x = unitX(g, i), y = g.deckY, w = g.w, cx = x + w / 2, r = g.r;
        const tone = ['#ffd978', '#f7c862', '#ffdf8a', '#f2bd58'][i % 4];
        const every = w >= 60 ? 3 : 4;
        const lamp = withLamp && i % every === 1
            ? `<g><rect x="${f1(x + w * 0.84)}" y="${y - 44}" width="4" height="32" fill="#4a2e18"/><circle cx="${f1(x + w * 0.84 + 2)}" cy="${y - 48}" r="14" fill="url(#${uid}lamp)"/><circle cx="${f1(x + w * 0.84 + 2)}" cy="${y - 48}" r="5.5" fill="#fff2b0"/></g>`
            : '';
        const p = unitPath(g, i);
        return `<g>
    <rect x="${f1(x + 3)}" y="${y - 13}" width="${f1(w - 6)}" height="14" rx="4" fill="#eab14d" stroke="#8a5418" stroke-width="2"/>
    <rect x="${f1(x + 7)}" y="${y - 11}" width="${f1(w - 14)}" height="3" rx="1.5" fill="#fff0b8" opacity=".8"/>
    <path d="${p}" fill="url(#${uid}stone)" stroke="#8a5418" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="${p}" fill="${tone}" opacity=".35"/>
    <path d="M${f1(x + 4)},${y + 5} H${f1(x + w - 4)}" stroke="#fff3c4" stroke-width="3" stroke-linecap="round" opacity=".8"/>
    <path d="M${f1(x)},${y + 28} H${f1(x + w)} M${f1(cx)},${y + 2} V${y + 54}" stroke="#9a5f1d" stroke-width="1.6" opacity=".35"/>
    <path d="M${f1(cx - r + 3)},${y + g.h} A${f1(r - 3)},${f1(r - 3)} 0 0 1 ${f1(cx + r - 3)},${y + g.h}" fill="none" stroke="#7a4210" stroke-width="3" opacity=".25" transform="translate(0,-2)"/>
    <circle cx="${f1(x + w * 0.18)}" cy="${y + 40}" r="1.6" fill="#9a5f1d" opacity=".5"/><circle cx="${f1(x + w * 0.8)}" cy="${y + 18}" r="1.4" fill="#9a5f1d" opacity=".5"/><circle cx="${f1(x + w * 0.28)}" cy="${y + 15}" r="1.2" fill="#9a5f1d" opacity=".5"/>
    ${lamp}
  </g>`;
    }
    function stoneNext(g, i, fill, uid) {
        const top = g.deckY + g.h * (1 - Math.max(0, Math.min(1, fill)));
        return `<g>
    <path d="${unitPath(g, i)}" fill="rgba(255,238,190,.16)" stroke="#fff0c2" stroke-width="3" stroke-dasharray="9 7" stroke-linejoin="round"/>
    <clipPath id="${uid}clip"><rect x="${f1(unitX(g, i) - 2)}" y="${f1(top)}" width="${f1(g.w + 4)}" height="${f1(g.h + 4)}"/></clipPath>
    <g clip-path="url(#${uid}clip)">${stoneBuilt(g, i, uid, false)}</g>
    <path d="${unitPath(g, i)}" fill="none" stroke="#fff6d6" stroke-width="2" opacity=".9" filter="url(#${uid}glow)"/>
  </g>`;
    }
    function stoneGhost(g, i) {
        return `<path d="${unitPath(g, i)}" fill="rgba(255,230,180,.08)" stroke="rgba(255,236,190,.5)" stroke-width="2" stroke-dasharray="6 7" stroke-linejoin="round"/>`;
    }

    function unitsMarkup(g, built, nextFill, uid, dropIdx) {
        let s = '';
        const done = Math.min(g.n, Math.max(0, built));
        for (let i = 0; i < g.n; i++) {
            if (i < done) {
                const m = stoneBuilt(g, i, uid, true);
                s += dropIdx === i ? `<g class="tbs-drop">${m}</g>` : m;
            } else if (i === done && nextFill != null) s += stoneNext(g, i, nextFill, uid);
            else s += stoneGhost(g, i);
        }
        return s;
    }
    function piersMarkup(g, built) {
        let s = '';
        const pw = Math.min(22, g.w * 0.4);
        const done = Math.min(g.n, Math.max(0, built));
        for (let i = 0; i < done; i++) {
            const px = unitX(g, i) + g.w - pw / 2;
            const ph = g.floor - g.deckY - g.h + 70;
            s += `<rect x="${f1(px)}" y="${g.deckY + g.h - 6}" width="${f1(pw)}" height="${ph}" fill="#9a6a3a"/><rect x="${f1(px)}" y="${g.deckY + g.h - 6}" width="${f1(pw * 0.32)}" height="${ph}" fill="#b98550" opacity=".7"/>`;
        }
        return s;
    }

    function glitter() {
        const r = rnd(7);
        let s = '';
        for (let k = 0; k < 46; k++) {
            const y = 14 + r() * 330;
            const spread = 30 + y * 0.6;
            const x = 790 + (r() - 0.5) * spread * 2;
            if (x < 340 || x > 1030) continue;
            s += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(5 + r() * 14).toFixed(0)}" ry="1.8" fill="#ffe9b0" opacity="${(0.25 + r() * 0.5).toFixed(2)}"/>`;
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

    /** Dusk-fjord bridge scene. `uid` keeps gradient ids unique when several SVGs share the page. */
    function bridgeSvg(uid, opts = {}) {
        const g = geom(opts.n);
        const vb = opts.vb || `0 0 ${W} ${H}`;
        const cls = opts.cls || 'tbs-svg';
        const birds = [[430, 150], [470, 138], [520, 160], [1000, 110]].map(([x, y]) => `<path d="M${x},${y} q8,-9 16,0 q8,-9 16,0" fill="none" stroke="#5b3a6e" stroke-width="2.2" stroke-linecap="round"/>`).join('');
        const stars = Array.from({ length: 30 }, (_, k) => {
            const r = rnd(k + 3);
            return `<circle cx="${(r() * 1366).toFixed(0)}" cy="${(r() * 110).toFixed(0)}" r="${(0.8 + r() * 1.4).toFixed(1)}" fill="#fff" opacity="${(0.4 + r() * 0.5).toFixed(2)}"/>`;
        }).join('');
        const flowers = Array.from({ length: 22 }, (_, k) => {
            const r = rnd(k + 90);
            const left = k % 2 === 0;
            const x = left ? 20 + r() * 290 : 1050 + r() * 300;
            const y = (left ? 340 + x * 0.02 : 332 - (x - 1050) * 0.01) + 3 + r() * 8;
            return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="2.6" fill="${['#ffd2e0', '#fff1a8', '#ffffff'][k % 3]}"/>`;
        }).join('');
        const back = wavePath(0, 4, 160, 0.6, 120, 1250 + 160, 800);
        const mid = wavePath(10, 3, 112, 2.2, 120, 1250 + 112, 800);
        const foam = waveLine(0, 4, 256, 0.6, 120, 1250 + 256, 16);
        const goalX = g.x0 + SPAN + 68;
        return `<svg class="${cls}" data-uid="${uid}" viewBox="${vb}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${uid}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2467"/><stop offset=".16" stop-color="#6a4399"/><stop offset=".34" stop-color="#d9638c"/><stop offset=".47" stop-color="#ff9f6e"/><stop offset=".55" stop-color="#ffd698"/></linearGradient>
    <radialGradient id="${uid}sun"><stop offset="0" stop-color="#fffbe0"/><stop offset=".35" stop-color="#ffe08a" stop-opacity=".85"/><stop offset="1" stop-color="#ff9a5c" stop-opacity="0"/></radialGradient>
    <linearGradient id="${uid}fjord" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd7a0"/><stop offset=".22" stop-color="#e48b86"/><stop offset=".55" stop-color="#6b4a8c"/><stop offset="1" stop-color="#2b2457"/></linearGradient>
    <linearGradient id="${uid}water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a8aa0"/><stop offset=".35" stop-color="#25607f"/><stop offset="1" stop-color="#15294f"/></linearGradient>
    <linearGradient id="${uid}cliffL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e3236"/><stop offset=".6" stop-color="#b9603e"/><stop offset="1" stop-color="#e49456"/></linearGradient>
    <linearGradient id="${uid}cliffR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#6e3236"/><stop offset=".6" stop-color="#b9603e"/><stop offset="1" stop-color="#e49456"/></linearGradient>
    <linearGradient id="${uid}grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b4c062"/><stop offset="1" stop-color="#5d8a47"/></linearGradient>
    <linearGradient id="${uid}stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe49a"/><stop offset="1" stop-color="#e2a23d"/></linearGradient>
    <radialGradient id="${uid}lamp"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".95"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
    <filter id="${uid}glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="${uid}chan"><rect x="280" y="346" width="810" height="430"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#${uid}sky)"/>${stars}
  <circle cx="790" cy="330" r="230" fill="url(#${uid}sun)"/><circle cx="790" cy="326" r="58" fill="#fff2b8"/><circle cx="790" cy="326" r="58" fill="none" stroke="#ffd36a" stroke-width="3" opacity=".6"/>
  ${cloud(180, 120, 1.4, '#ffb8b8', .55)}${cloud(1180, 170, 1.7, '#ffc6a8', .6)}${cloud(560, 230, 1.1, '#ffd0b0', .75)}${cloud(1010, 250, .9, '#ffe0b8', .8)}${birds}
  <path d="M0,330 L90,292 L170,322 L260,282 L350,330 L440,300 L540,336 L640,306 L760,340 L900,298 L1000,330 L1120,290 L1230,326 L1366,296 V400 H0Z" fill="#8a4f94" opacity=".85"/>
  <path d="M0,350 L120,318 L240,346 L380,314 L520,350 L700,326 L880,352 L1040,320 L1200,348 L1366,322 V420 H0Z" fill="#6a3f86"/>
  <rect x="280" y="346" width="810" height="430" fill="url(#${uid}fjord)"/>
  <g class="tbs-piers"></g>
  <g clip-path="url(#${uid}chan)"><g class="tbs-water" style="transform:translateY(${TIDE_MIN}px)">
    <g class="tbs-wv tbs-wv--a"><path d="${back}" fill="url(#${uid}water)"/></g>
    ${glitter()}
    <g class="tbs-wv tbs-wv--b"><path d="${mid}" fill="#7cc4cf" opacity=".28"/></g>
    <g class="tbs-wv tbs-wv--c"><path d="${foam}" fill="none" stroke="#e6fbff" stroke-width="2.4" opacity=".55"/></g>
  </g></g>
  <path d="M-10,330 C80,322 200,334 330,342 L336,352 C338,380 318,420 326,470 C334,520 306,580 316,640 C320,690 300,730 306,768 L-10,768Z" fill="url(#${uid}cliffL)"/>
  <path d="M40,420 C120,410 200,430 322,418 M20,500 C110,488 220,510 316,498 M0,590 C100,580 210,600 310,588 M0,680 C100,672 200,690 304,676" fill="none" stroke="#5a2630" stroke-width="3" opacity=".22"/>
  <path d="M-10,330 C80,322 200,334 330,342 L333,362 C330,372 322,372 316,364 C300,370 290,362 270,366 C240,360 200,356 160,350 C100,346 50,340 -10,344Z" fill="url(#${uid}grass)"/>
  <path d="M1376,326 C1280,320 1150,330 1032,342 L1028,352 C1026,380 1046,420 1038,470 C1030,520 1058,580 1048,640 C1044,690 1064,730 1058,768 L1376,768Z" fill="url(#${uid}cliffR)"/>
  <path d="M1044,418 C1120,410 1240,430 1376,416 M1050,498 C1130,488 1250,510 1376,498 M1056,588 C1140,580 1260,600 1376,588 M1060,676 C1140,672 1260,690 1376,676" fill="none" stroke="#5a2630" stroke-width="3" opacity=".22"/>
  <path d="M1376,326 C1280,320 1150,330 1032,342 L1029,362 C1034,372 1042,372 1048,364 C1066,370 1080,362 1100,366 C1140,360 1200,354 1260,348 C1310,344 1340,340 1376,342Z" fill="url(#${uid}grass)"/>
  ${flowers}
  ${pine(60, 336, 1.15)}${pine(112, 331, .85)}${pine(244, 342, .7)}${pine(1262, 330, 1.2)}${pine(1318, 326, .9)}${pine(1130, 338, .7)}
  <g transform="translate(${goalX},350)"><rect x="-2" y="-92" width="4" height="92" fill="#5a3a2a"/><path class="tbs-flag" d="M2,-92 L52,-78 L2,-62Z" fill="#e63946" stroke="#9d1d2b" stroke-width="2" stroke-linejoin="round"/><path d="M20,-80 l3,6 6,1 -4.500,4 1,6 -5.500,-3 -5.500,3 1,-6 -4.500,-4 6,-1z" fill="#fff" transform="scale(.9) translate(2,-2)"/></g>
  <g transform="translate(${g.x0 - 68},342)"><rect x="-2" y="-52" width="4" height="52" fill="#5a3a2a"/><path d="M2,-52 L34,-43 L2,-33Z" fill="#ffd23f" stroke="#a87812" stroke-width="2" stroke-linejoin="round"/></g>
  <g class="tbs-units"></g>
  <g class="tbs-fx"></g>
</svg>`;
    }

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
        const g = geom(s.n);
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
        const water = svg.querySelector('.tbs-water');
        if (water && s.ratio != null) water.style.transform = `translateY(${tideY(s.ratio).toFixed(1)}px)`;
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

    global.TideBridgeScene = { bridgeSvg, beachSvg, updateBridge, tideY, geom, W, H };
})(typeof window !== 'undefined' ? window : globalThis);
