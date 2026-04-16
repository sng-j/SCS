"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root error:", error);
  }, [error]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "24px", padding: "24px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "64px", height: "64px", borderRadius: "9999px", backgroundColor: "rgba(218,30,40,0.1)" }}>
        <AlertCircle style={{ width: "32px", height: "32px", color: "#DA1E28" }} />
      </div>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "8px" }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: "0.875rem", color: "#6b7280", maxWidth: "400px" }}>
          An unexpected error occurred. Please try again or return to the home page.
        </p>
      </div>
      <div style={{ display: "flex", gap: "12px" }}>
        <button
          onClick={reset}
          style={{ padding: "8px 16px", borderRadius: "4px", border: "1px solid #d0d9e8", background: "white", cursor: "pointer", fontSize: "0.875rem" }}
        >
          Try again
        </button>
        <Link
          href="/"
          style={{ padding: "8px 16px", borderRadius: "4px", background: "#0F62FE", color: "white", textDecoration: "none", fontSize: "0.875rem" }}
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
