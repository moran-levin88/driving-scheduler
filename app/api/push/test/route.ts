export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import webpush from 'web-push'
import { prisma } from '@/lib/prisma'

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.INSTRUCTOR_EMAIL || 'admin@example.com'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const instructor = await prisma.user.findFirst({
    where: { role: 'INSTRUCTOR' },
    select: { pushSubscription: true },
  })

  if (!instructor?.pushSubscription) {
    return NextResponse.json({ error: 'אין subscription שמור' }, { status: 400 })
  }

  try {
    const sub = JSON.parse(instructor.pushSubscription)
    const result = await webpush.sendNotification(
      sub,
      JSON.stringify({ title: '🔔 בדיקת Push', body: 'Push עובד!', url: '/instructor/dashboard' })
    )
    return NextResponse.json({ ok: true, statusCode: result.statusCode })
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      statusCode: err.statusCode ?? err.response?.statusCode ?? 'unknown',
      body: err.body,
    }, { status: 500 })
  }
}
