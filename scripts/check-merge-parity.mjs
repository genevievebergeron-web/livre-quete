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
  // v2.16.85 — `recur` porté des DEUX côtés : c'est un sous-OBJET dans un élément de liste, et le
  // 9e étage ne peut recenser que ce que la fusion des fixtures fait apparaître (leçon de la v2.16.84).
  // v2.16.86 — forme RÉELLE d'un événement (App.jsx ~3065) : {id, type, label, date, recur}.
  // La fixture disait `title`, un champ que ni la prod ni le code ne portent (même classe que
  // l'ancien `house.deco`) — et n'avait ni `date` ni `type`, qui existent tous les deux.
  calendar: [{ id: "e1", updatedAt: 9, type: "evenement", label: "A", date: "2026-08-15", recur: { freq: "weekly", day: 2 } }], removedCalendarIds: ["e0"],
  avatar: { configured: true, skin: "a" }, pin: "1111", mode: "routine",
  removedRoutineIds: ["r_old"],
  routines: [{ id: "rt1", name: "Matin A", taskIds: ["as1"] }],
  // v2.16.76 — `hiddenWeek` porte le JOUR du seau `hiddenRewards`, et la règle arbitre sur ce jour,
  // pas sur la fraîcheur de la famille. Le jour le plus récent va donc du côté FRAIS (famA), même
  // raison que `calendar.updatedAt` juste au-dessus : sans ça le contrôle crierait au loup.
  activeRoutineId: "rt1", hiddenRewards: ["rw_h_a"], hiddenWeek: "2026-08-14",
  noCoinsResetV1: true, petMigV2: true, rotativeCleanupV1: true, // drapeaux : `true` ici, ABSENTS de gsB
  dailyClaimed: { day: "2026-08-14", ids: ["o3"] },
  ritualCelebrated: { day: "2026-08-14", ids: ["rt1"] },
  // v2.16.86 — `badges` : porté par la prod, par AUCUNE fixture, donc invisible au 8e étage.
  consumedCelebrationIds: ["c_a"], pendingCelebrations: [{ id: "c_p_a", badges: ["b_a"] }],
  petXp: { dragon: 40 }, petDay: { day: "2026-08-14", xp: 25 },
  petEvo: { dragon: { 1: "feu" } }, petNickname: { dragon: "Flamme" },
  energy: 60, energyTs: "2026-08-14T12:00:00.000Z", lastFedDay: "2026-08-14",
  activeDays: ["2026-08-14"], leagueTier: "or",
  sessionMinutes: { day: "2026-08-15", minutes: 42 },
  bossBattle: { bossId: "2026-08-01", earned: 5, spent: 2, dmg: 30 },
  settings: { calm: true }, dismissedAnnouncements: ["an_a"],
  challengeTiers: { week: "2026-08-14", tiers: [3] },
  // v2.16.86 — forme RÉELLE de `house` en prod (relevé du 18 août) : {floor, placed, wallpaper}.
  // L'ancienne fixture inventait une liste `house.deco` qui n'existe ni en prod ni dans le code —
  // le recensement du 10e étage a crié dessus, et la classer aurait gravé un faux dans le fichier.
  house: { floor: "df1", placed: { rug: "dr1" }, wallpaper: "dw1" }, lastSeenDay: "2026-08-15",
  // v2.16.74 — valeurs croisées EXPRÈS (A gagne sur menage, B sur cuisine, defi seulement chez B) :
  // un MAX clé par clé doit rendre un objet différent des DEUX entrées, sinon un spread naïf
  // passerait inaperçu.
  catCounts: { menage: 12, cuisine: 3 },
  // v2.16.93 — `deCompleted` porté par les DEUX côtés, MÊME clé, estampilles qui se contredisent :
  // la prod le porte et aucune fixture ne l'avait, mais le contrôle « fixtures vs schéma de prod »
  // ne pouvait pas le voir — il mesurait la SORTIE de la fusion, qui FABRIQUE `{}` par défaut.
  // Clé absente de `completed` des deux côtés : le tombstone doit apparaître dans la sortie sans
  // rien annuler ici (son mordant est mesuré par sa section dédiée, « ↩️ Annuler »).
  // Estampilles CROISÉES avec gsB (A gagne sur tdc1, B sur tdc2), même patron que `catCounts` :
  // un max clé par clé rend un objet différent des DEUX entrées. Sans ce croisement, le résultat
  // serait égal à l'une des deux copies et le contrôle « le périmé a gagné » ne saurait pas
  // distinguer un max d'un dernier-écriture-gagne — il criait au loup sur la règle correcte.
  deCompleted: { "tdc1#2026-08-01": 999, "tdc2#2026-08-01": 111 },
};
const gsB = {
  ...gsA,
  xp: 700, coins: 80, coinsLifetime: 800, coinsWeek: { week: "2026-08-07", coins: 99 },
  completed: ["t3#2026-08-15"], completedAt: { "t3#2026-08-15": "2026-08-15T10:00:00.000Z" },
  xpLog: [{ id: "x2", date: "2026-08-15", amount: 30, source: "rituel" }],
  pending: ["t4#2026-08-15"], refusedKeys: ["t8#2026-08-02"], refusals: ["r-b"],
  owned: ["item_b"], boughtRewards: ["rw_bonbon"], rewardBuyTs: { rw_bonbon: 222 },
  refundedRewards: ["rw_new"], badges: ["b_b"], equipped: { cape: "c_b" },
  calendar: [{ id: "e1", updatedAt: 5, type: "sante", label: "B", date: "2026-08-14", recur: { freq: "daily" } }], removedCalendarIds: ["e2"],
  avatar: { configured: false, skin: "b" }, pin: "2222", mode: "semaine",
  removedRoutineIds: ["r_other"],
  routines: [{ id: "rt1", name: "Matin B", taskIds: ["as1", "as2"] }],
  activeRoutineId: "rt2", hiddenRewards: ["rw_h_b"], hiddenWeek: "2026-08-07", // v2.16.76 — jour PÉRIMÉ ici, voir famA
  dailyClaimed: { day: "2026-08-14", ids: ["o6"] },
  ritualCelebrated: { day: "2026-08-14", ids: ["rt2"] },
  consumedCelebrationIds: ["c_b"], pendingCelebrations: [{ id: "c_p_b", badges: ["b_b"] }],
  petXp: { dragon: 10, chat: 5 }, petDay: { day: "2026-08-14", xp: 10 },
  petEvo: { dragon: { 1: "glace" } }, petNickname: { chat: "Minou" },
  energy: 95, energyTs: "2026-08-14T12:01:00.000Z", lastFedDay: "2026-08-13",
  activeDays: ["2026-08-13"], leagueTier: "bronze",
  sessionMinutes: { day: "2026-08-15", minutes: 5 },
  bossBattle: { bossId: "2026-08-01", earned: 9, spent: 1, dmg: 10 },
  settings: { sound: false }, dismissedAnnouncements: ["an_b"],
  challengeTiers: { week: "2026-08-07", tiers: [3, 5, 7] },
  house: { floor: "df2", placed: { lamp: "dl1" }, wallpaper: "dw2" }, lastSeenDay: "2026-08-14",
  catCounts: { menage: 4, cuisine: 9, defi: 2 },
  // v2.16.93 — MÊME clé que gsA, estampille plus GRANDE du côté PÉRIMÉ : le max doit gagner quel
  // que soit le sens, sinon une annulation de parent se ferait effacer par la copie d'en face.
  deCompleted: { "tdc1#2026-08-01": 111, "tdc2#2026-08-01": 999 },
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
// v2.16.86 — les drapeaux de migration (`noCoinsResetV1`, `petMigV2`, `rotativeCleanupV1`) sont la
// seconde exemption légitime, et pour une raison de FORME : `migrations.js` ne les écrit qu'à
// `true`, jamais à `false`. Ils n'ont donc pas de seconde valeur avec laquelle se contredire, et
// leur donner `false` en fixture inventerait un état que l'app ne produit pas. Leur vraie
// collision est `true` contre ABSENT — mesurée juste en dessous, pour que cette exemption reste
// un fait vérifié et pas une promesse (leçon de la v2.16.85 sur les fixtures inertes).
const EXEMPT_GS = { resetAt: true, noCoinsResetV1: true, petMigV2: true, rotativeCleanupV1: true };
memeValeur(gsA, gsB, "gameStates", EXEMPT_GS);



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
const EXEMPT_PL = { id: "clé de rapprochement de mergeFamily" };
memeValeur(plA, plB, "players[0]", EXEMPT_PL);

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
// v2.16.86 — champs de premier niveau que la PROD porte et qu'aucune fixture n'avait : le contrôle
// « fixtures vs schéma de prod » plus bas les a nommés un par un. La collision réelle d'un drapeau
// de migration est `true` d'un côté / ABSENT de l'autre — jamais `false` : `migrations.js` ne les
// écrit qu'à `true` (l'écrire `false` en fixture inventerait un cas que l'app ne produit pas, et
// ferait crier `estDrapeau` pour rien). `weekPersist` n'est pas un drapeau : c'est un réglage de
// l'assistant (`setupwizard.jsx` ~146), qui vaut vraiment `true` ou `false`.
const DRAPEAUX_A = { createdAt: "2026-06-01", weekPersist: true, colorToneDownV1: true,
  rotativeCleanupV1: true, orphanAssignCleanupV1: true, orphanAssignCleanupV2: true,
  routineOrphanCleanupV1: true, updateFeedRebuildV1: true };
const DRAPEAUX_B = { createdAt: "2026-06-02", weekPersist: false };
const famA = mkFam("2026-08-15T12:00:00.000Z", gsA, {
  ...DRAPEAUX_A,
  announcements: [{ id: "an1", createdAt: "2026-08-14", text: "A", targetPlayerIds: ["p1"], sharedTasks: ["ranger"],
                   playerTasks: { p1: ["vider le lave-vaisselle"] } }],
  childTaskProposals: [{ id: "pr1", label: "Proposition A" }], removedProposals: ["pr0"],
  // v2.16.93 — les trois tombstones du portail parent (v2.16.80) : la prod les porte, aucune
  // fixture ne les avait, et le contrôle « fixtures vs schéma de prod » les croyait couverts parce
  // qu'il mesurait la SORTIE — où la fusion FABRIQUE `[]` par défaut. Ids qui ne visent aucun
  // élément des fixtures : ce qu'on mesure ici est l'UNION des deux listes (5e étage), le mordant
  // du tombstone sur sa liste ayant sa propre section (4e étage, fixtures dédiées).
  removedAnnouncements: ["an_supprimee_a"], removedMomentRequests: ["mm_supprimee_a"],
  removedRemovalRequests: ["rr_supprimee_a"],
  removalRequests: [{ id: "rq1", instanceId: "as1" }],
  customRewards: [{ id: "cr1", label: "Maison A", coins: 20 }], theme: "minecraft",
  updateFeedEntries: [{ type: "update", version: "2.16.70", features: ["a"], ts: "2026-08-15" }],
  selectedRewards: ["rw_ecran"], seenVersions: ["2.16.70"],
  feed: [{ id: "f1", ts: 2, likes: ["p1"], likeTs: { p1: 10 }, unlikes: { p9: 5 } }],
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
  ...DRAPEAUX_B,
  announcements: [{ id: "an2", createdAt: "2026-08-13", text: "B", targetPlayerIds: ["p1"], sharedTasks: ["ranger"],
                   playerTasks: { p1: ["sortir le recyclage"] } }],
  childTaskProposals: [{ id: "pr2", label: "Proposition B" }], removedProposals: ["pr3"],
  removedAnnouncements: ["an_supprimee_b"], removedMomentRequests: ["mm_supprimee_b"],
  removedRemovalRequests: ["rr_supprimee_b"],
  removalRequests: [{ id: "rq2", instanceId: "as1" }],
  customRewards: [{ id: "cr2", label: "Maison B", coins: 30 }], theme: "foret",
  updateFeedEntries: [{ type: "update", version: "2.16.41", features: ["b"], ts: "2026-08-06" }],
  selectedRewards: ["rw_bonbon"], seenVersions: ["2.16.41"],
  feed: [{ id: "f1", ts: 2, likes: ["p2"], likeTs: { p2: 20 }, unlikes: { p8: 7 } }],
  bugs: [{ id: "bg2", ts: 1 }], errorLogs: [{ id: "er2", ts: 1 }],
  coinOffers: [], teamInvites: [], repairEvents: [{ id: "rp2", ts: 1 }], momentRequests: [],
  boss: { startedAt: "2026-08-01", hp: 60, lastHitTs: "2026-08-15T10:00:00.000Z" },
  weeklyQuests: { generatedForWeek: "2026-08-07", assignments: [{ instanceId: "wq2", taskId: "tk1", playerIds: ["p1"], days: [1] }] },
  weeklyChallenge: { weekKey: "2026-08-07", challenges: [{ playerId: "p1", text: "B", checkins: { "2026-08-07": true } }] },
}, plB);

const EXEMPT_CFG = {
  // Structurels, volontairement identiques : ce sont les supports sur lesquels les
  // autres champs s'accrochent (une assignation `as1`, sa tâche `tk1`), pas des champs
  // dont la fusion est en jeu ici. (`players` n'en fait plus partie depuis la v2.16.77 :
  // il se contredit champ par champ et son contrôle dédié est plus bas.)
  assignments: 1, customTasks: 1, removedAssignments: 1, removedCustomTasks: 1,
  pin: 1, mode: 1, routineEnd: 1,
  // Volontairement vides des deux côtés : rien à départager par construction, la
  // parité champ par champ ci-dessus reste leur contrôle.
  coinOffers: 1, teamInvites: 1, momentRequests: 1,
};
memeValeur(famA.config, famB.config, "config", EXEMPT_CFG);

console.log("· drapeaux de migration — `true` d'un côté, ABSENT de l'autre : `true` doit tenir");
{
  // C'est la seule collision qu'un drapeau peut vraiment produire (une tablette qui n'a jamais
  // tourné la migration n'a pas la clé du tout — JSON ne transporte pas `undefined`). Si elle
  // tombait du mauvais côté, la migration REPARTIRAIT sur cet appareil : plusieurs d'entre elles
  // suppriment des assignations ou vident `pending`, donc c'est une perte de données, pas un
  // simple recalcul.
  const DRAPEAUX_GS = ["noCoinsResetV1", "petMigV2", "rotativeCleanupV1"];
  const DRAPEAUX_CFG = ["colorToneDownV1", "rotativeCleanupV1", "orphanAssignCleanupV1",
                        "orphanAssignCleanupV2", "routineOrphanCleanupV1", "updateFeedRebuildV1"];
  const sansCle = (o, k) => { const c = { ...o }; delete c[k]; return c; };
  for (const k of DRAPEAUX_GS) {
    const avec = mkFam("2026-08-15T12:00:00.000Z", gsA, {}, plA);
    const sans = mkFam("2026-08-14T12:00:00.000Z", sansCle(gsB, k), {}, plB);
    for (const [sens, base, inc] of [["drapeau en base", avec, sans], ["drapeau en incoming", sans, avec]])
      for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]])
        if (fn(base, inc).gameStates[0][k] !== true)
          fail(`${nom} mergeFamily (${sens}) — gameStates.${k} : un appareil qui n'a PAS le drapeau `
             + `l'efface chez celui qui l'a. La migration repartirait sur cet appareil, et `
             + `plusieurs d'entre elles suppriment des données. Le drapeau doit survivre à `
             + `l'absence d'en face.`);
  }
  for (const k of DRAPEAUX_CFG) {
    const avec = mkFam("2026-08-15T12:00:00.000Z", gsA, { ...DRAPEAUX_A }, plA);
    const sans = mkFam("2026-08-14T12:00:00.000Z", gsB, sansCle(DRAPEAUX_A, k), plB);
    for (const [sens, base, inc] of [["drapeau en base", avec, sans], ["drapeau en incoming", sans, avec]])
      for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]])
        if (fn(base, inc).config[k] !== true)
          fail(`${nom} mergeFamily (${sens}) — config.${k} : même problème côté config.`);
  }
}


