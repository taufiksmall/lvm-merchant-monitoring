import { fmtDate, relativeDays } from "@/lib/format";
import type { FollowUpSummary, PriorityInfo, UsakInfo } from "@/lib/types";
import { Badge } from "./ui";

/** Kategori USAK dari kolom sumber USAK + UsakConfig. Status selalu titik + label, bukan warna saja. */
export function UsakBadge({ usak, configured = true }: { usak: UsakInfo; configured?: boolean }) {
  if (usak.kategori === "USAK") {
    return <Badge tone="good">USAK{!configured && " (sementara)"}</Badge>;
  }
  if (usak.kategori === "BELUM_USAK") {
    return <Badge tone="neutral">Belum USAK</Badge>;
  }
  return (
    <Badge tone="warn" title={usak.label}>
      {usak.kategori === "KOSONG" ? "Kosong · cek" : "Tidak dikenali · cek"}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: PriorityInfo }) {
  if (!priority.perlu_follow_up) return null;
  const reasons = priority.reasons.map((r) => r.label).join(", ");
  return (
    <Badge tone="accent" dot={false} title={`Skor ${priority.score}: ${reasons}`}>
      Skor {priority.score}
    </Badge>
  );
}

export function FollowUpCell({ fu, today }: { fu: FollowUpSummary; today: string }) {
  if (!fu.ada) return <span className="text-xs text-muted">Belum ada</span>;
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-sm text-ink">{fu.status_label}</span>
      {fu.berikutnya ? (
        <span className={fu.jatuh_tempo ? "text-xs font-medium text-critical-ink" : "text-xs text-ink-2"}>
          {fu.jatuh_tempo && "Jatuh tempo · "}
          {fmtDate(fu.berikutnya)} · {relativeDays(fu.berikutnya, today)}
        </span>
      ) : (
        <span className="text-xs text-muted">Tanpa jadwal berikutnya</span>
      )}
    </div>
  );
}
