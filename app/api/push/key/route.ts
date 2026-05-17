export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

// Returns the VAPID public key so the client always uses the same key as the server.
// The public key is not a secret.
export async function GET() {
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY ?? '' })
}
