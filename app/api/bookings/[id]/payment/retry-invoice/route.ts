export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findLessonChain } from '@/lib/lessonChain'
import { createInvoice } from '@/lib/morning'
import { sendInvoiceToStudent } from '@/lib/email'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const result = await findLessonChain(id, 'APPROVED')
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { chain, first } = result

  const payment = await prisma.payment.findUnique({ where: { bookingId: first.id } })
  if (!payment) return NextResponse.json({ error: 'לא נמצא תשלום לשיעור הזה' }, { status: 404 })
  if (payment.invoiceId) return NextResponse.json({ error: 'כבר הופקה חשבונית' }, { status: 409 })

  const dateStr = format(first.availability.startTime, "d בMMMM yyyy", { locale: he })
  const timeStr = format(first.availability.startTime, 'HH:mm')
  const description = `שיעור נהיגה — ${dateStr} ${timeStr} (${chain.length * 20} דק')`

  try {
    const invoice = await createInvoice({
      student: { name: first.student.name, email: first.student.email },
      description,
      amount: payment.amount,
      method: payment.method,
      paidAt: payment.paidAt,
    })

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { invoiceId: invoice.id, invoiceNumber: invoice.number, invoiceUrl: invoice.url },
    })

    if (first.student.email && !first.student.email.includes('@placeholder')) {
      sendInvoiceToStudent(
        { name: first.student.name, email: first.student.email },
        { amount: payment.amount, invoiceUrl: invoice.url, invoiceNumber: invoice.number },
      ).catch(err => console.error('Invoice email failed:', err))
    }

    return NextResponse.json({ ok: true, payment: updated })
  } catch (err: any) {
    console.error('Morning invoice retry failed:', err)
    return NextResponse.json({ error: err.message || 'יצירת החשבונית נכשלה שוב' }, { status: 502 })
  }
}
