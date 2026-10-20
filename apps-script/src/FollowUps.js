/**
 * Follow-up merchant (sheet FollowUps). Setiap baris adalah satu catatan tindak lanjut.
 * Status follow-up terkini merchant = catatan dengan created_at terbaru.
 *
 * Akses: hanya follow-up dengan kode_cabang = cabang pengguna DAN merchant yang saat ini
 * dikelola cabang pengguna. Status USAK tetap dari grading_usak, bukan dari follow-up.
 */

function followUpCacheKey_(kode) {
  return 'fu:' + getVersion_('DATA_VERSION') + ':' + kode;
}

function toIsoTimestamp_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  return str_(v);
}

function normalizeFollowUp_(r, tz) {
  var next = toIsoDate_(r.tanggal_follow_up_berikutnya, tz);
  return {
    follow_up_id: str_(r.follow_up_id),
    store_id: str_(r.store_id),
    status_follow_up: str_(r.status_follow_up).toUpperCase(),
    catatan: str_(r.catatan),
    tanggal_follow_up_berikutnya: next || '',
    progres_usak: str_(r.progres_usak).toUpperCase(),
    created_by: str_(r.created_by),
    created_at: toIsoTimestamp_(r.created_at),
    updated_at: toIsoTimestamp_(r.updated_at),
  };
}

function loadBranchFollowUps_(ctx, cfg) {
  var key = followUpCacheKey_(ctx.kode_cabang);
  var cached = cacheGetJson_(key);
  if (cached) return cached;
  var table = readTable_(SHEETS.FOLLOW_UPS);
  var pad = cfg.settings.KODE_CABANG_PAD_LENGTH;
  var tz = settingTz_(cfg);
  var list = [];
  for (var i = 0; i < table.rows.length; i++) {
    var r = table.rows[i];
    if (normKode_(r.kode_cabang, pad) !== ctx.kode_cabang) continue;
    var fu = normalizeFollowUp_(r, tz);
    if (fu.follow_up_id && fu.store_id) list.push(fu);
  }
  cachePutJson_(key, list, settingInt_(cfg, 'CACHE_TTL_SECONDS', 60, 21600));
  return list;
}

function invalidateFollowUpCache_(kode) {
  cacheRemove_(followUpCacheKey_(kode));
}

function latestFollowUpByStore_(list) {
  var latest = {};
  for (var i = 0; i < list.length; i++) {
    var f = list[i];
    var cur = latest[f.store_id];
    if (!cur || f.created_at > cur.created_at) latest[f.store_id] = f;
  }
  return latest;
}

function followUpsForStore_(list, storeId) {
  return list.filter(function (f) { return f.store_id === storeId; })
    .sort(function (a, b) { return a.created_at < b.created_at ? 1 : (a.created_at > b.created_at ? -1 : 0); });
}

/** Ringkasan follow-up terakhir untuk daftar/detail/aturan prioritas. */
function followUpSummary_(fu, cfg, today, tz) {
  if (!fu) {
    return {
      ada: false, status: '', status_label: '', final: false, terakhir: '', berikutnya: '',
      jatuh_tempo: false, hari_sejak: null, progres_usak: '', progres_label: '',
    };
  }
  var opt = findOption_(cfg.options.status_follow_up, fu.status_follow_up);
  var prog = findOption_(cfg.options.progres_usak, fu.progres_usak);
  var isFinal = opt ? opt.final : false;
  var next = fu.tanggal_follow_up_berikutnya;
  var hariSejak = null;
  if (fu.created_at) {
    var d = new Date(fu.created_at);
    if (!isNaN(d.getTime())) hariSejak = daysBetweenYmd_(Utilities.formatDate(d, tz, 'yyyy-MM-dd'), today);
  }
  return {
    ada: true,
    status: fu.status_follow_up,
    status_label: opt ? opt.label : fu.status_follow_up,
    final: isFinal,
    terakhir: fu.created_at,
    berikutnya: next,
    jatuh_tempo: !!next && !isFinal && next <= today,
    hari_sejak: hariSejak,
    progres_usak: fu.progres_usak,
    progres_label: prog ? prog.label : fu.progres_usak,
  };
}