// ── FIXTURES vs SCHÉMA DE PROD : un recensement ne vaut que par ses entrées ──
// v2.16.86 — les dix étages ci-dessous recensent la FUSION DES FIXTURES. Un champ que ni `famA`
// ni `famB` ne porte est donc invisible à TOUS les contrôles de complétude, quel que soit leur
// nombre. Ça s'est payé deux fois, dans les deux sens :
//   • la prod porte, les fixtures pas — `feed[].likeTs`/`unlikes` sont restés hors de portée une
//     nuit entière (v2.16.85), et `pendingCelebrations[].badges` depuis toujours (trouvé ICI).
//   • les fixtures portent, la prod pas — `house.deco` et `calendar[].title` étaient des formes
//     INVENTÉES, absentes du code comme de la prod ; le 10e étage a crié sur la première, et la
//     classer aurait gravé un faux durable (v2.16.86).
// `scripts/schema-prod.json` fige la structure de la prod (noms de champs et natures, AUCUNE
// donnée de famille) ; on la régénère avec `scripts/releve-schema-prod.mjs` après un `GET`.
//
// Strict sur ce que les étages classent vraiment :
//   • tout champ de PREMIER niveau (étages 1-3 + le diff schéma/règles de fusion)
//   • tout chemin NON scalaire, à n'importe quel niveau (étages 4-10 : listes, objets, nichés)
// Toléré pour le reste : un scalaire DANS un élément voyage avec son élément, aucun étage ne le
// classe séparément. Et un chemin que les fixtures ont en plus n'est pas une faute — un champ neuf
// existe forcément dans le code avant d'apparaître dans un relevé de prod.
//
// v2.16.87 — cette tolérance était une PROMESSE, exactement comme l'exemption `estDrapeau` l'était
// avant d'être mesurée. « Il voyage avec son élément » n'est vrai que si l'élément est pris EN BLOC.
// Dès qu'une liste est fusionnée champ par champ, un scalaire que la règle ne nomme pas ne suit plus
// son élément — et rien ne croisait les deux. Les chemins tolérés sont donc collectés ici et rendus
// au 11e étage, qui MESURE la tolérance liste par liste au lieu de la supposer.
const SCALAIRES_TOLERES = new Map(); // `config.feed` → ["emoji", "playerId", …]
const SOUS_CLES_TOLEREES = new Set(); // v2.16.89 — `gameStates.coinsWeek`, `config.boss`, … (13e étage)
{
  const schemaProd = require(path.join(ROOT, "scripts/schema-prod.json"));
  const estObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const natureDe = (v) => {
    if (Array.isArray(v)) return v.length ? (v.some(estObj) ? "listeObjets" : "liste") : "listeVide";
    if (estObj(v)) return Object.values(v).some(Array.isArray) ? "objetDeListes" : "objet";
    return "scalaire";
  };
  const RICHESSE = { scalaire: 0, listeVide: 1, liste: 2, objet: 2, objetDeListes: 3, listeObjets: 3 };
  const vus = {};
  const pose = (c, n) => { if (vus[c] === undefined || RICHESSE[n] > RICHESSE[vus[c]]) vus[c] = n; };
  // MÊME parcours que `scripts/releve-schema-prod.mjs` : les deux relevés doivent être comparables.
  const releve = (racine, dans) => {
    for (const [k, v] of Object.entries(racine || {})) {
      pose(`${dans}.${k}`, natureDe(v));
      if (estObj(v)) for (const [k2, v2] of Object.entries(v)) {
        if (!Array.isArray(v2)) continue;
        pose(`${dans}.${k}.${k2}`, natureDe(v2));
        for (const el of v2) if (estObj(el))
          for (const [sk, sv] of Object.entries(el)) pose(`${dans}.${k}.${k2}[].${sk}`, natureDe(sv));
      }
      if (!Array.isArray(v)) continue;
      for (const el of v) if (estObj(el))
        for (const [sk, sv] of Object.entries(el)) pose(`${dans}.${k}[].${sk}`, natureDe(sv));
    }
  };
  // v2.16.93 — ce relevé se prenait sur la SORTIE de `mergeFamily(famA, famB)`, alors que la
  // question qu'il pose est « les FIXTURES portent-elles ce que la prod porte ? ». La fusion
  // FABRIQUE des défauts pour des champs qu'aucune des deux entrées ne porte (`deCompleted` → `{}`,
  // les trois tombstones du portail parent → `[]`) : mesuré sur la sortie, le contrôle voyait ces
  // quatre champs « couverts » et ne pouvait pas dire qu'aucune fixture ne les alimentait — le
  // défaut de la fusion BLANCHISSAIT le trou que le contrôle existe pour trouver. C'est la même
  // faute que « le relevé au même plafond que le surveillé » (v2.16.88), déplacée d'un cran : un
  // contrôle ne peut rien reprocher à une donnée qu'il lit APRÈS la transformation surveillée.
  // Il lit donc les deux ENTRÉES, et rien d'autre.
  for (const fam of [famA, famB]) {
    releve(fam.config, "config");
    for (const gs of fam.gameStates) releve(gs, "gameStates");
  }

  console.log(`· fixtures vs schéma de prod (relevé du ${schemaProd.releveLe}) — aucun angle mort`);
  let toleres = 0;
  // v2.16.88 — SOUS LE PLAFOND. Jusqu'ici, le relevé de prod s'arrêtait exactement là où s'arrêtent
  // les recensements qu'il surveille : un niveau sous une racine, plus les éléments de liste. Une
  // comparaison ne peut RIEN reprocher à un plafond qu'elle partage — une structure plus profonde
  // était invisible des DEUX côtés à la fois, donc muette. `releve-schema-prod.mjs` descend
  // maintenant plus bas, en écrivant `*` à la place de chaque clé (jamais un nom que la famille
  // aurait choisi). Les chemins qui en viennent portent au moins un `*`, et c'est ici qu'ils passent.
  //
  // Toléré sans fiche : UN seul `*`, en bout de chemin, de nature scalaire — c'est le contenu simple
  // d'un objet, arbitré par la règle de cet objet (le diff schéma/règles garantit qu'il en a une, et
  // le 6e étage mesure les objets fusionnés clé par clé). ⚠️ cette tolérance est encore une PROMESSE,
  // pas une mesure : tous les objets de premier niveau ne sont pas au 6e étage. C'est la même dette
  // que « il voyage avec son élément » avant la v2.16.87, et elle se solde de la même façon — en la
  // croisant, pas en la répétant. Le compte est imprimé pour qu'elle ne s'oublie pas.
  //
  // Tout le reste — un `*` NON scalaire, ou un DEUXIÈME niveau de `*` — décrit une structure qu'aucun
  // recensement n'atteint : il faut nommer qui l'arbitre, par le chemin de son ancêtre NOMMÉ.
  const SOUS_LE_PLAFOND = {
    "config.announcements[].playerTasks":
      "10e étage, forme B — la liste de tâches par joueur est recensée en `playerTasks.*` et son "
      + "absence de retrait est fichée (le contenu d'une annonce est figé à l'envoi).",
    "gameStates.house":
      "arbitré EN BLOC (dernière-écriture-gagne, src/merge.js ~243) : `placed` et ses meubles viennent "
      + "du même côté que `floor`/`wallpaper`, il n'y a rien à arbitrer plus bas. 12e étage, fiche `enBloc`.",
    "gameStates.petEvo":
      "12e étage — les DEUX niveaux sont mesurés : sur un palier en collision le côté frais gagne, et "
      + "un palier connu d'un seul côté survit. C'est ce chemin qui a fait naître l'étage (v2.16.88).",
  };
  let sousPlafondToleres = 0;
  for (const [chemin, nat] of Object.entries(schemaProd.champs)) {
    if (!chemin.includes("*")) continue;
    const simple = nat === "scalaire" && chemin.endsWith(".*") && chemin.split("*").length === 2;
    const ancetre = chemin.slice(0, chemin.indexOf(".*"));
    // v2.16.89 — les ancêtres tolérés ne sont plus seulement COMPTÉS, ils sont collectés et rendus
    // au 13e étage, qui MESURE l'arbitrage de leur sous-clé au lieu de le supposer. Même solde de
    // dette que celui de la v2.16.87 pour « il voyage avec son élément ».
    if (simple && !(ancetre in SOUS_LE_PLAFOND)) { sousPlafondToleres++; SOUS_CLES_TOLEREES.add(ancetre); continue; }
    if (ancetre in SOUS_LE_PLAFOND) continue;
    fail(`« ${chemin} » (${nat}) vit SOUS le plafond des recensements : les étages s'arrêtent un cran `
       + `au-dessus, donc aucun ne peut le voir. Ajoute une fiche « ${ancetre} » à SOUS_LE_PLAFOND qui `
       + `nomme la règle qui l'arbitre — soit un étage qui le MESURE, soit un arbitrage EN BLOC qui `
       + `rend la profondeur sans objet.`);
  }
  for (const ancetre of Object.keys(SOUS_LE_PLAFOND)) {
    if (!Object.keys(schemaProd.champs).some((c) => c.startsWith(`${ancetre}.*`)))
      fail(`SOUS_LE_PLAFOND fiche « ${ancetre} », que le relevé de prod ne porte plus. Fiche périmée : `
         + `retire-la, sinon elle couvrira un jour un chemin homonyme sans que personne l'ait relu.`);
  }
  console.log(`    (${sousPlafondToleres} scalaires sous le plafond, sur ${SOUS_CLES_TOLEREES.size} objets `
    + `— la tolérance « la règle de leur objet les arbitre » est MESURÉE au 13e étage, plus supposée)`);

  for (const [chemin, nat] of Object.entries(schemaProd.champs)) {
    if (chemin in vus) continue;
    if (chemin.includes("*")) continue;                 // déjà tranchés juste au-dessus
    const premierNiveau = chemin.split(".").length === 2 && !chemin.includes("[");
    if (!premierNiveau && nat === "scalaire") {
      toleres++;
      const m = chemin.match(/^(.*)\[\]\.([^.]+)$/);
      if (!m) { fail(`« ${chemin} » est un scalaire toléré d'une forme que le 11e étage ne sait pas `
                   + `croiser (il attend « <liste>[].<champ> »). Classe-le à la main.`); continue; }
      if (!SCALAIRES_TOLERES.has(m[1])) SCALAIRES_TOLERES.set(m[1], []);
      SCALAIRES_TOLERES.get(m[1]).push(m[2]);
      continue;
    }
    fail(`« ${chemin} » (${nat}) existe en PROD et dans AUCUNE fixture : tous les contrôles de `
       + `complétude ci-dessous lisent la fusion de famA/famB, donc aucun ne peut le voir. Porte-le `
       + `dans les fixtures (avec des valeurs qui se contredisent), puis classe-le à l'étage qui `
       + `correspond. Si le champ a disparu de l'app, régénère plutôt le relevé : `
       + `node scripts/releve-schema-prod.mjs <prod.json> > scripts/schema-prod.json`);
  }
  if (toleres) console.log(`    (${toleres} scalaires dans un élément non portés par les fixtures, `
    + `sur ${SCALAIRES_TOLERES.size} listes — la tolérance « ils voyagent avec leur élément » est `
    + `MESURÉE au 11e étage, plus supposée)`);
}

console.log("· mergeFamily — instantanés complets, dans les deux sens");
for (const [la, a, lb, b] of [["A", famA, "B", famB], ["B", famB, "A", famA]]) {
  const rc = client.mergeFamily(a, b), rs = server.mergeFamily(a, b);
  for (const k of new Set([...Object.keys(rc.config), ...Object.keys(rs.config)])) {
    if (!same(rc.config[k], rs.config[k]))
      fail(`mergeFamily(${la},${lb}) — config.${k} : client ${JSON.stringify(rc.config[k])} ≠ serveur ${JSON.stringify(rs.config[k])}`);
  }
  // v2.16.92 — la comparaison ci-dessus passe par `same`, donc par `JSON.stringify`, qui EFFACE
  // une clé dont la valeur est `undefined` : un champ que SEULE une des deux copies nomme y est
  // strictement invisible tant qu'aucune fixture ne lui donne de valeur. C'est la leçon « fixture
  // identique = contrôle inerte », appliquée à la comparaison elle-même. Ce qu'il a trouvé le soir
  // de sa naissance : `custodySchedule`, une règle que seul `server-merge.cjs` portait depuis la
  // v2.16.71 — c'est-à-dire depuis le commit qui a créé CE garde-fou — sur un champ qui n'existe
  // ni dans `src/merge.js`, ni dans l'app, ni dans le relevé de prod. Retirée.
  for (const [ou, oc, os] of [["config", rc.config, rs.config],
                             ["gameStates[0]", rc.gameStates[0] || {}, rs.gameStates[0] || {}],
                             ["config.players[0]", rc.config.players[0] || {}, rs.config.players[0] || {}]]) {
    for (const k of new Set([...Object.keys(oc), ...Object.keys(os)])) {
      if ((k in oc) !== (k in os))
        fail(`mergeFamily(${la},${lb}) — ${ou}.${k} : une seule des deux copies NOMME ce champ `
           + `(client ${k in oc ? "oui" : "non"}, serveur ${k in os ? "oui" : "non"}). Tant qu'aucune `
           + `fixture ne lui donne de valeur, la comparaison de VALEURS passe au vert : soit la règle `
           + `manque dans une des deux copies, soit elle est de trop dans l'autre.`);
    }
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
  // v2.16.86 — réglage de l'assistant (`setupwizard.jsx` ~146), pas un drapeau : il vaut vraiment
  // `true` ou `false`, et le spread naïf laisse donc la copie périmée gagner. Sans conséquence
  // AUJOURD'HUI parce que le champ est ÉCRIT et jamais LU (champ mort constaté en v2.16.73, et
  // toujours en attente d'une décision de Gen). Le jour où quelqu'un le branche, il lui faut une
  // vraie règle — ce n'est pas une exemption de fond, c'est un sursis documenté.
  weekPersist: "écrit par l'assistant, lu NULLE PART : champ mort (décision de Gen en attente)",
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

// ── 12e ÉTAGE : LES OBJETS À DEUX NIVEAUX ──────────────────────────────────
// v2.16.88 — le 6e étage met en collision la sous-clé d'un objet de premier niveau (`equipped.hat`,
// `settings.calm`…). Il ne descend jamais d'un cran de plus. Or `petEvo` vaut `{petId:{palier:élément}}`
// et se fusionne à DEUX niveaux : la collision qui compte est celle de `petEvo.<petId>.<palier>`, que
// le 6e étage ne voit pas et que le contrôle de retrait (« un retrait de SOUS-CLÉ survit-il ») ne
// regarde pas non plus (il ne juge que la disparition). Les fixtures se contredisaient pourtant DÉJÀ
// sur cette sous-sous-clé depuis toujours — personne ne lisait le résultat.
//
// Ce que l'étage a trouvé le soir de sa naissance : la règle rendait toujours le côté `a`, sans
// jamais regarder `preferIncoming`. Comme chaque appelant met SA copie en `a` (client : le local ;
// serveur : le stocké), les deux côtés gardaient chacun leur élément et la divergence ne se refermait
// jamais. Voir le commentaire de `petEvo` dans src/merge.js.
//
// L'étage est complet par RECENSEMENT, pas par bonne volonté : tout objet qui contient un objet, dans
// la fusion des fixtures, doit avoir une fiche ici. Deux fiches possibles :
//   • une mesure (`sousCle`/`frais`/`perime`/`orpheline`) — le côté frais doit gagner dans les DEUX
//     sens, et la sous-sous-clé que seul l'autre côté connaît doit survivre ;
//   • `enBloc: "raison"` — l'objet entier vient d'un seul côté, donc ses deux niveaux voyagent
//     ensemble et il n'y a rien à arbitrer plus bas. Dis POURQUOI, et la raison doit nommer la règle.
const OBJETS_DEUX_NIVEAUX = [
  { champ: "petEvo", cleDyn: "dragon", sousCle: "1", frais: "el_FRAIS", perime: "el_PERIME",
    orpheline: ["2", "el_ORPHELIN"] },
  { champ: "house", enBloc: "`house` est arbitré EN BLOC (dernière-écriture-gagne, src/merge.js ~243) : "
    + "`placed` ne peut pas diverger de `floor`/`wallpaper`, les trois viennent du même côté. C'est "
    + "voulu — une union par slot ressusciterait le meuble que l'enfant vient de retirer (v2.16.72)." },
];
console.log("· objets à DEUX niveaux — sur une sous-sous-clé en collision, la fraîche doit gagner");
{
  const fusion = client.mergeFamily(famA, famB);
  const estObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const declares = new Set(OBJETS_DEUX_NIVEAUX.map((o) => `gameStates.${o.champ}`));
  for (const [k, v] of Object.entries(fusion.gameStates[0])) {
    if (!estObj(v) || !Object.values(v).some(estObj)) continue;
    if (!declares.has(`gameStates.${k}`))
      fail(`« gameStates.${k} » est un objet qui contient un OBJET, et aucune fiche du 12e étage ne le `
         + `classe. Le 6e étage s'arrête à la sous-clé : une collision sur la sous-SOUS-clé n'est `
         + `surveillée nulle part. Mesure-la, ou déclare \`enBloc\` avec la règle qui le justifie.`);
  }
  for (const o of OBJETS_DEUX_NIVEAUX) {
    if (o.enBloc) continue;
    const objFrais  = { [o.cleDyn]: { [o.sousCle]: o.frais } };
    const objPerime = { [o.cleDyn]: { [o.sousCle]: o.perime, [o.orpheline[0]]: o.orpheline[1] } };
    if (same(o.frais, o.perime))
      fail(`fixture deux-niveaux « ${o.champ} » — la sous-sous-clé porte la MÊME valeur des deux `
         + `côtés : il n'y a pas de collision, le contrôle ne surveille rien.`);
    const fA = mkFam("2026-08-15T12:00:00.000Z", { ...gsA, [o.champ]: objFrais },  famA.config, plA);
    const fB = mkFam("2026-08-14T12:00:00.000Z", { ...gsB, [o.champ]: objPerime }, famB.config, plB);
    for (const [sens, base, inc] of [["frais en base", fA, fB], ["frais en incoming", fB, fA]]) {
      const rc = client.mergeFamily(base, inc).gameStates[0][o.champ];
      const rs = server.mergeFamily(base, inc).gameStates[0][o.champ];
      if (!same(rc, rs))
        fail(`mergeFamily (${sens}) — gameStates[0].${o.champ} : client ≠ serveur (dérive entre les deux copies).`);
      if (same(rc?.[o.cleDyn]?.[o.sousCle], o.perime))
        fail(`mergeFamily (${sens}) — gameStates[0].${o.champ}.<clé>.${o.sousCle} : la sous-sous-clé `
           + `PÉRIMÉE a gagné. La règle arbitre le 2e niveau sans regarder \`preferIncoming\` : chaque `
           + `appelant met SA copie en \`a\`, donc les deux côtés gardent la leur et la divergence ne `
           + `se referme JAMAIS. Passe \`_byKey\` aux deux niveaux, dans src/merge.js ET server-merge.cjs.`);
      if (!same(rc?.[o.cleDyn]?.[o.orpheline[0]], o.orpheline[1]))
        fail(`mergeFamily (${sens}) — gameStates[0].${o.champ}.<clé>.${o.orpheline[0]} : la sous-sous-clé `
           + `que SEUL le côté périmé connaissait a disparu. La règle remplace le sous-objet entier au `
           + `lieu de le fusionner clé par clé : un palier acquis ne doit jamais se perdre.`);
    }
  }
}

// ── RECENSEMENT DES LISTES D'OBJETS : où qu'elles soient ───────────────────
// v2.16.85 — les étages 8 et 9 ne valent que par leur recensement, et celui de la v2.16.84
// n'énumérait que les listes de PREMIER NIVEAU (`config.X`, `gameStates.X`). Or deux des listes
// d'objets de la prod vivent DANS un objet : `config.weeklyQuests.assignments` (155 éléments au
// 18 août) et `config.weeklyChallenge.challenges`. Elles étaient donc invisibles au contrôle de
// complétude — `weeklyQuests.assignments[].playerIds` n'a jamais été classé nulle part, et rien ne
// pouvait le signaler. C'est exactement l'angle mort que la v2.16.84 s'était noté : « le
// recensement dépend des fixtures ». Profondeur 2, ce qui couvre tout ce que porte la prod
// (recensement complet de `config` et des 4 `gameStates` fait le 18 août : aucune liste d'objets
// plus profonde n'existe).
const listesDObjets = (racine, dans) => {
  const out = [];
  const ajoute = (chemin, arr) => {
    if (arr.some((e) => e && typeof e === "object" && !Array.isArray(e))) out.push({ chemin, elems: arr });
  };
  for (const [k, v] of Object.entries(racine || {})) {
    if (Array.isArray(v)) { ajoute(`${dans}.${k}`, v); continue; }
    if (!v || typeof v !== "object") continue;
    for (const [k2, v2] of Object.entries(v)) if (Array.isArray(v2)) ajoute(`${dans}.${k}.${k2}`, v2);
  }
  return out;
};
// Une liste nichée se déclare avec `conteneur: {cle, fixe}` — `fixe` porte ce dont la règle de
// fusion du conteneur a besoin pour arbitrer (ex. `generatedForWeek` égal des deux côtés, qui est
// justement le cas normal des 7 jours d'une semaine de garde).
const cheminDe = (l) => `${l.dans}.${l.conteneur ? l.conteneur.cle + "." : ""}${l.liste}`;
const poseListe = (savedAt, gsBase, cfgBase, pl, l, elems) => {
  const bloc = l.conteneur ? { [l.conteneur.cle]: { ...l.conteneur.fixe, [l.liste]: elems } } : { [l.liste]: elems };
  return l.dans === "config"
    ? mkFam(savedAt, gsBase, { ...cfgBase, ...bloc }, pl)
    : mkFam(savedAt, { ...gsBase, ...bloc }, cfgBase, pl);
};
const litElemDe = (fam, l, id) => {
  const racine = l.dans === "config" ? fam.config : fam.gameStates[0];
  const c = l.conteneur ? racine[l.conteneur.cle] : racine;
  return ((c && c[l.liste]) || []).find((e) => e && e[l.cle] === id);
};

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
    temoinHorsBloc: 0,
    frais:  { id: "mm1", status: "planifie", plannedDate: "2026-08-20", calId: "cal_2", createdAt: "2026-08-10" },
    perime: { id: "mm1", status: "planifie", plannedDate: "2026-08-16", calId: "cal_1", createdAt: "2026-08-10" },
    modifieEnPlace: true, // statut ET date réécrits par le portail parent (« 📅 Prévu », « ✔ Fait »)
    tombstone: "removedMomentRequests", supprime: { id: "mmX", status: "attente", rewardId: "rw", playerId: "p1", createdAt: "2026-08-09" } },
  { champ: "announcements", cle: "id", dans: "config",
    temoinHorsBloc: 0,
    frais:  { id: "aa1", text: "FRAIS", createdAt: "2026-08-15" },
    perime: { id: "aa1", text: "périmé", createdAt: "2026-08-15" },
    modifieEnPlace: "créée puis supprimée, jamais réécrite — « renvoyer » crée une COPIE à nouvel id (v2.15.1)",
    tombstone: "removedAnnouncements", supprime: { id: "aaX", text: "supprimée par le parent", createdAt: "2026-08-11" } },
  { champ: "removalRequests", cle: "id", dans: "config",
    temoinHorsBloc: 0,
    frais:  { id: "rr1", instanceId: "asZ", note: "FRAIS" },
    perime: { id: "rr1", instanceId: "asZ", note: "périmé" },
    modifieEnPlace: "écrite par l'enfant, consommée par le parent (approuver/refuser) — jamais modifiée",
    tombstone: "removedRemovalRequests", supprime: { id: "rrX", instanceId: "asZ", note: "refusée par le parent" } },
  { champ: "assignments", cle: "instanceId", dans: "config",
    temoinHorsBloc: 0,
    // v2.16.87 — `time` diffère : sans un scalaire qui se contredit, le 11e étage n'a aucune ancre
    // à laquelle comparer son témoin (seul `days`, un tableau, différait — et un tableau ne dit pas
    // de quel CÔTÉ vient l'élément). C'est un vrai champ de la prod, pas une forme inventée.
    frais:  { instanceId: "az1", taskId: "tkZ", playerIds: ["p1"], days: [0, 2], time: "07:30" },
    perime: { instanceId: "az1", taskId: "tkZ", playerIds: ["p1"], days: [0], time: "08:15" },
    modifieEnPlace: "ajoutée ou retirée en entier ; le report des récurrentes (carryOverUnfinishedTasks) ne réécrit QUE `weeklyQuests.assignments`, couvert par OBJETS_ARBITRES",
    tombstone: "removedAssignments", supprime: { instanceId: "azX", taskId: "tkZ", playerIds: ["p1"], days: [3] } },
  // v2.16.85 — les deux listes d'objets NICHÉES de la prod. Le recensement de premier niveau ne
  // pouvait pas les voir ; `weeklyQuests.assignments` (155 éléments) était réputée « couverte par
  // OBJETS_ARBITRES », ce qui est vrai du CONTENEUR et n'a jamais rien testé de l'ÉLÉMENT.
  { champ: "assignments", cle: "instanceId", dans: "config",
    temoinHorsBloc: 0,
    conteneur: { cle: "weeklyQuests", fixe: { generatedForWeek: "2026-08-14" } },
    frais:  { instanceId: "wz1", taskId: "tkZ", playerIds: ["p1"], days: [0, 2], isRecurring: true, time: "07:30" },
    perime: { instanceId: "wz1", taskId: "tkZ", playerIds: ["p1"], days: [0], isRecurring: true, time: "08:15" },
    modifieEnPlace: true, // le report des récurrentes (carryOverUnfinishedTasks, App.jsx ~2569) et le ménage des orphelines (migrations.js ~254) réécrivent `days` en place
    tombstone: "removedAssignments", supprime: { instanceId: "wzX", taskId: "tkZ", playerIds: ["p1"], days: [3], isRecurring: true } },
  { champ: "challenges", cle: "playerId", dans: "config",
    temoinHorsBloc: 0,
    conteneur: { cle: "weeklyChallenge", fixe: { weekKey: "2026-08-14" } },
    // Un SEUL champ diffère : sinon l'élément fusionné diffère du périmé par l'autre champ et le
    // contrôle passe au vert sans rien voir (leçon « fixture identique = contrôle inerte »).
    frais:  { playerId: "p1", text: "FRAIS", emoji: "🦁", checkins: {} },
    perime: { playerId: "p1", text: "périmé", emoji: "🦁", checkins: {} },
    modifieEnPlace: true, // « 💾 Enregistrer le défi » (parentpanel.jsx ~463 → handleUpdateChallenge) réécrit texte et emoji en cours de semaine
    sansSuppression: "aucun écran ne retire le défi d'un enfant : le portail parent ne propose que d'en réécrire le texte, et la bascule de semaine se règle par `weekKey` (le défi d'une autre semaine est ignoré à la lecture, App.jsx ~2540)" },
  { champ: "customTasks", cle: "id", dans: "config",
    temoinHorsBloc: 0,
    frais:  { id: "cz1", label: "FRAIS" }, perime: { id: "cz1", label: "périmé" },
    modifieEnPlace: "créée puis supprimée ; aucun écran ne réécrit une tâche perso existante",
    tombstone: "removedCustomTasks", supprime: { id: "czX", label: "supprimée" } },
  { champ: "childTaskProposals", cle: "id", dans: "config",
    temoinHorsBloc: 0,
    frais:  { id: "pz1", label: "FRAIS" }, perime: { id: "pz1", label: "périmé" },
    modifieEnPlace: "écrite par l'enfant, consommée par le parent — jamais modifiée",
    tombstone: "removedProposals", supprime: { id: "pzX", label: "consommée" } },
  { champ: "feed", cle: "id", dans: "config",
    temoinHorsBloc: 0,
    frais:  { id: "fz1", ts: 5, text: "FRAIS", likes: ["p1"] },
    perime: { id: "fz1", ts: 5, text: "périmé", likes: ["p2"] },
    // v2.16.84 — la raison écrite ici était FAUSSE : « ils s'unionnent » répond à l'AJOUT et ne dit
    // rien du RETRAIT. Le ❤️ est un toggle. Le retrait des sous-listes est vérifié au 8e étage.
    modifieEnPlace: "seuls les `likes` bougent (ajout par union, retrait par tombstone daté `unlikes`, v2.16.84) — le texte est figé à l'écriture",
    sansSuppression: "journal d'événements : aucun écran n'efface une entrée (troncature à 60)" },
  { champ: "bugs", cle: "id", dans: "config",
    temoinHorsBloc: 0,
    frais: { id: "bz1", ts: 5, text: "FRAIS" }, perime: { id: "bz1", ts: 5, text: "périmé" },
    modifieEnPlace: "signalement figé à l'envoi par l'enfant",
    sansSuppression: "aucun bouton ne supprime un signalement (troncature à 60)" },
  { champ: "errorLogs", cle: "id", dans: "config",
    temoinHorsBloc: 0,
    frais: { id: "ez1", ts: 5, msg: "FRAIS" }, perime: { id: "ez1", ts: 5, msg: "périmé" },
    modifieEnPlace: "trace technique figée à la capture",
    sansSuppression: "aucun bouton ne vide le journal (troncature à 80)" },
  { champ: "repairEvents", cle: "id", dans: "config",
    temoinHorsBloc: 0,
    frais: { id: "rz1", ts: 5, v: "FRAIS" }, perime: { id: "rz1", ts: 5, v: "périmé" },
    modifieEnPlace: "événement exactly-once, figé à l'écriture",
    sansSuppression: "journal collectif, aucune suppression (troncature à 100)" },
  { champ: "teamInvites", cle: "id", dans: "config",
    temoinHorsBloc: 0,
    frais: { id: "tz1", status: "pending", createdAt: 2, note: "FRAIS" },
    perime: { id: "tz1", status: "pending", createdAt: 2, note: "périmé" },
    modifieEnPlace: "seul le `status` bouge, et sa résolution est COLLANTE par choix (v2.16.35) — une règle de fraîcheur la casserait",
    sansSuppression: "péremption automatique à 2 jours une fois résolue" },
  { champ: "coinOffers", cle: "id", dans: "config",
    temoinHorsBloc: 0,
    frais: { id: "oz1", status: "pending", ts: 2, note: "FRAIS" },
    perime: { id: "oz1", status: "pending", ts: 2, note: "périmé" },
    modifieEnPlace: "même règle collante que teamInvites",
    sansSuppression: "péremption automatique à 2 jours une fois résolue" },
  { champ: "customRewards", cle: "id", dans: "config",
    temoinHorsBloc: 0,
    // v2.16.87 — `frais`/`perime` ne servent pas au 4e étage (`modifieEnPlace` n'est pas `true`) mais
    // au 11e : sans deux copies qui se contredisent, le témoin n'a aucun côté à suivre.
    frais: { id: "cw1", label: "FRAIS", coins: 20 }, perime: { id: "cw1", label: "périmé", coins: 20 },
    modifieEnPlace: "liste ENTIÈRE en dernière-écriture-gagne depuis la v2.16.73 — pas une union par id",
    sansSuppression: "le retrait passe par le remplacement de la liste entière (v2.16.73)" },
  { champ: "updateFeedEntries", cle: "version", dans: "config",
    temoinHorsBloc: 0,
    frais:  { type: "update", version: "2.16.70", features: ["FRAIS"], ts: "2026-08-15" },
    perime: { type: "update", version: "2.16.70", features: ["périmé"], ts: "2026-08-06" },
    modifieEnPlace: "reconstruit à chaque chargement depuis CHANGELOG (dedupeUpdateFeed)",
    sansSuppression: "reconstruit au chargement — une union le regonflerait (incident des ~5127 entrées, v2.5.29)" },
  { champ: "players", cle: "id", dans: "config",
    temoinHorsBloc: 0,
    frais: plA, perime: plB, // les deux joueurs se contredisent déjà sur chaque champ (v2.16.77)
    modifieEnPlace: "fusionné champ par champ par `_mergePlayer` — trois contrôles dédiés plus haut",
    sansSuppression: "un joueur ne se supprime pas depuis l'app" },
  // ── gameStates ──
  { champ: "routines", cle: "id", dans: "gameStates",
    temoinHorsBloc: 0,
    frais:  { id: "rtz", name: "FRAIS", taskIds: ["as1", "as2"] },
    perime: { id: "rtz", name: "périmé", taskIds: ["as1"] },
    modifieEnPlace: true, // renommer / changer l'émoji / ajouter une quête (v2.16.70)
    tombstone: "removedRoutineIds", cleTombstone: "id", supprime: { id: "rtX", name: "rituel supprimé", taskIds: [] } },
  { champ: "calendar", cle: "id", dans: "gameStates",
    temoinHorsBloc: 0,
    // Arbitré par `updatedAt` (v2.7.0), pas par la fraîcheur de la famille : le plus grand va donc
    // du côté frais, même règle de cohérence que pour `gsA`/`gsB` plus haut.
    frais:  { id: "cvz", updatedAt: 9, title: "FRAIS" },
    perime: { id: "cvz", updatedAt: 5, title: "périmé" },
    modifieEnPlace: true, // modifier un événement du calendrier
    tombstone: "removedCalendarIds", cleTombstone: "id", supprime: { id: "cvX", updatedAt: 3, title: "événement supprimé" } },
  { champ: "pendingCelebrations", cle: "id", dans: "gameStates",
    temoinHorsBloc: 0,
    frais: { id: "pcz", label: "FRAIS" }, perime: { id: "pcz", label: "périmé" },
    modifieEnPlace: "file consommable : une célébration est écrite puis consommée, jamais réécrite",
    tombstone: "consumedCelebrationIds", cleTombstone: "id", supprime: { id: "pcX", label: "déjà fêtée" } },
  { champ: "xpLog", cle: "id", dans: "gameStates",
    temoinHorsBloc: 0,
    frais:  { id: "xz1", amount: 9, date: "2026-08-15", source: "FRAIS" },
    perime: { id: "xz1", amount: 4, date: "2026-08-14", source: "périmé" },
    modifieEnPlace: "fusionné par `mergeXpLog` (union par id + multiplicité MAX, v2.16.65) — entrée figée à l'écriture",
    sansSuppression: "journal d'XP, aucune suppression (réparation des journaux gonflés seulement)" },
];

