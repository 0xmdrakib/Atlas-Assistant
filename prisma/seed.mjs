import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function readJSON(rel) {
  const p = path.join(process.cwd(), rel);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function main() {
  const sources = readJSON("sources/seed-sources.json");
  for (const s of sources) {
    await prisma.source.upsert({
      where: { url: s.url },
      update: {
        section: s.section,
        name: s.name,
        type: s.type || "rss",
        country: s.country || null,
        trustScore: s.trustScore ?? 60,
        enabled: s.enabled ?? true,
      },
      create: {
        section: s.section,
        name: s.name,
        type: s.type || "rss",
        url: s.url,
        country: s.country || null,
        trustScore: s.trustScore ?? 60,
        enabled: s.enabled ?? true,
      },
    });
  }
  console.log(`Seeded sources: ${sources.length} ✅`);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
