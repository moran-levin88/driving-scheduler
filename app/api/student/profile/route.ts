export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'STUDENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name } = await req.json()
  if (!name?.trim() || name.trim().length < 2) {
    return NextResponse.json({ error: 'שם חייב להכיל לפחות 2 תווים' }, { status: 400 })
  }

  const userId = (session.user as any).id
  await prisma.user.update({ where: { id: userId }, data: { name: name.trim() } })

  return NextResponse.json({ ok: true, name: name.trim() })
}
