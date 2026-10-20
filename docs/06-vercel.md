# Deploy frontend ke Vercel

## Environment variables

Atur di **Vercel › Project › Settings › Environment Variables** (Production, dan Preview bila dipakai):

| Nama | Wajib | Terlihat browser? | Isi |
|---|---|---|---|
| `APPS_SCRIPT_URL` | Ya | Tidak (server saja) | URL Web App Apps Script berakhiran `/exec` |
| `APPS_SCRIPT_API_KEY` | Ya | Tidak (server saja) | Sama dengan Script Property `API_SHARED_SECRET`. Tandai **Sensitive**. |
| `NEXT_PUBLIC_APP_NAME` | Tidak | Ya | Nama aplikasi di header, mis. `Monitoring Merchant LVM` |

- Variabel tanpa awalan `NEXT_PUBLIC_` tidak pernah masuk bundle browser.
- `APPS_SCRIPT_URL` sengaja tidak memakai `NEXT_PUBLIC_`: browser hanya berbicara dengan route `/api/*` milik aplikasi ini (lihat [01-arsitektur-keamanan.md](01-arsitektur-keamanan.md)).
- Di produksi `APPS_SCRIPT_URL` wajib HTTPS.
- Jangan menaruh kredensial Google apa pun di Vercel — tidak dibutuhkan.

## Langkah deploy

1. Push repository ke GitHub/GitLab/Bitbucket (pastikan `.env.local` dan `apps-script/.clasp.json` tidak ikut — sudah di `.gitignore`).
2. Vercel › **Add New › Project** › import repository.
3. Framework preset: **Next.js** (otomatis). Root directory: root repository. Build command & output: bawaan.
4. Isi environment variables di atas.
5. **Deploy**. Buka URL produksi → halaman login.
6. Setiap mengubah environment variable, lakukan **Redeploy** agar nilainya terpakai.

Dengan Vercel CLI:

```bash
vercel env add APPS_SCRIPT_URL production
```

```bash
vercel env add APPS_SCRIPT_API_KEY production
```

```bash
vercel --prod
```

## Pemeriksaan setelah deploy

- Login dengan akun cabang uji → dashboard menampilkan angka cabang tersebut.
- Buka DevTools › Application › Cookies: ada `__Host-lvm_session` dengan `HttpOnly` dan `Secure`; `localStorage` kosong.
- DevTools › Network: browser hanya memanggil domain aplikasi sendiri (tidak ada `script.google.com`).
- Coba buka `/merchants/<store_id cabang lain>` → "Merchant tidak ditemukan".

## Pemecahan masalah

| Gejala | Penyebab umum |
|---|---|
| "Konfigurasi server belum lengkap" | `APPS_SCRIPT_URL`/`APPS_SCRIPT_API_KEY` kosong, atau API key tidak sama dengan `API_SHARED_SECRET` |
| "Respons server data tidak valid" | URL bukan `/exec`, deployment belum "Anyone", atau skrip error saat dimuat (cek Apps Script › Executions) |
| Perubahan kode Apps Script tidak terlihat | Belum membuat **New version** di Manage deployments |
| "Header sheet … tidak sesuai" | Kolom wajib di Merchants hilang/berganti nama; jalankan **Periksa konfigurasi & header** |
| Login selalu gagal untuk cabang tertentu | `password_hash` kosong/salah format, role tidak ada di Roles, atau kode cabang kehilangan nol di depan (format kolom sebagai teks atau isi `KODE_CABANG_PAD_LENGTH`) |
| Data merchant baru belum tampil | Cache 10 menit; jalankan **Bersihkan cache aplikasi** |
