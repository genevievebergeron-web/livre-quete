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
// v2.16.77 — les champs de `config.players[i]` (fusionnés par `_mergePlayer`) n'avaient AUCUN
// contrôle : le joueur était une fixture STRUCTURELLE, identique des deux côtés, donc tout ce qui
// suit l'écartait par « rien à départager ». C'est la même forme de code et la même famille de bug
// qu'un cran au-dessus, et elle cachait quatre champs fautifs (`name`, `color`, `morningLock`,
// `dailyMinutesLimit`). Le joueur se contredit donc maintenant sur CHAQUE champ, `id` excepté —
// c'est la clé de rapprochement de `mergeFamily`, elle doit rester identique.
// Cohérence de fraîcheur, même règle que pour `gsA`/`gsB` : `plA` va dans `famA` (la copie fraîche),
// donc il porte les valeurs les plus récentes.
const plA = {
  id: "p1", name: "Test A", color: "#fff", pseudo: "T-A",
  themeId: "foret", themeChosenAt: "2026-08-15T10:00:00.000Z", starterThemes: ["lego"],
  morningLock: { enabled: true, start: "06:00", end: "09:00" },
  dailyMinutesLimit: 45,
};
const plB = {
  id: "p1", name: "Test B", color: "#000", pseudo: "T-B",
  themeId: "kpop", themeChosenAt: "2026-08-14T10:00:00.000Z", starterThemes: ["marvel"],
  morningLock: { enabled: false, start: "07:00", end: "10:00" },
  dailyMinutesLimit: null, // `null` est une VALEUR (« aucune limite »), pas une absence
};
memeValeur(plA, plB, "players[0]", { id: "clé de rapprochement de mergeFamily" });

const mkFam = (savedAt, gs, cfgExtra, pl) => ({
  savedAt,
  gameStates: [gs],
  config: {
    players: [pl],
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
}, plA);
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
}, plB);

memeValeur(famA.config, famB.config, "config", {
  // Structurels, volontairement identiques : ce sont les supports sur lesquels les
  // autres champs s'accrochent (une assignation `as1`, sa tâche `tk1`), pas des champs
  // dont la fusion est en jeu ici. (`players` n'en fait plus partie depuis la v2.16.77 :
  // il se contredit champ par champ et son contrôle dédié est plus bas.)
  assignments: 1, customTasks: 1, removedAssignments: 1, removedCustomTasks: 1,
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

// ── Champs de players[] sans règle de fusion ───────────────────────────────
// v2.16.77 — troisième étage du même contrôle, après `config` (v2.16.73) et
// `gameStates` (v2.16.75). `_mergePlayer` finit par `{ ...a, ...b }` comme les deux
// autres : tout champ joueur sans règle explicite rend la valeur de l'incoming, y
// compris quand l'incoming est PÉRIMÉ. Quatre champs y étaient : `morningLock` et
// `dailyMinutesLimit` (aucune règle du tout) et `name`/`color` (règle `a.X || b.X`,
// donc « la base gagne toujours » — le côté serveur met TOUJOURS sa propre copie en
// base, donc un renommage ne survivait jamais).
console.log("· _mergePlayer — parité client/serveur, dans les deux sens et les deux préférences");
for (const [la, a, lb, b] of [["A", plA, "B", plB], ["B", plB, "A", plA]]) {
  for (const pref of [true, false]) {
    const rc = client._mergePlayer(a, b, pref), rs = server._mergePlayer(a, b, pref);
    for (const k of new Set([...Object.keys(rc), ...Object.keys(rs)])) {
      if (!same(rc[k], rs[k]))
        fail(`_mergePlayer(${la},${lb},preferIncoming=${pref}) — champ « ${k} » : client ${JSON.stringify(rc[k])} ≠ serveur ${JSON.stringify(rs[k])}`);
    }
  }
}

// L'exemption est nominative et doit se justifier — pas une liste fourre-tout.
const NAIF_ASSUME_PL = {
  // Union bornée des deux côtés (tirage aléatoire fait UNE fois à la création du joueur,
  // sur un `id` unique : deux appareils ne peuvent pas en produire deux listes rivales).
  // Le résultat contient les deux valeurs, donc il n'est jamais « exactement le périmé » —
  // l'exemption ne masque rien, elle documente pourquoi ce champ ne peut pas crier.
  starterThemes: "union bornée, le résultat contient déjà la valeur fraîche",
};

console.log("· _mergePlayer — un champ périmé ne doit jamais gagner sur un champ frais");
for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
  const out = fn(famA, famB).config.players[0]; // famA = la plus fraîche, famB = l'incoming périmé
  for (const k of Object.keys(plB)) {
    if (same(plA[k], plB[k])) continue;          // rien à départager
    if (NAIF_ASSUME_PL[k]) continue;
    if (same(out[k], plB[k]))
      fail(`${nom} mergeFamily(frais, périmé) — players[0].${k} : la copie PÉRIMÉE a gagné `
         + `(${JSON.stringify(plB[k])}). Ce champ n'a pas de règle de fusion : ajoute-la dans `
         + `src/merge.js ET server-merge.cjs, ou inscris-le dans NAIF_ASSUME_PL avec sa raison.`);
  }
}

// Le sens inverse compte autant : le serveur appelle `mergeFamily(sa copie, le PUT)`, donc la
// copie fraîche arrive en INCOMING dès qu'un appareil pousse quelque chose de neuf. Un champ
// bloqué en « la base gagne toujours » (le défaut de `name`/`color` avant la v2.16.77) passe le
// contrôle ci-dessus sans broncher et échoue ici.
console.log("· _mergePlayer — le frais doit gagner AUSSI quand il arrive en incoming");
for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
  const out = fn(famB, famA).config.players[0]; // famB = base périmée, famA = incoming frais
  for (const k of Object.keys(plA)) {
    if (same(plA[k], plB[k])) continue;
    if (NAIF_ASSUME_PL[k]) continue;
    if (same(out[k], plB[k]))
      fail(`${nom} mergeFamily(périmé, frais) — players[0].${k} : la copie PÉRIMÉE a gagné `
         + `(${JSON.stringify(plB[k])}) alors que la fraîche arrivait en incoming. Règle bloquée `
         + `en « la base gagne toujours » — passe-la en dernière-écriture-gagne (\`w\`/\`o\`).`);
  }
}

