'use client'
import { useState, useEffect, useRef } from 'react'
import { format, isSameDay, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { he, ru } from 'date-fns/locale'
import { useLanguage } from '@/contexts/LanguageContext'

type Slot = { id: string; startTime: string; endTime: string; isBooked: boolean; myBookingStatus?: string | null }
type AltSlot = { date: string; time: string }
type LessonType = 'single' | 'half' | 'double'

const LESSON_SLOTS: Record<LessonType, number> = { single: 2, half: 3, double: 4 }

export default function BookPage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [selected, setSelected] = useState<Slot | null>(null)
  const [lessonType, setLessonType] = useState<LessonType>('single')
  const [notes, setNotes] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [altSlots, setAltSlots] = useState<AltSlot[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const confirmRef = useRef<HTMLDivElement>(null)
  const { t, lang } = useLanguage()
  const locale = lang === 'ru' ? ru : he

  async function fetchSlots() {
    const res = await fetch('/api/availability')
    const data = await res.json()
    setSlots(data)
  }

  useEffect(() => { fetchSlots() }, [])

  const days = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i))

  function isOccupied(slot: Slot): boolean {
    return slot.isBooked || (!!slot.myBookingStatus && slot.myBookingStatus !== 'CANCELLED' && slot.myBookingStatus !== 'REJECTED')
  }

  // Find up to `count` consecutive free slots starting from slot
  function getSlotChain(slot: Slot, count: number): Slot[] {
    const result: Slot[] = [slot]
    let current = slot
    while (result.length < count) {
      const next = slots.find(s =>
        new Date(s.startTime).getTime() === new Date(current.endTime).getTime() && !s.isBooked
      )
      if (!next) break
      result.push(next)
      current = next
    }
    return result
  }

  // Returns true if booking this chain would leave a 20 or 40-min gap next to a booked lesson
  function wouldLeaveGap(chain: Slot[]): boolean {
    if (!chain.length) return false
    const SLOT_MS = 20 * 60 * 1000

    // A gap is forbidden if it is between 1 and 3 slots (20–60 min).
    // 0 slots (back-to-back) is fine; 4+ slots (≥80 min) is fine.
    const lessonEndMs = new Date(chain[chain.length - 1].endTime).getTime()
    let freeAfter = 0
    let t = lessonEndMs
    while (freeAfter <= 3) {
      const next = slots.find(s => new Date(s.startTime).getTime() === t)
      if (!next) break
      if (isOccupied(next)) return freeAfter >= 1 && freeAfter <= 3
      freeAfter++
      if (freeAfter > 3) break
      t += SLOT_MS
    }

    const lessonStartMs = new Date(chain[0].startTime).getTime()
    let freeBefore = 0
    t = lessonStartMs
    while (freeBefore <= 3) {
      const prev = slots.find(s => new Date(s.endTime).getTime() === t)
      if (!prev) break
      if (isOccupied(prev)) return freeBefore >= 1 && freeBefore <= 3
      freeBefore++
      if (freeBefore > 3) break
      t -= SLOT_MS
    }

    return false
  }

  function handleSelectSlot(slot: Slot) {
    setSelected(slot)
    setLessonType('single')
    setSuccess(false)
    setError('')
    setTimeout(() => confirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  function addAltSlot() {
    if (altSlots.length < 3) setAltSlots([...altSlots, { date: '', time: '' }])
  }

  function updateAltSlot(i: number, field: 'date' | 'time', value: string) {
    const updated = [...altSlots]
    updated[i] = { ...updated[i], [field]: value }
    setAltSlots(updated)
  }

  function removeAltSlot(i: number) {
    setAltSlots(altSlots.filter((_, idx) => idx !== i))
  }

  function getAvailableTimesForDate(dateStr: string): Slot[] {
    if (!dateStr) return []
    return slots
      .filter(s => !s.isBooked && isSameDay(new Date(s.startTime), new Date(dateStr + 'T12:00:00')))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }

  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 })

  // Compute chains for each lesson type from the selected slot
  const chains: Record<LessonType, Slot[]> = {
    single: selected ? getSlotChain(selected, 2) : [],
    half:   selected ? getSlotChain(selected, 3) : [],
    double: selected ? getSlotChain(selected, 4) : [],
  }
  const activeChain = selected ? chains[lessonType] : []
  const canBook: Record<LessonType, boolean> = {
    single: chains.single.length >= 2,
    half:   chains.half.length >= 3,
    double: chains.double.length >= 4,
  }
  const hasGap = selected && canBook[lessonType] ? wouldLeaveGap(activeChain) : false

  async function submitBooking() {
    if (!selected) return
    setSubmitting(true)
    setError('')

    try {
      const chain = activeChain
      if (chain.length < LESSON_SLOTS[lessonType]) {
        setError(t('noConsecutive'))
        setSubmitting(false)
        return
      }
      if (wouldLeaveGap(chain)) {
        setError(t('gapError'))
        setSubmitting(false)
        return
      }

      const availabilityIds = chain.map(s => s.id)
      const alternativeSlots = altSlots
        .filter(a => a.date && a.time)
        .map(a => new Date(`${a.date}T${a.time}`).toISOString())

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availabilityIds, notes, pickupAddress, alternativeSlots }),
      })

      if (res.ok) {
        setSuccess(true)
        setSelected(null)
        setLessonType('single')
        setNotes('')
        setPickupAddress('')
        setAltSlots([])
        fetchSlots()
      } else {
        const text = await res.text()
        try {
          const data = JSON.parse(text)
          setError(data.error || t('bookError'))
        } catch {
          setError(t('bookError'))
        }
      }
    } catch {
      setError(t('bookError'))
    } finally {
      setSubmitting(false)
    }
  }

  function getDayName(day: Date): string {
    if (lang === 'ru') return format(day, 'EEE', { locale: ru })
    return format(day, 'EEEE', { locale: he }).replace('יום ', '')
  }

  const lessonOptions: { type: LessonType; label: string; durationKey: 'sixtyMin' | 'eightyMin' | null }[] = [
    { type: 'single', label: t('singleLesson'), durationKey: null },
    { type: 'half',   label: t('halfLesson'),   durationKey: 'sixtyMin' },
    { type: 'double', label: t('doubleLesson'),  durationKey: 'eightyMin' },
  ]

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">{t('bookTitle')}</h1>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4 mb-6">
          {t('bookSuccess')}
        </div>
      )}

      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => setWeekStart(subWeeks(weekStart, 1))}
          disabled={weekStart <= currentWeekStart}
          className="p-2 hover:bg-gray-100 rounded text-xl disabled:opacity-30 disabled:cursor-not-allowed">&rarr;</button>
        <span className="font-medium">
          {format(weekStart, 'd MMM', { locale })} - {format(addDays(weekStart, 5), 'd MMM yyyy', { locale })}
        </span>
        <button onClick={() => setWeekStart(addWeeks(weekStart, 1))} className="p-2 hover:bg-gray-100 rounded text-xl">&larr;</button>
      </div>

      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <div className="grid grid-cols-6 gap-2">
          {days.map(day => {
            const daySlots = slots
              .filter(s => isSameDay(new Date(s.startTime), day))
              .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
            const isPast = day < new Date(new Date().setHours(0, 0, 0, 0))
            return (
              <div key={day.toISOString()}>
                <div className="text-center mb-2 h-10 flex flex-col justify-center">
                  <div className="text-xs text-gray-500 leading-tight">{getDayName(day)}</div>
                  <div className="font-bold leading-tight">{format(day, 'd')}</div>
                </div>
                <div className="space-y-1">
                  {isPast ? null : daySlots.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center">{t('noSlots')}</p>
                  ) : daySlots.map(slot => {
                    const isSelected = selected?.id === slot.id
                    const isNext = selected && activeChain.some(s => s.id === slot.id && s.id !== selected.id)
                    const myStatus = slot.myBookingStatus
                    if (slot.isBooked && !myStatus) {
                      return (
                        <div key={slot.id}
                          className="w-full text-xs p-1.5 rounded-lg border bg-gray-100 text-gray-400 border-gray-200 text-center cursor-not-allowed">
                          {format(new Date(slot.startTime), 'HH:mm')}
                          <span className="block text-gray-300" style={{fontSize: '9px'}}>{t('slotTaken')}</span>
                        </div>
                      )
                    }
                    if (myStatus === 'APPROVED') {
                      return (
                        <div key={slot.id}
                          className="w-full text-xs p-1.5 rounded-lg border bg-green-100 text-green-700 border-green-300 text-center cursor-default">
                          {format(new Date(slot.startTime), 'HH:mm')}
                          <span className="block" style={{fontSize: '9px'}}>{t('slotApproved')}</span>
                        </div>
                      )
                    }
                    if (myStatus === 'PENDING') {
                      return (
                        <div key={slot.id}
                          className="w-full text-xs p-1.5 rounded-lg border bg-orange-100 text-orange-700 border-orange-300 text-center cursor-default">
                          {format(new Date(slot.startTime), 'HH:mm')}
                          <span className="block" style={{fontSize: '9px'}}>{t('slotPending')}</span>
                        </div>
                      )
                    }
                    return (
                      <button key={slot.id}
                        onClick={() => handleSelectSlot(slot)}
                        className={`w-full text-xs p-1.5 rounded-lg border transition ${
                          isSelected || isNext
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                        }`}>
                        {format(new Date(slot.startTime), 'HH:mm')}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {selected && (
        <div ref={confirmRef} className="bg-white rounded-xl shadow p-6 max-w-lg">
          <h2 className="text-xl font-semibold mb-4">{t('confirmTitle')}</h2>

          {/* Lesson type selector */}
          <div className="flex rounded-lg border overflow-hidden mb-4">
            {lessonOptions.map(opt => (
              <button key={opt.type} type="button"
                onClick={() => setLessonType(opt.type)}
                disabled={!canBook[opt.type]}
                title={!canBook[opt.type] ? t('noConsecutive') : ''}
                className={`flex-1 py-2 text-xs font-medium transition ${
                  lessonType === opt.type ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                } disabled:opacity-40 disabled:cursor-not-allowed`}>
                {opt.label}
              </button>
            ))}
          </div>

          {!canBook[lessonType] && (
            <p className="text-red-500 text-sm mb-3">{t('noConsecutive')}</p>
          )}

          {hasGap && (
            <p className="text-red-500 text-sm mb-3">{t('gapError')}</p>
          )}

          {canBook[lessonType] && !hasGap && (
            <div className="bg-blue-50 rounded-lg p-3 mb-4">
              <p className="text-gray-700 text-sm">
                <strong>{t('date')}</strong> {format(new Date(selected.startTime), t('dateFormat'), { locale })}
              </p>
              <p className="text-gray-700 text-sm mt-1">
                <strong>{t('time')}</strong>{' '}
                {format(new Date(selected.startTime), 'HH:mm')}
                {' - '}
                {format(new Date(activeChain[activeChain.length - 1]?.endTime ?? selected.endTime), 'HH:mm')}
                {lessonType !== 'single' && (
                  <span className="text-blue-600 font-medium"> {t(lessonOptions.find(o => o.type === lessonType)!.durationKey!)}</span>
                )}
              </p>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              {t('pickupAddress')} <span className="text-red-500">*</span>
            </label>
            <input type="text" value={pickupAddress} onChange={e => setPickupAddress(e.target.value)}
              placeholder={t('pickupPlaceholder')}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">{t('notes')}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder={t('notesPlaceholder')}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="mb-4 bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">📅</span>
              <h3 className="font-bold text-orange-800 text-base">{t('altSlotsTitle')}</h3>
            </div>
            <p className="text-sm text-orange-700 mb-3">
              {t('altSlotsDesc')}
              <br />
              <strong>{t('altSlotsFill')}</strong>
            </p>
            {altSlots.map((alt, i) => {
              const availTimes = getAvailableTimesForDate(alt.date)
              return (
                <div key={i} className="flex gap-2 mb-2 items-center">
                  <span className="text-sm font-medium text-orange-700 w-16 shrink-0">{t('altOption')} {i + 1}</span>
                  <input type="date" value={alt.date}
                    onChange={e => updateAltSlot(i, 'date', e.target.value)}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    className="flex-1 border border-orange-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-orange-400 bg-white" />
                  <select value={alt.time}
                    onChange={e => updateAltSlot(i, 'time', e.target.value)}
                    disabled={!alt.date}
                    className="w-24 border border-orange-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-orange-400 bg-white disabled:opacity-50">
                    <option value="">{t('hour')}</option>
                    {availTimes.length === 0 && alt.date
                      ? <option disabled>{t('noHours')}</option>
                      : availTimes.map(s => (
                          <option key={s.id} value={format(new Date(s.startTime), 'HH:mm')}>
                            {format(new Date(s.startTime), 'HH:mm')}
                          </option>
                        ))
                    }
                  </select>
                  <button onClick={() => removeAltSlot(i)} className="text-red-400 hover:text-red-600 text-lg">&times;</button>
                </div>
              )
            })}
            {altSlots.length < 3 && (
              <button type="button" onClick={addAltSlot}
                className="mt-1 w-full border-2 border-dashed border-orange-300 text-orange-600 font-medium py-2 rounded-lg hover:bg-orange-100 transition text-sm">
                {t('addAlt')}
              </button>
            )}
          </div>

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={submitBooking} disabled={submitting || !canBook[lessonType] || !!hasGap}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
              {submitting ? t('submitting') : t('bookLesson')}
            </button>
            <button onClick={() => setSelected(null)}
              className="flex-1 border py-2 rounded-lg hover:bg-gray-50 transition">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
