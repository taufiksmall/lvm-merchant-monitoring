import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BranchMonitorView } from "@/components/branch-monitor-view";
import { safeDecode } from "@/lib/safe-next";
import { getCurrentUser } from "@/lib/server/current-user";

export const metadata: Metadata = { title: "Pemantauan cabang" };

export default async function BranchMonitorPage({ params }: { params: Promise<{ kode: string }> }) {
  const current = await getCurrentUser();
  // Akun cabang tidak memakai halaman ini.
  if (current.user && current.user.akses === "cabang") redirect("/");
  const { kode } = await params;
  return <BranchMonitorView kode={safeDecode(kode)} />;
}
