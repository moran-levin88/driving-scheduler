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
    const status = err.statusCode ?? err.response?.statusCode
    // Clear stale subscription on any delivery failure so the next registerPush
    // call from the client will force a fresh subscription and re-sync.
    if (status === 410 || status === 404 || status === 401 || status === 403) {
      await prisma.user.updateMany({
        where: { role: 'INSTRUCTOR' },
        data: { pushSubscription: null },
      })
    }
    console.error('Push failed:', err.message ?? err)
  }
}
