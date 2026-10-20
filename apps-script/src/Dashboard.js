/**
 * Ringkasan dashboard cabang. Semua agregat dihitung di server dari merchant
 * cabang pengguna saja; browser hanya menerima angka ringkasan.
 */

function tally_(map, raw) {
  var label = str_(raw);
  var key = normKey_(label);
  if (!map[key]) map[key] = { value: key === '' ? BLANK_FILTER_VALUE : label, label: key === '' ? '(Kosong)' : label, count: 0 };
  map[key].count++;
  return key;
}

function naturalCompare_(a, b) {
  if (a.value === BLANK_FILTER_VALUE) return 1;
  if (b.value === BLANK_FILTER_VALUE) return -1;
  return String(a.label).localeCompare(String(b.label), 'id', { numeric: true });
}

function toSortedList_(map, byCount) {
  var list = [];
  for (var k in map) list.push(map[k]);
  list.sort(function (a, b) {
    if (byCount && a.count !== b.count) return b.count - a.count;
    return naturalCompare_(a, b);
  });
  return list;
}

/** Hitung indikator USAK sesuai rumus yang ditetapkan. */
function computeUsakIndicators_(total, usak) {
  var rasio = total > 0 ? (usak / total) * 100 : 0;
  var target = Math.ceil(total * APP.TARGET_RATIO);
  var gap = Math.max(0, target - usak);
  return {
    total_merchant: total,
    merchant_usak: usak,
    rasio_usak: rasio,
    target_ratio_persen: APP.TARGET_RATIO * 100,
    target_usak_50: target,
    gap_usak_50: gap,
    tercapai: total > 0 && gap === 0,
  };
}

