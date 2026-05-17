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

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { user: { role: 'INSTRUCTOR' } },
    select: { id: true, endpoint: true, createdAt: true },
  })

  return NextResponse.json({
    count: subscriptions.length,
    devices: subscriptions.map(s => ({
      id: s.id,
      endpoint: s.endpoint.slice(0, 60) + '...',
      createdAt: s.createdAt,
    })),
    vapidConfigured: !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY,
  })
}
