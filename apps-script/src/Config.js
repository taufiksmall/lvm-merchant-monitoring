/**
 * Konfigurasi statis backend Monitoring Merchant LVM.
 *
 * File ini hanya berisi konstanta struktur (nama sheet, header, daftar kolom).
 * Nilai yang boleh diubah admin TIDAK ada di sini:
 *   - Rahasia (API_SHARED_SECRET, SPREADSHEET_ID, ADMIN_EMAILS) -> Script Properties.
 *   - Aturan bisnis (definisi USAK, aturan prioritas, status follow-up, role,
 *     pengaturan sesi) -> sheet konfigurasi di spreadsheet.
 */

var APP = {
  NAME: 'lvm-merchant-api',
  VERSION: '1.0.0',
  // Target rasio USAK cabang sesuai kebutuhan bisnis: minimal 50%.
  TARGET_RATIO: 0.5,
  // Lama cache konfigurasi (detik). Perubahan sheet konfigurasi berlaku paling lambat
  // setelah waktu ini, atau segera setelah menu "Bersihkan cache" dijalankan.
  CONFIG_CACHE_SECONDS: 120,
  // Lama cache sesi (detik). Penonaktifan akun berlaku paling lambat setelah waktu ini.
  SESSION_CACHE_SECONDS: 300,
  MAX_BODY_CHARS: 100000,
  MAX_NOTE_CHARS: 2000,
};

/**
 * Pembacaan sheet Merchants besar (puluhan/ratusan ribu baris). Hanya baris cabang pengguna
 * yang dimuat ke memori; sheet yang terurut per cabang dibaca sebagai satu blok.
 */
var MERCHANT_SCAN_CHUNK_ROWS = 8000;   // baris per getValues()
var MERCHANT_SEGMENT_GAP = 100;        // celah baris yang masih digabung ke satu segmen
var MERCHANT_MAX_SEGMENTS = 40;        // batas panggilan getRange; celah penggabungan diperlebar bila lebih
var MERCHANT_SCAN_MIN_ROWS = 5000;     // baris sia-sia di bawah ini tidak dianggap masalah
var MERCHANT_SCAN_FULL_RATIO = 0.3;    // baris sia-sia > 30% sheet => mode 'full' (peringatan data tak terurut)

var SHEETS = {
  MERCHANTS: 'Merchants',
  USERS: 'Users',
  FOLLOW_UPS: 'FollowUps',
  SESSIONS: 'Sessions',
  ROLES: 'Roles',
  USAK_CONFIG: 'UsakConfig',
  PRIORITY_RULES: 'PriorityRules',
  OPTIONS: 'Options',
  SETTINGS: 'Settings',
  AUDIT_LOG: 'AuditLog',
  IMPORT_STAGING: 'Import_Merchants',
  IMPORT_REPORT: 'ImportReport',
  IMPORT_USERS: 'Import_Users',
  BRANCH_INDEX: 'BranchIndex',
  WILAYAH: 'Wilayah',
};

/** Header sheet Merchants. Nama dan urutan dipertahankan persis seperti sumber data. */
var MERCHANT_COLUMNS = [
  'store_id', 'store_name', 'account_number', 'owner_name', 'createddate', 'referal_code',
  'kode_pos', 'address', 'kecamatan', 'kabupaten', 'provinsi', 'mcc_code', 'lob_lm',
  'kode_cabang_final', 'nama_cabang_final', 'nama_area_final',
  'freq_mtd', 'sv_mtd', 'fbi_mtd', 'freq_ytd', 'sv_ytd', 'fbi_ytd', 'freq_30_days', 'sv_30_days',
  'mid_static', 'mid_dynamic', 'flag_card_dongle', 'status_trx', 'grading_trx', 'grading_usak',
  'tipe_akun', 'status_rekening', 'tangging_real_merchant', 'companytype', 'jenis_rekening',
  'cifno', 'cbalrp', 'ybal', 'avgbalrp', 'amtcrc', 'amtdrc', 'Tiering',
];

/**
 * Kolom yang wajib ada agar aplikasi bisa berjalan. Kolom sumber USAK (grading_trx atau
 * grading_usak, lihat Settings USAK_SOURCE_COLUMN) ditambahkan secara dinamis lewat
 * merchantRequiredColumns_(). Kolom lain yang hilang hanya menjadi peringatan.
 */
var MERCHANT_REQUIRED_COLUMNS = ['store_id', 'store_name', 'kode_cabang_final', 'nama_cabang_final'];

