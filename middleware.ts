import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const role = (req.nextauth.token as any)?.role

    if (pathname.startsWith('/instructor') && role !== 'INSTRUCTOR') {
      return NextResponse.redirect(new URL('/student/dashboard', req.url))
    }

    if (pathname.startsWith('/student') && role !== 'STUDENT') {
      return NextResponse.redirect(new URL('/instructor/dashboard', req.url))
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  matcher: ['/instructor/:path*', '/student/:path*'],
}
