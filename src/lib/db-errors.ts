/**
 * Turns a database connection error into a plain-language cause and fix.
 * Never includes the connection string or password, so it is safe to show.
 */
export type DbProblem = { title: string; fix: string; code?: string };

type ErrLike = { code?: string; message?: string; cause?: unknown; errors?: unknown[] };

function flatten(err: unknown): ErrLike[] {
  const out: ErrLike[] = [];
  const seen = new Set<unknown>();
  const walk = (e: unknown) => {
    if (!e || typeof e !== "object" || seen.has(e)) return;
    seen.add(e);
    out.push(e as ErrLike);
    walk((e as ErrLike).cause);
    for (const x of (e as ErrLike).errors ?? []) walk(x);
  };
  walk(err);
  return out;
}

export function describeConnectionString(url: string | undefined): string {
  if (!url) return "not set";
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".pooler.supabase.com")) {
      return u.port === "6543" ? "Supabase transaction pooler" : `Supabase pooler on port ${u.port || "5432"}`;
    }
    if (/^db\.[a-z0-9]+\.supabase\.co$/.test(u.hostname)) return "Supabase direct connection";
    if (u.hostname.endsWith(".neon.tech")) return "Neon";
    return "custom Postgres";
  } catch {
    return "not a valid connection string";
  }
}

/** Problems that can be spotted from the string alone, before connecting. */
export function checkConnectionString(url: string | undefined): DbProblem | null {
  if (!url) {
    return {
      title: "DATABASE_URL isn't set",
      fix: "In Vercel, open your project, go to Settings → Environment Variables, add DATABASE_URL with your Supabase Transaction pooler connection string, then redeploy.",
    };
  }
  if (/\[|\]|YOUR-PASSWORD/i.test(url)) {
    return {
      title: "The connection string still has the password placeholder in it",
      fix: "Replace [YOUR-PASSWORD], including the square brackets, with your Supabase database password. Update DATABASE_URL in Vercel and redeploy.",
    };
  }
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return {
      title: "DATABASE_URL isn't a valid connection string",
      fix: "Copy it again from Supabase (Connect → Transaction pooler). If your database password contains symbols such as @ # / ? or %, reset it in Supabase to one with only letters and numbers.",
    };
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) {
    return {
      title: "DATABASE_URL should start with postgresql://",
      fix: "Copy the full string from Supabase (Connect → Transaction pooler), starting with postgresql://.",
    };
  }
  if (/^db\.[a-z0-9]+\.supabase\.co$/.test(u.hostname)) {
    return {
      title: "This is Supabase's direct connection, which Vercel can't reach",
      fix: "In Supabase click Connect and copy the Transaction pooler string instead. Its address ends in pooler.supabase.com:6543. Update DATABASE_URL in Vercel and redeploy.",
    };
  }
  return null;
}

export function classifyDbError(err: unknown): DbProblem {
  const all = flatten(err);
  const codes = all.map((e) => e.code).filter(Boolean) as string[];
  const text = all.map((e) => e.message ?? "").join(" | ");
  const has = (c: string) => codes.includes(c);

  if (has("28P01") || /password authentication failed/i.test(text)) {
    return {
      title: "Supabase rejected the database password",
      code: "28P01",
      fix: "The password inside DATABASE_URL is wrong. In Supabase go to Project Settings → Database → Reset database password, choose one with only letters and numbers, put it into the connection string, update DATABASE_URL in Vercel and redeploy.",
    };
  }
  if (/tenant or user not found/i.test(text)) {
    return {
      title: "Supabase doesn't recognize the user in the connection string",
      fix: "The user part must look like postgres.abcdefgh (with your project ID after the dot). Copy the whole Transaction pooler string again from Supabase → Connect.",
    };
  }
  if (has("ENOTFOUND") || has("EAI_AGAIN")) {
    return {
      title: "The database address in DATABASE_URL doesn't exist",
      code: codes.find((c) => c === "ENOTFOUND" || c === "EAI_AGAIN"),
      fix: "Copy the Transaction pooler string again from Supabase → Connect. Make sure nothing was cut off when pasting.",
    };
  }
  if (["ETIMEDOUT", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "ECONNRESET", "CONNECT_TIMEOUT"].some(has)) {
    return {
      title: "Couldn't reach the database",
      code: codes.find((c) => /^E|CONNECT/.test(c)),
      fix: "Your Supabase project may be paused: open it in Supabase and click Restore if you see that option. Otherwise check DATABASE_URL is the Transaction pooler string (ending in :6543/postgres).",
    };
  }
  if (has("3D000")) {
    return {
      title: "The database name in DATABASE_URL doesn't exist",
      code: "3D000",
      fix: "The string should end in /postgres. Copy it again from Supabase → Connect → Transaction pooler.",
    };
  }
  if (has("42P01")) {
    return {
      title: "The database is reachable but the app's tables are missing",
      code: "42P01",
      fix: "In Vercel go to Deployments, open the menu (⋯) on the latest one and choose Redeploy. Each deploy creates the tables.",
    };
  }
  if (has("SELF_SIGNED_CERT_IN_CHAIN") || /ssl|certificate/i.test(text)) {
    return {
      title: "The secure connection to the database failed",
      fix: "Copy the Transaction pooler string again from Supabase → Connect and redeploy. If it keeps happening, send me the code shown below.",
    };
  }
  return {
    title: "The database returned an unexpected error",
    code: codes[0],
    fix: "Send me the code shown below (if any) and the time it happened, and I'll look into it.",
  };
}

/** SSL setting for postgres.js: required for hosted databases, off for local ones. */
export function sslFor(url: string): false | "require" | undefined {
  try {
    const u = new URL(url);
    if (u.searchParams.has("sslmode")) return undefined; // let the string decide
    return ["localhost", "127.0.0.1", "::1"].includes(u.hostname) ? false : "require";
  } catch {
    return undefined;
  }
}
