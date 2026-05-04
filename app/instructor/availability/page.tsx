'use client'
import { useState, useEffect } from 'react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { he } from 'date-fns/locale'

type Slot = {
  id: string
  startTime: string
  endTime: string
  isBooked: boolean
  isBlocked: boolean
  blockNote?: string | null
  booking?: {
    id: string
    status: string
    pickupAddress?: string | null
    student: { name: string; email: string; phone?: string | null }
  } | null
}

type LessonGroup = {
  ids: string[]
  slotIds: string[]
  studentName: string
  startTime: string
  endTime: string
}

type LessonModal = {
  group: LessonGroup
  targetDate: string  // yyyy-MM-dd
  targetTime: string  // HH:mm
  shifting: boolean
  cancelling: boolean
  result: string
}

type BlockModal = {
  id: string
  date: string
  startTime: string
  endTime: string
  blockNote: string
  saving: boolean
  deleting: boolean
  result: string
}

const roundMin = (d: string | Date) => Math.round(new Date(d).getTime() / 60000) * 60000

function findLessonGroup(slot: Slot, allSlots: Slot[]): LessonGroup | null {
  if (!slot.isBooked || !slot.booking) return null
  const studentName = slot.booking.student.name
  const booked = allSlots
    .filter(s => s.isBooked && s.booking?.student.name === studentName)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  let current: Slot[] = []
  let found: Slot[] = []
  for (const s of booked) {
    const last = current[current.length - 1]
    if (last && roundMin(last.endTime) === roundMin(s.startTime)) {
      current.push(s)
    } else { current = [s] }
    if (current.some(x => x.id === slot.id)) found = [...current]
  }
  if (!found.length) found = [slot]
  return {
    ids: found.map(s => s.booking!.id),
    slotIds: found.map(s => s.id),
    studentName,
    startTime: found[0].startTime,
    endTime: found[found.length - 1].endTime,
  }
}

function groupUpcomingForBulk(slots: Slot[]): LessonGroup[] {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const booked = slots
    .filter(s => s.isBooked && s.booking && ['PENDING', 'APPROVED'].includes(s.booking.status) && new Date(s.startTime) >= tomorrow)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  const groups: LessonGroup[] = []
  for (const s of booked) {
    const last = groups[groups.length - 1]
    if (last && last.studentName === s.booking!.student.name && new Date(last.endTime).getTime() === new Date(s.startTime).getTime()) {
      last.ids.push(s.booking!.id); last.slotIds.push(s.id); last.endTime = s.endTime
    } else {
      groups.push({ ids: [s.booking!.id], slotIds: [s.id], studentName: s.booking!.student.name, startTime: s.startTime, endTime: s.endTime })
    }
  }
  return groups
}

