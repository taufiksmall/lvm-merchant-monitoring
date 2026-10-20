/**
 * Data merchant per cabang: pemuatan (dengan cache), pengayaan (kategori USAK, follow-up,
 * prioritas), daftar dengan pencarian/filter/urutan/pagination, detail, dan reveal data sensitif.
 *
 * Semua fungsi di sini menerima `ctx` dari requireSession_ dan hanya membaca merchant
 * dengan kode_cabang_final = ctx.kode_cabang. Tidak ada parameter cabang dari frontend.
 */

var merchantColIndexMemo_ = null;

/** Posisi setiap kolom kanonik di array baris merchant yang di-cache. */
function merchantColIndex_() {
  if (!merchantColIndexMemo_) {
    merchantColIndexMemo_ = {};
    for (var i = 0; i < MERCHANT_COLUMNS.length; i++) merchantColIndexMemo_[MERCHANT_COLUMNS[i]] = i;
  }
  return merchantColIndexMemo_;
}

function normalizeMerchantValue_(col, v, tz, pad) {
  if (MERCHANT_NUMBER_COLUMNS.indexOf(col) >= 0) return toNumber_(v);
  if (MERCHANT_DATE_COLUMNS.indexOf(col) >= 0) {
    var d = toIsoDate_(v, tz);
    return d === null ? str_(v) : d;
  }
  if (col === 'kode_cabang_final') return normKode_(v, pad);
  return str_(v);
}

/** Indeks baris (0) milik kode cabang. */
function branchMatchIndexes_(kodes, kode, pad) {
  var out = [];
  for (var i = 0; i < kodes.length; i++) if (normKode_(kodes[i][0], pad) === kode) out.push(i);
  return out;
}

/** Gabungkan indeks baris menjadi segmen; indeks yang berjarak <= gap masuk segmen yang sama. */
function mergeSegments_(matches, gap) {
  var segments = [], cur = null;
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    if (cur && m - cur.end - 1 <= gap) cur.end = m;
    else { cur = { start: m, end: m }; segments.push(cur); }
  }
  return segments;
}

/** Batasi jumlah segmen (jumlah panggilan getRange) dengan memperlebar celah penggabungan. */
function planSegments_(matches, totalRows) {
  var gaps = [MERCHANT_SEGMENT_GAP, 1000, 5000, 20000, totalRows];
  var segments = [];
  for (var g = 0; g < gaps.length; g++) {
    segments = mergeSegments_(matches, gaps[g]);
    if (segments.length <= MERCHANT_MAX_SEGMENTS) break;
  }
  return segments;
}

/**
 * Baca merchant satu cabang dari sheet. Kolom kode cabang dibaca dulu; setelah itu hanya
 * segmen baris cabang tersebut yang dibaca (dalam potongan MERCHANT_SCAN_CHUNK_ROWS).
 * scan_mode: 'block' (satu segmen, data terurut per cabang), 'runs' (beberapa segmen),
 * 'full' (data tersebar: banyak baris cabang lain ikut terbaca, lambat).
 */
