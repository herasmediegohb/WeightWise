// Applies pending database migrations. Runs before `next build` on Vercel.
// Without DATABASE_URL (local dev) it does nothing: the embedded database
// migrates itself on first use. On failure it prints a plain-language cause
// so the Vercel build log says what to fix.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.VERCEL) {
    fail(
      "DATABASE_URL isn't set.",
      "Add it in Vercel → Settings → Environment Variables (the Supabase Transaction pooler string), then redeploy.",
    );
  }
  console.log("[migrate] DATABASE_URL not set, skipping.");
  process.exit(0);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  fail(
    "DATABASE_URL isn't a valid connection string.",
    "Copy it again from Supabase → Connect → Transaction pooler. If your database password has symbols such as @ # / ? %, reset it to letters and numbers only.",
  );
}
if (/\[|\]|YOUR-PASSWORD/i.test(url)) {
  fail("DATABASE_URL still contains the [YOUR-PASSWORD] placeholder.", "Replace it, including the square brackets, with your database password.");
}
if (/^db\.[a-z0-9]+\.supabase\.co$/.test(parsed.hostname)) {
  fail(
    "DATABASE_URL is Supabase's direct connection, which Vercel can't reach.",
    "In Supabase click Connect and copy the Transaction pooler string (ends in pooler.supabase.com:6543/postgres).",
  );
}

// Same TLS rules as src/lib/db-errors.ts pgConnectionOptions().
const mode = parsed.searchParams.get("sslmode");
parsed.searchParams.delete("sslmode");
const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
const ssl = mode === "disable" || (local && !mode) ? false : { rejectUnauthorized: false };
const client = new pg.Client({ connectionString: parsed.toString(), ssl, connectionTimeoutMillis: 15_000 });
console.log(`[migrate] Connecting to ${parsed.hostname}:${parsed.port || 5432} ...`);
try {
  await client.connect();
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("[migrate] Database is up to date.");
} catch (err) {
  const code = err?.code ?? "";
  const msg = String(err?.message ?? "");
  if (code === "28P01" || /password authentication failed/i.test(msg)) {
    fail("Supabase rejected the database password.", "Reset it in Supabase (Project Settings → Database) to letters and numbers only, update DATABASE_URL, and redeploy.");
  } else if (/tenant or user not found/i.test(msg)) {
    fail("Supabase doesn't recognize the user.", "The user must look like postgres.<project id>. Copy the full Transaction pooler string again.");
  } else if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) {
    fail("The database address doesn't exist.", "Copy the Transaction pooler string again; part of it may be missing.");
  } else if (/ETIMEDOUT|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ECONNRESET/.test(code) || /timeout|terminated/i.test(msg)) {
    fail("Couldn't reach the database.", "If the Supabase project is paused, restore it. Otherwise make sure you used the Transaction pooler string.");
  }
  console.error(err);
  fail(`Migration failed${code ? ` (code ${code})` : ""}.`, "Send this build log to get help.");
} finally {
  await client.end().catch(() => {});
}

function fail(problem, fix) {
  console.error(`\n[migrate] ✖ ${problem}\n[migrate] → ${fix}\n`);
  process.exit(1);
}
