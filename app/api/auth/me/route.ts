import type { NextRequest } from "next/server";
import { forwardAction } from "@/lib/server/http";

export async function GET(req: NextRequest) {
  return forwardAction(req, "auth.me");
}
