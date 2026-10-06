import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import EmailProvider from 'next-auth/providers/email'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import { logSecurityEvent, getRequestIp } from './securityLog'

// Login throttling (Privacy Protection Law — Data Security Regulations):
// after this many wrong passwords in a row, the account is locked out for
// a cooldown period rather than allowing unlimited guesses.
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null
        const email = credentials.email.toLowerCase()
        const ip = getRequestIp(req)
        const user = await prisma.user.findUnique({ where: { email } })

        if (user?.lockedUntil && user.lockedUntil > new Date()) {
          await logSecurityEvent({ type: 'LOGIN_LOCKED', userId: user.id, email, ip, detail: 'attempt while locked' })
          throw new Error('ACCOUNT_LOCKED')
        }

        const valid = user?.password ? await bcrypt.compare(credentials.password, user.password) : false
        if (!user || !valid) {
          if (user) {
            const attempts = user.failedLoginAttempts + 1
            const locked = attempts >= MAX_FAILED_ATTEMPTS
            await prisma.user.update({
              where: { id: user.id },
              data: {
                failedLoginAttempts: attempts,
                lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
              },
            })
            await logSecurityEvent({ type: locked ? 'LOGIN_LOCKED' : 'LOGIN_FAILURE', userId: user.id, email, ip })
            if (locked) throw new Error('ACCOUNT_LOCKED')
          } else {
            await logSecurityEvent({ type: 'LOGIN_FAILURE', email, ip, detail: 'no such account' })
          }
          return null
        }

        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
        }
        await logSecurityEvent({ type: 'LOGIN_SUCCESS', userId: user.id, email, ip })
        return user
      },
    }),
    EmailProvider({
      server: {
        host: 'smtp.resend.com',
        port: 465,
        auth: {
          user: 'resend',
          pass: process.env.RESEND_API_KEY,
        },
      },
      from: 'noreply@yourdomain.com',
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role
        ;(session.user as any).id = token.id
      }
      return session
    },
  },
}
