export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const { name, email: rawEmail, phone, password } = await req.json()
  const email = rawEmail?.toLowerCase()

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Name, email and password required' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'הסיסמה חייבת להכיל לפחות 6 תווים' }, { status: 400 })
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
    data: { name, email, phone, role: 'STUDENT', password: hash },
  })

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 })
}
