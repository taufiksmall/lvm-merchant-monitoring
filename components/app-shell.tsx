"use client";

import { LayoutDashboard, LogOut, Store } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/client/api";
import type { SessionUser } from "@/lib/types";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/" },
  { href: "/merchants", label: "Merchant", icon: Store, match: (p: string) => p.startsWith("/merchants") },
];

const ROLE_LABELS: Record<string, string> = { petugas: "Petugas", supervisor: "Supervisor", viewer: "Viewer", area: "Area", region: "Region" };

const NAV_PEMANTAUAN = [
  { href: "/", label: "Pemantauan", icon: LayoutDashboard, match: (p: string) => p === "/" || p.startsWith("/pemantauan") || p.startsWith("/merchants") },
];

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "Monitoring Merchant LVM";

  async function logout() {
    setLeaving(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST", json: {} });
    } finally {
      router.replace("/login?reason=logout");
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold text-ink">
            <span aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-btn">
              <svg viewBox="0 0 32 32" className="size-5"><rect x="7" y="17" width="4" height="8" rx="1.5" fill="#fff" /><rect x="14" y="12" width="4" height="13" rx="1.5" fill="#fff" /><rect x="21" y="7" width="4" height="18" rx="1.5" fill="#fff" /></svg>
            </span>
            <span className="hidden text-sm lg:inline">{appName}</span>
          </Link>
          <nav aria-label="Navigasi utama" className="flex items-center gap-1">
            {(user.akses === "cabang" ? NAV : NAV_PEMANTAUAN).map(({ href, label, icon: Icon, match }) => {
              const active = match(pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium sm:px-3",
                    active ? "bg-accent-wash text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-medium text-ink">{user.nama_cabang || "Cabang"} · {user.kode_cabang}</p>
              <p className="truncate text-xs text-ink-2">{user.user_id} · {ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              disabled={leaving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-sm text-ink hover:bg-surface-2 disabled:opacity-60"
            >
              <LogOut aria-hidden className="size-4" />
              <span className="hidden sm:inline">{leaving ? "Keluar…" : "Keluar"}</span>
              <span className="sr-only sm:hidden">Keluar</span>
            </button>
          </div>
        </div>
        <div className="border-t border-line px-4 py-1.5 text-xs text-ink-2 sm:hidden">
          {user.nama_cabang || "Cabang"} · {user.kode_cabang} · {ROLE_LABELS[user.role] ?? user.role}
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
