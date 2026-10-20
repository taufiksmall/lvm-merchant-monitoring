#!/usr/bin/env node
/**
 * Validasi file CSV merchant SEBELUM diunggah ke Google Sheets — sepenuhnya lokal.
 * Memakai fungsi validasi yang sama dengan Apps Script (apps-script/src/Import.js).
 *
 *   npm run validate:csv -- data/merchants.csv
 *   npm run validate:csv -- data/merchants.csv --usak-config=data/usak_config.csv --out=bersih.csv --report=laporan.csv
 *
 * --usak-config  CSV dengan header nilai_kolom_usak,kategori,keterangan (untuk memeriksa nilai kolom sumber USAK)
 * --source       kolom sumber USAK: grading_trx (bawaan) atau grading_usak
 * --out          tulis baris valid dengan header resmi & format angka/tanggal yang dinormalisasi
 * --report       tulis daftar masalah (baris, store_id, kolom, tingkat, masalah)
 * --pad=N        samakan dengan Settings KODE_CABANG_PAD_LENGTH bila dipakai
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRuntime } from '../dev/gas-emulator/runtime.mjs';
import { parseCsv, toCsv } from './lib/csv.mjs';

const args = process.argv.slice(2);
const opt = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : '';
};
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Pemakaian: npm run validate:csv -- <file.csv> [--usak-config=file.csv] [--out=file.csv] [--report=file.csv]');
  process.exit(1);
}

const table = parseCsv(fs.readFileSync(path.resolve(file), 'utf8'));
if (!table.length) {
  console.error('File CSV kosong.');
  process.exit(1);
}

const rt = createRuntime({ quiet: true });
rt.run('setupSheets_');
const usakFile = opt('usak-config');
if (usakFile) {
  const usak = parseCsv(fs.readFileSync(path.resolve(usakFile), 'utf8'));
  if (usak.length > 1) {
    rt.spreadsheet.getSheetByName('UsakConfig').getRange(2, 1, usak.length - 1, usak[0].length).setValues(usak.slice(1));
  }
}
const usakCfg = rt.run('loadUsakConfig_', { USAK_SOURCE_COLUMN: opt('source') || 'grading_trx' });
if (usakCfg.source_invalid) {
  console.error(`--source harus grading_trx atau grading_usak (diberikan: ${usakCfg.source_invalid}).`);
  process.exit(1);
}
const res = rt.context.validateMerchantTable_(table[0], table.slice(1), { usak: usakCfg, tz: 'Asia/Jakarta', pad: opt('pad') });

console.log(`File: ${file}`);
for (const line of rt.context.importSummaryLines_(res, usakCfg.configured)) console.log('  ' + line);
if (res.fatal) process.exit(2);

const errors = res.issues.filter((i) => i.tingkat === 'ERROR');
const show = res.issues.slice(0, 30);
if (show.length) {
  console.log('\nContoh masalah:');
  for (const i of show) console.log(`  baris ${i.baris} [${i.tingkat}] ${i.store_id || '-'} ${i.kolom}: ${i.masalah}`);
  if (res.issues.length > show.length) console.log(`  … ${res.issues.length - show.length} masalah lain (gunakan --report=laporan.csv)`);
}

const reportFile = opt('report');
if (reportFile) {
  fs.writeFileSync(reportFile, toCsv(['baris', 'store_id', 'kolom', 'tingkat', 'masalah'],
    res.issues.map((i) => [i.baris, i.store_id, i.kolom, i.tingkat, i.masalah])));
  console.log(`\nLaporan ditulis ke ${reportFile}`);
}
const outFile = opt('out');
if (outFile) {
  fs.writeFileSync(outFile, toCsv([...rt.context.MERCHANT_COLUMNS], res.validRows));
  console.log(`Baris valid ditulis ke ${outFile}`);
}
process.exit(errors.length ? 3 : 0);
