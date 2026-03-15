export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendSmsReminder } from '@/lib/sms'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { student: true, availability: true },
  })

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!booking.student.phone) return NextResponse.json({ error: 'אין מספר טלפון לתלמיד' }, { status: 400 })

  try {
    await sendSmsReminder(booking)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'שגיאה בשליחת WhatsApp' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
