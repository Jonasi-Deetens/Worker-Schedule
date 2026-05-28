import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    if (path.startsWith("/calendar") || path.startsWith("/notifications")) {
      if (!token) {
        return NextResponse.redirect(new URL("/login", req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const publicPaths = ["/login", "/register"];
        if (publicPaths.some((p) => req.nextUrl.pathname.startsWith(p))) {
          return true;
        }
        return !!token;
      },
    },
  },
);

export const config = {
  matcher: ["/calendar/:path*", "/notifications/:path*", "/login", "/register"],
};
