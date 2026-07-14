import { SpendersScreen } from '@/features/spenders/components/spenders-screen'

// Vue « archive » — garde et données dans le layout partagé (fetch unique pour les 4 vues).
export default function SpendersViewarchivePage() {
  return <SpendersScreen view="archive" />
}
