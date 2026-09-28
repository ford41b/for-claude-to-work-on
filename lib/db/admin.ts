import postgres from "postgres";
import { serverEnv } from "@/lib/config/env";

/**
 * Privileged Postgres connection (bypasses RLS). Used only by the job worker and a small,
 * audited set of server functions that have already authorized the caller. Every query must
 * scope by an explicit user_id / sermon_id derived from an authorized request or job row.
 */

type Sql = postgres.Sql<{ bigint: number }>;
/** A plain connection or a transaction handle. */
type SqlLike = Sql | postgres.TransactionSql<{ bigint: number }>;

const globalForDb = globalThis as unknown as { __sermonSql?: Sql };

export function db(): Sql {
  if (typeof window !== "undefined") throw new Error("db() must not run in the browser");
  if (!globalForDb.__sermonSql) {
    const env = serverEnv();
    globalForDb.__sermonSql = postgres(env.DATABASE_URL, {
      max: env.DATABASE_POOL_MAX,
      idle_timeout: 20,
      connect_timeout: 10,
      // Supavisor transaction pooling does not support prepared statements.
      prepare: false,
      onnotice: () => {},
      types: {
        // Return int8 as a JS number: sizes and counts here stay far below 2^53.
        bigint: {
          to: 20,
          from: [20],
          serialize: (x: number) => String(x),
          parse: (x: string) => Number(x),
        },
      },
    });
  }
  return globalForDb.__sermonSql!;
}

export async function closeDb() {
  if (globalForDb.__sermonSql) {
    await globalForDb.__sermonSql.end({ timeout: 5 });
    globalForDb.__sermonSql = undefined;
  }
}

export type { Sql, SqlLike };
