/**
 * Fungsi administrator. Dijalankan dari menu "LVM Admin" di spreadsheet (skrip terikat)
 * atau dari editor Apps Script. Fungsi-fungsi ini TIDAK dapat dipanggil lewat Web App:
 * doPost hanya menjalankan aksi di routes_().
 *
 * Setiap fungsi publik memanggil assertAdmin_(): pengguna aktif harus pemilik spreadsheet
 * atau tercantum di Script Property ADMIN_EMAILS (dipisah koma).
 */

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('LVM Admin')
      .addItem('1. Setup / perbarui struktur sheet', 'setupSheets')
      .addItem('2. Periksa konfigurasi & header', 'checkSetup')
      .addItem('Rapikan nama header (eksplisit)', 'normalizeHeaders')
      .addSeparator()
      .addItem('Atur API_SHARED_SECRET…', 'setApiSecretPrompt')
      .addItem('Buat akun untuk semua cabang', 'createBranchAccounts')
      .addItem('Terapkan hash dari Import_Users', 'applyUserHashImport')
      .addItem('Atur kata sandi pengguna…', 'showSetPasswordDialog')
      .addItem('Cabut sesi satu pengguna…', 'revokeUserSessionsPrompt')
      .addItem('Cabut semua sesi', 'revokeAllSessions')
      .addItem('Bersihkan sesi kedaluwarsa', 'cleanupExpiredSessions')
      .addItem('Pasang pembersihan sesi harian', 'installCleanupTrigger')
      .addSeparator()
      .addItem('Isi daftar nilai kolom USAK ke UsakConfig', 'fillUsakValues')
      .addItem('Terapkan aturan prioritas bawaan (Tiering)', 'applyDefaultPriorityRules')
      .addItem('Validasi sheet Merchants (langsung)', 'validateMerchantsSheet')
      .addItem('Urutkan Merchants per cabang', 'sortMerchantsByBranch')
      .addItem('Bangun indeks cabang', 'buildBranchIndex')
      .addItem('Siapkan sheet Wilayah (area & region)', 'prepareWilayahSheet')
      .addItem('Buat akun area dan region', 'createRegionAreaAccounts')
      .addItem('Ukur waktu muat cabang…', 'measureBranchLoad')
      .addItem('Validasi impor (Import_Merchants)', 'validateImport')
      .addItem('Terapkan impor ke Merchants', 'applyImport')
      .addItem('Bersihkan cache aplikasi', 'clearAppCache')
      .addToUi();
  } catch (e) {
    // Bukan konteks UI (mis. dijalankan dari trigger); abaikan.
  }
}

function assertAdmin_() {
  var email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { email = ''; }
  if (!email) throw new AppError('FORBIDDEN', 'Identitas admin tidak dapat dipastikan. Jalankan dari akun admin.');
  var admins = String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '')
    .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(function (s) { return s; });
  if (admins.indexOf(email) >= 0) return email;
  var owner = '';
  try {
    var o = getSpreadsheet_().getOwner();
    owner = o ? String(o.getEmail() || '').toLowerCase() : '';
  } catch (e2) { owner = ''; }
  if (owner && owner === email) return email;
  throw new AppError('FORBIDDEN', 'Akun ' + email + ' bukan admin. Tambahkan ke Script Property ADMIN_EMAILS.');
}

function runAdmin_(title, fn) {
  var lines;
  try {
    assertAdmin_();
    lines = fn() || [];
  } catch (e) {
    if (!(e instanceof AppError)) console.error(title + ' gagal: ' + (e && e.stack ? e.stack : e));
    lines = ['GAGAL: ' + (e instanceof AppError ? e.message : 'Kesalahan tak terduga. Lihat log eksekusi.')];
  } finally {
    clearConfigMemo_();
  }
  showAdminResult_(title, lines);
  return lines;
}

function showAdminResult_(title, lines) {
  var text = lines.join('\n');
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert(title, text, ui.ButtonSet.OK);
  } catch (e) {
    console.log(title + '\n' + text);
  }
}

/* ------------------------------------------------------------------ */
/* Setup sheet                                                         */
/* ------------------------------------------------------------------ */

function setupSheets() {
  return runAdmin_('Setup sheet', setupSheets_);
}

function setupSheets_() {
  var ss = getSpreadsheet_();
  var props = PropertiesService.getScriptProperties();
  var lines = [];
  if (!props.getProperty('SPREADSHEET_ID')) {
    props.setProperty('SPREADSHEET_ID', ss.getId());
    lines.push('SPREADSHEET_ID diatur ke spreadsheet ini.');
  }
  var plan = [
    { name: SHEETS.MERCHANTS, headers: MERCHANT_COLUMNS, text: MERCHANT_TEXT_COLUMNS },
    { name: SHEETS.USERS, headers: SHEET_SCHEMAS.Users, text: SHEET_TEXT_COLUMNS.Users },
    { name: SHEETS.FOLLOW_UPS, headers: SHEET_SCHEMAS.FollowUps, text: SHEET_TEXT_COLUMNS.FollowUps },
    { name: SHEETS.SESSIONS, headers: SHEET_SCHEMAS.Sessions, text: SHEET_TEXT_COLUMNS.Sessions },
    { name: SHEETS.ROLES, headers: SHEET_SCHEMAS.Roles, defaults: DEFAULT_ROLES },
    { name: SHEETS.USAK_CONFIG, headers: SHEET_SCHEMAS.UsakConfig, text: SHEET_TEXT_COLUMNS.UsakConfig, defaults: DEFAULT_USAK_CONFIG },
    { name: SHEETS.PRIORITY_RULES, headers: SHEET_SCHEMAS.PriorityRules, text: SHEET_TEXT_COLUMNS.PriorityRules, defaults: DEFAULT_PRIORITY_RULES },
    { name: SHEETS.OPTIONS, headers: SHEET_SCHEMAS.Options, defaults: DEFAULT_OPTIONS },
    { name: SHEETS.SETTINGS, headers: SHEET_SCHEMAS.Settings, text: SHEET_TEXT_COLUMNS.Settings },
    { name: SHEETS.AUDIT_LOG, headers: SHEET_SCHEMAS.AuditLog, text: SHEET_TEXT_COLUMNS.AuditLog },
    { name: SHEETS.IMPORT_USERS, headers: SHEET_SCHEMAS.Import_Users, text: SHEET_TEXT_COLUMNS.Import_Users },
    { name: SHEETS.BRANCH_INDEX, headers: SHEET_SCHEMAS.BranchIndex, text: SHEET_TEXT_COLUMNS.BranchIndex },
    { name: SHEETS.WILAYAH, headers: SHEET_SCHEMAS.Wilayah, text: SHEET_TEXT_COLUMNS.Wilayah },
  ];
  for (var i = 0; i < plan.length; i++) {
    var p = plan[i];
    var sheet = ss.getSheetByName(p.name);
    if (!sheet) {
      sheet = ss.insertSheet(p.name);
      lines.push('Sheet dibuat: ' + p.name);
    }
    var info = ensureHeaders_(sheet, p.headers);
    if (info.added.length) lines.push(p.name + ': header ditambahkan -> ' + info.added.join(', '));
    if (info.nonCanonical.length) {
      lines.push(p.name + ': header berbeda penulisan (jalankan "Rapikan nama header" bila perlu) -> ' +
        info.nonCanonical.map(function (x) { return x.ditemukan + ' ≈ ' + x.seharusnya; }).join(', '));
    }
    if (p.text) applyTextFormats_(sheet, null, p.text);
    if (p.defaults && sheet.getLastRow() < 2) {
      writeRowsByHeader_(sheet, p.headers, p.defaults);
      lines.push(p.name + ': ' + p.defaults.length + ' baris bawaan ditambahkan.');
    }
  }
  var added = ensureDefaultSettings_(ss.getSheetByName(SHEETS.SETTINGS));
  if (added) lines.push('Settings: ' + added + ' kunci bawaan ditambahkan.');

  var secret = props.getProperty('API_SHARED_SECRET');
  if (!secret || secret.length < 32) {
    lines.push('PERHATIAN: Script Property API_SHARED_SECRET belum diatur (minimal 32 karakter). Web App menolak semua request sampai diatur.');
  }
  var usak = loadUsakConfigSafe_();
  if (!usak || !usak.configured) {
    lines.push('PERHATIAN: UsakConfig belum berisi nilai kolom sumber USAK berkategori USAK. Isi sesuai definisi bisnis resmi.');
  }
  bumpVersion_('CONFIG_VERSION');
  if (!lines.length) lines.push('Struktur sheet sudah sesuai. Tidak ada perubahan.');
  return lines;
}

