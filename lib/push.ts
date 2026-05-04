import webpush from 'web-push'
import { prisma } from './prisma'

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.INSTRUCTOR_EMAIL || 'admin@example.com'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
}

export async function sendPushToInstructor(title: string, body: string, url = '/instructor/bookings') {
  if (!process.env.VAPID_PUBLIC_KEY) return

  try {
    const instructor = await prisma.user.findFirst({
      where: { role: 'INSTRUCTOR' },
      select: { pushSubscription: true },
    })
    if (!instructor?.pushSubscription) return

    const sub = JSON.parse(instructor.pushSubscription)
    await webpush.sendNotification(sub, JSON.stringify({ title, body, url }))
  } catch (err: any) {
    // Subscription expired or invalid — clear it
    if (err.statusCode === 410 || err.statusCode === 404) {
      await prisma.user.updateMany({
        where: { role: 'INSTRUCTOR' },
        data: { pushSubscription: null },
      })
    }
    console.error('Push failed:', err.message)
  }
}
