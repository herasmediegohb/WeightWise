"use client";

import { useRef, useState } from "react";
import { ClockCounterClockwise, CloudCheck, CloudSlash, DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { backupNow, restoreBackup, restoreFromFile } from "@/app/actions";
import { Button, Card, Empty, Sheet } from "./ui";

export type BackupRow = { id: number; reason: string; sizeBytes: number; createdAt: string };

const REASON: Record<string, string> = {
  weekly: "Weekly",
  manual: "Manual",
  "before-restore": "Before a restore",
};

/** Formatted in the user's time zone on both server and client, so the two renders match. */
function when(iso: string, tz: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: tz }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(iso));
  }
}

const size = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

type Pending = { kind: "backup"; row: BackupRow } | { kind: "file"; name: string; text: string };

export function BackupSettings({ backups, offsite, tz }: { backups: BackupRow[]; offsite: boolean; tz: string }) {
  const [busy, setBusy] = useState<"now" | "restore" | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function confirmRestore() {
    if (!pending) return;
    setBusy("restore");
    const res = pending.kind === "backup" ? await restoreBackup(pending.row.id) : await restoreFromFile(pending.text);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setPending(null);
    toast.success(`Restored ${res.weighIns} weigh-ins and ${res.foods} food entries`);
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <ClockCounterClockwise size={18} weight="bold" className="text-accent" aria-hidden />
          Backups
        </h2>
        <Button
          size="sm"
          variant="secondary"
          loading={busy === "now"}
          onClick={async () => {
            setBusy("now");
            const res = await backupNow();
            setBusy(null);
            if (!res.ok) return toast.error(res.error);
            toast.success(res.offsite ? "Backed up, with an off-site copy" : "Backed up");
          }}
        >
          Back up now
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted">
        A backup is made automatically every week. The latest 10 are kept, and restoring always saves your current data first.
      </p>

      <div className="mt-3 flex gap-2.5 rounded-2xl bg-surface-2 p-3.5 text-sm">
        {offsite ? (
          <>
            <CloudCheck size={20} weight="fill" className="shrink-0 text-accent" aria-hidden />
            <p>
              <span className="font-medium">Off-site copies are on.</span>{" "}
              <span className="text-muted">Each backup is also saved privately in Vercel Blob storage, outside the database.</span>
            </p>
          </>
        ) : (
          <>
            <CloudSlash size={20} className="shrink-0 text-muted" aria-hidden />
            <p>
              <span className="font-medium">Off-site copies are off.</span>{" "}
              <span className="text-muted">
                Backups are kept in the database only. To also keep copies outside it: in Vercel open your project, go to Storage,
                create a Blob store, connect it to this project, then redeploy.
              </span>
            </p>
          </>
        )}
      </div>

      {backups.length === 0 ? (
        <Empty icon={<ClockCounterClockwise size={24} />} title="No backups yet" body="The first one is made this week, or tap Back up now." />
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {backups.slice(0, 6).map((b) => (
            <li key={b.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium tnum">{when(b.createdAt, tz)}</p>
                <p className="text-muted">
                  {REASON[b.reason] ?? b.reason} · {size(b.sizeBytes)}
                </p>
              </div>
              <a
                href={`/api/backup/${b.id}`}
                download
                aria-label={`Download the backup from ${when(b.createdAt, tz)}`}
                title="Download"
                className="grid size-11 place-items-center rounded-2xl text-muted hover:bg-surface-2 hover:text-fg"
              >
                <DownloadSimple size={18} />
              </a>
              <Button size="sm" variant="secondary" onClick={() => setPending({ kind: "backup", row: b })}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (fileRef.current) fileRef.current.value = "";
          if (f) setPending({ kind: "file", name: f.name, text: await f.text() });
        }}
      />
      <Button variant="ghost" className="mt-2 w-full" onClick={() => fileRef.current?.click()}>
        <UploadSimple size={18} aria-hidden />
        Restore from a file
      </Button>

      <Sheet
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Restore this backup?"
        description={
          pending?.kind === "backup"
            ? `All your current data is replaced with the backup from ${when(pending.row.createdAt, tz)}.`
            : pending
              ? `All your current data is replaced with the contents of ${pending.name}.`
              : undefined
        }
      >
        <p className="text-[15px] text-muted">
          Your current data is backed up first, so you can switch back from the list if this isn&apos;t what you wanted.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setPending(null)} disabled={busy === "restore"}>
            Keep current data
          </Button>
          <Button size="lg" className="flex-1" loading={busy === "restore"} onClick={confirmRestore}>
            Restore backup
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}
