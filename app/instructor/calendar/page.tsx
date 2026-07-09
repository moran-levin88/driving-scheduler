'use client'
import { useState, useEffect, useRef } from 'react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { he } from 'date-fns/locale'

const HOUR_HEIGHT = 64
const START_HOUR = 7
const END_HOUR = 22
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT

type Lesson = {
  ids: string[]          // all booking IDs in the group
  firstId: string
  studentName: string
  phone: string | null
  startTime: Date
  endTime: Date
  pickupAddress: string | null
  alternativeSlots: string[]  // ISO strings from student
  calendarEventId: string | null
}

type Block = { id: string; startTime: Date; endTime: Date; blockNote: string | null }

type CalendarBooking = {
  id: string
  status: string
  studentId: string
  pickupAddress?: string | null
  notes?: string | null
  calendarEventId?: string | null
  alternativeSlots?: string[] | null
  student: { name: string; phone?: string | null }
  availability: { startTime: string; endTime: string }
}

function groupToLessons(bookings: CalendarBooking[]): Lesson[] {
  const approved = bookings
    .filter(b => b.status === 'APPROVED')
    .sort((a, b) => new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime())

  const lessons: Lesson[] = []
  for (const b of approved) {
    const last = lessons[lessons.length - 1]
    if (
      last &&
      last.studentName === b.student.name &&
      (last.pickupAddress ?? null) === (b.pickupAddress ?? null) &&
      last.endTime.getTime() === new Date(b.availability.startTime).getTime()
    ) {
      last.ids.push(b.id)
      last.endTime = new Date(b.availability.endTime)
    } else {
      lessons.push({
        ids: [b.id],
        firstId: b.id,
        studentName: b.student.name,
        phone: b.student.phone ?? null,
        startTime: new Date(b.availability.startTime),
        endTime: new Date(b.availability.endTime),
        pickupAddress: b.pickupAddress ?? null,
        alternativeSlots: Array.isArray(b.alternativeSlots) ? b.alternativeSlots : [],
        calendarEventId: b.calendarEventId ?? null,
      })
    }
  }
  return lessons
}

function getTop(time: Date): number {
  const h = time.getHours(); const m = time.getMinutes()
  return Math.max(0, ((h - START_HOUR) * 60 + m) / 60 * HOUR_HEIGHT)
}
function getHeight(start: Date, end: Date): number {
  return Math.max(20, (end.getTime() - start.getTime()) / 1000 / 60 / 60 * HOUR_HEIGHT)
}

type ActionModal = {
  lesson: Lesson
  targetDate: string
  targetTime: string
  shifting: boolean
  result: string
  shiftedInfo: { newStart: Date; newEnd: Date } | null
  confirmCancel: boolean
  cancelling: boolean
}

type SwapModal = {
  lessonA: Lesson
  lessonB: Lesson
  swapping: boolean
  result: string
}

type Student = { id: string; name: string; phone: string | null }

