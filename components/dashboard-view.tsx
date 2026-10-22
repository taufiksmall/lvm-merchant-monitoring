"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fmtCompact, fmtDate, fmtDateTime, fmtNumber, fmtPercent, fmtRupiah } from "@/lib/format";
import { useApi } from "@/lib/client/use-api";
import type { CountItem, DashboardSummary, MetricKey, MetricSummary } from "@/lib/types";
import { FollowUpCell, PriorityBadge, UsakBadge } from "./badges";
import { Alert, Badge, Card, EmptyState, ErrorState, KpiStrip, PageHeader, ReloadButton, Skeleton, cx, tableCls } from "./ui";

export function listHref(params: Record<string, string | string[]>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) for (const x of Array.isArray(v) ? v : [v]) sp.append(k, x);
  return `/merchants?${sp.toString()}`;
}

export function DashboardView() {
  const { data, error, loading, reload } = useApi<DashboardSummary>("/api/dashboard");

  if (!data && error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return <DashboardSkeleton />;

  const u = data.usak;
  const snapshot = data.data.snapshot_date ? `Posisi data LVM: ${fmtDate(data.data.snapshot_date)}` : data.data.last_import_at ? `Data diimpor ${fmtDateTime(data.data.last_import_at)}` : null;

  return (
    <div className={cx("space-y-4 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
      <PageHeader
        title="Peningkatan rasio USAK"
        subtitle={
          <span>
            {data.cabang.nama_cabang || "Cabang"} · {data.cabang.kode_cabang}
            {snapshot && <> · <strong className="font-semibold text-ink">{snapshot}</strong></>}
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
          <MetricsTable metrics={data.metrics} total={u.total_merchant} />
          <FundsTable metrics={data.metrics} />
          <PriorityList data={data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <FollowUpPanel data={data} />
            <GradingCard items={data.distribusi.usak_source} total={u.total_merchant} sourceColumn={u.source_column} configured={u.configured} hrefFor={(v) => listHref({ [u.source_column]: v })} />
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
export function BarList({ items, total, hrefFor, extra }: {
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

const METRIC_ROWS: { label: string; money: boolean; keys: (MetricKey | null)[] }[] = [
  { label: "Transaksi", money: false, keys: ["freq_mtd", "freq_ytd", "freq_30_days"] },
  { label: "SV", money: true, keys: ["sv_mtd", "sv_ytd", "sv_30_days"] },
  { label: "FBI", money: true, keys: ["fbi_mtd", "fbi_ytd", null] },
];

/** Performa cabang: transaksi, SV, dan FBI per periode (total dan rata-rata per merchant). */
export function MetricsTable({ metrics, total, title = "Performance cabang" }: { metrics: Record<MetricKey, MetricSummary>; total: number; title?: string }) {
  return (
    <Card title={title} subtitle="Transaksi, SV, dan FBI · snapshot saat ini · rata-rata = total ÷ merchant yang memiliki nilai" flush>
      <div className="overflow-x-auto">
        <table className={cx(tableCls.table, "min-w-[36rem]")}>
          <thead>
            <tr className={tableCls.headRow}>
              <th scope="col" className={tableCls.th}>Metrik</th>
              <th scope="col" className={cx(tableCls.th, "text-right")}>MTD</th>
              <th scope="col" className={cx(tableCls.th, "text-right")}>YTD</th>
              <th scope="col" className={cx(tableCls.th, "text-right")}>30 hari terakhir</th>
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map((row) => (
              <tr key={row.label} className="border-b border-line last:border-0">
                <th scope="row" className={cx(tableCls.td, "py-2.5 text-left font-medium text-ink")}>{row.label}</th>
                {row.keys.map((k) => {
                  const m = k ? metrics[k] : null;
                  return (
                    <td key={k ?? "kosong"} className={cx(tableCls.td, "py-2.5 text-right align-top")}>
                      {m ? (
                        <>
                          <div className="font-semibold text-ink" title={row.money ? fmtRupiah(m.sum) : fmtNumber(m.sum)}>
                            {row.money ? fmtRupiah(m.sum, true) : fmtCompact(m.sum)}
                          </div>
                          <div className="text-xs text-ink-2">
                            rata-rata {row.money ? fmtRupiah(m.avg, true) : fmtNumber(m.avg, 1)}
                            {m.count < total && <> · {fmtNumber(m.count)} data</>}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-muted">Tidak tersedia</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const FUND_ROWS: { label: string; key: MetricKey }[] = [
  { label: "Saldo Akhir", key: "cbalrp" },
  { label: "Saldo Rata-Rata", key: "avgbalrp" },
  { label: "Saldo Kemarin", key: "ybal" },
  { label: "Dana Masuk", key: "amtcrc" },
  { label: "Dana Keluar", key: "amtdrc" },
];

/** Dana (funds): saldo dan arus dana seluruh merchant cabang. */
export function FundsTable({ metrics, title = "Dana cabang" }: { metrics: Record<MetricKey, MetricSummary>; title?: string }) {
  return (
    <Card title={title} subtitle="Saldo dan arus dana · total seluruh merchant dan rata-rata per merchant" flush>
      <div className="overflow-x-auto">
        <table className={cx(tableCls.table, "min-w-[28rem]")}>
          <thead>
            <tr className={tableCls.headRow}>
              <th scope="col" className={tableCls.th}>Dana</th>
              <th scope="col" className={cx(tableCls.th, "text-right")}>Total</th>
              <th scope="col" className={cx(tableCls.th, "text-right")}>Rata-rata per merchant</th>
            </tr>
          </thead>
          <tbody>
            {FUND_ROWS.map(({ label, key }) => {
              const m = metrics[key];
              return (
                <tr key={key} className="border-b border-line last:border-0">
                  <th scope="row" className={cx(tableCls.td, "py-2 text-left font-medium text-ink")}>{label}</th>
                  <td className={cx(tableCls.td, "py-2 text-right font-semibold text-ink")} title={m ? fmtRupiah(m.sum) : undefined}>{m && m.count > 0 ? fmtRupiah(m.sum, true) : <span className="text-xs font-normal text-muted">Tidak tersedia</span>}</td>
                  <td className={cx(tableCls.td, "py-2 text-right text-ink-2")}>{m && m.count > 0 ? fmtRupiah(m.avg, true) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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


/** Komposisi nilai kolom acuan USAK (mis. grading_trx) beserta kategorinya. */
export function GradingCard({ items, total, sourceColumn, configured, hrefFor }: {
  items: CountItem[];
  total: number;
  sourceColumn: string;
  configured: boolean;
  hrefFor?: (value: string) => string;
}) {
  return (
    <Card title={`Komposisi ${sourceColumn}`} subtitle="Dasar perhitungan rasio USAK">
      <BarList
        items={items}
        total={total}
        hrefFor={hrefFor}
        extra={(item) => item.kategori && (
          <UsakBadge configured={configured} usak={{ kategori: item.kategori, label: "", perlu_dicek: false, nilai: item.value, source_column: sourceColumn }} />
        )}
      />
    </Card>
  );
}

/** Tabel silang grading_trx x Tiering dengan intensitas satu hue (terang -> gelap). Tanpa hrefFor, sel tidak dapat diklik. */
export function CrossTab({ cross, total, hrefFor }: {
  cross: { rows: CountItem[]; cols: CountItem[]; cells: number[][] };
  total: number;
  hrefFor?: (grading: string, tiering: string) => string;
}) {
  const { rows, cols, cells } = cross;
  const max = Math.max(1, ...cells.flat());
  const colTotals = cols.map((_, c) => cells.reduce((s, r) => s + r[c], 0));
  return (
    <Card title="Grading × Tiering" subtitle={hrefFor ? "Jumlah merchant per kombinasi; klik sel untuk melihat daftar" : "Jumlah merchant per kombinasi"}>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[22rem] border-separate border-spacing-0.5 text-[13px]">
          <thead>
            <tr>
              <th scope="col" className="px-2 py-1.5 text-left text-xs font-medium text-ink-2">grading_trx \ Tiering</th>
              {cols.map((c) => (
                <th key={c.value} scope="col" className="px-2 py-1.5 text-center text-xs font-medium text-ink-2">{c.label}</th>
              ))}
              <th scope="col" className="px-2 py-1.5 text-right text-xs font-medium text-ink-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.value}>
                <th scope="row" className="px-2 py-1.5 text-left font-medium text-ink">{r.label}</th>
                {cols.map((c, ci) => {
                  const n = cells[ri][ci];
                  const strength = n === 0 ? 0 : 12 + Math.round((n / max) * 70);
                  const cls = cx("block rounded-sm px-2 py-1.5 text-center", strength > 52 ? "text-white" : "text-ink", hrefFor && "hover:outline hover:outline-2 hover:outline-ink/30");
                  const style = { background: n === 0 ? "var(--surface-2)" : `color-mix(in oklab, var(--accent) ${strength}%, var(--surface))` };
                  const title = `grading_trx ${r.label}, ${c.label}: ${fmtNumber(n)} merchant`;
                  const body = n === 0 ? <span className="text-muted">0</span> : fmtNumber(n);
                  return (
                    <td key={c.value} className="p-0">
                      {hrefFor ? <Link href={hrefFor(r.value, c.value)} title={title} className={cls} style={style}>{body}</Link> : <span title={title} className={cls} style={style}>{body}</span>}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right font-medium text-ink">{fmtNumber(r.count)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="px-2 py-1.5 text-left text-xs font-medium text-ink-2">Total</th>
              {colTotals.map((t, i) => (
                <td key={cols[i].value} className="px-2 py-1.5 text-center font-medium text-ink">{fmtNumber(t)}</td>
              ))}
              <td className="px-2 py-1.5 text-right font-semibold text-ink">{fmtNumber(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
