import type { Metadata } from "next";
import { MerchantDetailView } from "@/components/merchant-detail-view";
import { safeDecode } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Detail merchant" };

export default async function MerchantDetailPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { storeId } = await params;
  const sp = await searchParams;
  // Akun area/region membuka merchant lewat cabang di cakupannya (divalidasi di server).
  const branch = typeof sp.cabang === "string" ? sp.cabang.slice(0, 40) : undefined;
  return <MerchantDetailView storeId={safeDecode(storeId)} branch={branch} />;
}
