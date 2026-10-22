"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { COLUMN_LABELS, FILTER_COLUMNS, SORT_OPTIONS } from "@/lib/columns";
import { fmtCompact, fmtNumber, fmtRupiah } from "@/lib/format";
import { downloadMerchantsXlsx } from "@/lib/client/export-xlsx";
import { useApi } from "@/lib/client/use-api";
import type { FilterOptions, MerchantList, MerchantListItem, Option } from "@/lib/types";
import { FollowUpCell, PriorityBadge, UsakBadge } from "./badges";
import { Alert, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, cx, fieldCls, labelCls, tableCls } from "./ui";

const PAGE_SIZES = ["10", "25", "50", "100"];
const FILTER_KEYS = ["kategori_usak", "follow_up", "status_follow_up", ...FILTER_COLUMNS] as const;

export function MerchantListView({ branch }: { branch?: string } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const apiQuery = useMemo(() => {
    const sp = new URLSearchParams(query);
    if (branch) sp.set("kode_cabang", branch);
    return sp.toString();
  }, [query, branch]);
  const list = useApi<MerchantList>(`/api/merchants?${apiQuery}`);
  const options = useApi<FilterOptions>(branch ? `/api/merchants/filter-options?kode_cabang=${encodeURIComponent(branch)}` : "/api/merchants/filter-options");

  const qParam = searchParams.get("q") ?? "";
  const [q, setQ] = useState(qParam);
  const [syncedQ, setSyncedQ] = useState(qParam);
  if (qParam !== syncedQ) {
    // Sinkronkan kotak pencarian bila URL berubah (mis. tombol kembali).
    setSyncedQ(qParam);
    setQ(qParam);
  }

  function update(changes: Record<string, string | null>, resetPage = true) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    if (resetPage) sp.delete("page");
    const s = sp.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  // Cari otomatis setelah pengguna berhenti mengetik.
  useEffect(() => {
    if (q === qParam) return;
    const t = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (q.trim()) sp.set("q", q.trim());
      else sp.delete("q");
      sp.delete("page");
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    }, 400);
    return () => clearTimeout(t);
  }, [q, qParam, searchParams, router, pathname]);

  const sort = searchParams.get("sort") || "priority";
  const dir = (searchParams.get("dir") as "asc" | "desc" | null) || SORT_OPTIONS.find((o) => o.value === sort)?.defaultDir || "desc";
  const activeFilters = FILTER_KEYS.filter((k) => searchParams.getAll(k).some((v) => v !== "")).length;

  function setSort(field: string) {
    const def = SORT_OPTIONS.find((o) => o.value === field)?.defaultDir ?? "desc";
    const nextDir = field === sort ? (dir === "asc" ? "desc" : "asc") : def;
    update({ sort: field, dir: nextDir });
  }

  function resetFilters() {
    setQ("");
    const sp = new URLSearchParams();
    for (const k of ["sort", "dir", "page_size"]) {
      const v = searchParams.get(k);
      if (v) sp.set(k, v);
    }
    router.replace(sp.toString() ? `${pathname}?${sp.toString()}` : pathname, { scroll: false });
  }

  // Merchant terpilih disimpan utuh (lintas halaman) agar bisa diunduh sebagai Excel.
  const [selected, setSelected] = useState<Map<string, MerchantListItem>>(new Map());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const toggle = (m: MerchantListItem) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(m.store_id)) next.delete(m.store_id);
      else next.set(m.store_id, m);
      return next;
    });
  const setMany = (items: MerchantListItem[], on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const m of items) {
        if (on) next.set(m.store_id, m);
        else next.delete(m.store_id);
      }
      return next;
    });
  async function exportSelected() {
    if (!list.data || selected.size === 0) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadMerchantsXlsx([...selected.values()], { today: list.data.today, sourceColumn: list.data.usak_source, branch });
    } catch {
      setExportError("Gagal membuat berkas Excel. Coba lagi.");
    } finally {
      setExporting(false);
    }
  }

  const data = list.data;
  const searchHint = data?.search_fields.includes("account_number")
    ? "Cari nama merchant, MID, pemilik, atau no. rekening"
    : "Cari nama merchant, MID, atau nama pemilik";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Daftar merchant"
        subtitle={data ? `${fmtNumber(data.total)} dari ${fmtNumber(data.total_branch)} merchant cabang` : "Memuat…"}
      />

      {data && !data.usak_configured && (
        <Alert tone="warn">Definisi USAK belum dikonfigurasi. Kategori USAK pada daftar ini belum final.</Alert>
      )}

      <Filters
        q={q}
        setQ={setQ}
        searchHint={searchHint}
        options={options.data}
        optionsError={options.error?.message}
        searchParams={searchParams}
        update={update}
        sort={sort}
        dir={dir}
        activeFilters={activeFilters}
        resetFilters={resetFilters}
      />

      {list.error && <ErrorState message={list.error.message} onRetry={list.reload} />}

      {(selected.size > 0 || exportError) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent-wash px-3 py-2 text-[13px] text-accent-ink" role="status">
          <span className="font-medium">{fmtNumber(selected.size)} merchant dipilih</span>
          <Button size="sm" onClick={exportSelected} loading={exporting} disabled={selected.size === 0}>
            {!exporting && <Download aria-hidden className="size-3.5" />} Unduh Excel
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())}>Kosongkan pilihan</Button>
          {exportError && <span className="text-critical-ink">{exportError}</span>}
        </div>
      )}

      {!data && !list.error && <ListSkeleton />}

      {data && (
        <div className={cx("transition-opacity", list.loading && "opacity-60")} aria-busy={list.loading}>
          {data.items.length === 0 ? (
            <Card>
              {data.total_branch === 0 ? (
                <EmptyState title="Belum ada merchant di cabang ini">Data merchant cabang Anda belum tersedia di sheet Merchants.</EmptyState>
              ) : (
                <EmptyState title="Tidak ada merchant yang cocok" action={<Button variant="secondary" size="sm" onClick={resetFilters}>Reset filter</Button>}>
                  Ubah kata kunci atau filter untuk melihat merchant lain.
                </EmptyState>
              )}
            </Card>
          ) : (
            <>
              <MerchantTable selected={selected} toggle={toggle} setMany={setMany} items={data.items} today={data.today} sort={data.sort} dir={data.dir} onSort={setSort} configured={data.usak_configured} source={data.usak_source} branch={branch} />
              <MerchantCards selected={selected} toggle={toggle} items={data.items} today={data.today} configured={data.usak_configured} source={data.usak_source} branch={branch} />
              <Pagination data={data} update={update} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1.5" aria-busy="true" aria-label="Memuat daftar merchant">
      {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}
    </div>
  );
}

function Select({ id, label, value, onChange, options, allLabel = "Semua" }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  allLabel?: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(fieldCls, "px-2", value ? "border-accent bg-accent-wash/40" : "border-line-strong")}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}{o.count !== undefined ? ` (${fmtNumber(o.count)})` : ""}
          </option>
        ))}
        {value && !options.some((o) => o.value === value) && <option value={value}>{value}</option>}
      </select>
    </div>
  );
}

