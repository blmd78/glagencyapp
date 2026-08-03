import { describe, expect, it } from 'vitest'
import {
  DEPARTURE_INITIATIVE,
  DEPARTURE_LABEL,
  DEPARTURE_REASONS,
  INITIATIVE_LABEL,
  EVENT_KINDS,
  isEventKind,
  memberEventLabel,
} from './member-events'

describe('vocabulaire', () => {
  it('couvre les cinq motifs du check SQL 0102', () => {
    expect(DEPARTURE_REASONS.map((r) => r.value)).toEqual([
      'vire',
      'demission',
      'fin_essai',
      'abandon',
      'autre',
    ])
  })

  it('donne un libellé à chaque motif', () => {
    for (const r of DEPARTURE_REASONS) expect(DEPARTURE_LABEL[r.value]).toBe(r.label)
  })

  it('reconnaît les kinds du check SQL, et rejette le reste', () => {
    // Liste ÉNUMÉRÉE et non comptée : un simple `toHaveLength` passerait si on remplaçait un
    // kind par un autre. Miroir exact du check `member_events_kind_check` (0101) —
    // ce test est ce qui casse quand la base et le domaine divergent.
    expect([...EVENT_KINDS]).toEqual([
      'creation',
      'role',
      'shift',
      'closing',
      'modele',
      'manager',
      'pages',
      'nouveau',
      'arrivee',
      'sortie',
      'lien',
      'identite',
    ])
    expect(isEventKind('shift')).toBe(true)
    expect(isEventKind('nimportequoi')).toBe(false)
  })
})

describe('memberEventLabel — chaque type produit une phrase lisible', () => {
  it('création', () => {
    expect(memberEventLabel('creation', null, 'chatteur')).toBe('Compte créé (Chatteur)')
    expect(memberEventLabel('creation', null, null)).toBe('Compte créé')
  })

  it('rôle et shift : traduits, avec une flèche', () => {
    expect(memberEventLabel('role', 'chatteur', 'sous-manager')).toBe(
      'Rôle : Chatteur → Sous-manager',
    )
    expect(memberEventLabel('shift', 'aprem', 'soir')).toBe('Shift : Après-midi → Soir')
  })

  it('une valeur inconnue s’affiche telle quelle plutôt que de disparaître', () => {
    // Contrainte SQL élargie un jour sans passer ici : mieux vaut un libellé brut qu'un trou.
    expect(memberEventLabel('shift', 'aprem', 'nuit')).toBe('Shift : Après-midi → nuit')
  })

  it('un retrait (pas de valeur d’arrivée) est nommé, pas fléché', () => {
    expect(memberEventLabel('shift', 'soir', null)).toBe('Shift retiré (Soir)')
    expect(memberEventLabel('manager', 'Axel', null)).toBe('Rattachement retiré (Axel)')
  })

  it('modèle : les deux sens sont nommés', () => {
    expect(memberEventLabel('modele', null, 'Emma')).toBe('Modèle Emma ajouté')
    expect(memberEventLabel('modele', 'Sarah', null)).toBe('Modèle Sarah retiré')
  })

  it('pages : un compte, jamais la liste', () => {
    expect(memberEventLabel('pages', '3', '1')).toBe('Droits modifiés (3 → 1 pages)')
    expect(memberEventLabel('pages', null, null)).toBe('Droits modifiés (0 → 0 pages)')
  })

  it('drapeau nouvel arrivant, dans les deux sens', () => {
    expect(memberEventLabel('nouveau', 'false', 'true')).toBe('Marqué nouvel arrivant')
    expect(memberEventLabel('nouveau', 'true', 'false')).toBe(
      'Drapeau « nouvel arrivant » retiré',
    )
  })

  it('arrivée : date en format français', () => {
    expect(memberEventLabel('arrivee', null, '2026-07-30')).toBe('Date d’arrivée : 30/07/2026')
    expect(memberEventLabel('arrivee', '2026-07-30', null)).toBe('Date d’arrivée effacée')
  })
})

describe('memberEventLabel — la sortie, dont la valeur est composite', () => {
  it('traduit le motif produit par le trigger', () => {
    expect(memberEventLabel('sortie', null, '2026-08-15 (abandon)')).toBe(
      'Départ le 15/08/2026 — Abandon de poste',
    )
    expect(memberEventLabel('sortie', null, '2026-08-15 (vire)')).toBe(
      'Départ le 15/08/2026 — Viré',
    )
  })

  it('accepte une date sans motif', () => {
    expect(memberEventLabel('sortie', null, '2026-08-15')).toBe('Départ le 15/08/2026')
  })

  it('rend un motif inconnu tel quel plutôt que de l’avaler', () => {
    expect(memberEventLabel('sortie', null, '2026-08-15 (retraite)')).toBe(
      'Départ le 15/08/2026 — retraite',
    )
  })

  it('une valeur de forme INATTENDUE s’affiche brute, jamais tronquée au hasard', () => {
    // LE cas qui justifie la regex : un `slice(12, -1)` rendait ici un fragment silencieusement
    // faux. On préfère un libellé visiblement imparfait à un libellé faux et crédible.
    expect(memberEventLabel('sortie', null, 'parti')).toBe('Départ : parti')
    expect(memberEventLabel('sortie', null, '15/08/2026')).toBe('Départ : 15/08/2026')
  })

  it('une réactivation est un départ annulé', () => {
    expect(memberEventLabel('sortie', '2026-08-15 (vire)', null)).toBe('Départ annulé (réactivé)')
  })
})

describe('memberEventLabel — lien MyPuls et fiche (0101)', () => {
  it('nomme le lien MyPuls dans les trois sens', () => {
    // Ce lien décide de quel CA est attribué au membre, donc de sa paie : le libellé doit dire
    // ce qui s'est passé, pas « Lien : → Sam ».
    expect(memberEventLabel('lien', null, 'Sam')).toBe('Lié à la fiche MyPuls Sam')
    expect(memberEventLabel('lien', 'Sam', null)).toBe('Lien MyPuls retiré (Sam)')
    expect(memberEventLabel('lien', 'Sam', 'Léa')).toBe('Lien MyPuls : Sam → Léa')
  })

  it('rend les changements de fiche (nom, email, lien de travail)', () => {
    expect(memberEventLabel('identite', 'Aboubakar', 'Aboubakar B.')).toBe(
      'Fiche : Aboubakar → Aboubakar B.',
    )
    expect(memberEventLabel('identite', null, 'https://exemple.fr')).toBe(
      'Fiche : https://exemple.fr',
    )
  })
})

describe('initiative du départ — la lecture utile du turnover', () => {
  it('range chaque motif du côté de qui a décidé', () => {
    // Sans cette distinction, un taux de 20 % ne dit pas s'il faut mieux recruter ou mieux
    // retenir : deux problèmes différents, deux réponses différentes.
    expect(DEPARTURE_INITIATIVE.vire).toBe('agence')
    expect(DEPARTURE_INITIATIVE.fin_essai).toBe('agence')
    expect(DEPARTURE_INITIATIVE.demission).toBe('chatteur')
    expect(DEPARTURE_INITIATIVE.abandon).toBe('chatteur')
    expect(DEPARTURE_INITIATIVE.autre).toBe('autre')
  })

  it('donne un libellé à chaque initiative', () => {
    for (const r of DEPARTURE_REASONS) expect(INITIATIVE_LABEL[r.initiative]).toBeTruthy()
  })
})