function readBranchMerchantsFromSheet_(kode, cfg) {
  return sheetOp_(function () {
    var sheet = getSheet_(SHEETS.MERCHANTS);
    var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
    if (lastCol < 1) {
      throw new AppError('HEADER_MISMATCH', 'Sheet "Merchants" belum memiliki header.', { sheet: SHEETS.MERCHANTS });
    }
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var info = buildHeaderIndex_(headers, MERCHANT_COLUMNS);
    assertHeaders_(SHEETS.MERCHANTS, info, merchantRequiredColumns_(cfg));
    var result = { rows: [], missing_columns: info.missing, duplicates: 0, loaded_at: isoNow_(), scan_mode: 'block' };
    if (lastRow < 2) return result;

    var pad = cfg.settings.KODE_CABANG_PAD_LENGTH;
    var tz = settingTz_(cfg);
    var kcol = info.index.kode_cabang_final;
    var sidCol = info.index.store_id;
    var kodes = sheet.getRange(2, kcol + 1, lastRow - 1, 1).getValues();
    var matches = branchMatchIndexes_(kodes, kode, pad);
    if (!matches.length) return result;
    var segments = planSegments_(matches, kodes.length);

    // waste = baris bukan milik cabang yang ikut terbaca. Besar => data tersebar (lambat).
    var covered = 0;
    for (var s = 0; s < segments.length; s++) covered += segments[s].end - segments[s].start + 1;
    var waste = covered - matches.length;
    if (waste > Math.max(MERCHANT_SCAN_MIN_ROWS, kodes.length * MERCHANT_SCAN_FULL_RATIO)) result.scan_mode = 'full';
    else if (segments.length > 1) result.scan_mode = 'runs';

    var seen = {};
    for (s = 0; s < segments.length; s++) {
      for (var off = segments[s].start; off <= segments[s].end; off += MERCHANT_SCAN_CHUNK_ROWS) {
        var n = Math.min(MERCHANT_SCAN_CHUNK_ROWS, segments[s].end - off + 1);
        var block = sheet.getRange(2 + off, 1, n, lastCol).getValues();
        for (var r = 0; r < block.length; r++) {
          var row = block[r];
          if (normKode_(row[kcol], pad) !== kode) continue;
          var storeId = str_(row[sidCol]);
          if (!storeId) continue;
          if (seen[storeId]) { result.duplicates++; continue; }
          seen[storeId] = true;
          var arr = new Array(MERCHANT_COLUMNS.length);
          for (var c = 0; c < MERCHANT_COLUMNS.length; c++) {
            var col = MERCHANT_COLUMNS[c];
            var idx = info.index[col];
            arr[c] = normalizeMerchantValue_(col, idx === undefined ? '' : row[idx], tz, pad);
          }
          result.rows.push(arr);
        }
      }
    }
    return result;
  });
}

function loadBranchMerchants_(ctx, cfg) {
  var key = 'm:' + getVersion_('DATA_VERSION') + ':' + ctx.kode_cabang;
  var cached = cacheGetJson_(key);
  if (cached) return cached;
  var data = readBranchMerchantsFromSheet_(ctx.kode_cabang, cfg);
  cachePutJson_(key, data, settingInt_(cfg, 'CACHE_TTL_SECONDS', 60, 21600));
  return data;
}

function rowToMerchant_(arr) {
  var m = {};
  for (var i = 0; i < MERCHANT_COLUMNS.length; i++) m[MERCHANT_COLUMNS[i]] = arr[i];
  return m;
}

/**
 * Bangun tampilan cabang: setiap merchant diperkaya dengan kategori USAK (dari
 * kolom sumber USAK + UsakConfig), ringkasan follow-up terakhir, dan skor prioritas.
 */
function buildBranchView_(ctx, cfg) {
  var data = loadBranchMerchants_(ctx, cfg);
  var followUps = loadBranchFollowUps_(ctx, cfg);
  var latest = latestFollowUpByStore_(followUps);
  var tz = settingTz_(cfg);
  var today = todayYmd_(tz);
  var minScore = settingInt_(cfg, 'PRIORITY_MIN_SCORE', 1, 1000);
  var items = [];
  for (var i = 0; i < data.rows.length; i++) {
    var m = rowToMerchant_(data.rows[i]);
    var kategori = classifyUsak_(m[cfg.usak.source], cfg.usak);
    var fu = followUpSummary_(latest[m.store_id] || null, cfg, today, tz);
    var virtuals = {
      _kategori_usak: kategori,
      _status_follow_up: fu.status,
      _follow_up_jatuh_tempo: fu.jatuh_tempo,
      _ada_follow_up: fu.ada,
      _hari_sejak_follow_up: fu.hari_sejak,
    };
    var pr = evaluatePriority_(m, virtuals, cfg.rules.list);
    items.push({
      m: m,
      kategori: kategori,
      fu: fu,
      score: pr.score,
      reasons: pr.reasons,
      perlu: pr.score >= minScore && !fu.final,
    });
  }
  return {
    items: items,
    followUps: followUps,
    today: today,
    tz: tz,
    missing_columns: data.missing_columns,
    duplicates: data.duplicates,
    loaded_at: data.loaded_at,
    scan_mode: data.scan_mode || 'block',
  };
}

