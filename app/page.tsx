import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import HomeContent from '@/components/HomeContent'

export default async function Home() {
  const session = await getServerSession(authOptions)
  if (session) {
    const role = (session.user as any).role
    if (role === 'INSTRUCTOR') redirect('/instructor/dashboard')
    if (role === 'STUDENT') redirect('/student/dashboard')
  }

  return <HomeContent />
}
