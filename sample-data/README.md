# Data contoh (sintetis)

Semua data di folder ini **dibuat acak** oleh `npm run sample-data` (`scripts/generate-sample-data.mjs`). Nama, nomor rekening (diawali 9), CIF (diawali 8), alamat, dan angka transaksi tidak berasal dari data nyata.

| File | Isi |
|---|---|
| `merchants.sample.csv` | 303 baris, 41 kolom (tanpa `grading_usak`, seperti data sumber sebenarnya; acuan USAK = `grading_trx`): cabang 0101 (101 merchant, 43 USAK — sesuai contoh perhitungan target), 0102 (80 merchant, 44 USAK, 3 kosong), 0201 (120 merchant valid, 30 USAK, 5 kosong, 3 nilai "N/A") + 2 baris error dan 2 baris peringatan untuk menguji validasi impor |
| `users.sample.csv` | Akun demo dengan `password_hash` |
| `usak_config.sample.csv` | Pemetaan nilai `grading_trx` (`USAK`, `USAK IDEAL`, `USAK OPTIMAL` = USAK; `UREG > 0`, `UREG = 0` = belum USAK), sama dengan bawaan setup Apps Script |

## Akun demo — hanya untuk emulator lokal (`npm run dev:api`)

**Jangan** memuat `users.sample.csv` ke spreadsheet produksi.

| Kode cabang | Kata sandi | user_id | Role | Catatan |
|---|---|---|---|---|
| 0101 | DemoPetugas0101 | U0101 | petugas | data sensitif disamarkan |
| 0101 | DemoSupervisor0101 | U0101S | supervisor | dapat membuka rekening/CIF/saldo (tercatat AuditLog) |
| 0102 | DemoPetugas0102 | U0102 | petugas | cabang sudah mencapai target 50% |
| 0201 | DemoPetugas0201 | U0201 | petugas | ada `grading_trx` kosong & tidak dikenali |
| 0301 | DemoNonaktif0301 | U0301 | petugas | `is_active = FALSE` (login ditolak) |
| 0401 | DemoKosong0401 | U0401 | petugas | cabang tanpa merchant (empty state) |
| AREA-CONTOH-BANDUNG-RAYA | DemoArea1234 | AREA-CONTOH-BANDUNG-RAYA | area | pemantauan 2 cabang (0101, 0102); hanya emulator `npm run dev:api` |
| REG-JABAR | DemoRegion1234 | REG-JABAR | region | pemantauan semua cabang contoh (area + wilayah dibuat otomatis oleh emulator) |

Emulator membaca CSV ini setiap kali dijalankan dan menyimpan perubahan (follow-up, sesi) hanya di memori. Jalankan dengan `EMULATOR_NO_USAK_CONFIG=1 npm run dev:api` untuk melihat tampilan saat definisi USAK belum dikonfigurasi, atau `EMULATOR_LATENCY_MS=1500` untuk meniru lambatnya Apps Script.
