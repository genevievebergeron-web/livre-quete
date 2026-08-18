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
  resetAt: 1755000000000, // v2.16.81 — même valeur dans gsB : voir l'exemption de `memeValeur` plus bas
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
  routines: [{ id: "rt1", name: "Matin A", taskIds: ["as1"] }],
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
  routines: [{ id: "rt1", name: "Matin B", taskIds: ["as1", "as2"] }],
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
// v2.16.81 — `resetAt` est le SEUL champ légitimement exempté, et pour une raison de fond : ce
// n'est pas un contenu, c'est une ÉPOQUE. Deux valeurs différentes font retourner à `mergeGS` un
// côté ENTIER (voir sa tête), donc tous les contrôles champ-par-champ ci-dessous deviendraient
// vides de sens — le garde-fou passerait au vert en ne surveillant plus rien. Il porte donc la
// même valeur des deux côtés ici, et son arbitrage a sa propre section dédiée (« époque de
// reset »), qui le met justement en contradiction.
memeValeur(gsA, gsB, "gameStates", { resetAt: true });

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
  announcements: [{ id: "an1", createdAt: "2026-08-14", text: "A", targetPlayerIds: ["p1"], sharedTasks: ["ranger"] }],
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
  announcements: [{ id: "an2", createdAt: "2026-08-13", text: "B", targetPlayerIds: ["p1"], sharedTasks: ["ranger"] }],
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

// ── LISTES fusionnées par `id` : le 4e étage, celui de l'ÉLÉMENT ───────────
// v2.16.80 — les trois formes d'OBJET sont couvertes (plate v2.16.73/75/77, arbitrée en bloc
// v2.16.78, fusionnée clé par clé v2.16.79). Rien ne regardait la 4e : le TABLEAU unionné par `id`.
// Toutes les fixtures du fichier donnent deux ids DIFFÉRENTS de chaque côté (`an1`/`an2`,
// `rq1`/`rq2`, `pr1`/`pr2`…) : l'union les concatène, le résultat diffère des deux entrées, et
// TOUS les contrôles se taisent — parité comprise, les deux copies étant unionnaires de la même
// façon. Deux familles de bugs vivaient exactement là, et le patron `routines` de la v2.16.70
// était déjà l'une des deux (trouvée à la main, pas par un garde-fou).
//
// (1) COLLISION sur le même id — un élément MODIFIÉ EN PLACE. La règle « le premier vu gagne »
//     rend la BASE, et le serveur met toujours sa propre copie en base : le nuage ne peut alors
//     accepter aucune modification, jamais. C'est `routines` (v2.16.70) et `momentRequests`
//     (re-planifier une date, v2.16.80).
// (2) SUPPRESSION — un élément retiré d'un côté que l'union RESSUSCITE depuis l'autre. Une union
//     par id ne peut pas exprimer un retrait : il faut un tombstone. Trois listes n'en avaient
//     aucun (`announcements`, `removalRequests` refusée, `momentRequests` annulée, v2.16.80).
//
// Chaque liste doit se classer sur les DEUX axes, nominativement. Une liste non classée fait
// échouer le contrôle de complétude plus bas : c'est lui la vraie valeur du garde-fou (un champ
// ajouté demain ne peut plus passer sans que quelqu'un ait tranché ces deux questions).
const LISTES = [
  // ── config ──
  { champ: "momentRequests", cle: "id", dans: "config",
    frais:  { id: "mm1", status: "planifie", plannedDate: "2026-08-20", calId: "cal_2", createdAt: "2026-08-10" },
    perime: { id: "mm1", status: "planifie", plannedDate: "2026-08-16", calId: "cal_1", createdAt: "2026-08-10" },
    modifieEnPlace: true, // statut ET date réécrits par le portail parent (« 📅 Prévu », « ✔ Fait »)
    tombstone: "removedMomentRequests", supprime: { id: "mmX", status: "attente", rewardId: "rw", playerId: "p1", createdAt: "2026-08-09" } },
  { champ: "announcements", cle: "id", dans: "config",
    frais:  { id: "aa1", text: "FRAIS", createdAt: "2026-08-15" },
    perime: { id: "aa1", text: "périmé", createdAt: "2026-08-15" },
    modifieEnPlace: "créée puis supprimée, jamais réécrite — « renvoyer » crée une COPIE à nouvel id (v2.15.1)",
    tombstone: "removedAnnouncements", supprime: { id: "aaX", text: "supprimée par le parent", createdAt: "2026-08-11" } },
  { champ: "removalRequests", cle: "id", dans: "config",
    frais:  { id: "rr1", instanceId: "asZ", note: "FRAIS" },
    perime: { id: "rr1", instanceId: "asZ", note: "périmé" },
    modifieEnPlace: "écrite par l'enfant, consommée par le parent (approuver/refuser) — jamais modifiée",
    tombstone: "removedRemovalRequests", supprime: { id: "rrX", instanceId: "asZ", note: "refusée par le parent" } },
  { champ: "assignments", cle: "instanceId", dans: "config",
    frais:  { instanceId: "az1", taskId: "tkZ", playerIds: ["p1"], days: [0, 2] },
    perime: { instanceId: "az1", taskId: "tkZ", playerIds: ["p1"], days: [0] },
    modifieEnPlace: "ajoutée ou retirée en entier ; le report des récurrentes (carryOverUnfinishedTasks) ne réécrit QUE `weeklyQuests.assignments`, couvert par OBJETS_ARBITRES",
    tombstone: "removedAssignments", supprime: { instanceId: "azX", taskId: "tkZ", playerIds: ["p1"], days: [3] } },
  { champ: "customTasks", cle: "id", dans: "config",
    frais:  { id: "cz1", label: "FRAIS" }, perime: { id: "cz1", label: "périmé" },
    modifieEnPlace: "créée puis supprimée ; aucun écran ne réécrit une tâche perso existante",
    tombstone: "removedCustomTasks", supprime: { id: "czX", label: "supprimée" } },
  { champ: "childTaskProposals", cle: "id", dans: "config",
    frais:  { id: "pz1", label: "FRAIS" }, perime: { id: "pz1", label: "périmé" },
    modifieEnPlace: "écrite par l'enfant, consommée par le parent — jamais modifiée",
    tombstone: "removedProposals", supprime: { id: "pzX", label: "consommée" } },
  { champ: "feed", cle: "id", dans: "config",
    frais:  { id: "fz1", ts: 5, text: "FRAIS", likes: ["p1"] },
    perime: { id: "fz1", ts: 5, text: "périmé", likes: ["p2"] },
    // v2.16.84 — la raison écrite ici était FAUSSE : « ils s'unionnent » répond à l'AJOUT et ne dit
    // rien du RETRAIT. Le ❤️ est un toggle. Le retrait des sous-listes est vérifié au 8e étage.
    modifieEnPlace: "seuls les `likes` bougent (ajout par union, retrait par tombstone daté `unlikes`, v2.16.84) — le texte est figé à l'écriture",
    sansSuppression: "journal d'événements : aucun écran n'efface une entrée (troncature à 60)" },
  { champ: "bugs", cle: "id", dans: "config",
    frais: { id: "bz1", ts: 5, text: "FRAIS" }, perime: { id: "bz1", ts: 5, text: "périmé" },
    modifieEnPlace: "signalement figé à l'envoi par l'enfant",
    sansSuppression: "aucun bouton ne supprime un signalement (troncature à 60)" },
  { champ: "errorLogs", cle: "id", dans: "config",
    frais: { id: "ez1", ts: 5, msg: "FRAIS" }, perime: { id: "ez1", ts: 5, msg: "périmé" },
    modifieEnPlace: "trace technique figée à la capture",
    sansSuppression: "aucun bouton ne vide le journal (troncature à 80)" },
  { champ: "repairEvents", cle: "id", dans: "config",
    frais: { id: "rz1", ts: 5, v: "FRAIS" }, perime: { id: "rz1", ts: 5, v: "périmé" },
    modifieEnPlace: "événement exactly-once, figé à l'écriture",
    sansSuppression: "journal collectif, aucune suppression (troncature à 100)" },
  { champ: "teamInvites", cle: "id", dans: "config",
    frais: { id: "tz1", status: "pending", createdAt: 2, note: "FRAIS" },
    perime: { id: "tz1", status: "pending", createdAt: 2, note: "périmé" },
    modifieEnPlace: "seul le `status` bouge, et sa résolution est COLLANTE par choix (v2.16.35) — une règle de fraîcheur la casserait",
    sansSuppression: "péremption automatique à 2 jours une fois résolue" },
  { champ: "coinOffers", cle: "id", dans: "config",
    frais: { id: "oz1", status: "pending", ts: 2, note: "FRAIS" },
    perime: { id: "oz1", status: "pending", ts: 2, note: "périmé" },
    modifieEnPlace: "même règle collante que teamInvites",
    sansSuppression: "péremption automatique à 2 jours une fois résolue" },
  { champ: "customRewards", cle: "id", dans: "config",
    modifieEnPlace: "liste ENTIÈRE en dernière-écriture-gagne depuis la v2.16.73 — pas une union par id",
    sansSuppression: "le retrait passe par le remplacement de la liste entière (v2.16.73)" },
  { champ: "updateFeedEntries", cle: "version", dans: "config",
    modifieEnPlace: "reconstruit à chaque chargement depuis CHANGELOG (dedupeUpdateFeed)",
    sansSuppression: "reconstruit au chargement — une union le regonflerait (incident des ~5127 entrées, v2.5.29)" },
  { champ: "players", cle: "id", dans: "config",
    modifieEnPlace: "fusionné champ par champ par `_mergePlayer` — trois contrôles dédiés plus haut",
    sansSuppression: "un joueur ne se supprime pas depuis l'app" },
  // ── gameStates ──
  { champ: "routines", cle: "id", dans: "gameStates",
    frais:  { id: "rtz", name: "FRAIS", taskIds: ["as1", "as2"] },
    perime: { id: "rtz", name: "périmé", taskIds: ["as1"] },
    modifieEnPlace: true, // renommer / changer l'émoji / ajouter une quête (v2.16.70)
    tombstone: "removedRoutineIds", cleTombstone: "id", supprime: { id: "rtX", name: "rituel supprimé", taskIds: [] } },
  { champ: "calendar", cle: "id", dans: "gameStates",
    // Arbitré par `updatedAt` (v2.7.0), pas par la fraîcheur de la famille : le plus grand va donc
    // du côté frais, même règle de cohérence que pour `gsA`/`gsB` plus haut.
    frais:  { id: "cvz", updatedAt: 9, title: "FRAIS" },
    perime: { id: "cvz", updatedAt: 5, title: "périmé" },
    modifieEnPlace: true, // modifier un événement du calendrier
    tombstone: "removedCalendarIds", cleTombstone: "id", supprime: { id: "cvX", updatedAt: 3, title: "événement supprimé" } },
  { champ: "pendingCelebrations", cle: "id", dans: "gameStates",
    frais: { id: "pcz", label: "FRAIS" }, perime: { id: "pcz", label: "périmé" },
    modifieEnPlace: "file consommable : une célébration est écrite puis consommée, jamais réécrite",
    tombstone: "consumedCelebrationIds", cleTombstone: "id", supprime: { id: "pcX", label: "déjà fêtée" } },
  { champ: "xpLog", cle: "id", dans: "gameStates",
    modifieEnPlace: "fusionné par `mergeXpLog` (union par id + multiplicité MAX, v2.16.65) — entrée figée à l'écriture",
    sansSuppression: "journal d'XP, aucune suppression (réparation des journaux gonflés seulement)" },
];

