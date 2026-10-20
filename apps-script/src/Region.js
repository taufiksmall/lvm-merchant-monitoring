/**
 * Pemantauan akun area dan region.
 *
 * Cakupan akun ditentukan di server dari sheet Wilayah (area -> region) dan BranchIndex
 * (cabang -> area, beserta ringkasan USAK per cabang). Frontend tidak pernah mengirim cakupan
 * sebagai bukti hak akses: parameter kode_cabang hanya diterima bila cabang itu ada di cakupan akun.
 */

function accessKind_(ctx) {
  return SCOPE_ROLES.indexOf(ctx.role) >= 0 ? ctx.role : 'cabang';
}

/** Baris sheet Wilayah ternormalisasi. Di-cache per DATA_VERSION. */
function loadWilayah_() {
  var key = 'wl:' + getVersion_('DATA_VERSION');
  var cached = cacheGetJson_(key);
  if (cached) return cached;
  var table = readTable_(SHEETS.WILAYAH, { optional: true, required: ['nama_area_final', 'kode_area'] });
  var rows = [];
  for (var i = 0; i < table.rows.length; i++) {
    var r = table.rows[i];
    var area = str_(r.nama_area_final);
    if (!area) continue;
    rows.push({ area: area, kode_area: str_(r.kode_area).toUpperCase(), region: str_(r.nama_region), kode_region: str_(r.kode_region).toUpperCase() });
  }
  cachePutJson_(key, rows, 600);
  return rows;
}

/** Ringkasan semua cabang yang diindeks (snapshot saat Bangun indeks cabang dijalankan). */
function loadBranchSummaries_(cfg) {
  var key = 'bs:' + getVersion_('DATA_VERSION');
  var cached = cacheGetJson_(key);
  if (cached) return cached;
  var table = readTable_(SHEETS.BRANCH_INDEX, { optional: true, required: ['kode_cabang'] });
  var pad = cfg.settings.KODE_CABANG_PAD_LENGTH;
  var rows = [];
  for (var i = 0; i < table.rows.length; i++) {
    var r = table.rows[i];
    var kode = normKode_(r.kode_cabang, pad);
    if (!kode) continue;
    rows.push({
      kode: kode,
      nama: str_(r.nama_cabang),
      area: str_(r.nama_area),
      total: toNumber_(r.jumlah) || 0,
      usak: toNumber_(r.jumlah_usak) || 0,
      belum: toNumber_(r.jumlah_belum_usak) || 0,
      perlu_dicek: toNumber_(r.jumlah_perlu_dicek) || 0,
      diperbarui: toIsoTimestamp_(r.diperbarui),
    });
  }
  cachePutJson_(key, rows, 600);
  return rows;
}

/** Cakupan akun area/region: nama wilayah dan daftar cabang di dalamnya. */
function scopeFor_(ctx, cfg) {
  var kind = accessKind_(ctx);
  if (kind === 'cabang') throw new AppError('FORBIDDEN', 'Fitur ini hanya untuk akun area atau region.');
  var login = normKey_(ctx.kode_cabang);
  var wil = loadWilayah_();
  var areas = {}, nama = '', matched = 0;
  for (var i = 0; i < wil.length; i++) {
    var w = wil[i];
    if (kind === 'area' && normKey_(w.kode_area) === login) { areas[normKey_(w.area)] = w.area; nama = w.area; matched++; }
    if (kind === 'region' && w.kode_region && normKey_(w.kode_region) === login) { areas[normKey_(w.area)] = w.area; nama = w.region || w.kode_region; matched++; }
  }
  if (!matched) {
    throw new AppError('FORBIDDEN', 'Cakupan wilayah akun Anda belum diatur. Hubungi administrator (sheet Wilayah).');
  }
  var branches = loadBranchSummaries_(cfg).filter(function (b) { return areas[normKey_(b.area)] !== undefined; });
  return { type: kind, nama: nama, areas: Object.keys(areas).map(function (k) { return areas[k]; }).sort(), branches: branches };
}

/**
 * Konteks efektif untuk aksi per cabang. Akun cabang memakai cabangnya sendiri (parameter
 * kode_cabang diabaikan). Akun area/region wajib menyebut cabang yang berada di cakupannya.
 */
