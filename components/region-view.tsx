"use client";

import { AlertTriangle, CheckCircle2, ChevronRight, RefreshCw, Search, Target } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDateTime, fmtNumber, fmtPercent } from "@/lib/format";
import { useApi } from "@/lib/client/use-api";
import type { RegionBranch, RegionSearch, RegionSummary } from "@/lib/types";
import { UsakBadge } from "./badges";
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
  const [minR, setMinR] = useState("");
  const [maxR, setMaxR] = useState("");
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    const lo = minR.trim() === "" ? null : Number(minR.replace(",", "."));
    const hi = maxR.trim() === "" ? null : Number(maxR.replace(",", "."));
    // Rentang rasio [dari, sampai): batas bawah termasuk, batas atas tidak.
    return data.cabang.filter((b) =>
      (!area || b.nama_area === area) &&
      (lo === null || Number.isNaN(lo) || b.rasio_usak >= lo) &&
      (hi === null || Number.isNaN(hi) || b.rasio_usak < hi) &&
      (!term || `${b.nama_cabang} ${b.kode_cabang} ${b.nama_area}`.toLowerCase().includes(term)));
  }, [data, minR, maxR, q, area]);

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

      <MerchantSearch />

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
                <button type="button" onClick={() => setArea(area === a.nama_area ? "" : a.nama_area)} aria-pressed={area === a.nama_area} className={cx("truncate text-left hover:underline", area === a.nama_area ? "font-semibold text-accent-ink" : "text-ink")} title={`Filter tabel cabang: ${a.nama_area}`}>{a.nama_area} <span className="text-xs text-ink-2">· {fmtNumber(a.cabang)} cabang</span></button>
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
      >
        {data.cakupan.areas.length > 1 && (
          <div className="mb-3 max-w-sm">
            <label htmlFor="filter-area" className="mb-1 block text-xs font-medium text-ink-2">Area</label>
            <select
              id="filter-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className={cx("h-10 w-full rounded-lg border bg-surface px-2 text-sm text-ink", area ? "border-accent" : "border-line-strong")}
            >
              <option value="">Semua area ({fmtNumber(data.cakupan.areas.length)})</option>
              {data.area.map((a) => (
                <option key={a.nama_area} value={a.nama_area}>{a.nama_area} ({fmtNumber(a.cabang)} cabang)</option>
              ))}
            </select>
          </div>
        )}
        <RatioFilter minR={minR} maxR={maxR} setMinR={setMinR} setMaxR={setMaxR} target={u.target_ratio_persen} shown={rows.length} total={data.cabang_total} />
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

/** Filter rentang rasio USAK: dari (≥) sampai (<), dengan pilihan cepat. */
function RatioFilter({ minR, maxR, setMinR, setMaxR, target, shown, total }: {
  minR: string; maxR: string; setMinR: (v: string) => void; setMaxR: (v: string) => void; target: number; shown: number; total: number;
}) {
  const half = Math.round(target / 2);
  const presets: { label: string; lo: string; hi: string }[] = [
    { label: "Semua", lo: "", hi: "" },
    { label: `< ${half}%`, lo: "", hi: String(half) },
    { label: `${half}% – <${target}%`, lo: String(half), hi: String(target) },
    { label: `< ${target}% (belum target)`, lo: "", hi: String(target) },
    { label: `≥ ${target}%`, lo: String(target), hi: "" },
  ];
  const active = (p: { lo: string; hi: string }) => p.lo === minR && p.hi === maxR;
  const input = "h-9 w-20 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink tabular";
  return (
    <div className="mb-3 rounded-lg border border-line bg-surface-2 p-3">
      <p className="mb-2 text-xs font-medium text-ink-2">Filter rasio USAK</p>
      <div className="flex flex-wrap items-end gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => { setMinR(p.lo); setMaxR(p.hi); }}
            aria-pressed={active(p)}
            className={cx("h-8 rounded-full border px-3 text-xs font-medium", active(p) ? "border-accent bg-accent-wash text-accent-ink" : "border-line-strong text-ink-2 hover:bg-surface hover:text-ink")}
          >
            {p.label}
          </button>
        ))}
        <div className="ml-auto flex items-end gap-2">
          <div>
            <label htmlFor="rasio-min" className="mb-1 block text-xs text-ink-2">Dari (≥) %</label>
            <input id="rasio-min" inputMode="decimal" value={minR} onChange={(e) => setMinR(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 6))} placeholder="0" className={input} />
          </div>
          <div>
            <label htmlFor="rasio-max" className="mb-1 block text-xs text-ink-2">Sampai (&lt;) %</label>
            <input id="rasio-max" inputMode="decimal" value={maxR} onChange={(e) => setMaxR(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 6))} placeholder="100" className={input} />
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-2">Menampilkan {fmtNumber(shown)} dari {fmtNumber(total)} cabang. Batas bawah termasuk, batas atas tidak (mis. 0–25 mencakup 24,9% tetapi bukan 25,0%).</p>
    </div>
  );
}

