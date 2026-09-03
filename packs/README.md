# LingoSpark digital lesson packs

Exam-topic vocab packs you sell **off-site** (Teachers Pay Teachers, Etsy, Polish teacher Facebook groups). Each pack is a zip of paste-ready lists + printable worksheets tied to **free** LingoSpark vocab games.

E8 lists follow the 14 CKE thematic modules. They are **not** the free Matura “Człowiek” demo on the site (the E8 Człowiek pack is a separate Grade-8 list).

## Egzamin ósmoklasisty (all 14 modules)

| Pack | Topic | SKU |
|------|--------|-----|
| `osmoklasista-czlowiek` | 1. Człowiek | LS-8-PERSON |
| `osmoklasista-dom` | 2. Miejsce zamieszkania | LS-8-HOME |
| `osmoklasista-edukacja` | 3. Edukacja | LS-8-SCHOOL |
| `osmoklasista-praca` | 4. Praca | LS-8-WORK |
| `osmoklasista-zycie-prywatne` | 5. Życie prywatne | LS-8-LIFE |
| `osmoklasista-zywienie` | 6. Żywienie | LS-8-FOOD |
| `osmoklasista-zakupy` | 7. Zakupy i usługi | LS-8-SHOP |
| `osmoklasista-podroze` | 8. Podróżowanie i turystyka | LS-8-TRAVEL |
| `osmoklasista-kultura` | 9. Kultura | LS-8-CULTURE |
| `osmoklasista-sport` | 10. Sport | LS-8-SPORT |
| `osmoklasista-zdrowie` | 11. Zdrowie | LS-8-HEALTH |
| `osmoklasista-nauka-technika` | 12. Nauka i technika | LS-8-TECH |
| `osmoklasista-przyroda` | 13. Świat przyrody | LS-8-NATURE |
| `osmoklasista-zycie-spoleczne` | 14. Życie społeczne | LS-8-SOCIAL |

Complete E8 zip: `packs/dist/LingoSpark-LS-8-COMPLETE.zip` (listing: `BUNDLE-LISTING-E8.txt`).

## Matura rozszerzona (all 14 CKE modules, B2)

| Pack | Topic | SKU |
|------|--------|-----|
| `matura-pr-czlowiek` | 1. Człowiek | LS-PR-PERSON |
| `matura-pr-dom` | 2. Miejsce zamieszkania | LS-PR-HOME |
| `matura-pr-edukacja` | 3. Edukacja | LS-PR-SCHOOL |
| `matura-pr-praca` | 4. Praca | LS-PR-WORK |
| `matura-pr-zycie-prywatne` | 5. Życie prywatne | LS-PR-LIFE |
| `matura-pr-zywienie` | 6. Żywienie | LS-PR-FOOD |
| `matura-pr-zakupy` | 7. Zakupy i usługi | LS-PR-SHOP |
| `matura-pr-podroze` | 8. Podróżowanie i turystyka | LS-PR-TRAVEL |
| `matura-pr-kultura` | 9. Kultura | LS-PR-CULTURE |
| `matura-pr-sport` | 10. Sport | LS-PR-SPORT |
| `matura-pr-zdrowie` | 11. Zdrowie | LS-PR-HEALTH |
| `matura-pr-nauka-technika` | 12. Nauka i technika | LS-PR-TECH |
| `matura-pr-przyroda` | 13. Świat przyrody | LS-PR-NATURE |
| `matura-pr-panstwo-spoleczenstwo` | 14. Państwo i społeczeństwo | LS-PR-STATE |

Complete PR zip: `packs/dist/LingoSpark-LS-PR-COMPLETE.zip` (listing: `BUNDLE-LISTING-MATURA-PR.txt`).

## Matura podstawowa

| Pack | Topic | SKU |
|------|--------|-----|
| `matura-pp-praca` | Praca | LS-MAT-WORK |
| `matura-pp-zdrowie` | Zdrowie | LS-MAT-HEALTH |

Each **E8** pack: **100–150** genuine exam-level terms (no repeats across the 14 modules), split into sets of 20 for ~6 × 45-minute lessons, PL and EN glosses, a full-list file, terms-only for Primary English, matching / gap-fill / mini-quiz, answer key.

Each **Matura PR** pack: **150–200** B2 terms (180 in the current lists), no repeats across the 14 CKE modules. Paste format ENG–PL (`term = polska definicja`) for Flashcards and the other vocab games.

Each **Matura PP** pack: 36 terms, Set A + Set B (same worksheet types). Extra E8 items live in `packs/data/extra/` and are merged at build time.

Games to name in the listing: **Bomb Defusal**, **Flashcards**, **Grid Territory**, **Vocab Auction**, **Live Quiz**. Paste format: `term = definition`.

## Build / preview

```
npm run packs
```

Then open `packs/dist/index.html`. The build prints PDFs (if Chrome/Edge is installed) and writes `packs/dist/LingoSpark-LS-*.zip`.

## How to upload

See [SELLING.md](SELLING.md). Use `LISTING.txt` inside each pack, or `packs/dist/BUNDLE-LISTING-E8.txt` for the full E8 bundle.

## Add a new topic

1. Copy a JSON file in `packs/data/`.
2. Keep `term`, `definitionPl`, `definitionEn`, `example` (the example must contain the term as a whole phrase).
3. E8 packs must total **100–150** items after extras merge; Matura PR packs **150–200**; Matura PP packs stay at 36. Extra arrays go in `packs/data/extra/<same-filename>.json`.
4. Do not paste E8 or Matura PR lists into `demo-sets.js`.
5. Run `npm run packs`.
