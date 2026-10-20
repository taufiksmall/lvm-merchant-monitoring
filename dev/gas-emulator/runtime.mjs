/**
 * Emulator Google Apps Script untuk pengembangan & pengujian lokal.
 *
 * Memuat file apps-script/src/*.js APA ADANYA ke dalam satu konteks V8 (seperti Apps Script),
 * lalu menyediakan tiruan in-memory untuk layanan Google yang dipakai backend:
 * SpreadsheetApp, CacheService, PropertiesService, LockService, Utilities, ContentService,
 * Session, HtmlService, ScriptApp.
 *
 * Tiruan Sheets meniru perilaku penting Google Sheets:
 *   - teks berbentuk angka otomatis menjadi angka kecuali kolom berformat Plain Text (@)
 *   - teks diawali apostrof disimpan sebagai teks (apostrof tidak ikut terbaca)
 *   - teks diawali "=" dianggap formula (terbaca sebagai "#FORMULA") untuk mendeteksi injection
 *
 * Bukan untuk produksi.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '..', '..');
const srcDir = path.join(projectRoot, 'apps-script', 'src');

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    if (row < 1 || col < 1 || numRows < 1 || numCols < 1) {
      throw new Error(`Range tidak valid: ${row},${col},${numRows},${numCols}`);
    }
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet._read(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  getValue() { return this.sheet._read(this.row, this.col); }
  setValues(values) {
    if (values.length !== this.numRows || values.some((v) => v.length !== this.numCols)) {
      throw new Error(`Jumlah data tidak cocok dengan range (${this.numRows}x${this.numCols}).`);
    }
    values.forEach((line, r) => line.forEach((v, c) => this.sheet._write(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) { this.sheet._write(this.row, this.col, v); return this; }
  clearContent() {
    for (let r = 0; r < this.numRows; r++) for (let c = 0; c < this.numCols; c++) this.sheet._setRaw(this.row + r, this.col + c, '');
    return this;
  }
  setNumberFormat(fmt) {
    for (let c = 0; c < this.numCols; c++) this.sheet.formats.set(this.col + c, fmt);
    return this;
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setWrap() { return this; }
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.cells = [];
    this.formats = new Map();
    this.maxRows = 1000;
  }
  getName() { return this.name; }
  _read(row, col) {
    const line = this.cells[row - 1];
    const v = line ? line[col - 1] : undefined;
    if (v === undefined || v === null) return '';
    if (typeof v === 'object' && v.formula) return '#FORMULA';
    return v;
  }
  _setRaw(row, col, v) {
    while (this.cells.length < row) this.cells.push([]);
    this.cells[row - 1][col - 1] = v;
    if (row > this.maxRows) this.maxRows = row;
  }
  _write(row, col, v) {
    let value = v;
    if (value instanceof Date) value = new Date(value.getTime());
    else if (typeof value === 'string') {
      if (value.startsWith("'")) value = value.slice(1);
      else if (value.startsWith('=')) value = { formula: value };
      else if (this.formats.get(col) !== '@' && NUMERIC_TEXT.test(value.trim())) value = Number(value.trim());
    }
    this._setRaw(row, col, value);
  }
  getLastRow() {
    for (let r = this.cells.length; r >= 1; r--) {
      if ((this.cells[r - 1] || []).some((v) => v !== '' && v !== undefined && v !== null)) return r;
    }
    return 0;
  }
  getLastColumn() {
    let max = 0;
    for (const line of this.cells) {
      for (let c = line.length; c >= 1; c--) {
        const v = line[c - 1];
        if (v !== '' && v !== undefined && v !== null) { max = Math.max(max, c); break; }
      }
    }
    return max;
  }
  getMaxRows() { return Math.max(this.maxRows, this.cells.length); }
  insertRowsAfter(_after, howMany) { this.maxRows += howMany; return this; }
  getRange(row, col, numRows = 1, numCols = 1) {
    if (typeof row === 'string') throw new Error('Emulator hanya mendukung getRange numerik.');
    return new MockRange(this, row, col, numRows, numCols);
  }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(values) {
    const row = this.getLastRow() + 1;
    values.forEach((v, c) => this._write(row, c + 1, v));
    return this;
  }
  setFrozenRows() { return this; }
  clear() { this.cells = []; return this; }
  /** Bantuan emulator: isi sheet dengan nilai mentah (meniru impor CSV tanpa konversi). */
  _loadRaw(rows) { this.cells = rows.map((r) => r.slice()); }
  _dump() { return this.getDataRange().getValues(); }
}

