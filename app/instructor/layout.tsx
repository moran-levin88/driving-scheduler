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
    <div dir="rtl" className="min-h-screen bg-gray-50">
      <InstructorNav />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
