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
      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {children}
      </main>
    </StudentLayoutWrapper>
  )
}