// Injecte une liste dans une copie famille, en gardant tout le reste intact.
const avecListe = (savedAt, gsBase, cfgBase, pl, l, elems, cfgPlus = {}, gsPlus = {}) =>
  l.dans === "config"
    ? mkFam(savedAt, gsBase, { ...cfgBase, [l.champ]: elems, ...cfgPlus }, pl)
    : mkFam(savedAt, { ...gsBase, [l.champ]: elems, ...gsPlus }, { ...cfgBase, ...cfgPlus }, pl);
const litListe = (fam, l) => (l.dans === "config" ? fam.config[l.champ] : fam.gameStates[0][l.champ]) || [];

console.log("· listes par id — complétude : toute liste d'objets doit être classée");
{
  const fusion = client.mergeFamily(famA, famB);
  const declarees = new Set(LISTES.map((l) => `${l.dans}.${l.champ}`));
  const scan = (obj, dans) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (!Array.isArray(v) || !v.length) continue;
      if (typeof v[0] !== "object" || v[0] === null || Array.isArray(v[0])) continue;
      if (!declarees.has(`${dans}.${k}`))
        fail(`liste « ${dans}.${k} » non classée : c'est un tableau d'objets fusionné par id, mais rien `
           + `ne dit (a) si ses éléments sont MODIFIÉS EN PLACE — auquel cas la copie fraîche doit gagner `
           + `sur le même id — ni (b) comment une SUPPRESSION s'exprime (tombstone, ou « pas de `
           + `suppression »). Ajoute-la à LISTES dans scripts/check-merge-parity.mjs.`);
    }
  };
  scan(fusion.config, "config");
  scan(fusion.gameStates[0], "gameStates");
}

