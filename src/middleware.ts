import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

function buildCSP() {
  // React dev mode needs `unsafe-eval` (HMR, error overlays) and Next.js Turbopack/HMR
  // opens a WebSocket to the dev server. Only loosen CSP in development.
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
    : `script-src 'self' 'unsafe-inline'`;
  const connectSrc = isDev
    ? `connect-src 'self' ws: wss:`
    : `connect-src 'self' wss://scs.cytur.net`;

  return [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com`,
    connectSrc,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join("; ");
}

function applySecurityHeaders(res: NextResponse, isApi: boolean = false): NextResponse {
  res.headers.set("Content-Security-Policy", buildCSP());
  res.headers.set("Strict-Transport-Security", "max-age=31536000;includeSubDomains; preload");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.delete("X-XSS-Protection");

  if (isApi) {
    res.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
  }
  return res;
}

export default auth((req) => {
  const isAuth = !!req.auth;
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api");

  // Allow NextAuth internal routes to pass through with their own logic
  if (pathname.startsWith("/api/auth")) {
    return applySecurityHeaders(NextResponse.next(), true);
  }

  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isOnboardPage = pathname.startsWith("/onboard");

  if (isAuthPage) {
    // 2. 만약 /signup 경로라면 무조건 /login으로 튕겨냄
    if (pathname.startsWith("/signup")) {
      return applySecurityHeaders(NextResponse.redirect(new URL("/login", req.nextUrl)));
    }
    // 로그인된 상태로 인증 페이지 접근 시 홈으로 이동
    if (isAuth) return applySecurityHeaders(NextResponse.redirect(new URL("/", req.nextUrl)));

    return applySecurityHeaders(NextResponse.next());
  }

  if (isOnboardPage) {
    if (!isAuth) return applySecurityHeaders(NextResponse.redirect(new URL("/login", req.nextUrl)));
    return applySecurityHeaders(NextResponse.next());
  }

  if (!isAuth) {
    if (isApi) {
      return applySecurityHeaders(
        new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
        true
      );
    }
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // Force password change if required
  const needsPasswordChange = (req.auth?.user as any)?.needsPasswordChange;
  const isForcePasswordChangePage = pathname.startsWith("/force-password-change");
  // Allow API calls to the password change route even if password change is required
  const isPasswordApi = pathname === "/api/user/password";

  if (needsPasswordChange && !isForcePasswordChangePage && !isPasswordApi && !isApi) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/force-password-change", req.nextUrl)));
  }

  // If password change is NOT required but user is on the change page, send them home
  if (isForcePasswordChangePage && needsPasswordChange === false) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/", req.nextUrl)));
  }

  return applySecurityHeaders(NextResponse.next(), isApi);
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, public assets (.png, .svg, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.png$|.*\\.svg$).*)",
  ],
};