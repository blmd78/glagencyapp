'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DownloadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { importFromTracker, type ImportResult } from '../import-actions'

/**
 * « Récupérer mon historique du tracker » — l'encadrant saisit SES identifiants du tracker
 * (chatterstracker.duckdns.org), et ses to-do + le suivi de ses chatteurs se recopient chez lui.
 *
 * Modèle de la reprise Formation : c'est SON authentification qui établit le lien, sans qu'on ait à
 * deviner quel compte est le sien. Le mot de passe ne sert qu'à la connexion serveur, il n'est
 * jamais stocké. Pas de RHF ici (donc pas de `'use no memo'`) : deux champs, un `useState` suffit.
 */
export function TrackerImportButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [pending, start] = useTransition()

  const submit = () => {
    start(async () => {
      const r = await importFromTracker({ trackerUser: user.trim(), trackerPass: pass })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      setResult(r.data)
      setPass('')
      toast.success('Historique récupéré')
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          setResult(null)
          setPass('')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <DownloadCloud className="size-3.5" /> Récupérer mon historique du tracker
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Récupérer mon historique du tracker</DialogTitle>
          <DialogDescription>
            Connecte-toi avec TES identifiants du tracker (chatterstracker.duckdns.org). Tes to-do des
            semaines passées et le suivi de tes chatteurs seront recopiés ici. Ton mot de passe ne
            sert qu’à la connexion — il n’est pas conservé.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium">C’est fait :</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              <li>{result.tasksAdded} tâche{result.tasksAdded > 1 ? 's' : ''} de to-do</li>
              <li>{result.sessionsAdded} session{result.sessionsAdded > 1 ? 's' : ''} 1:1</li>
              <li>{result.notesAdded} note{result.notesAdded > 1 ? 's' : ''} de suivi</li>
            </ul>
            {result.unmatchedChatters.length > 0 && (
              <p className="text-amber-600 dark:text-amber-400">
                {result.unmatchedChatters.length} chatteur(s) du tracker n’ont pas de fiche
                correspondante ici — leur suivi n’a pas été repris :{' '}
                <span className="text-muted-foreground">{result.unmatchedChatters.slice(0, 8).join(', ')}
                  {result.unmatchedChatters.length > 8 ? '…' : ''}</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Tu peux relancer sans risque : rien n’est dupliqué.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="tk-user" className="text-sm font-medium">Identifiant du tracker</label>
              <input
                id="tk-user"
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                autoComplete="off"
                placeholder="ex. marcus"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="tk-pass" className="text-sm font-medium">Mot de passe du tracker</label>
              <input
                id="tk-pass"
                type="password"
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button size="sm" onClick={() => setOpen(false)}>Fermer</Button>
          ) : (
            <ActionButton size="sm" pending={pending} disabled={!user.trim() || !pass} onClick={submit}>
              Récupérer
            </ActionButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
