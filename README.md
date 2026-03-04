# Atlas Assistant

*Stop doomscrolling. Start reading **signal**.*

Atlas Assistant is a calm, high‑signal news portal that turns chaos into clarity.

**Live demo:** https://atlasassistant.online

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

## Quick start (local dev)

```bash
npm install
npm run dev
```

### One-command setup (DB + sources + ingest)

```bash
npm run setup
```

### Useful scripts

```bash
npm run ingest        # run one ingest pass
npm run ingest:loop   # keep ingesting in a loop
npm run sources:sync  # sync source list
npm run db:migrate    # prisma db push --skip-generate
npm run db:seed       # seed the database
```

---

## License

MIT — see the `LICENSE` file.

---

## Notes

This project is **free to use** right now — try it:
https://atlasassistant.online
[README.professional.md](https://github.com/user-attachments/files/25731131/README.professional.md)
