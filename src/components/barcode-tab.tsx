"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Barcode, Camera, Keyboard, Minus, Plus } from "@phosphor-icons/react";
import type { BarcodeProduct, FoodItem } from "@/db/schema";
import { normalizeBarcode, nutritionFor } from "@/lib/barcode";
import { cn, int, num } from "@/lib/utils";
import { Button, IconButton, Segmented, Spinner } from "./ui";

type Detector = { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

/** Native BarcodeDetector where the browser has one (Android), otherwise a WebAssembly one (iPhone). */
async function makeDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } })
    .BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      if (FORMATS.some((f) => supported.includes(f))) return new Native({ formats: FORMATS });
    } catch {
      // fall through to the WebAssembly detector
    }
  }
  const mod = await import("barcode-detector/ponyfill");
  mod.prepareZXingModule({
    overrides: {
      locateFile: (file: string, prefix: string) => (file.endsWith(".wasm") ? `/${file}` : prefix + file),
    },
  });
  return new mod.BarcodeDetector({ formats: FORMATS as never });
}

type State =
  | { kind: "camera" }
  | { kind: "manual" }
  | { kind: "looking"; code: string }
  | { kind: "found"; product: BarcodeProduct }
  | { kind: "missing"; code: string }
  | { kind: "error"; message: string };

