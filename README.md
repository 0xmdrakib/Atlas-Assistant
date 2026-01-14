# Atlas Assistant — Real MVP (v1)

A real product MVP:
- 6 sections (News, Universe+Faith, Innovators, Early Signals, Great Creators, History)
- Real sources (RSS) seeded into DB; ingestion runs every 30 minutes (cron-ready)
- Filters per section: Country, Category (topic), Days (1 / 7 / 30)
- AI features are optional & auto-enable when keys are added (no code edits)

## Sources (how the information pipeline works)
The app loads content from **RSS/Atom feeds**.

1) A small, hand-curated list lives in `sources/seed-sources.json`.
2) On setup, the app runs `npm run sources:sync` which pulls OPML feed packs (configured in `sources/packs.json`) and upserts them into your database.
3) The ingest job then fetches a rotating subset of sources each run (so it stays fast even with 1000+ feeds).

You can disable the auto-expansion anytime:
```env
SOURCE_SYNC_ENABLED=false
```

## Setup (Windows / PowerShell)
1) Copy `.env.example` → `.env` and fill DATABASE_URL + ADMIN_TOKEN
   - DATABASE_URL can be from Supabase Postgres (recommended) or Neon or any hosted Postgres.
2) Install + migrate + seed sources + ingest:
```powershell
npm install
npm run setup
npm run dev
```
Open: http://localhost:3000

## Enable AI later (no edits)
```env
AI_SUMMARY_ENABLED=true
AI_SUMMARY_PROVIDER=gemini
AI_SUMMARY_API_KEY=YOUR_KEY
AI_SUMMARY_MODEL=gemini-1.5-flash

AI_DISCOVERY_ENABLED=true
AI_DISCOVERY_PROVIDER=gemini
AI_DISCOVERY_API_KEY=YOUR_KEY
AI_DISCOVERY_MODEL=gemini-1.5-flash
```
Restart server → it starts automatically.

## Google Login (recommended for public launch)
For public use, AI endpoints should not be anonymous (cost + abuse). This project gates the **AI summary** endpoints behind Google login using NextAuth.

1) Create OAuth credentials in Google Cloud ("OAuth client ID", Web application)
2) Add authorized redirect URLs:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://YOUR_DOMAIN/api/auth/callback/google`
3) Set env vars:
```env
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="a-long-random-string"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

Now:
- If AI is **disabled**, the AI button stays disabled.
- If AI is **enabled** but the user is not signed in, clicking AI prompts login.

Extra:
- Selecting a non-English language triggers a Google sign-in prompt (translation is gated).
- Translation calls are not counted against the per-user daily AI quota.
- Daily quota is per-user and defaults to 100 AI calls.

### AI Digest (top summary)
When `AI_SUMMARY_*` is enabled, each section gets an **AI Digest** button at the top that summarizes the current feed window (1/7/30 days) in one click.

## Cron (every 30 minutes)
Call (protected):
`/api/cron/ingest?token=YOUR_ADMIN_TOKEN`

Example Vercel cron config (vercel.json):
```json
{
  "crons": [
    { "path": "/api/cron/ingest?token=YOUR_ADMIN_TOKEN", "schedule": "*/30 * * * *" }
  ]
}
```