function loadUsakConfigSafe_() {
  try { return loadUsakConfig_(loadSettings_()); } catch (e) { return null; }
}

/** Pastikan baris 1 berisi header yang dibutuhkan; header yang hilang ditambahkan di akhir. */
function ensureHeaders_(sheet, headers) {
  var lastCol = sheet.getLastColumn();
  var current = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var nonEmpty = current.filter(function (h) { return str_(h) !== ''; });
  if (!nonEmpty.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return { added: headers.slice(), nonCanonical: [] };
  }
  var info = buildHeaderIndex_(current, headers);
  if (info.missing.length) {
    var start = current.length + 1;
    sheet.getRange(1, start, 1, info.missing.length).setValues([info.missing]).setFontWeight('bold');
  }
  sheet.setFrozenRows(1);
  return { added: info.missing, nonCanonical: info.nonCanonical };
}

/** Format kolom teks sebagai Plain Text (@) agar kode seperti "0101" tidak berubah menjadi 101. */
function applyTextFormats_(sheet, canonical, textColumns) {
  var info = readHeaderInfo_(sheet, canonical || textColumns);
  var maxRows = sheet.getMaxRows();
  if (maxRows < 2) return;
  for (var i = 0; i < textColumns.length; i++) {
    var idx = info.index[textColumns[i]];
    if (idx === undefined) continue;
    sheet.getRange(2, idx + 1, maxRows - 1, 1).setNumberFormat('@');
  }
}

function writeRowsByHeader_(sheet, canonical, rows) {
  var info = readHeaderInfo_(sheet, canonical);
  var lastCol = sheet.getLastColumn();
  var out = rows.map(function (r) {
    var row = [];
    for (var i = 0; i < lastCol; i++) row.push('');
    for (var c = 0; c < canonical.length; c++) {
      var idx = info.index[canonical[c]];
      if (idx !== undefined) row[idx] = r[c] === undefined ? '' : r[c];
    }
    return row;
  });
  var start = Math.max(sheet.getLastRow(), 1) + 1;
  sheet.getRange(start, 1, out.length, lastCol).setValues(out);
}

function ensureDefaultSettings_(sheet) {
  if (!sheet) return 0;
  var table = readTable_(SHEETS.SETTINGS, { required: ['kunci', 'nilai'] });
  var have = {};
  for (var i = 0; i < table.rows.length; i++) have[str_(table.rows[i].kunci).toUpperCase()] = true;
  var rows = [];
  for (var k in DEFAULT_SETTINGS) {
    if (!have[k]) rows.push([k, DEFAULT_SETTINGS[k].nilai, DEFAULT_SETTINGS[k].keterangan]);
  }
  if (rows.length) writeRowsByHeader_(sheet, SHEET_SCHEMAS.Settings, rows);
  return rows.length;
}

/* ------------------------------------------------------------------ */
/* Pemeriksaan & header                                                */
/* ------------------------------------------------------------------ */

function checkSetup() {
  return runAdmin_('Pemeriksaan konfigurasi', checkSetup_);
}

function checkSetup_() {
  var lines = [];
  var props = PropertiesService.getScriptProperties();
  lines.push('SPREADSHEET_ID: ' + (props.getProperty('SPREADSHEET_ID') ? 'terisi' : 'BELUM (pakai spreadsheet aktif)'));
  var secret = props.getProperty('API_SHARED_SECRET');
  lines.push('API_SHARED_SECRET: ' + (secret && secret.length >= 32 ? 'terisi (' + secret.length + ' karakter)' : 'BELUM/TERLALU PENDEK'));
  lines.push('ADMIN_EMAILS: ' + (props.getProperty('ADMIN_EMAILS') ? 'terisi' : 'kosong (hanya pemilik spreadsheet)'));
  var ss = getSpreadsheet_();
  var all = [{ name: SHEETS.MERCHANTS, headers: MERCHANT_COLUMNS }];
  for (var name in SHEET_SCHEMAS) all.push({ name: name, headers: SHEET_SCHEMAS[name] });
  for (var i = 0; i < all.length; i++) {
    var sheet = ss.getSheetByName(all[i].name);
    if (!sheet) { lines.push(all[i].name + ': TIDAK ADA'); continue; }
    var info = readHeaderInfo_(sheet, all[i].headers);
    var status = info.missing.length ? 'kolom hilang: ' + info.missing.join(', ') : 'header OK';
    if (info.nonCanonical.length) status += '; beda penulisan: ' + info.nonCanonical.map(function (x) { return x.ditemukan; }).join(', ');
    if (info.extra.length) status += '; kolom tambahan: ' + info.extra.join(', ');
    lines.push(all[i].name + ': ' + status + ' (' + Math.max(sheet.getLastRow() - 1, 0) + ' baris)');
  }
  clearConfigMemo_();
  var cfg = loadConfig_();
  var layout = merchantBranchLayout_();
  if (layout.rows) {
    lines.push('Merchants: ' + layout.rows + ' baris, ' + layout.branches + ' cabang, ' +
      (layout.sorted ? 'terurut per cabang (pemuatan cepat)'
        : 'TIDAK terurut per cabang (' + layout.segments + ' segmen) — jalankan "Urutkan Merchants per cabang"'));
  }
  var idxRows = readTable_(SHEETS.BRANCH_INDEX, { optional: true, required: ['kode_cabang'] }).rows.length;
  if (layout.rows) {
    lines.push('BranchIndex: ' + idxRows + ' cabang diindeks' + (idxRows < layout.branches
      ? ' (dari ' + layout.branches + ' cabang) — jalankan "Bangun indeks cabang"' : ' (pemuatan cabang cepat)'));
  }
  lines.push('Kolom sumber USAK: ' + cfg.usak.source + (cfg.usak.source_invalid ? ' (Settings USAK_SOURCE_COLUMN "' + cfg.usak.source_invalid + '" tidak valid; memakai bawaan)' : ''));
  lines.push('UsakConfig: ' + cfg.usak.usak_values + ' nilai USAK, ' + cfg.usak.belum_usak_values + ' nilai BELUM_USAK' +
    (cfg.usak.unfilled_values.length ? ', ' + cfg.usak.unfilled_values.length + ' belum berkategori' : '') +
    (cfg.usak.invalid_rows.length ? ', ' + cfg.usak.invalid_rows.length + ' tidak valid' : ''));
  lines.push('Aturan prioritas aktif: ' + cfg.rules.list.length + (cfg.rules.invalid.length ? ' (' + cfg.rules.invalid.length + ' baris tidak valid)' : ''));
  lines.push('Role: ' + Object.keys(cfg.roles).join(', '));
  var users = readTable_(SHEETS.USERS).rows;
  var bad = users.filter(function (u) { return !isValidPasswordHash_(u.password_hash); }).map(function (u) { return str_(u.user_id); });
  var unknownRole = users.filter(function (u) { return !cfg.roles[normKey_(u.role)]; }).map(function (u) { return str_(u.user_id); });
  lines.push('Users: ' + users.length + ' akun, ' + users.filter(function (u) { return toBool_(u.is_active); }).length + ' aktif');
  if (bad.length) lines.push('Akun tanpa password_hash valid: ' + bad.join(', '));
  if (unknownRole.length) lines.push('Akun dengan role tidak dikenal: ' + unknownRole.join(', '));
  return lines;
}

