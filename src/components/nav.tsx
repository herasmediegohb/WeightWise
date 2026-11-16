"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartLineUp, ForkKnife, GearSix, House, Sparkle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Today", icon: House },
  { href: "/food", label: "Food", icon: ForkKnife },
  { href: "/progress", label: "Progress", icon: ChartLineUp },
  { href: "/coach", label: "Coach", icon: Sparkle },
  { href: "/settings", label: "Settings", icon: GearSix },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto flex max-w-xl">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <Icon size={24} weight={active ? "fill" : "regular"} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar({ name }: { name: string }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface px-3 py-6 lg:flex">
      <div className="flex items-center gap-2.5 px-3">
        <Logo />
        <span className="text-lg font-semibold tracking-tight">WeightWise</span>
      </div>
      <nav aria-label="Main" className="mt-8 flex-1">
        <ul className="space-y-1">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
                    active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <Icon size={20} weight={active ? "fill" : "regular"} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <p className="truncate px-3 text-sm text-muted">{name}</p>
    </aside>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#c8f560" />
      <path
        d="M7 12.5l4.2 9 4.8-9 4.8 9 4.2-9"
        fill="none"
        stroke="#10210a"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
