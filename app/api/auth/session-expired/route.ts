import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie } from "@/lib/server/http";
import { safeNextPath } from "@/lib/safe-next";

/** Hapus cookie sesi yang tidak berlaku lalu arahkan ke halaman login. */
export async function GET(req: NextRequest) {
  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("reason", req.nextUrl.searchParams.get("reason") === "inactive" ? "inactive" : "expired");
  if (next !== "/") url.searchParams.set("next", next);
  const res = NextResponse.redirect(url);
  clearSessionCookie(res);
  return res;
}
