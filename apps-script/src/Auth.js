/**
 * Autentikasi & sesi.
 *
 * Pola sesi: token acak opak (64 hex) dibuat saat login dan hanya dikirim sekali ke
 * server Next.js (BFF), yang menyimpannya di cookie httpOnly. Apps Script hanya
 * menyimpan SHA-256 dari token di sheet Sessions, sehingga isi sheet tidak dapat
 * dipakai untuk membajak sesi. Cabang & role SELALU diambil dari sheet Users di sisi
 * server — tidak pernah dari input frontend.
 */

var INVALID_SESSION_MESSAGE_ = 'Sesi tidak valid. Silakan login kembali.';

function rolePermissions_(cfg, role) {
  return cfg.roles[normKey_(role)] || null;
}

function publicUser_(ctx) {
  return {
    user_id: ctx.user_id,
    kode_cabang: ctx.kode_cabang,
    nama_cabang: ctx.nama_cabang,
    role: ctx.role,
    akses: SCOPE_ROLES.indexOf(ctx.role) >= 0 ? ctx.role : 'cabang',
    permissions: ctx.permissions,
    expires_at: ctx.expires_at,
  };
}

function validateLoginInput_(payload) {
  var kode = str_(payload.kode_cabang);
  var password = payload.password;
  var fields = {};
  if (!kode) fields.kode_cabang = 'Kode cabang wajib diisi.';
  else if (kode.length > 32 || !/^[A-Za-z0-9._\-]+$/.test(kode)) fields.kode_cabang = 'Format kode cabang tidak valid.';
  if (typeof password !== 'string' || password.length === 0) fields.password = 'Kata sandi wajib diisi.';
  else if (password.length > 200) fields.password = 'Kata sandi terlalu panjang.';
  if (Object.keys(fields).length) {
    throw new AppError('VALIDATION_ERROR', 'Periksa kembali isian login.', { fields: fields });
  }
  return { kode: kode, password: password };
}

function login_(payload) {
  var input = validateLoginInput_(payload);
  var cfg = loadConfig_();
  var pad = cfg.settings.KODE_CABANG_PAD_LENGTH;
  var kode = normKode_(input.kode, pad);
  var maxAttempts = settingInt_(cfg, 'LOGIN_MAX_ATTEMPTS', 3, 20);
  var lockMinutes = settingInt_(cfg, 'LOGIN_LOCK_MINUTES', 1, 1440);
  var cache = scriptCache_();
  var failKey = 'lf:' + sha256Hex_(kode).substring(0, 32);
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= maxAttempts) {
    throw new AppError('RATE_LIMITED', 'Terlalu banyak percobaan login gagal. Coba lagi dalam ' + lockMinutes + ' menit.');
  }

  var users = readTable_(SHEETS.USERS).rows;
  var candidates = users.filter(function (u) { return normKode_(u.kode_cabang, pad) === kode; });
  var matched = null;
  if (!candidates.length) dummyPasswordWork_();
  for (var i = 0; i < candidates.length; i++) {
    if (!isValidPasswordHash_(candidates[i].password_hash)) {
      console.warn('Akun ' + str_(candidates[i].user_id) + ' tidak memiliki password_hash yang valid.');
      continue;
    }
    if (verifyPassword_(input.password, candidates[i].password_hash)) {
      matched = candidates[i];
      break;
    }
  }

  if (!matched) {
    fails++;
    cache.put(failKey, String(fails), lockMinutes * 60);
    if (fails >= maxAttempts) {
      audit_({ user_id: '', kode_cabang: kode }, 'LOGIN_LOCKED', '', 'Batas percobaan login gagal tercapai.');
    }
    throw new AppError('INVALID_CREDENTIALS', 'Kode cabang atau kata sandi salah.');
  }
  if (!toBool_(matched.is_active)) {
    throw new AppError('ACCOUNT_INACTIVE', 'Akun Anda tidak aktif. Hubungi administrator.');
  }
  if (!rolePermissions_(cfg, matched.role)) {
    throw new AppError('ROLE_INVALID', 'Role akun Anda tidak dikenali. Hubungi administrator.');
  }
  var userId = str_(matched.user_id);
  if (!userId) {
    throw new AppError('CONFIG_ERROR', 'Akun belum memiliki user_id. Hubungi administrator.');
  }
  cache.remove(failKey);

  var token = newSessionToken_();
  var hash = sha256Hex_(token);
  var ttlHours = settingInt_(cfg, 'SESSION_TTL_HOURS', 1, 24);
  var created = now_();
  var expiresAt = new Date(created.getTime() + ttlHours * 3600000).toISOString();
  appendObject_(SHEETS.SESSIONS, {
    session_hash: hash,
    user_id: userId,
    kode_cabang: kode,
    credential_fp: credentialFingerprint_(matched.password_hash),
    created_at: created.toISOString(),
    expires_at: expiresAt,
    revoked_at: '',
  });
  var data = sessionDataFromUser_(matched, cfg, hash, expiresAt);
  cacheSession_(data);
  var ctx = finalizeSession_(data, cfg);
  audit_(ctx, 'LOGIN', '', '');
  return { token: token, expires_at: expiresAt, user: publicUser_(ctx) };
}

