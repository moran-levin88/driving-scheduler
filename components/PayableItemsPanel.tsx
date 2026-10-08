'use client'
import { useState } from 'react'
import BankTransferModal from '@/components/BankTransferModal'
import ReferenceModal from '@/components/ReferenceModal'

export type PayableLesson = { firstBookingId: string; startTime: string; endTime: string; paidSoFar: number }
export type PendingCharge = { id: string; label: string; startTime: string; amount: number }

type UnifiedItem =
  | { kind: 'lesson'; key: string; lesson: PayableLesson }
  | { kind: 'charge'; key: string; charge: PendingCharge }
  | { kind: 'legacyDebt'; key: 'legacyDebt'; amount: number }

const METHOD_LABELS: Record<string, string> = {
  CASH: 'מזומן', BIT: 'ביט', PAYBOX: 'פייבוקס', BANK_TRANSFER: 'העברה בנקאית', BALANCE: 'יתרה',
  EXTERNAL: 'שולם בפלטפורמה הקודמת',
}

function minutesBetween(startIso: string, endIso: string) {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
}

// The "שיעורים עם יתרה לתשלום" selection-and-pay flow — its own component so
// it can be dropped into the calendar's payments modal, the students
// dashboard's own payment modal, and anywhere else, independent of
// StudentPaymentsPanel's balance/legacy-debt/one-off-charge/invoices
// sections (which stay on the student's History page).
export default function PayableItemsPanel({
  studentId, pricePer20Min, payableLessons, pendingCharges, initialPreviousPlatformDebt, initialBalance, onPaid,
}: {
  studentId: string
  pricePer20Min: number | null
  payableLessons: PayableLesson[]
  pendingCharges: PendingCharge[]
  initialPreviousPlatformDebt: number
  initialBalance: number
  onPaid?: () => void
}) {
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set())
  const [chargesList, setChargesList] = useState(pendingCharges)
  const [previousPlatformDebt, setPreviousPlatformDebt] = useState(initialPreviousPlatformDebt)
  const [balance, setBalance] = useState(initialBalance)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [method, setMethod] = useState<'CASH' | 'BIT' | 'PAYBOX' | 'BANK_TRANSFER' | 'BALANCE' | 'EXTERNAL'>('CASH')
  const [reference, setReference] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [paying, setPaying] = useState(false)
  const [payResult, setPayResult] = useState('')
  const [pendingMethod, setPendingMethod] = useState<{ method: 'BANK_TRANSFER' | 'BIT' | 'PAYBOX' } | null>(null)
  const [dismissingId, setDismissingId] = useState<string | null>(null)

  // The amount still owed on this lesson — full price if nothing's been
  // paid yet, or just the remainder if it was partially paid before.
  function suggestedAmount(l: PayableLesson) {
    if (pricePer20Min == null) return ''
    const slots = minutesBetween(l.startTime, l.endTime) / 20
    return String(Math.max(0, pricePer20Min * slots - l.paidSoFar))
  }

  const unvisibleLessons = payableLessons.filter(l => !paidIds.has(l.firstBookingId))
  const timedItems: UnifiedItem[] = [
    ...unvisibleLessons.map(l => ({ kind: 'lesson' as const, key: `lesson:${l.firstBookingId}`, lesson: l })),
    ...chargesList.map(c => ({ kind: 'charge' as const, key: `charge:${c.id}`, charge: c })),
  ].sort((a, b) => {
    const at = a.kind === 'lesson' ? a.lesson.startTime : a.charge.startTime
    const bt = b.kind === 'lesson' ? b.lesson.startTime : b.charge.startTime
    return new Date(at).getTime() - new Date(bt).getTime()
  })
  // The legacy debt isn't tied to a specific date — show it first, ahead of
  // any dated lesson/test.
  const unifiedItems: UnifiedItem[] = previousPlatformDebt > 0
    ? [{ kind: 'legacyDebt' as const, key: 'legacyDebt' as const, amount: previousPlatformDebt }, ...timedItems]
    : timedItems

  function suggestedAmountForItem(item: UnifiedItem) {
    if (item.kind === 'charge') return String(item.charge.amount)
    if (item.kind === 'legacyDebt') return String(item.amount)
    return suggestedAmount(item.lesson)
  }

  function toggleSelect(item: UnifiedItem) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(item.key)) {
        next.delete(item.key)
      } else {
        next.add(item.key)
        setAmounts(a => ({ ...a, [item.key]: a[item.key] ?? suggestedAmountForItem(item) }))
      }
      return next
    })
  }

  const total = [...selected].reduce((sum, key) => sum + (Number(amounts[key]) || 0), 0)
  // Tests and the legacy debt both require a real payment method — neither
  // can be settled from prepaid balance or marked as paid-on-the-old-platform.
  const hasChargeSelected = [...selected].some(k => k.startsWith('charge:') || k === 'legacyDebt')

  // One-click cleanup for legacy rows that were already settled on the
  // previous platform — marks as EXTERNAL with no form, no Morning document.
  async function handleQuickDismiss(l: PayableLesson) {
    setDismissingId(l.firstBookingId)
    try {
      const amount = Number(suggestedAmount(l)) || 0
      const res = await fetch('/api/bookings/group/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ bookingId: l.firstBookingId, amount }],
          method: 'EXTERNAL', paidAt: new Date().toISOString(),
        }),
      })
      if (res.ok) {
        setPaidIds(prev => new Set([...prev, l.firstBookingId]))
        setSelected(prev => { const n = new Set(prev); n.delete(`lesson:${l.firstBookingId}`); return n })
        onPaid?.()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'שגיאה')
      }
    } catch {
      alert('שגיאת רשת — נסה שוב')
    } finally {
      setDismissingId(null)
    }
  }

  async function handlePay() {
    if (selected.size === 0) return
    for (const key of selected) {
      const ok = method === 'EXTERNAL'
        ? Number.isFinite(Number(amounts[key])) && Number(amounts[key]) >= 0
        : Number.isFinite(Number(amounts[key])) && Number(amounts[key]) > 0
      if (!ok) {
        setPayResult('יש להזין סכום תקין לכל פריט נבחר')
        return
      }
    }
    const lessonKeys = [...selected].filter(k => k.startsWith('lesson:'))
    const chargeKeys = [...selected].filter(k => k.startsWith('charge:'))
    if ((chargeKeys.length > 0 || selected.has('legacyDebt')) && (method === 'BALANCE' || method === 'EXTERNAL')) {
      setPayResult('אירועי מבחן וחוב מהפלטפורמה הקודמת לא ניתן לשלם ביתרה או לסמן כשולם בפלטפורמה הקודמת — בחר/י אמצעי תשלום אחר')
      return
    }
    setPaying(true)
    setPayResult('')
    try {
      let anyError: string | null = null

      if (lessonKeys.length > 0) {
        const res = await fetch('/api/bookings/group/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: lessonKeys.map(k => ({ bookingId: k.slice(7), amount: Number(amounts[k]) })),
            method, reference, paidAt: new Date(payDate).toISOString(), note: payNote,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok || res.status === 207) {
          if (data.invoiceError) anyError = data.invoiceError
        } else {
          setPayResult(data.error || 'שגיאה')
          setPaying(false)
          return
        }
      }

      // Each test event gets its own invoice — paid one at a time, in order.
      for (const key of chargeKeys) {
        const chargeId = key.slice(7)
        const charge = chargesList.find(c => c.id === chargeId)
        const res = await fetch(`/api/students/${studentId}/charge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: charge?.label ?? 'אירוע', amount: Number(amounts[key]),
            method, reference, paidAt: new Date(payDate).toISOString(), chargeId,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok || res.status === 207) {
          if (data.invoiceError) anyError = data.invoiceError
        } else {
          setPayResult(data.error || 'שגיאה')
          setPaying(false)
          return
        }
      }

      if (selected.has('legacyDebt')) {
        const res = await fetch(`/api/students/${studentId}/charge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: 'חוב מהפלטפורמה הקודמת', amount: Number(amounts.legacyDebt),
            method, reference, paidAt: new Date(payDate).toISOString(), reducesPreviousPlatformDebt: true,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok || res.status === 207) {
          if (data.invoiceError) anyError = data.invoiceError
          if (typeof data.remainingDebt === 'number') setPreviousPlatformDebt(data.remainingDebt)
        } else {
          setPayResult(data.error || 'שגיאה')
          setPaying(false)
          return
        }
      }

      setPaidIds(prev => new Set([...prev, ...lessonKeys.map(k => k.slice(7))]))
      setChargesList(prev => prev.filter(c => !chargeKeys.includes(`charge:${c.id}`)))
      if (method === 'BALANCE') setBalance(b => b - total)
      setPayResult(anyError ? `✓ התשלום נרשם, אך ${anyError}` : '✓ התשלום נרשם בהצלחה')
      setSelected(new Set()); setAmounts({}); setReference(''); setPayNote('')
      onPaid?.()
    } catch {
      setPayResult('שגיאת רשת — נסה שוב')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h2 className="font-bold text-gray-900 mb-3">שיעורים עם יתרה לתשלום</h2>
      {unifiedItems.length === 0 ? (
        <p className="text-sm text-gray-400">אין שיעורים או אירועים עם יתרה לתשלום</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {unifiedItems.map(item => {
            const isSelected = selected.has(item.key)
            return (
              <div key={item.key} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition ${isSelected ? 'bg-green-50' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item)} className="w-4 h-4 accent-green-600 shrink-0" />
                  <span className="text-sm">
                    {item.kind === 'lesson' ? (
                      <>
                        {new Date(item.lesson.startTime).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}
                        {' '}
                        {new Date(item.lesson.startTime).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}
                        {' ('}{minutesBetween(item.lesson.startTime, item.lesson.endTime)} דק׳{')'}
                        {item.lesson.paidSoFar > 0 && <span className="text-amber-600"> — שולם ₪{item.lesson.paidSoFar} חלקית</span>}
                      </>
                    ) : item.kind === 'charge' ? (
                      <>{item.charge.label} — {new Date(item.charge.startTime).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</>
                    ) : (
                      <>חוב מהפלטפורמה הקודמת</>
                    )}
                  </span>
                </label>
                {isSelected ? (
                  <input type="number" min={0} value={amounts[item.key] ?? ''}
                    onChange={e => setAmounts(a => ({ ...a, [item.key]: e.target.value }))}
                    className="w-20 border rounded-lg px-2 py-1 text-sm text-center shrink-0" />
                ) : item.kind === 'lesson' ? (
                  <button type="button" onClick={() => handleQuickDismiss(item.lesson)} disabled={dismissingId === item.lesson.firstBookingId}
                    title="שולם בפלטפורמה הקודמת — הסר מהרשימה"
                    className="shrink-0 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition disabled:opacity-50">
                    {dismissingId === item.lesson.firstBookingId ? '...' : '🗑'}
                  </button>
                ) : item.kind === 'charge' ? (
                  <span className="shrink-0 text-xs text-gray-400">₪{item.charge.amount}</span>
                ) : (
                  <span className="shrink-0 text-xs text-gray-400">₪{item.amount}</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="bg-green-50 rounded-xl p-3 space-y-2">
          <p className="text-sm font-semibold text-green-800">{selected.size} פריטים נבחרו — סה"כ ₪{total}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(['CASH', 'BIT', 'PAYBOX', 'BANK_TRANSFER', 'BALANCE', 'EXTERNAL'] as const).map(m => (
              <button key={m} type="button"
                disabled={(m === 'BALANCE' && (balance < total || hasChargeSelected)) || (m === 'EXTERNAL' && hasChargeSelected)}
                onClick={() => (m === 'BANK_TRANSFER' || m === 'BIT' || m === 'PAYBOX') ? setPendingMethod({ method: m }) : setMethod(m)}
                className={`py-1.5 rounded-lg text-xs font-medium border-2 transition disabled:opacity-40 ${method === m ? 'border-green-600 bg-green-100 text-green-800' : 'border-gray-200 bg-white hover:border-green-300'}`}>
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          {hasChargeSelected && (method === 'BALANCE' || method === 'EXTERNAL') && (
            <p className="text-xs text-red-600">אירועי מבחן דורשים אמצעי תשלום אמיתי — בחר/י מזומן, ביט, פייבוקס או העברה.</p>
          )}
          {method === 'BALANCE' && <p className="text-xs text-gray-500">יתרה זמינה: ₪{balance}</p>}
          {method === 'EXTERNAL' && <p className="text-xs text-gray-500">השיעורים יסומנו כשולמו בלי להפיק חשבונית חדשה.</p>}
          {method !== 'BALANCE' && method !== 'EXTERNAL' && (
            <>
              <div>
                <label className="block text-xs text-gray-600 mb-1">תאריך תשלום</label>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">אסמכתא (אופציונלי)</label>
                <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">הסבר לסכום (למשל: יתרת חוב מהפלטפורמה הקודמת) — אופציונלי</label>
                <input type="text" value={payNote} onChange={e => setPayNote(e.target.value)}
                  placeholder="יופיע על גבי החשבונית"
                  className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-400" />
              </div>
            </>
          )}
          {payResult && <p className={`text-xs ${payResult.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{payResult}</p>}
          <button onClick={handlePay} disabled={paying}
            className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition">
            {paying ? 'מעבד...' : method === 'BALANCE' ? `אשר ניכוי ₪${total} מהיתרה` : method === 'EXTERNAL' ? `סמן ${selected.size} פריטים כשולמו` : `אשר ₪${total} והפק חשבונית`}
          </button>
        </div>
      )}

      {pendingMethod && (() => {
        const applyResult = (ref: string) => {
          setMethod(pendingMethod.method)
          setReference(ref)
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
