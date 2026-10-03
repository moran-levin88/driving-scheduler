import { format } from 'date-fns'
import { he } from 'date-fns/locale'

// date-fns' format() renders a Date's UTC-stored components as-is — without
// converting to Israel local time first, a 7am lesson shows as 4am (the
// UTC+3 DST offset). Mirrors the same conversion lib/email.ts already does.
export function formatIsraelDate(date: Date) {
  const israelDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  return format(israelDate, 'd בMMMM yyyy', { locale: he })
}

export function formatIsraelTime(date: Date) {
  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
  }).format(date)
}
