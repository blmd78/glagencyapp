'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

// Flux OTP à 6 chiffres. Prérequis Supabase : un SMTP custom activé + le template
// e-mail contenant `{{ .Token }}` (sinon l'e-mail n'a qu'un lien -> le fallback
// /auth/callback prend le relais). Accès réservé aux comptes provisionnés
// (`shouldCreateUser: false`).
const AFTER_LOGIN = '/chatter/overview'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${AFTER_LOGIN}`,
      },
    })
    setLoading(false)
    if (error) setError(error.message)
    else setStep('code')
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push(AFTER_LOGIN)
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
        </CardHeader>
        <CardContent>
          {step === 'email' ? (
            <form onSubmit={sendCode} className="space-y-3">
              <Input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ton@email.fr"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Envoi…' : 'Recevoir le code'}
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Code de connexion envoyé à <strong>{email}</strong>.
              </p>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="12345678"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Vérification…' : 'Se connecter'}
              </Button>
              <button
                type="button"
                className="w-full text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  setStep('email')
                  setCode('')
                  setError(null)
                }}
              >
                Changer d'e-mail
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
