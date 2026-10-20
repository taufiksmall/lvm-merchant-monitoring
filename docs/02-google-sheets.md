# Struktur Google Sheets & pengelolaan akun

Semua sheet dibuat otomatis oleh menu **LVM Admin › 1. Setup / perbarui struktur sheet** (fungsi `setupSheets`). Setup aman dijalankan berulang: hanya menambah sheet/header yang belum ada dan baris bawaan untuk sheet konfigurasi yang masih kosong — tidak menimpa isi yang sudah diubah admin.

Aturan umum:

- Baris 1 = header. Pencocokan header toleran terhadap huruf besar/kecil dan spasi, tetapi **nama header tidak diubah diam-diam**. Untuk merapikan ke nama resmi, jalankan **LVM Admin › Rapikan nama header** secara eksplisit.
- Kolom kode (kode cabang, `store_id`, nomor rekening, kode pos, MID, CIF) diformat **Plain Text** oleh setup agar nol di depan tidak hilang (`0101` tetap `0101`).
- Urutan kolom boleh berbeda; aplikasi membaca berdasarkan nama header.
- Bagikan spreadsheet **hanya** ke administrator.

## Merchants

Hingga 42 kolom, nama persis seperti sumber data. Kolom `grading_usak` bersifat **opsional** (sumber data yang ada hanya memiliki 41 kolom, tanpa `grading_usak`):

```
store_id, store_name, account_number, owner_name, createddate, referal_code, kode_pos, address,
kecamatan, kabupaten, provinsi, mcc_code, lob_lm, kode_cabang_final, nama_cabang_final,
nama_area_final, freq_mtd, sv_mtd, fbi_mtd, freq_ytd, sv_ytd, fbi_ytd, freq_30_days, sv_30_days,
mid_static, mid_dynamic, flag_card_dongle, status_trx, grading_trx, grading_usak, tipe_akun,
status_rekening, tangging_real_merchant, companytype, jenis_rekening, cifno, cbalrp, ybal,
avgbalrp, amtcrc, amtdrc, Tiering
```

| Ketentuan | Keterangan |
|---|---|
| Nama sheet | Harus `Merchants`. Bila data Anda ada di sheet lain (mis. `Sheet1`), ganti namanya. |
| Kolom wajib ada | `store_id`, `store_name`, `kode_cabang_final`, `nama_cabang_final`, dan **kolom acuan USAK** (bawaan `grading_trx`). Bila hilang, API mengembalikan `HEADER_MISMATCH` beserta nama kolomnya. Kolom lain yang hilang tampil kosong + peringatan di dashboard; `grading_usak` yang tidak dipakai sebagai acuan boleh tidak ada. |
| `store_id` | Unik. Baris dengan `store_id` ganda dilewati dan dilaporkan. Karakter yang diizinkan: huruf, angka, `. _ - /`. |
| `kode_cabang_final` | Menghubungkan merchant ke cabang (dibandingkan dengan `Users.kode_cabang`). |
| `grading_trx` (bawaan) | **Kolom acuan USAK**: satu-satunya sumber status USAK. Kolom lain (termasuk `grading_usak`) diabaikan untuk status USAK kecuali Settings `USAK_SOURCE_COLUMN` diganti ke `grading_usak`. Lihat [04-konfigurasi-usak.md](04-konfigurasi-usak.md). |
| Angka | Disarankan angka polos (`1234567.5`). Juga dikenali: `1.234.567`, `1.234.567,89`, `1,234,567.89`. |
| `createddate` | `yyyy-mm-dd`, `dd/mm/yyyy`, atau tanggal Google Sheets. |

Contoh baris (sintetis):

| store_id | store_name | account_number | owner_name | createddate | kode_cabang_final | nama_cabang_final | nama_area_final | freq_mtd | sv_mtd | grading_trx | Tiering | … |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S01010001 | Konter Harapan 1 | 9017000533193 | Bayu Rahayu | 2021-10-17 | 0101 | KC Contoh Bandung | Area Contoh Bandung Raya | 81 | 14256000 | UREG > 0 | Tier 2 | … |

