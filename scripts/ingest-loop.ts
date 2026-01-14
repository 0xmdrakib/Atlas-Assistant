import { ingestOnce } from "@/lib/ingest";

const minutes = Number(process.env.INGEST_EVERY_MINUTES || "30");
const ms = minutes * 60 * 1000;

console.log(`Ingest loop every ${minutes} minutes...`);

async function tick() {
  try {
    const r = await ingestOnce();
    console.log(new Date().toISOString(), r);
  } catch (e) {
    console.error("Ingest failed", e);
  }
}
await tick();
setInterval(tick, ms);
