import { SpendersScreen } from '@/features/spenders/components/spenders-screen'

// Vue « liste » — garde et données dans le layout partagé (fetch unique pour les 4 vues).
export default function SpendersViewlistePage() {
  return <SpendersScreen view="liste" />
}
