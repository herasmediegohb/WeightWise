"use client";

import { Drawer } from "vaul";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-3xl border border-border bg-surface p-5 shadow-card", className)}
      {...props}
    />
  );
}

export function Eyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-[13px] font-medium text-muted", className)} {...props} />;
}

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg" | "sm";
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold",
        "transition-[transform,background-color,opacity] duration-150 active:scale-[0.97]",
        "disabled:pointer-events-none disabled:opacity-45",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-11 px-4 text-[15px]",
        size === "lg" && "h-13 px-5 text-base",
        variant === "primary" && "bg-lime text-on-lime hover:brightness-95",
        variant === "secondary" && "border border-border bg-surface-2 text-fg hover:bg-border/60",
        variant === "ghost" && "text-fg hover:bg-surface-2",
        variant === "danger" && "bg-danger-soft text-danger hover:brightness-95",
        className,
      )}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-2", loading && "opacity-0")}>{children}</span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <Spinner />
        </span>
      )}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-5 animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function IconButton({
  label,
  className,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-2xl text-fg transition-[transform,background-color] duration-150",
        "hover:bg-surface-2 active:scale-95 disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

const inputBase =
  "h-12 w-full rounded-2xl border border-border bg-surface-2 px-4 text-base text-fg placeholder:text-muted/70 " +
  "transition-colors focus:border-accent focus:outline-none focus-visible:outline-none disabled:opacity-50";

export function Field({
  label,
  hint,
  error,
  suffix,
  className,
  id,
  ...props
}: React.ComponentProps<"input"> & { label: string; hint?: string; error?: string; suffix?: string }) {
  const fid = id ?? `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const describedBy = error ? `${fid}-err` : hint ? `${fid}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={fid} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <input
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(inputBase, suffix && "pr-14", error && "border-danger")}
          {...props}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-sm text-muted">
            {suffix}
          </span>
        )}
      </div>
      {error ? (
        <p id={`${fid}-err`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fid}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  className,
  id,
  ...props
}: React.ComponentProps<"textarea"> & { label: string }) {
  const fid = id ?? `t-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className={className}>
      <label htmlFor={fid} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      <textarea id={fid} className={cn(inputBase, "h-auto min-h-24 resize-none py-3 leading-relaxed")} {...props} />
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex gap-1 rounded-2xl bg-surface-2 p-1", className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-10 min-w-0 flex-1 rounded-xl px-2 text-sm font-medium transition-colors duration-150",
            value === o.value ? "bg-surface text-fg shadow-card ring-1 ring-border" : "text-muted hover:text-fg",
          )}
        >
          <span className="block truncate">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet on phones, centered panel width on larger screens. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/55" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-[28px] border border-b-0 border-border bg-surface outline-none"
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border" aria-hidden />
          <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-3">
            <div className="min-w-0">
              <Drawer.Title className="text-xl font-semibold tracking-tight">{title}</Drawer.Title>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <Drawer.Close asChild>
              <IconButton label="Close" className="-mr-2 -mt-1 text-muted">
                <X size={20} weight="bold" />
              </IconButton>
            </Drawer.Close>
          </div>
          <div className="overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function Ring({
  value,
  size = 132,
  stroke = 12,
  color = "var(--accent)",
  children,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={label}
        className="-rotate-90"
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Bar({
  value,
  color = "var(--accent)",
  label,
  className,
}: {
  value: number;
  color?: string;
  label: string;
  className?: string;
}) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cn("h-2 overflow-hidden rounded-full bg-track", className)}
    >
      <div
        className="h-full origin-left rounded-full transition-transform duration-500 ease-out-soft"
        style={{ background: color, transform: `scaleX(${v})` }}
      />
    </div>
  );
}

export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted" aria-hidden>
        {icon}
      </div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
