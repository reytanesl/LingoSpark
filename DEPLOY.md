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
4. **Buy Me a Coffee** — shop Extras: **$3 = 7 days**, **$10 = 30 days** (BMC is USD-only)
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

1. Create two paid options that match the site copy:
   - **$3** → weekly access (webhook grants **7 days**)
   - **$10** → monthly access (webhook grants **30 days**)
   Use Extras (shop items) and/or memberships — name them clearly (e.g. “Week — $3”, “Month — $10”).
2. Copy the payment page URL → `BMC_PAYMENT_URL`
3. Studio → Integrations → Webhooks → endpoint:
   `https://lingospark.study/api/billing/bmc-webhook`
4. Enable at least: `donation.created`, `extra_purchase.created`, `membership.started`, `membership.updated`, and the matching `*.refunded` events
5. Copy signing secret → `BMC_WEBHOOK_SECRET`

Students must pay with the **same email** as their Google account (or you Approve them in Admin).

Access is automatic after a successful webhook: Writing Suite **and** Primary English use the same premium flag.

---

## How access works

| Path | Result |
|------|--------|
| BMC payment period ends | Premium auto-revoked (`access_source` cleared; status **Expired** in Admin) |
| Admin Approves user at `/admin.html` | Writing Suite + Primary English until you Revoke (BMC does not change this) |
| BMC payment ≈ **$3** | Premium for **7 days** (stacks if they renew while still active) |
| BMC payment ≈ **$10** | Premium for **30 days** (stacks the same way) |
| BMC refund | BMC premium removed (admin Approve untouched) |
| Membership cancel/pause | Remaining paid days kept until `access_until` |
| No access | Play Now shows Sign in / Buy Access only |

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
