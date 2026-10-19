import type { NextConfig } from "next";

// script-src needs 'unsafe-inline': tried a per-request nonce + strict-dynamic
// via proxy.ts first, but Next's own inline <script> tags (streaming/
// hydration, under Turbopack) didn't pick up the nonce, and strict-dynamic
// then blocked every chunk — broke the app. 'unsafe-inline' means an XSS
// bug could still run attacker-supplied inline JS, but 'self' on
// script-src still blocks it loading any EXTERNAL script (the exfiltration
// payload most real XSS depends on), and connect-src 'self' blocks fetch-
// based exfiltration to another origin too.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Content-Security-Policy', value: CSP },
      ],
    }]
  },
};

export default nextConfig;
