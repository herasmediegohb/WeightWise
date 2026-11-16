"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The server needs the device's time zone to know what "today" is. This keeps
 * a cookie in sync and re-renders once if it was missing or changed.
 */
export function TzSync({ current }: { current: string }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== current) {
      document.cookie = `ww_tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }, [current, router]);

  // Refresh when the app comes back to the foreground, so a tab left open
  // overnight rolls over to the new day.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60_000) router.refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [router]);
  return null;
}
