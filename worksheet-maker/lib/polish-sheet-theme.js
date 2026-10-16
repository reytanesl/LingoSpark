/**
 * Visual themes for Polish SP worksheets — age- and subject-aware,
 * independent of the ESL/DaF LingoSpark sheet look.
 * Doodles live in side margins + a light background pattern.
 */

const SUBJECT_THEMES = {
  'jezyk-polski': {
    accent: '#C45C26',
    accent2: '#F4A261',
    bg: '#FFF8F1',
    band: '#FFE8D6',
    doodle: 'books',
  },
  historia: {
    accent: '#8B5E3C',
    accent2: '#D4A373',
    bg: '#FBF6EE',
    band: '#F0E0C8',
    doodle: 'scroll',
  },
  wos: {
    accent: '#2A6F97',
    accent2: '#61A5C2',
    bg: '#F3F8FC',
    band: '#D9ECF7',
    doodle: 'civic',
  },
  etyka: {
    accent: '#6A4C93',
    accent2: '#B185DB',
    bg: '#F9F5FF',
    band: '#EBDFF7',
    doodle: 'stars',
  },
  'jezyk-obcy': {
    accent: '#1D6A8A',
    accent2: '#48A9C5',
    bg: '#F2FAFC',
    band: '#D5EFF6',
    doodle: 'globe',
  },
  'drugi-jezyk': {
    accent: '#1D6A8A',
    accent2: '#7BC8DB',
    bg: '#F2FAFC',
    band: '#D5EFF6',
    doodle: 'globe',
  },
  lacina: {
    accent: '#6B4226',
    accent2: '#C4A484',
    bg: '#FAF6F0',
    band: '#EDE0D0',
    doodle: 'scroll',
  },
  matematyka: {
    accent: '#0B6E4F',
    accent2: '#3DDC97',
    bg: '#F2FBF7',
    band: '#D4F5E7',
    doodle: 'math',
  },
  przyroda: {
    accent: '#2D6A4F',
    accent2: '#95D5B2',
    bg: '#F4FBF6',
    band: '#D8F3DC',
    doodle: 'nature',
  },
  biologia: {
    accent: '#2D6A4F',
    accent2: '#74C69D',
    bg: '#F3FAF5',
    band: '#D8F3DC',
    doodle: 'nature',
  },
  geografia: {
    accent: '#1A759F',
    accent2: '#76C893',
    bg: '#F1F8FB',
    band: '#D0EBF7',
    doodle: 'globe',
  },
  fizyka: {
    accent: '#3A0CA3',
    accent2: '#7209B7',
    bg: '#F7F3FF',
    band: '#E5DBFF',
    doodle: 'science',
  },
  chemia: {
    accent: '#7B2CBF',
    accent2: '#C77DFF',
    bg: '#FAF5FF',
    band: '#EDE0FF',
    doodle: 'science',
  },
  informatyka: {
    accent: '#023E8A',
    accent2: '#00B4D8',
    bg: '#F0F7FF',
    band: '#CFE8FF',
    doodle: 'tech',
  },
  muzyka: {
    accent: '#9B2226',
    accent2: '#EE9B00',
    bg: '#FFF8F0',
    band: '#FFE5C2',
    doodle: 'music',
  },
  plastyka: {
    accent: '#E76F51',
    accent2: '#F4A261',
    bg: '#FFF7F2',
    band: '#FFE0D1',
    doodle: 'art',
  },
  technika: {
    accent: '#495057',
    accent2: '#ADB5BD',
    bg: '#F8F9FA',
    band: '#E9ECEF',
    doodle: 'tech',
  },
  wf: {
    accent: '#E85D04',
    accent2: '#F48C06',
    bg: '#FFF8F0',
    band: '#FFE8CC',
    doodle: 'sport',
  },
  edb: {
    accent: '#D00000',
    accent2: '#FFBA08',
    bg: '#FFF8F5',
    band: '#FFE0D6',
    doodle: 'safety',
  },
  wdz: {
    accent: '#9C6644',
    accent2: '#B08968',
    bg: '#FAF6F1',
    band: '#EDE0D4',
    doodle: 'stars',
  },
};

const DEFAULT_THEME = {
  accent: '#012169',
  accent2: '#4C6EF5',
  bg: '#F8FAFC',
  band: '#E2E8F0',
  doodle: 'stars',
};

