import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import Icon, { type IconName } from "./Icons";

/* ---------- form controls ---------- */
export const inputCls =
  "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 " +
  "transition focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/15 " +
  "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

export const selectCls = inputCls + " pr-8";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

/* ---------- buttons ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "warning";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-orange-500 text-white shadow-sm hover:bg-orange-600 active:bg-orange-700 focus-visible:ring-orange-500/40",
  secondary: "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:ring-slate-400/30",
  ghost: "text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400/30",
  danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50 focus-visible:ring-red-500/30",
  warning: "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 focus-visible:ring-amber-500/30",
};

export function buttonCls(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition",
    "focus:outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-50",
    size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
    variants[variant],
    extra
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading,
  className,
  children,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={buttonCls(variant, size, className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- layout ---------- */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200/80 bg-white shadow-card", className)}>{children}</div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon = "info",
  title,
  children,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon name={icon} size={22} />
      </div>
      <p className="font-medium text-slate-900">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
  icon,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  children: ReactNode;
  icon?: IconName;
}) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", tones[tone])}>
      <Icon name={icon ?? (tone === "info" ? "info" : "alert")} size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/* ---------- badges ---------- */
const badgeTones = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/15",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/15",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/15",
};

export function Badge({
  tone = "slate",
  dot,
  children,
  className,
}: {
  tone?: keyof typeof badgeTones;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        badgeTones[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: keyof typeof badgeTones; label: string }> = {
    submitted: { tone: "green", label: "Submitted" },
    pending: { tone: "slate", label: "Pending" },
    unlocked: { tone: "amber", label: "Unlocked" },
  };
  const m = map[status] ?? { tone: "slate" as const, label: status };
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

/* ---------- misc ---------- */
export function ProgressBar({ value, max, tone = "orange" }: { value: number; max: number; tone?: "orange" | "green" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn("h-full rounded-full transition-all duration-300", tone === "green" ? "bg-emerald-500" : "bg-orange-500")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-orange-500/15 font-semibold text-orange-300"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {ini || "?"}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200/70", className)} />;
}

/* table helpers (consistent look everywhere) */
export const th = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap";
export const td = "px-4 py-3 text-sm text-slate-600";