File lengkap: `sample-data/merchants.sample.csv`.

## Users

| Kolom | Isi |
|---|---|
| `user_id` | ID unik akun (mis. `U0101`). Dipakai sebagai `created_by` follow-up. |
| `kode_cabang` | Kode cabang untuk login; harus sama dengan `kode_cabang_final` merchant cabang tersebut. |
| `nama_cabang` | Nama cabang yang ditampilkan. |
| `password_hash` | **Hash**, bukan kata sandi. Format `pbkdf2_sha256$100000$<salt>$<hash>`. |
| `role` | Nama role di sheet `Roles` (`petugas`, `supervisor`, `viewer`, atau role buatan admin). |
| `is_active` | `TRUE`/`FALSE` (checkbox atau teks `TRUE`, `YA`, `1`, `AKTIF`). |

Contoh:

| user_id | kode_cabang | nama_cabang | password_hash | role | is_active |
|---|---|---|---|---|---|
| U0101 | 0101 | KC Contoh Bandung | pbkdf2_sha256$100000$OrogBn…$Wxo8a… | petugas | TRUE |
| U0101S | 0101 | KC Contoh Bandung | pbkdf2_sha256$100000$akRgGy…$kN8p… | supervisor | TRUE |

Satu cabang boleh punya beberapa akun (mis. petugas & supervisor) — semuanya login dengan kode cabang yang sama, dibedakan oleh kata sandi. Gunakan kata sandi yang berbeda untuk setiap akun.

### Menambah pengguna

1. Tambahkan baris di `Users`: isi `user_id`, `kode_cabang`, `nama_cabang`, `role`, `is_active = TRUE`. Biarkan `password_hash` kosong dulu.
2. Buat hash kata sandi dengan salah satu cara di bawah.
3. Sampaikan kata sandi awal ke petugas melalui saluran aman.

### Membuat atau memperbarui hash kata sandi

**Cara A — menu admin (disarankan):** **LVM Admin › Atur kata sandi pengguna…** → pilih `user_id` → ketik kata sandi dua kali → **Simpan**. Kata sandi langsung di-hash di Apps Script, ditulis ke `password_hash`, dan seluruh sesi lama pengguna dicabut. Hanya pemilik spreadsheet atau email di `ADMIN_EMAILS` yang bisa memakainya. Kata sandi tidak pernah ditulis ke sel, log, atau riwayat versi.

**Cara B — komputer lokal (tanpa jaringan):**

```bash
npm run hash-password
```

Ketik kata sandi (tidak terlihat), ulangi, lalu salin hasil `pbkdf2_sha256$…` ke sel `password_hash`. Setelah menempel hash manual, jalankan **LVM Admin › Cabut sesi satu pengguna** bila ingin sesi lama langsung berakhir (bila tidak, sesi lama berakhir dalam ±5 menit karena sidik jari kredensial berubah).

Kebijakan minimal: 10 karakter, memuat huruf dan angka.

> Jangan pernah mengetik kata sandi asli ke sel spreadsheet — riwayat versi Google Sheets akan menyimpannya.

### Akun untuk banyak cabang sekaligus

Untuk puluhan/ratusan cabang, jangan membuat akun satu per satu. Alurnya (kata sandi tidak pernah masuk spreadsheet sebagai teks):

1. **LVM Admin › 1. Setup** (sekali, bila belum membuat sheet `Import_Users`).
2. **LVM Admin › Buat akun untuk semua cabang** — menambahkan baris `Users` untuk setiap `kode_cabang_final` di `Merchants` yang belum punya akun: `user_id = U<kode>`, `nama_cabang` dari data, `role = petugas`, `is_active = FALSE`, `password_hash` kosong. Idempoten; cabang yang sudah punya akun dilewati. Akun belum bisa login sampai hash diterapkan.
3. Di sheet `Users`, **File › Unduh › CSV (sheet saat ini)**, simpan sebagai `users.csv`.
4. Di komputer Anda:

```bash
npm run passwords:bulk -- users.csv
```

   Skrip membuat kata sandi awal acak (12 karakter, huruf+angka, tanpa karakter yang mudah tertukar) untuk setiap akun tanpa hash, menghitung hash PBKDF2-nya, dan menulis dua berkas di folder `akun-awal/` (ada di `.gitignore`):
   - `hash-untuk-import.tsv` — `user_id`, `password_hash`, `is_active` dipisah **tab** (siap ditempel ke Google Sheets). `hash-untuk-import.csv` berisi hal yang sama dalam format CSV.
   - `kata-sandi-awal.csv` — `kode_cabang,nama_cabang,user_id,kata_sandi` dalam **teks biasa**, izin 0600. Kata sandi tidak dicetak ke layar.

   Bila kata sandi awal **ditentukan administrator**, siapkan CSV `kode_cabang,password` lalu tambahkan `--passwords=sandi-admin.csv`. Kata sandi yang tidak memenuhi kebijakan (min. 10 karakter, huruf+angka) ditolak. Opsi lain: `--only=15104,15105` (sebagian cabang), `--all` (reset juga akun yang sudah punya hash), `--length=14`.
5. Salin seluruh isi `hash-untuk-import.tsv` (tanpa header; file ini tidak punya header), lalu klik sel **A2** sheet **`Import_Users`** dan tempel (⌘V). Hasil tempel harus mengisi tiga kolom. Jangan menempel isi `.csv`: Google Sheets tidak memisah kolom pada koma.
6. **LVM Admin › Terapkan hash dari Import_Users** — memvalidasi format hash, mengisi `password_hash` dan `is_active` (hanya dua kolom itu) untuk `user_id` yang cocok, mencabut sesi lama pengguna tersebut, lalu mengosongkan `Import_Users`. `user_id` yang tidak ada, hash tidak valid, dan baris ganda dilaporkan dan dilewati.
7. Distribusikan `kata-sandi-awal.csv` ke petugas lewat saluran aman, lalu **hapus berkas itu** (dan kosongkan Sampah). Minta petugas mengganti kata sandi bila Anda menyediakan mekanismenya; sampai saat itu, ganti lewat **Atur kata sandi pengguna…**.

Untuk mengganti kata sandi massal nanti, ulangi langkah 3–6 dengan `--all` (atau `--only`).

### Akun area dan region (pemantauan banyak cabang)

Akun **area** dan **region** hanya **melihat** (tidak mencatat follow-up, tidak membuka rekening/CIF/saldo). Setelah login mereka membuka halaman **Pemantauan**: daftar cabang di cakupannya dengan total merchant, merchant USAK, rasio USAK, gap menuju 50% dan status, diurutkan dari **rasio terendah**; klik cabang untuk melihat daftar merchant yang perlu di-follow-up (urut prioritas Tiering), lengkap dengan detail dan riwayat follow-up cabang itu. Akun area melihat satu area; akun region melihat semua area yang dipetakan ke region tersebut.

Cakupan ditentukan di server dari sheet `Wilayah` dan `BranchIndex`; cabang di luar cakupan ditolak.

Langkah menyiapkan (setelah **Bangun indeks cabang**):