function ageProfile(grade) {
  const g = Number(grade) || 5;
  if (g <= 5) {
    return {
      vibe: 'playful',
      radius: '22px',
      doodleOpacity: 0.26,
      patternStrength: 0.09,
      marginPad: '3.4rem',
      font: "'Fredoka', 'Nunito', 'Segoe UI', sans-serif",
      fontBody: "'Nunito', 'Segoe UI', sans-serif",
    };
  }
  if (g <= 7) {
    return {
      vibe: 'fresh',
      radius: '18px',
      doodleOpacity: 0.2,
      patternStrength: 0.07,
      marginPad: '3rem',
      font: "'Nunito', 'Segoe UI', sans-serif",
      fontBody: "'Nunito', 'Segoe UI', sans-serif",
    };
  }
  return {
    vibe: 'focused',
    radius: '14px',
    doodleOpacity: 0.16,
    patternStrength: 0.05,
    marginPad: '2.6rem',
    font: "'Lexend', 'Nunito', 'Segoe UI', sans-serif",
    fontBody: "'Lexend', 'Nunito', 'Segoe UI', sans-serif",
  };
}

export function resolvePolishSheetTheme({ grade, subjectId } = {}) {
  const base = SUBJECT_THEMES[subjectId] || DEFAULT_THEME;
  const age = ageProfile(grade);
  return {
    ...base,
    ...age,
    // White sheet for clean colour printing; doodles stay pale on top.
    bg: '#FFFFFF',
    grade: Number(grade) || 0,
    subjectId: subjectId || '',
  };
}

