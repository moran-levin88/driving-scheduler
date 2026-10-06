import Link from 'next/link'
import { getStudentsWithStats } from '@/lib/studentStats'
import { INSTRUCTOR_NAME, INSTRUCTOR_LICENSE_NUMBER } from '@/lib/instructorInfo'
import PrintButton from '../students/[studentId]/card/PrintButton'

// Tosefet Z section 2(ב)(6) — "רשימת יתרות החייבים והזכאים לסוף שנת המס".
// Debt/balance are always computed live (never stored, by design elsewhere
// in this app), so this isn't a historical reconstruction of a past date —
// it's today's snapshot, meant to be printed/saved once at year-end and
// kept on file as that year's dated record, the same way the instructor
// would with a paper ledger.
export default async function YearEndReportPage() {
  const students = await getStudentsWithStats('all')
  const rows = students.filter(s => s.debt > 0 || s.balance > 0).sort((a, b) => b.debt - a.debt)
  const totalDebt = rows.reduce((sum, s) => sum + s.debt, 0)
  const totalBalance = rows.reduce((sum, s) => sum + s.balance, 0)
  const now = new Date()

  return (
    <div className="max-w-3xl mx-auto" dir="rtl">
      <div className="mb-4 print:hidden flex justify-between items-center">
        <Link href="/instructor/students" className="text-blue-600 hover:underline text-sm">&larr; חזרה לתלמידים</Link>
        <PrintButton />
      </div>

      <div className="bg-white rounded-xl shadow p-8 print:shadow-none print:p-0">
        <div className="flex justify-between items-start border-b pb-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">דוח יתרות חייבים וזכאים</h1>
            <p className="text-sm text-gray-500 mt-1">נכון לתאריך {now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>
          </div>
          <div className="text-left text-sm text-gray-700">
            <p className="font-semibold">{INSTRUCTOR_NAME}</p>
            <p>מספר הוראה: {INSTRUCTOR_LICENSE_NUMBER}</p>
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-right py-2">שם</th>
              <th className="text-right py-2">ת&quot;ז</th>
              <th className="text-right py-2">חוב</th>
              <th className="text-right py-2">יתרת זכות</th>
              <th className="text-right py-2">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id} className="border-b border-gray-100">
                <td className="py-1.5">{s.name}</td>
                <td className="py-1.5 text-gray-600">{s.idNumber || '—'}</td>
                <td className="py-1.5">{s.debt > 0 ? `₪${s.debt}` : '—'}</td>
                <td className="py-1.5">{s.balance > 0 ? `₪${s.balance}` : '—'}</td>
                <td className="py-1.5 text-gray-500">{s.archivedAt ? 'לא פעיל' : 'פעיל'}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-bold border-t-2 border-gray-300">
                <td className="py-2" colSpan={2}>סה&quot;כ</td>
                <td className="py-2">₪{totalDebt}</td>
                <td className="py-2">₪{totalBalance}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
        {rows.length === 0 && <p className="text-center text-gray-400 py-6">אין יתרות חייבים או זכאים כרגע</p>}

        <p className="text-xs text-gray-400 mt-6 pt-4 border-t">
          מומלץ להדפיס/לשמור דוח זה כ-PDF ולתייק אותו מדי שנה לסוף שנת המס, לפי תוספת ז׳ להוראות ניהול פנקסי חשבונות.
        </p>
      </div>
    </div>
  )
}
