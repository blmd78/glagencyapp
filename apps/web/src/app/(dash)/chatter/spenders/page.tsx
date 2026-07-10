import { redirect } from 'next/navigation'

// La sous-catégorie Spenders vit sous /chatter/spenders/* — l'entrée nue redirige vers la Liste.
export default function SpendersIndex() {
  redirect('/chatter/spenders/liste')
}
