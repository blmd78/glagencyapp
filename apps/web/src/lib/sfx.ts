/**
 * Habillage sonore de la face Formation — portage TypeScript des sons WebAudio de l'app Good Luck
 * Agency (`index.html`, `loserSound` / `sfx*`). Aucun fichier audio : tout est synthétisé, donc
 * zéro octet à télécharger et zéro dépendance.
 *
 * Deux familles, et c'est volontaire :
 *  - la TENSION (`playDefeat`) — l'arpège descendant d'une élimination. C'est le son qui fait
 *    qu'on a peur de rater, et il vaut plus, côté engagement, que dix jingles de félicitations ;
 *  - l'ÉVÉNEMENT RARE (roue, coffre, montée de rang, formation terminée).
 *
 * Ce qui reste MUET, sur décision produit : la progression quotidienne (cas terminé, médaille Or,
 * montée de niveau). Un son toutes les cinq minutes en open space, personne ne le supporte.
 *
 * Tout passe par `muted()` : un seul interrupteur pour toute la face (`SoundToggle`).
 */

const MUTE_KEY = 'glaSfxMuted'
/** Événement local : le bouton se resynchronise quand le réglage change dans un autre composant. */
export const SFX_MUTE_EVENT = 'gla-sfx-mute'

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setMuted(value: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  } catch {
    // Stockage refusé : le réglage ne survivra pas au rechargement, tant pis.
  }
  window.dispatchEvent(new CustomEvent(SFX_MUTE_EVENT, { detail: value }))
}

/**
 * Contexte audio unique et PARESSEUX : en créer un par son finit par saturer le quota du
 * navigateur (Chrome plafonne à ~6 contextes). `resume()` parce qu'un contexte créé avant toute
 * interaction démarre suspendu (autoplay policy).
 */
let audioContext: AudioContext | null = null
function ctx(): AudioContext | null {
  if (typeof window === 'undefined' || isMuted()) return null
  try {
    audioContext ??= new AudioContext()
    if (audioContext.state === 'suspended') void audioContext.resume()
    return audioContext
  } catch {
    return null
  }
}

/** Une note simple — l'équivalent du `wBeep` de l'original. */
function beep(a: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, gain: number): void {
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + 0.03)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(g)
  g.connect(a.destination)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

/** Bruit blanc filtré — base du vent. */
function noise(a: AudioContext, seconds: number): AudioBufferSourceNode {
  const len = Math.floor(a.sampleRate * seconds)
  const buffer = a.createBuffer(1, len, a.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = a.createBufferSource()
  src.buffer = buffer
  return src
}

/** Do-Mi-Sol-Do montant : la victoire (montée de rang, formation terminée, coffre ouvert). */
export function playVictory(): void {
  const a = ctx()
  if (!a) return
  const t = a.currentTime
  for (const [i, f] of [523, 659, 784, 1046].entries()) beep(a, f, t + i * 0.1, 0.42, 'triangle', 0.28)
}

/**
 * L'arpège DESCENDANT de la défaite (`loserSound`) : dents de scie 330 → 247 → 165. Élimination
 * sur faute grave ou chrono dépassé.
 */
export function playDefeat(): void {
  const a = ctx()
  if (!a) return
  const t = a.currentTime
  for (const [f, dt] of [[330, 0], [247, 0.18], [165, 0.4]] as const) beep(a, f, t + dt, 0.34, 'sawtooth', 0.18)
}

/** La roue qui tourne : des clics de plus en plus espacés, comme un cliquet qui ralentit. */
export function playWheelSpin(durationS = 4.6): void {
  const a = ctx()
  if (!a) return
  const t0 = a.currentTime
  let t = t0
  let step = 0.05
  while (t < t0 + durationS) {
    beep(a, 1300, t, 0.028, 'square', 0.07)
    step *= 1.062
    t += step
  }
}

/** Le « cling » cristallin de l'arrêt sur un secteur. */
export function playCling(): void {
  const a = ctx()
  if (!a) return
  const t = a.currentTime
  beep(a, 1568, t, 0.5, 'sine', 0.26)
  beep(a, 2093, t + 0.03, 0.55, 'sine', 0.15)
}

/** Coup sourd — chaque frappe sur le coffre. */
export function playThud(): void {
  const a = ctx()
  if (!a) return
  const t = a.currentTime
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(150, t)
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.14)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
  osc.connect(g)
  g.connect(a.destination)
  osc.start(t)
  osc.stop(t + 0.2)
}

/** Grincement du couvercle qui cède — dents de scie basses modulées. */
export function playCreak(): void {
  const a = ctx()
  if (!a) return
  const t = a.currentTime
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(65, t)
  osc.frequency.linearRampToValueAtTime(115, t + 1.2)
  const lfo = a.createOscillator()
  const lfoGain = a.createGain()
  lfo.type = 'square'
  lfo.frequency.value = 10
  lfoGain.gain.value = 16
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)
  lfo.start(t)
  lfo.stop(t + 1.2)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.1, t + 0.12)
  g.gain.setValueAtTime(0.1, t + 0.95)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25)
  osc.connect(g)
  g.connect(a.destination)
  osc.start(t)
  osc.stop(t + 1.3)
}

/**
 * Le « troll » du raté (GLA `sfxTroll`) : quatre notes en dents de scie qui DESCENDENT en
 * vibrant — la fanfare de victoire à l'envers. Sans lui, perdre à la roue est silencieux, et un
 * raté muet ne se ressent pas comme un raté.
 */
export function playTroll(): void {
  const a = ctx()
  if (!a) return
  const t0 = a.currentTime
  for (const [freq, dt] of [[233, 0], [207, 0.3], [185, 0.6], [146, 0.95]] as const) {
    const osc = a.createOscillator()
    const g = a.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(freq, t0 + dt)
    // Glissando vers le bas + vibrato : c'est ce qui lui donne son côté narquois.
    osc.frequency.linearRampToValueAtTime(freq * 0.93, t0 + dt + 0.26)
    const lfo = a.createOscillator()
    const lfoGain = a.createGain()
    lfo.frequency.value = 7
    lfoGain.gain.value = 6
    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)
    lfo.start(t0 + dt)
    lfo.stop(t0 + dt + 0.3)
    g.gain.setValueAtTime(0.0001, t0 + dt)
    g.gain.exponentialRampToValueAtTime(0.22, t0 + dt + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.32)
    osc.connect(g)
    g.connect(a.destination)
    osc.start(t0 + dt)
    osc.stop(t0 + dt + 0.34)
  }
}

/** Souffle de vent : l'entrée en scène du coffre. */
export function playWind(): void {
  const a = ctx()
  if (!a) return
  const t = a.currentTime
  const src = noise(a, 1.8)
  const filter = a.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.7
  filter.frequency.setValueAtTime(300, t)
  filter.frequency.linearRampToValueAtTime(900, t + 0.8)
  filter.frequency.linearRampToValueAtTime(500, t + 1.8)
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.35)
  g.gain.setValueAtTime(0.25, t + 1.1)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8)
  src.connect(filter)
  filter.connect(g)
  g.connect(a.destination)
  src.start(t)
}
