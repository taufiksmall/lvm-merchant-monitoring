/**
 * Nama cookie sesi. Di produksi memakai prefix __Host- (wajib Secure, Path=/, tanpa Domain)
 * sehingga cookie tidak dapat ditimpa subdomain lain.
 * Dipakai bersama oleh route handler dan proxy.ts.
 */
export const SESSION_COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-lvm_session" : "lvm_session";

export const SESSION_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
