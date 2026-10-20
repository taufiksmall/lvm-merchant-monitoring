import crypto from "node:crypto";
import type { SessionUser } from "@/lib/types";

/**
 * Cookie profil untuk TAMPILAN (nama cabang, role, jenis tampilan) agar layout halaman tidak perlu
 * memanggil Apps Script pada setiap muat halaman. Ditandatangani HMAC dengan APPS_SCRIPT_API_KEY
 * supaya tidak bisa dipalsukan, dan kedaluwarsa bersama sesi.
 *
 * BUKAN bukti hak akses: setiap panggilan data tetap divalidasi Apps Script lewat token sesi di
 * cookie httpOnly terpisah. Cookie ini hanya menentukan tampilan yang dirender.
 */
export const USER_COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-lvm_user" : "lvm_user";

function sign(payload: string): string {
  const key = process.env.APPS_SCRIPT_API_KEY ?? "";
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

export function signUserCookie(user: SessionUser, expiresAtMs: number): string {
  const payload = Buffer.from(JSON.stringify({ u: user, e: expiresAtMs })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readUserCookie(value: string | undefined | null): SessionUser | null {
  if (!value || !process.env.APPS_SCRIPT_API_KEY) return null;
  const dot = value.indexOf(".");
  if (dot < 1) return null;
  const payload = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: SessionUser; e?: number };
    if (!parsed.u || typeof parsed.e !== "number" || parsed.e <= Date.now()) return null;
    return parsed.u;
  } catch {
    return null;
  }
}
