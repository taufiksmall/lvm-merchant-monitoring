/**
 * Memuat konfigurasi bisnis dari sheet: Settings, Roles, UsakConfig, PriorityRules, Options.
 * Hasilnya di-cache singkat (APP.CONFIG_CACHE_SECONDS) dan dipakai bersama oleh
 * dashboard, daftar, filter, detail, serta follow-up agar definisinya selalu sama.
 */

var configMemo_ = null;

function loadConfig_() {
  if (configMemo_) return configMemo_;
  var key = 'cfg:' + getVersion_('CONFIG_VERSION');
  var cached = cacheGetJson_(key);
  if (cached) {
    configMemo_ = cached;
    return cached;
  }
  var cfg = {
    settings: loadSettings_(),
    roles: loadRoles_(),
    usak: loadUsakConfig_(),
    rules: null,
    options: loadOptions_(),
  };
  cfg.rules = loadPriorityRules_();
  cachePutJson_(key, cfg, APP.CONFIG_CACHE_SECONDS);
  configMemo_ = cfg;
  return cfg;
}

function clearConfigMemo_() {
  configMemo_ = null;
}

function loadSettings_() {
  var settings = {};
  for (var k in DEFAULT_SETTINGS) settings[k] = DEFAULT_SETTINGS[k].nilai;
  var table = readTable_(SHEETS.SETTINGS, { optional: true, required: ['kunci', 'nilai'] });
  for (var i = 0; i < table.rows.length; i++) {
    var kunci = str_(table.rows[i].kunci).toUpperCase();
    if (!kunci) continue;
    settings[kunci] = str_(table.rows[i].nilai);
  }
  return settings;
}

function settingInt_(cfg, key, min, max) {
  var fallback = parseInt(DEFAULT_SETTINGS[key] ? DEFAULT_SETTINGS[key].nilai : '0', 10) || min;
  return clampInt_(cfg.settings[key], min, max, fallback);
}

function settingTz_(cfg) {
  return cfg.settings.TIMEZONE || 'Asia/Jakarta';
}

function loadRoles_() {
  var table = readTable_(SHEETS.ROLES, { required: ['role'] });
  var roles = {};
  for (var i = 0; i < table.rows.length; i++) {
    var r = table.rows[i];
    var name = normKey_(r.role);
    if (!name) continue;
    roles[name] = {
      view_sensitive: toBool_(r.boleh_lihat_sensitif),
      view_financial: toBool_(r.boleh_lihat_keuangan),
      search_account_number: toBool_(r.boleh_cari_rekening),
      write_follow_up: toBool_(r.boleh_tulis_follow_up),
      edit_all_follow_ups: toBool_(r.boleh_ubah_semua_follow_up),
    };
  }
  return roles;
}

/**
 * UsakConfig memetakan nilai grading_usak -> kategori USAK / BELUM_USAK.
 * `configured` hanya true bila minimal satu nilai dipetakan sebagai USAK.
 */
function loadUsakConfig_() {
  var table = readTable_(SHEETS.USAK_CONFIG, { optional: true, required: ['nilai_grading_usak', 'kategori'] });
  var map = {}, invalid = [], unfilled = [], usakCount = 0, belumCount = 0;
  for (var i = 0; i < table.rows.length; i++) {
    var r = table.rows[i];
    var raw = str_(r.nilai_grading_usak);
    var kat = normalizeUsakKategori_(r.kategori);
    if (!raw) continue;
    if (!str_(r.kategori)) {
      unfilled.push(raw);
      continue;
    }
    if (!kat) {
      invalid.push({ baris: r._row, nilai: raw, kategori: str_(r.kategori) });
      continue;
    }
    map[normKey_(raw)] = { kategori: kat, nilai: raw };
    if (kat === USAK_KATEGORI.USAK) usakCount++; else belumCount++;
  }
  return {
    map: map,
    configured: usakCount > 0,
    usak_values: usakCount,
    belum_usak_values: belumCount,
    invalid_rows: invalid,
    unfilled_values: unfilled,
    sheet_exists: !!table.sheet,
  };
}

function normalizeUsakKategori_(v) {
  var s = str_(v).toUpperCase().replace(/[\s\-]+/g, '_');
  if (s === 'USAK') return USAK_KATEGORI.USAK;
  if (s === 'BELUM_USAK' || s === 'NON_USAK' || s === 'TIDAK_USAK') return USAK_KATEGORI.BELUM_USAK;
  return '';
}

/** Klasifikasi grading_usak sebuah merchant. Satu-satunya sumber status USAK. */
function classifyUsak_(gradingUsak, usakCfg) {
  var raw = str_(gradingUsak);
  if (!raw) return USAK_KATEGORI.KOSONG;
  var hit = usakCfg.map[normKey_(raw)];
  return hit ? hit.kategori : USAK_KATEGORI.TIDAK_DIKENALI;
}

