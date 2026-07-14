import { SpendersScreen } from '@/features/spenders/components/spenders-screen'

// Vue « alertes » — garde et données dans le layout partagé (fetch unique pour les 4 vues).
export default function SpendersViewalertesPage() {
  return <SpendersScreen view="alertes" />
}