/** Ubah header yang hanya berbeda huruf besar/kecil/spasi menjadi nama resmi. Dijalankan eksplisit oleh admin. */
function normalizeHeaders() {
  return runAdmin_('Rapikan nama header', normalizeHeaders_);
}

function normalizeHeaders_() {
  var ss = getSpreadsheet_();
  var lines = [];
  var all = [{ name: SHEETS.MERCHANTS, headers: MERCHANT_COLUMNS }];
  for (var name in SHEET_SCHEMAS) all.push({ name: name, headers: SHEET_SCHEMAS[name] });
  for (var i = 0; i < all.length; i++) {
    var sheet = ss.getSheetByName(all[i].name);
    if (!sheet || sheet.getLastColumn() < 1) continue;
    var info = readHeaderInfo_(sheet, all[i].headers);
    for (var j = 0; j < info.nonCanonical.length; j++) {
      var nc = info.nonCanonical[j];
      sheet.getRange(1, info.index[nc.seharusnya] + 1).setValue(nc.seharusnya);
      lines.push(all[i].name + ': "' + nc.ditemukan + '" -> "' + nc.seharusnya + '"');
    }
  }
  if (!lines.length) lines.push('Semua header sudah sesuai nama resmi.');
  bumpVersion_('DATA_VERSION');
  return lines;
}

/* ------------------------------------------------------------------ */
/* Akun & sesi                                                         */
/* ------------------------------------------------------------------ */

function showSetPasswordDialog() {
  try {
    assertAdmin_();
  } catch (e) {
    showAdminResult_('Atur kata sandi', ['GAGAL: ' + e.message]);
    return;
  }
  var html = HtmlService.createHtmlOutputFromFile('AdminDialog').setWidth(440).setHeight(470);
  SpreadsheetApp.getUi().showModalDialog(html, 'Atur kata sandi pengguna');
}

/** Dipanggil dari AdminDialog: daftar akun tanpa hash. */
function adminListUsers() {
  assertAdmin_();
  return readTable_(SHEETS.USERS).rows.map(function (u) {
    return {
      user_id: str_(u.user_id),
      kode_cabang: str_(u.kode_cabang),
      nama_cabang: str_(u.nama_cabang),
      role: str_(u.role),
      is_active: toBool_(u.is_active),
      has_password: isValidPasswordHash_(u.password_hash),
    };
  });
}

/** Dipanggil dari AdminDialog. Kata sandi tidak pernah dicatat ke log. */
function adminSetPassword(form) {
  assertAdmin_();
  var userId = str_(form && form.user_id);
  var password = form && typeof form.password === 'string' ? form.password : '';
  var confirm = form && typeof form.confirm === 'string' ? form.confirm : '';
  var problem = passwordPolicyProblem_(password);
  if (!userId) throw new Error('Pilih pengguna.');
  if (problem) throw new Error(problem);
  if (password !== confirm) throw new Error('Konfirmasi kata sandi tidak sama.');
  var cfg = loadConfig_();
  var iterations = clampInt_(cfg.settings.PBKDF2_ITERATIONS, PBKDF2_MIN_ITERATIONS, PBKDF2_MAX_ITERATIONS, PBKDF2_DEFAULT_ITERATIONS);
  var hash = hashPassword_(password, iterations);
  var row = null;
  withLock_(function () {
    row = findRowByValue_(SHEETS.USERS, 'user_id', userId);
    if (!row) throw new Error('user_id tidak ditemukan.');
    updateObjectFields_(SHEETS.USERS, row._row, { password_hash: hash });
  });
  bumpVersion_('USERS_VERSION');
  var revoked = revokeSessionsForUser_(userId);
  audit_({ user_id: 'admin', kode_cabang: str_(row.kode_cabang) }, 'ADMIN_SET_PASSWORD', '', 'user_id ' + userId);
  return 'Kata sandi ' + userId + ' diperbarui. ' + revoked + ' sesi lama dicabut.';
}

/** Kebijakan minimal kata sandi. Mengembalikan pesan masalah atau '' bila lolos. */
function passwordPolicyProblem_(password) {
  if (password.length < 10) return 'Kata sandi minimal 10 karakter.';
  if (password.length > 200) return 'Kata sandi maksimal 200 karakter.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Kata sandi harus memuat huruf dan angka.';
  return '';
}

/** Masalah pada secret API, atau '' bila valid. Secret tidak pernah dimasukkan ke pesan. */
function apiSecretProblem_(value) {
  if (value.length < 32) return 'Secret minimal 32 karakter (yang dimasukkan: ' + value.length + ').';
  if (value.length > 200) return 'Secret maksimal 200 karakter.';
  if (!/^[\x21-\x7E]+$/.test(value)) return 'Secret hanya boleh karakter ASCII tanpa spasi.';
  return '';
}

/** Simpan secret ke Script Properties. Tidak mencatat nilainya ke log atau AuditLog. */
function saveApiSecret_(value) {
  var problem = apiSecretProblem_(value);
  if (problem) throw new AppError('VALIDATION_ERROR', problem);
  PropertiesService.getScriptProperties().setProperty('API_SHARED_SECRET', value);
  audit_({ user_id: 'admin', kode_cabang: '' }, 'ADMIN_SET_API_SECRET', '', 'panjang ' + value.length);
  return ['API_SHARED_SECRET tersimpan (' + value.length + ' karakter).',
    'Nilainya harus sama persis dengan APPS_SCRIPT_API_KEY di Vercel. Tidak perlu deploy ulang Apps Script.'];
}

