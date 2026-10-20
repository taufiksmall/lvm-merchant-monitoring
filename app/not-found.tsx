import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold text-ink">Halaman tidak ditemukan</h1>
      <p className="text-sm text-ink-2">Alamat yang Anda buka tidak tersedia.</p>
      <Link href="/" className="inline-flex h-9 items-center rounded-md bg-btn px-3.5 text-sm font-medium text-white hover:bg-btn-hover">Ke dashboard</Link>
    </main>
  );
}
