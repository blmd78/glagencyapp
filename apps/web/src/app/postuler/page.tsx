import { TestFlow } from '@/features/recruit-test/TestFlow'

// Page publique du test de recrutement. AUCUNE donnée au montage — la config (banque QI, texte de
// frappe, nombre d'échanges) descend par `startAttempt`, quand le candidat clique sur « Commencer ».
// La page est donc statique : rien à garder, rien à streamer, pas de `loading.tsx`.

// Les Server Actions de CETTE route appellent les mêmes modèles que la face Formation — la notation
// Sonnet a un timeout client de 60 s et la conversation enchaîne les appels Haiku. Les deux autres
// routes qui appellent l'IA déclarent déjà 300 s (`/formation/overview`, `/formation/session/[id]`) ;
// sans cette ligne, celle-ci restait au défaut de la plateforme et pouvait couper une notation déjà
// payée. Écart relevé à l'audit du 21/08.
export const maxDuration = 300

export default function PostulerPage() {
  return <TestFlow />
}
