import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard-view";
import { RegionView } from "@/components/region-view";
import { getCurrentUser } from "@/lib/server/current-user";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const current = await getCurrentUser();
  // Akun area/region melihat pemantauan banyak cabang; akun cabang melihat dasbor cabangnya.
  return current.user && current.user.akses !== "cabang" ? <RegionView /> : <DashboardView />;
}
