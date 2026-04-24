import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: string;
    shipyardId: string | null;
    company: string | null;
    needsPasswordChange: boolean;
  }

  interface Session extends DefaultSession {
    user: {
      id: string;
      role: string;
      shipyardId: string | null;
      company: string | null;
      needsPasswordChange: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: string;
    shipyardId: string | null;
    company: string | null;
    needsPasswordChange: boolean;
    // Epoch ms when the user completed the credentials flow. Used to enforce
    // a hard session-lifetime ceiling independent of the sliding-window
    // refresh that NextAuth performs on every request.
    loginAt?: number;
  }
}
