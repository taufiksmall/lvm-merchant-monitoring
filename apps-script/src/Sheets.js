/**
 * Akses Google Sheets: membuka spreadsheet, memetakan header, membaca/menulis baris,
 * serta cache berukuran besar di CacheService.
 *
 * Seluruh akses sheet melalui fungsi bisnis di file ini — tidak ada operasi umum
 * yang menerima nama range dari klien.
 */

var spreadsheetCache_ = null;

function getSpreadsheet_() {
  if (spreadsheetCache_) return spreadsheetCache_;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  try {
    spreadsheetCache_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    console.error('Gagal membuka spreadsheet: ' + e.message);
    throw new AppError('CONFIG_ERROR', 'Spreadsheet data tidak dapat dibuka. Periksa SPREADSHEET_ID.');
  }
  if (!spreadsheetCache_) {
    throw new AppError('CONFIG_ERROR', 'SPREADSHEET_ID belum diatur di Script Properties.');
  }
  return spreadsheetCache_;
}

function getSheet_(name, optional) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet && !optional) {
    throw new AppError('SHEET_MISSING', 'Sheet "' + name + '" tidak ditemukan. Jalankan menu Setup sheet.', { sheet: name });
  }
  return sheet;
}

/** Jalankan operasi sheet dan ubah error Google Sheets menjadi AppError yang konsisten. */
function sheetOp_(fn) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error('Kesalahan Google Sheets: ' + (e && e.stack ? e.stack : e));
    throw new AppError('SHEET_ERROR', 'Gagal mengakses Google Sheets. Coba lagi beberapa saat.');
  }
}

/**
 * Petakan header aktual ke daftar kolom kanonik. Pencocokan toleran terhadap
 * huruf besar/kecil dan spasi, namun nama header di sheet TIDAK diubah.
 */
function buildHeaderIndex_(rawHeaders, canonical) {
  var byNorm = {};
  for (var i = 0; i < rawHeaders.length; i++) {
    var key = normHeader_(rawHeaders[i]);
    if (key && byNorm[key] === undefined) byNorm[key] = i;
  }
  var index = {}, missing = [], nonCanonical = [];
  for (var c = 0; c < canonical.length; c++) {
    var col = canonical[c];
    var idx = byNorm[normHeader_(col)];
    if (idx === undefined) {
      missing.push(col);
    } else {
      index[col] = idx;
      if (str_(rawHeaders[idx]) !== col) nonCanonical.push({ ditemukan: str_(rawHeaders[idx]), seharusnya: col });
    }
  }
  var known = {};
  for (c = 0; c < canonical.length; c++) known[normHeader_(canonical[c])] = true;
  var extra = [];
  for (i = 0; i < rawHeaders.length; i++) {
    var h = str_(rawHeaders[i]);
    if (h && !known[normHeader_(h)]) extra.push(h);
  }
  return { index: index, missing: missing, nonCanonical: nonCanonical, extra: extra };
}

function assertHeaders_(sheetName, headerInfo, required) {
  var missing = [];
  for (var i = 0; i < required.length; i++) {
    if (headerInfo.index[required[i]] === undefined) missing.push(required[i]);
  }
  if (missing.length) {
    throw new AppError('HEADER_MISMATCH',
      'Header sheet "' + sheetName + '" tidak sesuai. Kolom tidak ditemukan: ' + missing.join(', ') + '.',
      { sheet: sheetName, kolom_hilang: missing });
  }
}

/**
 * Baca seluruh tabel sebuah sheet pendukung sebagai array objek dengan kunci kanonik.
 * Setiap objek memiliki `_row` (nomor baris di sheet).
 */
function readTable_(sheetName, options) {
  options = options || {};
  var canonical = SHEET_SCHEMAS[sheetName];
  return sheetOp_(function () {
    var sheet = getSheet_(sheetName, options.optional);
    if (!sheet) return { rows: [], headerInfo: null, sheet: null };
    var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
    if (lastRow < 1 || lastCol < 1) {
      if (options.optional) return { rows: [], headerInfo: null, sheet: sheet };
      throw new AppError('HEADER_MISMATCH', 'Sheet "' + sheetName + '" belum memiliki header. Jalankan menu Setup sheet.', { sheet: sheetName });
    }
    var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headerInfo = buildHeaderIndex_(values[0], canonical);
    assertHeaders_(sheetName, headerInfo, options.required || canonical);
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var empty = true;
      for (var x = 0; x < row.length; x++) { if (!isBlank_(row[x])) { empty = false; break; } }
      if (empty) continue;
      var obj = { _row: r + 1 };
      for (var c = 0; c < canonical.length; c++) {
        var idx = headerInfo.index[canonical[c]];
        obj[canonical[c]] = idx === undefined ? '' : row[idx];
      }
      rows.push(obj);
    }
    return { rows: rows, headerInfo: headerInfo, sheet: sheet };
  });
}

/** Header aktual sebuah sheet + indeksnya. */
function readHeaderInfo_(sheet, canonical) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return buildHeaderIndex_([], canonical);
  return buildHeaderIndex_(sheet.getRange(1, 1, 1, lastCol).getValues()[0], canonical);
}

