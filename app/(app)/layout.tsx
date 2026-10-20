import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/server/current-user";

export const dynamic = "force-dynamic";

const SESSION_INVALID = new Set(["UNAUTHENTICATED", "SESSION_EXPIRED", "ACCOUNT_INACTIVE"]);

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current.user) {
    if (!current.error) redirect("/login");
    if (SESSION_INVALID.has(current.error.code)) {
      redirect(`/api/auth/session-expired?reason=${current.error.code === "ACCOUNT_INACTIVE" ? "inactive" : "expired"}`);
    }
    // Server data tidak dapat dihubungi / salah konfigurasi: tampilkan pesan, jangan putar-balik ke login.
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-semibold text-ink">Layanan belum dapat diakses</h1>
        <p className="text-sm text-ink-2">{current.error.message}</p>
        <div className="flex gap-2">
          <a href="" className="inline-flex h-9 items-center rounded-md bg-btn px-3.5 text-sm font-medium text-white hover:bg-btn-hover">Muat ulang</a>
          <a href="/api/auth/session-expired" className="inline-flex h-9 items-center rounded-md border border-line-strong px-3.5 text-sm text-ink hover:bg-surface-2">Ke halaman login</a>
        </div>
      </main>
    );
  }
  return <AppShell user={current.user}>{children}</AppShell>;
}
