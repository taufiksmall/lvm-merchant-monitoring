"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/client/api";
import { clearApiCache } from "@/lib/client/use-api";
import type { SessionUser } from "@/lib/types";
import { Logo } from "./logo";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", match: (p: string) => p === "/" },
  { href: "/merchants", label: "Merchant", match: (p: string) => p.startsWith("/merchants") },
];

const ROLE_LABELS: Record<string, string> = { petugas: "Petugas", supervisor: "Supervisor", viewer: "Viewer", area: "Area", region: "Region" };

const NAV_PEMANTAUAN = [
  { href: "/", label: "Pemantauan", match: (p: string) => p === "/" || p.startsWith("/pemantauan") || p.startsWith("/merchants") },
];

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "Monitoring Merchant LVM";
  const role = ROLE_LABELS[user.role] ?? user.role;

  async function logout() {
    setLeaving(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST", json: {} });
    } finally {
      clearApiCache();
      router.replace("/login?reason=logout");
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-13 max-w-7xl items-stretch gap-4 px-4 sm:gap-6 sm:px-6">
          <Link href="/" aria-label={`${appName} — ke beranda`} className="flex shrink-0 items-center">
            <Logo className="h-5" />
          </Link>
          <nav aria-label="Navigasi utama" className="flex items-stretch">
            {(user.akses === "cabang" ? NAV : NAV_PEMANTAUAN).map(({ href, label, match }) => {
              const active = match(pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "relative inline-flex items-center px-2.5 text-sm font-medium sm:px-3",
                    active
                      ? "text-ink after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-btn sm:after:inset-x-3"
                      : "text-ink-2 hover:text-ink",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right leading-tight sm:block">
              <p className="truncate text-[13px] font-medium text-ink">{user.nama_cabang || "Cabang"}</p>
              <p className="truncate text-xs text-muted">{user.kode_cabang} · {role}</p>
            </div>
            <span aria-hidden className="hidden h-6 w-px bg-line sm:block" />
            <button
              type="button"
              onClick={logout}
              disabled={leaving}
              title="Keluar"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-60"
            >
              <LogOut aria-hidden className="size-4" />
              <span className="hidden sm:inline">{leaving ? "Keluar…" : "Keluar"}</span>
              <span className="sr-only sm:hidden">Keluar</span>
            </button>
          </div>
        </div>
        <div className="border-t border-line px-4 py-1.5 text-xs text-ink-2 sm:hidden">
          {user.nama_cabang || "Cabang"} · {user.kode_cabang} · {role}
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}
