import type { NextRequest } from "next/server";
import { forwardAction } from "@/lib/server/http";

// Apps Script bisa memakan puluhan detik pada pemuatan pertama cabang.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return forwardAction(req, "merchants.filterOptions", { kode_cabang: req.nextUrl.searchParams.get("kode_cabang") ?? "" });
}
