import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, SESSION_TOKEN_PATTERN } from "@/lib/session-cookie";
import type { SessionUser } from "@/lib/types";
import { callAppsScript, type ApiErrorBody } from "./apps-script";
import { USER_COOKIE_NAME, readUserCookie } from "./user-cookie";

export type CurrentUser = { user: SessionUser } | { user: null; error: ApiErrorBody | null };

/**
 * Profil pengguna untuk merender layout. Memakai cookie profil bertanda tangan (tanpa memanggil
 * Apps Script, hemat ±2 detik per muat halaman). Bila cookie tidak ada/tidak valid (mis. sesi dari
 * sebelum cookie ini ada), jatuh ke auth.me. Hak akses TIDAK ditentukan di sini: setiap panggilan
 * data divalidasi ulang oleh Apps Script, dan 401 mengarahkan pengguna ke login. */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !SESSION_TOKEN_PATTERN.test(token)) return { user: null, error: null };
  const cached = readUserCookie(store.get(USER_COOKIE_NAME)?.value);
  if (cached) return { user: cached };
  const result = await callAppsScript<SessionUser>("auth.me", {}, token);
  return result.ok ? { user: result.data } : { user: null, error: result.error };
});
