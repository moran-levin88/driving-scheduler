export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const subscription = await req.json()
  const userId = (session.user as any).id

  // Upsert by endpoint — each device/browser keeps its own subscription row
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { userId, endpoint: subscription.endpoint, payload: subscription },
    update: { payload: subscription },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = (session.user as any).id
  await prisma.pushSubscription.deleteMany({ where: { userId } })
  return NextResponse.json({ ok: true })
}
