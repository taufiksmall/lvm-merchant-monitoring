"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, Flag, RefreshCw, Target } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fmtCompact, fmtDate, fmtDateTime, fmtNumber, fmtPercent, fmtRupiah } from "@/lib/format";
import { useApi } from "@/lib/client/use-api";
import type { CountItem, DashboardSummary, MetricKey } from "@/lib/types";
import { FollowUpCell, PriorityBadge, UsakBadge } from "./badges";
import { Alert, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, cx } from "./ui";

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
    <div className={cx("space-y-5 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
      <PageHeader
        title="Performance cabang"
        subtitle={
          <span>
            {data.cabang.nama_cabang || "Cabang"} · {data.cabang.kode_cabang}
            {snapshot && <> · {snapshot}</>}
            <span className="text-muted"> · diperbarui {fmtDateTime(data.data.loaded_at)}</span>
          </span>
        }
        action={
          <Button variant="secondary" size="sm" onClick={reload} loading={loading}>
            {!loading && <RefreshCw aria-hidden className="size-3.5" />} Muat ulang
          </Button>
        }
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
          <div className="grid gap-5 lg:grid-cols-2">
            <FollowUpPanel data={data} />
            <Card title="Merchant berdasarkan status transaksi" subtitle="Kolom status_trx">
              <BarList items={data.distribusi.status_trx} total={u.total_merchant} hrefFor={(v) => listHref({ status_trx: v })} />
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <div className="min-w-0 lg:col-span-3">
              <CrossTab data={data} />
            </div>
            <div className="min-w-0 lg:col-span-2">
              <Card title={`Merchant berdasarkan ${u.source_column}`} subtitle="Kolom acuan USAK; kategori sesuai konfigurasi UsakConfig">
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
          </div>

          <MetricsTable data={data} />
          <PriorityList data={data} />
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Memuat dashboard">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-36" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function StatTile({ label, value, sub, icon, tag }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tag?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink-2">{label}</p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">{value}</p>
      {tag && <div className="mt-1">{tag}</div>}
      {sub && <div className="mt-1.5 text-xs leading-relaxed text-ink-2">{sub}</div>}
    </div>
  );
}

function UsakTiles({ data }: { data: DashboardSummary }) {
  const u = data.usak;
  const provisional = !u.configured && <Badge tone="warn" icon={<AlertTriangle aria-hidden className="size-3" />}>Belum final</Badge>;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Total merchant" value={fmtNumber(u.total_merchant)} sub="Seluruh merchant kelolaan cabang" />
      <StatTile
        label="Merchant USAK"
        value={fmtNumber(u.merchant_usak)}
        tag={provisional}
        sub={<>Belum USAK {fmtNumber(u.merchant_belum_usak)}{u.perlu_dicek > 0 && <> · perlu dicek {fmtNumber(u.perlu_dicek)}</>}</>}
      />
      <StatTile
        label="Rasio USAK"
        value={fmtPercent(u.rasio_usak, { ceiling: u.target_ratio_persen })}
        tag={provisional}
        sub={`${fmtNumber(u.merchant_usak)} dari ${fmtNumber(u.total_merchant)} merchant`}
      />
      <StatTile
        label={`Gap menuju ${u.target_ratio_persen}%`}
        value={<>{fmtNumber(u.gap_usak_50)} <span className="text-base font-medium text-ink-2">merchant</span></>}
        tag={provisional}
        icon={u.tercapai ? <CheckCircle2 aria-hidden className="size-5 text-good" /> : <Target aria-hidden className="size-5 text-muted" />}
        sub={
          u.total_merchant === 0
            ? "Belum ada merchant"
            : u.tercapai
              ? <span className="font-medium text-good-ink">Target tercapai</span>
              : `Perlu ${fmtNumber(u.gap_usak_50)} merchant lagi menjadi USAK`
        }
      />
    </div>
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
      title={`Progres menuju target rasio USAK ${target}%`}
      subtitle={`Target minimal ${fmtNumber(u.target_usak_50)} merchant USAK (pembulatan ke atas dari ${target}% × ${fmtNumber(u.total_merchant)} merchant)`}
    >
      <div className="pt-6">
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct * 10) / 10}
          aria-valuetext={`Rasio USAK ${ratioText}, target ${target}%`}
          aria-label="Rasio USAK"
          className="relative h-3 rounded-full bg-accent-track"
        >
          <div className="h-3 rounded-full bg-accent" style={{ width: `${pct}%` }} />
          <div className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-ink" style={{ left: `${target}%` }}>
            Target {target}%
          </div>
          <div aria-hidden className="absolute -top-1.5 h-6 w-0.5 -translate-x-1/2 rounded bg-ink" style={{ left: `${target}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-muted tabular">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="text-ink-2">Rasio saat ini <strong className="font-semibold text-ink">{ratioText}</strong></span>
        <span className="text-ink-2">USAK <strong className="font-semibold text-ink">{fmtNumber(u.merchant_usak)}</strong> / target <strong className="font-semibold text-ink">{fmtNumber(u.target_usak_50)}</strong></span>
        {u.total_merchant > 0 && (u.tercapai ? (
          <Badge tone="good" icon={<CheckCircle2 aria-hidden className="size-3.5" />}>Target tercapai · gap 0</Badge>
        ) : (
          <Link href={listHref({ follow_up: "perlu", sort: "priority" })} className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
            Perlu {fmtNumber(u.gap_usak_50)} merchant lagi · lihat prioritas <ChevronRight aria-hidden className="size-4" />
          </Link>
        ))}
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
    <ul className="space-y-1">
      {items.map((item) => {
        const share = total > 0 ? (item.count / total) * 100 : 0;
        const body = (
          <>
            <span className="flex w-28 shrink-0 flex-col items-start justify-center gap-1 sm:w-36" title={item.label}>
              <span className="max-w-full truncate text-sm text-ink">{item.label}</span>
              {extra?.(item)}
            </span>
            <span className="relative h-2.5 min-w-8 flex-1" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-r bg-accent transition-opacity group-hover:opacity-80" style={{ width: `${Math.max((item.count / max) * 100, 1.5)}%` }} />
            </span>
            <span className="w-24 shrink-0 text-right text-sm text-ink tabular">
              {fmtNumber(item.count)} <span className="text-xs text-ink-2">({fmtNumber(share, 1)}%)</span>
            </span>
          </>
        );
        const title = `${item.label}: ${fmtNumber(item.count)} merchant (${fmtNumber(share, 1)}%)`;
        return (
          <li key={item.value}>
            {hrefFor ? (
              <Link href={hrefFor(item.value)} title={title} className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-2">
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

/** Tabel silang grading_trx × Tiering dengan intensitas satu hue (terang -> gelap). */
function CrossTab({ data }: { data: DashboardSummary }) {
  const { rows, cols, cells } = data.grading_trx_x_tiering;
  const max = Math.max(1, ...cells.flat());
  const colTotals = cols.map((_, c) => cells.reduce((s, r) => s + r[c], 0));
  return (
    <Card title="Merchant berdasarkan grading_trx dan Tiering" subtitle="Jumlah merchant; warna lebih pekat = jumlah lebih banyak. Klik sel untuk melihat daftar.">
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="w-full min-w-[22rem] border-separate border-spacing-0.5 text-sm">
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
                  return (
                    <td key={c.value} className="p-0">
                      <Link
                        href={listHref({ grading_trx: r.value, Tiering: c.value })}
                        title={`grading_trx ${r.label}, ${c.label}: ${fmtNumber(n)} merchant`}
                        className={cx("block rounded px-2 py-2 text-center tabular hover:outline hover:outline-2 hover:outline-ink/30", strength > 52 ? "text-white" : "text-ink")}
                        style={{ background: n === 0 ? "var(--surface-2)" : `color-mix(in oklab, var(--accent) ${strength}%, var(--surface))` }}
                      >
                        {n === 0 ? <span className="text-muted">0</span> : fmtNumber(n)}
                      </Link>
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right font-medium text-ink tabular">{fmtNumber(r.count)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="px-2 py-1.5 text-left text-xs font-medium text-ink-2">Total</th>
              {colTotals.map((t, i) => (
                <td key={cols[i].value} className="px-2 py-1.5 text-center font-medium text-ink tabular">{fmtNumber(t)}</td>
              ))}
              <td className="px-2 py-1.5 text-right font-semibold text-ink tabular">{fmtNumber(data.usak.total_merchant)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FollowUpPanel({ data }: { data: DashboardSummary }) {
  const f = data.follow_up;
  const tiles = [
    { label: "Perlu follow-up", value: f.perlu_follow_up, href: listHref({ follow_up: "perlu", sort: "priority" }), icon: Flag, tone: "text-accent-ink" },
    { label: "Jadwal jatuh tempo", value: f.jatuh_tempo, href: listHref({ follow_up: "jatuh_tempo", sort: "next_follow_up" }), icon: CalendarClock, tone: f.jatuh_tempo > 0 ? "text-critical-ink" : "text-muted" },
    {
      label: "Belum USAK & belum pernah di-follow-up",
      value: f.belum_pernah_belum_usak,
      href: listHref({ follow_up: "belum_pernah", kategori_usak: ["BELUM_USAK", "PERLU_CEK"] }),
      icon: ClipboardList,
      tone: "text-muted",
    },
    { label: "Follow-up dicatat bulan ini", value: f.dicatat_bulan_ini, href: listHref({ follow_up: "sudah_ada", sort: "last_follow_up" }), icon: CheckCircle2, tone: "text-muted" },
  ];
  return (
    <Card title="Merchant yang memerlukan follow-up" subtitle="Berdasarkan aturan prioritas (sheet PriorityRules) dan status follow-up terakhir">
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(({ label, value, href, icon: Icon, tone }) => (
          <Link key={label} href={href} className="group rounded-lg border border-line p-3 hover:bg-surface-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-ink-2">{label}</p>
              <Icon aria-hidden className={cx("size-4 shrink-0", tone)} />
            </div>
            <p className="mt-1 text-xl font-semibold text-ink">{fmtNumber(value)}</p>
          </Link>
        ))}
      </div>
      {f.by_status.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-ink-2">Status follow-up terakhir</p>
          <BarList items={f.by_status} total={f.sudah_ada} hrefFor={(v) => listHref({ status_follow_up: v })} />
        </div>
      )}
    </Card>
  );
}

const METRIC_ROWS: { label: string; money: boolean; keys: (MetricKey | null)[] }[] = [
  { label: "Frekuensi transaksi", money: false, keys: ["freq_mtd", "freq_ytd", "freq_30_days"] },
  { label: "Nilai transaksi (SV)", money: true, keys: ["sv_mtd", "sv_ytd", "sv_30_days"] },
  { label: "FBI", money: true, keys: ["fbi_mtd", "fbi_ytd", null] },
];

function MetricsTable({ data }: { data: DashboardSummary }) {
  return (
    <Card
      title="Ringkasan performa cabang"
      subtitle="Snapshot data saat ini (bukan tren historis). Total = jumlah seluruh merchant; rata-rata = total ÷ merchant yang memiliki nilai."
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-2">
              <th scope="col" className="py-2 pr-3 font-medium">Metrik</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">MTD <span className="font-normal">(bulan berjalan)</span></th>
              <th scope="col" className="px-3 py-2 text-right font-medium">YTD <span className="font-normal">(tahun berjalan)</span></th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">30 hari terakhir</th>
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map((row) => (
              <tr key={row.label} className="border-b border-line last:border-0">
                <th scope="row" className="py-3 pr-3 text-left font-medium text-ink">{row.label}</th>
                {row.keys.map((k, i) => {
                  const m = k ? data.metrics[k] : null;
                  return (
                    <td key={k ?? i} className={cx("py-3 text-right align-top tabular", i === 2 ? "pl-3" : "px-3")}>
                      {m ? (
                        <>
                          <div className="font-semibold text-ink" title={row.money ? fmtRupiah(m.sum) : fmtNumber(m.sum)}>
                            {row.money ? fmtRupiah(m.sum, true) : fmtCompact(m.sum)}
                          </div>
                          <div className="text-xs text-ink-2">
                            rata-rata {row.money ? fmtRupiah(m.avg, true) : fmtNumber(m.avg, 1)}
                            {m.count < data.usak.total_merchant && <> · {fmtNumber(m.count)} data</>}
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

function PriorityList({ data }: { data: DashboardSummary }) {
  const items = data.prioritas_teratas;
  return (
    <Card
      title="Prioritas follow-up teratas"
      subtitle="Diurutkan menurut skor aturan prioritas, lalu SV MTD"
      action={
        <Link href={listHref({ follow_up: "perlu", sort: "priority" })} className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
          Lihat semua <ChevronRight aria-hidden className="size-4" />
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyState title="Tidak ada merchant yang perlu follow-up">Semua merchant sudah memenuhi kriteria atau sudah ditindaklanjuti.</EmptyState>
      ) : (
        <ul className="-my-2 divide-y divide-line">
          {items.map((m) => (
            <li key={m.store_id}>
              <Link href={`/merchants/${encodeURIComponent(m.store_id)}`} className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md px-2 py-2.5 hover:bg-surface-2">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-medium text-ink">{m.store_name}</p>
                  <p className="truncate text-xs text-ink-2">{m.store_id} · {m.priority.reasons.map((r) => r.label).join(", ")}</p>
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

