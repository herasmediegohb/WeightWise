"use client";

import { Button } from "@/components/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-start justify-center">
      <h1 className="text-2xl font-semibold tracking-tight">This screen couldn&apos;t load</h1>
      <p className="mt-2 max-w-sm text-muted">
        Your data is safe. This is usually a brief connection problem with the database.
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
