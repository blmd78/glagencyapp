'use client'

import * as React from 'react'
import { Questionnaire as QuestionnairePrimitive } from '@shadcn/react/questionnaire'
import { CheckIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { buttonVariants, type Button } from '@/components/ui/button'

/**
 * Questionnaire shadcn/ui (base Radix) — vendored depuis `shadcn-ui/ui`
 * `apps/v4/registry/bases/radix/ui/questionnaire.tsx` (le registry `add questionnaire` ne sert
 * pas notre style « default »). Le comportement (étapes, raccourcis clavier, a11y radiogroup)
 * vient du primitive headless `@shadcn/react/questionnaire` ; les classes ci-dessous sont la
 * feuille de style officielle du registry (`cn-questionnaire-*`, base « vega », recopiée en dur —
 * notre projet n'a pas la couche CSS `cn-*`), avec UN écart : `rounded-xl` (DA du projet) au
 * lieu de `rounded-md`.
 */

function Questionnaire({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Root>) {
  return (
    <QuestionnairePrimitive.Root
      data-slot="questionnaire"
      className={cn('flex w-full min-w-0 flex-col gap-6', className)}
      {...props}
    />
  )
}

function QuestionnaireProgress({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Progress>) {
  return (
    <QuestionnairePrimitive.Progress
      data-slot="questionnaire-progress"
      className={cn(
        'min-h-[1lh] w-fit min-w-[14ch] text-xs font-medium text-muted-foreground tabular-nums',
        className,
      )}
      {...props}
    />
  )
}

function QuestionnaireItem({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Item>) {
  return (
    <QuestionnairePrimitive.Item
      data-slot="questionnaire-item"
      className={cn('flex min-w-0 flex-col gap-5 border-0 p-0 outline-none', className)}
      {...props}
    />
  )
}

function QuestionnaireTitle({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Title>) {
  return (
    <QuestionnairePrimitive.Title
      data-slot="questionnaire-title"
      className={cn(
        'text-pretty text-base font-semibold [&:not(:has(~[data-slot=questionnaire-description]))]:mb-5',
        className,
      )}
      {...props}
    />
  )
}

function QuestionnaireDescription({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Description>) {
  return (
    <QuestionnairePrimitive.Description
      data-slot="questionnaire-description"
      className={cn('text-pretty text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function QuestionnaireChoices({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Choices>) {
  return (
    <QuestionnairePrimitive.Choices
      data-slot="questionnaire-choices"
      className={cn('group/questionnaire-choices grid min-w-0 gap-3', className)}
      {...props}
    />
  )
}

function QuestionnaireChoice({
  children,
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Choice>) {
  return (
    <QuestionnairePrimitive.Choice
      data-slot="questionnaire-choice"
      className={cn(
        'group/questionnaire-choice relative flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-input bg-transparent px-4 py-3.5 text-start text-sm shadow-xs transition-colors outline-none select-none',
        'hover:bg-muted/50 dark:bg-input/20',
        'data-checked:border-primary/40 data-checked:bg-muted dark:data-checked:bg-muted',
        'data-invalid:border-destructive',
        'has-[>input:focus-visible]:border-ring has-[>input:focus-visible]:ring-3 has-[>input:focus-visible]:ring-ring/50',
        'data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <QuestionnairePrimitive.ChoiceInput
        data-slot="questionnaire-choice-input"
        className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden="true"
        data-slot="questionnaire-choice-indicator"
        className={cn(
          'pointer-events-none relative flex size-4 shrink-0 translate-y-0.5 items-center justify-center rounded-[4px] border border-input dark:bg-input/30',
          'group-data-[type=radio]/questionnaire-choice:rounded-full',
          'group-data-checked/questionnaire-choice:border-primary group-data-checked/questionnaire-choice:bg-primary group-data-checked/questionnaire-choice:text-primary-foreground',
        )}
      >
        <span
          data-slot="questionnaire-choice-indicator-dot"
          className="hidden size-2 rounded-full bg-primary-foreground group-data-[type=checkbox]/questionnaire-choice:hidden group-data-checked/questionnaire-choice:block"
        />
        <CheckIcon
          data-slot="questionnaire-choice-indicator-check"
          className="hidden size-3.5 group-data-[type=radio]/questionnaire-choice:hidden group-data-checked/questionnaire-choice:block"
        />
      </span>
      <QuestionnairePrimitive.ChoiceLabel
        data-slot="questionnaire-choice-label"
        className="flex min-w-0 flex-1 flex-col gap-1 leading-snug"
      >
        {children}
      </QuestionnairePrimitive.ChoiceLabel>
      <QuestionnairePrimitive.ChoiceShortcut
        data-slot="questionnaire-choice-shortcut"
        className="pointer-events-none ms-auto hidden size-5 shrink-0 translate-y-0.5 items-center justify-center rounded-md border border-input bg-background font-mono text-[0.625rem] leading-none font-medium text-muted-foreground shadow-xs group-data-[shortcut]/questionnaire-choice:inline-flex"
      />
    </QuestionnairePrimitive.Choice>
  )
}

function QuestionnaireChoiceDescription({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="questionnaire-choice-description"
      className={cn('text-muted-foreground', className)}
      {...props}
    />
  )
}

function QuestionnaireError({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Error>) {
  return (
    <QuestionnairePrimitive.Error
      data-slot="questionnaire-error"
      className={cn('text-sm text-destructive', className)}
      {...props}
    />
  )
}

function QuestionnaireActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="questionnaire-actions"
      className={cn(
        'grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:min-h-9',
        className,
      )}
      {...props}
    />
  )
}

function QuestionnairePrevious({
  children,
  className,
  size = 'default',
  variant = 'outline',
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Previous> &
  Pick<React.ComponentProps<typeof Button>, 'size' | 'variant'>) {
  return (
    <QuestionnairePrimitive.Previous
      data-slot="questionnaire-previous"
      className={cn(
        buttonVariants({ size, variant }),
        'col-start-1 row-start-1 min-h-11 justify-self-start sm:min-h-0',
        className,
      )}
      {...props}
    >
      {children ?? 'Précédent'}
    </QuestionnairePrimitive.Previous>
  )
}

function QuestionnaireSkip({
  children,
  className,
  size = 'default',
  variant = 'outline',
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Skip> &
  Pick<React.ComponentProps<typeof Button>, 'size' | 'variant'>) {
  return (
    <QuestionnairePrimitive.Skip
      data-slot="questionnaire-skip"
      className={cn(
        buttonVariants({ size, variant }),
        'col-start-2 row-start-1 min-h-11 justify-self-end sm:min-h-0',
        className,
      )}
      {...props}
    >
      {children ?? 'Passer'}
    </QuestionnairePrimitive.Skip>
  )
}

function QuestionnaireNext({
  children,
  className,
  size = 'default',
  variant = 'default',
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Next> &
  Pick<React.ComponentProps<typeof Button>, 'size' | 'variant'>) {
  return (
    <QuestionnairePrimitive.Next
      data-slot="questionnaire-next"
      className={cn(
        buttonVariants({ size, variant }),
        'col-start-3 row-start-1 min-h-11 justify-self-end sm:min-h-0',
        className,
      )}
      {...props}
    >
      {children ?? 'Suivant'}
    </QuestionnairePrimitive.Next>
  )
}

function QuestionnaireSubmit({
  children,
  className,
  size = 'default',
  variant = 'default',
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Submit> &
  Pick<React.ComponentProps<typeof Button>, 'size' | 'variant'>) {
  return (
    <QuestionnairePrimitive.Submit
      data-slot="questionnaire-submit"
      className={cn(
        buttonVariants({ size, variant }),
        'col-start-3 row-start-1 min-h-11 justify-self-end sm:min-h-0',
        className,
      )}
      {...props}
    >
      {children ?? 'Envoyer'}
    </QuestionnairePrimitive.Submit>
  )
}

export {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
}
