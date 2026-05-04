'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'

export default function InstructorNav() {
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    function fetchCount() {
      fetch('/api/instructor/pending-count')
        .then(r => r.json())
        .then(d => setPendingCount(d.count ?? 0))
        .catch(() => {})
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [])

  const links = [
    { href: '/instructor/dashboard', label: 'לוח בקרה' },
    { href: '/instructor/availability', label: 'ניהול זמינות' },
    { href: '/instructor/calendar', label: 'קלנדר' },
    { href: '/instructor/bookings', label: 'הזמנות', badge: pendingCount },
    { href: '/instructor/book', label: 'קביעת שיעור' },
    { href: '/instructor/students', label: 'תלמידים' },
  ]

  return (
    <nav className="bg-blue-700 text-white px-4 py-3">
      <div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} dir="rtl">
        {links.map(l => (
          <Link key={l.href} href={l.href}
            className={`flex-shrink-0 hover:text-blue-200 transition text-sm relative ${pathname === l.href ? 'font-bold border-b-2 border-white' : ''}`}>
            {l.label}
            {l.badge ? (
              <span className="absolute -top-2 -left-2 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                {l.badge}
              </span>
            ) : null}
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