/** Kolom yang boleh menjadi sumber status USAK. Hanya satu kolom aktif; ditetapkan di sheet Settings. */
var USAK_SOURCE_CHOICES = ['grading_trx', 'grading_usak'];
var DEFAULT_USAK_SOURCE = 'grading_trx';

/** Kolom wajib terisi pada setiap baris saat impor. */
var MERCHANT_REQUIRED_VALUES = ['store_id', 'store_name', 'kode_cabang_final', 'nama_cabang_final'];

/** Kolom kode/identitas: diformat Plain Text agar nol di depan tidak hilang. */
var MERCHANT_TEXT_COLUMNS = [
  'store_id', 'account_number', 'referal_code', 'kode_pos', 'mcc_code', 'kode_cabang_final',
  'mid_static', 'mid_dynamic', 'cifno',
];

var MERCHANT_NUMBER_COLUMNS = [
  'freq_mtd', 'sv_mtd', 'fbi_mtd', 'freq_ytd', 'sv_ytd', 'fbi_ytd', 'freq_30_days', 'sv_30_days',
  'cbalrp', 'ybal', 'avgbalrp', 'amtcrc', 'amtdrc',
];

var MERCHANT_DATE_COLUMNS = ['createddate'];

/** Metrik performa yang diringkas di dashboard (snapshot, bukan tren). */
var PERFORMANCE_METRICS = [
  'freq_mtd', 'sv_mtd', 'fbi_mtd', 'freq_ytd', 'sv_ytd', 'fbi_ytd', 'freq_30_days', 'sv_30_days',
];

/** Data identitas sensitif: selalu disamarkan; nilai asli hanya lewat aksi reveal + audit. */
var SENSITIVE_IDENTITY_COLUMNS = ['account_number', 'cifno'];

/** Data saldo/keuangan nasabah: tidak dikirim kecuali role berhak dan meminta reveal. */
var SENSITIVE_FINANCIAL_COLUMNS = ['cbalrp', 'ybal', 'avgbalrp', 'amtcrc', 'amtdrc'];

/** Kolom yang dikirim pada daftar merchant (tanpa data sensitif). grading_usak hanya bila menjadi sumber USAK. */
var MERCHANT_LIST_COLUMNS = [
  'store_id', 'mid_static', 'store_name', 'owner_name', 'status_trx', 'grading_trx', 'grading_usak', 'Tiering',
  'freq_mtd', 'sv_mtd', 'fbi_mtd', 'freq_30_days', 'sv_30_days',
  'kode_cabang_final', 'nama_cabang_final', 'nama_area_final', 'status_rekening', 'flag_card_dongle',
];

/** Kolom yang dapat difilter (nilai persis, dibandingkan tanpa beda huruf besar/kecil). */
var MERCHANT_FILTER_COLUMNS = [
  'status_trx', 'grading_trx', 'grading_usak', 'Tiering', 'status_rekening', 'flag_card_dongle', 'nama_area_final',
];

/** Field pengurutan yang diizinkan. type: number | text | date. */
var MERCHANT_SORT_FIELDS = {
  priority: 'number',
  freq_mtd: 'number',
  sv_mtd: 'number',
  fbi_mtd: 'number',
  freq_ytd: 'number',
  sv_ytd: 'number',
  fbi_ytd: 'number',
  freq_30_days: 'number',
  sv_30_days: 'number',
  store_name: 'text',
  next_follow_up: 'date',
  last_follow_up: 'date',
};

/** Kategori hasil klasifikasi nilai kolom sumber USAK. */
var USAK_KATEGORI = {
  USAK: 'USAK',
  BELUM_USAK: 'BELUM_USAK',
  KOSONG: 'KOSONG',
  TIDAK_DIKENALI: 'TIDAK_DIKENALI',
};

var USAK_KATEGORI_LABELS = {
  USAK: 'USAK',
  BELUM_USAK: 'Belum USAK',
  KOSONG: 'Kosong (perlu dicek)',
  TIDAK_DIKENALI: 'Tidak dikenali (perlu dicek)',
};

/** Nilai filter khusus untuk mencari sel kosong. */
var BLANK_FILTER_VALUE = '__KOSONG__';

/** Pilihan filter kebutuhan follow-up pada daftar merchant. */
var FOLLOW_UP_FILTERS = {
  perlu: 'Perlu follow-up',
  belum_pernah: 'Belum pernah di-follow-up',
  sudah_ada: 'Sudah ada follow-up',
  tidak_perlu: 'Tidak perlu follow-up',
};

