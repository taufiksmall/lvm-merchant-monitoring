/**
 * Helper route handler: pemetaan error -> status HTTP, cookie sesi, dan proteksi CSRF.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_TOKEN_PATTERN } from "@/lib/session-cookie";
import type { SessionUser } from "@/lib/types";
import { USER_COOKIE_NAME, signUserCookie } from "./user-cookie";
import { callAppsScript, type ApiErrorBody, type AppsScriptResult } from "./apps-script";

const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_INACTIVE: 403,
  ROLE_INVALID: 403,
  FORBIDDEN: 403,
  CSRF_REJECTED: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  UNKNOWN_ACTION: 400,
  RATE_LIMITED: 429,
  BUSY: 503,
  HEADER_MISMATCH: 503,
  SHEET_MISSING: 503,
  SHEET_ERROR: 503,
  CONFIG_ERROR: 503,
  UPSTREAM_UNAVAILABLE: 502,
  UPSTREAM_INVALID: 502,
  UPSTREAM_TIMEOUT: 504,
  UNAUTHORIZED_CLIENT: 500,
  BFF_NOT_CONFIGURED: 500,
  INTERNAL: 500,
};

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/** Pesan untuk kode yang menandakan salah konfigurasi server (detail hanya di log server). */
const MISCONFIG_MESSAGE = "Konfigurasi server belum lengkap. Hubungi administrator.";

export function jsonOk<T>(data: T, init?: { status?: number }) {
  return NextResponse.json({ ok: true, data }, { status: init?.status ?? 200, headers: NO_STORE });
}

export function jsonError(error: ApiErrorBody, status?: number) {
  const code = error.code;
  const message = code === "UNAUTHORIZED_CLIENT" || code === "BFF_NOT_CONFIGURED" ? MISCONFIG_MESSAGE : error.message;
  const res = NextResponse.json(
    { ok: false, error: { code, message, ...(error.details ? { details: error.details } : {}) } },
    { status: status ?? STATUS_BY_CODE[code] ?? 500, headers: NO_STORE },
  );
  if (res.status === 401) clearSessionCookie(res);
  return res;
}

export function toResponse<T>(result: AppsScriptResult<T>) {
  return result.ok ? jsonOk(result.data) : jsonError(result.error);
}

export function setSessionCookie(res: NextResponse, token: string, expiresAt: string) {
  const expires = new Date(expiresAt);
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: Number.isNaN(expires.getTime()) ? undefined : expires,
  });
}

/** Cookie profil tampilan (ditandatangani); lihat user-cookie.ts. */
export function setUserCookie(res: NextResponse, user: SessionUser, expiresAt: string) {
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) return;
  res.cookies.set({
    name: USER_COOKIE_NAME,
    value: signUserCookie(user, expires.getTime()),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export function clearSessionCookie(res: NextResponse) {
  for (const name of [SESSION_COOKIE_NAME, USER_COOKIE_NAME]) {
    res.cookies.set({
      name,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}

export function sessionToken(req: NextRequest): string | null {
  const value = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  return value && SESSION_TOKEN_PATTERN.test(value) ? value : null;
}

/**
 * Proteksi CSRF untuk request yang mengubah data: wajib same-origin (header Origin
 * atau Sec-Fetch-Site) dan body JSON. Ditambah cookie SameSite=Lax.
 */
export function rejectCrossSite(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let sameOrigin = false;
  if (origin) {
    try {
      sameOrigin = new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
  } else {
    sameOrigin = req.headers.get("sec-fetch-site") === "same-origin";
  }
  const isJson = (req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
  if (!sameOrigin || !isJson) {
    return jsonError({ code: "CSRF_REJECTED", message: "Permintaan ditolak karena tidak berasal dari aplikasi ini." });
  }
  return null;
}

export async function readJsonBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > 20_000) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const UNAUTH: ApiErrorBody = { code: "UNAUTHENTICATED", message: "Sesi tidak valid. Silakan login kembali." };

/** Teruskan satu aksi terautentikasi ke Apps Script. */
export async function forwardAction(
  req: NextRequest,
  action: string,
  payload: Record<string, unknown> = {},
  opts: { mutating?: boolean } = {},
) {
  if (opts.mutating) {
    const rejected = rejectCrossSite(req);
    if (rejected) return rejected;
  }
  const token = sessionToken(req);
  if (!token) return jsonError(UNAUTH);
  return toResponse(await callAppsScript(action, payload, token));
}

/** Ambil field string dari body tanpa mempercayai tipe dari klien. */
export function pickStrings(body: Record<string, unknown>, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      const v = body[k];
      out[k] = typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
    }
  }
  return out;
}
