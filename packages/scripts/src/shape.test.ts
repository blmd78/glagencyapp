import { describe, expect, it } from 'vitest'
import { looksLikeScript } from './shape'

// Textes neutres au format de `blocksToText` (citation « > », titres « ### », sous-pages) — aucun texte
// réel d'une modèle.
describe('looksLikeScript', () => {
  it('script à bulles en citation et étapes numérotées', () => {
    const text = ['### #1 — Accroche', '> coucou toi', '> ça va ?', '⏸️ Attendre sa réponse', '### #2 — Prénom', '> et tu t’appelles comment ?'].join('\n')
    expect(looksLikeScript(text)).toBe(true)
  })

  it('script sans citation : étapes, enchaînements et médias suffisent', () => {
    const text = ['#1 · Transition ⏩ À la suite', 'et du coup…', '#2 — Bonne réponse → ENVOYER LE PPV 1', 'tiens ta récompense'].join('\n')
    expect(looksLikeScript(text)).toBe(true)
  })

  it('réponses en alternatives (N1, E2) et vocal', () => {
    expect(looksLikeScript(['N1 · Il est dispo', 'trop bien', 'E2 · Il fait un compliment', '🎙️ VOCAL 1 – merci'].join('\n'))).toBe(true)
  })

  it('alternatives N1 / N2 sans ponctuation après le numéro', () => {
    expect(looksLikeScript(['N1 Il est dispo', 'trop bien', 'N2 Il est occupé', 'tkt une autre fois'].join('\n'))).toBe(true)
  })

  it('script court d’une seule bulle en citation : une bulle suffit', () => {
    expect(looksLikeScript('> coucou, comment vas-tu ?')).toBe(true)
  })

  it('bibliothèque de messages qui parle de PPV', () => {
    expect(looksLikeScript(['- PPV à 15 € : tu veux voir la suite ?', '- s’il négocie le PPV : bon ok pour toi 12'].join('\n'))).toBe(true)
  })

  it('page vide ou page média (une image, aucun texte)', () => {
    expect(looksLikeScript('')).toBe(false)
    expect(looksLikeScript('   \n  ')).toBe(false)
  })

  it('page sommaire : titres et sous-pages, rien d’un script', () => {
    const text = ['# OUTILS MANAGERS', '[sous-page : Script découverte (KYC) · Lucie]', '[sous-page : Prompt – Script de vente V3]', '## Liens utiles', '[page liée 123]'].join('\n')
    expect(looksLikeScript(text)).toBe(false)
  })

  it('page de texte libre (fiche, consignes) : une seule marque ne suffit pas', () => {
    const text = ['Fiche de la modèle', 'Âge : 24 ans, ville : Montreuil', 'Toujours répondre en minuscules.', 'La photo 1 du profil est à changer.'].join('\n')
    expect(looksLikeScript(text)).toBe(false)
  })

  it('« # Titre » de section n’est pas une étape « #1 »', () => {
    expect(looksLikeScript(['# Script', '## Notes', '### Idées'].join('\n'))).toBe(false)
  })
})