// ── Champs-OBJETS : le contrôle qui regarde À L'INTÉRIEUR ──────────────────
// v2.16.78 — les trois étages ci-dessus ne testent que des champs PLATS, et ils
// comparent des fixtures dont la CLÉ D'ARBITRAGE diffère (famA/famB ont deux
// semaines de garde différentes, deux `weekKey` différents). Or plusieurs champs
// sont des objets arbitrés EN BLOC sur une seule de leurs clés — et la vraie vie,
// c'est justement l'égalité : pendant les 7 jours d'une semaine de garde,
// `generatedForWeek` ne bouge pas d'un pouce pendant que `assignments`, lui, est
// réécrit (report des tâches manquées, ménage des orphelines). À clé ÉGALE, une
// règle « la base gagne » ou « l'incoming gagne » rend l'objet entier d'un côté :
// la sous-clé que l'autre côté était seul à connaître est perdue, en silence, et
// aucun contrôle existant ne pouvait le voir — les deux copies étant d'accord
// (parité verte) et la clé d'arbitrage n'étant jamais mise à égalité.
// C'est ce trou qui a caché `weeklyQuests` pendant toute la vie du Lot 7.
//
// Le test : clé d'arbitrage IDENTIQUE des deux côtés, sous-clé contradictoire,
// valeur fraîche du côté frais. La sous-clé fraîche doit survivre DANS LES DEUX
// SENS (le serveur reçoit le frais en incoming, le client l'a en base).
const OBJETS_ARBITRES = [
  {
    champ: "weeklyQuests", cle: "generatedForWeek", sousCle: "assignments",
    // Écriture réelle : `carryOverUnfinishedTasks` (App.jsx ~2569) reporte à aujourd'hui une
    // récurrente manquée en réécrivant `days`, sans jamais toucher `generatedForWeek`.
    frais: { generatedForWeek: "2026-08-14", assignments: [{ instanceId: "wq1", taskId: "tk1", playerIds: ["p1"], days: [0, 2] }] },
    perime: { generatedForWeek: "2026-08-14", assignments: [{ instanceId: "wq1", taskId: "tk1", playerIds: ["p1"], days: [0] }] },
  },
  {
    champ: "weeklyChallenge", cle: "weekKey", sousCle: "challenges",
    // Le parent peut réécrire le texte du défi en cours de semaine ; les `checkins` s'unionnent.
    frais: { weekKey: "2026-08-14", challenges: [{ playerId: "p1", text: "Défi RÉÉCRIT", checkins: { "2026-08-14": true } }] },
    perime: { weekKey: "2026-08-14", challenges: [{ playerId: "p1", text: "Défi d'origine", checkins: { "2026-08-14": true } }] },
  },
];
console.log("· champs-objets — à clé d'arbitrage ÉGALE, une sous-clé fraîche ne doit pas être perdue");
for (const o of OBJETS_ARBITRES) {
  if (same(o.frais, o.perime))
    fail(`fixture champ-objet « ${o.champ} » — les deux copies sont identiques : le contrôle ne surveille rien.`);
  if (!same(o.frais[o.cle], o.perime[o.cle]))
    fail(`fixture champ-objet « ${o.champ} » — la clé d'arbitrage « ${o.cle} » DIFFÈRE entre les deux `
       + `copies : c'est le cas déjà couvert plus haut. Mets-la à ÉGALITÉ, sinon ce contrôle ne teste rien.`);
  const fA = mkFam("2026-08-15T12:00:00.000Z", gsA, { ...famA.config, [o.champ]: o.frais }, plA);
  const fB = mkFam("2026-08-14T12:00:00.000Z", gsB, { ...famB.config, [o.champ]: o.perime }, plB);
  for (const [sens, base, inc] of [["frais en base", fA, fB], ["frais en incoming", fB, fA]]) {
    const rc = client.mergeFamily(base, inc).config[o.champ];
    const rs = server.mergeFamily(base, inc).config[o.champ];
    if (!same(rc, rs))
      fail(`mergeFamily (${sens}) — config.${o.champ} : client ≠ serveur (dérive entre les deux copies).`);
    if (same(rc[o.sousCle], o.perime[o.sousCle]))
      fail(`mergeFamily (${sens}) — config.${o.champ}.${o.sousCle} : la sous-clé PÉRIMÉE a gagné alors `
         + `que « ${o.cle} » est identique des deux côtés. L'objet est arbitré EN BLOC sans regarder `
         + `dedans : passe l'égalité en dernière-écriture-gagne (\`preferIncoming\`) dans src/merge.js `
         + `ET server-merge.cjs, ou fusionne la sous-clé explicitement.`);
  }
}

