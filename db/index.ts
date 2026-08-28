import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

function readDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is unavailable. Add the Supabase transaction-pooler connection string to the server environment."
    );
  }

  return databaseUrl;
}

export function getDb() {
  if (database) return database;

  client = postgres(readDatabaseUrl(), {
    max: 1,
    prepare: false,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    connect_timeout: 10,
    idle_timeout: 20,
  });
  database = drizzle(client, { schema });

  return database;
}

export async function closeDb() {
  if (client) await client.end();
  client = undefined;
  database = undefined;
}
