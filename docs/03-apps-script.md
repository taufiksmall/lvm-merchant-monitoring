# Menyiapkan Google Spreadsheet & Apps Script

Disarankan memakai skrip **terikat (bound)** ke spreadsheet agar menu **LVM Admin** tersedia. Gunakan akun Google organisasi yang akan menjadi pemilik data (aktifkan verifikasi 2 langkah).

## 1. Buat spreadsheet

1. Buat Google Spreadsheet baru, misalnya "LVM Merchant Monitoring".
2. **File › Setelan** → Lokal: Indonesia, Zona waktu: (GMT+07:00) Jakarta.
3. Bagikan hanya ke administrator (jangan ke petugas cabang — petugas memakai website).

## 2. Pasang kode Apps Script

### Opsi A — clasp (disarankan)

1. Di spreadsheet: **Ekstensi › Apps Script**. Di editor, buka **Project Settings** (ikon roda gigi) dan salin **Script ID**.
2. Aktifkan Apps Script API: https://script.google.com/home/usersettings.
3. Di komputer:

```bash
npm install -g @google/clasp
```

```bash
clasp login
```

```bash
cp apps-script/.clasp.json.example apps-script/.clasp.json
```

Isi `scriptId` di `apps-script/.clasp.json` (file ini di-ignore git), lalu:

```bash
npm run gas:push
```

Perintah ini mengunggah `apps-script/src/*.js`, `AdminDialog.html`, dan `appsscript.json` (file `._*` dari macOS diabaikan oleh `.claspignore`). Jawab **yes** bila clasp bertanya soal menimpa manifest.

### Opsi B — tempel manual (tanpa clasp)

Buat file gabungan:

```bash
npm run gas:bundle
```

Hasilnya di `apps-script/dist/` (tidak di-commit): `Code.gs`, `AdminDialog.html`, `appsscript.json`. Di editor Apps Script (Ekstensi › Apps Script):

1. File bawaan `Code.gs`: hapus isinya, tempel seluruh isi `dist/Code.gs`.
2. **+ › HTML** → beri nama `AdminDialog` → tempel isi `dist/AdminDialog.html`.
3. **Project Settings** (roda gigi) › centang **Show "appsscript.json" manifest file in editor** → buka `appsscript.json` → ganti isinya dengan `dist/appsscript.json`.
4. **Simpan** (Ctrl/Cmd+S).

Kode sumbernya terpisah per modul di `apps-script/src/` (Config, Util, Crypto, Sheets, ConfigStore, Auth, Merchants, FollowUps, Dashboard, Import, Admin, Main). Menempel file satu per satu juga bisa: buat file Script dengan nama yang sama dan tempel isinya (urutan tidak berpengaruh).

## 3. Jalankan setup

1. Muat ulang spreadsheet → menu **LVM Admin** muncul.
2. **LVM Admin › 1. Setup / perbarui struktur sheet**. Izinkan akses saat diminta (Google menampilkan layar otorisasi untuk akses Spreadsheet, UI, trigger, dan email Anda).
3. Setup membuat sheet `Merchants, Users, FollowUps, Sessions, Roles, UsakConfig, PriorityRules, Options, Settings, AuditLog, Import_Users`, memformat kolom kode sebagai teks, mengisi baris bawaan konfigurasi, dan mengisi `SPREADSHEET_ID` otomatis.

## 4. Script Properties

**Project Settings › Script Properties › Add script property**:

| Property | Wajib | Isi |
|---|---|---|
| `API_SHARED_SECRET` | Ya | String acak ≥ 32 karakter, misalnya hasil `openssl rand -hex 32`. Nilai yang sama diisi ke `APPS_SCRIPT_API_KEY` di Vercel. |
| `SPREADSHEET_ID` | Ya (otomatis untuk skrip terikat) | ID spreadsheet dari URL `https://docs.google.com/spreadsheets/d/<ID>/edit`. Wajib diisi manual bila memakai skrip standalone. |
| `ADMIN_EMAILS` | Opsional | Email admin lain yang boleh memakai menu LVM Admin, dipisah koma. Tanpa ini hanya pemilik spreadsheet. |

Properti sistem yang diisi otomatis (jangan diubah manual): `DATA_VERSION`, `CONFIG_VERSION`, `LAST_IMPORT_AT`.

**Cara paling mudah mengisi `API_SHARED_SECRET`:** menu **LVM Admin › Atur API_SHARED_SECRET…**, tempel secret di kotak dialog, **OK**. Nilai divalidasi (minimal 32 karakter, ASCII tanpa spasi) dan tidak dicatat di log. Tidak perlu deploy ulang Apps Script.

Jalankan **LVM Admin › 2. Periksa konfigurasi & header** untuk memastikan semuanya terisi (baris `API_SHARED_SECRET: terisi (N karakter)`).

## 5. Deploy sebagai Web App

1. Editor Apps Script › **Deploy › New deployment** › ikon roda gigi › **Web app**.
2. Description: mis. `v1`.
3. **Execute as: Me** (pemilik).
4. **Who has access: Anyone** (diperlukan agar server Vercel bisa memanggil tanpa login Google; perlindungan dari API key + token sesi).
5. **Deploy** → salin **Web app URL** (berakhiran `/exec`). Ini nilai `APPS_SCRIPT_URL` di Vercel.

Tes cepat: buka URL `/exec` di browser → `{"ok":true,"data":{"service":"lvm-merchant-api",...,"status":"up"}}`.

### Memperbarui kode

Setelah `npm run gas:push` (atau edit manual): **Deploy › Manage deployments** › pilih deployment › ikon pensil › **Version: New version** › **Deploy**. URL tetap sama. (Tanpa langkah ini, Web App tetap menjalankan versi lama.)

## 6. Isi data awal

1. Akun: lihat [02-google-sheets.md › Users](02-google-sheets.md#users).
2. Data merchant: lihat [05-impor-data.md](05-impor-data.md).
3. Definisi USAK: lihat [04-konfigurasi-usak.md](04-konfigurasi-usak.md).

## 7. Perawatan

- **LVM Admin › Pasang pembersihan sesi harian** — memasang trigger harian yang menghapus sesi kedaluwarsa.
- **LVM Admin › Bersihkan cache aplikasi** — setelah mengedit data/konfigurasi langsung di sheet dan ingin segera terlihat.
- **LVM Admin › Cabut semua sesi** — bila ada dugaan kebocoran; semua pengguna harus login ulang.

## Skrip standalone (alternatif)

Bila ingin memisahkan skrip dari spreadsheet: buat proyek di https://script.google.com, isi `SPREADSHEET_ID` manual, lalu jalankan fungsi `setupSheets` dari editor (menu LVM Admin tidak tersedia; fungsi admin lain dijalankan dari dropdown editor, kecuali dialog kata sandi — gunakan `npm run hash-password`).
