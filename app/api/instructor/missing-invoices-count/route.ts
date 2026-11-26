export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Read-only: how many recorded payments have no tax invoice yet. EXTERNAL
// (paid on the previous platform) is never invoiced here, so it's excluded.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ count: 0 })
  }
  const count = await prisma.invoice.count({ where: { invoiceId: null, method: { not: 'EXTERNAL' } } })
  return NextResponse.json({ count })
}