function sessionDataFromUser_(user, cfg, hash, expiresAt) {
  return {
    user_id: str_(user.user_id),
    kode_cabang: normKode_(user.kode_cabang, cfg.settings.KODE_CABANG_PAD_LENGTH),
    nama_cabang: str_(user.nama_cabang),
    role: normKey_(user.role),
    session_hash: hash,
    expires_at: expiresAt,
  };
}

function finalizeSession_(data, cfg) {
  var perms = rolePermissions_(cfg, data.role);
  if (!perms) throw new AppError('ROLE_INVALID', 'Role akun Anda tidak dikenali. Hubungi administrator.');
  if (!data.kode_cabang) throw new AppError('FORBIDDEN', 'Akun Anda belum terhubung ke cabang.');
  return {
    user_id: data.user_id,
    kode_cabang: data.kode_cabang,
    nama_cabang: data.nama_cabang,
    role: data.role,
    session_hash: data.session_hash,
    expires_at: data.expires_at,
    permissions: perms,
  };
}

function cacheSession_(data) {
  var remaining = Math.floor((Date.parse(data.expires_at) - now_().getTime()) / 1000);
  if (remaining <= 0) return;
  cachePutJson_('s:' + data.session_hash, data, Math.min(APP.SESSION_CACHE_SECONDS, remaining));
}

function findUserById_(userId) {
  var id = str_(userId);
  if (!id) return null;
  var users = readTable_(SHEETS.USERS).rows;
  for (var i = 0; i < users.length; i++) if (str_(users[i].user_id) === id) return users[i];
  return null;
}

/** Validasi token pada setiap request terautentikasi. Mengembalikan konteks pengguna. */
function requireSession_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw new AppError('UNAUTHENTICATED', INVALID_SESSION_MESSAGE_);
  }
  var cfg = loadConfig_();
  var hash = sha256Hex_(token);
  var nowMs = now_().getTime();
  var cached = cacheGetJson_('s:' + hash);
  if (cached && Date.parse(cached.expires_at) > nowMs) return finalizeSession_(cached, cfg);

  var row = findRowByValue_(SHEETS.SESSIONS, 'session_hash', hash);
  if (!row || str_(row.revoked_at)) throw new AppError('UNAUTHENTICATED', INVALID_SESSION_MESSAGE_);
  var exp = row.expires_at instanceof Date ? row.expires_at.getTime() : Date.parse(str_(row.expires_at));
  if (!(exp > nowMs)) throw new AppError('SESSION_EXPIRED', 'Sesi Anda telah berakhir. Silakan login kembali.');

  var user = findUserById_(row.user_id);
  if (!user || !toBool_(user.is_active)) throw new AppError('UNAUTHENTICATED', 'Akun tidak aktif. Silakan hubungi administrator.');
  if (credentialFingerprint_(user.password_hash) !== str_(row.credential_fp)) {
    throw new AppError('UNAUTHENTICATED', 'Kata sandi telah diganti. Silakan login kembali.');
  }
  var data = sessionDataFromUser_(user, cfg, hash, new Date(exp).toISOString());
  cacheSession_(data);
  return finalizeSession_(data, cfg);
}

