import { Fraunces } from "next/font/google";
import "./viewer.css";

// Serif display face for the Admiralty Log aesthetic.
// Optical-size axis gives Fraunces a subtle mechanical character well-suited
// to a maritime logbook identity.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  style: ["normal", "italic"],
});

export default function ViewerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`admiralty ${fraunces.variable}`}>
      {children}
    </div>
  );
}
