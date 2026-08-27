import type { ReactNode } from 'react'

/**
 * Barre de titre d'un écran du tracker — port de leur `.ctx` (`src/detailpage.js`).
 *
 * Vit en `components/tracking/` et non dans une feature : les quatre écrans de la face Présence
 * l'utilisent, et la frontière ESLint interdit qu'une feature importe une autre feature.
 *
 * Leur `.ctx` est `position: sticky` avec un fond translucide — repris tel quel : c'est ce qui
 * garde les filtres à portée quand on descend dans une liste de 200 chatteurs.
 */
export function CtxBar({
  title,
  crumb,
  children,
}: {
  title: string
  /** Fil d'Ariane à droite du titre, ex. « Shift Nuit · <b>mer. 26/08</b> ». */
  crumb?: ReactNode
  /** Filtres alignés à droite (leurs `.dd`). */
  children?: ReactNode
}) {
  return (
    <div className="ctx">
      <div className="ctxin">
        <div className="title">
          <h1>{title}</h1>
          {crumb ? <div className="crumb">{crumb}</div> : null}
        </div>
        {children ? <div className="ctx-mid">{children}</div> : null}
      </div>
    </div>
  )
}