function publicFollowUp_(f, ctx, cfg) {
  var opt = findOption_(cfg.options.status_follow_up, f.status_follow_up);
  var prog = findOption_(cfg.options.progres_usak, f.progres_usak);
  return {
    follow_up_id: f.follow_up_id,
    store_id: f.store_id,
    status_follow_up: f.status_follow_up,
    status_label: opt ? opt.label : f.status_follow_up,
    catatan: f.catatan,
    tanggal_follow_up_berikutnya: f.tanggal_follow_up_berikutnya,
    progres_usak: f.progres_usak,
    progres_label: prog ? prog.label : f.progres_usak,
    created_by: f.created_by,
    created_at: f.created_at,
    updated_at: f.updated_at,
    can_edit: ctx.permissions.write_follow_up &&
      (f.created_by === ctx.user_id || ctx.permissions.edit_all_follow_ups),
  };
}

/**
 * Validasi input follow-up. Untuk update, hanya field yang dikirim yang divalidasi
 * dan dikembalikan. Tanggal berikutnya tidak boleh sebelum hari ini (kecuali tidak diubah).
 */
function validateFollowUpInput_(payload, cfg, existing) {
  var fields = {}, out = {};
  var has = function (k) { return Object.prototype.hasOwnProperty.call(payload, k); };
  var tz = settingTz_(cfg);
  var today = todayYmd_(tz);

  if (!existing || has('status_follow_up')) {
    var status = str_(payload.status_follow_up).toUpperCase();
    var opt = findOption_(cfg.options.status_follow_up, status);
    if (!status) fields.status_follow_up = 'Status follow-up wajib dipilih.';
    else if (!opt || (!opt.aktif && !(existing && existing.status_follow_up === status))) fields.status_follow_up = 'Status follow-up tidak dikenal.';
    else out.status_follow_up = status;
  }

  if (!existing || has('catatan')) {
    try {
      out.catatan = cleanText_(payload.catatan, APP.MAX_NOTE_CHARS);
    } catch (e) {
      fields.catatan = 'Catatan maksimal ' + APP.MAX_NOTE_CHARS + ' karakter.';
    }
  }

  if (!existing || has('tanggal_follow_up_berikutnya')) {
    var raw = str_(payload.tanggal_follow_up_berikutnya);
    if (!raw) {
      out.tanggal_follow_up_berikutnya = '';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || toIsoDate_(raw, tz) !== raw) {
      fields.tanggal_follow_up_berikutnya = 'Format tanggal harus yyyy-mm-dd.';
    } else if (existing && existing.tanggal_follow_up_berikutnya === raw) {
      out.tanggal_follow_up_berikutnya = raw;
    } else if (raw < today) {
      fields.tanggal_follow_up_berikutnya = 'Tanggal follow-up berikutnya tidak boleh sebelum hari ini.';
    } else if (raw > addDaysYmd_(today, 730)) {
      fields.tanggal_follow_up_berikutnya = 'Tanggal follow-up berikutnya maksimal 2 tahun dari hari ini.';
    } else {
      out.tanggal_follow_up_berikutnya = raw;
    }
  }

  if (!existing || has('progres_usak')) {
    var prog = str_(payload.progres_usak).toUpperCase();
    var progOpt = prog ? findOption_(cfg.options.progres_usak, prog) : null;
    if (prog && (!progOpt || (!progOpt.aktif && !(existing && existing.progres_usak === prog)))) {
      fields.progres_usak = 'Progres USAK tidak dikenal.';
    } else {
      out.progres_usak = prog;
    }
  }

  if (Object.keys(fields).length) {
    throw new AppError('VALIDATION_ERROR', 'Periksa kembali isian follow-up.', { fields: fields });
  }
  return out;
}

