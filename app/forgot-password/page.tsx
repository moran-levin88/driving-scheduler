import Link from 'next/link'

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-blue-50" dir="rtl">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md text-center">
        <div className="text-4xl mb-4">🔑</div>
        <h1 className="text-xl font-bold text-blue-900 mb-2">שכחת סיסמה?</h1>
        <p className="text-gray-600 mb-6">
          כדי לאפס את הסיסמה, צור/י קשר עם המורה אלכס לוין.
        </p>
        <Link href="/login"
          className="block w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium">
          חזרה לכניסה
        </Link>
      </div>
    </main>
  )
}
