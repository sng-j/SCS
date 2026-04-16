import crypto from "crypto";

/**
 * Deterministically derive a per-equipment audit PIN from a server master secret.
 *
 * The PIN is used as the user-level password that keys PBKDF2 → AES-256-CBC for
 * audit file encryption. By deriving it at request time instead of persisting it
 * in `equipment.certificationInfo`, a database compromise alone is insufficient
 * to decrypt audit payloads — an attacker must also exfiltrate AUTH_SECRET from
 * the server environment.
 *
 * Properties:
 * - Deterministic: the same equipmentId always yields the same PIN, so the
 *   download route (which embeds the PIN in the audit script) and the upload
 *   route (which decrypts the result) stay in agreement without any storage.
 * - Opaque: the PIN is a 16-char uppercase hex string, with ~64 bits of entropy,
 *   which is used only as PBKDF2 input (100k iterations). The PIN itself never
 *   leaves the server except embedded inside the generated audit tool ZIP.
 */
export function deriveAuditPin(equipmentId: string): string {
  const masterSecret = process.env.AUTH_SECRET;
  if (!masterSecret) {
    // Fail loudly in production; fall back only for dev/test when the secret is missing.
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is required to derive audit PINs in production");
    }
    // Dev fallback — still deterministic but not secure.
    return crypto
      .createHmac("sha256", "dev-only-insecure-fallback")
      .update(`audit-pin:${equipmentId}`)
      .digest("hex")
      .substring(0, 16)
      .toUpperCase();
  }

  return crypto
    .createHmac("sha256", masterSecret)
    .update(`audit-pin:${equipmentId}`)
    .digest("hex")
    .substring(0, 16)
    .toUpperCase();
}
