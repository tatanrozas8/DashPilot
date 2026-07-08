import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";

const publicRoutes = ["/", "/login"];
const publicPrefixes = ["/share"];
const protectedPrefixes = ["/app"];

function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function isPublicPath(pathname: string) {
  return publicRoutes.includes(pathname) || publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!hasSupabaseEnv()) return NextResponse.next();
  if (!isProtectedPath(pathname) && pathname !== "/login") return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const isLocalModeCookie = request.cookies.get("dashpilot_local_mode")?.value === "true";

  if (user && isLocalModeCookie) {
    response.cookies.delete("dashpilot_local_mode");
  }

  if (!user && isLocalModeCookie) {
    return response;
  }

  if (!user && isProtectedPath(pathname) && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const appUrl = request.nextUrl.clone();
    appUrl.pathname = "/app";
    appUrl.search = "";
    return NextResponse.redirect(appUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
