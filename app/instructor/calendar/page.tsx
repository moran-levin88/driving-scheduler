'use client'
import { useState, useEffect, useRef } from 'react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { he } from 'date-fns/locale'
import StudentPaymentsPanel from '../students/[studentId]/StudentPaymentsPanel'
import BankTransferModal from '@/components/BankTransferModal'
import ReferenceModal from '@/components/ReferenceModal'

type PaymentsPanelData = {
  student: { id: string; name: string; email: string; phone: string | null; pricePer20Min: number | null }
  balance: number
  payableLessons: { firstBookingId: string; startTime: string; endTime: string; paidSoFar: number }[]
  pendingCharges: { id: string; label: string; startTime: string; amount: number }[]
  invoices: {
    id: string; amount: number; method: string; reference: string | null
    paidAt: string; isDeposit: boolean; description: string | null
    invoiceId: string | null; invoiceUrl: string | null
    lessonCount: number
  }[]
}

const HOUR_HEIGHT = 64
const START_HOUR = 7
const END_HOUR = 22
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT

type Lesson = {
  ids: string[]          // all booking IDs in the group
  firstId: string
  studentId: string
  studentName: string
  phone: string | null
  pricePer20Min: number | null
  startTime: Date
  endTime: Date
  pickupAddress: string | null
  alternativeSlots: string[]  // ISO strings from student
  calendarEventId: string | null
  paidSoFar: number // sum of this lesson's Payment amounts — payment itself is managed on the student's page
}

type Block = { id: string; startTime: Date; endTime: Date; blockNote: string | null }

type ChargeType = 'PRACTICAL_TEST' | 'INTERNAL_TEST'
const CHARGE_TYPE_LABELS: Record<ChargeType, string> = { PRACTICAL_TEST: 'מבחן מעשי', INTERNAL_TEST: 'טסט פנימי' }
const CHARGE_TYPE_DEFAULT_AMOUNT: Record<ChargeType, number> = { PRACTICAL_TEST: 230, INTERNAL_TEST: 200 }
const DURATION_OPTIONS = [40, 60, 80, 100, 120] as const
const PRACTICAL_TEST_DURATION_OPTIONS = [20, 40] as const

type ChargeItem = {
  id: string
  type: ChargeType
  studentId: string
  studentName: string
  phone: string | null
  startTime: Date
  endTime: Date
  amount: number
  invoiceUrl: string | null
  paid: boolean
  passed: boolean | null
}

