import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, XCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ title, subtitle, action, children, className }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("min-w-0 rounded-xl border border-line bg-surface", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-btn text-white hover:bg-btn-hover",
        variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-surface-2",
        variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

type Tone = "neutral" | "accent" | "good" | "warn" | "critical";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  accent: "bg-accent-wash text-accent-ink border-transparent",
  good: "bg-good-wash text-good-ink border-transparent",
  warn: "bg-warn-wash text-warn-ink border-transparent",
  critical: "bg-critical-wash text-critical-ink border-transparent",
};

export function Badge({ tone = "neutral", icon, children, title, className }: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cx("inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", TONE_CLASSES[tone], className)}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

const ALERT_ICON = {
  info: Info,
  warn: AlertTriangle,
  error: XCircle,
  success: CheckCircle2,
};

export function Alert({ tone = "info", title, children, action }: {
  tone?: "info" | "warn" | "error" | "success";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = ALERT_ICON[tone];
  const cls = {
    info: "bg-accent-wash text-accent-ink",
    warn: "bg-warn-wash text-warn-ink",
    error: "bg-critical-wash text-critical-ink",
    success: "bg-good-wash text-good-ink",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-3 rounded-lg px-4 py-3 text-sm", cls)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title ? "mt-0.5" : "", "break-words")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label = "Memuat…" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-2" role="status">
      <Loader2 aria-hidden className="size-4 animate-spin" />
      {label}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert
      tone="error"
      title="Data gagal dimuat"
      action={onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw aria-hidden className="size-3.5" /> Coba lagi
        </Button>
      )}
    >
      {message}
    </Alert>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <div className="max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-2">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
