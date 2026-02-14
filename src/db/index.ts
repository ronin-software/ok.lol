import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import * as schema from "./schema";

// Persist across HMR in development.
const globalStore = globalThis as unknown as {
  __pg?: ReturnType<typeof postgres>;
};
const client = (globalStore.__pg ??= postgres(env.DATABASE_URL));

/** Drizzle client bound to all schema tables. */
export const db = drizzle(client, { schema });
