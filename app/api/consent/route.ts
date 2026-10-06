export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSecurityEvent } from '@/lib/securityLog'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'STUDENT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any).id
  await prisma.user.update({ where: { id: userId }, data: { privacyConsentAt: new Date() } })
  await logSecurityEvent({ type: 'PRIVACY_CONSENT', userId, email: session.user?.email, detail: 'consent gate' })

  return NextResponse.json({ ok: true })
}
