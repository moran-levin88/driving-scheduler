import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const hash = await bcrypt.hash(process.env.INSTRUCTOR_PASSWORD || 'instructor123', 12)
  await prisma.user.upsert({
    where: { email: process.env.INSTRUCTOR_EMAIL || 'instructor@example.com' },
    update: {},
    create: {
      email: process.env.INSTRUCTOR_EMAIL || 'instructor@example.com',
      name: 'מורה הנהיגה',
      role: 'INSTRUCTOR',
      password: hash,
    },
  })
  console.log('Instructor created')
}

main().catch(console.error).finally(() => prisma.$disconnect())
