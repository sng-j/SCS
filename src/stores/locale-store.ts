import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/lib/i18n";

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/** Keep the <html lang> attribute in sync so screen readers and
 *  language-dependent CSS (hyphenation, etc.) respect the user's choice. */
function syncHtmlLang(locale: Locale) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "en",
      setLocale: (locale) => {
        syncHtmlLang(locale);
        set({ locale });
      },
    }),
    {
      name: "scs-locale",
      onRehydrateStorage: () => (state) => {
        if (state?.locale) syncHtmlLang(state.locale);
      },
    }
  )
);
