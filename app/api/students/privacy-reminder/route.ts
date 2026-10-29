export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPrivacyConsentReminder } from '@/lib/email'

// Bulk-sends the privacy-policy reminder to every active student who hasn't
// accepted the consent gate yet (app/student/layout.tsx) — mainly students
// the instructor added directly, who never had a registration-time moment
// to consent. A student with no real email on file (instructor quick-add
// without one — see @placeholder.local in app/api/students/route.ts) has
// no address to send to, so they're reported separately rather than
// silently skipped.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const students = await prisma.user.findMany({
    where: { role: 'STUDENT', archivedAt: null, privacyConsentAt: null },
    select: { id: true, name: true, email: true },
  })

  const mailable = students.filter(s => !s.email.includes('@placeholder'))
  const skipped = students.length - mailable.length

  const results = await Promise.allSettled(
    mailable.map(s => sendPrivacyConsentReminder({ name: s.name, email: s.email }))
  )
  const sent = results.filter(r => r.status === 'fulfilled').length
  const failed = results.length - sent

  return NextResponse.json({ ok: true, sent, failed, skippedNoEmail: skipped })
}
