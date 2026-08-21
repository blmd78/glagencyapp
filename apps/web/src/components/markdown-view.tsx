import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { cn } from '@/lib/utils'

/**
 * Rendu Markdown des cours de formation (page Modules) et de l'aperçu du Catalogue. GFM
 * (tables) + sauts de ligne simples respectés (remark-breaks : ce que l'admin tape dans le
 * Textarea = ce que le chatter voit). Aucun HTML brut rendu (react-markdown l'échappe par
 * défaut → pas de vecteur XSS). Styles posés élément par élément via `components` — pas de
 * plugin typography, rien de global. Utilisable en RSC comme dans un composant client.
 */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn('text-sm leading-relaxed', className)}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: ({ children }) => <h2 className="mt-8 mb-3 text-lg font-semibold tracking-tight first:mt-0">{children}</h2>,
          h2: ({ children }) => <h2 className="mt-8 mb-3 text-lg font-semibold tracking-tight first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-6 mb-2 text-base font-semibold">{children}</h3>,
          p: ({ children }) => <p className="my-3">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          a: ({ children, href }) => (
            <a href={href} className="underline underline-offset-2" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b px-3 py-2 text-left font-medium">{children}</th>,
          td: ({ children }) => <td className="border-b px-3 py-2 align-top">{children}</td>,
        }}
      >
        {source}
      </Markdown>
    </div>
  )
}
