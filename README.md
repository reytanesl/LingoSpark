# LingoSpark: Gamify Your Words

British Academic vocabulary and writing games for ESL learners.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `CURSOR_API_KEY`
   - `DATABASE_URL` (Postgres)
   - Google OAuth vars
   - `ADMIN_EMAIL`
   - `BMC_PAYMENT_URL` / `BMC_WEBHOOK_SECRET`
3. `npm start`
4. Open **http://localhost:3000**

**Vocab Review** is free. **Writing Suite** needs sign-in plus a plan (12 zł / week, 40 zł / month, 280 zł / year) or teacher approval. Checkout is USD on Buy Me a Coffee.

## Share with students

See **[DEPLOY.md](DEPLOY.md)** for Render + Google + Buy Me a Coffee setup.

## Lesson packs (sell off-site)

Exam-topic vocab packs for Teachers Pay Teachers, Etsy, or Polish teacher groups: **all 14 CKE modules for egzamin ósmoklasisty**, plus Matura PP Work/Health. Paste-ready lists for Bomb Defusal / Flashcards / Live Quiz plus printable worksheets. Source and listing copy live in **[packs/](packs/README.md)**. Rebuild with `npm run packs`. Do not add those lists to the free demo sets.

## Project layout

| File | Purpose |
|------|---------|
| `index.html` | App UI, games, paywall modal |
| `admin.html` | Approve / revoke Writing Suite access |
| `server.js` | Express: static, auth, BMC webhook, Cursor AI |
| `db.js` | Postgres users + access helpers |
| `pe-colour-blocks.js` | Colour Blocks: colour tiles, icon guess, text tasks |
| `auth.js` | Google OAuth (Passport) |
| `billing.js` | Buy Me a Coffee webhook handling |
| `packs/` | Sellable exam lesson packs (TPT / Etsy / teacher groups) |
| `Projekt bez nazwy.png` | Header logo |
