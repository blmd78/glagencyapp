import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'

/**
 * Les deux polices de l'app Good Luck Agency — Inter pour le texte, Space Grotesk pour les titres.
 * Elles ne servent QUE sur la face Formation (`.gla`, cf. `formation-theme.css`) : le reste du CRM
 * garde la pile système.
 *
 * `next/font` les auto-héberge et pré-charge : aucune requête vers Google au chargement, et pas de
 * saut de mise en page à l'arrivée de la police (le pire défaut sur un écran ouvert dix fois par
 * jour). C'est ce qui rend le coût acceptable pour une reprise de design.
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-gla-body', display: 'swap' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-gla-head', display: 'swap' })

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
    <html lang="fr" suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable}`}>
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
