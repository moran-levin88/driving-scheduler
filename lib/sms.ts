import twilio from 'twilio'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

type BookingWithRelations = {
  student: { name: string; phone?: string | null }
  availability: { startTime: Date; endTime: Date }
}

function formatDate(date: Date) {
  return format(date, "EEEE, d בMMMM yyyy", { locale: he })
}

function formatTime(date: Date) {
  return format(date, "HH:mm")
}

export async function sendSmsReminder(booking: BookingWithRelations) {
  const phone = booking.student.phone
  if (!phone) return

  const message = `שלום ${booking.student.name}, תזכורת: יש לך שיעור נהיגה מחר ${formatDate(booking.availability.startTime)} בשעה ${formatTime(booking.availability.startTime)}. בהצלחה!`

  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone,
  })
}
