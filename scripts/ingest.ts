import nextEnv from "@next/env";
import { ingestOnce } from "@/lib/ingest";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const res = await ingestOnce();
console.log(res);
