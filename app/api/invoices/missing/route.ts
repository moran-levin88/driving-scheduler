export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { issueMissingInvoice } from '@/lib/issueInvoice'

// Payments that were recorded but never got a Morning document (Morning was
// down / rejected the call). EXTERNAL = paid on the previous platform, never
// invoiced here on purpose.
const MISSING = { invoiceId: null, method: { not: 'EXTERNAL' as const } }

async function requireInstructor() {
  const session = await getServerSession(authOptions)
  return !!session && (session.user as any).role === 'INSTRUCTOR'
}

export async function GET() {
  if (!(await requireInstructor())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [count, oldest] = await Promise.all([
    prisma.invoice.count({ where: MISSING }),
    prisma.invoice.findFirst({ where: MISSING, orderBy: { paidAt: 'asc' }, select: { paidAt: true } }),
  ])
  return NextResponse.json({ count, oldestPaidAt: oldest?.paidAt ?? null })
}

// Issues the missing documents, oldest first (tax documents should be issued
// in date order), a limited batch per call so it fits the function time
// limit — the caller keeps calling until `remaining` is 0. Stops early if
// Morning itself is failing (auth/outage) instead of hammering it.
export async function POST() {
  if (!(await requireInstructor())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const BATCH = 8
  const pending = await prisma.invoice.findMany({
    where: MISSING,
    orderBy: { paidAt: 'asc' },
    select: { id: true },
    take: BATCH,
  })

  let issued = 0
  const failures: { id: string; error: string }[] = []
  for (const { id } of pending) {
    const r = await issueMissingInvoice(id)
    if (r.ok) {
      issued++
    } else {
      failures.push({ id, error: r.error })
      // Auth/outage — every remaining one would fail the same way
      if (r.status === 502 && /auth failed|not configured/i.test(r.error)) break
    }
  }

  const remaining = await prisma.invoice.count({ where: MISSING })
  return NextResponse.json({ issued, failures, remaining, attempted: pending.length })
}
