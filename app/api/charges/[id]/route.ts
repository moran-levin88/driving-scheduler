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
  const charge = await prisma.charge.findUnique({ where: { id } })
  if (!charge) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (charge.invoiceId) {
    return NextResponse.json({ error: 'לא ניתן למחוק — כבר הופקה עבורו חשבונית' }, { status: 409 })
  }
  await prisma.charge.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
