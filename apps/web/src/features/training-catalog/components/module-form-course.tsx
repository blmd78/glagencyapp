'use client'

import { useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownView } from '@/components/markdown-view'
import type { ModuleFormValues, ModuleInput } from '../schema'

/** Cours du module : Textarea Markdown + onglet Aperçu (même rendu que la page Modules). */
export function ModuleFormCourse({
  control,
  register,
  disabled,
}: {
  control: Control<ModuleFormValues, unknown, ModuleInput>
  register: UseFormRegister<ModuleFormValues>
  disabled?: boolean
}) {
  'use no memo'
  const courseMd = useWatch({ control, name: 'courseMd' }) ?? ''
  return (
    <Tabs defaultValue="write" className="flex flex-col gap-3">
      <TabsList className="self-start">
        <TabsTrigger value="write">Écrire</TabsTrigger>
        <TabsTrigger value="preview">Aperçu</TabsTrigger>
      </TabsList>
      {/* forceMount : le Textarea reste monté sous l'onglet Aperçu (RHF garde la valeur de toute
          façon, mais un démontage/remontage perd le curseur et le scroll). */}
      <TabsContent value="write" forceMount className="data-[state=inactive]:hidden">
        <Textarea
          rows={22}
          className="font-mono text-xs"
          placeholder={'## Pourquoi le Setting\n\nLe Setting, c’est **tout ce qui se passe avant** le premier média payant…\n\n- point 1\n- point 2\n\n| Ce qu’il dit | Ce qu’il faut faire |\n| --- | --- |\n| c’est trop cher | remonter la valeur |'}
          disabled={disabled}
          {...register('courseMd')}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Markdown : `## Titre`, `**gras**`, `*italique*`, listes `-` / `1.`, tableaux `| a | b |`. Un retour à la ligne = un saut de ligne.
        </p>
      </TabsContent>
      <TabsContent value="preview">
        {courseMd.trim() ? (
          <div className="max-h-[50vh] overflow-y-auto rounded-md border p-4">
            <MarkdownView source={courseMd} className="max-w-prose" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Rien à afficher — le cours est vide.</p>
        )}
      </TabsContent>
    </Tabs>
  )
}
