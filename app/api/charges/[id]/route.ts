export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteCalendarEvent } from '@/lib/calendar'
import { archiveStudent } from '@/lib/archiveStudent'

// Marks a practical test as passed/failed. Passing one archives the
// student — they're done, can't book further lessons, but every lesson/
// test/payment they ever had stays fully in the system and reports.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const { passed } = await req.json()
  if (typeof passed !== 'boolean') {
    return NextResponse.json({ error: 'ערך לא תקין' }, { status: 400 })
  }
  const charge = await prisma.charge.findUnique({ where: { id } })
  if (!charge) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.charge.update({ where: { id }, data: { passed } })

  if (passed && charge.type === 'PRACTICAL_TEST') {
    await archiveStudent(charge.studentId)
  }

  return NextResponse.json({ ok: true, archived: passed && charge.type === 'PRACTICAL_TEST' })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const charge = await prisma.charge.findUnique({ where: { id } })
  if (!charge) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (charge.invoiceId) {
    return NextResponse.json({ error: 'לא ניתן למחוק — כבר הופקה עבורו חשבונית' }, { status: 409 })
  }
  if (charge.calendarEventId) {
    await deleteCalendarEvent(charge.calendarEventId)
  }
  await prisma.charge.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
