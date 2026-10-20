"use client";

import { ErrorState } from "@/components/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState message="Terjadi kesalahan saat menampilkan halaman ini." onRetry={reset} />;
}
