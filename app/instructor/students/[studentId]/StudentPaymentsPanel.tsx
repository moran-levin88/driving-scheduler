'use client'
import { useState } from 'react'

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

// Just the invoices log now — balance, legacy debt, one-off charges and the
// "שיעורים עם יתרה לתשלום" selection-and-pay flow all live in
// components/PayableItemsPanel.tsx, reachable from the students dashboard's
// own "💰 תשלום" button instead of being embedded on the History page.
export default function StudentPaymentsPanel({ invoices }: { invoices: InvoiceRow[] }) {
  const [invoiceList, setInvoiceList] = useState(invoices)

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
  )
}