// Injecte une liste dans une copie famille, en gardant tout le reste intact.
// v2.16.85 — `conteneur` : la liste vit DANS un objet (`weeklyQuests.assignments`,
// `weeklyChallenge.challenges`). `fixe` porte ce dont la règle du conteneur a besoin pour arbitrer,
// posé IDENTIQUE des deux côtés — c'est le cas normal (7 jours d'une même semaine de garde), et
// c'est justement celui qu'aucune fixture ne mettait à égalité (leçon de la v2.16.80).
const bloc = (l, elems) => (l.conteneur
  ? { [l.conteneur.cle]: { ...l.conteneur.fixe, [l.champ]: elems } }
  : { [l.champ]: elems });
const avecListe = (savedAt, gsBase, cfgBase, pl, l, elems, cfgPlus = {}, gsPlus = {}) =>
  l.dans === "config"
    ? mkFam(savedAt, gsBase, { ...cfgBase, ...bloc(l, elems), ...cfgPlus }, pl)
    : mkFam(savedAt, { ...gsBase, ...bloc(l, elems), ...gsPlus }, { ...cfgBase, ...cfgPlus }, pl);
const litListe = (fam, l) => {
  const racine = l.dans === "config" ? fam.config : fam.gameStates[0];
  const c = l.conteneur ? racine[l.conteneur.cle] : racine;
  return (c && c[l.champ]) || [];
};
const cheminListe = (l) => `${l.dans}.${l.conteneur ? l.conteneur.cle + "." : ""}${l.champ}`;