export function BarcodeTab({
  onLog,
  onMissing,
  saving,
}: {
  onLog: (items: FoodItem[]) => void;
  /** Switches to photographing the nutrition label instead. */
  onMissing: () => void;
  saving: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "camera" });
  const [cameraError, setCameraError] = useState("");
  const [manual, setManual] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const lookup = useCallback(
    async (raw: string) => {
      const code = normalizeBarcode(raw);
      if (!code) {
        setState({ kind: "error", message: "That doesn't look like a product barcode. Check the number and try again." });
        return;
      }
      stopCamera();
      setState({ kind: "looking", code });
      try {
        const res = await fetch(`/api/food/barcode?code=${code}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "The lookup failed. Try again.");
        setState(json.product ? { kind: "found", product: json.product } : { kind: "missing", code });
      } catch (e) {
        setState({
          kind: "error",
          message: e instanceof TypeError ? "You seem to be offline. Check your connection and try again." : (e as Error).message,
        });
      }
    },
    [stopCamera],
  );

  // Camera scanning loop.
  useEffect(() => {
    if (state.kind !== "camera") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const detector = await makeDetector();
        const tick = async () => {
          if (cancelled) return;
          try {
            if (video.readyState >= 2) {
              const found = await detector.detect(video);
              const hit = found.find((b) => normalizeBarcode(b.rawValue));
              if (hit && !cancelled) {
                navigator.vibrate?.(40);
                lookup(hit.rawValue);
                return;
              }
            }
          } catch {
            // a frame that can't be read; keep going
          }
          timer = setTimeout(tick, 200);
        };
        tick();
      } catch (e) {
        if (cancelled) return;
        const name = (e as Error).name;
        setCameraError(
          name === "NotAllowedError"
            ? "Camera access is blocked. Allow it for this site in your browser settings, or use a photo or the number instead."
            : name === "NotFoundError"
              ? "No camera was found on this device. Use a photo or type the number instead."
              : "The camera couldn't start here. Use a photo of the barcode or type the number instead.",
        );
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopCamera();
    };
  }, [state.kind, lookup, stopCamera]);

  async function fromPhoto(file: File | undefined) {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";
    try {
      const bitmap = await createImageBitmap(file);
      const found = await (await makeDetector()).detect(bitmap);
      bitmap.close();
      const hit = found.find((b) => normalizeBarcode(b.rawValue));
      if (hit) lookup(hit.rawValue);
      else setState({ kind: "error", message: "No barcode was found in that photo. Get closer, with the barcode flat and in focus, or type the number." });
    } catch {
      setState({ kind: "error", message: "That photo couldn't be read. Try again or type the number." });
    }
  }

  const photoInput = (
    <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => fromPhoto(e.target.files?.[0])} />
  );

  if (state.kind === "found") {
    return (
      <ProductPortion
        product={state.product}
        saving={saving}
        onLog={onLog}
        onScanAgain={() => {
          setCameraError("");
          setState({ kind: "camera" });
        }}
      />
    );
  }

  return (
    <div>
      {photoInput}
      {state.kind === "camera" && !cameraError && (
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" aria-label="Camera view for scanning a barcode" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
            <div className="h-1/3 w-4/5 rounded-xl border-2 border-lime/90 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />
          </div>
          <p className="absolute inset-x-0 bottom-3 text-center text-sm font-medium text-white/90">
            Hold the barcode inside the frame
          </p>
        </div>
      )}
      {state.kind === "camera" && cameraError && (
        <p role="alert" className="rounded-2xl bg-surface-2 px-4 py-3 text-[15px] text-fg">
          {cameraError}
        </p>
      )}
      {state.kind === "looking" && (
        <div className="flex flex-col items-center gap-3 py-10" role="status">
          <Spinner className="size-7 text-accent" />
          <p className="font-medium">Looking up {state.code}…</p>
        </div>
      )}
      {state.kind === "missing" && (
        <div className="rounded-2xl bg-surface-2 p-4">
          <p className="font-semibold">Not in the food database</p>
          <p className="mt-1 text-sm text-muted">
            Barcode {state.code} isn&apos;t listed in Open Food Facts yet. Photograph the nutrition label instead and the AI reads the values.
          </p>
          <Button className="mt-3 w-full" onClick={onMissing}>
            <Camera size={18} aria-hidden />
            Photograph the label
          </Button>
        </div>
      )}
      {state.kind === "error" && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
          {state.message}
        </p>
      )}
      {state.kind === "manual" && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            lookup(manual);
          }}
        >
          <label htmlFor="barcode-number" className="sr-only">
            Barcode number
          </label>
          <input
            id="barcode-number"
            inputMode="numeric"
            autoFocus
            placeholder="Barcode number"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-2xl border border-border bg-surface-2 px-4 text-base tracking-wider tnum placeholder:tracking-normal placeholder:text-muted/70 focus:border-accent focus:outline-none focus-visible:outline-none"
          />
          <Button type="submit" size="lg" className="h-12" disabled={!manual.trim()}>
            Look up
          </Button>
        </form>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {state.kind !== "camera" || cameraError ? (
          <Button
            variant="secondary"
            onClick={() => {
              setCameraError("");
              setState({ kind: "camera" });
            }}
          >
            <Barcode size={18} aria-hidden />
            Scan again
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Camera size={18} aria-hidden />
            Use a photo
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            stopCamera();
            setState({ kind: "manual" });
          }}
          disabled={state.kind === "manual"}
        >
          <Keyboard size={18} aria-hidden />
          Type number
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">Product data from Open Food Facts, a free community database.</p>
    </div>
  );
}

function ProductPortion({
  product,
  saving,
  onLog,
  onScanAgain,
}: {
  product: BarcodeProduct;
  saving: boolean;
  onLog: (items: FoodItem[]) => void;
  onScanAgain: () => void;
}) {
  const hasServing = Boolean(product.perServing);
  const servingOnly = product.servingGrams === null && product.per100g.calories === 0;
  const [mode, setMode] = useState<"serving" | "grams">(hasServing ? "serving" : "grams");
  const [value, setValue] = useState(hasServing ? "1" : "100");
  const amount = Number(value);
  const valid = Number.isFinite(amount) && amount > 0 && amount <= (mode === "grams" ? 5000 : 50);
  const m = valid ? nutritionFor(product, { mode, value: amount }) : null;
  const step = mode === "grams" ? 10 : 0.5;

  const quantity =
    mode === "grams"
      ? `${num(amount)} g`
      : `${num(amount)} × ${product.servingLabel ?? "serving"}`;

  return (
    <div>
      <div className="rounded-2xl border border-border p-4">
        <p className="text-lg font-semibold leading-snug">{product.name}</p>
        {product.brand && <p className="text-sm text-muted">{product.brand}</p>}
        <p className="mt-2 text-sm text-muted tnum">
          {product.per100g.calories > 0 && <>{int(product.per100g.calories)} kcal per 100 g</>}
          {product.perServing && product.servingLabel && (
            <>
              {product.per100g.calories > 0 && " · "}
              {int(product.perServing.calories)} kcal per serving ({product.servingLabel})
            </>
          )}
        </p>
      </div>

      {!servingOnly && hasServing && (
        <Segmented
          className="mt-3"
          label="Amount in"
          value={mode}
          onChange={(v) => {
            setMode(v);
            setValue(v === "serving" ? "1" : String(product.servingGrams ?? 100));
          }}
          options={[
            { value: "serving", label: "Servings" },
            { value: "grams", label: "Grams" },
          ]}
        />
      )}

      <div className="mt-3 flex items-center gap-2">
        <IconButton
          label={`Less, by ${step}`}
          className="bg-surface-2"
          onClick={() => setValue(String(Math.max(step, Math.round((amount - step) * 100) / 100)))}
        >
          <Minus size={18} weight="bold" />
        </IconButton>
        <div className="relative min-w-0 flex-1">
          <label htmlFor="portion" className="sr-only">
            {mode === "grams" ? "Grams eaten" : "Servings eaten"}
          </label>
          <input
            id="portion"
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-12 w-full rounded-2xl border border-border bg-surface-2 px-4 pr-20 text-center text-xl font-semibold tnum focus:border-accent focus:outline-none focus-visible:outline-none"
          />
          <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-sm text-muted">
            {mode === "grams" ? "g" : amount === 1 ? "serving" : "servings"}
          </span>
        </div>
        <IconButton
          label={`More, by ${step}`}
          className="bg-surface-2"
          onClick={() => setValue(String(Math.round(((Number.isFinite(amount) ? amount : 0) + step) * 100) / 100))}
        >
          <Plus size={18} weight="bold" />
        </IconButton>
      </div>

      <div className={cn("mt-3 flex items-baseline justify-between rounded-2xl bg-surface-2 px-4 py-3", !m && "opacity-50")}>
        <span className="font-medium">Total</span>
        <span className="text-right tnum">
          <span className="text-xl font-semibold">{m ? int(m.calories) : "–"}</span> <span className="text-sm text-muted">kcal</span>
          <span className="block text-sm text-muted">
            {m ? `${num(m.proteinG)} g protein · ${num(m.carbsG)} g carbs · ${num(m.fatG)} g fat` : "Enter an amount"}
          </span>
        </span>
      </div>

      <div className="mt-5 flex gap-3">
        <Button variant="secondary" size="lg" onClick={onScanAgain} disabled={saving}>
          Scan again
        </Button>
        <Button
          size="lg"
          className="flex-1"
          loading={saving}
          disabled={!m}
          onClick={() =>
            m &&
            onLog([
              {
                name: product.brand ? `${product.name} (${product.brand})` : product.name,
                quantity,
                calories: Math.round(m.calories),
                proteinG: Math.round(m.proteinG),
                carbsG: Math.round(m.carbsG),
                fatG: Math.round(m.fatG),
              },
            ])
          }
        >
          Log {m ? int(m.calories) : ""} kcal
        </Button>
      </div>
    </div>
  );
}
