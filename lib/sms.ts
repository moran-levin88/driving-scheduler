import twilio from 'twilio'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

function getClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  return { client: twilio(sid, token), from: process.env.TWILIO_PHONE_NUMBER! }
}

export async function sendSmsToInstructor(message: string): Promise<void> {
  const t = getClient()
  const to = process.env.INSTRUCTOR_PHONE
  if (!t || !to || !t.from) { console.log('SMS to instructor skipped — Twilio not configured'); return }
  try {
    await t.client.messages.create({ from: t.from, to, body: message })
  } catch (err) {
    console.error('SMS to instructor failed:', err)
  }
}

type BookingForReminder = {
  student: { name: string; phone?: string | null }
  availability: { startTime: Date; endTime: Date }
}

export async function sendSmsReminder(booking: BookingForReminder): Promise<void> {
  const t = getClient()
  const to = booking.student.phone?.replace(/\D/g, '').replace(/^0/, '+972') ?? null
  if (!t || !to || !t.from) throw new Error('SMS not configured or student has no phone')
  const dateStr = format(booking.availability.startTime, "EEEE, d בMMMM", { locale: he })
  const timeStr = format(booking.availability.startTime, 'HH:mm')
  await t.client.messages.create({
    from: t.from,
    to,
    body: `שלום ${booking.student.name}, תזכורת: יש לך שיעור נהיגה מחר ב${dateStr} בשעה ${timeStr}. בהצלחה!`,
  })
}
