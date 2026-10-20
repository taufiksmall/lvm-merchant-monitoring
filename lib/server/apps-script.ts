/**
 * Klien server-side ke Google Apps Script Web App.
 * HANYA diimpor dari route handler / server component: APPS_SCRIPT_URL dan
 * APPS_SCRIPT_API_KEY tidak pernah dikirim ke browser.
 */

export type ApiErrorBody = { code: string; message: string; details?: { fields?: Record<string, string> } & Record<string, unknown> };
export type AppsScriptResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

const TIMEOUT_MS = 30_000;

function readConfig(): { url: string; key: string } | ApiErrorBody {
  const url = process.env.APPS_SCRIPT_URL;
  const key = process.env.APPS_SCRIPT_API_KEY;
  if (!url || !key) {
    return { code: "BFF_NOT_CONFIGURED", message: "Server aplikasi belum dikonfigurasi (APPS_SCRIPT_URL / APPS_SCRIPT_API_KEY)." };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { code: "BFF_NOT_CONFIGURED", message: "APPS_SCRIPT_URL tidak valid." };
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !local) {
    return { code: "BFF_NOT_CONFIGURED", message: "APPS_SCRIPT_URL harus memakai HTTPS." };
  }
  return { url, key };
}

/**
 * Panggil satu aksi bisnis Apps Script. Token sesi diteruskan apa adanya; Apps Script
 * yang memvalidasi token, role, dan cabang. Tidak ada payload/token yang dicatat ke log.
 */
export async function callAppsScript<T>(action: string, payload: Record<string, unknown> = {}, token?: string): Promise<AppsScriptResult<T>> {
  const cfg = readConfig();
  if ("code" in cfg) return { ok: false, error: cfg };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Apps Script membalas 302 ke script.googleusercontent.com; fetch mengikutinya sebagai GET.
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, api_key: cfg.key, token, payload }),
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      console.error(`[apps-script] ${action}: respons bukan JSON (HTTP ${res.status})`);
      return { ok: false, error: { code: "UPSTREAM_INVALID", message: "Respons server data tidak valid. Periksa deployment Apps Script." } };
    }
    if (!json || typeof json !== "object" || typeof (json as { ok?: unknown }).ok !== "boolean") {
      return { ok: false, error: { code: "UPSTREAM_INVALID", message: "Respons server data tidak valid." } };
    }
    const result = json as AppsScriptResult<T>;
    if (!result.ok && (result.error.code === "UNAUTHORIZED_CLIENT" || result.error.code === "CONFIG_ERROR")) {
      console.error(`[apps-script] ${action}: ${result.error.code}`);
    }
    return result;
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    console.error(`[apps-script] ${action}: ${aborted ? "timeout" : "gagal terhubung"}`);
    return {
      ok: false,
      error: aborted
        ? { code: "UPSTREAM_TIMEOUT", message: "Server data terlalu lama merespons. Coba lagi." }
        : { code: "UPSTREAM_UNAVAILABLE", message: "Server data tidak dapat dihubungi. Coba lagi beberapa saat." },
    };
  } finally {
    clearTimeout(timer);
  }
}
