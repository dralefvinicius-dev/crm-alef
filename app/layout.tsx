import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CRM Jurídico — Dr. Alef Vinicius',
  description: 'CRM de leads — OAB/PA 35.567',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-50 min-h-screen text-gray-900">{children}</body>
    </html>
  )
}
