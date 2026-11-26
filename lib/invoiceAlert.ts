import { sendPushToInstructor } from '@/lib/push'

// A payment is saved even when Morning refuses to issue its tax invoice, so a
// failure here is silent unless the instructor is told — the one-time error
// dialog at payment time is easy to dismiss and forget (that's how weeks of
// missing invoices went unnoticed). Awaited (not fire-and-forget) so the push
// actually goes out before the serverless function is frozen.
export async function notifyInvoiceFailed(studentName: string, error: string): Promise<void> {
  const short = error.length > 120 ? `${error.slice(0, 120)}…` : error
  await sendPushToInstructor(
    '⚠️ חשבונית לא הונפקה',
    `התשלום של ${studentName} נקלט, אבל החשבונית ב-Morning נכשלה: ${short}`,
    '/instructor/students',
  ).catch(err => console.error('Invoice-failure push failed:', err))
}