function effectiveCtx_(ctx, payload) {
  if (accessKind_(ctx) === 'cabang') return ctx;
  var cfg = loadConfig_();
  var kode = normKode_(payload && payload.kode_cabang, cfg.settings.KODE_CABANG_PAD_LENGTH);
  if (!kode) throw new AppError('VALIDATION_ERROR', 'Pilih cabang terlebih dahulu.', { fields: { kode_cabang: 'kode_cabang wajib diisi.' } });
  var scope = scopeFor_(ctx, cfg);
  var found = null;
  for (var i = 0; i < scope.branches.length; i++) if (scope.branches[i].kode === kode) found = scope.branches[i];
  if (!found) throw new AppError('NOT_FOUND', 'Cabang tidak ditemukan di cakupan Anda.');
  var copy = {};
  for (var k in ctx) if (Object.prototype.hasOwnProperty.call(ctx, k)) copy[k] = ctx[k];
  copy.kode_cabang = kode;
  copy.nama_cabang = found.nama || kode;
  return copy;
}

/** Ringkasan pemantauan: cabang dalam cakupan, diurutkan dari rasio USAK terendah. */
function regionSummary_(ctx) {
  var cfg = loadConfig_();
  var scope = scopeFor_(ctx, cfg);
  var rows = scope.branches.map(function (b) {
    var ind = computeUsakIndicators_(b.total, b.usak);
    return {
      kode_cabang: b.kode,
      nama_cabang: b.nama || b.kode,
      nama_area: b.area,
      total_merchant: b.total,
      merchant_usak: b.usak,
      perlu_dicek: b.perlu_dicek,
      rasio_usak: ind.rasio_usak,
      target_usak_50: ind.target_usak_50,
      gap_usak_50: ind.gap_usak_50,
      tercapai: ind.tercapai,
    };
  });
  rows.sort(function (a, b) {
    if (a.rasio_usak !== b.rasio_usak) return a.rasio_usak - b.rasio_usak;
    if (a.gap_usak_50 !== b.gap_usak_50) return b.gap_usak_50 - a.gap_usak_50;
    return a.nama_cabang < b.nama_cabang ? -1 : (a.nama_cabang > b.nama_cabang ? 1 : 0);
  });

  var total = 0, usak = 0, dicek = 0, byArea = {};
  scope.branches.forEach(function (b) {
    total += b.total; usak += b.usak; dicek += b.perlu_dicek;
    var a = byArea[b.area] || (byArea[b.area] = { nama_area: b.area, cabang: 0, total_merchant: 0, merchant_usak: 0 });
    a.cabang++; a.total_merchant += b.total; a.merchant_usak += b.usak;
  });
  var agg = computeUsakIndicators_(total, usak);
  agg.configured = cfg.usak.configured;
  agg.perlu_dicek = dicek;
  var areas = Object.keys(byArea).sort().map(function (k) {
    var a = byArea[k], ind = computeUsakIndicators_(a.total_merchant, a.merchant_usak);
    a.rasio_usak = ind.rasio_usak; a.gap_usak_50 = ind.gap_usak_50; a.tercapai = ind.tercapai;
    return a;
  });
  var stamp = '';
  scope.branches.forEach(function (b) { if (b.diperbarui > stamp) stamp = b.diperbarui; });

  var warnings = configWarnings_(cfg);
  if (!scope.branches.length) {
    warnings.push({ code: 'NO_BRANCHES', message: 'Belum ada cabang di cakupan Anda. Admin perlu menjalankan "Bangun indeks cabang" dan memeriksa sheet Wilayah.' });
  }
  return {
    cakupan: { jenis: scope.type, nama: scope.nama, areas: scope.areas },
    usak: agg,
    cabang_total: rows.length,
    cabang_tercapai: rows.filter(function (r) { return r.tercapai; }).length,
    cabang_belum: rows.filter(function (r) { return !r.tercapai; }).length,
    cabang: rows,
    area: areas,
    warnings: warnings,
    data: { diperbarui: stamp, snapshot_date: cfg.settings.DATA_SNAPSHOT_DATE || '' },
  };
}

var REGION_SEARCH_LIMIT = 40;
var REGION_SEARCH_MIN_CHARS = 3;
var REGION_SEARCH_FIELDS = ['store_name', 'mid_static', 'store_id', 'owner_name'];

