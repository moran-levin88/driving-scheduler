'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const OPTIONS = [40, 60, 80, 100, 120] as const
const POPOVER_WIDTH = 224 // w-56
const POPOVER_HEIGHT = 160 // approx, for deciding whether to flip upward

export default function EditDurationButton({ bookingId, currentMinutes }: { bookingId: string; currentMinutes: number }) {
  const router = useRouter()
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const [saving, setSaving] = useState<number | null>(null)
  const [error, setError] = useState('')

  // Fixed positioning (computed from the button's own bounding box) instead of
  // an absolute dropdown — the table rows sit inside an overflow-x-auto/
  // overflow-hidden container, which was clipping the popover for the last
  // row since it had no room to render below it inside that container.
  function handleToggle() {
    if (open) {
      setOpen(false)
      return
    }
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow < POPOVER_HEIGHT ? rect.top - POPOVER_HEIGHT - 4 : rect.bottom + 4
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - POPOVER_WIDTH - 8)
      setCoords({ top, left })
    }
    setOpen(true)
  }

  async function handlePick(minutes: number) {
    if (minutes === currentMinutes) return
    setSaving(minutes)
    setError('')
    try {
      const res = await fetch(`/api/bookings/${bookingId}/duration`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      })
      if (res.ok) {
        setOpen(false)
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'שגיאה')
      }
    } catch {
      setError('שגיאת רשת — נסה שוב')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="relative inline-block">
      <button ref={btnRef} onClick={handleToggle}
        className="text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-lg transition">
        ערוך משך
      </button>
      {open && coords && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div style={{ top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
            className="fixed z-50 bg-white rounded-xl shadow-lg border p-2" dir="rtl">
            <p className="text-xs text-gray-500 mb-1.5 px-1">משך בפועל:</p>
            <div className="grid grid-cols-3 gap-1">
              {OPTIONS.map(min => {
                const active = min === currentMinutes
                return (
                  <button key={min} type="button" disabled={active || saving != null}
                    onClick={() => handlePick(min)}
                    className={`py-1.5 rounded-lg text-xs font-medium border-2 transition disabled:opacity-60 ${
                      active ? 'border-purple-600 bg-purple-100 text-purple-800' : 'border-gray-200 bg-white hover:border-purple-300'
                    }`}>
                    {saving === min ? '...' : `${min} דק׳`}
                  </button>
                )
              })}
            </div>
            {error && <p className="text-xs text-red-600 mt-1.5 px-1">{error}</p>}
          </div>
        </>
      )}
    </div>
  )
}