export default function AvailabilityPage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [mobileDay, setMobileDay] = useState(() => new Date())
  const [creating, setCreating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<'lesson' | 'block'>('lesson')
  const [form, setForm] = useState({ date: '', startTime: '09:00', endTime: '17:00', blockNote: '' })
  const [error, setError] = useState('')
  const [modal, setModal] = useState<LessonModal | null>(null)
  const [blockModal, setBlockModal] = useState<BlockModal | null>(null)
  const [shiftOpen, setShiftOpen] = useState(false)
  const [shiftGroups, setShiftGroups] = useState<LessonGroup[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [shiftMinutes, setShiftMinutes] = useState<20 | 40>(20)
  const [shiftDirection, setShiftDirection] = useState<'earlier' | 'later'>('earlier')
  const [shifting, setShifting] = useState(false)
  const [shiftResult, setShiftResult] = useState('')

  async function fetchSlots() {
    const res = await fetch('/api/availability')
    const data = await res.json()
    setSlots(data)
  }
  useEffect(() => { fetchSlots() }, [])

  const days = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i))

  function getDaySlots(day: Date) {
    const all = slots.filter(s => isSameDay(new Date(s.startTime), day))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    const blocks = all.filter(s => s.isBlocked)
    return all.filter(s => {
      if (s.isBlocked) return true
      const start = new Date(s.startTime).getTime(); const end = new Date(s.endTime).getTime()
      return !blocks.some(b => start >= new Date(b.startTime).getTime() && end <= new Date(b.endTime).getTime())
    })
  }

  function openLessonModal(slot: Slot) {
    const group = findLessonGroup(slot, slots)
    if (!group) return
    const start = new Date(group.startTime)
    setModal({
      group,
      targetDate: format(start, 'yyyy-MM-dd'),
      targetTime: format(start, 'HH:mm'),
      shifting: false,
      cancelling: false,
      result: '',
    })
  }

  async function handleModalShift() {
    if (!modal) return
    setModal(m => m ? { ...m, shifting: true, result: '' } : m)
    const targetStartTimeIso = new Date(`${modal.targetDate}T${modal.targetTime}:00`).toISOString()
    const res = await fetch('/api/bookings/shift', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingIds: modal.group.ids, targetStartTimeIso }),
    })
    const data = await res.json()
    if (res.ok) { setModal(null); fetchSlots() }
    else setModal(m => m ? { ...m, shifting: false, result: `שגיאה: ${data.error}` } : m)
  }

  async function handleModalCancel() {
    if (!modal) return
    if (!confirm(`לבטל את שיעור ${modal.group.studentName}?`)) return
    setModal(m => m ? { ...m, cancelling: true } : m)
    const res = await fetch('/api/bookings/group/status', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: modal.group.ids, status: 'CANCELLED' }),
    })
    if (res.ok) { setModal(null); fetchSlots() }
    else { const d = await res.json(); setModal(m => m ? { ...m, cancelling: false, result: `שגיאה: ${d.error}` } : m) }
  }

  function openBlockModal(slot: Slot) {
    const start = new Date(slot.startTime)
    const end = new Date(slot.endTime)
    setBlockModal({
      id: slot.id,
      date: format(start, 'yyyy-MM-dd'),
      startTime: format(start, 'HH:mm'),
      endTime: format(end, 'HH:mm'),
      blockNote: slot.blockNote || '',
      saving: false,
      deleting: false,
      result: '',
    })
  }

  async function handleBlockSave() {
    if (!blockModal) return
    setBlockModal(m => m ? { ...m, saving: true, result: '' } : m)
    const startTime = new Date(`${blockModal.date}T${blockModal.startTime}:00`)
    const endTime = new Date(`${blockModal.date}T${blockModal.endTime}:00`)
    const res = await fetch(`/api/availability/${blockModal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime: startTime.toISOString(), endTime: endTime.toISOString(), blockNote: blockModal.blockNote }),
    })
    const data = await res.json()
    if (res.ok) { setBlockModal(null); fetchSlots() }
    else setBlockModal(m => m ? { ...m, saving: false, result: data.error || 'שגיאה' } : m)
  }

  async function handleBlockDelete() {
    if (!blockModal) return
    if (!confirm('למחוק את החסימה?')) return
    setBlockModal(m => m ? { ...m, deleting: true } : m)
    const res = await fetch(`/api/availability/${blockModal.id}`, { method: 'DELETE' })
    if (res.ok) { setBlockModal(null); fetchSlots() }
    else setBlockModal(m => m ? { ...m, deleting: false, result: 'שגיאה במחיקה' } : m)
  }

  function whatsappLink(slot: Slot) {
    const phone = slot.booking?.student.phone?.replace(/\D/g, '').replace(/^0/, '972')
    if (!phone) return null
    const group = findLessonGroup(slot, slots)
    if (!group) return null
    const text = encodeURIComponent(`שלום ${slot.booking!.student.name}, תזכורת: יש לך שיעור נהיגה ביום ${format(new Date(group.startTime), "EEEE, d בMMMM", { locale: he })} בשעה ${format(new Date(group.startTime), 'HH:mm')}. בהצלחה!`)
    return `https://wa.me/${phone}?text=${text}`
  }

  async function openBulkShift() {
    setShiftResult(''); setSelectedIds(new Set())
    setShiftGroups(groupUpcomingForBulk(slots)); setShiftOpen(true)
  }

  async function handleBulkShift() {
    const bookingIds = shiftGroups.filter(g => selectedIds.has(g.ids[0])).flatMap(g => g.ids)
    if (!bookingIds.length) return
    setShifting(true)
    const res = await fetch('/api/bookings/shift', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingIds, minutes: shiftMinutes, direction: shiftDirection }),
    })
    const data = await res.json()
    setShifting(false)
    if (res.ok) { setShiftResult(`✓ ${data.shifted} שיעורים הוזזו בהצלחה`); setSelectedIds(new Set()); fetchSlots() }
    else setShiftResult(`שגיאה: ${data.error}`)
  }

  async function deleteSlot(id: string) {
    await fetch(`/api/availability/${id}`, { method: 'DELETE' }); fetchSlots()
  }

  function calcLessons() {
    if (!form.startTime || !form.endTime) return 0
    const [sh, sm] = form.startTime.split(':').map(Number); const [eh, em] = form.endTime.split(':').map(Number)
    const diff = (eh * 60 + em) - (sh * 60 + sm)
    return diff > 0 ? Math.floor(diff / 40) : 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (submitting) return
    setSubmitting(true)
    const startTime = new Date(`${form.date}T${form.startTime}:00`)
    const endTime = new Date(`${form.date}T${form.endTime}:00`)
    if (endTime <= startTime) { setError('שעת הסיום חייבת להיות אחרי שעת ההתחלה'); setSubmitting(false); return }
    const res = await fetch('/api/availability', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime: startTime.toISOString(), endTime: endTime.toISOString(), isBlocked: mode === 'block', blockNote: form.blockNote || null }),
    })
    setSubmitting(false)
    let data: any = {}
    try { const text = await res.text(); if (text) data = JSON.parse(text) } catch {}
    if (res.ok) { setCreating(false); setForm({ date: '', startTime: '09:00', endTime: '17:00', blockNote: '' }); fetchSlots() }
    else setError(data.error || `שגיאה (${res.status})`)
  }

  function SlotCard({ slot, compact = false }: { slot: Slot; compact?: boolean }) {
    const isBlock = slot.isBlocked
    const isBooked = slot.isBooked && slot.booking && !['CANCELLED', 'REJECTED'].includes(slot.booking.status)
    const clickable = isBlock || isBooked
    return (
      <div
        onClick={clickable ? () => isBlock ? openBlockModal(slot) : openLessonModal(slot) : undefined}
        className={`rounded-lg transition ${compact ? 'text-xs p-1.5' : 'p-3'} ${
          isBlock ? 'bg-red-100 text-red-800 cursor-pointer hover:bg-red-200 active:bg-red-300' :
          isBooked ? 'bg-orange-100 text-orange-800 cursor-pointer hover:bg-orange-200 active:bg-orange-300' :
          'bg-blue-50 text-blue-800'
        }`}>
        <div className="flex justify-between items-start">
          <div className="min-w-0 flex-1">
            <span className="font-semibold">{format(new Date(slot.startTime), 'HH:mm')}</span>
            {isBlock && <span className="text-xs mr-1">–{format(new Date(slot.endTime), 'HH:mm')}</span>}
            {isBooked && !compact && (
              <p className="font-medium text-sm mt-0.5">{slot.booking!.student.name}</p>
            )}
            {isBooked && compact && (
              <span className="text-xs mr-1 truncate block max-w-[60px]">{slot.booking!.student.name.split(' ')[0]}</span>
            )}
            {isBlock && <p className="text-xs text-red-700 mt-0.5 truncate">{slot.blockNote || 'חסום'}</p>}
          </div>
          {!slot.isBooked && !isBlock && (
            <button onClick={e => { e.stopPropagation(); deleteSlot(slot.id) }}
              className="text-red-400 hover:text-red-600 font-bold text-base leading-none">&times;</button>
          )}
          {clickable && !compact && <span className="text-gray-400 text-lg">›</span>}
        </div>
      </div>
    )
  }

  const isPast = (day: Date) => day < new Date(new Date().setHours(0, 0, 0, 0))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">ניהול זמינות</h1>
        <div className="flex gap-2">
          <button onClick={openBulkShift} className="bg-orange-500 text-white px-3 py-2 rounded-lg hover:bg-orange-600 transition text-sm">
            ↔ הזז
          </button>
          <button onClick={() => { setCreating(true); setMode('lesson') }} className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition text-sm">
            + הוסף
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mb-4 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200 inline-block"></span>פנוי</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-200 inline-block"></span>מוזמן (לחץ)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 inline-block"></span>חסום</span>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => { const w = subWeeks(weekStart, 1); setWeekStart(w); setMobileDay(w) }} className="p-2 hover:bg-gray-100 rounded">&rarr;</button>
        <span className="font-medium text-sm flex-1 text-center">{format(weekStart, 'd MMM', { locale: he })} – {format(addDays(weekStart, 5), 'd MMM yyyy', { locale: he })}</span>
        <button onClick={() => { const w = addWeeks(weekStart, 1); setWeekStart(w); setMobileDay(w) }} className="p-2 hover:bg-gray-100 rounded">&larr;</button>
      </div>

      {/* ── MOBILE view ── */}
      <div className="md:hidden">
        {/* Day strip */}
        <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden mb-4 pb-1">
          {days.map(day => (
            <button key={day.toISOString()} onClick={() => setMobileDay(day)}
              className={`shrink-0 flex flex-col items-center w-14 py-2 rounded-xl border transition ${
                isSameDay(day, mobileDay)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : isPast(day) ? 'bg-gray-50 text-gray-400 border-gray-200'
                  : 'bg-white text-gray-700 border-gray-200'
              }`}>
              <span className="text-xs font-medium">{format(day, 'EEEE', { locale: he }).replace('יום ', '')}</span>
              <span className="text-xl font-bold leading-tight">{format(day, 'd')}</span>
              <span className="text-xs">{format(day, 'MMM', { locale: he })}</span>
            </button>
          ))}
        </div>

        {/* Selected day slots */}
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">{format(mobileDay, "EEEE, d בMMMM", { locale: he })}</h2>
            {!isPast(mobileDay) && (
              <button onClick={() => { setCreating(true); setMode('lesson'); setForm(f => ({ ...f, date: format(mobileDay, 'yyyy-MM-dd') })) }}
                className="text-blue-600 text-sm font-medium hover:underline">+ הוסף</button>
            )}
          </div>
          <div className="space-y-2">
            {getDaySlots(mobileDay).length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">אין שעות ביום זה</p>
            ) : getDaySlots(mobileDay).map(slot => (
              <SlotCard key={slot.id} slot={slot} />
            ))}
          </div>
        </div>
      </div>

      {/* ── DESKTOP view ── */}
      <div className="hidden md:grid grid-cols-6 gap-3">
        {days.map(day => {
          const daySlots = getDaySlots(day)
          return (
            <div key={day.toISOString()} className={`bg-white rounded-xl shadow p-3 ${isPast(day) ? 'opacity-50' : ''}`}>
              <div className="text-center mb-3 pb-2 border-b">
                <div className="text-xs text-gray-500 font-medium">{format(day, 'EEEE', { locale: he }).replace('יום ', '')}</div>
                <div className="text-xl font-bold text-gray-800">{format(day, 'd')}</div>
                <div className="text-xs text-gray-400">{format(day, 'MMM', { locale: he })}</div>
              </div>
              <div className="space-y-1 min-h-[60px]">
                {daySlots.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center py-2">אין</p>
                ) : daySlots.map(slot => <SlotCard key={slot.id} slot={slot} compact />)}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Lesson action modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm" dir="rtl" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-lg">{modal.group.studentName}</p>
            <p className="text-gray-500 text-sm mb-4">
              {format(new Date(modal.group.startTime), "EEEE, d בMMMM", { locale: he })} | {format(new Date(modal.group.startTime), 'HH:mm')}–{format(new Date(modal.group.endTime), 'HH:mm')}
            </p>

            <div className="bg-orange-50 rounded-xl p-3 mb-3">
              <p className="text-sm font-semibold text-orange-800 mb-2">
                הזזת שיעור
                <span className="text-xs font-normal text-orange-600 mr-2">
                  (משך: {Math.round((new Date(modal.group.endTime).getTime() - new Date(modal.group.startTime).getTime()) / 60000)} דק׳)
                </span>
              </p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">תאריך</label>
                  <input type="date" value={modal.targetDate}
                    onChange={e => setModal(m => m ? { ...m, targetDate: e.target.value } : m)}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">שעת התחלה</label>
                  <input type="time" value={modal.targetTime}
                    onChange={e => setModal(m => m ? { ...m, targetTime: e.target.value } : m)}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
              <button onClick={handleModalShift} disabled={modal.shifting}
                className="w-full bg-orange-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition">
                {modal.shifting ? 'מזיז...' : `הזז לשעה ${modal.targetTime} ב-${modal.targetDate.slice(8)}.${modal.targetDate.slice(5,7)}`}
              </button>
            </div>

            {(() => {
              const slot = slots.find(s => s.booking?.id === modal.group.ids[0])
              const wa = slot ? whatsappLink(slot) : null
              return wa ? (
                <a href={wa} target="_blank" rel="noreferrer"
                  className="block w-full bg-green-500 text-white text-center py-2 rounded-lg text-sm font-medium hover:bg-green-600 transition mb-2">
                  📲 WhatsApp
                </a>
              ) : null
            })()}

            <button onClick={handleModalCancel} disabled={modal.cancelling}
              className="w-full bg-red-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition mb-2">
              {modal.cancelling ? 'מבטל...' : 'בטל שיעור'}
            </button>
            {modal.result && <p className="text-red-500 text-xs text-center mb-1">{modal.result}</p>}
            <button onClick={() => setModal(null)} className="w-full text-gray-400 text-sm py-1 hover:text-gray-600">סגור</button>
          </div>
        </div>
      )}

      {/* ── Block edit modal ── */}
      {blockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setBlockModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm" dir="rtl" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-lg text-red-700 mb-1">עריכת חסימה</p>
            <p className="text-gray-500 text-sm mb-4">{format(new Date(`${blockModal.date}T12:00:00`), "EEEE, d בMMMM yyyy", { locale: he })}</p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">שם / סיבה</label>
                <input type="text" value={blockModal.blockNote}
                  onChange={e => setBlockModal(m => m ? { ...m, blockNote: e.target.value } : m)}
                  placeholder="לדוגמא: טסט עם תלמיד"
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-400 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">משעה</label>
                  <input type="time" value={blockModal.startTime}
                    onChange={e => setBlockModal(m => m ? { ...m, startTime: e.target.value } : m)}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-400 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">עד שעה</label>
                  <input type="time" value={blockModal.endTime}
                    onChange={e => setBlockModal(m => m ? { ...m, endTime: e.target.value } : m)}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-400 text-sm" />
                </div>
              </div>
            </div>

            {blockModal.result && <p className="text-red-500 text-xs mb-2">{blockModal.result}</p>}

            <button onClick={handleBlockSave} disabled={blockModal.saving}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition mb-2">
              {blockModal.saving ? 'שומר...' : 'שמור שינויים'}
            </button>
            <button onClick={handleBlockDelete} disabled={blockModal.deleting}
              className="w-full bg-red-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition mb-2">
              {blockModal.deleting ? 'מוחק...' : 'מחק חסימה'}
            </button>
            <button onClick={() => setBlockModal(null)} className="w-full text-gray-400 text-sm py-1 hover:text-gray-600">סגור</button>
          </div>
        </div>
      )}

      {/* ── Bulk shift modal ── */}
      {shiftOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
            <h2 className="text-lg font-bold mb-3">הזזת מספר שיעורים</h2>
            <div className="flex rounded-lg border overflow-hidden mb-2">
              {(['earlier', 'later'] as const).map(d => (
                <button key={d} onClick={() => setShiftDirection(d)}
                  className={`flex-1 py-2 text-sm font-medium transition ${shiftDirection === d ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'}`}>
                  {d === 'earlier' ? '← מוקדם יותר' : 'מאוחר יותר →'}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border overflow-hidden mb-4">
              {([20, 40] as const).map(m => (
                <button key={m} onClick={() => setShiftMinutes(m)}
                  className={`flex-1 py-2 text-sm font-medium transition ${shiftMinutes === m ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'}`}>
                  {m} דקות
                </button>
              ))}
            </div>
            {shiftGroups.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6">אין שיעורים מאושרים מחר ואילך</p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{shiftGroups.length} שיעורים</span>
                  <button onClick={() => setSelectedIds(selectedIds.size === shiftGroups.length ? new Set() : new Set(shiftGroups.map(g => g.ids[0])))}
                    className="text-sm text-blue-600 hover:underline">
                    {selectedIds.size === shiftGroups.length ? 'בטל הכל' : 'בחר הכל'}
                  </button>
                </div>
                <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                  {shiftGroups.map(g => (
                    <label key={g.ids[0]}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${selectedIds.has(g.ids[0]) ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 border-gray-200'}`}>
                      <input type="checkbox" checked={selectedIds.has(g.ids[0])} onChange={() => setSelectedIds(prev => { const n = new Set(prev); n.has(g.ids[0]) ? n.delete(g.ids[0]) : n.add(g.ids[0]); return n })}
                        className="w-4 h-4 accent-orange-500 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{g.studentName}</p>
                        <p className="text-xs text-gray-500">{format(new Date(g.startTime), "EEEE, d בMMMM", { locale: he })} | {format(new Date(g.startTime), 'HH:mm')}–{format(new Date(g.endTime), 'HH:mm')}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}
            {shiftResult && <p className={`text-sm mb-3 ${shiftResult.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{shiftResult}</p>}
            <div className="flex gap-3">
              <button onClick={handleBulkShift} disabled={shifting || selectedIds.size === 0}
                className="flex-1 bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition font-medium">
                {shifting ? 'מזיז...' : `הזז ${selectedIds.size > 0 ? selectedIds.size : ''} שיעורים`}
              </button>
              <button onClick={() => setShiftOpen(false)} className="flex-1 border py-2 rounded-lg hover:bg-gray-50">סגור</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add availability modal ── */}
      {creating && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex rounded-lg border overflow-hidden mb-4">
              <button type="button" onClick={() => { setMode('lesson'); setError('') }}
                className={`flex-1 py-2 text-sm font-medium transition ${mode === 'lesson' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>שיעורי נהיגה</button>
              <button type="button" onClick={() => { setMode('block'); setError(''); setForm(f => ({ ...f, startTime: '17:00', endTime: '18:00' })) }}
                className={`flex-1 py-2 text-sm font-medium transition ${mode === 'block' ? 'bg-red-600 text-white' : 'bg-white text-gray-600'}`}>חסימה</button>
            </div>
            <h2 className="text-lg font-bold mb-4">{mode === 'lesson' ? 'הוספת זמינות' : 'חסימת זמן'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">תאריך</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required
                  min={format(new Date(), 'yyyy-MM-dd')} className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">משעה</label>
                  <input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} required
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">עד שעה</label>
                  <input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} required
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {mode === 'lesson' && calcLessons() > 0 && (
                <p className="text-sm text-blue-600 bg-blue-50 rounded-lg px-3 py-2">יווצרו {calcLessons()} שיעורים של 40 דקות</p>
              )}
              {mode === 'block' && (
                <div>
                  <label className="block text-sm font-medium mb-1">סיבה (אופציונלי)</label>
                  <input type="text" value={form.blockNote} onChange={e => setForm({ ...form, blockNote: e.target.value })}
                    placeholder="לדוגמא: טסט עם תלמיד" className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500" />
                </div>
              )}
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={submitting}
                  className={`flex-1 text-white py-2 rounded-lg transition disabled:opacity-60 ${mode === 'block' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                  {submitting ? '...' : mode === 'lesson' ? 'הוסף' : 'חסום'}
                </button>
                <button type="button" onClick={() => { setCreating(false); setError('') }} className="flex-1 border py-2 rounded-lg hover:bg-gray-50">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
