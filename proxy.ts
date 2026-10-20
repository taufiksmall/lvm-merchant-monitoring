import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_TOKEN_PATTERN } from "@/lib/session-cookie";

/**
 * Penjaga ringan: halaman terproteksi tanpa cookie sesi diarahkan ke /login.
 * Validasi sesi yang sebenarnya (token, cabang, role) dilakukan Apps Script.
 */
export function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token && SESSION_TOKEN_PATTERN.test(token)) return NextResponse.next();
  const url = new URL("/login", req.nextUrl.origin);
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api/|_next/|login|logo/|favicon.ico|icon.svg|robots.txt).*)"],
};
