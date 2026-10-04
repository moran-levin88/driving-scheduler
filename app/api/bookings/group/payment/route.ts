export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findLessonChain, type ChainBooking } from '@/lib/lessonChain'
import { createInvoice, type PaymentMethodForInvoice } from '@/lib/morning'
import { sendInvoiceToStudent } from '@/lib/email'
import { getStudentBalance } from '@/lib/balance'
import { formatIsraelDate, formatIsraelTime } from '@/lib/israelTime'

const METHODS = ['CASH', 'BIT', 'PAYBOX', 'BANK_TRANSFER', 'BALANCE', 'EXTERNAL'] as const

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { items, method, reference, paidAt, note } = await req.json()

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'לא נבחרו שיעורים' }, { status: 400 })
  }
  if (!METHODS.includes(method)) {
    return NextResponse.json({ error: 'אמצעי תשלום לא תקין' }, { status: 400 })
  }
  for (const it of items) {
    // EXTERNAL just records "already settled elsewhere" — no real amount required,
    // since the instructor may be clearing out legacy rows with no price on file.
    const amountOk = method === 'EXTERNAL' ? Number.isFinite(it.amount) && it.amount >= 0 : Number.isFinite(it.amount) && it.amount > 0
    if (!it.bookingId || !amountOk) {
      return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
    }
  }

  // Resolve each booking id to its lesson (first booking of the chain)
  const resolved: { first: ChainBooking; chainLength: number; amount: number }[] = []
  for (const it of items) {
    const result = await findLessonChain(it.bookingId, 'APPROVED')
    if (!result) return NextResponse.json({ error: 'שיעור לא נמצא' }, { status: 404 })
    resolved.push({ first: result.first, chainLength: result.chain.length, amount: it.amount })
  }

  const studentId = resolved[0].first.studentId
  if (resolved.some(r => r.first.studentId !== studentId)) {
    return NextResponse.json({ error: 'כל השיעורים חייבים להיות של אותו תלמיד' }, { status: 400 })
  }

  const student = resolved[0].first.student

  // A lesson can be settled across more than one payment (e.g. partial now,
  // the rest later) — only block when it's already fully paid. With no
  // price on file there's no way to know "fully paid", so don't block.
  const firstIds = resolved.map(r => r.first.id)
  const existing = await prisma.payment.findMany({ where: { bookingId: { in: firstIds } } })
  const paidByBooking = new Map<string, number>()
  for (const p of existing) paidByBooking.set(p.bookingId, (paidByBooking.get(p.bookingId) ?? 0) + p.amount)

  if (student.pricePer20Min != null) {
    for (const r of resolved) {
      const price = student.pricePer20Min * r.chainLength
      const paidSoFar = paidByBooking.get(r.first.id) ?? 0
      if (price - paidSoFar <= 0) {
        return NextResponse.json({ error: 'אחד השיעורים כבר שולם במלואו' }, { status: 409 })
      }
    }
  }

  const total = resolved.reduce((sum, r) => sum + r.amount, 0)
  const paidAtDate = paidAt ? new Date(paidAt) : new Date()

  // BALANCE draws down the student's prepaid credit; EXTERNAL just records
  // that a lesson was already settled outside this system (e.g. the
  // previous platform) — neither creates a Morning document.
  if (method === 'BALANCE' || method === 'EXTERNAL') {
    if (method === 'BALANCE') {
      const balance = await getStudentBalance(studentId)
      if (balance < total) {
        return NextResponse.json({ error: `אין מספיק יתרה (יתרה זמינה: ₪${balance})` }, { status: 409 })
      }
    }
    const payments = await prisma.$transaction(
      resolved.map(r => prisma.payment.create({
        data: { bookingId: r.first.id, studentId, amount: r.amount, method, paidAt: paidAtDate },
      }))
    )
    return NextResponse.json({ ok: true, payments })
  }

  const noteText = typeof note === 'string' ? note.trim() : ''

  const lines = resolved.map(r => {
    const dateStr = formatIsraelDate(r.first.availability.startTime)
    const timeStr = formatIsraelTime(r.first.availability.startTime)
    const base = `שיעור נהיגה — ${dateStr} ${timeStr} (${r.chainLength * 20} דק')`
    return { description: noteText ? `${base} — ${noteText}` : base, amount: r.amount }
  })

  // Always create the Invoice row (even if the Morning call below fails) so
  // the money is on record and retryable via /api/invoices/[id]/retry.
  // The note (e.g. "paying off a partial-price debt from the previous
  // platform") is saved as the invoice description so both the app and the
  // actual Morning document explain an amount that doesn't match the full price.
  const invoice = await prisma.invoice.create({
    data: { studentId, amount: total, method, reference: reference || null, paidAt: paidAtDate, description: noteText || null },
  })

  let invoiceError: string | null = null
  try {
    const created = await createInvoice({
      student: { name: student.name, email: student.email, idNumber: student.idNumber },
      lines,
      method: method as PaymentMethodForInvoice,
      paidAt: paidAtDate,
      reference: reference || undefined,
    })
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { invoiceId: created.id, invoiceNumber: created.number, invoiceUrl: created.url },
    })
    if (student.email && !student.email.includes('@placeholder')) {
      sendInvoiceToStudent(
        { name: student.name, email: student.email },
        { amount: total, invoiceUrl: created.url, invoiceNumber: created.number },
      ).catch(err => console.error('Invoice email failed:', err))
    }
  } catch (err: any) {
    console.error('Morning invoice creation failed:', err)
    invoiceError = err.message || 'יצירת החשבונית נכשלה — ניתן לנסות שוב'
  }

  const payments = await prisma.$transaction(
    resolved.map(r => prisma.payment.create({
      data: { bookingId: r.first.id, studentId, amount: r.amount, method, invoiceId: invoice.id, paidAt: paidAtDate },
    }))
  )

  const finalInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } })
  return NextResponse.json(
    { ok: true, invoice: finalInvoice, payments, invoiceError },
    { status: invoiceError ? 207 : 200 },
  )
}
