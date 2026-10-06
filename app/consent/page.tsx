'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import Link from 'next/link'

export default function ConsentGatePage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function accept() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/consent', { method: 'POST' })
    if (res.ok) {
      router.push('/student/dashboard')
      router.refresh()
    } else {
      setError('שגיאה — נסה/י שוב')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-blue-50 px-4" dir="rtl">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-xl font-bold text-blue-900 mb-2">עדכון מדיניות פרטיות</h1>
        <p className="text-gray-600 text-sm mb-4">
          עדכנו את מדיניות הפרטיות שלנו, שמסבירה אילו פרטים נשמרים עליך במערכת ולמה. כדי להמשיך להשתמש
          במערכת יש לאשר אותה.
        </p>
        <Link href="/privacy" target="_blank" className="text-blue-600 hover:underline text-sm font-medium block mb-5">
          קריאת מדיניות הפרטיות המלאה
        </Link>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <button onClick={accept} disabled={loading}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium mb-3">
          {loading ? 'שומר...' : 'קראתי ואני מסכים/ה'}
        </button>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-gray-400 hover:text-gray-600 text-sm transition">
          התנתקות
        </button>
      </div>
    </main>
  )
}
