import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, SESSION_TOKEN_PATTERN } from "@/lib/session-cookie";
import type { SessionUser } from "@/lib/types";
import { callAppsScript, type ApiErrorBody } from "./apps-script";

export type CurrentUser = { user: SessionUser } | { user: null; error: ApiErrorBody | null };

/** Validasi sesi di server (sekali per request) untuk layout halaman terproteksi. */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !SESSION_TOKEN_PATTERN.test(token)) return { user: null, error: null };
  const result = await callAppsScript<SessionUser>("auth.me", {}, token);
  return result.ok ? { user: result.data } : { user: null, error: result.error };
});
