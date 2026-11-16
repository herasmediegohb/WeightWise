import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, authRequired, verifySessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (!authRequired()) return NextResponse.next();
  const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    "/((?!login|status|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|icons/|sw.js|zxing_reader.wasm|api/cron/).*)",
  ],
};
