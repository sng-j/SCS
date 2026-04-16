"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  User, Lock, Globe, Save, AlertCircle, Eye, EyeOff, CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { locale } = useLocaleStore();

  return (
    <div className="max-w-[640px] mx-auto px-6 py-8 space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-[18px] font-bold text-text">
          {tx(locale, "Settings", "설정", "設定")}
        </h1>
        <p className="text-[12px] text-text-tertiary mt-0.5">
          {tx(locale, "Manage your profile and security settings", "프로필과 보안 설정을 관리합니다", "プロフィールとセキュリティ設定を管理します")}
        </p>
      </motion.div>

      <ProfileSection locale={locale} />
      <PasswordSection locale={locale} />
    </div>
  );
}

// ─── Profile ─────────────────────────────────────────────────────────────────

function ProfileSection({ locale }: { locale: string }) {
  const { data: session, update } = useSession();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name || "");
      setCompany((session.user as { company?: string }).company || "");
      setPhone((session.user as { phone?: string }).phone || "");
    }
  }, [session]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, phone }),
      });
      if (res.ok) {
        showToast.success(tx(locale, "Profile saved", "프로필이 저장되었습니다", "プロフィールが保存されました"));
        // Force NextAuth session refresh so the JWT picks up the new values.
        // The jwt callback in auth.ts re-fetches name/role/company from the DB,
        // so triggering a session update is enough to propagate the change.
        await update();
      } else {
        showToast.error(tx(locale, "Failed to save", "저장 실패", "保存失敗"));
      }
    } finally { setSaving(false); }
  }

  const role = (session?.user as { role?: string })?.role || "VENDOR";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
      className="bg-white rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-5">
        <User size={15} className="text-brand" />
        <h2 className="text-[14px] font-bold text-text">{tx(locale, "Profile", "프로필", "プロフィール")}</h2>
      </div>

      {/* Avatar + info */}
      <div className="flex items-center gap-4 mb-5 pb-5 border-b border-border">
        <div className="h-14 w-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-[18px] font-bold shrink-0">
          {name.charAt(0) || "U"}
        </div>
        <div>
          <p className="text-[14px] font-semibold text-text">{name || "—"}</p>
          <p className="text-[12px] text-text-tertiary">{session?.user?.email || ""}</p>
          <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-brand-lighter text-brand text-[10px] font-bold">
            {role}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <Field label={tx(locale, "Name", "이름", "名前")} value={name} onChange={setName} placeholder={tx(locale, "Enter name", "이름 입력", "名前を入力")} />
        <Field label={tx(locale, "Company", "회사명", "会社名")} value={company} onChange={setCompany} placeholder={tx(locale, "Enter company", "회사명 입력", "会社名を入力")} />
        <Field label={tx(locale, "Phone", "연락처", "電話番号")} value={phone} onChange={setPhone} placeholder="010-0000-0000" />

        <div className="flex justify-end pt-1">
          <Button size="sm" loading={saving} onClick={handleSave}>
            <Save size={13} /> {tx(locale, "Save", "저장", "保存")}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Password ────────────────────────────────────────────────────────────────

function PasswordSection({ locale }: { locale: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange() {
    setError(null);
    if (next.length < 6) { setError(tx(locale, "Password must be at least 6 characters", "비밀번호는 6자 이상이어야 합니다", "パスワードは6文字以上必要です")); return; }
    if (next !== confirm) { setError(tx(locale, "Passwords do not match", "비밀번호가 일치하지 않습니다", "パスワードが一致しません")); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (res.ok) {
        showToast.success(tx(locale, "Password changed", "비밀번호가 변경되었습니다", "パスワードが変更されました"));
        setCurrent(""); setNext(""); setConfirm("");
      } else {
        const body = await res.json();
        setError(body.error || tx(locale, "Failed to change", "변경 실패", "変更失敗"));
      }
    } finally { setSaving(false); }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
      className="bg-white rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-5">
        <Lock size={15} className="text-brand" />
        <h2 className="text-[14px] font-bold text-text">{tx(locale, "Change Password", "비밀번호 변경", "パスワード変更")}</h2>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-[#DA1E28]/20 bg-[#FFF1F1] px-3 py-2.5">
            <AlertCircle size={14} className="text-[#DA1E28] mt-0.5 shrink-0" />
            <p className="text-[12px] text-[#DA1E28]">{error}</p>
          </div>
        )}

        <Field label={tx(locale, "Current Password", "현재 비밀번호", "現在のパスワード")} value={current} onChange={setCurrent}
          type={showCurrent ? "text" : "password"} placeholder="••••••••"
          suffix={<button type="button" onClick={() => setShowCurrent(!showCurrent)} className="p-1 text-text-tertiary hover:text-text transition-colors" tabIndex={-1}>{showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}</button>}
        />
        <Field label={tx(locale, "New Password", "새 비밀번호", "新しいパスワード")} value={next} onChange={setNext}
          type={showNext ? "text" : "password"} placeholder={tx(locale, "At least 6 characters", "6자 이상", "6文字以上")}
          suffix={<button type="button" onClick={() => setShowNext(!showNext)} className="p-1 text-text-tertiary hover:text-text transition-colors" tabIndex={-1}>{showNext ? <EyeOff size={14} /> : <Eye size={14} />}</button>}
        />
        <Field label={tx(locale, "Confirm Password", "비밀번호 확인", "パスワード確認")} value={confirm} onChange={setConfirm}
          type={showConfirm ? "text" : "password"} placeholder="••••••••"
          suffix={<button type="button" onClick={() => setShowConfirm(!showConfirm)} className="p-1 text-text-tertiary hover:text-text transition-colors" tabIndex={-1}>{showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}</button>}
        />

        <div className="flex justify-end pt-1">
          <Button size="sm" variant="outline" loading={saving} onClick={handleChange}>
            <Lock size={13} /> {tx(locale, "Change Password", "비밀번호 변경", "パスワード変更")}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Language ────────────────────────────────────────────────────────────────

function LanguageSection() {
  const { locale, setLocale } = useLocaleStore();

  const langs = [
    { value: "en" as const, flag: "🇺🇸", label: "English" },
    { value: "ko" as const, flag: "🇰🇷", label: "한국어" },
    { value: "ja" as const, flag: "🇯🇵", label: "日本語" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
      className="bg-white rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <Globe size={15} className="text-brand" />
        <h2 className="text-[14px] font-bold text-text">{tx(locale, "Language", "언어 설정", "言語設定")}</h2>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {langs.map((lang) => (
          <button key={lang.value} onClick={() => setLocale(lang.value)}
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-[13px] font-semibold transition-all duration-200",
              locale === lang.value
                ? "border-brand bg-brand-lighter/30 text-brand"
                : "border-border bg-white text-text-tertiary hover:border-brand/30 hover:text-text",
            )}>
            <span className="text-[18px]">{lang.flag}</span>
            {lang.label}
            {locale === lang.value && <CheckCircle size={14} className="text-brand" />}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Field ──────────────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, type = "text", suffix }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; suffix?: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-text-secondary mb-1.5 block">{label}</label>
      <div className="relative">
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="h-9 w-full rounded-lg border border-border bg-white px-3 text-[13px] text-text placeholder:text-text-tertiary/50 transition-all focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand hover:border-border-strong"
        />
        {suffix && <div className="absolute right-2 top-1/2 -translate-y-1/2">{suffix}</div>}
      </div>
    </div>
  );
}
