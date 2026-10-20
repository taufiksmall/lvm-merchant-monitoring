/** Format angka & tanggal untuk tampilan (locale id-ID, zona waktu Asia/Jakarta). */

const TZ = "Asia/Jakarta";
const EMPTY = "—";

type Num = number | string | null | undefined;

function toNum(v: Num): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function fmtNumber(v: Num, maxDigits = 0): string {
  const n = toNum(v);
  return n === null ? EMPTY : new Intl.NumberFormat("id-ID", { maximumFractionDigits: maxDigits }).format(n);
}

export function fmtCompact(v: Num): string {
  const n = toNum(v);
  if (n === null) return EMPTY;
  if (Math.abs(n) < 10000) return fmtNumber(n);
  return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function fmtRupiah(v: Num, compact = false): string {
  const n = toNum(v);
  if (n === null) return EMPTY;
  return "Rp" + (compact ? fmtCompact(n) : fmtNumber(n));
}

/**
 * Persentase 1 desimal. Bila target belum tercapai, angka tidak dibulatkan ke atas
 * sampai terlihat mencapai target (mis. 49,96% ditampilkan 49,9%, bukan 50,0%).
 */
export function fmtPercent(v: Num, opts: { ceiling?: number } = {}): string {
  const n = toNum(v);
  if (n === null) return EMPTY;
  let shown = Math.round(n * 10) / 10;
  if (opts.ceiling !== undefined && n < opts.ceiling && shown >= opts.ceiling) shown = Math.floor(n * 10) / 10;
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(shown) + "%";
}

/** Tanggal 'yyyy-MM-dd' -> '20 Okt 2026'. */
export function fmtDate(ymd: string | null | undefined): string {
  if (!ymd) return EMPTY;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

/** ISO timestamp -> '20 Okt 2026 09.15 WIB'. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(d) + " WIB";
}

/** Tanggal hari ini di Asia/Jakarta (yyyy-MM-dd). */
export function todayJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function relativeDays(ymd: string, today: string): string {
  const a = Date.parse(ymd + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return "";
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return "hari ini";
  if (diff === 1) return "besok";
  if (diff === -1) return "kemarin";
  return diff > 0 ? `${diff} hari lagi` : `terlambat ${-diff} hari`;
}

export function displayValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return EMPTY;
  return String(v);
}
