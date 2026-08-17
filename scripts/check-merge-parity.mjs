// ═══════════════════════════════════════════════════════════════════════════
// Parité de la couche de fusion : `src/merge.js` (client) vs `server-merge.cjs`
// ═══════════════════════════════════════════════════════════════════════════
// Pourquoi ce fichier existe (v2.16.71, 2026-08-15) :
// la fusion du serveur est une COPIE MANUELLE de celle du client — `server.cjs`
// est en CommonJS, `src/merge.js` est un module ESM qui tire themes/pets/leagues/
// recurring/shared/energy. Depuis juillet, chaque correctif de fusion a dû être
// écrit DEUX fois (v2.15.7, v2.15.8, v2.16.34, v2.16.42, v2.16.62, v2.16.65,
// v2.16.67, v2.16.70…). Rien ne vérifiait que les deux copies disaient la même
// chose : au 15 août, SIX règles avaient dérivé en silence.
//
// Ce script rejoue les DEUX implémentations sur les mêmes entrées et échoue à la
// moindre divergence. Il tourne dans `npm run build`, donc aucune version ne peut
// plus partir en prod avec un serveur qui fusionne autrement que le client.
//
// Il ne teste PAS si une règle est bonne — seulement que les deux copies sont
// d'accord. Une règle fausse écrite deux fois passe (et c'est voulu : le rôle de
// ce garde-fou est la dérive, pas la relecture).
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const require = createRequire(import.meta.url);

const client = await import(path.join(ROOT, "src/merge.js"));
const server = require(path.join(ROOT, "server-merge.cjs"));

let failures = 0;
const fail = (msg) => { failures++; console.error("  ✗ " + msg); };

// Comparaison profonde tolérante à l'ORDRE des clés d'objet (les deux copies
// construisent leurs littéraux dans un ordre différent, ce n'est pas une dérive)
// mais PAS à l'ordre des tableaux (l'ordre d'un tableau est un comportement).
const norm = (v) => {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = norm(v[k]);
    return out;
  }
  return v;
};
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