function findBranchItem_(view, storeId) {
  for (var i = 0; i < view.items.length; i++) if (view.items[i].m.store_id === storeId) return view.items[i];
  throw new AppError('NOT_FOUND', 'Merchant tidak ditemukan atau bukan kelolaan cabang Anda.');
}

function requireStoreId_(payload) {
  var id = str_(payload && payload.store_id);
  if (!id || id.length > 64 || !/^[A-Za-z0-9._\-\/]+$/.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'store_id tidak valid.', { fields: { store_id: 'store_id tidak valid.' } });
  }
  return id;
}

/** Pastikan store_id milik cabang pengguna. */
function assertStoreInBranch_(ctx, cfg, storeId) {
  var data = loadBranchMerchants_(ctx, cfg);
  var col = merchantColIndex_().store_id;
  for (var i = 0; i < data.rows.length; i++) if (data.rows[i][col] === storeId) return true;
  throw new AppError('NOT_FOUND', 'Merchant tidak ditemukan atau bukan kelolaan cabang Anda.');
}

/* ------------------------------------------------------------------ */
/* Prioritas                                                           */
/* ------------------------------------------------------------------ */

function evaluatePriority_(m, virtuals, rules) {
  var score = 0, reasons = [];
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    var all = true;
    for (var c = 0; c < rule.conditions.length; c++) {
      if (!matchCondition_(rule.conditions[c], m, virtuals)) { all = false; break; }
    }
    if (all) {
      score += rule.bobot;
      reasons.push({ id: rule.id, label: rule.label, bobot: rule.bobot });
    }
  }
  return { score: score, reasons: reasons };
}

function matchCondition_(cond, m, virtuals) {
  var v = cond.column.charAt(0) === '_' ? virtuals[cond.column] : m[cond.column];
  var blank = v === null || v === undefined || v === '';
  switch (cond.op) {
    case 'empty': return blank;
    case 'not_empty': return !blank;
    case 'eq': return valueEquals_(v, cond);
    case 'neq': return !valueEquals_(v, cond);
    case 'in': return cond.values.indexOf(condKey_(v)) >= 0;
    case 'not_in': return cond.values.indexOf(condKey_(v)) < 0;
    case 'contains': return !blank && condKey_(v).indexOf(normKey_(cond.value)) >= 0;
    case 'gt': case 'gte': case 'lt': case 'lte':
      var n = typeof v === 'number' ? v : toNumber_(v);
      if (n === null || cond.number === null) return false;
      if (cond.op === 'gt') return n > cond.number;
      if (cond.op === 'gte') return n >= cond.number;
      if (cond.op === 'lt') return n < cond.number;
      return n <= cond.number;
  }
  return false;
}

function condKey_(v) {
  if (v === true) return 'true';
  if (v === false) return 'false';
  return normKey_(v);
}

function valueEquals_(v, cond) {
  if (typeof v === 'boolean') return v === toBool_(cond.value);
  if (typeof v === 'number') return cond.number !== null && v === cond.number;
  return condKey_(v) === normKey_(cond.value);
}

/* ------------------------------------------------------------------ */
/* Daftar merchant                                                     */
/* ------------------------------------------------------------------ */

