#!/usr/bin/env node
/**
 * Membuat password_hash untuk kolom Users.password_hash — sepenuhnya lokal, tanpa jaringan.
 *
 *   npm run hash-password
 *
 * Kata sandi diketik tanpa ditampilkan, tidak disimpan, dan tidak dikirim ke mana pun.
 * Salin hasil (diawali pbkdf2_sha256$) ke sel password_hash pengguna di Google Sheets.
 */
import { DEFAULT_ITERATIONS, hashPassword, passwordPolicyProblem } from './lib/password-hash.mjs';

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error('Jalankan dari terminal interaktif agar kata sandi tidak terlihat.'));
      return;
    }
    process.stdout.write(prompt);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value);
      } else if (ch === '\u0003') {
        stdin.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const iterArg = process.argv.find((a) => a.startsWith('--iterations='));
const iterations = iterArg ? Number(iterArg.split('=')[1]) : DEFAULT_ITERATIONS;
if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 2000000) {
  console.error('--iterations harus bilangan bulat 10000 - 2000000.');
  process.exit(1);
}

try {
  const pw = await readHidden('Kata sandi baru: ');
  const problem = passwordPolicyProblem(pw);
  if (problem) throw new Error(problem);
  const confirm = await readHidden('Ulangi kata sandi: ');
  if (pw !== confirm) throw new Error('Konfirmasi kata sandi tidak sama.');
  console.log('\nSalin nilai berikut ke kolom password_hash:\n');
  console.log(hashPassword(pw, iterations));
  console.log('\nSetelah mengganti hash, sesi lama pengguna otomatis tidak berlaku.');
} catch (e) {
  console.error('Gagal: ' + e.message);
  process.exit(1);
}
