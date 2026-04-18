import type { Metadata } from 'next'
import { Varela_Round } from 'next/font/google'
import './globals.css'
import Providers from '@/components/Providers'

const varelaRound = Varela_Round({ subsets: ['hebrew', 'latin'], weight: '400' })

export const metadata: Metadata = {
  title: 'שיעורי נהיגה עם אלכס לוין',
  description: 'קביעת שיעורי נהיגה',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'אלכס לוין',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Suez+One&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#1d4ed8" />
      </head>
      <body className={varelaRound.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
