import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logSecurityEvent } from "@/lib/security-log";
import { headers } from "next/headers";

const DEFAULT_MAX_FAILED_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_WINDOW_MINUTES = 15;

/**
 * Read lockout configuration from the Setting table.
 *
 * The admin UI at /admin/settings lets operators adjust `login_lockout_attempts`
 * and `login_lockout_duration`. These values are cached briefly to avoid adding
 * a DB round-trip to every login attempt while still picking up admin changes
 * within a few seconds. Falls back to safe defaults on any error.
 */
interface LockoutConfig {
  maxAttempts: number;
  windowMinutes: number;
}
let cachedLockoutConfig: { config: LockoutConfig; expiresAt: number } | null = null;
const LOCKOUT_CONFIG_TTL_MS = 30 * 1000; // 30 seconds

export function invalidateLockoutConfigCache(): void {
  cachedLockoutConfig = null;
}

async function getLockoutConfig(): Promise<LockoutConfig> {
  const now = Date.now();
  if (cachedLockoutConfig && cachedLockoutConfig.expiresAt > now) {
    return cachedLockoutConfig.config;
  }
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ["login_lockout_attempts", "login_lockout_duration"] } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const maxAttempts =
      parseInt(map.get("login_lockout_attempts") ?? "") || DEFAULT_MAX_FAILED_ATTEMPTS;
    const windowMinutes =
      parseInt(map.get("login_lockout_duration") ?? "") || DEFAULT_LOCKOUT_WINDOW_MINUTES;
    const config: LockoutConfig = {
      maxAttempts: Math.max(1, Math.min(maxAttempts, 50)),
      windowMinutes: Math.max(1, Math.min(windowMinutes, 1440)),
    };
    cachedLockoutConfig = { config, expiresAt: now + LOCKOUT_CONFIG_TTL_MS };
    return config;
  } catch {
    return {
      maxAttempts: DEFAULT_MAX_FAILED_ATTEMPTS,
      windowMinutes: DEFAULT_LOCKOUT_WINDOW_MINUTES,
    };
  }
}

/** Match an IP against a CIDR or exact IP */
export function matchCidr(ip: string, cidr: string): boolean {
  if (!ip || ip === "unknown") return false;
  const trimmedCidr = cidr.trim();

  // Exact match
  if (trimmedCidr === ip) return true;

  // CIDR match
  if (trimmedCidr.includes("/")) {
    const [network, prefixStr] = trimmedCidr.split("/");
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

    const ipNum = ipToNum(ip);
    const netNum = ipToNum(network);
    if (ipNum === null || netNum === null) return false;

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (netNum & mask);
  }

  return false;
}

function ipToNum(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export async function getClientIP(): Promise<string> {
  try {
    const hdrs = await headers();
    // Use the rightmost IP from x-forwarded-for (closest to the server)
    // to prevent client-side spoofing when behind a reverse proxy.
    // If no proxy, fall back to x-real-ip or cf-connecting-ip.
    const forwardedFor = hdrs.get("x-forwarded-for");
    let ip: string;
    if (forwardedFor) {
      const ips = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean);
      // Last entry is appended by our reverse proxy (most trustworthy)
      ip = ips[ips.length - 1] || "unknown";
    } else {
      ip = hdrs.get("x-real-ip") || hdrs.get("cf-connecting-ip") || "unknown";
    }
    // Strip IPv4-mapped IPv6 prefix (::ffff:192.168.1.1 -> 192.168.1.1)
    if (ip.startsWith("::ffff:")) ip = ip.substring(7);
    return ip;
  } catch {
    return "unknown";
  }
}

async function recordLoginAttempt(
  email: string,
  success: boolean,
  userId?: string,
  ip?: string
): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      email,
      ip: ip || "unknown",
      success,
      userId: userId ?? null,
    },
  });
}