/** Header sheet pendukung. */
var SHEET_SCHEMAS = {
  Users: ['user_id', 'kode_cabang', 'nama_cabang', 'password_hash', 'role', 'is_active'],
  FollowUps: [
    'follow_up_id', 'store_id', 'kode_cabang', 'status_follow_up', 'catatan',
    'tanggal_follow_up_berikutnya', 'progres_usak', 'created_by', 'created_at', 'updated_at',
  ],
  Sessions: ['session_hash', 'user_id', 'kode_cabang', 'credential_fp', 'created_at', 'expires_at', 'revoked_at'],
  Roles: [
    'role', 'keterangan', 'boleh_lihat_sensitif', 'boleh_lihat_keuangan', 'boleh_cari_rekening',
    'boleh_tulis_follow_up', 'boleh_ubah_semua_follow_up',
  ],
  UsakConfig: ['nilai_kolom_usak', 'kategori', 'keterangan'],
  PriorityRules: ['rule_id', 'aktif', 'label', 'kolom', 'operator', 'nilai', 'bobot', 'keterangan'],
  Options: ['jenis', 'kode', 'label', 'urutan', 'final', 'aktif'],
  Settings: ['kunci', 'nilai', 'keterangan'],
  AuditLog: ['waktu', 'user_id', 'kode_cabang', 'aksi', 'store_id', 'keterangan'],
  // Sheet kerja impor hash kata sandi massal (lihat applyUserHashImport_).
  Import_Users: ['user_id', 'password_hash', 'is_active'],
  // Posisi baris Merchants per cabang (dibangun admin) agar pemuatan cabang tidak memindai seluruh sheet.
  // Lima kolom pertama = indeks baris; sisanya = ringkasan cabang (snapshot saat indeks dibangun) untuk pemantauan region/area.
  BranchIndex: [
    'kode_cabang', 'baris_awal', 'baris_akhir', 'jumlah', 'diperbarui',
    'nama_cabang', 'nama_area', 'jumlah_usak', 'jumlah_belum_usak', 'jumlah_perlu_dicek',
  ],
  // Pemetaan area -> region; kode_area/kode_region dipakai sebagai kode login akun area/region.
  Wilayah: ['nama_area_final', 'kode_area', 'nama_region', 'kode_region', 'jumlah_cabang', 'jumlah_merchant'],
};

/** Kolom yang diformat Plain Text pada sheet pendukung. */
var SHEET_TEXT_COLUMNS = {
  Users: ['user_id', 'kode_cabang', 'password_hash'],
  FollowUps: SHEET_SCHEMAS.FollowUps,
  Sessions: SHEET_SCHEMAS.Sessions,
  UsakConfig: ['nilai_kolom_usak'],
  PriorityRules: ['rule_id', 'nilai'],
  Settings: ['kunci', 'nilai'],
  AuditLog: SHEET_SCHEMAS.AuditLog,
  Import_Users: ['user_id', 'password_hash'],
  BranchIndex: ['kode_cabang'],
  Wilayah: ['nama_area_final', 'kode_area', 'nama_region', 'kode_region'],
};

/**
 * Pengaturan bawaan. Nilai di sheet Settings (kolom `kunci` / `nilai`) menimpa nilai ini.
 * Tidak ada rahasia di sini.
 */
