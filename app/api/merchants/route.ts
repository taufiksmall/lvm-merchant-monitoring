import type { NextRequest } from "next/server";
import { FILTER_COLUMNS } from "@/lib/columns";
import { forwardAction } from "@/lib/server/http";

/**
 * GET /api/merchants?q=&page=&page_size=&sort=&dir=&follow_up=&status_follow_up=&kategori_usak=&<kolom filter>=
 * Pencarian, filter, pengurutan, dan pagination dikerjakan di Apps Script.
 * Cabang TIDAK diambil dari query: Apps Script memakai cabang dari sesi.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const filters: Record<string, string[]> = {};
  for (const col of FILTER_COLUMNS) {
    const values = sp.getAll(col).filter((v) => v !== "");
    if (values.length) filters[col] = values.slice(0, 20);
  }
  const payload = {
    q: sp.get("q") ?? "",
    page: sp.get("page") ?? "1",
    page_size: sp.get("page_size") ?? "",
    sort: sp.get("sort") ?? "",
    dir: sp.get("dir") ?? "",
    follow_up: sp.get("follow_up") ?? "",
    status_follow_up: sp.get("status_follow_up") ?? "",
    kategori_usak: sp.getAll("kategori_usak").filter((v) => v !== "").slice(0, 5),
    filters,
  };
  return forwardAction(req, "merchants.list", payload);
}