1. **LVM Admin › Siapkan sheet Wilayah (area & region)** — mengisi sheet `Wilayah` dengan semua area di data (`nama_area_final`, `kode_area` bawaan `AREA-<NAMA>`, jumlah cabang & merchant) dan menambahkan role `area` dan `region` di sheet `Roles` bila belum ada. Aman diulang; isian Anda tidak ditimpa.
2. Isi kolom **`nama_region`** dan **`kode_region`** (mis. `Region Sulawesi Utara`, `REG-SULUT`) untuk setiap area. Satu region = beberapa baris dengan `kode_region` yang sama. `kode_area` dan `kode_region` adalah **kode login** (huruf, angka, titik, garis bawah, tanda hubung; maks. 32).
3. **LVM Admin › Buat akun area dan region** — membuat baris `Users` (`user_id` = kode login, `role` = `area`/`region`, nonaktif, tanpa kata sandi).
4. Unduh sheet `Users` sebagai CSV dan buat hash kata sandi: `npm run passwords:bulk -- users.csv --pattern='Mdna{kode}#'` (atau kata sandi acak / `--passwords`). Terapkan hash seperti akun cabang. Login memakai kode wilayah di kolom **Kode cabang**.

Di halaman Pemantauan akun area/region juga bisa:

- **Cari merchant** di semua cabang dalam cakupannya (nama merchant, MID, `store_id`, nama pemilik; minimal 3 karakter, maksimal 40 hasil). Pencarian hanya menjangkau cabang di cakupan akun dan tidak mencari atau menampilkan rekening/CIF/saldo. Hasil membuka detail merchant (hanya lihat).
- **Filter Area** (akun region): dropdown **Area** menyaring tabel cabang ke satu area; klik nama area pada kartu "Per area" untuk memfilter, klik lagi untuk melepas. Digabung dengan filter rasio dan pencarian cabang.
- **Filter rasio USAK** dengan rentang yang ditentukan sendiri (dari ≥ X% sampai < Y%) atau pilihan cepat (`< 25%`, `25% – <50%`, `< 50%`, `≥ 50%`), digabung dengan pencarian nama/kode cabang.

Angka pada halaman Pemantauan adalah **snapshot** saat **Bangun indeks cabang** dijalankan (total, USAK, belum USAK, perlu dicek per cabang). Jalankan ulang setelah data merchant atau definisi USAK berubah. Cabang yang barisnya terpecah (belum terurut) tidak muncul sampai **Urutkan Merchants per cabang** dijalankan.

> Kata sandi berpola yang bisa diturunkan dari kode (mis. `MdnaAREA-PALU#`) lebih berisiko untuk akun area/region karena mencakup banyak cabang. Pertimbangkan `--length`/acak untuk akun-akun ini.

### Menonaktifkan akun

Ubah `is_active` menjadi `FALSE`. Login baru langsung ditolak; sesi yang sedang berjalan berakhir paling lambat 5 menit. Untuk mengakhiri seketika: **LVM Admin › Cabut sesi satu pengguna…** → masukkan `user_id`.

### Mengatur role

Ubah kolom `role` pada `Users`. Izin setiap role diatur di sheet `Roles`.

## FollowUps

Setiap baris = satu catatan tindak lanjut. Status follow-up terkini merchant = catatan dengan `created_at` terbaru.

| Kolom | Isi |
|---|---|
| `follow_up_id` | `FU-<uuid>` dibuat otomatis |
| `store_id` | Merchant yang di-follow-up |
| `kode_cabang` | Cabang pencatat (dari sesi, bukan dari input) |
| `status_follow_up` | Kode dari sheet `Options` (`jenis = status_follow_up`) |
| `catatan` | Maks. 2.000 karakter. Teks diawali `=`, `+`, `-`, `@` disimpan sebagai teks (anti formula injection). |
| `tanggal_follow_up_berikutnya` | `yyyy-mm-dd`, tidak boleh sebelum hari ini (WIB) |
| `progres_usak` | Kode dari `Options` (`jenis = progres_usak`), opsional |
| `created_by` | `user_id` pencatat |
| `created_at`, `updated_at` | ISO 8601 UTC |

Contoh:

| follow_up_id | store_id | kode_cabang | status_follow_up | catatan | tanggal_follow_up_berikutnya | progres_usak | created_by | created_at | updated_at |
|---|---|---|---|---|---|---|---|---|---|
| FU-3f1c…-9a2b | S01010069 | 0101 | DIJADWALKAN | Kunjungi untuk edukasi QRIS. | 2026-10-21 | EDUKASI | U0101 | 2026-10-20T02:01:00.000Z | 2026-10-20T02:01:00.000Z |

