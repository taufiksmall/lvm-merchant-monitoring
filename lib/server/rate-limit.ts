/**
 * Pembatas laju sederhana di memori (jendela geser) per kunci. Berlaku per instance serverless, jadi hanya
 * lapisan tambahan: batas yang mengikat dan dibagi antar instance ada di Apps Script (LOGIN_IP_MAX_ATTEMPTS),
 * dan aturan Vercel Firewall disarankan untuk /api/auth/login.
 */
const hits = new Map<string, number[]>();
const MAX_KEYS = 5000;

export function rateLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    if (hits.size > MAX_KEYS) hits.clear();
  }
  return false;
}
