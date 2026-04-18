'use client'
import { useLanguage } from '@/contexts/LanguageContext'

export default function StudentLayoutWrapper({ children }: { children: React.ReactNode }) {
  const { dir } = useLanguage()
  return (
    <div dir={dir} className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}
