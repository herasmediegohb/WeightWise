"use client";

import { useRef, useState } from "react";
import { UploadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { importCsvFiles, type ImportSummary } from "@/app/actions";
import { Button } from "./ui";

export function describeImport(s: ImportSummary): string {
  const parts = [
    s.weights && `${s.weights} weigh-ins`,
    s.foodDays && `${s.foodDays} days of calories`,
    s.waterDays && `${s.waterDays} days of water`,
    s.scans && `${s.scans} body scans`,
  ].filter(Boolean);
  return parts.length ? `Imported ${parts.join(", ")}.` : "Nothing in those files could be imported.";
}

export function ImportButton({
  onImported,
  variant = "secondary",
}: {
  onImported?: (s: ImportSummary) => void;
  variant?: "primary" | "secondary";
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const files = await Promise.all(
        [...list].map(async (f) => ({ name: f.name, text: await f.text() })),
      );
      const res = await importCsvFiles(files);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const msg = describeImport(res.summary);
      if (res.summary.skippedFiles.length) {
        toast.message(msg, {
          description: `Skipped ${res.summary.skippedFiles.length} file(s) with nothing this app uses.`,
        });
      } else toast.success(msg);
      onImported?.(res.summary);
    } catch {
      toast.error("Couldn't read those files. Check they are CSV exports and try again.");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".csv,text/csv"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      <Button type="button" variant={variant} loading={busy} onClick={() => ref.current?.click()}>
        <UploadSimple size={18} weight="bold" aria-hidden />
        Choose CSV files
      </Button>
    </>
  );
}