/** Cari merchant di semua cabang dalam cakupan (nama merchant, MID, store ID, nama pemilik). */
function MerchantSearch() {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(input.trim()), 500);
    return () => clearTimeout(t);
  }, [input]);
  const url = term.length >= 3 ? `/api/region/search?q=${encodeURIComponent(term)}` : null;
  const { data, error, loading } = useApi<RegionSearch>(url);
  const current = data && data.q === term ? data : undefined;

  return (
    <Card title="Cari merchant" subtitle="Di semua cabang dalam cakupan Anda: nama merchant, MID, store ID, atau nama pemilik (minimal 3 karakter).">
      <div className="relative">
        <label htmlFor="cari-merchant" className="sr-only">Cari merchant</label>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          id="cari-merchant"
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={100}
          placeholder="Contoh: nama toko, MID 7200…, atau nama pemilik"
          className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted"
        />
      </div>
      <div className={cx("mt-3 transition-opacity", loading && "opacity-60")} aria-live="polite">
        {term.length > 0 && term.length < 3 && <p className="text-sm text-ink-2">Ketik minimal 3 karakter.</p>}
        {url && loading && !current && <p className="text-sm text-ink-2">Mencari…</p>}
        {url && error && !loading && <Alert tone="error">{error.message}</Alert>}
        {current && current.items.length === 0 && (
          <EmptyState title="Merchant tidak ditemukan">Tidak ada merchant yang cocok dengan “{current.q}” di {fmtNumber(current.cabang_dicari)} cabang dalam cakupan Anda.</EmptyState>
        )}
        {current && current.items.length > 0 && (
          <>
            <div className="-mx-4 hidden overflow-x-auto px-4 sm:-mx-5 sm:px-5 md:block">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-2">
                    <th scope="col" className="py-2 pr-3 font-medium">Merchant</th>
                    <th scope="col" className="px-3 py-2 font-medium">Pemilik</th>
                    <th scope="col" className="px-3 py-2 font-medium">Cabang</th>
                    <th scope="col" className="px-3 py-2 font-medium">Tiering</th>
                    <th scope="col" className="py-2 pl-3 font-medium">Status USAK</th>
                  </tr>
                </thead>
                <tbody>
                  {current.items.map((m) => (
                    <tr key={m.store_id} className="border-b border-line last:border-0 hover:bg-surface-2">
                      <td className="py-2.5 pr-3">
                        <Link href={merchantHref(m)} className="font-medium text-accent-ink hover:underline">{m.store_name || m.mid_static || m.store_id}</Link>
                        <span className="block text-xs text-ink-2">{m.mid_static || m.store_id}</span>
                      </td>
                      <td className="px-3 py-2.5 text-ink">{m.owner_name || "—"}</td>
                      <td className="px-3 py-2.5 text-ink">{m.nama_cabang}<span className="block text-xs text-ink-2">{m.kode_cabang}</span></td>
                      <td className="px-3 py-2.5 text-ink">{m.Tiering || "—"}</td>
                      <td className="py-2.5 pl-3"><UsakBadge usak={m.usak} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-2 md:hidden">
              {current.items.map((m) => (
                <li key={m.store_id}>
                  <Link href={merchantHref(m)} className="block rounded-xl border border-line p-3 active:bg-surface-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{m.store_name || m.mid_static || m.store_id}</p>
                        <p className="truncate text-xs text-ink-2">{m.mid_static || m.store_id} · {m.owner_name || "—"}</p>
                      </div>
                      <UsakBadge usak={m.usak} />
                    </div>
                    <p className="mt-1.5 text-xs text-ink-2">{m.nama_cabang} · {m.Tiering || "—"}</p>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-2">
              {fmtNumber(current.items.length)} hasil dari {fmtNumber(current.cabang_dicari)} cabang.
              {current.truncated && " Hasil dibatasi 40 pertama; persempit kata kunci untuk hasil yang lebih tepat."}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function merchantHref(m: { store_id: string; kode_cabang: string }) {
  return `/merchants/${encodeURIComponent(m.store_id)}?cabang=${encodeURIComponent(m.kode_cabang)}`;
}
