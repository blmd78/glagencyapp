import { NextResponse } from 'next/server'

// Route Handler (cas spécial) : génération d'analyse IA à la demande (Claude).
// TODO: auth (getUser), récup des stats semaine, appel API Anthropic, renvoi JSON.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'non implémenté — squelette' },
    { status: 501 },
  )
}