type CalendarBooking = {
  id: string
  status: string
  studentId: string
  pickupAddress?: string | null
  notes?: string | null
  calendarEventId?: string | null
  alternativeSlots?: string[] | null
  student: { name: string; phone?: string | null; pricePer20Min?: number | null }
  availability: { startTime: string; endTime: string }
  payments?: { amount: number }[]
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
        studentId: b.studentId,
        studentName: b.student.name,
        phone: b.student.phone ?? null,
        pricePer20Min: b.student.pricePer20Min ?? null,
        startTime: new Date(b.availability.startTime),
        endTime: new Date(b.availability.endTime),
        pickupAddress: b.pickupAddress ?? null,
        alternativeSlots: Array.isArray(b.alternativeSlots) ? b.alternativeSlots : [],
        calendarEventId: b.calendarEventId ?? null,
        paidSoFar: (b.payments ?? []).reduce((sum, p) => sum + p.amount, 0),
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
  syncingCalendar: boolean
  syncResult: string
  changingDuration: boolean
  durationResult: string
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

type NewEventStep = 'choose' | 'test' | 'lesson'
type NewEventModal = {
  date: string
  time: string
  step: NewEventStep
  chargeType: ChargeType
  minutes: number
  amount: string
  studentId: string
  studentSearch: string
  students: Student[]
  paidNow: boolean
  method: 'CASH' | 'BIT' | 'PAYBOX' | 'BANK_TRANSFER'
  reference: string
  pickupAddress: string
  notes: string
  submitting: boolean
  error: string
}

type ChargeModal = {
  charge: ChargeItem
  method: 'CASH' | 'BIT' | 'PAYBOX' | 'BANK_TRANSFER'
  reference: string
  paying: boolean
  deleting: boolean
  marking: boolean
  result: string
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [charges, setCharges] = useState<ChargeItem[]>([])
  const [actionModal, setActionModal] = useState<ActionModal | null>(null)
  const [swapSource, setSwapSource] = useState<Lesson | null>(null)
  const [swapModal, setSwapModal] = useState<SwapModal | null>(null)
  const [reassignModal, setReassignModal] = useState<ReassignModal | null>(null)
  const [paymentsModal, setPaymentsModal] = useState<{ studentId: string; data: PaymentsPanelData | null; error: string } | null>(null)
  const [newEventModal, setNewEventModal] = useState<NewEventModal | null>(null)
  const [chargeModal, setChargeModal] = useState<ChargeModal | null>(null)
  const [pendingMethod, setPendingMethod] = useState<{ form: 'newEvent' | 'chargeModal'; method: 'BANK_TRANSFER' | 'BIT' | 'PAYBOX' } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  function refreshBookings() {
    fetch('/api/bookings').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setLessons(groupToLessons(data))
    })
  }

  function refreshCharges() {
    fetch('/api/charges').then(r => r.json()).then((data: any[]) => {
      if (Array.isArray(data)) {
        setCharges(data.map(c => ({
          id: c.id,
          type: c.type,
          studentId: c.studentId,
          studentName: c.student.name,
          phone: c.student.phone ?? null,
          startTime: new Date(c.startTime),
          endTime: new Date(c.endTime),
          amount: c.amount,
          invoiceUrl: c.invoice?.invoiceUrl ?? null,
          paid: !!c.invoice,
          passed: c.passed ?? null,
        })))
      }
    })
  }

  async function openPaymentsModal(studentId: string) {
    setActionModal(null)
    setPaymentsModal({ studentId, data: null, error: '' })
    try {
      const res = await fetch(`/api/students/${studentId}/payments-panel`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setPaymentsModal({ studentId, data, error: '' })
      } else {
        setPaymentsModal({ studentId, data: null, error: data.error || 'שגיאה בטעינה' })
      }
    } catch {
      setPaymentsModal({ studentId, data: null, error: 'שגיאת רשת — נסה שוב' })
    }
  }

  function closePaymentsModal() {
    setPaymentsModal(null)
    refreshBookings() // payment status may have changed — refresh the ₪ badges
  }

  useEffect(() => {
    refreshBookings()
    refreshCharges()
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

  async function openNewEvent(start: Date) {
    setNewEventModal({
      date: format(start, 'yyyy-MM-dd'),
      time: format(start, 'HH:mm'),
      step: 'choose',
      chargeType: 'PRACTICAL_TEST',
      minutes: 40,
      amount: String(CHARGE_TYPE_DEFAULT_AMOUNT.PRACTICAL_TEST),
      studentId: '',
      studentSearch: '',
      students: [],
      paidNow: false,
      method: 'CASH',
      reference: '',
      pickupAddress: '',
      notes: '',
      submitting: false,
      error: '',
    })
    const res = await fetch('/api/students')
    if (res.ok) {
      const data = await res.json()
      setNewEventModal(m => m ? { ...m, students: data.map((s: any) => ({ id: s.id, name: s.name, phone: s.phone ?? null })) } : m)
    }
  }

  function handleGridClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    if (swapSource) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const totalMinutes = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60
    const snapped = Math.max(START_HOUR * 60, Math.floor(totalMinutes / 20) * 20)
    const start = new Date(day)
    start.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0)
    openNewEvent(start)
  }

  function chooseEventType(step: NewEventStep, chargeType?: ChargeType) {
    setNewEventModal(m => {
      if (!m) return m
      return {
        ...m,
        step,
        chargeType: chargeType ?? m.chargeType,
        amount: chargeType ? String(CHARGE_TYPE_DEFAULT_AMOUNT[chargeType]) : m.amount,
        minutes: 40, // reset — the valid duration choices differ per type (test vs. lesson)
      }
    })
  }

  async function handleCreateTest() {
    if (!newEventModal) return
    if (!newEventModal.studentId) {
      setNewEventModal(m => m ? { ...m, error: 'יש לבחור תלמיד' } : m)
      return
    }
    const amount = Number(newEventModal.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setNewEventModal(m => m ? { ...m, error: 'סכום לא תקין' } : m)
      return
    }
    setNewEventModal(m => m ? { ...m, submitting: true, error: '' } : m)
    try {
      const startTime = new Date(`${newEventModal.date}T${newEventModal.time}:00`).toISOString()
      const res = await fetch('/api/charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: newEventModal.studentId, type: newEventModal.chargeType,
          startTime, minutes: newEventModal.minutes, amount,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNewEventModal(m => m ? { ...m, submitting: false, error: data.error || 'שגיאה' } : m)
        return
      }
      if (newEventModal.paidNow) {
        await fetch(`/api/students/${newEventModal.studentId}/charge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: CHARGE_TYPE_LABELS[newEventModal.chargeType], amount,
            method: newEventModal.method, reference: newEventModal.reference,
            paidAt: new Date().toISOString(), chargeId: data.id,
          }),
        }).catch(() => {})
      }
      setNewEventModal(null)
      refreshCharges()
    } catch {
      setNewEventModal(m => m ? { ...m, submitting: false, error: 'שגיאת רשת — נסה שוב' } : m)
    }
  }

  async function handleCreateLesson() {
    if (!newEventModal) return
    if (!newEventModal.studentId) {
      setNewEventModal(m => m ? { ...m, error: 'יש לבחור תלמיד' } : m)
      return
    }
    setNewEventModal(m => m ? { ...m, submitting: true, error: '' } : m)
    try {
      const startTime = new Date(`${newEventModal.date}T${newEventModal.time}:00`).toISOString()
      const res = await fetch('/api/instructor/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: newEventModal.studentId, startTime, minutes: newEventModal.minutes,
          pickupAddress: newEventModal.pickupAddress, notes: newEventModal.notes,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNewEventModal(m => m ? { ...m, submitting: false, error: data.error || 'שגיאה' } : m)
        return
      }
      setNewEventModal(null)
      refreshBookings()
    } catch {
      setNewEventModal(m => m ? { ...m, submitting: false, error: 'שגיאת רשת — נסה שוב' } : m)
    }
  }

  function openChargeModal(charge: ChargeItem) {
    setChargeModal({ charge, method: 'CASH', reference: '', paying: false, deleting: false, marking: false, result: '' })
  }

  async function handleMarkPassed(passed: boolean) {
    if (!chargeModal) return
    if (passed && !confirm(`לסמן ש${chargeModal.charge.studentName} עבר/ה את המבחן המעשי? התלמיד/ה יועבר/תועבר לתלמידים לא פעילים ולא יוכל/תוכל לקבוע שיעורים נוספים.`)) return
    setChargeModal(m => m ? { ...m, marking: true, result: '' } : m)
    try {
      const res = await fetch(`/api/charges/${chargeModal.charge.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passed }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setChargeModal(null)
        refreshCharges()
        if (data.archived) refreshBookings()
      } else {
        setChargeModal(m => m ? { ...m, marking: false, result: data.error || 'שגיאה' } : m)
      }
    } catch {
      setChargeModal(m => m ? { ...m, marking: false, result: 'שגיאת רשת — נסה שוב' } : m)
    }
  }

  async function handlePayCharge() {
    if (!chargeModal) return
    setChargeModal(m => m ? { ...m, paying: true, result: '' } : m)
    try {
      const res = await fetch(`/api/students/${chargeModal.charge.studentId}/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: CHARGE_TYPE_LABELS[chargeModal.charge.type], amount: chargeModal.charge.amount,
          method: chargeModal.method, reference: chargeModal.reference,
          paidAt: new Date().toISOString(), chargeId: chargeModal.charge.id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok || res.status === 207) {
        setChargeModal(null)
        refreshCharges()
      } else {
        setChargeModal(m => m ? { ...m, paying: false, result: data.error || 'שגיאה' } : m)
      }
    } catch {
      setChargeModal(m => m ? { ...m, paying: false, result: 'שגיאת רשת — נסה שוב' } : m)
    }
  }

  async function handleDeleteCharge() {
    if (!chargeModal) return
    setChargeModal(m => m ? { ...m, deleting: true, result: '' } : m)
    try {
      const res = await fetch(`/api/charges/${chargeModal.charge.id}`, { method: 'DELETE' })
      if (res.ok) {
        setChargeModal(null)
        refreshCharges()
      } else {
        const data = await res.json().catch(() => ({}))
        setChargeModal(m => m ? { ...m, deleting: false, result: data.error || 'שגיאה' } : m)
      }
    } catch {
      setChargeModal(m => m ? { ...m, deleting: false, result: 'שגיאת רשת — נסה שוב' } : m)
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
      syncingCalendar: false,
      syncResult: '',
      changingDuration: false,
      durationResult: '',
    })
  }

  async function handleChangeDuration(minutes: number) {
    if (!actionModal) return
    setActionModal(m => m ? { ...m, changingDuration: true, durationResult: '' } : m)
    try {
      const res = await fetch(`/api/bookings/${actionModal.lesson.firstId}/duration`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setActionModal(null)
        fetch('/api/bookings').then(r => r.json()).then(d => {
          if (Array.isArray(d)) setLessons(groupToLessons(d))
        })
      } else {
        setActionModal(m => m ? { ...m, changingDuration: false, durationResult: data.error || 'שגיאה' } : m)
      }
    } catch {
      setActionModal(m => m ? { ...m, changingDuration: false, durationResult: 'שגיאת רשת — נסה שוב' } : m)
    }
  }

  async function handleSyncCalendar() {
    if (!actionModal) return
    setActionModal(m => m ? { ...m, syncingCalendar: true, syncResult: '' } : m)
    try {
      const res = await fetch(`/api/bookings/${actionModal.lesson.firstId}/sync-calendar`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setLessons(prev => prev.map(l => l.firstId === actionModal.lesson.firstId ? { ...l, calendarEventId: 'synced' } : l))
        setActionModal(m => m ? { ...m, syncingCalendar: false, syncResult: '✓ נוסף ליומן Google', lesson: { ...m.lesson, calendarEventId: 'synced' } } : m)
      } else {
        setActionModal(m => m ? { ...m, syncingCalendar: false, syncResult: data.error || 'שגיאה בסנכרון' } : m)
      }
    } catch {
      setActionModal(m => m ? { ...m, syncingCalendar: false, syncResult: 'שגיאת רשת — נסה שוב' } : m)
    }
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
              const dayCharges = charges.filter(c => isSameDay(c.startTime, day))
              return (
                <div key={day.toISOString()} className="flex-1 relative border-l last:border-l-0 min-w-0 cursor-pointer"
                  onClick={e => handleGridClick(day, e)}>
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

                  {/* Blocks — red. Not given their own onClick, so a click here
                      bubbles up to the day column and can still open the new-
                      event modal — backdating into a once-blocked slot is allowed. */}
                  {dayBlocks.map(block => (
                    <div key={block.id}
                      style={{ position: 'absolute', top: `${getTop(block.startTime)}px`, height: `${getHeight(block.startTime, block.endTime)}px`, left: '2px', right: '2px', zIndex: 4 }}
                      className="bg-red-500 text-white rounded-lg px-1.5 py-1 overflow-hidden opacity-80 select-none cursor-pointer">
                      <p className="text-xs font-semibold truncate">{block.blockNote || 'חסום'}</p>
                      {getHeight(block.startTime, block.endTime) >= 36 && (
                        <p className="text-xs opacity-90">{format(block.startTime, 'HH:mm')}–{format(block.endTime, 'HH:mm')}</p>
                      )}
                    </div>
                  ))}

                  {/* Charges — practical/internal tests */}
                  {dayCharges.map(charge => {
                    const top = getTop(charge.startTime)
                    const height = getHeight(charge.startTime, charge.endTime)
                    const color = charge.type === 'PRACTICAL_TEST' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-orange-500 hover:bg-orange-600'
                    return (
                      <div key={charge.id}
                        style={{ position: 'absolute', top: `${top}px`, height: `${height}px`, left: '2px', right: '2px', zIndex: 6 }}
                        onClick={e => { e.stopPropagation(); openChargeModal(charge) }}
                        className={`rounded-lg px-0.5 cursor-pointer overflow-hidden select-none transition text-white flex flex-col items-center justify-center ${color}`}>
                        <p className="font-bold leading-tight text-center break-words text-xs line-clamp-1">{charge.studentName}</p>
                        <p className="text-[10px] opacity-90 leading-tight">{CHARGE_TYPE_LABELS[charge.type]}</p>
                        <span title={charge.paid ? 'שולם' : 'טרם שולם'} className="absolute top-0.5 right-0.5 text-xs leading-none">
                          {charge.paid ? '✅' : '💰'}
                        </span>
                      </div>
                    )
                  })}

                  {/* Lessons — clickable */}
                  {dayLessons.map(lesson => {
                    const top = getTop(lesson.startTime)
                    const height = getHeight(lesson.startTime, lesson.endTime)
                    const isSwapSource = swapSource?.firstId === lesson.firstId
                    const isSwapTarget = !!swapSource && !isSwapSource
                    return (
                      <div key={lesson.firstId}
                        style={{ position: 'absolute', top: `${top}px`, height: `${height}px`, left: '2px', right: '2px', zIndex: 5 }}
                        onClick={e => { e.stopPropagation(); handleLessonClick(lesson) }}
                        className={`rounded-lg px-0.5 cursor-pointer overflow-hidden select-none transition text-white flex items-center justify-center
                          ${isSwapSource ? 'bg-amber-500 ring-2 ring-amber-300 ring-offset-1 animate-pulse' : ''}
                          ${isSwapTarget ? 'bg-blue-500 hover:bg-blue-600' : ''}
                          ${!isSwapSource && !isSwapTarget ? 'bg-green-500 hover:bg-green-600' : ''}`}>
                        <p className={`font-bold leading-tight text-center break-words ${height >= 44 ? 'text-sm line-clamp-2' : 'text-xs line-clamp-1'}`}>
                          {isSwapSource && '⇄ '}{lesson.studentName}
                        </p>
                        {!lesson.calendarEventId && (
                          <span title="לא סונכרן ל-Google Calendar" className="absolute top-0.5 left-0.5 text-xs leading-none">⚠️</span>
                        )}
                        {(() => {
                          const slots = Math.round((lesson.endTime.getTime() - lesson.startTime.getTime()) / 60000 / 20)
                          const price = lesson.pricePer20Min != null ? lesson.pricePer20Min * slots : null
                          const fullyPaid = price != null && lesson.paidSoFar >= price
                          return (
                            <span title={fullyPaid ? 'שולם' : 'טרם שולם'} className="absolute top-0.5 right-0.5 text-xs leading-none">
                              {fullyPaid ? '✅' : '💰'}
                            </span>
                          )
                        })()}
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

            {!actionModal.lesson.calendarEventId && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                <p className="text-sm font-semibold text-amber-800 mb-2">⚠️ השיעור לא נוסף ל-Google Calendar</p>
                {actionModal.syncResult && (
                  <p className={`text-xs mb-2 ${actionModal.syncResult.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{actionModal.syncResult}</p>
                )}
                <button onClick={handleSyncCalendar} disabled={actionModal.syncingCalendar}
                  className="w-full bg-amber-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition">
                  {actionModal.syncingCalendar ? 'מסנכרן...' : '📅 סנכרן ליומן Google'}
                </button>
              </div>
            )}

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

            {/* Change duration */}
            <div className="bg-purple-50 rounded-xl p-3 mb-3">
              <p className="text-sm font-semibold text-purple-800 mb-2">שינוי משך שיעור</p>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[40, 60, 80].map(min => {
                  const currentMinutes = Math.round((actionModal.lesson.endTime.getTime() - actionModal.lesson.startTime.getTime()) / 60000)
                  const active = currentMinutes === min
                  return (
                    <button key={min} type="button" disabled={active || actionModal.changingDuration}
                      onClick={() => handleChangeDuration(min)}
                      className={`py-2 rounded-lg text-sm font-medium border-2 transition disabled:opacity-60 ${
                        active ? 'border-purple-600 bg-purple-100 text-purple-800' : 'border-gray-200 bg-white hover:border-purple-300'
                      }`}>
                      {min} דק׳
                    </button>
                  )
                })}
              </div>
              {actionModal.changingDuration && <p className="text-xs text-purple-600">משנה משך...</p>}
              {actionModal.durationResult && <p className="text-xs text-red-600">{actionModal.durationResult}</p>}
            </div>

            {/* Payment — status + opens the full payments panel in a modal */}
            {(() => {
              const slots = Math.round((actionModal.lesson.endTime.getTime() - actionModal.lesson.startTime.getTime()) / 60000 / 20)
              const price = actionModal.lesson.pricePer20Min != null ? actionModal.lesson.pricePer20Min * slots : null
              const paid = actionModal.lesson.paidSoFar
              const remaining = price != null ? price - paid : null
              const statusText =
                remaining != null && remaining <= 0 ? `✓ שולם במלואו (₪${paid})`
                : paid > 0 ? `שולם ₪${paid}${price != null ? ` מתוך ₪${price}` : ''} — נותר ${remaining != null ? `₪${remaining}` : 'לא ידוע'}`
                : price != null ? `טרם שולם — ₪${price}`
                : 'טרם הוגדר מחיר לתלמיד זה'
              return (
                <div className="bg-green-50 rounded-xl p-3 mb-3">
                  <p className="text-sm text-gray-700 mb-2">{statusText}</p>
                  <button type="button" onClick={() => openPaymentsModal(actionModal.lesson.studentId)}
                    className="block w-full text-center bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition">
                    💰 ניהול תשלום וחשבוניות
                  </button>
                </div>
              )
            })()}

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

      {/* Payments modal — same panel as the student's History page, opened inline */}
      {paymentsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" onClick={closePaymentsModal}>
          <div className="bg-white rounded-xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-lg">{paymentsModal.data?.student.name ?? 'תשלומים'}</p>
              <button onClick={closePaymentsModal} className="text-gray-400 hover:text-gray-600 text-sm">סגור ✕</button>
            </div>
            {paymentsModal.error ? (
              <p className="text-red-600 text-sm">{paymentsModal.error}</p>
            ) : !paymentsModal.data ? (
              <p className="text-gray-400 text-sm">טוען...</p>
            ) : (
              <StudentPaymentsPanel
                studentId={paymentsModal.studentId}
                pricePer20Min={paymentsModal.data.student.pricePer20Min}
                payableLessons={paymentsModal.data.payableLessons}
                pendingCharges={paymentsModal.data.pendingCharges}
                invoices={paymentsModal.data.invoices}
                initialBalance={paymentsModal.data.balance}
              />
            )}
          </div>
        </div>
      )}

      {/* New event — click an empty calendar slot */}
      {newEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setNewEventModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-lg">אירוע חדש</p>
              <button onClick={() => setNewEventModal(null)} className="text-gray-400 hover:text-gray-600 text-sm">סגור ✕</button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">תאריך</label>
                <input type="date" value={newEventModal.date}
                  onChange={e => setNewEventModal(m => m ? { ...m, date: e.target.value } : m)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">שעה</label>
                <input type="time" value={newEventModal.time}
                  onChange={e => setNewEventModal(m => m ? { ...m, time: e.target.value } : m)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>

            {newEventModal.step === 'choose' && (
              <div className="space-y-2">
                <button type="button" onClick={() => chooseEventType('test', 'PRACTICAL_TEST')}
                  className="w-full bg-blue-500 text-white py-2.5 rounded-xl font-medium hover:bg-blue-600 transition">
                  🔵 מבחן מעשי
                </button>
                <button type="button" onClick={() => chooseEventType('test', 'INTERNAL_TEST')}
                  className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-medium hover:bg-orange-600 transition">
                  🟠 טסט פנימי
                </button>
                <button type="button" onClick={() => chooseEventType('lesson')}
                  className="w-full bg-green-600 text-white py-2.5 rounded-xl font-medium hover:bg-green-700 transition">
                  🟢 קביעת שיעור לתלמיד
                </button>
              </div>
            )}

            {(newEventModal.step === 'test' || newEventModal.step === 'lesson') && (() => {
              const m = newEventModal
              const selectedStudent = m.students.find(s => s.id === m.studentId)
              return (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">תלמיד</label>
                    <input type="text" placeholder="חיפוש תלמיד..."
                      value={selectedStudent ? selectedStudent.name : m.studentSearch}
                      onChange={e => setNewEventModal(x => x ? { ...x, studentSearch: e.target.value, studentId: '' } : x)}
                      className="w-full border rounded-lg px-3 py-2 text-sm mb-1.5 focus:ring-2 focus:ring-blue-400" />
                    {!selectedStudent && m.studentSearch && (
                      <div className="border rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                        {m.students.filter(s => s.name.includes(m.studentSearch)).map(s => (
                          <button key={s.id} type="button"
                            onClick={() => setNewEventModal(x => x ? { ...x, studentId: s.id, studentSearch: s.name } : x)}
                            className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0">
                            {s.name}{s.phone && <span className="text-gray-400 text-xs mr-2">{s.phone}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">משך</label>
                    <div className={m.step === 'test' && m.chargeType === 'PRACTICAL_TEST' ? 'grid grid-cols-2 gap-1' : 'grid grid-cols-5 gap-1'}>
                      {(m.step === 'test' && m.chargeType === 'PRACTICAL_TEST' ? PRACTICAL_TEST_DURATION_OPTIONS : DURATION_OPTIONS).map(min => (
                        <button key={min} type="button" onClick={() => setNewEventModal(x => x ? { ...x, minutes: min } : x)}
                          className={`py-1.5 rounded-lg text-xs font-medium border-2 transition ${m.minutes === min ? 'border-blue-600 bg-blue-100 text-blue-800' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
                          {min} דק׳
                        </button>
                      ))}
                    </div>
                  </div>

                  {m.step === 'test' ? (
                    <>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">סכום (₪)</label>
                        <input type="number" min={0} value={m.amount}
                          onChange={e => setNewEventModal(x => x ? { ...x, amount: e.target.value } : x)}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
                      </div>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={m.paidNow} onChange={e => setNewEventModal(x => x ? { ...x, paidNow: e.target.checked } : x)}
                          className="w-4 h-4 accent-blue-600" />
                        שולם כבר עכשיו
                      </label>
                      {m.paidNow && (
                        <>
                          <div className="grid grid-cols-4 gap-1.5">
                            {(['CASH', 'BIT', 'PAYBOX', 'BANK_TRANSFER'] as const).map(mt => (
                              <button key={mt} type="button" onClick={() => (mt === 'BANK_TRANSFER' || mt === 'BIT' || mt === 'PAYBOX') ? setPendingMethod({ form: 'newEvent', method: mt }) : setNewEventModal(x => x ? { ...x, method: mt } : x)}
                                className={`py-1.5 rounded-lg text-xs font-medium border-2 transition ${m.method === mt ? 'border-blue-600 bg-blue-100 text-blue-800' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
                                {{ CASH: 'מזומן', BIT: 'ביט', PAYBOX: 'פייבוקס', BANK_TRANSFER: 'העברה בנקאית' }[mt]}
                              </button>
                            ))}
                          </div>
                          <input type="text" placeholder="אסמכתא (אופציונלי)" value={m.reference}
                            onChange={e => setNewEventModal(x => x ? { ...x, reference: e.target.value } : x)}
                            className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
                        </>
                      )}
                      {m.error && <p className="text-red-500 text-sm">{m.error}</p>}
                      <button onClick={handleCreateTest} disabled={m.submitting}
                        className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                        {m.submitting ? 'שומר...' : 'קבע אירוע'}
                      </button>
                    </>
                  ) : (
                    <>
                      <input type="text" placeholder="כתובת איסוף (אופציונלי)" value={m.pickupAddress}
                        onChange={e => setNewEventModal(x => x ? { ...x, pickupAddress: e.target.value } : x)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-400" />
                      <textarea placeholder="הערות (אופציונלי)" rows={2} value={m.notes}
                        onChange={e => setNewEventModal(x => x ? { ...x, notes: e.target.value } : x)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-400 resize-none" />
                      {m.error && <p className="text-red-500 text-sm">{m.error}</p>}
                      <button onClick={handleCreateLesson} disabled={m.submitting}
                        className="w-full bg-green-600 text-white py-2.5 rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 transition">
                        {m.submitting ? 'קובע...' : 'קבע שיעור'}
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => chooseEventType('choose')} className="w-full text-gray-400 text-sm py-1 hover:text-gray-600">
                    ← חזרה
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Charge detail — practical/internal test */}
      {chargeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setChargeModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm" dir="rtl" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-lg">{chargeModal.charge.studentName}</p>
            <p className="text-gray-500 text-sm mb-3">
              {CHARGE_TYPE_LABELS[chargeModal.charge.type]} | {format(chargeModal.charge.startTime, "EEEE, d בMMMM", { locale: he })} | {format(chargeModal.charge.startTime, 'HH:mm')}–{format(chargeModal.charge.endTime, 'HH:mm')}
            </p>

            {chargeModal.charge.paid ? (
              <div className="bg-green-50 rounded-xl p-3 mb-3 text-sm text-green-800">
                ✓ שולם (₪{chargeModal.charge.amount})
                {chargeModal.charge.invoiceUrl && (
                  <a href={chargeModal.charge.invoiceUrl} target="_blank" rel="noreferrer" className="block text-blue-600 hover:underline mt-1">📄 צפייה בחשבונית</a>
                )}
              </div>
            ) : (
              <div className="bg-blue-50 rounded-xl p-3 mb-3 space-y-2">
                <p className="text-sm font-semibold text-blue-800">טרם שולם — ₪{chargeModal.charge.amount}</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['CASH', 'BIT', 'PAYBOX', 'BANK_TRANSFER'] as const).map(mt => (
                    <button key={mt} type="button" onClick={() => (mt === 'BANK_TRANSFER' || mt === 'BIT' || mt === 'PAYBOX') ? setPendingMethod({ form: 'chargeModal', method: mt }) : setChargeModal(m => m ? { ...m, method: mt } : m)}
                      className={`py-1.5 rounded-lg text-xs font-medium border-2 transition ${chargeModal.method === mt ? 'border-blue-600 bg-blue-100 text-blue-800' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
                      {{ CASH: 'מזומן', BIT: 'ביט', PAYBOX: 'פייבוקס', BANK_TRANSFER: 'העברה בנקאית' }[mt]}
                    </button>
                  ))}
                </div>
                <input type="text" placeholder="אסמכתא (אופציונלי)" value={chargeModal.reference}
                  onChange={e => setChargeModal(m => m ? { ...m, reference: e.target.value } : m)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
                {chargeModal.result && <p className="text-xs text-red-600">{chargeModal.result}</p>}
                <button onClick={handlePayCharge} disabled={chargeModal.paying}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                  {chargeModal.paying ? 'מפיק חשבונית...' : `אשר ₪${chargeModal.charge.amount} והפק חשבונית`}
                </button>
              </div>
            )}

            {chargeModal.charge.type === 'PRACTICAL_TEST' && (
              chargeModal.charge.passed != null ? (
                <div className={`rounded-xl p-3 mb-3 text-sm text-center font-semibold ${chargeModal.charge.passed ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                  {chargeModal.charge.passed ? '✅ עבר/ה את המבחן' : '❌ נכשל/ה במבחן'}
                </div>
              ) : (
                <div className="mb-3">
                  <p className="text-sm font-semibold text-gray-700 mb-2">תוצאת המבחן</p>
                  <div className="flex gap-2">
                    <button onClick={() => handleMarkPassed(true)} disabled={chargeModal.marking}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition">
                      {chargeModal.marking ? '...' : '✅ עבר/ה'}
                    </button>
                    <button onClick={() => handleMarkPassed(false)} disabled={chargeModal.marking}
                      className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition">
                      {chargeModal.marking ? '...' : '❌ נכשל/ה'}
                    </button>
                  </div>
                  {chargeModal.result && <p className="text-xs text-red-600 mt-1.5">{chargeModal.result}</p>}
                </div>
              )
            )}

            {!chargeModal.charge.paid && (
              <button onClick={handleDeleteCharge} disabled={chargeModal.deleting}
                className="w-full text-red-400 text-sm py-1.5 hover:text-red-600 disabled:opacity-50 mb-1">
                {chargeModal.deleting ? 'מוחק...' : 'מחק אירוע'}
              </button>
            )}
            <button onClick={() => setChargeModal(null)} className="w-full text-gray-400 text-sm py-1 hover:text-gray-600">סגור</button>
          </div>
        </div>
      )}

      {pendingMethod && (() => {
        const applyResult = (ref: string) => {
          if (pendingMethod.form === 'newEvent') setNewEventModal(x => x ? { ...x, method: pendingMethod.method, reference: ref } : x)
          if (pendingMethod.form === 'chargeModal') setChargeModal(m => m ? { ...m, method: pendingMethod.method, reference: ref } : m)
          setPendingMethod(null)
        }
        return pendingMethod.method === 'BANK_TRANSFER' ? (
          <BankTransferModal onCancel={() => setPendingMethod(null)} onConfirm={applyResult} />
        ) : (
          <ReferenceModal
            title={pendingMethod.method === 'BIT' ? 'פרטי תשלום בביט' : 'פרטי תשלום בפייבוקס'}
            onCancel={() => setPendingMethod(null)}
            onConfirm={applyResult}
          />
        )
      })()}
    </div>
  )
}
