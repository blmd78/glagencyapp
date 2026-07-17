import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'

export const metadata: Metadata = {
  title: 'glagency — dashboard',
  description: 'Pilotage de performance chatters / créatrices',
  // Dashboard privé : jamais indexé.
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // suppressHydrationWarning : next-themes pose la classe `dark` sur <html>
    // avant l'hydratation (choix persisté) — divergence SSR/client attendue.
    <html lang="fr" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
          {/* DANS le ThemeProvider : son useTheme() doit suivre le thème de l'app
              (hors provider, sonner retombe sur prefers-color-scheme de l'OS). */}
          <Toaster position="top-right" richColors />
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
