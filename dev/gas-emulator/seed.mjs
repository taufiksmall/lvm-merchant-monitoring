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

/** Akun demo area & region untuk emulator: AREA-CONTOH-BANDUNG-RAYA / DemoArea1234 dan REG-JABAR / DemoRegion1234. */
function seedScopeDemo(rt) {
  rt.run('prepareWilayahSheet_');
  const w = rt.spreadsheet.getSheetByName('Wilayah');
  const header = w.getRange(1, 1, 1, w.getLastColumn()).getValues()[0];
  for (let r = 2; r <= w.getLastRow(); r++) {
    w._setRaw(r, header.indexOf('nama_region') + 1, 'Region Jawa Barat');
    w._setRaw(r, header.indexOf('kode_region') + 1, 'REG-JABAR');
  }
  rt.run('createRegionAreaAccounts_');
  const users = rt.spreadsheet.getSheetByName('Users');
  const uh = users.getRange(1, 1, 1, users.getLastColumn()).getValues()[0];
  const demo = { 'AREA-CONTOH-BANDUNG-RAYA': 'DemoArea1234', 'REG-JABAR': 'DemoRegion1234' };
  for (let r = 2; r <= users.getLastRow(); r++) {
    const id = users.getRange(r, uh.indexOf('user_id') + 1).getValue();
    if (demo[id]) {
      users._setRaw(r, uh.indexOf('password_hash') + 1, rt.context.hashPassword_(demo[id], 100000));
      users._setRaw(r, uh.indexOf('is_active') + 1, true);
    }
  }
}

/**
 * @param {{ secret?: string, quiet?: boolean, withUsakConfig?: boolean, scopeDemo?: boolean }} options
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
  // setupSheets_ mengisi UsakConfig bawaan; kosongkan agar skenario uji/emulator eksplisit.
  const usakSheet = rt.spreadsheet.getSheetByName('UsakConfig');
  if (usakSheet.getLastRow() > 1) usakSheet.getRange(2, 1, usakSheet.getLastRow() - 1, usakSheet.getLastColumn()).clearContent();

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
  if (options.scopeDemo) seedScopeDemo(rt);
  rt.clearCache();
  return { rt, importLines: lines };
}
