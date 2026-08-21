'use client'

import { useState } from 'react'
import { ActionButton } from '@/components/action-button'
import { STEP_LABELS } from './progress-dots'

/** Ce que chaque épreuve demande, en une ligne — le candidat sait à quoi s'attendre, jamais comment il est noté. */
const PITCH: Record<(typeof STEP_LABELS)[number], string> = {
  // Ni le nombre de questions ni le chrono ne sont écrits ici : les deux viennent de la config
  // (banque de 1 à 20 questions, `qi_timer`) et cet écran est rendu AVANT `startAttempt` — la
  // page /postuler est statique, elle ne lit aucune donnée au montage.
  'Test de logique': 'des questions de logique, chronométrées une par une.',
  'Vitesse de frappe': 'un texte à recopier, le plus vite et le plus juste possible.',
  'Connexion internet': 'une mesure automatique de ton débit.',
  'Conversation avec un client': 'tu joues la créatrice face à un client, en direct.',
  'Tes coordonnées': 'nom, e-mail — pour qu’on puisse te répondre.',
}

/**
 * Écran d'entrée. Le clic sur « Commencer » est le SEUL endroit qui appelle `startAttempt` :
 * tant que le candidat hésite ici, aucune tentative n'est créée (le plafond est de 5 par IP et
 * par 24 h). Une reprise après rechargement court-circuite complètement cet écran.
 */
export function StepIntro({ onStart }: { onStart: () => Promise<void> }) {
  const [pending, setPending] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Rejoins l’équipe</h1>
        <p className="text-sm text-muted-foreground">
          Un test unique, en une seule fois, pour rejoindre nos chatters. Compte environ 10 minutes, au calme, sur un
          clavier confortable — tu ne pourras pas le repasser.
        </p>
      </div>

      <ol className="flex flex-col gap-3">
        {STEP_LABELS.map((label, i) => (
          <li key={label} className="flex gap-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {i + 1}
            </span>
            <span>
              <span className="font-medium">{label}</span>{' '}
              <span className="text-muted-foreground">— {PITCH[label]}</span>
            </span>
          </li>
        ))}
      </ol>

      <ActionButton
        pending={pending}
        className="w-full"
        onClick={async () => {
          setPending(true)
          try {
            await onStart()
          } finally {
            setPending(false)
          }
        }}
      >
        Commencer
      </ActionButton>
    </div>
  )
}