console.log("· listes par id — sur le même id, le contenu FRAIS doit gagner");
for (const l of LISTES) {
  if (l.modifieEnPlace !== true) continue;
  if (same(l.frais, l.perime))
    fail(`fixture liste « ${l.champ} » — les deux copies de l'élément sont identiques : pas de collision, le contrôle ne surveille rien.`);
  if (l.frais[l.cle] !== l.perime[l.cle])
    fail(`fixture liste « ${l.champ} » — les deux copies portent des « ${l.cle} » DIFFÉRENTS : l'union `
       + `les concatène et le contrôle ne teste rien. Mets le même id des deux côtés.`);
  const fA = avecListe("2026-08-15T12:00:00.000Z", gsA, famA.config, plA, l, [l.frais]);
  const fB = avecListe("2026-08-14T12:00:00.000Z", gsB, famB.config, plB, l, [l.perime]);
  for (const [sens, base, inc] of [["frais en base", fA, fB], ["frais en incoming", fB, fA]]) {
    const rc = litListe(client.mergeFamily(base, inc), l), rs = litListe(server.mergeFamily(base, inc), l);
    if (!same(rc, rs)) fail(`mergeFamily (${sens}) — ${l.dans}.${l.champ} : client ≠ serveur (dérive entre les deux copies).`);
    const el = rc.find((e) => e && e[l.cle] === l.frais[l.cle]);
    if (same(el, l.perime))
      fail(`mergeFamily (${sens}) — ${l.dans}.${l.champ}[${l.cle}=${l.frais[l.cle]}] : la copie PÉRIMÉE de `
         + `l'élément a gagné. L'union garde « le premier vu », donc la BASE — et le serveur met toujours `
         + `sa propre copie en base : le nuage ne peut accepter AUCUNE modification de cet élément. `
         + `Arbitre le contenu par \`preferIncoming\`, dans src/merge.js ET server-merge.cjs.`);
  }
}

console.log("· listes par id — un tombstone doit vraiment retirer l'élément, dans les deux sens");
for (const l of LISTES) {
  if (!l.tombstone) {
    if (!l.sansSuppression) fail(`liste « ${l.champ} » — ni \`tombstone\` ni \`sansSuppression\` : classe-la.`);
    continue;
  }
  const marque = l.supprime[l.cleTombstone || l.cle];
  // L'élément est présent des DEUX côtés ; seul le côté frais porte le tombstone. Sans lui, l'union
  // le ramène : c'est exactement ce qui se passait pour les trois listes du portail parent.
  const posé = l.dans === "config" ? { [l.tombstone]: [marque] } : {};
  const gsPlus = l.dans === "gameStates" ? { [l.tombstone]: [marque] } : {};
  const fA = avecListe("2026-08-15T12:00:00.000Z", gsA, famA.config, plA, l, [l.supprime], posé, gsPlus);
  const fB = avecListe("2026-08-14T12:00:00.000Z", gsB, famB.config, plB, l, [l.supprime]);
  for (const [sens, base, inc] of [["tombstone en base", fA, fB], ["tombstone en incoming", fB, fA]]) {
    for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
      const out = litListe(fn(base, inc), l);
      if (out.some((e) => e && e[l.cle] === l.supprime[l.cle]))
        fail(`${nom} mergeFamily (${sens}) — ${l.dans}.${l.champ} : l'élément « ${l.supprime[l.cle]} » est `
           + `tombstoné dans \`${l.tombstone}\` mais l'union le RESSUSCITE depuis l'autre copie. `
           + `Applique le tombstone dans src/merge.js ET server-merge.cjs.`);
    }
  }
}

// ── LISTES DE CHAÎNES : le 5e étage, celui du RETRAIT ──────────────────────
// v2.16.81 — les quatre formes d'objet sont couvertes (plate, arbitrée en bloc, clé par clé,
// tableau unionné par `id`). Restait la plus banale et la moins regardée : le tableau de CHAÎNES,
// une quinzaine de champs tous en `_uniq([...a, ...b])`. La question « quelles listes de chaînes
// connaissent un RETRAIT, et ce retrait survit-il ? » n'avait jamais été posée une seule fois —
// alors que `boughtRewards` et `refusals`, dans la MÊME fonction, sont explicitement en
// dernière-écriture-gagne, ce qui prouve que la question se pose.
// Réponse mesurée sur la prod du 17 août : `owned` avait trois retraits jamais appliqués
// (`rw_depanneur` et `rw_bonbon` chez Elli, remboursés le 20 juillet ; `rw_depanneur` chez
// Antoine DR, remboursé le 15 juin) — « J'ai changé d'idée » rend les pièces et l'enfant garde
// quand même la récompense, pour toujours.
// Une union est le BON choix quand la liste ne fait que grandir (tombstones, badges, jours actifs).
// Elle est fausse dès qu'un geste retire un élément. Chaque liste doit donc se classer, et une
// liste non classée fait échouer le contrôle de complétude.
const CHAINES = [
  // ── gameStates ── monotones : aucun chemin de l'app n'en retire un élément
  // v2.16.82 — la raison écrite ici (« une quête accomplie ne se dé-accomplit pas ») était FAUSSE :
  // le portail parent a un bouton « ↩️ Annuler » sur toute carte validée. Le retrait passe
  // désormais par le tombstone DATÉ `deCompleted`, qui doit perdre contre une complétion plus
  // récente (la quête peut être refaite le même jour sous la même clé) — ce que la formule
  // générique d'ici ne sait pas exprimer. Vérifié dans sa propre section, plus bas.
  { champ: "completed", dans: "gameStates", sansRetrait: "retrait couvert par sa propre section (tombstone daté `deCompleted`, v2.16.82)" },
  { champ: "activeDays", dans: "gameStates", sansRetrait: "un jour actif ne se retire jamais (série 🔥)" },
  { champ: "badges", dans: "gameStates", sansRetrait: "un badge gagné ne se reprend pas" },
  { champ: "pending", dans: "gameStates", sansRetrait: "le retrait passe par `completed`/`refusedKeys`, filtrés dans la règle elle-même" },
  { champ: "refusedKeys", dans: "gameStates", sansRetrait: "tombstone (ne fait que grandir)" },
  { champ: "refundedRewards", dans: "gameStates", sansRetrait: "tombstone (ne fait que grandir)" },
  { champ: "removedCalendarIds", dans: "gameStates", sansRetrait: "tombstone (ne fait que grandir)" },
  { champ: "removedRoutineIds", dans: "gameStates", sansRetrait: "tombstone (ne fait que grandir)" },
  { champ: "consumedCelebrationIds", dans: "gameStates", sansRetrait: "tombstone (ne fait que grandir)" },
  { champ: "dismissedAnnouncements", dans: "gameStates", sansRetrait: "archiver une annonce ne s'annule pas" },
  { champ: "hiddenRewards", dans: "gameStates", sansRetrait: "seau daté (v2.16.76) : le retrait s'exprime par un `hiddenWeek` plus frais, pas par l'union" },
  // ── gameStates ── retrait réel
  { champ: "owned", dans: "gameStates", tombstone: "refundedRewards",
    retire: "rw_depanneur", marque: "rw_depanneur#111", garde: "item_perso",
    gsPlus: { rewardBuyTs: { rw_depanneur: 111 } },
    // ⚠️ `rewardBuyTs` voyage avec `boughtRewards` (dernière-écriture-gagne) : la marque doit être
    // posée du côté FRAIS, sinon la clé `id#estampille` ne se reconstitue pas et le contrôle ment.
    pourquoi: "« J'ai changé d'idée » (App.jsx ~3575/3580) retire l'id d'`owned`" },
  // ── gameStates ── pas des unions : dernière-écriture-gagne, le retrait tient par construction
  { champ: "boughtRewards", dans: "gameStates", derniereEcriture: true, retire: "rw_ecran", garde: null },
  { champ: "refusals", dans: "gameStates", derniereEcriture: true, retire: "r-a", garde: null },
  // ── config ──
  { champ: "seenVersions", dans: "config", sansRetrait: "journal des versions vues (ne fait que grandir)" },
  { champ: "selectedRewards", dans: "config", derniereEcriture: true, retire: "rw_ecran", garde: null },
  { champ: "removedAssignments", dans: "config", sansRetrait: "tombstone (ne fait que grandir)" },
  { champ: "removedCustomTasks", dans: "config", sansRetrait: "tombstone (ne fait que grandir)" },
  { champ: "removedRemovalRequests", dans: "config", sansRetrait: "tombstone (ne fait que grandir)" },
  { champ: "removedProposals", dans: "config", sansRetrait: "tombstone (ne fait que grandir)" },
  { champ: "removedAnnouncements", dans: "config", sansRetrait: "tombstone (ne fait que grandir)" },
  { champ: "removedMomentRequests", dans: "config", sansRetrait: "tombstone (ne fait que grandir)" },
  { champ: "starterThemes", dans: "config", sansRetrait: "posé à la création du joueur, jamais réduit" },
];