// ── Jeux d'essai ───────────────────────────────────────────────────────────
// Deux états de joueur qui se contredisent sur CHAQUE champ connu : c'est le
// seul moyen de voir une règle manquante (un champ identique des deux côtés
// donne le même résultat même sans règle du tout).
const gsA = {
  xp: 900, coins: 120, coinsLifetime: 900, coinsWeek: { week: "2026-08-14", coins: 40 },
  completed: ["t1#2026-08-14"], completedAt: { "t1#2026-08-14": "2026-08-14T10:00:00.000Z" },
  xpLog: [{ id: "x1", date: "2026-08-14", amount: 20, source: "quete" }],
  pending: ["t2#2026-08-14"], refusedKeys: ["t9#2026-08-01"], refusals: ["r-a"],
  owned: ["item_a"], boughtRewards: ["rw_ecran"], rewardBuyTs: { rw_ecran: 111 },
  refundedRewards: ["rw_old"], badges: ["b_a"], equipped: { hat: "h_a" },
  // v2.16.75 — `updatedAt` du côté FRAIS : voir la note « cohérence de fraîcheur » plus bas.
  calendar: [{ id: "e1", updatedAt: 9, title: "A" }], removedCalendarIds: ["e0"],
  avatar: { configured: true, skin: "a" }, pin: "1111", mode: "routine",
  removedRoutineIds: ["r_old"],
  routines: [{ id: "rt1", name: "Matin A", tasks: ["a"] }],
  // v2.16.76 — `hiddenWeek` porte le JOUR du seau `hiddenRewards`, et la règle arbitre sur ce jour,
  // pas sur la fraîcheur de la famille. Le jour le plus récent va donc du côté FRAIS (famA), même
  // raison que `calendar.updatedAt` juste au-dessus : sans ça le contrôle crierait au loup.
  activeRoutineId: "rt1", hiddenRewards: ["rw_h_a"], hiddenWeek: "2026-08-14",
  dailyClaimed: { day: "2026-08-14", ids: ["o3"] },
  ritualCelebrated: { day: "2026-08-14", ids: ["rt1"] },
  consumedCelebrationIds: ["c_a"], pendingCelebrations: [{ id: "c_p_a" }],
  petXp: { dragon: 40 }, petDay: { day: "2026-08-14", xp: 25 },
  petEvo: { dragon: { path: "feu" } }, petNickname: { dragon: "Flamme" },
  energy: 60, energyTs: "2026-08-14T12:00:00.000Z", lastFedDay: "2026-08-14",
  activeDays: ["2026-08-14"], leagueTier: "or",
  sessionMinutes: { day: "2026-08-15", minutes: 42 },
  bossBattle: { bossId: "2026-08-01", earned: 5, spent: 2, dmg: 30 },
  settings: { calm: true }, dismissedAnnouncements: ["an_a"],
  challengeTiers: { week: "2026-08-14", tiers: [3] },
  house: { deco: ["tapis_a"] }, lastSeenDay: "2026-08-15",
  // v2.16.74 — valeurs croisées EXPRÈS (A gagne sur menage, B sur cuisine, defi seulement chez B) :
  // un MAX clé par clé doit rendre un objet différent des DEUX entrées, sinon un spread naïf
  // passerait inaperçu.
  catCounts: { menage: 12, cuisine: 3 },
};
const gsB = {
  ...gsA,
  xp: 700, coins: 80, coinsLifetime: 800, coinsWeek: { week: "2026-08-07", coins: 99 },
  completed: ["t3#2026-08-15"], completedAt: { "t3#2026-08-15": "2026-08-15T10:00:00.000Z" },
  xpLog: [{ id: "x2", date: "2026-08-15", amount: 30, source: "rituel" }],
  pending: ["t4#2026-08-15"], refusedKeys: ["t8#2026-08-02"], refusals: ["r-b"],
  owned: ["item_b"], boughtRewards: ["rw_bonbon"], rewardBuyTs: { rw_bonbon: 222 },
  refundedRewards: ["rw_new"], badges: ["b_b"], equipped: { cape: "c_b" },
  calendar: [{ id: "e1", updatedAt: 5, title: "B" }], removedCalendarIds: ["e2"],
  avatar: { configured: false, skin: "b" }, pin: "2222", mode: "semaine",
  removedRoutineIds: ["r_other"],
  routines: [{ id: "rt1", name: "Matin B", tasks: ["a", "b"] }],
  activeRoutineId: "rt2", hiddenRewards: ["rw_h_b"], hiddenWeek: "2026-08-07", // v2.16.76 — jour PÉRIMÉ ici, voir famA
  dailyClaimed: { day: "2026-08-14", ids: ["o6"] },
  ritualCelebrated: { day: "2026-08-14", ids: ["rt2"] },
  consumedCelebrationIds: ["c_b"], pendingCelebrations: [{ id: "c_p_b" }],
  petXp: { dragon: 10, chat: 5 }, petDay: { day: "2026-08-14", xp: 10 },
  petEvo: { dragon: { path: "glace" } }, petNickname: { chat: "Minou" },
  energy: 95, energyTs: "2026-08-14T12:01:00.000Z", lastFedDay: "2026-08-13",
  activeDays: ["2026-08-13"], leagueTier: "bronze",
  sessionMinutes: { day: "2026-08-15", minutes: 5 },
  bossBattle: { bossId: "2026-08-01", earned: 9, spent: 1, dmg: 10 },
  settings: { sound: false }, dismissedAnnouncements: ["an_b"],
  challengeTiers: { week: "2026-08-07", tiers: [3, 5, 7] },
  house: { deco: ["tapis_b"] }, lastSeenDay: "2026-08-14",
  catCounts: { menage: 4, cuisine: 9, defi: 2 },
};

// ── Les fixtures doivent VRAIMENT se contredire ────────────────────────────
// v2.16.75 — `gsB` part d'un `...gsA` puis ré-écrit les champs un à un. Si une
// ré-écriture manque (champ ajouté à `gsA` seulement) ou pose la MÊME valeur, le
// champ devient identique des deux côtés — et tous les contrôles ci-dessous
// l'écartent en silence par « rien à départager ». Le champ semble surveillé, il
// ne l'est pas. C'est arrivé en écrivant ce fichier : `lastSeenDay` s'est retrouvé
// à "2026-08-15" des deux côtés, et la preuve de sensibilité (retirer sa règle des
// deux copies) ne déclenchait rien. Un champ non surveillé doit crier, pas se taire.
const memeValeur = (a, b, quoi, exempt = {}) => {
  for (const k of Object.keys(b)) {
    if (exempt[k]) continue;
    if (same(a[k], b[k]))
      fail(`fixture ${quoi} — « ${k} » porte la MÊME valeur des deux côtés : aucun contrôle `
         + `ne peut le voir (tous écartent « rien à départager »). Donne-lui deux valeurs `
         + `contradictoires, la plus fraîche du côté A.`);
  }
};
console.log("· fixtures — chaque champ connu doit se contredire entre A et B");
memeValeur(gsA, gsB, "gameStates");

