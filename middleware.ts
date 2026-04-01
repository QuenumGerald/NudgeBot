import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname.startsWith("/api/auth") || pathname.startsWith("/api/chat") || pathname.startsWith("/api/memory")) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("nudgebot-session");
  const secret = process.env.APP_SECRET;

  if (!sessionCookie || sessionCookie.value !== secret) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