// ── Tombstone d'assignation : il doit mordre DANS `weeklyQuests` aussi ──────
// v2.16.78 — `removedAssignments` protégeait `config.assignments` depuis toujours, mais pas les
// assignations vivant dans `weeklyQuests.assignments`. Pendant une semaine de garde, l'enfant voit
// pourtant les deux listes confondues et peut demander le retrait de n'importe laquelle.
console.log("· tombstone removedAssignments — doit retirer aussi une assignation de weeklyQuests");
{
  const wq = { generatedForWeek: "2026-08-14", assignments: [{ instanceId: "wq1", taskId: "tk1", playerIds: ["p1"], days: [0] }] };
  const fA = mkFam("2026-08-15T12:00:00.000Z", gsA, { ...famA.config, weeklyQuests: wq, removedAssignments: ["wq1"] }, plA);
  const fB = mkFam("2026-08-14T12:00:00.000Z", gsB, { ...famB.config, weeklyQuests: wq, removedAssignments: [] }, plB);
  for (const [sens, base, inc] of [["retrait en base", fA, fB], ["retrait en incoming", fB, fA]]) {
    for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
      const out = fn(base, inc).config.weeklyQuests;
      if ((out?.assignments || []).some((a) => a.instanceId === "wq1"))
        fail(`${nom} mergeFamily (${sens}) — l'assignation « wq1 » est tombstonée dans removedAssignments `
           + `mais survit dans weeklyQuests.assignments : le retrait approuvé par le parent ne part jamais.`);
    }
  }
}

