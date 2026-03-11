import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function Home() {
  const session = await getServerSession(authOptions)
  if (session) {
    const role = (session.user as any).role
    if (role === 'INSTRUCTOR') redirect('/instructor/dashboard')
    if (role === 'STUDENT') redirect('/student/dashboard')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-blue-50" dir="rtl">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-blue-900">מערכת לקביעת שיעורי נהיגה</h1>
        <p className="text-gray-600 text-lg">קבע שיעור נהיגה בקלות ובנוחות</p>
        <div className="flex gap-4 justify-center">
          <Link href="/login" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition">כניסה למערכת</Link>
          <Link href="/register" className="border border-blue-600 text-blue-600 px-6 py-3 rounded-lg hover:bg-blue-50 transition">הרשמה לתלמידים</Link>
        </div>
      </div>
    </main>
  )
}
