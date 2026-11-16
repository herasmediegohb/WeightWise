// Applies pending database migrations. Runs before `next build` on Vercel.
// Without DATABASE_URL (local dev) it does nothing: the embedded database
// migrates itself on first use.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] DATABASE_URL not set, skipping.");
  process.exit(0);
}
const client = postgres(url, { prepare: false, max: 1 });
try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("[migrate] Database is up to date.");
} finally {
  await client.end();
}
