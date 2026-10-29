export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { logSecurityEvent } from '@/lib/securityLog'
import { isHebrewName } from '@/lib/hebrewName'

export async function POST(req: NextRequest) {
  const { firstName, lastName, email: rawEmail, phone, password, idNumber, dateOfBirth, address, agreedToPrivacy } = await req.json()
  const email = rawEmail?.toLowerCase()

  if (!firstName || !lastName || !email || !password || !idNumber || !dateOfBirth) {
    return NextResponse.json({ error: 'יש למלא את כל השדות' }, { status: 400 })
  }

  // Enforced server-side, not just filtered in the form — a request that
  // skips the UI entirely could otherwise submit any script. Checked
  // regardless of which UI language (he/ru) the registration page itself
  // was shown in.
  if (!isHebrewName(firstName) || !isHebrewName(lastName)) {
    return NextResponse.json({ error: 'שם פרטי ושם משפחה חייבים להיות בעברית בלבד' }, { status: 400 })
  }
  // Derived here, not trusted from the client — name is what actually gets
  // stored, so it has to come from the two fields that were just validated.
  const name = `${firstName.trim()} ${lastName.trim()}`.trim()

  if (password.length < 8) {
    return NextResponse.json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' }, { status: 400 })
  }

  if (!agreedToPrivacy) {
    return NextResponse.json({ error: 'יש לאשר את מדיניות הפרטיות כדי להירשם' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'כתובת האימייל כבר רשומה במערכת' }, { status: 409 })
  }

  if (phone) {
    const existingPhone = await prisma.user.findFirst({ where: { phone } })
    if (existingPhone) {
      return NextResponse.json({ error: 'מספר הטלפון כבר רשום במערכת' }, { status: 409 })
    }
  }

  const hash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: {
      name, email, phone, role: 'STUDENT', password: hash,
      idNumber, dateOfBirth: new Date(dateOfBirth),
      address: address?.trim() || null,
      privacyConsentAt: new Date(),
    },
  })
  await logSecurityEvent({ type: 'PRIVACY_CONSENT', userId: user.id, email, detail: 'registration' })

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 })
}
