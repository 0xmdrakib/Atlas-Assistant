# Atlas Assistant

*Stop doomscrolling. Start reading **signal**.*

Atlas Assistant is a calm, high‑signal news portal that turns chaos into clarity.

**Live app:** https://atlasassistant.online

---

## Features

### 8 focused tabs (huge international news, in one place)
- Global
- Tech
- Innovators
- Early Signals
- Great Creators
- Universe
- History
- Faith

### Filters that actually help
Pick a **Country** + **Topic** + **time window (1d / 7d)** and Atlas curates the feed using **scoring + caps** (so you don’t get a junk flood).

### AI experience
- **1‑click AI Digest** (daily/weekly context in one summary):
  - Overview → Themes → Highlights → Why it matters → Watchlist  
  - Optional **text‑to‑speech** if you’re short on time
- **Per‑item AI summaries** + key points
- **Listen mode** (text‑to‑speech)
- **Multi‑language UI** (broad language support)

### Freshness
- Updates hourly

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root. then fill all env from [.env.example](./.env.example).

### 3. One-command setup (DB + sources + ingest)

```bash
npm run setup
```

### 4. Run the development server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### Useful scripts

```bash
npm run ingest        # run one ingest pass
npm run sources:sync  # sync source list
npm run db:migrate    # prisma db push --skip-generate
npm run db:seed       # seed the database
```

---

## License

This project is licensed under the [MIT License](./LICENSE).
