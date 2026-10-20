import type { NextRequest } from "next/server";
import { forwardAction } from "@/lib/server/http";

// Apps Script bisa memakan puluhan detik pada pemuatan pertama.
export const maxDuration = 60;

/** Ringkasan pemantauan akun area/region. Cakupan ditentukan Apps Script dari sesi. */
export async function GET(req: NextRequest) {
  return forwardAction(req, "region.summary");
}
