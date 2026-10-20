"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "./api";

/**
 * Cache GET di memori browser (stale-while-revalidate). Apps Script punya biaya tetap ±2 detik per
 * panggilan, jadi:
 *  - data yang baru (< FRESH_MS) langsung dipakai tanpa panggilan baru;
 *  - data lama (< MAX_AGE_MS) langsung ditampilkan sambil disegarkan di latar;
 *  - prefetchApi() memulai pengambilan lebih awal (mis. tepat setelah login).
 * Cache berlaku per tab dan HARUS dikosongkan di batas autentikasi (login/logout) lewat clearApiCache().
 */
const FRESH_MS = 30_000;
const MAX_AGE_MS = 10 * 60_000;

type Entry = { data: unknown; at: number };
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function fresh(e: Entry | undefined) {
  return !!e && Date.now() - e.at < FRESH_MS;
}

function usable(e: Entry | undefined) {
  return !!e && Date.now() - e.at < MAX_AGE_MS;
}

function fetchAndStore<T>(url: string): Promise<T> {
  const running = inflight.get(url);
  if (running) return running as Promise<T>;
  const p = apiFetch<T>(url)
    .then((data) => {
      store.set(url, { data, at: Date.now() });
      return data;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** Mulai ambil data lebih awal; hasilnya masuk cache. Kegagalan diabaikan (akan diulang saat dipakai). */
export function prefetchApi(url: string) {
  if (fresh(store.get(url)) || inflight.has(url)) return;
  fetchAndStore(url).catch(() => undefined);
}

/** Hapus cache; tanpa argumen menghapus semua, dengan prefix hanya yang diawali prefix itu. */
export function invalidateApi(prefix?: string) {
  for (const key of [...store.keys()]) if (!prefix || key.startsWith(prefix)) store.delete(key);
}

export function clearApiCache() {
  store.clear();
  inflight.clear();
}

type State<T> = { key: string | null; data?: T; error?: ApiError };

/**
 * Ambil data GET dengan state loading/error. Data dari cache langsung ditampilkan; saat memuat ulang,
 * data sebelumnya tetap ditampilkan (tanpa kedip) sampai data baru datang.
 */
export function useApi<T>(url: string | null) {
  const [nonce, setNonce] = useState(0);
  const key = url ? `${url}#${nonce}` : null;
  const [state, setState] = useState<State<T>>({ key: null });

  useEffect(() => {
    if (!url || !key) return;
    const entry = store.get(url);
    // Data baru di cache dipakai langsung (lihat `data`/`loading` di bawah), tanpa panggilan baru.
    if (nonce === 0 && fresh(entry)) return;
    let cancelled = false;
    fetchAndStore<T>(url)
      .then((data) => { if (!cancelled) setState({ key, data }); })
      .catch((error: unknown) => {
        if (cancelled) return;
        const apiError = error instanceof ApiError ? error : new ApiError("UNKNOWN", "Terjadi kesalahan. Coba lagi.", 0);
        setState((prev) => ({ key, data: prev.data, error: apiError }));
      });
    return () => { cancelled = true; };
  }, [url, key, nonce]);

  const reload = useCallback(() => {
    if (url) store.delete(url);
    setNonce((n) => n + 1);
  }, [url]);

  const entry = url ? store.get(url) : undefined;
  const data = state.key === key ? state.data : usable(entry) ? (entry!.data as T) : state.data;
  const loading = key !== null && state.key !== key && !(nonce === 0 && fresh(entry));
  return { data, error: loading ? undefined : state.error, loading, reload };
}
