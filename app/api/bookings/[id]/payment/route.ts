export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findLessonChain } from '@/lib/lessonChain'
import { createInvoice, type PaymentMethodForInvoice } from '@/lib/morning'
import { sendInvoiceToStudent } from '@/lib/email'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

const METHODS: PaymentMethodForInvoice[] = ['CASH', 'BIT', 'PAYBOX', 'BANK_TRANSFER']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { amount, method, reference, paidAt } = await req.json()

  if (!METHODS.includes(method)) {
    return NextResponse.json({ error: 'אמצעי תשלום לא תקין' }, { status: 400 })
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }

  const result = await findLessonChain(id, 'APPROVED')
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { chain, first } = result

  const existing = await prisma.payment.findUnique({ where: { bookingId: first.id } })
  if (existing) {
    return NextResponse.json({ error: 'כבר נרשם תשלום לשיעור הזה' }, { status: 409 })
  }

  const paidAtDate = paidAt ? new Date(paidAt) : new Date()

  const payment = await prisma.payment.create({
    data: {
      bookingId: first.id,
      studentId: first.studentId,
      amount,
      method,
      reference: reference || null,
      paidAt: paidAtDate,
    },
  })

  const dateStr = format(first.availability.startTime, "d בMMMM yyyy", { locale: he })
  const timeStr = format(first.availability.startTime, 'HH:mm')
  const description = `שיעור נהיגה — ${dateStr} ${timeStr} (${chain.length * 20} דק')`

  try {
    const invoice = await createInvoice({
      student: { name: first.student.name, email: first.student.email },
      description,
      amount,
      method,
      paidAt: paidAtDate,
    })

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { invoiceId: invoice.id, invoiceNumber: invoice.number, invoiceUrl: invoice.url },
    })

    if (first.student.email && !first.student.email.includes('@placeholder')) {
      sendInvoiceToStudent(
        { name: first.student.name, email: first.student.email },
        { amount, invoiceUrl: invoice.url, invoiceNumber: invoice.number },
      ).catch(err => console.error('Invoice email failed:', err))
    }

    return NextResponse.json({ ok: true, payment: updated })
  } catch (err: any) {
    console.error('Morning invoice creation failed:', err)
    return NextResponse.json(
      { ok: true, payment, invoiceError: err.message || 'יצירת החשבונית נכשלה — ניתן לנסות שוב' },
      { status: 207 },
    )
  }
}

// Returns the Payment for the lesson this booking belongs to, if any —
// lets the calendar UI show paid/unpaid state for a given lesson.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const result = await findLessonChain(id, 'APPROVED')
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const payment = await prisma.payment.findUnique({ where: { bookingId: result.first.id } })
  return NextResponse.json({ payment })
}

// Edits the local record only (amount/method/reference/date) for a mistaken
// entry — does NOT touch an already-issued Morning document. Cancelling an
// issued tax invoice requires a formal credit note (זיכוי) via Morning itself.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { amount, method, reference, paidAt } = await req.json()
  if (method !== undefined && !METHODS.includes(method)) {
    return NextResponse.json({ error: 'אמצעי תשלום לא תקין' }, { status: 400 })
  }
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }

  const result = await findLessonChain(id, 'APPROVED')
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existing = await prisma.payment.findUnique({ where: { bookingId: result.first.id } })
  if (!existing) return NextResponse.json({ error: 'לא נמצא תשלום לשיעור הזה' }, { status: 404 })

  const updated = await prisma.payment.update({
    where: { id: existing.id },
    data: {
      ...(amount !== undefined && { amount }),
      ...(method !== undefined && { method }),
      ...(reference !== undefined && { reference: reference || null }),
      ...(paidAt !== undefined && { paidAt: new Date(paidAt) }),
    },
  })
  return NextResponse.json({ ok: true, payment: updated })
}
