# Arsitektur, sesi, dan batas keamanan

## Alur request

1. Browser memanggil route Next.js yang **same-origin** (`/api/...`). Browser tidak mengenal URL Apps Script.
2. Route Next.js (server di Vercel) membaca token sesi dari cookie httpOnly, lalu memanggil Apps Script dengan body:
   `{ action, api_key, token, payload }`.
3. Apps Script:
   1. mencocokkan `api_key` dengan Script Property `API_SHARED_SECRET` (gagal tertutup bila belum diatur);
   2. memvalidasi token sesi → menentukan `user_id`, `kode_cabang`, `role` **dari sheet Users**;
   3. memeriksa izin role;
   4. menjalankan aksi bisnis yang hanya membaca merchant `kode_cabang_final = cabang sesi`.
4. Respons `{ ok, data | error }` diteruskan ke browser; kode error dipetakan ke status HTTP (401/403/404/400/429/5xx).

Tidak ada aksi yang menerima nama sheet/range dari klien. Daftar aksi tetap ada di `routes_()` (`apps-script/src/Main.js`).

## Pola sesi/token

| Aspek | Implementasi |
|---|---|
| Pembuatan | Saat login berhasil, Apps Script membuat token acak 64 karakter hex (dua UUID v4 dari `java.util.UUID`/SecureRandom, ±244 bit). |
| Penyimpanan server | Hanya **SHA-256 token** disimpan di sheet `Sessions` (+ `expires_at`, `revoked_at`, sidik jari kredensial). Isi sheet tidak bisa dipakai untuk membajak sesi. |
| Penyimpanan browser | Token disimpan server Next.js di cookie `HttpOnly`, `SameSite=Lax`, `Secure` (produksi), nama `__Host-lvm_session`. JavaScript halaman tidak bisa membacanya — tidak memakai `localStorage`. |
| Masa berlaku | `SESSION_TTL_HOURS` di sheet Settings (bawaan 8 jam). Cookie kedaluwarsa pada waktu yang sama. |
| Validasi tiap request | Cek format token → cache 5 menit (CacheService) → bila tidak ada di cache: baca `Sessions`, cek `revoked_at`/`expires_at`, baca `Users` (harus `is_active`), cocokkan sidik jari `password_hash`. |
| Logout | `auth.logout` mengisi `revoked_at` dan menghapus cache; cookie dihapus. |
| Penonaktifan akun / ganti kata sandi | Berlaku paling lambat 5 menit (umur cache sesi). Untuk seketika: menu **LVM Admin › Cabut sesi satu pengguna**. Mengganti kata sandi lewat menu admin otomatis mencabut sesi lama. |
| Brute force | Maks. `LOGIN_MAX_ATTEMPTS` (5) gagal per kode cabang → dikunci `LOGIN_LOCK_MINUTES` (15). Pesan gagal sama untuk kode tidak dikenal dan kata sandi salah; kode cabang tidak dikenal tetap menjalankan PBKDF2 agar waktu respons serupa. |
| Hash kata sandi | PBKDF2-HMAC-SHA256, 100.000 iterasi, salt 16 byte. Format `pbkdf2_sha256$<iterasi>$<salt>$<hash>` (diuji kompatibel dengan `crypto.pbkdf2` Node). |
| CSRF | Cookie `SameSite=Lax` + route yang mengubah data menolak request tanpa `Origin`/`Sec-Fetch-Site` same-origin atau tanpa body JSON. |

## Data sensitif

| Data | Daftar merchant | Detail merchant | Cara membuka |
|---|---|---|---|
| `account_number`, `cifno` | Tidak dikirim | Disamarkan di server (`•••••1042`) | Tombol **Tampilkan** (role `boleh_lihat_sensitif`), tercatat `REVEAL_IDENTITY` di AuditLog |
| `cbalrp`, `ybal`, `avgbalrp`, `amtcrc`, `amtdrc` | Tidak dikirim | Tidak dikirim | Tombol **Tampilkan data saldo** (role `boleh_lihat_keuangan`), tercatat `REVEAL_FINANCIAL` |
| Pencarian `account_number` | Hanya role `boleh_cari_rekening` (min. 4 digit) | — | — |
| `password_hash` | Tidak pernah dikirim ke Next.js maupun browser | | |

Metrik performa (`freq_*`, `sv_*`, `fbi_*`) dianggap data kerja dan tampil untuk semua role.

