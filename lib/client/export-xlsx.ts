import type { MerchantListItem } from "@/lib/types";

const KATEGORI_LABEL: Record<string, string> = {
  USAK: "USAK",
  BELUM_USAK: "Belum USAK",
  KOSONG: "Kosong (perlu dicek)",
  TIDAK_DIKENALI: "Tidak dikenali (perlu dicek)",
};

type Cell = string | number | null | { value: string; fontWeight: "bold"; backgroundColor: string; align?: "left" | "right" };

const head = (value: string, align?: "left" | "right"): Cell => ({ value, fontWeight: "bold", backgroundColor: "#E8ECF1", align });
const text = (v: string | null | undefined): string | null => (v ? v : null);
const num = (v: number | null | undefined): number | null => (typeof v === "number" ? v : null);

/**
 * Unduh daftar merchant terpilih sebagai berkas Excel (.xlsx). Hanya berisi kolom yang sudah tampil di daftar
 * (tanpa nomor rekening/CIF/saldo). Pustaka dimuat saat dipakai agar tidak membebani halaman lain.
 */
export async function downloadMerchantsXlsx(items: MerchantListItem[], opts: { today: string; sourceColumn: string; branch?: string }) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header: Cell[] = [
    head("MID"), head("Nama merchant"), head("Pemilik"), head("Kode cabang"), head("Cabang"), head("Area"),
    head("Status transaksi"), head(`Grading (${opts.sourceColumn})`), head("Kategori USAK"), head("Tiering"),
    head("Transaksi MTD", "right"), head("SV MTD", "right"), head("FBI MTD", "right"), head("Transaksi 30 hari", "right"), head("SV 30 hari", "right"),
    head("Skor prioritas", "right"), head("Status follow-up terakhir"), head("Tanggal follow-up berikutnya"),
  ];
  const rows: Cell[][] = items.map((m) => [
    text(m.mid_static || m.store_id), text(m.store_name), text(m.owner_name), text(m.kode_cabang_final), text(m.nama_cabang_final), text(m.nama_area_final),
    text(m.status_trx), text(m.usak.nilai), KATEGORI_LABEL[m.usak.kategori] ?? m.usak.kategori, text(m.Tiering),
    num(m.freq_mtd), num(m.sv_mtd), num(m.fbi_mtd), num(m.freq_30_days), num(m.sv_30_days),
    m.priority.perlu_follow_up ? m.priority.score : null, m.follow_up.ada ? text(m.follow_up.status_label) : "Belum ada", text(m.follow_up.berikutnya),
  ]);
  const widths = [16, 30, 22, 12, 24, 24, 14, 18, 18, 22, 14, 18, 18, 18, 18, 14, 26, 24];
  const kode = opts.branch ?? items[0]?.kode_cabang_final ?? "cabang";
  await writeXlsxFile([header, ...rows] as never, {
    sheet: "Merchant",
    columns: widths.map((width) => ({ width })),
    stickyRowsCount: 1,
  } as never).toFile(`merchant-${kode}-${opts.today.replaceAll("-", "")}.xlsx`);
}
