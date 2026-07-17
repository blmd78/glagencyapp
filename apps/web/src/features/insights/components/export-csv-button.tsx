'use client'

import { useTransition } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { exportChattersCsv } from '../actions'

/** Bouton ADMIN : télécharge la perf chatteur × modèle en CSV (analyse IA d'affectation). */
export function ExportCsvButton() {
  const [pending, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      const res = await exportChattersCsv()
      if (!res.success) {
        toast.error(res.error)
        return
      }
      const blob = new Blob([res.data.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${res.data.from}_au_${res.data.to}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export CSV téléchargé')
    })
  }

  return (
    <ActionButton size="sm" pending={pending} onClick={run} className="gap-1.5">
      <Download className="size-3.5" />
      Export CSV
    </ActionButton>
  )
}
