import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const target =
      process.env.ADMIN_URL ??
      (process.env.NODE_ENV === "development" ? "http://localhost:3001" : null);
    if (!target)
      return new NextResponse("관리자 주소가 아직 설정되지 않았습니다.", {
        status: 503,
      });
    const origin = new URL(target).origin;
    if (origin === request.nextUrl.origin)
      return new NextResponse("관리자 주소 설정을 확인해 주세요.", {
        status: 503,
      });
    // Old forms must be reopened in the new app; server actions cannot cross builds.
    return NextResponse.redirect(
      new URL(pathname + search, origin),
      request.method === "GET" || request.method === "HEAD" ? 307 : 303,
    );
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|epub|woff2)$).*)",
  ],
};
