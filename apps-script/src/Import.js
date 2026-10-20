/**
 * Validasi & impor data merchant.
 *
 * Alur yang disarankan:
 *   1. (Opsional) Validasi CSV di komputer: `npm run validate:csv -- data.csv`.
 *   2. Unggah CSV ke sheet "Import_Merchants" (File > Impor > Ganti sheet saat ini,
 *      matikan "Konversi teks menjadi angka, tanggal, dan formula").
 *   3. Menu LVM Admin > Validasi impor  -> hasil di sheet ImportReport.
 *   4. Menu LVM Admin > Terapkan impor ke Merchants.
 *
 * validateMerchantTable_ adalah fungsi murni (tanpa akses sheet) yang juga dipakai
 * oleh skrip validasi CSV lokal agar aturan validasinya sama persis.
 */

var IMPORT_LEVEL = { ERROR: 'ERROR', WARNING: 'PERINGATAN' };

/**
 * @param {Array} headers Header sumber.
 * @param {Array<Array>} rows Baris data (tanpa header).
 * @param {{usak: Object, tz: string, pad: string|number}} opts
 */
function validateMerchantTable_(headers, rows, opts) {
  opts = opts || {};
  var tz = opts.tz || 'Asia/Jakarta';
  var usakCfg = opts.usak || { map: {}, configured: false };
  var info = buildHeaderIndex_(headers, MERCHANT_COLUMNS);
  var issues = [];
  var seenHeaders = {}, dupHeaders = [];
  for (var h = 0; h < headers.length; h++) {
    var hk = normHeader_(headers[h]);
    if (!hk) continue;
    if (seenHeaders[hk]) dupHeaders.push(str_(headers[h]));
    seenHeaders[hk] = true;
  }
  var missingRequired = MERCHANT_REQUIRED_COLUMNS.filter(function (c) { return info.index[c] === undefined; });
  var result = {
    header: { missing: info.missing, missing_required: missingRequired, extra: info.extra, non_canonical: info.nonCanonical, duplicate: dupHeaders },
    fatal: missingRequired.length > 0 || dupHeaders.length > 0,
    issues: issues,
    validRows: [],
    summary: {
      total_baris: 0, baris_valid: 0, baris_error: 0, peringatan: 0,
      grading_usak_kosong: 0, grading_usak_tidak_dikenali: 0, nilai_grading_usak_tidak_dikenali: [],
      per_cabang: {},
    },
  };
  if (result.fatal) return result;

  var seenIds = {};
  var unknownValues = {};
  var add = function (rowNum, storeId, kolom, masalah, level) {
    issues.push({ baris: rowNum, store_id: storeId, kolom: kolom, masalah: masalah, tingkat: level });
    if (level === IMPORT_LEVEL.WARNING) result.summary.peringatan++;
  };

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var rowNum = r + 2; // nomor baris di file/sheet sumber (baris 1 = header)
    var empty = true;
    for (var x = 0; x < row.length; x++) if (!isBlank_(row[x])) { empty = false; break; }
    if (empty) continue;
    result.summary.total_baris++;
    var get = function (col) { var i = info.index[col]; return i === undefined ? '' : row[i]; };
    var storeId = str_(get('store_id'));
    var rowErrors = 0;

    for (var q = 0; q < MERCHANT_REQUIRED_VALUES.length; q++) {
      if (isBlank_(get(MERCHANT_REQUIRED_VALUES[q]))) {
        add(rowNum, storeId, MERCHANT_REQUIRED_VALUES[q], 'Wajib diisi.', IMPORT_LEVEL.ERROR);
        rowErrors++;
      }
    }
    if (storeId) {
      if (storeId.length > 64 || !/^[A-Za-z0-9._\-\/]+$/.test(storeId)) {
        add(rowNum, storeId, 'store_id', 'Hanya boleh huruf, angka, titik, garis bawah, tanda hubung, atau garis miring (maks. 64).', IMPORT_LEVEL.ERROR);
        rowErrors++;
      } else if (seenIds[storeId]) {
        add(rowNum, storeId, 'store_id', 'store_id ganda (pertama di baris ' + seenIds[storeId] + ').', IMPORT_LEVEL.ERROR);
        rowErrors++;
      } else {
        seenIds[storeId] = rowNum;
      }
    }

    var out = new Array(MERCHANT_COLUMNS.length);
    for (var c = 0; c < MERCHANT_COLUMNS.length; c++) {
      var col = MERCHANT_COLUMNS[c];
      var raw = get(col);
      if (MERCHANT_NUMBER_COLUMNS.indexOf(col) >= 0) {
        var n = toNumber_(raw);
        if (!isBlank_(raw) && n === null) add(rowNum, storeId, col, 'Bukan angka yang valid: "' + str_(raw).substring(0, 40) + '".', IMPORT_LEVEL.WARNING);
        out[c] = n === null ? str_(raw) : n;
      } else if (MERCHANT_DATE_COLUMNS.indexOf(col) >= 0) {
        var d = toIsoDate_(raw, tz);
        if (d === null) add(rowNum, storeId, col, 'Format tanggal tidak dikenali: "' + str_(raw).substring(0, 40) + '". Gunakan yyyy-mm-dd atau dd/mm/yyyy.', IMPORT_LEVEL.WARNING);
        out[c] = d === null ? str_(raw) : d;
      } else {
        out[c] = str_(raw);
      }
    }

    var gu = str_(get('grading_usak'));
    if (!gu) {
      result.summary.grading_usak_kosong++;
      add(rowNum, storeId, 'grading_usak', 'grading_usak kosong: tidak dihitung sebagai USAK dan ditandai untuk pemeriksaan.', IMPORT_LEVEL.WARNING);
    } else if (usakCfg.configured && !usakCfg.map[normKey_(gu)]) {
      result.summary.grading_usak_tidak_dikenali++;
      unknownValues[gu] = (unknownValues[gu] || 0) + 1;
      add(rowNum, storeId, 'grading_usak', 'Nilai "' + gu + '" tidak ada di UsakConfig: ditandai untuk pemeriksaan.', IMPORT_LEVEL.WARNING);
    }

    if (rowErrors) {
      result.summary.baris_error++;
      continue;
    }
    result.summary.baris_valid++;
    var kode = normKode_(get('kode_cabang_final'), opts.pad);
    result.summary.per_cabang[kode] = (result.summary.per_cabang[kode] || 0) + 1;
    result.validRows.push(out);
  }
  for (var uv in unknownValues) result.summary.nilai_grading_usak_tidak_dikenali.push({ nilai: uv, jumlah: unknownValues[uv] });
  return result;
}

