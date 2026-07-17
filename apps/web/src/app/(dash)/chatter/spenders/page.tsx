import { redirect } from 'next/navigation'

// La sous-catégorie Spenders vit sous /chatter/spenders/* — l'entrée nue redirige vers la
// Liste. Pas de loading.tsx ici (redirect() pur, rien ne streame) — même précédent que
// `app/(dash)/chatter/page.tsx`.
export default function SpendersIndex() {
  redirect('/chatter/spenders/liste')
}