console.log("· mergeGS — champ par champ, dans les deux sens et les deux préférences");
for (const [la, a, lb, b] of [["A", gsA, "B", gsB], ["B", gsB, "A", gsA]]) {
  for (const pref of [true, false]) {
    const rc = client.mergeGS(a, b, pref), rs = server.mergeGS(a, b, pref);
    for (const k of new Set([...Object.keys(rc), ...Object.keys(rs)])) {
      if (!same(rc[k], rs[k]))
        fail(`mergeGS(${la},${lb},preferIncoming=${pref}) — champ « ${k} » : client ${JSON.stringify(rc[k])} ≠ serveur ${JSON.stringify(rs[k])}`);
    }
  }
}

// ── Instantanés famille complets ───────────────────────────────────────────
const mkFam = (savedAt, gs, cfgExtra) => ({
  savedAt,
  gameStates: [gs],
  config: {
    players: [{ id: "p1", name: "Test", color: "#fff", themeId: "foret", pseudo: "T" }],
    assignments: [{ instanceId: "as1", taskId: "tk1", playerIds: ["p1"], days: [1] }],
    removedAssignments: [], customTasks: [{ id: "tk1", label: "Tâche" }], removedCustomTasks: [],
    pin: "1146", mode: "routine", routineEnd: "08:30",
    ...cfgExtra,
  },
});
const famA = mkFam("2026-08-15T12:00:00.000Z", gsA, {
  announcements: [{ id: "an1", createdAt: "2026-08-14", text: "A" }],
  childTaskProposals: [{ id: "pr1", label: "Proposition A" }], removedProposals: ["pr0"],
  removalRequests: [{ id: "rq1", instanceId: "as1" }],
  customRewards: [{ id: "cr1", label: "Maison A", coins: 20 }], theme: "minecraft",
  updateFeedEntries: [{ type: "update", version: "2.16.70", features: ["a"], ts: "2026-08-15" }],
  selectedRewards: ["rw_ecran"], seenVersions: ["2.16.70"],
  feed: [{ id: "f1", ts: 2, likes: ["p1"] }],
  bugs: [{ id: "bg1", ts: 2 }], errorLogs: [{ id: "er1", ts: 2 }],
  coinOffers: [], teamInvites: [], repairEvents: [{ id: "rp1", ts: 2 }], momentRequests: [],
  // `defeatedAt` seulement d'un côté : sans ça, la règle « même boss » ({...a,...b} + garde sur
  // defeatedAt/lastHitTs) rend un objet identique à famB, et le contrôle « le périmé a gagné »
  // ci-dessous ne peut pas distinguer une vraie règle d'un spread naïf (faux positif).
  boss: { startedAt: "2026-08-01", hp: 100, lastHitTs: "2026-08-14T10:00:00.000Z", defeatedAt: "2026-08-14T20:00:00.000Z" },
  weeklyQuests: { generatedForWeek: "2026-08-14", assignments: [{ instanceId: "wq1", taskId: "tk1", playerIds: ["p1"], days: [0] }] },
  weeklyChallenge: { weekKey: "2026-08-14", challenges: [{ playerId: "p1", text: "A", checkins: { "2026-08-14": true } }] },
});
const famB = mkFam("2026-08-14T12:00:00.000Z", gsB, {
  announcements: [{ id: "an2", createdAt: "2026-08-13", text: "B" }],
  childTaskProposals: [{ id: "pr2", label: "Proposition B" }], removedProposals: ["pr3"],
  removalRequests: [{ id: "rq2", instanceId: "as1" }],
  customRewards: [{ id: "cr2", label: "Maison B", coins: 30 }], theme: "foret",
  updateFeedEntries: [{ type: "update", version: "2.16.41", features: ["b"], ts: "2026-08-06" }],
  selectedRewards: ["rw_bonbon"], seenVersions: ["2.16.41"],
  feed: [{ id: "f1", ts: 2, likes: ["p2"] }],
  bugs: [{ id: "bg2", ts: 1 }], errorLogs: [{ id: "er2", ts: 1 }],
  coinOffers: [], teamInvites: [], repairEvents: [{ id: "rp2", ts: 1 }], momentRequests: [],
  boss: { startedAt: "2026-08-01", hp: 60, lastHitTs: "2026-08-15T10:00:00.000Z" },
  weeklyQuests: { generatedForWeek: "2026-08-07", assignments: [{ instanceId: "wq2", taskId: "tk1", playerIds: ["p1"], days: [1] }] },
  weeklyChallenge: { weekKey: "2026-08-07", challenges: [{ playerId: "p1", text: "B", checkins: { "2026-08-07": true } }] },
});

