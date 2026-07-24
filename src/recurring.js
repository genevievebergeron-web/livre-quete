// ─── SEMAINE DE GARDE — utilitaires custody week + quêtes récurrentes ────────
// Lot 7A/7B (2026-07-24) — semaine active = ven PM → ven AM, 1 semaine sur 2.
// Référence d'ancre : 2026-07-24 (premier vendredi actif).

const CUSTODY_REFERENCE = "2026-07-24"; // vendredi PM

// ── Détection de la semaine active ──────────────────────────────────────────
export function isCustodyWeek(now = new Date()) {
  const ref = new Date(CUSTODY_REFERENCE + "T12:00:00");
  const diffMs = now.getTime() - ref.getTime();
  if (diffMs < 0) return false; // avant l'ancre → jamais actif
  const weeksSince = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return weeksSince % 2 === 0;
}

// Clé de la semaine de garde (vendredi-ancre de la semaine courante, format YYYY-MM-DD)
export function custodyWeekKey(now = new Date()) {
  const d = new Date(now);
  const dow = d.getDay(); // 0=dim...6=sam
  d.setDate(d.getDate() - ((dow + 2) % 7)); // recule au vendredi précédent
  return d.toISOString().slice(0, 10);
}

// ── PRNG déterministe (mulberry32) ──────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function seededShuffle(arr, seed) {
  const a = [...arr];
  const rand = mulberry32(hashString(String(seed)));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// instanceId stable par semaine + tâche + joueur + sous-tâche
function wqId(weekKey, taskId, playerId, slot) {
  const raw = `wq|${weekKey}|${taskId}|${playerId}|${slot}`;
  return "wq_" + hashString(raw).toString(36);
}

// ── Génération des assignments de la semaine de garde ───────────────────────
// todayDayIdx convention de App.jsx : Mon=0 Tue=1 Wed=2 Thu=3 Fri=4 Sat=5 Sun=6
const CUSTODY_DAY_IDX = [4, 5, 6, 0, 1, 2, 3]; // Ven→Jeu en indices App
// Garde = 7 jours (ven=0, sam=1, dim=2, lun=3, mar=4, mer=5, jeu=6)

