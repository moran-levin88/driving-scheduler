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

function parseOne(raw: any): { date: Date; lessons: number; amountPaid: number | null } | { error: string } {
  const parsedDate = new Date(raw?.date)
  if (isNaN(parsedDate.getTime())) return { error: 'תאריך לא תקין' }
  const lessonsNum = Number(raw?.lessons)
  if (!Number.isFinite(lessonsNum) || lessonsNum <= 0) return { error: 'כמות שיעורים לא תקינה' }
  const amount = raw?.amountPaid === '' || raw?.amountPaid == null ? null : Number(raw.amountPaid)
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) return { error: 'סכום לא תקין' }
  // Quarter-lesson precision, matching manualPriorLessons elsewhere in the app
  return { date: parsedDate, lessons: Math.round(lessonsNum * 4) / 4, amountPaid: amount }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()

  const student = await prisma.user.findUnique({ where: { id, role: 'STUDENT' } })
  if (!student) return NextResponse.json({ error: 'תלמיד לא נמצא' }, { status: 404 })

  // Bulk mode — used by the one-time legacy-history import review
  if (Array.isArray(body.records)) {
    const parsed = body.records.map(parseOne)
    const bad = parsed.find((p: any) => 'error' in p)
    if (bad) return NextResponse.json({ error: (bad as any).error }, { status: 400 })
    const created = await prisma.manualLessonRecord.createMany({
      data: parsed.map((p: any) => ({ studentId: id, date: p.date, lessons: p.lessons, amountPaid: p.amountPaid })),
    })
    return NextResponse.json({ count: created.count }, { status: 201 })
  }

  const parsed = parseOne(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const record = await prisma.manualLessonRecord.create({
    data: { studentId: id, date: parsed.date, lessons: parsed.lessons, amountPaid: parsed.amountPaid },
  })

  return NextResponse.json(record, { status: 201 })
}
