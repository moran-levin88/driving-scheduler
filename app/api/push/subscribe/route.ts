export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Browsers only ever hand back an endpoint on one of their own push
// services — restricting to these (rather than trusting whatever URL the
// client sends) stops a compromised/malicious client from turning this
// into an SSRF primitive: without this check, webpush.sendNotification
// (lib/push.ts) would POST to any URL stored here on every booking event.
const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
]

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const subscription = await req.json()
  const userId = (session.user as any).id

  let endpointUrl: URL
  try {
    endpointUrl = new URL(subscription?.endpoint)
  } catch {
    return NextResponse.json({ error: 'Invalid push endpoint' }, { status: 400 })
  }
  if (endpointUrl.protocol !== 'https:' || !ALLOWED_PUSH_HOSTS.includes(endpointUrl.hostname)) {
    return NextResponse.json({ error: 'Invalid push endpoint' }, { status: 400 })
  }

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
