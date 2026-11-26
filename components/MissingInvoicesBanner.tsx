'use client'
import { useEffect, useState } from 'react'

// Persistent warning for payments that were recorded but never got a tax
// invoice. A one-time alert on the payment screen is easy to miss (that's how
// weeks of failures went unnoticed), so this stays on every instructor page
// until nothing is missing, with a one-click bulk fix.
export default function MissingInvoicesBanner() {
  const [count, setCount] = useState(0)
  const [oldest, setOldest] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState('')

  async function refresh() {
    try {
      const res = await fetch('/api/invoices/missing')
      if (!res.ok) return
      const d = await res.json()
      setCount(d.count ?? 0)
      setOldest(d.oldestPaidAt ?? null)
    } catch { /* banner is best-effort */ }
  }

  useEffect(() => { refresh() }, [])

  async function issueAll() {
    setRunning(true)
    setMsg('')
    let issued = 0
    let lastError = ''
    try {
      for (let round = 0; round < 40; round++) {
        const res = await fetch('/api/invoices/missing', { method: 'POST' })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) { lastError = d.error || 'שגיאה'; break }
        issued += d.issued ?? 0
        setCount(d.remaining ?? 0)
        if (d.failures?.length) lastError = d.failures[0].error
        // Nothing issued this round = every attempt failed; looping again won't help
        if ((d.remaining ?? 0) === 0 || (d.issued ?? 0) === 0) break
      }
    } catch {
      lastError = 'שגיאת רשת'
    }
    await refresh()
    setMsg(`הופקו ${issued} חשבוניות${lastError ? ` — נעצר: ${lastError}` : ''}`)
    setRunning(false)
  }

  if (count === 0 && !msg) return null

  return (
    <div className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 p-4" role="alert">
      {count > 0 && (
        <p className="font-semibold text-red-800">
          ⚠️ {count} תשלומים נקלטו בלי חשבונית מס
          {oldest ? ` (הראשון מ-${new Date(oldest).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })})` : ''}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {count > 0 && (
          <button onClick={issueAll} disabled={running}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
            {running ? 'מפיק חשבוניות…' : 'הנפק את כל החשבוניות החסרות ושלח לתלמידים'}
          </button>
        )}
        {msg && <span className="text-sm text-gray-800">{msg}</span>}
      </div>
    </div>
  )
}
