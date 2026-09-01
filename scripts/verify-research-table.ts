import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to verify the research table.");

const client = postgres(connectionString, {
  prepare: false,
  ssl: process.env.DATABASE_SSL === "require" ? "require" : undefined,
});

try {
  const rows = await client<{ relname: string; rowsecurity: boolean }[]>`
    select c.relname, c.relrowsecurity as rowsecurity
    from pg_class c
    inner join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('league_research_picks', 'access_requests')
  `;
  if (rows.length !== 2 || rows.some((row) => row.rowsecurity !== true)) {
    throw new Error("Research notes or access requests table/RLS is missing.");
  }
  console.log("Research notes and access requests tables with RLS verified.");
} finally {
  await client.end();
}
