import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/logo";
import { safeNextPath } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Masuk" };

const REASONS: Record<string, string> = {
  expired: "Sesi Anda telah berakhir. Silakan masuk kembali.",
  inactive: "Akun Anda tidak aktif. Hubungi administrator.",
  logout: "Anda telah keluar.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const reason = typeof sp.reason === "string" ? REASONS[sp.reason] : undefined;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "Monitoring Merchant LVM";
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo className="mx-auto mb-4 h-12" />
          <h1 className="text-lg font-semibold text-ink">{appName}</h1>
          <p className="mt-1 text-sm text-ink-2">Masuk dengan kode cabang dan kata sandi dari administrator.</p>
        </div>
        <LoginForm next={next} notice={reason} noticeTone={sp.reason === "logout" ? "success" : sp.reason === "inactive" ? "error" : "info"} />
      </div>
    </main>
  );
}
