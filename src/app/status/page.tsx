import Link from "next/link";
import { CheckCircle, MinusCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "@/components/nav";
import { aiConfigured } from "@/lib/ai";
import { authConfigured } from "@/lib/auth";
import { describeConnectionString } from "@/lib/db-errors";
import { checkDatabase } from "@/lib/db-health";

export const metadata = { title: "Setup status" };
export const dynamic = "force-dynamic";

type Check = { name: string; state: "ok" | "bad" | "off"; detail: string; fix?: string };

/**
 * Public page that says which parts of the setup work. It shows only
 * yes/no states and plain-language fixes, never any secret values.
 */
export default async function StatusPage() {
  const db = await checkDatabase();
  const checks: Check[] = [
    authConfigured()
      ? { name: "App password", state: "ok", detail: "APP_PASSWORD is set." }
      : {
          name: "App password",
          state: "bad",
          detail: "APP_PASSWORD isn't set, so the app stays locked.",
          fix: "Add APP_PASSWORD in Vercel → Settings → Environment Variables, then redeploy.",
        },
    db.ok
      ? { name: "Database", state: "ok", detail: `Connected (${describeConnectionString(process.env.DATABASE_URL)}) and tables are in place.` }
      : {
          name: "Database",
          state: "bad",
          detail: `${db.problem.title}${db.problem.code ? ` (code ${db.problem.code})` : ""}. Connection type: ${describeConnectionString(process.env.DATABASE_URL)}.`,
          fix: db.problem.fix,
        },
    aiConfigured()
      ? { name: "AI features", state: "ok", detail: "ANTHROPIC_API_KEY is set. A wrong key only shows up when you use an AI feature." }
      : {
          name: "AI features",
          state: "off",
          detail: "ANTHROPIC_API_KEY isn't set. Everything else works; food estimates and the coach stay off.",
          fix: "Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy.",
        },
  ];
  const allGood = checks.every((c) => c.state !== "bad");

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12">
      <Logo size={40} />
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">Setup status</h1>
      <p className="mt-2 text-muted">
        {allGood ? "Everything the app needs is working." : "Something needs fixing before the app can load."}
      </p>
      <ul className="mt-6 space-y-3">
        {checks.map((c) => (
          <li key={c.name} className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
            {c.state === "ok" ? (
              <CheckCircle size={24} weight="fill" className="shrink-0 text-accent" aria-label="Working" />
            ) : c.state === "bad" ? (
              <WarningCircle size={24} weight="fill" className="shrink-0 text-danger" aria-label="Needs fixing" />
            ) : (
              <MinusCircle size={24} weight="fill" className="shrink-0 text-muted" aria-label="Off" />
            )}
            <div className="min-w-0 text-[15px]">
              <p className="font-semibold">{c.name}</p>
              <p className="mt-0.5 text-muted">{c.detail}</p>
              {c.fix && <p className="mt-2">{c.fix}</p>}
            </div>
          </li>
        ))}
      </ul>
      {allGood && (
        <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-lime px-4 font-semibold text-on-lime">
          Open WeightWise
        </Link>
      )}
    </main>
  );
}
