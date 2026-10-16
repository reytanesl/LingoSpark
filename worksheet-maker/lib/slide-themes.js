/** Preset colour schemes for presentation slides. */

export const SLIDE_COLOUR_SCHEMES = [
  {
    id: 'navy',
    name: { en: 'Navy & red', de: 'Navy & Rot', pl: 'Granat i czerwień' },
    background: '#F8FAFC',
    bodyText: '#012169',
    accents: [
      { name: 'Navy', hex: '#012169' },
      { name: 'Red', hex: '#C8102E' },
    ],
  },
  {
    id: 'forest',
    name: { en: 'Forest', de: 'Waldgrün', pl: 'Leśny' },
    background: '#F4FBF6',
    bodyText: '#1B4332',
    accents: [
      { name: 'Green', hex: '#2D6A4F' },
      { name: 'Moss', hex: '#52B788' },
    ],
  },
  {
    id: 'slate',
    name: { en: 'Slate', de: 'Schiefer', pl: 'Łupek' },
    background: '#F8FAFC',
    bodyText: '#1E293B',
    accents: [
      { name: 'Slate', hex: '#334155' },
      { name: 'Sky', hex: '#0EA5E9' },
    ],
  },
  {
    id: 'burgundy',
    name: { en: 'Burgundy', de: 'Bordeaux', pl: 'Burgund' },
    background: '#FFF8F6',
    bodyText: '#4A1525',
    accents: [
      { name: 'Burgundy', hex: '#7F1D3F' },
      { name: 'Gold', hex: '#C9A227' },
    ],
  },
  {
    id: 'teal',
    name: { en: 'Teal', de: 'Petrol', pl: 'Morski' },
    background: '#F2FBFC',
    bodyText: '#134E4A',
    accents: [
      { name: 'Teal', hex: '#0F766E' },
      { name: 'Coral', hex: '#E11D48' },
    ],
  },
];

export function slideSchemeById(id) {
  return SLIDE_COLOUR_SCHEMES.find((s) => s.id === id) || SLIDE_COLOUR_SCHEMES[0];
}

export function themeNoteFromScheme(schemeOrId) {
  const scheme = typeof schemeOrId === 'string' ? slideSchemeById(schemeOrId) : (schemeOrId || SLIDE_COLOUR_SCHEMES[0]);
  return {
    schemeId: scheme.id,
    background: scheme.background,
    bodyText: scheme.bodyText,
    accents: scheme.accents.map((a) => ({ ...a })),
  };
}

export function schemeLabel(scheme, lang = 'en') {
  const pack = scheme?.name || {};
  const key = String(lang || 'en').toLowerCase().startsWith('de')
    ? 'de'
    : String(lang || '').toLowerCase().startsWith('pl')
      ? 'pl'
      : 'en';
  return pack[key] || pack.en || scheme.id;
}
