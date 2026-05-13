'use client'
import { SessionProvider } from 'next-auth/react'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { ServiceWorkerRegister } from './ServiceWorkerRegister'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <LanguageProvider>
        <ServiceWorkerRegister />
        {children}
      </LanguageProvider>
    </SessionProvider>
  )
}