Role bawaan bersifat hemat akses: `petugas` tidak bisa membuka data sensitif; `supervisor` bisa (lihat sheet `Roles`).

## Header keamanan frontend

`next.config.ts` mengirim `Content-Security-Policy` (`connect-src 'self'`, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, dan HSTS di produksi. Respons API memakai `Cache-Control: no-store`.

## Batas keamanan & teknis Google Apps Script Web App

Ketahui keterbatasan ini saat mengoperasikan aplikasi:

1. **Tidak bisa membaca header, cookie, atau IP request** dan tidak bisa mengatur status HTTP/header respons. Karena itu token & API key dikirim di body JSON, status ada di field `ok`, dan cookie diatur oleh Next.js.
2. **URL Web App bersifat publik** (akses "Anyone" diperlukan agar server Vercel bisa memanggilnya tanpa login Google). Perlindungan berasal dari `API_SHARED_SECRET` + token sesi, bukan dari kerahasiaan URL. Jangan bagikan secret; rotasi bila bocor (lihat di bawah).
3. **Berjalan sebagai pemilik skrip** ("Execute as: Me"). Skrip memiliki akses penuh ke spreadsheet atas nama pemilik → amankan akun pemilik (2FA), dan **bagikan spreadsheet hanya ke admin**. Siapa pun yang punya akses edit spreadsheet dapat melihat `password_hash`, mengubah data, dan menjalankan menu admin.
4. **Fungsi admin tidak bisa dipanggil lewat Web App** (hanya `doGet`/`doPost`). Fungsi admin juga memeriksa email pengguna aktif terhadap `ADMIN_EMAILS` atau pemilik spreadsheet.
5. **Bukan database transaksional.** Penulisan memakai `appendRow` (atomik) dan `LockService` untuk pembaruan. Hindari mengedit baris FollowUps/Sessions secara manual ketika aplikasi sedang dipakai.
6. **Kuota & performa:** satu request ±0,5–3 detik (lebih lama saat cold start); eksekusi maks. 6 menit; jumlah eksekusi bersamaan terbatas (sekitar 30 untuk Web App); CacheService maks. 100 KB per nilai dan 6 jam. Data merchant per cabang di-cache (`CACHE_TTL_SECONDS`, bawaan 10 menit) sehingga perubahan langsung di sheet Merchants terlihat setelah cache habis atau setelah menu **Bersihkan cache aplikasi**.
7. **Log eksekusi** (`console.*`) terlihat oleh pemilik/editor skrip. Kode tidak pernah mencatat kata sandi, hash, token, atau payload.
8. **Pembatasan login berbasis CacheService** bersifat upaya terbaik (cache bisa dikosongkan Google lebih awal).
9. **Ukuran data:** Google Sheets maksimal 10 juta sel per spreadsheet (±238 ribu baris × 42 kolom) dan sheet staging impor menggandakan pemakaian sel. Untuk ±140 ribu merchant aplikasi berjalan jika sheet `Merchants` diurutkan per cabang (lihat [05-impor-data.md](05-impor-data.md#data-besar-puluhan-ribu-baris-ke-atas)); cache miss per cabang memakan ±2–3 detik. Bila data/jumlah pengguna tumbuh jauh di atas itu, pertimbangkan database terkelola — kode sudah memisahkan akses data di `Sheets.js`/`Merchants.js`.

## Rotasi API_SHARED_SECRET

1. Buat nilai baru: `openssl rand -hex 32`.
2. Apps Script › Project Settings › Script Properties › ubah `API_SHARED_SECRET`.
3. Vercel › Settings › Environment Variables › ubah `APPS_SCRIPT_API_KEY` → **Redeploy**.

Selama jeda antara langkah 2 dan 3 aplikasi menolak request; lakukan di luar jam sibuk.

## Mengapa tidak memanggil Apps Script langsung dari browser?

Panggilan langsung akan memaksa token sesi disimpan di JavaScript (mis. `localStorage`), terekspos ke XSS, dan tidak memungkinkan API key server. Dengan BFF Next.js, token berada di cookie httpOnly, URL & secret Apps Script tetap di server, dan CSP dapat membatasi `connect-src` ke origin sendiri. Variabel `NEXT_PUBLIC_*` hanya dipakai untuk nama aplikasi.
