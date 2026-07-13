// Keep-alive : pingé par le navigateur (cf. components/keep-alive.tsx) pour garder
// l'isolate Workers chaud. Plan Free = éviction agressive → un isolate froid paie ~0,6 s
// de CPU à parser le bundle Next (~13 Mo) avant de répondre (mesuré : cpuTimeP99 595 ms,
// wallTimeP99 2,8 s). 204 sans corps ni querie : coût quasi nul (≤ 1 ms CPU à chaud).
export function GET() {
  return new Response(null, { status: 204 })
}
