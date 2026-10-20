"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDateTime, fmtNumber, fmtPercent } from "@/lib/format";
import { useApi } from "@/lib/client/use-api";
import type { RegionBranch, RegionSearch, RegionSummary } from "@/lib/types";
import { UsakBadge } from "./badges";
import { Alert, Badge, Card, EmptyState, ErrorState, KpiStrip, PageHeader, ReloadButton, Skeleton, cx, fieldCls, labelCls, tableCls } from "./ui";

export function branchHref(kode: string) {
  return `/pemantauan/${encodeURIComponent(kode)}?follow_up=perlu&sort=priority`;
}

/** Batang rasio USAK dengan penanda target 50%. */
function RatioBar({ value, target }: { value: number; target: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-1.5 w-full min-w-24 rounded-sm bg-accent-track" role="img" aria-label={`Rasio ${fmtPercent(value, { ceiling: target })}, target ${target}%`}>
      <div className="h-1.5 rounded-sm bg-accent" style={{ width: `${pct}%` }} />
      <div aria-hidden className="absolute -top-0.75 h-3 w-px -translate-x-1/2 bg-ink/70" style={{ left: `${target}%` }} />
    </div>
  );
}

function StatusBadge({ b, target }: { b: Pick<RegionBranch, "tercapai">; target: number }) {
  return b.tercapai ? <Badge tone="good">Tercapai</Badge> : <Badge tone="warn">Belum {target}%</Badge>;
}

