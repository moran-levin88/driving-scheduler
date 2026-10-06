export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { archiveStudent } from '@/lib/archiveStudent'
import { getStudentsWithStats } from '@/lib/studentStats'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const showArchived = new URL(req.url).searchParams.get('archived') === '1'
  const withStats = await getStudentsWithStats(showArchived ? 'archived' : 'active')

  return NextResponse.json(withStats)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, phone, email } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'שם הוא שדה חובה' }, { status: 400 })
  }

  const studentEmail = email?.trim()
    ? email.trim().toLowerCase()
    : `student_${Date.now()}_${Math.random().toString(36).slice(-4)}@placeholder.local`

  const existing = await prisma.user.findUnique({ where: { email: studentEmail } })
  if (existing) {
    return NextResponse.json({ error: 'כתובת האימייל כבר קיימת במערכת' }, { status: 409 })
  }

  const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase()
  const hash = await bcrypt.hash(tempPassword, 12)

  const student = await prisma.user.create({
    data: {
      name: name.trim(),
      email: studentEmail,
      phone: phone?.trim() || null,
      role: 'STUDENT',
      password: hash,
    },
  })

  return NextResponse.json({
    id: student.id,
    name: student.name,
    email: student.email,
    phone: student.phone,
    tempPassword: email?.trim() ? tempPassword : null,
  }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { studentId } = await req.json()
  await archiveStudent(studentId)

  return NextResponse.json({ success: true })
}
