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

**Vocab Review** is free. **Writing Suite** requires Google sign-in plus Buy Me a Coffee payment or admin approval.

## Share with students

See **[DEPLOY.md](DEPLOY.md)** for Render + Google + Buy Me a Coffee setup.

## Project layout

| File | Purpose |
|------|---------|
| `index.html` | App UI, games, paywall modal |
| `admin.html` | Approve / revoke Writing Suite access |
| `server.js` | Express: static, auth, BMC webhook, Cursor AI |
| `db.js` | Postgres users + access helpers |
| `auth.js` | Google OAuth (Passport) |
| `billing.js` | Buy Me a Coffee webhook handling |
| `Projekt bez nazwy.png` | Header logo |