function parseListParams_(payload, cfg) {
  payload = payload || {};
  var fields = {};
  var q = str_(payload.q);
  if (q.length > 100) fields.q = 'Kata kunci maksimal 100 karakter.';

  var filters = {};
  var rawFilters = payload.filters || {};
  var filterCols = merchantFilterColumns_(cfg);
  for (var i = 0; i < filterCols.length; i++) {
    var col = filterCols[i];
    var vals = toStringArray_(rawFilters[col]).map(function (x) { return normKey_(x); });
    if (vals.length) filters[col] = vals;
  }

  var kategori = toStringArray_(payload.kategori_usak).map(function (x) { return str_(x).toUpperCase(); });
  var expanded = [];
  for (i = 0; i < kategori.length; i++) {
    if (kategori[i] === 'PERLU_CEK') { expanded.push(USAK_KATEGORI.KOSONG, USAK_KATEGORI.TIDAK_DIKENALI); continue; }
    if (!USAK_KATEGORI[kategori[i]]) { fields.kategori_usak = 'Kategori USAK tidak dikenal.'; continue; }
    expanded.push(kategori[i]);
  }

  var followUp = str_(payload.follow_up).toLowerCase();
  if (followUp && !FOLLOW_UP_FILTERS[followUp]) fields.follow_up = 'Filter follow-up tidak dikenal.';

  var statusFu = str_(payload.status_follow_up).toUpperCase();
  if (statusFu && statusFu !== BLANK_FILTER_VALUE && !findOption_(cfg.options.status_follow_up, statusFu)) {
    fields.status_follow_up = 'Status follow-up tidak dikenal.';
  }

  var sort = str_(payload.sort) || 'priority';
  if (!MERCHANT_SORT_FIELDS[sort]) fields.sort = 'Kolom pengurutan tidak dikenal.';
  var dir = str_(payload.dir).toLowerCase();
  if (dir && dir !== 'asc' && dir !== 'desc') fields.dir = 'Arah pengurutan harus asc atau desc.';
  if (!dir) dir = (MERCHANT_SORT_FIELDS[sort] === 'number') ? 'desc' : 'asc';

  if (Object.keys(fields).length) throw new AppError('VALIDATION_ERROR', 'Parameter daftar merchant tidak valid.', { fields: fields });

  var maxSize = settingInt_(cfg, 'MAX_PAGE_SIZE', 10, 500);
  var defSize = Math.min(settingInt_(cfg, 'DEFAULT_PAGE_SIZE', 5, 500), maxSize);
  return {
    q: normKey_(q),
    filters: filters,
    kategori: expanded,
    follow_up: followUp,
    status_follow_up: statusFu,
    sort: sort,
    dir: dir,
    page: clampInt_(payload.page, 1, 100000, 1),
    page_size: clampInt_(payload.page_size, 1, maxSize, defSize),
  };
}

function matchesListFilters_(it, p, ctx) {
  var m = it.m;
  if (p.q) {
    var hit = normKey_(m.store_name).indexOf(p.q) >= 0 ||
      normKey_(m.store_id).indexOf(p.q) >= 0 ||
      normKey_(m.owner_name).indexOf(p.q) >= 0;
    if (!hit && ctx.permissions.search_account_number) {
      var digits = p.q.replace(/\D/g, '');
      if (digits.length >= 4) hit = str_(m.account_number).replace(/\D/g, '').indexOf(digits) >= 0;
    }
    if (!hit) return false;
  }
  for (var col in p.filters) {
    var key = normKey_(m[col]);
    var wanted = p.filters[col];
    if (!(wanted.indexOf(key) >= 0 || (key === '' && wanted.indexOf(normKey_(BLANK_FILTER_VALUE)) >= 0))) return false;
  }
  if (p.kategori.length && p.kategori.indexOf(it.kategori) < 0) return false;
  if (p.status_follow_up) {
    if (p.status_follow_up === BLANK_FILTER_VALUE) { if (it.fu.ada) return false; }
    else if (it.fu.status !== p.status_follow_up) return false;
  }
  switch (p.follow_up) {
    case 'perlu': return it.perlu;
    case 'tidak_perlu': return !it.perlu;
    case 'jatuh_tempo': return it.fu.jatuh_tempo;
    case 'belum_pernah': return !it.fu.ada;
    case 'sudah_ada': return it.fu.ada;
  }
  return true;
}

function sortValue_(it, field) {
  if (field === 'priority') return it.score;
  if (field === 'next_follow_up') return it.fu.berikutnya || null;
  if (field === 'last_follow_up') return it.fu.terakhir || null;
  if (field === 'store_name') return normKey_(it.m.store_name);
  return it.m[field];
}

function sortItems_(items, field, dir) {
  var sign = dir === 'asc' ? 1 : -1;
  items.sort(function (a, b) {
    var va = sortValue_(a, field), vb = sortValue_(b, field);
    var na = va === null || va === undefined || va === '';
    var nb = vb === null || vb === undefined || vb === '';
    if (na !== nb) return na ? 1 : -1; // nilai kosong selalu di akhir
    if (!na && va !== vb) return (va < vb ? -1 : 1) * sign;
    if (field === 'priority') {
      var sa = a.m.sv_mtd === null ? -Infinity : a.m.sv_mtd, sb = b.m.sv_mtd === null ? -Infinity : b.m.sv_mtd;
      if (sa !== sb) return sb - sa;
    }
    var ta = normKey_(a.m.store_name), tb = normKey_(b.m.store_name);
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.m.store_id < b.m.store_id ? -1 : (a.m.store_id > b.m.store_id ? 1 : 0);
  });
}

