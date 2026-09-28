import { z } from "zod";

/**
 * Environment configuration, validated once. Public values are safe for the browser; server
 * values must only be read in server code (route handlers, server components, the worker).
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
  DATABASE_URL: z.string().min(10),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  AI_PROVIDER: z.enum(["gemini", "fixture", "none"]).optional(),
  ALLOW_FIXTURE_AI: optionalString,
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL_MEDIA: z.string().default("gemini-3.8-flash"),
  GEMINI_MODEL_SYNTHESIS: z.string().default("gemini-3.8-flash"),
  GEMINI_MODEL_FAST: z.string().default("gemini-3.1-flash-lite"),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  YOUTUBE_API_KEY: optionalString,
  BIBLE_PROVIDER: z.enum(["none", "api_bible"]).default("none"),
  API_BIBLE_KEY: optionalString,
  API_BIBLE_BIBLE_ID: optionalString,
  API_BIBLE_TRANSLATION_LABEL: optionalString,
  CRON_SECRET: optionalString,
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(3),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema> & PublicEnv & { aiProvider: "gemini" | "fixture" | "none" };

let publicCache: PublicEnv | null = null;
let serverCache: ServerEnv | null = null;

export function publicEnv(): PublicEnv {
  if (publicCache) return publicCache;
  // Next inlines NEXT_PUBLIC_* only when referenced literally.
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (!parsed.success) {
    throw new Error(`Invalid public environment: ${z.prettifyError(parsed.error)}`);
  }
  publicCache = parsed.data;
  return publicCache;
}

export function serverEnv(): ServerEnv {
  if (serverCache) return serverCache;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${z.prettifyError(parsed.error)}`);
  }
  const data = parsed.data;
  const aiProvider = data.AI_PROVIDER ?? (data.GEMINI_API_KEY ? "gemini" : "none");
  if (aiProvider === "gemini" && !data.GEMINI_API_KEY) {
    throw new Error("AI_PROVIDER=gemini requires GEMINI_API_KEY");
  }
  if (aiProvider === "fixture" && data.ALLOW_FIXTURE_AI !== "true") {
    throw new Error("AI_PROVIDER=fixture is for automated tests only and requires ALLOW_FIXTURE_AI=true");
  }
  serverCache = { ...data, ...publicEnv(), aiProvider };
  return serverCache;
}

/** For tests only. */
export function resetEnvCacheForTests() {
  publicCache = null;
  serverCache = null;
}
