import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'
import { SyncProvider } from '@/components/SyncProvider'
import { BottomNav } from '@/components/BottomNav'
import { OfflineBanner } from '@/components/OfflineBanner'
import { ProjectsProvider } from '@/lib/ProjectsContext'

export const metadata: Metadata = {
  title: 'Nadzor — Construction Supervision',
  description: 'Site visit logs and monthly reports for civil engineers',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Nadzor',
  },
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0e14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen pb-20 pt-safe-top">
        <ServiceWorkerRegister />
        <SyncProvider />
        <OfflineBanner />
        <ProjectsProvider>
          <main className="mx-auto max-w-2xl px-4 pb-safe-bottom">
            {children}
          </main>
          <BottomNav />
        </ProjectsProvider>
      </body>
    </html>
  )
}