Hak akses: membaca follow-up hanya untuk merchant milik cabang dan catatan dengan `kode_cabang` cabang tersebut. Mengubah catatan: pencatatnya sendiri, atau role `boleh_ubah_semua_follow_up`.

## Sessions (dikelola sistem)

`session_hash, user_id, kode_cabang, credential_fp, created_at, expires_at, revoked_at` — hash token, bukan token. Jangan diedit manual. Bersihkan baris lama lewat **LVM Admin › Bersihkan sesi kedaluwarsa**, atau pasang trigger harian lewat **Pasang pembersihan sesi harian**.

## Roles

| role | keterangan | boleh_lihat_sensitif | boleh_lihat_keuangan | boleh_cari_rekening | boleh_tulis_follow_up | boleh_ubah_semua_follow_up |
|---|---|---|---|---|---|---|
| petugas | Petugas cabang | FALSE | FALSE | FALSE | TRUE | FALSE |
| supervisor | Supervisor cabang | TRUE | TRUE | TRUE | TRUE | TRUE |
| viewer | Hanya melihat | FALSE | FALSE | FALSE | FALSE | FALSE |

Semua role tetap dibatasi ke cabangnya sendiri. Akun dengan role yang tidak ada di sheet ini tidak bisa login.

## UsakConfig, PriorityRules, Options

Lihat [04-konfigurasi-usak.md](04-konfigurasi-usak.md).

## Settings

| kunci | bawaan | keterangan |
|---|---|---|
| SESSION_TTL_HOURS | 8 | Masa berlaku sesi (1–24 jam) |
| CACHE_TTL_SECONDS | 600 | Cache data merchant per cabang |
| PRIORITY_MIN_SCORE | 1 | Skor minimal "perlu follow-up" |
| LOGIN_MAX_ATTEMPTS | 5 | Batas gagal login per kode cabang |
| LOGIN_LOCK_MINUTES | 15 | Lama kunci login |
| USAK_SOURCE_COLUMN | grading_trx | Kolom Merchants yang menentukan status USAK: `grading_trx` atau `grading_usak` |
| DEFAULT_PAGE_SIZE / MAX_PAGE_SIZE | 25 / 100 | Pagination |
| KODE_CABANG_PAD_LENGTH | (kosong) | Isi mis. `4` bila kode cabang angka kehilangan nol di depan (`101` → `0101`) |
| AUDIT_LOGIN | FALSE | `TRUE` = catat setiap login berhasil di AuditLog (menambah ±0,5 detik per login) |
| PBKDF2_ITERATIONS | 100000 | Iterasi hash baru dari menu admin |
| DATA_SNAPSHOT_DATE | (kosong) | Tanggal posisi data untuk ditampilkan di dashboard |
| TIMEZONE | Asia/Jakarta | Penentuan "hari ini" untuk jatuh tempo |

Daftar akun untuk login di-cache 2 menit per kode: mengganti kata sandi/hash lewat menu admin berlaku seketika, sedangkan edit langsung di sheet `Users` berlaku paling lambat 2 menit.

Perubahan konfigurasi berlaku ≤ 2 menit, atau seketika setelah **LVM Admin › Bersihkan cache aplikasi**.

## AuditLog (dikelola sistem)

`waktu, user_id, kode_cabang, aksi, store_id, keterangan`. Aksi: `LOGIN`, `LOGIN_LOCKED`, `REVEAL_IDENTITY`, `REVEAL_FINANCIAL`, `FOLLOW_UP_CREATE`, `FOLLOW_UP_UPDATE`, `ADMIN_SET_PASSWORD`. Tidak pernah berisi kata sandi, hash, token, atau nilai data sensitif.

## Import_Merchants & ImportReport

Sheet kerja untuk impor data; lihat [05-impor-data.md](05-impor-data.md).
