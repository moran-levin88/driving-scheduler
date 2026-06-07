export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()

  const data: { isRestricted?: boolean; name?: string; email?: string; phone?: string | null } = {}
  if ('isRestricted' in body) data.isRestricted = !!body.isRestricted
  if ('name' in body) {
    const name = String(body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'שם לא יכול להיות ריק' }, { status: 400 })
    data.name = name
  }
  if ('email' in body) {
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'אימייל לא יכול להיות ריק' }, { status: 400 })
    data.email = email
  }
  if ('phone' in body) {
    const phone = String(body.phone ?? '').trim()
    data.phone = phone || null
  }

  try {
    const student = await prisma.user.update({
      where: { id, role: 'STUDENT' },
      data,
      select: { id: true, name: true, email: true, phone: true, isRestricted: true },
    })
    return NextResponse.json(student)
  } catch (err: any) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'כתובת האימייל כבר בשימוש על ידי משתמש אחר' }, { status: 409 })
    }
    throw err
  }
}
