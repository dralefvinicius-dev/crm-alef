import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'CRM Jurídico — Dr. Alef Vinícius',
  description: 'Sistema de gestão de leads e clientes do escritório Alef Vinícius Advocacia',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CRM Alef',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  userScalable: true,
  themeColor: '#0D1B2E',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="format-detection" content="telephone=no" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f9fafb', color: '#1f2937', WebkitFontSmoothing: 'antialiased', WebkitTextSizeAdjust: '100%', textSizeAdjust: '100%', maxWidth: '100vw', overflowX: 'hidden' } as React.CSSProperties}>
        {children}
      </body>
    </html>
  )
}
