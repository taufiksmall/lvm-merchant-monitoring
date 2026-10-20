"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { useApi } from "@/lib/client/use-api";
import type { RegionSummary } from "@/lib/types";
import { MerchantListView } from "./merchant-list-view";
import { Badge, Spinner } from "./ui";

/** Satu cabang di cakupan akun area/region: ringkasan singkat + daftar merchant (hanya lihat). */
export function BranchMonitorView({ kode }: { kode: string }) {
  const { data } = useApi<RegionSummary>("/api/region");
  const b = data?.cabang.find((x) => x.kode_cabang === kode);
  const target = data?.usak.target_ratio_persen ?? 50;
  return (
    <div className="space-y-4">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Pemantauan
      </Link>
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink sm:text-2xl">{b?.nama_cabang ?? `Cabang ${kode}`}</h1>
            <p className="mt-1 text-sm text-ink-2">{kode}{b?.nama_area ? ` · ${b.nama_area}` : ""}</p>
          </div>
          {b && (b.tercapai ? <Badge tone="good">Tercapai</Badge> : <Badge tone="warn">Belum {target}%</Badge>)}
        </div>
        {b && (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-ink-2">Total merchant</dt><dd className="font-semibold text-ink tabular">{fmtNumber(b.total_merchant)}</dd></div>
            <div><dt className="text-xs text-ink-2">Merchant USAK</dt><dd className="font-semibold text-ink tabular">{fmtNumber(b.merchant_usak)}</dd></div>
            <div><dt className="text-xs text-ink-2">Rasio USAK</dt><dd className="font-semibold text-ink tabular">{fmtPercent(b.rasio_usak, { ceiling: target })}</dd></div>
            <div><dt className="text-xs text-ink-2">Gap ke {target}%</dt><dd className="font-semibold text-ink tabular">{b.tercapai ? "0" : fmtNumber(b.gap_usak_50)}</dd></div>
          </dl>
        )}
      </div>
      <Suspense fallback={<Spinner label="Memuat daftar merchant…" />}>
        <MerchantListView branch={kode} />
      </Suspense>
    </div>
  );
}