/** Dialog sederhana untuk menyimpan API_SHARED_SECRET tanpa membuka layar Script Properties. */
function setApiSecretPrompt() {
  var ui;
  try {
    assertAdmin_();
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    showAdminResult_('Atur API_SHARED_SECRET', ['GAGAL: ' + e.message]);
    return;
  }
  var resp = ui.prompt('Atur API_SHARED_SECRET',
    'Tempel secret (minimal 32 karakter). Harus sama dengan APPS_SCRIPT_API_KEY di Vercel. Nilai tidak disimpan di log.',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var value = String(resp.getResponseText() || '').trim();
  runAdmin_('Atur API_SHARED_SECRET', function () { return saveApiSecret_(value); });
}

/* ------------------------------------------------------------------ */
/* Akun massal                                                         */
/* ------------------------------------------------------------------ */

var BRANCH_CODE_LOGIN_PATTERN = /^[A-Za-z0-9._\-]{1,32}$/;

/**
 * Buat baris Users untuk setiap kode_cabang_final di Merchants yang belum punya akun.
 * Akun dibuat NONAKTIF dan tanpa kata sandi (is_active = FALSE, password_hash kosong) sampai
 * hash diterapkan lewat applyUserHashImport_. Aman dijalankan berulang.
 */
function createBranchAccounts() {
  return runAdmin_('Buat akun cabang', createBranchAccounts_);
}

function createBranchAccounts_() {
  var cfg = loadConfig_();
  var pad = cfg.settings.KODE_CABANG_PAD_LENGTH;
  var sheet = getSheet_(SHEETS.MERCHANTS);
  var info = readHeaderInfo_(sheet, MERCHANT_COLUMNS);
  assertHeaders_(SHEETS.MERCHANTS, info, ['kode_cabang_final', 'nama_cabang_final']);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new AppError('VALIDATION_ERROR', 'Sheet Merchants belum berisi data.');
  var kodes = sheet.getRange(2, info.index.kode_cabang_final + 1, lastRow - 1, 1).getValues();
  var namas = sheet.getRange(2, info.index.nama_cabang_final + 1, lastRow - 1, 1).getValues();
  var branches = {};
  for (var i = 0; i < kodes.length; i++) {
    var k = normKode_(kodes[i][0], pad);
    if (!k) continue;
    var b = branches[k] || (branches[k] = { count: 0, names: {} });
    b.count++;
    var n = str_(namas[i][0]);
    if (n) b.names[n] = (b.names[n] || 0) + 1;
  }

  var usersSheet = getSheet_(SHEETS.USERS);
  var existing = readTable_(SHEETS.USERS).rows;
  var haveBranch = {}, usedIds = {};
  for (i = 0; i < existing.length; i++) {
    haveBranch[normKode_(existing[i].kode_cabang, pad)] = true;
    usedIds[normKey_(existing[i].user_id)] = true;
  }

  var rows = [], skippedInvalid = [], alreadyHave = 0, multiName = 0;
  var codes = Object.keys(branches).sort();
  for (i = 0; i < codes.length; i++) {
    var kode = codes[i];
    if (haveBranch[kode]) { alreadyHave++; continue; }
    if (!BRANCH_CODE_LOGIN_PATTERN.test(kode)) { skippedInvalid.push(kode); continue; }
    var names = Object.keys(branches[kode].names).sort(function (a, c) {
      return branches[kode].names[c] - branches[kode].names[a] || (a < c ? -1 : 1);
    });
    if (names.length > 1) multiName++;
    var id = 'U' + kode, suffix = 2;
    while (usedIds[normKey_(id)]) id = 'U' + kode + '-' + (suffix++);
    usedIds[normKey_(id)] = true;
    rows.push({ user_id: id, kode_cabang: kode, nama_cabang: names[0] || '', password_hash: '', role: 'petugas', is_active: false });
  }

  if (rows.length) {
    ensureRowCapacity_(usersSheet, usersSheet.getLastRow() + rows.length + 1);
    applyTextFormats_(usersSheet, null, SHEET_TEXT_COLUMNS.Users);
    var canonical = SHEET_SCHEMAS.Users;
    writeRowsByHeader_(usersSheet, canonical, rows.map(function (r) {
      return canonical.map(function (col) { return cellValueFor_(SHEETS.USERS, col, r[col]); });
    }));
    bumpVersion_('USERS_VERSION');
    audit_({ user_id: 'admin', kode_cabang: '' }, 'ADMIN_CREATE_BRANCH_ACCOUNTS', '', rows.length + ' akun');
  }
  var lines = [
    rows.length + ' akun cabang dibuat (nonaktif, tanpa kata sandi).',
    alreadyHave + ' cabang sudah punya akun dan dilewati.',
    'Total cabang di data merchant: ' + codes.length + '.',
  ];
  if (skippedInvalid.length) {
    lines.push(skippedInvalid.length + ' kode cabang dilewati karena tidak bisa dipakai untuk login (hanya huruf, angka, titik, garis bawah, tanda hubung): ' +
      skippedInvalid.slice(0, 10).join(', ') + (skippedInvalid.length > 10 ? ', …' : ''));
  }
  if (multiName) lines.push(multiName + ' cabang memiliki lebih dari satu nama_cabang_final; nama yang paling sering dipakai yang diambil.');
  if (rows.length) lines.push('Langkah berikut: unduh sheet Users sebagai CSV lalu jalankan npm run passwords:bulk di komputer Anda.');
  return lines;
}

/**
 * Terapkan hash kata sandi dari sheet Import_Users (user_id, password_hash, is_active) ke Users.
 * Hanya kolom password_hash dan is_active yang diubah; hash divalidasi formatnya; sesi lama
 * pengguna yang diubah dicabut; isi Import_Users dikosongkan setelah berhasil.
 */
function applyUserHashImport() {
  return runAdmin_('Terapkan hash kata sandi', applyUserHashImport_);
}

function applyUserHashImport_() {
  var imp = readTable_(SHEETS.IMPORT_USERS, { optional: true, required: ['user_id', 'password_hash'] });
  if (!imp.sheet) throw new AppError('SHEET_MISSING', 'Sheet "Import_Users" tidak ditemukan. Jalankan menu Setup sheet.');
  if (!imp.rows.length) throw new AppError('VALIDATION_ERROR', 'Sheet Import_Users kosong. Tempel isi hash-untuk-import.tsv (tanpa header) di sel A2.');

  var usersSheet = getSheet_(SHEETS.USERS);
  var info = readHeaderInfo_(usersSheet, SHEET_SCHEMAS.Users);
  assertHeaders_(SHEETS.USERS, info, ['user_id', 'password_hash', 'is_active']);
  var lastRow = usersSheet.getLastRow();
  if (lastRow < 2) throw new AppError('VALIDATION_ERROR', 'Sheet Users belum berisi akun. Jalankan "Buat akun untuk semua cabang" dulu.');
  var count = lastRow - 1;
  var ids = usersSheet.getRange(2, info.index.user_id + 1, count, 1).getValues();
  var hashes = usersSheet.getRange(2, info.index.password_hash + 1, count, 1).getValues();
  var actives = usersSheet.getRange(2, info.index.is_active + 1, count, 1).getValues();
  var rowOf = {};
  for (var i = 0; i < ids.length; i++) rowOf[str_(ids[i][0])] = i;

  var seen = {}, notFound = [], invalid = [], duplicates = 0, changedIds = [];
  for (i = 0; i < imp.rows.length; i++) {
    var r = imp.rows[i];
    var id = str_(r.user_id);
    if (!id) continue;
    if (seen[id]) { duplicates++; continue; }
    seen[id] = true;
    var idx = rowOf[id];
    if (idx === undefined) { notFound.push(id); continue; }
    var hash = str_(r.password_hash);
    if (!isValidPasswordHash_(hash)) { invalid.push(id); continue; }
    hashes[idx][0] = hash;
    actives[idx][0] = isBlank_(r.is_active) ? true : toBool_(r.is_active);
    changedIds.push(id);
  }

  if (changedIds.length) {
    withLock_(function () {
      usersSheet.getRange(2, info.index.password_hash + 1, count, 1).setValues(hashes);
      usersSheet.getRange(2, info.index.is_active + 1, count, 1).setValues(actives);
    });
    bumpVersion_('USERS_VERSION');
    var revoked = revokeSessionsForUsers_(changedIds);
    audit_({ user_id: 'admin', kode_cabang: '' }, 'ADMIN_IMPORT_PASSWORD_HASH', '', changedIds.length + ' akun');
    // Kosongkan Import_Users (hash tidak perlu tersimpan di sana).
    if (imp.sheet.getLastRow() > 1) imp.sheet.getRange(2, 1, imp.sheet.getLastRow() - 1, Math.max(imp.sheet.getLastColumn(), 1)).clearContent();
    var lines = [changedIds.length + ' akun diperbarui dan diaktifkan sesuai kolom is_active (' + revoked + ' sesi lama dicabut).'];
  } else {
    lines = ['Tidak ada akun yang diperbarui.'];
  }
  var preview = function (list) { return list.slice(0, 10).join(', ') + (list.length > 10 ? ', …' : ''); };
  if (notFound.length) lines.push(notFound.length + ' user_id tidak ada di Users (dilewati): ' + preview(notFound));
  if (invalid.length) lines.push(invalid.length + ' hash tidak valid formatnya (dilewati): ' + preview(invalid));
  if (duplicates) lines.push(duplicates + ' baris ganda di Import_Users dilewati.');
  if (changedIds.length) lines.push('Isi Import_Users dikosongkan.');
  return lines;
}

function revokeUserSessionsPrompt() {
  var ui;
  try {
    assertAdmin_();
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    showAdminResult_('Cabut sesi pengguna', ['GAGAL: ' + e.message]);
    return;
  }
  var resp = ui.prompt('Cabut sesi pengguna', 'Masukkan user_id:', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var userId = str_(resp.getResponseText());
  runAdmin_('Cabut sesi pengguna', function () {
    return [revokeSessionsForUser_(userId) + ' sesi milik ' + userId + ' dicabut.'];
  });
}

function revokeAllSessions() {
  return runAdmin_('Cabut semua sesi', function () {
    var count = 0;
    withLock_(function () {
      var table = readTable_(SHEETS.SESSIONS);
      var stamp = isoNow_();
      for (var i = 0; i < table.rows.length; i++) {
        if (!str_(table.rows[i].revoked_at)) {
          updateObjectFields_(SHEETS.SESSIONS, table.rows[i]._row, { revoked_at: stamp });
          cacheRemove_('s:' + str_(table.rows[i].session_hash));
          count++;
        }
      }
    });
    return [count + ' sesi dicabut. Semua pengguna perlu login ulang.'];
  });
}

function cleanupExpiredSessions() {
  return runAdmin_('Bersihkan sesi', function () { return [cleanupSessions_() + ' baris sesi lama dihapus.']; });
}

function installCleanupTrigger() {
  return runAdmin_('Pasang trigger', function () {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'cleanupSessionsTrigger') ScriptApp.deleteTrigger(triggers[i]);
    }
    ScriptApp.newTrigger('cleanupSessionsTrigger').timeBased().everyDays(1).atHour(2).create();
    return ['Trigger harian pembersihan sesi dipasang (sekitar pukul 02.00).'];
  });
}

