import { SpendersScreen } from '@/features/spenders/components/spenders-screen'

// Vue « tracker » — garde et données dans le layout partagé (fetch unique pour les 4 vues).
export default function SpendersViewtrackerPage() {
  return <SpendersScreen view="tracker" />
}
