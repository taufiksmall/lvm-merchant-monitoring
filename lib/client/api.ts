"use client";

/** Klien fetch ke route API Next.js (same-origin; cookie sesi httpOnly ikut otomatis). */

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code?: string; message?: string; details?: { fields?: Record<string, string> } } };

function redirectToLogin(reason: "expired" | "inactive") {
  const next = window.location.pathname + window.location.search;
  // Navigasi penuh ke route API yang menghapus cookie sesi lalu mengarahkan ke /login.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/api/auth/session-expired?reason=${reason}&next=${encodeURIComponent(next)}`);
}

export async function apiFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("NETWORK", "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.", 0);
  }
  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await res.json()) as ApiEnvelope<T>;
  } catch {
    body = null;
  }
  if (res.ok && body && body.ok) return body.data;
  const err = body && !body.ok ? body.error : {};
  const code = err.code ?? "UNKNOWN";
  if (res.status === 401 && !url.startsWith("/api/auth/login")) {
    redirectToLogin(code === "ACCOUNT_INACTIVE" ? "inactive" : "expired");
  }
  throw new ApiError(code, err.message ?? "Terjadi kesalahan. Coba lagi.", res.status, err.details?.fields);
}
