import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

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
        <div className="flex justify-center">
          <Image src="/instructor.png" alt="Alex" width={96} height={96} className="rounded-full object-cover shadow-md" />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-blue-900">שיעורי נהיגה</h1>
          <p className="text-xl font-semibold text-gray-700 mt-1">אלכס לוין</p>
          <p className="text-gray-500 mt-2">קובעים שיעור נהיגה בקליק</p>
        </div>
        <div className="flex gap-4 justify-center">
          <Link href="/login" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium">כניסה למערכת</Link>
          <Link href="/register" className="border-2 border-blue-600 text-blue-600 px-6 py-3 rounded-lg hover:bg-blue-50 transition font-medium">הרשמה לתלמידים</Link>
        </div>
      </div>
    </main>
  )
}
