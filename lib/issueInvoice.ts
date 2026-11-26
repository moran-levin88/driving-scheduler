import { prisma } from '@/lib/prisma'
import { findLessonChain } from '@/lib/lessonChain'
import { createInvoice, type PaymentMethodForInvoice } from '@/lib/morning'
import { sendInvoiceToStudent } from '@/lib/email'
import { splitIntoLessonLines } from '@/lib/lessonLabel'
import { lessonPriceOf, excessOver } from '@/lib/overpayment'

export type IssueResult =
  | { ok: true; invoice: { id: string; invoiceId: string | null; invoiceNumber: string | null; invoiceUrl: string | null } }
  // code DATE_REJECTED: Morning refused the (old) payment date — the caller can
  // offer to issue it dated today instead
  | { ok: false; status: number; error: string; code?: 'DATE_REJECTED' | 'BAD_TAX_ID' }

// Issues the Morning document for an Invoice row that was saved without one
// (the payment itself was already recorded — see the comment at the top of
// lib/morning.ts). Shared by the single "נסה שוב" button and the bulk
// "issue all missing" action.
export async function issueMissingInvoice(id: string, opts: { useTodayDate?: boolean; omitTaxId?: boolean } = {}): Promise<IssueResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      student: { select: { name: true, email: true, idNumber: true, pricePer20Min: true } },
      payments: true,
    },
  })
  if (!invoice) return { ok: false, status: 404, error: 'Not found' }
  if (invoice.invoiceId) return { ok: false, status: 409, error: 'כבר הופקה חשבונית' }
  if (invoice.method === 'EXTERNAL') {
    return { ok: false, status: 400, error: 'שולם בפלטפורמה הקודמת — אין להפיק חשבונית' }
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
    let totalExcess = 0
    for (const payment of invoice.payments) {
      const result = await findLessonChain(payment.bookingId, 'APPROVED')
      if (!result) continue
      // From elapsed time, not chain.length * 20 — a row isn't always
      // exactly 20 min (e.g. a 30-min lesson booked directly from the calendar).
      const totalSlots = (result.last.availability.endTime.getTime() - result.first.availability.startTime.getTime()) / (20 * 60 * 1000)
      // One line per lesson, not per chain — an 80-min double books as two
      // 40-min lines, not one "(80 דק')" line.
      // Anything paid beyond what was still owed on the lesson is shown as
      // its own "יתרה" line (same as when the payment was first recorded)
      const earlier = await prisma.payment.aggregate({
        where: { bookingId: payment.bookingId, id: { not: payment.id }, createdAt: { lt: payment.createdAt } },
        _sum: { amount: true },
      })
      const price = lessonPriceOf(invoice.student.pricePer20Min, totalSlots, result.first.discountAmount)
      const excess = excessOver(payment.amount, price, earlier._sum.amount ?? 0)
      totalExcess += excess
      lines.push(...splitIntoLessonLines({
        startTime: result.first.availability.startTime,
        totalSlots,
        totalAmount: payment.amount - excess,
      }))
    }
    if (lines.length > 0 && totalExcess > 0) {
      lines.push({ description: 'יתרה — הפקדה לשיעורים הבאים', amount: totalExcess })
    }
    if (lines.length === 0) {
      return { ok: false, status: 404, error: 'לא נמצאו שיעורים לחשבונית זו' }
    }
  }

  try {
    const created = await createInvoice({
      student: { name: invoice.student.name, email: invoice.student.email, idNumber: invoice.student.idNumber },
      lines,
      method: invoice.method as PaymentMethodForInvoice,
      paidAt: invoice.paidAt,
      reference: invoice.reference || undefined,
      documentDate: opts.useTodayDate ? new Date() : undefined,
      omitTaxId: opts.omitTaxId,
    })

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { invoiceId: created.id, invoiceNumber: created.number, invoiceUrl: created.url },
    })

    if (invoice.student.email && !invoice.student.email.includes('@placeholder')) {
      await sendInvoiceToStudent(
        { name: invoice.student.name, email: invoice.student.email },
        { amount: invoice.amount, invoiceUrl: created.url, invoiceNumber: created.number },
      ).catch(err => console.error('Invoice email failed:', err))
    }

    return { ok: true, invoice: updated }
  } catch (err: any) {
    console.error('Morning invoice issue failed:', err)
    const message: string = err.message || 'יצירת החשבונית נכשלה'
    return { ok: false, status: 502, error: message, code: /"errorCode":\s*2405/.test(message) ? 'DATE_REJECTED' : /"errorCode":\s*1111/.test(message) ? 'BAD_TAX_ID' : undefined }
  }
}
