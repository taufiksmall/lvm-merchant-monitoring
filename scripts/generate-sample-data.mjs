#!/usr/bin/env node
/**
 * Membuat data contoh SINTETIS untuk pengembangan lokal (tanpa data pribadi nyata).
 *
 *   node scripts/generate-sample-data.mjs
 *
 * Menghasilkan file di sample-data/:
 *   merchants.sample.csv   - 42 kolom sesuai header sheet Merchants (termasuk beberapa baris
 *                            bermasalah untuk menguji validasi impor)
 *   users.sample.csv       - akun demo dengan password_hash (kata sandi demo ada di sample-data/README.md)
 *   usak_config.sample.csv - CONTOH pemetaan grading_usak untuk data sintetis ini saja
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './lib/password-hash.mjs';
import { toCsv } from './lib/csv.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'sample-data');

const MERCHANT_COLUMNS = [
  'store_id', 'store_name', 'account_number', 'owner_name', 'createddate', 'referal_code',
  'kode_pos', 'address', 'kecamatan', 'kabupaten', 'provinsi', 'mcc_code', 'lob_lm',
  'kode_cabang_final', 'nama_cabang_final', 'nama_area_final',
  'freq_mtd', 'sv_mtd', 'fbi_mtd', 'freq_ytd', 'sv_ytd', 'fbi_ytd', 'freq_30_days', 'sv_30_days',
  'mid_static', 'mid_dynamic', 'flag_card_dongle', 'status_trx', 'grading_trx', 'grading_usak',
  'tipe_akun', 'status_rekening', 'tangging_real_merchant', 'companytype', 'jenis_rekening',
  'cifno', 'cbalrp', 'ybal', 'avgbalrp', 'amtcrc', 'amtdrc', 'Tiering',
];

// PRNG deterministik agar data contoh stabil di setiap pembuatan ulang.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261020);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const digits = (n) => Array.from({ length: n }, () => int(0, 9)).join('');
const pad = (n, w) => String(n).padStart(w, '0');

const PREFIX = ['Toko', 'Warung', 'Kedai', 'Apotek', 'Bengkel', 'Laundry', 'Konter', 'Kios', 'Depot', 'Rumah Makan', 'Salon', 'Toko Kue'];
const NAMES = ['Berkah', 'Sumber Rejeki', 'Maju Jaya', 'Sinar Abadi', 'Barokah', 'Sejahtera', 'Makmur', 'Lancar', 'Sentosa',
  'Harapan', 'Cahaya', 'Mulia', 'Bahagia', 'Amanah', 'Sehati', 'Pelangi', 'Melati', 'Kenanga', 'Mawar', 'Anggrek'];
const FIRST = ['Adi', 'Bayu', 'Citra', 'Dewi', 'Eka', 'Fajar', 'Gita', 'Hadi', 'Indah', 'Joko', 'Kartika', 'Lina', 'Maya',
  'Nanda', 'Oki', 'Putri', 'Rina', 'Sari', 'Tono', 'Umi', 'Wahyu', 'Yanti'];
const LAST = ['Pratama', 'Saputra', 'Lestari', 'Wijaya', 'Kurniawan', 'Hidayat', 'Permata', 'Nugraha', 'Utami', 'Setiawan',
  'Rahayu', 'Gunawan', 'Anggraini', 'Firmansyah'];
const STREETS = ['Jl. Melati', 'Jl. Kenanga', 'Jl. Flamboyan', 'Jl. Cempaka', 'Jl. Dahlia', 'Jl. Teratai', 'Jl. Nusa Indah', 'Gg. Mawar'];
const MCC = [['5411', 'RITEL'], ['5499', 'RITEL'], ['5812', 'KULINER'], ['5814', 'KULINER'], ['5912', 'KESEHATAN'], ['7538', 'JASA'], ['7210', 'JASA'], ['5732', 'ELEKTRONIK']];

const BRANCHES = [
  { kode: '0101', nama: 'KC Contoh Bandung', area: 'Area Contoh Bandung Raya', kab: 'Kota Bandung', kec: ['Coblong', 'Sukajadi', 'Lengkong', 'Antapani'], pos: '401', usak: 43, belum: 58, kosong: 0, unknown: 0 },
  { kode: '0102', nama: 'KC Contoh Cimahi', area: 'Area Contoh Bandung Raya', kab: 'Kota Cimahi', kec: ['Cimahi Utara', 'Cimahi Tengah', 'Cimahi Selatan'], pos: '405', usak: 44, belum: 33, kosong: 3, unknown: 0 },
  { kode: '0201', nama: 'KC Contoh Garut', area: 'Area Contoh Priangan Timur', kab: 'Kabupaten Garut', kec: ['Garut Kota', 'Tarogong Kidul', 'Karangpawitan'], pos: '441', usak: 30, belum: 82, kosong: 5, unknown: 3 },
];

function merchantRow(branch, seq, grading) {
  const isUsak = grading === 'USAK';
  const [mcc, lob] = pick(MCC);
  const active = isUsak ? rand() < 0.95 : rand() < 0.7;
  const freqMtd = active ? (isUsak ? int(40, 320) : int(0, 90)) : 0;
  const ticket = int(15, 180) * 1000;
  const svMtd = freqMtd * ticket;
  const fbiMtd = Math.round(svMtd * 0.003);
  const months = 10;
  const freqYtd = freqMtd * months + int(0, 200);
  const svYtd = freqYtd * ticket;
  const freq30 = active ? Math.max(0, freqMtd + int(-15, 25)) : (rand() < 0.5 ? 0 : int(1, 5));
  const createdYear = int(2021, 2026);
  const created = `${createdYear}-${pad(int(1, createdYear === 2026 ? 9 : 12), 2)}-${pad(int(1, 28), 2)}`;
  const cbal = int(0, 90000) * 1000;
  const companytype = pick(['PERORANGAN', 'PERORANGAN', 'PERORANGAN', 'CV', 'PT']);
  return {
    store_id: `S${branch.kode}${pad(seq, 4)}`,
    store_name: `${pick(PREFIX)} ${pick(NAMES)} ${seq}`,
    account_number: '9' + digits(12),
    owner_name: `${pick(FIRST)} ${pick(LAST)}`,
    createddate: rand() < 0.15 ? created.split('-').reverse().join('/') : created,
    referal_code: rand() < 0.6 ? 'REF' + digits(4) : '',
    kode_pos: branch.pos + digits(2),
    address: `${pick(STREETS)} No. ${int(1, 250)}`,
    kecamatan: pick(branch.kec),
    kabupaten: branch.kab,
    provinsi: 'Jawa Barat',
    mcc_code: mcc,
    lob_lm: lob,
    kode_cabang_final: branch.kode,
    nama_cabang_final: branch.nama,
    nama_area_final: branch.area,
    freq_mtd: freqMtd,
    sv_mtd: svMtd,
    fbi_mtd: fbiMtd,
    freq_ytd: freqYtd,
    sv_ytd: svYtd,
    fbi_ytd: Math.round(svYtd * 0.003),
    freq_30_days: freq30,
    sv_30_days: freq30 * ticket,
    mid_static: 'MS' + digits(10),
    mid_dynamic: rand() < 0.5 ? 'MD' + digits(10) : '',
    flag_card_dongle: rand() < 0.25 ? 'Y' : 'N',
    status_trx: freq30 > 0 ? 'AKTIF' : (freqYtd > 0 ? 'PASIF' : 'TIDAK AKTIF'),
    grading_trx: freqMtd >= 150 ? 'A' : freqMtd >= 60 ? 'B' : freqMtd > 0 ? 'C' : 'D',
    grading_usak: grading,
    tipe_akun: companytype === 'PERORANGAN' ? 'INDIVIDU' : 'BADAN USAHA',
    status_rekening: rand() < 0.9 ? 'AKTIF' : 'DORMANT',
    tangging_real_merchant: rand() < 0.85 ? 'REAL' : 'NON REAL',
    companytype,
    jenis_rekening: companytype === 'PERORANGAN' ? 'TABUNGAN' : pick(['TABUNGAN', 'GIRO']),
    cifno: '8' + digits(8),
    cbalrp: cbal,
    ybal: Math.round(cbal * (0.6 + rand())),
    avgbalrp: Math.round(cbal * (0.5 + rand() * 0.8)),
    amtcrc: svMtd + int(0, 5000) * 1000,
    amtdrc: Math.round(svMtd * (0.4 + rand() * 0.5)),
    Tiering: freqMtd >= 150 ? 'Tier 1' : freqMtd >= 40 ? 'Tier 2' : 'Tier 3',
  };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const rows = [];
for (const b of BRANCHES) {
  const gradings = shuffle([
    ...Array(b.usak).fill('USAK'),
    ...Array(b.belum).fill('NON USAK'),
    ...Array(b.kosong).fill(''),
    ...Array(b.unknown).fill('N/A'),
  ]);
  gradings.forEach((g, i) => rows.push(merchantRow(b, i + 1, g)));
}

// Baris bermasalah untuk menguji validasi impor (cabang 0201, tidak mengubah jumlah merchant valid).
const garut = BRANCHES[2];
const broken1 = merchantRow(garut, 9001, 'NON USAK');
broken1.store_name = ''; // ERROR: wajib diisi -> baris dilewati
const broken2 = merchantRow(garut, 9002, 'USAK');
broken2.store_id = rows.find((r) => r.kode_cabang_final === '0201').store_id; // ERROR: store_id ganda
const warn1 = rows.find((r) => r.kode_cabang_final === '0201' && r.grading_usak === 'NON USAK');
warn1.sv_ytd = '12,3,4'; // PERINGATAN: angka tidak valid
const warn2 = rows.filter((r) => r.kode_cabang_final === '0201')[5];
warn2.createddate = '31/02/2024'; // PERINGATAN: tanggal tidak valid
rows.push(broken1, broken2);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'merchants.sample.csv'), toCsv(MERCHANT_COLUMNS, rows.map((r) => MERCHANT_COLUMNS.map((c) => r[c]))));

// Akun demo. Kata sandi HANYA untuk emulator lokal; jangan dipakai di spreadsheet produksi.
const DEMO_USERS = [
  ['U0101', '0101', 'KC Contoh Bandung', 'petugas', 'TRUE', 'DemoPetugas0101'],
  ['U0101S', '0101', 'KC Contoh Bandung', 'supervisor', 'TRUE', 'DemoSupervisor0101'],
  ['U0102', '0102', 'KC Contoh Cimahi', 'petugas', 'TRUE', 'DemoPetugas0102'],
  ['U0201', '0201', 'KC Contoh Garut', 'petugas', 'TRUE', 'DemoPetugas0201'],
  ['U0301', '0301', 'KC Contoh Tasikmalaya', 'petugas', 'FALSE', 'DemoNonaktif0301'],
  ['U0401', '0401', 'KC Contoh Sumedang', 'petugas', 'TRUE', 'DemoKosong0401'],
];
const userRows = DEMO_USERS.map(([id, kode, nama, role, active, pw]) => [id, kode, nama, hashPassword(pw, 100000), role, active]);
fs.writeFileSync(path.join(outDir, 'users.sample.csv'),
  toCsv(['user_id', 'kode_cabang', 'nama_cabang', 'password_hash', 'role', 'is_active'], userRows));

fs.writeFileSync(path.join(outDir, 'usak_config.sample.csv'), toCsv(['nilai_grading_usak', 'kategori', 'keterangan'], [
  ['USAK', 'USAK', 'CONTOH untuk data sintetis. Ganti dengan nilai resmi.'],
  ['NON USAK', 'BELUM_USAK', 'CONTOH untuk data sintetis. Ganti dengan nilai resmi.'],
]));

const count = (kode) => rows.filter((r) => r.kode_cabang_final === kode).length;
console.log(`merchants.sample.csv: ${rows.length} baris (${BRANCHES.map((b) => `${b.kode}=${count(b.kode)}`).join(', ')})`);
console.log(`users.sample.csv: ${userRows.length} akun demo`);
console.log('usak_config.sample.csv: 2 baris contoh');
