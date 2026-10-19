export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789' // no 0/O/1/I/l — avoids ambiguous reads over WhatsApp

function generateTempPassword(length = 10): string {
  return Array.from(crypto.randomBytes(length))
    .map(b => TEMP_PASSWORD_CHARS[b % TEMP_PASSWORD_CHARS.length])
    .join('')
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { studentId } = await req.json()
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 })

  const student = await prisma.user.findUnique({ where: { id: studentId, role: 'STUDENT' } })
  if (!student) return NextResponse.json({ error: 'תלמיד לא נמצא' }, { status: 404 })

  const tempPassword = generateTempPassword()
  const hash = await bcrypt.hash(tempPassword, 12)

  await prisma.user.update({ where: { id: studentId }, data: { password: hash } })

  return NextResponse.json({ tempPassword, email: student.email, name: student.name })
}
