"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, BellSlash, CheckCircle, Copy, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { removePushSubscription, savePushSubscription, saveReminders, sendTestNotification, setupScheduler } from "@/app/actions";
import { cn } from "@/lib/utils";
import { Button, Card } from "./ui";

type Support = "server" | "ok" | "ios-install" | "denied" | "unsupported";

function readSupport(): Support {
  if (typeof window === "undefined") return "server";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!capable) return ios && !standalone ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

const noop = () => () => {};

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows computer";
  return "This device";
}

export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function ReminderSettings({
  publicKey,
  devices,
  weighIn,
  water,
  checkin,
  lastTick,
  serverNow,
}: {
  serverNow: number;
  publicKey: string;
  devices: number;
  weighIn: string | null;
  water: string | null;
  checkin: boolean;
  lastTick: string | null;
}) {
  const support = useSyncExternalStore(noop, readSupport, () => "server" as Support);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"enable" | "disable" | "test" | "save" | "scheduler" | null>(null);
  const [weighOn, setWeighOn] = useState(weighIn !== null);
  const [weighTime, setWeighTime] = useState(weighIn ?? "07:30");
  const [waterOn, setWaterOn] = useState(water !== null);
  const [waterTime, setWaterTime] = useState(water ?? "15:00");
  const [checkinOn, setCheckinOn] = useState(checkin);
  const [dirty, setDirty] = useState(false);
  const [manualSql, setManualSql] = useState<{ error: string; sql: string | null } | null>(null);
  // Starts from the server's clock so the first render matches; ticks every minute after.
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    if (support !== "ok") return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => setSubscribed(false));
  }, [support]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const tickMinutes = lastTick ? (now - Date.parse(lastTick)) / 60_000 : null;
  const schedulerOk = tickMinutes !== null && tickMinutes < 20;

  async function enable() {
    setBusy("enable");
    try {
      // Ask first, straight from the tap: iPhone only allows the prompt then.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error(permission === "denied" ? "Notifications are blocked for WeightWise in your device settings." : "Notifications weren't allowed.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await savePushSubscription({ endpoint: json.endpoint, keys: json.keys, device: deviceName() });
      if (!res.ok) throw new Error(res.error);
      setSubscribed(true);
      toast.success("Notifications are on for this device");
      if (!weighOn && !waterOn) {
        setWeighOn(true);
        setWaterOn(true);
        setDirty(true);
      }
    } catch (e) {
      toast.error((e as Error).message || "Notifications couldn't be turned on. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    setBusy("disable");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Notifications are off for this device");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    const res = await saveReminders({
      weighIn: weighOn ? weighTime : null,
      water: waterOn ? waterTime : null,
      checkin: checkinOn,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setDirty(false);
    toast.success("Reminders saved");
  }

  const rows = [
    {
      key: "weigh",
      title: "Weigh-in",
      hint: "Only if you haven't logged today's weight yet.",
      on: weighOn,
      setOn: setWeighOn,
      time: weighTime,
      setTime: setWeighTime,
    },
    {
      key: "water",
      title: "Water",
      hint: "Only if you're under half your target by then.",
      on: waterOn,
      setOn: setWaterOn,
      time: waterTime,
      setTime: setWaterTime,
    },
  ];

  return (
    <Card>
      <h2 className="flex items-center gap-2 font-semibold">
        <Bell size={18} weight="fill" className="text-accent" aria-hidden />
        Reminders
      </h2>

      <div className="mt-3 rounded-2xl bg-surface-2 p-3.5 text-sm">
        {support === "server" ? (
          <p className="text-muted">Checking this device…</p>
        ) : support === "ios-install" ? (
          <p>
            <span className="font-semibold">On iPhone, add WeightWise to your Home Screen first.</span>{" "}
            <span className="text-muted">
              In Safari tap Share, then Add to Home Screen. Open WeightWise from the new icon and come back here to turn notifications on.
            </span>
          </p>
        ) : support === "unsupported" ? (
          <p className="text-muted">This browser can&apos;t receive notifications. Try Chrome, Edge, or Safari on a recent device.</p>
        ) : support === "denied" ? (
          <p>
            <span className="font-semibold">Notifications are blocked for WeightWise.</span>{" "}
            <span className="text-muted">Allow them in your device or browser settings, then reload this page.</span>
          </p>
        ) : subscribed ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5">
              <CheckCircle size={18} weight="fill" className="text-accent" aria-hidden />
              On for this device{devices > 1 ? ` (${devices} devices in total)` : ""}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" className="bg-surface" loading={busy === "test"} onClick={async () => {
                setBusy("test");
                const res = await sendTestNotification();
                setBusy(null);
                if (res.ok) toast.success("Test sent. It should appear in a few seconds.");
                else toast.error(res.error);
              }}>
                Send a test
              </Button>
              <Button size="sm" variant="ghost" loading={busy === "disable"} onClick={disable}>
                <BellSlash size={16} aria-hidden />
                Turn off
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted">Notifications are off for this device.</p>
            <Button size="sm" loading={busy === "enable"} disabled={subscribed === null} onClick={enable}>
              Turn on notifications
            </Button>
          </div>
        )}
      </div>

      <ul className="mt-4 divide-y divide-border">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3 py-3">
            <Switch
              checked={r.on}
              label={`${r.title} reminder`}
              onChange={(v) => {
                r.setOn(v);
                setDirty(true);
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.title}</p>
              <p className="text-sm text-muted">{r.hint}</p>
            </div>
            <label className="sr-only" htmlFor={`time-${r.key}`}>
              {r.title} reminder time
            </label>
            <input
              id={`time-${r.key}`}
              type="time"
              value={r.time}
              disabled={!r.on}
              onChange={(e) => {
                r.setTime(e.target.value);
                setDirty(true);
              }}
              className="h-11 rounded-xl border border-border bg-surface-2 px-3 text-base tnum disabled:opacity-40"
            />
          </li>
        ))}
        <li className="flex items-center gap-3 py-3">
          <Switch
            checked={checkinOn}
            label="Weekly check-in notification"
            onChange={(v) => {
              setCheckinOn(v);
              setDirty(true);
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Weekly check-in</p>
            <p className="text-sm text-muted">Created automatically on Monday morning. Notify me when it&apos;s ready.</p>
          </div>
        </li>
      </ul>

      {dirty && (
        <Button className="mt-1 w-full" loading={busy === "save"} onClick={save}>
          Save reminders
        </Button>
      )}

      <div className="mt-4 border-t border-border pt-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5">
            {schedulerOk ? (
              <CheckCircle size={18} weight="fill" className="text-accent" aria-hidden />
            ) : (
              <WarningCircle size={18} weight="fill" className="text-warn" aria-hidden />
            )}
            <span>
              <span className="font-medium">Scheduler</span>{" "}
              <span className="text-muted">
                {schedulerOk
                  ? `running, last checked ${ago(lastTick, now)}`
                  : lastTick
                    ? `last ran ${ago(lastTick, now)}, so it may have stopped`
                    : "not set up yet"}
              </span>
            </span>
          </p>
          {!schedulerOk && (
            <Button
              size="sm"
              variant="secondary"
              loading={busy === "scheduler"}
              onClick={async () => {
                setBusy("scheduler");
                const res = await setupScheduler();
                setBusy(null);
                if (res.ok) {
                  setManualSql(null);
                  toast.success("Scheduler is set up. It checks every 5 minutes.");
                } else setManualSql({ error: res.error, sql: "sql" in res ? res.sql : null });
              }}
            >
              Set up scheduler
            </Button>
          )}
        </div>
        <p className="mt-1 text-muted">
          Checks every 5 minutes whether a reminder is due. It also creates Monday&apos;s check-in and the weekly backup.
        </p>
        {manualSql && (
          <div className="mt-3 rounded-2xl border border-border p-3.5" role="alert">
            <p className="font-medium">{manualSql.error}</p>
            {manualSql.sql ? (
              <>
                <p className="mt-1 text-muted">
                  Set it up by hand instead: in Supabase open <span className="text-fg">SQL Editor</span>, paste this, and click{" "}
                  <span className="text-fg">Run</span>. Then reload this page.
                </p>
                <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-surface-2 p-3 font-mono text-xs leading-relaxed">{manualSql.sql}</pre>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={async () => {
                    await navigator.clipboard.writeText(manualSql.sql!);
                    toast.success("Copied");
                  }}
                >
                  <Copy size={16} aria-hidden />
                  Copy SQL
                </Button>
              </>
            ) : (
              <p className="mt-1 text-muted">Open WeightWise from its https address on Vercel and try again.</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-accent" : "bg-track",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform duration-200",
          checked && "translate-x-5",
        )}
        aria-hidden
      />
    </button>
  );
}
