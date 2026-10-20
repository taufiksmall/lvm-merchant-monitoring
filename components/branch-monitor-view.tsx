"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { useApi } from "@/lib/client/use-api";
import type { RegionSummary } from "@/lib/types";
import { MerchantListView } from "./merchant-list-view";
import { Badge, KpiStrip, Spinner } from "./ui";

/** Satu cabang di cakupan akun area/region: ringkasan singkat + daftar merchant (hanya lihat). */
export function BranchMonitorView({ kode }: { kode: string }) {
  const { data } = useApi<RegionSummary>("/api/region");
  const b = data?.cabang.find((x) => x.kode_cabang === kode);
  const target = data?.usak.target_ratio_persen ?? 50;
  return (
    <div className="space-y-4">
      <Link href="/" className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Pemantauan
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{b?.nama_cabang ?? `Cabang ${kode}`}</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">{kode}{b?.nama_area ? ` · ${b.nama_area}` : ""}</p>
        </div>
        {b && (b.tercapai ? <Badge tone="good">Tercapai</Badge> : <Badge tone="warn">Belum {target}%</Badge>)}
      </div>
      {b && (
        <KpiStrip
          items={[
            { label: "Total merchant", value: fmtNumber(b.total_merchant) },
            { label: "Merchant USAK", value: fmtNumber(b.merchant_usak) },
            { label: "Rasio USAK", value: fmtPercent(b.rasio_usak, { ceiling: target }) },
            { label: `Gap ke ${target}%`, value: b.tercapai ? "0" : fmtNumber(b.gap_usak_50) },
          ]}
        />
      )}
      <Suspense fallback={<Spinner label="Memuat daftar merchant…" />}>
        <MerchantListView branch={kode} />
      </Suspense>
    </div>
  );
}
