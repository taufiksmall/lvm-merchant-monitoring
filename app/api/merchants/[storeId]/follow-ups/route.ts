import type { NextRequest } from "next/server";
import { forwardAction, jsonError, pickStrings, readJsonBody, rejectCrossSite } from "@/lib/server/http";
import { safeDecode } from "@/lib/safe-next";

// Apps Script bisa memakan puluhan detik pada pemuatan pertama cabang.
export const maxDuration = 60;

const FIELDS = ["status_follow_up", "catatan", "tanggal_follow_up_berikutnya", "progres_usak"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  return forwardAction(req, "followups.list", { store_id: safeDecode(storeId), kode_cabang: req.nextUrl.searchParams.get("kode_cabang") ?? "" });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const rejected = rejectCrossSite(req);
  if (rejected) return rejected;
  const { storeId } = await params;
  const body = await readJsonBody(req);
  if (!body) return jsonError({ code: "BAD_REQUEST", message: "Permintaan tidak valid." });
  // Hanya field follow-up yang diteruskan; kode cabang & pembuat ditentukan Apps Script dari sesi.
  return forwardAction(req, "followups.create", { ...pickStrings(body, FIELDS), store_id: safeDecode(storeId) });
}
