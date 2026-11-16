"use client";

import { useState } from "react";
import { Minus, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { deleteWeight, logWeight } from "@/app/actions";
import { Button, Field, IconButton, Sheet } from "./ui";

export type WeightSheetState = {
  /** Existing entry when editing. */
  id?: number;
  date: string;
  weightLb: number | null;
  note?: string | null;
} | null;

/** Remounts the form each time the sheet opens, so it always starts fresh. */
export function WeightSheet({
  state,
  onClose,
  today,
}: {
  state: WeightSheetState;
  onClose: () => void;
  today: string;
}) {
  const [shown, setShown] = useState(state);
  const [session, setSession] = useState(0);
  if (state && state !== shown) {
    setShown(state);
    setSession(session + 1);
  }
  if (!shown) return null;
  return <WeightForm key={session} state={shown} open={state !== null} onClose={onClose} today={today} />;
}

function WeightForm({
  state,
  open,
  onClose,
  today,
}: {
  state: NonNullable<WeightSheetState>;
  open: boolean;
  onClose: () => void;
  today: string;
}) {
  const [date, setDate] = useState(state.date);
  const [value, setValue] = useState(state.weightLb !== null ? String(state.weightLb) : "");
  const [note, setNote] = useState(state.note ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  function nudge(delta: number) {
    const n = Number(value);
    if (!Number.isFinite(n) || !value) return;
    setValue((Math.round((n + delta) * 10) / 10).toFixed(1));
  }

  async function save() {
    const n = Number(value);
    if (!value || !Number.isFinite(n) || n < 50 || n > 800) {
      setError("Enter a weight between 50 and 800 lb.");
      return;
    }
    setBusy("save");
    const res = await logWeight({ date, weightLb: Math.round(n * 10) / 10, note });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    toast.success(date === today ? "Weight logged" : "Weight saved");
    onClose();
  }

  async function remove() {
    if (!state.id) return;
    setBusy("delete");
    await deleteWeight(state.id);
    setBusy(null);
    toast.success("Weigh-in deleted");
    onClose();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={state.id ? "Edit weigh-in" : "Log weight"}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex items-center justify-center gap-2 py-4">
          <IconButton type="button" label="Decrease by 0.2 lb" onClick={() => nudge(-0.2)} className="bg-surface-2">
            <Minus size={20} weight="bold" />
          </IconButton>
          <div className="relative">
            <label htmlFor="weight-input" className="sr-only">
              Weight in pounds
            </label>
            <input
              id="weight-input"
              type="number"
              inputMode="decimal"
              step="0.1"
              autoFocus
              placeholder="0.0"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "weight-error" : undefined}
              className="display w-44 bg-transparent text-center text-6xl font-semibold text-fg placeholder:text-muted/40 focus:outline-none focus-visible:outline-none"
            />
            <span className="absolute -right-5 bottom-2 text-base font-medium text-muted">lb</span>
          </div>
          <IconButton type="button" label="Increase by 0.2 lb" onClick={() => nudge(0.2)} className="ml-4 bg-surface-2">
            <Plus size={20} weight="bold" />
          </IconButton>
        </div>
        {error && (
          <p id="weight-error" role="alert" className="mb-3 text-center text-sm text-danger">
            {error}
          </p>
        )}
        <div className="space-y-4">
          <Field label="Date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} disabled={Boolean(state.id)} />
          <Field label="Note" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} />
        </div>
        <div className="mt-6 flex gap-3">
          {state.id && (
            <Button type="button" variant="danger" size="lg" onClick={remove} loading={busy === "delete"} disabled={busy !== null}>
              Delete
            </Button>
          )}
          <Button type="submit" size="lg" className="flex-1" loading={busy === "save"} disabled={busy !== null}>
            Save weight
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
