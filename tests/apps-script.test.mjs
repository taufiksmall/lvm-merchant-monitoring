/**
 * Pengujian backend Apps Script melalui emulator lokal (kode apps-script/src dijalankan apa adanya).
 *   npm test
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRuntime } from '../dev/gas-emulator/runtime.mjs';
import { createSeededRuntime, DEV_FALLBACK_SECRET } from '../dev/gas-emulator/seed.mjs';
import { hashPassword } from '../scripts/lib/password-hash.mjs';

const KEY = DEV_FALLBACK_SECRET;
const PW = {
  petugas0101: 'DemoPetugas0101',
  supervisor0101: 'DemoSupervisor0101',
  petugas0102: 'DemoPetugas0102',
  nonaktif0301: 'DemoNonaktif0301',
  kosong0401: 'DemoKosong0401',
};

function setup(options) {
  const { rt } = createSeededRuntime({ quiet: true, ...options });
  const call = (action, payload, token, apiKey = KEY) => rt.request({ action, api_key: apiKey, token, payload });
  const login = (kode, password) => {
    const r = call('auth.login', { kode_cabang: kode, password });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    return r.data.token;
  };
  return { rt, call, login };
}

function sheetRows(rt, name) {
  const values = rt.spreadsheet.getSheetByName(name)._dump();
  const [header, ...rows] = values;
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

describe('kriptografi', () => {
  const { rt } = setup();
  const c = rt.context;
  test('SHA-256 sesuai Node crypto', () => {
    for (const s of ['', 'abc', 'x'.repeat(64), 'kata sandi ✓']) {
      assert.equal(c.sha256Hex_(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });
  test('hash dari skrip lokal dapat diverifikasi Apps Script, dan sebaliknya', () => {
    const local = hashPassword('Rahasia-12345', 20000);
    assert.equal(c.verifyPassword_('Rahasia-12345', local), true);
    assert.equal(c.verifyPassword_('salah', local), false);
    const gas = c.hashPassword_('Rahasia-12345', 20000);
    const [, iter, salt, hash] = gas.split('$');
    const recomputed = crypto.pbkdf2Sync('Rahasia-12345', Buffer.from(salt, 'base64'), Number(iter), 32, 'sha256').toString('base64');
    assert.equal(recomputed, hash);
  });
  test('format hash tidak valid ditolak', () => {
    assert.equal(c.verifyPassword_('x', 'plaintext'), false);
    assert.equal(c.verifyPassword_('x', 'pbkdf2_sha256$1$AAAA$BBBB'), false);
  });
});

describe('autentikasi', () => {
  test('login berhasil tidak membocorkan hash atau data sensitif', () => {
    const { call } = setup();
    const r = call('auth.login', { kode_cabang: '0101', password: PW.petugas0101 });
    assert.equal(r.ok, true);
    assert.match(r.data.token, /^[a-f0-9]{64}$/);
    assert.equal(r.data.user.kode_cabang, '0101');
    const text = JSON.stringify(r);
    assert.ok(!text.includes('password_hash'));
    assert.ok(!text.includes('pbkdf2'));
  });

  test('kata sandi salah dan kode tidak dikenal memberi pesan yang sama', () => {
    const { call } = setup();
    const a = call('auth.login', { kode_cabang: '0101', password: 'salah-sekali-1' });
    const b = call('auth.login', { kode_cabang: '9999', password: 'salah-sekali-1' });
    assert.equal(a.error.code, 'INVALID_CREDENTIALS');
    assert.equal(b.error.code, 'INVALID_CREDENTIALS');
    assert.equal(a.error.message, b.error.message);
  });

  test('validasi input login', () => {
    const { call } = setup();
    const r = call('auth.login', { kode_cabang: '', password: '' });
    assert.equal(r.error.code, 'VALIDATION_ERROR');
    assert.ok(r.error.details.fields.kode_cabang);
    assert.ok(r.error.details.fields.password);
    assert.equal(call('auth.login', { kode_cabang: "0101' OR 1=1", password: 'x' }).error.code, 'VALIDATION_ERROR');
  });

  test('login dikunci sementara setelah 5 kali gagal', () => {
    const { call } = setup();
    for (let i = 0; i < 5; i++) assert.equal(call('auth.login', { kode_cabang: '0102', password: 'salah-' + i }).error.code, 'INVALID_CREDENTIALS');
    const locked = call('auth.login', { kode_cabang: '0102', password: PW.petugas0102 });
    assert.equal(locked.error.code, 'RATE_LIMITED');
  });

  test('akun nonaktif tidak dapat login', () => {
    const { call } = setup();
    assert.equal(call('auth.login', { kode_cabang: '0301', password: PW.nonaktif0301 }).error.code, 'ACCOUNT_INACTIVE');
  });

  test('api_key salah atau kosong ditolak', () => {
    const { call } = setup();
    assert.equal(call('auth.login', { kode_cabang: '0101', password: PW.petugas0101 }, undefined, 'salah').error.code, 'UNAUTHORIZED_CLIENT');
    assert.equal(call('auth.login', { kode_cabang: '0101', password: PW.petugas0101 }, undefined, null).error.code, 'UNAUTHORIZED_CLIENT');
  });

  test('API_SHARED_SECRET belum diatur -> semua request ditolak', () => {
    const { rt, call } = setup();
    rt.props.deleteProperty('API_SHARED_SECRET');
    assert.equal(call('auth.login', { kode_cabang: '0101', password: PW.petugas0101 }).error.code, 'CONFIG_ERROR');
  });

  test('setiap endpoint data mewajibkan token sesi yang valid', () => {
    const { call } = setup();
    for (const action of ['auth.me', 'auth.logout', 'dashboard.summary', 'merchants.list', 'merchants.filterOptions',
      'merchants.detail', 'merchants.revealSensitive', 'followups.list', 'followups.create', 'followups.update']) {
      assert.equal(call(action, { store_id: 'S01010001' }).error.code, 'UNAUTHENTICATED', action);
      assert.equal(call(action, { store_id: 'S01010001' }, 'a'.repeat(64)).error.code, 'UNAUTHENTICATED', action);
    }
  });

  test('aksi tidak dikenal ditolak (tidak ada akses range sembarang)', () => {
    const { call, login } = setup();
    const token = login('0101', PW.petugas0101);
    assert.equal(call('sheets.read', { range: 'Users!A1:F10' }, token).error.code, 'UNKNOWN_ACTION');
  });

  test('logout membuat token tidak berlaku', () => {
    const { call, login, rt } = setup();
    const token = login('0101', PW.petugas0101);
    assert.equal(call('auth.me', {}, token).ok, true);
    assert.equal(call('auth.logout', {}, token).ok, true);
    assert.equal(call('auth.me', {}, token).error.code, 'UNAUTHENTICATED');
    rt.clearCache();
    assert.equal(call('auth.me', {}, token).error.code, 'UNAUTHENTICATED');
  });

  test('sesi kedaluwarsa setelah SESSION_TTL_HOURS', () => {
    const { call, login, rt } = setup();
    const token = login('0101', PW.petugas0101);
    rt.advance(8 * 3600 * 1000 + 1000);
    assert.equal(call('auth.me', {}, token).error.code, 'SESSION_EXPIRED');
  });

  test('akun yang dinonaktifkan atau diganti kata sandinya kehilangan sesi', () => {
    const { call, login, rt } = setup();
    const t1 = login('0101', PW.petugas0101);
    const t2 = login('0101', PW.supervisor0101);
    const users = rt.spreadsheet.getSheetByName('Users');
    const rows = sheetRows(rt, 'Users');
    const r1 = rows.findIndex((u) => u.user_id === 'U0101') + 2;
    const r2 = rows.findIndex((u) => u.user_id === 'U0101S') + 2;
    users.getRange(r1, 6).setValue('FALSE');
    users.getRange(r2, 4).setValue(hashPassword('PasswordBaru123', 20000));
    rt.clearCache(); // meniru cache sesi 5 menit habis
    assert.equal(call('auth.me', {}, t1).error.code, 'UNAUTHENTICATED');
    assert.equal(call('auth.me', {}, t2).error.code, 'UNAUTHENTICATED');
  });

  test('sheet Sessions hanya menyimpan hash token', () => {
    const { login, rt } = setup();
    const token = login('0101', PW.petugas0101);
    const dump = JSON.stringify(rt.spreadsheet.getSheetByName('Sessions')._dump());
    assert.ok(!dump.includes(token));
    assert.ok(dump.includes(rt.context.sha256Hex_(token)));
  });
});

describe('dashboard', () => {
  test('rumus USAK sesuai contoh: 101 merchant, 43 USAK -> target 51, gap 8', () => {
    const { call, login } = setup();
    const r = call('dashboard.summary', {}, login('0101', PW.petugas0101));
    assert.equal(r.ok, true);
    const u = r.data.usak;
    assert.equal(u.total_merchant, 101);
    assert.equal(u.merchant_usak, 43);
    assert.equal(u.target_usak_50, 51);
    assert.equal(u.gap_usak_50, 8);
    assert.equal(Math.round(u.rasio_usak * 10) / 10, 42.6);
    assert.equal(u.tercapai, false);
    assert.equal(u.configured, true);
  });

  test('cabang yang sudah mencapai target: gap 0', () => {
    const { call, login } = setup();
    const u = call('dashboard.summary', {}, login('0102', PW.petugas0102)).data.usak;
    assert.equal(u.total_merchant, 80);
    assert.equal(u.merchant_usak, 44);
    assert.equal(u.gap_usak_50, 0);
    assert.equal(u.tercapai, true);
    assert.equal(u.merchant_kosong, 3);
  });

  test('nilai kosong/tidak dikenali tidak dihitung USAK dan memunculkan peringatan', () => {
    const { call, login, rt } = setup();
    // Login petugas 0201 memakai hash baru agar tidak bergantung pada kata sandi demo.
    const rows = sheetRows(rt, 'Users');
    const idx = rows.findIndex((u) => u.user_id === 'U0201') + 2;
    rt.spreadsheet.getSheetByName('Users').getRange(idx, 4).setValue(hashPassword('Garut12345', 20000));
    const r = call('dashboard.summary', {}, login('0201', 'Garut12345'));
    assert.equal(r.data.usak.total_merchant, 120);
    assert.equal(r.data.usak.merchant_usak, 30);
    assert.equal(r.data.usak.merchant_kosong, 5);
    assert.equal(r.data.usak.merchant_tidak_dikenali, 3);
    assert.ok(r.data.warnings.some((w) => w.code === 'GRADING_USAK_NEEDS_REVIEW'));
  });

  test('cabang tanpa merchant: rasio 0 tanpa pembagian nol', () => {
    const { call, login } = setup();
    const r = call('dashboard.summary', {}, login('0401', PW.kosong0401));
    assert.equal(r.ok, true);
    assert.deepEqual(
      [r.data.usak.total_merchant, r.data.usak.merchant_usak, r.data.usak.rasio_usak, r.data.usak.gap_usak_50, r.data.usak.tercapai],
      [0, 0, 0, 0, false],
    );
  });

  test('UsakConfig kosong -> configured=false, tidak ada yang dihitung USAK', () => {
    const { call, login } = setup({ withUsakConfig: false });
    const r = call('dashboard.summary', {}, login('0101', PW.petugas0101));
    assert.equal(r.data.usak.configured, false);
    assert.equal(r.data.usak.merchant_usak, 0);
    assert.ok(r.data.warnings.some((w) => w.code === 'USAK_NOT_CONFIGURED'));
  });

  test('ringkasan metrik hanya dari cabang sendiri', () => {
    const { call, login, rt } = setup();
    const r = call('dashboard.summary', {}, login('0101', PW.petugas0101));
    const all = sheetRows(rt, 'Merchants').filter((m) => m.kode_cabang_final === '0101');
    const expected = all.reduce((s, m) => s + Number(m.sv_mtd || 0), 0);
    assert.equal(r.data.metrics.sv_mtd.sum, expected);
    assert.equal(r.data.metrics.sv_mtd.count, 101);
  });
});

describe('isolasi cabang & data sensitif', () => {
  let ctx;
  before(() => {
    ctx = setup();
    ctx.t0101 = ctx.login('0101', PW.petugas0101);
    ctx.t0101s = ctx.login('0101', PW.supervisor0101);
  });

  test('daftar hanya berisi merchant cabang sendiri walau payload mencoba cabang lain', () => {
    const r = ctx.call('merchants.list', { page_size: 100, kode_cabang_final: '0102', filters: { kode_cabang_final: ['0102'] } }, ctx.t0101);
    assert.equal(r.ok, true);
    assert.equal(r.data.total, 101);
    assert.ok(r.data.items.every((m) => m.kode_cabang_final === '0101'));
  });

  test('daftar tidak memuat account_number, cifno, atau saldo', () => {
    const r = ctx.call('merchants.list', { page_size: 100 }, ctx.t0101s);
    for (const item of r.data.items) {
      for (const k of ['account_number', 'cifno', 'cbalrp', 'ybal', 'avgbalrp', 'amtcrc', 'amtdrc']) assert.ok(!(k in item), k);
    }
  });

  test('detail merchant cabang lain -> NOT_FOUND', () => {
    assert.equal(ctx.call('merchants.detail', { store_id: 'S01020001' }, ctx.t0101).error.code, 'NOT_FOUND');
    assert.equal(ctx.call('followups.list', { store_id: 'S01020001' }, ctx.t0101).error.code, 'NOT_FOUND');
    assert.equal(ctx.call('followups.create', { store_id: 'S01020001', status_follow_up: 'DIJADWALKAN' }, ctx.t0101).error.code, 'NOT_FOUND');
    assert.equal(ctx.call('merchants.revealSensitive', { store_id: 'S01020001' }, ctx.t0101s).error.code, 'NOT_FOUND');
  });

  test('detail menyamarkan nomor rekening & CIF dan tidak mengirim saldo', () => {
    const r = ctx.call('merchants.detail', { store_id: 'S01010001' }, ctx.t0101);
    assert.equal(r.ok, true);
    assert.match(r.data.merchant.account_number, /^•+\d{4}$/);
    assert.match(r.data.merchant.cifno, /^•+\d{4}$/);
    assert.ok(!('cbalrp' in r.data.merchant));
    assert.equal(r.data.can_reveal_identity, false);
  });

  test('reveal: petugas ditolak, supervisor diizinkan & tercatat di AuditLog', () => {
    assert.equal(ctx.call('merchants.revealSensitive', { store_id: 'S01010001', group: 'identity' }, ctx.t0101).error.code, 'FORBIDDEN');
    const r = ctx.call('merchants.revealSensitive', { store_id: 'S01010001', group: 'identity' }, ctx.t0101s);
    assert.equal(r.ok, true);
    assert.match(r.data.values.account_number, /^9\d{12}$/);
    const f = ctx.call('merchants.revealSensitive', { store_id: 'S01010001', group: 'financial' }, ctx.t0101s);
    assert.equal(typeof f.data.values.cbalrp, 'number');
    const audit = sheetRows(ctx.rt, 'AuditLog').filter((a) => String(a.aksi).startsWith('REVEAL_'));
    assert.equal(audit.length, 2);
    assert.ok(!JSON.stringify(audit).includes(r.data.values.account_number));
  });

  test('pencarian nomor rekening hanya untuk role berhak', () => {
    const detail = ctx.call('merchants.revealSensitive', { store_id: 'S01010002', group: 'identity' }, ctx.t0101s);
    const acc = detail.data.values.account_number;
    const q = acc.slice(-8);
    assert.equal(ctx.call('merchants.list', { q }, ctx.t0101).data.total, 0);
    const sup = ctx.call('merchants.list', { q }, ctx.t0101s);
    assert.ok(sup.data.items.some((m) => m.store_id === 'S01010002'));
  });
});

describe('daftar merchant', () => {
  let ctx;
  before(() => {
    ctx = setup();
    ctx.token = ctx.login('0101', PW.petugas0101);
  });

  test('pagination', () => {
    const p1 = ctx.call('merchants.list', { page: 1, page_size: 25, sort: 'store_name', dir: 'asc' }, ctx.token).data;
    const p5 = ctx.call('merchants.list', { page: 5, page_size: 25, sort: 'store_name', dir: 'asc' }, ctx.token).data;
    assert.equal(p1.total_pages, 5);
    assert.equal(p1.items.length, 25);
    assert.equal(p5.items.length, 1);
    const big = ctx.call('merchants.list', { page: 99, page_size: 25 }, ctx.token).data;
    assert.equal(big.page, 5);
  });

  test('pengurutan sv_mtd menurun', () => {
    const items = ctx.call('merchants.list', { sort: 'sv_mtd', dir: 'desc', page_size: 100 }, ctx.token).data.items;
    for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].sv_mtd >= items[i].sv_mtd);
  });

  test('filter kategori USAK & nilai kolom', () => {
    const usak = ctx.call('merchants.list', { kategori_usak: ['USAK'], page_size: 100 }, ctx.token).data;
    assert.equal(usak.total, 43);
    assert.ok(usak.items.every((m) => m.usak.kategori === 'USAK'));
    const tier = ctx.call('merchants.list', { filters: { Tiering: ['tier 1'] }, page_size: 100 }, ctx.token).data;
    assert.ok(tier.total > 0 && tier.items.every((m) => m.Tiering === 'Tier 1'));
    const expectedUreg = sheetRows(ctx.rt, 'Merchants')
      .filter((m) => m.kode_cabang_final === '0101' && m.grading_trx === 'UREG > 0').length;
    assert.ok(expectedUreg > 0);
    const gt = ctx.call('merchants.list', { filters: { grading_trx: ['UREG > 0'] }, page_size: 100 }, ctx.token).data;
    assert.equal(gt.total, expectedUreg);
    // grading_usak bukan sumber USAK: filter ini diabaikan, bukan menyaring semua baris
    assert.equal(ctx.call('merchants.list', { filters: { grading_usak: ['apa-saja'] } }, ctx.token).data.total, 101);
  });

  test('pencarian nama/pemilik/store_id', () => {
    const r = ctx.call('merchants.list', { q: 'S01010007' }, ctx.token).data;
    assert.equal(r.total, 1);
    assert.equal(r.items[0].store_id, 'S01010007');
  });

  test('parameter tidak valid -> VALIDATION_ERROR', () => {
    assert.equal(ctx.call('merchants.list', { sort: 'password_hash' }, ctx.token).error.code, 'VALIDATION_ERROR');
    assert.equal(ctx.call('merchants.list', { follow_up: 'apa' }, ctx.token).error.code, 'VALIDATION_ERROR');
    assert.equal(ctx.call('merchants.detail', { store_id: "S0101' OR 1=1" }, ctx.token).error.code, 'VALIDATION_ERROR');
    assert.equal(ctx.call('merchants.detail', { store_id: '../Users' }, ctx.token).error.code, 'NOT_FOUND');
  });

  test('opsi filter hanya dari cabang sendiri', () => {
    const r = ctx.call('merchants.filterOptions', {}, ctx.token).data;
    const total = r.columns.grading_trx.reduce((s, x) => s + x.count, 0);
    assert.equal(total, 101);
    assert.equal(r.usak_source, 'grading_trx');
    assert.ok(!('grading_usak' in r.columns));
    // USAK, USAK IDEAL, dan USAK OPTIMAL semuanya berkategori USAK dan berjumlah 43
    const usakOpts = r.columns.grading_trx.filter((o) => o.kategori === 'USAK');
    assert.deepEqual(usakOpts.map((o) => o.value).sort(), ['USAK', 'USAK IDEAL', 'USAK OPTIMAL']);
    assert.equal(usakOpts.reduce((n, o) => n + o.count, 0), 43);
    assert.ok(r.columns.grading_trx.filter((o) => o.kategori === 'BELUM_USAK').every((o) => o.value.startsWith('UREG')));
    assert.ok(r.columns.nama_area_final.every((x) => x.value === 'Area Contoh Bandung Raya'));
  });
});

describe('follow-up', () => {
  let ctx;
  before(() => {
    ctx = setup();
    ctx.t = ctx.login('0101', PW.petugas0101);
    ctx.ts = ctx.login('0101', PW.supervisor0101);
  });

  const tomorrow = () => {
    const d = new Date(Date.now() + 86400000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
  };

  test('membuat follow-up, tampil di riwayat dan daftar', () => {
    const created = ctx.call('followups.create', {
      store_id: 'S01010003', status_follow_up: 'DIJADWALKAN', catatan: 'Kunjungi untuk edukasi QR.',
      tanggal_follow_up_berikutnya: tomorrow(), progres_usak: 'EDUKASI', kode_cabang: '0102',
    }, ctx.t);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    assert.match(created.data.follow_up_id, /^FU-/);
    const row = sheetRows(ctx.rt, 'FollowUps').find((f) => f.follow_up_id === created.data.follow_up_id);
    assert.equal(row.kode_cabang, '0101'); // dari sesi, bukan dari payload
    assert.equal(row.created_by, 'U0101');
    const hist = ctx.call('followups.list', { store_id: 'S01010003' }, ctx.t).data.items;
    assert.equal(hist.length, 1);
    const list = ctx.call('merchants.list', { q: 'S01010003' }, ctx.t).data.items[0];
    assert.equal(list.follow_up.status, 'DIJADWALKAN');
    assert.equal(list.follow_up.berikutnya, tomorrow());
  });

  test('validasi input follow-up', () => {
    const r = ctx.call('followups.create', {
      store_id: 'S01010003', status_follow_up: 'NGAWUR', tanggal_follow_up_berikutnya: '2020-01-01',
      progres_usak: 'XYZ', catatan: 'x'.repeat(2001),
    }, ctx.t);
    assert.equal(r.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(Object.keys(r.error.details.fields).sort(), ['catatan', 'progres_usak', 'status_follow_up', 'tanggal_follow_up_berikutnya']);
  });

  test('catatan berbentuk formula disimpan sebagai teks', () => {
    const note = '=HYPERLINK("https://contoh.invalid","klik")';
    const r = ctx.call('followups.create', { store_id: 'S01010004', status_follow_up: 'SUDAH_DIHUBUNGI', catatan: note }, ctx.t);
    assert.equal(r.ok, true);
    const hist = ctx.call('followups.list', { store_id: 'S01010004' }, ctx.t).data.items;
    assert.equal(hist[0].catatan, note);
  });

  test('hanya pembuat atau supervisor yang dapat mengubah follow-up', () => {
    const own = ctx.call('followups.create', { store_id: 'S01010005', status_follow_up: 'SUDAH_DIHUBUNGI' }, ctx.ts).data;
    const denied = ctx.call('followups.update', { follow_up_id: own.follow_up_id, status_follow_up: 'SELESAI' }, ctx.t);
    assert.equal(denied.error.code, 'FORBIDDEN');
    const mine = ctx.call('followups.create', { store_id: 'S01010006', status_follow_up: 'SUDAH_DIHUBUNGI' }, ctx.t).data;
    const ok1 = ctx.call('followups.update', { follow_up_id: mine.follow_up_id, catatan: 'Diperbarui' }, ctx.t);
    assert.equal(ok1.ok, true);
    const ok2 = ctx.call('followups.update', { follow_up_id: mine.follow_up_id, status_follow_up: 'SELESAI' }, ctx.ts);
    assert.equal(ok2.ok, true);
    assert.equal(ok2.data.status_follow_up, 'SELESAI');
  });

  test('follow-up cabang lain tidak dapat diubah', () => {
    const other = setup();
    const t0102 = other.login('0102', PW.petugas0102);
    const fu = other.call('followups.create', { store_id: 'S01020001', status_follow_up: 'DIJADWALKAN' }, t0102).data;
    const t0101s = other.login('0101', PW.supervisor0101);
    assert.equal(other.call('followups.update', { follow_up_id: fu.follow_up_id, catatan: 'x' }, t0101s).error.code, 'NOT_FOUND');
  });

  test('status final mengeluarkan merchant dari "perlu follow-up"; status USAK tetap dari kolom sumber USAK', () => {
    const before = ctx.call('dashboard.summary', {}, ctx.t).data;
    const target = ctx.call('merchants.list', { follow_up: 'perlu', page_size: 1 }, ctx.t).data.items[0];
    ctx.call('followups.create', { store_id: target.store_id, status_follow_up: 'SELESAI', progres_usak: 'MENUNGGU_PEMBARUAN_DATA' }, ctx.t);
    const after = ctx.call('dashboard.summary', {}, ctx.t).data;
    assert.equal(after.follow_up.perlu_follow_up, before.follow_up.perlu_follow_up - 1);
    assert.equal(after.usak.merchant_usak, before.usak.merchant_usak);
  });

  test('role viewer tidak dapat mencatat follow-up', () => {
    const v = setup();
    const users = v.rt.spreadsheet.getSheetByName('Users');
    users.appendRow(['U0101V', '0101', 'KC Contoh Bandung', hashPassword('Viewer12345', 20000), 'viewer', 'TRUE']);
    const tv = v.login('0101', 'Viewer12345');
    assert.equal(v.call('followups.create', { store_id: 'S01010003', status_follow_up: 'DIJADWALKAN' }, tv).error.code, 'FORBIDDEN');
  });
});

describe('impor & header', () => {
  test('impor menjaga nol di depan dan melewati baris error', () => {
    const { rt } = setup();
    const merchants = sheetRows(rt, 'Merchants');
    assert.equal(merchants.length, 301);
    assert.ok(merchants.every((m) => typeof m.kode_cabang_final === 'string' && m.kode_cabang_final.startsWith('0')));
    assert.equal(typeof merchants[0].sv_mtd, 'number');
    const report = JSON.stringify(rt.spreadsheet.getSheetByName('ImportReport')._dump());
    assert.ok(report.includes('Wajib diisi'));
    assert.ok(report.includes('store_id ganda'));
  });

  test('header wajib hilang -> HEADER_MISMATCH yang jelas', () => {
    const { rt, call, login } = setup();
    const token = login('0101', PW.petugas0101);
    const sheet = rt.spreadsheet.getSheetByName('Merchants');
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    sheet.getRange(1, header.indexOf('grading_trx') + 1).setValue('grading_trx_lama');
    rt.clearCache();
    rt.run('bumpVersion_', 'DATA_VERSION');
    const r = call('dashboard.summary', {}, token);
    assert.equal(r.error.code, 'HEADER_MISMATCH');
    assert.deepEqual(r.error.details.kolom_hilang, ['grading_trx']);
  });

  test('header beda huruf besar/kecil tetap terbaca tanpa diubah diam-diam', () => {
    const { rt, call, login } = setup();
    const token = login('0101', PW.petugas0101);
    const sheet = rt.spreadsheet.getSheetByName('Merchants');
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    sheet.getRange(1, header.indexOf('Tiering') + 1).setValue(' tiering ');
    rt.run('bumpVersion_', 'DATA_VERSION');
    assert.equal(call('dashboard.summary', {}, token).ok, true);
    assert.equal(sheet.getRange(1, header.indexOf('Tiering') + 1).getValue(), ' tiering ');
    rt.run('normalizeHeaders_');
    assert.equal(sheet.getRange(1, header.indexOf('Tiering') + 1).getValue(), 'Tiering');
  });

  test('fillUsakValues_ tidak menebak kategori', () => {
    const { rt } = setup({ withUsakConfig: false });
    rt.run('fillUsakValues_');
    const rows = sheetRows(rt, 'UsakConfig');
    assert.deepEqual(rows.map((r) => r.nilai_kolom_usak).sort(), ['N/A', 'UREG = 0', 'UREG > 0', 'USAK', 'USAK IDEAL', 'USAK OPTIMAL']);
    assert.ok(rows.every((r) => r.kategori === ''));
  });
});

describe('sheet Merchants besar & tak terurut', () => {
  /** Acak urutan baris data Merchants secara deterministik (meniru data dari sistem sumber). */
  function shuffleMerchants(rt) {
    const sheet = rt.spreadsheet.getSheetByName('Merchants');
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    rows.forEach((line, r) => line.forEach((v, c) => sheet._setRaw(2 + r, c + 1, v)));
    rt.run('bumpVersion_', 'DATA_VERSION');
    rt.clearCache();
  }

  test('hasil sama untuk data tersebar, dengan peringatan hanya pada mode pindai penuh; urutkan memperbaikinya', () => {
    const { rt, call, login } = setup();
    const baseline = call('dashboard.summary', {}, login('0101', PW.petugas0101)).data;
    assert.ok(!baseline.warnings.some((w) => w.code === 'DATA_NOT_SORTED'));

    shuffleMerchants(rt);
    rt.context.MERCHANT_SCAN_CHUNK_ROWS = 25; // paksa banyak potongan
    const token = login('0101', PW.petugas0101);

    // data tersebar, ambang kecil -> pindai penuh + peringatan, angka tetap benar
    rt.context.MERCHANT_SCAN_MIN_ROWS = 10;
    const scattered = call('dashboard.summary', {}, token).data;
    assert.equal(scattered.usak.total_merchant, 101);
    assert.equal(scattered.usak.merchant_usak, 43);
    assert.equal(scattered.usak.gap_usak_50, 8);
    assert.ok(scattered.warnings.some((w) => w.code === 'DATA_NOT_SORTED'));
    const list = call('merchants.list', { page_size: 100 }, token).data;
    assert.equal(list.total, 101);
    assert.ok(list.items.every((m) => m.kode_cabang_final === '0101'));

    // ambang besar -> mode segmen, tanpa peringatan, angka sama
    rt.context.MERCHANT_SCAN_MIN_ROWS = 100000;
    rt.run('bumpVersion_', 'DATA_VERSION');
    const runs = call('dashboard.summary', {}, token).data;
    assert.equal(runs.usak.merchant_usak, 43);
    assert.ok(!runs.warnings.some((w) => w.code === 'DATA_NOT_SORTED'));

    // menu urutkan -> satu blok per cabang
    const lines = rt.run('sortMerchantsByBranch_');
    assert.match(lines[1], /terurut per cabang/);
    const layout = rt.run('merchantBranchLayout_');
    assert.equal(layout.segments, layout.branches);
    rt.context.MERCHANT_SCAN_MIN_ROWS = 10;
    const sorted = call('dashboard.summary', {}, token).data;
    assert.equal(sorted.usak.merchant_usak, 43);
    assert.ok(!sorted.warnings.some((w) => w.code === 'DATA_NOT_SORTED'));
  });

  test('impor menulis baris terurut per cabang', () => {
    const { rt } = setup();
    const layout = rt.run('merchantBranchLayout_');
    assert.equal(layout.branches, 3);
    assert.equal(layout.sorted, true);
  });

  test('validasi langsung per potongan sama dengan validasi tabel utuh', () => {
    const { rt } = setup();
    const sheet = rt.spreadsheet.getSheetByName('Merchants');
    const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    const cfg = rt.run('loadConfig_');
    const opts = { usak: cfg.usak, tz: 'Asia/Jakarta', pad: '' };
    const whole = rt.context.validateMerchantTable_(values[0], values.slice(1), opts);

    rt.context.MERCHANT_SCAN_CHUNK_ROWS = 37;
    const lines = rt.run('validateMerchantsSheetInPlace_');
    const text = lines.join('\n');
    assert.match(text, new RegExp(`Total baris data: ${whole.summary.total_baris}\\b`));
    assert.match(text, new RegExp(`Baris valid: ${whole.summary.baris_valid}\\b`));
    assert.match(text, new RegExp(`Peringatan: ${whole.summary.peringatan}\\b`));
    assert.match(text, /grading_trx kosong: 8/);
    assert.match(text, /Kolom sumber USAK: grading_trx/);
    assert.ok(whole.summary.peringatan > 0);
  });

  test('validasi langsung melaporkan kolom sumber USAK yang hilang', () => {
    const { rt } = setup();
    const sheet = rt.spreadsheet.getSheetByName('Merchants');
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    sheet.getRange(1, header.indexOf('grading_trx') + 1).setValue('');
    const text = rt.run('validateMerchantsSheetInPlace_').join('\n');
    assert.match(text, /Kolom wajib tidak ditemukan: grading_trx/);
  });
});

