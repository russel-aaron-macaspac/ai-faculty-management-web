import { NextResponse } from "next/server";

const publicRoutes = ["/login", "/"];

const roleBasedRoutes = {
  admin: ["/dashboard/admin", "/users", "/schedules", "/clearance", "/reports"],
  faculty: ["/dashboard/faculty", "/attendance", "/schedules"],
  staff: ["/dashboard/faculty", "/attendance"],
};

const commonRoutes = ["/dashboard/profile", "/dashboard/changepassword"];

export function middleware(request) {
  const pathname = request.nextUrl.pathname;

  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  const userCookie = request.cookies.get("user")?.value;

  if (!userCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let user = {};
  try {
    const decodedUser = Buffer.from(userCookie, "base64").toString("utf-8");
    user = JSON.parse(decodedUser);
  } catch (error) {
    
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (commonRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  const userRole = user.role;
  const allowedRoutes = roleBasedRoutes[userRole] || [];

  const hasAccess = allowedRoutes.some((route) => pathname.startsWith(route));

  if (!hasAccess) {
    const dashboardRoute =
      userRole === "admin" ? "/dashboard/admin" : "/dashboard/faculty";
    return NextResponse.redirect(new URL(dashboardRoute, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|public|favicon.ico|api/auth).*)",
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
    "/api/:function*",
  ],
};
