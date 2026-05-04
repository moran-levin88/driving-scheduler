'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'

const VAPID_PUBLIC_KEY = 'BNceTaMK2zXSEl8XrYkFNTU_PHARw-R1cxo2bgg6TuJOLT590fj6bw1CsN-K3_mEo2nvw2dk1Mw0kXnLoqbj7qc'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function InstructorNav() {
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)
  const [notifStatus, setNotifStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown')

  useEffect(() => {
    fetch('/api/instructor/pending-count')
      .then(r => r.json())
      .then(d => setPendingCount(d.count ?? 0))
      .catch(() => {})

    if ('Notification' in window) {
      setNotifStatus(Notification.permission as any)
    }

    registerPush()
  }, [])

  async function registerPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const existing = await reg.pushManager.getSubscription()
      if (existing) return // already subscribed

      if (Notification.permission === 'denied') return
      if (Notification.permission === 'default') return // wait for user to click bell
    } catch {}
  }

  async function requestPushPermission() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    try {
      const permission = await Notification.requestPermission()
      setNotifStatus(permission as any)
      if (permission !== 'granted') return

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      })
    } catch (e) {
      console.error('Push subscription failed:', e)
    }
  }

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

        {/* Bell icon — request push permission if not granted */}
        {notifStatus !== 'granted' && notifStatus !== 'denied' && (
          <button onClick={requestPushPermission}
            title="הפעל התראות לבקשות חדשות"
            className="flex-shrink-0 text-yellow-300 hover:text-yellow-100 transition text-base">
            🔔
          </button>
        )}
        {notifStatus === 'granted' && (
          <span className="flex-shrink-0 text-green-300 text-sm" title="התראות פעילות">🔔</span>
        )}

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