/** Target trigger waktu: tanpa UI, tanpa cek admin (trigger berjalan sebagai pemasang). */
function cleanupSessionsTrigger() {
  try {
    cleanupSessions_();
  } catch (e) {
    console.error('Pembersihan sesi gagal: ' + e.message);
  }
}

/* ------------------------------------------------------------------ */
/* Konfigurasi USAK, impor, cache                                      */
/* ------------------------------------------------------------------ */

/**
 * Tambahkan nilai unik kolom sumber USAK (Settings USAK_SOURCE_COLUMN) yang ditemukan di data
 * ke UsakConfig dengan kategori kosong. Tidak menebak kategori: admin wajib mengisinya
 * sesuai definisi bisnis resmi.
 */
function fillUsakValues() {
  return runAdmin_('Nilai kolom USAK', fillUsakValues_);
}

function fillUsakValues_() {
  var cfg = loadConfig_();
  var source = cfg.usak.source;
  var sheet = getSheet_(SHEETS.MERCHANTS);
  var info = readHeaderInfo_(sheet, MERCHANT_COLUMNS);
  assertHeaders_(SHEETS.MERCHANTS, info, [source]);
  var lastRow = sheet.getLastRow();
  var counts = {}, labels = {};
  for (var start = 2; start <= lastRow; start += MERCHANT_SCAN_CHUNK_ROWS * 4) {
    var n = Math.min(MERCHANT_SCAN_CHUNK_ROWS * 4, lastRow - start + 1);
    var vals = sheet.getRange(start, info.index[source] + 1, n, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var raw = str_(vals[i][0]);
      if (!raw) continue;
      var k = normKey_(raw);
      counts[k] = (counts[k] || 0) + 1;
      if (!labels[k]) labels[k] = raw;
    }
  }
  var existing = readTable_(SHEETS.USAK_CONFIG, { required: ['nilai_kolom_usak', 'kategori'] }).rows;
  var have = {};
  for (i = 0; i < existing.length; i++) have[normKey_(existing[i].nilai_kolom_usak)] = true;
  var rows = [];
  for (var key in counts) {
    if (!have[key]) rows.push([labels[key], '', 'Ditemukan di kolom ' + source + ' (' + counts[key] + ' merchant). Isi kategori: USAK atau BELUM_USAK.']);
  }
  if (rows.length) writeRowsByHeader_(getSheet_(SHEETS.USAK_CONFIG), SHEET_SCHEMAS.UsakConfig, rows);
  bumpVersion_('CONFIG_VERSION');
  var lines = ['Kolom sumber USAK: ' + source, rows.length + ' nilai baru ditambahkan ke UsakConfig (kategori dikosongkan).'];
  lines.push('Nilai yang ditemukan: ' + Object.keys(counts).map(function (k) { return labels[k] + ' (' + counts[k] + ')'; }).join(', '));
  lines.push('Lengkapi kolom kategori sesuai definisi bisnis resmi, lalu jalankan "Bersihkan cache aplikasi".');
  return lines;
}

/** Ganti isi PriorityRules dengan aturan bawaan (prioritas Tiering) dan atur PRIORITY_MIN_SCORE. */
function applyDefaultPriorityRules() {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }
  if (ui) {
    var resp = ui.alert('Terapkan aturan prioritas bawaan',
      'Isi sheet PriorityRules akan diganti dengan aturan bawaan (prioritas Tiering) dan Settings PRIORITY_MIN_SCORE diatur ke ' +
      DEFAULT_SETTINGS.PRIORITY_MIN_SCORE.nilai + '. Perubahan manual Anda di PriorityRules akan hilang. Lanjutkan?', ui.ButtonSet.YES_NO);
    if (resp !== ui.Button.YES) return;
  }
  return runAdmin_('Aturan prioritas bawaan', applyDefaultPriorityRules_);
}

