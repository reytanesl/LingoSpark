# LingoSpark: Gamify Your Words

British Academic vocabulary and writing games for ESL learners.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env` and set `CURSOR_API_KEY` ([get a key](https://cursor.com/dashboard/api))
3. `npm start`
4. Open **http://localhost:3000**

**Vocab Review** runs in the browser. **Writing Suite** uses Cursor AI via the server — students never see your API key.

## Share with students

Deploy once, share one URL. See **[DEPLOY.md](DEPLOY.md)** for step-by-step instructions (Render or Railway).

Quick summary:

1. Push this folder to GitHub (without `.env`)
2. Deploy on [Render](https://render.com) or [Railway](https://railway.app)
3. Set `CURSOR_API_KEY` in the host’s environment variables
4. Share the public link with your class

## Project layout

| File | Purpose |
|------|---------|
| `index.html` | Full app UI and game logic |
| `server.js` | Static hosting + `/api/generate` (Cursor SDK) |
| `render.yaml` | One-click Render deploy config |
| `railway.toml` | Railway deploy hints |
| `Projekt bez nazwy.png` | Header logo |
