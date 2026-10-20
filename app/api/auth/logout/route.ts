import type { NextRequest } from "next/server";
import { callAppsScript } from "@/lib/server/apps-script";
import { clearSessionCookie, jsonOk, rejectCrossSite, sessionToken } from "@/lib/server/http";

export async function POST(req: NextRequest) {
  const rejected = rejectCrossSite(req);
  if (rejected) return rejected;
  const token = sessionToken(req);
  // Invalidasi sesi di server; cookie tetap dihapus walau Apps Script gagal dihubungi.
  if (token) await callAppsScript("auth.logout", {}, token);
  const res = jsonOk({ logged_out: true });
  clearSessionCookie(res);
  return res;
}
