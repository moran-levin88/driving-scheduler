export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const record = await prisma.manualLessonRecord.findUnique({ where: { id } })
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.manualLessonRecord.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
