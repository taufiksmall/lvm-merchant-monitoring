"use client";

import { AlertTriangle, CheckCircle2, ChevronRight, RefreshCw, Search, Target } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtDateTime, fmtNumber, fmtPercent } from "@/lib/format";
import { useApi } from "@/lib/client/use-api";
import type { RegionBranch, RegionSummary } from "@/lib/types";
import { Alert, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, cx } from "./ui";

export function branchHref(kode: string) {
  return `/pemantauan/${encodeURIComponent(kode)}?follow_up=perlu&sort=priority`;
}

/** Batang rasio USAK dengan penanda target 50%. */
function RatioBar({ value, target }: { value: number; target: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-2 w-full min-w-24 rounded-full bg-accent-track" role="img" aria-label={`Rasio ${fmtPercent(value, { ceiling: target })}, target ${target}%`}>
      <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      <div aria-hidden className="absolute -top-0.5 h-3 w-0.5 -translate-x-1/2 rounded bg-ink" style={{ left: `${target}%` }} />
    </div>
  );
}

function StatusBadge({ b, target }: { b: Pick<RegionBranch, "tercapai">; target: number }) {
  return b.tercapai ? (
    <Badge tone="good" icon={<CheckCircle2 aria-hidden className="size-3.5" />}>Tercapai</Badge>
  ) : (
    <Badge tone="warn" icon={<Target aria-hidden className="size-3.5" />}>Belum {target}%</Badge>
  );
}