describe('kolom sumber USAK', () => {
  const settingRow = (rt, key) => {
    const rows = sheetRows(rt, 'Settings');
    return rows.findIndex((r) => r.kunci === key) + 2;
  };

  test('bawaan memakai grading_trx; kolom grading_usak tidak tampil di daftar dan detail', () => {
    const { call, login } = setup();
    const token = login('0101', PW.petugas0101);
    const dash = call('dashboard.summary', {}, token).data;
    assert.equal(dash.usak.source_column, 'grading_trx');
    assert.equal(dash.distribusi.usak_source.filter((x) => x.kategori === 'USAK').reduce((n, x) => n + x.count, 0), 43);
    assert.ok(dash.distribusi.usak_source.some((x) => x.value === 'USAK IDEAL' && x.kategori === 'USAK'));
    assert.ok(!dash.warnings.some((w) => w.code === 'MISSING_COLUMNS' && /grading_usak/.test(w.message)));
    const list = call('merchants.list', { page_size: 5 }, token).data;
    assert.equal(list.usak_source, 'grading_trx');
    assert.ok(list.items.every((m) => !('grading_usak' in m) && m.usak.source_column === 'grading_trx'));
    const first = list.items[0];
    assert.equal(first.usak.nilai, first.grading_trx);
    const detail = call('merchants.detail', { store_id: first.store_id }, token).data;
    assert.ok(!('grading_usak' in detail.merchant));
    assert.equal(detail.usak.source_column, 'grading_trx');
  });

  test('grading_usak boleh tidak ada di header sheet bila bukan sumber USAK', () => {
    const { rt, call, login } = setup();
    const token = login('0101', PW.petugas0101);
    const sheet = rt.spreadsheet.getSheetByName('Merchants');
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idx = header.indexOf('grading_usak');
    for (let r = 1; r <= sheet.getLastRow(); r++) sheet._setRaw(r, idx + 1, '');
    rt.run('bumpVersion_', 'DATA_VERSION');
    const dash = call('dashboard.summary', {}, token);
    assert.equal(dash.ok, true);
    assert.equal(dash.data.usak.merchant_usak, 43);
    assert.ok(!dash.data.warnings.some((w) => w.code === 'MISSING_COLUMNS'));
  });

  test('sumber dapat dialihkan ke grading_usak lewat Settings (satu kolom saja yang berlaku)', () => {
    const { rt, call, login } = setup();
    const merchants = rt.spreadsheet.getSheetByName('Merchants');
    const header = merchants.getRange(1, 1, 1, merchants.getLastColumn()).getValues()[0];
    const gtCol = header.indexOf('grading_trx') + 1, guCol = header.indexOf('grading_usak') + 1;
    // grading_usak sengaja berbeda dari grading_trx agar terlihat kolom mana yang dipakai
    for (let r = 2; r <= merchants.getLastRow(); r++) {
      const v = merchants.getRange(r, gtCol).getValue();
      merchants._setRaw(r, guCol, String(v).startsWith('USAK') ? 'LULUS' : v === '' ? '' : 'BELUM');
    }
    rt.spreadsheet.getSheetByName('Settings').getRange(settingRow(rt, 'USAK_SOURCE_COLUMN'), 2).setValue('grading_usak');
    const cfgSheet = rt.spreadsheet.getSheetByName('UsakConfig');
    cfgSheet.clear();
    cfgSheet.getRange(1, 1, 3, 3).setValues([['nilai_kolom_usak', 'kategori', 'keterangan'], ['LULUS', 'USAK', ''], ['BELUM', 'BELUM_USAK', '']]);
    rt.run('bumpVersion_', 'CONFIG_VERSION');
    rt.run('bumpVersion_', 'DATA_VERSION');
    rt.clearCache();

    const token = login('0101', PW.petugas0101);
    const dash = call('dashboard.summary', {}, token).data;
    assert.equal(dash.usak.source_column, 'grading_usak');
    assert.equal(dash.usak.total_merchant, 101);
    assert.equal(dash.usak.merchant_usak, 43);
    assert.equal(dash.usak.gap_usak_50, 8);
    const list = call('merchants.list', { kategori_usak: ['USAK'], page_size: 100 }, token).data;
    assert.equal(list.total, 43);
    assert.ok(list.items.every((m) => m.grading_usak === 'LULUS' && m.usak.nilai === 'LULUS'));
    const opts = call('merchants.filterOptions', {}, token).data;
    assert.ok(opts.columns.grading_usak && opts.columns.grading_trx);
    assert.equal(opts.usak_source, 'grading_usak');
    const f = call('merchants.list', { filters: { grading_usak: ['lulus'] } }, token).data;
    assert.equal(f.total, 43);
  });

  test('nilai Settings tidak valid -> memakai bawaan dan diberi peringatan', () => {
    const { rt, call, login } = setup();
    rt.spreadsheet.getSheetByName('Settings').getRange(settingRow(rt, 'USAK_SOURCE_COLUMN'), 2).setValue('status_trx');
    rt.run('bumpVersion_', 'CONFIG_VERSION');
    rt.clearCache();
    const dash = call('dashboard.summary', {}, login('0101', PW.petugas0101)).data;
    assert.equal(dash.usak.source_column, 'grading_trx');
    assert.ok(dash.warnings.some((w) => w.code === 'USAK_SOURCE_INVALID'));
  });
});