var DEFAULT_SETTINGS = {
  SESSION_TTL_HOURS: { nilai: '8', keterangan: 'Masa berlaku sesi login (jam, 1-24).' },
  CACHE_TTL_SECONDS: { nilai: '600', keterangan: 'Lama cache data merchant per cabang (detik, 60-21600).' },
  PRIORITY_MIN_SCORE: { nilai: '10', keterangan: 'Skor prioritas minimal agar merchant ditandai "perlu follow-up". 10 = hanya merchant Tier 2-5 (Tier 1 tidak perlu dikejar).' },
  LOGIN_MAX_ATTEMPTS: { nilai: '5', keterangan: 'Batas percobaan login gagal per kode cabang sebelum dikunci sementara.' },
  LOGIN_LOCK_MINUTES: { nilai: '15', keterangan: 'Lama penguncian login setelah batas percobaan tercapai (menit).' },
  DEFAULT_PAGE_SIZE: { nilai: '25', keterangan: 'Jumlah baris per halaman bawaan pada daftar merchant.' },
  MAX_PAGE_SIZE: { nilai: '100', keterangan: 'Jumlah baris per halaman maksimum.' },
  KODE_CABANG_PAD_LENGTH: { nilai: '', keterangan: 'Opsional. Isi panjang kode cabang (mis. 4) agar kode angka dilengkapi nol di depan (101 -> 0101).' },
  USAK_SOURCE_COLUMN: { nilai: 'grading_trx', keterangan: 'Satu-satunya kolom Merchants yang menentukan status USAK: grading_trx atau grading_usak. Nilainya dipetakan di sheet UsakConfig.' },
  AUDIT_LOGIN: { nilai: 'FALSE', keterangan: 'TRUE = catat setiap login berhasil di AuditLog (menambah ±0,5 detik per login). Percobaan terkunci dan akses data sensitif selalu dicatat.' },
  PBKDF2_ITERATIONS: { nilai: '100000', keterangan: 'Iterasi hash kata sandi baru yang dibuat lewat menu admin.' },
  DATA_SNAPSHOT_DATE: { nilai: '', keterangan: 'Opsional. Tanggal posisi data merchant (yyyy-MM-dd) untuk ditampilkan di dashboard.' },
  TIMEZONE: { nilai: 'Asia/Jakarta', keterangan: 'Zona waktu untuk tanggal jatuh tempo follow-up.' },
};

/**
 * Role bawaan. Admin dapat mengubah/menambah baris di sheet Roles.
 * Bawaan bersifat hemat akses: petugas tidak dapat membuka data sensitif.
 */
