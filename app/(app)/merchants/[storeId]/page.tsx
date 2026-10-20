import type { Metadata } from "next";
import { MerchantDetailView } from "@/components/merchant-detail-view";
import { safeDecode } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Detail merchant" };

export default async function MerchantDetailPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  return <MerchantDetailView storeId={safeDecode(storeId)} />;
}
