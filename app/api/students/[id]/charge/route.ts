export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createInvoice, type PaymentMethodForInvoice } from '@/lib/morning'
import { sendInvoiceToStudent } from '@/lib/email'

const CHARGE_METHODS: PaymentMethodForInvoice[] = ['CASH', 'BIT', 'PAYBOX', 'BANK_TRANSFER']

// A one-off charge not tied to any lesson — e.g. providing the car for the
// practical/internal test. Issues its own invoice, same as a deposit, but
// doesn't touch the student's balance (isDeposit stays false).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { description, amount, method, reference, paidAt } = await req.json()

  const desc = String(description ?? '').trim()
  if (!desc) {
    return NextResponse.json({ error: 'יש להזין תיאור לחיוב' }, { status: 400 })
  }
  if (!CHARGE_METHODS.includes(method)) {
    return NextResponse.json({ error: 'אמצעי תשלום לא תקין' }, { status: 400 })
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }

  const student = await prisma.user.findUnique({ where: { id, role: 'STUDENT' } })
  if (!student) return NextResponse.json({ error: 'תלמיד לא נמצא' }, { status: 404 })

  const paidAtDate = paidAt ? new Date(paidAt) : new Date()

  const invoice = await prisma.invoice.create({
    data: { studentId: id, amount, method, reference: reference || null, paidAt: paidAtDate, description: desc },
  })

  let invoiceError: string | null = null
  try {
    const created = await createInvoice({
      student: { name: student.name, email: student.email },
      lines: [{ description: desc, amount }],
      method,
      paidAt: paidAtDate,
    })
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { invoiceId: created.id, invoiceNumber: created.number, invoiceUrl: created.url },
    })
    if (student.email && !student.email.includes('@placeholder')) {
      sendInvoiceToStudent(
        { name: student.name, email: student.email },
        { amount, invoiceUrl: created.url, invoiceNumber: created.number },
      ).catch(err => console.error('Invoice email failed:', err))
    }
  } catch (err: any) {
    console.error('Morning one-off charge invoice failed:', err)
    invoiceError = err.message || 'יצירת החשבונית נכשלה — ניתן לנסות שוב'
  }

  const finalInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } })
  return NextResponse.json(
    { ok: true, invoice: finalInvoice, invoiceError },
    { status: invoiceError ? 207 : 200 },
  )
}