function usakInfo_(kategori, m, source) {
  return {
    kategori: kategori,
    label: USAK_KATEGORI_LABELS[kategori],
    perlu_dicek: kategori === USAK_KATEGORI.KOSONG || kategori === USAK_KATEGORI.TIDAK_DIKENALI,
    nilai: m[source],
    source_column: source,
  };
}

function priorityInfo_(it) {
  return { score: it.score, reasons: it.reasons, perlu_follow_up: it.perlu };
}

function listItem_(it, cfg) {
  var out = {};
  var cols = merchantListColumns_(cfg);
  for (var i = 0; i < cols.length; i++) out[cols[i]] = it.m[cols[i]];
  out.usak = usakInfo_(it.kategori, it.m, cfg.usak.source);
  out.follow_up = it.fu;
  out.priority = priorityInfo_(it);
  return out;
}

function listMerchants_(ctx, payload) {
  var cfg = loadConfig_();
  var p = parseListParams_(payload, cfg);
  var view = buildBranchView_(ctx, cfg);
  var filtered = view.items.filter(function (it) { return matchesListFilters_(it, p, ctx); });
  sortItems_(filtered, p.sort, p.dir);
  var total = filtered.length;
  var totalPages = Math.max(1, Math.ceil(total / p.page_size));
  var page = Math.min(p.page, totalPages);
  var start = (page - 1) * p.page_size;
  var searchFields = ['store_name', 'store_id', 'owner_name'];
  if (ctx.permissions.search_account_number) searchFields.push('account_number');
  return {
    items: filtered.slice(start, start + p.page_size).map(function (it) { return listItem_(it, cfg); }),
    page: page,
    page_size: p.page_size,
    total: total,
    total_pages: totalPages,
    total_branch: view.items.length,
    sort: p.sort,
    dir: p.dir,
    search_fields: searchFields,
    usak_configured: cfg.usak.configured,
    usak_source: cfg.usak.source,
    today: view.today,
  };
}

/** Nilai unik kolom filter di cabang pengguna (untuk dropdown filter). */
function filterOptions_(ctx) {
  var cfg = loadConfig_();
  var data = loadBranchMerchants_(ctx, cfg);
  var colIdx = merchantColIndex_();
  var out = {};
  var filterCols = merchantFilterColumns_(cfg);
  for (var f = 0; f < filterCols.length; f++) {
    var col = filterCols[f];
    var counts = {}, labels = {};
    for (var i = 0; i < data.rows.length; i++) {
      var raw = str_(data.rows[i][colIdx[col]]);
      var key = normKey_(raw);
      counts[key] = (counts[key] || 0) + 1;
      if (!labels[key]) labels[key] = raw;
    }
    var list = [];
    for (var k in counts) {
      var item = { value: k === '' ? BLANK_FILTER_VALUE : labels[k], label: k === '' ? '(Kosong)' : labels[k], count: counts[k] };
      if (col === cfg.usak.source) item.kategori = classifyUsak_(labels[k], cfg.usak);
      list.push(item);
    }
    list.sort(function (a, b) {
      if (a.value === BLANK_FILTER_VALUE) return 1;
      if (b.value === BLANK_FILTER_VALUE) return -1;
      return String(a.label).localeCompare(String(b.label), 'id', { numeric: true });
    });
    out[col] = list;
  }
  var kategoriOpts = [];
  for (var kk in USAK_KATEGORI_LABELS) kategoriOpts.push({ value: kk, label: USAK_KATEGORI_LABELS[kk] });
  kategoriOpts.push({ value: 'PERLU_CEK', label: 'Perlu dicek (kosong/tidak dikenali)' });
  var fuOpts = [];
  for (var fk in FOLLOW_UP_FILTERS) fuOpts.push({ value: fk, label: FOLLOW_UP_FILTERS[fk] });
  return {
    columns: out,
    kategori_usak: kategoriOpts,
    follow_up: fuOpts,
    status_follow_up: cfg.options.status_follow_up.map(function (o) { return { value: o.kode, label: o.label }; }),
    sort_fields: Object.keys(MERCHANT_SORT_FIELDS),
    usak_configured: cfg.usak.configured,
    usak_source: cfg.usak.source,
  };
}

