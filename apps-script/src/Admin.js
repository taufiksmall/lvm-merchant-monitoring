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
      .addItem('Atur kata sandi pengguna…', 'showSetPasswordDialog')
      .addItem('Cabut sesi satu pengguna…', 'revokeUserSessionsPrompt')
      .addItem('Cabut semua sesi', 'revokeAllSessions')
      .addItem('Bersihkan sesi kedaluwarsa', 'cleanupExpiredSessions')
      .addItem('Pasang pembersihan sesi harian', 'installCleanupTrigger')
      .addSeparator()
      .addItem('Isi daftar nilai grading_usak ke UsakConfig', 'fillGradingUsakValues')
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
    { name: SHEETS.USAK_CONFIG, headers: SHEET_SCHEMAS.UsakConfig, text: SHEET_TEXT_COLUMNS.UsakConfig },
    { name: SHEETS.PRIORITY_RULES, headers: SHEET_SCHEMAS.PriorityRules, text: SHEET_TEXT_COLUMNS.PriorityRules, defaults: DEFAULT_PRIORITY_RULES },
    { name: SHEETS.OPTIONS, headers: SHEET_SCHEMAS.Options, defaults: DEFAULT_OPTIONS },
    { name: SHEETS.SETTINGS, headers: SHEET_SCHEMAS.Settings, text: SHEET_TEXT_COLUMNS.Settings },
    { name: SHEETS.AUDIT_LOG, headers: SHEET_SCHEMAS.AuditLog, text: SHEET_TEXT_COLUMNS.AuditLog },
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
    lines.push('PERHATIAN: UsakConfig belum berisi nilai grading_usak berkategori USAK. Isi sesuai definisi bisnis resmi.');
  }
  bumpVersion_('CONFIG_VERSION');
  if (!lines.length) lines.push('Struktur sheet sudah sesuai. Tidak ada perubahan.');
  return lines;
}

function loadUsakConfigSafe_() {
  try { return loadUsakConfig_(); } catch (e) { return null; }
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
 * Tambahkan nilai grading_usak yang ditemukan di data ke UsakConfig dengan kategori kosong.
 * Tidak menebak kategori: admin wajib mengisi kategori sesuai definisi bisnis resmi.
 */
function fillGradingUsakValues() {
  return runAdmin_('Nilai grading_usak', fillGradingUsakValues_);
}

function fillGradingUsakValues_() {
  var sheet = getSheet_(SHEETS.MERCHANTS);
  var info = readHeaderInfo_(sheet, MERCHANT_COLUMNS);
  assertHeaders_(SHEETS.MERCHANTS, info, ['grading_usak']);
  var lastRow = sheet.getLastRow();
  var counts = {}, labels = {};
  if (lastRow >= 2) {
    var vals = sheet.getRange(2, info.index.grading_usak + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var raw = str_(vals[i][0]);
      if (!raw) continue;
      var k = normKey_(raw);
      counts[k] = (counts[k] || 0) + 1;
      if (!labels[k]) labels[k] = raw;
    }
  }
  var existing = readTable_(SHEETS.USAK_CONFIG, { required: ['nilai_grading_usak', 'kategori'] }).rows;
  var have = {};
  for (i = 0; i < existing.length; i++) have[normKey_(existing[i].nilai_grading_usak)] = true;
  var rows = [];
  for (var key in counts) {
    if (!have[key]) rows.push([labels[key], '', 'Ditemukan di data (' + counts[key] + ' merchant). Isi kategori: USAK atau BELUM_USAK.']);
  }
  if (rows.length) writeRowsByHeader_(getSheet_(SHEETS.USAK_CONFIG), SHEET_SCHEMAS.UsakConfig, rows);
  bumpVersion_('CONFIG_VERSION');
  var lines = [rows.length + ' nilai baru ditambahkan ke UsakConfig (kategori dikosongkan).'];
  lines.push('Nilai yang ditemukan: ' + Object.keys(counts).map(function (k) { return labels[k] + ' (' + counts[k] + ')'; }).join(', '));
  lines.push('Lengkapi kolom kategori sesuai definisi bisnis resmi, lalu jalankan "Bersihkan cache aplikasi".');
  return lines;
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
    return ['Cache data, follow-up & konfigurasi dikosongkan. Perubahan sheet langsung terlihat di aplikasi.'];
  });
}
