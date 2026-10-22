import type { NextRequest } from "next/server";
import { callAppsScript } from "@/lib/server/apps-script";
import { clientIp } from "@/lib/server/client-ip";
import { rateLimited } from "@/lib/server/rate-limit";
import { jsonError, jsonOk, pickStrings, readJsonBody, rejectCrossSite, setSessionCookie, setUserCookie } from "@/lib/server/http";
import type { SessionUser } from "@/lib/types";

// Apps Script bisa memakan puluhan detik pada pemuatan pertama cabang.
export const maxDuration = 60;

type LoginResult = { token: string; expires_at: string; user: SessionUser };

export async function POST(req: NextRequest) {
  const rejected = rejectCrossSite(req);
  if (rejected) return rejected;
  const ip = clientIp(req);
  // Lapisan tambahan per instance: 30 permintaan login per 10 menit per alamat klien.
  if (ip && rateLimited(`login:${ip}`, 30, 10 * 60_000)) {
    return jsonError({ code: "RATE_LIMITED", message: "Terlalu banyak percobaan login. Coba lagi beberapa menit lagi." });
  }
  const body = await readJsonBody(req);
  if (!body) return jsonError({ code: "BAD_REQUEST", message: "Permintaan tidak valid." });
  const { kode_cabang = "", password = "" } = pickStrings(body, ["kode_cabang", "password"]);

  const result = await callAppsScript<LoginResult>("auth.login", { kode_cabang, password, client_ip: ip });
  if (!result.ok) return jsonError(result.error);

  // Token hanya disimpan di cookie httpOnly; tidak pernah dikirim ke JavaScript browser.
  const res = jsonOk({ user: result.data.user });
  setSessionCookie(res, result.data.token, result.data.expires_at);
  setUserCookie(res, result.data.user, result.data.expires_at);
  return res;
}
