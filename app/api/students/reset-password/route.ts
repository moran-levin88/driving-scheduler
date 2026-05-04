export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { studentId } = await req.json()
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 })

  const student = await prisma.user.findUnique({ where: { id: studentId, role: 'STUDENT' } })
  if (!student) return NextResponse.json({ error: 'תלמיד לא נמצא' }, { status: 404 })

  const tempPassword = Math.random().toString(36).slice(-6) + Math.random().toString(36).slice(-3).toUpperCase()
  const hash = await bcrypt.hash(tempPassword, 12)

  await prisma.user.update({ where: { id: studentId }, data: { password: hash } })

  return NextResponse.json({ tempPassword, email: student.email, name: student.name })
}
