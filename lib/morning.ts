// Morning (formerly Green Invoice) — issues the VAT invoice/receipt for a
// lesson payment. Unlike lib/sms.ts and lib/calendar.ts, failures are NOT
// swallowed here: a failed invoice needs to surface to the instructor so it
// can be retried, since the money was already received outside the app.

const BASE_URL = process.env.MORNING_API_BASE_URL || 'https://api.greeninvoice.co.il/api/v1'

// Morning's 2026 infrastructure update retired POST {BASE_URL}/account/token
// (it now answers 404 to every key, valid or not — that's what silently
// stopped every invoice from being issued). Tokens now come from their
// identity service as an OAuth client-credentials grant; the existing API
// key id/secret are sent as client_id/client_secret. Document calls stay on
// BASE_URL. MORNING_TOKEN_URL overrides this if Morning moves it again.
const TOKEN_URL = process.env.MORNING_TOKEN_URL
  || (BASE_URL.includes('sandbox')
    ? 'https://api.sandbox.morning.dev/idp/v1/oauth/token'
    : 'https://api.morning.co/idp/v1/oauth/token')

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

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: apiKey, client_secret: apiSecret }),
  })
  if (!res.ok) {
    throw new Error(`Morning auth failed (${res.status}) at ${new URL(TOKEN_URL).host}: ${await res.text()}`)
  }
  const data = await res.json()
  // Accept the documented field name plus the OAuth-standard and the old
  // one, so a rename on Morning's side doesn't cause another silent outage.
  const token: string | undefined = data.accessToken || data.access_token || data.token
  if (!token) throw new Error('Morning auth failed: no token in response')
  // Refresh a few minutes early; fall back to 25 min if no expiry is given.
  const expiresAtMs = typeof data.expires_in === 'number' ? Date.now() + data.expires_in * 1000
    : data.expiresAt ? new Date(data.expiresAt).getTime() : NaN
  cachedToken = { token, expiresAt: Number.isFinite(expiresAtMs) ? expiresAtMs - 5 * 60_000 : Date.now() + 25 * 60 * 1000 }
  return token
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
    // happened outside Morning and just needs to be logged. Morning's own
    // label for that subType ("שווה כסף") doesn't say which app was used, so
    // the method name goes into transactionId instead — the one thing that
    // does print in the "פירוט" column — so the instructor can still tell
    // Bit from PayBox at a glance.
    paymentExtra.subType = 2
    const methodLabel = params.method === 'BIT' ? 'ביט' : 'פייבוקס'
    paymentExtra.transactionId = params.reference ? `${methodLabel} — ${params.reference}` : methodLabel
  } else if (params.reference) {
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
