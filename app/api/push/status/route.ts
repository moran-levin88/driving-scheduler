export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const instructor = await prisma.user.findFirst({
    where: { role: 'INSTRUCTOR' },
    select: { pushSubscription: true },
  })

  const hasSubscription = !!instructor?.pushSubscription
  const endpoint = instructor?.pushSubscription
    ? JSON.parse(instructor.pushSubscription).endpoint?.slice(0, 60) + '...'
    : null

  return NextResponse.json({
    hasSubscription,
    endpoint,
    vapidConfigured: !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY,
  })
}
