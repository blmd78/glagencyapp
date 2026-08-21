import { describe, expect, it } from 'vitest'
import {
  DEPARTURE_INITIATIVE,
  DEPARTURE_LABEL,
  DEPARTURE_REASONS,
  INITIATIVE_LABEL,
  EVENT_KINDS,
  isEventKind,
  memberEventLabel,
  memberEventOp,
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
      'sanction',
      'rapport',
      'recompense',
    ])
    expect(isEventKind('shift')).toBe(true)
    expect(isEventKind('nimportequoi')).toBe(false)
  })
})

describe('memberEventOp — la nature de l’opération se lit dans la forme (from, to)', () => {
  it('une valeur qui apparaît = ajout', () => {
    expect(memberEventOp(null, 'chatteur')).toBe('ajout') // création
    expect(memberEventOp(null, 'Emma')).toBe('ajout') // modèle ajouté
    expect(memberEventOp(null, '2026-08-15 (vire)')).toBe('ajout') // départ enregistré
  })

  it('une valeur qui disparaît = suppression', () => {
    expect(memberEventOp('Sarah', null)).toBe('suppression') // modèle retiré
    expect(memberEventOp('2026-08-06 (malus 11 € — horaires)', null)).toBe('suppression') // sanction
  })

  it('un remplacement = mise à jour, et (null, null) retombe dessus', () => {
    expect(memberEventOp('matin', 'soir')).toBe('maj')
    expect(memberEventOp(null, null)).toBe('maj')
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

  // 0110 : les PLACEMENTS vivent sur l'ASSIGNATION (chatter × modèle), plusieurs possibles. Le
  // trigger compose `<modèle> · <codes séparés par ", ">` ; les codes sont traduits, le nom du
  // modèle passe tel quel.
  it('modèle avec placements (0110) : « Emma · matin » → codes traduits, nom conservé', () => {
    expect(memberEventLabel('modele', null, 'Emma · matin')).toBe('Modèle Emma · Matin ajouté')
    expect(memberEventLabel('modele', 'Sarah · aprem, soir', null)).toBe(
      'Modèle Sarah · Après-midi, Soir retiré',
    )
  })

  it('placements par modèle (0110) : flèche entre deux listes composées', () => {
    expect(memberEventLabel('shift', 'Emma · matin', 'Emma · matin, soir')).toBe(
      'Shift : Emma · Matin → Emma · Matin, Soir',
    )
    // Un placement marqué heure sup garde son suffixe, le code est traduit quand même.
    expect(memberEventLabel('shift', 'Emma · matin, soir (HS)', 'Emma · matin (HS), soir')).toBe(
      'Shift : Emma · Matin, Soir (HS) → Emma · Matin (HS), Soir',
    )
    expect(memberEventLabel('modele', 'Sarah · aprem (HS)', null)).toBe(
      'Modèle Sarah · Après-midi (HS) retiré',
    )
    expect(memberEventLabel('shift', null, 'Emma · soir')).toBe('Shift : Emma · Soir')
    expect(memberEventLabel('shift', 'Emma · soir', null)).toBe('Shift retiré (Emma · Soir)')
    // Code inconnu dans la liste : brut, jamais avalé (même règle que le shift seul).
    expect(memberEventLabel('shift', 'Emma · matin', 'Emma · matin, nuit')).toBe(
      'Shift : Emma · Matin → Emma · Matin, nuit',
    )
    // Un nom de modèle qui contiendrait lui-même le séparateur : seul ce qui suit le DERNIER
    // séparateur est lu comme des codes.
    expect(memberEventLabel('shift', null, 'Sam · Léa · aprem')).toBe('Shift : Sam · Léa · Après-midi')
    // Le shift PRINCIPAL (trigger `profiles`, 0101) garde son format « code seul ».
    expect(memberEventLabel('shift', 'matin', 'aprem')).toBe('Shift : Matin → Après-midi')
  })

  it('sanction retirée : date en français, clé d’erreur traduite', () => {
    // `from` composé par le trigger 0107 — clé brute traduite ICI (le SQL ne connaît pas
    // les libellés). Miroir exact du format `to_char(occurred_on) (détail — clé)`.
    expect(memberEventLabel('sanction', '2026-08-06 (malus 25 € — media_argent)', null)).toBe(
      'Sanction du 06/08/2026 retirée (malus 25 € — Parle de média/argent directement)',
    )
    expect(memberEventLabel('sanction', '2026-08-06 (avertissement — horaires)', null)).toBe(
      'Sanction du 06/08/2026 retirée (avertissement — Non respect des horaires de travail)',
    )
    // Sans clé d'erreur (malus libre) : pas de tiret orphelin.
    expect(memberEventLabel('sanction', '2026-08-06 (malus 10 €)', null)).toBe(
      'Sanction du 06/08/2026 retirée (malus 10 €)',
    )
    // Clé inconnue : brute plutôt qu'un trou ; format inattendu : valeur telle quelle.
    expect(memberEventLabel('sanction', '2026-08-06 (avertissement — nouvelle_cle)', null)).toBe(
      'Sanction du 06/08/2026 retirée (avertissement — nouvelle_cle)',
    )
    expect(memberEventLabel('sanction', 'nimportequoi', null)).toBe(
      'Sanction retirée (nimportequoi)',
    )
    expect(memberEventLabel('sanction', null, null)).toBe('Sanction retirée')
  })

  it('récompense (roue, 0122) : la valeur composée par le trigger est déjà lisible', () => {
    expect(memberEventLabel('recompense', null, 'Roue : 10 € — Top 2 — semaine du 11/08')).toBe(
      'Roue : 10 € — Top 2 — semaine du 11/08',
    )
    expect(memberEventLabel('recompense', null, 'Roue : Raté — Top 1 — semaine du 11/08')).toBe(
      'Roue : Raté — Top 1 — semaine du 11/08',
    )
    expect(memberEventLabel('recompense', null, null)).toBe('Récompense')
  })

  it('rapport du soir supprimé : date en français, modèle en clair', () => {
    // `from` composé par le trigger 0107 — nom du modèle résolu en base à la suppression.
    expect(memberEventLabel('rapport', '2026-08-03 (Julie)', null)).toBe(
      'Rapport du soir du 03/08/2026 supprimé (Julie)',
    )
    // Format inattendu : valeur brute ; sans valeur : phrase minimale.
    expect(memberEventLabel('rapport', 'nimportequoi', null)).toBe(
      'Rapport du soir supprimé (nimportequoi)',
    )
    expect(memberEventLabel('rapport', null, null)).toBe('Rapport du soir supprimé')
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