// ── Objets fusionnés CLÉ PAR CLÉ : collision sur la MÊME sous-clé ──────────
// v2.16.79 — le contrôle précédent regarde dans un objet arbitré EN BLOC. Il ne
// voit rien d'un objet fusionné `{...a.X, ...b.X}`, où chaque sous-clé est
// arbitrée séparément : là, l'incoming gagne sur chaque clé qu'il porte, même
// périmé, et aucune fixture du fichier ne met jamais les deux côtés en collision
// sur la MÊME sous-clé (`gsA.equipped={hat}` contre `gsB.equipped={cape}` :
// l'union rend un objet différent des DEUX entrées, donc tous les contrôles se
// taisent, parité comprise). C'est ce trou qui a caché `equipped` et `avatar`
// pendant toute la vie de l'app — les deux signalements d'enfants les plus vieux
// encore ouverts (`bug_56gb01a` le casque de chevalier, `bug_xcqtyr7` les yeux et
// les bouches) étaient ça, et étaient classés « à voir dans le composant ».
//
// Le test : même sous-clé, valeurs contradictoires, valeur fraîche du côté frais,
// PLUS une sous-clé que seul le côté périmé connaît. La fraîche doit gagner dans
// les DEUX SENS, et la sous-clé orpheline doit survivre (sinon on aurait « remplacer
// l'objet entier », qui perd ce que l'autre côté était seul à savoir).
const OBJETS_PAR_CLE = [
  { champ: "equipped",    sousCle: "hat",  frais: "h_FRAIS", perime: "h_PERIME", orpheline: ["armor", "a_PERIME"], extra: {} },
  { champ: "settings",    sousCle: "calm", frais: true,      perime: false,      orpheline: ["fontScale", 1.3],    extra: {} },
  { champ: "petNickname", sousCle: "p1",   frais: "Nom frais", perime: "Nom périmé", orpheline: ["p9", "Vieux"],  extra: {} },
  // L'avatar n'entre dans la fusion par clé que si les DEUX côtés sont `configured`
  // (le cas des 4 enfants de la prod) — sinon le verrou `configured` tranche avant.
  { champ: "avatar",      sousCle: "eyes", frais: "ey_FRAIS", perime: "ey_PERIME", orpheline: ["mouth", "mo_PERIME"], extra: { configured: true } },
];
console.log("· objets fusionnés clé par clé — sur une sous-clé en collision, la fraîche doit gagner");
for (const o of OBJETS_PAR_CLE) {
  const objFrais  = { ...o.extra, [o.sousCle]: o.frais };
  const objPerime = { ...o.extra, [o.sousCle]: o.perime, [o.orpheline[0]]: o.orpheline[1] };
  if (same(objFrais[o.sousCle], objPerime[o.sousCle]))
    fail(`fixture clé-par-clé « ${o.champ} » — la sous-clé « ${o.sousCle} » porte la MÊME valeur des `
       + `deux côtés : il n'y a pas de collision, le contrôle ne surveille rien.`);
  if (o.orpheline[0] in objFrais)
    fail(`fixture clé-par-clé « ${o.champ} » — la sous-clé « ${o.orpheline[0] }» doit être connue du `
       + `SEUL côté périmé, sinon le contrôle d'union ne prouve rien.`);
  const fA = mkFam("2026-08-15T12:00:00.000Z", { ...gsA, [o.champ]: objFrais },  famA.config, plA);
  const fB = mkFam("2026-08-14T12:00:00.000Z", { ...gsB, [o.champ]: objPerime }, famB.config, plB);
  for (const [sens, base, inc] of [["frais en base", fA, fB], ["frais en incoming", fB, fA]]) {
    const rc = client.mergeFamily(base, inc).gameStates[0][o.champ];
    const rs = server.mergeFamily(base, inc).gameStates[0][o.champ];
    if (!same(rc, rs))
      fail(`mergeFamily (${sens}) — gameStates[0].${o.champ} : client ≠ serveur (dérive entre les deux copies).`);
    if (same(rc?.[o.sousCle], o.perime))
      fail(`mergeFamily (${sens}) — gameStates[0].${o.champ}.${o.sousCle} : la sous-clé PÉRIMÉE a gagné. `
         + `L'objet est fusionné clé par clé sans regarder \`preferIncoming\` : inverse l'ordre du spread `
         + `quand la BASE est la plus fraîche (\`_byKey\`), dans src/merge.js ET server-merge.cjs.`);
    if (!same(rc?.[o.orpheline[0]], o.orpheline[1]))
      fail(`mergeFamily (${sens}) — gameStates[0].${o.champ}.${o.orpheline[0]} : la sous-clé que SEUL le `
         + `côté périmé connaissait a disparu. La règle remplace l'objet entier au lieu de le fusionner `
         + `clé par clé : le côté frais doit écraser, le côté périmé compléter.`);
  }
}

// ── Verrou `configured` de l'avatar : une apparence non configurée ne gagne jamais ──
// v2.16.79 — non-régression de la règle d'origine, que le correctif ci-dessus ne doit pas dissoudre :
// un appareil FRAIS qui n'a pas encore fait l'onboarding avatar ne doit pas écraser l'apparence
// configurée d'un appareil en retard (sinon une réinstallation efface le personnage de l'enfant).
console.log("· avatar — une apparence NON configurée ne gagne jamais, même fraîche");
{
  const cfgOui = { configured: true, skin: "sk_CHOISI", eyes: "ey_CHOISI" };
  const cfgNon = { configured: false, skin: "sk_DEFAUT" };
  const fA = mkFam("2026-08-15T12:00:00.000Z", { ...gsA, avatar: cfgNon }, famA.config, plA); // FRAIS, pas configuré
  const fB = mkFam("2026-08-14T12:00:00.000Z", { ...gsB, avatar: cfgOui }, famB.config, plB); // périmé, configuré
  for (const [sens, base, inc] of [["non-configuré en base", fA, fB], ["non-configuré en incoming", fB, fA]]) {
    for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
      const out = fn(base, inc).gameStates[0].avatar;
      if (!same(out, cfgOui))
        fail(`${nom} mergeFamily (${sens}) — gameStates[0].avatar : l'apparence NON configurée a gagné `
           + `(${JSON.stringify(out)}). Le verrou \`configured\` doit passer avant la fraîcheur.`);
    }
  }
}

if (failures) {
  console.error(`\n✗ Couche de fusion : ${failures} problème(s).`);
  console.error("  Toute règle de fusion doit être écrite dans LES DEUX fichiers.\n");
  process.exit(1);
}
console.log("✓ Parité de fusion client/serveur vérifiée.");
