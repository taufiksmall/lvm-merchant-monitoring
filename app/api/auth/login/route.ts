import type { NextRequest } from "next/server";
import { callAppsScript } from "@/lib/server/apps-script";
import { jsonError, jsonOk, pickStrings, readJsonBody, rejectCrossSite, setSessionCookie } from "@/lib/server/http";
import type { SessionUser } from "@/lib/types";

type LoginResult = { token: string; expires_at: string; user: SessionUser };

export async function POST(req: NextRequest) {
  const rejected = rejectCrossSite(req);
  if (rejected) return rejected;
  const body = await readJsonBody(req);
  if (!body) return jsonError({ code: "BAD_REQUEST", message: "Permintaan tidak valid." });
  const { kode_cabang = "", password = "" } = pickStrings(body, ["kode_cabang", "password"]);

  const result = await callAppsScript<LoginResult>("auth.login", { kode_cabang, password });
  if (!result.ok) return jsonError(result.error);

  // Token hanya disimpan di cookie httpOnly; tidak pernah dikirim ke JavaScript browser.
  const res = jsonOk({ user: result.data.user });
  setSessionCookie(res, result.data.token, result.data.expires_at);
  return res;
}
