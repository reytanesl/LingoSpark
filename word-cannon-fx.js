/* Word Cannon Battle: procedural art, canvas effects and synthesised sound.
 * window.WCFX. No image or audio files: islands, forts, cannons, flags, sea and
 * sky are SVG; cannonballs, smoke, explosions, splashes, rain, lightning and
 * confetti are drawn on a canvas. Coordinates follow the 1920x1080 concept. */
(function () {
    'use strict';
    const WCFX = {};
    window.WCFX = WCFX;

    WCFX.reduced = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // Concept geometry (1920x1080 stage).
    const G = {
        red: { muzzle: { x: 590, y: 612 }, fort: { x: 272, y: 590 }, pole: { x: 228, base: 482, top: 236 }, hit: { x: 285, y: 575 }, bar: { x: 180, y: 403 }, sea: { x: 760, y: 820 } },
        blue: { muzzle: { x: 1360, y: 640 }, fort: { x: 1640, y: 610 }, pole: { x: 1642, base: 505, top: 255 }, hit: { x: 1640, y: 600 }, bar: { x: 1400, y: 415 }, sea: { x: 1150, y: 830 } },
        horizon: 640,
    };
    WCFX.G = G;
    WCFX.TEAM = {
        red: { light: '#ff6b6b', main: '#d62828', dark: '#7a0f0f', label: 'RED' },
        blue: { light: '#7fc8ff', main: '#2f6bff', dark: '#0f2a7a', label: 'BLUE' },
    };
    WCFX.CONFETTI = ['#ff4d4d', '#ffd23f', '#2f6bff', '#22b357', '#7fd1ff', '#ff8c1a', '#ffffff'];

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    WCFX.esc = esc;

    function seeded(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    WCFX.seeded = seeded;
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp01 = (t) => Math.max(0, Math.min(1, t));
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const easeIn = (t) => t * t * t;
    const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    WCFX.easeOut = easeOut;
    WCFX.easeIO = easeIO;

    // ------------------------------------------------------------------
    // SVG art
    // ------------------------------------------------------------------
    const STAR = 'M0,-16 L4.1,-5.7 15.2,-4.9 6.7,2.2 9.4,12.9 0,7 -9.4,12.9 -6.7,2.2 -15.2,-4.9 -4.1,-5.7Z';
    WCFX.STAR = STAR;

    function cloud(x, y, s, { shade = '#d3e9fa', fill = '#ffffff', cls = '' } = {}) {
        const blobs = [[0, 0, 60], [62, -22, 70], [130, -6, 58], [182, 14, 42], [-52, 16, 40], [92, 22, 48], [30, 24, 46]];
        const c = blobs.map(([bx, by, r]) => `<circle cx="${bx}" cy="${by}" r="${r}"/>`).join('');
        return `<g transform="translate(${x} ${y}) scale(${s})"><g class="wc-cloud ${cls}">
            <g fill="${shade}" transform="translate(6 12)">${c}</g>
            <g fill="${fill}">${c}</g>
            <ellipse cx="60" cy="40" rx="150" ry="18" fill="${shade}" opacity="0.7"/>
            <g fill="#ffffff" opacity="0.85"><circle cx="40" cy="-30" r="22"/><circle cx="90" cy="-50" r="16"/></g>
        </g></g>`;
    }

    function palm(x, y, h, lean, s = 1, rnd = Math.random) {
        // Curved trunk from (x,y) up to the crown; fronds drawn as tapered leaves.
        const topX = x + lean;
        const topY = y - h;
        const segs = 9;
        let trunk = '';
        for (let i = 0; i < segs; i++) {
            const t0 = i / segs;
            const t1 = (i + 1) / segs;
            const px = (t) => x + lean * Math.pow(t, 1.6);
            const py = (t) => y - h * t;
            const w0 = lerp(17, 9, t0) * s;
            const w1 = lerp(17, 9, t1) * s;
            trunk += `<path d="M${px(t0) - w0},${py(t0)} L${px(t1) - w1},${py(t1) + 2} L${px(t1) + w1},${py(t1) + 2} L${px(t0) + w0},${py(t0)}Z" fill="${i % 2 ? '#a0693a' : '#8a5a30'}" stroke="#5e3b1c" stroke-width="2"/>`;
        }
        const fronds = [];
        const angles = [-170, -140, -110, -70, -40, -10, 15, 200];
        angles.forEach((a, i) => {
            const len = (95 + rnd() * 30) * s;
            const rad = (a * Math.PI) / 180;
            const ex = topX + Math.cos(rad) * len;
            const ey = topY + Math.sin(rad) * len * 0.55 + len * 0.35;
            const cx = topX + Math.cos(rad) * len * 0.5;
            const cy = topY + Math.sin(rad) * len * 0.5 - 30 * s;
            const nx = -Math.sin(rad) * 16 * s;
            const ny = Math.cos(rad) * 10 * s;
            fronds.push(`<path d="M${topX},${topY} Q${cx + nx},${cy + ny} ${ex},${ey} Q${cx - nx * 0.4},${cy - ny * 0.4 + 14 * s} ${topX},${topY}Z" fill="${i % 2 ? '#3f9a2f' : '#57b83c'}" stroke="#2a6b1f" stroke-width="2.5"/>`);
            fronds.push(`<path d="M${topX},${topY} Q${cx},${cy} ${ex},${ey}" fill="none" stroke="#2a6b1f" stroke-width="2" opacity="0.7"/>`);
        });
        return `<g class="wc-palm">${trunk}<g class="wc-palm-crown" style="transform-origin:${topX}px ${topY}px">${fronds.join('')}
            <circle cx="${topX - 6}" cy="${topY + 8}" r="${8 * s}" fill="#6b4a22"/><circle cx="${topX + 7}" cy="${topY + 10}" r="${8 * s}" fill="#7d5628"/></g></g>`;
    }

    function bush(x, y, s, tone = 0) {
        const greens = [['#4caf3a', '#2f7d24', '#7bd35a'], ['#3e9b34', '#2a6e22', '#6cc24f']][tone % 2];
        return `<g transform="translate(${x} ${y}) scale(${s})">
            <path d="M-60,10 Q-70,-30 -35,-38 Q-25,-70 8,-58 Q35,-78 55,-48 Q85,-40 72,-5 Q70,14 40,14 L-45,14Z" fill="${greens[0]}" stroke="${greens[1]}" stroke-width="4"/>
            <path d="M-38,-30 Q-20,-50 0,-44 M18,-52 Q35,-62 48,-40" stroke="${greens[2]}" stroke-width="5" fill="none" stroke-linecap="round"/>
            <path d="M-50,0 L-62,-22 M-20,8 L-26,-30 M10,8 L8,-36 M40,6 L52,-28" stroke="${greens[1]}" stroke-width="3" opacity="0.6"/>
        </g>`;
    }

    function rocksStrata(x0, x1, yTop, yBot, rnd, cols) {
        let out = '';
        for (let i = 0; i < 14; i++) {
            const x = lerp(x0, x1, rnd());
            const y = lerp(yTop + 10, yBot - 10, rnd());
            const w = 40 + rnd() * 90;
            const h = 10 + rnd() * 16;
            out += `<path d="M${x},${y} q${w * 0.3},-${h} ${w},-${h * 0.4} q-${w * 0.2},${h * 1.2} -${w},${h * 0.4}Z" fill="${cols[i % cols.length]}" opacity="0.75"/>`;
        }
        return out;
    }

    function island(side) {
        const rnd = seeded(side === 'red' ? 11 : 23);
        const rocks = ['#b39373', '#6a503b', '#a3855f', '#c2a37f'];
        if (side === 'red') {
            return `<g class="wc-island wc-island--red">
                <ellipse cx="330" cy="900" rx="440" ry="40" fill="#c8f6ff" opacity="0.6" class="wc-foam"/>
                <path d="M-40,705 C60,668 200,650 330,660 C470,668 600,676 690,712 C735,732 748,790 724,830 C702,868 640,890 560,900 C420,918 200,912 60,904 L-40,904Z" fill="#9b7b5c" stroke="#4f3a2a" stroke-width="6"/>
                <path d="M-40,800 C120,812 330,818 520,812 C620,808 690,806 735,800 C740,816 734,826 724,834 C702,870 640,890 560,900 C420,918 200,912 60,904 L-40,904Z" fill="#7a5e46"/>
                ${rocksStrata(-30, 700, 812, 896, rnd, rocks)}
                <path d="M-40,705 C60,668 200,650 330,660 C470,668 600,676 690,712 C722,726 736,752 728,780 C640,792 500,798 340,800 C190,802 60,798 -40,792Z" fill="#e9d199" stroke="#b9975c" stroke-width="4"/>
                <path d="M-40,780 C100,790 300,792 480,788 C600,786 680,782 728,778 L726,786 C640,796 500,802 340,804 C190,806 60,802 -40,798Z" fill="#cdb078"/>
                <path d="M-40,718 C40,690 140,676 236,680 C196,700 104,714 -40,736Z" fill="#5fb045"/>
                <path d="M520,684 C580,682 640,692 684,712 C640,718 570,712 520,700Z" fill="#5fb045"/>
                <path d="M610,850 q30,-10 60,4 M520,880 q40,-12 80,0 M40,860 q50,-14 100,0 M300,872 q40,-10 80,2" stroke="#45311f" stroke-width="5" fill="none" opacity="0.5"/>
            </g>`;
        }
        return `<g class="wc-island wc-island--blue">
            <ellipse cx="1610" cy="910" rx="430" ry="38" fill="#c8f6ff" opacity="0.6" class="wc-foam"/>
            <path d="M1960,722 C1860,690 1720,682 1600,690 C1460,698 1330,708 1260,740 C1215,760 1205,812 1228,848 C1250,880 1310,898 1400,906 C1550,920 1760,914 1960,908Z" fill="#9b7b5c" stroke="#4f3a2a" stroke-width="6"/>
            <path d="M1960,820 C1800,828 1600,832 1440,828 C1340,826 1260,824 1218,818 C1214,830 1220,840 1228,848 C1250,880 1310,898 1400,906 C1550,920 1760,914 1960,908Z" fill="#7a5e46"/>
            ${rocksStrata(1230, 1950, 830, 902, rnd, rocks)}
            <path d="M1960,722 C1860,690 1720,682 1600,690 C1460,698 1330,708 1260,740 C1236,752 1226,772 1232,796 C1320,808 1460,814 1620,814 C1760,814 1880,812 1960,808Z" fill="#e9d199" stroke="#b9975c" stroke-width="4"/>
            <path d="M1232,796 C1320,808 1460,814 1620,814 C1760,814 1880,812 1960,808 L1960,816 C1880,820 1760,822 1620,822 C1460,822 1320,816 1234,804Z" fill="#cdb078"/>
            <path d="M1960,734 C1880,712 1790,704 1700,708 C1760,724 1850,738 1960,750Z" fill="#5fb045"/>
            <path d="M1270,736 C1320,716 1390,706 1450,708 C1404,724 1330,734 1270,746Z" fill="#5fb045"/>
            <path d="M1250,850 q30,-10 60,4 M1400,880 q40,-12 80,0 M1760,872 q50,-14 100,0" stroke="#45311f" stroke-width="5" fill="none" opacity="0.5"/>
        </g>`;
    }

    /** Sky, sea, clouds, distant islands, gulls, islands and palms. */
    WCFX.sceneBgSvg = function sceneBgSvg() {
        const rnd = seeded(5);
        let sparkles = '';
        for (let i = 0; i < 70; i++) {
            const y = lerp(G.horizon + 8, 1060, Math.pow(rnd(), 1.3));
            const x = 300 + rnd() * 1320;
            const w = lerp(14, 70, (y - G.horizon) / 440);
            sparkles += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${lerp(2, 5, (y - G.horizon) / 440).toFixed(1)}" rx="2" fill="#e6fbff" opacity="${(0.25 + rnd() * 0.5).toFixed(2)}" class="wc-glint" style="animation-delay:${(-rnd() * 4).toFixed(2)}s"/>`;
        }
        let waves = '';
        for (let i = 0; i < 26; i++) {
            const y = lerp(G.horizon + 30, 1070, rnd());
            const x = rnd() * 1920;
            const w = lerp(40, 140, (y - G.horizon) / 440);
            waves += `<path d="M${x},${y} q${w / 4},-${w / 10} ${w / 2},0 t${w / 2},0" stroke="#0b6db8" stroke-width="${lerp(2, 5, (y - G.horizon) / 440).toFixed(1)}" fill="none" opacity="0.35"/>`;
        }
        return `<svg class="wc-bg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
                <linearGradient id="wcSky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#2f8fe6"/><stop offset="0.45" stop-color="#6dbdf5"/><stop offset="1" stop-color="#d3f0ff"/>
                </linearGradient>
                <linearGradient id="wcSea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#7fdcf5"/><stop offset="0.12" stop-color="#3fc0ec"/><stop offset="0.5" stop-color="#159be0"/><stop offset="1" stop-color="#0866b3"/>
                </linearGradient>
                <radialGradient id="wcSun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fffbe0" stop-opacity="0.9"/><stop offset="1" stop-color="#fffbe0" stop-opacity="0"/></radialGradient>
                <linearGradient id="wcGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
            </defs>
            <rect width="1920" height="${G.horizon + 2}" fill="url(#wcSky)"/>
            <circle cx="980" cy="560" r="420" fill="url(#wcSun)" opacity="0.65"/>
            <g class="wc-clouds-far" opacity="0.9">
                ${cloud(560, 170, 0.55)}${cloud(1160, 410, 0.45)}${cloud(1330, 250, 0.5)}${cloud(1700, 120, 0.5)}
            </g>
            <g class="wc-clouds-near">${cloud(60, 250, 0.95)}${cloud(1820, 340, 0.8)}${cloud(840, 470, 0.5)}</g>
            <path d="M1560,${G.horizon} L1640,598 L1700,612 L1770,584 L1850,606 L1920,596 L1920,${G.horizon}Z" fill="#8fbccd" opacity="0.75"/>
            <path d="M0,${G.horizon} L60,606 L140,616 L210,600 L300,${G.horizon}Z" fill="#8fbccd" opacity="0.65"/>
            <g class="wc-gulls" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round">
                <path class="wc-gull" d="M1360,118 q14,-14 26,0 q12,-14 26,0"/>
                <path class="wc-gull wc-gull--b" d="M505,370 q9,-9 17,0 q8,-9 17,0" stroke-width="4"/>
                <path class="wc-gull wc-gull--c" d="M1500,190 q8,-8 15,0 q7,-8 15,0" stroke-width="3.5"/>
            </g>
            <rect y="${G.horizon}" width="1920" height="${1080 - G.horizon}" fill="url(#wcSea)"/>
            <rect y="${G.horizon}" width="1920" height="40" fill="url(#wcGlow)"/>
            <g class="wc-waves">${waves}</g>
            <g class="wc-glints">${sparkles}</g>
            ${island('red')}${island('blue')}
            ${palm(110, 790, 400, -55, 1.05, seeded(3))}
            ${palm(470, 700, 190, 34, 0.78, seeded(4))}
            ${palm(1830, 800, 350, 46, 1, seeded(6))}
            ${palm(1430, 736, 180, -30, 0.74, seeded(7))}
        </svg>`;
    };

    /** Foreground bushes on the island fronts (in front of forts and cannons). */
    WCFX.sceneFgSvg = function sceneFgSvg() {
        return `<svg class="wc-fg" viewBox="0 0 1920 1080" aria-hidden="true">
            ${bush(50, 800, 1.0, 0)}${bush(215, 806, 0.72, 1)}${bush(660, 790, 0.62, 0)}${bush(560, 808, 0.5, 1)}
            ${bush(1285, 806, 0.66, 1)}${bush(1530, 822, 0.58, 0)}${bush(1860, 812, 1.0, 1)}${bush(1700, 824, 0.6, 0)}
        </svg>`;
    };

    function bricks(x0, y0, w, h, bw, bh, col) {
        let out = '';
        for (let r = 0, y = y0; y < y0 + h - 2; r++, y += bh) {
            out += `<line x1="${x0}" y1="${y}" x2="${x0 + w}" y2="${y}" stroke="${col}" stroke-width="2.4"/>`;
            for (let x = x0 + (r % 2 ? bw / 2 : 0); x < x0 + w; x += bw) {
                out += `<line x1="${x}" y1="${y}" x2="${x}" y2="${Math.min(y + bh, y0 + h)}" stroke="${col}" stroke-width="2.4"/>`;
            }
        }
        return out;
    }

    function merlons(x0, y, count, w, gap, h, fill, stroke) {
        let out = '';
        for (let i = 0; i < count; i++) {
            const x = x0 + i * (w + gap);
            out += `<rect class="wc-merlon wc-merlon--${i}" x="${x}" y="${y - h}" width="${w}" height="${h + 4}" fill="${fill}" stroke="${stroke}" stroke-width="4" rx="2"/>`;
        }
        return out;
    }

    function stones(x0, y0, w, h, rnd) {
        let out = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#9a958e" stroke="#4d4a46" stroke-width="4" rx="4"/>`;
        const rows = 2;
        for (let r = 0; r < rows; r++) {
            let x = x0 + 4;
            const y = y0 + 4 + r * ((h - 8) / rows);
            while (x < x0 + w - 8) {
                const sw = 26 + rnd() * 26;
                const ww = Math.min(sw, x0 + w - 4 - x);
                out += `<rect x="${x}" y="${y}" width="${ww - 3}" height="${(h - 8) / rows - 3}" rx="5" fill="${['#b5b0a8', '#a39e96', '#8c877f', '#c4bfb7'][Math.floor(rnd() * 4)]}" stroke="#5d5953" stroke-width="2"/>`;
                x += ww;
            }
        }
        return out;
    }

    function cracks(cls, paths) {
        return `<g class="${cls}" fill="none" stroke="#2a1410" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${paths.map((d) => `<path d="${d}"/>`).join('')}</g>`;
    }

    /** Red brick fort (local 0..320 x 0..260). */
    WCFX.redFortSvg = function redFortSvg() {
        const rnd = seeded(31);
        return `<svg class="wc-fort-svg" viewBox="0 0 320 260" aria-hidden="true">
            <g class="wc-fort-body">
                ${stones(18, 200, 290, 52, rnd)}
                <!-- left tower -->
                <rect x="20" y="70" width="70" height="135" fill="#c63b2b" stroke="#5e1a12" stroke-width="5"/>
                <g clip-path="url(#wcClipTowerR)">${bricks(20, 70, 70, 135, 26, 15, '#92281c')}</g>
                <clipPath id="wcClipTowerR"><rect x="20" y="70" width="70" height="135"/></clipPath>
                ${merlons(16, 70, 3, 20, 7, 22, '#d24a38', '#5e1a12')}
                <rect x="40" y="110" width="14" height="30" rx="7" fill="#3a1610"/>
                <!-- main keep -->
                <rect x="78" y="58" width="222" height="147" fill="#d0412f" stroke="#5e1a12" stroke-width="5"/>
                <g clip-path="url(#wcClipKeepR)">${bricks(78, 58, 222, 147, 30, 16, '#9a2a1e')}</g>
                <clipPath id="wcClipKeepR"><rect x="78" y="58" width="222" height="147"/></clipPath>
                <rect x="78" y="58" width="222" height="14" fill="#e45a46" opacity="0.6"/>
                ${merlons(74, 58, 7, 24, 9.5, 26, '#de5240', '#5e1a12')}
                <rect x="72" y="50" width="234" height="12" fill="#b1321f" stroke="#5e1a12" stroke-width="4"/>
                <!-- arched gate -->
                <path d="M178,205 L178,140 Q178,104 214,104 Q250,104 250,140 L250,205Z" fill="#e2b86a" stroke="#6b4a1e" stroke-width="5"/>
                <path d="M190,205 L190,144 Q190,118 214,118 Q238,118 238,144 L238,205Z" fill="#3b1c10"/>
                <path d="M196,205 L196,148 Q196,126 214,126 Q232,126 232,148 L232,205Z" fill="#8a5a2b" stroke="#4a2c12" stroke-width="3"/>
                <path d="M208,130 L208,205 M220,128 L220,205" stroke="#5e3a18" stroke-width="3"/>
                <circle cx="226" cy="170" r="3.5" fill="#ffd23f"/>
                <!-- windows -->
                <rect x="104" y="92" width="34" height="34" rx="4" fill="#e2b86a" stroke="#6b4a1e" stroke-width="4"/>
                <rect x="111" y="99" width="20" height="20" fill="#3b1c10"/>
                <rect x="262" y="92" width="26" height="40" rx="12" fill="#3b1c10" stroke="#6b4a1e" stroke-width="4"/>
                <!-- gold trim studs -->
                <g fill="#ffd23f" stroke="#8a5a10" stroke-width="2"><circle cx="86" cy="196" r="5"/><circle cx="292" cy="196" r="5"/><circle cx="86" cy="66" r="5"/><circle cx="292" cy="66" r="5"/></g>
            </g>
            ${cracks('wc-dmg wc-dmg-1', ['M120,60 l10,22 -8,16 12,20', 'M280,150 l-14,10 4,18', 'M60,90 l8,14 -6,12'])}
            ${cracks('wc-dmg wc-dmg-2', ['M150,140 l16,14 -6,20 14,16', 'M95,170 l18,-8 10,14', 'M250,70 l-10,26 12,18 -6,22', 'M40,160 l12,10'])}
            <g class="wc-dmg wc-dmg-2" fill="#2a1410" opacity="0.55"><circle cx="130" cy="150" r="16"/><circle cx="270" cy="100" r="12"/><circle cx="60" cy="120" r="10"/></g>
            <g class="wc-dmg wc-dmg-3"><path d="M78,58 L110,90 L140,62 L175,100 L210,66 L245,98 L300,58 L300,205 L78,205Z" fill="#1d0d08" opacity="0.45"/></g>
        </svg>`;
    };

    /** Blue fort with wooden beams (local 0..340 x 0..260). */
    WCFX.blueFortSvg = function blueFortSvg() {
        const rnd = seeded(37);
        const planks = (x0, y0, w, h) => {
            let out = '';
            for (let y = y0 + 18; y < y0 + h; y += 18) out += `<line x1="${x0}" y1="${y}" x2="${x0 + w}" y2="${y}" stroke="#1d3f8f" stroke-width="2.5"/>`;
            return out;
        };
        return `<svg class="wc-fort-svg" viewBox="0 0 340 260" aria-hidden="true">
            <g class="wc-fort-body">
                ${stones(14, 200, 312, 52, rnd)}
                <!-- right tower -->
                <rect x="250" y="80" width="74" height="125" fill="#2f63c9" stroke="#0f2a6b" stroke-width="5"/>
                ${planks(250, 80, 74, 125)}
                <rect x="244" y="70" width="86" height="16" fill="#9c6a35" stroke="#4a2c12" stroke-width="4"/>
                ${merlons(246, 70, 3, 22, 7, 20, '#a87440', '#4a2c12')}
                <rect x="276" y="116" width="20" height="32" rx="4" fill="#0d1c40" stroke="#4a2c12" stroke-width="3"/>
                <!-- main hall -->
                <rect x="24" y="62" width="236" height="143" fill="#3672d8" stroke="#0f2a6b" stroke-width="5"/>
                ${planks(24, 62, 236, 143)}
                <rect x="24" y="62" width="236" height="12" fill="#5b8ff0" opacity="0.55"/>
                <!-- timber frame -->
                <g fill="#a46f3a" stroke="#4a2c12" stroke-width="4">
                    <rect x="18" y="50" width="248" height="18"/>
                    <rect x="20" y="62" width="14" height="143"/><rect x="250" y="62" width="14" height="143"/>
                    <rect x="130" y="62" width="12" height="143"/>
                    <rect x="20" y="130" width="244" height="11"/>
                </g>
                ${merlons(20, 50, 7, 24, 12, 22, '#b07a44', '#4a2c12')}
                <g fill="#ffd23f" stroke="#8a5a10" stroke-width="2"><circle cx="27" cy="59" r="4.5"/><circle cx="257" cy="59" r="4.5"/><circle cx="136" cy="59" r="4.5"/><circle cx="27" cy="136" r="4"/><circle cx="257" cy="136" r="4"/></g>
                <!-- doorway -->
                <path d="M160,205 L160,150 L222,150 L222,205Z" fill="#c99a5a" stroke="#4a2c12" stroke-width="5"/>
                <rect x="170" y="160" width="42" height="45" fill="#2a1a0e"/>
                <rect x="174" y="164" width="34" height="41" fill="#7a4e24" stroke="#3a2210" stroke-width="3"/>
                <!-- windows -->
                <rect x="52" y="84" width="40" height="34" fill="#c99a5a" stroke="#4a2c12" stroke-width="4"/>
                <rect x="59" y="91" width="26" height="20" fill="#0d1c40"/>
                <rect x="170" y="84" width="40" height="34" fill="#c99a5a" stroke="#4a2c12" stroke-width="4"/>
                <rect x="177" y="91" width="26" height="20" fill="#0d1c40"/>
                <rect x="56" y="150" width="48" height="30" rx="3" fill="#9c6a35" stroke="#4a2c12" stroke-width="3"/>
                <text x="80" y="171" text-anchor="middle" font-family="Lilita One, sans-serif" font-size="15" fill="#3a2210">INN</text>
            </g>
            ${cracks('wc-dmg wc-dmg-1', ['M90,70 l10,22 -8,16 12,20', 'M230,150 l-14,10 4,18', 'M300,90 l-8,14 6,12'])}
            ${cracks('wc-dmg wc-dmg-2', ['M120,140 l16,14 -6,20 14,16', 'M60,175 l18,-8 10,14', 'M210,70 l-10,26 12,18 -6,22', 'M290,160 l-12,10'])}
            <g class="wc-dmg wc-dmg-2" fill="#0a1124" opacity="0.55"><circle cx="100" cy="160" r="16"/><circle cx="200" cy="100" r="12"/><circle cx="290" cy="120" r="10"/></g>
            <g class="wc-dmg wc-dmg-3"><path d="M24,62 L60,96 L95,64 L130,104 L170,66 L210,100 L260,62 L260,205 L24,205Z" fill="#050a18" opacity="0.45"/></g>
        </svg>`;
    };

    /** Cannon on a wooden carriage. Local 0..300 x 0..220, muzzle at (288, 66) for red; mirrored for blue. */
    WCFX.cannonSvg = function cannonSvg(team) {
        const blue = team === 'blue';
        const id = blue ? 'B' : 'R';
        // Brighter, fully opaque metal so guns stay solid over sea + storm wash.
        const barrel = blue
            ? ['#8eb6ff', '#3d6df0', '#1a3a9e']
            : ['#8a909c', '#3a3f4a', '#15181f'];
        const under = blue ? '#2548b0' : '#2c313a';
        const art = `
            <defs>
                <linearGradient id="wcBarrel${id}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="${barrel[0]}"/><stop offset="0.38" stop-color="${barrel[1]}"/><stop offset="1" stop-color="${barrel[2]}"/>
                </linearGradient>
                <linearGradient id="wcGold${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe58a"/><stop offset="0.5" stop-color="#e0a92e"/><stop offset="1" stop-color="#8a5a10"/></linearGradient>
                <linearGradient id="wcWood${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8894a"/><stop offset="1" stop-color="#7a4a20"/></linearGradient>
            </defs>
            <!-- solid underpaint so the gun never reads as see-through -->
            <ellipse cx="140" cy="160" rx="118" ry="58" fill="${under}"/>
            <ellipse cx="140" cy="210" rx="120" ry="12" fill="#000" opacity="0.35"/>
            <!-- carriage -->
            <path d="M40,150 L70,110 L190,110 L215,150 L215,178 L40,178Z" fill="url(#wcWood${id})" stroke="#3e2410" stroke-width="5" stroke-linejoin="round"/>
            <path d="M52,160 L205,160" stroke="#4a2c12" stroke-width="3"/>
            <g fill="url(#wcGold${id})" stroke="#6b4a10" stroke-width="2"><circle cx="64" cy="168" r="5"/><circle cx="196" cy="168" r="5"/><circle cx="130" cy="168" r="5"/></g>
            <!-- barrel (pivot ~ (120,100)) -->
            <g class="wc-barrel" transform="rotate(-11 120 100)">
                <path d="M32,72 Q14,100 32,128 L60,130 L262,116 L262,84 L60,70Z" fill="url(#wcBarrel${id})" stroke="#05060a" stroke-width="5" stroke-linejoin="round"/>
                <circle cx="24" cy="100" r="14" fill="url(#wcBarrel${id})" stroke="#05060a" stroke-width="5"/>
                <rect x="250" y="76" width="30" height="48" rx="8" fill="url(#wcBarrel${id})" stroke="#05060a" stroke-width="5"/>
                <ellipse cx="282" cy="100" rx="9" ry="21" fill="#05060a"/>
                <rect x="60" y="68" width="14" height="64" rx="3" fill="url(#wcGold${id})" stroke="#6b4a10" stroke-width="3"/>
                <rect x="150" y="74" width="12" height="54" rx="3" fill="url(#wcGold${id})" stroke="#6b4a10" stroke-width="3"/>
                <rect x="244" y="78" width="10" height="44" rx="3" fill="url(#wcGold${id})" stroke="#6b4a10" stroke-width="3"/>
                <path d="M70,80 L250,88" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.35"/>
                <circle cx="118" cy="104" r="11" fill="url(#wcGold${id})" stroke="#6b4a10" stroke-width="3"/>
            </g>
            <!-- wheels -->
            ${[[78, 172, 36], [180, 176, 32]].map(([cx, cy, r]) => `
                <g class="wc-wheel" style="transform-origin:${cx}px ${cy}px">
                    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#8a5a2b" stroke="#3e2410" stroke-width="5"/>
                    <circle cx="${cx}" cy="${cy}" r="${r - 9}" fill="none" stroke="#5e3a18" stroke-width="4"/>
                    ${[0, 45, 90, 135].map((a) => `<line x1="${cx + Math.cos(a * Math.PI / 180) * (r - 6)}" y1="${cy + Math.sin(a * Math.PI / 180) * (r - 6)}" x2="${cx - Math.cos(a * Math.PI / 180) * (r - 6)}" y2="${cy - Math.sin(a * Math.PI / 180) * (r - 6)}" stroke="#4a2c12" stroke-width="4"/>`).join('')}
                    <circle cx="${cx}" cy="${cy}" r="9" fill="url(#wcGold${id})" stroke="#6b4a10" stroke-width="3"/>
                </g>`).join('')}`;
        return `<svg class="wc-cannon-svg" viewBox="0 0 300 220" aria-hidden="true">${blue ? `<g transform="translate(300 0) scale(-1 1)">${art}</g>` : art}</svg>`;
    };
    // Muzzle point in the cannon's local box (after the -11deg barrel tilt).
    WCFX.CANNON_MUZZLE = (() => {
        const a = (-11 * Math.PI) / 180;
        const dx = 286 - 120;
        const dy = 0;
        return { x: 120 + dx * Math.cos(a) - dy * Math.sin(a), y: 100 + dx * Math.sin(a) + dy * Math.cos(a) };
    })();

    /** Flag on a pole. Local box 0..240 x 0..300: pole at x=14, flag to the right.
     *  Plain solid team colour (no emblem). Inline fills — avoid shared gradient IDs
     *  so Red stays red and Blue stays blue when both SVGs are on the same page. */
    WCFX.flagSvg = function flagSvg(team) {
        const c = WCFX.TEAM[team] || WCFX.TEAM.red;
        const fill = c.main;
        const stroke = c.dark;
        const poleId = `wcPole_${team}`;
        return `<svg class="wc-flag-svg" viewBox="0 0 240 300" aria-hidden="true">
            <defs><linearGradient id="${poleId}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff2b3"/><stop offset="0.5" stop-color="#d8a63a"/><stop offset="1" stop-color="#8a5a10"/></linearGradient></defs>
            <rect x="9" y="12" width="11" height="288" rx="4" fill="url(#${poleId})" stroke="#5e3a08" stroke-width="3"/>
            <circle cx="14.5" cy="11" r="11" fill="#ffd23f" stroke="#8a5a10" stroke-width="3"/>
            <g class="wc-flag-cloth">
                <path class="wc-flag-wave" d="M20,22 C70,8 110,36 160,22 C185,15 205,18 225,24 L225,138 C205,132 185,129 160,136 C110,150 70,122 20,136Z" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
                <path d="M20,22 C70,8 110,36 160,22 C185,15 205,18 225,24 L225,40 C205,34 185,31 160,38 C110,52 70,24 20,38Z" fill="#ffffff" opacity="0.18"/>
            </g>
        </svg>`;
    };

    /** Dark storm cloud band across the top. */
    WCFX.stormCloudsSvg = function stormCloudsSvg() {
        const rnd = seeded(77);
        let blobs = '';
        for (let i = 0; i < 34; i++) {
            const x = -60 + i * 62 + rnd() * 30;
            const y = 40 + rnd() * 70;
            const r = 60 + rnd() * 60;
            blobs += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(0)}"/>`;
        }
        let low = '';
        for (let i = 0; i < 22; i++) {
            const x = -40 + i * 95 + rnd() * 40;
            const y = 150 + rnd() * 60;
            const r = 40 + rnd() * 45;
            low += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(0)}"/>`;
        }
        return `<svg class="wc-storm-clouds" viewBox="0 0 1920 300" preserveAspectRatio="none" aria-hidden="true">
            <g fill="#4a4e72" opacity="0.92">${low}</g>
            <g fill="#2e3150">${blobs}</g>
            <g fill="#5d6390" opacity="0.55" transform="translate(0 -18)">${blobs}</g>
        </svg>`;
    };

    WCFX.ballSvg = function ballSvg() {
        return '<svg viewBox="-20 -20 40 40" aria-hidden="true"><defs><radialGradient id="wcBallG" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#9aa0ad"/><stop offset="0.35" stop-color="#3b3f49"/><stop offset="1" stop-color="#050608"/></radialGradient></defs><circle r="17" fill="url(#wcBallG)" stroke="#000" stroke-width="2"/><ellipse cx="-6" cy="-7" rx="5" ry="3.5" fill="#fff" opacity="0.55"/></svg>';
    };

    WCFX.stormIconSvg = function stormIconSvg() {
        return '<svg viewBox="0 0 64 56" aria-hidden="true"><path d="M14,40 Q2,40 4,29 Q6,19 17,20 Q20,6 35,7 Q48,8 50,20 Q62,20 61,31 Q60,40 50,40Z" fill="#dfe6ff" stroke="#8d97c9" stroke-width="3"/><path d="M33,30 L24,46 L32,46 L27,56 L42,39 L34,39 L39,30Z" fill="#ffd23f" stroke="#a8740a" stroke-width="2"/></svg>';
    };

    WCFX.logoHtml = function logoHtml(cls = '') {
        return `<div class="wc-logo ${cls}">Lingo<span>Spark</span><svg viewBox="-16 -16 32 32" aria-hidden="true"><path d="${STAR}" fill="#ffd23f"/></svg></div>`;
    };

    WCFX.titleHtml = function titleHtml(lines = ['WORD CANNON', 'BATTLE'], cls = '') {
        return `<div class="wc-title ${cls}">${lines.map((l, i) => `<span class="wc-title-line" style="animation-delay:${(0.1 + i * 0.18).toFixed(2)}s" data-text="${esc(l)}">${esc(l)}</span>`).join('')}</div>`;
    };

    /** Mount the full scene (bg, flags, forts, cannons, fg) into a container sized 1920x1080. */
    WCFX.mountScene = function mountScene(el) {
        if (!el || el.dataset.wcScene) return;
        el.dataset.wcScene = '1';
        el.innerHTML = `
            ${WCFX.sceneBgSvg()}
            <div class="wc-flag wc-flag--red" data-team="red">${WCFX.flagSvg('red')}</div>
            <div class="wc-flag wc-flag--blue" data-team="blue">${WCFX.flagSvg('blue')}</div>
            <div class="wc-fort wc-fort--red" data-team="red">${WCFX.redFortSvg()}</div>
            <div class="wc-fort wc-fort--blue" data-team="blue">${WCFX.blueFortSvg()}</div>
            <div class="wc-cannon wc-cannon--red" data-team="red">${WCFX.cannonSvg('red')}</div>
            <div class="wc-cannon wc-cannon--blue" data-team="blue">${WCFX.cannonSvg('blue')}</div>
            ${WCFX.sceneFgSvg()}
            <div class="wc-storm-tint"></div>
            <div class="wc-storm-top">${WCFX.stormCloudsSvg()}</div>`;
    };

    WCFX.setFortDamage = function setFortDamage(root, team, hp) {
        const fort = root?.querySelector(`.wc-fort--${team}`);
        if (!fort) return;
        const lvl = hp <= 0 ? 3 : hp <= 35 ? 2 : hp <= 70 ? 1 : 0;
        fort.dataset.dmg = String(lvl);
    };

    // ------------------------------------------------------------------
    // Canvas effects
    // ------------------------------------------------------------------
    class FxCanvas {
        constructor(canvas, { width = 1920, height = 1080 } = {}) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.W = width;
            this.H = height;
            canvas.width = width;
            canvas.height = height;
            this.items = [];
            this.rain = null;
            this.raf = null;
            this.flash = 0;
            this.wind = -0.35;
            this.tick = this.tick.bind(this);
        }

        add(item) {
            item.t0 = item.t0 ?? performance.now();
            this.items.push(item);
            this.start();
            return item;
        }

        start() {
            if (!this.raf) this.raf = requestAnimationFrame(this.tick);
        }

        clear() {
            this.items = [];
            this.rain = null;
            this.flash = 0;
            this.ctx.clearRect(0, 0, this.W, this.H);
        }

        setRain(on) {
            if (on && !this.rain) {
                const rnd = seeded(91);
                const n = WCFX.reduced() ? 120 : 420;
                this.rain = Array.from({ length: n }, () => ({
                    x: rnd() * this.W,
                    y: rnd() * this.H,
                    l: 28 + rnd() * 40,
                    v: 30 + rnd() * 28,
                    a: 0.35 + rnd() * 0.4,
                }));
                this.wind = -0.42 - rnd() * 0.18;
                this.start();
            } else if (!on) {
                this.rain = null;
            }
        }

        tick(now) {
            this.raf = null;
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.W, this.H);
            if (this.rain) {
                const still = WCFX.reduced();
                ctx.lineCap = 'round';
                for (const d of this.rain) {
                    if (!still) {
                        d.y += d.v;
                        d.x += d.v * this.wind;
                        if (d.y > this.H) { d.y = -d.l; d.x = Math.random() * (this.W + 400); }
                        if (d.x < -40) d.x += this.W + 80;
                    }
                    ctx.strokeStyle = `rgba(210,225,255,${d.a.toFixed(2)})`;
                    ctx.lineWidth = 2.2 + d.l * 0.02;
                    ctx.beginPath();
                    ctx.moveTo(d.x, d.y);
                    ctx.lineTo(d.x - d.l * this.wind, d.y - d.l);
                    ctx.stroke();
                }
            }
            this.items = this.items.filter((it) => {
                const t = now - it.t0;
                if (t < 0) return true;
                const done = it.draw(ctx, t, now);
                return !done;
            });
            if (this.flash > 0.01) {
                ctx.fillStyle = `rgba(235,240,255,${this.flash.toFixed(3)})`;
                ctx.fillRect(0, 0, this.W, this.H);
                this.flash *= 0.86;
            }
            if (this.items.length || this.rain || this.flash > 0.01) this.raf = requestAnimationFrame(this.tick);
        }
    }
    WCFX.FxCanvas = FxCanvas;

    function drawBall(ctx, x, y, r = 22) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        // Opaque core first so the ball never looks washed out over the sea.
        ctx.fillStyle = '#1a1d24';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
        g.addColorStop(0, '#c4cad6');
        g.addColorStop(0.4, '#4a505c');
        g.addColorStop(1, '#0a0b0e');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
    }

    /** Ballistic arc with optional wind wobble. Returns point at t (0..1). */
    function arcPoint(from, to, height, t, wobble = 0) {
        const x = lerp(from.x, to.x, t) + (wobble ? Math.sin(t * Math.PI * 3) * wobble * t : 0);
        const y = lerp(from.y, to.y, t) - height * 4 * t * (1 - t);
        return { x, y };
    }

    /** Fly a cannonball. Calls onLand once at the end. */
    WCFX.shoot = function shoot(fx, { from, to, height = 300, duration = 950, wobble = 0, onLand, delay = 0, trail = '#ffb02e', r = 24 }) {
        const pts = [];
        let landed = false;
        return fx.add({
            t0: performance.now() + delay,
            draw(ctx, t) {
                const p = clamp01(t / duration);
                const pos = arcPoint(from, to, height, p, wobble);
                pts.push(pos);
                if (pts.length > 16) pts.shift();
                // glowing trail
                for (let i = 0; i < pts.length; i++) {
                    const k = i / pts.length;
                    ctx.fillStyle = `rgba(255,176,46,${(0.35 * k).toFixed(3)})`;
                    ctx.beginPath();
                    ctx.arc(pts[i].x, pts[i].y, r * (0.4 + 0.7 * k), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.save();
                ctx.shadowColor = trail;
                ctx.shadowBlur = 26;
                drawBall(ctx, pos.x, pos.y, r);
                ctx.restore();
                if (p >= 1 && !landed) {
                    landed = true;
                    if (onLand) onLand(pos);
                }
                return p >= 1;
            },
        });
    };

    WCFX.muzzleFlash = function muzzleFlash(fx, at, dir = 1) {
        fx.add({
            draw(ctx, t) {
                const p = t / 260;
                if (p >= 1) return true;
                const s = 1 + p * 0.8;
                ctx.save();
                ctx.translate(at.x + dir * 30, at.y);
                ctx.scale(dir * s, s);
                ctx.globalAlpha = 1 - p;
                const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 90);
                g.addColorStop(0, '#fffbe0');
                g.addColorStop(0.35, '#ffd23f');
                g.addColorStop(1, 'rgba(255,120,30,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                for (let i = 0; i < 16; i++) {
                    const a = (i / 16) * Math.PI * 2;
                    const rr = i % 2 ? 34 : (i % 4 === 0 ? 95 : 64);
                    const x = Math.cos(a) * rr * (Math.cos(a) > 0 ? 1.3 : 0.6);
                    const y = Math.sin(a) * rr * 0.7;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                return false;
            },
        });
        WCFX.smoke(fx, { x: at.x + dir * 40, y: at.y - 6 }, { n: 7, spread: 50, dir });
    };

    WCFX.smoke = function smoke(fx, at, { n = 8, spread = 60, dir = 0, dur = 1400, color = '200,200,205', size = 34 } = {}) {
        const rnd = Math.random;
        const puffs = Array.from({ length: WCFX.reduced() ? Math.ceil(n / 2) : n }, () => ({
            dx: (rnd() - 0.5) * spread + dir * rnd() * 70,
            dy: -rnd() * 60 - 20,
            r: size * (0.6 + rnd() * 0.8),
            d: rnd() * 120,
        }));
        fx.add({
            draw(ctx, t) {
                let alive = false;
                for (const pf of puffs) {
                    const p = (t - pf.d) / dur;
                    if (p < 0) { alive = true; continue; }
                    if (p >= 1) continue;
                    alive = true;
                    const e = easeOut(p);
                    ctx.fillStyle = `rgba(${color},${(0.75 * (1 - p)).toFixed(3)})`;
                    ctx.beginPath();
                    ctx.arc(at.x + pf.dx * e, at.y + pf.dy * e, pf.r * (0.6 + e * 1.1), 0, Math.PI * 2);
                    ctx.fill();
                }
                return !alive;
            },
        });
    };

    WCFX.explosion = function explosion(fx, at, { scale = 1 } = {}) {
        const rnd = Math.random;
        const debris = Array.from({ length: WCFX.reduced() ? 6 : 18 }, () => ({
            vx: (rnd() - 0.5) * 16 * scale, vy: -(6 + rnd() * 12) * scale, s: 8 + rnd() * 12, rot: rnd() * 6, c: ['#5a3a20', '#7a4a2a', '#3b2a1e', '#c63b2b'][Math.floor(rnd() * 4)],
        }));
        const sparks = Array.from({ length: WCFX.reduced() ? 8 : 26 }, () => ({ a: rnd() * Math.PI * 2, v: 8 + rnd() * 14 }));
        fx.add({
            draw(ctx, t) {
                const p = t / 900;
                if (p >= 1.6) return true;
                // fireball layers
                if (p < 1) {
                    const layers = [['#e8461a', 1.0], ['#ff9a1a', 0.78], ['#ffd23f', 0.55], ['#fff6d6', 0.3]];
                    const grow = easeOut(Math.min(1, p * 2.2));
                    const fade = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, fade);
                    for (const [col, k] of layers) {
                        ctx.fillStyle = col;
                        ctx.beginPath();
                        const R = 120 * scale * k * grow;
                        for (let i = 0; i <= 18; i++) {
                            const a = (i / 18) * Math.PI * 2;
                            const wob = 1 + 0.16 * Math.sin(a * 5 + k * 7);
                            const x = at.x + Math.cos(a) * R * wob;
                            const y = at.y + Math.sin(a) * R * wob * 0.92;
                            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                        }
                        ctx.fill();
                    }
                    // shock ring
                    ctx.strokeStyle = `rgba(255,246,214,${(0.8 * (1 - p)).toFixed(3)})`;
                    ctx.lineWidth = 10 * (1 - p);
                    ctx.beginPath();
                    ctx.arc(at.x, at.y, 60 * scale + p * 200 * scale, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                    // sparks
                    ctx.strokeStyle = `rgba(255,214,90,${(1 - p).toFixed(3)})`;
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    for (const s of sparks) {
                        const d = s.v * t * 0.04 * scale;
                        ctx.moveTo(at.x + Math.cos(s.a) * d, at.y + Math.sin(s.a) * d);
                        ctx.lineTo(at.x + Math.cos(s.a) * (d + 18), at.y + Math.sin(s.a) * (d + 18));
                    }
                    ctx.stroke();
                }
                // debris
                const tt = t / 16.7;
                for (const d of debris) {
                    const x = at.x + d.vx * tt;
                    const y = at.y + d.vy * tt + 0.45 * tt * tt;
                    if (y > at.y + 240) continue;
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(d.rot + tt * 0.2);
                    ctx.fillStyle = d.c;
                    ctx.fillRect(-d.s / 2, -d.s / 2, d.s, d.s * 0.7);
                    ctx.restore();
                }
                return false;
            },
        });
        WCFX.smoke(fx, { x: at.x, y: at.y - 20 }, { n: 10, spread: 140, dur: 1900, color: '70,64,62', size: 46 });
    };

    WCFX.splash = function splash(fx, at, { scale = 1 } = {}) {
        const rnd = Math.random;
        const drops = Array.from({ length: WCFX.reduced() ? 8 : 26 }, () => ({ vx: (rnd() - 0.5) * 12 * scale, vy: -(8 + rnd() * 14) * scale, r: 5 + rnd() * 8 }));
        fx.add({
            draw(ctx, t) {
                const p = t / 1100;
                if (p >= 1) return true;
                // foam rings
                for (let i = 0; i < 3; i++) {
                    const q = clamp01(p * 1.4 - i * 0.18);
                    if (q <= 0 || q >= 1) continue;
                    ctx.strokeStyle = `rgba(255,255,255,${(0.9 * (1 - q)).toFixed(3)})`;
                    ctx.lineWidth = 8 * (1 - q) + 2;
                    ctx.beginPath();
                    ctx.ellipse(at.x, at.y, (30 + q * 150) * scale, (8 + q * 34) * scale, 0, 0, Math.PI * 2);
                    ctx.stroke();
                }
                // column
                const h = Math.sin(Math.min(1, p * 1.6) * Math.PI) * 190 * scale;
                if (h > 2) {
                    const g = ctx.createLinearGradient(0, at.y - h, 0, at.y);
                    g.addColorStop(0, 'rgba(255,255,255,0.95)');
                    g.addColorStop(1, 'rgba(160,226,255,0.85)');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.moveTo(at.x - 40 * scale, at.y);
                    ctx.quadraticCurveTo(at.x - 30 * scale, at.y - h * 0.6, at.x - 12 * scale, at.y - h);
                    ctx.quadraticCurveTo(at.x, at.y - h * 1.08, at.x + 12 * scale, at.y - h);
                    ctx.quadraticCurveTo(at.x + 30 * scale, at.y - h * 0.6, at.x + 40 * scale, at.y);
                    ctx.closePath();
                    ctx.fill();
                }
                const tt = t / 16.7;
                ctx.fillStyle = 'rgba(225,246,255,0.95)';
                for (const d of drops) {
                    const x = at.x + d.vx * tt;
                    const y = at.y - 20 + d.vy * tt + 0.5 * tt * tt;
                    if (y > at.y + 10) continue;
                    ctx.beginPath();
                    ctx.arc(x, y, d.r * (1 - p * 0.5), 0, Math.PI * 2);
                    ctx.fill();
                }
                return false;
            },
        });
    };

    WCFX.lightning = function lightning(fx, { x = null, toY = null, from = null } = {}) {
        const rnd = Math.random;
        const sx = from?.x ?? (x ?? 300 + rnd() * 1300);
        const sy = from?.y ?? 0;
        const ey = toY ?? 520 + rnd() * 200;
        const ex = x != null ? x : sx + (rnd() - 0.5) * 200;
        const pts = [[sx, sy]];
        const steps = 11;
        for (let i = 1; i < steps; i++) pts.push([lerp(sx, ex, i / steps) + (rnd() - 0.5) * 90, lerp(sy, ey, i / steps)]);
        pts.push([ex, ey]);
        const branch = pts.slice(4, 8).map(([px, py], i) => [px + (i + 1) * 28 * (rnd() > 0.5 ? 1 : -1), py + i * 22]);
        fx.flash = Math.max(fx.flash, WCFX.reduced() ? 0.25 : 0.6);
        fx.add({
            draw(ctx, t) {
                const p = t / 420;
                if (p >= 1) return true;
                const a = p < 0.3 ? 1 : 1 - (p - 0.3) / 0.7;
                ctx.save();
                ctx.strokeStyle = `rgba(255,250,210,${a.toFixed(3)})`;
                ctx.shadowColor = '#c9b8ff';
                ctx.shadowBlur = 30;
                ctx.lineWidth = 9;
                ctx.lineJoin = 'round';
                ctx.beginPath();
                pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
                ctx.stroke();
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(pts[4][0], pts[4][1]);
                branch.forEach(([px, py]) => ctx.lineTo(px, py));
                ctx.stroke();
                ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
                ctx.stroke();
                ctx.restore();
                return false;
            },
        });
        return { x: ex, y: ey };
    };

    WCFX.confetti = function confetti(fx, { duration = 4200, count = 180, burst = null } = {}) {
        const rnd = Math.random;
        const n = WCFX.reduced() ? Math.round(count / 3) : count;
        const bits = Array.from({ length: n }, (_, i) => {
            const fromBurst = burst && i < n * 0.45;
            const a = rnd() * Math.PI * 2;
            return {
                x: fromBurst ? burst.x : rnd() * fx.W,
                y: fromBurst ? burst.y : -40 - rnd() * fx.H * 0.6,
                vx: fromBurst ? Math.cos(a) * (6 + rnd() * 12) : (rnd() - 0.5) * 3,
                vy: fromBurst ? Math.sin(a) * (6 + rnd() * 12) - 6 : 3 + rnd() * 4,
                w: 12 + rnd() * 12, h: 8 + rnd() * 8, rot: rnd() * 6, vr: (rnd() - 0.5) * 0.3,
                c: WCFX.CONFETTI[Math.floor(rnd() * WCFX.CONFETTI.length)],
            };
        });
        const item = fx.add({
            draw(ctx, t) {
                if (t > duration) return true;
                const fade = t > duration - 600 ? (duration - t) / 600 : 1;
                ctx.save();
                ctx.globalAlpha = Math.max(0, fade);
                for (const b of bits) {
                    b.x += b.vx;
                    b.y += b.vy;
                    b.vy = Math.min(b.vy + 0.18, 7);
                    b.vx *= 0.99;
                    b.rot += b.vr;
                    ctx.save();
                    ctx.translate(b.x, b.y);
                    ctx.rotate(b.rot);
                    ctx.fillStyle = b.c;
                    ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.rot * 2)) + 2);
                    ctx.restore();
                }
                ctx.restore();
                return false;
            },
        });
        return () => { item.draw = () => true; };
    };

    /** Screen shake on an element (transform), decaying. */
    WCFX.shake = function shake(el, { power = 18, duration = 500 } = {}) {
        if (!el || WCFX.reduced()) return;
        const t0 = performance.now();
        cancelAnimationFrame(el._wcShake || 0);
        const step = (now) => {
            const p = (now - t0) / duration;
            if (p >= 1) {
                el.style.transform = '';
                return;
            }
            const k = power * (1 - p) * (1 - p);
            el.style.transform = `translate(${((Math.random() - 0.5) * 2 * k).toFixed(1)}px, ${((Math.random() - 0.5) * 2 * k).toFixed(1)}px)`;
            el._wcShake = requestAnimationFrame(step);
        };
        el._wcShake = requestAnimationFrame(step);
    };

    // ------------------------------------------------------------------
    // Sound (WebAudio, synthesised)
    // ------------------------------------------------------------------
    let actx = null;
    let master = null;
    let rainNode = null;
    WCFX.audio = function audio() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        if (!actx) {
            actx = new Ctx();
            master = actx.createGain();
            master.gain.value = 0.8;
            master.connect(actx.destination);
        }
        if (actx.state === 'suspended') actx.resume().catch(() => {});
        return actx;
    };

    function noiseBuffer(ctx, secs) {
        const len = Math.max(1, Math.floor(ctx.sampleRate * secs));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    }

    WCFX.sfx = function sfx(name, { volume = 1, rate = 1 } = {}) {
        try {
            const ctx = WCFX.audio();
            if (!ctx) return;
            const now = ctx.currentTime;
            const out = ctx.createGain();
            out.gain.value = volume;
            out.connect(master);
            const tone = (freq, start, dur, type = 'sine', vol = 0.2, slideTo = null) => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = type;
                o.frequency.setValueAtTime(freq * rate, now + start);
                if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo * rate, now + start + dur);
                g.gain.setValueAtTime(0.0001, now + start);
                g.gain.exponentialRampToValueAtTime(vol, now + start + 0.012);
                g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
                o.connect(g);
                g.connect(out);
                o.start(now + start);
                o.stop(now + start + dur + 0.05);
            };
            const noise = (start, dur, { type = 'lowpass', freq = 800, freqTo = null, q = 0.8, vol = 0.3, attack = 0.005 } = {}) => {
                const src = ctx.createBufferSource();
                src.buffer = noiseBuffer(ctx, dur);
                const f = ctx.createBiquadFilter();
                f.type = type;
                f.Q.value = q;
                f.frequency.setValueAtTime(freq, now + start);
                if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, now + start + dur);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, now + start);
                g.gain.exponentialRampToValueAtTime(vol, now + start + attack);
                g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
                src.connect(f);
                f.connect(g);
                g.connect(out);
                src.start(now + start);
                src.stop(now + start + dur + 0.02);
            };
            switch (name) {
                case 'boom':
                    tone(120, 0, 0.6, 'sine', 0.6, 38);
                    tone(70, 0, 0.8, 'triangle', 0.35, 30);
                    noise(0, 0.7, { freq: 1600, freqTo: 120, vol: 0.55 });
                    break;
                case 'whoosh':
                    noise(0, 0.9, { type: 'bandpass', freq: 500, freqTo: 2600, q: 1.2, vol: 0.16, attack: 0.3 });
                    break;
                case 'explosion':
                    tone(90, 0, 1.0, 'sine', 0.55, 28);
                    noise(0, 1.3, { freq: 2400, freqTo: 90, vol: 0.6 });
                    noise(0.05, 0.5, { type: 'highpass', freq: 2500, vol: 0.12 });
                    break;
                case 'splash':
                    noise(0, 0.7, { type: 'bandpass', freq: 1400, freqTo: 400, q: 0.7, vol: 0.4 });
                    noise(0.08, 0.6, { type: 'highpass', freq: 3000, vol: 0.12 });
                    tone(300, 0, 0.15, 'sine', 0.12, 120);
                    break;
                case 'thunder':
                    noise(0, 2.6, { freq: 500, freqTo: 60, vol: 0.55, attack: 0.04 });
                    noise(0.15, 1.2, { freq: 1800, freqTo: 200, vol: 0.25 });
                    tone(55, 0, 2.0, 'sine', 0.3, 30);
                    break;
                case 'wind':
                    noise(0, 2.2, { type: 'bandpass', freq: 300, freqTo: 900, q: 2, vol: 0.12, attack: 0.8 });
                    break;
                case 'fanfare':
                    [[523.25, 0, 0.16], [659.25, 0.15, 0.16], [783.99, 0.3, 0.16], [1046.5, 0.46, 0.75]].forEach(([f, s, d]) => {
                        tone(f, s, d, 'square', 0.07);
                        tone(f, s, d, 'triangle', 0.14);
                    });
                    tone(523.25, 0.46, 0.75, 'triangle', 0.09);
                    tone(659.25, 0.46, 0.75, 'triangle', 0.09);
                    noise(0.46, 0.9, { type: 'highpass', freq: 4500, vol: 0.08 });
                    break;
                case 'chime':
                    tone(1318.5, 0, 0.6, 'sine', 0.12);
                    tone(1975.5, 0.07, 0.6, 'sine', 0.08);
                    break;
                case 'pop':
                    tone(520, 0, 0.12, 'triangle', 0.2, 900);
                    break;
                case 'blip':
                    tone(1320, 0, 0.07, 'sine', 0.08);
                    break;
                case 'ding':
                    tone(1046.5, 0, 0.5, 'sine', 0.18);
                    tone(1568, 0.02, 0.4, 'sine', 0.07);
                    break;
                case 'miss':
                    tone(440, 0, 0.25, 'triangle', 0.12, 220);
                    break;
                case 'thud':
                    tone(62, 0, 0.18, 'sine', 0.5, 40);
                    tone(58, 0.22, 0.18, 'sine', 0.42, 38);
                    break;
                case 'crumble':
                    noise(0, 1.6, { freq: 700, freqTo: 80, vol: 0.45, attack: 0.05 });
                    [0.1, 0.3, 0.45, 0.7, 0.9].forEach((s) => tone(90 + Math.random() * 60, s, 0.2, 'sine', 0.25, 40));
                    break;
                default:
                    break;
            }
        } catch { /* autoplay / audio errors are fine to ignore */ }
    };

    WCFX.rainLoop = function rainLoop(on) {
        try {
            const ctx = WCFX.audio();
            if (!ctx) return;
            if (on && !rainNode) {
                const src = ctx.createBufferSource();
                src.buffer = noiseBuffer(ctx, 2);
                src.loop = true;
                const f = ctx.createBiquadFilter();
                f.type = 'bandpass';
                f.frequency.value = 2400;
                f.Q.value = 0.5;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 1.5);
                src.connect(f);
                f.connect(g);
                g.connect(master);
                src.start();
                rainNode = { src, g };
            } else if (!on && rainNode) {
                const { src, g } = rainNode;
                rainNode = null;
                g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
                setTimeout(() => { try { src.stop(); } catch { /* ignore */ } }, 1500);
            }
        } catch { /* ignore */ }
    };
})();
