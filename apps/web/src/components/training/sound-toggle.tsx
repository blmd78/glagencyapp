'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isMuted, setMuted, SFX_MUTE_EVENT } from '@/lib/sfx'

/**
 * L'interrupteur du son de la face Formation. Flottant en bas à droite : il doit rester atteignable
 * depuis n'importe quelle page de la face (y compris en pleine roue) sans décaler d'un pixel la
 * mise en page des pages existantes.
 *
 * `useSyncExternalStore` plutôt qu'un `useState` + `useEffect` : le réglage vit dans
 * `localStorage`, c'est-à-dire hors de React. C'est le hook prévu pour ça — il donne le bon rendu
 * serveur (son actif) et se resynchronise tout seul quand le réglage change ailleurs, y compris
 * depuis un autre onglet.
 */
export function SoundToggle() {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener(SFX_MUTE_EVENT, onChange)
    // `storage` : l'utilisateur a coupé le son dans un autre onglet.
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(SFX_MUTE_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])
  const muted = useSyncExternalStore(subscribe, isMuted, () => false)
  const Icon = muted ? VolumeX : Volume2

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => setMuted(!muted)}
      aria-pressed={muted}
      title={muted ? 'Réactiver les sons' : 'Couper les sons'}
      className="fixed bottom-4 right-4 z-40 rounded-full shadow-sm"
    >
      <Icon aria-hidden className="size-4" />
      <span className="sr-only">{muted ? 'Réactiver les sons' : 'Couper les sons'}</span>
    </Button>
  )
}