console.log("· listes de chaînes — complétude : toute liste de chaînes doit être classée");
{
  const fusion = client.mergeFamily(famA, famB);
  const declarees = new Set(CHAINES.map((l) => `${l.dans}.${l.champ}`));
  const scan = (obj, dans) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (!Array.isArray(v) || !v.length) continue;
      if (typeof v[0] !== "string") continue;
      if (!declarees.has(`${dans}.${k}`))
        fail(`liste de chaînes « ${dans}.${k} » non classée : rien ne dit si un geste de l'app en `
           + `RETIRE un élément. Si oui, une union pure ne peut pas l'exprimer et le retrait sera `
           + `ressuscité par l'autre copie à la synchro suivante (c'était « owned », v2.16.81). `
           + `Ajoute-la à CHAINES dans scripts/check-merge-parity.mjs.`);
    }
  };
  scan(fusion.config, "config");
  scan(fusion.gameStates[0], "gameStates");
}

console.log("· listes de chaînes — un retrait exprimé par le côté frais doit survivre");
{
  const avecChaine = (savedAt, gsBase, cfgBase, pl, l, valeurs, plus = {}) =>
    l.dans === "config"
      ? mkFam(savedAt, gsBase, { ...cfgBase, [l.champ]: valeurs, ...plus }, pl)
      : mkFam(savedAt, { ...gsBase, [l.champ]: valeurs, ...plus }, cfgBase, pl);
  const lit = (fam, l) => (l.dans === "config" ? fam.config[l.champ] : fam.gameStates[0][l.champ]) || [];
  for (const l of CHAINES) {
    if (l.sansRetrait) {
      if (typeof l.sansRetrait !== "string" || !l.sansRetrait.length)
        fail(`liste de chaînes « ${l.champ} » — \`sansRetrait\` doit dire POURQUOI aucun retrait n'existe.`);
      continue;
    }
    if (!l.tombstone && !l.derniereEcriture)
      fail(`liste de chaînes « ${l.champ} » — ni \`sansRetrait\`, ni \`tombstone\`, ni \`derniereEcriture\` : classe-la.`);
    // Le côté FRAIS a retiré l'élément ; le côté périmé l'a encore. Sans mécanisme de retrait,
    // l'union le ramène — exactement le défaut d'`owned`.
    const restant = l.garde ? [l.garde] : [];
    const plusFrais = { ...(l.gsPlus || {}), ...(l.tombstone ? { [l.tombstone]: [l.marque] } : {}) };
    const plusPerime = { ...(l.gsPlus || {}) };
    const fFrais = avecChaine("2026-08-15T12:00:00.000Z", gsA, famA.config, plA, l, restant, plusFrais);
    const fPerime = avecChaine("2026-08-14T12:00:00.000Z", gsB, famB.config, plB, l, [...restant, l.retire], plusPerime);
    for (const [sens, base, inc] of [["frais en base", fFrais, fPerime], ["frais en incoming", fPerime, fFrais]]) {
      for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
        const out = lit(fn(base, inc), l);
        if (out.includes(l.retire))
          fail(`${nom} mergeFamily (${sens}) — ${l.dans}.${l.champ} : « ${l.retire} » a été RETIRÉ par le `
             + `côté frais et l'autre copie le ressuscite. Une union de chaînes ne sait pas exprimer un `
             + `retrait : il faut un tombstone (ici \`${l.tombstone || "?"}\`) ou la dernière-écriture-gagne, `
             + `dans src/merge.js ET server-merge.cjs.`);
        if (l.garde && !out.includes(l.garde))
          fail(`${nom} mergeFamily (${sens}) — ${l.dans}.${l.champ} : le retrait a emporté « ${l.garde} », `
             + `qui n'était pas visé. Le mécanisme de retrait est trop large.`);
      }
    }
  }
}

