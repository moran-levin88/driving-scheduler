export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendLessonReminder } from '@/lib/email'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000)

  const bookings = await prisma.booking.findMany({
    where: {
      status: 'APPROVED',
      reminderSent: false,
      availability: {
        startTime: { gte: now, lte: in25Hours },
      },
    },
    include: {
      student: true,
      availability: true,
    },
  })

  for (const booking of bookings) {
    try {
      await sendLessonReminder(booking)
      await prisma.booking.update({
        where: { id: booking.id },
        data: { reminderSent: true },
      })
    } catch (err) {
      console.error(`Failed to send reminder for booking ${booking.id}:`, err)
    }
  }

  return NextResponse.json({ sent: bookings.length })
}
