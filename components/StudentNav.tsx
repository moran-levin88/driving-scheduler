'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

export default function StudentNav({ name }: { name: string }) {
  const pathname = usePathname()
  return (
    <nav className="bg-blue-700 text-white px-6 py-4">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex gap-6">
          <Link href="/student/dashboard"
            className={`hover:text-blue-200 transition ${pathname === '/student/dashboard' ? 'font-bold border-b-2 border-white' : ''}`}>
            השיעורים שלי
          </Link>
          <Link href="/student/book"
            className={`hover:text-blue-200 transition ${pathname === '/student/book' ? 'font-bold border-b-2 border-white' : ''}`}>
            קביעת שיעור
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-blue-200 text-sm">שלום, {name}</span>
          <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-blue-200 hover:text-white transition text-sm">
            התנתקות
          </button>
        </div>
      </div>
    </nav>
  )
}
