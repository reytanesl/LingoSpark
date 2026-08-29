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
4. **Buy Me a Coffee** — shop Extras: **$3 = 7 days**, **$10 = 30 days**, **$70 = 365 days** (BMC is USD-only; site shows PLN)
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
| `BMC_PAYMENT_URL` | `https://buymeacoffee.com/lingospark/extras` |
| `BMC_WEEK_URL` | optional direct Extra for the week plan |
| `BMC_MONTH_URL` | optional direct Extra for the month plan |
| `BMC_YEAR_URL` | optional direct Extra for the year plan |
| `BMC_WEBHOOK_SECRET` | from BMC Integrations → Webhooks |
| `NODE_ENV` | `production` |

### Google OAuth setup

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client (Web)
2. Authorized redirect URIs: your `GOOGLE_CALLBACK_URL` (and localhost for local testing)
3. OAuth consent screen: add your app; for testing, add test users

### Buy Me a Coffee setup

1. Create three paid Extras that match the site copy (name them clearly):
   - **Week — $3** → webhook grants **7 days** (shown as **12 zł**)
   - **Month — $10** → webhook grants **30 days** (shown as **40 zł**)
   - **Year — $70** → webhook grants **365 days** (shown as **280 zł**, best value)
   PLN is display-only (~4 zł / $1). Checkout stays USD until Stripe / Przelewy24.
2. Copy the shop URL → `BMC_PAYMENT_URL` (use `https://buymeacoffee.com/lingospark/extras`). Optional: set `BMC_WEEK_URL` / `BMC_MONTH_URL` / `BMC_YEAR_URL` to each Extra’s direct link so plan cards skip the listing.
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
| BMC payment ≈ **$70** (or Extra titled Year / Annual) | Premium for **365 days** (stacks the same way) |
| BMC refund | BMC premium removed (admin Approve untouched) |
| Membership cancel/pause | Remaining paid days kept until `access_until` |
| No access | Play Now shows the access plans (sign in, then buy) |

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
