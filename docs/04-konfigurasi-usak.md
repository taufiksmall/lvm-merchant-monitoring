# Konfigurasi USAK, prioritas, dan status follow-up

Semua konfigurasi bisnis ada di spreadsheet sehingga bisa diubah tanpa deploy ulang. Perubahan berlaku ≤ 2 menit, atau seketika setelah **LVM Admin › Bersihkan cache aplikasi**.

## 1. Definisi USAK — sheet `UsakConfig` (WAJIB diisi)

Status USAK ditentukan **hanya** dari kolom `grading_usak` di sheet Merchants. Aplikasi tidak menyimpulkan status USAK dari `grading_trx`, catatan follow-up, atau kolom lain, dan tidak menebak nilai kategorinya.

| nilai_grading_usak | kategori | keterangan |
|---|---|---|
| *(nilai persis seperti di data)* | `USAK` atau `BELUM_USAK` | bebas |

Aturan:

- Pencocokan tanpa beda huruf besar/kecil dan spasi di ujung.
- `kategori` hanya `USAK` atau `BELUM_USAK` (`BELUM USAK`, `NON_USAK` juga diterima sebagai belum USAK).
- Nilai yang **kosong** di data → kategori `KOSONG`; nilai yang **tidak ada di UsakConfig** → `TIDAK_DIKENALI`. Keduanya **tidak dihitung USAK**, ditandai "perlu dicek" di daftar/detail, dan memunculkan peringatan di dashboard.
- Selama belum ada satu pun nilai berkategori `USAK`, dashboard menampilkan "Definisi USAK belum dikonfigurasi" dan menandai angka USAK, rasio, dan gap sebagai **belum final**.
- Konfigurasi yang sama dipakai dashboard, rasio, gap target, filter, daftar, dan detail.

### Langkah mengisi

1. Pastikan data merchant sudah dimuat.
2. **LVM Admin › Isi daftar nilai grading_usak ke UsakConfig** — menambahkan setiap nilai unik `grading_usak` yang ada di data dengan kolom kategori **kosong** dan jumlah merchant di keterangan.
3. Isi kolom `kategori` sesuai definisi bisnis resmi.
4. **LVM Admin › Bersihkan cache aplikasi**.

Contoh untuk data sintetis di `sample-data/usak_config.sample.csv` (**bukan nilai resmi**):

| nilai_grading_usak | kategori | keterangan |
|---|---|---|
| USAK | USAK | CONTOH untuk data sintetis |
| NON USAK | BELUM_USAK | CONTOH untuk data sintetis |

### Rumus dashboard

```
rasio_usak     = total_merchant > 0 ? merchant_usak / total_merchant × 100 : 0
target_usak_50 = ceil(total_merchant × 0,5)
gap_usak_50    = max(0, target_usak_50 − merchant_usak)
```

Contoh: 101 merchant, 43 USAK → target 51, rasio 42,6%, gap 8. Bila belum tercapai, rasio tidak pernah dibulatkan tampil "50,0%".

## 2. Merchant prioritas — sheet `PriorityRules`

Setiap merchant mendapat **skor prioritas** = jumlah `bobot` aturan aktif yang terpenuhi. Merchant ditandai **perlu follow-up** bila skor ≥ `PRIORITY_MIN_SCORE` (Settings, bawaan 1) **dan** status follow-up terakhirnya bukan status final.