/** Ringkasan teks hasil validasi (untuk dialog admin & skrip CLI). */
function importSummaryLines_(res, usakConfigured) {
  var lines = [];
  if (res.header.missing_required.length) lines.push('Kolom wajib tidak ditemukan: ' + res.header.missing_required.join(', '));
  if (res.header.duplicate.length) lines.push('Header ganda: ' + res.header.duplicate.join(', '));
  if (res.fatal) {
    lines.push('Impor tidak dapat diproses sampai header diperbaiki.');
    return lines;
  }
  var s = res.summary;
  lines.push('Total baris data: ' + s.total_baris);
  lines.push('Baris valid: ' + s.baris_valid);
  lines.push('Baris error (akan dilewati): ' + s.baris_error);
  lines.push('Peringatan: ' + s.peringatan);
  if (res.header.missing.length) lines.push('Kolom opsional tidak ada (akan kosong): ' + res.header.missing.join(', '));
  if (res.header.extra.length) lines.push('Kolom tambahan tidak dikenal (tidak diimpor): ' + res.header.extra.join(', '));
  if (res.header.non_canonical.length) {
    lines.push('Header dipetakan ke nama resmi: ' + res.header.non_canonical.map(function (x) { return x.ditemukan + ' -> ' + x.seharusnya; }).join(', '));
  }
  lines.push('grading_usak kosong: ' + s.grading_usak_kosong);
  if (!usakConfigured) lines.push('UsakConfig belum dikonfigurasi: nilai grading_usak belum dapat diperiksa.');
  else lines.push('grading_usak tidak dikenali: ' + s.grading_usak_tidak_dikenali +
    (s.nilai_grading_usak_tidak_dikenali.length ? ' (' + s.nilai_grading_usak_tidak_dikenali.map(function (x) { return x.nilai + ': ' + x.jumlah; }).join(', ') + ')' : ''));
  var cab = Object.keys(s.per_cabang);
  lines.push('Jumlah cabang: ' + cab.length);
  return lines;
}

