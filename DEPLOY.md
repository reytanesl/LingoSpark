# Deploy LingoSpark for Students

Students only need a **browser** and your public URL.

You host one server with:
- `CURSOR_API_KEY` (AI generation)
- Google OAuth (Writing Suite login)
- Postgres (users / sessions)
- Buy Me a Coffee (paid access)

---

## Before you deploy

1. **Cursor API key** — [cursor.com/dashboard/api](https://cursor.com/dashboard/api)
2. **Postgres** — Render Postgres or [Neon](https://neon.tech)
3. **Google Cloud OAuth** — [console.cloud.google.com](https://console.cloud.google.com/)
4. **Buy Me a Coffee** page + membership (~10 PLN/month)
5. **GitHub** + Git (optional but recommended)

---

## Step 1: Put the project on GitHub

```powershell
cd C:\Users\karol\Desktop\LingoSpark
git init
git add .
git commit -m "LingoSpark: auth and Buy Me a Coffee paywall"
```

Create a repo on GitHub, then:

```powershell
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/lingospark.git
git push -u origin main
```

Never commit `.env`.

---

## Step 2: Deploy on Render

1. [render.com](https://render.com) → **New → Web Service** (or Blueprint)
2. Connect the `lingospark` repo
3. **Build:** `npm install` · **Start:** `npm start` · **Node 22.13+**
4. Add a **Postgres** database and copy `DATABASE_URL` into the web service
5. Set environment variables (see below)
6. Deploy

URL example: `https://lingospark.onrender.com`

### Environment variables

| Variable | Example / notes |
|----------|-----------------|
| `CURSOR_API_KEY` | from Cursor dashboard |
| `DATABASE_URL` | from Render Postgres |
| `SESSION_SECRET` | long random string |
| `APP_BASE_URL` | `https://your-app.onrender.com` |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth secret |
| `GOOGLE_CALLBACK_URL` | `https://your-app.onrender.com/auth/google/callback` |
| `ADMIN_EMAIL` | your Gmail (admin panel) |
| `BMC_PAYMENT_URL` | Buy Me a Coffee membership/checkout link |
| `BMC_WEBHOOK_SECRET` | from BMC Integrations → Webhooks |
| `NODE_ENV` | `production` |

### Google OAuth setup

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client (Web)
2. Authorized redirect URIs: your `GOOGLE_CALLBACK_URL` (and localhost for local testing)
3. OAuth consent screen: add your app; for testing, add test users

### Buy Me a Coffee setup

1. Create a membership (~10 PLN/month) or one-time Extra (~10 PLN for 30 days)
2. Copy the payment page URL → `BMC_PAYMENT_URL`
3. Studio → Integrations → Webhooks → endpoint:
   `https://your-app.onrender.com/api/billing/bmc-webhook`
4. Enable events: `membership.started`, `membership.updated`, `membership.cancelled`, `membership.paused`, and/or donation/extra purchase events
5. Copy signing secret → `BMC_WEBHOOK_SECRET`

Students must pay with the **same email** as their Google account (or you Approve them in Admin).

---

## How access works

| Path | Result |
|------|--------|
| Admin Approves user at `/admin.html` | Writing Suite unlocked until Revoke |
| Buy Me a Coffee membership | Unlocked while membership active |
| One-time BMC purchase | Unlocked for 30 days |
| No access | Play Now shows Sign in / Buy Access only (no “ask teacher” message) |

---

## Local testing

1. Copy `.env.example` → `.env` and fill values
2. `npm install` && `npm start`
3. Open `http://localhost:3000`
4. Admin: sign in with `ADMIN_EMAIL` → open `/admin.html`

---

## Updating after code changes

```powershell
git add .
git commit -m "Describe your change"
git push
```

Render redeploys automatically. Hard-refresh the site (`Ctrl+F5`).
