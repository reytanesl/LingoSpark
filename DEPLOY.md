# Deploy LingoSpark for Students

Students only need a **browser** and your public URL. They do not install anything and do not need API keys.

You host one server with your `CURSOR_API_KEY`. Usage bills to your Cursor account.

---

## Before you deploy

1. **Cursor API key** — [cursor.com/dashboard/api](https://cursor.com/dashboard/api)
2. **GitHub account** — [github.com](https://github.com)
3. **Git** on your PC (if not installed): [git-scm.com/download/win](https://git-scm.com/download/win)

---

## Step 1: Put the project on GitHub

Open PowerShell in the LingoSpark folder:

```powershell
cd C:\Users\karol\Desktop\LingoSpark
git init
git add .
git commit -m "LingoSpark: ready for deployment"
```

On GitHub: **New repository** → name it `lingospark` → create (no README).

Then connect and push (replace `YOUR_USERNAME`):

```powershell
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/lingospark.git
git push -u origin main
```

**Important:** `.env` is in `.gitignore` and will not be uploaded. Never commit your API key.

**No Git?** On GitHub, use **Add file → Upload files** and upload everything except `node_modules` and `.env`.

---

## Step 2A: Deploy on Render (recommended, free tier)

1. Go to [render.com](https://render.com) and sign up (GitHub login works).
2. **New → Blueprint** (or **New → Web Service**).
3. Connect your `lingospark` GitHub repo.
4. If using **Blueprint**, Render reads `render.yaml` automatically.
5. If using **Web Service** manually:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
6. Under **Environment**, add:
   - `CURSOR_API_KEY` = your key (mark as secret)
   - `NODE_VERSION` = `22.13.0` (if not set by Blueprint)
7. Click **Deploy**.

When the deploy finishes, Render gives you a URL like:

```
https://lingospark.onrender.com
```

Share that link with students.

### Render free tier notes

- The app **sleeps after ~15 minutes** of no traffic. First visit after sleep may take 30–60 seconds to wake up.
- Writing Suite rounds can take **10–20 seconds** — tell students to wait for the spinner.
- For heavier classroom use, consider a paid instance.

---

## Step 2B: Deploy on Railway (alternative)

1. Go to [railway.app](https://railway.app) and sign up with GitHub.
2. **New Project → Deploy from GitHub repo** → select `lingospark`.
3. Railway auto-detects Node from `package.json`.
4. Open the service → **Variables** → add:
   - `CURSOR_API_KEY` = your key
5. **Settings → Networking → Generate Domain** to get a public URL.

Share the Railway URL with students.

---

## Step 3: Verify before sharing

Open your public URL and check:

1. Home page loads with logo and accordions.
2. Visit `https://YOUR-URL/api/health` — should show `"cursorConfigured": true`.
3. Play one **Writing Suite** game — wait up to 20 seconds for AI content.

---

## What to tell students

> Open **https://YOUR-URL** in Chrome, Edge, or Firefox.
>
> - **Vocab Review:** paste your word list on Setup, then play.
> - **Writing Suite:** no login or API key needed.
> - **Team Challenge:** opens external Canva games in a new tab.
>
> If the page is slow the first time, wait a minute (free hosting may be waking up).

---

## Updating the app later

After you change files locally:

```powershell
git add .
git commit -m "Describe your change"
git push
```

Render and Railway redeploy automatically from GitHub.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Writing Suite says server/key error | Set `CURSOR_API_KEY` in host environment and redeploy |
| `/api/health` shows `cursorConfigured: false` | Key missing or typo in env vars |
| Deploy fails on Node version | Set `NODE_VERSION=22.13.0` |
| Very slow first load | Free Render tier waking from sleep — normal |
| Generation timeout | Upgrade plan or retry; prompts can take 15–20s |

---

## Cost

- **Hosting:** Render free tier or Railway trial/credits.
- **AI:** Cursor SDK usage on your account — monitor at [cursor.com/dashboard/usage](https://cursor.com/dashboard/usage).
