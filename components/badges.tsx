import { AlertTriangle, CalendarClock, CheckCircle2, CircleDashed, Flag } from "lucide-react";
import { fmtDate, relativeDays } from "@/lib/format";
import type { FollowUpSummary, PriorityInfo, UsakInfo } from "@/lib/types";
import { Badge } from "./ui";

/** Kategori USAK dari grading_usak + UsakConfig. Status selalu ikon + label, bukan warna saja. */
export function UsakBadge({ usak, configured = true }: { usak: UsakInfo; configured?: boolean }) {
  if (usak.kategori === "USAK") {
    return <Badge tone="good" icon={<CheckCircle2 aria-hidden className="size-3.5" />}>USAK{!configured && " (sementara)"}</Badge>;
  }
  if (usak.kategori === "BELUM_USAK") {
    return <Badge tone="neutral" icon={<CircleDashed aria-hidden className="size-3.5" />}>Belum USAK</Badge>;
  }
  return (
    <Badge tone="warn" icon={<AlertTriangle aria-hidden className="size-3.5" />} title={usak.label}>
      {usak.kategori === "KOSONG" ? "Kosong · cek" : "Tidak dikenali · cek"}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: PriorityInfo }) {
  if (!priority.perlu_follow_up) return null;
  const reasons = priority.reasons.map((r) => r.label).join(", ");
  return (
    <Badge tone="accent" icon={<Flag aria-hidden className="size-3.5" />} title={`Skor ${priority.score}: ${reasons}`}>
      Prioritas {priority.score}
    </Badge>
  );
}

export function FollowUpCell({ fu, today }: { fu: FollowUpSummary; today: string }) {
  if (!fu.ada) return <span className="text-xs text-muted">Belum ada</span>;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-sm text-ink">{fu.status_label}</span>
      {fu.berikutnya ? (
        <span className={fu.jatuh_tempo ? "inline-flex items-center gap-1 text-xs font-medium text-critical-ink" : "text-xs text-ink-2"}>
          {fu.jatuh_tempo && <CalendarClock aria-hidden className="size-3.5" />}
          {fmtDate(fu.berikutnya)} · {relativeDays(fu.berikutnya, today)}
        </span>
      ) : (
        <span className="text-xs text-muted">Tanpa jadwal berikutnya</span>
      )}
    </div>
  );
}
