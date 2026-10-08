'use client'
import { useState } from 'react'
import BankTransferModal from '@/components/BankTransferModal'
import ReferenceModal from '@/components/ReferenceModal'

type InvoiceRow = {
  id: string; amount: number; method: string; reference: string | null
  paidAt: string; isDeposit: boolean; description: string | null
  invoiceId: string | null; invoiceUrl: string | null
  lessonCount: number
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'מזומן', BIT: 'ביט', PAYBOX: 'פייבוקס', BANK_TRANSFER: 'העברה בנקאית', BALANCE: 'יתרה',
  EXTERNAL: 'שולם בפלטפורמה הקודמת',
}

// Balance, legacy debt, one-off charges and the invoices log — the
// "שיעורים עם יתרה לתשלום" selection-and-pay flow lives in its own
// PayableItemsPanel now (components/PayableItemsPanel.tsx), reachable from
// the students dashboard's own "💰 תשלום" button instead of being embedded
// here.
export default function StudentPaymentsPanel({
  studentId, invoices, initialBalance, initialPreviousPlatformDebt,
}: {
  studentId: string
  invoices: InvoiceRow[]
  initialBalance: number
  initialPreviousPlatformDebt: number
}) {
  const [balance, setBalance] = useState(initialBalance)
  const [invoiceList, setInvoiceList] = useState(invoices)
  const [previousPlatformDebt, setPreviousPlatformDebt] = useState(initialPreviousPlatformDebt)

  // Add to the legacy debt — pure record-keeping, no invoice (no money has
  // actually changed hands yet; that happens later, when it's paid down via
  // PayableItemsPanel like any other item with a balance due).
  const [addDebtOpen, setAddDebtOpen] = useState(false)
  const [addDebtAmount, setAddDebtAmount] = useState('')
  const [addingDebt, setAddingDebt] = useState(false)
  const [addDebtError, setAddDebtError] = useState('')

  // Add balance form
  const [depositOpen, setDepositOpen] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositMethod, setDepositMethod] = useState<'CASH' | 'BIT' | 'PAYBOX' | 'BANK_TRANSFER' | 'EXTERNAL'>('CASH')
  const [depositReference, setDepositReference] = useState('')
  const [depositDate, setDepositDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [depositing, setDepositing] = useState(false)
  const [depositResult, setDepositResult] = useState('')

  // One-off charge — for anything not tied to a specific lesson/test in this
  // system, e.g. settling a debt carried over from the previous platform
  const [chargeOpen, setChargeOpen] = useState(false)
  const [chargeDescription, setChargeDescription] = useState('')
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeMethod, setChargeMethod] = useState<'CASH' | 'BIT' | 'PAYBOX' | 'BANK_TRANSFER'>('CASH')
  const [chargeReference, setChargeReference] = useState('')
  const [chargeDate, setChargeDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [charging, setCharging] = useState(false)
  const [chargeResult, setChargeResult] = useState('')

  // Which form opened the mandatory payment-details popup, if any — bank
  // transfer needs 4 fields, Bit/PayBox need just a confirmation number
  const [pendingMethod, setPendingMethod] = useState<{ form: 'deposit' | 'charge'; method: 'BANK_TRANSFER' | 'BIT' | 'PAYBOX' } | null>(null)

  async function handleAddDebt() {
    const amount = Number(addDebtAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setAddDebtError('סכום לא תקין')
      return
    }
    setAddingDebt(true)
    setAddDebtError('')
    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previousPlatformDebt: previousPlatformDebt + amount }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setPreviousPlatformDebt(data.previousPlatformDebt)
        setAddDebtOpen(false)
        setAddDebtAmount('')
      } else {
        setAddDebtError(data.error || 'שגיאה')
      }
    } catch {
      setAddDebtError('שגיאת רשת — נסה שוב')
    } finally {
      setAddingDebt(false)
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

  async function handleCharge() {
    const amount = Number(chargeAmount)
    if (!chargeDescription.trim()) {
      setChargeResult('יש להזין תיאור')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setChargeResult('סכום לא תקין')
      return
    }
    setCharging(true)
    setChargeResult('')
    try {
      const res = await fetch(`/api/students/${studentId}/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: chargeDescription, amount, method: chargeMethod,
          reference: chargeReference, paidAt: new Date(chargeDate).toISOString(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok || res.status === 207) {
        if (data.invoice) setInvoiceList(prev => [data.invoice, ...prev])
        setChargeResult(data.invoiceError ? `✓ החיוב נרשם, אך ${data.invoiceError}` : '')
        if (!data.invoiceError) { setChargeOpen(false); setChargeDescription(''); setChargeAmount(''); setChargeReference('') }
      } else {
        setChargeResult(data.error || 'שגיאה')
      }
    } catch {
      setChargeResult('שגיאת רשת — נסה שוב')
    } finally {
      setCharging(false)
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
                <button key={m} type="button" onClick={() => (m === 'BANK_TRANSFER' || m === 'BIT' || m === 'PAYBOX') ? setPendingMethod({ form: 'deposit', method: m }) : setDepositMethod(m)}
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

      {/* Legacy debt — carried over from the previous platform. Adding to it
          is pure record-keeping (no money received, no invoice); it's paid
          down later, like any other item, via PayableItemsPanel. */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-gray-900">
            חוב מהפלטפורמה הקודמת
            {previousPlatformDebt > 0 && <span className="text-sm font-normal text-red-600 mr-2">₪{previousPlatformDebt}</span>}
          </h2>
          <button onClick={() => setAddDebtOpen(v => !v)} className="text-sm bg-red-50 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-100 transition">
            + הוסף חוב
          </button>
        </div>
        {addDebtOpen && (
          <div className="bg-red-50 rounded-xl p-3 mt-2 space-y-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">סכום להוספה (₪)</label>
              <input type="number" min={0} value={addDebtAmount} onChange={e => setAddDebtAmount(e.target.value)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-red-400" />
            </div>
            {addDebtError && <p className="text-xs text-red-600">{addDebtError}</p>}
            <button onClick={handleAddDebt} disabled={addingDebt}
              className="w-full bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition">
              {addingDebt ? 'שומר...' : `הוסף ₪${addDebtAmount || 0} לחוב`}
            </button>
          </div>
        )}
      </div>

      {/* One-off charge — not tied to a lesson or test in this system */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-gray-900">חיוב חד-פעמי</h2>
          <button onClick={() => setChargeOpen(v => !v)} className="text-sm bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 transition">
            + חיוב חדש
          </button>
        </div>
        {chargeOpen && (
          <div className="bg-green-50 rounded-xl p-3 mt-2 space-y-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">תיאור</label>
              <button type="button" onClick={() => setChargeDescription('חוב מהפלטפורמה הקודמת')}
                className={`w-full mb-1.5 py-1.5 rounded-lg text-xs font-medium border-2 transition ${chargeDescription === 'חוב מהפלטפורמה הקודמת' ? 'border-green-600 bg-green-100 text-green-800' : 'border-gray-200 bg-white hover:border-green-300'}`}>
                חוב מהפלטפורמה הקודמת
              </button>
              <input type="text" value={chargeDescription} onChange={e => setChargeDescription(e.target.value)}
                placeholder="תיאור החיוב"
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-400" />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(['CASH', 'BIT', 'PAYBOX', 'BANK_TRANSFER'] as const).map(m => (
                <button key={m} type="button" onClick={() => (m === 'BANK_TRANSFER' || m === 'BIT' || m === 'PAYBOX') ? setPendingMethod({ form: 'charge', method: m }) : setChargeMethod(m)}
                  className={`py-1.5 rounded-lg text-xs font-medium border-2 transition ${chargeMethod === m ? 'border-green-600 bg-green-100 text-green-800' : 'border-gray-200 bg-white hover:border-green-300'}`}>
                  {METHOD_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">סכום (₪)</label>
                <input type="number" min={0} value={chargeAmount} onChange={e => setChargeAmount(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">תאריך</label>
                <input type="date" value={chargeDate} onChange={e => setChargeDate(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">הערה / אסמכתא (אופציונלי)</label>
              <input type="text" value={chargeReference} onChange={e => setChargeReference(e.target.value)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-400" />
            </div>
            {chargeResult && <p className="text-xs text-red-600">{chargeResult}</p>}
            <button onClick={handleCharge} disabled={charging}
              className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition">
              {charging ? 'מפיק חשבונית...' : `אשר ₪${chargeAmount || 0} והפק חשבונית`}
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

      {pendingMethod && (() => {
        const applyResult = (ref: string) => {
          if (pendingMethod.form === 'deposit') { setDepositMethod(pendingMethod.method); setDepositReference(ref) }
          if (pendingMethod.form === 'charge') { setChargeMethod(pendingMethod.method); setChargeReference(ref) }
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
