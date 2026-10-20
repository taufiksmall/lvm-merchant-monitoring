import { Loader2, RefreshCw } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ title, subtitle, action, children, className, flush }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Isi tanpa padding (mis. tabel yang menempel ke tepi kartu). */
  flush?: boolean;
}) {
  return (
    <section className={cx("min-w-0 rounded-md border border-line bg-surface", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? undefined : "px-4 py-3.5"}>{children}</div>
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
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-btn text-white hover:bg-btn-hover",
        variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-surface-2",
        variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      {loading && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

type Tone = "neutral" | "accent" | "good" | "warn" | "critical";

const TONE_CLASSES: Record<Tone, { box: string; dot: string }> = {
  neutral: { box: "border-line bg-surface-2 text-ink-2", dot: "bg-muted/60" },
  accent: { box: "border-transparent bg-accent-wash text-accent-ink", dot: "bg-accent" },
  good: { box: "border-transparent bg-good-wash text-good-ink", dot: "bg-good" },
  warn: { box: "border-transparent bg-warn-wash text-warn-ink", dot: "bg-warn" },
  critical: { box: "border-transparent bg-critical-wash text-critical-ink", dot: "bg-critical" },
};

/** Label status ringkas: titik warna + teks (warna tidak pernah menjadi satu-satunya penanda). */
export function Badge({ tone = "neutral", dot = true, children, title, className }: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <span
      title={title}
      className={cx("inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-px text-xs font-medium", t.box, className)}
    >
      {dot && <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", t.dot)} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Alert({ tone = "info", title, children, action }: {
  tone?: "info" | "warn" | "error" | "success";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const cls = {
    info: "border-accent/30 bg-accent-wash text-accent-ink",
    warn: "border-warn/40 bg-warn-wash text-warn-ink",
    error: "border-critical/40 bg-critical-wash text-critical-ink",
    success: "border-good/40 bg-good-wash text-good-ink",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex items-start gap-3 rounded-md border px-3.5 py-2.5 text-sm", cls)}>
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
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-line/60", className)} />;
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
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
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
        <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-0.5 text-[13px] text-ink-2">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

/** Tombol muat ulang kecil untuk kepala halaman. */
export function ReloadButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} loading={loading}>
      {!loading && <RefreshCw aria-hidden className="size-3.5" />} Muat ulang
    </Button>
  );
}

export type KpiItem = { label: ReactNode; value: ReactNode; sub?: ReactNode; tag?: ReactNode };

/** Deret KPI dalam satu bingkai dengan pemisah, bukan kartu-kartu terpisah. */
export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-line bg-surface lg:grid-cols-4">
      {items.map((it, i) => (
        <div
          key={i}
          className={cx(
            "min-w-0 border-line px-4 py-3",
            i % 2 === 1 && "border-l",
            i >= 2 && "border-t lg:border-t-0",
            i % 2 === 0 && i > 0 && "lg:border-l",
          )}
        >
          <dt className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink-2">
            {it.label}
            {it.tag}
          </dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight text-ink">{it.value}</dd>
          {it.sub && <dd className="mt-0.5 text-xs text-ink-2">{it.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Kelas bersama untuk kontrol formulir agar seragam di semua halaman. */
export const fieldCls = "h-9 w-full rounded-md border bg-surface px-2.5 text-sm text-ink placeholder:text-muted";
export const labelCls = "mb-1 block text-xs font-medium text-ink-2";

/** Tabel data: kepala abu-abu, baris rapat, angka rata kanan. */
export const tableCls = {
  table: "w-full text-sm",
  headRow: "border-b border-line bg-surface-2 text-left text-xs text-ink-2",
  th: "whitespace-nowrap px-3 py-2 font-medium first:pl-4 last:pr-4",
  row: "border-b border-line last:border-0 hover:bg-surface-2",
  td: "px-3 py-2 first:pl-4 last:pr-4",
};
