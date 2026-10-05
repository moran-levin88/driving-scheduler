export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findLessonChain } from '@/lib/lessonChain'
import { createInvoice, type PaymentMethodForInvoice } from '@/lib/morning'
import { sendInvoiceToStudent } from '@/lib/email'
import { formatIsraelDate, formatIsraelTime } from '@/lib/israelTime'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { student: true, payments: true },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.invoiceId) return NextResponse.json({ error: 'כבר הופקה חשבונית' }, { status: 409 })
  if (invoice.method === 'EXTERNAL') {
    return NextResponse.json({ error: 'שולם בפלטפורמה הקודמת — אין להפיק חשבונית' }, { status: 400 })
  }

  let lines: { description: string; amount: number }[]
  if (invoice.isDeposit) {
    lines = [{ description: 'הפקדה ליתרה', amount: invoice.amount }]
  } else if (invoice.description) {
    // A one-off charge not tied to any lesson — it never gets a Payment row
    // (see /api/students/[id]/charge), so the lesson lookup below would
    // always come up empty for it.
    lines = [{ description: invoice.description, amount: invoice.amount }]
  } else {
    lines = []
    for (const payment of invoice.payments) {
      const result = await findLessonChain(payment.bookingId, 'APPROVED')
      if (!result) continue
      const dateStr = formatIsraelDate(result.first.availability.startTime)
      const timeStr = formatIsraelTime(result.first.availability.startTime)
      // From elapsed time, not chain.length * 20 — a row isn't always
      // exactly 20 min (e.g. a 30-min lesson booked directly from the calendar).
      const durationMin = Math.round((result.last.availability.endTime.getTime() - result.first.availability.startTime.getTime()) / 60000)
      lines.push({ description: `שיעור נהיגה — ${dateStr} ${timeStr} (${durationMin} דק')`, amount: payment.amount })
    }
    if (lines.length === 0) {
      return NextResponse.json({ error: 'לא נמצאו שיעורים לחשבונית זו' }, { status: 404 })
    }
  }

  try {
    const created = await createInvoice({
      student: { name: invoice.student.name, email: invoice.student.email, idNumber: invoice.student.idNumber },
      lines,
      method: invoice.method as PaymentMethodForInvoice,
      paidAt: invoice.paidAt,
      reference: invoice.reference || undefined,
    })

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { invoiceId: created.id, invoiceNumber: created.number, invoiceUrl: created.url },
    })

    if (invoice.student.email && !invoice.student.email.includes('@placeholder')) {
      sendInvoiceToStudent(
        { name: invoice.student.name, email: invoice.student.email },
        { amount: invoice.amount, invoiceUrl: created.url, invoiceNumber: created.number },
      ).catch(err => console.error('Invoice email failed:', err))
    }

    return NextResponse.json({ ok: true, invoice: updated })
  } catch (err: any) {
    console.error('Morning invoice retry failed:', err)
    return NextResponse.json({ error: err.message || 'יצירת החשבונית נכשלה שוב' }, { status: 502 })
  }
}
