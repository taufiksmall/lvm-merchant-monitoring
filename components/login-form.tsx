"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "@/lib/client/api";
import { clearApiCache, prefetchApi } from "@/lib/client/use-api";
import type { SessionUser } from "@/lib/types";
import { Alert, Button, cx } from "./ui";

type Errors = { kode_cabang?: string; password?: string; form?: string };

const KODE_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

function validate(kode: string, password: string): Errors {
  const errors: Errors = {};
  if (!kode.trim()) errors.kode_cabang = "Kode cabang wajib diisi.";
  else if (!KODE_PATTERN.test(kode.trim())) errors.kode_cabang = "Kode cabang hanya boleh huruf, angka, titik, garis bawah, atau tanda hubung.";
  if (!password) errors.password = "Kata sandi wajib diisi.";
  else if (password.length > 200) errors.password = "Kata sandi terlalu panjang.";
  return errors;
}

export function LoginForm({ next, notice, noticeTone }: { next: string; notice?: string; noticeTone: "info" | "success" | "error" }) {
  const [kode, setKode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate(kode, password);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      const res = await apiFetch<{ user: SessionUser }>("/api/auth/login", { method: "POST", json: { kode_cabang: kode.trim(), password } });
      // Batas autentikasi: buang cache pengguna sebelumnya, lalu mulai ambil data halaman awal
      // bersamaan dengan pemuatan halaman (tanpa menunggu hidrasi).
      clearApiCache();
      if (next === "/") prefetchApi(res.user.akses === "cabang" ? "/api/dashboard" : "/api/region");
      router.replace(next);
      router.refresh();
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setErrors({
        kode_cabang: apiErr?.fields?.kode_cabang,
        password: apiErr?.fields?.password,
        form: apiErr && !apiErr.fields ? apiErr.message : apiErr?.fields ? undefined : "Terjadi kesalahan. Coba lagi.",
      });
      setPassword("");
      setSubmitting(false);
    }
  }

  const inputCls = "h-11 w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-muted";
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      {notice && !errors.form && <Alert tone={noticeTone}>{notice}</Alert>}
      {errors.form && <Alert tone="error">{errors.form}</Alert>}

      <div>
        <label htmlFor="kode_cabang" className="mb-1.5 block text-sm font-medium text-ink">Kode cabang</label>
        <input
          id="kode_cabang"
          name="kode_cabang"
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          value={kode}
          onChange={(e) => {
            setKode(e.target.value);
            if (errors.kode_cabang || errors.form) setErrors((x) => ({ ...x, kode_cabang: undefined, form: undefined }));
          }}
          aria-invalid={!!errors.kode_cabang}
          aria-describedby={errors.kode_cabang ? "kode_cabang_error" : undefined}
          className={cx(inputCls, errors.kode_cabang ? "border-critical" : "border-line-strong")}
          placeholder="Contoh: 0101"
        />
        {errors.kode_cabang && <p id="kode_cabang_error" className="mt-1.5 text-xs text-critical-ink">{errors.kode_cabang}</p>}
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">Kata sandi</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            maxLength={200}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password || errors.form) setErrors((x) => ({ ...x, password: undefined, form: undefined }));
            }}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password_error" : undefined}
            className={cx(inputCls, "pr-11", errors.password ? "border-critical" : "border-line-strong")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-2 hover:text-ink"
          >
            {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        </div>
        {errors.password && <p id="password_error" className="mt-1.5 text-xs text-critical-ink">{errors.password}</p>}
      </div>

      <Button type="submit" loading={submitting} className="w-full">
        {submitting ? "Memeriksa…" : "Masuk"}
      </Button>
      <p className="text-center text-xs text-ink-2">Lupa kata sandi? Hubungi administrator cabang.</p>
    </form>
  );
}
