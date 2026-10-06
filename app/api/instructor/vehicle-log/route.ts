export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDefaultVehicle } from '@/lib/vehicle'

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

// One row per day that had any vehicle activity — an odometer reading, a
// lesson, or a fuel purchase — within the requested month. Per-lesson
// details come straight from Booking/Availability rather than a separate
// table, so this is the one place that assembles ספר הרכב for display/print.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const monthParam = new URL(req.url).searchParams.get('month') // "YYYY-MM"
  const now = new Date()
  const [y, m] = monthParam ? monthParam.split('-').map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1]
  const monthStart = new Date(Date.UTC(y, m - 1, 1))
  const monthEnd = new Date(Date.UTC(y, m, 1))

  const vehicle = await getDefaultVehicle()

  const [odometerLogs, fuelPurchases, bookings] = await Promise.all([
    prisma.vehicleOdometerLog.findMany({
      where: { vehicleId: vehicle.id, date: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.fuelPurchase.findMany({
      where: { vehicleId: vehicle.id, date: { gte: monthStart, lt: monthEnd } },
      orderBy: { date: 'asc' },
    }),
    prisma.booking.findMany({
      where: {
        status: { in: ['APPROVED', 'COMPLETED'] },
        availability: { startTime: { gte: monthStart, lt: monthEnd } },
      },
      include: {
        student: { select: { name: true } },
        availability: { select: { startTime: true } },
      },
      orderBy: { availability: { startTime: 'asc' } },
    }),
  ])

  type Day = {
    date: string
    odometerKm: number | null
    lessons: { studentName: string; time: string }[]
    fuel: { id: string; liters: number; amount: number | null; note: string | null }[]
  }
  const days = new Map<string, Day>()
  function ensure(key: string) {
    let d = days.get(key)
    if (!d) {
      d = { date: key, odometerKm: null, lessons: [], fuel: [] }
      days.set(key, d)
    }
    return d
  }

  for (const log of odometerLogs) ensure(dayKey(log.date)).odometerKm = log.odometerKm
  for (const f of fuelPurchases) {
    ensure(dayKey(f.date)).fuel.push({ id: f.id, liters: f.liters, amount: f.amount, note: f.note })
  }
  for (const b of bookings) {
    ensure(dayKey(b.availability.startTime)).lessons.push({
      studentName: b.student.name,
      time: b.availability.startTime.toISOString(),
    })
  }

  const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({
    vehicle: { licensePlate: vehicle.licensePlate, label: vehicle.label },
    days: sortedDays,
  })
}
