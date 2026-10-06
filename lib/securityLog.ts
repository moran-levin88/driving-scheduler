import { prisma } from './prisma'

export type SecurityLogType = 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGIN_LOCKED' | 'PRIVACY_CONSENT'

export async function logSecurityEvent(params: {
  type: SecurityLogType
  userId?: string | null
  email?: string | null
  ip?: string | null
  detail?: string | null
}) {
  try {
    await prisma.securityLog.create({ data: params })
  } catch (e) {
    // Never let audit logging break the auth flow it's observing.
    console.error('securityLog failed:', e)
  }
}

// NextAuth's CredentialsProvider authorize(credentials, req) passes a plain
// headers object (not a Headers instance) — Vercel sets x-forwarded-for.
export function getRequestIp(req: any): string | null {
  const fwd = req?.headers?.['x-forwarded-for']
  if (!fwd) return null
  const value = Array.isArray(fwd) ? fwd[0] : fwd
  return value?.split(',')[0]?.trim() || null
}