var DEFAULT_ROLES = [
  ['petugas', 'Petugas cabang: melihat merchant cabang & mencatat follow-up.', 'FALSE', 'FALSE', 'FALSE', 'TRUE', 'FALSE'],
  ['supervisor', 'Supervisor cabang: dapat membuka data sensitif (tercatat di AuditLog) & mengubah semua follow-up cabang.', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE'],
  ['viewer', 'Hanya melihat, tidak dapat mencatat follow-up.', 'FALSE', 'FALSE', 'FALSE', 'FALSE', 'FALSE'],
  ['area', 'Akun area: memantau capaian rasio USAK semua cabang di areanya (hanya melihat).', 'FALSE', 'FALSE', 'FALSE', 'FALSE', 'FALSE'],
  ['region', 'Akun region: memantau capaian rasio USAK semua cabang di regionnya (hanya melihat).', 'FALSE', 'FALSE', 'FALSE', 'FALSE', 'FALSE'],
];

/** Role yang melihat banyak cabang (tampilan pemantauan), bukan satu cabang. */
var SCOPE_ROLES = ['area', 'region'];

/**
 * Pemetaan nilai kolom sumber USAK (grading_trx) -> kategori. Definisi dikonfirmasi pemilik bisnis
 * pada 2026-10-20 dan diisi ke sheet UsakConfig oleh setup HANYA bila sheet itu masih kosong.
 * Nilai lain yang muncul di data tidak dihitung USAK dan ditandai "tidak dikenali" sampai
 * admin menambahkannya di UsakConfig.
 */
var DEFAULT_USAK_CONFIG = [
  ['USAK', 'USAK', 'Definisi dikonfirmasi pemilik bisnis 2026-10-20.'],
  ['USAK IDEAL', 'USAK', 'Definisi dikonfirmasi pemilik bisnis 2026-10-20.'],
  ['USAK OPTIMAL', 'USAK', 'Definisi dikonfirmasi pemilik bisnis 2026-10-20.'],
  ['UREG > 0', 'BELUM_USAK', 'Definisi dikonfirmasi pemilik bisnis 2026-10-20.'],
  ['UREG = 0', 'BELUM_USAK', 'Definisi dikonfirmasi pemilik bisnis 2026-10-20.'],
];

/**
 * Pilihan bawaan status follow-up dan progres USAK (alur kerja, bukan definisi USAK).
 * final=TRUE: merchant dengan status terakhir ini tidak lagi dihitung "perlu follow-up".
 */
var DEFAULT_OPTIONS = [
  ['status_follow_up', 'DIJADWALKAN', 'Dijadwalkan', '1', 'FALSE', 'TRUE'],
  ['status_follow_up', 'SUDAH_DIHUBUNGI', 'Sudah dihubungi', '2', 'FALSE', 'TRUE'],
  ['status_follow_up', 'SUDAH_DIKUNJUNGI', 'Sudah dikunjungi', '3', 'FALSE', 'TRUE'],
  ['status_follow_up', 'MENUNGGU_RESPONS', 'Menunggu respons merchant', '4', 'FALSE', 'TRUE'],
  ['status_follow_up', 'TIDAK_DAPAT_DIHUBUNGI', 'Tidak dapat dihubungi', '5', 'FALSE', 'TRUE'],
  ['status_follow_up', 'TIDAK_BERMINAT', 'Tidak berminat', '6', 'TRUE', 'TRUE'],
  ['status_follow_up', 'PERLU_QRIS_AKRILIK', 'Perlu pemasangan QRIS Akrilik', '7', 'FALSE', 'TRUE'],
  ['status_follow_up', 'SELESAI', 'Komit Optimalkan LVM', '8', 'TRUE', 'TRUE'],
  ['progres_usak', 'BELUM_DIMULAI', 'Belum dimulai', '1', '', 'TRUE'],
  ['progres_usak', 'EDUKASI', 'Edukasi / sosialisasi', '2', '', 'TRUE'],
  ['progres_usak', 'DALAM_PROSES', 'Dalam proses', '3', '', 'TRUE'],
  ['progres_usak', 'MENUNGGU_PEMBARUAN_DATA', 'Menunggu pembaruan data grading', '4', '', 'TRUE'],
];

/**
 * Aturan prioritas bawaan (asumsi awal, silakan diubah di sheet PriorityRules).
 * Baris dengan rule_id yang sama digabung dengan AND. Tidak ada ambang performa permanen:
 * contoh aturan berbasis transaksi dibuat nonaktif sampai definisi bisnis tersedia.
 */
var DEFAULT_PRIORITY_RULES = [
  ['R01', 'TRUE', 'Belum USAK', '_kategori_usak', 'eq', 'BELUM_USAK', '3', 'Asumsi awal: merchant belum USAK adalah sasaran follow-up.'],
  ['R02', 'TRUE', 'Nilai USAK perlu diperiksa', '_kategori_usak', 'in', 'KOSONG,TIDAK_DIKENALI', '2', 'Nilai kolom sumber USAK kosong atau tidak ada di UsakConfig.'],
  ['R03', 'TRUE', 'Jadwal follow-up jatuh tempo', '_follow_up_jatuh_tempo', 'eq', 'TRUE', '2', 'Tanggal follow-up berikutnya hari ini atau sudah lewat.'],
  ['R04', 'TRUE', 'Belum pernah di-follow-up', '_kategori_usak', 'neq', 'USAK', '1', 'Baris R04 digabung (AND) dengan baris R04 berikutnya.'],
  ['R04', 'TRUE', 'Belum pernah di-follow-up', '_ada_follow_up', 'eq', 'FALSE', '1', ''],
  ['R05', 'FALSE', 'Tanpa transaksi 30 hari', 'freq_30_days', 'eq', '0', '1', 'CONTOH nonaktif. Aktifkan bila sesuai definisi bisnis.'],
  // Prioritas utama berdasarkan kolom Tiering (definisi bisnis 2026-10-20). Bobot besar agar Tiering mendominasi
  // urutan; aturan R01-R04 hanya menjadi pembeda dalam tier yang sama. Tier 1 tidak perlu dikejar.
  ['R06', 'TRUE', 'Tier 2: ≥20 trx, SV <Rp100 rb (dikejar pertama)', 'Tiering', 'contains', 'Tier 2', '30', 'Paling dekat ke Tier 1.'],
  ['R07', 'TRUE', 'Tier 3: SV ≥Rp100 rb, trx <20 (dikejar kedua)', 'Tiering', 'contains', 'Tier 3', '20', 'Paling dekat ke Tier 1 setelah Tier 2.'],
  ['R08', 'TRUE', 'Tier 4: trx <20, SV <Rp100 rb (prioritas terendah)', 'Tiering', 'contains', 'Tier 4', '10', 'Prioritas terendah.'],
  ['R09', 'TRUE', 'Tier 5: trx <20, SV <Rp100 rb (prioritas terendah)', 'Tiering', 'contains', 'Tier 5', '10', 'Prioritas terendah.'],
];

/** Field turunan yang dapat dipakai di PriorityRules selain kolom Merchants. */
var RULE_VIRTUAL_FIELDS = [
  '_kategori_usak', '_status_follow_up', '_follow_up_jatuh_tempo', '_ada_follow_up', '_hari_sejak_follow_up',
];

var RULE_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'empty', 'not_empty', 'contains'];
