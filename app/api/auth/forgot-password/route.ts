export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPasswordReset } from '@/lib/email'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const { email: rawEmail } = await req.json()
  const email = rawEmail?.toLowerCase()

  if (!email) {
    return NextResponse.json({ error: 'נדרש אימייל' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email } })

  if (user) {
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expires: new Date(Date.now() + 60 * 60 * 1000),
      },
    })

    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`
    await sendPasswordReset(user, resetUrl)
  }

  // Always return success, whether or not the email exists, so we don't leak account info.
  return NextResponse.json({ ok: true })
}