// ── OBJETS : un retrait de SOUS-CLÉ survit-il ? ─────────────────────────────
// v2.16.82 — 6e étage, la piste nommée par la v2.16.81. Les cinq précédents couvrent les LISTES
// (objets à id, objets sans id, listes datées, chaînes) et l'époque de reset. Restent les champs
// dont la valeur est un OBJET dont les SOUS-CLÉS bougent : `equipped` (déséquiper un slot),
// `house.placed` (retirer un meuble), `completedAt`, `deCompleted`, `settings`, `petNickname`…
// Une union par clé (`{...a.X, ...b.X}`) ne sait pas plus exprimer un retrait qu'une union de
// chaînes — sauf si le retrait s'écrit comme une VALEUR (poser `null` sur la clé, qui reste
// présente), ce qui est le cas d'`equipped` et des bascules de `settings`.
// Trois classements possibles, comme pour CHAINES ; un champ non classé fait crier la complétude.
//   • `sansRetrait: "raison"`      — aucun geste de l'app ne retire de sous-clé (dis POURQUOI)
//   • `valeurNulle: "raison"`      — le retrait s'écrit `null`/`false` SUR la clé : la clé survit,
//                                    il suffit que la règle respecte la fraîcheur (`_byKey`)
//   • `derniereEcriture: true`     — objet remplacé en bloc : une clé supprimée reste supprimée
const OBJETS = [
  { champ: "equipped", dans: "gameStates", valeurNulle: "`handleEquip` (App.jsx ~2908) est un TOGGLE : retaper l'item équipé pose `null` sur le slot, la clé reste", slot: "hat", garde: "cape" },
  { champ: "settings", dans: "gameStates", valeurNulle: "bascules d'accessibilité : décocher écrit `false` sur la clé, jamais `delete`", slot: "calm", garde: null },
  { champ: "house", dans: "gameStates", derniereEcriture: true, slot: "placed",
    pourquoi: "`toggle` (avatarpopup.jsx:168) fait `delete h.placed[d.anchor]` pour retirer un meuble — la SEULE suppression de clé de l'app" },
  { champ: "avatar", dans: "gameStates", sansRetrait: "chaque partie du corps a toujours une valeur ; changer d'yeux réécrit la clé, ne la retire pas" },
  { champ: "petNickname", dans: "gameStates", sansRetrait: "renommer réécrit la clé ; aucun geste ne rend un familier anonyme" },
  { champ: "petXp", dans: "gameStates", sansRetrait: "monotone (max par familier)" },
  { champ: "petEvo", dans: "gameStates", sansRetrait: "une évolution ne se dé-évolue pas" },
  { champ: "catCounts", dans: "gameStates", sansRetrait: "compteurs à vie par étiquette (max par clé) ; le remise à zéro passe par l'époque de reset" },
  { champ: "rewardBuyTs", dans: "gameStates", sansRetrait: "voyage en bloc avec `boughtRewards` (dernière-écriture-gagne), voir CHAINES" },
  { champ: "completedAt", dans: "gameStates", sansRetrait: "`handleDeComplete` (v2.16.82) le GARDE exprès : c'est la borne de comparaison du tombstone `deCompleted`" },
  { champ: "deCompleted", dans: "gameStates", sansRetrait: "tombstone daté (max par clé, ne fait que grandir)" },
  // seaux datés : la clé `day`/`week` EST le mécanisme de retrait, déjà couvert par leur propre règle
  { champ: "dailyClaimed", dans: "gameStates", sansRetrait: "seau daté {day, ids} : un jour neuf repart à vide (règle dédiée)" },
  { champ: "ritualCelebrated", dans: "gameStates", sansRetrait: "seau daté {day, ids} (règle dédiée)" },
  { champ: "challengeTiers", dans: "gameStates", sansRetrait: "seau daté {week, tiers} (règle dédiée)" },
  { champ: "sessionMinutes", dans: "gameStates", sansRetrait: "seau daté {day, minutes} (règle dédiée)" },
  { champ: "petDay", dans: "gameStates", sansRetrait: "seau daté {day, xp} (règle dédiée)" },
  { champ: "coinsWeek", dans: "gameStates", sansRetrait: "seau daté {week, coins} (règle dédiée)" },
  { champ: "bossBattle", dans: "gameStates", sansRetrait: "compteurs monotones par boss ; changer de boss remplace l'objet en bloc" },
  { champ: "weeklyQuests", dans: "config", sansRetrait: "seau daté {generatedForWeek, assignments} (règle dédiée)" },
  { champ: "weeklyChallenge", dans: "config", sansRetrait: "seau daté {weekKey, challenges} (règle dédiée)" },
  { champ: "boss", dans: "config", sansRetrait: "objet remplacé en bloc (même boss → état vaincu conservé, sinon le plus récent)" },
];

console.log("· objets — complétude : tout champ-objet doit être classé");
{
  const fusion = client.mergeFamily(famA, famB);
  const declares = new Set(OBJETS.map((o) => `${o.dans}.${o.champ}`));
  const scan = (obj, dans) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      if (!declares.has(`${dans}.${k}`))
        fail(`champ-objet « ${dans}.${k} » non classé : rien ne dit si un geste de l'app en RETIRE `
           + `une SOUS-CLÉ. Si oui, une union par clé ne peut pas l'exprimer et le retrait sera `
           + `ressuscité par l'autre copie (c'était « completed », v2.16.82). `
           + `Ajoute-le à OBJETS dans scripts/check-merge-parity.mjs.`);
    }
  };
  scan(fusion.config, "config");
  scan(fusion.gameStates[0], "gameStates");
}

console.log("· objets — un retrait de sous-clé exprimé par le côté frais doit survivre");
{
  const avecObjet = (savedAt, gsBase, cfgBase, pl, o, valeur) =>
    o.dans === "config"
      ? mkFam(savedAt, gsBase, { ...cfgBase, [o.champ]: valeur }, pl)
      : mkFam(savedAt, { ...gsBase, [o.champ]: valeur }, cfgBase, pl);
  const lit = (fam, o) => (o.dans === "config" ? fam.config[o.champ] : fam.gameStates[0][o.champ]) || {};
  for (const o of OBJETS) {
    if (o.sansRetrait) {
      if (typeof o.sansRetrait !== "string" || !o.sansRetrait.length)
        fail(`champ-objet « ${o.champ} » — \`sansRetrait\` doit dire POURQUOI aucun retrait n'existe.`);
      continue;
    }
    if (!o.valeurNulle && !o.derniereEcriture)
      fail(`champ-objet « ${o.champ} » — ni \`sansRetrait\`, ni \`valeurNulle\`, ni \`derniereEcriture\` : classe-le.`);
    // Le côté FRAIS a retiré la sous-clé `slot` ; le côté périmé la porte encore, garnie.
    const garni = { [o.slot]: "valeur_perimee", ...(o.garde ? { [o.garde]: "voisin" } : {}) };
    const retire = o.valeurNulle
      ? { [o.slot]: null, ...(o.garde ? { [o.garde]: "voisin" } : {}) }   // clé présente, valeur nulle
      : { ...(o.garde ? { [o.garde]: "voisin" } : {}) };                   // clé supprimée
    const fFrais = avecObjet("2026-08-15T12:00:00.000Z", gsA, famA.config, plA, o, retire);
    const fPerime = avecObjet("2026-08-14T12:00:00.000Z", gsB, famB.config, plB, o, garni);
    for (const [sens, base, inc] of [["frais en base", fFrais, fPerime], ["frais en incoming", fPerime, fFrais]]) {
      for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
        const out = lit(fn(base, inc), o);
        if (out[o.slot])
          fail(`${nom} mergeFamily (${sens}) — ${o.dans}.${o.champ} : la sous-clé « ${o.slot} » a été `
             + `retirée par le côté frais et l'autre copie la ressuscite (${JSON.stringify(out[o.slot])}). `
             + `Une union par clé ne sait pas exprimer un retrait : il faut que le retrait s'écrive `
             + `comme une VALEUR sur la clé, ou remplacer l'objet en bloc, dans src/merge.js ET `
             + `server-merge.cjs.`);
        if (o.garde && out[o.garde] !== "voisin")
          fail(`${nom} mergeFamily (${sens}) — ${o.dans}.${o.champ} : le retrait a emporté la sous-clé `
             + `« ${o.garde} », qui n'était pas visée. Le mécanisme de retrait est trop large.`);
      }
    }
  }
}

