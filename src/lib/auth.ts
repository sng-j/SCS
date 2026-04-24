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
    // X-Forwarded-For convention: `client, proxy1, proxy2, …`. The LEFTMOST
    // entry is the original client; each hop appends its own address to the
    // right. Earlier revisions took rightmost, which — when deployed behind
    // CloudFront / ALB / nginx — returned the CDN's outbound IP. Those IPs
    // rotate inside AWS, so the auto-registered whitelist entry no longer
    // matched on the NEXT login and the user got a generic
    // INVALID_CREDENTIALS on a correct password.
    //
    // If a specific deployment needs spoofing protection (client controls
    // the header), terminate at a trusted proxy that overwrites XFF — e.g.
    // nginx `real_ip_from` + `real_ip_header`. Trusting leftmost here is
    // the standard default when XFF is already trustworthy.
    const forwardedFor = hdrs.get("x-forwarded-for");
    let ip: string;
    if (forwardedFor) {
      const ips = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean);
      ip = ips[0] || "unknown";
    } else {
      ip = hdrs.get("x-real-ip") || hdrs.get("cf-connecting-ip") || "unknown";
    }
    // Strip IPv4-mapped IPv6 prefix (::ffff:192.168.1.1 -> 192.168.1.1)
    if (ip.startsWith("::ffff:")) ip = ip.substring(7);
    // Normalise IPv6 loopback to IPv4 so dev hits ::1 and 127.0.0.1 don't
    // alternately fail the whitelist.
    if (ip === "::1") ip = "127.0.0.1";
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

// In dev (HTTP), secure cookies can't be set/read, which breaks CSRF and session.
// Enable `secure` only in production so HTTPS is required there.
const SECURE_COOKIES = process.env.NODE_ENV === "production";

// Hard session lifetime (seconds). NextAuth also uses this for the JWT `exp`
// and the cookie Max-Age, but because the `jwt` callback re-signs on every
// request, we also enforce a ceiling against `token.loginAt` so the session
// really does end at 2h-since-login.
const SESSION_MAX_AGE_SEC = 2 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  cookies: {
    sessionToken: {
      options: { httpOnly: true, sameSite: "strict", secure: SECURE_COOKIES, path: "/" }
    },
    csrfToken: {
      options: { httpOnly: true, sameSite: "strict", secure: SECURE_COOKIES, path: "/" }
    },
    callbackUrl: {
      options: { httpOnly: true, sameSite: "strict", secure: SECURE_COOKIES, path: "/" }
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
        // Pin the original login moment so sliding-window re-signing can't
        // extend a session past its hard ceiling (SESSION_MAX_AGE_SEC).
        token.loginAt = Date.now();
      } else if (token.id && !token.loginAt) {
        // Legacy session minted before loginAt tracking — grace it in so it
        // starts counting down from now rather than forcing a mass logout.
        token.loginAt = Date.now();
      }
      // Hard ceiling: reject tokens whose original login is older than the
      // configured session max-age, regardless of how many times the token
      // has been refreshed in the meantime. Without this check, the DB-
      // refresh path below re-signs the token on every request and the
      // cookie's `exp` slides forever.
      if (token.loginAt && Date.now() - (token.loginAt as number) > SESSION_MAX_AGE_SEC * 1000) {
        token.id = "" as string;
        return token;
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
      // If the jwt callback cleared `token.id` (expired ceiling, deactivated
      // account), surface an empty session so middleware treats the request
      // as unauthenticated and redirects to /login.
      if (!token.id) {
        return { ...session, user: undefined as unknown as typeof session.user, expires: new Date(0).toISOString() };
      }
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
    maxAge: SESSION_MAX_AGE_SEC,
  },
});
