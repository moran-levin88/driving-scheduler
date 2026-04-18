import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import StudentNav from '@/components/StudentNav'
import StudentLayoutWrapper from '@/components/StudentLayoutWrapper'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'STUDENT') {
    redirect('/login')
  }

  return (
    <StudentLayoutWrapper>
      <StudentNav name={(session.user as any).name || ''} />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </StudentLayoutWrapper>
  )
}
