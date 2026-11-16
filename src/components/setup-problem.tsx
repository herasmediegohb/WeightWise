import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { DbProblem } from "@/lib/db-errors";

export function SetupProblem({ problem }: { problem: DbProblem }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <WarningCircle size={40} weight="fill" className="text-warn" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{problem.title}</h1>
      <p className="mt-3 leading-relaxed text-muted">{problem.fix}</p>
      {problem.code && (
        <p className="mt-4 text-sm text-muted">
          Error code: <code className="font-mono text-fg">{problem.code}</code>
        </p>
      )}
      <p className="mt-6 text-sm text-muted">
        Your data is safe. Once it&apos;s fixed, reload this page.{" "}
        <Link href="/status" className="font-medium text-accent underline">
          Check setup status
        </Link>
      </p>
    </main>
  );
}
