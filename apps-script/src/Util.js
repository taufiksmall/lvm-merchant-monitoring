/**
 * Utilitas umum: error, respons, normalisasi nilai, tanggal, dan sanitasi sel.
 */

class AppError extends Error {
  /**
   * @param {string} code Kode error stabil (dipakai frontend).
   * @param {string} message Pesan Bahasa Indonesia yang aman ditampilkan ke pengguna.
   * @param {Object=} details Detail tambahan yang aman (tanpa data sensitif).
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details || null;
  }
}

function okResponse_(data) {
  return { ok: true, data: data === undefined ? null : data };
}

function errorResponse_(code, message, details) {
  var error = { code: code, message: message };
  if (details) error.details = details;
  return { ok: false, error: error };
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Waktu sekarang. Dibungkus fungsi agar mudah diganti saat pengujian. */
function now_() {
  return new Date();
}

function isBlank_(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** Ubah nilai sel menjadi string yang sudah di-trim. */
function str_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  if (typeof v === 'number') return isFinite(v) ? String(v) : '';
  return unsanitizeCell_(String(v)).trim();
}

/** Kunci pembanding tanpa beda huruf besar/kecil dan spasi berlebih. */
function normKey_(v) {
  return str_(v).replace(/\s+/g, ' ').toLowerCase();
}

/** Normalisasi header: huruf kecil, spasi/tanda hubung menjadi underscore. */
function normHeader_(v) {
  return str_(v).toLowerCase().replace(/[\s\-]+/g, '_');
}

/** Normalisasi kode cabang (trim, huruf besar, opsional pad nol di depan untuk kode angka). */
function normKode_(v, padLength) {
  var s = str_(v).toUpperCase();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  var pad = Number(padLength) || 0;
  if (pad > 0 && /^\d+$/.test(s) && s.length < pad) {
    while (s.length < pad) s = '0' + s;
  }
  return s;
}

/**
 * Ubah nilai menjadi angka. Mengembalikan null bila kosong atau tidak valid.
 * Format yang didukung: 1234.5 | 1234,5 | 1.234.567 | 1.234.567,89 | 1,234,567.89
 */
function toNumber_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;
  var s = str_(v).replace(/\s+/g, '').replace(/^rp\.?/i, '');
  if (s === '' || s === '-') return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(',', '.'));
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ''));
  return null;
}

/** Nilai boolean dari sel (checkbox TRUE/FALSE atau teks YA/TIDAK/1/0/AKTIF). */
function toBool_(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  if (typeof v === 'number') return v === 1;
  var s = str_(v).toUpperCase();
  return s === 'TRUE' || s === 'YA' || s === 'Y' || s === '1' || s === 'AKTIF' || s === 'YES';
}

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

function isValidYmd_(y, m, d) {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  var days = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= days[m - 1];
}

/**
 * Ubah nilai tanggal menjadi string 'yyyy-MM-dd'.
 * Mendukung objek Date, yyyy-mm-dd[ jam], yyyy/mm/dd, dd/mm/yyyy, dd-mm-yyyy (hari lebih dulu),
 * dan nomor seri tanggal Google Sheets. Mengembalikan '' bila kosong, null bila tidak valid.
 */
function toIsoDate_(v, tz) {
  if (isBlank_(v)) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return Utilities.formatDate(v, tz || 'Asia/Jakarta', 'yyyy-MM-dd');
  }
  if (typeof v === 'number') {
    if (v > 1 && v < 110000) {
      var ms = Math.round((v - 25569) * 86400000);
      var d = new Date(ms);
      return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
    }
    return null;
  }
  var s = str_(v);
  var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T].*)?$/);
  if (m) {
    var y1 = Number(m[1]), mo1 = Number(m[2]), d1 = Number(m[3]);
    return isValidYmd_(y1, mo1, d1) ? y1 + '-' + pad2_(mo1) + '-' + pad2_(d1) : null;
  }
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:[ T].*)?$/);
  if (m) {
    var d2 = Number(m[1]), mo2 = Number(m[2]), y2 = Number(m[3]);
    return isValidYmd_(y2, mo2, d2) ? y2 + '-' + pad2_(mo2) + '-' + pad2_(d2) : null;
  }
  return null;
}

/** Tanggal hari ini (yyyy-MM-dd) pada zona waktu tertentu. */
function todayYmd_(tz) {
  return Utilities.formatDate(now_(), tz || 'Asia/Jakarta', 'yyyy-MM-dd');
}

/** Selisih hari antara dua tanggal yyyy-MM-dd (b - a). */
function daysBetweenYmd_(a, b) {
  var pa = a.split('-'), pb = b.split('-');
  var ta = Date.UTC(Number(pa[0]), Number(pa[1]) - 1, Number(pa[2]));
  var tb = Date.UTC(Number(pb[0]), Number(pb[1]) - 1, Number(pb[2]));
  return Math.round((tb - ta) / 86400000);
}

function addDaysYmd_(ymd, days) {
  var p = ymd.split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + days));
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
}

/** ISO timestamp UTC untuk kolom created_at/updated_at. */
function isoNow_() {
  return now_().toISOString();
}

/**
 * Cegah formula injection: teks yang diawali = + - @ disimpan dengan apostrof di depan
 * sehingga Google Sheets memperlakukannya sebagai teks biasa.
 */
function sanitizeCell_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

/** Kebalikan sanitizeCell_/forceTextCell_ bila apostrof ikut terbaca. */
function unsanitizeCell_(s) {
  return /^'([=+\-@]|[\d.,]+$)/.test(s) ? s.substring(1) : s;
}

/** Paksa teks berbentuk angka (mis. kode "0101") tetap teks agar nol di depan tidak hilang. */
function forceTextCell_(v) {
  if (typeof v !== 'string') return v;
  return /^[\d.,]+$/.test(v) ? "'" + v : sanitizeCell_(v);
}

/** Hapus karakter kontrol (kecuali baris baru & tab) dari input teks pengguna. */
function cleanText_(v, maxLen) {
  var s = (v === null || v === undefined) ? '' : String(v);
  s = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (maxLen && s.length > maxLen) {
    throw new AppError('VALIDATION_ERROR', 'Teks terlalu panjang (maksimal ' + maxLen + ' karakter).');
  }
  return s;
}

/** Samarkan nilai: tampilkan beberapa karakter terakhir saja. */
function maskValue_(v, visible) {
  var s = str_(v);
  if (!s) return '';
  var keep = visible === undefined ? 4 : visible;
  if (s.length <= keep) return new Array(s.length + 1).join('•');
  return new Array(s.length - keep + 1).join('•') + s.substring(s.length - keep);
}

function clampInt_(v, min, max, fallback) {
  var n = parseInt(v, 10);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Ambil array string dari input (string tunggal atau array). */
function toStringArray_(v, maxItems) {
  if (isBlank_(v)) return [];
  var arr = Array.isArray(v) ? v : [v];
  var out = [];
  for (var i = 0; i < arr.length && out.length < (maxItems || 50); i++) {
    if (arr[i] === null || arr[i] === undefined) continue;
    out.push(String(arr[i]).substring(0, 200));
  }
  return out;
}
