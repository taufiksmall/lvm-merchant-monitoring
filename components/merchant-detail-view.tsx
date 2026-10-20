"use client";

import { ArrowLeft, Eye, EyeOff, Lock, Pencil } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { COLUMN_LABELS, DETAIL_SECTIONS, FINANCIAL_COLUMNS, MONEY_COLUMNS, type MerchantColumn } from "@/lib/columns";
import { displayValue, fmtDate, fmtDateTime, fmtNumber, fmtRupiah, relativeDays } from "@/lib/format";
import { ApiError, apiFetch } from "@/lib/client/api";
import { invalidateApi, useApi } from "@/lib/client/use-api";
import type { FollowUp, MerchantDetail, Option, RevealResult } from "@/lib/types";
import { FollowUpCell, PriorityBadge, UsakBadge } from "./badges";
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Skeleton, cx, fieldCls, labelCls, tableCls } from "./ui";

export function MerchantDetailView({ storeId, branch }: { storeId: string; branch?: string }) {
  const { data, error, loading, reload } = useApi<MerchantDetail>(`/api/merchants/${encodeURIComponent(storeId)}${branch ? `?kode_cabang=${encodeURIComponent(branch)}` : ""}`);

  const back = (
    <Link href={branch ? `/pemantauan/${encodeURIComponent(branch)}?follow_up=perlu&sort=priority` : "/merchants"} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
      <ArrowLeft aria-hidden className="size-4" /> {branch ? `Cabang ${branch}` : "Daftar merchant"}
    </Link>
  );

  if (!data && error) {
    return (
      <div className="space-y-4">
        {back}
        {error.status === 404 ? (
          <Card>
            <EmptyState title="Merchant tidak ditemukan">{error.message}</EmptyState>
          </Card>
        ) : (
          <ErrorState message={error.message} onRetry={reload} />
        )}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Memuat detail merchant">
        {back}
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const m = data.merchant;
  return (
    <div className={cx("space-y-4 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{displayValue(m.store_name)}</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">MID {displayValue(m.mid_static || m.store_id)} · {displayValue(m.owner_name)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <UsakBadge usak={data.usak} configured={data.usak_configured} />
          <PriorityBadge priority={data.priority} />
          <a href="#follow-up" className="inline-flex h-8 items-center rounded-md bg-btn px-2.5 text-xs font-medium text-white hover:bg-btn-hover lg:hidden">
            Catat follow-up
          </a>
        </div>
      </div>
      {error && <ErrorState message={error.message} onRetry={reload} />}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <UsakCard data={data} />
          <div className="grid gap-4 md:grid-cols-2">
            {DETAIL_SECTIONS.map((section) => (
              <Card key={section.title} title={section.title}>
                <FieldList columns={section.columns} data={data} storeId={storeId} />
              </Card>
            ))}
          </div>
          <PerformanceCard m={m} />
          <FinancialCard data={data} />
        </div>
        <div id="follow-up" className="min-w-0 scroll-mt-28 space-y-4 lg:sticky lg:top-18">
          <FollowUpPanel data={data} storeId={storeId} onSaved={reload} />
        </div>
      </div>
    </div>
  );
}

function UsakCard({ data }: { data: MerchantDetail }) {
  return (
    <Card title="Status USAK & prioritas">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-ink-2">{data.usak.source_column}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink">
            <span className="font-semibold">{data.usak.nilai || "(kosong)"}</span>
            <UsakBadge usak={data.usak} configured={data.usak_configured} />
          </p>
          <p className="mt-2 text-xs text-muted">
            Ditentukan dari kolom {data.usak.source_column}; catatan follow-up tidak mengubah status ini.
          </p>
          {data.usak.perlu_dicek && (
            <p className="mt-2 text-xs font-medium text-warn-ink">Nilai perlu diperiksa administrator.</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-ink-2">Alasan prioritas (skor {fmtNumber(data.priority.score)})</p>
          {data.priority.reasons.length ? (
            <ul className="mt-1 space-y-1 text-sm text-ink">
              {data.priority.reasons.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>{r.label}</span>
                  <span className="text-xs text-ink-2 tabular">+{fmtNumber(r.bobot)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink-2">Tidak ada aturan prioritas yang terpenuhi.</p>
          )}
          <div className="mt-3">
            <p className="text-xs font-medium text-ink-2">Follow-up terakhir</p>
            <div className="mt-1"><FollowUpCell fu={data.follow_up} today={data.today} /></div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function formatField(col: MerchantColumn, v: string | number | null | undefined) {
  if (col === "createddate") return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v) : displayValue(v);
  if (MONEY_COLUMNS.has(col)) return fmtRupiah(v as number | null);
  if (typeof v === "number") return fmtNumber(v, 2);
  return displayValue(v);
}

function FieldList({ columns, data, storeId }: { columns: MerchantColumn[]; data: MerchantDetail; storeId: string }) {
  const present = columns.filter((c) => c in data.merchant);
  const masked = present.filter((c) => data.masked_fields.includes(c));
  return (
    <>
      <dl className="-my-1 divide-y divide-line text-[13px]">
        {present.filter((c) => !masked.includes(c)).map((col) => (
          <div key={col} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-1.5">
            <dt className="text-ink-2" title={`Kolom ${col}`}>{COLUMN_LABELS[col]}</dt>
            <dd className="break-words text-ink">{formatField(col, data.merchant[col])}</dd>
          </div>
        ))}
      </dl>
      {masked.length > 0 && <SensitiveFields columns={masked} data={data} storeId={storeId} />}
    </>
  );
}

/** Nomor rekening & CIF: disamarkan; nilai asli hanya untuk role berhak (tercatat di AuditLog). */
function SensitiveFields({ columns, data, storeId }: { columns: MerchantColumn[]; data: MerchantDetail; storeId: string }) {
  const [revealed, setRevealed] = useState<Record<string, string | number | null> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function reveal() {
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch<RevealResult>(`/api/merchants/${encodeURIComponent(storeId)}/reveal`, { method: "POST", json: { group: "identity" } });
      setRevealed(res.values);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gagal membuka data.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2.5">
      <dl className="space-y-1.5 text-[13px]">
        {columns.map((col) => (
          <div key={col} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
            <dt className="flex items-center gap-1 text-ink-2"><Lock aria-hidden className="size-3" /> {COLUMN_LABELS[col]}</dt>
            <dd className="break-all font-mono text-ink">{revealed ? displayValue(revealed[col]) : displayValue(data.merchant[col])}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {data.can_reveal_identity ? (
          revealed ? (
            <Button variant="ghost" size="sm" onClick={() => setRevealed(null)}><EyeOff aria-hidden className="size-3.5" /> Samarkan lagi</Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={reveal} loading={busy}>{!busy && <Eye aria-hidden className="size-3.5" />} Tampilkan</Button>
          )
        ) : (
          <span className="text-xs text-ink-2">Data sensitif disamarkan untuk role Anda.</span>
        )}
        {data.can_reveal_identity && <span className="text-xs text-ink-2">Setiap akses tercatat di log audit.</span>}
      </div>
      {err && <p className="mt-2 text-xs text-critical-ink">{err}</p>}
    </div>
  );
}

function PerformanceCard({ m }: { m: MerchantDetail["merchant"] }) {
  const rows: { label: string; money: boolean; cols: (MerchantColumn | null)[] }[] = [
    { label: "Transaksi", money: false, cols: ["freq_mtd", "freq_ytd", "freq_30_days"] },
    { label: "Nilai transaksi (SV)", money: true, cols: ["sv_mtd", "sv_ytd", "sv_30_days"] },
    { label: "FBI", money: true, cols: ["fbi_mtd", "fbi_ytd", null] },
  ];
  return (
    <Card title="Performa transaksi" subtitle="Snapshot data saat ini" flush>
      <div className="overflow-x-auto">
        <table className={cx(tableCls.table, "min-w-[28rem]")}>
          <thead>
            <tr className={tableCls.headRow}>
              <th scope="col" className={tableCls.th}>Metrik</th>
              <th scope="col" className={cx(tableCls.th, "text-right")}>MTD</th>
              <th scope="col" className={cx(tableCls.th, "text-right")}>YTD</th>
              <th scope="col" className={cx(tableCls.th, "text-right")}>30 hari</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-line last:border-0">
                <th scope="row" className={cx(tableCls.td, "text-left font-medium text-ink")}>{r.label}</th>
                {r.cols.map((c, i) => (
                  <td key={c ?? i} className={cx(tableCls.td, "text-right text-ink")}>
                    {c ? (r.money ? fmtRupiah(m[c] as number | null) : fmtNumber(m[c] as number | null)) : <span className="text-xs text-muted">Tidak tersedia</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FinancialCard({ data }: { data: MerchantDetail }) {
  return (
    <Card title="Saldo & nominal lain" subtitle="Data keuangan nasabah">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {FINANCIAL_COLUMNS.map((col) => (
          <div key={col}>
            <dt className="font-mono text-xs text-ink-2">{col}</dt>
            <dd className="mt-0.5 text-ink">{fmtRupiah(data.financial[col] as number | null)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Follow-up                                                           */
/* ------------------------------------------------------------------ */

type FormValues = { status_follow_up: string; progres_usak: string; tanggal_follow_up_berikutnya: string; catatan: string };

const MAX_NOTE = 2000;

function addDays(ymd: string, days: number) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function FollowUpForm({ mode, storeId, followUp, options, today, onSaved, onCancel }: {
  mode: "create" | "edit";
  storeId: string;
  followUp?: FollowUp;
  options: MerchantDetail["options"];
  today: string;
  onSaved: (message: string) => void;
  onCancel?: () => void;
}) {
  const initial: FormValues = {
    status_follow_up: followUp?.status_follow_up ?? "",
    progres_usak: followUp?.progres_usak ?? "",
    tanggal_follow_up_berikutnya: followUp?.tanggal_follow_up_berikutnya ?? "",
    catatan: followUp?.catatan ?? "",
  };
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues | "form", string>>>({});
  const [saving, setSaving] = useState(false);
  const idp = `${mode}-${followUp?.follow_up_id ?? "new"}`;

  const set = (k: keyof FormValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  function validate(): typeof errors {
    const e: typeof errors = {};
    if (!values.status_follow_up) e.status_follow_up = "Pilih status follow-up.";
    const d = values.tanggal_follow_up_berikutnya;
    if (d && d !== initial.tanggal_follow_up_berikutnya) {
      if (d < today) e.tanggal_follow_up_berikutnya = "Tanggal tidak boleh sebelum hari ini.";
      else if (d > addDays(today, 730)) e.tanggal_follow_up_berikutnya = "Maksimal 2 tahun dari hari ini.";
    }
    if (values.catatan.length > MAX_NOTE) e.catatan = `Maksimal ${MAX_NOTE} karakter.`;
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    const payload: Partial<FormValues> = {};
    for (const k of Object.keys(values) as (keyof FormValues)[]) {
      if (mode === "create" || values[k] !== initial[k]) payload[k] = values[k];
    }
    if (mode === "edit" && Object.keys(payload).length === 0) {
      setErrors({ form: "Tidak ada perubahan." });
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        await apiFetch(`/api/merchants/${encodeURIComponent(storeId)}/follow-ups`, { method: "POST", json: payload });
        setValues({ status_follow_up: "", progres_usak: "", tanggal_follow_up_berikutnya: "", catatan: "" });
        onSaved("Follow-up berhasil dicatat.");
      } else {
        await apiFetch(`/api/follow-ups/${encodeURIComponent(followUp!.follow_up_id)}`, { method: "PATCH", json: payload });
        onSaved("Perubahan follow-up tersimpan.");
      }
      setErrors({});
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      setErrors({ ...(apiErr?.fields ?? {}), form: apiErr?.fields ? "Periksa kembali isian." : apiErr?.message ?? "Gagal menyimpan. Coba lagi." });
    } finally {
      setSaving(false);
    }
  }

  const statusOptions = withCurrent(options.status_follow_up, initial.status_follow_up, followUp?.status_label);
  const progresOptions = withCurrent(options.progres_usak, initial.progres_usak, followUp?.progres_label);
  const field = fieldCls;
  const err = (k: keyof FormValues) => errors[k] && <p id={`${idp}-${k}-err`} className="mt-1 text-xs text-critical-ink">{errors[k]}</p>;

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {errors.form && <Alert tone="error">{errors.form}</Alert>}
      <div>
        <label htmlFor={`${idp}-status`} className={labelCls}>Status follow-up <span className="text-critical-ink">*</span></label>
        <select id={`${idp}-status`} value={values.status_follow_up} onChange={set("status_follow_up")} aria-invalid={!!errors.status_follow_up}
          aria-describedby={errors.status_follow_up ? `${idp}-status_follow_up-err` : undefined}
          className={cx(field, errors.status_follow_up ? "border-critical" : "border-line-strong")}>
          <option value="">Pilih status…</option>
          {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}{o.final ? " (selesai)" : ""}</option>)}
        </select>
        {err("status_follow_up")}
      </div>
      <div>
        <label htmlFor={`${idp}-progres`} className={labelCls}>Progres USAK</label>
        <select id={`${idp}-progres`} value={values.progres_usak} onChange={set("progres_usak")}
          className={cx(field, errors.progres_usak ? "border-critical" : "border-line-strong")}>
          <option value="">Tidak diisi</option>
          {progresOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {err("progres_usak")}
      </div>
      <div>
        <label htmlFor={`${idp}-date`} className={labelCls}>Tanggal follow-up berikutnya</label>
        <input id={`${idp}-date`} type="date" value={values.tanggal_follow_up_berikutnya} onChange={set("tanggal_follow_up_berikutnya")}
          min={today} max={addDays(today, 730)} aria-invalid={!!errors.tanggal_follow_up_berikutnya}
          className={cx(field, errors.tanggal_follow_up_berikutnya ? "border-critical" : "border-line-strong")} />
        {err("tanggal_follow_up_berikutnya")}
      </div>
      <div>
        <label htmlFor={`${idp}-note`} className={labelCls}>Catatan</label>
        <textarea id={`${idp}-note`} value={values.catatan} onChange={set("catatan")} rows={4} maxLength={MAX_NOTE}
          placeholder="Hasil kunjungan/kontak, kendala, rencana tindak lanjut…"
          className={cx("w-full rounded-md border bg-surface px-2.5 py-2 text-sm text-ink placeholder:text-muted", errors.catatan ? "border-critical" : "border-line-strong")} />
        <div className="flex justify-between">
          {err("catatan") || <span />}
          <span className="text-xs text-muted tabular">{values.catatan.length}/{MAX_NOTE}</span>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Batal</Button>}
        <Button type="submit" size="sm" loading={saving}>{mode === "create" ? "Simpan follow-up" : "Simpan perubahan"}</Button>
      </div>
    </form>
  );
}

/** Pastikan nilai lama tetap tampil walau opsinya sudah dinonaktifkan. */
function withCurrent(list: Option[], current: string, label?: string): Option[] {
  if (!current || list.some((o) => o.value === current)) return list;
  return [...list, { value: current, label: label || current }];
}

function FollowUpPanel({ data, storeId, onSaved }: { data: MerchantDetail; storeId: string; onSaved: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const saved = (msg: string) => {
    // Follow-up mengubah status/prioritas: buang cache daftar & dasbor agar tampil mutakhir.
    invalidateApi("/api/merchants");
    invalidateApi("/api/dashboard");
    setMessage(msg);
    setEditing(null);
    onSaved();
  };

  return (
    <>
      <Card title="Catat follow-up" subtitle="Tindak lanjut & progres menuju USAK">
        {message && <div className="mb-3"><Alert tone="success">{message}</Alert></div>}
        {data.can_write_follow_up ? (
          <FollowUpForm mode="create" storeId={storeId} options={data.options} today={data.today} onSaved={saved} />
        ) : (
          <p className="text-[13px] text-ink-2">Role Anda hanya dapat melihat follow-up.</p>
        )}
      </Card>
      <Card title="Riwayat follow-up" subtitle={`${fmtNumber(data.follow_ups.length)} catatan dari cabang Anda`}>
        {data.follow_ups.length === 0 ? (
          <p className="text-sm text-ink-2">Belum ada catatan follow-up untuk merchant ini.</p>
        ) : (
          <ol className="-my-1 divide-y divide-line">
            {data.follow_ups.map((f) => (
              <li key={f.follow_up_id} className="py-2.5">
                {editing === f.follow_up_id ? (
                  <FollowUpForm mode="edit" storeId={storeId} followUp={f} options={data.options} today={data.today} onSaved={saved} onCancel={() => setEditing(null)} />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-ink">{f.status_label}</span>
                        {f.progres_usak && <Badge tone="accent" dot={false}>{f.progres_label}</Badge>}
                      </div>
                      {f.can_edit && (
                        <Button variant="ghost" size="sm" onClick={() => { setMessage(null); setEditing(f.follow_up_id); }}>
                          <Pencil aria-hidden className="size-3.5" /> Ubah
                        </Button>
                      )}
                    </div>
                    {f.catatan && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{f.catatan}</p>}
                    {f.tanggal_follow_up_berikutnya && (
                      <p className="mt-1 text-xs text-ink-2">
                        Tindak lanjut berikutnya: {fmtDate(f.tanggal_follow_up_berikutnya)} ({relativeDays(f.tanggal_follow_up_berikutnya, data.today)})
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      {f.created_by} · {fmtDateTime(f.created_at)}
                      {f.updated_at && f.updated_at !== f.created_at && <> · diubah {fmtDateTime(f.updated_at)}</>}
                    </p>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
