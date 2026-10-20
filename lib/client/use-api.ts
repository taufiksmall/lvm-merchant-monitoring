"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "./api";

type State<T> = { key: string | null; data?: T; error?: ApiError };

/**
 * Ambil data GET dengan state loading/error. Saat memuat ulang, data sebelumnya tetap
 * ditampilkan (tanpa kedip) sampai data baru datang.
 */
export function useApi<T>(url: string | null) {
  const [nonce, setNonce] = useState(0);
  const key = url ? `${url}#${nonce}` : null;
  const [state, setState] = useState<State<T>>({ key: null });

  useEffect(() => {
    if (!url || !key) return;
    const controller = new AbortController();
    apiFetch<T>(url, { signal: controller.signal })
      .then((data) => setState({ key, data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const apiError = error instanceof ApiError ? error : new ApiError("UNKNOWN", "Terjadi kesalahan. Coba lagi.", 0);
        setState((prev) => ({ key, data: prev.data, error: apiError }));
      });
    return () => controller.abort();
  }, [url, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const loading = key !== null && state.key !== key;
  return { data: state.data, error: loading ? undefined : state.error, loading, reload };
}