function applyDefaultPriorityRules_() {
  var sheet = getSheet_(SHEETS.PRIORITY_RULES);
  ensureHeaders_(sheet, SHEET_SCHEMAS.PriorityRules);
  var last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, Math.max(sheet.getLastColumn(), 1)).clearContent();
  writeRowsByHeader_(sheet, SHEET_SCHEMAS.PriorityRules, DEFAULT_PRIORITY_RULES);
  var min = DEFAULT_SETTINGS.PRIORITY_MIN_SCORE;
  var table = readTable_(SHEETS.SETTINGS, { required: ['kunci', 'nilai'] });
  var row = null;
  for (var i = 0; i < table.rows.length; i++) if (str_(table.rows[i].kunci).toUpperCase() === 'PRIORITY_MIN_SCORE') row = table.rows[i];
  if (row) updateObjectFields_(SHEETS.SETTINGS, row._row, { nilai: min.nilai });
  else writeRowsByHeader_(getSheet_(SHEETS.SETTINGS), SHEET_SCHEMAS.Settings, [['PRIORITY_MIN_SCORE', min.nilai, min.keterangan]]);
  bumpVersion_('CONFIG_VERSION');
  clearConfigMemo_();
  var cfg = loadConfig_();
  return [DEFAULT_PRIORITY_RULES.length + ' aturan prioritas diterapkan (' + cfg.rules.list.length + ' aktif).',
    'PRIORITY_MIN_SCORE = ' + min.nilai + ': merchant Tier 2, 3, 4, dan 5 ditandai perlu follow-up; Tier 1 tidak.',
    'Urutan: Tier 2 (bobot 30) > Tier 3 (20) > Tier 4 dan 5 (10).'];
}

function validateMerchantsSheet() {
  return runAdmin_('Validasi sheet Merchants', validateMerchantsSheetInPlace_);
}

/**
 * Urutkan baris Merchants menurut kode_cabang_final lalu store_id. Data satu cabang menjadi
 * satu blok sehingga login pertama tiap cabang cepat. Aman dijalankan berulang.
 */
function sortMerchantsByBranch() {
  return runAdmin_('Urutkan Merchants', sortMerchantsByBranch_);
}

function sortMerchantsByBranch_() {
  var sheet = getSheet_(SHEETS.MERCHANTS);
  var info = readHeaderInfo_(sheet, MERCHANT_COLUMNS);
  assertHeaders_(SHEETS.MERCHANTS, info, ['kode_cabang_final', 'store_id']);
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow < 3) return ['Tidak ada cukup baris untuk diurutkan.'];
  withLock_(function () {
    sheet.getRange(2, 1, lastRow - 1, lastCol).sort([
      { column: info.index.kode_cabang_final + 1, ascending: true },
      { column: info.index.store_id + 1, ascending: true },
    ]);
  });
  bumpVersion_('DATA_VERSION');
  var layout = merchantBranchLayout_();
  var lines = [
    (lastRow - 1) + ' baris diurutkan menurut kode_cabang_final lalu store_id.',
    'Cabang: ' + layout.branches + ', segmen: ' + layout.segments + (layout.sorted ? ' (terurut per cabang).' : ' (MASIH tidak terurut; periksa sel kode_cabang_final).'),
    'Catatan: rumus atau referensi lain yang bergantung pada nomor baris perlu diperiksa.',
  ];
  return lines.concat(buildBranchIndex_());
}

/**
 * Bangun sheet BranchIndex: untuk setiap cabang yang barisnya satu blok kontigu, simpan nomor baris
 * awal dan akhir. Pemuatan cabang lalu hanya membaca blok itu (dan memvalidasinya). Cabang yang
 * barisnya terpecah tidak diindeks (dibaca dengan pemindaian lambat) sampai sheet diurutkan.
 * Jalankan ulang setiap kali isi/urutan Merchants berubah.
 */
function buildBranchIndex() {
  return runAdmin_('Bangun indeks cabang', buildBranchIndex_);
}

