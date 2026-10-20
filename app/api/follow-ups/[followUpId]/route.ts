import type { NextRequest } from "next/server";
import { forwardAction, jsonError, pickStrings, readJsonBody, rejectCrossSite } from "@/lib/server/http";
import { safeDecode } from "@/lib/safe-next";

const FIELDS = ["status_follow_up", "catatan", "tanggal_follow_up_berikutnya", "progres_usak"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ followUpId: string }> }) {
  const rejected = rejectCrossSite(req);
  if (rejected) return rejected;
  const { followUpId } = await params;
  const body = await readJsonBody(req);
  if (!body) return jsonError({ code: "BAD_REQUEST", message: "Permintaan tidak valid." });
  return forwardAction(req, "followups.update", { ...pickStrings(body, FIELDS), follow_up_id: safeDecode(followUpId) });
}
