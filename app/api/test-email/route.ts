export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import nodemailer from 'nodemailer'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD

  if (!user || !pass) {
    return NextResponse.json({ error: 'Missing env vars', user: !!user, pass: !!pass }, { status: 500 })
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    })
    await transporter.sendMail({
      from: `"בדיקה" <${user}>`,
      to: user,
      subject: 'בדיקת מייל',
      text: 'אם קיבלת את זה — המייל עובד!',
    })
    return NextResponse.json({ ok: true, sentTo: user })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 500 })
  }
}
