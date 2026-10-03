'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CancelLessonButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [cancelling, setCancelling] = useState(false)

  async function handleCancel() {
    if (!confirm('לבטל את השיעור? הביטול יסיר אותו מסך השיעורים של התלמיד ויפנה את השעה.')) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
      if (res.ok) {
        router.refresh() // re-fetches the server-computed lesson count/debt/balance
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'שגיאה בביטול')
        setCancelling(false)
      }
    } catch {
      alert('שגיאת רשת — נסה שוב')
      setCancelling(false)
    }
  }

  return (
    <button onClick={handleCancel} disabled={cancelling}
      className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition disabled:opacity-50">
      {cancelling ? 'מבטל...' : 'בטל שיעור'}
    </button>
  )
}
