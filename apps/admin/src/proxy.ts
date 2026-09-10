import { NextResponse, type NextRequest } from "next/server";
import { createServerDatabase } from "@ttokttok/database/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const db = createServerDatabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies)
          response.cookies.set(name, value, options);
      },
    },
    "ttokttok-admin-auth",
  );
  const {
    data: { user },
  } = await db.auth.getUser();
  const pathname = request.nextUrl.pathname;
  if (
    (pathname === "/admin" || pathname.startsWith("/admin/")) &&
    pathname !== "/admin/login" &&
    !user
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll())
      redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