function loadOptions_() {
  var table = readTable_(SHEETS.OPTIONS, { required: ['jenis', 'kode', 'label'] });
  var status = [], progres = [];
  for (var i = 0; i < table.rows.length; i++) {
    var r = table.rows[i];
    var jenis = normKey_(r.jenis);
    var kode = str_(r.kode).toUpperCase();
    if (!kode) continue;
    var item = {
      kode: kode,
      label: str_(r.label) || kode,
      urutan: toNumber_(r.urutan) || 999,
      final: toBool_(r.final),
      aktif: isBlank_(r.aktif) ? true : toBool_(r.aktif),
    };
    if (jenis === 'status_follow_up') status.push(item);
    else if (jenis === 'progres_usak') progres.push(item);
  }
  var byOrder = function (a, b) { return a.urutan - b.urutan || (a.label < b.label ? -1 : 1); };
  status.sort(byOrder);
  progres.sort(byOrder);
  return { status_follow_up: status, progres_usak: progres };
}

function findOption_(list, kode) {
  var k = str_(kode).toUpperCase();
  for (var i = 0; i < list.length; i++) if (list[i].kode === k) return list[i];
  return null;
}

/**
 * Aturan prioritas. Baris dengan rule_id sama digabung (AND). Aturan yang tidak valid
 * dilewati dan dilaporkan sebagai peringatan.
 */
function loadPriorityRules_() {
  var table = readTable_(SHEETS.PRIORITY_RULES, { optional: true, required: ['rule_id', 'kolom', 'operator'] });
  var byId = {}, order = [], invalid = [];
  var validColumns = {};
  for (var i = 0; i < MERCHANT_COLUMNS.length; i++) validColumns[MERCHANT_COLUMNS[i]] = true;
  for (i = 0; i < RULE_VIRTUAL_FIELDS.length; i++) validColumns[RULE_VIRTUAL_FIELDS[i]] = true;
  var colByNorm = {};
  for (var c in validColumns) colByNorm[normHeader_(c)] = c;

  for (i = 0; i < table.rows.length; i++) {
    var r = table.rows[i];
    var id = str_(r.rule_id);
    if (!id) continue;
    var aktif = isBlank_(r.aktif) ? true : toBool_(r.aktif);
    var column = colByNorm[normHeader_(r.kolom)];
    var op = str_(r.operator).toLowerCase();
    if (!column || RULE_OPERATORS.indexOf(op) < 0) {
      invalid.push({ rule_id: id, baris: r._row, alasan: !column ? 'kolom tidak dikenal' : 'operator tidak dikenal' });
      if (byId[id]) byId[id].invalid = true;
      else { byId[id] = { invalid: true }; order.push(id); }
      continue;
    }
    if (byId[id] && byId[id].invalid) continue;
    if (!byId[id]) {
      byId[id] = {
        id: id,
        aktif: aktif,
        label: str_(r.label) || id,
        bobot: toNumber_(r.bobot) === null ? 1 : toNumber_(r.bobot),
        conditions: [],
      };
      order.push(id);
    } else if (!aktif) {
      byId[id].aktif = false;
    }
    var rawValue = str_(r.nilai);
    byId[id].conditions.push({
      column: column,
      op: op,
      value: rawValue,
      values: rawValue.split(/[,|]/).map(function (s) { return normKey_(s); }).filter(function (s) { return s !== ''; }),
      number: toNumber_(rawValue),
    });
  }
  var rules = [];
  for (i = 0; i < order.length; i++) {
    var rule = byId[order[i]];
    if (rule.invalid || !rule.aktif || !rule.conditions || !rule.conditions.length) continue;
    rules.push(rule);
  }
  return { list: rules, invalid: invalid };
}

/** Peringatan konfigurasi yang aman ditampilkan ke pengguna cabang. */
function configWarnings_(cfg) {
  var warnings = [];
  if (!cfg.usak.configured) {
    warnings.push({
      code: 'USAK_NOT_CONFIGURED',
      message: 'Definisi USAK belum dikonfigurasi. Isi sheet UsakConfig dengan nilai grading_usak resmi. Angka USAK belum final.',
    });
  }
  if (cfg.usak.invalid_rows.length) {
    warnings.push({
      code: 'USAK_CONFIG_INVALID',
      message: cfg.usak.invalid_rows.length + ' baris UsakConfig memiliki kategori tidak valid (gunakan USAK atau BELUM_USAK).',
    });
  }
  if (cfg.usak.unfilled_values.length) {
    warnings.push({
      code: 'USAK_CONFIG_UNFILLED',
      message: cfg.usak.unfilled_values.length + ' nilai grading_usak di UsakConfig belum diberi kategori dan dianggap tidak dikenali.',
    });
  }
  if (cfg.rules.invalid.length) {
    warnings.push({
      code: 'PRIORITY_RULE_INVALID',
      message: 'Aturan prioritas tidak valid dan dilewati: ' + cfg.rules.invalid.map(function (x) { return x.rule_id; }).join(', ') + '.',
    });
  }
  return warnings;
}
