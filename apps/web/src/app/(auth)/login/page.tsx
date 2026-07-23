'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LayoutDashboard, RefreshCw } from 'lucide-react'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { createClient } from '@/lib/supabase/client'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

// Flux OTP à 8 chiffres. Prérequis Supabase : un SMTP custom activé + le template
// e-mail contenant `{{ .Token }}` (sinon l'e-mail n'a qu'un lien -> le fallback
// /auth/callback prend le relais). Accès réservé aux comptes provisionnés
// (`shouldCreateUser: false`).
const AFTER_LOGIN = '/chatter/overview'

// Validation Zod (convention CRM : RHF + zodResolver). Deux étapes = deux schémas.
const emailSchema = z.object({
  email: z.string().trim().pipe(z.email('Adresse e-mail invalide')),
})
type EmailForm = z.infer<typeof emailSchema>

const codeSchema = z.object({
  code: z.string().regex(/^\d{8}$/, 'Code à 8 chiffres'),
})
type CodeForm = z.infer<typeof codeSchema>

/** En-tête commun aux deux étapes : icône encadrée + titre (+ sous-texte optionnel). */
function StepHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex size-11 items-center justify-center rounded-lg border">
        <LayoutDashboard className="size-5" />
      </div>
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </div>
  )
}

export default function LoginPage() {
  // React Compiler casse le proxy `formState` de react-hook-form (isSubmitting/errors :
  // les getters sont mémoïsés → l'abonnement ne s'établit plus → pas de loading ni de
  // rouge sur erreur). On opte ce composant HORS du compiler (échappatoire recommandée
  // par RHF). NB : avant, `codeForm.watch()` faisait sauter la compilation "par accident" ;
  // le passage à `useWatch` l'a réactivée, d'où la régression — ceci la corrige proprement.
  'use no memo'

  const router = useRouter()
  const [step, setStep] = useState<'email' | 'code'>('email')
  // E-mail auquel le code a été envoyé (verrouillé à l'étape 1) — sert au verifyOtp,
  // au renvoi et à l'affichage.
  const [sentTo, setSentTo] = useState('')
  const [resending, setResending] = useState(false)

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  })
  const codeForm = useForm<CodeForm>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  })

  const otpOptions = () => ({
    shouldCreateUser: false,
    emailRedirectTo: `${window.location.origin}/auth/callback?next=${AFTER_LOGIN}`,
  })

  const onEmail = emailForm.handleSubmit(async ({ email }) => {
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: otpOptions(),
    })
    if (error) {
      emailForm.setError('root', { message: error.message })
      return
    }
    setSentTo(email)
    setStep('code')
  })

  const onCode = codeForm.handleSubmit(async ({ code }) => {
    const { error } = await createClient().auth.verifyOtp({
      email: sentTo,
      token: code,
      type: 'email',
    })
    if (error) {
      codeForm.setError('root', { message: error.message })
      return
    }
    router.push(AFTER_LOGIN)
    router.refresh()
  })

  async function resend() {
    setResending(true)
    codeForm.clearErrors('root')
    const { error } = await createClient().auth.signInWithOtp({
      email: sentTo,
      options: otpOptions(),
    })
    setResending(false)
    if (error) codeForm.setError('root', { message: error.message })
  }

  const code = useWatch({ control: codeForm.control, name: 'code' })
  // Rouge si le code est invalide au sens Zod OU rejeté par Supabase (`root`, ex. code faux/
  // expiré) — c'est ce dernier cas, le plus courant, qui doit teinter les cases.
  const codeInvalid =
    !!codeForm.formState.errors.code || !!codeForm.formState.errors.root

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {step === 'email' ? (
          <form onSubmit={onEmail} noValidate className="flex flex-col gap-6">
            <StepHeader title="Bienvenue sur le CRM glagency" />
            <div className="flex flex-col gap-3">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoFocus
                placeholder="ton@email.fr"
                aria-invalid={!!emailForm.formState.errors.email}
                {...emailForm.register('email')}
              />
              {emailForm.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {emailForm.formState.errors.email.message}
                </p>
              )}
              {emailForm.formState.errors.root && (
                <p className="text-sm text-destructive">
                  {emailForm.formState.errors.root.message}
                </p>
              )}
              <ActionButton
                type="submit"
                pending={emailForm.formState.isSubmitting}
                className="w-full"
              >
                Recevoir le code
              </ActionButton>
            </div>
          </form>
        ) : (
          <form onSubmit={onCode} noValidate className="flex flex-col gap-6">
            <StepHeader title="Vérification">
              <p className="text-sm text-muted-foreground">
                Code envoyé à <strong>{sentTo}</strong>.
              </p>
            </StepHeader>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="otp">Code de vérification</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={resending}
                  onClick={resend}
                >
                  <RefreshCw className={resending ? 'animate-spin' : undefined} />
                  Renvoyer le code
                </Button>
              </div>
              <Controller
                control={codeForm.control}
                name="code"
                render={({ field }) => (
                  <InputOTP
                    id="otp"
                    maxLength={8}
                    pattern={REGEXP_ONLY_DIGITS}
                    autoFocus
                    value={field.value}
                    onChange={(v) => {
                      // Efface le rouge « code refusé » dès la 1re correction.
                      if (codeForm.formState.errors.root) codeForm.clearErrors('root')
                      field.onChange(v)
                    }}
                    onBlur={field.onBlur}
                    aria-invalid={codeInvalid}
                    containerClassName="w-full"
                  >
                    {/* Un seul groupe de 8 cases collées, étirées (`flex-1`) pour occuper
                        toute la largeur (mêmes bords que le bouton). Pas de séparateur :
                        il était purement visuel et n'entrait jamais dans la value. */}
                    <InputOTPGroup className="w-full">
                      {Array.from({ length: 8 }, (_, i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          aria-invalid={codeInvalid}
                          className="h-auto min-w-0 flex-1 aspect-square text-lg"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                )}
              />
              {codeForm.formState.errors.code && (
                <p className="text-sm text-destructive">
                  {codeForm.formState.errors.code.message}
                </p>
              )}
              {codeForm.formState.errors.root && (
                <p className="text-sm text-destructive">
                  {codeForm.formState.errors.root.message}
                </p>
              )}
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setStep('email')
                  codeForm.reset()
                }}
              >
                Changer d’e-mail
              </button>
            </div>
            <ActionButton
              type="submit"
              pending={codeForm.formState.isSubmitting}
              disabled={code.length < 8}
              className="w-full"
            >
              Vérifier
            </ActionButton>
          </form>
        )}
      </div>
    </div>
  )
}
