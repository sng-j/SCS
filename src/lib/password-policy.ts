/**
 * Password policy.
 *
 * Current rule: minimum 6 characters. The strict E27 SC-1 policy
 * (8+ chars with upper/lower/digit/special) was rolled back per the
 * operator's request — the deployment is small enough that operator
 * convenience outweighs the marginal security gain from forced complexity.
 */

/** Stable rule code — used to render localized messages on the client. */
export type PasswordRuleCode = "OK" | "REQUIRED" | "TOO_SHORT";

export interface PasswordValidationResult {
  valid: boolean;
  code: PasswordRuleCode;
  /** English message — safe for server logs and as a fallback. */
  message: string;
}

export function validatePassword(password: string): PasswordValidationResult {
  if (!password) {
    return { valid: false, code: "REQUIRED", message: "Password is required" };
  }
  if (password.length < 6) {
    return { valid: false, code: "TOO_SHORT", message: "Password must be at least 6 characters" };
  }
  return { valid: true, code: "OK", message: "OK" };
}

/**
 * Localize a `PasswordRuleCode` for client UI. Pass the current locale string
 * (e.g. "en", "ko", "ja"); unknown locales fall back to English. Accepts an
 * untyped `string` so it can also consume codes coming back from server error
 * responses (e.g. `d.code.slice(4)` from a `PWD_*` error). Unknown codes fall
 * back to a generic policy summary.
 */
export function passwordRuleMessage(code: PasswordRuleCode | string, locale: string): string {
  const dict: Record<PasswordRuleCode, { en: string; ko: string; ja: string }> = {
    OK: { en: "OK", ko: "OK", ja: "OK" },
    REQUIRED: {
      en: "Password is required",
      ko: "비밀번호를 입력하세요",
      ja: "パスワードを入力してください",
    },
    TOO_SHORT: {
      en: "Password must be at least 6 characters",
      ko: "비밀번호는 6자 이상이어야 합니다",
      ja: "パスワードは6文字以上必要です",
    },
  };
  const entry = dict[code as PasswordRuleCode];
  if (!entry) {
    // Unknown code — show a concise policy summary as a safe fallback.
    if (locale === "ko") return "비밀번호는 6자 이상이어야 합니다";
    if (locale === "ja") return "パスワードは6文字以上必要です";
    return "Password must be at least 6 characters";
  }
  if (locale === "ko") return entry.ko;
  if (locale === "ja") return entry.ja;
  return entry.en;
}
