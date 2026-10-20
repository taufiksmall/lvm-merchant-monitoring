/**
 * Siapkan emulator dengan data contoh: menjalankan setupSheets_ dan alur impor
 * yang sama seperti di Google Sheets (Import_Merchants -> applyMerchantImport_).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRuntime, projectRoot } from './runtime.mjs';
import { parseCsv } from '../../scripts/lib/csv.mjs';

export const DEV_FALLBACK_SECRET = 'dev-only-secret-ganti-di-env-local-0000000000';

function readCsv(name) {
  return parseCsv(fs.readFileSync(path.join(projectRoot, 'sample-data', name), 'utf8'));
}

/**
 * @param {{ secret?: string, quiet?: boolean, withUsakConfig?: boolean }} options
 */
export function createSeededRuntime(options = {}) {
  const rt = createRuntime({
    quiet: options.quiet,
    properties: {
      API_SHARED_SECRET: options.secret || DEV_FALLBACK_SECRET,
      ADMIN_EMAILS: 'admin@emulator.test',
    },
  });
  rt.run('setupSheets_');

  const users = readCsv('users.sample.csv');
  rt.spreadsheet.getSheetByName('Users').getRange(2, 1, users.length - 1, users[0].length).setValues(users.slice(1));

  if (options.withUsakConfig !== false) {
    const usak = readCsv('usak_config.sample.csv');
    rt.spreadsheet.getSheetByName('UsakConfig').getRange(2, 1, usak.length - 1, usak[0].length).setValues(usak.slice(1));
  }

  // Meniru "File > Impor > tanpa konversi": semua nilai masuk sebagai teks ke Import_Merchants.
  const merchants = readCsv('merchants.sample.csv');
  rt.spreadsheet.insertSheet('Import_Merchants')._loadRaw(merchants);
  rt.run('bumpVersion_', 'CONFIG_VERSION');
  const lines = rt.run('applyMerchantImport_');
  rt.clearCache();
  return { rt, importLines: lines };
}