function logout_(ctx) {
  withLock_(function () {
    var row = findRowByValue_(SHEETS.SESSIONS, 'session_hash', ctx.session_hash);
    if (row && !str_(row.revoked_at)) updateObjectFields_(SHEETS.SESSIONS, row._row, { revoked_at: isoNow_() });
  });
  cacheRemove_('s:' + ctx.session_hash);
  return { logged_out: true };
}

function me_(ctx) {
  return publicUser_(ctx);
}

/** Cabut seluruh sesi milik user tertentu (dipakai menu admin & saat ganti kata sandi). */
function revokeSessionsForUser_(userId) {
  var id = str_(userId);
  var count = 0;
  withLock_(function () {
    var table = readTable_(SHEETS.SESSIONS);
    var stamp = isoNow_();
    for (var i = 0; i < table.rows.length; i++) {
      var r = table.rows[i];
      if (str_(r.user_id) === id && !str_(r.revoked_at)) {
        updateObjectFields_(SHEETS.SESSIONS, r._row, { revoked_at: stamp });
        cacheRemove_('s:' + str_(r.session_hash));
        count++;
      }
    }
  });
  return count;
}

/** Cabut sesi beberapa user sekaligus (satu kali baca sheet Sessions). Mengembalikan jumlah sesi dicabut. */
function revokeSessionsForUsers_(userIds) {
  var wanted = {};
  for (var i = 0; i < userIds.length; i++) wanted[str_(userIds[i])] = true;
  var count = 0;
  withLock_(function () {
    var table = readTable_(SHEETS.SESSIONS);
    var stamp = isoNow_();
    for (var r = 0; r < table.rows.length; r++) {
      var row = table.rows[r];
      if (wanted[str_(row.user_id)] && !str_(row.revoked_at)) {
        updateObjectFields_(SHEETS.SESSIONS, row._row, { revoked_at: stamp });
        cacheRemove_('s:' + str_(row.session_hash));
        count++;
      }
    }
  });
  return count;
}

/** Hapus baris sesi yang sudah kedaluwarsa/dicabut lebih dari 1 hari. */
function cleanupSessions_() {
  var removed = 0;
  withLock_(function () {
    var sheet = getSheet_(SHEETS.SESSIONS);
    var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
    if (lastRow < 2) return;
    var info = readHeaderInfo_(sheet, SHEET_SCHEMAS.Sessions);
    assertHeaders_(SHEETS.SESSIONS, info, ['expires_at', 'revoked_at']);
    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var cutoff = now_().getTime() - 86400000;
    var keep = values.filter(function (row) {
      var expV = row[info.index.expires_at];
      var exp = expV instanceof Date ? expV.getTime() : Date.parse(str_(expV));
      var revV = row[info.index.revoked_at];
      var rev = revV instanceof Date ? revV.getTime() : (str_(revV) ? Date.parse(str_(revV)) : NaN);
      var expired = !(exp > cutoff);
      var revokedOld = !isNaN(rev) && rev < cutoff;
      return !(expired || revokedOld);
    });
    removed = values.length - keep.length;
    if (!removed) return;
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
    if (keep.length) sheet.getRange(2, 1, keep.length, lastCol).setValues(keep);
  });
  return removed;
}

/**
 * Catat aktivitas penting ke AuditLog. Tidak pernah mencatat kata sandi, hash, token,
 * atau nilai data sensitif. `strict`=true membuat kegagalan pencatatan menggagalkan aksi.
 */
function audit_(ctx, aksi, storeId, keterangan, strict) {
  try {
    appendObject_(SHEETS.AUDIT_LOG, {
      waktu: isoNow_(),
      user_id: (ctx && ctx.user_id) || '',
      kode_cabang: (ctx && ctx.kode_cabang) || '',
      aksi: aksi,
      store_id: storeId || '',
      keterangan: keterangan || '',
    });
  } catch (e) {
    console.warn('Gagal menulis AuditLog: ' + e.message);
    if (strict) throw new AppError('SHEET_ERROR', 'Aksi dibatalkan karena pencatatan audit gagal.');
  }
}