type ReassignModal = {
  lesson: Lesson
  students: Student[]
  selectedId: string
  search: string
  reassigning: boolean
  result: string
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [actionModal, setActionModal] = useState<ActionModal | null>(null)
  const [swapSource, setSwapSource] = useState<Lesson | null>(null)
  const [swapModal, setSwapModal] = useState<SwapModal | null>(null)
  const [reassignModal, setReassignModal] = useState<ReassignModal | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/bookings').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setLessons(groupToLessons(data))
    })
    fetch('/api/availability').then(r => r.json()).then((data: any[]) => {
      if (Array.isArray(data)) {
        setBlocks(data.filter(s => s.isBlocked).map(s => ({
          id: s.id,
          startTime: new Date(s.startTime),
          endTime: new Date(s.endTime),
          blockNote: s.blockNote ?? null,
        })))
      }
    })
  }, [])

  async function openReassign(lesson: Lesson) {
    setActionModal(null)
    setReassignModal({ lesson, students: [], selectedId: '', search: '', reassigning: false, result: '' })
    const res = await fetch('/api/students')
    if (res.ok) {
      const data = await res.json()
      setReassignModal(m => m ? {
        ...m,
        students: data.map((s: any) => ({ id: s.id, name: s.name, phone: s.phone ?? null })),
      } : m)
    }
  }

  async function handleReassign() {
    if (!reassignModal || !reassignModal.selectedId) return
    setReassignModal(m => m ? { ...m, reassigning: true, result: '' } : m)
    try {
      const res = await fetch('/api/bookings/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingIds: reassignModal.lesson.ids, newStudentId: reassignModal.selectedId }),
      })
      if (res.ok) {
        setReassignModal(null)
        fetch('/api/bookings').then(r => r.json()).then(data => {
          if (Array.isArray(data)) setLessons(groupToLessons(data))
        })
      } else {
        let errMsg = 'שגיאה'
        try { const d = await res.json(); errMsg = d.error || errMsg } catch {}
        setReassignModal(m => m ? { ...m, reassigning: false, result: errMsg } : m)
      }
    } catch {
      setReassignModal(m => m ? { ...m, reassigning: false, result: 'שגיאת רשת — נסה שוב' } : m)
    }
  }

  function handleLessonClick(lesson: Lesson) {
    if (swapSource) {
      if (swapSource.firstId === lesson.firstId) {
        setSwapSource(null) // clicked same lesson — cancel swap mode
      } else {
        setSwapModal({ lessonA: swapSource, lessonB: lesson, swapping: false, result: '' })
        setSwapSource(null)
      }
      return
    }
    openAction(lesson)
  }

  async function handleSwap() {
    if (!swapModal) return
    setSwapModal(m => m ? { ...m, swapping: true, result: '' } : m)
    try {
      const res = await fetch('/api/bookings/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idsA: swapModal.lessonA.ids, idsB: swapModal.lessonB.ids }),
      })
      if (res.ok) {
        setSwapModal(null)
        fetch('/api/bookings').then(r => r.json()).then(data => {
          if (Array.isArray(data)) setLessons(groupToLessons(data))
        })
      } else {
        let errMsg = 'שגיאה'
        try { const d = await res.json(); errMsg = d.error || errMsg } catch {}
        setSwapModal(m => m ? { ...m, swapping: false, result: errMsg } : m)
      }
    } catch {
      setSwapModal(m => m ? { ...m, swapping: false, result: 'שגיאת רשת — נסה שוב' } : m)
    }
  }

  function openAction(lesson: Lesson) {
    setActionModal({
      lesson,
      targetDate: format(lesson.startTime, 'yyyy-MM-dd'),
      targetTime: format(lesson.startTime, 'HH:mm'),
      shifting: false,
      result: '',
      shiftedInfo: null,
      confirmCancel: false,
      cancelling: false,
    })
  }

  async function handleCancel() {
    if (!actionModal) return
    setActionModal(m => m ? { ...m, cancelling: true } : m)
    try {
      const res = await fetch(`/api/bookings/${actionModal.lesson.firstId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
      if (res.ok) {
        setLessons(prev => prev.filter(l => l.firstId !== actionModal.lesson.firstId))
        setActionModal(null)
      } else {
        let errMsg = `שגיאה (${res.status})`
        try { const d = await res.json(); errMsg = d.error || errMsg } catch {}
        setActionModal(m => m ? { ...m, cancelling: false, confirmCancel: false, result: errMsg } : m)
      }
    } catch {
      setActionModal(m => m ? { ...m, cancelling: false, confirmCancel: false, result: 'שגיאת רשת — נסה שוב' } : m)
    }
  }

  async function handleShift() {
    if (!actionModal) return
    setActionModal(m => m ? { ...m, shifting: true, result: '' } : m)
    try {
      const targetStartTimeIso = new Date(`${actionModal.targetDate}T${actionModal.targetTime}:00`).toISOString()
      const res = await fetch('/api/bookings/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingIds: actionModal.lesson.ids, targetStartTimeIso }),
      })
      if (res.ok) {
        const newStart = new Date(`${actionModal.targetDate}T${actionModal.targetTime}:00`)
        const duration = actionModal.lesson.endTime.getTime() - actionModal.lesson.startTime.getTime()
        setActionModal(m => m ? { ...m, shifting: false, shiftedInfo: { newStart, newEnd: new Date(newStart.getTime() + duration) } } : m)
        fetch('/api/bookings').then(r => r.json()).then(data => {
          if (Array.isArray(data)) setLessons(groupToLessons(data))
        })
      } else {
        let errMsg = `שגיאה (${res.status})`
        try { const d = await res.json(); errMsg = d.error || errMsg } catch {}
        setActionModal(m => m ? { ...m, shifting: false, result: errMsg } : m)
      }
    } catch {
      setActionModal(m => m ? { ...m, shifting: false, result: 'שגיאת רשת — נסה שוב' } : m)
    }
  }

  const days = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i))
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const now = new Date()
  const isCurrentWeek = days.some(d => isSameDay(d, now))
  const nowTop = isCurrentWeek ? getTop(now) : null

  return (
    <div>
      {swapSource && (
        <div className="mb-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3" dir="rtl">
          <p className="text-sm font-medium text-amber-800">
            ⇄ {swapSource.studentName} נבחר — לחץ על שיעור אחר להחלפה
          </p>
          <button onClick={() => setSwapSource(null)} className="text-xs text-amber-600 hover:text-amber-800 shrink-0">ביטול</button>
        </div>
      )}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">קלנדר</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(subWeeks(weekStart, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg border text-gray-600">→</button>
          <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-700">היום</button>
          <button onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg border text-gray-600">←</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {/* Day headers */}
        <div className="flex border-b sticky top-0 bg-white z-20">
          <div className="w-12 shrink-0 border-l" />
          {days.map(day => {
            const isToday = isSameDay(day, now)
            return (
              <div key={day.toISOString()} className="flex-1 text-center py-2 border-l last:border-l-0 min-w-0">
                <div className="text-xs text-gray-500">{format(day, 'EEE', { locale: he })}</div>
                <div className={`text-base font-bold mx-auto w-8 h-8 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-gray-800'}`}>
                  {format(day, 'd')}
                </div>
              </div>
            )
          })}
        </div>

        {/* Scrollable grid */}
        <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: '75vh' }}>
          <div className="flex relative" style={{ height: `${TOTAL_HEIGHT}px` }}>
            {/* Hour labels */}
            <div className="w-12 shrink-0 border-l relative">
              {hours.map(h => (
                <div key={h} style={{ position: 'absolute', top: `${(h - START_HOUR) * HOUR_HEIGHT - 9}px`, right: 0, left: 0 }}
                  className="text-right pr-1">
                  <span className="text-xs text-gray-400">{h}:00</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map(day => {
              const dayLessons = lessons.filter(l => isSameDay(l.startTime, day))
              const dayBlocks  = blocks.filter(b => isSameDay(b.startTime, day))
              return (
                <div key={day.toISOString()} className="flex-1 relative border-l last:border-l-0 min-w-0">
                  {hours.map(h => (
                    <div key={h} style={{ position: 'absolute', top: `${(h - START_HOUR) * HOUR_HEIGHT}px`, left: 0, right: 0 }}
                      className={`border-t ${h % 2 === 0 ? 'border-gray-200' : 'border-gray-100'}`} />
                  ))}

                  {nowTop !== null && isSameDay(day, now) && (
                    <div style={{ position: 'absolute', top: `${nowTop}px`, left: 0, right: 0, zIndex: 10 }}
                      className="border-t-2 border-red-500">
                      <div className="w-2 h-2 bg-red-500 rounded-full -mt-1 -mr-0.5 absolute right-0" />
                    </div>
                  )}

                  {/* Blocks — red */}
                  {dayBlocks.map(block => (
                    <div key={block.id}
                      style={{ position: 'absolute', top: `${getTop(block.startTime)}px`, height: `${getHeight(block.startTime, block.endTime)}px`, left: '2px', right: '2px', zIndex: 4 }}
                      className="bg-red-500 text-white rounded-lg px-1.5 py-1 overflow-hidden opacity-80 select-none">
                      <p className="text-xs font-semibold truncate">{block.blockNote || 'חסום'}</p>
                      {getHeight(block.startTime, block.endTime) >= 36 && (
                        <p className="text-xs opacity-90">{format(block.startTime, 'HH:mm')}–{format(block.endTime, 'HH:mm')}</p>
                      )}
                    </div>
                  ))}

                  {/* Lessons — clickable */}
                  {dayLessons.map(lesson => {
                    const top = getTop(lesson.startTime)
                    const height = getHeight(lesson.startTime, lesson.endTime)
                    const isSwapSource = swapSource?.firstId === lesson.firstId
                    const isSwapTarget = !!swapSource && !isSwapSource
                    return (
                      <div key={lesson.firstId}
                        style={{ position: 'absolute', top: `${top}px`, height: `${height}px`, left: '2px', right: '2px', zIndex: 5 }}
                        onClick={() => handleLessonClick(lesson)}
                        className={`rounded-lg px-0.5 cursor-pointer overflow-hidden select-none transition text-white flex items-center justify-center
                          ${isSwapSource ? 'bg-amber-500 ring-2 ring-amber-300 ring-offset-1 animate-pulse' : ''}
                          ${isSwapTarget ? 'bg-blue-500 hover:bg-blue-600' : ''}
                          ${!isSwapSource && !isSwapTarget ? 'bg-green-500 hover:bg-green-600' : ''}`}>
                        <p className={`font-bold leading-tight text-center break-words ${height >= 44 ? 'text-sm line-clamp-2' : 'text-xs line-clamp-1'}`}>
                          {isSwapSource && '⇄ '}{lesson.studentName}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Action modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setActionModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-lg">{actionModal.lesson.studentName}</p>
            <p className="text-gray-500 text-sm">
              {format(actionModal.lesson.startTime, "EEEE, d בMMMM", { locale: he })} | {format(actionModal.lesson.startTime, 'HH:mm')}–{format(actionModal.lesson.endTime, 'HH:mm')}
            </p>
            {actionModal.lesson.pickupAddress && (
              <p className="text-sm text-gray-700 mt-1 mb-4">📍 {actionModal.lesson.pickupAddress}</p>
            )}
            {!actionModal.lesson.pickupAddress && <div className="mb-4" />}

            {/* Shifted success */}
            {actionModal.shiftedInfo && (() => {
              const { newStart, newEnd } = actionModal.shiftedInfo
              const dateStr = format(newStart, "EEEE, d בMMMM", { locale: he })
              const timeStr = `${format(newStart, 'HH:mm')}–${format(newEnd, 'HH:mm')}`
              const phone = actionModal.lesson.phone?.replace(/\D/g, '').replace(/^0/, '972')
              const waText = `שלום ${actionModal.lesson.studentName}! שיעור הנהיגה שלך הוזז: ${dateStr} בשעה ${timeStr}. בהצלחה! 🚗`
              return (
                <div className="bg-green-50 rounded-xl p-4 mb-3 text-center">
                  <p className="font-semibold text-green-800 mb-0.5">✓ השיעור הוזז!</p>
                  <p className="text-sm text-gray-600 mb-3">{dateStr} | {timeStr}</p>
                  {phone ? (
                    <a href={`https://wa.me/${phone}?text=${encodeURIComponent(waText)}`}
                      target="_blank" rel="noreferrer"
                      className="block w-full bg-green-500 text-white py-2.5 rounded-xl font-medium hover:bg-green-600 transition mb-2">
                      📲 שלח עדכון WhatsApp לתלמיד
                    </a>
                  ) : (
                    <p className="text-xs text-gray-400 mb-2">אין מספר טלפון לתלמיד</p>
                  )}
                  <button onClick={() => setActionModal(null)} className="w-full border py-2 rounded-lg text-sm hover:bg-gray-50">סגור</button>
                </div>
              )
            })()}

            {/* Shift */}
            <div className="bg-orange-50 rounded-xl p-3 mb-3">
              <p className="text-sm font-semibold text-orange-800 mb-2">
                הזזת שיעור
                <span className="text-xs font-normal text-orange-600 mr-2">
                  ({Math.round((actionModal.lesson.endTime.getTime() - actionModal.lesson.startTime.getTime()) / 60000)} דק׳)
                </span>
              </p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">תאריך</label>
                  <input type="date" value={actionModal.targetDate}
                    onChange={e => setActionModal(m => m ? { ...m, targetDate: e.target.value } : m)}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">שעת התחלה</label>
                  <input type="time" value={actionModal.targetTime}
                    onChange={e => setActionModal(m => m ? { ...m, targetTime: e.target.value } : m)}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
              {actionModal.result && <p className="text-red-500 text-xs mb-2">{actionModal.result}</p>}
              <button onClick={handleShift} disabled={actionModal.shifting}
                className="w-full bg-orange-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition">
                {actionModal.shifting ? 'מזיז...' : `הזז ל-${actionModal.targetTime} ב-${actionModal.targetDate.slice(8)}.${actionModal.targetDate.slice(5,7)}`}
              </button>
            </div>

            {/* Alternative slots */}
            {actionModal.lesson.alternativeSlots.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                <p className="text-xs font-semibold text-amber-800 mb-2">🔄 מועדים חלופיים שהתלמיד הציע</p>
                <div className="space-y-1.5">
                  {actionModal.lesson.alternativeSlots.map((alt, i) => {
                    const d = new Date(alt)
                    return (
                      <button key={i} type="button"
                        onClick={() => setActionModal(m => m ? { ...m, targetDate: format(d, 'yyyy-MM-dd'), targetTime: format(d, 'HH:mm') } : m)}
                        className="w-full text-right text-sm px-3 py-1.5 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 transition">
                        {format(d, "EEEE, d בMMMM", { locale: he })} | {format(d, 'HH:mm')}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-amber-600 mt-1.5">לחץ על מועד להעברתו לשדה ההזזה</p>
              </div>
            )}

            {/* WhatsApp */}
            {actionModal.lesson.phone && (() => {
              const phone = actionModal.lesson.phone!.replace(/\D/g, '').replace(/^0/, '972')
              const text = `שלום ${actionModal.lesson.studentName}, תזכורת: יש לך שיעור נהיגה ב${format(actionModal.lesson.startTime, "EEEE, d בMMMM", { locale: he })} בשעה ${format(actionModal.lesson.startTime, 'HH:mm')}–${format(actionModal.lesson.endTime, 'HH:mm')}. בהצלחה! 🚗`
              return (
                <a href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"
                  className="block w-full bg-green-500 text-white text-center py-2 rounded-lg text-sm font-medium hover:bg-green-600 transition mb-2">
                  📲 שלח תזכורת WhatsApp
                </a>
              )
            })()}

            {/* Cancel lesson */}
            {!actionModal.shiftedInfo && (
              actionModal.confirmCancel ? (
                <div className="border border-red-200 rounded-xl p-3 mb-2 text-center">
                  <p className="text-sm font-semibold text-red-700 mb-2">לבטל את השיעור של {actionModal.lesson.studentName}?</p>
                  <div className="flex gap-2">
                    <button onClick={handleCancel} disabled={actionModal.cancelling}
                      className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition">
                      {actionModal.cancelling ? 'מבטל...' : 'כן, בטל שיעור'}
                    </button>
                    <button type="button" onClick={() => setActionModal(m => m ? { ...m, confirmCancel: false } : m)}
                      className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50">
                      חזור
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setActionModal(m => m ? { ...m, confirmCancel: true } : m)}
                  className="w-full text-red-400 text-sm py-1.5 hover:text-red-600 mb-1">
                  ביטול שיעור
                </button>
              )
            )}

            {/* Swap / Reassign */}
            {!actionModal.shiftedInfo && (
              <div className="flex gap-2 mb-1">
                <button type="button"
                  onClick={() => { setSwapSource(actionModal!.lesson); setActionModal(null) }}
                  className="flex-1 text-blue-500 text-sm py-1.5 hover:text-blue-700 border border-blue-200 rounded-lg">
                  ⇄ החלף שיעורים
                </button>
                <button type="button"
                  onClick={() => openReassign(actionModal!.lesson)}
                  className="flex-1 text-purple-600 text-sm py-1.5 hover:text-purple-800 border border-purple-200 rounded-lg">
                  👤 שנה תלמיד
                </button>
              </div>
            )}

            <button onClick={() => setActionModal(null)} className="w-full text-gray-400 text-sm py-1 hover:text-gray-600">סגור</button>
          </div>
        </div>
      )}

      {/* Reassign student modal */}
      {reassignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setReassignModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[85vh] flex flex-col" dir="rtl" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-lg mb-0.5">שינוי תלמיד</p>
            <p className="text-sm text-gray-500 mb-3">
              {reassignModal.lesson.studentName} — {format(reassignModal.lesson.startTime, "d/M", { locale: he })} {format(reassignModal.lesson.startTime, 'HH:mm')}–{format(reassignModal.lesson.endTime, 'HH:mm')}
            </p>

            <input
              type="text"
              placeholder="חיפוש תלמיד..."
              value={reassignModal.search}
              onChange={e => setReassignModal(m => m ? { ...m, search: e.target.value, selectedId: '' } : m)}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-2 focus:ring-2 focus:ring-purple-400"
            />

            <div className="flex-1 overflow-y-auto space-y-1 mb-3 min-h-0">
              {reassignModal.students.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">טוען תלמידים...</p>
              )}
              {reassignModal.students
                .filter(s => s.id !== reassignModal.lesson.firstId && s.name.includes(reassignModal.search))
                .map(s => (
                  <button key={s.id} type="button"
                    onClick={() => setReassignModal(m => m ? { ...m, selectedId: s.id } : m)}
                    className={`w-full text-right px-3 py-2 rounded-lg text-sm transition ${
                      reassignModal.selectedId === s.id
                        ? 'bg-purple-100 border border-purple-400 font-medium'
                        : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
                    }`}>
                    {s.name}
                    {s.phone && <span className="text-gray-400 text-xs mr-2">{s.phone}</span>}
                  </button>
                ))}
            </div>

            {reassignModal.result && <p className="text-red-500 text-sm mb-2 text-center">{reassignModal.result}</p>}

            {reassignModal.selectedId && (() => {
              const sel = reassignModal.students.find(s => s.id === reassignModal.selectedId)
              return (
                <div className="bg-purple-50 rounded-xl p-3 mb-3 text-sm text-right">
                  <span className="text-purple-700 font-medium">העברה מ-{reassignModal.lesson.studentName} ← {sel?.name}</span>
                  <p className="text-xs text-gray-500 mt-0.5">מייל ביטול לתלמיד הנוכחי + מייל אישור לתלמיד החדש</p>
                </div>
              )
            })()}

            <div className="flex gap-2">
              <button onClick={handleReassign}
                disabled={!reassignModal.selectedId || reassignModal.reassigning}
                className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-medium hover:bg-purple-700 disabled:opacity-40 transition">
                {reassignModal.reassigning ? 'מעביר...' : 'אישור שינוי'}
              </button>
              <button onClick={() => setReassignModal(null)}
                className="flex-1 border py-2.5 rounded-xl text-sm hover:bg-gray-50">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swap confirmation modal */}
      {swapModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setSwapModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm" dir="rtl" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-lg mb-1">החלפת שיעורים</p>
            <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-2 text-sm">
              <div>
                <span className="font-medium text-green-700">{swapModal.lessonA.studentName}</span>
                <span className="text-gray-500 mr-1">{format(swapModal.lessonA.startTime, "d/M", { locale: he })} {format(swapModal.lessonA.startTime, 'HH:mm')}–{format(swapModal.lessonA.endTime, 'HH:mm')}</span>
              </div>
              <div className="text-center text-gray-400 text-lg">⇄</div>
              <div>
                <span className="font-medium text-blue-700">{swapModal.lessonB.studentName}</span>
                <span className="text-gray-500 mr-1">{format(swapModal.lessonB.startTime, "d/M", { locale: he })} {format(swapModal.lessonB.startTime, 'HH:mm')}–{format(swapModal.lessonB.endTime, 'HH:mm')}</span>
              </div>
            </div>
            {swapModal.result && <p className="text-red-500 text-sm mb-2 text-center">{swapModal.result}</p>}
            <div className="flex gap-2">
              <button onClick={handleSwap} disabled={swapModal.swapping}
                className="flex-1 bg-blue-500 text-white py-2.5 rounded-xl font-medium hover:bg-blue-600 disabled:opacity-50 transition">
                {swapModal.swapping ? 'מחליף...' : 'אישור החלפה'}
              </button>
              <button onClick={() => setSwapModal(null)}
                className="flex-1 border py-2.5 rounded-xl text-sm hover:bg-gray-50">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
