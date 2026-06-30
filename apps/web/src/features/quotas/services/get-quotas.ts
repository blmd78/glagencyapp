import { createClient } from '@/lib/supabase/server'

/** Lecture des données de la feature « quotas » (appelée depuis la page). */
export async function getQuotas() {
  const supabase = await createClient()
  void supabase
  // TODO: requêter Supabase (la RLS applique le scope) et renvoyer la donnée typée.
  return null
}