export function generateCustodyWeekAssignments(players, weekKey) {
  if (!players || players.length < 2) return [];
  const shuffled = seededShuffle(players, weekKey);
  const N = shuffled.length; // 4 enfants
  const assignments = [];

  // ── Paires pour la brassée (fixées par pseudo, fallback si pseudo inconnu) ──
  // Éli + Antoinou, Oli + Antoine
  const findPlayer = (...pseudos) =>
    players.find(p => pseudos.some(ps => (p.pseudo || "").toLowerCase().includes(ps.toLowerCase())));
  const elli   = findPlayer("elli le goat", "elli");
  const antoinou = findPlayer("antoinou le goat", "antoinou");
  const oli    = findPlayer("oli le goat", "oli");
  const antoine = findPlayer("antoine dumont", "antoine");
  const pair1 = [elli?.id, antoinou?.id].filter(Boolean);
  const pair2 = [oli?.id,  antoine?.id ].filter(Boolean);

  // ── TÂCHES HEBDOMADAIRES ─────────────────────────────────────────────────
  // Brassée de lavage : chaque paire fait la sienne un jour de la semaine
  // (rotation du jour par semaine pour varier)
  const brasseeDayOffset = hashString(weekKey + "|brassee") % 5; // lun→ven = jours 0-4 custody → indices 3-6+0-1
  const brasseeDays1 = [CUSTODY_DAY_IDX[(brasseeDayOffset + 3) % 7]]; // lun offset
  const brasseeDays2 = [CUSTODY_DAY_IDX[(brasseeDayOffset + 4) % 7]]; // mar offset (j+1)

  if (pair1.length === 2) {
    assignments.push({ instanceId: wqId(weekKey, "rc_brassee", "p1", "a"), taskId: "rc_brassee", playerIds: pair1, days: brasseeDays1, time: "", isRecurring: true });
  }
  if (pair2.length === 2) {
    assignments.push({ instanceId: wqId(weekKey, "rc_brassee", "p2", "a"), taskId: "rc_brassee", playerIds: pair2, days: brasseeDays2, time: "", isRecurring: true });
  }

  // Ranger vêtements propres : chaque enfant pour lui-même, lendemain de la brassée de sa paire
  const rangerDay1 = [CUSTODY_DAY_IDX[(brasseeDayOffset + 4) % 7]]; // jour suivant brassée paire 1
  const rangerDay2 = [CUSTODY_DAY_IDX[(brasseeDayOffset + 5) % 7]]; // jour suivant brassée paire 2
  for (const pid of pair1) assignments.push({ instanceId: wqId(weekKey, "tm11", pid, "ranger"), taskId: "tm11", playerIds: [pid], days: rangerDay1, time: "", isRecurring: true });
  for (const pid of pair2) assignments.push({ instanceId: wqId(weekKey, "tm11", pid, "ranger"), taskId: "tm11", playerIds: [pid], days: rangerDay2, time: "", isRecurring: true });

  // Lavabo cuisine, lavabo sdb, contour bain : 3 enfants différents (shuffled[0..2]), un jour de la semaine
  const heboTaches = [
    { taskId: "rc_lavabo_cuisine", playerIdx: 0, dayOffset: 0 },
    { taskId: "tm12",              playerIdx: 1, dayOffset: 1 }, // lavabo sdb (existant)
    { taskId: "rc_contour_bain",   playerIdx: 2, dayOffset: 2 },
  ];
  for (const { taskId, playerIdx, dayOffset } of heboTaches) {
    const pid = shuffled[playerIdx % N]?.id;
    if (!pid) continue;
    const day = CUSTODY_DAY_IDX[(hashString(weekKey + taskId) % 5) + dayOffset > 6 ? ((hashString(weekKey + taskId) % 5) + dayOffset - 7) : (hashString(weekKey + taskId) % 5) + dayOffset];
    assignments.push({ instanceId: wqId(weekKey, taskId, pid, "hebdo"), taskId, playerIds: [pid], days: [day], time: "", isRecurring: true });
  }

  // ── TÂCHES QUOTIDIENNES ──────────────────────────────────────────────────
  for (let ci = 0; ci < 7; ci++) {
    const appDay = CUSTODY_DAY_IDX[ci]; // index App (Mon=0..Sun=6)

    // Vaisselle matin (haut) → enfant A du jour
    const vMatin = shuffled[ci % N]?.id;
    if (vMatin) assignments.push({ instanceId: wqId(weekKey, "tc01", vMatin, `d${ci}m`), taskId: "tc01", playerIds: [vMatin], days: [appDay], time: "matin", isRecurring: true });
    // Vaisselle soir (bas) → enfant B du jour (différent de matin)
    const vSoir = shuffled[(ci + 1) % N]?.id;
    if (vSoir && vSoir !== vMatin) assignments.push({ instanceId: wqId(weekKey, "tc02", vSoir, `d${ci}s`), taskId: "tc02", playerIds: [vSoir], days: [appDay], time: "soir", isRecurring: true });

    // Plancher → enfant C du jour
    const plancher = shuffled[(ci + 2) % N]?.id;
    if (plancher) assignments.push({ instanceId: wqId(weekKey, "tm07", plancher, `d${ci}`), taskId: "tm07", playerIds: [plancher], days: [appDay], time: "", isRecurring: true });

    // Verdure boulette matin → enfant A, soir → enfant C (différents)
    const verdMatin = shuffled[ci % N]?.id;
    if (verdMatin) assignments.push({ instanceId: wqId(weekKey, "td09", verdMatin, `d${ci}m`), taskId: "td09", playerIds: [verdMatin], days: [appDay], time: "matin", isRecurring: true });
    const verdSoir = shuffled[(ci + 2) % N]?.id;
    if (verdSoir && verdSoir !== verdMatin) assignments.push({ instanceId: wqId(weekKey, "td09", verdSoir, `d${ci}s`), taskId: "td09", playerIds: [verdSoir], days: [appDay], time: "soir", isRecurring: true });

    // Table repas 1 → enfant B, repas 2 → enfant D
    const tableR1 = shuffled[(ci + 1) % N]?.id;
    if (tableR1) assignments.push({ instanceId: wqId(weekKey, "tc07", tableR1, `d${ci}r1`), taskId: "tc07", playerIds: [tableR1], days: [appDay], time: "après repas 1", isRecurring: true });
    const tableR2 = shuffled[(ci + 3) % N]?.id;
    if (tableR2 && tableR2 !== tableR1) assignments.push({ instanceId: wqId(weekKey, "tc07", tableR2, `d${ci}r2`), taskId: "tc07", playerIds: [tableR2], days: [appDay], time: "après repas 2", isRecurring: true });

    // Comptoir repas 1 → enfant C, repas 2 → enfant A (différents)
    const compR1 = shuffled[(ci + 2) % N]?.id;
    if (compR1) assignments.push({ instanceId: wqId(weekKey, "tc08", compR1, `d${ci}r1`), taskId: "tc08", playerIds: [compR1], days: [appDay], time: "après repas 1", isRecurring: true });
    const compR2 = shuffled[ci % N]?.id;
    if (compR2 && compR2 !== compR1) assignments.push({ instanceId: wqId(weekKey, "tc08", compR2, `d${ci}r2`), taskId: "tc08", playerIds: [compR2], days: [appDay], time: "après repas 2", isRecurring: true });

    // Chaises → enfant D
    const chaises = shuffled[(ci + 3) % N]?.id;
    if (chaises) assignments.push({ instanceId: wqId(weekKey, "rc_chaises", chaises, `d${ci}`), taskId: "rc_chaises", playerIds: [chaises], days: [appDay], time: "", isRecurring: true });

    // Véranda → enfant A
    const veranda = shuffled[ci % N]?.id;
    if (veranda) assignments.push({ instanceId: wqId(weekKey, "rc_veranda", veranda, `d${ci}`), taskId: "rc_veranda", playerIds: [veranda], days: [appDay], time: "", isRecurring: true });

    // Balcon → enfant B
    const balcon = shuffled[(ci + 1) % N]?.id;
    if (balcon) assignments.push({ instanceId: wqId(weekKey, "rc_balcon", balcon, `d${ci}`), taskId: "rc_balcon", playerIds: [balcon], days: [appDay], time: "", isRecurring: true });
  }

  // ── TÂCHES PERSONNELLES (ménage cocon — chaque enfant pour lui-même) ──────
  // Aux 2 jours : elli+oli jours pairs (ci=0,2,4,6), antoinou+antoine jours impairs (ci=1,3,5)
  const [evenKids, oddKids] = [
    [0, 2].map(i => shuffled[i]?.id).filter(Boolean), // positions 0 et 2 dans shuffled = pairs
    [1, 3].map(i => shuffled[i]?.id).filter(Boolean), // positions 1 et 3 dans shuffled = impairs
  ];
  for (let ci = 0; ci < 7; ci++) {
    const appDay = CUSTODY_DAY_IDX[ci];
    const kids = ci % 2 === 0 ? evenKids : oddKids;
    for (const pid of kids) {
      assignments.push({ instanceId: wqId(weekKey, "tm09", pid, `d${ci}`), taskId: "tm09", playerIds: [pid], days: [appDay], time: "", isRecurring: true });
    }
  }

  return assignments;
}

// ── Helpers publics ──────────────────────────────────────────────────────────
// Renvoie true si aujourd'hui est le jeudi d'une semaine de garde
export function isCustodyThursday(now = new Date()) {
  return isCustodyWeek(now) && now.getDay() === 4; // getDay() 4 = jeudi
}

// Renvoie true si aujourd'hui est le vendredi de FIN de garde (veille du vendredi actif suivant)
export function isCustodyFridayEnd(now = new Date()) {
  return !isCustodyWeek(now) && now.getDay() === 5; // vendredi de la semaine inactive
}

// Vérifie si un enfant a complété son défi chaque jour de la garde (ven→jeu inclus)
// checkins = { "YYYY-MM-DD": true, ... }
export function hasPerfectChallengeWeek(checkins, weekKey) {
  if (!checkins) return false;
  for (let ci = 0; ci < 7; ci++) {
    const d = new Date(weekKey + "T12:00:00");
    d.setDate(d.getDate() + ci);
    const stamp = d.toISOString().slice(0, 10);
    if (!checkins[stamp]) return false;
  }
  return true;
}

// ID du cadre "Maître de soi" (item boutique — récompense défi parfait)
export const CHALLENGE_PERFECTION_FRAME_ID = "frame_maitre_de_soi";