function listFollowUps_(ctx, payload) {
  var storeId = requireStoreId_(payload);
  var cfg = loadConfig_();
  assertStoreInBranch_(ctx, cfg, storeId);
  var list = followUpsForStore_(loadBranchFollowUps_(ctx, cfg), storeId);
  return { store_id: storeId, items: list.map(function (f) { return publicFollowUp_(f, ctx, cfg); }) };
}

function createFollowUp_(ctx, payload) {
  if (!ctx.permissions.write_follow_up) {
    throw new AppError('FORBIDDEN', 'Role Anda tidak diizinkan mencatat follow-up.');
  }
  var storeId = requireStoreId_(payload);
  var cfg = loadConfig_();
  assertStoreInBranch_(ctx, cfg, storeId);
  var input = validateFollowUpInput_(payload, cfg, null);
  var stamp = isoNow_();
  var entry = {
    follow_up_id: 'FU-' + Utilities.getUuid(),
    store_id: storeId,
    kode_cabang: ctx.kode_cabang,
    status_follow_up: input.status_follow_up,
    catatan: input.catatan,
    tanggal_follow_up_berikutnya: input.tanggal_follow_up_berikutnya,
    progres_usak: input.progres_usak,
    created_by: ctx.user_id,
    created_at: stamp,
    updated_at: stamp,
  };
  appendObject_(SHEETS.FOLLOW_UPS, entry);
  invalidateFollowUpCache_(ctx.kode_cabang);
  audit_(ctx, 'FOLLOW_UP_CREATE', storeId, entry.follow_up_id);
  return publicFollowUp_(entry, ctx, cfg);
}

function updateFollowUp_(ctx, payload) {
  if (!ctx.permissions.write_follow_up) {
    throw new AppError('FORBIDDEN', 'Role Anda tidak diizinkan mengubah follow-up.');
  }
  var id = str_(payload.follow_up_id);
  if (!/^FU-[A-Za-z0-9\-]{8,64}$/.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'follow_up_id tidak valid.', { fields: { follow_up_id: 'follow_up_id tidak valid.' } });
  }
  var cfg = loadConfig_();
  var tz = settingTz_(cfg);
  var pad = cfg.settings.KODE_CABANG_PAD_LENGTH;
  var result = withLock_(function () {
    var row = findRowByValue_(SHEETS.FOLLOW_UPS, 'follow_up_id', id);
    if (!row || normKode_(row.kode_cabang, pad) !== ctx.kode_cabang) {
      throw new AppError('NOT_FOUND', 'Follow-up tidak ditemukan atau bukan milik cabang Anda.');
    }
    var existing = normalizeFollowUp_(row, tz);
    assertStoreInBranch_(ctx, cfg, existing.store_id);
    if (existing.created_by !== ctx.user_id && !ctx.permissions.edit_all_follow_ups) {
      throw new AppError('FORBIDDEN', 'Anda hanya dapat mengubah follow-up yang Anda catat sendiri.');
    }
    var input = validateFollowUpInput_(payload, cfg, existing);
    var changes = {};
    for (var k in input) if (input[k] !== existing[k]) changes[k] = input[k];
    if (!Object.keys(changes).length) {
      throw new AppError('VALIDATION_ERROR', 'Tidak ada perubahan yang disimpan.');
    }
    changes.updated_at = isoNow_();
    updateObjectFields_(SHEETS.FOLLOW_UPS, row._row, changes);
    for (k in changes) existing[k] = changes[k];
    return existing;
  });
  invalidateFollowUpCache_(ctx.kode_cabang);
  audit_(ctx, 'FOLLOW_UP_UPDATE', result.store_id, result.follow_up_id);
  return publicFollowUp_(result, ctx, cfg);
}
