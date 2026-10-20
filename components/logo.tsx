import Image from "next/image";
import { cx } from "./ui";

/**
 * Logo Livin' Merchant by Mandiri. Berkas berwarna dipakai di tema terang; versi putih
 * (teks putih, titik kuning) dipakai di tema gelap agar tulisan "merchant" tetap terbaca.
 */
/** className wajib menyetel tinggi (mis. h-6); lebar mengikuti rasio gambar. */
export function Logo({ className }: { className?: string }) {
  return (
    <>
      <Image
        src="/logo/livin-merchant-horizontal.webp"
        alt="Livin' Merchant by Mandiri"
        width={2000}
        height={430}
        priority
        unoptimized
        className={cx("w-auto dark:hidden", className)}
      />
      <Image
        src="/logo/livin-merchant-horizontal-putih.webp"
        alt=""
        aria-hidden
        width={2000}
        height={430}
        priority
        unoptimized
        className={cx("hidden w-auto dark:block", className)}
      />
    </>
  );
}