function Filters({ q, setQ, searchHint, options, optionsError, searchParams, update, sort, dir, activeFilters, resetFilters }: {
  q: string;
  setQ: (v: string) => void;
  searchHint: string;
  options?: FilterOptions;
  optionsError?: string;
  searchParams: URLSearchParams;
  update: (changes: Record<string, string | null>, resetPage?: boolean) => void;
  sort: string;
  dir: "asc" | "desc";
  activeFilters: number;
  resetFilters: () => void;
}) {
  const [open, setOpen] = useState(activeFilters > 0);
  const get = (k: string) => searchParams.get(k) ?? "";
  const colOptions = (col: string) => options?.columns[col] ?? [];
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-0 flex-1 basis-64">
          <label htmlFor="q" className="sr-only">Pencarian</label>
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            id="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={100}
            placeholder={searchHint}
            className={cx(fieldCls, "border-line-strong pl-8")}
          />
        </div>
        <div className="flex w-full items-end gap-2 sm:w-auto">
          <div className="min-w-0 flex-1 sm:flex-none">
            <label htmlFor="sort" className="sr-only">Urutkan</label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => update({ sort: e.target.value, dir: SORT_OPTIONS.find((o) => o.value === e.target.value)?.defaultDir ?? "desc" })}
              className={cx(fieldCls, "border-line-strong px-2")}
              title="Urutkan"
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>Urut: {o.label}</option>)}
            </select>
          </div>
          <Button
            variant="secondary"
            className="px-2.5"
            onClick={() => update({ dir: dir === "asc" ? "desc" : "asc" })}
            aria-label={dir === "asc" ? "Urutan naik, ubah ke turun" : "Urutan turun, ubah ke naik"}
            title={dir === "asc" ? "Naik (A–Z / kecil–besar)" : "Turun (Z–A / besar–kecil)"}
          >
            {dir === "asc" ? <ArrowUp aria-hidden className="size-4" /> : <ArrowDown aria-hidden className="size-4" />}
          </Button>
          <Button variant="secondary" className={cx("px-3", activeFilters > 0 && "border-accent text-accent-ink")} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="filter-panel">
            <SlidersHorizontal aria-hidden className="size-4" />
            Filter{activeFilters > 0 && ` (${activeFilters})`}
          </Button>
        </div>
      </div>

      {open && (
        <div id="filter-panel" className="mt-3 border-t border-line pt-3">
          {optionsError && <p className="mb-2 text-xs text-critical-ink">Pilihan filter gagal dimuat: {optionsError}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Select id="f-kategori" label="Kategori USAK" value={get("kategori_usak")} onChange={(v) => update({ kategori_usak: v })} options={options?.kategori_usak ?? []} />
            <Select id="f-followup" label="Kebutuhan follow-up" value={get("follow_up")} onChange={(v) => update({ follow_up: v })} options={options?.follow_up ?? []} />
            <Select
              id="f-status-fu"
              label="Status follow-up"
              value={get("status_follow_up")}
              onChange={(v) => update({ status_follow_up: v })}
              options={[...(options?.status_follow_up ?? []), { value: "__KOSONG__", label: "Belum ada follow-up" }]}
            />
            {FILTER_COLUMNS.filter((col) => !options || options.columns[col]).map((col) => (
              <Select
                key={col}
                id={`f-${col}`}
                label={col === options?.usak_source ? `${COLUMN_LABELS[col]} (acuan USAK)` : COLUMN_LABELS[col]}
                value={get(col)}
                onChange={(v) => update({ [col]: v })}
                options={colOptions(col)}
              />
            ))}
          </div>
          {(activeFilters > 0 || q) && (
            <div className="mt-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X aria-hidden className="size-3.5" /> Reset filter
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Col = { key: string; label: string; sort?: string; align?: "right"; className?: string };

const COLUMNS: Col[] = [
  { key: "merchant", label: "Merchant", sort: "store_name", className: "sticky left-0 z-10 bg-surface min-w-56" },
  { key: "owner_name", label: "Pemilik", className: "min-w-36" },
  { key: "status_trx", label: "Status trx" },
  { key: "grading_trx", label: "Grading trx" },
  { key: "grading_usak", label: "Grading USAK", className: "min-w-40" },
  { key: "Tiering", label: "Tiering" },
  { key: "freq_mtd", label: "Trx MTD", sort: "freq_mtd", align: "right" },
  { key: "sv_mtd", label: "SV MTD", sort: "sv_mtd", align: "right" },
  { key: "fbi_mtd", label: "FBI MTD", sort: "fbi_mtd", align: "right" },
  { key: "freq_30_days", label: "Trx 30 hr", sort: "freq_30_days", align: "right" },
  { key: "sv_30_days", label: "SV 30 hr", sort: "sv_30_days", align: "right" },
  { key: "cabang", label: "Cabang", className: "min-w-36" },
  { key: "nama_area_final", label: "Area", className: "min-w-36" },
  { key: "status_rekening", label: "Status rek." },
  { key: "flag_card_dongle", label: "Card dongle" },
  { key: "priority", label: "Prioritas", sort: "priority" },
  { key: "follow_up", label: "Follow-up / tindak lanjut", sort: "next_follow_up", className: "min-w-48" },
];

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown aria-hidden className="size-3 opacity-50" />;
  return dir === "asc" ? <ArrowUp aria-hidden className="size-3" /> : <ArrowDown aria-hidden className="size-3" />;
}

function detailHref(storeId: string, branch?: string) {
  return `/merchants/${encodeURIComponent(storeId)}${branch ? `?cabang=${encodeURIComponent(branch)}` : ""}`;
}

function cell(m: MerchantListItem, key: string, today: string, configured: boolean, source: string, branch?: string) {
  switch (key) {
    case "merchant":
      return (
        <div className="min-w-0">
          <Link href={detailHref(m.store_id, branch)} className="block truncate font-medium text-accent-ink hover:underline">
            {m.store_name || m.mid_static || m.store_id}
          </Link>
          <span className="text-xs text-ink-2">{m.mid_static || m.store_id}</span>
        </div>
      );
    case "grading_usak":
    case "grading_trx":
      // Kolom sumber USAK menampilkan nilainya beserta kategori USAK; kolom lain tampil biasa.
      if (key === source) {
        return (
          <div className="flex flex-col items-start gap-1">
            <span className="text-ink">{m.usak.nilai || <span className="text-muted">(kosong)</span>}</span>
            <UsakBadge usak={m.usak} configured={configured} />
          </div>
        );
      }
      return m[key] || <span className="text-muted">—</span>;
    case "freq_mtd":
    case "freq_30_days":
      return fmtNumber(m[key]);
    case "sv_mtd":
    case "fbi_mtd":
    case "sv_30_days":
      return <span title={fmtRupiah(m[key])}>{fmtRupiah(m[key], true)}</span>;
    case "cabang":
      return (
        <div className="min-w-0">
          <span className="block truncate">{m.nama_cabang_final}</span>
          <span className="text-xs text-ink-2">{m.kode_cabang_final}</span>
        </div>
      );
    case "priority":
      return m.priority.perlu_follow_up ? <PriorityBadge priority={m.priority} /> : <span className="text-xs text-muted">—</span>;
    case "follow_up":
      return <FollowUpCell fu={m.follow_up} today={today} />;
    default: {
      const v = m[key as keyof MerchantListItem];
      return typeof v === "string" && v ? v : <span className="text-muted">—</span>;
    }
  }
}

function MerchantTable({ items, today, sort, dir, onSort, configured, source, branch, selected, toggle, setMany }: {
  selected: Map<string, MerchantListItem>;
  toggle: (m: MerchantListItem) => void;
  setMany: (items: MerchantListItem[], on: boolean) => void;
  items: MerchantListItem[];
  today: string;
  sort: string;
  dir: "asc" | "desc";
  onSort: (field: string) => void;
  configured: boolean;
  source: string;
  branch?: string;
}) {
  // grading_usak hanya tampil bila menjadi kolom sumber USAK.
  const columns = COLUMNS.filter((c) => c.key !== "grading_usak" || source === "grading_usak");
  return (
    <div className="hidden overflow-x-auto rounded-md border border-line bg-surface md:block">
      <table className={tableCls.table}>
        <thead>
          <tr className={tableCls.headRow}>
            <th scope="col" className={cx(tableCls.th, "w-9 bg-surface-2")}>
              <input
                type="checkbox"
                aria-label="Pilih semua merchant di halaman ini"
                checked={items.length > 0 && items.every((m) => selected.has(m.store_id))}
                onChange={(e) => setMany(items, e.target.checked)}
                className="size-4 accent-[var(--btn)]"
              />
            </th>
            {columns.map((c) => {
              const active = c.sort === sort;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cx(tableCls.th, c.align === "right" && "text-right", c.className, c.key === "merchant" && "bg-surface-2")}
                >
                  {c.sort ? (
                    <button type="button" onClick={() => onSort(c.sort!)} className={cx("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}>
                      {c.label}
                      <SortIcon active={active} dir={dir} />
                    </button>
                  ) : c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.store_id} className={cx("group", tableCls.row, selected.has(m.store_id) && "bg-accent-wash/50")}>
              <td className={cx(tableCls.td, "w-9 align-top")}>
                <input
                  type="checkbox"
                  aria-label={`Pilih ${m.store_name || m.mid_static}`}
                  checked={selected.has(m.store_id)}
                  onChange={() => toggle(m)}
                  className="mt-0.5 size-4 accent-[var(--btn)]"
                />
              </td>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cx(
                    tableCls.td,
                    "align-top text-[13px] text-ink",
                    c.align === "right" && "text-right whitespace-nowrap",
                    c.className,
                    c.key === "merchant" && "group-hover:bg-surface-2 max-w-64",
                  )}
                >
                  {cell(m, c.key, today, configured, source, branch)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MerchantCards({ items, today, configured, source, branch, selected, toggle }: { selected: Map<string, MerchantListItem>; toggle: (m: MerchantListItem) => void; items: MerchantListItem[]; today: string; configured: boolean; source: string; branch?: string }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface md:hidden">
      {items.map((m) => (
        <li key={m.store_id} className={cx("flex items-start", selected.has(m.store_id) && "bg-accent-wash/50")}>
          <label className="flex shrink-0 cursor-pointer items-start py-3.5 pl-4">
            <span className="sr-only">Pilih {m.store_name || m.mid_static}</span>
            <input type="checkbox" checked={selected.has(m.store_id)} onChange={() => toggle(m)} className="size-4 accent-[var(--btn)]" />
          </label>
          <Link href={detailHref(m.store_id, branch)} className="block min-w-0 flex-1 px-3 py-3 active:bg-surface-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{m.store_name || m.mid_static || m.store_id}</p>
                <p className="truncate text-xs text-ink-2">{m.mid_static || m.store_id} · {m.owner_name || "—"}</p>
              </div>
              <PriorityBadge priority={m.priority} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
              <UsakBadge usak={m.usak} configured={configured} />
              <span>{m.usak.source_column}: {m.usak.nilai || "(kosong)"}</span>
              <span>· {m.status_trx || "—"}{source !== "grading_trx" && <> · {m.grading_trx || "—"}</>} · {m.Tiering || "—"}</span>
            </div>
            <dl className="mt-2 grid grid-cols-4 gap-2 text-xs">
              {[
                ["Trx MTD", fmtNumber(m.freq_mtd)],
                ["SV MTD", fmtCompact(m.sv_mtd)],
                ["FBI MTD", fmtCompact(m.fbi_mtd)],
                ["SV 30 hr", fmtCompact(m.sv_30_days)],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="truncate text-muted">{k}</dt>
                  <dd className="truncate font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 border-t border-line pt-2">
              <FollowUpCell fu={m.follow_up} today={today} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Pagination({ data, update }: { data: MerchantList; update: (c: Record<string, string | null>, resetPage?: boolean) => void }) {
  const start = (data.page - 1) * data.page_size + 1;
  const end = Math.min(data.total, data.page * data.page_size);
  const pages = data.total_pages;
  return (
    <nav aria-label="Navigasi halaman" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink-2">
      <p>Menampilkan {fmtNumber(start)}–{fmtNumber(end)} dari {fmtNumber(data.total)}</p>
      <div className="flex items-center gap-2">
        <label htmlFor="page_size" className="sr-only">Baris per halaman</label>
        <select
          id="page_size"
          value={String(data.page_size)}
          onChange={(e) => update({ page_size: e.target.value })}
          className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink"
        >
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / halaman</option>)}
        </select>
        <Button variant="secondary" size="sm" className="px-2" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) }, false)} aria-label="Halaman sebelumnya">
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <span className="tabular">{data.page} / {pages}</span>
        <Button variant="secondary" size="sm" className="px-2" disabled={data.page >= pages} onClick={() => update({ page: String(data.page + 1) }, false)} aria-label="Halaman berikutnya">
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
