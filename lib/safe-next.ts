/** Validasi parameter `next` agar tidak bisa dipakai sebagai open redirect. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.startsWith("/login") || value.startsWith("/api/")) return "/";
  return value.slice(0, 500);
}

/** Decode segmen URL dengan aman (params dinamis bisa masih ter-encode). */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