/** Huruf kolom A1 dari indeks kolom (0). */
function colLetter_(idx) {
  var n = idx + 1, s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * Cari merchant di semua cabang dalam cakupan akun area/region. Pencarian memakai TextFinder pada
 * blok baris cabang-cabang di cakupan (dari BranchIndex), sehingga hanya cabang akun yang ikut
 * dicari; baris hasil divalidasi lagi terhadap kode cabang blok. Bidang: nama merchant, MID,
 * store_id, nama pemilik. Rekening/CIF/saldo tidak dicari dan tidak dikirim.
 */
function searchScopeMerchants_(ctx, payload) {
  var cfg = loadConfig_();
  var scope = scopeFor_(ctx, cfg);
  var q = cleanText_(payload && payload.q, 100);
  if (q.length < REGION_SEARCH_MIN_CHARS) {
    throw new AppError('VALIDATION_ERROR', 'Kata kunci minimal ' + REGION_SEARCH_MIN_CHARS + ' karakter.', { fields: { q: 'Minimal ' + REGION_SEARCH_MIN_CHARS + ' karakter.' } });
  }
  var map = branchIndexMap_(cfg);
  var blocks = [];
  scope.branches.forEach(function (b) { if (map[b.kode]) blocks.push({ kode: b.kode, nama: b.nama || b.kode, area: b.area, start: map[b.kode].start, end: map[b.kode].end }); });
  var result = { q: q, items: [], truncated: false, cabang_dicari: blocks.length, bidang: REGION_SEARCH_FIELDS };
  if (!blocks.length) return result;

  var sheet = getSheet_(SHEETS.MERCHANTS);
  var lastCol = sheet.getLastColumn(), lastRow = sheet.getLastRow();
  var info = readHeaderInfo_(sheet, MERCHANT_COLUMNS);
  assertHeaders_(SHEETS.MERCHANTS, info, merchantRequiredColumns_(cfg));
  var blockOf = function (row) {
    for (var i = 0; i < blocks.length; i++) if (row >= blocks[i].start && row <= blocks[i].end) return blocks[i];
    return null;
  };

  var found = {}, rows = [];
  for (var f = 0; f < REGION_SEARCH_FIELDS.length && rows.length < REGION_SEARCH_LIMIT; f++) {
    var idx = info.index[REGION_SEARCH_FIELDS[f]];
    if (idx === undefined) continue;
    var letter = colLetter_(idx);
    var a1 = blocks.map(function (b) { return letter + b.start + ':' + letter + Math.min(b.end, lastRow); });
    var finder = sheet.getRangeList(a1).createTextFinder(q).matchCase(false).matchEntireCell(false);
    var hit;
    while ((hit = finder.findNext()) !== null) {
      var row = hit.getRow();
      if (found[row]) continue;
      found[row] = true;
      rows.push(row);
      if (rows.length >= REGION_SEARCH_LIMIT) { result.truncated = true; break; }
    }
  }

  var tz = settingTz_(cfg), pad = cfg.settings.KODE_CABANG_PAD_LENGTH;
  var items = [];
  rows.forEach(function (rowNum) {
    var block = blockOf(rowNum);
    if (!block) return;
    var values = sheet.getRange(rowNum, 1, 1, lastCol).getValues()[0];
    var m = rowToMerchant_(convertMerchantRow_(values, info, tz, pad));
    if (m.kode_cabang_final !== block.kode) return; // indeks usang: lewati baris yang tidak cocok
    var kategori = classifyUsak_(m[cfg.usak.source], cfg.usak);
    items.push({
      kode_cabang: block.kode, nama_cabang: block.nama, nama_area: block.area,
      store_id: m.store_id, mid_static: m.mid_static, store_name: m.store_name, owner_name: m.owner_name,
      status_trx: m.status_trx, grading_trx: m.grading_trx, Tiering: m.Tiering,
      usak: usakInfo_(kategori, m, cfg.usak.source),
    });
  });
  items.sort(function (a, b) {
    var x = normKey_(a.nama_cabang), y = normKey_(b.nama_cabang);
    if (x !== y) return x < y ? -1 : 1;
    x = normKey_(a.store_name); y = normKey_(b.store_name);
    return x < y ? -1 : (x > y ? 1 : 0);
  });
  result.items = items;
  return result;
}
