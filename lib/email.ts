import nodemailer from 'nodemailer'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

type BookingWithRelations = {
  id: string
  student: { name: string; email: string }
  availability: { startTime: Date; endTime: Date }
  notes?: string | null
}

function formatDate(date: Date) {
  const israelDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  return format(israelDate, "EEEE, d בMMMM yyyy", { locale: he })
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
  }).format(date)
}

async function send(to: string, subject: string, html: string) {
  await transporter.sendMail({
    from: `"אלכס לוין" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  })
}

export async function sendBookingRequested(booking: BookingWithRelations) {
  const instructorEmail = process.env.INSTRUCTOR_EMAIL!
  await send(
    instructorEmail,
    `בקשת שיעור חדשה מ-${booking.student.name}`,
    `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>בקשת שיעור נהיגה חדשה</h2>
        <p><strong>תלמיד:</strong> ${booking.student.name} (${booking.student.email})</p>
        <p><strong>תאריך:</strong> ${formatDate(booking.availability.startTime)}</p>
        <p><strong>שעה:</strong> ${formatTime(booking.availability.startTime)} - ${formatTime(booking.availability.endTime)}</p>
        ${booking.notes ? `<p><strong>הערות:</strong> ${booking.notes}</p>` : ''}
        <p>כנסו למערכת כדי לאשר או לדחות את הבקשה.</p>
      </div>
    `
  )
}

export async function sendBookingApproved(booking: BookingWithRelations) {
  await send(
    booking.student.email,
    'שיעור הנהיגה שלך אושר!',
    `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>שיעור הנהיגה שלך אושר ✓</h2>
        <p>שלום ${booking.student.name.trim()},</p>
        <p>שיעור הנהיגה שלך אושר!</p>
        <p><strong>תאריך:</strong> ${formatDate(booking.availability.startTime)}</p>
        <p><strong>שעה:</strong> ${formatTime(booking.availability.startTime)} - ${formatTime(booking.availability.endTime)}</p>
        <p>נתראה בשיעור!</p>
      </div>
    `
  )
}

export async function sendBookingRejected(booking: BookingWithRelations) {
  await send(
    booking.student.email,
    'בקשת השיעור שלך נדחתה',
    `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>בקשת השיעור שלך נדחתה</h2>
        <p>שלום ${booking.student.name.trim()},</p>
        <p>לצערנו, בקשת השיעור שלך ל-${formatDate(booking.availability.startTime)} נדחתה.</p>
        <p>אנא כנסו למערכת ובחרו מועד אחר.</p>
      </div>
    `
  )
}

export async function sendBookingCancelled(booking: BookingWithRelations) {
  await send(
    booking.student.email,
    'שיעור הנהיגה שלך בוטל',
    `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>שיעור הנהיגה שלך בוטל</h2>
        <p>שלום ${booking.student.name.trim()},</p>
        <p>לצערנו, שיעור הנהיגה שלך ב-${formatDate(booking.availability.startTime)} בשעה ${formatTime(booking.availability.startTime)} בוטל.</p>
        <p>אנא צרו קשר עם המורה לתיאום מועד חדש.</p>
      </div>
    `
  )
}

export async function sendLessonReminder(booking: BookingWithRelations) {
  await send(
    booking.student.email,
    `תזכורת: שיעור נהיגה מחר ב-${formatTime(booking.availability.startTime)}`,
    `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>תזכורת לשיעור נהיגה</h2>
        <p>שלום ${booking.student.name.trim()},</p>
        <p>תזכורת: יש לך שיעור נהיגה מחר!</p>
        <p><strong>תאריך:</strong> ${formatDate(booking.availability.startTime)}</p>
        <p><strong>שעה:</strong> ${formatTime(booking.availability.startTime)} - ${formatTime(booking.availability.endTime)}</p>
        <p>בהצלחה!</p>
      </div>
    `
  )
}
