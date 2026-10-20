import type { NextRequest } from "next/server";
import { forwardAction, jsonError, readJsonBody, rejectCrossSite } from "@/lib/server/http";
import { safeDecode } from "@/lib/safe-next";

// Apps Script bisa memakan puluhan detik pada pemuatan pertama cabang.
export const maxDuration = 60;

/** Buka nilai asli data sensitif (role berhak saja; tercatat di AuditLog oleh Apps Script). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const rejected = rejectCrossSite(req);
  if (rejected) return rejected;
  const { storeId } = await params;
  const body = await readJsonBody(req);
  if (!body) return jsonError({ code: "BAD_REQUEST", message: "Permintaan tidak valid." });
  const group = body.group === "financial" ? "financial" : "identity";
  return forwardAction(req, "merchants.revealSensitive", { store_id: safeDecode(storeId), group });
}
