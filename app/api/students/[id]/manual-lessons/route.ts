export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const records = await prisma.manualLessonRecord.findMany({
    where: { studentId: id },
    orderBy: { date: 'asc' },
  })
  return NextResponse.json(records)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const { date, lessons, amountPaid } = await req.json()

  const parsedDate = new Date(date)
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: 'תאריך לא תקין' }, { status: 400 })
  }
  const lessonsNum = Number(lessons)
  if (!Number.isFinite(lessonsNum) || lessonsNum <= 0) {
    return NextResponse.json({ error: 'כמות שיעורים לא תקינה' }, { status: 400 })
  }
  const amount = amountPaid === '' || amountPaid == null ? null : Number(amountPaid)
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }

  const student = await prisma.user.findUnique({ where: { id, role: 'STUDENT' } })
  if (!student) return NextResponse.json({ error: 'תלמיד לא נמצא' }, { status: 404 })

  // Quarter-lesson precision, matching manualPriorLessons elsewhere in the app
  const roundedLessons = Math.round(lessonsNum * 4) / 4

  const record = await prisma.manualLessonRecord.create({
    data: { studentId: id, date: parsedDate, lessons: roundedLessons, amountPaid: amount },
  })

  return NextResponse.json(record, { status: 201 })
}
