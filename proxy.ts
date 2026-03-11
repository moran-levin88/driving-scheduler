import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    if (path.startsWith('/instructor') && token?.role !== 'INSTRUCTOR') {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    if (path.startsWith('/student') && token?.role !== 'STUDENT') {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    return NextResponse.next()
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
