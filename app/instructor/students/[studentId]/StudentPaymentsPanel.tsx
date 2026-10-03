'use client'
import { useState } from 'react'

type PayableLesson = { firstBookingId: string; startTime: string; endTime: string; paidSoFar: number }
type PendingCharge = { id: string; label: string; startTime: string; amount: number }
type InvoiceRow = {
  id: string; amount: number; method: string; reference: string | null
  paidAt: string; isDeposit: boolean; description: string | null
  invoiceId: string | null; invoiceUrl: string | null
  lessonCount: number
}

type UnifiedItem =
  | { kind: 'lesson'; key: string; lesson: PayableLesson }
  | { kind: 'charge'; key: string; charge: PendingCharge }

const METHOD_LABELS: Record<string, string> = {
  CASH: 'מזומן', BIT: 'ביט', PAYBOX: 'פייבוקס', BANK_TRANSFER: 'העברה בנקאית', BALANCE: 'יתרה',
  EXTERNAL: 'שולם בפלטפורמה הקודמת',
}

function minutesBetween(startIso: string, endIso: string) {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
}

export default function StudentPaymentsPanel({
  studentId, pricePer20Min, payableLessons, pendingCharges, invoices, initialBalance,
}: {
  studentId: string
  pricePer20Min: number | null
  payableLessons: PayableLesson[]
  pendingCharges: PendingCharge[]
  invoices: InvoiceRow[]
  initialBalance: number
}) {
  const [balance, setBalance] = useState(initialBalance)
  const [invoiceList, setInvoiceList] = useState(invoices)
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set())
  const [chargesList, setChargesList] = useState(pendingCharges)

  // Add balance form
  const [depositOpen, setDepositOpen] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositMethod, setDepositMethod] = useState<'CASH' | 'BIT' | 'PAYBOX' | 'BANK_TRANSFER' | 'EXTERNAL'>('CASH')
  const [depositReference, setDepositReference] = useState('')
  const [depositDate, setDepositDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [depositing, setDepositing] = useState(false)
  const [depositResult, setDepositResult] = useState('')

  // Batch payment form — covers both lessons with a balance due and
  // unpaid practical/internal tests booked from the calendar, in one list
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [method, setMethod] = useState<'CASH' | 'BIT' | 'PAYBOX' | 'BANK_TRANSFER' | 'BALANCE' | 'EXTERNAL'>('CASH')
  const [reference, setReference] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [paying, setPaying] = useState(false)
  const [payResult, setPayResult] = useState('')

  // The amount still owed on this lesson — full price if nothing's been
  // paid yet, or just the remainder if it was partially paid before.
  function suggestedAmount(l: PayableLesson) {
    if (pricePer20Min == null) return ''
    const slots = minutesBetween(l.startTime, l.endTime) / 20
    return String(Math.max(0, pricePer20Min * slots - l.paidSoFar))
  }

  const unvisibleLessons = payableLessons.filter(l => !paidIds.has(l.firstBookingId))
  const unifiedItems: UnifiedItem[] = [
    ...unvisibleLessons.map(l => ({ kind: 'lesson' as const, key: `lesson:${l.firstBookingId}`, lesson: l })),
    ...chargesList.map(c => ({ kind: 'charge' as const, key: `charge:${c.id}`, charge: c })),
  ].sort((a, b) => {
    const at = a.kind === 'lesson' ? a.lesson.startTime : a.charge.startTime
    const bt = b.kind === 'lesson' ? b.lesson.startTime : b.charge.startTime
    return new Date(at).getTime() - new Date(bt).getTime()
  })

  function suggestedAmountForItem(item: UnifiedItem) {
    return item.kind === 'charge' ? String(item.charge.amount) : suggestedAmount(item.lesson)
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
  const hasChargeSelected = [...selected].some(k => k.startsWith('charge:'))

  const [dismissingId, setDismissingId] = useState<string | null>(null)

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

  async function handleDeposit() {
    const amount = Number(depositAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setDepositResult('סכום לא תקין')
      return
    }
    setDepositing(true)
    setDepositResult('')
    try {
      const res = await fetch(`/api/students/${studentId}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method: depositMethod, reference: depositReference, paidAt: new Date(depositDate).toISOString() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok || res.status === 207) {
        setBalance(data.balance)
        if (data.invoice) setInvoiceList(prev => [data.invoice, ...prev])
        setDepositResult(data.invoiceError ? `✓ היתרה עודכנה, אך ${data.invoiceError}` : '')
        if (!data.invoiceError) { setDepositOpen(false); setDepositAmount(''); setDepositReference('') }
      } else {
        setDepositResult(data.error || 'שגיאה')
      }
    } catch {
      setDepositResult('שגיאת רשת — נסה שוב')
    } finally {
      setDepositing(false)
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
    if (chargeKeys.length > 0 && (method === 'BALANCE' || method === 'EXTERNAL')) {
      setPayResult('אירועי מבחן לא ניתן לשלם ביתרה או לסמן כשולם בפלטפורמה הקודמת — בחר/י אמצעי תשלום אחר')
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
          // data.invoice is the bare Invoice row (no `payments` relation included),
          // so lessonCount has to be filled in here or the table shows "undefined".
          if (data.invoice) setInvoiceList(prev => [{ ...data.invoice, lessonCount: lessonKeys.length }, ...prev])
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
          if (data.invoice) setInvoiceList(prev => [data.invoice, ...prev])
          if (data.invoiceError) anyError = data.invoiceError
        } else {
          setPayResult(data.error || 'שגיאה')
          setPaying(false)
          return
        }
      }

      setPaidIds(prev => new Set([...prev, ...lessonKeys.map(k => k.slice(7))]))
      setChargesList(prev => prev.filter(c => !chargeKeys.includes(`charge:${c.id}`)))
      if (method === 'BALANCE') setBalance(b => b - total)
      setPayResult(anyError ? `✓ התשלום נרשם, אך ${anyError}` : '')
      setSelected(new Set()); setAmounts({}); setReference(''); setPayNote('')
    } catch {
      setPayResult('שגיאת רשת — נסה שוב')
    } finally {
      setPaying(false)
    }
  }

  async function handleRetry(invoiceId: string) {
    const res = await fetch(`/api/invoices/${invoiceId}/retry`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.invoice) {
      setInvoiceList(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, invoiceId: data.invoice.invoiceId, invoiceUrl: data.invoice.invoiceUrl } : inv))
    } else {
      alert(data.error || 'שגיאה')
    }
  }

  return (
    <div className="space-y-4">
      {/* Balance + deposit */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-gray-900">יתרה</h2>
          <button onClick={() => setDepositOpen(v => !v)} className="text-sm bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 transition">
            + הוסף יתרה
          </button>
        </div>
        {depositOpen && (
          <div className="bg-green-50 rounded-xl p-3 mt-2 space-y-2">
            <div className="grid grid-cols-5 gap-1.5">
              {(['CASH', 'BIT', 'PAYBOX', 'BANK_TRANSFER', 'EXTERNAL'] as const).map(m => (
                <button key={m} type="button" onClick={() => setDepositMethod(m)}
                  className={`py-1.5 rounded-lg text-xs font-medium border-2 transition ${depositMethod === m ? 'border-green-600 bg-green-100 text-green-800' : 'border-gray-200 bg-white hover:border-green-300'}`}>
                  {METHOD_LABELS[m]}
                </button>
              ))}
            </div>
            {depositMethod === 'EXTERNAL' && (
              <p className="text-xs text-gray-500">היתרה תתעדכן בלי להפיק חשבונית — לכסף ששולם וכבר קיבל חשבונית בפלטפורמה הקודמת.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">סכום (₪)</label>
                <input type="number" min={0} value={depositAmount} onChange={e => setDepositAmount(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">תאריך</label>
                <input type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">הערה / אסמכתא (אופציונלי)</label>
              <input type="text" value={depositReference} onChange={e => setDepositReference(e.target.value)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-400" />
            </div>
            {depositResult && <p className="text-xs text-red-600">{depositResult}</p>}
            <button onClick={handleDeposit} disabled={depositing}
              className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition">
              {depositing ? (depositMethod === 'EXTERNAL' ? 'מעדכן...' : 'מפיק חשבונית...') : depositMethod === 'EXTERNAL' ? `אשר ₪${depositAmount || 0} והוסף ליתרה (בלי חשבונית)` : `אשר ₪${depositAmount || 0} והוסף ליתרה`}
            </button>
          </div>
        )}
      </div>

      {/* Payable lessons + unpaid tests (practical/internal) — batch payment */}
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
                      ) : (
                        <>{item.charge.label} — {new Date(item.charge.startTime).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</>
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
                  ) : (
                    <span className="shrink-0 text-xs text-gray-400">₪{item.charge.amount}</span>
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
                  onClick={() => setMethod(m)}
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
            {payResult && <p className="text-xs text-red-600">{payResult}</p>}
            <button onClick={handlePay} disabled={paying}
              className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition">
              {paying ? 'מעבד...' : method === 'BALANCE' ? `אשר ניכוי ₪${total} מהיתרה` : method === 'EXTERNAL' ? `סמן ${selected.size} פריטים כשולמו` : `אשר ₪${total} והפק חשבונית`}
            </button>
          </div>
        )}
      </div>

      {/* Invoices */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-3">חשבוניות</h2>
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">תאריך</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">סכום</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">אמצעי</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">כולל</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">אסמכתא</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">חשבונית</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoiceList.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">{new Date(inv.paidAt).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</td>
                    <td className="px-6 py-4 font-medium whitespace-nowrap">₪{inv.amount}</td>
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{METHOD_LABELS[inv.method]}</td>
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{inv.isDeposit ? 'הפקדה' : inv.description || `${inv.lessonCount} שיעורים`}</td>
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{inv.reference || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {inv.invoiceUrl ? (
                        <a href={inv.invoiceUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">📄 צפייה</a>
                      ) : inv.method === 'EXTERNAL' ? (
                        <span className="text-xs text-gray-400">ללא חשבונית</span>
                      ) : (
                        <button onClick={() => handleRetry(inv.id)} className="text-xs bg-amber-500 text-white px-2 py-1 rounded-lg hover:bg-amber-600 transition">
                          נסה שוב
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invoiceList.length === 0 && (
            <div className="p-8 text-center text-gray-500">אין חשבוניות</div>
          )}
        </div>
      </div>
    </div>
  )
}