function buildBranchIndex_() {
  var cfg = loadConfig_();
  var pad = cfg.settings.KODE_CABANG_PAD_LENGTH;
  var sheet = getSheet_(SHEETS.MERCHANTS);
  var info = readHeaderInfo_(sheet, MERCHANT_COLUMNS);
  assertHeaders_(SHEETS.MERCHANTS, info, ['kode_cabang_final']);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new AppError('VALIDATION_ERROR', 'Sheet Merchants belum berisi data.');
  var colValues = function (name) {
    var idx = info.index[name];
    return idx === undefined ? null : sheet.getRange(2, idx + 1, lastRow - 1, 1).getValues();
  };
  var kodes = colValues('kode_cabang_final');
  var namas = colValues('nama_cabang_final');
  var areas = colValues('nama_area_final');
  var grades = colValues(cfg.usak.source);
  var tiers = colValues('Tiering');
  // Metrik performa & dana per cabang (jumlah dan banyak data), untuk tampilan area/region.
  var metricCols = PERFORMANCE_METRICS.map(function (name) { return { name: name, values: colValues(name) }; });
  var kategoriMemo = {};
  var runs = {}, order = [], prev = null, summary = {};
  for (var i = 0; i < kodes.length; i++) {
    var k = normKode_(kodes[i][0], pad);
    if (!k) { prev = null; continue; }
    var row = i + 2;
    if (k !== prev) {
      if (!runs[k]) { runs[k] = []; order.push(k); }
      runs[k].push({ start: row, end: row });
      prev = k;
    } else {
      runs[k][runs[k].length - 1].end = row;
    }
    var sm = summary[k];
    if (!sm) sm = summary[k] = { nama: '', area: '', usak: 0, belum: 0, dicek: 0, sums: {}, counts: {}, grades: {}, cross: {} };
    for (var mc = 0; mc < metricCols.length; mc++) {
      if (!metricCols[mc].values) continue;
      var nv = toNumber_(metricCols[mc].values[i][0]);
      if (nv !== null) {
        var mn = metricCols[mc].name;
        sm.sums[mn] = (sm.sums[mn] || 0) + nv;
        sm.counts[mn] = (sm.counts[mn] || 0) + 1;
      }
    }
    var gv = grades ? str_(grades[i][0]) : '';
    sm.grades[gv] = (sm.grades[gv] || 0) + 1;
    var tv = tiers ? str_(tiers[i][0]) : '';
    var gx = sm.cross[gv] || (sm.cross[gv] = {});
    gx[tv] = (gx[tv] || 0) + 1;
    if (!sm.nama && namas) sm.nama = str_(namas[i][0]);
    if (!sm.area && areas) sm.area = str_(areas[i][0]);
    var raw = grades ? grades[i][0] : '';
    var memoKey = String(raw);
    var kat = kategoriMemo[memoKey];
    if (!kat) kat = kategoriMemo[memoKey] = classifyUsak_(raw, cfg.usak);
    if (kat === USAK_KATEGORI.USAK) sm.usak++;
    else if (kat === USAK_KATEGORI.BELUM_USAK) sm.belum++;
    else sm.dicek++;
  }
  order.sort();
  var stamp = isoNow_(), out = [], split = [], total = 0;
  for (i = 0; i < order.length; i++) {
    var rs = runs[order[i]];
    if (rs.length !== 1) { split.push(order[i] + ' (' + rs.length + ' blok)'); continue; }
    var smy = summary[order[i]];
    out.push([order[i], rs[0].start, rs[0].end, rs[0].end - rs[0].start + 1, stamp, smy.nama, smy.area, smy.usak, smy.belum, smy.dicek, JSON.stringify({ s: smy.sums, c: smy.counts, g: smy.grades, x: smy.cross })]);
    total += rs[0].end - rs[0].start + 1;
  }
  var idxSheet = getSheet_(SHEETS.BRANCH_INDEX, true) || getSpreadsheet_().insertSheet(SHEETS.BRANCH_INDEX);
  ensureHeaders_(idxSheet, SHEET_SCHEMAS.BranchIndex);
  applyTextFormats_(idxSheet, null, SHEET_TEXT_COLUMNS.BranchIndex);
  var oldLast = idxSheet.getLastRow();
  if (oldLast > 1) idxSheet.getRange(2, 1, oldLast - 1, SHEET_SCHEMAS.BranchIndex.length).clearContent();
  if (out.length) {
    ensureRowCapacity_(idxSheet, out.length + 1);
    var canonical = SHEET_SCHEMAS.BranchIndex;
    writeRowsByHeader_(idxSheet, canonical, out.map(function (r) {
      return [forceTextCell_(String(r[0])), r[1], r[2], r[3], r[4], sanitizeCell_(String(r[5])), sanitizeCell_(String(r[6])), r[7], r[8], r[9], String(r[10])];
    }));
  }
  bumpVersion_('DATA_VERSION');
  var lines = [out.length + ' cabang diindeks (' + total + ' baris).'];
  if (split.length) {
    lines.push(split.length + ' cabang TIDAK diindeks karena barisnya terpecah: ' + split.slice(0, 10).join(', ') + (split.length > 10 ? ', …' : ''));
    lines.push('Jalankan "Urutkan Merchants per cabang" lalu bangun indeks lagi.');
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Wilayah: area dan region                                            */
/* ------------------------------------------------------------------ */

function slugKode_(s) {
  return String(s).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Isi sheet Wilayah dengan semua area yang ada di BranchIndex (nama_area_final, kode_area bawaan
 * AREA-<NAMA>, jumlah cabang & merchant). Kolom nama_region dan kode_region diisi admin. Aman diulang:
 * baris yang sudah ada tidak ditimpa (hanya jumlahnya diperbarui). Juga memastikan role area & region ada.
 */
function prepareWilayahSheet() {
  return runAdmin_('Siapkan sheet Wilayah', prepareWilayahSheet_);
}

function prepareWilayahSheet_() {
  clearConfigMemo_();
  var cfg = loadConfig_();
  var idx = readTable_(SHEETS.BRANCH_INDEX, { optional: true, required: ['kode_cabang', 'nama_area'] });
  var areas = {};
  idx.rows.forEach(function (r) {
    var area = str_(r.nama_area);
    if (!area) return;
    var a = areas[normKey_(area)] || (areas[normKey_(area)] = { nama: area, cabang: 0, merchant: 0 });
    a.cabang++;
    a.merchant += toNumber_(r.jumlah) || 0;
  });
  var keys = Object.keys(areas).sort();
  if (!keys.length) {
    throw new AppError('VALIDATION_ERROR', 'BranchIndex belum memuat nama_area. Jalankan "Bangun indeks cabang" (Setup dulu bila perlu).');
  }
  var sheet = getSheet_(SHEETS.WILAYAH, true) || getSpreadsheet_().insertSheet(SHEETS.WILAYAH);
  ensureHeaders_(sheet, SHEET_SCHEMAS.Wilayah);
  applyTextFormats_(sheet, null, SHEET_TEXT_COLUMNS.Wilayah);
  var existing = readTable_(SHEETS.WILAYAH, { required: ['nama_area_final'] }).rows;
  var have = {}, usedKodes = {};
  existing.forEach(function (r) { have[normKey_(r.nama_area_final)] = r; if (str_(r.kode_area)) usedKodes[str_(r.kode_area).toUpperCase()] = true; });
  var fresh = [], updated = 0;
  keys.forEach(function (k) {
    var a = areas[k];
    if (have[k]) {
      updateObjectFields_(SHEETS.WILAYAH, have[k]._row, { jumlah_cabang: a.cabang, jumlah_merchant: a.merchant });
      updated++;
      return;
    }
    var base = 'AREA-' + slugKode_(a.nama.replace(/^AREA\s+/i, ''));
    var kode = base.substring(0, 32), n = 2;
    while (usedKodes[kode]) kode = base.substring(0, 28) + '-' + (n++);
    usedKodes[kode] = true;
    fresh.push([a.nama, kode, '', '', a.cabang, a.merchant]);
  });
  if (fresh.length) {
    ensureRowCapacity_(sheet, sheet.getLastRow() + fresh.length + 1);
    writeRowsByHeader_(sheet, SHEET_SCHEMAS.Wilayah, fresh.map(function (r) {
      return r.map(function (v, i) { return typeof v === 'string' ? cellValueFor_(SHEETS.WILAYAH, SHEET_SCHEMAS.Wilayah[i], v) : v; });
    }));
  }
  // role area & region (hanya melihat) bila belum ada
  var roleSheet = getSheet_(SHEETS.ROLES);
  var haveRoles = {};
  readTable_(SHEETS.ROLES, { required: ['role'] }).rows.forEach(function (r) { haveRoles[normKey_(r.role)] = true; });
  var newRoles = DEFAULT_ROLES.filter(function (r) { return SCOPE_ROLES.indexOf(r[0]) >= 0 && !haveRoles[r[0]]; });
  if (newRoles.length) writeRowsByHeader_(roleSheet, SHEET_SCHEMAS.Roles, newRoles);
  bumpVersion_('DATA_VERSION');
  bumpVersion_('CONFIG_VERSION');
  var lines = [fresh.length + ' area baru ditambahkan ke Wilayah, ' + updated + ' area diperbarui jumlahnya (total ' + keys.length + ' area).'];
  if (newRoles.length) lines.push('Role ditambahkan ke sheet Roles: ' + newRoles.map(function (r) { return r[0]; }).join(', ') + ' (hanya melihat).');
  lines.push('Langkah berikut: isi kolom nama_region dan kode_region (mis. REG-SULUT) untuk setiap area, lalu jalankan "Buat akun area dan region".');
  return lines;
}

/**
 * Buat akun login untuk area (satu per baris Wilayah) dan region (satu per kode_region unik).
 * Akun nonaktif tanpa kata sandi sampai hash diterapkan, seperti akun cabang.
 */
function createRegionAreaAccounts() {
  return runAdmin_('Buat akun area dan region', createRegionAreaAccounts_);
}

function createRegionAreaAccounts_() {
  var wil = readTable_(SHEETS.WILAYAH, { required: ['nama_area_final', 'kode_area', 'nama_region', 'kode_region'] }).rows;
  if (!wil.length) throw new AppError('VALIDATION_ERROR', 'Sheet Wilayah kosong. Jalankan "Siapkan sheet Wilayah" dulu.');
  var users = readTable_(SHEETS.USERS).rows;
  var haveId = {}, haveKode = {};
  users.forEach(function (u) { haveId[normKey_(u.user_id)] = true; haveKode[normKey_(u.kode_cabang)] = true; });
  var rows = [], skipped = [], noRegion = [], existing = 0, regions = {};
  var add = function (kode, nama, role) {
    kode = str_(kode).toUpperCase();
    if (!BRANCH_CODE_LOGIN_PATTERN.test(kode)) { skipped.push(kode || '(kosong)'); return; }
    if (haveKode[normKey_(kode)] || haveId[normKey_(kode)]) { existing++; return; }
    haveKode[normKey_(kode)] = true; haveId[normKey_(kode)] = true;
    rows.push({ user_id: kode, kode_cabang: kode, nama_cabang: nama, password_hash: '', role: role, is_active: false });
  };
  wil.forEach(function (w) {
    add(w.kode_area, str_(w.nama_area_final), 'area');
    var kr = str_(w.kode_region).toUpperCase();
    if (!kr) { noRegion.push(str_(w.nama_area_final)); return; }
    if (!regions[kr]) { regions[kr] = str_(w.nama_region) || kr; }
  });
  Object.keys(regions).sort().forEach(function (kr) { add(kr, regions[kr], 'region'); });
  if (rows.length) {
    var usersSheet = getSheet_(SHEETS.USERS);
    ensureRowCapacity_(usersSheet, usersSheet.getLastRow() + rows.length + 1);
    applyTextFormats_(usersSheet, null, SHEET_TEXT_COLUMNS.Users);
    var canonical = SHEET_SCHEMAS.Users;
    writeRowsByHeader_(usersSheet, canonical, rows.map(function (r) {
      return canonical.map(function (col) { return cellValueFor_(SHEETS.USERS, col, r[col]); });
    }));
    bumpVersion_('USERS_VERSION');
    audit_({ user_id: 'admin', kode_cabang: '' }, 'ADMIN_CREATE_SCOPE_ACCOUNTS', '', rows.length + ' akun');
  }
  var lines = [rows.length + ' akun dibuat (' + rows.filter(function (r) { return r.role === 'area'; }).length + ' area, ' +
    rows.filter(function (r) { return r.role === 'region'; }).length + ' region), nonaktif tanpa kata sandi.', existing + ' kode sudah punya akun dan dilewati.'];
  if (noRegion.length) lines.push(noRegion.length + ' area belum punya kode_region (akun region belum dibuat untuk area itu): ' + noRegion.slice(0, 8).join(', ') + (noRegion.length > 8 ? ', …' : ''));
  if (skipped.length) lines.push(skipped.length + ' kode tidak valid untuk login dilewati: ' + skipped.slice(0, 8).join(', '));
  if (rows.length) lines.push('Langkah berikut: unduh sheet Users sebagai CSV lalu jalankan npm run passwords:bulk (mis. dengan --pattern).');
  return lines;
}

/** Ukur waktu tiap tahap pemuatan satu cabang (jalur normal dan pemindaian tanpa indeks). */
function measureBranchLoad() {
  var ui, kode = '';
  try {
    assertAdmin_();
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    showAdminResult_('Ukur waktu muat cabang', ['GAGAL: ' + e.message]);
    return;
  }
  var resp = ui.prompt('Ukur waktu muat cabang', 'Kode cabang (kosongkan untuk cabang pertama di BranchIndex):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  kode = str_(resp.getResponseText());
  runAdmin_('Ukur waktu muat cabang', function () { return measureBranchLoad_(kode); });
}

function formatTiming_(t) {
  var keys = ['dimensi_ms', 'header_ms', 'indeks_ms', 'kolom_kode_ms', 'cocok_ms', 'baca_ms', 'konversi_ms'];
  var parts = [];
  for (var i = 0; i < keys.length; i++) if (t[keys[i]] !== undefined) parts.push(keys[i].replace('_ms', '') + ' ' + t[keys[i]]);
  return parts.join(', ') + ' (ms)';
}

function measureBranchLoad_(kodeInput) {
  clearConfigMemo_();
  var cfg = loadConfig_();
  var pad = cfg.settings.KODE_CABANG_PAD_LENGTH;
  var kode = normKode_(kodeInput, pad);
  if (!kode) {
    var map = branchIndexMap_(cfg);
    var keys = Object.keys(map).sort();
    if (!keys.length) throw new AppError('VALIDATION_ERROR', 'BranchIndex kosong. Isi kode cabang atau jalankan "Bangun indeks cabang".');
    kode = keys[0];
  }
  var lines = ['Cabang: ' + kode];
  var t = Date.now();
  spreadsheetCache_ = null;
  getSpreadsheet_();
  lines.push('Buka spreadsheet: ' + (Date.now() - t) + ' ms');

  var tm1 = {};
  t = Date.now();
  var r1 = readBranchMerchantsFromSheet_(kode, cfg, { timing: tm1 });
  lines.push('Jalur normal [' + r1.scan_mode + (r1.index_stale ? ', indeks usang' : '') + ']: ' + (Date.now() - t) + ' ms, ' + r1.rows.length + ' merchant');
  lines.push('  ' + formatTiming_(tm1));

  var tm2 = {};
  t = Date.now();
  var r2 = readBranchMerchantsFromSheet_(kode, cfg, { timing: tm2, noIndex: true });
  lines.push('Tanpa indeks (pemindaian) [' + r2.scan_mode + ']: ' + (Date.now() - t) + ' ms, ' + r2.rows.length + ' merchant');
  lines.push('  ' + formatTiming_(tm2));
  if (r1.rows.length !== r2.rows.length) lines.push('PERINGATAN: jumlah merchant berbeda antara dua jalur. Bangun ulang indeks.');
  return lines;
}

/** Jumlah cabang dan segmen kontigu kode_cabang_final di sheet Merchants. */
function merchantBranchLayout_() {
  var sheet = getSheet_(SHEETS.MERCHANTS, true);
  var out = { rows: 0, branches: 0, segments: 0, sorted: true };
  if (!sheet || sheet.getLastRow() < 2) return out;
  var info = readHeaderInfo_(sheet, MERCHANT_COLUMNS);
  if (info.index.kode_cabang_final === undefined) return out;
  var pad = loadConfig_().settings.KODE_CABANG_PAD_LENGTH;
  var vals = sheet.getRange(2, info.index.kode_cabang_final + 1, sheet.getLastRow() - 1, 1).getValues();
  var seen = {}, prev = null;
  for (var i = 0; i < vals.length; i++) {
    var k = normKode_(vals[i][0], pad);
    if (k === '') continue;
    out.rows++;
    if (k !== prev) { out.segments++; prev = k; }
    if (!seen[k]) { seen[k] = true; out.branches++; }
  }
  out.sorted = out.segments === out.branches;
  return out;
}

function validateImport() {
  return runAdmin_('Validasi impor', function () {
    var run = runImportValidation_();
    var lines = importSummaryLines_(run.res, run.cfg.usak.configured);
    lines.push('Detail masalah ada di sheet ' + SHEETS.IMPORT_REPORT + '.');
    return lines;
  });
}

function applyImport() {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }
  if (ui) {
    var resp = ui.alert('Terapkan impor',
      'Seluruh isi sheet Merchants akan diganti dengan baris valid dari ' + SHEETS.IMPORT_STAGING + '. Baris error dilewati. Lanjutkan?',
      ui.ButtonSet.YES_NO);
    if (resp !== ui.Button.YES) return;
  }
  return runAdmin_('Terapkan impor', applyMerchantImport_);
}

function clearAppCache() {
  return runAdmin_('Bersihkan cache', function () {
    bumpVersion_('DATA_VERSION');
    bumpVersion_('CONFIG_VERSION');
    bumpVersion_('USERS_VERSION');
    return ['Cache data, follow-up, akun & konfigurasi dikosongkan. Perubahan sheet langsung terlihat di aplikasi.'];
  });
}