async function isLockedOut(email: string): Promise<boolean> {
  const { maxAttempts, windowMinutes } = await getLockoutConfig();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const failedCount = await prisma.loginAttempt.count({
    where: {
      email,
      success: false,
      createdAt: { gte: windowStart },
    },
  });

  return failedCount >= maxAttempts;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  cookies: {
    sessionToken: {
      options: { httpOnly: true, sameSite: "strict", secure: true, path: "/" }
    },
    csrfToken: {
      options: { httpOnly: true, sameSite: "strict", secure: true, path: "/" }
    },
    callbackUrl: {
      options: { httpOnly: true, sameSite: "strict", secure: true, path: "/" }
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;
        const clientIP = await getClientIP();

        // Check if account is locked out due to too many failed attempts
        if (await isLockedOut(email)) {
          logSecurityEvent("LOGIN_LOCKED_OUT", `Account locked: ${email}`, "WARN", undefined, clientIP).catch(() => { });
          throw new Error("LOCKED");
        }

        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          // Record attempt and return generic error to prevent user enumeration.
          // Run bcrypt on a dummy hash to maintain constant-time behavior.
          await bcrypt.compare(password, "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012");
          await recordLoginAttempt(email, false, undefined, clientIP);
          throw new Error("INVALID_CREDENTIALS");
        }

        if (!user.isActive) {
          // Record attempt and return generic error to prevent user enumeration.
          // Run bcrypt on a dummy hash to maintain constant-time behavior.
          await bcrypt.compare(password, "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012");
          await recordLoginAttempt(email, false, user.id, clientIP);
          throw new Error("INVALID_CREDENTIALS");
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
          await recordLoginAttempt(email, false, user.id, clientIP);
          // Check remaining attempts — use generic error
          const { maxAttempts, windowMinutes } = await getLockoutConfig();
          const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
          const failedCount = await prisma.loginAttempt.count({
            where: { email, success: false, createdAt: { gte: windowStart } },
          });
          const remaining = maxAttempts - failedCount;
          if (remaining <= 0) {
            throw new Error("LOCKED");
          }
          throw new Error("INVALID_CREDENTIALS");
        }

        // ── IP Whitelist Check ────────────────────────────────────
        // ADMIN: no IP restriction
        // VENDOR/SHIPYARD: check whitelist, auto-register on first login
        if (user.role !== "ADMIN") {
          const whitelist = await prisma.ipWhitelist.findMany({
            where: { userId: user.id },
            select: { cidr: true },
          });

          if (whitelist.length === 0) {
            // First login — auto-register current IP
            if (clientIP && clientIP !== "unknown") {
              await prisma.ipWhitelist.create({
                data: { userId: user.id, cidr: clientIP },
              });
              logSecurityEvent("IP_AUTO_REGISTERED", `First login IP auto-registered: ${clientIP} for ${email}`, "INFO", user.id, clientIP).catch(() => { });
            }
          } else {
            // Check if current IP matches any whitelisted IP/CIDR
            const ipAllowed = whitelist.some((entry) => matchCidr(clientIP, entry.cidr));
            if (!ipAllowed) {
              await recordLoginAttempt(email, false, user.id, clientIP);
              logSecurityEvent("IP_BLOCKED", `Login blocked from unauthorized IP: ${clientIP} for ${email}`, "WARN", user.id, clientIP).catch(() => { });
              // Keep IP_BLOCKED distinct only for the admin/security log;
              // return generic error to prevent revealing valid-password + wrong-IP state.
              throw new Error("INVALID_CREDENTIALS");
            }
          }
        }

        // Successful login
        await recordLoginAttempt(email, true, user.id, clientIP);
        logSecurityEvent("LOGIN_SUCCESS", `User logged in: ${email} from ${clientIP}`, "INFO", user.id, clientIP).catch(() => { });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          shipyardId: user.shipyardId,
          company: user.company,
          needsPasswordChange: user.needsPasswordChange,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.shipyardId = user.shipyardId;
        token.company = user.company;
        token.needsPasswordChange = user.needsPasswordChange;
      }
      // Refresh user fields from DB so admin-side changes (name, role, company,
      // shipyard reassignment) propagate into the session without re-login.
      if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { name: true, role: true, shipyardId: true, company: true, isActive: true, needsPasswordChange: true },
          });
          if (dbUser) {
            // If the account has been deactivated, invalidate the session
            // immediately — don't wait for the 2-hour JWT expiry.
            if (!dbUser.isActive) {
              token.id = "" as string;
              return token;
            }
            token.name = dbUser.name;
            token.role = dbUser.role;
            token.shipyardId = dbUser.shipyardId;
            token.company = dbUser.company;
            token.needsPasswordChange = dbUser.needsPasswordChange;
          }
        } catch {
          // DB query failed — keep existing token values
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.shipyardId = token.shipyardId;
        session.user.company = token.company;
        session.user.needsPasswordChange = token.needsPasswordChange;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 2 * 60 * 60, // 2 hours
  },
});
