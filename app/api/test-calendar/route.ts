export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { google } from 'googleapis'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const vars = {
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN: !!process.env.GOOGLE_REFRESH_TOKEN,
    GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID || '(not set — using primary)',
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json({ ok: false, reason: 'Missing env vars', vars })
  }

  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    )
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const calendar = google.calendar({ version: 'v3', auth })

    // Try a lightweight read to verify credentials
    const calId = process.env.GOOGLE_CALENDAR_ID || 'primary'
    const cal = await calendar.calendars.get({ calendarId: calId })

    return NextResponse.json({
      ok: true,
      calendarName: cal.data.summary,
      calendarId: calId,
      vars,
    })
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      reason: 'Google API error',
      error: err?.message,
      code: err?.code,
      vars,
    })
  }
}