| Kolom | Isi |
|---|---|
| `rule_id` | ID aturan. Beberapa baris dengan `rule_id` sama digabung dengan **AND**. |
| `aktif` | `TRUE`/`FALSE` (baris pertama menentukan; satu baris FALSE menonaktifkan aturan) |
| `label` | Alasan yang tampil di aplikasi |
| `kolom` | Kolom Merchants (mis. `freq_30_days`) atau field turunan (tabel di bawah) |
| `operator` | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in` (nilai dipisah koma), `contains`, `empty`, `not_empty` |
| `nilai` | Nilai pembanding |
| `bobot` | Angka, bawaan 1 |

Field turunan:

| Field | Nilai |
|---|---|
| `_kategori_usak` | `USAK`, `BELUM_USAK`, `KOSONG`, `TIDAK_DIKENALI` |
| `_status_follow_up` | Kode status follow-up terakhir (kosong bila belum ada) |
| `_follow_up_jatuh_tempo` | `TRUE` bila tanggal follow-up berikutnya ≤ hari ini dan status belum final |
| `_ada_follow_up` | `TRUE`/`FALSE` |
| `_hari_sejak_follow_up` | Jumlah hari sejak follow-up terakhir |

### Aturan bawaan (asumsi awal — silakan disesuaikan)

| rule_id | aktif | label | kondisi | bobot |
|---|---|---|---|---|
| R01 | TRUE | Belum USAK | `_kategori_usak eq BELUM_USAK` | 3 |
| R02 | TRUE | grading_usak perlu diperiksa | `_kategori_usak in KOSONG,TIDAK_DIKENALI` | 2 |
| R03 | TRUE | Jadwal follow-up jatuh tempo | `_follow_up_jatuh_tempo eq TRUE` | 2 |
| R04 | TRUE | Belum pernah di-follow-up | `_kategori_usak neq USAK` **AND** `_ada_follow_up eq FALSE` | 1 |
| R05 | **FALSE** | Tanpa transaksi 30 hari | `freq_30_days eq 0` | 1 |

Asumsi yang dipakai:

- Sasaran follow-up adalah merchant yang belum USAK atau nilai `grading_usak`-nya perlu dicek.
- Tidak ada ambang performa transaksi yang ditetapkan permanen. R05 hanya contoh dan nonaktif; aktifkan atau buat aturan baru (mis. `sv_mtd lt 1000000`) setelah ada definisi bisnis.
- Merchant USAK hanya ditandai bila petugas sudah menjadwalkan follow-up yang jatuh tempo.

Aturan dengan kolom/operator tidak dikenal dilewati dan muncul sebagai peringatan di dashboard.

## 3. Status follow-up & progres USAK — sheet `Options`

| jenis | kode | label | urutan | final | aktif |
|---|---|---|---|---|---|
| status_follow_up | DIJADWALKAN | Dijadwalkan | 1 | FALSE | TRUE |
| status_follow_up | SUDAH_DIHUBUNGI | Sudah dihubungi | 2 | FALSE | TRUE |
| status_follow_up | SUDAH_DIKUNJUNGI | Sudah dikunjungi | 3 | FALSE | TRUE |
| status_follow_up | MENUNGGU_RESPONS | Menunggu respons merchant | 4 | FALSE | TRUE |
| status_follow_up | TIDAK_DAPAT_DIHUBUNGI | Tidak dapat dihubungi | 5 | FALSE | TRUE |
| status_follow_up | TIDAK_BERMINAT | Tidak berminat | 6 | TRUE | TRUE |
| status_follow_up | SELESAI | Selesai | 7 | TRUE | TRUE |
| progres_usak | BELUM_DIMULAI | Belum dimulai | 1 | | TRUE |
| progres_usak | EDUKASI | Edukasi / sosialisasi | 2 | | TRUE |
| progres_usak | DALAM_PROSES | Dalam proses | 3 | | TRUE |
| progres_usak | MENUNGGU_PEMBARUAN_DATA | Menunggu pembaruan data grading | 4 | | TRUE |

- `final = TRUE`: merchant dengan status terakhir ini tidak dihitung "perlu follow-up" dan jadwalnya tidak dianggap jatuh tempo.
- `aktif = FALSE`: tidak bisa dipilih untuk catatan baru, tetapi catatan lama tetap tampil.
- Jangan mengganti `kode` yang sudah dipakai di FollowUps; ubah `label` saja.
- Progres USAK hanya catatan kerja. **Status USAK resmi tetap dari `grading_usak`.**
