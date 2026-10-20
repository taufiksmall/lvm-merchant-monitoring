import type { NextRequest } from "next/server";
import { forwardAction } from "@/lib/server/http";

export const maxDuration = 60;

/** Cari merchant di cabang-cabang dalam cakupan akun area/region (cakupan ditentukan Apps Script dari sesi). */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  return forwardAction(req, "region.searchMerchants", { q });
}
