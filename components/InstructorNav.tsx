'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

export default function InstructorNav() {
  const pathname = usePathname()
  const links = [
    { href: '/instructor/dashboard', label: 'לוח בקרה' },
    { href: '/instructor/availability', label: 'ניהול זמינות' },
    { href: '/instructor/schedule', label: 'לו״ז שיעורים' },
    { href: '/instructor/bookings', label: 'הזמנות' },
    { href: '/instructor/students', label: 'תלמידים' },
  ]

  return (
    <nav className="bg-blue-700 text-white px-6 py-4">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex gap-6">
          {links.map(l => (
            <Link key={l.href} href={l.href}
              className={`hover:text-blue-200 transition ${pathname === l.href ? 'font-bold border-b-2 border-white' : ''}`}>
              {l.label}
            </Link>
          ))}
        </div>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-blue-200 hover:text-white transition text-sm">
          התנתקות
        </button>
      </div>
    </nav>
  )
}