export function RegionView() {
  const { data, error, loading, reload } = useApi<RegionSummary>("/api/region");
  const [minR, setMinR] = useState("");
  const [maxR, setMaxR] = useState("");
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [order, setOrder] = useState<"kode" | "rasio" | "gap">("kode");

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    const lo = minR.trim() === "" ? null : Number(minR.replace(",", "."));
    const hi = maxR.trim() === "" ? null : Number(maxR.replace(",", "."));
    // Rentang rasio [dari, sampai): batas bawah termasuk, batas atas tidak.
    const list = data.cabang.filter((b) =>
      (!area || b.nama_area === area) &&
      (lo === null || Number.isNaN(lo) || b.rasio_usak >= lo) &&
      (hi === null || Number.isNaN(hi) || b.rasio_usak < hi) &&
      (!term || `${b.nama_cabang} ${b.kode_cabang} ${b.nama_area}`.toLowerCase().includes(term)));
    const byKode = (a: RegionBranch, b: RegionBranch) => a.kode_cabang.localeCompare(b.kode_cabang, undefined, { numeric: true });
    return list.sort((a, b) =>
      order === "rasio" ? a.rasio_usak - b.rasio_usak || byKode(a, b)
      : order === "gap" ? b.gap_usak_50 - a.gap_usak_50 || byKode(a, b)
      : byKode(a, b));
  }, [data, minR, maxR, q, area, order]);

  if (!data && error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Memuat pemantauan">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const u = data.usak;
  const jenis = data.cakupan.jenis === "region" ? "Region" : "Area";
  const showArea = data.cakupan.areas.length > 1;
  const stamp = data.data.diperbarui ? fmtDateTime(data.data.diperbarui) : "";

  return (
    <div className={cx("space-y-4 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
      <PageHeader
        title={`Pemantauan ${jenis}`}
        subtitle={
          <span>
            {data.cakupan.nama} · {fmtNumber(data.cabang_total)} cabang
            {stamp && <span className="text-muted"> · data per indeks {stamp}</span>}
          </span>
        }
        action={<ReloadButton onClick={reload} loading={loading} />}
      />

      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data.warnings.map((w) => <Alert key={w.code} tone="warn">{w.message}</Alert>)}
      {!u.configured && (
        <Alert tone="warn" title="Definisi USAK belum dikonfigurasi">Angka USAK, rasio, dan gap belum final.</Alert>
      )}

      <KpiStrip
        items={[
          { label: "Total merchant", value: fmtNumber(u.total_merchant), sub: `${fmtNumber(data.cabang_total)} cabang` },
          { label: "Merchant USAK", value: fmtNumber(u.merchant_usak), sub: u.perlu_dicek > 0 ? `${fmtNumber(u.perlu_dicek)} perlu dicek` : `Belum USAK ${fmtNumber(u.total_merchant - u.merchant_usak)}` },
          { label: "Rasio USAK", value: fmtPercent(u.rasio_usak, { ceiling: u.target_ratio_persen }), sub: `Target ${u.target_ratio_persen}%` },
          {
            label: "Cabang di bawah target",
            value: <>{fmtNumber(data.cabang_belum)} <span className="text-sm font-normal text-ink-2">/ {fmtNumber(data.cabang_total)}</span></>,
            sub: `${fmtNumber(data.cabang_tercapai)} cabang sudah ≥ ${u.target_ratio_persen}%`,
          },
        ]}
      />

      <MerchantSearch />

      {data.area.length > 1 && (
        <Card title="Per area" subtitle="Rasio USAK gabungan · klik nama area untuk memfilter tabel cabang">
          <ul className="-my-1">
            {data.area.map((a) => (
              <li key={a.nama_area} className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-x-3 gap-y-1 py-1.5 text-[13px] sm:grid-cols-[minmax(0,1fr)_minmax(6rem,14rem)_4rem]">
                <button
                  type="button"
                  onClick={() => setArea(area === a.nama_area ? "" : a.nama_area)}
                  aria-pressed={area === a.nama_area}
                  className={cx("col-span-2 truncate text-left hover:underline sm:col-span-1", area === a.nama_area ? "font-semibold text-accent-ink" : "text-ink")}
                  title={`Filter tabel cabang: ${a.nama_area}`}
                >
                  {a.nama_area} <span className="text-xs text-muted">· {a.kode_area ? `${a.kode_area} · ` : ""}{fmtNumber(a.cabang)} cabang</span>
                </button>
                <RatioBar value={a.rasio_usak} target={u.target_ratio_persen} />
                <span className="text-right text-ink">{fmtPercent(a.rasio_usak, { ceiling: u.target_ratio_persen })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Cabang menurut rasio USAK" subtitle={`Urut ${order === "kode" ? "kode cabang" : order === "rasio" ? "rasio terendah" : "gap terbesar"} · klik cabang untuk melihat merchant yang perlu di-follow-up`} flush>
        <div className="space-y-2 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-0 flex-1 basis-56">
              <label htmlFor="cari-cabang" className={labelCls}>Cari cabang</label>
              <Search aria-hidden className="pointer-events-none absolute bottom-2.5 left-2.5 size-4 text-muted" />
              <input
                id="cari-cabang"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nama atau kode cabang"
                className={cx(fieldCls, "border-line-strong pl-8")}
              />
            </div>
            {showArea && (
              <div className="w-full sm:w-56">
                <label htmlFor="filter-area" className={labelCls}>Area</label>
                <select id="filter-area" value={area} onChange={(e) => setArea(e.target.value)} className={cx(fieldCls, area ? "border-accent" : "border-line-strong")}>
                  <option value="">Semua area ({fmtNumber(data.cakupan.areas.length)})</option>
                  {data.area.map((a) => (
                    <option key={a.nama_area} value={a.nama_area}>{a.nama_area} ({fmtNumber(a.cabang)})</option>
                  ))}
                </select>
              </div>
            )}
            <div className="w-full sm:w-44">
              <label htmlFor="urut-cabang" className={labelCls}>Urutkan</label>
              <select id="urut-cabang" value={order} onChange={(e) => setOrder(e.target.value as typeof order)} className={cx(fieldCls, "border-line-strong")}>
                <option value="kode">Kode cabang</option>
                <option value="rasio">Rasio terendah</option>
                <option value="gap">Gap terbesar</option>
              </select>
            </div>
            <RatioFilter minR={minR} maxR={maxR} setMinR={setMinR} setMaxR={setMaxR} target={u.target_ratio_persen} />
          </div>
          <p className="text-xs text-muted">Menampilkan {fmtNumber(rows.length)} dari {fmtNumber(data.cabang_total)} cabang</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState title={data.cabang_total === 0 ? "Belum ada cabang di cakupan Anda" : "Tidak ada cabang yang cocok"}>
            {data.cabang_total === 0 ? "Hubungi administrator untuk memeriksa pemetaan wilayah." : "Ubah kata kunci atau filter."}
          </EmptyState>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className={cx(tableCls.table, "min-w-[44rem]")}>
                <thead>
                  <tr className={tableCls.headRow}>
                    <th scope="col" className={tableCls.th}>Cabang</th>
                    {showArea && <th scope="col" className={tableCls.th}>Area</th>}
                    <th scope="col" className={cx(tableCls.th, "text-right")}>Merchant</th>
                    <th scope="col" className={cx(tableCls.th, "text-right")}>USAK</th>
                    <th scope="col" className={cx(tableCls.th, "w-52")}>Rasio USAK</th>
                    <th scope="col" className={cx(tableCls.th, "text-right")}>Gap ke {u.target_ratio_persen}%</th>
                    <th scope="col" className={tableCls.th}>Status</th>
                    <th scope="col" className={cx(tableCls.th, "w-8")}><span className="sr-only">Buka</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.kode_cabang} className={tableCls.row}>
                      <td className={tableCls.td}>
                        <Link href={branchHref(b.kode_cabang)} className="font-medium text-ink hover:text-accent-ink hover:underline">{b.nama_cabang}</Link>
                        <span className="block text-xs text-muted">{b.kode_cabang}</span>
                      </td>
                      {showArea && <td className={cx(tableCls.td, "text-[13px] text-ink-2")}>{b.nama_area}</td>}
                      <td className={cx(tableCls.td, "text-right text-ink")}>{fmtNumber(b.total_merchant)}</td>
                      <td className={cx(tableCls.td, "text-right text-ink")}>{fmtNumber(b.merchant_usak)}</td>
                      <td className={tableCls.td}>
                        <div className="flex items-center gap-2.5">
                          <RatioBar value={b.rasio_usak} target={u.target_ratio_persen} />
                          <span className="w-12 shrink-0 text-right text-ink">{fmtPercent(b.rasio_usak, { ceiling: u.target_ratio_persen })}</span>
                        </div>
                      </td>
                      <td className={cx(tableCls.td, "text-right font-medium text-ink")}>{b.tercapai ? "0" : fmtNumber(b.gap_usak_50)}</td>
                      <td className={tableCls.td}><StatusBadge b={b} target={u.target_ratio_persen} /></td>
                      <td className={tableCls.td}>
                        <Link href={branchHref(b.kode_cabang)} aria-label={`Buka ${b.nama_cabang}`} className="inline-flex rounded p-0.5 text-muted hover:text-ink">
                          <ChevronRight aria-hidden className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line md:hidden">
              {rows.map((b) => (
                <li key={b.kode_cabang}>
                  <Link href={branchHref(b.kode_cabang)} className="block px-4 py-3 active:bg-surface-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{b.nama_cabang}</p>
                        <p className="truncate text-xs text-muted">{b.kode_cabang}{showArea && ` · ${b.nama_area}`}</p>
                      </div>
                      <StatusBadge b={b} target={u.target_ratio_persen} />
                    </div>
                    <div className="mt-2 flex items-center gap-2.5">
                      <RatioBar value={b.rasio_usak} target={u.target_ratio_persen} />
                      <span className="w-12 shrink-0 text-right text-sm text-ink">{fmtPercent(b.rasio_usak, { ceiling: u.target_ratio_persen })}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div><dt className="text-muted">Merchant</dt><dd className="font-medium text-ink">{fmtNumber(b.total_merchant)}</dd></div>
                      <div><dt className="text-muted">USAK</dt><dd className="font-medium text-ink">{fmtNumber(b.merchant_usak)}</dd></div>
                      <div><dt className="text-muted">Gap</dt><dd className="font-medium text-ink">{b.tercapai ? "0" : fmtNumber(b.gap_usak_50)}</dd></div>
                    </dl>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
              Angka adalah snapshot saat indeks cabang dibangun admin, bukan hitung langsung.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

/** Filter rentang rasio USAK: dari (≥) sampai (<), dengan pilihan cepat. */
function RatioFilter({ minR, maxR, setMinR, setMaxR, target }: {
  minR: string; maxR: string; setMinR: (v: string) => void; setMaxR: (v: string) => void; target: number;
}) {
  const half = Math.round(target / 2);
  const presets: { label: string; lo: string; hi: string; title: string }[] = [
    { label: "Semua", lo: "", hi: "", title: "Semua rasio" },
    { label: `<${half}%`, lo: "", hi: String(half), title: `Rasio di bawah ${half}%` },
    { label: `${half}–${target}%`, lo: String(half), hi: String(target), title: `Rasio ${half}% sampai di bawah ${target}%` },
    { label: `<${target}%`, lo: "", hi: String(target), title: "Belum mencapai target" },
    { label: `≥${target}%`, lo: String(target), hi: "", title: "Sudah mencapai target" },
  ];
  const active = (p: { lo: string; hi: string }) => p.lo === minR && p.hi === maxR;
  const clean = (v: string) => v.replace(/[^0-9.,]/g, "").slice(0, 6);
  return (
    <>
      <div>
        <span id="rasio-cepat" className={labelCls}>Rasio USAK</span>
        <div role="group" aria-labelledby="rasio-cepat" className="inline-flex h-9 overflow-hidden rounded-md border border-line-strong">
          {presets.map((p, i) => (
            <button
              key={p.label}
              type="button"
              onClick={() => { setMinR(p.lo); setMaxR(p.hi); }}
              aria-pressed={active(p)}
              title={p.title}
              className={cx(
                "px-2.5 text-xs font-medium whitespace-nowrap",
                i > 0 && "border-l border-line-strong",
                active(p) ? "bg-accent-wash text-accent-ink" : "bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-1.5" title="Batas bawah termasuk, batas atas tidak (mis. 0–25 mencakup 24,9% tetapi bukan 25,0%)">
        <div className="w-20">
          <label htmlFor="rasio-min" className={labelCls}>Dari ≥ %</label>
          <input id="rasio-min" inputMode="decimal" value={minR} onChange={(e) => setMinR(clean(e.target.value))} placeholder="0" className={cx(fieldCls, "border-line-strong")} />
        </div>
        <span className="pb-2 text-xs text-muted">–</span>
        <div className="w-20">
          <label htmlFor="rasio-max" className={labelCls}>Sampai &lt; %</label>
          <input id="rasio-max" inputMode="decimal" value={maxR} onChange={(e) => setMaxR(clean(e.target.value))} placeholder="100" className={cx(fieldCls, "border-line-strong")} />
        </div>
      </div>
    </>
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
  const hasResults = !!current && current.items.length > 0;

  return (
    <Card title="Cari merchant" subtitle="Semua cabang dalam cakupan · nama merchant, MID, store ID, atau pemilik" flush>
      <div className="px-4 py-3">
        <div className="relative">
          <label htmlFor="cari-merchant" className="sr-only">Cari merchant</label>
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            id="cari-merchant"
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={100}
            placeholder="Minimal 3 karakter, mis. nama toko atau MID"
            className={cx(fieldCls, "border-line-strong pl-8")}
          />
        </div>
        <div className={cx("transition-opacity", loading && "opacity-60")} aria-live="polite">
          {term.length > 0 && term.length < 3 && <p className="mt-2 text-xs text-ink-2">Ketik minimal 3 karakter.</p>}
          {url && loading && !current && <p className="mt-2 text-xs text-ink-2">Mencari…</p>}
          {url && error && !loading && <div className="mt-2"><Alert tone="error">{error.message}</Alert></div>}
          {current && current.items.length === 0 && (
            <p className="mt-2 text-[13px] text-ink-2">Tidak ada merchant yang cocok dengan “{current.q}” di {fmtNumber(current.cabang_dicari)} cabang.</p>
          )}
        </div>
      </div>
      {hasResults && (
        <div className={cx("border-t border-line transition-opacity", loading && "opacity-60")}>
          <div className="hidden overflow-x-auto md:block">
            <table className={cx(tableCls.table, "min-w-[40rem]")}>
              <thead>
                <tr className={tableCls.headRow}>
                  <th scope="col" className={tableCls.th}>Merchant</th>
                  <th scope="col" className={tableCls.th}>Pemilik</th>
                  <th scope="col" className={tableCls.th}>Cabang</th>
                  <th scope="col" className={tableCls.th}>Tiering</th>
                  <th scope="col" className={tableCls.th}>Status USAK</th>
                </tr>
              </thead>
              <tbody>
                {current.items.map((m) => (
                  <tr key={m.store_id} className={tableCls.row}>
                    <td className={tableCls.td}>
                      <Link href={merchantHref(m)} className="font-medium text-accent-ink hover:underline">{m.store_name || m.mid_static || m.store_id}</Link>
                      <span className="block text-xs text-muted">{m.mid_static || m.store_id}</span>
                    </td>
                    <td className={cx(tableCls.td, "text-ink")}>{m.owner_name || "—"}</td>
                    <td className={cx(tableCls.td, "text-ink")}>{m.nama_cabang}<span className="block text-xs text-muted">{m.kode_cabang}</span></td>
                    <td className={cx(tableCls.td, "text-ink")}>{m.Tiering || "—"}</td>
                    <td className={tableCls.td}><UsakBadge usak={m.usak} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-line md:hidden">
            {current.items.map((m) => (
              <li key={m.store_id}>
                <Link href={merchantHref(m)} className="block px-4 py-3 active:bg-surface-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{m.store_name || m.mid_static || m.store_id}</p>
                      <p className="truncate text-xs text-muted">{m.mid_static || m.store_id} · {m.owner_name || "—"}</p>
                    </div>
                    <UsakBadge usak={m.usak} />
                  </div>
                  <p className="mt-1 text-xs text-ink-2">{m.nama_cabang} · {m.Tiering || "—"}</p>
                </Link>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
            {fmtNumber(current.items.length)} hasil dari {fmtNumber(current.cabang_dicari)} cabang.
            {current.truncated && " Dibatasi 40 hasil pertama; persempit kata kunci."}
          </p>
        </div>
      )}
    </Card>
  );
}

function merchantHref(m: { store_id: string; kode_cabang: string }) {
  return `/merchants/${encodeURIComponent(m.store_id)}?cabang=${encodeURIComponent(m.kode_cabang)}`;
}
