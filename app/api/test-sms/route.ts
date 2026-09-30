export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendSmsToInstructor } from '@/lib/sms'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return NextResponse.json({ error: 'Missing Twilio env vars' }, { status: 500 })
  }
  if (!process.env.INSTRUCTOR_PHONE) {
    return NextResponse.json({ error: 'Missing INSTRUCTOR_PHONE env var' }, { status: 500 })
  }

  try {
    await sendSmsToInstructor('בדיקת מערכת — אם קיבלת את זה, ה-SMS עובד! 🚗')
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 500 })
  }
}
