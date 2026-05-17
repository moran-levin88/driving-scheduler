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

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { user: { role: 'INSTRUCTOR' } },
  })
  if (subscriptions.length === 0) return

  await Promise.allSettled(
    subscriptions.map(async (row) => {
      try {
        await webpush.sendNotification(
          row.payload as any,
          JSON.stringify({ title, body, url })
        )
      } catch (err: any) {
        const status = err.statusCode ?? err.response?.statusCode
        if (status === 410 || status === 404 || status === 401 || status === 403) {
          // Subscription expired or invalid — remove this specific device
          await prisma.pushSubscription.delete({ where: { id: row.id } }).catch(() => {})
        }
        console.error('Push failed for', row.endpoint.slice(0, 40), err.message ?? err)
      }
    })
  )
}
