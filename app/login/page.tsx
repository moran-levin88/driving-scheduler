'use client'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (res?.error) {
      setError('שם משתמש או סיסמה שגויים')
      setLoading(false)
      return
    }

    // Fetch session to determine role
    const sessionRes = await fetch('/api/auth/session')
    const session = await sessionRes.json()
    const role = session?.user?.role

    if (role === 'INSTRUCTOR') router.push('/instructor/dashboard')
    else router.push('/student/dashboard')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-blue-50" dir="rtl">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md relative">
        <div className="absolute top-4 left-4">
          <Image src="/instructor.png" alt="Alex" width={48} height={48} className="rounded-full object-cover shadow-sm" />
        </div>
        <div className="text-center mb-6 pt-2">
          <h1 className="text-xl font-bold text-blue-900">כניסה למערכת קביעת שיעורי נהיגה</h1>
          <p className="text-sm text-gray-500 mt-1" style={{ fontFamily: "'Suez One', serif" }}>עם אלכס לוין</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="text-left">
            <Link href="/forgot-password" className="text-xs text-gray-400 hover:text-blue-600 hover:underline">
              שכחתי סיסמה
            </Link>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-600">
          עוד לא נרשמת?{' '}
          <Link href="/register" className="text-blue-600 hover:underline font-medium">
            כאן נרשמים
          </Link>
        </div>
      </div>
    </main>
  )
}
