"use client";

import { useState, useCallback } from "react";

const cache = new Map<string, string>();

export function useTranslate(targetLang: string) {
  const [translating, setTranslating] = useState(false);

  const translate = useCallback(async (texts: string[]): Promise<string[]> => {
    if (targetLang === "ko") return texts; // No translation needed for Korean

    // Check cache first
    const uncached: { idx: number; text: string }[] = [];
    const results = texts.map((t, i) => {
      const key = `${targetLang}:${t}`;
      if (cache.has(key)) return cache.get(key)!;
      uncached.push({ idx: i, text: t });
      return t; // placeholder
    });

    if (uncached.length === 0) return results;

    setTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: uncached.map((u) => u.text), targetLang }),
      });

      if (res.ok) {
        const { translated } = await res.json();
        uncached.forEach((u, i) => {
          const key = `${targetLang}:${u.text}`;
          const val = translated[i] || u.text;
          cache.set(key, val);
          results[u.idx] = val;
        });
      }
    } catch {
      // Translation failed — return originals
    } finally {
      setTranslating(false);
    }

    return results;
  }, [targetLang]);

  return { translate, translating };
}