export function RegionView() {
  const { data, error, loading, reload } = useApi<RegionSummary>("/api/region");
  const [onlyLow, setOnlyLow] = useState(false);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.cabang.filter((b) => (!onlyLow || !b.tercapai) && (!term || `${b.nama_cabang} ${b.kode_cabang} ${b.nama_area}`.toLowerCase().includes(term)));
  }, [data, onlyLow, q]);

  if (!data && error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Memuat pemantauan">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const u = data.usak;
  const jenis = data.cakupan.jenis === "region" ? "Region" : "Area";
  const showArea = data.cakupan.areas.length > 1;
  const stamp = data.data.diperbarui ? fmtDateTime(data.data.diperbarui) : "";

  return (
    <div className={cx("space-y-5 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
      <PageHeader
        title={`Pemantauan ${jenis}`}
        subtitle={
          <span>
            {data.cakupan.nama} · {fmtNumber(data.cabang_total)} cabang
            {stamp && <span className="text-muted"> · data per indeks {stamp}</span>}
          </span>
        }
        action={<Button variant="secondary" size="sm" onClick={reload} loading={loading}>{!loading && <RefreshCw aria-hidden className="size-3.5" />} Muat ulang</Button>}
      />

      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data.warnings.map((w) => <Alert key={w.code} tone="warn">{w.message}</Alert>)}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Total merchant" value={fmtNumber(u.total_merchant)} sub={`${fmtNumber(data.cabang_total)} cabang`} />
        <Tile label="Merchant USAK" value={fmtNumber(u.merchant_usak)} sub={u.perlu_dicek > 0 ? `${fmtNumber(u.perlu_dicek)} perlu dicek` : "Sesuai konfigurasi UsakConfig"} />
        <Tile label="Rasio USAK" value={fmtPercent(u.rasio_usak, { ceiling: u.target_ratio_persen })} sub={`Target ${u.target_ratio_persen}%`} />
        <Tile
          label="Cabang belum mencapai target"
          value={<>{fmtNumber(data.cabang_belum)} <span className="text-base font-medium text-ink-2">dari {fmtNumber(data.cabang_total)}</span></>}
          sub={`${fmtNumber(data.cabang_tercapai)} cabang sudah ≥ ${u.target_ratio_persen}%`}
        />
      </div>

      {data.area.length > 1 && (
        <Card title="Per area" subtitle="Rasio USAK gabungan semua cabang di area">
          <ul className="space-y-1">
            {data.area.map((a) => (
              <li key={a.nama_area} className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,10rem)_auto] items-center gap-3 py-1.5 text-sm">
                <span className="truncate text-ink" title={a.nama_area}>{a.nama_area} <span className="text-xs text-ink-2">· {fmtNumber(a.cabang)} cabang</span></span>
                <RatioBar value={a.rasio_usak} target={u.target_ratio_persen} />
                <span className="w-28 text-right tabular text-ink">{fmtPercent(a.rasio_usak, { ceiling: u.target_ratio_persen })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Cabang menurut rasio USAK"
        subtitle="Diurutkan dari rasio terendah. Klik cabang untuk melihat merchant yang perlu di-follow-up."
        action={
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Hanya yang belum {u.target_ratio_persen}%
          </label>
        }
      >
        <div className="relative mb-3">
          <label htmlFor="cari-cabang" className="sr-only">Cari cabang</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            id="cari-cabang"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama atau kode cabang"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted"
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState title={data.cabang_total === 0 ? "Belum ada cabang di cakupan Anda" : "Tidak ada cabang yang cocok"}>
            {data.cabang_total === 0 ? "Hubungi administrator untuk memeriksa pemetaan wilayah." : "Ubah kata kunci atau matikan filter."}
          </EmptyState>
        ) : (
          <>
            <div className="-mx-4 hidden overflow-x-auto px-4 sm:-mx-5 sm:px-5 md:block">
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-2">
                    <th scope="col" className="py-2 pr-3 font-medium">Cabang</th>
                    {showArea && <th scope="col" className="px-3 py-2 font-medium">Area</th>}
                    <th scope="col" className="px-3 py-2 text-right font-medium">Total merchant</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">USAK</th>
                    <th scope="col" className="w-44 px-3 py-2 font-medium">Rasio USAK</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Gap ke {u.target_ratio_persen}%</th>
                    <th scope="col" className="py-2 pl-3 font-medium"><span className="sr-only">Status</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.kode_cabang} className="group border-b border-line last:border-0 hover:bg-surface-2">
                      <td className="py-2.5 pr-3">
                        <Link href={branchHref(b.kode_cabang)} className="font-medium text-accent-ink hover:underline">{b.nama_cabang}</Link>
                        <span className="block text-xs text-ink-2">{b.kode_cabang}</span>
                      </td>
                      {showArea && <td className="px-3 py-2.5 text-ink-2">{b.nama_area}</td>}
                      <td className="px-3 py-2.5 text-right tabular text-ink">{fmtNumber(b.total_merchant)}</td>
                      <td className="px-3 py-2.5 text-right tabular text-ink">{fmtNumber(b.merchant_usak)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <RatioBar value={b.rasio_usak} target={u.target_ratio_persen} />
                          <span className="w-14 shrink-0 text-right tabular text-ink">{fmtPercent(b.rasio_usak, { ceiling: u.target_ratio_persen })}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular font-medium text-ink">{b.tercapai ? "0" : fmtNumber(b.gap_usak_50)}</td>
                      <td className="py-2.5 pl-3">
                        <div className="flex items-center justify-end gap-1">
                          <StatusBadge b={b} target={u.target_ratio_persen} />
                          <Link href={branchHref(b.kode_cabang)} aria-label={`Buka ${b.nama_cabang}`} className="rounded p-1 text-ink-2 hover:text-ink"><ChevronRight aria-hidden className="size-4" /></Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-2 md:hidden">
              {rows.map((b) => (
                <li key={b.kode_cabang}>
                  <Link href={branchHref(b.kode_cabang)} className="block rounded-xl border border-line p-3 active:bg-surface-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{b.nama_cabang}</p>
                        <p className="truncate text-xs text-ink-2">{b.kode_cabang}{showArea && ` · ${b.nama_area}`}</p>
                      </div>
                      <StatusBadge b={b} target={u.target_ratio_persen} />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <RatioBar value={b.rasio_usak} target={u.target_ratio_persen} />
                      <span className="w-14 shrink-0 text-right text-sm tabular text-ink">{fmtPercent(b.rasio_usak, { ceiling: u.target_ratio_persen })}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div><dt className="text-ink-2">Merchant</dt><dd className="font-medium text-ink tabular">{fmtNumber(b.total_merchant)}</dd></div>
                      <div><dt className="text-ink-2">USAK</dt><dd className="font-medium text-ink tabular">{fmtNumber(b.merchant_usak)}</dd></div>
                      <div><dt className="text-ink-2">Gap</dt><dd className="font-medium text-ink tabular">{b.tercapai ? "0" : fmtNumber(b.gap_usak_50)}</dd></div>
                    </dl>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-2">
              Menampilkan {fmtNumber(rows.length)} dari {fmtNumber(data.cabang_total)} cabang. Angka adalah snapshot saat indeks cabang dibangun admin, bukan hitung langsung.
            </p>
          </>
        )}
      </Card>
      {!u.configured && (
        <Alert tone="warn" title="Definisi USAK belum dikonfigurasi">
          <span className="inline-flex items-center gap-1"><AlertTriangle aria-hidden className="size-4" />Angka USAK, rasio, dan gap belum final.</span>
        </Alert>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4">
      <p className="text-sm font-medium text-ink-2">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">{value}</p>
      {sub && <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{sub}</p>}
    </div>
  );
}
