export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { logSecurityEvent } from '@/lib/securityLog'

export async function POST(req: NextRequest) {
  const { name, email: rawEmail, phone, password, idNumber, dateOfBirth, agreedToPrivacy } = await req.json()
  const email = rawEmail?.toLowerCase()

  if (!name || !email || !password || !idNumber || !dateOfBirth) {
    return NextResponse.json({ error: 'יש למלא את כל השדות' }, { status: 400 })
  }

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
      privacyConsentAt: new Date(),
    },
  })
  await logSecurityEvent({ type: 'PRIVACY_CONSENT', userId: user.id, email, detail: 'registration' })

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 })
}