memeValeur(famA.config, famB.config, "config", {
  // Structurels, volontairement identiques : ce sont les supports sur lesquels les
  // autres champs s'accrochent (un joueur `p1`, une assignation `as1`, sa tâche
  // `tk1`), pas des champs dont la fusion est en jeu ici.
  players: 1, assignments: 1, customTasks: 1, removedAssignments: 1, removedCustomTasks: 1,
  pin: 1, mode: 1, routineEnd: 1,
  // Volontairement vides des deux côtés : rien à départager par construction, la
  // parité champ par champ ci-dessus reste leur contrôle.
  coinOffers: 1, teamInvites: 1, momentRequests: 1,
});

console.log("· mergeFamily — instantanés complets, dans les deux sens");
for (const [la, a, lb, b] of [["A", famA, "B", famB], ["B", famB, "A", famA]]) {
  const rc = client.mergeFamily(a, b), rs = server.mergeFamily(a, b);
  for (const k of new Set([...Object.keys(rc.config), ...Object.keys(rs.config)])) {
    if (!same(rc.config[k], rs.config[k]))
      fail(`mergeFamily(${la},${lb}) — config.${k} : client ${JSON.stringify(rc.config[k])} ≠ serveur ${JSON.stringify(rs.config[k])}`);
  }
  if (!same(rc.savedAt, rs.savedAt)) fail(`mergeFamily(${la},${lb}) — savedAt : ${rc.savedAt} ≠ ${rs.savedAt}`);
  if (!same(rc.seenVersions, rs.seenVersions)) fail(`mergeFamily(${la},${lb}) — seenVersions`);
  if (!same(rc.gameStates, rs.gameStates)) fail(`mergeFamily(${la},${lb}) — gameStates`);
}

// ── Champs de config sans règle de fusion ──────────────────────────────────
// v2.16.73 — la parité ci-dessus ne voit PAS une règle manquante : quand un champ
// retombe sur le spread naïf `{...bC,...iC}`, les deux copies sont naïves de la
// même façon, donc d'accord, donc vertes. C'est ce trou qui a laissé passer
// `weeklyChallenge` (v2.5.16), `weeklyQuests` (v2.14.2), `routines` (v2.16.70),
// `petNickname` (v2.16.71), `house` (v2.16.72), puis `theme` et `customRewards`
// (v2.16.73) — sept fois la même forme, trouvée sept fois à la main.
//
// Le test : fusionner la copie FRAÎCHE (famA) avec une copie PLUS VIEILLE
// (famB) — c'est le sens réel du bug, un appareil en retard qui pousse. Un champ
// avec une vraie règle donne soit la valeur fraîche, soit une fusion des deux.
// Le spread naïf, lui, rend EXACTEMENT la valeur périmée : c'est la signature.
//
// L'exemption est nominative et doit se justifier — pas une liste fourre-tout.
const NAIF_ASSUME = {
  // Reconstruit à chaque chargement depuis CHANGELOG (`migrations.js`, dedupeUpdateFeed)
  // et purement informatif. Une union ici RÉ-GONFLERAIT la liste : c'est exactement
  // l'incident des ~5127 entrées qui a cassé la synchro (v2.5.29).
  updateFeedEntries: "reconstruit au chargement depuis CHANGELOG — une union le regonflerait",
  // Date de création de la famille : écrite une fois, jamais modifiée, donc identique
  // des deux côtés dans la vraie vie.
  createdAt: "immuable après la création",
  // Drapeaux de migration (`colorToneDownV1`, `rotativeCleanupV1`, `orphanAssignCleanupV1/V2`,
  // `routineOrphanCleanupV1`, `updateFeedRebuildV1`…) : ne valent JAMAIS que `true`, et une
  // clé absente d'`iC` n'efface pas celle de `bC` avec un spread. Vérifié en v2.16.72.
  __drapeaux: "true-seulement, le spread ne peut pas les perdre",
};
const estDrapeau = (k, v) => v === true && /V\d+$/.test(k);

console.log("· mergeFamily — un champ périmé ne doit jamais gagner sur un champ frais");
for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
  const out = fn(famA, famB).config; // famA = la plus fraîche, famB = l'incoming périmé
  for (const k of Object.keys(famB.config)) {
    const frais = famA.config[k], perime = famB.config[k];
    if (same(frais, perime)) continue;            // rien à départager
    if (NAIF_ASSUME[k] || estDrapeau(k, perime)) continue;
    if (same(out[k], perime))
      fail(`${nom} mergeFamily(frais, périmé) — config.${k} : la copie PÉRIMÉE a gagné `
         + `(${JSON.stringify(perime)}). Ce champ n'a pas de règle de fusion : ajoute-la dans `
         + `src/merge.js ET server-merge.cjs, ou inscris-le dans NAIF_ASSUME avec sa raison.`);
  }
}

