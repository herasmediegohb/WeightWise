import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-start justify-center px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-muted">That page doesn&apos;t exist.</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-lime px-4 font-semibold text-on-lime">
        Go to Today
      </Link>
    </main>
  );
}
