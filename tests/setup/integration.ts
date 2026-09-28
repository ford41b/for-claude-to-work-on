import { config } from "dotenv";

// Integration tests run against the local Supabase stack (`npm run db:start`).
config({ path: ".env.local", quiet: true });
config({ path: ".env.test", override: true, quiet: true });
process.env.TZ = "UTC";
