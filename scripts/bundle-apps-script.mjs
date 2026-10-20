#!/usr/bin/env node
/**
 * Menggabungkan apps-script/src/*.js menjadi SATU file (Code.gs) untuk ditempel manual di editor
 * Apps Script, plus salinan AdminDialog.html dan appsscript.json.
 *
 *   npm run gas:bundle        -> apps-script/dist/{Code.gs, AdminDialog.html, appsscript.json}
 *
 * Alternatif tanpa tempel manual: `npm run gas:push` (clasp). Hasil di dist/ tidak di-commit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'apps-script', 'src');
const outDir = path.join(root, 'apps-script', 'dist');

/** Urutan penggabungan: konfigurasi dan utilitas dulu, titik masuk (Main) terakhir. */
export const BUNDLE_ORDER = [
  'Config', 'Util', 'Crypto', 'Sheets', 'ConfigStore', 'Auth', 'Merchants', 'FollowUps',
  'Dashboard', 'Region', 'Import', 'Admin', 'Main',
];

export function buildBundle() {
  const onDisk = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js') && !f.startsWith('._')).map((f) => f.slice(0, -3));
  const missing = BUNDLE_ORDER.filter((n) => !onDisk.includes(n));
  const extra = onDisk.filter((n) => !BUNDLE_ORDER.includes(n));
  if (missing.length || extra.length) {
    throw new Error(`Daftar file tidak cocok. Hilang: [${missing}] Tambahan: [${extra}] — perbarui BUNDLE_ORDER.`);
  }
  const parts = [
    '/**',
    ' * Monitoring Merchant LVM — backend Google Apps Script (gabungan).',
    ' * Dibuat otomatis oleh scripts/bundle-apps-script.mjs dari apps-script/src/*.js.',
    ' * JANGAN edit file ini; ubah file sumbernya lalu buat ulang.',
    ' */',
    '',
  ];
  for (const name of BUNDLE_ORDER) {
    const body = fs.readFileSync(path.join(srcDir, `${name}.js`), 'utf8').replace(/\s+$/, '');
    parts.push(`// ${'='.repeat(70)}`, `// ${name}.js`, `// ${'='.repeat(70)}`, '', body, '');
  }
  return parts.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(outDir, { recursive: true });
  const code = buildBundle();
  fs.writeFileSync(path.join(outDir, 'Code.gs'), code);
  fs.copyFileSync(path.join(srcDir, 'AdminDialog.html'), path.join(outDir, 'AdminDialog.html'));
  fs.copyFileSync(path.join(srcDir, 'appsscript.json'), path.join(outDir, 'appsscript.json'));
  console.log(`Code.gs: ${code.length} karakter, ${code.split('\n').length} baris`);
  console.log(`Hasil di ${path.relative(root, outDir)}/: Code.gs, AdminDialog.html, appsscript.json`);
}
