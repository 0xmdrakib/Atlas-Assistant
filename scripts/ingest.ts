import { ingestOnce } from "@/lib/ingest";
const res = await ingestOnce();
console.log(res);
