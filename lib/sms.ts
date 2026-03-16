import { format } from 'date-fns'
import { he } from 'date-fns/locale'

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

function toInternationalPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('972')) return `+${digits}`
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`
  return `+${digits}`
}

export async function sendSmsReminder(booking: BookingWithRelations) {
  const phone = booking.student.phone
  if (!phone) return

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !accessToken) return

  const dateStr = formatDate(booking.availability.startTime)
  const timeStr = formatTime(booking.availability.startTime)

  const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toInternationalPhone(phone),
      type: 'template',
      template: {
        name: 'lesson_reminder',
        language: { code: 'iw' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: booking.student.name },
            { type: 'text', text: dateStr },
            { type: 'text', text: timeStr },
          ],
        }],
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    console.error('WhatsApp send failed:', err)
    throw new Error(err?.error?.message || 'WhatsApp send failed')
  }
}