class MockSpreadsheet {
  constructor() { this.sheets = new Map(); }
  getId() { return 'emulator-spreadsheet'; }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) {
    if (this.sheets.has(name)) throw new Error(`Sheet ${name} sudah ada.`);
    const s = new MockSheet(name);
    this.sheets.set(name, s);
    return s;
  }
  getSheets() { return [...this.sheets.values()]; }
  getOwner() { return { getEmail: () => 'admin@emulator.test' }; }
  getSpreadsheetTimeZone() { return 'Asia/Jakarta'; }
}

function formatDate(date, tz, pattern) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return pattern.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, lit) => {
    if (lit !== undefined) return lit;
    return { yyyy: parts.year, MM: parts.month, dd: parts.day, HH: parts.hour, mm: parts.minute, ss: parts.second }[m];
  });
}

/**
 * @param {{ properties?: Record<string,string>, adminEmail?: string, quiet?: boolean }} options
 */
export function createRuntime(options = {}) {
  let offsetMs = 0;
  const nowMs = () => Date.now() + offsetMs;
  const spreadsheet = new MockSpreadsheet();
  const props = new Map(Object.entries(options.properties || {}));
  const cache = new Map();
  const logs = [];
  const log = (level) => (...args) => {
    logs.push({ level, text: args.map(String).join(' ') });
    if (!options.quiet) console[level === 'log' ? 'log' : level]('[gas]', ...args);
  };

  const cacheApi = {
    get(key) {
      const e = cache.get(key);
      if (!e) return null;
      if (e.exp <= nowMs()) { cache.delete(key); return null; }
      return e.value;
    },
    put(key, value, ttl = 600) {
      if (String(value).length > 100 * 1024) throw new Error('Argumen terlalu besar: value');
      cache.set(key, { value: String(value), exp: nowMs() + Math.min(ttl, 21600) * 1000 });
    },
    getAll(keys) { const out = {}; for (const k of keys) { const v = cacheApi.get(k); if (v !== null) out[k] = v; } return out; },
    putAll(obj, ttl) { for (const [k, v] of Object.entries(obj)) cacheApi.put(k, v, ttl); },
    remove(key) { cache.delete(key); },
    removeAll(keys) { keys.forEach((k) => cache.delete(k)); },
  };
  const propsApi = {
    getProperty: (k) => (props.has(k) ? props.get(k) : null),
    setProperty: (k, v) => { props.set(k, String(v)); return propsApi; },
    deleteProperty: (k) => { props.delete(k); return propsApi; },
    getProperties: () => Object.fromEntries(props),
    setProperties: (obj) => { for (const [k, v] of Object.entries(obj)) props.set(k, String(v)); return propsApi; },
  };
  const adminEmail = options.adminEmail || 'admin@emulator.test';

  const sandbox = {
    console: { log: log('log'), info: log('log'), warn: log('warn'), error: log('error') },
    SpreadsheetApp: {
      openById: () => spreadsheet,
      getActiveSpreadsheet: () => spreadsheet,
      getUi: () => { throw new Error('UI tidak tersedia di emulator.'); },
    },
    CacheService: { getScriptCache: () => cacheApi },
    PropertiesService: { getScriptProperties: () => propsApi },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {}, hasLock: () => true }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate,
      sleep() {},
    },
    ContentService: {
      MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
      createTextOutput: (content) => ({ content, setMimeType() { return this; }, getContent() { return this.content; } }),
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => adminEmail }),
      getEffectiveUser: () => ({ getEmail: () => adminEmail }),
      getScriptTimeZone: () => 'Asia/Jakarta',
    },
    HtmlService: { createHtmlOutputFromFile: () => ({ setWidth() { return this; }, setHeight() { return this; } }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }) },
  };
  const context = vm.createContext(sandbox);
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js') && !f.startsWith('._')).sort();
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(srcDir, f), 'utf8'), context, { filename: `apps-script/src/${f}` });
  }
  // Jam yang dapat dimajukan saat pengujian.
  context.now_ = () => new Date(nowMs());

  function request(body) {
    const out = context.doPost({ postData: { contents: JSON.stringify(body), type: 'application/json' } });
    return JSON.parse(out.getContent());
  }

  return {
    context,
    spreadsheet,
    props: propsApi,
    logs,
    request,
    get: () => JSON.parse(context.doGet({}).getContent()),
    advance(ms) { offsetMs += ms; },
    clearCache() { cache.clear(); },
    /** Jalankan fungsi internal Apps Script (mis. setupSheets_) dengan reset memo seperti eksekusi baru. */
    run(fnName, ...args) {
      try { return context[fnName](...args); } finally { context.clearConfigMemo_(); }
    },
  };
}
