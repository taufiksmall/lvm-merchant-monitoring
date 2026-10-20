/**
 * Alat akun massal: menu Apps Script (buat akun cabang, terapkan hash) dan skrip lokal
 * scripts/bulk-passwords.mjs. Dijalankan lewat `npm test`.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSeededRuntime, DEV_FALLBACK_SECRET } from '../dev/gas-emulator/seed.mjs';
import { verifyPassword } from '../scripts/lib/password-hash.mjs';
import { parseCsv } from '../scripts/lib/csv.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts', 'bulk-passwords.mjs');
const KEY = DEV_FALLBACK_SECRET;

function sheetRows(rt, name) {
  const [header, ...rows] = rt.spreadsheet.getSheetByName(name)._dump();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/** Runtime dengan Users hanya berisi akun cabang 0101 sehingga cabang lain perlu dibuatkan akun. */
function setupWithOnly0101() {
  const { rt } = createSeededRuntime({ quiet: true });
  const sheet = rt.spreadsheet.getSheetByName('Users');
  const rows = sheetRows(rt, 'Users');
  const keep = rows.filter((u) => u.kode_cabang === '0101');
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  keep.forEach((u, i) => header.forEach((h, c) => sheet._setRaw(2 + i, c + 1, u[h])));
  return rt;
}

describe('Apps Script: akun massal', () => {
  test('membuat akun nonaktif untuk cabang yang belum punya akun, idempoten', () => {
    const rt = setupWithOnly0101();
    const lines = rt.run('createBranchAccounts_');
    assert.match(lines[0], /^2 akun cabang dibuat/);
    const users = sheetRows(rt, 'Users');
    const added = users.filter((u) => u.kode_cabang !== '0101');
    assert.deepEqual(added.map((u) => u.user_id).sort(), ['U0102', 'U0201']);
    for (const u of added) {
      assert.equal(u.role, 'petugas');
      assert.equal(u.password_hash, '');
      assert.ok(u.is_active === false || String(u.is_active).toUpperCase() === 'FALSE');
      assert.ok(u.nama_cabang.startsWith('KC Contoh'));
    }
    assert.match(rt.run('createBranchAccounts_')[0], /^0 akun cabang dibuat/); // idempoten
    assert.equal(sheetRows(rt, 'Users').length, users.length);
  });

  test('akun nonaktif tanpa hash tidak bisa login', () => {
    const rt = setupWithOnly0101();
    rt.run('createBranchAccounts_');
    const r = rt.request({ action: 'auth.login', api_key: KEY, payload: { kode_cabang: '0102', password: 'ApaSaja12345' } });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'INVALID_CREDENTIALS');
  });

  test('user_id yang bentrok diberi sufiks', () => {
    const rt = setupWithOnly0101();
    rt.spreadsheet.getSheetByName('Users').appendRow(['U0102', '9999', 'Cabang Lain', '', 'petugas', 'TRUE']);
    rt.run('createBranchAccounts_');
    const ids = sheetRows(rt, 'Users').filter((u) => u.kode_cabang === '0102').map((u) => u.user_id);
    assert.deepEqual(ids, ['U0102-2']);
  });

  test('kode cabang yang tidak valid untuk login dilewati dan dilaporkan', () => {
    const rt = setupWithOnly0101();
    const m = rt.spreadsheet.getSheetByName('Merchants');
    const header = m.getRange(1, 1, 1, m.getLastColumn()).getValues()[0];
    m._setRaw(2, header.indexOf('kode_cabang_final') + 1, 'AB CD/9');
    const lines = rt.run('createBranchAccounts_').join('\n');
    assert.match(lines, /1 kode cabang dilewati/);
    assert.match(lines, /AB CD\/9/);
  });

  test('menerapkan hash dari Import_Users: validasi, aktivasi, pencabutan sesi, pengosongan', () => {
    const rt = setupWithOnly0101();
    rt.run('createBranchAccounts_');
    const ctx = rt.context;
    const h0102 = ctx.hashPassword_('AwalCabang0102', 20000);
    const imp = rt.spreadsheet.getSheetByName('Import_Users');
    imp.getRange(2, 1, 5, 3).setValues([
      ['U0102', h0102, 'TRUE'],
      ['U0201', 'bukan-hash', 'TRUE'], // format salah -> dilewati
      ['U9999', h0102, 'TRUE'], // tidak ada -> dilaporkan
      ['U0102', h0102, 'TRUE'], // ganda
      ['', '', ''],
    ]);
    const lines = rt.run('applyUserHashImport_').join('\n');
    assert.match(lines, /1 akun diperbarui/);
    assert.match(lines, /1 user_id tidak ada/);
    assert.match(lines, /1 hash tidak valid/);
    assert.match(lines, /1 baris ganda/);
    const users = sheetRows(rt, 'Users');
    const u0102 = users.find((u) => u.user_id === 'U0102');
    assert.equal(u0102.password_hash, h0102);
    assert.ok(u0102.is_active === true || String(u0102.is_active).toUpperCase() === 'TRUE');
    assert.equal(users.find((u) => u.user_id === 'U0201').password_hash, ''); // tak berubah
    assert.equal(imp.getLastRow(), 1, 'Import_Users dikosongkan');

    // login berhasil dengan kata sandi yang di-hash
    const ok = rt.request({ action: 'auth.login', api_key: KEY, payload: { kode_cabang: '0102', password: 'AwalCabang0102' } });
    assert.equal(ok.ok, true);
    const log = JSON.stringify(rt.spreadsheet.getSheetByName('AuditLog')._dump());
    assert.ok(log.includes('ADMIN_IMPORT_PASSWORD_HASH'));
    assert.ok(!log.includes('AwalCabang0102') && !log.includes(h0102));
  });

  test('menerapkan hash mencabut sesi lama pengguna', () => {
    const rt = setupWithOnly0101();
    const login = rt.request({ action: 'auth.login', api_key: KEY, payload: { kode_cabang: '0101', password: 'DemoPetugas0101' } });
    assert.equal(login.ok, true);
    const token = login.data.token;
    assert.equal(rt.request({ action: 'auth.me', api_key: KEY, token }).ok, true);
    const imp = rt.spreadsheet.getSheetByName('Import_Users');
    imp.getRange(2, 1, 1, 3).setValues([['U0101', rt.context.hashPassword_('PasswordBaru12345', 20000), 'TRUE']]);
    rt.run('applyUserHashImport_');
    assert.equal(rt.request({ action: 'auth.me', api_key: KEY, token }).error.code, 'UNAUTHENTICATED');
  });
});

