'use client'
import { useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

// A live countdown to the next moment the instructor's schedule has more
// availability scheduled to open (see Availability.publishAt) — tells the
// student something is coming without revealing the slots themselves early.
export default function NextAvailabilityCountdown() {
  const { t } = useLanguage()
  const [nextPublishAt, setNextPublishAt] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    async function fetchNext() {
      try {
        const res = await fetch('/api/availability/next-publish')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setNextPublishAt(data.nextPublishAt)
      } catch {
        // quiet — this is a nice-to-have, not critical
      }
    }
    fetchNext()
    // Re-check periodically: once this one opens up, there may be a further
    // one scheduled, or none at all — either way the card should update.
    const refetchInterval = setInterval(fetchNext, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(refetchInterval) }
  }, [])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  if (!nextPublishAt) return null
  const remainingMs = new Date(nextPublishAt).getTime() - now
  if (remainingMs <= 0) return null

  const days = Math.floor(remainingMs / 86_400_000)
  const hours = Math.floor((remainingMs % 86_400_000) / 3_600_000)
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000)
  const seconds = Math.floor((remainingMs % 60_000) / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')

  const units: { value: number; label: string }[] = [
    { value: days, label: t('countdownDays') },
    { value: hours, label: t('countdownHours') },
    { value: minutes, label: t('countdownMinutes') },
    { value: seconds, label: t('countdownSeconds') },
  ]

  return (
    <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-2xl p-5 mb-6 text-center shadow-lg shadow-indigo-200">
      <p className="text-blue-50 text-sm font-medium mb-3">{t('nextAvailabilityIntro')}</p>
      <div className="flex items-center justify-center gap-2 sm:gap-3" dir="ltr">
        {units.map((u, i) => (
          <div key={i} className="flex items-center gap-2 sm:gap-3">
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2 min-w-[56px] sm:min-w-[64px]">
              <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums tracking-wide">{pad(u.value)}</p>
              <p className="text-[10px] text-blue-100 mt-0.5">{u.label}</p>
            </div>
            {i < units.length - 1 && <span className="text-white/70 text-xl font-bold -mt-4">:</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
