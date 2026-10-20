/**
 * Titik masuk Web App.
 *
 * Format request (POST, body JSON):
 *   { "action": "merchants.list", "api_key": "<API_SHARED_SECRET>", "token": "<token sesi>", "payload": {...} }
 *
 * Format respons:
 *   { "ok": true,  "data": {...} }
 *   { "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "details": {...} } }
 *
 * Apps Script Web App selalu membalas HTTP 200, sehingga status ada di field `ok`/`error.code`.
 * Server Next.js (BFF) memetakan kode error ke status HTTP untuk browser.
 */

/** Daftar aksi yang tersedia. Tidak ada aksi baca/tulis range sembarang. */
function routes_() {
  return {
    'auth.login': { auth: false, fn: function (ctx, p) { return login_(p); } },
    'auth.logout': { fn: function (ctx) { return logout_(ctx); } },
    'auth.me': { fn: function (ctx) { return me_(ctx); } },
    'dashboard.summary': { fn: function (ctx) { return dashboardSummary_(ctx); } },
    'merchants.list': { fn: function (ctx, p) { return listMerchants_(ctx, p); } },
    'merchants.filterOptions': { fn: function (ctx) { return filterOptions_(ctx); } },
    'merchants.detail': { fn: function (ctx, p) { return merchantDetail_(ctx, p); } },
    'merchants.revealSensitive': { fn: function (ctx, p) { return revealSensitive_(ctx, p); } },
    'followups.list': { fn: function (ctx, p) { return listFollowUps_(ctx, p); } },
    'followups.create': { fn: function (ctx, p) { return createFollowUp_(ctx, p); } },
    'followups.update': { fn: function (ctx, p) { return updateFollowUp_(ctx, p); } },
  };
}

function doGet() {
  // Hanya status layanan; tidak ada data.
  return jsonOutput_(okResponse_({ service: APP.NAME, version: APP.VERSION, status: 'up' }));
}

function doPost(e) {
  return jsonOutput_(handleRequest_(e));
}

function handleRequest_(e) {
  var action = '';
  try {
    var body = parseRequestBody_(e);
    action = body.action;
    assertClient_(body.api_key);
    var route = routes_()[action];
    if (!route) throw new AppError('UNKNOWN_ACTION', 'Aksi tidak dikenal.');
    var payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {};
    var ctx = route.auth === false ? null : requireSession_(body.token);
    return okResponse_(route.fn(ctx, payload));
  } catch (err) {
    if (err instanceof AppError) return errorResponse_(err.code, err.message, err.details);
    // Error tak terduga: catat stack trace (hanya terlihat pemilik skrip), jangan kirim detail ke klien.
    console.error('Aksi ' + action + ' gagal: ' + (err && err.stack ? err.stack : err));
    return errorResponse_('INTERNAL', 'Terjadi kesalahan pada server. Coba lagi beberapa saat.');
  } finally {
    configMemo_ = null;
    spreadsheetCache_ = null;
  }
}

function parseRequestBody_(e) {
  var raw = e && e.postData && e.postData.contents;
  if (!raw) throw new AppError('BAD_REQUEST', 'Body request kosong.');
  if (raw.length > APP.MAX_BODY_CHARS) throw new AppError('BAD_REQUEST', 'Body request terlalu besar.');
  var body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    throw new AppError('BAD_REQUEST', 'Body request bukan JSON yang valid.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('BAD_REQUEST', 'Body request tidak valid.');
  if (typeof body.action !== 'string' || body.action.length > 64) throw new AppError('BAD_REQUEST', 'Aksi tidak valid.');
  return body;
}

/**
 * Pastikan request berasal dari server Next.js (BFF) yang memegang API_SHARED_SECRET.
 * Gagal tertutup: bila secret belum diatur, semua request ditolak.
 */
function assertClient_(apiKey) {
  var secret = PropertiesService.getScriptProperties().getProperty('API_SHARED_SECRET');
  if (!secret || secret.length < 32) {
    throw new AppError('CONFIG_ERROR', 'API_SHARED_SECRET belum diatur (minimal 32 karakter) di Script Properties.');
  }
  if (typeof apiKey !== 'string' || !constantTimeEquals_(apiKey, secret)) {
    throw new AppError('UNAUTHORIZED_CLIENT', 'Klien API tidak dikenali.');
  }
}