describe('skrip lokal passwords:bulk', () => {
  const usersCsv = [
    'user_id,kode_cabang,nama_cabang,password_hash,role,is_active',
    'U15104,15104,Luwuk,,petugas,FALSE',
    'U15105,15105,"Palu, Imam Bonjol",,petugas,FALSE',
    'U16283,16283,Baubau Wolio,pbkdf2_sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=,petugas,TRUE',
  ].join('\n') + '\n';

  function withTmp(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-'));
    try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  test('kata sandi acak: hanya akun tanpa hash, hash valid, berkas sandi 0600, tidak dicetak', () => {
    withTmp((dir) => {
      const input = path.join(dir, 'users.csv');
      fs.writeFileSync(input, usersCsv);
      const out = execFileSync(process.execPath, [script, input, `--out-dir=${path.join(dir, 'hasil')}`], { encoding: 'utf8' });
      const passes = parseCsv(fs.readFileSync(path.join(dir, 'hasil', 'kata-sandi-awal.csv'), 'utf8')).slice(1);
      const hashes = parseCsv(fs.readFileSync(path.join(dir, 'hasil', 'hash-untuk-import.csv'), 'utf8'));
      assert.equal(passes.length, 2);
      assert.deepEqual(passes.map((r) => r[2]).sort(), ['U15104', 'U15105']);
      assert.equal(passes.find((r) => r[0] === '15105')[1], 'Palu, Imam Bonjol'); // koma di dalam kutip terjaga
      assert.equal(new Set(passes.map((r) => r[3])).size, 2, 'kata sandi unik');
      for (const [, , userId, pw] of passes) {
        assert.ok(pw.length >= 12 && /[A-Za-z]/.test(pw) && /\d/.test(pw));
        assert.ok(!/[0OIl1]/.test(pw), 'tanpa karakter yang mudah tertukar');
        const row = hashes.find((h) => h[0] === userId);
        assert.ok(row && row[2] === 'TRUE');
        assert.equal(verifyPassword(pw, row[1]), true);
        assert.ok(!out.includes(pw), 'kata sandi tidak boleh tercetak ke layar');
      }
      assert.ok(!hashes.some((h) => h[0] === 'U16283'));
      assert.equal(fs.statSync(path.join(dir, 'hasil', 'kata-sandi-awal.csv')).mode & 0o777, 0o600);
      // versi TSV (tab) untuk ditempel ke Google Sheets berisi data yang sama
      const tsv = fs.readFileSync(path.join(dir, 'hasil', 'hash-untuk-import.tsv'), 'utf8').trim().split('\n').map((l) => l.split('\t'));
      assert.deepEqual(tsv, hashes);
      assert.ok(tsv.every((r) => r.length === 3));
    });
  });

  test('kata sandi ditentukan admin dan opsi --only', () => {
    withTmp((dir) => {
      const input = path.join(dir, 'users.csv');
      fs.writeFileSync(input, usersCsv);
      fs.writeFileSync(path.join(dir, 'sandi.csv'), 'kode_cabang,password\n15104,Luwuk-Awal-2026\n15105,Palu-Awal-2026\n');
      execFileSync(process.execPath, [script, input, `--passwords=${path.join(dir, 'sandi.csv')}`, '--only=15104', `--out-dir=${path.join(dir, 'o')}`], { encoding: 'utf8' });
      const hashes = parseCsv(fs.readFileSync(path.join(dir, 'o', 'hash-untuk-import.csv'), 'utf8'));
      assert.equal(hashes.length, 1);
      assert.equal(hashes[0][0], 'U15104');
      assert.equal(verifyPassword('Luwuk-Awal-2026', hashes[0][1]), true);
    });
  });

  test('--pattern membuat kata sandi berpola per cabang', () => {
    withTmp((dir) => {
      const input = path.join(dir, 'users.csv');
      fs.writeFileSync(input, usersCsv);
      execFileSync(process.execPath, [script, input, '--all', '--pattern=Mdna{kode}#', `--out-dir=${path.join(dir, 'p')}`], { encoding: 'utf8' });
      const hashes = parseCsv(fs.readFileSync(path.join(dir, 'p', 'hash-untuk-import.csv'), 'utf8'));
      assert.equal(hashes.length, 3);
      assert.equal(verifyPassword('Mdna15104#', hashes.find((h) => h[0] === 'U15104')[1]), true);
      assert.equal(verifyPassword('Mdna16283#', hashes.find((h) => h[0] === 'U16283')[1]), true);
      assert.equal(verifyPassword('Mdna15104#', hashes.find((h) => h[0] === 'U15105')[1]), false);
    });
  });

  test('menolak kata sandi lemah tanpa menulis berkas, dan melaporkan --all', () => {
    withTmp((dir) => {
      const input = path.join(dir, 'users.csv');
      fs.writeFileSync(input, usersCsv);
      fs.writeFileSync(path.join(dir, 'lemah.csv'), 'kode_cabang,password\n15104,pendek\n15105,Palu-Awal-2026\n');
      const bad = spawnSync(process.execPath, [script, input, `--passwords=${path.join(dir, 'lemah.csv')}`, `--out-dir=${path.join(dir, 'x')}`], { encoding: 'utf8' });
      assert.notEqual(bad.status, 0);
      assert.match(bad.stderr, /kebijakan.*15104/);
      assert.ok(!bad.stderr.includes('pendek') && !bad.stdout.includes('pendek'));
      assert.equal(fs.existsSync(path.join(dir, 'x')), false);

      execFileSync(process.execPath, [script, input, '--all', `--out-dir=${path.join(dir, 'y')}`], { encoding: 'utf8' });
      const hashes = parseCsv(fs.readFileSync(path.join(dir, 'y', 'hash-untuk-import.csv'), 'utf8'));
      assert.equal(hashes.length, 3);
    });
  });

  test('header users.csv tidak lengkap -> galat jelas', () => {
    withTmp((dir) => {
      const input = path.join(dir, 'users.csv');
      fs.writeFileSync(input, 'user_id,kode_cabang\nU1,1\n');
      const r = spawnSync(process.execPath, [script, input], { encoding: 'utf8' });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /Kolom tidak ditemukan.*nama_cabang.*password_hash.*is_active/);
    });
  });
});
