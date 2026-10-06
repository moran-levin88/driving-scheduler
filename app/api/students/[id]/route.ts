export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()

  const data: {
    isRestricted?: boolean; name?: string; email?: string; phone?: string | null
    pricePer20Min?: number | null; idNumber?: string | null; dateOfBirth?: Date | null
    address?: string | null
    manualPriorLessons?: number; manualPriorOtherTeacherLessons?: number
    manualPriorPracticalTests?: number; manualPriorInternalTests?: number
    previousPlatformDebt?: number
    archivedAt?: null
  } = {}
  if (body.reactivate === true) data.archivedAt = null
  if ('isRestricted' in body) data.isRestricted = !!body.isRestricted
  if ('name' in body) {
    const name = String(body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'שם לא יכול להיות ריק' }, { status: 400 })
    data.name = name
  }
  if ('email' in body) {
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'אימייל לא יכול להיות ריק' }, { status: 400 })
    data.email = email
  }
  if ('phone' in body) {
    const phone = String(body.phone ?? '').trim()
    data.phone = phone || null
  }
  if ('pricePer20Min' in body) {
    const price = body.pricePer20Min === null || body.pricePer20Min === '' ? null : Number(body.pricePer20Min)
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      return NextResponse.json({ error: 'מחיר לא תקין' }, { status: 400 })
    }
    data.pricePer20Min = price
  }
  if ('idNumber' in body) {
    const idNumber = String(body.idNumber ?? '').trim()
    data.idNumber = idNumber || null
  }
  if ('dateOfBirth' in body) {
    data.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null
  }
  if ('address' in body) {
    const address = String(body.address ?? '').trim()
    data.address = address || null
  }
  if ('manualPriorLessons' in body) {
    const raw = Number(body.manualPriorLessons)
    if (!Number.isFinite(raw) || raw < 0) {
      return NextResponse.json({ error: 'מספר שיעורים לא תקין' }, { status: 400 })
    }
    // Quarter-lesson precision (10 min, a quarter of the standard 40-min
    // lesson) — round here so totals stay exact when added to the
    // real-booking count elsewhere, which is always a multiple of 0.5.
    data.manualPriorLessons = Math.round(raw * 4) / 4
  }
  if ('manualPriorOtherTeacherLessons' in body) {
    const raw = Number(body.manualPriorOtherTeacherLessons)
    if (!Number.isFinite(raw) || raw < 0) {
      return NextResponse.json({ error: 'מספר שיעורים לא תקין' }, { status: 400 })
    }
    data.manualPriorOtherTeacherLessons = Math.round(raw * 4) / 4
  }
  if ('manualPriorPracticalTests' in body) {
    const raw = Number(body.manualPriorPracticalTests)
    if (!Number.isFinite(raw) || raw < 0) {
      return NextResponse.json({ error: 'כמות מבחנים מעשיים לא תקינה' }, { status: 400 })
    }
    data.manualPriorPracticalTests = Math.round(raw)
  }
  if ('manualPriorInternalTests' in body) {
    const raw = Number(body.manualPriorInternalTests)
    if (!Number.isFinite(raw) || raw < 0) {
      return NextResponse.json({ error: 'כמות טסטים פנימיים לא תקינה' }, { status: 400 })
    }
    data.manualPriorInternalTests = Math.round(raw)
  }
  if ('previousPlatformDebt' in body) {
    const raw = Number(body.previousPlatformDebt)
    if (!Number.isFinite(raw) || raw < 0) {
      return NextResponse.json({ error: 'סכום חוב לא תקין' }, { status: 400 })
    }
    data.previousPlatformDebt = Math.round(raw)
  }

  try {
    const student = await prisma.user.update({
      where: { id, role: 'STUDENT' },
      data,
      select: {
        id: true, name: true, email: true, phone: true, isRestricted: true,
        pricePer20Min: true, idNumber: true, dateOfBirth: true, address: true, manualPriorLessons: true,
        manualPriorOtherTeacherLessons: true,
        manualPriorPracticalTests: true, manualPriorInternalTests: true, previousPlatformDebt: true,
      },
    })
    return NextResponse.json(student)
  } catch (err: any) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'כתובת האימייל כבר בשימוש על ידי משתמש אחר' }, { status: 409 })
    }
    throw err
  }
}
