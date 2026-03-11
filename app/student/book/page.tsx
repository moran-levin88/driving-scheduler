'use client'
import { useState, useEffect } from 'react'
import { format, isSameDay, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { he } from 'date-fns/locale'

type Slot = { id: string; startTime: string; endTime: string }
type AltSlot = { date: string; time: string }

export default function BookPage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [selected, setSelected] = useState<Slot | null>(null)
  const [doubleLesson, setDoubleLesson] = useState(false)
  const [notes, setNotes] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [altSlots, setAltSlots] = useState<AltSlot[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function fetchSlots() {
    const res = await fetch('/api/availability')
    const data = await res.json()
    setSlots(data)
  }

  useEffect(() => { fetchSlots() }, [])

  const days = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i))

  // Find the consecutive slot (starts exactly when selected ends)
  function getNextSlot(slot: Slot): Slot | null {
    return slots.find(s =>
      new Date(s.startTime).getTime() === new Date(slot.endTime).getTime()
    ) || null
  }

  function handleSelectSlot(slot: Slot) {
    setSelected(slot)
    setDoubleLesson(false)
    setSuccess(false)
    setError('')
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

  async function submitBooking() {
    if (!selected) return
    setSubmitting(true)
    setError('')

    const nextSlot = getNextSlot(selected)
    const availabilityIds = doubleLesson && nextSlot
      ? [selected.id, nextSlot.id]
      : [selected.id]

    const alternativeSlots = altSlots
      .filter(a => a.date && a.time)
      .map(a => `${a.date}T${a.time}`)

    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ availabilityIds, notes, pickupAddress, alternativeSlots }),
    })

    if (res.ok) {
      setSuccess(true)
      setSelected(null)
      setDoubleLesson(false)
      setNotes('')
      setPickupAddress('')
      setAltSlots([])
      fetchSlots()
    } else {
      const data = await res.json()
      setError(data.error || 'שגיאה בקביעת השיעור')
    }
    setSubmitting(false)
  }

  const nextSlot = selected ? getNextSlot(selected) : null

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">קביעת שיעור נהיגה</h1>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4 mb-6">
          בקשתך נשלחה! המורה יאשר את השיעור בקרוב.
        </div>
      )}

      <div className="flex items-center gap-4 mb-4">
        <button onClick={() => setWeekStart(subWeeks(weekStart, 1))} className="p-2 hover:bg-gray-100 rounded text-xl">&rarr;</button>
        <span className="font-medium">
          {format(weekStart, 'd MMM', { locale: he })} - {format(addDays(weekStart, 5), 'd MMM yyyy', { locale: he })}
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
                <div className="text-center mb-2">
                  <div className="text-xs text-gray-500">{format(day, 'EEEE', { locale: he })}</div>
                  <div className="font-bold">{format(day, 'd')}</div>
                </div>
                <div className="space-y-1">
                  {isPast ? null : daySlots.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center">אין שעות</p>
                  ) : daySlots.map(slot => {
                    const isSelected = selected?.id === slot.id
                    const isNext = selected && doubleLesson && getNextSlot(selected)?.id === slot.id
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
        <div className="bg-white rounded-xl shadow p-6 max-w-lg">
          <h2 className="text-xl font-semibold mb-4">אישור קביעת שיעור</h2>

          {/* Single / double toggle */}
          <div className="flex rounded-lg border overflow-hidden mb-4">
            <button type="button"
              onClick={() => setDoubleLesson(false)}
              className={`flex-1 py-2 text-sm font-medium transition ${!doubleLesson ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              שיעור בודד (40 דק׳)
            </button>
            <button type="button"
              onClick={() => setDoubleLesson(true)}
              disabled={!nextSlot}
              title={!nextSlot ? 'אין שיעור רצוף פנוי' : ''}
              className={`flex-1 py-2 text-sm font-medium transition ${doubleLesson ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'} disabled:opacity-40 disabled:cursor-not-allowed`}>
              שני שיעורים רצופים (80 דק׳)
            </button>
          </div>

          <div className="bg-blue-50 rounded-lg p-3 mb-4">
            <p className="text-gray-700 text-sm">
              <strong>תאריך:</strong> {format(new Date(selected.startTime), "EEEE, d בMMMM yyyy", { locale: he })}
            </p>
            <p className="text-gray-700 text-sm mt-1">
              <strong>שעה:</strong>{' '}
              {format(new Date(selected.startTime), 'HH:mm')}
              {' - '}
              {doubleLesson && nextSlot
                ? format(new Date(nextSlot.endTime), 'HH:mm')
                : format(new Date(selected.endTime), 'HH:mm')}
              {doubleLesson && nextSlot && (
                <span className="text-blue-600 font-medium"> (80 דקות)</span>
              )}
            </p>
          </div>

          {/* Pickup address */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              כתובת איסוף <span className="text-red-500">*</span>
            </label>
            <input type="text" value={pickupAddress} onChange={e => setPickupAddress(e.target.value)}
              placeholder="רחוב, מספר בית, עיר"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Notes */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">הערות (אופציונלי)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="הערות למורה..."
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {/* Alternative slots */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium">מועדים חלופיים (אופציונלי)</label>
              {altSlots.length < 3 && (
                <button type="button" onClick={addAltSlot} className="text-xs text-blue-600 hover:underline">
                  + הוסף מועד
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-2">אם השיעור יידחה, המורה יוכל לבחור ממועדים אלו</p>
            {altSlots.map((alt, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <input type="date" value={alt.date}
                  onChange={e => updateAltSlot(i, 'date', e.target.value)}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  className="flex-1 border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500" />
                <input type="time" value={alt.time}
                  onChange={e => updateAltSlot(i, 'time', e.target.value)}
                  className="w-24 border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500" />
                <button onClick={() => removeAltSlot(i)} className="text-red-400 hover:text-red-600 text-lg">&times;</button>
              </div>
            ))}
          </div>

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={submitBooking} disabled={submitting}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
              {submitting ? 'שולח...' : 'קבע שיעור'}
            </button>
            <button onClick={() => setSelected(null)}
              className="flex-1 border py-2 rounded-lg hover:bg-gray-50 transition">
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
