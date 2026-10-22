import type { NextRequest } from "next/server";

/**
 * Alamat klien untuk pembatas login. Di Vercel, x-real-ip / x-forwarded-for diisi platform dan nilai kiriman klien
 * ditimpa; di luar Vercel (tanpa proxy tepercaya) header ini dapat dipalsukan sehingga hanya melemahkan, bukan
 * menggantikan, pembatas. Mengembalikan string kosong bila tidak ada alamat yang valid.
 */
export function clientIp(req: NextRequest): string {
  const raw = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "";
  const ip = raw.trim().toLowerCase();
  return /^[0-9a-f:.]{3,45}$/.test(ip) ? ip : "";
}
