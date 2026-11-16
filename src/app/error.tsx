"use client";

import Link from "next/link";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">WeightWise couldn&apos;t load</h1>
      <p className="mt-3 leading-relaxed text-muted">
        The setup status page checks the password, database and AI key and says what to fix.
      </p>
      {error.digest && (
        <p className="mt-4 text-sm text-muted">
          Error reference: <code className="font-mono text-fg">{error.digest}</code>
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <Link href="/status" className="inline-flex h-11 items-center rounded-2xl bg-lime px-4 font-semibold text-on-lime">
          Check setup status
        </Link>
        <button type="button" onClick={reset} className="h-11 rounded-2xl border border-border bg-surface-2 px-4 font-semibold">
          Try again
        </button>
      </div>
    </main>
  );
}
