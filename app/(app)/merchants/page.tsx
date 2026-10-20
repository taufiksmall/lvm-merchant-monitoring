import type { Metadata } from "next";
import { Suspense } from "react";
import { MerchantListView } from "@/components/merchant-list-view";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "Daftar merchant" };

export default function MerchantsPage() {
  return (
    <Suspense fallback={<Spinner label="Memuat daftar merchant…" />}>
      <MerchantListView />
    </Suspense>
  );
}
