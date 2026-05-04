export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { isRestricted } = await req.json()

  const student = await prisma.user.update({
    where: { id, role: 'STUDENT' },
    data: { isRestricted: !!isRestricted },
    select: { id: true, isRestricted: true },
  })

  return NextResponse.json(student)
}
