export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const students = await prisma.user.findMany({
    where: { role: 'STUDENT' },
    include: {
      bookings: {
        include: { availability: true },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(students)
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

  // Cancel all bookings and free up slots
  const bookings = await prisma.booking.findMany({
    where: { studentId, status: { in: ['PENDING', 'APPROVED'] } },
  })
  for (const b of bookings) {
    await prisma.availability.update({
      where: { id: b.availabilityId },
      data: { isBooked: false },
    })
  }

  await prisma.booking.deleteMany({ where: { studentId } })
  await prisma.account.deleteMany({ where: { userId: studentId } })
  await prisma.session.deleteMany({ where: { userId: studentId } })
  await prisma.user.delete({ where: { id: studentId } })

  return NextResponse.json({ success: true })
}