describe('definisi USAK bawaan setup', () => {
  test('setup mengisi UsakConfig dengan definisi terkonfirmasi hanya bila kosong', () => {
    const rt = createRuntime({ quiet: true, properties: { API_SHARED_SECRET: KEY } });
    rt.run('setupSheets_');
    const cfg = rt.run('loadUsakConfig_', { USAK_SOURCE_COLUMN: 'grading_trx' });
    assert.equal(cfg.configured, true);
    assert.equal(cfg.usak_values, 3);
    assert.equal(cfg.belum_usak_values, 2);
    const classify = (v) => rt.context.classifyUsak_(v, cfg);
    assert.equal(classify('USAK'), 'USAK');
    assert.equal(classify('usak ideal'), 'USAK');
    assert.equal(classify('USAK OPTIMAL'), 'USAK');
    assert.equal(classify('UREG > 0'), 'BELUM_USAK');
    assert.equal(classify('UREG = 0'), 'BELUM_USAK');
    assert.equal(classify('USAK PREMIUM'), 'TIDAK_DIKENALI'); // nilai baru tidak otomatis USAK
    assert.equal(classify(''), 'KOSONG');

    // setup ulang tidak menimpa perubahan admin
    const sheet = rt.spreadsheet.getSheetByName('UsakConfig');
    sheet.getRange(3, 2).setValue('BELUM_USAK'); // USAK IDEAL diubah admin
    rt.run('setupSheets_');
    assert.equal(sheet.getLastRow(), 6);
    assert.equal(sheet.getRange(3, 2).getValue(), 'BELUM_USAK');
  });
});
