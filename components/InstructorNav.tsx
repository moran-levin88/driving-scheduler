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
    { href: '/instructor/book', label: 'קביעת שיעור' },
    { href: '/instructor/students', label: 'תלמידים' },
  ]

  return (
    <nav className="bg-blue-700 text-white px-4 py-3">
      <div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} dir="rtl">
        {links.map(l => (
          <Link key={l.href} href={l.href}
            className={`flex-shrink-0 hover:text-blue-200 transition text-sm ${pathname === l.href ? 'font-bold border-b-2 border-white' : ''}`}>
            {l.label}
          </Link>
        ))}
        <button onClick={() => window.location.reload()}
          className="flex-shrink-0 text-blue-200 hover:text-white transition text-sm" title="רענן">
          ↻
        </button>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex-shrink-0 text-blue-200 hover:text-white transition text-sm mr-auto">
          התנתקות
        </button>
      </div>
    </nav>
  )
}