function readStagingTable_() {
  var sheet = getSheet_(SHEETS.IMPORT_STAGING, true);
  if (!sheet) {
    throw new AppError('SHEET_MISSING', 'Sheet "' + SHEETS.IMPORT_STAGING + '" tidak ditemukan. Unggah CSV ke sheet dengan nama tersebut.');
  }
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) throw new AppError('VALIDATION_ERROR', 'Sheet impor kosong.');
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  return { headers: values[0], rows: values.slice(1) };
}

function runImportValidation_() {
  clearConfigMemo_();
  var cfg = loadConfig_();
  var staging = readStagingTable_();
  var res = validateMerchantTable_(staging.headers, staging.rows, {
    usak: cfg.usak, tz: settingTz_(cfg), pad: cfg.settings.KODE_CABANG_PAD_LENGTH,
  });
  writeImportReport_(res, cfg.usak.configured, false);
  return { res: res, cfg: cfg };
}

function writeImportReport_(res, usakConfigured, applied) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEETS.IMPORT_REPORT) || ss.insertSheet(SHEETS.IMPORT_REPORT);
  sheet.clear();
  var lines = [['Laporan impor ' + isoNow_() + (applied ? ' (DITERAPKAN)' : ' (validasi saja)'), '', '', '', '']];
  var summary = importSummaryLines_(res, usakConfigured);
  for (var i = 0; i < summary.length; i++) lines.push([summary[i], '', '', '', '']);
  lines.push(['', '', '', '', '']);
  lines.push(['baris', 'store_id', 'kolom', 'tingkat', 'masalah']);
  var max = Math.min(res.issues.length, 5000);
  for (i = 0; i < max; i++) {
    var it = res.issues[i];
    lines.push([it.baris, sanitizeCell_(it.store_id), it.kolom, it.tingkat, sanitizeCell_(it.masalah)]);
  }
  if (res.issues.length > max) lines.push(['...', '', '', '', (res.issues.length - max) + ' masalah lain tidak ditampilkan.']);
  sheet.getRange(1, 1, lines.length, 5).setValues(lines);
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
}

/** Terapkan baris valid dari Import_Merchants ke Merchants (mengganti seluruh isi data). */
function applyMerchantImport_() {
  var run = runImportValidation_();
  var res = run.res;
  if (res.fatal) return importSummaryLines_(res, run.cfg.usak.configured);
  if (!res.validRows.length) throw new AppError('VALIDATION_ERROR', 'Tidak ada baris valid untuk diimpor.');
  withLock_(function () {
    var sheet = getSheet_(SHEETS.MERCHANTS);
    var lastRow = sheet.getLastRow(), lastCol = Math.max(sheet.getLastColumn(), MERCHANT_COLUMNS.length);
    if (lastRow > 0) sheet.getRange(1, 1, lastRow, lastCol).clearContent();
    sheet.getRange(1, 1, 1, MERCHANT_COLUMNS.length).setValues([MERCHANT_COLUMNS]);
    ensureRowCapacity_(sheet, res.validRows.length + 1);
    applyTextFormats_(sheet, MERCHANT_COLUMNS, MERCHANT_TEXT_COLUMNS);
    var textIdx = MERCHANT_TEXT_COLUMNS.map(function (c) { return MERCHANT_COLUMNS.indexOf(c); });
    var CHUNK = 5000;
    for (var off = 0; off < res.validRows.length; off += CHUNK) {
      var chunk = res.validRows.slice(off, off + CHUNK).map(function (row) {
        return row.map(function (v, i) {
          if (typeof v !== 'string') return v;
          return textIdx.indexOf(i) >= 0 ? forceTextCell_(v) : sanitizeCell_(v);
        });
      });
      sheet.getRange(2 + off, 1, chunk.length, MERCHANT_COLUMNS.length).setValues(chunk);
    }
  });
  bumpVersion_('DATA_VERSION');
  PropertiesService.getScriptProperties().setProperty('LAST_IMPORT_AT', isoNow_());
  writeImportReport_(res, run.cfg.usak.configured, true);
  var lines = importSummaryLines_(res, run.cfg.usak.configured);
  lines.unshift('Impor diterapkan: ' + res.validRows.length + ' merchant ditulis ke sheet Merchants.');
  return lines;
}

function ensureRowCapacity_(sheet, rowsNeeded) {
  var max = sheet.getMaxRows();
  if (max < rowsNeeded) sheet.insertRowsAfter(max, rowsNeeded - max);
}
