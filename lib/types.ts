/**
 * Tipe data respons API. Nama properti merchant memakai nama header sumber apa adanya
 * (lihat lib/columns.ts); properti turunan dikelompokkan di objek `usak`, `follow_up`,
 * dan `priority` agar tidak tercampur dengan kolom sumber.
 */

export type Permissions = {
  view_sensitive: boolean;
  view_financial: boolean;
  search_account_number: boolean;
  write_follow_up: boolean;
  edit_all_follow_ups: boolean;
};

export type SessionUser = {
  user_id: string;
  kode_cabang: string;
  nama_cabang: string;
  role: string;
  /** Jenis tampilan: cabang (bawaan), atau area/region untuk pemantauan banyak cabang. */
  akses: "cabang" | "area" | "region";
  permissions: Permissions;
  expires_at: string;
};

export type UsakKategori = "USAK" | "BELUM_USAK" | "KOSONG" | "TIDAK_DIKENALI";

export type UsakInfo = {
  kategori: UsakKategori;
  label: string;
  perlu_dicek: boolean;
  /** Nilai kolom sumber USAK (grading_trx atau grading_usak) untuk merchant ini. */
  nilai: string;
  /** Nama kolom sumber USAK sesuai Settings USAK_SOURCE_COLUMN. */
  source_column: string;
};

export type FollowUpSummary = {
  ada: boolean;
  status: string;
  status_label: string;
  final: boolean;
  terakhir: string;
  berikutnya: string;
  jatuh_tempo: boolean;
  hari_sejak: number | null;
  progres_usak: string;
  progres_label: string;
};

export type PriorityInfo = {
  score: number;
  reasons: { id: string; label: string; bobot: number }[];
  perlu_follow_up: boolean;
};

export type Warning = { code: string; message: string };

export type CountItem = { value: string; label: string; count: number; kategori?: UsakKategori };

export type MetricSummary = { sum: number; count: number; avg: number | null };

export type MetricKey =
  | "freq_mtd"
  | "sv_mtd"
  | "fbi_mtd"
  | "freq_ytd"
  | "sv_ytd"
  | "fbi_ytd"
  | "freq_30_days"
  | "sv_30_days"
  | "cbalrp"
  | "avgbalrp"
  | "ybal"
  | "amtcrc"
  | "amtdrc";

export type DashboardSummary = {
  cabang: { kode_cabang: string; nama_cabang: string };
  usak: {
    configured: boolean;
    total_merchant: number;
    merchant_usak: number;
    merchant_belum_usak: number;
    merchant_kosong: number;
    merchant_tidak_dikenali: number;
    perlu_dicek: number;
    source_column: string;
    rasio_usak: number;
    target_ratio_persen: number;
    target_usak_50: number;
    gap_usak_50: number;
    tercapai: boolean;
  };
  distribusi: {
    status_trx: CountItem[];
    grading_trx: CountItem[];
    Tiering: CountItem[];
    /** Distribusi nilai kolom sumber USAK, lengkap dengan kategori hasil UsakConfig. */
    usak_source: CountItem[];
  };
  grading_trx_x_tiering: { rows: CountItem[]; cols: CountItem[]; cells: number[][] };
  follow_up: {
    perlu_follow_up: number;
    jatuh_tempo: number;
    belum_pernah_belum_usak: number;
    sudah_ada: number;
    dicatat_bulan_ini: number;
    by_status: CountItem[];
  };
  metrics: Record<MetricKey, MetricSummary>;
  prioritas_teratas: {
    store_id: string;
    mid_static: string;
    store_name: string;
    usak: UsakInfo;
    priority: PriorityInfo;
    follow_up: FollowUpSummary;
  }[];
  warnings: Warning[];
  data: { snapshot_date: string; last_import_at: string; loaded_at: string; today: string };
};

export type MerchantListItem = {
  store_id: string;
  /** ID merchant yang ditampilkan ke petugas. store_id tetap kunci unik internal. */
  mid_static: string;
  store_name: string;
  owner_name: string;
  status_trx: string;
  grading_trx: string;
  /** Hanya ada bila grading_usak adalah kolom sumber USAK. */
  grading_usak?: string;
  Tiering: string;
  freq_mtd: number | null;
  sv_mtd: number | null;
  fbi_mtd: number | null;
  freq_30_days: number | null;
  sv_30_days: number | null;
  kode_cabang_final: string;
  nama_cabang_final: string;
  nama_area_final: string;
  status_rekening: string;
  flag_card_dongle: string;
  usak: UsakInfo;
  follow_up: FollowUpSummary;
  priority: PriorityInfo;
};

export type MerchantList = {
  items: MerchantListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  total_branch: number;
  sort: string;
  dir: "asc" | "desc";
  search_fields: string[];
  usak_configured: boolean;
  usak_source: string;
  today: string;
};

export type Option = { value: string; label: string; count?: number; kategori?: UsakKategori; final?: boolean };

export type FilterOptions = {
  columns: Record<string, Option[]>;
  kategori_usak: Option[];
  follow_up: Option[];
  status_follow_up: Option[];
  sort_fields: string[];
  usak_configured: boolean;
  usak_source: string;
};

export type FollowUp = {
  follow_up_id: string;
  store_id: string;
  status_follow_up: string;
  status_label: string;
  catatan: string;
  tanggal_follow_up_berikutnya: string;
  progres_usak: string;
  progres_label: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
};

export type MerchantDetail = {
  merchant: Record<string, string | number | null>;
  masked_fields: string[];
  financial: Record<string, string | number | null>;
  can_reveal_identity: boolean;
  usak: UsakInfo;
  usak_configured: boolean;
  follow_up: FollowUpSummary;
  priority: PriorityInfo;
  follow_ups: FollowUp[];
  can_write_follow_up: boolean;
  options: { status_follow_up: Option[]; progres_usak: Option[] };
  today: string;
};

export type RevealResult = {
  store_id: string;
  group: "identity" | "financial";
  values: Record<string, string | number | null>;
};

export type RegionBranch = {
  kode_cabang: string;
  nama_cabang: string;
  nama_area: string;
  total_merchant: number;
  merchant_usak: number;
  perlu_dicek: number;
  rasio_usak: number;
  target_usak_50: number;
  gap_usak_50: number;
  tercapai: boolean;
};

export type RegionSummary = {
  cakupan: { jenis: "area" | "region"; nama: string; areas: string[] };
  usak: DashboardSummary["usak"];
  cabang_total: number;
  cabang_tercapai: number;
  cabang_belum: number;
  cabang: RegionBranch[];
  metrics: Record<MetricKey, MetricSummary> | null;
  /** Kosong bila Apps Script belum memakai versi terbaru. */
  distribusi?: { usak_source: CountItem[] };
  grading_trx_x_tiering?: { rows: CountItem[]; cols: CountItem[]; cells: number[][] };
  area: { nama_area: string; kode_area?: string; cabang: number; total_merchant: number; merchant_usak: number; rasio_usak: number; gap_usak_50: number; tercapai: boolean }[];
  warnings: Warning[];
  data: { diperbarui: string; snapshot_date: string };
};

export type RegionSearchItem = {
  kode_cabang: string;
  nama_cabang: string;
  nama_area: string;
  store_id: string;
  mid_static: string;
  store_name: string;
  owner_name: string;
  status_trx: string;
  grading_trx: string;
  Tiering: string;
  usak: UsakInfo;
};

export type RegionSearch = {
  q: string;
  items: RegionSearchItem[];
  truncated: boolean;
  cabang_dicari: number;
  bidang: string[];
};
