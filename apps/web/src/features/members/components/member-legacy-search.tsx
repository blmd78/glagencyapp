'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { linkLegacyAccount, previewLegacyLogin, searchLegacyLogins } from '../actions-legacy'

/**
 * Le champ de rattachement d'un ancien login — et pourquoi ce n'est PAS un champ libre.
 *
 * Il n'existe ni e-mail ni nom fiable côté Good Luck Agency : sans aide, l'admin tape à l'aveugle
 * un login parmi 248, dont 162 portent des majuscules et 7 du non-ASCII. Une faute de frappe donne
 * un échec ; une faute PLAUSIBLE rattache le mauvais historique et brûle un `login_key`, qui est
 * unique. D'où deux obligations, tenues ici :
 *  1. autocomplétion serveur (Server Action admin — c'est un annuaire de 248 logins attaquables) ;
 *  2. APERÇU DE CONFIRMATION avant validation. « Rattacher » reste désactivé tant que l'aperçu ne
 *     porte pas exactement sur le login saisi : l'admin confirme un fait, pas une chaîne.
 */

type Preview = { login: string; sessions: number; lastAt: number | null; takenBy: string | null }

const FR_DAY = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' })

export function MemberLegacySearch({ profileId, onDone }: { profileId: string; onDone: () => void }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [checking, setChecking] = useState(false)
  const [pending, start] = useTransition()
  // Jeton de course : une réponse d'autocomplétion qui revient après une nouvelle frappe est jetée.
  const token = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onQueryChange = (v: string) => {
    setQuery(v)
    // Toute frappe invalide l'aperçu : sinon on validerait un fait qui ne décrit plus la saisie.
    setPreview(null)
    if (timer.current) clearTimeout(timer.current)
    const prefix = v.trim()
    if (prefix.length < 2) {
      setSuggestions([])
      return
    }
    const mine = ++token.current
    // Une lecture par pause de frappe, pas une par caractère : la requête part sur la base GLA.
    timer.current = setTimeout(async () => {
      // L'autocomplétion est un CONFORT : un échec (GLA injoignable, réseau) la vide sans rien
      // dire — le champ reste saisissable et « Vérifier » donnera, lui, un message explicite.
      const res = await searchLegacyLogins({ prefix }).catch(() => null)
      if (mine !== token.current) return
      setSuggestions(res?.success ? res.data : [])
    }, 300)
  }

  const check = async (login: string) => {
    setChecking(true)
    try {
      const res = await previewLegacyLogin({ login }).catch(() => null)
      if (!res) {
        toast.error('Vérification impossible — réessayez.')
        return
      }
      if (!res.success) {
        toast.error(res.error)
        return
      }
      if (!res.data) {
        toast.error(`Aucun compte « ${login} » sur l’ancienne plateforme.`)
        return
      }
      // Le login EXACT rendu par GLA remplace la saisie : c'est lui qui sera stocké et affiché.
      setQuery(res.data.login)
      setSuggestions([])
      setPreview(res.data)
    } finally {
      setChecking(false)
    }
  }

  const attach = () =>
    start(async () => {
      try {
        const res = await linkLegacyAccount({ profileId, login: query.trim() })
        if (!res.success) {
          toast.error(res.error)
          return
        }
        toast.success(res.data)
        setQuery('')
        setPreview(null)
      } catch {
        // Échec de transport (dépassement de `maxDuration`) : la réservation est posée et l'import
        // se termine par « Resynchroniser ». On recharge pour montrer l'état réel.
        toast.error('Rattachement interrompu — rechargez la fiche, puis relancez « Resynchroniser ».')
      }
      onDone()
    })

  const ready = preview != null && preview.login === query.trim()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gla-admin-login">Identifiant Good Luck Agency</Label>
        <div className="flex gap-2">
          <Input
            id="gla-admin-login"
            value={query}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Axel93"
            onChange={(e) => onQueryChange(e.target.value)}
            disabled={pending}
          />
          <Button type="button" variant="outline" onClick={() => check(query.trim())} disabled={checking || pending || query.trim().length < 1}>
            Vérifier
          </Button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <li key={s}>
              <Button type="button" size="sm" variant="outline" onClick={() => check(s)} disabled={checking || pending}>
                {s}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <p className="text-sm">
          <span className="font-medium">{preview.login}</span> —{' '}
          <span className="tabular-nums">{preview.sessions}</span> session{preview.sessions > 1 ? 's' : ''}
          {preview.lastAt ? `, dernière le ${FR_DAY.format(new Date(preview.lastAt))}` : ''}
          {preview.takenBy && (
            <span className="text-red-600 dark:text-red-400"> — déjà rattaché à {preview.takenBy}</span>
          )}
        </p>
      )}

      <ActionButton
        type="button"
        pending={pending}
        disabled={!ready || preview?.takenBy != null}
        onClick={attach}
        className="self-start"
      >
        Rattacher
      </ActionButton>
      {!ready && (
        <p className="text-xs text-muted-foreground">
          Vérifiez l’identifiant avant de rattacher — un rattachement erroné brûle l’identifiant, qui est unique.
        </p>
      )}
    </div>
  )
}
