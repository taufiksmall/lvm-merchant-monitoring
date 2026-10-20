#!/usr/bin/env node
/**
 * Membuat kata sandi awal + hash untuk banyak akun cabang sekaligus — sepenuhnya lokal.
 *
 *   npm run passwords:bulk -- users.csv
 *   npm run passwords:bulk -- users.csv --passwords=sandi-admin.csv
 *   npm run passwords:bulk -- users.csv --only=15104,15105 --all --out-dir=akun-awal
 *
 * users.csv  Sheet Users yang diunduh dari Google Sheets (File > Download > CSV). Kolom wajib:
 *            user_id, kode_cabang, nama_cabang, password_hash, is_active.
 * --passwords  CSV (header kode_cabang,password) berisi kata sandi yang DITENTUKAN administrator.
 *              Tanpa opsi ini, kata sandi acak dibuat untuk tiap akun.
 * --pattern    Kata sandi berpola, mis. --pattern='Mdna{kode}#' ({kode} = kode_cabang). Peringatan: kata sandi yang bisa
 *              diturunkan dari kode cabang dapat ditebak siapa pun yang tahu kode itu.
 * --only       Daftar kode_cabang yang diproses (dipisah koma).
 * --all        Proses juga akun yang sudah punya password_hash (reset massal). Bawaan: hanya yang kosong.
 * --length=N   Panjang kata sandi acak (bawaan 12, minimal 10).
 * --out-dir    Folder hasil (bawaan: akun-awal). Sudah ada di .gitignore.
 *
 * Hasil:
 *   hash-untuk-import.tsv   user_id<TAB>password_hash<TAB>is_active -> SALIN SEMUA & tempel di sel A2 sheet Import_Users
 *                           (Google Sheets membagi kolom pada tab, bukan koma)
 *   hash-untuk-import.csv   isi yang sama dalam format CSV (untuk File > Impor)
 *   kata-sandi-awal.csv     kode_cabang,nama_cabang,user_id,kata_sandi -> SENSITIF, distribusikan lalu hapus
 *
 * Kata sandi tidak pernah dicetak ke layar, tidak disimpan di spreadsheet, dan tidak dikirim ke jaringan.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv } from './lib/csv.mjs';
import { DEFAULT_ITERATIONS, hashPassword, passwordPolicyProblem } from './lib/password-hash.mjs';

// Tanpa karakter yang mudah tertukar (0/O, 1/l/I) agar nyaman diketik petugas.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';

export function randomPassword(length = 12) {
  if (!Number.isInteger(length) || length < 10 || length > 64) throw new Error('--length harus 10 - 64.');
  const alphabet = LETTERS + DIGITS;
  for (;;) {
    let pw = '';
    for (let i = 0; i < length; i++) pw += alphabet[crypto.randomInt(alphabet.length)];
    // Kebijakan: memuat huruf dan angka.
    if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) return pw;
  }
}

function parseArgs(argv) {
  const opts = { file: '', pattern: '', passwords: '', only: null, all: false, length: 12, outDir: 'akun-awal' };
  for (const a of argv) {
    if (a === '--all') opts.all = true;
    else if (a.startsWith('--passwords=')) opts.passwords = a.slice(12);
    else if (a.startsWith('--pattern=')) opts.pattern = a.slice(10);
    else if (a.startsWith('--only=')) opts.only = new Set(a.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
    else if (a.startsWith('--length=')) opts.length = Number(a.slice(9));
    else if (a.startsWith('--out-dir=')) opts.outDir = a.slice(10);
    else if (a.startsWith('--')) throw new Error(`Opsi tidak dikenal: ${a}`);
    else if (!opts.file) opts.file = a;
    else throw new Error(`Argumen berlebih: ${a}`);
  }
  if (opts.pattern && opts.passwords) throw new Error('Pilih salah satu: --pattern atau --passwords.');
  if (opts.pattern && !opts.pattern.includes('{kode}')) throw new Error('--pattern harus memuat {kode}.');
  if (!opts.file) throw new Error('Pemakaian: npm run passwords:bulk -- users.csv [--passwords=file.csv] [--only=kode,kode] [--all] [--length=12] [--out-dir=akun-awal]');
  return opts;
}

export function run(argv) {
  const opts = parseArgs(argv);
  const table = parseCsv(fs.readFileSync(path.resolve(opts.file), 'utf8'));
  if (table.length < 2) throw new Error('users.csv tidak berisi akun. Jalankan "Buat akun untuk semua cabang" di spreadsheet dulu.');
  const header = table[0].map((h) => h.trim());
  const col = Object.fromEntries(['user_id', 'kode_cabang', 'nama_cabang', 'password_hash', 'is_active'].map((c) => [c, header.indexOf(c)]));
  const missing = Object.keys(col).filter((c) => col[c] < 0);
  if (missing.length) throw new Error(`Kolom tidak ditemukan di users.csv: ${missing.join(', ')}`);

  let chosen = null;
  if (opts.passwords) {
    const pt = parseCsv(fs.readFileSync(path.resolve(opts.passwords), 'utf8'));
    const ph = (pt[0] || []).map((h) => h.trim());
    const kc = ph.indexOf('kode_cabang'), pc = ph.indexOf('password');
    if (kc < 0 || pc < 0) throw new Error('File --passwords harus berheader kode_cabang,password.');
    chosen = new Map(pt.slice(1).filter((r) => r[kc]).map((r) => [r[kc].trim(), r[pc] ?? '']));
  }

  const hashRows = [], passRows = [];
  let skippedHas = 0, skippedOnly = 0, noPassword = [], weak = [];
  const seenUsers = new Set();
  for (const r of table.slice(1)) {
    const userId = (r[col.user_id] || '').trim();
    if (!userId) continue;
    const kode = (r[col.kode_cabang] || '').trim();
    if (opts.only && !opts.only.has(kode)) { skippedOnly++; continue; }
    if (!opts.all && (r[col.password_hash] || '').trim()) { skippedHas++; continue; }
    if (seenUsers.has(userId)) throw new Error(`user_id ganda di users.csv: ${userId}`);
    seenUsers.add(userId);

    let password;
    if (opts.pattern) {
      password = opts.pattern.split('{kode}').join(kode);
      if (passwordPolicyProblem(password)) { weak.push(kode); continue; }
    } else if (chosen) {
      if (!chosen.has(kode)) { noPassword.push(kode); continue; }
      password = chosen.get(kode);
      if (passwordPolicyProblem(password)) { weak.push(kode); continue; }
    } else {
      password = randomPassword(opts.length);
    }
    hashRows.push([userId, hashPassword(password, DEFAULT_ITERATIONS), 'TRUE']);
    passRows.push([kode, r[col.nama_cabang] || '', userId, password]);
  }
  if (weak.length) {
    throw new Error(`Kata sandi tidak memenuhi kebijakan (minimal 10 karakter, memuat huruf dan angka) untuk cabang: ${weak.slice(0, 10).join(', ')}${weak.length > 10 ? ', …' : ''}`);
  }
  if (!hashRows.length) throw new Error('Tidak ada akun yang diproses (semua sudah punya hash, tidak cocok dengan --only, atau tidak ada kata sandi di --passwords).');

  const outDir = path.resolve(opts.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const hashFile = path.join(outDir, 'hash-untuk-import.tsv');
  const hashCsvFile = path.join(outDir, 'hash-untuk-import.csv');
  const passFile = path.join(outDir, 'kata-sandi-awal.csv');
  fs.writeFileSync(hashFile, hashRows.map((r) => r.join('\t')).join('\n') + '\n');
  fs.writeFileSync(hashCsvFile, hashRows.map((r) => r.join(',')).join('\n') + '\n');
  fs.writeFileSync(passFile, toCsv(['kode_cabang', 'nama_cabang', 'user_id', 'kata_sandi'], passRows), { mode: 0o600 });
  try { fs.chmodSync(passFile, 0o600); } catch { /* sistem berkas tanpa izin (mis. exFAT) */ }

  return { count: hashRows.length, skippedHas, skippedOnly, noPassword, hashFile, passFile, mode: opts.pattern ? 'berpola' : chosen ? 'ditentukan admin' : 'acak' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const res = run(process.argv.slice(2));
    console.log(`${res.count} akun diproses (kata sandi ${res.mode}).`);
    if (res.skippedHas) console.log(`${res.skippedHas} akun dilewati karena sudah punya password_hash (pakai --all untuk reset).`);
    if (res.skippedOnly) console.log(`${res.skippedOnly} akun dilewati oleh --only.`);
    if (res.noPassword.length) console.log(`${res.noPassword.length} cabang tidak ada di file --passwords: ${res.noPassword.slice(0, 10).join(', ')}`);
    console.log(`\n1. Salin seluruh isi ${path.relative(process.cwd(), res.hashFile)} (tanpa header) dan tempel di sel A2 sheet Import_Users,`);
    console.log('   lalu jalankan LVM Admin > Terapkan hash dari Import_Users.');
    console.log(`2. ${path.relative(process.cwd(), res.passFile)} berisi kata sandi awal (TEKS BIASA). Distribusikan lewat saluran aman,`);
    console.log('   lalu HAPUS file itu dan kosongkan sampah/riwayat. Jangan di-commit atau diunggah ke spreadsheet.');
  } catch (e) {
    console.error('Gagal: ' + e.message);
    process.exit(1);
  }
}
