import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

const TYPE_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'התחברות מוצלחת',
  LOGIN_FAILURE: 'ניסיון התחברות כושל',
  LOGIN_LOCKED: 'חשבון ננעל (יותר מדי ניסיונות)',
  PRIVACY_CONSENT: 'אישור מדיניות פרטיות',
}
const TYPE_COLORS: Record<string, string> = {
  LOGIN_SUCCESS: 'bg-green-100 text-green-800',
  LOGIN_FAILURE: 'bg-yellow-100 text-yellow-800',
  LOGIN_LOCKED: 'bg-red-100 text-red-800',
  PRIVACY_CONSENT: 'bg-blue-100 text-blue-800',
}

export default async function SecurityLogPage() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    redirect('/login')
  }

  const logs = await prisma.securityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-1">יומן אבטחת מידע</h1>
      <p className="text-sm text-gray-500 mb-6">
        תיעוד כניסות, ניסיונות התחברות כושלים ואישורי מדיניות פרטיות — 200 האירועים האחרונים.
      </p>

      {logs.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">אין אירועים עדיין</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-right">
                <th className="px-4 py-2.5 font-medium text-gray-500">סוג</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">אימייל</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">IP</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">מועד</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[l.type] || 'bg-gray-100 text-gray-700'}`}>
                      {TYPE_LABELS[l.type] || l.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{l.email || '—'}</td>
                  <td className="px-4 py-2 text-gray-400 font-mono text-xs">{l.ip || '—'}</td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                    {l.createdAt.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
