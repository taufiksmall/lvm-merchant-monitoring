# Impor & validasi data merchant

Data merchant dimuat ke sheet `Merchants` dengan header persis seperti sumber (42 kolom). Nama kolom sumber dipertahankan; header yang hanya berbeda huruf besar/kecil/spasi dipetakan ke nama resmi dan dilaporkan.

## Aturan validasi

| Pemeriksaan | Tingkat | Akibat |
|---|---|---|
| Kolom wajib tidak ada (`store_id`, `store_name`, `kode_cabang_final`, `nama_cabang_final`, `grading_usak`) atau header ganda | Fatal | Impor dibatalkan |
| `store_id`, `store_name`, `kode_cabang_final`, `nama_cabang_final` kosong | ERROR | Baris dilewati |
| `store_id` ganda atau berisi karakter tidak diizinkan | ERROR | Baris dilewati |
| Angka tidak valid (mis. `12,3,4`) di kolom freq/sv/fbi/saldo | PERINGATAN | Baris diimpor, nilai asli dipertahankan dan tampil "—" |
| `createddate` tidak dikenali (mis. `31/02/2024`) | PERINGATAN | Baris diimpor, nilai asli dipertahankan |
| `grading_usak` kosong | PERINGATAN | Ditandai "perlu dicek", tidak dihitung USAK |
| `grading_usak` tidak ada di UsakConfig | PERINGATAN | Ditandai "perlu dicek", tidak dihitung USAK |
| Kolom opsional tidak ada / kolom tambahan tidak dikenal | Info | Kolom opsional kosong; kolom tambahan tidak diimpor |

Format tanggal yang diterima: `yyyy-mm-dd`, `yyyy/mm/dd`, `dd/mm/yyyy`, `dd-mm-yyyy` (hari lebih dulu), dan tanggal Google Sheets. Tanggal valid ditulis sebagai `yyyy-mm-dd`.

## Langkah 1 (opsional) — validasi di komputer

```bash
npm run validate:csv -- data/merchants.csv --usak-config=data/usak_config.csv --report=laporan.csv --out=bersih.csv
```

Validasi lokal memakai fungsi yang sama dengan Apps Script (`validateMerchantTable_`). File tidak dikirim ke mana pun. Kode keluar `0` = tanpa error, `3` = ada baris error, `2` = header fatal. CSV boleh dipisah koma atau titik koma.

## Langkah 2 — unggah ke sheet `Import_Merchants`

1. Di spreadsheet, buat sheet bernama **`Import_Merchants`** (sekali saja).
2. Buka sheet itu → **File › Impor › Upload** → pilih CSV.
3. Lokasi impor: **Ganti sheet saat ini**. **Hapus centang "Konversi teks menjadi angka, tanggal, dan formula"** agar kode seperti `0101` tidak menjadi `101`.

## Langkah 3 — validasi & terapkan

1. **LVM Admin › Validasi impor (Import_Merchants)** → ringkasan muncul, detail di sheet `ImportReport`.
2. Perbaiki data bila perlu, ulangi langkah 2.
3. **LVM Admin › Terapkan impor ke Merchants** → konfirmasi. Seluruh isi Merchants diganti dengan baris valid; kolom kode diformat teks, angka ditulis sebagai angka, cache aplikasi langsung diperbarui, dan waktu impor tampil di dashboard.

Isi `DATA_SNAPSHOT_DATE` di sheet Settings bila ingin dashboard menampilkan tanggal posisi data (mis. `2026-10-19`).

## Mengganti data contoh dengan data sebenarnya

1. Kosongkan sheet `Users` dari akun demo (jangan pernah memakai kata sandi demo di produksi).
2. Impor data merchant asli dengan langkah di atas.
3. Isi `UsakConfig` dengan nilai resmi (**LVM Admin › Isi daftar nilai grading_usak** lalu lengkapi kategori).
4. Tambahkan akun cabang dan buat hash kata sandinya.
5. **LVM Admin › 2. Periksa konfigurasi & header**.

## Memperbarui data berkala

Ulangi langkah 2–3 dengan snapshot terbaru. Follow-up tidak terhapus karena tersimpan di sheet `FollowUps` dan terhubung lewat `store_id`. Jika `kode_cabang_final` sebuah merchant berpindah, catatan follow-up cabang lama tidak terlihat oleh cabang baru (setiap cabang hanya melihat catatannya sendiri).
