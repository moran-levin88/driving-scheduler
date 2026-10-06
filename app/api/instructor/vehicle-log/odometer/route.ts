export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDefaultVehicle } from '@/lib/vehicle'

// Tosefet Z section 3(ב) — the day's opening odometer reading. Upserts so
// re-entering the same date corrects it rather than creating a duplicate.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { date, odometerKm } = await req.json()
  if (!date) return NextResponse.json({ error: 'יש לבחור תאריך' }, { status: 400 })
  const km = Number(odometerKm)
  if (!Number.isFinite(km) || km < 0) {
    return NextResponse.json({ error: 'קריאת ק"מ לא תקינה' }, { status: 400 })
  }

  const vehicle = await getDefaultVehicle()
  const day = new Date(date)

  const log = await prisma.vehicleOdometerLog.upsert({
    where: { vehicleId_date: { vehicleId: vehicle.id, date: day } },
    update: { odometerKm: km },
    create: { vehicleId: vehicle.id, date: day, odometerKm: km },
  })

  return NextResponse.json(log)
}