function dashboardSummary_(ctx) {
  var cfg = loadConfig_();
  var view = buildBranchView_(ctx, cfg);
  var items = view.items;
  var kat = { USAK: 0, BELUM_USAK: 0, KOSONG: 0, TIDAK_DIKENALI: 0 };
  var byStatus = {}, byGrading = {}, byTiering = {}, byUsakSource = {};
  var source = cfg.usak.source;
  var cross = {};
  var fu = { perlu_follow_up: 0, jatuh_tempo: 0, belum_pernah_belum_usak: 0, sudah_ada: 0 };
  var byFuStatus = {};
  var metrics = {};
  for (var mi = 0; mi < PERFORMANCE_METRICS.length; mi++) metrics[PERFORMANCE_METRICS[mi]] = { sum: 0, count: 0 };

  for (var i = 0; i < items.length; i++) {
    var it = items[i], m = it.m;
    kat[it.kategori]++;
    tally_(byStatus, m.status_trx);
    var gKey = tally_(byGrading, m.grading_trx);
    var tKey = tally_(byTiering, m.Tiering);
    var guKey = tally_(byUsakSource, m[source]);
    byUsakSource[guKey].kategori = it.kategori;
    if (!cross[gKey]) cross[gKey] = {};
    cross[gKey][tKey] = (cross[gKey][tKey] || 0) + 1;

    if (it.perlu) fu.perlu_follow_up++;
    if (it.fu.jatuh_tempo) fu.jatuh_tempo++;
    if (it.fu.ada) {
      fu.sudah_ada++;
      if (!byFuStatus[it.fu.status]) byFuStatus[it.fu.status] = { value: it.fu.status, label: it.fu.status_label, count: 0 };
      byFuStatus[it.fu.status].count++;
    } else if (it.kategori !== USAK_KATEGORI.USAK) {
      fu.belum_pernah_belum_usak++;
    }
    for (mi = 0; mi < PERFORMANCE_METRICS.length; mi++) {
      var v = m[PERFORMANCE_METRICS[mi]];
      if (typeof v === 'number') {
        metrics[PERFORMANCE_METRICS[mi]].sum += v;
        metrics[PERFORMANCE_METRICS[mi]].count++;
      }
    }
  }
  for (var key in metrics) {
    metrics[key].avg = metrics[key].count ? metrics[key].sum / metrics[key].count : null;
  }

  // Tabel silang grading_trx x Tiering
  var gradingList = toSortedList_(byGrading, false);
  var tieringList = toSortedList_(byTiering, false);
  var cells = gradingList.map(function (g) {
    var gk = normKey_(g.value === BLANK_FILTER_VALUE ? '' : g.value);
    return tieringList.map(function (t) {
      var tk = normKey_(t.value === BLANK_FILTER_VALUE ? '' : t.value);
      return (cross[gk] && cross[gk][tk]) || 0;
    });
  });

  // Follow-up yang dicatat bulan berjalan
  var monthPrefix = view.today.substring(0, 7);
  var thisMonth = 0;
  for (i = 0; i < view.followUps.length; i++) {
    var created = view.followUps[i].created_at;
    if (!created) continue;
    var d = new Date(created);
    if (!isNaN(d.getTime()) && Utilities.formatDate(d, view.tz, 'yyyy-MM') === monthPrefix) thisMonth++;
  }
  fu.dicatat_bulan_ini = thisMonth;
  fu.by_status = toSortedList_(byFuStatus, true);

  var top = items.filter(function (x) { return x.perlu; });
  sortItems_(top, 'priority', 'desc');
  var prioritas = top.slice(0, 5).map(function (x) {
    return {
      store_id: x.m.store_id,
      store_name: x.m.store_name,
      usak: usakInfo_(x.kategori, x.m, source),
      priority: priorityInfo_(x),
      follow_up: x.fu,
    };
  });

  var usak = computeUsakIndicators_(items.length, kat.USAK);
  usak.configured = cfg.usak.configured;
  usak.merchant_belum_usak = kat.BELUM_USAK;
  usak.merchant_kosong = kat.KOSONG;
  usak.merchant_tidak_dikenali = kat.TIDAK_DIKENALI;
  usak.perlu_dicek = kat.KOSONG + kat.TIDAK_DIKENALI;
  usak.source_column = source;

  var warnings = configWarnings_(cfg);
  if (usak.perlu_dicek > 0) {
    warnings.push({
      code: 'GRADING_USAK_NEEDS_REVIEW',
      message: usak.perlu_dicek + ' merchant memiliki nilai ' + source + ' kosong atau tidak dikenali dan tidak dihitung sebagai USAK.',
    });
  }
  // grading_usak yang tidak dipakai sebagai sumber USAK memang boleh tidak ada.
  var missing = view.missing_columns.filter(function (c) { return c !== 'grading_usak' || source === 'grading_usak'; });
  if (missing.length) {
    warnings.push({
      code: 'MISSING_COLUMNS',
      message: 'Kolom berikut tidak ada di sheet Merchants dan ditampilkan kosong: ' + missing.join(', ') + '.',
    });
  }
  if (view.scan_mode === 'full') {
    warnings.push({
      code: 'DATA_NOT_SORTED',
      message: 'Sheet Merchants belum terurut per cabang sehingga data dimuat lebih lambat. Minta admin menjalankan menu "Urutkan Merchants per cabang".',
    });
  }
  if (view.duplicates > 0) {
    warnings.push({
      code: 'DUPLICATE_STORE_ID',
      message: view.duplicates + ' baris memiliki store_id ganda dan dilewati. Periksa sheet Merchants.',
    });
  }

  return {
    cabang: { kode_cabang: ctx.kode_cabang, nama_cabang: ctx.nama_cabang },
    usak: usak,
    distribusi: {
      status_trx: toSortedList_(byStatus, true),
      grading_trx: gradingList,
      Tiering: tieringList,
      usak_source: toSortedList_(byUsakSource, true),
    },
    grading_trx_x_tiering: {
      rows: gradingList,
      cols: tieringList,
      cells: cells,
    },
    follow_up: fu,
    metrics: metrics,
    prioritas_teratas: prioritas,
    warnings: warnings,
    data: {
      snapshot_date: cfg.settings.DATA_SNAPSHOT_DATE || '',
      last_import_at: PropertiesService.getScriptProperties().getProperty('LAST_IMPORT_AT') || '',
      loaded_at: view.loaded_at,
      today: view.today,
    },
  };
}
