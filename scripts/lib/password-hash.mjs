/**
 * Hash kata sandi PBKDF2-HMAC-SHA256 dengan format yang sama seperti Apps Script
 * (apps-script/src/Crypto.js):  pbkdf2_sha256$<iterasi>$<salt_base64>$<hash_base64>
 */
import crypto from 'node:crypto';

export const DEFAULT_ITERATIONS = 100000;

export function hashPassword(password, iterations = DEFAULT_ITERATIONS) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256');
  return ['pbkdf2_sha256', iterations, salt.toString('base64'), hash.toString('base64')].join('$');
}

export function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const expected = Buffer.from(parts[3], 'base64');
  const actual = crypto.pbkdf2Sync(String(password), Buffer.from(parts[2], 'base64'), Number(parts[1]), expected.length, 'sha256');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Kebijakan minimal yang sama dengan dialog admin Apps Script. */
export function passwordPolicyProblem(password) {
  if (password.length < 10) return 'Kata sandi minimal 10 karakter.';
  if (password.length > 200) return 'Kata sandi maksimal 200 karakter.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Kata sandi harus memuat huruf dan angka.';
  return '';
}
