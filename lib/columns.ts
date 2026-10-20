/**
 * Pemetaan eksplisit nama header sumber (sheet Merchants) -> label tampilan.
 * Nama header TIDAK diubah; label hanya untuk antarmuka.
 */

export const MERCHANT_COLUMNS = [
  "store_id", "store_name", "account_number", "owner_name", "createddate", "referal_code",
  "kode_pos", "address", "kecamatan", "kabupaten", "provinsi", "mcc_code", "lob_lm",
  "kode_cabang_final", "nama_cabang_final", "nama_area_final",
  "freq_mtd", "sv_mtd", "fbi_mtd", "freq_ytd", "sv_ytd", "fbi_ytd", "freq_30_days", "sv_30_days",
  "mid_static", "mid_dynamic", "flag_card_dongle", "status_trx", "grading_trx", "grading_usak",
  "tipe_akun", "status_rekening", "tangging_real_merchant", "companytype", "jenis_rekening",
  "cifno", "cbalrp", "ybal", "avgbalrp", "amtcrc", "amtdrc", "Tiering",
] as const;

export type MerchantColumn = (typeof MERCHANT_COLUMNS)[number];

export const COLUMN_LABELS: Record<MerchantColumn, string> = {
  store_id: "Store ID",
  store_name: "Nama merchant",
  account_number: "Nomor rekening",
  owner_name: "Nama pemilik",
  createddate: "Tanggal dibuat",
  referal_code: "Kode referal",
  kode_pos: "Kode pos",
  address: "Alamat",
  kecamatan: "Kecamatan",
  kabupaten: "Kabupaten/kota",
  provinsi: "Provinsi",
  mcc_code: "Kode MCC",
  lob_lm: "LOB",
  kode_cabang_final: "Kode cabang",
  nama_cabang_final: "Nama cabang",
  nama_area_final: "Area",
  freq_mtd: "Frekuensi MTD",
  sv_mtd: "SV MTD",
  fbi_mtd: "FBI MTD",
  freq_ytd: "Frekuensi YTD",
  sv_ytd: "SV YTD",
  fbi_ytd: "FBI YTD",
  freq_30_days: "Frekuensi 30 hari",
  sv_30_days: "SV 30 hari",
  mid_static: "MID",
  mid_dynamic: "MID dinamis",
  flag_card_dongle: "Card dongle",
  status_trx: "Status transaksi",
  grading_trx: "Grading transaksi",
  grading_usak: "Grading USAK",
  tipe_akun: "Tipe akun",
  status_rekening: "Status rekening",
  tangging_real_merchant: "Tagging real merchant",
  companytype: "Tipe perusahaan",
  jenis_rekening: "Jenis rekening",
  cifno: "Nomor CIF",
  // Definisi bisnis kolom saldo/nominal belum ditetapkan: tampilkan nama kolom sumber.
  cbalrp: "cbalrp",
  ybal: "ybal",
  avgbalrp: "avgbalrp",
  amtcrc: "amtcrc",
  amtdrc: "amtdrc",
  Tiering: "Tiering",
};

/** Kolom nilai uang (ditampilkan dengan format Rupiah). */
export const MONEY_COLUMNS = new Set<string>([
  "sv_mtd", "fbi_mtd", "sv_ytd", "fbi_ytd", "sv_30_days", "cbalrp", "ybal", "avgbalrp", "amtcrc", "amtdrc",
]);

/** Kelompok kolom halaman detail. */
export const DETAIL_SECTIONS: { title: string; columns: MerchantColumn[] }[] = [
  { title: "Identitas", columns: ["store_id", "store_name", "owner_name", "account_number", "cifno"] },
  { title: "Lokasi", columns: ["address", "kode_pos", "kecamatan", "kabupaten", "provinsi"] },
  { title: "Cabang & area", columns: ["kode_cabang_final", "nama_cabang_final", "nama_area_final"] },
  {
    title: "Informasi merchant",
    columns: ["mcc_code", "lob_lm", "referal_code", "companytype", "tipe_akun", "jenis_rekening", "tangging_real_merchant", "mid_static", "mid_dynamic", "createddate"],
  },
  { title: "Status", columns: ["status_trx", "grading_trx", "grading_usak", "status_rekening", "flag_card_dongle", "Tiering"] },
];

export const FINANCIAL_COLUMNS: MerchantColumn[] = ["cbalrp", "ybal", "avgbalrp", "amtcrc", "amtdrc"];

/** Filter nilai kolom pada daftar merchant (urutan tampil). */
export const FILTER_COLUMNS = [
  "status_trx", "grading_trx", "grading_usak", "Tiering", "status_rekening", "flag_card_dongle", "nama_area_final",
] as const;

export const SORT_OPTIONS: { value: string; label: string; defaultDir: "asc" | "desc" }[] = [
  { value: "priority", label: "Prioritas follow-up", defaultDir: "desc" },
  { value: "sv_mtd", label: "SV MTD", defaultDir: "desc" },
  { value: "freq_mtd", label: "Frekuensi MTD", defaultDir: "desc" },
  { value: "fbi_mtd", label: "FBI MTD", defaultDir: "desc" },
  { value: "freq_30_days", label: "Frekuensi 30 hari", defaultDir: "desc" },
  { value: "sv_30_days", label: "SV 30 hari", defaultDir: "desc" },
  { value: "freq_ytd", label: "Frekuensi YTD", defaultDir: "desc" },
  { value: "sv_ytd", label: "SV YTD", defaultDir: "desc" },
  { value: "fbi_ytd", label: "FBI YTD", defaultDir: "desc" },
  { value: "next_follow_up", label: "Tanggal tindak lanjut", defaultDir: "asc" },
  { value: "last_follow_up", label: "Follow-up terakhir", defaultDir: "desc" },
  { value: "store_name", label: "Nama merchant", defaultDir: "asc" },
];

export const BLANK_FILTER_VALUE = "__KOSONG__";