/** Susun nilai baris mengikuti urutan header aktual (bukan urutan kanonik). */
function buildRowValues_(sheet, sheetName, obj) {
  var canonical = SHEET_SCHEMAS[sheetName];
  var lastCol = sheet.getLastColumn();
  var info = readHeaderInfo_(sheet, canonical);
  var row = [];
  for (var i = 0; i < lastCol; i++) row.push('');
  for (var key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    var idx = info.index[key];
    if (idx === undefined) continue;
    row[idx] = cellValueFor_(sheetName, key, obj[key]);
  }
  return { row: row, info: info };
}

/** Nilai aman untuk ditulis ke sel: cegah formula injection & jaga kolom teks tetap teks. */
function cellValueFor_(sheetName, key, v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return v;
  var textCols = SHEET_TEXT_COLUMNS[sheetName] || [];
  return textCols.indexOf(key) >= 0 ? forceTextCell_(v) : sanitizeCell_(v);
}

/** Tambah satu baris ke sheet pendukung. appendRow bersifat atomik sehingga aman tanpa lock. */
function appendObject_(sheetName, obj) {
  sheetOp_(function () {
    var sheet = getSheet_(sheetName);
    var built = buildRowValues_(sheet, sheetName, obj);
    assertHeaders_(sheetName, built.info, SHEET_SCHEMAS[sheetName]);
    sheet.appendRow(built.row);
  });
}

/** Perbarui beberapa kolom pada baris tertentu. Panggil di dalam withLock_. */
function updateObjectFields_(sheetName, rowNumber, fields) {
  return sheetOp_(function () {
    var sheet = getSheet_(sheetName);
    var info = readHeaderInfo_(sheet, SHEET_SCHEMAS[sheetName]);
    for (var key in fields) {
      if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
      var idx = info.index[key];
      if (idx === undefined) continue;
      sheet.getRange(rowNumber, idx + 1).setValue(cellValueFor_(sheetName, key, fields[key]));
    }
  });
}

/** Cari nomor baris berdasarkan nilai unik pada satu kolom (mis. follow_up_id, session_hash). */
function findRowByValue_(sheetName, column, value) {
  return sheetOp_(function () {
    var sheet = getSheet_(sheetName);
    var info = readHeaderInfo_(sheet, SHEET_SCHEMAS[sheetName]);
    assertHeaders_(sheetName, info, [column]);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    var lastCol = sheet.getLastColumn();
    var colValues = sheet.getRange(2, info.index[column] + 1, lastRow - 1, 1).getValues();
    var target = String(value);
    for (var i = 0; i < colValues.length; i++) {
      if (str_(colValues[i][0]) === target) {
        var rowValues = sheet.getRange(i + 2, 1, 1, lastCol).getValues()[0];
        var obj = { _row: i + 2 };
        var canonical = SHEET_SCHEMAS[sheetName];
        for (var c = 0; c < canonical.length; c++) {
          var idx = info.index[canonical[c]];
          obj[canonical[c]] = idx === undefined ? '' : rowValues[idx];
        }
        return obj;
      }
    }
    return null;
  });
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    throw new AppError('BUSY', 'Server sedang sibuk. Coba lagi beberapa saat.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

var CACHE_CHUNK_CHARS_ = 90000;
var CACHE_MAX_CHARS_ = 4000000;

function scriptCache_() {
  return CacheService.getScriptCache();
}

function cacheGetJson_(key) {
  try {
    var cache = scriptCache_();
    var head = cache.get(key);
    if (!head) return null;
    if (head.indexOf('chunks:') !== 0) return JSON.parse(head);
    var n = Number(head.substring(7));
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(key + ':' + i);
    var parts = cache.getAll(keys);
    var text = '';
    for (i = 0; i < n; i++) {
      var p = parts[key + ':' + i];
      if (p === undefined || p === null) return null;
      text += p;
    }
    return JSON.parse(text);
  } catch (e) {
    console.warn('Cache baca gagal untuk ' + key + ': ' + e.message);
    return null;
  }
}

function cachePutJson_(key, value, ttlSeconds) {
  try {
    var text = JSON.stringify(value);
    if (text.length > CACHE_MAX_CHARS_) return;
    var ttl = Math.max(1, Math.min(21600, Math.floor(ttlSeconds)));
    var cache = scriptCache_();
    if (text.length <= CACHE_CHUNK_CHARS_) {
      cache.put(key, text, ttl);
      return;
    }
    var entries = {};
    var n = 0;
    for (var off = 0; off < text.length; off += CACHE_CHUNK_CHARS_) {
      entries[key + ':' + n] = text.substring(off, off + CACHE_CHUNK_CHARS_);
      n++;
    }
    cache.putAll(entries, ttl);
    cache.put(key, 'chunks:' + n, ttl);
  } catch (e) {
    console.warn('Cache tulis gagal untuk ' + key + ': ' + e.message);
  }
}

function cacheRemove_(key) {
  try {
    scriptCache_().remove(key);
  } catch (e) {
    console.warn('Cache hapus gagal untuk ' + key + ': ' + e.message);
  }
}

/** Versi data/konfigurasi: menaikkan versi membuat semua cache lama tidak terpakai. */
function getVersion_(name) {
  return PropertiesService.getScriptProperties().getProperty(name) || '1';
}

function bumpVersion_(name) {
  var v = String(Number(getVersion_(name)) + 1);
  PropertiesService.getScriptProperties().setProperty(name, v);
  return v;
}
