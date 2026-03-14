import { google } from 'googleapis'

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary'

function getCalendar() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.calendar({ version: 'v3', auth })
}

type BookingInfo = {
  student: { name: string; phone?: string | null }
  availability: { startTime: Date; endTime: Date }
  pickupAddress?: string | null
}

export async function createCalendarEvent(booking: BookingInfo): Promise<string | null> {
  if (!process.env.GOOGLE_CLIENT_ID) return null
  try {
    const calendar = getCalendar()
    const event = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: booking.student.name,
        description: [
          `תלמיד: ${booking.student.name}`,
          booking.student.phone ? `טלפון: ${booking.student.phone}` : '',
          booking.pickupAddress ? `כתובת איסוף: ${booking.pickupAddress}` : '',
        ].filter(Boolean).join('\n'),
        start: { dateTime: booking.availability.startTime.toISOString(), timeZone: 'Asia/Jerusalem' },
        end: { dateTime: booking.availability.endTime.toISOString(), timeZone: 'Asia/Jerusalem' },
      },
    })
    return event.data.id ?? null
  } catch (err) {
    console.error('Calendar create failed:', err)
    return null
  }
}

export async function createBlockedCalendarEvent(startTime: Date, endTime: Date, note?: string | null): Promise<string | null> {
  if (!process.env.GOOGLE_CLIENT_ID) return null
  try {
    const calendar = getCalendar()
    const event = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: note || 'חסום',
        start: { dateTime: startTime.toISOString(), timeZone: 'Asia/Jerusalem' },
        end: { dateTime: endTime.toISOString(), timeZone: 'Asia/Jerusalem' },
      },
    })
    return event.data.id ?? null
  } catch (err) {
    console.error('Calendar block create failed:', err)
    return null
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!process.env.GOOGLE_CLIENT_ID) return
  try {
    const calendar = getCalendar()
    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId })
  } catch (err) {
    console.error('Calendar delete failed:', err)
  }
}
