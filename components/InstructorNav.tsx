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
  const [notifStatus, setNotifStatus] = useState<'unknown' | 'default' | 'granted' | 'denied'>('unknown')

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
    if (Notification.permission !== 'granted') return
    try {
      // Fetch key from server — eliminates hardcoded key / env-var mismatch
      const keyRes = await fetch('/api/push/key')
      const { key } = await keyRes.json()
      if (!key) return

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()

      // Only create a new subscription if one doesn't exist in the browser.
      // Always sync to server — handles the case where server cleared the DB entry.
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        })
      }

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      })
    } catch (e) {
      console.error('Push sync failed:', e)
    }
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
    <nav className="sticky top-0 z-40 bg-blue-700 text-white px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 shadow-sm">
      <div className="flex min-h-11 items-center gap-1 overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} dir="rtl">
        {links.map(l => (
          <Link key={l.href} href={l.href}
            className={`relative flex shrink-0 items-center min-h-11 rounded-full px-3 text-sm font-medium transition active:scale-95 ${
              pathname === l.href
                ? 'bg-white text-blue-700 font-semibold'
                : 'text-blue-100 hover:text-white hover:bg-blue-600'
            }`}>
            {l.label}
            {l.badge ? (
              <span className="absolute -top-0.5 -left-0.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                {l.badge}
              </span>
            ) : null}
          </Link>
        ))}

        {notifStatus === 'default' && (
          <button onClick={requestPushPermission}
            title="הפעל התראות"
            className="shrink-0 flex items-center min-h-11 px-2 text-yellow-300 hover:text-yellow-100 transition active:scale-95">
            🔔
          </button>
        )}

        <button onClick={() => window.location.reload()}
          className="shrink-0 flex items-center min-h-11 px-2 text-blue-200 hover:text-white transition active:scale-95" title="רענן">
          ↻
        </button>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          className="shrink-0 flex items-center min-h-11 px-2 text-blue-200 hover:text-white transition text-sm active:scale-95 mr-auto">
          התנתקות
        </button>
      </div>
    </nav>
  )
}
