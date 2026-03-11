import { Resend } from 'resend'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

const resend = new Resend(process.env.RESEND_API_KEY)

type BookingWithRelations = {
  id: string
  student: { name: string; email: string }
  availability: { startTime: Date; endTime: Date }
  notes?: string | null
}

function formatDate(date: Date) {
  return format(date, "EEEE, d בMMMM yyyy", { locale: he })
}

function formatTime(date: Date) {
  return format(date, "HH:mm")
}

export async function sendBookingRequested(booking: BookingWithRelations) {
  const instructorEmail = process.env.INSTRUCTOR_EMAIL!
  await resend.emails.send({
    from: 'noreply@yourdomain.com',
    to: instructorEmail,
    subject: `בקשת שיעור חדשה מ-${booking.student.name}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>בקשת שיעור נהיגה חדשה</h2>
        <p><strong>תלמיד:</strong> ${booking.student.name} (${booking.student.email})</p>
        <p><strong>תאריך:</strong> ${formatDate(booking.availability.startTime)}</p>
        <p><strong>שעה:</strong> ${formatTime(booking.availability.startTime)} - ${formatTime(booking.availability.endTime)}</p>
        ${booking.notes ? `<p><strong>הערות:</strong> ${booking.notes}</p>` : ''}
        <p>כנסו למערכת כדי לאשר או לדחות את הבקשה.</p>
      </div>
    `,
  })
}

export async function sendBookingApproved(booking: BookingWithRelations) {
  await resend.emails.send({
    from: 'noreply@yourdomain.com',
    to: booking.student.email,
    subject: 'שיעור הנהיגה שלך אושר!',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>שיעור הנהיגה שלך אושר ✓</h2>
        <p>שלום ${booking.student.name},</p>
        <p>שיעור הנהיגה שלך אושר!</p>
        <p><strong>תאריך:</strong> ${formatDate(booking.availability.startTime)}</p>
        <p><strong>שעה:</strong> ${formatTime(booking.availability.startTime)} - ${formatTime(booking.availability.endTime)}</p>
        <p>נתראה בשיעור!</p>
      </div>
    `,
  })
}

export async function sendBookingRejected(booking: BookingWithRelations) {
  await resend.emails.send({
    from: 'noreply@yourdomain.com',
    to: booking.student.email,
    subject: 'בקשת השיעור שלך נדחתה',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>בקשת השיעור שלך נדחתה</h2>
        <p>שלום ${booking.student.name},</p>
        <p>לצערנו, בקשת השיעור שלך ל-${formatDate(booking.availability.startTime)} נדחתה.</p>
        <p>אנא כנסו למערכת ובחרו מועד אחר.</p>
      </div>
    `,
  })
}

export async function sendLessonReminder(booking: BookingWithRelations) {
  await resend.emails.send({
    from: 'noreply@yourdomain.com',
    to: booking.student.email,
    subject: `תזכורת: שיעור נהיגה מחר ב-${formatTime(booking.availability.startTime)}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>תזכורת לשיעור נהיגה</h2>
        <p>שלום ${booking.student.name},</p>
        <p>תזכורת: יש לך שיעור נהיגה מחר!</p>
        <p><strong>תאריך:</strong> ${formatDate(booking.availability.startTime)}</p>
        <p><strong>שעה:</strong> ${formatTime(booking.availability.startTime)} - ${formatTime(booking.availability.endTime)}</p>
        <p>בהצלחה!</p>
      </div>
    `,
  })
}
