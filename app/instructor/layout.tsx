import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import InstructorNav from '@/components/InstructorNav'

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    redirect('/login')
  }

  return (
    <div dir="rtl" className="min-h-dvh bg-gray-50">
      <InstructorNav />
      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {children}
      </main>
    </div>
  )
}
