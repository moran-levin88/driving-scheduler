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

  const totalMinutes = Math.floor(remainingMs / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days} ${t('countdownDays')}`)
  if (days > 0 || hours > 0) parts.push(`${hours} ${t('countdownHours')}`)
  parts.push(`${minutes} ${t('countdownMinutes')}`)

  const text = t('nextAvailabilityCountdown').replace('{time}', parts.join(' '))

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-center">
      <p className="text-blue-800 font-medium">⏳ {text}</p>
    </div>
  )
}
