# Referensi API

Ada dua lapis API:

1. **Route Next.js** (`/api/*`) — dipakai browser. Autentikasi lewat cookie httpOnly.
2. **Apps Script Web App** — hanya dipanggil server Next.js. Satu endpoint `POST /exec` dengan field `action`.

## Format respons (keduanya)

```json
{ "ok": true, "data": { } }
```

```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "Periksa kembali isian follow-up.", "details": { "fields": { "catatan": "Catatan maksimal 2000 karakter." } } } }
```

`message` selalu Bahasa Indonesia dan aman ditampilkan. `details.fields` berisi pesan per field untuk error validasi.

## Route Next.js

| Method & path | Aksi Apps Script | Keterangan |
|---|---|---|
| `POST /api/auth/login` | `auth.login` | Body `{kode_cabang, password}`. Mengatur cookie sesi; token tidak dikirim ke browser. |
| `POST /api/auth/logout` | `auth.logout` | Mencabut sesi & menghapus cookie |
| `GET /api/auth/me` | `auth.me` | Profil sesi + izin role |
| `GET /api/auth/session-expired` | — | Menghapus cookie lalu redirect ke `/login` |
| `GET /api/dashboard` | `dashboard.summary` | Ringkasan cabang (akun area/region wajib `kode_cabang` di cakupannya) |
| `GET /api/region/search?q=` | `region.searchMerchants` | Cari merchant di cabang dalam cakupan akun area/region (min. 3 karakter, maks. 40 hasil) |
| `GET /api/region` | `region.summary` | Pemantauan akun area/region: cabang di cakupan, diurut rasio USAK terendah |
| `GET /api/merchants` | `merchants.list` | Query: `q, page, page_size, sort, dir, follow_up, status_follow_up, kategori_usak, status_trx, grading_trx, Tiering, status_rekening, flag_card_dongle, nama_area_final` (filter boleh berulang; `grading_usak` hanya berlaku bila menjadi kolom acuan USAK) |
| `GET /api/merchants/filter-options` | `merchants.filterOptions` | Nilai unik filter di cabang |
| `GET /api/merchants/:storeId` | `merchants.detail` | Detail tersamarkan + riwayat follow-up |
| `POST /api/merchants/:storeId/reveal` | `merchants.revealSensitive` | Body `{group: "identity" \| "financial"}` |
| `GET /api/merchants/:storeId/follow-ups` | `followups.list` | Riwayat follow-up |
| `POST /api/merchants/:storeId/follow-ups` | `followups.create` | Body `{status_follow_up, catatan?, tanggal_follow_up_berikutnya?, progres_usak?}` |
| `PATCH /api/follow-ups/:followUpId` | `followups.update` | Body: field yang diubah saja |

Request `POST`/`PATCH` wajib `Content-Type: application/json` dan same-origin (header `Origin`); bila tidak → `403 CSRF_REJECTED`.

## Apps Script `POST /exec`

```json
{ "action": "merchants.list", "api_key": "<API_SHARED_SECRET>", "token": "<token sesi>", "payload": { "q": "kios", "page": 1 } }
```

Semua aksi kecuali `auth.login` mewajibkan `token`. Cabang pengguna **selalu** diambil dari sesi; field cabang di payload diabaikan.

| Aksi | Payload | Data |
|---|---|---|
| `auth.login` | `kode_cabang`, `password` | `token`, `expires_at`, `user` |
| `auth.logout` | — | `logged_out` |
| `auth.me` | — | `user_id, kode_cabang, nama_cabang, role, permissions, expires_at` |
| `dashboard.summary` | — | `usak` (total, USAK, rasio, target, gap, configured, …), `distribusi`, `grading_trx_x_tiering`, `follow_up`, `metrics` (sum/avg/count per kolom MTD/YTD/30 hari), `prioritas_teratas`, `warnings`, `data` |
| `merchants.list` | `q, page, page_size, sort, dir, filters{kolom: [nilai]}, kategori_usak[], follow_up, status_follow_up` | `items, page, page_size, total, total_pages, total_branch, search_fields, …` |
| `merchants.filterOptions` | — | `columns{kolom: [{value,label,count}]}`, `kategori_usak`, `follow_up`, `status_follow_up` |
| `merchants.detail` | `store_id` | `merchant` (tanpa saldo, rekening/CIF disamarkan), `usak`, `priority`, `follow_up`, `follow_ups`, `options`, izin |
| `merchants.revealSensitive` | `store_id`, `group` | `values` (dicatat di AuditLog) |
| `followups.list` | `store_id` | `items` |
| `followups.create` | `store_id`, `status_follow_up`, `catatan`, `tanggal_follow_up_berikutnya`, `progres_usak` | follow-up baru |
| `followups.update` | `follow_up_id` + field yang diubah | follow-up hasil ubah |

Setiap objek `usak` berisi `{kategori, label, perlu_dicek, nilai, source_column}`; `nilai` adalah isi kolom acuan USAK (bawaan `grading_trx`) dan `source_column` namanya. Respons dashboard memuat `usak.source_column` dan `distribusi.usak_source`; respons daftar & opsi filter memuat `usak_source`.

Nilai khusus:

- `sort`: `priority` (bawaan), `freq_mtd`, `sv_mtd`, `fbi_mtd`, `freq_ytd`, `sv_ytd`, `fbi_ytd`, `freq_30_days`, `sv_30_days`, `store_name`, `next_follow_up`, `last_follow_up`. Nilai kosong selalu di akhir.
- `follow_up`: `perlu`, `jatuh_tempo`, `belum_pernah`, `sudah_ada`, `tidak_perlu`.
- `kategori_usak`: `USAK`, `BELUM_USAK`, `KOSONG`, `TIDAK_DIKENALI`, `PERLU_CEK` (= kosong + tidak dikenali).
- Nilai filter `__KOSONG__` mencocokkan sel kosong.
- Pencarian `q` mencakup `store_name`, `store_id`, `owner_name`; `account_number` hanya untuk role `boleh_cari_rekening` (min. 4 digit).

## Kode error

| Kode | HTTP (Next.js) | Arti |
|---|---|---|
| `UNAUTHENTICATED`, `SESSION_EXPIRED` | 401 | Token tidak ada/tidak valid/kedaluwarsa (cookie dihapus) |
| `INVALID_CREDENTIALS` | 401 | Kode cabang atau kata sandi salah |
| `ACCOUNT_INACTIVE`, `ROLE_INVALID`, `FORBIDDEN` | 403 | Akun nonaktif, role tidak dikenal, atau tidak berhak |
| `CSRF_REJECTED` | 403 | Request lintas situs ditolak |
| `NOT_FOUND` | 404 | Merchant/follow-up tidak ada **atau bukan milik cabang** (sengaja tidak dibedakan) |
| `VALIDATION_ERROR`, `BAD_REQUEST`, `UNKNOWN_ACTION` | 400 | Input tidak valid |
| `RATE_LIMITED` | 429 | Terlalu banyak percobaan login |
| `HEADER_MISMATCH`, `SHEET_MISSING`, `SHEET_ERROR`, `CONFIG_ERROR`, `BUSY` | 503 | Masalah struktur/akses Google Sheets atau konfigurasi |
| `UPSTREAM_UNAVAILABLE`, `UPSTREAM_INVALID` / `UPSTREAM_TIMEOUT` | 502 / 504 | Apps Script tidak dapat dihubungi / respons tidak valid / timeout 30 detik |
| `UNAUTHORIZED_CLIENT`, `BFF_NOT_CONFIGURED`, `INTERNAL` | 500 | API key salah, env Vercel belum diisi, atau error tak terduga |
