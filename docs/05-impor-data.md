# Impor & validasi data merchant

Data merchant dimuat ke sheet `Merchants` dengan header persis seperti sumber (hingga 42 kolom; `grading_usak` opsional). Nama kolom sumber dipertahankan; header yang hanya berbeda huruf besar/kecil/spasi dipetakan ke nama resmi dan dilaporkan.

## Aturan validasi

| Pemeriksaan | Tingkat | Akibat |
|---|---|---|
| Kolom wajib tidak ada (`store_id`, `store_name`, `kode_cabang_final`, `nama_cabang_final`, dan kolom acuan USAK: bawaan `grading_trx`) atau header ganda | Fatal | Impor dibatalkan |
| `store_id`, `store_name`, `kode_cabang_final`, `nama_cabang_final` kosong | ERROR | Baris dilewati |
| `store_id` ganda atau berisi karakter tidak diizinkan | ERROR | Baris dilewati |
| Angka tidak valid (mis. `12,3,4`) di kolom freq/sv/fbi/saldo | PERINGATAN | Baris diimpor, nilai asli dipertahankan dan tampil "—" |
| `createddate` tidak dikenali (mis. `31/02/2024`) | PERINGATAN | Baris diimpor, nilai asli dipertahankan |
| Kolom acuan USAK kosong | PERINGATAN | Ditandai "perlu dicek", tidak dihitung USAK |
| Nilai kolom acuan USAK tidak ada di UsakConfig | PERINGATAN | Ditandai "perlu dicek", tidak dihitung USAK |
| Kolom opsional tidak ada / kolom tambahan tidak dikenal | Info | Kolom opsional kosong; kolom tambahan tidak diimpor |

Format tanggal yang diterima: `yyyy-mm-dd`, `yyyy/mm/dd`, `dd/mm/yyyy`, `dd-mm-yyyy` (hari lebih dulu), dan tanggal Google Sheets. Tanggal valid ditulis sebagai `yyyy-mm-dd`.

## Langkah 1 (opsional) — validasi di komputer

```bash
npm run validate:csv -- data/merchants.csv --usak-config=data/usak_config.csv --report=laporan.csv --out=bersih.csv
```

Validasi lokal memakai fungsi yang sama dengan Apps Script (`validateMerchantTable_`). File tidak dikirim ke mana pun. Kode keluar `0` = tanpa error, `3` = ada baris error, `2` = header fatal. CSV boleh dipisah koma atau titik koma.

## Langkah 2 — unggah ke sheet `Import_Merchants` (data sampai ±50 ribu baris)

1. Di spreadsheet, buat sheet bernama **`Import_Merchants`** (sekali saja).
2. Buka sheet itu → **File › Impor › Upload** → pilih CSV.
3. Lokasi impor: **Ganti sheet saat ini**. **Hapus centang "Konversi teks menjadi angka, tanggal, dan formula"** agar kode seperti `0101` tidak menjadi `101`.

## Langkah 3 — validasi & terapkan

1. **LVM Admin › Validasi impor (Import_Merchants)** → ringkasan muncul, detail di sheet `ImportReport`.
2. Perbaiki data bila perlu, ulangi langkah 2.
3. **LVM Admin › Terapkan impor ke Merchants** → konfirmasi. Seluruh isi Merchants diganti dengan baris valid; kolom kode diformat teks, angka ditulis sebagai angka, cache aplikasi langsung diperbarui, dan waktu impor tampil di dashboard.

Isi `DATA_SNAPSHOT_DATE` di sheet Settings bila ingin dashboard menampilkan tanggal posisi data (mis. `2026-10-19`).

## Data besar (puluhan ribu baris ke atas)

Jalur `Import_Merchants` menyalin seluruh data sehingga sel terpakai dua kali. Google Sheets membatasi **10 juta sel per spreadsheet**: 140.000 merchant × 41–42 kolom ≈ 5,8–5,9 juta sel, sehingga salinan staging tidak muat. Untuk data sebesar itu:

1. **Pakai sheet data langsung sebagai `Merchants`.** Ganti nama sheet data menjadi `Merchants` (atau tempel data ke sheet `Merchants` hasil setup). Header harus memuat kolom wajib, termasuk kolom acuan USAK (`grading_trx`).
2. Format kolom kode (`store_id`, `kode_cabang_final`, `account_number`, `cifno`, `kode_pos`, `mcc_code`, `mid_*`, `referal_code`) sebagai **Teks** sebelum menempel data, agar nilainya tidak berubah.
3. **LVM Admin › Validasi sheet Merchants (langsung)** — memeriksa seluruh baris per potongan (tanpa salinan), hasil di sheet `ImportReport`: kolom wajib, `store_id` ganda, angka/tanggal tidak valid, nilai kolom acuan USAK kosong atau tidak ada di `UsakConfig`. Berjalan puluhan detik untuk ±140 ribu baris.
4. **LVM Admin › Urutkan Merchants per cabang** — mengurutkan baris menurut `kode_cabang_final` lalu `store_id` supaya data satu cabang berada dalam satu blok. Tanpa ini, data cabang yang tersebar acak memaksa Apps Script membaca hampir seluruh sheet pada setiap pemuatan pertama cabang; aplikasi tetap benar tetapi lambat dan menampilkan peringatan "Sheet Merchants belum terurut per cabang". Jalankan lagi setiap kali Anda menempel data baru dalam urutan acak. Hati-hati bila ada rumus/referensi lain yang bergantung pada nomor baris.
5. **LVM Admin › Periksa konfigurasi & header** menampilkan jumlah baris, jumlah cabang, dan apakah data terurut.

Perkiraan beban: pemuatan pertama sebuah cabang (cache kosong) membaca kolom kode cabang seluruh sheet (±1–2 detik untuk 140 ribu baris) lalu hanya blok cabang tersebut; berikutnya dilayani dari cache (`CACHE_TTL_SECONDS`, 10 menit). Ukuran data satu cabang yang dicache dibatasi ±4 juta karakter; cabang yang lebih besar dari itu dibaca ulang setiap permintaan.

`npm run validate:csv` tetap dapat dipakai untuk memeriksa file CSV besar di komputer sebelum diunggah.

## Mengganti data contoh dengan data sebenarnya

1. Kosongkan sheet `Users` dari akun demo (jangan pernah memakai kata sandi demo di produksi).
2. Impor data merchant asli dengan langkah di atas.
3. `UsakConfig` terisi otomatis oleh setup dengan definisi USAK bawaan. Jalankan **LVM Admin › Isi daftar nilai kolom USAK ke UsakConfig** untuk melihat apakah ada nilai lain di data, lalu lengkapi kategorinya.
4. Tambahkan akun cabang dan buat hash kata sandinya.
5. **LVM Admin › 2. Periksa konfigurasi & header**.

## Memperbarui data berkala

Ulangi langkah 2–3 dengan snapshot terbaru. Follow-up tidak terhapus karena tersimpan di sheet `FollowUps` dan terhubung lewat `store_id`. Jika `kode_cabang_final` sebuah merchant berpindah, catatan follow-up cabang lama tidak terlihat oleh cabang baru (setiap cabang hanya melihat catatannya sendiri).
