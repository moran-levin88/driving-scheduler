import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const METHOD_LABELS: Record<string, string> = { CASH: 'מזומן', BIT: 'ביט', PAYBOX: 'פייבוקס', BANK_TRANSFER: 'העברה בנקאית' }
const fmt = (d: Date) => d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })

// Read-only list behind the amber counter in the nav: every recorded payment
// that has no tax invoice yet, with the student to open and a hint when the
// row can't be issued the usual way. Nothing here issues anything.
export default async function MissingInvoicesPage() {
  const rows = await prisma.invoice.findMany({
    where: { invoiceId: null, method: { not: 'EXTERNAL' } },
    orderBy: { paidAt: 'asc' },
    include: {
      student: { select: { id: true, name: true, idNumber: true, archivedAt: true } },
      _count: { select: { payments: true } },
    },
  })

  function hint(r: (typeof rows)[number]): string {
    if (!r.isDeposit && !r.description && r._count.payments === 0) {
      return 'אין שיעורים מקושרים לתשלום — "נסה שוב" יחזיר "לא נמצאו שיעורים לחשבונית זו"'
    }
    if (r.student.archivedAt) return 'תלמיד בארכיון'
    return ''
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">תשלומים בלי חשבונית</h1>
      <p className="text-gray-600 mb-4 text-sm">
        {rows.length === 0
          ? 'אין תשלומים בלי חשבונית.'
          : 'לחצי על שם התלמיד, ובטבלת "חשבוניות" לחצי "נסה שוב" ליד התשלום. כאן רק מציגים — שום דבר לא מונפק מהדף הזה.'}
      </p>
      {rows.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-500">תלמיד</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">תאריך תשלום</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">סכום</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">אמצעי</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">עבור</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">הערה</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={`/instructor/students/${r.student.id}`} className="text-blue-600 hover:underline">{r.student.name}</Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmt(r.paidAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">₪{r.amount}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{METHOD_LABELS[r.method] ?? r.method}</td>
                  <td className="px-4 py-3 text-gray-600">{r.isDeposit ? 'הפקדה ליתרה' : r.description || `${r._count.payments} שיעורים`}</td>
                  <td className="px-4 py-3 text-amber-700">{hint(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
