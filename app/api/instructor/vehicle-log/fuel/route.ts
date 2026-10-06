export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDefaultVehicle } from '@/lib/vehicle'

// Tosefet Z section 3(ד) — every fuel purchase for the vehicle.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { date, liters, amount, note } = await req.json()
  if (!date) return NextResponse.json({ error: 'יש לבחור תאריך' }, { status: 400 })
  const litersNum = Number(liters)
  if (!Number.isFinite(litersNum) || litersNum <= 0) {
    return NextResponse.json({ error: 'כמות דלק לא תקינה' }, { status: 400 })
  }

  const vehicle = await getDefaultVehicle()
  const purchase = await prisma.fuelPurchase.create({
    data: {
      vehicleId: vehicle.id,
      date: new Date(date),
      liters: litersNum,
      amount: amount === '' || amount == null ? null : Number(amount),
      note: note?.trim() || null,
    },
  })

  return NextResponse.json(purchase, { status: 201 })
}
