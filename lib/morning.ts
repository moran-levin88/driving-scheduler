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

// Morning's "אפליקציית תשלום" type (10) is for a payment Morning's own
// processing actually ran (Bit/Apple Pay/Google Pay through their gateway,
// which needs a separate merchant setup under Payments > Processing) — not
// for recording that the student paid via Bit/PayBox directly to the
// instructor outside Morning. Using it without that setup is what produced
// "Morning invoice creation failed (400): ... סוג אפליקציית תשלום לא תקין"
// (errorCode 2438). "אחר" (11) is the right type for money received outside
// Morning through a channel it has no dedicated code for — same bucket CASH
// and BANK_TRANSFER already use without any special setup.
const PAYMENT_TYPE_CODE: Record<PaymentMethodForInvoice, number> = {
  CASH: 1,
  BANK_TRANSFER: 4,
  BIT: 11,
  PAYBOX: 11,
}

// Matches the exact string BankTransferModal's formatBankTransferReference()
// produces — "בנק X | סניף Y | חשבון Z | אסמכתא W" — so it can be split back
// into Morning's own structured bank fields instead of being shown as one
// opaque blob.
const BANK_TRANSFER_REFERENCE_RE = /^בנק (.+) \| סניף (.+) \| חשבון (.+) \| אסמכתא (.+)$/

export async function createInvoice(params: {
  student: { name: string; email?: string | null; idNumber?: string | null }
  lines: { description: string; amount: number }[]
  method: PaymentMethodForInvoice
  paidAt: Date
  // Bank transfer details, or a Bit/PayBox confirmation number — whatever
  // the instructor entered when picking the method. Passed through to
  // Morning's own payment fields (bankName/bankBranch/bankAccount, or
  // transactionId) so they print in the invoice's "פרטי תשלומים" table, in
  // the "פירוט" column next to the payment method itself.
  reference?: string
}): Promise<{ id: string; number: string; url: string }> {
  const token = await getToken()
  const total = params.lines.reduce((sum, l) => sum + l.amount, 0)

  const paymentExtra: Record<string, string | number> = {}
  if (params.method === 'BIT' || params.method === 'PAYBOX') {
    // Morning requires subType whenever type is "אחר" (11) — "שווה כסף" (2,
    // "cash equivalent") is the closest fit for a digital payment that
    // happened outside Morning and just needs to be logged.
    paymentExtra.subType = 2
  }
  if (params.reference) {
    const bankMatch = params.method === 'BANK_TRANSFER' ? params.reference.match(BANK_TRANSFER_REFERENCE_RE) : null
    if (bankMatch) {
      // Morning's own template for a bank-transfer payment only ever prints
      // bankName/bankBranch/bankAccount in the "פירוט" column — transactionId
      // is silently dropped for this payment type. Folding the transfer
      // reference into bankAccount is the only way to still get it printed.
      paymentExtra.bankName = bankMatch[1]
      paymentExtra.bankBranch = bankMatch[2]
      paymentExtra.bankAccount = `${bankMatch[3]} | אסמכתא ${bankMatch[4]}`
    } else {
      paymentExtra.transactionId = params.reference
    }
  }

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
        taxId: params.student.idNumber || undefined,
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
          ...paymentExtra,
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Morning invoice creation failed (${res.status}): ${await res.text()}`)
  }

  const data = await res.json()
  // Morning returns `number` as a JSON integer (e.g. 60001), not a string —
  // our `number: string` annotation above doesn't enforce that at runtime,
  // and saving the raw int into Invoice.invoiceNumber (a String column)
  // threw a Prisma type error, silently leaving our side thinking the
  // document was never issued even though Morning had already created it.
  return { id: data.id, number: String(data.number), url: data.url?.origin || data.url?.he || data.url }
}
