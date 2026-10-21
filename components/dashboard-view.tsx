"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fmtDate, fmtDateTime, fmtNumber, fmtPercent } from "@/lib/format";
import { useApi } from "@/lib/client/use-api";
import type { CountItem, DashboardSummary } from "@/lib/types";
import { FollowUpCell, PriorityBadge, UsakBadge } from "./badges";
import { Alert, Badge, Card, EmptyState, ErrorState, KpiStrip, PageHeader, ReloadButton, Skeleton, cx } from "./ui";

function listHref(params: Record<string, string | string[]>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) for (const x of Array.isArray(v) ? v : [v]) sp.append(k, x);
  return `/merchants?${sp.toString()}`;
}

export function DashboardView() {
  const { data, error, loading, reload } = useApi<DashboardSummary>("/api/dashboard");

  if (!data && error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return <DashboardSkeleton />;

  const u = data.usak;
  const snapshot = data.data.snapshot_date ? `Data per ${fmtDate(data.data.snapshot_date)}` : data.data.last_import_at ? `Data diimpor ${fmtDateTime(data.data.last_import_at)}` : null;

  return (
    <div className={cx("space-y-4 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
      <PageHeader
        title="Peningkatan rasio USAK"
        subtitle={
          <span>
            {data.cabang.nama_cabang || "Cabang"} · {data.cabang.kode_cabang}
            {snapshot && <> · {snapshot}</>}
            <span className="text-muted"> · diperbarui {fmtDateTime(data.data.loaded_at)}</span>
          </span>
        }
        action={<ReloadButton onClick={reload} loading={loading} />}
      />

      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data.warnings.length > 0 && (
        <div className="space-y-2">
          {data.warnings.map((w) => (
            <Alert key={w.code} tone="warn">{w.message}</Alert>
          ))}
        </div>
      )}

      <UsakTiles data={data} />
      <UsakProgress data={data} />

      {u.total_merchant === 0 ? (
        <Card>
          <EmptyState title="Belum ada merchant untuk cabang ini">
            Pastikan sheet Merchants berisi data dengan kode_cabang_final {data.cabang.kode_cabang}.
          </EmptyState>
        </Card>
      ) : (
        <>
          <PriorityList data={data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <FollowUpPanel data={data} />
            <Card title={`Komposisi ${u.source_column}`} subtitle="Dasar perhitungan rasio USAK">
              <BarList
                items={data.distribusi.usak_source}
                total={u.total_merchant}
                hrefFor={(v) => listHref({ [u.source_column]: v })}
                extra={(item) => item.kategori && (
                  <UsakBadge configured={u.configured} usak={{ kategori: item.kategori, label: "", perlu_dicek: false, nilai: item.value, source_column: u.source_column }} />
                )}
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Memuat dashboard">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-24" />
      <Skeleton className="h-28" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function UsakTiles({ data }: { data: DashboardSummary }) {
  const u = data.usak;
  const provisional = !u.configured && <Badge tone="warn">Belum final</Badge>;
  return (
    <KpiStrip
      items={[
        { label: "Total merchant", value: fmtNumber(u.total_merchant), sub: "Kelolaan cabang" },
        {
          label: "Merchant USAK",
          value: fmtNumber(u.merchant_usak),
          tag: provisional,
          sub: <>Belum USAK {fmtNumber(u.merchant_belum_usak)}{u.perlu_dicek > 0 && <> · perlu dicek {fmtNumber(u.perlu_dicek)}</>}</>,
        },
        {
          label: "Rasio USAK",
          value: fmtPercent(u.rasio_usak, { ceiling: u.target_ratio_persen }),
          tag: provisional,
          sub: `${fmtNumber(u.merchant_usak)} dari ${fmtNumber(u.total_merchant)} merchant`,
        },
        {
          label: `Gap menuju ${u.target_ratio_persen}%`,
          value: <>{fmtNumber(u.gap_usak_50)} <span className="text-sm font-normal text-ink-2">merchant</span></>,
          tag: provisional,
          sub: u.total_merchant === 0
            ? "Belum ada merchant"
            : u.tercapai
              ? <span className="font-medium text-good-ink">Target tercapai</span>
              : "Tambahan merchant USAK yang dibutuhkan",
        },
      ]}
    />
  );
}

/** Meter progres rasio USAK dengan penanda target 50%. */
function UsakProgress({ data }: { data: DashboardSummary }) {
  const u = data.usak;
  const target = u.target_ratio_persen;
  const pct = Math.max(0, Math.min(100, u.rasio_usak));
  const ratioText = fmtPercent(u.rasio_usak, { ceiling: target });
  return (
    <Card
      title={`Progres menuju rasio USAK ${target}%`}
      subtitle={`Target ${fmtNumber(u.target_usak_50)} merchant USAK (${target}% × ${fmtNumber(u.total_merchant)}, dibulatkan ke atas)`}
      action={u.total_merchant > 0 && (u.tercapai ? (
        <Badge tone="good">Target tercapai</Badge>
      ) : (
        <Link href={listHref({ follow_up: "perlu", sort: "priority" })} className="inline-flex items-center gap-0.5 text-[13px] font-medium text-accent-ink hover:underline">
          Lihat prioritas <ChevronRight aria-hidden className="size-4" />
        </Link>
      ))}
    >
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px] text-ink-2">
        <span>Rasio <strong className="text-base font-semibold text-ink">{ratioText}</strong></span>
        <span>USAK <strong className="font-semibold text-ink">{fmtNumber(u.merchant_usak)}</strong> / {fmtNumber(u.target_usak_50)}</span>
        {!u.tercapai && u.total_merchant > 0 && <span>Kurang <strong className="font-semibold text-ink">{fmtNumber(u.gap_usak_50)}</strong> merchant</span>}
      </div>
      <div className="relative mt-5">
        <div className="absolute -top-4.5 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-ink-2" style={{ left: `${target}%` }}>
          {target}%
        </div>
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct * 10) / 10}
          aria-valuetext={`Rasio USAK ${ratioText}, target ${target}%`}
          aria-label="Rasio USAK"
          className="relative h-2 rounded-sm bg-accent-track"
        >
          <div className="h-2 rounded-sm bg-accent" style={{ width: `${pct}%` }} />
          <div aria-hidden className="absolute -top-1 h-4 w-px -translate-x-1/2 bg-ink" style={{ left: `${target}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
    </Card>
  );
}

/** Daftar batang horizontal satu seri: label, batang, dan nilai di ujung. */
function BarList({ items, total, hrefFor, extra }: {
  items: CountItem[];
  total: number;
  hrefFor?: (value: string) => string;
  extra?: (item: CountItem) => ReactNode;
}) {
  if (!items.length) return <p className="text-sm text-ink-2">Tidak ada data.</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul>
      {items.map((item) => {
        const share = total > 0 ? (item.count / total) * 100 : 0;
        const body = (
          <>
            <span className="flex w-28 shrink-0 flex-col items-start gap-0.5 sm:w-40" title={item.label}>
              <span className="max-w-full truncate text-[13px] text-ink">{item.label}</span>
              {extra?.(item)}
            </span>
            <span className="relative h-2 min-w-8 flex-1 rounded-sm bg-surface-2" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-sm bg-accent transition-opacity group-hover:opacity-80" style={{ width: `${Math.max((item.count / max) * 100, 1)}%` }} />
            </span>
            <span className="w-16 shrink-0 text-right text-[13px] text-ink">{fmtNumber(item.count)}</span>
            <span className="w-12 shrink-0 text-right text-xs text-muted">{fmtNumber(share, 1)}%</span>
          </>
        );
        const title = `${item.label}: ${fmtNumber(item.count)} merchant (${fmtNumber(share, 1)}%)`;
        return (
          <li key={item.value}>
            {hrefFor ? (
              <Link href={hrefFor(item.value)} title={title} className="group -mx-2 flex items-center gap-3 rounded px-2 py-1.5 hover:bg-surface-2">
                {body}
              </Link>
            ) : (
              <div title={title} className="flex items-center gap-3 py-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FollowUpPanel({ data }: { data: DashboardSummary }) {
  const f = data.follow_up;
  const rows = [
    { label: "Perlu follow-up", value: f.perlu_follow_up, href: listHref({ follow_up: "perlu", sort: "priority" }), alert: false },
    {
      label: "Belum USAK & belum pernah di-follow-up",
      value: f.belum_pernah_belum_usak,
      href: listHref({ follow_up: "belum_pernah", kategori_usak: ["BELUM_USAK", "PERLU_CEK"] }),
      alert: false,
    },
    { label: "Follow-up dicatat bulan ini", value: f.dicatat_bulan_ini, href: listHref({ follow_up: "sudah_ada", sort: "last_follow_up" }), alert: false },
  ];
  return (
    <Card title="Follow-up" subtitle="Merchant yang perlu ditindaklanjuti">
      <ul className="-my-1 divide-y divide-line">
        {rows.map(({ label, value, href, alert }) => (
          <li key={label}>
            <Link href={href} className="group -mx-2 flex items-center gap-3 rounded px-2 py-2 hover:bg-surface-2">
              <span className="min-w-0 flex-1 text-[13px] text-ink-2 group-hover:text-ink">{label}</span>
              <span className={cx("text-base font-semibold", alert ? "text-critical-ink" : "text-ink")}>{fmtNumber(value)}</span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PriorityList({ data }: { data: DashboardSummary }) {
  const items = data.prioritas_teratas;
  return (
    <Card
      title="Prioritas follow-up teratas"
      subtitle="Urut skor prioritas, lalu SV MTD"
      action={
        <Link href={listHref({ follow_up: "perlu", sort: "priority" })} className="inline-flex items-center gap-0.5 text-[13px] font-medium text-accent-ink hover:underline">
          Lihat semua <ChevronRight aria-hidden className="size-4" />
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyState title="Tidak ada merchant yang perlu follow-up">Semua merchant sudah memenuhi kriteria atau sudah ditindaklanjuti.</EmptyState>
      ) : (
        <ul className="-my-1.5 divide-y divide-line">
          {items.map((m) => (
            <li key={m.store_id}>
              <Link href={`/merchants/${encodeURIComponent(m.store_id)}`} className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded px-2 py-2 hover:bg-surface-2">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-[13px] font-medium text-ink">{m.store_name}</p>
                  <p className="truncate text-xs text-ink-2">{m.mid_static || m.store_id} · {m.priority.reasons.map((r) => r.label).join(", ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <UsakBadge usak={m.usak} configured={data.usak.configured} />
                  <PriorityBadge priority={m.priority} />
                </div>
                <div className="w-44 shrink-0">
                  <FollowUpCell fu={m.follow_up} today={data.data.today} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

