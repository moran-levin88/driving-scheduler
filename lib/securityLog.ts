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
//
// A client can send its own X-Forwarded-For header, which lands at the
// FRONT of the list — Vercel appends the real client IP it observed as the
// LAST entry. Reading index [0] would trust the attacker-supplied value;
// x-real-ip (Vercel's single-value convenience header) or the chain's last
// entry are the ones actually set by the platform, not the client.
export function getRequestIp(req: any): string | null {
  const real = req?.headers?.['x-real-ip']
  if (real) return (Array.isArray(real) ? real[0] : real)?.trim() || null

  const fwd = req?.headers?.['x-forwarded-for']
  if (!fwd) return null
  const value = Array.isArray(fwd) ? fwd[0] : fwd
  const parts = value?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? []
  return parts[parts.length - 1] || null
}
