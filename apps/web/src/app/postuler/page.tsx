import { TestFlow } from '@/features/recruit-test/TestFlow'

// Page publique du test de recrutement. AUCUNE donnée au montage — la config (banque QI, texte de
// frappe, nombre d'échanges) descend par `startAttempt`, quand le candidat clique sur « Commencer ».
// La page est donc statique : rien à garder, rien à streamer, pas de `loading.tsx`.
export default function PostulerPage() {
  return <TestFlow />
}