// ── Champs de gameStates sans règle de fusion ──────────────────────────────
// v2.16.75 — exactement le même contrôle que celui ci-dessus, un cran plus bas.
// Le test « le périmé ne gagne jamais » ne regardait que `config`, alors que les
// DEUX derniers champs pris en flagrant délit de spread naïf (`house` et
// `lastSeenDay`, v2.16.72) vivent dans `gameStates`, pas dans `config` : le
// garde-fou écrit la veille pour cette famille de bugs ne pouvait pas les voir.
// `routines` (v2.16.70), `petNickname` (v2.16.71) et `challengeTiers` (v2.16.71)
// sont dans le même cas. Étendu ici, il les aurait tous attrapés seul.
//
// Même sens que pour `config` : `mergeFamily(famA, famB)` met la copie FRAÎCHE en
// base et la PÉRIMÉE en incoming, donc `preferIncoming` vaut `false`. Un champ
// avec une vraie règle rend la valeur fraîche ou une fusion des deux ; le spread
// naïf `{...a, ...b}` de `mergeGS` rend EXACTEMENT la valeur périmée.
//
// ⚠️ COHÉRENCE DE FRAÎCHEUR DES FIXTURES (à respecter en modifiant gsA/gsB).
// Beaucoup de règles de `mergeGS` n'arbitrent PAS sur la fraîcheur de la famille
// mais sur un jeton porté par le champ lui-même : `updatedAt` par événement
// (`calendar`), le jour (`petDay`, `dailyClaimed`, `lastFedDay`, `lastSeenDay`,
// `sessionMinutes`), la semaine (`coinsWeek`, `challengeTiers`), `energyTs`, ou un
// MAX (`petDay.xp`, `catCounts`, `xp`). Si la fixture PÉRIMÉE porte le jeton le plus
// récent — ou le plus grand pour un MAX — la règle rend légitimement la valeur
// périmée et ce contrôle crie au loup. Ce n'est pas un cas réel : un appareil dont
// le `savedAt` est en retard ne peut pas avoir vu un jour postérieur.
// Donc : dans `gsA` (famille fraîche), TOUT jeton de fraîcheur doit être le plus
// récent, et tout champ arbitré par MAX doit porter la plus grande valeur. Trois
// l'avaient à l'envers au moment d'écrire ce contrôle (`calendar.updatedAt` 5 vs 9,
// `petDay.xp` 10 vs 25, `lastSeenDay` 08-14 vs 08-15) — corrigés ici, pas exemptés :
// une exemption aurait éteint pour de bon la surveillance de trois vrais champs.
//
// L'exemption est nominative et doit se justifier — pas une liste fourre-tout.
// v2.16.76 — les 3 exemptions posées la veille (`mode`, `activeRoutineId`, `hiddenWeek`) sont
// LEVÉES : c'était la piste laissée par la v2.16.75, et elle était bien un bug. Leur règle
// `b.X ?? a.X` disait « l'incoming gagne toujours » — le comportement exact du spread naïf que ce
// contrôle traque — donc la tablette en retard imposait son mode, son rituel et son jour de
// masquage. Les trois arbitrent désormais sur la fraîcheur (`preferIncoming`, ou le jour du seau
// pour `hiddenWeek`) et sont surveillés comme les autres. Liste vide : plus rien à exempter ici.
const NAIF_ASSUME_GS = {};

console.log("· mergeGS — un champ périmé ne doit jamais gagner sur un champ frais");
for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
  const out = fn(famA, famB).gameStates[0]; // famA = la plus fraîche, famB = l'incoming périmé
  const frais = famA.gameStates[0], perime = famB.gameStates[0];
  for (const k of Object.keys(perime)) {
    if (same(frais[k], perime[k])) continue;    // rien à départager
    if (NAIF_ASSUME_GS[k]) continue;
    if (same(out[k], perime[k]))
      fail(`${nom} mergeFamily(frais, périmé) — gameStates[0].${k} : la copie PÉRIMÉE a gagné `
         + `(${JSON.stringify(perime[k])}). Ce champ n'a pas de règle de fusion : ajoute-la dans `
         + `src/merge.js ET server-merge.cjs, ou inscris-le dans NAIF_ASSUME_GS avec sa raison.`);
  }
}

if (failures) {
  console.error(`\n✗ Couche de fusion : ${failures} problème(s).`);
  console.error("  Toute règle de fusion doit être écrite dans LES DEUX fichiers.\n");
  process.exit(1);
}
console.log("✓ Parité de fusion client/serveur vérifiée.");