// ── TOMBSTONE DATÉ DE « ↩️ ANNULER » ────────────────────────────────────────
// v2.16.82 — `completed` est classé `sansRetrait` dans CHAINES, avec la raison « une quête accomplie
// ne se dé-accomplit pas ». C'était FAUX : le portail parent a un bouton « ↩️ Annuler » sur toute
// carte validée (`handleDeComplete`, App.jsx ~2917), qui retire la clé et reprend l'XP et les pièces.
// L'union la ramenait toujours. Le classement de `completed` devient donc un tombstone daté, et sa
// particularité — le tombstone ne doit PAS être définitif, la quête pouvant être refaite le MÊME
// jour sous la même clé — mérite sa propre section : la formule générique de CHAINES ne sait pas
// exprimer « le tombstone perd contre une complétion plus récente ».
console.log("· « ↩️ Annuler » — l'annulation tient, et une quête refaite la même journée la bat");
{
  const K = "t1#2026-08-14";
  const FAIT = "2026-08-14T10:00:00.000Z";
  const ANNUL = Date.parse(FAIT) + 60_000;
  const REFAIT = new Date(ANNUL + 60_000).toISOString();
  const cas = [
    ["annulée, la copie d'en face l'a encore",
     { completed: [], completedAt: { [K]: FAIT }, deCompleted: { [K]: ANNUL } },
     { completed: [K], completedAt: { [K]: FAIT } }, false],
    ["refaite APRÈS l'annulation, même clé, même jour",
     { completed: [K], completedAt: { [K]: REFAIT }, deCompleted: { [K]: ANNUL } },
     { completed: [K], completedAt: { [K]: FAIT }, deCompleted: { [K]: ANNUL } }, true],
    ["jamais annulée",
     { completed: [K], completedAt: { [K]: FAIT } }, { completed: [], completedAt: {} }, true],
    ["héritée (aucun `completedAt`), puis annulée",
     { completed: [], deCompleted: { [K]: ANNUL } }, { completed: [K] }, false],
  ];
  for (const [nom, X, Y, attendu] of cas) {
    for (const [sens, u, v] of [["a,b", X, Y], ["b,a", Y, X]]) {
      for (const pref of [true, false]) {
        const rc = client.mergeGS(u, v, pref), rs = server.mergeGS(u, v, pref);
        if (!same(rc, rs)) fail(`« ↩️ Annuler » (${nom}, ${sens}, preferIncoming=${pref}) — client ≠ serveur.`);
        if (rc.completed.includes(K) !== attendu)
          fail(`mergeGS (${nom}, ${sens}, preferIncoming=${pref}) — « ${K} » ${attendu ? "a disparu de" : "est encore dans"} `
             + `\`completed\`. Le tombstone daté \`deCompleted\` doit l'emporter sur l'union UNIQUEMENT quand `
             + `l'annulation est plus récente que la complétion (\`completedAt\`), dans les deux copies.`);
      }
    }
  }
  // `completedAt` doit garder l'horodatage le PLUS RÉCENT, sinon une quête refaite resterait
  // annulée du côté serveur (l'état stocké y est toujours en `a`).
  for (const [sens, u, v] of [["a,b", { completedAt: { [K]: REFAIT } }, { completedAt: { [K]: FAIT } }],
                              ["b,a", { completedAt: { [K]: FAIT } }, { completedAt: { [K]: REFAIT } }]])
    for (const pref of [true, false])
      if (client.mergeGS(u, v, pref).completedAt[K] !== REFAIT)
        fail(`mergeGS (${sens}, preferIncoming=${pref}) — \`completedAt\` ne garde pas l'horodatage le plus `
           + `récent : une quête refaite après annulation resterait annulée pour toujours.`);
}

// ── ÉPOQUE DE RESET : le seul retrait qui porte sur TOUT l'état ─────────────
// v2.16.81 — « Reset complet » (portail parent) écrit un état vide. Un état vide n'exprime aucun
// retrait face à des `Math.max` et à des unions : mesuré sur la prod du 17 août, 12 des 13 champs
// revenaient du nuage, et côté serveur le reset ne pouvait même pas être accepté. `resetAt` en fait
// une époque. Ce contrôle est aussi la contrepartie de son exemption dans `memeValeur` : le champ y
// porte la même valeur des deux côtés, il doit donc être mis en contradiction ICI.
console.log("· époque de reset — le côté qui a vu le reset le plus récent gagne ENTIÈREMENT");
{
  const vide = { resetAt: 1755999999999, xp: 0, coins: 0, coinsLifetime: 0, completed: [], pending: [],
                 owned: [], equipped: {}, boughtRewards: [], badges: [], activeDays: [], refusedKeys: [] };
  const plein = { ...gsA, resetAt: 1755000000000 }; // a vu un reset PLUS ANCIEN
  const champs = ["xp", "coinsLifetime", "completed", "owned", "badges", "activeDays", "refusedKeys"];
  for (const [sens, x, y] of [["reset en a", vide, plein], ["reset en b", plein, vide]]) {
    for (const pref of [true, false]) {
      const rc = client.mergeGS(x, y, pref), rs = server.mergeGS(x, y, pref);
      if (!same(rc, rs)) fail(`époque de reset (${sens}, preferIncoming=${pref}) — client ≠ serveur.`);
      for (const f of champs) {
        const v = rc[f];
        const reste = Array.isArray(v) ? v.length : (v || 0);
        if (reste)
          fail(`mergeGS (${sens}, preferIncoming=${pref}) — « ${f} » vaut encore ${JSON.stringify(v)} après un `
             + `reset plus récent. Un état vide n'exprime aucun retrait face à un max()/une union : c'est `
             + `\`resetAt\` qui doit trancher, en tête de mergeGS, dans les deux copies.`);
      }
      if ((rc.resetAt || 0) !== 1755999999999)
        fail(`mergeGS (${sens}, preferIncoming=${pref}) — l'époque \`resetAt\` ne se propage pas : le prochain `
           + `appareil qui pousse son vieil état ferait revenir toute la progression.`);
    }
  }
  // À époque ÉGALE, rien ne court-circuite : la fusion normale doit reprendre la main.
  const n1 = client.mergeGS(gsA, gsB, true), n2 = server.mergeGS(gsA, gsB, true);
  if (!same(n1, n2)) fail("époque égale — client ≠ serveur.");
  if ((n1.completed || []).length < 2)
    fail("époque égale — la fusion normale ne s'applique plus (l'époque court-circuite alors qu'elle ne devrait pas).");
}

