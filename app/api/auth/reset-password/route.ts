export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const { token, password } = await req.json()

  if (!token || !password) {
    return NextResponse.json({ error: 'חסרים נתונים' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'הסיסמה חייבת להכיל לפחות 6 תווים' }, { status: 400 })
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })

  if (!resetToken || resetToken.expires < new Date()) {
    return NextResponse.json({ error: 'הקישור אינו תקין או שפג תוקפו' }, { status: 400 })
  }

  const hash = await bcrypt.hash(password, 12)
  await prisma.user.update({ where: { id: resetToken.userId }, data: { password: hash } })
  await prisma.passwordResetToken.deleteMany({ where: { userId: resetToken.userId } })

  return NextResponse.json({ ok: true })
}
