export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStudentBalance } from '@/lib/balance'
import { createInvoice, type PaymentMethodForInvoice } from '@/lib/morning'
import { sendInvoiceToStudent } from '@/lib/email'

const DEPOSIT_METHODS = ['CASH', 'BIT', 'PAYBOX', 'BANK_TRANSFER', 'EXTERNAL'] as const

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const balance = await getStudentBalance(id)
  return NextResponse.json({ balance })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { amount, method, reference, paidAt } = await req.json()

  if (!DEPOSIT_METHODS.includes(method)) {
    return NextResponse.json({ error: 'אמצעי תשלום לא תקין' }, { status: 400 })
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }

  const student = await prisma.user.findUnique({ where: { id, role: 'STUDENT' } })
  if (!student) return NextResponse.json({ error: 'תלמיד לא נמצא' }, { status: 404 })

  const paidAtDate = paidAt ? new Date(paidAt) : new Date()

  const invoice = await prisma.invoice.create({
    data: { studentId: id, amount, method, reference: reference || null, paidAt: paidAtDate, isDeposit: true },
  })

  // EXTERNAL means this money was already paid and already invoiced on the
  // previous platform — just record the credit locally, no new Morning document.
  let invoiceError: string | null = null
  if (method !== 'EXTERNAL') {
    try {
      const created = await createInvoice({
        student: { name: student.name, email: student.email },
        lines: [{ description: 'הפקדה ליתרה', amount }],
        method: method as PaymentMethodForInvoice,
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
      console.error('Morning deposit invoice failed:', err)
      invoiceError = err.message || 'יצירת החשבונית נכשלה — ניתן לנסות שוב'
    }
  }

  const finalInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } })
  const balance = await getStudentBalance(id)
  return NextResponse.json(
    { ok: true, invoice: finalInvoice, balance, invoiceError },
    { status: invoiceError ? 207 : 200 },
  )
}