// ── 7e ÉTAGE : LE GESTE ÉCRIT-IL VRAIMENT LE TOMBSTONE ? ───────────────────
// v2.16.83 — les six étages précédents vérifient que la RÈGLE de fusion sait exprimer un retrait.
// Aucun ne vérifie que le GESTE qui retire s'en sert. La v2.16.82 a réparé « ↩️ Annuler » (une
// carte) et laissé intact « ↩️ Annuler dernière » (`handleUndo`) — le MÊME retrait, le même
// portail parent, le même champ `completed`, à 900 lignes de distance. Le garde-fou est resté
// vert : la règle `deCompleted` qu'il teste était bel et bien correcte, elle n'était simplement
// jamais appelée depuis ce bouton-là. Un correctif appliqué à un seul écran ne se voit pas d'ici.
//
// Ce contrôle lit la SOURCE, pas la fusion : dans `src/App.jsx`, tout bloc qui réduit une liste
// à tombstone (`champ: (…).filter(`) doit mentionner le tombstone correspondant dans le même
// bloc. C'est volontairement grossier — une seule question, posée sur du texte — mais c'est la
// seule forme capable de voir un appelant manquant.
//
// Portée : `src/App.jsx` seul, le fichier des GESTES. `src/migrations.js` en est exclu à dessein —
// ses nettoyages tournent à CHAQUE chargement sur chaque appareil, donc ils se réappliquent après
// une fusion qui les défait ; ils n'ont pas besoin de tombstone (vérifié : `frame_maitre_de_soi`
// est absent d'`owned` chez les 4 enfants en prod, le ménage permanent tient tout seul).
console.log("· gestes — tout retrait d'une liste à tombstone doit écrire ce tombstone");
{
  const GESTES = {
    completed: "deCompleted", owned: "refundedRewards",
    announcements: "removedAnnouncements", assignments: "removedAssignments",
    customTasks: "removedCustomTasks", removalRequests: "removedRemovalRequests",
    momentRequests: "removedMomentRequests", childTaskProposals: "removedProposals",
    routines: "removedRoutineIds", calendar: "removedCalendarIds",
    pendingCelebrations: "consumedCelebrationIds",
    likes: "unlikes", // v2.16.84 — sous-liste (feed[].likes), même exigence : le geste écrit son tombstone
  };
  const lignes = require("node:fs").readFileSync(path.join(ROOT, "src/App.jsx"), "utf8").split("\n");
  // Bornes de bloc : les déclarations de premier niveau du composant (`  const handleX`, `  function X`).
  const bornes = lignes.reduce((acc, l, i) => (/^  (?:const|function) \w+/.test(l) ? [...acc, i] : acc), []);
  const blocDe = (i) => {
    let debut = 0, fin = lignes.length;
    for (const b of bornes) { if (b <= i && b > debut) debut = b; if (b > i && b < fin) fin = b; }
    return { corps: lignes.slice(debut, fin).join("\n"), nom: (lignes[debut].match(/^  (?:const|function) (\w+)/) || [])[1] || "?" };
  };
  for (let i = 0; i < lignes.length; i++) {
    for (const [champ, tombstone] of Object.entries(GESTES)) {
      if (!new RegExp("\\b" + champ + "\\s*:\\s*[^,]*\\.filter\\(").test(lignes[i])) continue;
      const { corps, nom } = blocDe(i);
      if (!corps.includes(tombstone))
        fail(`App.jsx:${i + 1} (${nom}) — retire un élément de « ${champ} » sans jamais écrire `
           + `\`${tombstone}\`. Une liste unionnée ne sait pas exprimer un retrait : la copie d'en `
           + `face ramènera l'élément à la synchro suivante. Écris le tombstone ICI aussi — la règle `
           + `de fusion existe déjà, c'est l'appelant qui manque (c'était « handleUndo », v2.16.83).`);
    }
  }
}

// ── 8e ÉTAGE : LES SOUS-LISTES DE CHAÎNES, DANS LES ÉLÉMENTS ───────────────
// v2.16.84 — le 5e étage classe les listes de chaînes de PREMIER NIVEAU (`config.X`,
// `gameStates.X`). Il ne descend jamais dans les ÉLÉMENTS des listes d'objets. Or il y en a une
// dizaine là-dedans, et l'une d'elles bouge à chaque tape sur un coeur : `feed[].likes`.
// La fiche de `feed` dans LISTES disait « seuls les likes bougent, et ils s'unionnent » — une
// raison qui répond à l'AJOUT et ne dit rien du RETRAIT. Le bouton ❤️ est un TOGGLE : retaper le
// coeur enlève l'id. Mesuré sur la prod du 18 août : 204/204 retraits ressuscités par la fusion.
// Même question qu'aux étages 5 et 6, une couche plus bas : chaque sous-liste de chaînes doit dire
// si un geste en retire un élément, et comment ce retrait survit.
//   • `sansRetrait: "raison"`   — aucun geste ne retire (dis POURQUOI)
//   • `elementEnBloc: "raison"` — l'élément ENTIER est remplacé par le côté frais (retrait acquis)
//   • `tombstoneDate: {retrait, pose}` — paire datée, comme `deCompleted`/`completedAt`
const SOUS_LISTES = [
  { liste: "feed", cle: "id", dans: "config", champ: "likes",
    tombstoneDate: { retrait: "unlikes", pose: "likeTs" },
    pourquoi: "le ❤️ est un TOGGLE (`toggleFeedLike`, App.jsx ~2366) : retaper le coeur retire l'id" },
  { liste: "players", cle: "id", dans: "config", champ: "starterThemes",
    sansRetrait: "posé à la création du joueur, jamais réduit (même raison qu'au 5e étage)" },
  { liste: "assignments", cle: "instanceId", dans: "config", champ: "playerIds",
    sansRetrait: "l'assistant réémet un `instanceId` NEUF pour chaque enfant à la sauvegarde (setupwizard.jsx ~140) : aucune assignation existante n'est réécrite en place, le toggle ne vit que dans le brouillon local" },
  { liste: "announcements", cle: "id", dans: "config", champ: "targetPlayerIds",
    sansRetrait: "une annonce est créée puis supprimée, jamais réécrite ; « renvoyer » crée une COPIE à nouvel id (v2.15.1)" },
  { liste: "announcements", cle: "id", dans: "config", champ: "sharedTasks",
    sansRetrait: "même raison : le contenu d'une annonce est figé à l'envoi" },
  { liste: "updateFeedEntries", cle: "version", dans: "config", champ: "features",
    sansRetrait: "reconstruit à chaque chargement depuis CHANGELOG (`dedupeUpdateFeed`)" },
  { liste: "routines", cle: "id", dans: "gameStates", champ: "taskIds",
    elementEnBloc: "l'élément entier vient du côté frais (v2.16.70/78) : retirer une quête d'un rituel tient par construction" },
];