/* ------------------------------------------------------------------ */
/* Detail & data sensitif                                              */
/* ------------------------------------------------------------------ */

function merchantDetail_(ctx, payload) {
  var storeId = requireStoreId_(payload);
  var cfg = loadConfig_();
  var view = buildBranchView_(ctx, cfg);
  var it = findBranchItem_(view, storeId);
  var merchant = {};
  for (var i = 0; i < MERCHANT_COLUMNS.length; i++) {
    var col = MERCHANT_COLUMNS[i];
    if (SENSITIVE_FINANCIAL_COLUMNS.indexOf(col) >= 0) continue;
    if (col === 'grading_usak' && cfg.usak.source !== 'grading_usak') continue;
    merchant[col] = SENSITIVE_IDENTITY_COLUMNS.indexOf(col) >= 0 ? maskValue_(it.m[col], 4) : it.m[col];
  }
  var history = followUpsForStore_(view.followUps, storeId).map(function (f) { return publicFollowUp_(f, ctx, cfg); });
  return {
    merchant: merchant,
    masked_fields: SENSITIVE_IDENTITY_COLUMNS,
    restricted_fields: SENSITIVE_FINANCIAL_COLUMNS,
    can_reveal_identity: ctx.permissions.view_sensitive,
    can_reveal_financial: ctx.permissions.view_financial,
    usak: usakInfo_(it.kategori, it.m, cfg.usak.source),
    usak_configured: cfg.usak.configured,
    follow_up: it.fu,
    priority: priorityInfo_(it),
    follow_ups: history,
    can_write_follow_up: ctx.permissions.write_follow_up,
    options: {
      status_follow_up: activeOptions_(cfg.options.status_follow_up),
      progres_usak: activeOptions_(cfg.options.progres_usak),
    },
    today: view.today,
  };
}

function activeOptions_(list) {
  return list.filter(function (o) { return o.aktif; }).map(function (o) { return { value: o.kode, label: o.label, final: o.final }; });
}

/**
 * Buka nilai asli data sensitif satu merchant. Hanya untuk role yang berhak,
 * dan setiap akses dicatat di AuditLog sebelum data dikirim.
 */
function revealSensitive_(ctx, payload) {
  var storeId = requireStoreId_(payload);
  var group = str_(payload.group) || 'identity';
  if (group !== 'identity' && group !== 'financial') {
    throw new AppError('VALIDATION_ERROR', 'Kelompok data tidak dikenal.', { fields: { group: 'Gunakan identity atau financial.' } });
  }
  if (group === 'identity' && !ctx.permissions.view_sensitive) {
    throw new AppError('FORBIDDEN', 'Role Anda tidak diizinkan membuka nomor rekening/CIF.');
  }
  if (group === 'financial' && !ctx.permissions.view_financial) {
    throw new AppError('FORBIDDEN', 'Role Anda tidak diizinkan membuka data saldo/keuangan.');
  }
  var cfg = loadConfig_();
  var data = loadBranchMerchants_(ctx, cfg);
  var colIdx = merchantColIndex_();
  var row = null;
  for (var i = 0; i < data.rows.length; i++) {
    if (data.rows[i][colIdx.store_id] === storeId) { row = data.rows[i]; break; }
  }
  if (!row) throw new AppError('NOT_FOUND', 'Merchant tidak ditemukan atau bukan kelolaan cabang Anda.');
  var cols = group === 'identity' ? SENSITIVE_IDENTITY_COLUMNS : SENSITIVE_FINANCIAL_COLUMNS;
  audit_(ctx, 'REVEAL_' + group.toUpperCase(), storeId, 'Kolom: ' + cols.join(', '), true);
  var values = {};
  for (i = 0; i < cols.length; i++) values[cols[i]] = row[colIdx[cols[i]]];
  return { store_id: storeId, group: group, values: values };
}