console.log("· listes par id — complétude : toute liste d'objets doit être classée");
{
  const fusion = client.mergeFamily(famA, famB);
  const declarees = new Set(LISTES.map((l) => `${l.dans}.${l.conteneur ? l.conteneur.cle + "." : ""}${l.champ}`));
  const scan = (racine, dans) => {
    for (const { chemin, elems } of listesDObjets(racine, dans)) {
      const k = chemin.slice(dans.length + 1), v = elems;
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
    if (!same(rc, rs)) fail(`mergeFamily (${sens}) — ${cheminListe(l)} : client ≠ serveur (dérive entre les deux copies).`);
    const el = rc.find((e) => e && e[l.cle] === l.frais[l.cle]);
    if (same(el, l.perime))
      fail(`mergeFamily (${sens}) — ${cheminListe(l)}[${l.cle}=${l.frais[l.cle]}] : la copie PÉRIMÉE de `
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
        fail(`${nom} mergeFamily (${sens}) — ${cheminListe(l)} : l'élément « ${l.supprime[l.cle]} » est `
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
    // v2.16.92 — cette note disait, jusqu'ici : « ⚠️ `rewardBuyTs` voyage avec `boughtRewards`
    // (dernière-écriture-gagne) : la marque doit être posée du côté FRAIS, sinon la clé
    // `id#estampille` ne se reconstitue pas et le contrôle ment. » C'était le CONTOURNEMENT d'un
    // bug, écrit en toutes lettres à côté de lui pendant neuf jours. L'estampille s'unionne
    // maintenant par id (plus grande gagnante), donc elle se reconstitue quel que soit le côté qui
    // la porte — la section « estampille d'achat » plus bas mesure exactement ça.
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
  // v2.16.86 — trouvé par le contrôle « fixtures vs schéma de prod » : la prod porte ce champ, et
  // AUCUNE fixture ne le portait, donc aucune complétude ne pouvait le voir (exactement le trou que
  // la v2.16.85 s'était noté après `feed[].likeTs`/`unlikes`).
  { liste: "pendingCelebrations", cle: "id", dans: "gameStates", champ: "badges",
    sansRetrait: "une fête différée est créée d'un bloc au moment de l'événement (App.jsx ~2462/2562/2719) et n'est jamais réécrite ; la consommation vide la file ENTIÈRE (`pendingCelebrations:[]` + `consumedCelebrationIds`, ~2848), elle ne retouche pas l'intérieur d'un élément" },
  { liste: "routines", cle: "id", dans: "gameStates", champ: "taskIds",
    elementEnBloc: "l'élément entier vient du côté frais (v2.16.70/78) : retirer une quête d'un rituel tient par construction" },
  // v2.16.85 — la seule sous-liste NICHÉE de la prod, et la seule que le recensement de la v2.16.84
  // ne pouvait pas voir : elle vit dans l'objet `weeklyQuests`, pas dans une liste de premier niveau.
  { liste: "assignments", cle: "instanceId", dans: "config", champ: "playerIds",
    conteneur: { cle: "weeklyQuests", fixe: { generatedForWeek: "2026-08-14" } },
    elementEnBloc: "`weeklyQuests` est arbitré EN BLOC (v2.16.78) : à `generatedForWeek` égale — le cas normal pendant les 7 jours d'une semaine de garde — c'est dernière-écriture-gagne, donc l'élément vient entier du côté frais" },
];

console.log("· sous-listes — complétude : toute liste de chaînes DANS un élément doit être classée");
{
  const fusion = client.mergeFamily(famA, famB);
  const declarees = new Set(SOUS_LISTES.map((l) => `${cheminDe(l)}[].${l.champ}`));
  for (const dans of ["config", "gameStates"]) {
    const racine = dans === "config" ? fusion.config : fusion.gameStates[0];
    for (const { chemin, elems } of listesDObjets(racine, dans))
      for (const el of elems) {
        if (!el || typeof el !== "object" || Array.isArray(el)) continue;
        for (const [sk, sv] of Object.entries(el)) {
          if (!Array.isArray(sv) || !sv.length || typeof sv[0] !== "string") continue;
          if (!declarees.has(`${chemin}[].${sk}`))
            fail(`sous-liste de chaînes « ${chemin}[].${sk} » non classée : rien ne dit si un geste `
               + `de l'app en RETIRE un élément. Le 5e étage ne regarde que le premier niveau — une `
               + `sous-liste unionnée dans un élément ressuscite ses retraits tout pareil `
               + `(c'était « feed[].likes », v2.16.84). Ajoute-la à SOUS_LISTES.`);
        }
      }
  }
}

console.log("· sous-listes — un retrait exprimé par le côté frais doit survivre");
{
  const avecElem = (savedAt, gsBase, cfgBase, pl, l, elem) => poseListe(savedAt, gsBase, cfgBase, pl, l, [elem]);
  const litElem = (fam, l, id) => litElemDe(fam, l, id);
  const T1 = 1_000_000, T2 = 2_000_000, T3 = 3_000_000;
  for (const l of SOUS_LISTES) {
    if (l.sansRetrait) {
      if (typeof l.sansRetrait !== "string" || !l.sansRetrait.length)
        fail(`sous-liste « ${cheminDe(l)}[].${l.champ} » — \`sansRetrait\` doit dire POURQUOI aucun retrait n'existe.`);
      continue;
    }
    if (!l.elementEnBloc && !l.tombstoneDate)
      fail(`sous-liste « ${cheminDe(l)}[].${l.champ} » — ni \`sansRetrait\`, ni \`elementEnBloc\`, ni \`tombstoneDate\` : classe-la.`);
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
          fail(`${nom} mergeFamily (${sens}) — ${cheminDe(l)}[].${l.champ} : « ${RETIRE} » a été `
             + `RETIRÉ par le côté frais et l'autre copie le ressuscite. Une union DANS un élément ne `
             + `sait pas plus exprimer un retrait qu'une union de premier niveau : il faut un tombstone `
             + `daté (ici \`${l.tombstoneDate?.retrait || "?"}\`) ou remplacer l'élément en bloc, dans `
             + `src/merge.js ET server-merge.cjs.`);
        if (!vals.includes(VOISIN))
          fail(`${nom} mergeFamily (${sens}) — ${cheminDe(l)}[].${l.champ} : le retrait a emporté `
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
          fail(`${nom} mergeFamily (${sens}) — ${cheminDe(l)}[].${l.champ} : « ${RETIRE} » a été `
             + `REPOSÉ après son retrait (\`${l.tombstoneDate.pose}\` plus récent que `
             + `\`${l.tombstoneDate.retrait}\`) et le tombstone le refuse quand même. Un tombstone `
             + `définitif interdirait de ré-aimer une entrée pour toujours.`);
      }
    }
  }
}

// ── 9e ÉTAGE : LES SOUS-OBJETS, DANS LES ÉLÉMENTS ──────────────────────────
// v2.16.85 — le 6e étage classe les OBJETS de premier niveau (`equipped`, `house`, `completedAt`…)
// et pose la bonne question : « une SOUS-CLÉ retirée survit-elle ? ». Le 8e a descendu d'un cran
// la question du 5e (les listes de chaînes DANS un élément). Il manquait la descente symétrique du
// 6e : les OBJETS dans un élément de liste — c'est mot pour mot la piste que la v2.16.84 s'était
// laissée. Recensés sur la prod du 18 août : `announcements[].playerTasks`,
// `weeklyChallenge.challenges[].checkins`, `calendar[].recur`, plus `players[].morningLock` et les
// deux registres du ❤️ (`feed[].likeTs`, `feed[].unlikes`) apparus avec la v2.16.84.
// Mesuré en rejouant les vrais modules : sur ces six, DEUX ressuscitent une sous-clé retirée —
// `playerTasks` dans un sens de fusion sur deux, `checkins` dans les QUATRE. Aucun geste de l'app
// ne les retire aujourd'hui (donc aucun bug vivant), mais rien ne l'écrivait et rien ne le
// surveillait : c'est exactement l'état dans lequel `completed` était avant la v2.16.82.
//   • `sansRetrait: "raison"`   — aucun geste ne retire une sous-clé (dis POURQUOI)
//   • `elementEnBloc: "raison"` — l'élément ENTIER vient du côté frais (retrait acquis)
const SOUS_OBJETS = [
  { liste: "announcements", cle: "id", dans: "config", champ: "playerTasks",
    sansRetrait: "le contenu d'une annonce est figé à l'envoi : elle est créée (App.jsx ~2743), supprimée (~2752) ou RECOPIÉE à nouvel id (« renvoyer », ~2789) — aucun chemin ne la réécrit en place. ⚠️ mesuré : l'union par id garde la PREMIÈRE copie vue, une sous-clé retirée reviendrait dans un sens sur deux" },
  { liste: "challenges", cle: "playerId", dans: "config", champ: "checkins",
    conteneur: { cle: "weeklyChallenge", fixe: { weekKey: "2026-08-14" } },
    sansRetrait: "cocher le défi est à sens unique : l'unique appelant ne passe que `true` (`onChallengeCheckin(todayC,true)`, App.jsx ~1326) et le portail parent n'affiche les 7 jours qu'en LECTURE (parentpanel.jsx ~472). ⚠️ mesuré : `{...ex.checkins, ...c.checkins}` ressuscite une clé retirée dans les QUATRE sens — le jour où un bouton « décocher » apparaît, il faudra un tombstone daté, pas une retouche de l'union" },
  { liste: "feed", cle: "id", dans: "config", champ: "likeTs",
    sansRetrait: "registre daté du ❤️ posé (v2.16.84), fusionné par MAX clé par clé : une clé ne fait que grandir, jamais disparaître (les tables vides sont supprimées à la sortie pour ne pas peser sur les 60 entrées du fil)" },
  { liste: "feed", cle: "id", dans: "config", champ: "unlikes",
    sansRetrait: "tombstone daté du ❤️ retiré (v2.16.84), même MAX clé par clé : re-aimer n'efface pas la clé, il pose un `likeTs` plus récent qui la bat" },
  { liste: "calendar", cle: "id", dans: "gameStates", champ: "recur",
    elementEnBloc: "`_mergeCalendar` garde l'élément ENTIER dont l'`updatedAt` est le plus grand, et repasser un événement en « ponctuel » réécrit bien `recur: null` avec un `updatedAt` neuf (payload App.jsx ~4155 → `handleUpdateCalendarEvent`)" },
  { liste: "players", cle: "id", dans: "config", champ: "morningLock",
    elementEnBloc: "`_mergePlayer` prend `morningLock` EN BLOC du côté le plus frais (`frais(\"morningLock\")`, v2.16.77) : l'objet est remplacé, jamais fusionné clé par clé" },
];

console.log("· sous-objets — complétude : tout objet DANS un élément de liste doit être classé");
{
  const fusion = client.mergeFamily(famA, famB);
  const declarees = new Set(SOUS_OBJETS.map((l) => `${cheminDe(l)}[].${l.champ}`));
  for (const dans of ["config", "gameStates"]) {
    const racine = dans === "config" ? fusion.config : fusion.gameStates[0];
    for (const { chemin, elems } of listesDObjets(racine, dans))
      for (const el of elems) {
        if (!el || typeof el !== "object" || Array.isArray(el)) continue;
        for (const [sk, sv] of Object.entries(el)) {
          if (!sv || typeof sv !== "object" || Array.isArray(sv) || !Object.keys(sv).length) continue;
          if (!declarees.has(`${chemin}[].${sk}`))
            fail(`sous-objet « ${chemin}[].${sk} » non classé : rien ne dit si un geste de l'app en `
               + `RETIRE une SOUS-CLÉ. Le 6e étage ne regarde que les objets de premier niveau — un `
               + `objet fusionné clé par clé DANS un élément ressuscite ses retraits tout pareil. `
               + `Ajoute-le à SOUS_OBJETS dans scripts/check-merge-parity.mjs.`);
        }
      }
  }
}

console.log("· sous-objets — un retrait de sous-clé exprimé par le côté frais doit survivre");
{
  const ID = "so1", RETIRE = "cle_retiree", VOISIN = "cle_gardee";
  for (const l of SOUS_OBJETS) {
    if (l.sansRetrait) {
      if (typeof l.sansRetrait !== "string" || !l.sansRetrait.length)
        fail(`sous-objet « ${cheminDe(l)}[].${l.champ} » — \`sansRetrait\` doit dire POURQUOI aucun retrait n'existe.`);
      continue;
    }
    if (!l.elementEnBloc)
      fail(`sous-objet « ${cheminDe(l)}[].${l.champ} » — ni \`sansRetrait\`, ni \`elementEnBloc\` : classe-le.`);
    // Le côté FRAIS a retiré la sous-clé ; le périmé l'a encore. `VOISIN` est le témoin : il doit
    // survivre partout, sinon le mécanisme de retrait emporte plus que sa cible.
    const elemFrais = { [l.cle]: ID, updatedAt: 9, ts: 9, [l.champ]: { [VOISIN]: 1 } };
    const elemPerime = { [l.cle]: ID, updatedAt: 5, ts: 9, [l.champ]: { [VOISIN]: 1, [RETIRE]: 1 } };
    const fFrais = poseListe("2026-08-15T12:00:00.000Z", gsA, famA.config, { ...plA, id: ID }, l, [elemFrais]);
    const fPerime = poseListe("2026-08-14T12:00:00.000Z", gsB, famB.config, { ...plB, id: ID }, l, [elemPerime]);
    for (const [sens, base, inc] of [["frais en base", fFrais, fPerime], ["frais en incoming", fPerime, fFrais]]) {
      for (const [nom, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
        const sous = (litElemDe(fn(base, inc), l, ID) || {})[l.champ] || {};
        if (Object.prototype.hasOwnProperty.call(sous, RETIRE))
          fail(`${nom} mergeFamily (${sens}) — ${cheminDe(l)}[].${l.champ} : la sous-clé « ${RETIRE} » a `
             + `été RETIRÉE par le côté frais et l'autre copie la ressuscite. Un objet fusionné clé par `
             + `clé DANS un élément ne sait pas plus exprimer un retrait qu'un objet de premier niveau : `
             + `il faut remplacer l'élément en bloc ou passer par un tombstone daté, dans src/merge.js `
             + `ET server-merge.cjs.`);
        if (!Object.prototype.hasOwnProperty.call(sous, VOISIN))
          fail(`${nom} mergeFamily (${sens}) — ${cheminDe(l)}[].${l.champ} : le retrait a emporté la `
             + `sous-clé « ${VOISIN} », qui n'était pas visée. Le mécanisme de retrait est trop large.`);
      }
    }
  }
}

// ── 10e ÉTAGE : LES LISTES NICHÉES DANS UN OBJET ───────────────────────────
// v2.16.86 — c'est mot pour mot la piste que la v2.16.85 s'était laissée : « le 9e étage ne classe
// QUE les objets ; un sous-objet qui contiendrait lui-même une LISTE n'est vérifié qu'au niveau de
// ses clés, pas de leur contenu — la question "retirer une tâche d'une annonce" n'a pas d'étage ».
// Le relevé de la prod du 18 août montre que le trou est plus large que l'exemple qui l'a nommé :
// QUATRE listes vivent dans un objet, et aucun recensement ne pouvait les voir.
//   • 5e étage  — listes de chaînes de PREMIER niveau (`config.X`, `gameStates.X`)
//   • 6e étage  — objets : « une SOUS-CLÉ retirée survit-elle ? ». `dailyClaimed` y est classé
//                 `sansRetrait` avec la raison « seau daté {day, ids} : un jour neuf repart à
//                 vide » — vraie de la CLÉ `ids`, muette sur son CONTENU.
//   • 8e étage  — listes de chaînes DANS un élément de liste (`feed[].likes`)
//   • 9e étage  — objets DANS un élément (`announcements[].playerTasks`), au niveau des clés
// Personne ne descendait dans une liste qui vit sous un objet. Les quatre de la prod :
//   `gameStates.dailyClaimed.ids`, `gameStates.ritualCelebrated.ids`,
//   `gameStates.challengeTiers.tiers` (forme A : sous un objet de premier niveau) et
//   `config.announcements[].playerTasks.<idJoueur>` (forme B : sous un objet, dans un élément).
//
// MESURÉ en rejouant les vrais modules : les QUATRE ressuscitent un retrait — les trois seaux datés
// dans les 4 sens (à `day`/`week` ÉGALE, `_uniq([...A, ...B])` ne sait pas exprimer un retrait), et
// `playerTasks` dans 2 sens sur 4 (l'union par id d'`announcements` garde la PREMIÈRE copie vue).
// AUCUN bug vivant : les trois seaux ne sont écrits qu'en ajout (`[...dc.ids, obj.id]` App.jsx:3707,
// `[...rc, ...fresh]` :349, `[...claimed, ...due]` :2561 — le retrait passe par la bascule de
// `day`/`week`, qui a sa règle), et le contenu d'une annonce est figé à l'envoi. Même état que
// `completed` avant la v2.16.82 : correct par accident, surveillé par rien.
//
// Ce que cet étage ajoute par rapport aux 8 précédents : `ressuscite` est un CHIFFRE VÉRIFIÉ, pas
// une note en prose. Les fiches `⚠️ mesuré` du 9e étage peuvent dériver en silence dès que
// quelqu'un touche une règle de fusion ; ici la mesure est rejouée à chaque build et doit tomber
// juste. Un `sansRetrait` reste donc honnête même quand personne ne le relit.
//   • `sansRetrait: "raison"`  — aucun geste ne retire d'ÉLÉMENT de cette liste (dis POURQUOI)
//   • `objetEnBloc: "raison"`  — l'objet porteur vient ENTIER du côté frais (retrait acquis)
//   • `ressuscite: n`          — sens (sur 4) où un retrait est ressuscité, OBLIGATOIRE et vérifié
const LISTES_NICHEES = [
  // Forme A — la liste vit dans un objet de premier niveau. `fixe` porte la clé d'arbitrage du
  // seau, posée ÉGALE des deux côtés : c'est le cas normal (deux tablettes le même jour), et
  // justement le seul où l'union décide de quelque chose.
  { dans: "gameStates", objet: "dailyClaimed", champ: "ids", fixe: { day: "2026-08-14" },
    ressuscite: 4,
    sansRetrait: "seul écrivain : `handleClaimDaily` (App.jsx ~3707) fait `ids:[...dc.ids, obj.id]` et sort tôt si l'id y est déjà — ajout pur. Le vidage n'est pas un retrait d'élément : c'est la bascule de `day`, arbitrée par la règle du seau" },
  { dans: "gameStates", objet: "ritualCelebrated", champ: "ids", fixe: { day: "2026-08-14" },
    ressuscite: 4,
    sansRetrait: "seul écrivain : la célébration de rituel (App.jsx ~349) fait `ids:[...rc, ...fresh.map(r=>r.id)]` — ajout pur, `rc` déjà vidé si le jour a changé" },
  { dans: "gameStates", objet: "challengeTiers", champ: "tiers", fixe: { week: "2026-08-14" },
    valeurs: { garde: 3, retire: 5 },
    ressuscite: 4,
    sansRetrait: "seul écrivain : le versement des paliers du défi (App.jsx ~2561) fait `tiers:[...claimed, ...due.map(t=>t.days)]` — ajout pur ; un palier atteint ne se dé-atteint pas" },
  // Forme B — la liste vit dans un sous-objet, DANS un élément de liste. Les clés du sous-objet
  // sont des ids de joueur (dynamiques) : le recensement les regroupe en `playerTasks.*`.
  { dans: "config", liste: "announcements", cle: "id", objet: "playerTasks", cleDyn: "p1",
    ressuscite: 2,
    sansRetrait: "le contenu d'une annonce est figé à l'envoi : `playerTasks` n'est construit qu'une fois, au moment d'envoyer (parentpanel.jsx ~772-793), et l'annonce n'est ensuite que supprimée ou RECOPIÉE à nouvel id (« renvoyer »). Aucun écran ne modifie la liste de tâches d'une annonce vivante. ⚠️ le jour où « modifier une annonce » existe, l'union par id d'`announcements` rend la PREMIÈRE copie vue : il faudra un élément remplacé en bloc, pas une retouche de l'union" },
];

console.log("· listes nichées — complétude : toute liste DANS un objet doit être classée");
{
  const fusion = client.mergeFamily(famA, famB);
  const primitives = (v) => Array.isArray(v) && v.length && v.every((x) => !x || typeof x !== "object");
  const declarees = new Set(LISTES_NICHEES.map((l) => (l.liste
    ? `${l.dans}.${l.liste}[].${l.objet}.*`
    : `${l.dans}.${l.objet}.${l.champ}`)));
  for (const dans of ["config", "gameStates"]) {
    const racine = dans === "config" ? fusion.config : fusion.gameStates[0];
    // Forme A — un objet de premier niveau qui contient une liste de valeurs simples. Les listes
    // d'OBJETS nichées (`weeklyQuests.assignments`…) sont déjà vues par `listesDObjets`.
    for (const [k, v] of Object.entries(racine || {})) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      for (const [k2, v2] of Object.entries(v)) {
        if (!primitives(v2)) continue;
        if (!declarees.has(`${dans}.${k}.${k2}`))
          fail(`liste nichée « ${dans}.${k}.${k2} » non classée : rien ne dit si un geste de l'app en `
             + `RETIRE un élément. Le 6e étage classe l'OBJET « ${k} » et s'arrête à ses clés — il ne `
             + `regarde jamais le CONTENU d'une liste posée dessous, et une union y ressuscite ses `
             + `retraits exactement comme au premier niveau. Ajoute-la à LISTES_NICHEES.`);
      }
    }
    // Forme B — une liste sous un sous-objet, dans un élément de liste.
    for (const { chemin, elems } of listesDObjets(racine, dans))
      for (const el of elems) {
        if (!el || typeof el !== "object" || Array.isArray(el)) continue;
        for (const [sk, sv] of Object.entries(el)) {
          if (!sv || typeof sv !== "object" || Array.isArray(sv)) continue;
          if (!Object.values(sv).some(primitives)) continue;
          if (!declarees.has(`${chemin}[].${sk}.*`))
            fail(`liste nichée « ${chemin}[].${sk}.* » non classée : le 9e étage classe le sous-objet `
               + `« ${sk} » et ne pose la question qu'au niveau de ses CLÉS. Retirer un élément d'une `
               + `des listes qu'il porte est une autre question, et personne ne la pose. `
               + `Ajoute-la à LISTES_NICHEES.`);
        }
      }
  }
}

console.log("· listes nichées — le nombre de sens où un retrait ressuscite doit être exact");
{
  const ID = "ln1";
  const poseNichee = (savedAt, gsBase, cfgBase, pl, l, elems) => {
    if (l.liste) {
      const el = { [l.cle]: ID, ts: 5, updatedAt: 5, createdAt: "2026-08-14",
                   [l.objet]: { [l.cleDyn]: elems } };
      return poseListe(savedAt, gsBase, cfgBase, pl, l, [el]);
    }
    const bloc = { [l.objet]: { ...(l.fixe || {}), [l.champ]: elems } };
    return l.dans === "config"
      ? mkFam(savedAt, gsBase, { ...cfgBase, ...bloc }, pl)
      : mkFam(savedAt, { ...gsBase, ...bloc }, cfgBase, pl);
  };
  const litNichee = (fam, l) => {
    if (l.liste) return ((litElemDe(fam, l, ID) || {})[l.objet] || {})[l.cleDyn] || [];
    const racine = l.dans === "config" ? fam.config : fam.gameStates[0];
    return ((racine || {})[l.objet] || {})[l.champ] || [];
  };
  for (const l of LISTES_NICHEES) {
    const nom = l.liste ? `${l.dans}.${l.liste}[].${l.objet}.${l.cleDyn}` : `${l.dans}.${l.objet}.${l.champ}`;
    if (l.sansRetrait) {
      if (typeof l.sansRetrait !== "string" || !l.sansRetrait.length)
        fail(`liste nichée « ${nom} » — \`sansRetrait\` doit dire POURQUOI aucun retrait n'existe.`);
    } else if (!l.objetEnBloc) {
      fail(`liste nichée « ${nom} » — ni \`sansRetrait\`, ni \`objetEnBloc\` : classe-la.`);
    }
    if (typeof l.ressuscite !== "number")
      fail(`liste nichée « ${nom} » — \`ressuscite\` (nombre de sens sur 4) est OBLIGATOIRE : c'est `
         + `lui qui empêche la fiche de dériver quand une règle de fusion change.`);
    const { garde: GARDE = "temoin_garde", retire: RETIRE = "cible_retiree" } = l.valeurs || {};
    const fFrais = poseNichee("2026-08-15T12:00:00.000Z", gsA, famA.config, plA, l, [GARDE]);
    const fPerime = poseNichee("2026-08-14T12:00:00.000Z", gsB, famB.config, plB, l, [GARDE, RETIRE]);
    let vus = 0;
    for (const [sens, base, inc] of [["frais en base", fFrais, fPerime], ["frais en incoming", fPerime, fFrais]]) {
      for (const [impl, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
        const vals = litNichee(fn(base, inc), l);
        if (vals.includes(RETIRE)) vus++;
        if (!vals.includes(GARDE))
          fail(`${impl} mergeFamily (${sens}) — ${nom} : le témoin « ${GARDE} », que personne n'a `
             + `retiré, a disparu. La règle emporte plus que sa cible.`);
        if (!l.sansRetrait && vals.includes(RETIRE))
          fail(`${impl} mergeFamily (${sens}) — ${nom} : « ${RETIRE} » a été RETIRÉ par le côté frais `
             + `et l'autre copie le ressuscite, alors que la fiche promet \`objetEnBloc\`. Une liste `
             + `nichée ne sait pas plus exprimer un retrait qu'une liste de premier niveau : remplace `
             + `l'objet porteur en bloc ou pose un tombstone daté, dans src/merge.js ET server-merge.cjs.`);
      }
    }
    if (vus !== l.ressuscite)
      fail(`liste nichée « ${nom} » — la fiche annonce \`ressuscite: ${l.ressuscite}\` et la mesure `
         + `en trouve ${vus} (sur 4). Si une règle de fusion vient de changer, c'est une bonne `
         + `nouvelle à écrire ; sinon la fiche ment, et son \`sansRetrait\` ne protège plus rien.`);
  }
}

// ── 11e ÉTAGE : LA TOLÉRANCE « IL VOYAGE AVEC SON ÉLÉMENT » EST-ELLE VRAIE ? ──
// v2.16.87 — c'est mot pour mot la piste que la v2.16.86 s'était laissée : « le contrôle tolère les
// scalaires DANS un élément (39 aujourd'hui) au motif qu'ils voyagent avec leur élément — vrai tant
// que l'élément est pris en bloc, FAUX dès qu'une liste est fusionnée clé par clé, et rien ne croise
// les deux ».
//
// Les dix étages précédents classent des CHEMINS. Celui-ci ne classe rien : il vérifie la seule
// phrase sur laquelle repose tout ce que le contrôle « fixtures vs schéma de prod » laisse passer.
// Un scalaire toléré n'a aucun étage à lui — sa seule protection est que son élément arrive entier
// du côté qui gagne. Si la règle de fusion reconstruit l'élément champ par champ, un champ qu'elle
// ne nomme pas prend le côté que le littéral décide, pas celui de l'élément : la tolérance devient
// un trou, et un trou d'autant plus tranquille que personne ne le relit.
//
// LA MESURE : on pose dans chaque liste un élément présent des DEUX côtés (même clé), qui porte en
// plus un champ témoin qu'AUCUNE règle ne connaît. Puis on regarde de quel côté le témoin ressort,
// comparé au côté d'où vient le reste de l'élément (l'« ancre » : le premier champ scalaire qui
// diffère vraiment entre les deux copies).
//   • témoin du même côté que l'ancre, dans les 4 sens → l'élément voyage en bloc, la tolérance
//     tient, et elle tient de façon MESURÉE.
//   • témoin absent, ou du côté opposé → la tolérance est FAUSSE pour cette liste : chacun de ses
//     scalaires de prod doit alors être porté par les fixtures et arbitré nommément.
// `temoinHorsBloc` est un CHIFFRE rejoué à chaque build (sur 4 : 2 sens × 2 implémentations), même
// discipline qu'au 10e étage — une fiche en prose peut dériver en silence, un chiffre non.
//
// RÉSULTAT DU JOUR : `config.players` est la seule liste hors bloc, et elle l'est dans les 4 sens.
// `_mergePlayer` (src/merge.js:363) commence par `{ ...a, ...b }` puis ré-arbitre nommément `name`,
// `color`, `morningLock`, `dailyMinutesLimit`, `pseudo`, `themeId`, `themeChosenAt`,
// `starterThemes` : un champ hors de cette liste prend TOUJOURS `b`, l'incoming, quelle que soit la
// fraîcheur. Aucun bug vivant — les sept champs que la prod porte sous `config.players[]` sont tous
// dans le littéral, donc aucun n'est toléré (ils sont dans les fixtures depuis la v2.16.77). Mais
// c'était vrai par accident : le jour où un huitième champ apparaît, il serait toléré en silence
// par le contrôle du haut ET mal fusionné par `_mergePlayer`. Le croisement ci-dessous est ce qui
// transforme cet accident en garantie.
console.log("· scalaires tolérés — le témoin doit ressortir du même côté que son élément");
{
  const TEMOIN = "__temoinFusion";
  for (const l of LISTES) {
    const chemin = cheminListe(l);
    if (!l.frais || !l.perime)
      { fail(`liste « ${chemin} » — pas de fixtures \`frais\`/\`perime\` : le 11e étage ne peut pas `
           + `mesurer si un scalaire non nommé par la règle voyage avec son élément.`); continue; }
    if (typeof l.temoinHorsBloc !== "number")
      fail(`liste « ${chemin} » — \`temoinHorsBloc\` (nombre de sens sur 4) est OBLIGATOIRE : c'est `
         + `lui qui empêche la tolérance du contrôle « fixtures vs schéma de prod » de redevenir une `
         + `simple promesse.`);
    // L'ancre : un champ scalaire qui diffère VRAIMENT entre les deux copies. Sans elle, on saurait
    // où est passé le témoin mais pas où est passé le reste — et c'est la comparaison des deux qui
    // fait le contrôle (leçon « fixture identique = contrôle inerte »).
    const ancre = Object.keys(l.frais).find((k) => k !== l.cle && k !== TEMOIN
      && (l.frais[k] === null || typeof l.frais[k] !== "object") && !same(l.frais[k], l.perime[k]));
    if (!ancre)
      { fail(`liste « ${chemin} » — aucun champ scalaire ne diffère entre \`frais\` et \`perime\` : `
           + `le témoin n'a aucun côté auquel se comparer, le contrôle serait inerte.`); continue; }
    const elA = { ...l.frais, [TEMOIN]: "FRAIS" };
    const elB = { ...l.perime, [TEMOIN]: "PERIME" };
    const fA = avecListe("2026-08-15T12:00:00.000Z", gsA, famA.config, plA, l, [elA]);
    const fB = avecListe("2026-08-14T12:00:00.000Z", gsB, famB.config, plB, l, [elB]);
    let horsBloc = 0;
    for (const [sens, base, inc] of [["frais en base", fA, fB], ["frais en incoming", fB, fA]]) {
      for (const [impl, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
        const out = litListe(fn(base, inc), l).find((e) => e && e[l.cle] === elA[l.cle]);
        if (!out)
          { fail(`${impl} mergeFamily (${sens}) — ${chemin}[${l.cle}=${elA[l.cle]}] : l'élément a `
               + `disparu de la fusion alors qu'il était présent des DEUX côtés.`); continue; }
        const coteAncre = same(out[ancre], l.frais[ancre]) ? "FRAIS"
                        : same(out[ancre], l.perime[ancre]) ? "PERIME" : null;
        if (coteAncre === null)
          { fail(`${impl} mergeFamily (${sens}) — ${chemin} : l'ancre « ${ancre} » ne ressort d'aucun `
               + `des deux côtés (${JSON.stringify(out[ancre])}). Choisis une fixture dont ce champ `
               + `n'est pas recalculé, sinon le témoin n'a pas de référence.`); continue; }
        if (out[TEMOIN] !== coteAncre) horsBloc++;
      }
    }
    const toleres = SCALAIRES_TOLERES.get(chemin) || [];
    if (horsBloc !== l.temoinHorsBloc)
      fail(`liste « ${chemin} » — la fiche annonce \`temoinHorsBloc: ${l.temoinHorsBloc}\` et la `
         + `mesure en trouve ${horsBloc} (sur 4). Si une règle de fusion vient de changer, c'est une `
         + `bonne nouvelle à écrire ; sinon la fiche ment, et la tolérance du contrôle « fixtures vs `
         + `schéma de prod » ne repose plus sur rien.`);
    if (horsBloc > 0 && toleres.length)
      fail(`liste « ${chemin} » — ses éléments NE voyagent PAS en bloc (${horsBloc} sens sur 4), et `
         + `pourtant ${toleres.length} de ses scalaires de prod ne sont portés par aucune fixture : `
         + `${toleres.join(", ")}. Le contrôle « fixtures vs schéma de prod » les laisse passer au `
         + `motif qu'ils suivent leur élément — c'est faux ici. Porte-les dans famA/famB avec des `
         + `valeurs qui se contredisent, et arbitre-les nommément dans src/merge.js ET `
         + `server-merge.cjs.`);
  }
}


// ── 13e ÉTAGE : les SOUS-CLÉS d'un objet, mesurées au lieu d'être supposées ──
// v2.16.89 — c'est mot pour mot la piste laissée par la v2.16.88 : « 18 chemins `X.*` scalaires
// sont tolérés PARCE QUE la règle de leur objet les arbitre, et c'est exactement la promesse que
// le 11e étage a dû mesurer pour la tolérance jumelle ». La promesse s'appuyait sur le 6e étage —
// mais le 6e ne répond pas à cette question-là : il demande « une sous-clé RETIRÉE survit-elle ? »,
// jamais « à sous-clé en COLLISION, laquelle gagne ? ». Et il ne couvre que quatre objets sur les
// dix-huit (`OBJETS_PAR_CLE`) ; les autres tiennent par habitude d'écriture.
//
// Trois classements possibles, et chacun MORD :
//   • `mesureAilleurs: "table"` — un étage existant met déjà cette sous-clé en collision. On vérifie
//     que la table nommée porte VRAIMENT le champ (une fiche qui pointe dans le vide est un faux).
//   • `frais: {cle, sousCle}`   — à clé d'arbitrage ÉGALE (le cas qui dure toute la semaine), la
//     valeur FRAÎCHE de `sousCle` doit gagner dans les deux sens, client et serveur.
//   • `convergent: {attendu}`   — la règle COMBINE les deux côtés (union, max). Le résultat doit
//     être le même dans les deux sens ET dans les deux copies : un rendu qui dépend de l'ordre des
//     arguments désigne l'appelant, pas la donnée (défaut de `petEvo` v2.16.88, `coinsWeek` ici).
//
// Ce que la mesure a trouvé le soir de sa naissance : `coinsWeek` rendait l'objet ENTIER du côté
// `a` à semaine égale, `config.boss` donnait ses six descripteurs non nommés à l'incoming, et
// `_mergeCalendar` tranchait l'égalité d'`updatedAt` (61 des 61 événements de la prod) par « le
// second argument gagne ». Aucun bug vivant — la donnée de prod ne porte aujourd'hui aucune des
// sous-clés qui divergeraient — mais les trois sont réparés, et la promesse est devenue un chiffre.
const TEMOIN_SC = "__sousCle";
const SOUS_CLES = [
  { chemin: "gameStates.equipped",    mesureAilleurs: "OBJETS_PAR_CLE", champ: "equipped" },
  { chemin: "gameStates.settings",    mesureAilleurs: "OBJETS_PAR_CLE", champ: "settings" },
  { chemin: "gameStates.avatar",      mesureAilleurs: "OBJETS_PAR_CLE", champ: "avatar" },
  { chemin: "gameStates.petNickname", mesureAilleurs: "OBJETS_PAR_CLE", champ: "petNickname" },
  { chemin: "config.weeklyQuests",    mesureAilleurs: "OBJETS_ARBITRES", champ: "weeklyQuests" },
  { chemin: "config.weeklyChallenge", mesureAilleurs: "OBJETS_ARBITRES", champ: "weeklyChallenge" },

  // ── `frais` : à clé d'arbitrage ÉGALE, la sous-clé fraîche doit gagner ───
  { chemin: "gameStates.coinsWeek", dans: "gameStates", champ: "coinsWeek",
    frais: { cle: "week", sousCle: "coins" },
    valeurFraiche: { week: "2026-08-14", coins: 40 }, valeurPerimee: { week: "2026-08-14", coins: 99 },
    pourquoi: "seau daté {week, coins}. `coins` est mort depuis la v2.16.45 (`migrateGameState` réécrit `{week}` seul), mais la règle doit savoir l'arbitrer le jour où un vieux client en réécrit un." },
  { chemin: "config.boss", dans: "config", champ: "boss",
    frais: { cle: "startedAt", sousCle: "hpMax" },
    valeurFraiche: { id: "yeti", name: "Yéti", emoji: "❄️", image: "/b.png", difficulty: "costaud", hpMax: 308, startedAt: "2026-07-24T23:45:37.905Z", lastHitTs: "2026-08-15T00:00:00.000Z", defeatedAt: null },
    valeurPerimee: { id: "yeti", name: "Yéti", emoji: "❄️", image: "/b.png", difficulty: "costaud", hpMax: 120, startedAt: "2026-07-24T23:45:37.905Z", lastHitTs: "2026-08-14T00:00:00.000Z", defeatedAt: null },
    pourquoi: "`handleLaunchBoss` (App.jsx ~3087) écrit les six descripteurs dans le MÊME littéral que `startedAt` : à `startedAt` égal ils sont égaux par construction, donc rien ne diverge en prod. C'est une habitude d'écriture, pas une règle — la règle doit tenir sans elle." },
  { chemin: "gameStates.calendar[].recur", dans: "gameStates", champ: "calendar",
    // La clé d'arbitrage est `updatedAt`, pas `id` : `id` ne fait que rapprocher les deux copies.
    // Elle est ABSENTE des deux côtés — c'est le cas de 61 événements sur 61 en prod, donc l'égalité
    // n'est pas un cas limite ici, c'est le cas ordinaire.
    frais: { cle: "updatedAt", sousCle: "recur" },
    poser: (el) => ({ calendar: [el], removedCalendarIds: [] }),
    lire: (gs) => (gs.calendar || []).find((e) => e && e.id === "e13"),
    valeurFraiche: { id: "e13", type: "evenement", label: "Frais", date: "2026-08-15", recur: { freq: "weekly", day: 2 } },
    valeurPerimee: { id: "e13", type: "sante", label: "Périmé", date: "2026-08-14", recur: { freq: "daily" } },
    pourquoi: "sous-objet dans un élément : il voyage avec son élément, arbitré par `updatedAt` — ABSENT des 61 événements de la prod, donc l'égalité (`0` contre `0`) est le cas NORMAL, pas le cas rare." },

  // ── `convergent` : la règle combine, le résultat ne dépend pas de l'ordre ─
  { chemin: "gameStates.petXp", dans: "gameStates", champ: "petXp",
    valeurFraiche: { dragon: 40 }, valeurPerimee: { dragon: 10, chat: 5 },
    convergent: { dragon: 40, chat: 5 }, pourquoi: "max par familier (monotone)" },
  { chemin: "gameStates.completedAt", dans: "gameStates", champ: "completedAt",
    valeurFraiche: { "t13#2026-08-14": "2026-08-15T10:00:00.000Z" },
    valeurPerimee: { "t13#2026-08-14": "2026-08-14T10:00:00.000Z", "t14#2026-08-01": "2026-08-01T10:00:00.000Z" },
    convergent: { "t13#2026-08-14": "2026-08-15T10:00:00.000Z", "t14#2026-08-01": "2026-08-01T10:00:00.000Z" },
    pourquoi: "union par clé, horodatage le plus récent (v2.16.82)" },
  { chemin: "gameStates.dailyClaimed", dans: "gameStates", champ: "dailyClaimed",
    valeurFraiche: { day: "2026-08-14", ids: ["o3"] }, valeurPerimee: { day: "2026-08-14", ids: ["o6"] },
    convergent: { day: "2026-08-14", ids: ["o3", "o6"] }, pourquoi: "jour ÉGAL → union des ids (ordre du tableau non significatif : la seule lecture est `.includes()` — App.jsx:1311, :2550, :341)", ordreSansImportance: true },
  { chemin: "gameStates.ritualCelebrated", dans: "gameStates", champ: "ritualCelebrated",
    valeurFraiche: { day: "2026-08-14", ids: ["rt1"] }, valeurPerimee: { day: "2026-08-14", ids: ["rt2"] },
    convergent: { day: "2026-08-14", ids: ["rt1", "rt2"] }, pourquoi: "jour ÉGAL → union des ids (ordre du tableau non significatif : la seule lecture est `.includes()` — App.jsx:1311, :2550, :341)", ordreSansImportance: true },
  { chemin: "gameStates.challengeTiers", dans: "gameStates", champ: "challengeTiers",
    valeurFraiche: { week: "2026-08-14", tiers: [3] }, valeurPerimee: { week: "2026-08-14", tiers: [5, 7] },
    convergent: { week: "2026-08-14", tiers: [3, 5, 7] }, pourquoi: "semaine ÉGALE → union des paliers (ordre du tableau non significatif : la seule lecture est `.includes()` — App.jsx:1311, :2550, :341)", ordreSansImportance: true },
  { chemin: "gameStates.petDay", dans: "gameStates", champ: "petDay",
    valeurFraiche: { day: "2026-08-14", xp: 25 }, valeurPerimee: { day: "2026-08-14", xp: 10 },
    convergent: { day: "2026-08-14", xp: 25 }, pourquoi: "jour ÉGAL → max (plafond quotidien)" },
  { chemin: "gameStates.sessionMinutes", dans: "gameStates", champ: "sessionMinutes",
    valeurFraiche: { day: "2026-08-15", minutes: 42 }, valeurPerimee: { day: "2026-08-15", minutes: 5 },
    convergent: { day: "2026-08-15", minutes: 42 }, pourquoi: "jour ÉGAL → max (budget-temps)" },
  { chemin: "gameStates.bossBattle", dans: "gameStates", champ: "bossBattle",
    valeurFraiche: { bossId: "2026-08-01", earned: 5, spent: 2, dmg: 30 },
    valeurPerimee: { bossId: "2026-08-01", earned: 9, spent: 1, dmg: 10 },
    convergent: { bossId: "2026-08-01", earned: 9, spent: 2, dmg: 30 }, pourquoi: "bossId ÉGAL → max sur chaque compteur monotone" },
  { chemin: "config.weeklyChallenge.challenges[].checkins", dans: "config", champ: "weeklyChallenge",
    poser: (v) => ({ weeklyChallenge: { weekKey: "2026-08-14", challenges: [{ playerId: "p1", text: "Défi", emoji: "⭐", checkins: v }] } }),
    lire: (cfg) => cfg.weeklyChallenge?.challenges?.[0]?.checkins,
    valeurFraiche: { "2026-08-15": true }, valeurPerimee: { "2026-08-14": true },
    convergent: { "2026-08-14": true, "2026-08-15": true },
    pourquoi: "union des journées cochées. Une journée ne peut pas se contredire : le SEUL appel est `onChallengeCheckin(todayC, true)` (App.jsx:1326) — aucune UI ne décoche, le panneau parent n'affiche les 7 jours qu'en lecture (parentpanel.jsx ~472)." },
];
console.log("· sous-clés d'objet — complétude : tout objet toléré `X.*` doit dire qui l'arbitre");
{
  const fiches = new Map(SOUS_CLES.map((f) => [f.chemin, f]));
  for (const anc of SOUS_CLES_TOLEREES)
    if (!fiches.has(anc))
      fail(`« ${anc}.* » est toléré par le contrôle « fixtures vs schéma de prod » au motif que la `
         + `RÈGLE DE SON OBJET l'arbitre — et aucune fiche du 13e étage ne dit laquelle. Ajoute-la : `
         + `\`mesureAilleurs\` si un étage met déjà cette sous-clé en collision, \`frais\` si la clé `
         + `d'arbitrage doit être mise à ÉGALITÉ, \`convergent\` si la règle combine les deux côtés.`);
  for (const f of SOUS_CLES)
    if (!SOUS_CLES_TOLEREES.has(f.chemin))
      fail(`13e étage — fiche « ${f.chemin} », que le relevé de prod ne tolère plus (champ disparu, `
         + `ou passé sous une autre règle). Fiche périmée : retire-la, sinon elle couvrira un jour un `
         + `chemin homonyme sans que personne l'ait relu.`);
}

console.log("· sous-clés d'objet — à clé d'arbitrage ÉGALE, la sous-clé FRAÎCHE doit gagner");
{
  const TABLES = { OBJETS_PAR_CLE, OBJETS_ARBITRES };
  const poseF = (f, v) => (f.poser ? f.poser(v) : { [f.champ]: v });
  const litF = (f, racine) => (f.lire ? f.lire(racine) : racine[f.champ]);
  for (const f of SOUS_CLES) {
    if (f.mesureAilleurs) {
      const t = TABLES[f.mesureAilleurs];
      if (!t) { fail(`13e étage — fiche « ${f.chemin} » renvoie à « ${f.mesureAilleurs} », qui n'existe pas.`); continue; }
      if (!t.some((o) => o.champ === f.champ))
        fail(`13e étage — fiche « ${f.chemin} » dit que « ${f.mesureAilleurs} » met « ${f.champ} » en `
           + `collision, et cette table ne le porte pas. La fiche pointe dans le vide : soit tu ajoutes `
           + `le champ à la table, soit tu MESURES la sous-clé ici.`);
      continue;
    }
    if (same(f.valeurFraiche, f.valeurPerimee))
      { fail(`13e étage — fiche « ${f.chemin} » : les deux copies sont identiques, la mesure ne `
           + `surveille rien (leçon « fixture identique = contrôle inerte »).`); continue; }
    if (f.frais && f.frais.cle && !same(f.valeurFraiche[f.frais.cle], f.valeurPerimee[f.frais.cle]))
      { fail(`13e étage — fiche « ${f.chemin} » : la clé d'arbitrage « ${f.frais.cle} » DIFFÈRE entre `
           + `les deux copies. C'est le cas rare, déjà couvert ailleurs : mets-la à ÉGALITÉ, sinon la `
           + `mesure ne voit jamais les 7 jours sur 7 où elle ne bouge pas.`); continue; }
    const cfgF = f.dans === "config" ? { ...famA.config, ...poseF(f, f.valeurFraiche) } : famA.config;
    const cfgP = f.dans === "config" ? { ...famB.config, ...poseF(f, f.valeurPerimee) } : famB.config;
    const gsF  = f.dans === "gameStates" ? { ...gsA, ...poseF(f, f.valeurFraiche) } : gsA;
    const gsP  = f.dans === "gameStates" ? { ...gsB, ...poseF(f, f.valeurPerimee) } : gsB;
    const fA = mkFam("2026-08-15T12:00:00.000Z", gsF, cfgF, plA);
    const fB = mkFam("2026-08-14T12:00:00.000Z", gsP, cfgP, plB);
    let ordreDifferent = 0; // v2.16.89 — voir la vérification de `ordreSansImportance` en fin de fiche
    for (const [sens, base, inc] of [["frais en base", fA, fB], ["frais en incoming", fB, fA]]) {
      for (const [impl, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
        const out = fn(base, inc);
        const rec = litF(f, f.dans === "config" ? out.config : out.gameStates[0]);
        if (rec == null)
          { fail(`${impl} (${sens}) — ${f.chemin} : l'objet a DISPARU de la fusion alors qu'il était `
               + `présent des deux côtés.`); continue; }
        if (f.convergent) {
          // `ordreSansImportance` n'est pas une exemption confortable : le contrôle vérifie plus bas
          // qu'une fiche qui la porte en a VRAIMENT besoin, sinon elle serait un blanc-seing muet.
          const trie = (v) => (f.ordreSansImportance ? norm(JSON.parse(JSON.stringify(v), (k, x) => (Array.isArray(x) ? [...x].sort() : x))) : v);
          if (f.ordreSansImportance && !same(rec, f.convergent)) ordreDifferent++;
          if (!same(trie(rec), trie(f.convergent)))
            fail(`${impl} (${sens}) — ${f.chemin} : la fusion rend ${JSON.stringify(rec)} au lieu du `
               + `résultat annoncé ${JSON.stringify(f.convergent)}. Une règle qui COMBINE doit rendre `
               + `la même chose quel que soit l'ordre des arguments — sinon c'est l'appelant qui `
               + `tranche (le client met son local en \`a\`, le serveur son stocké), et la divergence `
               + `ne se referme jamais. Raison fichée : ${f.pourquoi}`);
          continue;
        }
        const attendu = f.valeurFraiche[f.frais.sousCle];
        if (!same(rec[f.frais.sousCle], attendu))
          fail(`${impl} (${sens}) — ${f.chemin} (sous-clé « ${f.frais.sousCle} ») : la fusion rend `
             + `${JSON.stringify(rec[f.frais.sousCle])}, la valeur FRAÎCHE est ${JSON.stringify(attendu)}. `
             + `À « ${f.frais.cle} » ÉGAL, la règle ne regarde pas \`preferIncoming\` : elle rend le `
             + `côté que l'APPELANT a mis en premier. Corrige-la dans src/merge.js ET server-merge.cjs. `
             + `Raison fichée : ${f.pourquoi}`);
      }
    }
    // Une tolérance qui ne tolère rien est un blanc-seing : elle passe au vert aujourd'hui et
    // couvrira demain une vraie divergence d'ordre que personne n'aura décidé d'accepter. Si la
    // comparaison STRICTE passait déjà, la déclaration doit sauter (leçon « la tolérance d'un
    // garde-fou est une promesse », v2.16.87).
    if (f.ordreSansImportance && ordreDifferent === 0)
      fail(`13e étage — fiche « ${f.chemin} » déclare \`ordreSansImportance\` alors que la fusion rend `
         + `déjà le tableau dans le MÊME ordre dans les quatre mesures. La tolérance ne sert à rien : `
         + `retire-la, sinon elle couvrira un jour un désordre que personne n'a accepté.`);
  }
}

// ── 14e ÉTAGE : les clés DATÉES, recensées par la FORME ────────────────────
// v2.16.90 — piste laissée par la v2.16.89, mot pour mot : « le 13e étage classe
// `config.weeklyChallenge` en `mesureAilleurs: OBJETS_ARBITRES`, et cette table-là n'a AUCUN
// recensement — c'est une liste écrite à la main, deux entrées, choisies un soir de juillet.
// Or elle est censée couvrir "tout objet arbitré sur une seule de ses clés", et les seaux datés
// de `gameStates` (`dailyClaimed`, `petDay`, `sessionMinutes`…) sont exactement cette forme sans
// y être. Le 13e étage vient de les mesurer un par un, mais rien n'oblige un seau NEUF à y entrer :
// croiser `OBJETS_ARBITRES` avec les objets qui portent une clé de date dira ce qui manque. »
//
// Le croisement demandait un recensement, et le 13e ne pouvait pas le fournir : sa complétude est
// pilotée par `SOUS_CLES_TOLEREES`, c'est-à-dire par le RELEVÉ DE PROD. Un seau daté ajouté au code
// n'entre donc dans le champ de vision de personne tant qu'il n'a pas été écrit par une vraie
// famille ET que le relevé n'a pas été régénéré. Entre les deux, il n'a aucun juge — exactement la
// dette que la v2.16.86 avait soldée pour les listes en rendant leur recensement indépendant des
// fixtures.
//
// Ce recensement-ci ne demande rien à la prod : il parcourt la SORTIE de `mergeFamily` et retient
// tout objet qui porte au moins une valeur en forme de date ET au moins une autre clé — la forme
// même de « objet arbitré sur une seule de ses clés ». Chaque chemin trouvé doit se classer, et la
// complétude joue dans les DEUX SENS (un chemin non classé crie ; une fiche que le parcours ne
// trouve plus crie aussi, sinon elle couvrirait un jour un homonyme sans que personne l'ait relue).
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const SEAUX_DATES = [
  // Les deux RACINES : leurs champs sont classés un par un par les étages 1-3, mais une clé datée
  // posée à plat n'est plus le verrou d'un objet — c'est une clé d'arbitrage SÉPARÉE de ce qu'elle
  // arbitre. C'est tout le bug `hiddenWeek`/`hiddenRewards` de la v2.16.76 : chaque règle paraît
  // saine seule, la paire est cassée dans les deux sens. Détail dans `CLES_RACINE` juste en dessous.
  { chemin: "config",     racine: true },
  { chemin: "gameStates", racine: true },
  // ÉLÉMENTS de liste : la date voyage avec son élément, et c'est le registre `LISTES` (4e étage)
  // qui tranche « la copie fraîche gagne-t-elle sur le même id ? » et « comment s'exprime un
  // retrait ? ». On vérifie ici que la liste y est VRAIMENT inscrite — une fiche qui pointe dans
  // le vide est un faux, leçon du 13e étage.
  { chemin: "config.announcements[]",     element: "announcements" },
  { chemin: "config.players[]",           element: "players" },
  { chemin: "config.updateFeedEntries[]", element: "updateFeedEntries" },
  { chemin: "gameStates.calendar[]",      element: "calendar" },
  { chemin: "gameStates.xpLog[]",         element: "xpLog" },
  // SEAUX DATÉS proprement dits : un objet, une clé d'arbitrage datée, du contenu à côté. Chacun
  // doit être MESURÉ au 13e étage (fiche `frais`/`convergent`) ou porté par `OBJETS_ARBITRES`.
  { chemin: "config.boss",               fiche: true },
  { chemin: "config.weeklyQuests",       fiche: true },
  { chemin: "config.weeklyChallenge",    fiche: true },
  { chemin: "gameStates.bossBattle",     fiche: true },
  { chemin: "gameStates.challengeTiers", fiche: true },
  { chemin: "gameStates.coinsWeek",      fiche: true },
  { chemin: "gameStates.dailyClaimed",   fiche: true },
  { chemin: "gameStates.petDay",         fiche: true },
  { chemin: "gameStates.ritualCelebrated", fiche: true },
  { chemin: "gameStates.sessionMinutes", fiche: true },
];
// Une clé datée posée à plat sur une racine doit dire CE QU'ELLE ARBITRE, et la paire est mesurée
// ensemble : une règle qui combine doit rendre la même chose quel que soit l'ordre des arguments,
// sinon c'est l'appelant qui tranche (le client met son local en `a`, le serveur son stocké) et la
// divergence ne se referme jamais toute seule.
const CLES_RACINE = [
  { dans: "config", cle: "createdAt", exempteDans: "NAIF_ASSUME",
    pourquoi: "écrite une fois par l'assistant (`setupwizard.jsx` ~154) et jamais réécrite : les deux "
      + "copies la portent identique par construction. Le spread naïf est ASSUMÉ nommément, et c'est "
      + "cette exemption-là qui en répond — pas une mesure de plus ici." },
  { dans: "gameStates", cle: "hiddenWeek", arbitre: ["hiddenRewards"],
    A: { hiddenWeek: "2026-08-15", hiddenRewards: ["rw_a"] },
    B: { hiddenWeek: "2026-08-15", hiddenRewards: ["rw_b"] },
    attendu: { hiddenWeek: "2026-08-15", hiddenRewards: ["rw_a", "rw_b"] },
    ordreSansImportance: true,
    pourquoi: "seau daté ÉCLATÉ en deux clés plates (v2.16.76). Jour égal → union des ids ; l'ordre du "
      + "tableau n'est pas significatif, la seule lecture est `.includes()` (App.jsx ~415)." },
  { dans: "gameStates", cle: "energyTs", arbitre: ["energy"],
    A: { energy: 60, energyTs: "2026-08-15T08:03:00.000Z" },
    B: { energy: 60, energyTs: "2026-08-15T08:00:00.000Z" },
    attendu: { energy: 60, energyTs: "2026-08-15T08:03:00.000Z" },
    pourquoi: "l'énergie et son horodatage sont indissociables (`currentEnergy` recalcule la "
      + "régénération DEPUIS lui). À énergie ÉGALE dans la fenêtre de 5 min — deux copies d'un même "
      + "enfant s'assoient très souvent sur la même valeur — la règle rendait le timestamp du côté que "
      + "l'APPELANT avait mis en premier (v2.16.90). Le plus RÉCENT gagne : il crédite le moins de "
      + "régénération, donc il reste du côté « jamais généreux » de la règle, et il converge." },
  { dans: "gameStates", cle: "lastFedDay", arbitre: [],
    A: { lastFedDay: "2026-08-15" }, B: { lastFedDay: "2026-08-14" },
    attendu: { lastFedDay: "2026-08-15" },
    pourquoi: "verrou anti-double-paiement du repas quotidien (App.jsx ~3727) : il ne doit JAMAIS "
      + "reculer, sinon un second repas repaie l'énergie. Ce qu'il garde (`petXp`, `petDay`) est "
      + "monotone et se fusionne en max, donc il n'y a pas de compagnon à lui apparier." },
  { dans: "gameStates", cle: "lastSeenDay", arbitre: [],
    A: { lastSeenDay: "2026-08-15" }, B: { lastSeenDay: "2026-08-14" },
    attendu: { lastSeenDay: "2026-08-15" },
    pourquoi: "marqueur d'affichage (v2.16.72) : sa seule lecture est le toast « 🌅 Nouvelle "
      + "journée! » (App.jsx:361). Aucun compagnon — il ne garde rien, il n'annonce que lui-même." },
];

console.log("· clés datées — recensement PAR LA FORME, indépendant du relevé de prod");
{
  const trouves = new Map();
  const parcours = (v, chemin) => {
    if (Array.isArray(v)) { for (const el of v) parcours(el, chemin + "[]"); return; }
    if (!v || typeof v !== "object") return;
    const cles = Object.keys(v);
    const datees = cles.filter((k) => typeof v[k] === "string" && DATE_RE.test(v[k]));
    if (datees.length && datees.length < cles.length) {
      if (!trouves.has(chemin)) trouves.set(chemin, new Set());
      datees.forEach((k) => trouves.get(chemin).add(k));
    }
    for (const k of cles) parcours(v[k], chemin + "." + k);
  };
  const out = client.mergeFamily(famA, famB);
  parcours(out.config, "config");
  for (const gs of out.gameStates) parcours(gs, "gameStates");

  const fiches = new Map(SEAUX_DATES.map((s) => [s.chemin, s]));
  for (const [chemin, datees] of trouves) {
    const f = fiches.get(chemin);
    if (!f) { fail(`« ${chemin} » porte une clé en forme de date (${[...datees].join(", ")}) à côté `
       + `d'autres champs — la forme même d'un objet arbitré sur UNE de ses clés — et aucune fiche du `
       + `14e étage ne le classe. Ajoute-la : \`racine\` (ses clés datées se déclarent dans `
       + `CLES_RACINE), \`element\` (la date voyage avec son élément, la liste est au registre `
       + `LISTES), ou \`fiche\` (le seau est mesuré au 13e étage ou porté par OBJETS_ARBITRES).`); continue; }
    if (f.element && !LISTES.some((l) => l.champ === f.element))
      fail(`14e étage — « ${chemin} » se repose sur la liste « ${f.element} » du registre LISTES, qui `
         + `ne la porte pas. La fiche pointe dans le vide : inscris la liste, ou mesure la date ici.`);
    if (f.fiche) {
      const auTreize = SOUS_CLES.some((s) => s.chemin === chemin);
      const champ = chemin.split(".").pop();
      const arbitre = OBJETS_ARBITRES.some((o) => o.champ === champ);
      if (!auTreize && !arbitre)
        fail(`14e étage — « ${chemin} » est un seau daté et RIEN ne le mesure : ni fiche au 13e étage `
           + `(SOUS_CLES), ni entrée dans OBJETS_ARBITRES. C'est précisément le trou que ce `
           + `recensement existe pour fermer — un seau neuf ne doit pas pouvoir entrer sans juge.`);
    }
  }
  for (const s of SEAUX_DATES)
    if (!trouves.has(s.chemin))
      fail(`14e étage — fiche « ${s.chemin} », que le parcours ne trouve plus (champ disparu, ou `
         + `fixture qui ne porte plus de date). Fiche périmée : retire-la, sinon elle couvrira un `
         + `jour un chemin homonyme sans que personne l'ait relu.`);
  console.log(`    (${trouves.size} objets à clé datée recensés dans la sortie de mergeFamily)`);

  // Complétude des clés de RACINE : chaque clé datée posée à plat doit avoir sa fiche, et
  // réciproquement. C'est là que vit la question neuve — « qu'est-ce que cette date arbitre ? ».
  const parCle = new Map(CLES_RACINE.map((c) => [`${c.dans}.${c.cle}`, c]));
  for (const s of SEAUX_DATES) {
    if (!s.racine) continue;
    for (const cle of trouves.get(s.chemin) || [])
      if (!parCle.has(`${s.chemin}.${cle}`))
        fail(`« ${s.chemin}.${cle} » est une clé DATÉE posée à plat sur une racine : elle n'est plus `
           + `le verrou d'un objet, elle arbitre à distance. Dis ce qu'elle garde dans CLES_RACINE `
           + `(\`arbitre: [...]\`, mesuré ensemble) ou pourquoi elle ne garde rien (\`arbitre: []\`).`);
  }
  for (const c of CLES_RACINE)
    if (!(trouves.get(c.dans) || new Set()).has(c.cle))
      fail(`CLES_RACINE fiche « ${c.dans}.${c.cle} », que le parcours ne trouve plus. Fiche périmée.`);
}

console.log("· clés datées de racine — la PAIRE date + contenu doit converger, dans les deux sens");
for (const c of CLES_RACINE) {
  if (c.exempteDans) {
    const tables = { NAIF_ASSUME };
    const t = tables[c.exempteDans];
    if (!t) { fail(`CLES_RACINE — « ${c.cle} » renvoie à « ${c.exempteDans} », qui n'existe pas.`); continue; }
    if (!(c.cle in t))
      fail(`CLES_RACINE — « ${c.cle} » se dit exemptée par « ${c.exempteDans} », et cette table ne la `
         + `porte pas. La fiche pointe dans le vide : soit l'exemption existe et se justifie là-bas, `
         + `soit il faut MESURER la clé ici.`);
    continue;
  }
  const champs = [c.cle, ...c.arbitre];
  if (champs.every((k) => same(c.A[k], c.B[k])))
    { fail(`CLES_RACINE — fiche « ${c.cle} » : les deux copies sont d'accord sur tout ce qu'elle `
         + `mesure. Le contrôle ne surveille rien (leçon « fixture identique = contrôle inerte »).`); continue; }
  const gsF = { ...gsA, ...c.A }, gsP = { ...gsB, ...c.B };
  const cfgF = c.dans === "config" ? { ...famA.config, ...c.A } : famA.config;
  const cfgP = c.dans === "config" ? { ...famB.config, ...c.B } : famB.config;
  const fA = mkFam("2026-08-15T12:00:00.000Z", c.dans === "gameStates" ? gsF : gsA, cfgF, plA);
  const fB = mkFam("2026-08-14T12:00:00.000Z", c.dans === "gameStates" ? gsP : gsB, cfgP, plB);
  let ordreDifferent = 0;
  for (const [sens, base, inc] of [["frais en base", fA, fB], ["frais en incoming", fB, fA]]) {
    for (const [impl, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
      const out = fn(base, inc);
      const racine = c.dans === "config" ? out.config : out.gameStates[0];
      const rendu = {}; for (const k of champs) rendu[k] = racine[k];
      const trie = (v) => (c.ordreSansImportance
        ? norm(JSON.parse(JSON.stringify(v), (k, x) => (Array.isArray(x) ? [...x].sort() : x))) : v);
      if (c.ordreSansImportance && !same(rendu, c.attendu)) ordreDifferent++;
      if (!same(trie(rendu), trie(c.attendu)))
        fail(`${impl} (${sens}) — « ${c.dans}.${c.cle} » et ce qu'elle arbitre : la fusion rend `
           + `${JSON.stringify(rendu)} au lieu de ${JSON.stringify(c.attendu)}. Une clé datée et son `
           + `contenu forment UNE règle : si le résultat change avec l'ordre des arguments, c'est `
           + `l'APPELANT qui tranche (le client met son local en \`a\`, le serveur son stocké), donc `
           + `les deux copies gardent chacune la sienne et l'écart ne se referme jamais. Corrige dans `
           + `src/merge.js ET server-merge.cjs. Raison fichée : ${c.pourquoi}`);
    }
  }
  if (c.ordreSansImportance && ordreDifferent === 0)
    fail(`CLES_RACINE — fiche « ${c.cle} » déclare \`ordreSansImportance\` alors que la fusion rend `
       + `déjà le même tableau dans les quatre mesures. La tolérance ne sert à rien : retire-la, `
       + `sinon elle couvrira un jour un désordre que personne n'a accepté.`);
}

// ── 15e ÉTAGE : les chemins qu'AUCUNE fixture ne contredit ──────────────────
// v2.16.91 — piste laissée par la v2.16.90, mot pour mot : « le 14e étage recense par la FORME
// d'une valeur (une chaîne qui commence par YYYY-MM-DD), donc un seau daté dont la fixture ne
// porte PAS de date lui reste invisible. `mergeGS` et `mergeFamily` rendent pourtant un littéral
// dont TOUTES les clés sont connues du code : croiser les clés de la SORTIE avec celles que les
// fixtures alimentent vraiment dirait quels champs traversent tous les étages sans qu'aucune
// fixture ne les contredise. »
//
// C'est la généralisation de `memeValeur`, qui ne pose la question qu'au PREMIER niveau des trois
// racines (`config`, `gameStates`, `players[0]`). Tout ce qui vit plus bas y échappait : un champ
// identique des deux côtés est écarté en silence par CHAQUE étage au-dessus (« rien à départager »),
// donc il paraît surveillé par quatorze contrôles et ne l'est par aucun.
//
// Le recensement ne demande rien à la prod et rien aux fiches : il parcourt la SORTIE de
// `mergeFamily(famA, famB)`, relit les DEUX fixtures au même chemin, et retient tout chemin où
// elles disent la même chose. Chaque chemin retenu doit se classer, et la complétude joue dans les
// DEUX SENS (un chemin non classé crie ; une fiche que le parcours ne trouve plus crie aussi).
//
// Cinq classements, et chacun MORD :
//   • `rapprochement` — clé de jointure d'une liste : elle DOIT être identique, sinon les deux
//     éléments ne se rencontrent jamais. La fiche nomme la liste, qui doit être au registre LISTES
//     avec cette `cle`.
//   • `arbitrage`     — clé datée d'un seau : le 13e étage la met délibérément à ÉGALITÉ (« le cas
//     qui dure 7 jours sur 7 ») en promettant que le cas où elle DIFFÈRE est « déjà couvert
//     ailleurs ». Il ne l'était nulle part. Il est MESURÉ ici.
//   • `figeALaCreation` — le chemin vit dans un élément de liste que le registre déclare jamais
//     réécrit (`modifieEnPlace !== true`) : identique par construction. La fiche nomme la liste, et
//     le jour où quelqu'un passe cette liste en `modifieEnPlace: true`, la fiche cesse d'être vraie
//     et l'étage crie.
//   • `mesureAilleurs` — une table dédiée bâtit ses PROPRES fixtures contradictoires pour ce
//     chemin. La table doit exister et porter le champ (une fiche qui pointe dans le vide est un faux).
//   • `support`       — échafaudage de la fixture elle-même. Le champ de PREMIER niveau doit être
//     nommé dans la table d'exemption de `memeValeur` qui correspond à sa racine.
//
// Ce que la mesure a trouvé le soir de sa naissance : `config.weeklyChallenge` arbitrait sa
// `weekKey` (la semaine la plus récente gagne) puis unionnait ses `challenges` SANS JAMAIS
// comparer les deux semaines. Sur les dix seaux datés de la fusion, c'était le seul — les neuf
// autres rendent le côté frais SEUL dès que leur clé diffère. Le défi personnel d'un enfant écrit
// la semaine passée était donc réétiqueté à la semaine en cours et s'y réinstallait à chaque
// synchro. Les deux écrivains d'`App.jsx` portaient le même trou et sont corrigés avec la règle.
const SANS_CONTRADICTION = [
  // ── clés de jointure ────────────────────────────────────────────────────
  { chemin: "config.assignments[].instanceId", rapprochement: { liste: "assignments", cle: "instanceId" } },
  { chemin: "config.customTasks[].id",         rapprochement: { liste: "customTasks", cle: "id" } },
  { chemin: "config.feed[].id",                rapprochement: { liste: "feed", cle: "id" } },
  { chemin: "config.players[].id",             rapprochement: { liste: "players", cle: "id" } },
  { chemin: "config.weeklyChallenge.challenges[].playerId", rapprochement: { liste: "challenges", cle: "playerId" } },
  { chemin: "gameStates.calendar[].id",        rapprochement: { liste: "calendar", cle: "id" } },
  { chemin: "gameStates.routines[].id",        rapprochement: { liste: "routines", cle: "id" } },

  // ── clés datées : délibérément égales (13e étage) ; le cas où elles DIFFÈRENT
  //    est mesuré juste en dessous, sur le recensement COMPLET du 14e étage ───
  { chemin: "config.boss.startedAt",            arbitrage: "config.boss" },
  { chemin: "gameStates.bossBattle.bossId",     arbitrage: "gameStates.bossBattle" },
  { chemin: "gameStates.dailyClaimed.day",      arbitrage: "gameStates.dailyClaimed" },
  { chemin: "gameStates.petDay.day",            arbitrage: "gameStates.petDay" },
  { chemin: "gameStates.ritualCelebrated.day",  arbitrage: "gameStates.ritualCelebrated" },
  { chemin: "gameStates.sessionMinutes.day",    arbitrage: "gameStates.sessionMinutes" },

  // ── figés à la création : le registre dit qu'aucun écran ne les réécrit ──
  { chemin: "config.assignments[].days[]",   figeALaCreation: "assignments" },
  { chemin: "config.assignments[].taskId",   figeALaCreation: "assignments" },
  { chemin: "config.customTasks[].label",    figeALaCreation: "customTasks" },
  { chemin: "config.feed[].ts",              figeALaCreation: "feed" },
  { chemin: "config.removalRequests[].instanceId", figeALaCreation: "removalRequests" },

  // ── mesurés par une table dédiée, avec SES fixtures ─────────────────────
  { chemin: "config.announcements[].sharedTasks[]",     mesureAilleurs: "SOUS_LISTES", liste: "announcements", champ: "sharedTasks" },
  { chemin: "config.announcements[].targetPlayerIds[]", mesureAilleurs: "SOUS_LISTES", liste: "announcements", champ: "targetPlayerIds" },
  { chemin: "config.assignments[].playerIds[]",         mesureAilleurs: "SOUS_LISTES", liste: "assignments", champ: "playerIds" },

  // ── échafaudage : le champ de premier niveau est exempté par `memeValeur` ──
  { chemin: "config.mode",       support: "EXEMPT_CFG" },
  { chemin: "config.pin",        support: "EXEMPT_CFG" },
  { chemin: "config.routineEnd", support: "EXEMPT_CFG" },
  { chemin: "gameStates.noCoinsResetV1",   support: "EXEMPT_GS" },
  { chemin: "gameStates.petMigV2",         support: "EXEMPT_GS" },
  { chemin: "gameStates.rotativeCleanupV1", support: "EXEMPT_GS" },
  { chemin: "gameStates.resetAt",          support: "EXEMPT_GS" },
  { chemin: "config.weeklyQuests.assignments[].playerIds[]", support: "EXEMPT_PL", via: "id",
    pourquoi: "ne porte pas un contenu, mais une RÉFÉRENCE à `players[].id` — la clé de rapprochement "
      + "de `mergeFamily`, que `EXEMPT_PL` tient identique par nécessité. La contredire ferait pointer "
      + "les deux assignations sur des enfants différents, et il n'y aurait plus rien à départager." },
  { chemin: "config.weeklyQuests.assignments[].taskId", support: "EXEMPT_CFG", via: "customTasks",
    pourquoi: "pointe la tâche structurelle `tk1`, exemptée à la racine (même raison)." },
  { chemin: "config.updateFeedEntries[].type", figeALaCreation: "updateFeedEntries" },
];

console.log("· chemins que les fixtures ne contredisent JAMAIS — recensement par la SORTIE");
{
  const cheminsDe = (v, chemin, acc) => {
    if (Array.isArray(v)) { for (const el of v) cheminsDe(el, chemin + "[]", acc); return acc; }
    if (v && typeof v === "object" && Object.keys(v).length) {
      for (const k of Object.keys(v)) cheminsDe(v[k], chemin + "." + k, acc);
      return acc;
    }
    if (!acc.has(chemin)) acc.set(chemin, []);
    acc.get(chemin).push(v);
    return acc;
  };
  const releve = (fam) => {
    const acc = new Map();
    cheminsDe(fam.config, "config", acc);
    for (const gs of fam.gameStates) cheminsDe(gs, "gameStates", acc);
    return acc;
  };
  const tri = (l) => (l || []).map((x) => JSON.stringify(norm(x))).sort();
  const sortie = releve(client.mergeFamily(famA, famB)), A = releve(famA), B = releve(famB);
  const inertes = new Set();
  for (const chemin of sortie.keys())
    if (same(tri(A.get(chemin)), tri(B.get(chemin)))) inertes.add(chemin);

  const fiches = new Map(SANS_CONTRADICTION.map((f) => [f.chemin, f]));
  for (const chemin of [...inertes].sort())
    if (!fiches.has(chemin))
      fail(`« ${chemin} » porte la MÊME valeur dans les deux fixtures : les quatorze étages `
         + `au-dessus l'écartent tous en silence (« rien à départager »). Il paraît surveillé et ne `
         + `l'est par personne. Donne-lui deux valeurs contradictoires, ou classe-le au 15e étage : `
         + `\`rapprochement\` (clé de jointure), \`arbitrage\` (clé datée, MESURÉE ici quand elle `
         + `diffère), \`figeALaCreation\` (élément jamais réécrit), \`mesureAilleurs\` (une table `
         + `dédiée le contredit), ou \`support\` (échafaudage exempté par \`memeValeur\`).`);
  for (const f of SANS_CONTRADICTION)
    if (!inertes.has(f.chemin))
      fail(`15e étage — fiche « ${f.chemin} », que les fixtures contredisent maintenant (ou que la `
         + `sortie ne porte plus). Fiche périmée : retire-la, sinon elle couvrira un jour un chemin `
         + `homonyme sans que personne l'ait relu.`);
  console.log(`    (${sortie.size} chemins dans la sortie, ${inertes.size} sans contradiction, tous classés)`);

  // Les fiches qui POINTENT quelque part doivent pointer sur du réel.
  const TABLES = { SOUS_LISTES, EXEMPT_CFG, EXEMPT_GS, EXEMPT_PL };
  for (const f of SANS_CONTRADICTION) {
    if (f.rapprochement) {
      const { liste, cle } = f.rapprochement;
      if (liste === "players") continue; // fusionnée par `_mergePlayer`, pas par le registre LISTES
      if (!LISTES.some((l) => l.champ === liste && l.cle === cle))
        fail(`15e étage — « ${f.chemin} » se dit clé de jointure de « ${liste} » (cle « ${cle} »), et `
           + `le registre LISTES ne porte pas ce couple. La fiche pointe dans le vide : soit la liste `
           + `s'y inscrit, soit la clé n'en est pas une et le champ doit se contredire.`);
      continue;
    }
    if (f.figeALaCreation) {
      const l = LISTES.find((x) => x.champ === f.figeALaCreation && !x.conteneur);
      if (!l) { fail(`15e étage — « ${f.chemin} » renvoie à la liste « ${f.figeALaCreation} », absente `
         + `du registre LISTES.`); continue; }
      if (l.modifieEnPlace === true)
        fail(`15e étage — « ${f.chemin} » se dit figé à la création, et LISTES déclare « `
           + `${f.figeALaCreation} » RÉÉCRITE EN PLACE (\`modifieEnPlace: true\`). Un champ qu'un écran `
           + `réécrit doit être arbitré, donc contredit par les fixtures : la fiche est devenue fausse.`);
      continue;
    }
    if (f.mesureAilleurs === "SECTION") {
      if (!f.pourquoi) fail(`15e étage — « ${f.chemin} » renvoie à une section dédiée sans dire laquelle.`);
      continue;
    }
    if (f.mesureAilleurs) {
      const t = TABLES[f.mesureAilleurs];
      if (!t) { fail(`15e étage — « ${f.chemin} » renvoie à « ${f.mesureAilleurs} », qui n'existe pas.`); continue; }
      if (!t.some((x) => x.liste === f.liste && x.champ === f.champ))
        fail(`15e étage — « ${f.chemin} » dit que « ${f.mesureAilleurs} » contredit « ${f.liste}[].`
           + `${f.champ} », et cette table ne porte pas le couple. La fiche pointe dans le vide.`);
      continue;
    }
    if (f.support) {
      const t = TABLES[f.support];
      if (!t) { fail(`15e étage — « ${f.chemin} » renvoie à « ${f.support} », qui n'existe pas.`); continue; }
      const premier = f.via || f.chemin.split(".")[1].replace(/\[\]$/, "");
      if (!(premier in t))
        fail(`15e étage — « ${f.chemin} » se dit échafaudage exempté par « ${f.support} », et cette `
           + `table n'exempte pas « ${premier} ». La fiche pointe dans le vide : soit l'exemption `
           + `existe là-bas et se justifie, soit le champ doit se contredire.`);
      continue;
    }
    if (!f.arbitrage) fail(`15e étage — fiche « ${f.chemin} » sans classement.`);
  }
}

// La promesse du 13e étage (« mets la clé à ÉGALITÉ, le cas où elle diffère est déjà couvert
// ailleurs ») devient un CHIFFRE. Elle n'était couverte NULLE PART, et c'est là que vivait le bug
// de la v2.16.91. Le recensement n'est pas écrit à la main : il est pris sur les seaux datés du
// 14e étage (`fiche: true`), donc un seau neuf entre ici le jour où il entre là-bas.
const CLE_DIFFERENTE = [
  { chemin: "config.boss", dans: "config", champ: "boss", cle: "startedAt",
    frais:  { startedAt: "2026-08-14T00:00:00.000Z", hp: 100, hpMax: 100 },
    perime: { startedAt: "2026-08-07T00:00:00.000Z", hp: 3, hpMax: 300, defeatedAt: "2026-08-08T00:00:00.000Z" },
    pourquoi: "un boss neuf ne doit rien hériter du précédent : les PV et le `defeatedAt` de l'ancien "
      + "l'afficheraient déjà entamé, ou déjà vaincu, le jour de son lancement." },
  { chemin: "config.weeklyQuests", dans: "config", champ: "weeklyQuests", cle: "generatedForWeek",
    frais:  { generatedForWeek: "2026-08-14", assignments: [{ instanceId: "wq1", taskId: "tk1", playerIds: ["p1"], days: [0] }] },
    perime: { generatedForWeek: "2026-08-07", assignments: [{ instanceId: "wq9", taskId: "tk1", playerIds: ["p1"], days: [3] }] },
    pourquoi: "les rotatives d'une semaine de garde révolue reviendraient dans la semaine en cours." },
  { chemin: "config.weeklyChallenge", dans: "config", champ: "weeklyChallenge", cle: "weekKey",
    frais:  { weekKey: "2026-08-14", challenges: [{ playerId: "p1", text: "Frais", emoji: "📖", checkins: {} }] },
    perime: { weekKey: "2026-08-07", challenges: [{ playerId: "p1", text: "Périmé", emoji: "🛏️", checkins: {} },
                                                  { playerId: "p2", text: "Périmé p2", emoji: "🍽️", checkins: {} }] },
    pourquoi: "le seul des dix seaux qui unionnait son contenu sans regarder sa clé (v2.16.91) : le défi "
      + "perso d'un enfant écrit la semaine passée était réétiqueté à la semaine en cours et s'y "
      + "réinstallait à chaque synchro, pour chaque enfant que le parent n'avait pas encore reservi. "
      + "Aucun paiement en jeu — les paliers se comptent par semaine (`challengeDaysCount`) — mais "
      + "l'enfant et le parent voyaient un défi que personne n'avait choisi pour cette semaine-là." },
  { chemin: "gameStates.bossBattle", dans: "gameStates", champ: "bossBattle", cle: "bossId",
    frais:  { bossId: "2026-08-14T00:00:00.000Z", earned: 0, spent: 0, dmg: 0 },
    perime: { bossId: "2026-08-07T00:00:00.000Z", earned: 9, spent: 9, dmg: 99 },
    pourquoi: "jetons et dégâts sont comptés PAR boss : les reporter donnerait des jetons jamais gagnés." },
  { chemin: "gameStates.challengeTiers", dans: "gameStates", champ: "challengeTiers", cle: "week",
    frais:  { week: "2026-08-14", tiers: [] }, perime: { week: "2026-08-07", tiers: [3, 5, 7] },
    pourquoi: "les paliers payés la semaine passée passeraient pour payés cette semaine, et les "
      + "nouveaux ne le seraient jamais (`claimed.includes`, App.jsx ~2547)." },
  { chemin: "gameStates.coinsWeek", dans: "gameStates", champ: "coinsWeek", cle: "week",
    frais:  { week: "2026-08-14", coins: 0 }, perime: { week: "2026-08-07", coins: 99 },
    pourquoi: "bug v2.5.3, mot pour mot : un vieil appareil qui resynchronise avec la semaine passée "
      + "déclenchait la remise à zéro hebdomadaire des pièces." },
  { chemin: "gameStates.dailyClaimed", dans: "gameStates", champ: "dailyClaimed", cle: "day",
    frais:  { day: "2026-08-15", ids: [] }, perime: { day: "2026-08-14", ids: ["o3", "o6"] },
    pourquoi: "les coffres réclamés hier bloqueraient ceux d'aujourd'hui (`.includes()`, App.jsx:1311)." },
  { chemin: "gameStates.petDay", dans: "gameStates", champ: "petDay", cle: "day",
    frais:  { day: "2026-08-15", xp: 0 }, perime: { day: "2026-08-14", xp: 99 },
    pourquoi: "le plafond quotidien du familier repartirait déjà atteint." },
  { chemin: "gameStates.ritualCelebrated", dans: "gameStates", champ: "ritualCelebrated", cle: "day",
    frais:  { day: "2026-08-15", ids: [] }, perime: { day: "2026-08-14", ids: ["rt1"] },
    pourquoi: "un rituel fêté hier serait tenu pour déjà fêté aujourd'hui." },
  { chemin: "gameStates.sessionMinutes", dans: "gameStates", champ: "sessionMinutes", cle: "day",
    frais:  { day: "2026-08-15", minutes: 0 }, perime: { day: "2026-08-14", minutes: 200 },
    pourquoi: "le budget-temps quotidien du parent (`dailyMinutesLimit`) repartirait déjà épuisé." },
];

console.log("· seaux datés — complétude : tout seau du 14e étage doit être mesuré clé DIFFÉRENTE");
{
  const mesures = new Map(CLE_DIFFERENTE.map((c) => [c.chemin, c]));
  for (const s of SEAUX_DATES) {
    if (!s.fiche) continue;
    if (!mesures.has(s.chemin))
      fail(`« ${s.chemin} » est un seau daté recensé au 14e étage, et RIEN ne dit ce qu'il rend quand `
         + `sa clé DIFFÈRE. Le 13e étage met délibérément la clé à ÉGALITÉ et renvoie l'autre cas à `
         + `« déjà couvert ailleurs » — ailleurs, c'est ici. Ajoute sa fiche à CLE_DIFFERENTE.`);
  }
  for (const c of CLE_DIFFERENTE)
    if (!SEAUX_DATES.some((s) => s.fiche && s.chemin === c.chemin))
      fail(`15e étage — fiche « ${c.chemin} », que le 14e étage ne recense plus comme seau daté. `
         + `Fiche périmée : retire-la.`);
  // Le classement `arbitrage` du recensement ci-dessus ne vaut que s'il pointe ici.
  for (const f of SANS_CONTRADICTION)
    if (f.arbitrage && !mesures.has(f.arbitrage))
      fail(`15e étage — « ${f.chemin} » se dit clé d'arbitrage de « ${f.arbitrage} », et CLE_DIFFERENTE `
         + `ne mesure pas ce seau. La fiche pointe dans le vide.`);
}

console.log("· seaux datés — clé DIFFÉRENTE : le côté frais est rendu SEUL, dans les deux sens");
for (const c of CLE_DIFFERENTE) {
  if (same(c.frais[c.cle], c.perime[c.cle]))
    { fail(`15e étage — fiche « ${c.chemin} » : la clé « ${c.cle} » est ÉGALE des deux côtés. C'est le `
         + `cas que le 13e étage mesure déjà ; celui-ci n'existe que pour l'autre.`); continue; }
  const gsF = c.dans === "gameStates" ? { ...gsA, [c.champ]: c.frais } : gsA;
  const gsP = c.dans === "gameStates" ? { ...gsB, [c.champ]: c.perime } : gsB;
  const cfgF = c.dans === "config" ? { ...famA.config, [c.champ]: c.frais } : famA.config;
  const cfgP = c.dans === "config" ? { ...famB.config, [c.champ]: c.perime } : famB.config;
  const fA = mkFam("2026-08-15T12:00:00.000Z", gsF, cfgF, plA);
  const fB = mkFam("2026-08-14T12:00:00.000Z", gsP, cfgP, plB);
  for (const [sens, base, inc] of [["frais en base", fA, fB], ["frais en incoming", fB, fA]]) {
    for (const [impl, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
      const out = fn(base, inc);
      const rendu = c.dans === "config" ? out.config[c.champ] : out.gameStates[0][c.champ];
      if (!same(rendu, c.frais))
        fail(`${impl} (${sens}) — « ${c.chemin} » : les deux copies sont sur des « ${c.cle} » `
           + `DIFFÉRENTS, et la fusion rend ${JSON.stringify(rendu)} au lieu du côté frais SEUL `
           + `(${JSON.stringify(c.frais)}). Un seau daté repart VIDE quand sa clé change : combiner `
           + `les deux, c'est réétiqueter du contenu périmé à la clé courante — et il s'y réinstalle à `
           + `chaque synchro, puisque chaque fusion le recopie. Corrige dans src/merge.js ET `
           + `server-merge.cjs. Raison fichée : ${c.pourquoi}`);
    }
  }
}

// ── 16e ÉTAGE : les chemins que l'ENTRÉE porte et que la SORTIE jette ───────
// v2.16.92 — piste laissée par la v2.16.91, mot pour mot : « le recensement du 15e étage est pris
// sur UNE SEULE fusion, `mergeFamily(famA, famB)`. Or tout le reste du fichier mesure en QUATRE
// points (deux sens × deux copies) précisément parce que le résultat dépend de l'ordre des
// arguments et de `preferIncoming` — un chemin que seule la sortie de `mergeFamily(famB, famA)`
// porte n'est donc recensé par personne. »
//
// Mesuré, et la réponse est NON : les deux sens rendent exactement le même jeu de chemins (le
// contrôle juste en dessous le grave, pour que ça cesse d'être vrai bruyamment le jour où ça
// cesse d'être vrai). Mais la question a ouvert la bonne porte d'à côté : les quinze étages
// recensent tous la SORTIE. Un chemin que les fixtures portent et que la fusion ne rend PAS n'est
// vu par aucun d'eux — ni par le 15e (il ne parcourt que la sortie), ni par le relevé de prod (il
// compare des formes, pas une survie), ni par les contrôles de retrait (ils demandent qu'un
// retrait tienne, jamais qu'une donnée non retirée survive).
//
// Ce que la mesure a trouvé le soir de sa naissance : TROIS chemins jetés, dont deux délibérés et
// fichés ci-dessous — et `gameStates.rewardBuyTs.<id>`, qui ne l'était pas. L'estampille d'achat
// voyageait EN BLOC avec `boughtRewards`, alors que les deux champs que `_disowned` croise avec
// elle (`owned`, `refundedRewards`) sont des unions increvables : le côté qui perdait l'arbitrage
// emportait sa marque, `_disowned` retombait sur sa branche legacy (« sans estampille, tout
// tombstone portant cet id compte »), et la récompense RACHETÉE après un remboursement était
// re-tombstonée par le vieil achat puis retirée d'`owned`. Le garde-fou contournait déjà le
// défaut en toutes lettres, à la fiche `owned` de `CHAINES` : « la marque doit être posée du côté
// FRAIS, sinon la clé `id#estampille` ne se reconstitue pas et le contrôle ment ».
//
// Deux classements, et chacun MORD :
//   • `enBloc` — le champ NOMMÉ est arbitré dernière-écriture-gagne sur l'objet entier, donc ce qui
//     vit dessous ne survit que du côté gagnant. La fiche nomme ce champ, qui doit vraiment être
//     l'ancêtre du chemin jeté.
//   • `seauDate` — le chemin vit sous un seau daté dont la clé DIFFÈRE entre les deux fixtures :
//     le côté frais est rendu SEUL (13e/14e étages). La fiche nomme le seau, qui doit être au
//     registre `CLE_DIFFERENTE` — le jour où quelqu'un l'en retire, la fiche cesse d'être vraie.
const JETES_PAR_LA_FUSION = [
  { chemin: "gameStates.house.placed.lamp", enBloc: "house",
    pourquoi: "« Ma maison » est arbitrée dernière-écriture-gagne sur l'objet ENTIER (v2.16.72) : "
      + "surtout pas d'union par slot, sinon retirer un meuble le ressusciterait." },
  { chemin: "config.weeklyChallenge.challenges[].checkins.2026-08-07", seauDate: "config.weeklyChallenge",
    pourquoi: "les deux copies parlent de SEMAINES différentes (v2.16.91) : un seau daté repart VIDE "
      + "quand sa clé change. Ce qui part est le contenu d'une semaine révolue, jamais un paiement — "
      + "les paliers se comptent par semaine (`challengeDaysCount`)." },
];

console.log("· recensement du 15e étage — le même dans les DEUX sens, et dans les deux copies");
{
  const cheminsDe = (v, chemin, acc) => {
    if (Array.isArray(v)) { for (const el of v) cheminsDe(el, chemin + "[]", acc); return acc; }
    if (v && typeof v === "object" && Object.keys(v).length) {
      for (const k of Object.keys(v)) cheminsDe(v[k], chemin + "." + k, acc);
      return acc;
    }
    if (!acc.has(chemin)) acc.set(chemin, []);
    acc.get(chemin).push(v);
    return acc;
  };
  const releve = (fam) => {
    const acc = new Map();
    cheminsDe(fam.config, "config", acc);
    for (const gs of fam.gameStates) cheminsDe(gs, "gameStates", acc);
    return acc;
  };
  const jeux = [["client AB", client.mergeFamily(famA, famB)], ["client BA", client.mergeFamily(famB, famA)],
                ["serveur AB", server.mergeFamily(famA, famB)], ["serveur BA", server.mergeFamily(famB, famA)]];
  const [nomRef, outRef] = jeux[0];
  const ref = new Set(releve(outRef).keys());
  for (const [nom, out] of jeux.slice(1)) {
    const ici = new Set(releve(out).keys());
    const manquants = [...ref].filter((c) => !ici.has(c)), enPlus = [...ici].filter((c) => !ref.has(c));
    if (manquants.length || enPlus.length)
      fail(`le recensement de la SORTIE dépend du point de mesure : « ${nomRef} » et « ${nom} » ne `
         + `rendent pas les mêmes chemins (absents ici : ${manquants.join(", ") || "aucun"} ; en plus `
         + `ici : ${enPlus.join(", ") || "aucun"}). Le 15e étage ne mesure QU'UN point : tout chemin `
         + `qu'un seul des quatre porte échappe à son classement. Fais-le recenser sur les quatre, `
         + `ou explique pourquoi ce chemin n'existe que d'un côté.`);
  }
  console.log(`    (${ref.size} chemins, identiques aux quatre points de mesure)`);
}

console.log("· chemins d'ENTRÉE que la fusion jette — complétude, aux quatre points de mesure");
{
  const cheminsDe = (v, chemin, acc) => {
    if (Array.isArray(v)) { for (const el of v) cheminsDe(el, chemin + "[]", acc); return acc; }
    if (v && typeof v === "object" && Object.keys(v).length) {
      for (const k of Object.keys(v)) cheminsDe(v[k], chemin + "." + k, acc);
      return acc;
    }
    if (!acc.has(chemin)) acc.set(chemin, []);
    acc.get(chemin).push(v);
    return acc;
  };
  const releve = (fam) => {
    const acc = new Map();
    cheminsDe(fam.config, "config", acc);
    for (const gs of fam.gameStates) cheminsDe(gs, "gameStates", acc);
    return acc;
  };
  const entree = new Set([...releve(famA).keys(), ...releve(famB).keys()]);
  const fiches = new Map(JETES_PAR_LA_FUSION.map((f) => [f.chemin, f]));
  const jetesPartout = new Set();
  for (const [nom, out] of [["client AB", client.mergeFamily(famA, famB)], ["client BA", client.mergeFamily(famB, famA)],
                            ["serveur AB", server.mergeFamily(famA, famB)], ["serveur BA", server.mergeFamily(famB, famA)]]) {
    const sortie = releve(out);
    for (const chemin of entree) {
      if (sortie.has(chemin)) continue;
      jetesPartout.add(chemin);
      if (fiches.has(chemin)) continue;
      fail(`${nom} — « ${chemin} » est porté par une fixture et la fusion ne le rend PAS. Les quinze `
         + `étages au-dessus recensent tous la SORTIE : un chemin jeté n'est vu par aucun d'eux, et `
         + `les contrôles de retrait demandent qu'un retrait TIENNE, jamais qu'une donnée non retirée `
         + `SURVIVE. Si l'abandon est voulu, classe-le au 16e étage (\`enBloc\` : le champ nommé est `
         + `arbitré en entier ; \`seauDate\` : sa clé diffère, le côté frais est rendu seul). Sinon, `
         + `c'est une donnée d'enfant qui disparaît à la synchro — corrige dans src/merge.js ET `
         + `server-merge.cjs.`);
    }
  }
  for (const f of JETES_PAR_LA_FUSION)
    if (!jetesPartout.has(f.chemin))
      fail(`16e étage — fiche « ${f.chemin} », que la fusion ne jette plus (ou que les fixtures ne `
         + `portent plus). Fiche périmée : retire-la, sinon elle couvrira un jour un abandon `
         + `homonyme sans que personne l'ait relu.`);
  console.log(`    (${entree.size} chemins d'entrée, ${jetesPartout.size} jetés, tous classés)`);

  // Les fiches doivent pointer sur du réel : l'ancêtre `enBloc` doit être un ancêtre, et le seau
  // daté doit toujours être au registre du 14e étage.
  for (const f of JETES_PAR_LA_FUSION) {
    if (f.enBloc) {
      const racine = f.chemin.split(".").slice(0, 2).join(".").replace(/\[\]$/, "");
      const attendu = racine.split(".")[1];
      if (attendu !== f.enBloc)
        fail(`16e étage — « ${f.chemin} » se dit arbitré en bloc par « ${f.enBloc} », qui n'est pas `
           + `son champ de premier niveau (« ${attendu} »).`);
      continue;
    }
    if (f.seauDate) {
      if (!CLE_DIFFERENTE.some((c) => c.chemin === f.seauDate))
        fail(`16e étage — « ${f.chemin} » se dit sous le seau daté « ${f.seauDate} », que CLE_DIFFERENTE `
           + `ne porte pas. Sans cette fiche-là, rien ne mesure que le côté frais est rendu SEUL, et `
           + `l'abandon fiché ici n'a plus de raison.`);
      continue;
    }
    fail(`16e étage — fiche « ${f.chemin} » sans classement (\`enBloc\` ou \`seauDate\`).`);
  }
  for (const f of JETES_PAR_LA_FUSION)
    if (!f.pourquoi) fail(`16e étage — fiche « ${f.chemin} » sans raison écrite.`);
}

// ── 17e ÉTAGE : les valeurs que la fusion INVENTE au lieu d'en choisir une ───
// v2.16.93 — piste laissée par la v2.16.92, mot pour mot : « le 16e étage compare l'ENTRÉE à la
// SORTIE par le CHEMIN — il dit qu'un chemin survit, jamais que sa VALEUR est celle d'un des deux
// côtés. Une règle qui rendrait un chemin présent mais avec une valeur qu'aucune des deux fixtures
// ne porte (un défaut, un `0`, une chaîne vide reconstruite) passe donc les seize étages en
// silence. Croiser, pour chaque chemin de la sortie, la valeur rendue avec l'ensemble {valeur de A,
// valeur de B} dirait quels champs la fusion INVENTE plutôt que d'arbitrer. »
//
// C'est fait, et la réponse d'aujourd'hui est ZÉRO : aux quatre points de mesure, chaque valeur
// rendue vient de l'une des deux copies. Un résultat, pas un abandon — il est gravé pour qu'il
// cesse d'être vrai bruyamment le jour où il cesse d'être vrai.
//
// Une invention n'est pas une faute en soi (un défaut de migration en est une, et `deCompleted`
// en était une jusqu'à ce que les fixtures le portent) : c'est une valeur que PERSONNE n'a écrite,
// donc que ni le relevé de prod ni les seize étages ne peuvent rattacher à un geste. Toute
// invention doit donc être FICHÉE, avec la raison qui la rend voulue.
//
// Ce que cet étage ajoute aux seize autres : ils mesurent tous QUEL CÔTÉ gagne, en supposant que
// le résultat vient forcément d'un côté. Celui-ci mesure cette supposition-là.
//
// Les éléments de liste sont repérés par leur clé de jointure (`[id=f1]`), pas par leur rang :
// sans ça, une valeur recalculée dans un élément serait blanchie par un élément VOISIN qui porte
// la même valeur — le même blanchiment que celui que la v2.16.93 vient de retirer au contrôle
// « fixtures vs schéma de prod », une couche plus bas.
const VALEURS_RECALCULEES = [
  // { chemin: "…", pourquoi: "…" } — vide aujourd'hui, et le compte imprimé le dit.
];

const _clesJointure = ["id", "instanceId", "playerId", "version"];
const _cheminsValues = (v, chemin, acc) => {
  if (Array.isArray(v)) {
    for (const el of v) {
      let cle = null;
      if (el && typeof el === "object" && !Array.isArray(el))
        for (const k of _clesJointure) if (el[k] != null) { cle = `${k}=${el[k]}`; break; }
      _cheminsValues(el, chemin + (cle ? `[${cle}]` : "[]"), acc);
    }
    return acc;
  }
  if (v && typeof v === "object" && Object.keys(v).length) {
    for (const k of Object.keys(v)) _cheminsValues(v[k], chemin + "." + k, acc);
    return acc;
  }
  if (!acc.has(chemin)) acc.set(chemin, new Set());
  acc.get(chemin).add(JSON.stringify(v));
  return acc;
};
const _valeursDe = (fam) => {
  const acc = new Map();
  _cheminsValues(fam.config, "config", acc);
  for (const gs of fam.gameStates || []) _cheminsValues(gs, "gameStates", acc);
  return acc;
};
// Rend la liste des chemins dont la valeur rendue n'est portée par AUCUNE des deux entrées.
const _inventions = (fa, fb, sortie) => {
  const va = _valeursDe(fa), vb = _valeursDe(fb), out = [];
  for (const [chemin, vals] of _valeursDe(sortie)) {
    const admis = new Set([...(va.get(chemin) || []), ...(vb.get(chemin) || [])]);
    const inventees = [...vals].filter((v) => !admis.has(v));
    if (inventees.length) out.push({ chemin, inventees, admis: [...admis] });
  }
  return out;
};

console.log("· valeurs INVENTÉES par la fusion — aux quatre points de mesure");
{
  // TÉMOIN d'abord : un détecteur qui ne trouve rien n'apprend rien tant qu'on n'a pas vu qu'il
  // SAIT trouver. On lui donne une fusion truquée qui recalcule un champ (`pin`, que ni A ni B ne
  // porte à cette valeur) et une autre qui fabrique un défaut sous un chemin neuf. Les deux doivent
  // ressortir, et RIEN d'autre — sinon le détecteur crie au loup et son zéro ne vaut rien.
  // On mesure le DELTA que le trucage ajoute, jamais un jeu absolu : le jour où une invention
  // légitime sera fichée, le témoin doit continuer à ne parler que du trucage.
  const vraie = client.mergeFamily(famA, famB);
  const avant = new Set(_inventions(famA, famB, vraie).map((x) => x.chemin));
  const temoin = { ...vraie, config: { ...vraie.config, pin: "0000", theme: "" } };
  const apres = _inventions(famA, famB, temoin).map((x) => x.chemin);
  const delta = apres.filter((c) => !avant.has(c)).sort();
  if (JSON.stringify(delta) !== JSON.stringify(["config.pin", "config.theme"]))
    fail(`17e étage — le TÉMOIN ne ressort pas comme prévu (delta : ${JSON.stringify(delta)}, `
       + `attendu ["config.pin","config.theme"]). Le détecteur d'inventions ne sait plus voir une `
       + `valeur fabriquée : son « zéro » sur la vraie fusion ne prouverait alors rien du tout.`);

  const fiches = new Map(VALEURS_RECALCULEES.map((f) => [f.chemin, f]));
  const vuesPartout = new Set();
  for (const [nom, fa, fb, out] of [
    ["client AB", famA, famB, client.mergeFamily(famA, famB)],
    ["client BA", famB, famA, client.mergeFamily(famB, famA)],
    ["serveur AB", famA, famB, server.mergeFamily(famA, famB)],
    ["serveur BA", famB, famA, server.mergeFamily(famB, famA)],
  ]) {
    for (const { chemin, inventees, admis } of _inventions(fa, fb, out)) {
      vuesPartout.add(chemin);
      if (fiches.has(chemin)) continue;
      fail(`${nom} — « ${chemin} » vaut ${inventees.join(" ")}, une valeur qu'AUCUNE des deux copies `
         + `ne porte (elles disent ${admis.join(" ") || "rien à ce chemin"}). Les seize étages `
         + `au-dessus mesurent QUEL CÔTÉ gagne : aucun ne voit une valeur que la fusion FABRIQUE. `
         + `C'est une donnée que personne n'a écrite — ni un geste d'enfant, ni un geste de parent. `
         + `Si c'est voulu (un défaut de migration, une borne), fiche-la dans VALEURS_RECALCULEES `
         + `avec sa raison. Sinon, c'est la fusion qui écrase les deux copies : corrige dans `
         + `src/merge.js ET server-merge.cjs.`);
    }
  }
  for (const f of VALEURS_RECALCULEES)
    if (!vuesPartout.has(f.chemin))
      fail(`17e étage — fiche « ${f.chemin} », que la fusion n'invente plus (ou que les fixtures `
         + `portent maintenant). Fiche périmée : retire-la, sinon elle couvrira un jour une `
         + `invention homonyme sans que personne l'ait relue.`);
  for (const f of VALEURS_RECALCULEES)
    if (!f.pourquoi) fail(`17e étage — fiche « ${f.chemin} » sans raison écrite.`);
  console.log(`    (${_valeursDe(client.mergeFamily(famA, famB)).size} chemins-valeurs, `
    + `${vuesPartout.size} inventés, ${VALEURS_RECALCULEES.length} fichés)`);
}

console.log("· estampille d'achat — une récompense RACHETÉE après remboursement doit survivre");
{
  // v2.16.92 — le cas exact rejoué sur la donnée de prod du 21 août : Antoine (« Le GOAT!!! ») a
  // `refundedRewards: ["rw_bonbon#…"]` et `rewardBuyTs: {}`. Il rachète `rw_bonbon` sur sa tablette,
  // une AUTRE tablette écrit dans la seconde qui suit (le `savedAt` est celui de la FAMILLE, pas du
  // joueur), et sa copie perd l'arbitrage. `owned` est une union et garde l'objet ; l'estampille
  // partait avec `boughtRewards`, et `_disowned` retombait alors sur sa branche legacy, où le
  // tombstone du VIEIL achat suffit à disqualifier le neuf.
  const VIEUX = 111, NEUF = 999;
  const gsRachat = { ...gsB, owned: ["rw_bonbon"], boughtRewards: ["rw_bonbon"],
                     rewardBuyTs: { rw_bonbon: NEUF }, refundedRewards: ["rw_bonbon#" + VIEUX] };
  const gsNuage  = { ...gsA, owned: [], boughtRewards: [], rewardBuyTs: {},
                     refundedRewards: ["rw_bonbon#" + VIEUX] };
  const fRachat = mkFam("2026-08-14T12:00:00.000Z", gsRachat, famB.config, plB); // PÉRIMÉ
  const fNuage  = mkFam("2026-08-15T12:00:00.000Z", gsNuage,  famA.config, plA); // FRAIS
  for (const [sens, base, inc] of [["rachat en base", fRachat, fNuage], ["rachat en incoming", fNuage, fRachat]]) {
    for (const [impl, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
      const gs = fn(base, inc).gameStates[0];
      if (!(gs.owned || []).includes("rw_bonbon"))
        fail(`${impl} (${sens}) — la récompense rachetée après remboursement a disparu d'\`owned\`. `
           + `L'estampille NEUVE (${NEUF}) n'est connue que du côté périmé : si \`rewardBuyTs\` part en `
           + `bloc, \`_disowned\` retombe sur sa branche legacy et le tombstone du vieil achat `
           + `(rw_bonbon#${VIEUX}) suffit à retirer l'objet que l'union venait de préserver. `
           + `\`rewardBuyTs\` doit s'unionner par id, plus grande estampille gagnante.`);
      if (gs.rewardBuyTs?.rw_bonbon !== NEUF)
        fail(`${impl} (${sens}) — \`rewardBuyTs.rw_bonbon\` vaut `
           + `${JSON.stringify(gs.rewardBuyTs?.rw_bonbon ?? null)} au lieu de l'estampille la plus `
           + `RÉCENTE (${NEUF}). Une estampille d'achat n'avance jamais à reculons.`);
    }
  }
  // Le sens inverse compte autant : une estampille PÉRIMÉE ne doit jamais gagner sur la neuve,
  // sinon la clé `id#estampille` retombe sur un tombstone déjà posé (crainte de la v2.16.62).
  const fVieuxFrais = mkFam("2026-08-15T12:00:00.000Z",
    { ...gsA, owned: ["rw_bonbon"], boughtRewards: ["rw_bonbon"], rewardBuyTs: { rw_bonbon: VIEUX }, refundedRewards: [] },
    famA.config, plA);
  const fNeufPerime = mkFam("2026-08-14T12:00:00.000Z",
    { ...gsB, owned: ["rw_bonbon"], boughtRewards: ["rw_bonbon"], rewardBuyTs: { rw_bonbon: NEUF }, refundedRewards: [] },
    famB.config, plB);
  for (const [sens, base, inc] of [["neuf en base", fNeufPerime, fVieuxFrais], ["neuf en incoming", fVieuxFrais, fNeufPerime]]) {
    for (const [impl, fn] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]]) {
      const v = fn(base, inc).gameStates[0].rewardBuyTs?.rw_bonbon;
      if (v !== NEUF)
        fail(`${impl} (${sens}) — l'estampille PÉRIMÉE (${VIEUX}) a gagné sur la neuve (${NEUF}) : `
           + `rendu ${JSON.stringify(v ?? null)}. Le max est la seule règle qui tienne dans les deux sens.`);
    }
  }
}

if (failures) {
  console.error(`\n✗ Couche de fusion : ${failures} problème(s).`);
  console.error("  Toute règle de fusion doit être écrite dans LES DEUX fichiers.\n");
  process.exit(1);
}
console.log("✓ Parité de fusion client/serveur vérifiée.");
