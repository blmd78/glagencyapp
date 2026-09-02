'use client'

import { Controller, type Control } from 'react-hook-form'
import { pageChoicesFor, subChoicesFor, subSlugsOf, type WorkspaceId } from '@/config/workspaces'
import type { LucideIcon } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { modelColor } from '@/lib/model-color'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { MemberForm } from '../schema'

const toggleArr = (arr: string[], key: string) =>
  arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key]

/**
 * Comme `toggleArr`, mais DÉCOCHER UNE PAGE retire aussi ses bouts (`overview:ca`…). Sans ça on
 * laisse un bout orphelin : `memberInput` le refuse à la soumission, et il ne donnerait rien de
 * toute façon (la page fait `requireAccess` sur SON slug avant de lire le bout).
 */
const togglePage = (arr: string[], key: string) => {
  if (!arr.includes(key)) return [...arr, key]
  const subs = subSlugsOf(key) as string[]
  return arr.filter((x) => x !== key && !subs.includes(x))
}

/**
 * Pages accessibles + modèles assignés. Extrait de member-dialog.tsx (split > 300 l.,
 * docs/guidelines-standard-feature.md) — JSX déplacé tel quel, DOM byte-identique.
 */
export function MemberPermissionFields({
  control,
  scope,
  roleValue,
  choices,
  creators,
  pagesError,
  isSubmitting,
}: {
  control: Control<MemberForm>
  scope: WorkspaceId
  roleValue: MemberForm['role']
  choices: { slug: string; label: string; icon: LucideIcon }[]
  creators: { id: string; name: string }[]
  pagesError?: string
  isSubmitting: boolean
}) {
  'use no memo'
  return (
    <>
      {roleValue !== 'admin' && (
        <Controller
          name="pages"
          control={control}
          render={({ field }) => (
            <div className="grid gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pages accessibles
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {choices.map((p) => {
                  const Icon = p.icon
                  return (
                    <label
                      key={p.slug}
                      className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
                    >
                      <Checkbox
                        checked={field.value.includes(p.slug)}
                        onCheckedChange={() => field.onChange(togglePage(field.value, p.slug))}
                        disabled={isSubmitting}
                      />
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="truncate">{p.label}</span>
                    </label>
                  )
                })}
              </div>
              {pagesError && (
                <p className="text-xs text-red-600 dark:text-red-400">{pagesError}</p>
              )}

              {/* DROITS FINS, hors de la grille ci-dessus et affichés SEULEMENT sous les pages
                  cochées : les fondre dans la grille l'aurait fait enfler d'une case par bout
                  pour tout le monde, y compris ceux qui n'ont pas la page (retour Benoit
                  2026-09-02, « un truc énorme et moche à cliquer »). Ici la section n'existe
                  que si une page cochée en propose — aujourd'hui l'Overview, elle seule. */}
              {(() => {
                const subs = subChoicesFor(scope).filter((sub) => field.value.includes(sub.parent!))
                if (subs.length === 0) return null
                const pageLabel = new Map(pageChoicesFor(scope).map((c) => [c.slug as string, c.label]))
                return (
                  <div className="mt-2 grid gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Droits détaillés
                    </span>
                    {/* Le survol dit ce que la case change à l'écran, en quelques mots — un
                        libellé de bout est elliptique par nature (« CA global » : global sur
                        quoi ?). Pas un paragraphe : juste ce que ça affiche. */}
                    <TooltipProvider delayDuration={150}>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {subs.map((sub) => {
                          const Icon = sub.icon
                          const card = (
                            <label
                              key={sub.slug}
                              className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
                            >
                              <Checkbox
                                checked={field.value.includes(sub.slug)}
                                onCheckedChange={() => field.onChange(toggleArr(field.value, sub.slug))}
                                disabled={isSubmitting}
                              />
                              <Icon className="size-4 text-muted-foreground" />
                              {/* Préfixé par sa page : la section les mélange dès qu'une 2e page
                                  aura des bouts, et le libellé seul ne dirait plus d'où il vient. */}
                              <span className="truncate">
                                <span className="text-muted-foreground">{pageLabel.get(sub.parent!)} · </span>
                                {sub.label}
                              </span>
                            </label>
                          )
                          // Pas de description → pas d'infobulle vide : la case est rendue nue.
                          if (!sub.description) return card
                          return (
                            <Tooltip key={sub.slug}>
                              <TooltipTrigger asChild>{card}</TooltipTrigger>
                              <TooltipContent side="top" className="text-xs font-normal">
                                {sub.description}
                              </TooltipContent>
                            </Tooltip>
                          )
                        })}
                      </div>
                    </TooltipProvider>
                  </div>
                )
              })()}
            </div>
          )}
        />
      )}

      {scope === 'chatter' && roleValue !== 'admin' && (
        <Controller
          name="creatorIds"
          control={control}
          render={({ field }) => (
            <div className="grid gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Modèles assignés
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {creators.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
                  >
                    <Checkbox
                      checked={field.value.includes(c.id)}
                      onCheckedChange={() => field.onChange(toggleArr(field.value, c.id))}
                      disabled={isSubmitting}
                    />
                    <Badge className={modelColor(c.name)}>{c.name}</Badge>
                  </label>
                ))}
              </div>
            </div>
          )}
        />
      )}
    </>
  )
}
