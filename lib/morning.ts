// Morning (formerly Green Invoice) — issues the VAT invoice/receipt for a
// lesson payment. Unlike lib/sms.ts and lib/calendar.ts, failures are NOT
// swallowed here: a failed invoice needs to surface to the instructor so it
// can be retried, since the money was already received outside the app.

const BASE_URL = process.env.MORNING_API_BASE_URL || 'https://api.greeninvoice.co.il/api/v1'

let cachedToken: { token: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  const apiKey = process.env.MORNING_API_KEY
  const apiSecret = process.env.MORNING_API_SECRET
  if (!apiKey || !apiSecret) {
    throw new Error('Morning API not configured (missing MORNING_API_KEY / MORNING_API_SECRET)')
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }

  const res = await fetch(`${BASE_URL}/account/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: apiKey, secret: apiSecret, grant_type: 'client_credentials' }),
  })
  if (!res.ok) {
    throw new Error(`Morning auth failed (${res.status}): ${await res.text()}`)
  }
  const data = await res.json()
  // Token is valid for a while; refresh a minute early to be safe.
  cachedToken = { token: data.token, expiresAt: Date.now() + 25 * 60 * 1000 }
  return data.token
}

export type PaymentMethodForInvoice = 'CASH' | 'BIT' | 'PAYBOX' | 'BANK_TRANSFER'

const PAYMENT_TYPE_CODE: Record<PaymentMethodForInvoice, number> = {
  CASH: 1,
  BANK_TRANSFER: 4,
  BIT: 10,
  PAYBOX: 10,
}

export async function createInvoice(params: {
  student: { name: string; email?: string | null }
  lines: { description: string; amount: number }[]
  method: PaymentMethodForInvoice
  paidAt: Date
}): Promise<{ id: string; number: string; url: string }> {
  const token = await getToken()
  const total = params.lines.reduce((sum, l) => sum + l.amount, 0)

  const res = await fetch(`${BASE_URL}/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type: 320, // חשבונית מס/קבלה — payment already received
      date: params.paidAt.toISOString().slice(0, 10),
      lang: 'he',
      currency: 'ILS',
      client: {
        name: params.student.name,
        emails: params.student.email ? [params.student.email] : [],
      },
      income: params.lines.map(l => ({
        description: l.description,
        quantity: 1,
        price: l.amount,
        // 1 = price already includes VAT (what the student actually paid).
        // vatType 0 makes Morning add VAT on top, so the computed invoice
        // total stops matching the flat `payment` total below — triggers
        // Morning's "receipts vs. payments mismatch" error (code 2422).
        vatType: 1,
      })),
      payment: [
        {
          type: PAYMENT_TYPE_CODE[params.method],
          price: total,
          date: params.paidAt.toISOString().slice(0, 10),
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Morning invoice creation failed (${res.status}): ${await res.text()}`)
  }

  const data = await res.json()
  return { id: data.id, number: data.number, url: data.url?.origin || data.url?.he || data.url }
}
