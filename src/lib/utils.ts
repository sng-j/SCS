import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, locale?: "ko" | "en"): string {
  const loc = locale === "en" ? "en-US" : "ko-KR";
  return new Date(date).toLocaleDateString(loc, {
    year: "numeric",
    month: locale === "en" ? "short" : "2-digit",
    day: "2-digit",
  });
}

export function formatDateTime(date: Date | string, locale?: string): string {
  const loc = locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
  return new Date(date).toLocaleString(loc, {
    year: "numeric",
    month: locale === "ko" || locale === "ja" ? "2-digit" : "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
