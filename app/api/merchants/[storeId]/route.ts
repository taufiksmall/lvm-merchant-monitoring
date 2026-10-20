import type { NextRequest } from "next/server";
import { forwardAction } from "@/lib/server/http";
import { safeDecode } from "@/lib/safe-next";

export async function GET(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  return forwardAction(req, "merchants.detail", { store_id: safeDecode(storeId) });
}
