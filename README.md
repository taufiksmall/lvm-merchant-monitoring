# Monitoring Merchant LVM — menuju rasio USAK 50%

Website untuk petugas cabang memantau performa merchant LVM dan menentukan merchant yang perlu di-follow-up agar menjadi USAK.

- Petugas login dengan **kode cabang + kata sandi** yang dikelola administrator di Google Sheets.
- Setelah login, petugas **hanya** melihat merchant dengan `kode_cabang_final` = cabangnya. Pembatasan ini dilakukan di backend (Apps Script), bukan di browser.
- Dashboard: total merchant, merchant USAK (dari kolom acuan USAK, bawaan `grading_trx`), rasio USAK, gap menuju 50%, distribusi status, ringkasan MTD/YTD/30 hari, dan merchant prioritas.
- Daftar merchant dengan pencarian, filter, pengurutan, dan pagination di server; detail merchant; pencatatan follow-up & progres USAK.

## Arsitektur

```
Browser ──HTTPS──> Next.js di Vercel (halaman + route /api/*)
                     │  cookie sesi httpOnly, cek origin (CSRF)
                     │  APPS_SCRIPT_URL & APPS_SCRIPT_API_KEY hanya di server
                     └──HTTPS──> Google Apps Script Web App (apps-script/)
                                   │  validasi API key + token sesi + role + cabang
                                   │  filter/sort/pagination/agregat
                                   └──> Google Sheets (Merchants, Users, FollowUps, …)
```

Browser tidak pernah memanggil Apps Script secara langsung dan tidak pernah memegang token sesi di JavaScript. Penjelasan lengkap pola sesi & batas keamanan: [docs/01-arsitektur-keamanan.md](docs/01-arsitektur-keamanan.md).

Tidak ada database lain selain Google Sheets.

## Struktur proyek

| Path | Isi |
|---|---|
| `app/`, `components/`, `lib/` | Frontend Next.js 16 (App Router, Tailwind CSS 4) + route API (BFF) |
| `proxy.ts` | Mengarahkan halaman tanpa cookie sesi ke `/login` |
| `apps-script/src/` | Backend Google Apps Script (Web App + menu admin) |
| `dev/gas-emulator/` | Emulator lokal: menjalankan kode `apps-script/src` apa adanya di Node dengan Sheets tiruan |
| `scripts/` | `hash-password`, `validate:csv`, generator data contoh |
| `sample-data/` | Data contoh **sintetis** (tanpa data pribadi nyata) |
| `tests/` | Pengujian backend lewat emulator (`npm test`) |
| `docs/` | Dokumentasi setup, sheet, akun, konfigurasi USAK, deployment, API |

## Menjalankan secara lokal (tanpa akun Google)

Butuh Node.js ≥ 20.9.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Isi `APPS_SCRIPT_API_KEY` di `.env.local` dengan string acak (mis. hasil `openssl rand -hex 32`). Lalu jalankan dua terminal:

```bash
npm run dev:api
```

```bash
npm run dev
```

Buka http://localhost:3000. `dev:api` menjalankan emulator Apps Script di `http://localhost:8787/exec` dengan data contoh; akun demo ada di [sample-data/README.md](sample-data/README.md). Data emulator disimpan di memori dan kembali ke awal setiap emulator dijalankan ulang.

> **Catatan disk:** folder `node_modules` berisi puluhan ribu file kecil. Pada drive berformat **exFAT** (misalnya SSD eksternal) setiap file memakan minimal satu blok (128 KB), sehingga `npm install` bisa gagal dengan `ENOSPC` walau ruang kosong terlihat cukup. Jalankan proyek dari disk internal (APFS) atau kosongkan ruang lebih banyak.

Perintah lain:

| Perintah | Fungsi |
|---|---|
| `npm test` | Uji backend Apps Script (auth, isolasi cabang, rumus USAK, follow-up, impor) |
| `npm run lint` / `npm run typecheck` / `npm run build` | Pemeriksaan & build produksi |
| `npm run hash-password` | Buat `password_hash` secara lokal (kata sandi tidak dikirim ke mana pun) |
| `npm run validate:csv -- file.csv` | Validasi CSV merchant sebelum diunggah |
| `npm run sample-data` | Buat ulang data contoh |
| `npm run gas:push` | Unggah `apps-script/src` ke Apps Script dengan clasp |

## Menuju produksi

1. [Siapkan Google Spreadsheet & Apps Script](docs/03-apps-script.md) — buat spreadsheet, tempel kode, jalankan **LVM Admin › Setup**, isi Script Properties, deploy Web App.
2. [Isi sheet & akun](docs/02-google-sheets.md) — struktur setiap sheet, cara menambah pengguna, membuat hash, menonaktifkan akun, role.
3. [Konfigurasi USAK, prioritas, dan status follow-up](docs/04-konfigurasi-usak.md) — definisi USAK bawaan (`grading_trx`) dan cara menambah nilai baru di sheet `UsakConfig`.
4. [Impor data merchant](docs/05-impor-data.md).
5. [Deploy frontend ke Vercel](docs/06-vercel.md).

Referensi API Apps Script: [docs/07-api.md](docs/07-api.md).

## Yang perlu ditentukan bisnis

- **Definisi USAK** (kolom acuan `grading_trx`): `USAK`, `USAK IDEAL`, `USAK OPTIMAL` = USAK; `UREG > 0`, `UREG = 0` = belum USAK (dikonfirmasi pemilik bisnis; diisi otomatis oleh setup). Nilai lain tidak dihitung USAK dan ditandai "tidak dikenali" sampai ditambahkan di `UsakConfig`. Bila `UsakConfig` dikosongkan, dashboard menampilkan "Definisi USAK belum dikonfigurasi" dan angka USAK ditandai belum final.
- **Aturan merchant prioritas.** Aturan bawaan hanya memakai kategori USAK dan status follow-up; aturan berbasis ambang transaksi disediakan sebagai contoh nonaktif.
- **Arti kolom saldo** (`cbalrp`, `ybal`, `avgbalrp`, `amtcrc`, `amtdrc`): ditampilkan dengan nama kolom aslinya dan hanya untuk role yang diizinkan.
