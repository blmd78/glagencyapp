import { createClient } from '@/lib/supabase/server'

/** Lecture des données de la feature « compta » (appelée depuis la page). */
export async function getCompta() {
  const supabase = await createClient()
  void supabase
  // TODO: requêter Supabase (la RLS applique le scope) et renvoyer la donnée typée.
  return null
}
