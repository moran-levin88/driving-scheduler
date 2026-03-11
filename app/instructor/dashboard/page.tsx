import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import Image from 'next/image'

export default async function InstructorDashboard() {
  const session = await getServerSession(authOptions)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  const [pendingCount, todayLessons, totalStudents] = await Promise.all([
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.booking.findMany({
      where: {
        status: 'APPROVED',
        availability: { startTime: { gte: todayStart, lt: todayEnd } },
      },
      include: {
        student: { select: { name: true } },
        availability: true,
      },
      orderBy: { availability: { startTime: 'asc' } },
    }),
    prisma.user.count({ where: { role: 'STUDENT' } }),
  ])

  const instructorName = (session?.user as any)?.name || 'מורה'

  return (
    <div>
      {/* Hero banner */}
      <div className="bg-gradient-to-l from-blue-600 to-blue-800 rounded-2xl p-6 mb-8 flex items-center justify-between overflow-hidden relative">
        <div>
          <p className="text-blue-200 text-sm mb-1" style={{ fontFamily: "'Choco Cooky', 'Fredoka One', cursive" }}>
            ברוך הבא
          </p>
          <h1
            className="text-4xl font-bold text-white mb-2"
            style={{ fontFamily: "'Choco Cooky', 'Fredoka One', cursive" }}
          >
            {instructorName}
          </h1>
          <p className="text-blue-100 text-sm">מערכת ניהול שיעורי נהיגה</p>
        </div>
        <div className="relative w-32 h-32 flex-shrink-0">
          <Image
            src="/instructor.png"
            alt="מורה נהיגה"
            fill
            className="object-contain drop-shadow-xl"
            priority
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow p-6 border-r-4 border-orange-400">
          <p className="text-sm text-gray-500">בקשות ממתינות לאישור</p>
          <p className="text-4xl font-bold text-orange-500 mt-2">{pendingCount}</p>
          <Link href="/instructor/bookings?status=PENDING" className="text-blue-600 text-sm hover:underline mt-2 block">
            צפה בבקשות &larr;
          </Link>
        </div>
        <div className="bg-white rounded-xl shadow p-6 border-r-4 border-blue-500">
          <p className="text-sm text-gray-500">שיעורים היום</p>
          <p className="text-4xl font-bold text-blue-600 mt-2">{todayLessons.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6 border-r-4 border-green-500">
          <p className="text-sm text-gray-500">סה&quot;כ תלמידים</p>
          <p className="text-4xl font-bold text-green-600 mt-2">{totalStudents}</p>
        </div>
      </div>

      {/* Today's lessons */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2
          className="text-xl font-bold text-gray-800 mb-4"
          style={{ fontFamily: "'Choco Cooky', 'Fredoka One', cursive" }}
        >
          שיעורים היום
        </h2>
        {todayLessons.length === 0 ? (
          <p className="text-gray-500">אין שיעורים מתוכננים להיום</p>
        ) : (
          <div className="space-y-3">
            {todayLessons.map(b => (
              <div key={b.id} className="flex items-center justify-between border-b pb-3">
                <span className="font-medium">{b.student.name}</span>
                <span className="text-gray-600">
                  {format(b.availability.startTime, 'HH:mm')} - {format(b.availability.endTime, 'HH:mm')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