console.log("· sous-listes — complétude : toute liste de chaînes DANS un élément doit être classée");
{
  const fusion = client.mergeFamily(famA, famB);
  const declarees = new Set(SOUS_LISTES.map((l) => `${l.dans}.${l.liste}[].${l.champ}`));
  const scan = (obj, dans) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (!Array.isArray(v) || !v.length) continue;
      for (const el of v) {
        if (!el || typeof el !== "object" || Array.isArray(el)) continue;
        for (const [sk, sv] of Object.entries(el)) {
          if (!Array.isArray(sv) || !sv.length || typeof sv[0] !== "string") continue;
          if (!declarees.has(`${dans}.${k}[].${sk}`))
            fail(`sous-liste de chaînes « ${dans}.${k}[].${sk} » non classée : rien ne dit si un geste `
               + `de l'app en RETIRE un élément. Le 5e étage ne regarde que le premier niveau — une `
               + `sous-liste unionnée dans un élément ressuscite ses retraits tout pareil `
               + `(c'était « feed[].likes », v2.16.84). Ajoute-la à SOUS_LISTES.`);
        }
      }
    }
  };
  scan(fusion.config, "config");
  scan(fusion.gameStates[0], "gameStates");
}

console.log("· sous-listes — un retrait exprimé par le côté frais doit survivre");
{
  const avecElem = (savedAt, gsBase, cfgBase, pl, l, elem) =>
    l.dans === "config"
      ? mkFam(savedAt, gsBase, { ...cfgBase, [l.liste]: [elem] }, pl)
      : mkFam(savedAt, { ...gsBase, [l.liste]: [elem] }, cfgBase, pl);
  const litElem = (fam, l, id) =>
    ((l.dans === "config" ? fam.config[l.liste] : fam.gameStates[0][l.liste]) || []).find((e) => e && e[l.cle] === id);
  const T1 = 1_000_000, T2 = 2_000_000, T3 = 3_000_000;
  for (const l of SOUS_LISTES) {
    if (l.sansRetrait) {
      if (typeof l.sansRetrait !== "string" || !l.sansRetrait.length)
        fail(`sous-liste « ${l.liste}[].${l.champ} » — \`sansRetrait\` doit dire POURQUOI aucun retrait n'existe.`);
      continue;
    }
    if (!l.elementEnBloc && !l.tombstoneDate)
      fail(`sous-liste « ${l.liste}[].${l.champ} » — ni \`sansRetrait\`, ni \`elementEnBloc\`, ni \`tombstoneDate\` : classe-la.`);
    const ID = "sl1", RETIRE = "qui_retire", VOISIN = "qui_reste";
    // Les deux copies ont posé les deux coeurs au même instant T1 ; seul le côté FRAIS a ensuite
    // retiré `RETIRE` (tombstone en T2 > T1). `VOISIN` est le témoin : il doit survivre partout.
    const poses = l.tombstoneDate ? { [l.tombstoneDate.pose]: { [VOISIN]: T1, [RETIRE]: T1 } } : {};
    const elemFrais = { [l.cle]: ID, ts: 5, [l.champ]: [VOISIN], ...poses,
      ...(l.tombstoneDate ? { [l.tombstoneDate.retrait]: { [RETIRE]: T2 } } : {}) };
    const elemPerime = { [l.cle]: ID, ts: 5, [l.champ]: [VOISIN, RETIRE], ...poses };
    const fFrais = avecElem("2026-08-15T12:00:00.000Z", gsA, famA.config, plA, l, elemFrais);
    const fPerime = avecElem("2026-08-14T12:00:00.000Z", gsB, famB.config, plB, l, elemPerime);
    for (const [sens, base, inc] of [["frais en base", fFrais, fPerime], ["frais en incoming", fPerime, fFrais]]) {
      for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
        const out = litElem(fn(base, inc), l, ID) || {};
        const vals = out[l.champ] || [];
        if (vals.includes(RETIRE))
          fail(`${nom} mergeFamily (${sens}) — ${l.dans}.${l.liste}[].${l.champ} : « ${RETIRE} » a été `
             + `RETIRÉ par le côté frais et l'autre copie le ressuscite. Une union DANS un élément ne `
             + `sait pas plus exprimer un retrait qu'une union de premier niveau : il faut un tombstone `
             + `daté (ici \`${l.tombstoneDate?.retrait || "?"}\`) ou remplacer l'élément en bloc, dans `
             + `src/merge.js ET server-merge.cjs.`);
        if (!vals.includes(VOISIN))
          fail(`${nom} mergeFamily (${sens}) — ${l.dans}.${l.liste}[].${l.champ} : le retrait a emporté `
             + `« ${VOISIN} », qui n'était pas visé. Le mécanisme de retrait est trop large.`);
      }
    }
    if (!l.tombstoneDate) continue;
    // Le tombstone daté ne doit PAS être définitif : reposer le coeur après l'avoir retiré refonctionne.
    const elemRepose = { [l.cle]: ID, ts: 5, [l.champ]: [VOISIN, RETIRE],
      [l.tombstoneDate.retrait]: { [RETIRE]: T2 },
      [l.tombstoneDate.pose]: { [VOISIN]: T1, [RETIRE]: T3 } };
    const fRepose = avecElem("2026-08-15T12:00:00.000Z", gsA, famA.config, plA, l, elemRepose);
    const fVieux = avecElem("2026-08-14T12:00:00.000Z", gsB, famB.config, plB, l, elemFrais);
    for (const [sens, base, inc] of [["reposé en base", fRepose, fVieux], ["reposé en incoming", fVieux, fRepose]]) {
      for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
        const out = litElem(fn(base, inc), l, ID) || {};
        if (!(out[l.champ] || []).includes(RETIRE))
          fail(`${nom} mergeFamily (${sens}) — ${l.dans}.${l.liste}[].${l.champ} : « ${RETIRE} » a été `
             + `REPOSÉ après son retrait (\`${l.tombstoneDate.pose}\` plus récent que `
             + `\`${l.tombstoneDate.retrait}\`) et le tombstone le refuse quand même. Un tombstone `
             + `définitif interdirait de ré-aimer une entrée pour toujours.`);
      }
    }
  }
}

if (failures) {
  console.error(`\n✗ Couche de fusion : ${failures} problème(s).`);
  console.error("  Toute règle de fusion doit être écrite dans LES DEUX fichiers.\n");
  process.exit(1);
}
console.log("✓ Parité de fusion client/serveur vérifiée.");