/** Tiny motif paths used for margin icons + tiled background. */
const MOTIFS = {
  math: [
    '<circle cx="20" cy="20" r="10" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M32 32 L48 48 M40 14 h16 M48 6 v16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    '<rect x="8" y="8" width="28" height="28" rx="3" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M8 22 h28 M22 8 v28" fill="none" stroke="currentColor" stroke-width="2.5"/>',
    '<path d="M10 40 L28 12 L46 40 Z" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M22 40 v10 h12 v-10" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M12 28 h32 M18 20 h20 M24 12 h8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
      + '<text x="16" y="48" font-size="18" font-family="Segoe UI,sans-serif" fill="currentColor" font-weight="700">+</text>',
  ],
  books: [
    '<path d="M10 12 h24 v36 H10 Z" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M10 12 c6 5 18 5 24 0" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M14 44 c12 -28 24 -28 36 0" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M22 22 l6 -14 6 14" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M12 16 h20 l8 8 v28 H12 Z" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M32 16 v8 h8" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M18 14 v36 M28 10 v40 M38 16 v34" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  ],
  nature: [
    '<path d="M28 50 V22" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M28 28 C12 28 10 12 28 6 C46 12 44 28 28 28" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<ellipse cx="28" cy="28" rx="16" ry="10" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M28 18 v20 M18 28 h20" fill="none" stroke="currentColor" stroke-width="2.5"/>',
    '<circle cx="18" cy="36" r="7" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<circle cx="36" cy="22" r="9" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M10 40 C22 18 34 18 46 40" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M28 40 V12" fill="none" stroke="currentColor" stroke-width="3"/>',
  ],
  globe: [
    '<circle cx="28" cy="28" r="18" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<ellipse cx="28" cy="28" rx="8" ry="18" fill="none" stroke="currentColor" stroke-width="2.5"/>'
      + '<path d="M10 28 h36 M14 18 h28 M14 38 h28" fill="none" stroke="currentColor" stroke-width="2"/>',
    '<path d="M8 42 L28 12 L48 42 Z" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M18 42 v8 h20 v-8" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M12 30 c8 -16 24 -16 32 0" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<circle cx="28" cy="18" r="5" fill="currentColor"/>',
    '<rect x="10" y="14" width="36" height="28" rx="3" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M10 28 h36" fill="none" stroke="currentColor" stroke-width="2"/>',
  ],
  science: [
    '<circle cx="28" cy="28" r="6" fill="currentColor"/>'
      + '<ellipse cx="28" cy="28" rx="22" ry="9" fill="none" stroke="currentColor" stroke-width="2.5" transform="rotate(60 28 28)"/>'
      + '<ellipse cx="28" cy="28" rx="22" ry="9" fill="none" stroke="currentColor" stroke-width="2.5" transform="rotate(-60 28 28)"/>',
    '<path d="M20 8 h16 v12 c0 14 -4 22 -8 28 h0 c-4 -6 -8 -14 -8 -28 Z" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M16 8 h24" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M12 40 L28 10 L44 40 Z" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<circle cx="28" cy="28" r="4" fill="currentColor"/>',
    '<path d="M10 28 h36 M28 10 v36" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<circle cx="28" cy="28" r="10" fill="none" stroke="currentColor" stroke-width="2.5"/>',
  ],
  music: [
    '<path d="M34 8 v30 a8 8 0 1 1 -6 -7 V18 l18 -5 v6 l-12 3" fill="currentColor"/>',
    '<path d="M8 18 h40 M8 28 h40 M8 38 h40" fill="none" stroke="currentColor" stroke-width="2.5"/>'
      + '<path d="M22 12 v34" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<circle cx="18" cy="36" r="8" fill="currentColor"/><circle cx="38" cy="30" r="8" fill="currentColor"/>'
      + '<path d="M26 36 V14 h20 v16" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M12 40 c8 -20 24 -20 32 0" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M20 22 l6 -10 6 10" fill="none" stroke="currentColor" stroke-width="3"/>',
  ],
  art: [
    '<circle cx="18" cy="22" r="11" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<circle cx="34" cy="22" r="11" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<circle cx="26" cy="34" r="11" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M14 44 L28 8 L42 44" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M20 30 h16" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<rect x="10" y="12" width="36" height="28" rx="4" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<circle cx="22" cy="24" r="5" fill="currentColor"/><path d="M30 34 l10 -12" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M12 16 c10 0 10 12 20 12 s10 -12 20 -12" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M12 40 h32" fill="none" stroke="currentColor" stroke-width="3"/>',
  ],
  tech: [
    '<rect x="10" y="12" width="36" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M20 44 h16 M28 38 v6" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M10 28 h10 l6 -12 6 24 6 -12 h10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    '<circle cx="28" cy="28" r="14" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M28 18 v10 l8 8" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<rect x="14" y="14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<rect x="30" y="14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<rect x="14" y="30" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<rect x="30" y="30" width="12" height="12" fill="currentColor" opacity="0.35"/>',
  ],
  sport: [
    '<circle cx="28" cy="28" r="18" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M10 28 h36 M28 10 v36" fill="none" stroke="currentColor" stroke-width="2"/>'
      + '<path d="M14 16 c10 8 18 8 28 0 M14 40 c10 -8 18 -8 28 0" fill="none" stroke="currentColor" stroke-width="2"/>',
    '<path d="M18 12 v36 M18 12 l22 10 -22 10" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M12 36 L28 12 L44 36 Z" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<circle cx="28" cy="28" r="5" fill="currentColor"/>',
    '<path d="M10 40 L46 16 M16 16 h12 v12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  ],
  scroll: [
    '<path d="M14 10 h28 v40 H14 Z" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M14 10 c5 4 23 4 28 0" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M20 22 h16 M20 30 h16 M20 38 h10" fill="none" stroke="currentColor" stroke-width="2.5"/>',
    '<circle cx="28" cy="28" r="16" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M28 16 v14 l8 8" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M10 40 V18 L28 8 L46 18 V40" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M12 14 h32 v8 H12 Z M12 28 h32 v14 H12 Z" fill="none" stroke="currentColor" stroke-width="3"/>',
  ],
  civic: [
    '<path d="M10 42 V22 L28 10 L46 22 V42" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M18 42 V28 h8 v14 M30 42 V28 h8 v14" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<rect x="14" y="12" width="28" height="34" rx="2" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M20 20 h16 M20 28 h16 M20 36 h10" fill="none" stroke="currentColor" stroke-width="2.5"/>',
    '<circle cx="28" cy="22" r="10" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M18 40 h20" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M12 38 L28 12 L44 38 Z" fill="none" stroke="currentColor" stroke-width="3"/>',
  ],
  safety: [
    '<path d="M28 8 L48 44 H8 Z" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M28 20 v14" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<circle cx="28" cy="40" r="2.5" fill="currentColor"/>',
    '<circle cx="28" cy="28" r="16" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M20 28 h16 M28 20 v16" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<rect x="12" y="16" width="32" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<path d="M20 28 h16" fill="none" stroke="currentColor" stroke-width="3"/>',
    '<path d="M14 40 c0 -16 8 -28 14 -32 c6 4 14 16 14 32 Z" fill="none" stroke="currentColor" stroke-width="3"/>',
  ],
  stars: [
    '<path d="M28 8 l4 12 h12 l-10 7 4 12 -10 -7 -10 7 4 -12 -10 -7 h12 z" fill="currentColor"/>',
    '<path d="M12 36 c10 -20 22 -20 32 0" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<circle cx="20" cy="18" r="4" fill="currentColor"/><circle cx="38" cy="14" r="3" fill="currentColor"/>',
    '<circle cx="18" cy="20" r="5" fill="currentColor"/><circle cx="36" cy="28" r="8" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<circle cx="24" cy="40" r="3" fill="currentColor"/>',
    '<path d="M10 28 h36 M28 10 v36" fill="none" stroke="currentColor" stroke-width="2.5"/>'
      + '<path d="M16 16 L40 40 M40 16 L16 40" fill="none" stroke="currentColor" stroke-width="2.5"/>',
  ],
};

function motifList(kind) {
  return MOTIFS[kind] || MOTIFS.stars;
}

function doodleSvg(inner, { className = '', opacity = 0.4, size = 56, style = '' } = {}) {
  return `<svg class="pl-doodle ${className}" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" style="opacity:${opacity};${style}">${inner}</svg>`;
}

/**
 * Build a repeating background tile (data-URI SVG) for the sheet wash.
 */
export function polishSheetPatternDataUri(theme) {
  const motifs = motifList(theme.doodle);
  const a = Math.max(0.05, Math.min(0.12, Number(theme.patternStrength) || 0.07));
  const accent = theme.accent || '#012169';
  const accent2 = theme.accent2 || accent;
  const paint = (motif, color) => String(motif || '').replace(/currentColor/g, color);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">`,
    `<g fill="none" opacity="${a}">`,
    `<g transform="translate(14 16) scale(1)">${paint(motifs[0], accent)}</g>`,
    `<g transform="translate(104 22) scale(0.85) rotate(16)">${paint(motifs[1], accent2)}</g>`,
    `<g transform="translate(28 108) scale(0.9) rotate(-10)">${paint(motifs[2], accent2)}</g>`,
    `<g transform="translate(112 112) scale(0.8) rotate(8)">${paint(motifs[3] || motifs[0], accent)}</g>`,
    `</g></svg>`,
  ].join('');
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * Margin + corner doodles (plenty of them, age-scaled opacity).
 */
export function polishSheetDoodleHtml(theme) {
  const motifs = motifList(theme.doodle);
  const o = theme.doodleOpacity ?? 0.4;
  const left = [8, 22, 38, 54, 70, 84];
  const right = [12, 28, 44, 60, 76, 88];
  const pieces = [];

  left.forEach((top, i) => {
    const motif = motifs[i % motifs.length];
    const rot = (i % 2 === 0 ? -1 : 1) * (6 + (i % 3) * 4);
    const size = 48 + (i % 3) * 8;
    pieces.push(doodleSvg(motif, {
      className: 'pl-d-margin pl-d-left',
      opacity: o * (0.85 + (i % 3) * 0.05),
      size,
      style: `top:${top}%;left:4px;transform:rotate(${rot}deg)`,
    }));
  });

  right.forEach((top, i) => {
    const motif = motifs[(i + 1) % motifs.length];
    const rot = (i % 2 === 0 ? 1 : -1) * (8 + (i % 3) * 3);
    const size = 46 + (i % 3) * 10;
    pieces.push(doodleSvg(motif, {
      className: 'pl-d-margin pl-d-right',
      opacity: o * (0.8 + (i % 3) * 0.06),
      size,
      style: `top:${top}%;right:4px;transform:rotate(${rot}deg)`,
    }));
  });

  // Soft background floaters (center band, very light)
  const floats = [
    { top: '18%', left: '22%', size: 70, rot: -14, m: 0 },
    { top: '42%', left: '48%', size: 64, rot: 10, m: 1 },
    { top: '68%', left: '30%', size: 72, rot: -6, m: 2 },
    { top: '55%', left: '62%', size: 58, rot: 16, m: 3 },
  ];
  floats.forEach((f) => {
    pieces.push(doodleSvg(motifs[f.m % motifs.length], {
      className: 'pl-d-float',
      opacity: o * 0.14,
      size: f.size,
      style: `top:${f.top};left:${f.left};transform:rotate(${f.rot}deg)`,
    }));
  });

  return `<div class="pl-doodle-layer" aria-hidden="true">${pieces.join('')}</div>`;
}

export function applyPolishSheetThemeVars(el, theme) {
  if (!el || !theme) return;
  el.style.setProperty('--pl-accent', theme.accent);
  el.style.setProperty('--pl-accent-2', theme.accent2);
  el.style.setProperty('--pl-bg', '#FFFFFF');
  el.style.setProperty('--pl-band', theme.band);
  el.style.setProperty('--pl-radius', theme.radius);
  el.style.setProperty('--pl-doodle-opacity', String(theme.doodleOpacity));
  el.style.setProperty('--pl-pattern', String(theme.patternStrength));
  el.style.setProperty('--pl-margin-pad', theme.marginPad || '3rem');
  el.style.setProperty('--pl-pattern-image', polishSheetPatternDataUri(theme));
  el.style.setProperty('--pl-font', theme.font || "'Nunito', sans-serif");
  el.style.setProperty('--pl-font-body', theme.fontBody || theme.font || "'Nunito', sans-serif");
  el.dataset.plVibe = theme.vibe || '';
  el.dataset.plSubject = theme.subjectId || '';
  el.dataset.plGrade = String(theme.grade || '');
}

export function clearPolishSheetThemeVars(el) {
  if (!el) return;
  [
    '--pl-accent', '--pl-accent-2', '--pl-bg', '--pl-band',
    '--pl-radius', '--pl-doodle-opacity', '--pl-pattern',
    '--pl-margin-pad', '--pl-pattern-image', '--pl-font', '--pl-font-body',
  ].forEach((k) => el.style.removeProperty(k));
  delete el.dataset.plVibe;
  delete el.dataset.plSubject;
  delete el.dataset.plGrade;
}
