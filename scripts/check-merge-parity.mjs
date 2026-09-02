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

// v2.17.21 — `racineExtra` : la charge a un PREMIER NIVEAU, et les fixtures n'en portaient que
// `savedAt`/`gameStates`/`config`. La prod, elle, porte aussi une copie de racine de
// `seenVersions`, que les deux `mergeFamily` lisent (`base.seenVersions`, `incoming.seenVersions`)
// et réécrivent. Une fixture qui ne la porte pas rend cette moitié de l'union INERTE : les quatre
// sources se réduisent aux deux copies de `config`, et une règle écrite sur les deux autres
// pourrait disparaître sans qu'un seul étage bronche.
const mkFam = (savedAt, gs, cfgExtra, pl, racineExtra) => ({
  savedAt,
  ...racineExtra,
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
}, plA, { seenVersions: ["2.17.0"] });
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
}, plB, { seenVersions: ["2.16.99"] });

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
  // v2.17.21 — LE PREMIER NIVEAU DE LA CHARGE. Ces deux lignes partaient de `fam.config` et
  // `fam.gameStates`, et les quinze autres recensements de ce fichier font pareil : la RACINE de la
  // charge n'était lue par personne. Or les deux `mergeFamily` rendent `{...newer, config,
  // gameStates, seenVersions, savedAt}` — tout champ de racine que le gagnant traîne passe donc la
  // fusion sans règle écrite, sans fixture, et sans qu'aucun étage puisse le voir. `seenVersions`
  // en est l'exemple vivant : la prod en porte une copie de racine (2 792 octets), les DEUX copies
  // de la fusion la LISENT (`base.seenVersions`, `incoming.seenVersions`) et l'écrivent, et aucune
  // fixture ne l'avait. Même parcours que `releveRacine` de `scripts/releve-schema-prod.mjs` :
  // nature seule pour `config`/`gameStates`, qui sont relevés sous leur propre préfixe.
  for (const fam of [famA, famB]) {
    for (const [k, v] of Object.entries(fam)) pose(`charge.${k}`, natureDe(v));
    releve(fam.config, "config");
    for (const gs of fam.gameStates) releve(gs, "gameStates");
  }

  // v2.17.16 — L’ÂGE du relevé, pas seulement sa date. Cette ligne imprimait « relevé du 2026-08-21 »
  // cinq nuits d’affilée sans que personne n’en tire quoi que ce soit, pendant que la prod prenait
  // TROIS formes que le relevé ignorait (`config.feed[].likeTs`, `gameStates.catCounts.*`,
  // `gameStates.xpLog[].id`). Deux d’entre elles étaient tolérées par ce contrôle SANS fiche du 13e
  // étage : le contrôle passait au vert parce que sa SOURCE était en retard, pas parce que rien ne
  // manquait. Une date qu’on lit sans la soustraire n’est pas une mesure. Le plafond est donc posé :
  // la session nocturne fait un `GET` chaque nuit, 14 jours est un ordre de grandeur au-delà
  // duquel le relevé ne décrit plus la prod qu’il prétend figer.
  // v2.17.17 — cette mesure était juste dans sa forme et fausse dans son HORLOGE. `releveLe` valait
  // `d.savedAt` de la prod, or `savedAt` est la date du GAGNANT de l'arbitrage de fusion, pas celle
  // de ce fichier : elle s'arrête pendant que la prod bouge (le 26 août, +20 octets de charge à
  // `savedAt` identique au dixième de milliseconde) et elle avance sans qu'on ait rien régénéré.
  // Les deux sens ont été falsifiés : régénérer sur la charge du soir rendait un fichier identique
  // à l'octet, `releveLe` compris — indiscernable de ne rien faire ; et un `savedAt` reculé de
  // 20 jours faisait échouer le build sur un relevé fabriqué à la seconde, en conseillant une
  // régénération sans effet. `releveLe` est maintenant la date de GÉNÉRATION, la seule horloge que
  // ce dépôt contrôle, et le plafond mord sur elle.
  //
  // `prodSavedAt` est imprimé mais VOLONTAIREMENT pas arbitré : une prod peut légitimement ne pas
  // bouger (personne ne joue), et son horloge peut se figer par arbitrage. Un plafond dur dessus
  // casserait le build sur un fait qu'on ne contrôle pas. Son ABSENCE, elle, est arbitrée : un
  // relevé sans ce champ vient de l'ancien script, donc sa `releveLe` est une date de prod et
  // l'âge calculé plus bas ne mesure pas ce qu'il prétend.
  const AGE_MAX_J = 14;
  const ageJ = Math.floor((Date.now() - Date.parse(`${schemaProd.releveLe}T00:00:00Z`)) / 86400000);
  const charge = schemaProd.prodSavedAt ? String(schemaProd.prodSavedAt).slice(0, 10) : null;
  console.log(`· fixtures vs schéma de prod (relevé du ${schemaProd.releveLe}, il y a ${ageJ} jour(s)`
            + `${charge ? `, sur une charge de prod datée du ${charge}` : ""}) — aucun angle mort`);
  if (!("prodSavedAt" in schemaProd))
    fail(`relevé de prod — « prodSavedAt » absent : ce fichier vient de l’ancien script, où « releveLe » `
       + `portait le « savedAt » de la PROD et non la date de génération. L’âge affiché ci-dessus ne `
       + `mesure donc pas l’âge du relevé. Régénère : node scripts/releve-schema-prod.mjs <prod.json> `
       + `> scripts/schema-prod.json`);
  if (!Number.isFinite(ageJ))
    fail(`relevé de prod — « releveLe » vaut « ${schemaProd.releveLe} », qui n’est pas une date lisible. `
       + `Régénère : node scripts/releve-schema-prod.mjs <prod.json> > scripts/schema-prod.json`);
  else if (ageJ > AGE_MAX_J)
    fail(`relevé de prod — pas régénéré depuis ${ageJ} jours (plafond ${AGE_MAX_J}). Ce contrôle compare les `
       + `fixtures à une photo de la prod : périmée, il passe au vert sur les formes qu’elle ne `
       + `connaissait pas encore, et le 13e étage ne réclame pas leur fiche. Régénère après un `
       + `GET : node scripts/releve-schema-prod.mjs <prod.json> > scripts/schema-prod.json`);
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
  { chemin: "gameStates.catCounts", dans: "gameStates", champ: "catCounts",
    valeurFraiche: { menage: 12 }, valeurPerimee: { menage: 3, lecture: 7 },
    convergent: { menage: 12, lecture: 7 },
    pourquoi: "compteur \u00c0 VIE par cat\u00e9gorie (catalog.js ~406), fusionn\u00e9 par `Math.max` cl\u00e9 par cl\u00e9 (merge.js:441) : monotone, exactement comme `petXp` juste au-dessus." },
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
  { chemin: "config.feed[].likeTs", dans: "config", champ: "feed",
    poser: (v) => ({ feed: [{ id: "f13", ts: 2, type: "quete", playerId: "p1", text: "Fil", likes: ["p1", "p2"], likeTs: v, unlikes: {} }] }),
    lire: (cfg) => (cfg.feed || []).find((f) => f && f.id === "f13")?.likeTs,
    valeurFraiche: { p1: 20 }, valeurPerimee: { p1: 5, p2: 7 },
    convergent: { p1: 20, p2: 7 },
    pourquoi: "registre dat\u00e9 du \u2764\ufe0f pos\u00e9 (v2.16.84), fusionn\u00e9 par `maxPar` cl\u00e9 par cl\u00e9 (merge.js ~622). Le 9e \u00e9tage dit qu\u2019aucune cl\u00e9 ne DISPARA\u00ceT ; ici on mesure qu\u2019aucune ne RECULE \u2014 un `likeTs` qui recule laisserait le tombstone `unlikes` reprendre un c\u0153ur reprononc\u00e9." },
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

// ── Clé ÉGALE : ce que la règle ne NOMME PAS suit quand même son seau ───────
// v2.17.2 — l'angle mort SYMÉTRIQUE de la table ci-dessus, et il vit dans la MÊME table. Le
// contrôle « clé DIFFÉRENTE » exige que le seau frais soit rendu SEUL ; le 13e étage mesure, à clé
// ÉGALE, que la SOUS-CLÉ fraîche gagne. Aucun des deux ne demande ce que devient un champ que la
// règle ne nomme pas — et à clé égale, sept des dix seaux RECONSTRUISAIENT leur objet à partir de
// leurs seuls champs nommés (`return {day:A.day, ids:…}`), jetant tout le reste en silence. La
// branche « clés différentes », elle, rend le seau ENTIER : deux politiques pour le même objet,
// et c'est la plus fréquente qui perdait — la clé d'arbitrage est égale 7 jours sur 7.
//
// Personne ne pouvait le voir : les fixtures de ce fichier ne mettaient une clé d'arbitrage à
// égalité que dans les deux contrôles qui lisent une sous-clé NOMMÉE (13e étage, OBJETS_ARBITRES).
// C'est mot pour mot la leçon de la v2.16.80, appliquée un cran à côté. Trouvé de biais, par
// l'échafaudage du 24e étage : injecter une liste nichée réécrit la clé de son conteneur, ce qui
// mettait `weeklyChallenge`/`weeklyQuests` à égalité par accident et faisait crier le recensement
// des charnières. Le faux positif a été corrigé dans la question (témoin par paire) ; ce qu'il
// montrait est ici, avec un contrôle à lui.
//
// Rien de perdu en prod aujourd'hui — les dix seaux n'y portent que leurs champs nommés — donc
// aucune donnée à réparer. Ce que ça coûtait : le prochain champ ajouté à un seau disparaissait à
// la première synchro, sans erreur, sans trace, et le garde-fou restait vert.
//
// La mesure exige DEUX choses, et la seconde n'est pas un doublon de la première : le champ doit
// SURVIVRE, et il doit porter la valeur du côté FRAIS. Rendre `{...recent, ...perime, …}` (ou
// laisser l'ordre des arguments trancher) le ferait survivre en emportant la valeur périmée —
// exactement le défaut que la v2.16.87 a réparé sur `_mergePlayer` et sur les ÉLÉMENTS de
// `weeklyChallenge.challenges`, un cran plus bas dans la même fonction.
console.log("· seaux datés — clé ÉGALE : un champ que la règle ne NOMME PAS suit quand même le seau");
{
  const NN = "champNonNomme";
  for (const c of CLE_DIFFERENTE) {
    if (c.frais[NN] !== undefined || c.perime[NN] !== undefined)
      { fail(`« ${c.chemin} » — la fixture porte déjà « ${NN} » : choisis un autre nom de témoin.`); continue; }
    if (c.frais[c.cle] === undefined)
      { fail(`« ${c.chemin} » — la fixture fraîche n'a pas de clé « ${c.cle} » à mettre à égalité.`); continue; }
    // Clé d'arbitrage forcée à ÉGALITÉ (le cas normal, 7 jours sur 7), et un champ que AUCUNE règle
    // ne nomme, contradictoire entre les deux copies — sans contradiction, le contrôle serait inerte.
    const frais  = { ...c.frais,  [NN]: "valeur_fraiche" };
    const perime = { ...c.perime, [c.cle]: c.frais[c.cle], [NN]: "valeur_perimee" };
    const gsF = c.dans === "gameStates" ? { ...gsA, [c.champ]: frais } : gsA;
    const gsP = c.dans === "gameStates" ? { ...gsB, [c.champ]: perime } : gsB;
    const cfgF = c.dans === "config" ? { ...famA.config, [c.champ]: frais } : famA.config;
    const cfgP = c.dans === "config" ? { ...famB.config, [c.champ]: perime } : famB.config;
    const fA = mkFam("2026-08-15T12:00:00.000Z", gsF, cfgF, plA);
    const fB = mkFam("2026-08-14T12:00:00.000Z", gsP, cfgP, plB);
    for (const [sens, base, inc] of [["frais en base", fA, fB], ["frais en incoming", fB, fA]]) {
      const lit = (fn) => { const o = fn(base, inc); return (c.dans === "config" ? o.config : o.gameStates[0])[c.champ] || {}; };
      const rc = lit(client.mergeFamily), rs = lit(server.mergeFamily);
      if (rc[NN] !== rs[NN])
        fail(`« ${c.chemin} » (${sens}) — client rend « ${NN} » = ${JSON.stringify(rc[NN])} et le serveur `
           + `${JSON.stringify(rs[NN])}. La règle du seau n'est pas écrite pareil dans les deux copies.`);
      for (const [impl, out] of [["client", rc], ["serveur", rs]]) {
        if (out[NN] === undefined)
          fail(`${impl} (${sens}) — « ${c.chemin} » : à « ${c.cle} » ÉGAL, le champ « ${NN} » a été JETÉ. `
             + `La règle RECONSTRUIT son seau à partir des seuls champs qu'elle nomme, alors que la `
             + `branche « clés différentes » rend le seau entier — et la clé est égale 7 jours sur 7. `
             + `Le huitième champ ajouté un jour à ce seau disparaîtra à la première synchro, sans `
             + `erreur et sans trace. Écris « périmé d'abord, frais ensuite, champs nommés par-dessus » `
             + `(\`_seau\`) dans src/merge.js ET server-merge.cjs.`);
        else if (out[NN] !== "valeur_fraiche")
          fail(`${impl} (${sens}) — « ${c.chemin} » : « ${NN} » survit mais porte la valeur PÉRIMÉE `
             + `(${JSON.stringify(out[NN])}). Ce que la règle ne nomme pas doit suivre la FRAÎCHEUR, `
             + `pas l'ordre des arguments de l'appelant : le client met son état local en \`a\`, le `
             + `serveur son état stocké — chaque côté garderait le sien et la divergence ne se `
             + `refermerait jamais (v2.16.89).`);
      }
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
  // { chemin: "…", pourquoi: "…" }
  // v2.17.21 — la PREMIÈRE fiche de ce 17e étage, et elle n'est apparue qu'en donnant aux fixtures
  // une racine (elles n'en avaient pas). `seenVersions` vit à DEUX endroits depuis la v2.16.52 : à
  // la racine de la charge et dans `config`. Les deux copies de la fusion en font une seule union
  // de QUATRE sources (`bC`, `iC`, `base`, `incoming`) qu'elles réécrivent aux deux endroits. Vue
  // chemin par chemin, une version qui n'existait qu'à la racine « apparaît » donc dans
  // `config.seenVersions` sans qu'aucune des deux `config` ne la porte. Ce n'est pas une invention :
  // c'est un CROISEMENT voulu entre deux emplacements du même champ, et il est mesuré juste en
  // dessous (43e étage), dans les deux sens et pour les deux emplacements.
  { chemin: "config.seenVersions[]", pourquoi: "croisement racine↔config voulu (v2.16.52) : un même "
    + "champ à deux emplacements, une seule union de quatre sources. Mesuré au 43e étage." },
  { chemin: "charge.seenVersions[]", pourquoi: "le croisement dans l'autre sens : une version qui "
    + "n'existait que dans `config` ressort à la racine. Même union, mêmes quatre sources." },
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
// v2.17.21 — la RACINE de la charge, que ce relevé de valeurs sautait comme tous les autres. Sans
// elle, une valeur portée à la racine par une entrée et rendue à la racine par la fusion passait
// pour une INVENTION — le détecteur aurait crié sur une donnée que quelqu'un a bel et bien écrite.
// `config` et `gameStates` sont sautés ici : ils ont leur propre préfixe juste en dessous.
const _valeursDe = (fam) => {
  const acc = new Map();
  for (const [k, v] of Object.entries(fam || {}))
    if (k !== "config" && k !== "gameStates") _cheminsValues(v, `charge.${k}`, acc);
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

// ── 18e ÉTAGE : mergeGS mesuré sur SES DEUX préférences, pas sur celle que les savedAt choisissent ──
// v2.16.94 — piste laissée par la v2.16.93, mot pour mot : « le 17e étage mesure `mergeFamily`, aux
// quatre points — et `mergeFamily` choisit `preferIncoming` lui-même, à partir des `savedAt`. Or
// `mergeGS` porte ce drapeau dans 36 endroits, et le seul contrôle qui l'exerce dans ses DEUX
// positions ne compare que client contre serveur : il demande aux deux copies d'être d'accord,
// jamais à la valeur rendue de venir d'un des deux côtés. Une invention qui ne vit que dans la
// branche `preferIncoming` que les `savedAt` des fixtures ne choisissent pas est donc invisible aux
// dix-sept étages. Rejouer le croisement du 17e étage sur `mergeGS(a, b, pref)` pour `pref` VRAI et
// FAUX dirait si cette branche-là invente. »
//
// C'est fait, sur les QUATRE quadrants — (A,B,vrai), (A,B,faux), (B,A,vrai), (B,A,faux) — et la
// réponse est encore ZÉRO. Le quadrant que `mergeFamily` ne peut pas produire seul est celui où la
// copie de BASE est la fraîche ET où l'incoming est préféré : les `savedAt` ne le choisissent
// jamais, et il est maintenant mesuré comme les trois autres.
//
// Ce que le chemin a montré en plus, et que les dix-sept étages ne demandaient à personne : la
// fusion est symétrique par son CONTENU, pas par l'ORDRE de ses listes. `mergeGS(A,B,vrai)` et
// `mergeGS(B,A,faux)` désignent la MÊME copie fraîche — le résultat doit être le même — et
// quatorze listes en reviennent avec le même ensemble rangé autrement, parce que l'union
// concatène `a` puis `b` sans regarder `preferIncoming`. Aujourd'hui c'est sans conséquence
// (aucune de ces listes n'est lue par son RANG : toutes le sont par appartenance, ou vidées en
// bloc), donc c'est fiché plutôt que corrigé. Ce qui est mesuré ici, c'est que la différence
// s'arrête à l'ordre — le jour où elle atteint le contenu, elle crie.
const ORDRE_LIBRE = {
  // Tombstones et registres lus par appartenance (`includes` / `Set`) — le rang n'entre dans
  // aucune règle (vérifié : aucun accès `[0]`, `.at()` ni tri dans les consommateurs).
  completed: "lue par appartenance (`includes`) pour cocher une quête",
  pending: "lue par appartenance pour afficher l'attente de validation",
  refusedKeys: "tombstone, lu par appartenance",
  refundedRewards: "tombstone `id#estampille`, lu par appartenance",
  removedCalendarIds: "tombstone, lu par appartenance",
  removedRoutineIds: "tombstone, lu par appartenance",
  dismissedAnnouncements: "tombstone, lu par appartenance",
  consumedCelebrationIds: "tombstone, lu par appartenance",
  dailyClaimed: "`{day, ids}` — `ids` lue par appartenance",
  ritualCelebrated: "`{day, ids}` — `ids` lue par appartenance",
  activeDays: "`streakOf` et `activeDaysThisWeek` en font un `Set` avant de compter",
  // Listes AFFICHÉES, jamais indexées.
  owned: "inventaire affiché en liste, jamais indexé",
  badges: "tablette de badges affichée en liste, jamais indexée",
  pendingCelebrations: "file vidée EN BLOC (`pendingCelebrations: []`), jamais dépilée une à une",
};

const _triProfond = (v) => {
  if (Array.isArray(v)) return v.map(_triProfond).map((x) => JSON.stringify(x)).sort().map((s) => JSON.parse(s));
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v).sort()) o[k] = _triProfond(v[k]); return o; }
  return v;
};
const _valeursGS = (gs) => _cheminsValues(gs, "gs", new Map());
const _inventionsGS = (a, b, sortie) => {
  const va = _valeursGS(a), vb = _valeursGS(b), out = [];
  for (const [chemin, vals] of _valeursGS(sortie)) {
    const admis = new Set([...(va.get(chemin) || []), ...(vb.get(chemin) || [])]);
    const inventees = [...vals].filter((v) => !admis.has(v));
    if (inventees.length) out.push({ chemin, inventees, admis: [...admis] });
  }
  return out;
};

console.log("· mergeGS — valeurs INVENTÉES, dans les QUATRE quadrants (ordre × préférence)");
{
  // TÉMOIN : même exigence qu'au 17e étage — un détecteur qui ne trouve rien n'apprend rien tant
  // qu'on n'a pas vu qu'il SAIT trouver. On mesure le DELTA que le trucage ajoute, jamais un jeu
  // absolu, pour que le témoin reste muet le jour où une invention légitime sera fichée.
  const vraie = client.mergeGS(gsA, gsB, true);
  const avant = new Set(_inventionsGS(gsA, gsB, vraie).map((x) => x.chemin));
  const apres = _inventionsGS(gsA, gsB, { ...vraie, house: "MAISON_INVENTEE", coins: -1 }).map((x) => x.chemin);
  const delta = apres.filter((c) => !avant.has(c)).sort();
  if (JSON.stringify(delta) !== JSON.stringify(["gs.coins", "gs.house"]))
    fail(`18e étage — le TÉMOIN ne ressort pas comme prévu (delta : ${JSON.stringify(delta)}, `
       + `attendu ["gs.coins","gs.house"]). Le détecteur d'inventions au niveau \`mergeGS\` ne sait `
       + `plus voir une valeur fabriquée : son « zéro » sur les quatre quadrants ne prouverait rien.`);

  let quadrants = 0, inventes = 0;
  for (const [la, a, lb, b] of [["A", gsA, "B", gsB], ["B", gsB, "A", gsA]])
    for (const pref of [true, false])
      for (const [impl, fn] of [["client", client.mergeGS], ["serveur", server.mergeGS]]) {
        quadrants++;
        for (const { chemin, inventees, admis } of _inventionsGS(a, b, fn(a, b, pref))) {
          inventes++;
          fail(`${impl} mergeGS(${la},${lb},preferIncoming=${pref}) — « ${chemin} » vaut `
             + `${inventees.join(" ")}, une valeur qu'AUCUNE des deux copies ne porte (elles disent `
             + `${admis.join(" ") || "rien à ce chemin"}). Le 17e étage ne pouvait pas la voir : il `
             + `mesure \`mergeFamily\`, qui choisit \`preferIncoming\` à partir des \`savedAt\` et ne `
             + `visite donc jamais le quadrant « base fraîche ET incoming préféré ». Corrige dans `
             + `src/merge.js ET server-merge.cjs.`);
        }
      }
  console.log(`    (${_valeursGS(client.mergeGS(gsA, gsB, true)).size} chemins-valeurs, `
    + `${quadrants} quadrants, ${inventes} inventés)`);
}

console.log("· mergeGS — les deux façons de désigner la MÊME copie fraîche doivent converger");
{
  // `mergeGS(A,B,vrai)` et `mergeGS(B,A,faux)` disent tous deux « B est la copie fraîche ». Le
  // résultat doit être le même : sinon c'est l'APPELANT qui tranche (le client met son local en
  // `a`, le serveur son stocké), et les deux copies ne se rejoignent jamais — la forme exacte de
  // la v2.16.89. Le contenu est mesuré STRICTEMENT ; seul l'ordre des listes fichées est toléré.
  const utiles = new Set();
  for (const [designation, q1, q2] of [
    ["B fraîche", [gsA, gsB, true], [gsB, gsA, false]],
    ["A fraîche", [gsA, gsB, false], [gsB, gsA, true]],
  ]) {
    for (const [impl, fn] of [["client", client.mergeGS], ["serveur", server.mergeGS]]) {
      const r1 = fn(...q1), r2 = fn(...q2);
      for (const k of new Set([...Object.keys(r1), ...Object.keys(r2)])) {
        if (same(r1[k], r2[k])) continue;
        if (!same(_triProfond(r1[k]), _triProfond(r2[k])))
          fail(`${impl} (${designation}) — « ${k} » : les deux façons de désigner la même copie `
             + `fraîche rendent un CONTENU différent (${JSON.stringify(r1[k])} vs `
             + `${JSON.stringify(r2[k])}). Ce n'est pas un ordre : c'est l'ordre des ARGUMENTS qui `
             + `tranche, et le client met son local en \`a\` là où le serveur met son stocké. La `
             + `divergence ne se referme donc jamais, sans un seul message d'erreur.`);
        else if (!ORDRE_LIBRE[k])
          fail(`${impl} (${designation}) — « ${k} » revient avec le même ensemble dans un ORDRE `
             + `différent selon l'ordre des arguments. Si son rang n'entre dans aucune règle, `
             + `fiche-la dans ORDRE_LIBRE avec la façon dont elle est lue ; s'il en entre une, `
             + `c'est un bug : l'union doit concaténer selon \`preferIncoming\`, pas selon \`a\`.`);
        else utiles.add(k);
      }
    }
  }
  for (const k of Object.keys(ORDRE_LIBRE)) {
    if (!ORDRE_LIBRE[k]) fail(`18e étage — fiche ORDRE_LIBRE « ${k} » sans raison écrite.`);
    if (!utiles.has(k))
      fail(`18e étage — fiche ORDRE_LIBRE « ${k} », dont la fusion rend déjà le MÊME ordre dans les `
         + `deux sens. Une tolérance qui ne tolère rien est un blanc-seing : retire-la, sinon elle `
         + `couvrira un jour un désordre que personne n'a accepté (leçon v2.16.87).`);
  }
  console.log(`    (${utiles.size} listes tolérées sur l'ordre, contenu identique partout)`);
}

// ── 19e ÉTAGE : LES UNIONS BORNÉES, MESURÉES EN FORÇANT LEUR PLAFOND ───────
// v2.16.95 — piste laissée par la v2.16.94, mot pour mot : « le 18e étage tolère l'ordre parce
// qu'aucune de ces listes n'est lue par son rang — mais ONZE d'entre elles sont
// `_uniq([...a, ...b]).slice(-N)`, et `slice(-N)` garde la QUEUE de la concaténation. Quand
// l'union dépasse le plafond, ce sont donc les entrées du côté que l'APPELANT a mis en premier
// qui tombent. Rejouer le croisement en FORÇANT une liste au-delà de son plafond dirait
// lesquelles des onze divergent vraiment. »
//
// C'est fait — et le 18e étage ne pouvait pas le voir : ses fixtures portent UNE entrée par
// liste, donc aucun plafond ne mord jamais, donc les deux ordres d'arguments rendent le même
// ensemble et la comparaison sort verte. C'est la forme exacte de « la fixture qui ne
// collisionne jamais » (v2.16.91), un cran plus loin : ici la fixture ne DÉBORDE jamais.
//
// Deux familles en sortent, et une seule est un choix de produit :
//
//   (1) Les unions NON triées, `_uniq([...a, ...b]).slice(-N)` — ONZE listes. Elles divergent
//       avec ou sans ex aequo : `slice(-N)` garde la queue, donc le côté que l'appelant a mis
//       en second. Le client met son local en `a`, le serveur son stocké : les deux tablettes
//       gardent des sous-ensembles DIFFÉRENTS, et un tombstone perdu ressuscite ce qu'il
//       supprimait. **Latent aujourd'hui** (le plus rempli en prod le 21 août est
//       `config.removedAssignments`, 335/800, 42 %), mais il croît. CE QUI DOIT SURVIVRE À UN
//       PLAFOND EST UNE DÉCISION DE GEN (👤) — les plus récentes ? la plupart de ces listes ne
//       portent aucune date ; ou monter les plafonds. Fiché ci-dessous, pas décidé ici.
//
//   (2) Les unions TRIÉES puis coupées — huit listes. Elles convergent tant que la clé de tri
//       est distincte, et divergent dès qu'il y a des EX AEQUO : `Array.sort` est stable, donc
//       à clé égale l'ordre rendu est celui de la concaténation, donc celui des arguments.
//       Ce n'était pas un cas d'école : `announcements` trie sur `createdAt` à la JOURNÉE
//       (9 annonces en prod, 5 dates distinctes → 4 ex aequo) et `momentRequests` fait pareil.
//       Ici il n'y avait AUCUN choix de produit à faire : la règle de rétention (« les N plus
//       récentes ») est déjà écrite, elle était seulement non totale. Départagées sur `id` dans
//       les deux copies (v2.16.95) — cet étage le mesure, ex aequo forcés.
const PLAFOND_ORDRE_APPELANT = {
  // (1) — chaque fiche porte son plafond et la façon dont sa liste est lue. Tant que la
  // décision (👤) n'est pas prise, ces onze sont CONNUES divergentes : l'étage exige qu'elles
  // le soient VRAIMENT (une fiche qui ne couvre plus rien est un blanc-seing, leçon v2.16.87).
  "gs.refusedKeys": "400 — tombstone des demandes refusées, lu par appartenance",
  "gs.refundedRewards": "200 — tombstone `id#estampille` du remboursement, lu par appartenance",
  "gs.removedCalendarIds": "400 — tombstone des événements calendrier, lu par appartenance",
  "gs.removedRoutineIds": "200 — tombstone des rituels supprimés, lu par appartenance",
  "gs.consumedCelebrationIds": "300 — tombstone des célébrations déjà jouées, lu par appartenance",
  "config.removedAssignments": "800 — tombstone d'assignation ; 335/800 en prod le 21 août, le plus rempli",
  "config.removedCustomTasks": "1000 — tombstone de tâche maison ; 145/1000 en prod",
  "config.removedProposals": "800 — tombstone des propositions d'enfant ; 0 en prod",
  "config.removedAnnouncements": "200 — tombstone des annonces ; 0 en prod",
  "config.removedMomentRequests": "200 — tombstone des demandes de moment ; 0 en prod",
  "config.removedRemovalRequests": "400 — tombstone des demandes de retrait ; 0 en prod",
};

console.log("· unions bornées — forcer le plafond, puis exiger le MÊME sous-ensemble des deux côtés");
{
  // Élément générique pour les listes que les fixtures laissent VIDES des deux côtés
  // (`coinOffers`, `teamInvites`, `momentRequests` : voir `EXEMPT_CFG`). Sans lui, l'étage
  // mesurerait « 0 entrée » sur trois listes bornées et sortirait vert sans les avoir touchées —
  // exactement le trou de la v2.16.88 (« le relevé au même plafond que le surveillé »).
  // `status: "pending"` traverse les filtres de fraîcheur de `coinOffers`/`teamInvites`, qui
  // jettent les résolues de plus de deux jours.
  const RECENT = 1755000000000; // fixe : un garde-fou ne doit pas dépendre de l'heure qu'il est
  const generique = (tag, i) => ({ id: `${tag}${i}`, status: "pending", ts: RECENT + i,
                                   createdAt: `2026-08-${String((i % 28) + 1).padStart(2, "0")}` });
  const gonfle = (liste, tag, n, exaequo) => {
    const modele = (liste || []).find((x) => x != null);
    const out = [...(liste || [])];
    for (let i = 0; i < n; i++) {
      if (modele && typeof modele === "object") {
        const e = JSON.parse(JSON.stringify(modele));
        let aId = false;
        for (const k of ["id", "instanceId"]) if (k in e) { e[k] = `${tag}${i}`; aId = true; }
        if (!aId) e.id = `${tag}${i}`;
        if ("ts" in e) e.ts = exaequo ? RECENT : RECENT + i;
        if ("createdAt" in e) e.createdAt = exaequo ? "2026-08-10"
          : `2026-${String(1 + (i % 9)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
        out.push(e);
      } else if (modele !== undefined && typeof modele !== "object") {
        out.push(`${tag}${i}`);              // liste de chaînes : l'entrée EST sa clé
      } else {
        const e = generique(tag, i);          // liste vide des deux côtés
        if (exaequo) { e.ts = RECENT; e.createdAt = "2026-08-10"; }
        out.push(e);
      }
    }
    return out;
  };
  const empreinte = (x) => (x && typeof x === "object") ? JSON.stringify(norm(x)) : String(x);
  const ensemble = (arr) => new Set((arr || []).map(empreinte));
  const memeEnsemble = (s1, s2) => s1.size === s2.size && [...s1].every((x) => s2.has(x));

  // Les deux niveaux où vit une union bornée, chacun avec ses DEUX façons de désigner la MÊME
  // copie fraîche (17e/18e étages) : au niveau `mergeGS` c'est le drapeau `preferIncoming`, au
  // niveau `mergeFamily` c'est l'ordre des arguments (les `savedAt` désignent toujours famA).
  const NIVEAUX = [
    { prefixe: "gs", cles: [...new Set([...Object.keys(gsA), ...Object.keys(gsB)])]
        .filter((k) => Array.isArray(gsA[k]) || Array.isArray(gsB[k])),
      monte: (k, n, ex) => [{ ...gsA, [k]: gonfle(gsA[k], "A", n, ex) },
                            { ...gsB, [k]: gonfle(gsB[k], "B", n, ex) }],
      sorties: (impl, [a, b], k) => [impl.mergeGS(a, b, true)[k], impl.mergeGS(b, a, false)[k]],
      entrees: ([a, b], k) => [a[k], b[k]] },
    { prefixe: "config", cles: [...new Set([...Object.keys(famA.config), ...Object.keys(famB.config)])]
        .filter((k) => Array.isArray(famA.config[k]) || Array.isArray(famB.config[k])),
      monte: (k, n, ex) => [{ ...famA, config: { ...famA.config, [k]: gonfle(famA.config[k], "A", n, ex) } },
                            { ...famB, config: { ...famB.config, [k]: gonfle(famB.config[k], "B", n, ex) } }],
      sorties: (impl, [a, b], k) => [impl.mergeFamily(a, b).config[k], impl.mergeFamily(b, a).config[k]],
      entrees: ([a, b], k) => [a.config[k], b.config[k]] },
    // v2.16.95 — TROISIÈME niveau, ajouté par la falsification de cet étage même : gonfleur
    // aveuglé, l'étage a nommé `config.players`, et derrière lui `players[].starterThemes` — une
    // union BORNÉE (`slice(0, 4)`, la plus petite du projet) qui vit un cran SOUS les deux
    // niveaux ci-dessus. Un recensement qui s'arrête au niveau où il a commencé rend une réponse
    // fausse avec l'assurance d'une réponse complète (v2.16.90, « recensement borné au premier
    // niveau »). Les champs-listes d'un joueur sont donc gonflés et mesurés comme les autres.
    { prefixe: "players[]", cles: [...new Set([...Object.keys(plA), ...Object.keys(plB)])]
        .filter((k) => Array.isArray(plA[k]) || Array.isArray(plB[k])),
      monte: (k, n, ex) => [
        { ...famA, config: { ...famA.config, players: [{ ...plA, [k]: gonfle(plA[k], "A", n, ex) }] } },
        { ...famB, config: { ...famB.config, players: [{ ...plB, [k]: gonfle(plB[k], "B", n, ex) }] } }],
      sorties: (impl, [a, b], k) => [impl.mergeFamily(a, b).config.players[0][k],
                                     impl.mergeFamily(b, a).config.players[0][k]],
      entrees: ([a, b], k) => [a.config.players[0][k], b.config.players[0][k]] },
  ];

  // Un plafond se MESURE, il ne se lit pas dans le code : on gonfle à n puis à 2n, et une liste
  // est BORNÉE si sa sortie garde la même taille alors que son entrée a doublé, tout en jetant.
  // (Le `grep` du code aurait suffi hier — la v2.16.94 a montré qu'il peut sauter un fichier
  // EN SILENCE. Cette mesure ne lit aucun source.)
  const mesure = (niveau, k, n, ex, impl) => {
    const entrees = niveau.monte(k, n, ex);
    const [ea, eb] = niveau.entrees(entrees, k);
    const union = new Set([...ensemble(ea), ...ensemble(eb)]);
    const [r1, r2] = niveau.sorties(impl, entrees, k);
    if (!Array.isArray(r1) || !Array.isArray(r2)) return null;
    return { taille: r1.length, union: union.size, s1: ensemble(r1), s2: ensemble(r2) };
  };

  const vues = new Set();
  let bornees = 0, mesures = 0;
  for (const niveau of NIVEAUX)
    for (const k of niveau.cles) {
      const chemin = `${niveau.prefixe}.${k}`;
      for (const ex of [false, true]) {
        const p = mesure(niveau, k, 600, ex, client), q = mesure(niveau, k, 1200, ex, client);
        if (!p || !q) continue;
        mesures++;
        // bornée = taille figée malgré une entrée doublée, sortie non vide, et des entrées jetées
        if (!(p.taille === q.taille && p.taille > 0 && q.taille < q.union)) continue;
        bornees++;
        for (const [nom, impl] of [["client", client], ["serveur", server]]) {
          const m = nom === "client" ? q : mesure(niveau, k, 1200, ex, server);
          if (!m) continue;
          if (memeEnsemble(m.s1, m.s2)) continue;
          vues.add(chemin);
          if (PLAFOND_ORDRE_APPELANT[chemin]) continue; // divergence CONNUE, en attente de Gen (👤)
          const perdus = [...m.s1].filter((x) => !m.s2.has(x)).length;
          fail(`${nom} — « ${chemin} » : au-delà de son plafond (${m.taille} sur ${m.union} en `
             + `union), les deux façons de désigner la MÊME copie fraîche gardent des `
             + `sous-ensembles DIFFÉRENTS (${perdus} entrées d'un côté seulement, ex aequo `
             + `${ex ? "forcés" : "absents"}). C'est l'ordre des ARGUMENTS qui tranche ce qui `
             + `tombe, et le client met son local en \`a\` là où le serveur met son stocké : les `
             + `deux tablettes gardent une queue différente, pour toujours. Si la liste est `
             + `triée, son tri n'est pas TOTAL — départage-le sur \`id\` (v2.16.95). Sinon, `
             + `c'est le choix « ce qui survit à un plafond », qui appartient à Gen : fiche-la `
             + `dans PLAFOND_ORDRE_APPELANT en même temps que tu le lui poses.`);
        }
      }
    }

  // Le détecteur doit SAVOIR trouver : sans ce témoin, « zéro nouvelle divergence » ne dit rien.
  // On truque une liste bornée pour qu'elle rende deux sous-ensembles différents et on vérifie
  // que la comparaison crie. (`feed` : bornée à 60, triée, et convergente depuis la v2.16.95.)
  {
    const [a, b] = NIVEAUX[1].monte("feed", 1200, true);
    const s1 = ensemble(client.mergeFamily(a, b).config.feed);
    const s2 = ensemble(client.mergeFamily(b, a).config.feed);
    if (!memeEnsemble(s1, s2))
      fail("19e étage — TÉMOIN : `config.feed`, ex aequo forcés, devrait converger depuis la "
         + "v2.16.95 (tri départagé sur `id`) et ne converge pas.");
    const truque = new Set([...s1].slice(1));
    if (memeEnsemble(s1, truque))
      fail("19e étage — TÉMOIN : la comparaison d'ensembles ne voit pas une entrée retirée. Son "
         + "« zéro divergence » sur les listes bornées ne prouverait rien.");
  }
  // Et il doit VRAIMENT atteindre des plafonds : un gonfleur cassé mesurerait zéro liste bornée
  // et sortirait vert (leçon v2.16.88 — le relevé au même plafond que ce qu'il surveille).
  if (bornees < 2 * (Object.keys(PLAFOND_ORDRE_APPELANT).length + 5))
    fail(`19e étage — seulement ${bornees} mesures ont atteint un plafond (sur ${mesures} listes `
       + `× 2 régimes d'ex aequo). Le gonfleur n'atteint plus les plafonds : l'étage ne mesure `
       + `plus rien et son silence est faux.`);
  for (const chemin of Object.keys(PLAFOND_ORDRE_APPELANT)) {
    if (!PLAFOND_ORDRE_APPELANT[chemin]) fail(`19e étage — fiche « ${chemin} » sans raison écrite.`);
    if (!vues.has(chemin))
      fail(`19e étage — fiche PLAFOND_ORDRE_APPELANT « ${chemin} », dont la mesure ne trouve PLUS `
         + `de divergence au-delà du plafond. Soit la décision de Gen a été appliquée et la fiche `
         + `doit partir, soit la mesure ne l'atteint plus. Une tolérance qui ne tolère rien est un `
         + `blanc-seing (leçon v2.16.87).`);
  }
  console.log(`    (${mesures} listes × 2 régimes, ${bornees} au plafond, `
    + `${vues.size} divergentes — toutes fichées, décision de Gen en attente)`);
}

// ── 20e ÉTAGE : LES OBJETS BORNÉS, MESURÉS EN FORÇANT LEUR PLAFOND ─────────
// v2.16.96 — piste laissée par la v2.16.95, mot pour mot : « `gs.deCompleted` est un OBJET borné
// (`Object.keys(out).sort((x, y) => out[x] - out[y]).slice(-400)`). Le tri porte sur la VALEUR ;
// à valeur égale, `sort` est stable et l'ordre des clés est celui de `{ ...A }` puis les nouvelles
// de `B` — donc celui des arguments, exactement la famille (1) de ce soir, mais sur une structure
// que le recensement de l'étage ne visite pas (il ne connaît que les tableaux). Étendre le
// recensement aux OBJETS bornés dirait si la même divergence s'y trouve. »
//
// Le 19e étage filtre ses clés sur `Array.isArray` : un objet dont le nombre de CLÉS est plafonné
// lui est invisible, quel que soit le nombre de nuits qu'il a passées à mesurer des listes. Cet
// étage refait la même mesure — gonfler à n puis à 2n, une structure est bornée si sa sortie garde
// la même taille alors que son entrée a doublé tout en jetant — sur les objets, aux trois mêmes
// niveaux (`gameStates`, `config`, `config.players[]`), et exige que les DEUX façons de désigner
// la même copie fraîche rendent les mêmes couples clé/valeur.
const PLAFOND_ORDRE_APPELANT_OBJ = {
};

console.log("· objets bornés — forcer le plafond, puis exiger les MÊMES clés des deux côtés");
{
  const RECENT = 1755000000000; // fixe : un garde-fou ne doit pas dépendre de l'heure qu'il est
  const estObjet = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  // Gonfleur d'OBJET : n clés neuves, dont la valeur imite celle que la structure porte déjà
  // (c'est la valeur qui sert de clé de tri quand un plafond coupe). `exaequo` fige cette valeur :
  // c'est le régime où un tri stable retombe sur l'ordre des ARGUMENTS.
  const gonfleObj = (obj, tag, n, exaequo) => {
    const src = estObjet(obj) ? obj : {};
    const out = { ...src };
    const modele = Object.values(src).find((v) => v !== undefined);
    for (let i = 0; i < n; i++) {
      let v;
      if (typeof modele === "number") v = exaequo ? RECENT : RECENT + i;
      else if (typeof modele === "string") v = exaequo ? "2026-08-10T00:00:00.000Z"
        : `2026-08-10T00:00:${String(i % 60).padStart(2, "0")}.000Z`;
      else if (typeof modele === "boolean") v = true;
      else if (estObjet(modele) || Array.isArray(modele)) v = JSON.parse(JSON.stringify(modele));
      else v = exaequo ? RECENT : RECENT + i; // objet vide des deux côtés : valeur datée générique
      out[`${tag}${i}`] = v;
    }
    return out;
  };
  // La question de CET étage est « quelles CLÉS survivent au plafond », et rien d'autre : on
  // compare des ensembles de clés, pas des couples clé/valeur. Comparer les valeurs ferait crier
  // ici ce que d'autres étages mesurent déjà et tolèrent en connaissance de cause — l'ORDRE d'une
  // sous-liste (18e étage, 14 listes tolérées, contenu identique) et l'arbitrage d'un seau daté
  // (14e étage). Un étage qui rejuge la question du voisin rend un faux positif, pas une trouvaille.
  const ensembleObj = (o) => new Set(Object.keys(o || {}));
  const memeEnsemble = (s1, s2) => s1.size === s2.size && [...s1].every((x) => s2.has(x));

  const NIVEAUX_OBJ = [
    { prefixe: "gs", cles: [...new Set([...Object.keys(gsA), ...Object.keys(gsB)])]
        .filter((k) => estObjet(gsA[k]) || estObjet(gsB[k])),
      monte: (k, n, ex) => [{ ...gsA, [k]: gonfleObj(gsA[k], "A", n, ex) },
                            { ...gsB, [k]: gonfleObj(gsB[k], "B", n, ex) }],
      sorties: (impl, [a, b], k) => [impl.mergeGS(a, b, true)[k], impl.mergeGS(b, a, false)[k]],
      entrees: ([a, b], k) => [a[k], b[k]] },
    { prefixe: "config", cles: [...new Set([...Object.keys(famA.config), ...Object.keys(famB.config)])]
        .filter((k) => estObjet(famA.config[k]) || estObjet(famB.config[k])),
      monte: (k, n, ex) => [{ ...famA, config: { ...famA.config, [k]: gonfleObj(famA.config[k], "A", n, ex) } },
                            { ...famB, config: { ...famB.config, [k]: gonfleObj(famB.config[k], "B", n, ex) } }],
      sorties: (impl, [a, b], k) => [impl.mergeFamily(a, b).config[k], impl.mergeFamily(b, a).config[k]],
      entrees: ([a, b], k) => [a.config[k], b.config[k]] },
    { prefixe: "players[]", cles: [...new Set([...Object.keys(plA), ...Object.keys(plB)])]
        .filter((k) => estObjet(plA[k]) || estObjet(plB[k])),
      monte: (k, n, ex) => [
        { ...famA, config: { ...famA.config, players: [{ ...plA, [k]: gonfleObj(plA[k], "A", n, ex) }] } },
        { ...famB, config: { ...famB.config, players: [{ ...plB, [k]: gonfleObj(plB[k], "B", n, ex) }] } }],
      sorties: (impl, [a, b], k) => [impl.mergeFamily(a, b).config.players[0][k],
                                     impl.mergeFamily(b, a).config.players[0][k]],
      entrees: ([a, b], k) => [a.config.players[0][k], b.config.players[0][k]] },
  ];

  const mesureObj = (niveau, k, n, ex, impl) => {
    let entrees, r1, r2;
    try {
      entrees = niveau.monte(k, n, ex);
      [r1, r2] = niveau.sorties(impl, entrees, k);
    } catch { return null; }
    if (!estObjet(r1) || !estObjet(r2)) return null;
    const [ea, eb] = niveau.entrees(entrees, k);
    const union = new Set([...ensembleObj(ea), ...ensembleObj(eb)]);
    return { taille: Object.keys(r1).length, union: union.size, s1: ensembleObj(r1), s2: ensembleObj(r2) };
  };

  const vues = new Set();
  let bornes = 0, mesures = 0;
  for (const niveau of NIVEAUX_OBJ)
    for (const k of niveau.cles) {
      const chemin = `${niveau.prefixe}.${k}`;
      for (const ex of [false, true]) {
        const z = mesureObj(niveau, k, 0, ex, client);
        const p = mesureObj(niveau, k, 600, ex, client), q = mesureObj(niveau, k, 1200, ex, client);
        if (!z || !p || !q) continue;
        mesures++;
        // Un PLAFOND, et pas une forme fixe. « Même taille en sortie alors que l'entrée a doublé »
        // ne suffit pas à distinguer les deux : cinq objets de `gameStates` sont des seaux datés
        // que la règle RECONSTRUIT (`{ day, ids }`, `{ week, … }`) — ils rendent 2 clés qu'on leur
        // en donne 2 ou 2402, sans qu'aucun plafond n'ait choisi quoi que ce soit. Les compter
        // ferait un compteur de sécurité qui ne peut jamais tomber : le gonfleur pourrait cesser
        // d'atteindre le seul VRAI plafond du projet et l'étage sortirait vert quand même (leçon
        // v2.16.88). Le discriminant est la mesure à n = 0 : sous un plafond, la sortie GROSSIT
        // avec l'entrée jusqu'à buter ; une forme fixe rend la même taille dès l'entrée nue.
        if (!(p.taille === q.taille && p.taille > 0 && q.taille < q.union && p.taille > z.taille)) continue;
        bornes++;
        for (const [nom, impl] of [["client", client], ["serveur", server]]) {
          const m = nom === "client" ? q : mesureObj(niveau, k, 1200, ex, server);
          if (!m) continue;
          if (memeEnsemble(m.s1, m.s2)) continue;
          vues.add(chemin);
          if (PLAFOND_ORDRE_APPELANT_OBJ[chemin]) continue; // divergence CONNUE, en attente de Gen (👤)
          const perdus = [...m.s1].filter((x) => !m.s2.has(x)).length;
          fail(`${nom} — « ${chemin} » est un OBJET borné (${m.taille} clés sur ${m.union} en union) `
             + `dont les deux façons de désigner la MÊME copie fraîche gardent des clés DIFFÉRENTES `
             + `(${perdus} d'un côté seulement, ex aequo ${ex ? "forcés" : "absents"}). Le tri qui `
             + `choisit ce qui survit n'est pas TOTAL : à valeur égale, \`sort\` est stable et l'ordre `
             + `rendu est celui de \`{ ...A }\` puis des clés neuves de \`B\` — donc celui des `
             + `ARGUMENTS, et le client met son local en \`a\` là où le serveur met son stocké. `
             + `Départage-le sur la CLÉ, ou fiche le chemin dans PLAFOND_ORDRE_APPELANT_OBJ en même `
             + `temps que tu poses la question à Gen.`);
        }
      }
    }

  // Le détecteur doit SAVOIR trouver : sans témoin, « zéro divergence » ne dit rien (leçon v2.16.87).
  {
    const [a, b] = NIVEAUX_OBJ[0].monte("deCompleted", 1200, true);
    const s1 = ensembleObj(client.mergeGS(a, b, true).deCompleted);
    const s2 = ensembleObj(client.mergeGS(b, a, false).deCompleted);
    if (!memeEnsemble(s1, s2))
      fail("20e étage — TÉMOIN : `gs.deCompleted`, ex aequo forcés, devrait converger depuis la "
         + "v2.16.96 (tri départagé sur la clé) et ne converge pas.");
    const truque = new Set([...s1].slice(1));
    if (memeEnsemble(s1, truque))
      fail("20e étage — TÉMOIN : la comparaison d'ensembles ne voit pas une clé retirée. Son "
         + "« zéro divergence » sur les objets bornés ne prouverait rien.");
  }
  // Et il doit VRAIMENT atteindre un plafond : un gonfleur cassé mesurerait zéro objet borné et
  // sortirait vert (leçon v2.16.88 — le relevé au même plafond que ce qu'il surveille).
  if (bornes < 2)
    fail(`20e étage — seulement ${bornes} mesures ont atteint un plafond (sur ${mesures} objets `
       + `× 2 régimes d'ex aequo). Le gonfleur n'atteint plus les plafonds : l'étage ne mesure `
       + `plus rien et son silence est faux.`);
  for (const chemin of Object.keys(PLAFOND_ORDRE_APPELANT_OBJ)) {
    if (!PLAFOND_ORDRE_APPELANT_OBJ[chemin]) fail(`20e étage — fiche « ${chemin} » sans raison écrite.`);
    if (!vues.has(chemin))
      fail(`20e étage — fiche PLAFOND_ORDRE_APPELANT_OBJ « ${chemin} », dont la mesure ne trouve `
         + `PLUS de divergence au-delà du plafond. Une tolérance qui ne tolère rien est un `
         + `blanc-seing (leçon v2.16.87).`);
  }
  console.log(`    (${mesures} objets × 2 régimes, ${bornes} au plafond, ${vues.size} divergents)`);
}


// ── 21e ÉTAGE : LES STRUCTURES BORNÉES QUI VIVENT UN CRAN PLUS BAS ──────────
// v2.16.97 — piste laissée par la v2.16.96, mot pour mot : « le recensement des objets bornés
// s'arrête aux trois mêmes niveaux que celui des listes — un objet borné qui vivrait DANS un
// élément de liste ou DANS un autre objet n'est visité par personne, et c'est exactement la
// forme du bug de la v2.16.84 (`feed[].likes`, un cran sous le recensement). Descendre le
// gonfleur d'objets d'un niveau dirait s'il y en a un. »
//
// Les 19e et 20e étages énumèrent les clés de `gameStates`, de `config` et de `config.players[]`,
// et s'arrêtent là. Cet étage remplace cette énumération à trois niveaux par un PARCOURS de la
// forme, sans profondeur fixée : toute structure posée à deux crans ou plus d'une racine est
// gonflée, poussée au-delà d'un plafond éventuel, et ses deux sorties doivent porter le même
// contenu. Il descend donc là où le bug de la v2.16.84 vivait.
//
// Il couvre les DEUX formes, et pas seulement celle que la piste nommait : le 19e étage a
// exactement le même angle mort que le 20e, un cran plus bas (`Array.isArray` filtré sur trois
// niveaux de clés). Fermer l'un en laissant l'autre aurait rendu un « zéro » qui ne parle que de
// la moitié des structures — et la moitié muette est justement celle où le bug de la v2.16.84
// s'était logé.
//
// Quand le chemin traverse une LISTE, les deux éléments posés portent la MÊME identité des deux
// côtés : sans ça l'union par id les garde côte à côte, rien n'est arbitré, et l'étage sortirait
// vert sans avoir touché à quoi que ce soit (« la fixture qui ne collisionne jamais », v2.16.91).
// Mais ils sont posés dans un ordre CROISÉ (`[n21a, n21b]` d'un côté, `[n21b, n21a]` de l'autre),
// et chaque rang porte ses propres clés neuves : sans ça, une règle qui apparie les éléments par
// leur POSITION rend exactement ce que rend la bonne règle — elle tombe par accident et reste
// invisible (piste laissée par la v2.16.98).
const PLAFOND_ORDRE_APPELANT_NICHE = {
};

console.log("· structures bornées nichées — parcourir SOUS le premier niveau, puis forcer le plafond");
{
  const RECENT = 1755000000000; // fixe : un garde-fou ne doit pas dépendre de l'heure qu'il est
  // DEUX identités, pas une : chaque liste traversée reçoit deux éléments en collision
  // (voir `pose`). Un parcours qui n'en pose qu'un ne peut pas voir une règle qui traite le
  // 2e élément autrement du 1er — la forme du bug de la v2.16.80.
  const ID_NICHE = ["n21a", "n21b"];
  const estObjet = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  // Les clés par lesquelles une règle de fusion rapproche deux éléments d'une même liste. Un
  // élément qui n'en porte aucune est quand même traversé (par son rang) : le recensement ne doit
  // pas s'arrêter sur la forme même qu'il existe pour couvrir.
  const CLES_ID = ["id", "instanceId", "version", "playerId"];
  const cleId = (el) => (estObjet(el) ? CLES_ID.find((k) => k in el) || null : null);

  // Gonfleur d'OBJET (20e étage) et gonfleur de LISTE (19e étage), à l'identique : la valeur des
  // clés neuves et le contenu des éléments neufs imitent ce que la structure porte déjà, parce
  // que c'est cette valeur qui sert de clé de tri quand un plafond coupe. `exaequo` la fige :
  // c'est le régime où un tri stable retombe sur l'ordre des ARGUMENTS.
  const gonfleObj = (obj, tag, n, exaequo) => {
    const src = estObjet(obj) ? obj : {};
    const out = { ...src };
    const modele = Object.values(src).find((v) => v !== undefined);
    for (let i = 0; i < n; i++) {
      let v;
      if (typeof modele === "number") v = exaequo ? RECENT : RECENT + i;
      else if (typeof modele === "string") v = exaequo ? "2026-08-10T00:00:00.000Z"
        : `2026-08-10T00:00:${String(i % 60).padStart(2, "0")}.000Z`;
      else if (typeof modele === "boolean") v = true;
      else if (estObjet(modele) || Array.isArray(modele)) v = JSON.parse(JSON.stringify(modele));
      else v = exaequo ? RECENT : RECENT + i;
      out[`${tag}${i}`] = v;
    }
    return out;
  };
  const gonfleListe = (liste, tag, n, exaequo) => {
    const modele = (liste || []).find((x) => x != null);
    const out = [...(liste || [])];
    for (let i = 0; i < n; i++) {
      if (modele && typeof modele === "object") {
        const e = JSON.parse(JSON.stringify(modele));
        let aId = false;
        for (const k of CLES_ID) if (k in e) { e[k] = `${tag}${i}`; aId = true; }
        if (!aId) e.id = `${tag}${i}`;
        if ("ts" in e) e.ts = exaequo ? RECENT : RECENT + i;
        if ("createdAt" in e) e.createdAt = exaequo ? "2026-08-10"
          : `2026-${String(1 + (i % 9)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
        out.push(e);
      } else if (modele !== undefined) {
        out.push(`${tag}${i}`);               // liste de chaînes : l'entrée EST sa clé
      } else {
        out.push(`${tag}${i}`);               // liste vide des deux côtés
      }
    }
    return out;
  };

  // La question de cet étage est « QU'EST-CE QUI SURVIT au plafond », comme aux 19e et 20e :
  // ensembles de clés pour un objet, ensembles d'empreintes pour une liste. Comparer autre chose
  // ferait rejuger ici ce que les 14e et 18e étages mesurent déjà et tolèrent en connaissance de
  // cause (l'ORDRE d'une sous-liste, l'arbitrage d'un seau daté) : un faux positif, pas une
  // trouvaille.
  const ensembleObj = (o) => new Set(Object.keys(o || {}));
  const empreinte = (x) => (x && typeof x === "object") ? JSON.stringify(norm(x)) : String(x);
  const ensembleListe = (arr) => new Set((arr || []).map(empreinte));
  const memeEnsemble = (s1, s2) => s1.size === s2.size && [...s1].every((x) => s2.has(x));

  // ── Recensement par la FORME, sur l'union des deux fixtures ──────────────
  // `config.players[].X` est déjà mesuré par les 19e et 20e étages (c'est leur 3e niveau) : le
  // remesurer ici rendrait deux fois la même divergence sous deux noms.
  const chemins = [];
  const recense = (racine, a, b, steps) => {
    if (steps.length > 6) return; // garde-fou de récursion, jamais atteint par la forme réelle
    const dejaVu = (s) => s.length === 2 && steps[0] && steps[0].liste === "players";
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
      const va = (a || {})[k], vb = (b || {})[k];
      if (estObjet(va) || estObjet(vb)) {
        const s = [...steps, { k }];
        if (s.length >= 2 && !dejaVu(s)) chemins.push({ racine, steps: s, forme: "objet" });
        recense(racine, estObjet(va) ? va : {}, estObjet(vb) ? vb : {}, s);
      } else if (Array.isArray(va) || Array.isArray(vb)) {
        const s = [...steps, { k }];
        if (s.length >= 2 && !dejaVu(s)) chemins.push({ racine, steps: s, forme: "liste" });
        const ea = (va || [])[0], eb = (vb || [])[0];
        if (!estObjet(ea) && !estObjet(eb)) continue;
        recense(racine, estObjet(ea) ? ea : {}, estObjet(eb) ? eb : {},
                [...steps, { liste: k, idk: cleId(ea) || cleId(eb) }]);
      }
    }
  };
  recense("gs", gsA, gsB, []);
  recense("config", famA.config, famB.config, []);

  // ── Poser / lire une structure au bout d'un chemin ───────────────────────
  const pose = (noeud, c, i, tag, n, ex) => {
    const st = c.steps[i];
    if (st.k !== undefined) {
      const suivant = (noeud || {})[st.k];
      const val = i === c.steps.length - 1
        ? (c.forme === "liste" ? gonfleListe(suivant, tag, n, ex) : gonfleObj(suivant, tag, n, ex))
        : pose(suivant, c, i + 1, tag, n, ex);
      return { ...(noeud || {}), [st.k]: val };
    }
    const arr = [...(((noeud || {})[st.liste]) || [])];
    if (!arr.length) return noeud;
    // DEUX éléments en collision, aux rangs 0 et 1 : la fusion doit arbitrer les deux. Avec un
    // seul élément posé, une règle qui traite le 2e autrement du 1er (un `find` qui s'arrête, un
    // `[0]` codé en dur, un tri qui ne départage que la tête) reste invisible — c'est la forme du
    // bug de la v2.16.80.
    // Et ils sont posés dans un ordre CROISÉ entre les côtés : `[n21a, n21b]` ici, `[n21b, n21a]`
    // là. Dans le MÊME ordre des deux côtés, une règle qui apparie les éléments par leur POSITION
    // plutôt que par leur `id` rend exactement ce que rend la bonne règle — elle tombe juste par
    // accident, et reste invisible elle aussi.
    // Croiser ne suffit pas seul : il faut que chaque rang porte ses PROPRES clés neuves
    // (`A0…` / `A1…`), sinon les deux éléments d'un même côté sont indiscernables et apparier par
    // la position rend encore la même chose qu'apparier par l'id. Ce tag par rang avait été écrit
    // puis retiré en v2.16.98, faute de falsification qui l'exerce ; le TÉMOIN DE POSITION
    // ci-dessous est cette falsification, et il tombe si l'un OU l'autre saute.
    // Le croisement ne vaut que pour une liste dont les éléments portent une identité : sans clé
    // d'id, `lit` relit par le rang et il n'y a rien à apparier.
    const ordre = st.idk && tag.startsWith("B") ? [1, 0] : [0, 1];
    // Les deux éléments sont taillés dans l'état d'ORIGINE de la liste, figé avant la boucle. Une
    // liste d'un seul élément — le cas de toutes les fixtures — n'a rien à l'indice 1 : reprendre
    // `arr[0]` à ce moment-là revenait à recopier l'élément du rang 0 DÉJÀ GONFLÉ, et le rang 1
    // repartait donc avec les clés neuves du rang 0 par-dessus les siennes. Tant que les deux
    // rangs portaient le même tag, les clés étaient les mêmes et le doublon se dédupliquait sans
    // rien changer ; dès que chaque rang porte les siennes, le rang 1 mesure les DEUX.
    const orig = [...arr];
    for (let r = 0; r < 2; r++) {
      const el = clone(orig[r] !== undefined ? orig[r] : orig[0]) || {};
      if (st.idk) el[st.idk] = ID_NICHE[ordre[r]];
      arr[r] = pose(el, c, i + 1, `${tag}${ordre[r]}`, n, ex);
    }
    return { ...(noeud || {}), [st.liste]: arr };
  };
  // `rang` s'applique à TOUS les pas de liste du chemin : rang 0 partout, puis rang 1 partout.
  const lit = (noeud, c, i, rang) => {
    if (noeud == null) return undefined;
    const st = c.steps[i];
    if (st.k !== undefined) {
      const v = noeud[st.k];
      return i === c.steps.length - 1 ? v : lit(v, c, i + 1, rang);
    }
    const arr = noeud[st.liste] || [];
    const el = st.idk ? arr.find((x) => x && x[st.idk] === ID_NICHE[rang]) : arr[rang];
    return lit(el, c, i + 1, rang);
  };

  const nomDe = (c) => `${c.racine}.` + c.steps
    .map((s) => (s.k !== undefined ? s.k : `${s.liste}[]`)).join(".");
  // Les DEUX façons de désigner la MÊME copie fraîche (17e/18e étages) : au niveau `mergeGS`
  // c'est le drapeau `preferIncoming`, au niveau `mergeFamily` l'ordre des arguments.
  const monte = (c, n, ex) => c.racine === "gs"
    ? [pose(gsA, c, 0, "A", n, ex), pose(gsB, c, 0, "B", n, ex)]
    : [{ ...famA, config: pose(famA.config, c, 0, "A", n, ex) },
       { ...famB, config: pose(famB.config, c, 0, "B", n, ex) }];
  const sorties = (impl, c, [a, b], r) => c.racine === "gs"
    ? [lit(impl.mergeGS(a, b, true), c, 0, r), lit(impl.mergeGS(b, a, false), c, 0, r)]
    : [lit(impl.mergeFamily(a, b).config, c, 0, r), lit(impl.mergeFamily(b, a).config, c, 0, r)];
  const entrees = (c, [a, b], r) => c.racine === "gs"
    ? [lit(a, c, 0, r), lit(b, c, 0, r)]
    : [lit(a.config, c, 0, r), lit(b.config, c, 0, r)];

  // Le discriminant est NOMMÉ, et pas recopié dans la boucle : les témoins ci-dessous s'en
  // servent tels quels, donc aucun d'eux ne peut prouver autre chose que ce que l'étage mesure
  // vraiment (« la fixture identique = contrôle inerte », v2.16.89).
  const estBorne = (z, p, q) =>
    p.taille === q.taille && p.taille > 0 && q.taille < q.union && p.taille > z.taille;

  const mesureNiche = (c, n, ex, impl, rang = 0) => {
    const ens = c.forme === "liste" ? ensembleListe : ensembleObj;
    let ent, r1, r2;
    try { ent = monte(c, n, ex); [r1, r2] = sorties(impl, c, ent, rang); } catch { return null; }
    const bonneForme = (v) => (c.forme === "liste" ? Array.isArray(v) : estObjet(v));
    if (!bonneForme(r1) || !bonneForme(r2)) return null;
    const [ea, eb] = entrees(c, ent, rang);
    const union = new Set([...ens(ea), ...ens(eb)]);
    const taille = c.forme === "liste" ? r1.length : Object.keys(r1).length;
    return { taille, union: union.size, s1: ens(r1), s2: ens(r2) };
  };

  // Un chemin qui traverse une liste est mesuré DEUX fois : sur le 1er élément posé, puis sur le
  // 2e. Un chemin qui n'en traverse aucune n'a qu'un rang.
  const rangsDe = (c) => (c.steps.some((s) => s.liste !== undefined) ? [0, 1] : [0]);
  const vues = new Set();
  const mesuresVues = new Set();   // `chemin|rang` : ce que la BOUCLE a réellement demandé
  let bornes = 0, mesures = 0;
  for (const c of chemins) {
    const chemin = nomDe(c);
    for (const rang of rangsDe(c))
    for (const ex of [false, true]) {
      const z = mesureNiche(c, 0, ex, client, rang);
      const p = mesureNiche(c, 600, ex, client, rang), q = mesureNiche(c, 1200, ex, client, rang);
      if (!z || !p || !q) continue;
      mesures++;
      mesuresVues.add(`${chemin}|${rang}`);
      // Même discriminant qu'au 20e étage : un PLAFOND, et pas une forme FIXE. « Même taille en
      // sortie alors que l'entrée a doublé » ne les distingue pas — un seau daté que la règle
      // RECONSTRUIT rend 2 clés qu'on lui en donne 2 ou 2402. La mesure à n = 0 est ce qui les
      // sépare : sous un plafond la sortie GROSSIT avec l'entrée jusqu'à buter, une forme fixe
      // rend la même taille dès l'entrée nue (leçon v2.16.96).
      if (!estBorne(z, p, q)) continue;
      bornes++;
      for (const [nom, impl] of [["client", client], ["serveur", server]]) {
        const m = nom === "client" ? q : mesureNiche(c, 1200, ex, server, rang);
        if (!m || memeEnsemble(m.s1, m.s2)) continue;
        vues.add(chemin);
        if (PLAFOND_ORDRE_APPELANT_NICHE[chemin]) continue; // divergence CONNUE, en attente de Gen (👤)
        const perdus = [...m.s1].filter((x) => !m.s2.has(x)).length;
        fail(`${nom} — « ${chemin} » est une structure bornée NICHÉE (${m.taille} sur ${m.union} en `
           + `union) dont les deux façons de désigner la MÊME copie fraîche gardent des contenus `
           + `DIFFÉRENTS (${perdus} d'un côté seulement, ex aequo ${ex ? "forcés" : "absents"}, `
           + `${rang === 0 ? "1er" : "2e"} élément des listes traversées). `
           + `Les 19e et 20e étages ne pouvaient pas le voir : ils énumèrent les clés de trois `
           + `niveaux et celle-ci vit dessous. Le tri qui choisit ce qui survit n'est pas TOTAL — `
           + `départage-le sur la clé, ou fiche le chemin dans PLAFOND_ORDRE_APPELANT_NICHE en `
           + `même temps que tu poses la question à Gen.`);
      }
    }
  }

  // ── Les deux témoins, et pourquoi ils ne sont pas un compteur ────────────
  // Ici « zéro » est le résultat ATTENDU : aucune règle de fusion ne plafonne une structure
  // nichée aujourd'hui (tous les `slice` du projet coupent au premier niveau, plus
  // `players[].starterThemes` au troisième — mesurés par les 19e et 20e étages). Un étage dont
  // le silence est l'issue normale ne peut donc PAS se garder par un compteur « au moins n
  // structures atteintes » : ce compteur serait à zéro le jour de son écriture et ne pourrait
  // jamais tomber — le faux garde-fou de la v2.16.96, exactement. Le détecteur se prouve sur des
  // implémentations TRUQUÉES : une qui coupe dans l'ordre des arguments (il doit crier), une qui
  // coupe sur un tri total (il doit se taire). Le jour où une règle plafonnera une structure
  // nichée, la mesure la trouvera sans que ce fichier change.
  {
    const trucs = [
      { nom: "objet niché", c: { racine: "gs", steps: [{ k: "house" }, { k: "placed" }], forme: "objet" },
        faux: (coupe) => ({ mergeGS: (a, b) => ({ ...a, house: { ...(a.house || {}),
          placed: coupe({ ...((a.house || {}).placed || {}), ...((b.house || {}).placed || {}) }) } }) }),
        parArgs: (o) => Object.fromEntries(Object.keys(o).slice(0, 50).map((k) => [k, o[k]])),
        parCle: (o) => Object.fromEntries(Object.keys(o).sort().slice(0, 50).map((k) => [k, o[k]])) },
      // Le troisième truqué traverse une LISTE, et il est le seul à prouver la ligne « MÊME
      // identité des deux côtés » : il rapproche les éléments par `id`, comme le vrai code. Si le
      // parcours cessait de forcer l'identité, les deux éléments ne se rencontreraient plus, la
      // structure nichée ne serait plus arbitrée du tout, et ce témoin cesserait de la voir bornée.
      { nom: "liste dans un élément", forceId: true,
        c: { racine: "config", steps: [{ liste: "feed", idk: "id" }, { k: "likes" }], forme: "liste" },
        faux: (coupe) => ({ mergeFamily: (a, b) => {
          const m = new Map();
          for (const el of [...(a.config.feed || []), ...(b.config.feed || [])]) {
            const vu = m.get(el.id);
            m.set(el.id, vu ? { ...vu, likes: coupe([...(vu.likes || []), ...(el.likes || [])]) } : el);
          }
          return { config: { ...a.config, feed: [...m.values()] } };
        } }),
        parArgs: (l) => [...new Set(l)].slice(0, 50),
        parCle: (l) => [...new Set(l)].sort().slice(0, 50) },
      { nom: "liste nichée", c: { racine: "gs", steps: [{ k: "dailyClaimed" }, { k: "ids" }], forme: "liste" },
        faux: (coupe) => ({ mergeGS: (a, b) => ({ ...a, dailyClaimed: { ...(a.dailyClaimed || {}),
          ids: coupe([...(((a.dailyClaimed || {}).ids) || []), ...(((b.dailyClaimed || {}).ids) || [])]) } }) }),
        parArgs: (l) => [...new Set(l)].slice(0, 50),
        parCle: (l) => [...new Set(l)].sort().slice(0, 50) },
    ];
    for (const t of trucs) {
      const z1 = mesureNiche(t.c, 0, true, t.faux(t.parArgs), 0);
      const p1 = mesureNiche(t.c, 600, true, t.faux(t.parArgs), 0);
      const m1 = mesureNiche(t.c, 1200, true, t.faux(t.parArgs), 0);
      if (!m1 || !z1 || !p1 || !estBorne(z1, p1, m1) || m1.taille !== 50)
        fail(`21e étage — TÉMOIN (${t.nom}) : l'implémentation truquée à plafond 50 n'est pas VUE `
           + `comme bornée par la mesure. Le gonfleur ou le discriminant est cassé, et le « zéro » `
           + `de cet étage ne prouverait rien.`);
      else if (memeEnsemble(m1.s1, m1.s2))
        fail(`21e étage — TÉMOIN (${t.nom}) : une coupe qui garde la TÊTE de la concaténation rend `
           + `forcément deux contenus différents selon l'ordre des arguments, et la comparaison ne `
           + `le voit pas. Son « zéro » ne prouverait rien.`);
      const m2 = mesureNiche(t.c, 1200, true, t.faux(t.parCle), 0);
      if (m2 && !memeEnsemble(m2.s1, m2.s2))
        fail(`21e étage — TÉMOIN (${t.nom}) : un plafond départagé sur la clé converge par `
           + `construction, et le détecteur crie quand même. Il crierait sur n'importe quoi.`);
      // Et une FORME FIXE ne doit PAS être prise pour un plafond : c'est ce que la mesure à
      // n = 0 sépare, et aucune structure nichée réelle ne l'exerce aujourd'hui. Sans ce
      // troisième témoin, `estBorne` porterait une clause qui ne surveille rien et personne ne
      // le saurait le jour où elle sauterait (leçon v2.16.96, le compteur qui ne peut pas tomber).
      const fixe = t.faux(() => (t.c.forme === "liste" ? ["fx1", "fx2"] : { fx1: 1, fx2: 2 }));
      const zf = mesureNiche(t.c, 0, true, fixe, 0), pf = mesureNiche(t.c, 600, true, fixe, 0);
      const qf = mesureNiche(t.c, 1200, true, fixe, 0);
      if (zf && pf && qf && estBorne(zf, pf, qf))
        fail(`21e étage — TÉMOIN (${t.nom}) : une sortie de taille FIXE (2 entrées qu'on lui en `
           + `donne 2 ou 2402) est comptée comme BORNÉE. Le discriminant ne sépare plus un `
           + `plafond d'une forme que la règle reconstruit : l'étage compterait des structures `
           + `qu'aucun plafond ne touche, et son compteur ne pourrait plus tomber.`);
    }
  }
  // ── Le témoin de RANG : le 2e élément doit être arbitré, pas seulement le 1er ─────
  // Les trois truqués ci-dessus traitent tous leurs éléments pareil : ils passeraient au vert
  // même si le parcours n'en posait qu'un seul, comme avant. Ce quatrième truqué est le seul qui
  // les SÉPARE — il départage son plafond sur la clé pour le PREMIER élément de la liste (il
  // converge) et le laisse dans l'ordre des arguments pour tous les suivants (ils divergent).
  // Le détecteur doit donc se taire au rang 0 et crier au rang 1. S'il se tait aux deux, le
  // parcours a cessé de poser un 2e élément, et son « zéro » ne parlerait que de la tête des
  // listes (leçon v2.16.89 : une fixture qui ne contredit rien est un contrôle inerte).
  {
    const c = { racine: "config", steps: [{ liste: "feed", idk: "id" }, { k: "likes" }], forme: "liste" };
    const fauxRang = {
      mergeFamily: (a, b) => {
        const bi = new Map((b.config.feed || []).map((el) => [el.id, el]));
        // Départagé sur la clé pour l'élément de rang 0 SEULEMENT, désigné par son `id` et non
        // par son index : les deux côtés ne posent plus leurs éléments dans le même ordre, et un
        // `i === 0` désignerait `n21a` d'un côté, `n21b` de l'autre — le témoin mesurerait alors
        // le croisement au lieu de mesurer le rang.
        const feed = (a.config.feed || []).map((el) => {
          const u = [...new Set([...(el.likes || []), ...(((bi.get(el.id) || {}).likes) || [])])];
          return { ...el, likes: (el.id === ID_NICHE[0] ? [...u].sort() : u).slice(0, 50) };
        });
        return { config: { ...a.config, feed } };
      },
    };
    const mes = (rang) => [mesureNiche(c, 0, true, fauxRang, rang),
                           mesureNiche(c, 600, true, fauxRang, rang),
                           mesureNiche(c, 1200, true, fauxRang, rang)];
    const [z0, p0, q0] = mes(0);
    const [z1, p1, q1] = mes(1);
    if (!z1 || !p1 || !q1)
      fail("21e étage — TÉMOIN DE RANG : le 2e élément d'une liste traversée n'est pas mesurable. "
         + "Le parcours n'en pose plus qu'un, et son « zéro » ne parlerait que de la tête des listes.");
    else if (!estBorne(z1, p1, q1) || q1.taille !== 50)
      fail("21e étage — TÉMOIN DE RANG : l'implémentation truquée à plafond 50 n'est pas vue comme "
         + "bornée sur le 2e élément. Le gonfleur ne descend pas dans l'élément de rang 1.");
    else if (memeEnsemble(q1.s1, q1.s2))
      fail("21e étage — TÉMOIN DE RANG : une règle qui départage sur la clé pour le 1er élément "
         + "SEULEMENT laisse le 2e dans l'ordre des arguments, et le détecteur ne le voit pas. "
         + "C'est exactement la forme du bug de la v2.16.80, et son « zéro » ne prouverait rien.");
    if (z0 && p0 && q0 && estBorne(z0, p0, q0) && !memeEnsemble(q0.s1, q0.s2))
      fail("21e étage — TÉMOIN DE RANG : le 1er élément, dont le plafond EST départagé sur la clé, "
         + "est vu divergent. Le détecteur crierait sur n'importe quel rang, et son cri au rang 1 "
         + "ne dirait rien du 2e élément.");
  }
  // ── Le témoin de POSITION : les deux rangs sont CROISÉS entre les côtés ──────────
  // Les quatre truqués ci-dessus apparient tous leurs éléments par `id`, comme le vrai code :
  // ils resteraient verts même si les deux côtés posaient leurs deux éléments dans le MÊME ordre.
  // Celui-ci apparie par la POSITION — et il départage sa coupe sur la CLÉ, donc l'ordre des
  // arguments ne peut pas être la cause de ce qu'il rend : sa divergence ne vient QUE du mauvais
  // appariement. Il tombe si le croisement saute, et il tombe aussi si les deux rangs cessent de
  // porter des clés neuves distinctes.
  {
    const c = { racine: "config", steps: [{ liste: "feed", idk: "id" }, { k: "likes" }], forme: "liste" };
    const coupeTriee = (l) => [...new Set(l)].sort().slice(0, 50);
    const parPosition = { mergeFamily: (a, b) => {
      const fb = b.config.feed || [];
      const feed = (a.config.feed || []).map((el, i) => ({
        ...el, likes: coupeTriee([...(el.likes || []), ...(((fb[i] || {}).likes) || [])]),
      }));
      return { config: { ...a.config, feed } };
    } };
    // Le même truqué à l'appariement près : par `id`. C'est l'ANCRE — si lui aussi diverge, le
    // cri de son voisin ne dirait rien de l'appariement, il dirait que la coupe est fautive.
    const parId = { mergeFamily: (a, b) => {
      const bi = new Map((b.config.feed || []).map((el) => [el.id, el]));
      const feed = (a.config.feed || []).map((el) => ({
        ...el, likes: coupeTriee([...(el.likes || []), ...(((bi.get(el.id) || {}).likes) || [])]),
      }));
      return { config: { ...a.config, feed } };
    } };
    for (const rang of [0, 1]) {
      const z = mesureNiche(c, 0, true, parPosition, rang);
      const p = mesureNiche(c, 600, true, parPosition, rang);
      const q = mesureNiche(c, 1200, true, parPosition, rang);
      if (!z || !p || !q || !estBorne(z, p, q) || q.taille !== 50)
        fail(`21e étage — TÉMOIN DE POSITION (rang ${rang}) : l'implémentation truquée à plafond `
           + `50 n'est pas vue comme bornée. Le gonfleur ne descend plus dans cet élément-là.`);
      else if (memeEnsemble(q.s1, q.s2))
        fail(`21e étage — TÉMOIN DE POSITION (rang ${rang}) : une règle qui apparie les éléments `
           + `d'une liste par leur POSITION au lieu de leur \`id\` rend deux contenus DIFFÉRENTS, `
           + `et le détecteur ne le voit pas. Soit les deux côtés reposent leurs éléments dans le `
           + `MÊME ordre, soit les deux rangs portent les mêmes clés neuves : dans les deux cas, `
           + `apparier par la position rend la même chose qu'apparier par l'id, et le « zéro » de `
           + `l'étage ne dirait rien de l'appariement.`);
      const anc = mesureNiche(c, 1200, true, parId, rang);
      if (anc && !memeEnsemble(anc.s1, anc.s2))
        fail(`21e étage — TÉMOIN DE POSITION (rang ${rang}) : le même truqué apparié par \`id\`, `
           + `avec la MÊME coupe triée, est vu divergent. Le cri de celui apparié par position ne `
           + `dirait alors rien de l'appariement.`);
    }
  }
  // Le témoin de rang ci-dessus appelle `mesureNiche(..., 1)` DIRECTEMENT : il prouve que la
  // machinerie sait mesurer le 2e élément, pas que la boucle le lui demande. Si `rangsDe`
  // retombait à `[0]`, il resterait vert et l'étage ne parlerait plus que de la tête des listes
  // — un garde-fou qui teste la règle ne teste pas son appelant (v2.16.83). Ce contrôle-ci
  // regarde donc ce que la BOUCLE a demandé, chemin par chemin.
  for (const c of chemins) {
    if (!c.steps.some((s) => s.liste !== undefined)) continue;
    const chemin = nomDe(c);
    if (mesuresVues.has(`${chemin}|0`) && !mesuresVues.has(`${chemin}|1`))
      fail(`21e étage — « ${chemin} » traverse une liste et n'a été mesuré que sur son 1er `
         + `élément. La boucle ne demande plus le rang 1 : le témoin de rang, qui appelle la `
         + `mesure directement, resterait vert, et le « zéro » de l'étage ne parlerait que de la `
         + `tête des listes.`);
  }
  // Et le PARCOURS doit vraiment descendre. Les cinq chemins ci-dessous sont les formes que le
  // recensement doit atteindre : un objet sous un objet, un objet dans un élément, un objet sous
  // un objet DANS un élément, une liste sous un objet, une liste dans un élément (la forme même
  // du bug de la v2.16.84). S'il cesse d'en visiter un, son « zéro » est faux (leçon v2.16.90).
  {
    const attendus = ["gs.house.placed", "config.announcements[].playerTasks",
                      "config.weeklyChallenge.challenges[].checkins",
                      "gs.dailyClaimed.ids", "config.feed[].likes"];
    const noms = new Set(chemins.map(nomDe));
    for (const a of attendus)
      if (!noms.has(a))
        fail(`21e étage — le parcours ne visite plus « ${a} », une structure nichée que les `
           + `fixtures portent. Le recensement a cessé de descendre : son « zéro » serait faux.`);
  }
  for (const chemin of Object.keys(PLAFOND_ORDRE_APPELANT_NICHE)) {
    if (!PLAFOND_ORDRE_APPELANT_NICHE[chemin]) fail(`21e étage — fiche « ${chemin} » sans raison écrite.`);
    if (!vues.has(chemin))
      fail(`21e étage — fiche PLAFOND_ORDRE_APPELANT_NICHE « ${chemin} », dont la mesure ne trouve `
         + `PLUS de divergence. Une tolérance qui ne tolère rien est un blanc-seing (v2.16.87).`);
  }
  if (process.env.DBG21) console.log(chemins.map((c) => `      ${nomDe(c)} (${c.forme})`).join("\n"));
  console.log(`    (${chemins.length} structures nichées recensées, ${mesures} mesures `
    + `(chemins × rangs × régimes), ${bornes} au plafond, ${vues.size} divergentes)`);
}

// ── 22e ÉTAGE : LES RÈGLES À CHARNIÈRE ─────────────────────────────────────
// v2.17.0 — la piste laissée par la v2.16.99, mot pour mot : « le parcours ne force qu'UNE clé
// d'identité par élément […] Sur les 18 listes traversées, une en porte deux —
// `config.removalRequests[]` (`id` ET `instanceId`) […] `instanceId` EST porteur dans la vraie
// règle (src/merge.js:537) […] Forcer les DEUX clés, à valeurs distinctes par rang, dirait s'il
// y en a une. »
//
// MESURÉE, et au 21e étage la réponse est INERTE. `config.removalRequests` est bien la seule des
// 18 listes traversées à porter deux clés d'identité — mais ses éléments ne portent AUCUNE
// structure nichée, donc le recensement du 21e étage ne pousse aucun chemin sous elle (0 sur 23)
// et le parcours n'y pose jamais d'élément. Y forcer les deux clés n'aurait exercé rien du tout :
// un garde-fou qui ne peut pas tomber, exactement ce que la v2.16.96 a appris à ne plus écrire.
//
// La vraie question est un cran à côté, et elle se mesure : à QUOI sert cette seconde clé ? À
// consulter une AUTRE liste. Trois règles du projet le font, et les trois sont VIVANTES :
//   • `!_rmSet.has(r.instanceId)` (merge.js:537) — une demande de retrait s'efface quand
//     l'assignation qu'elle vise a été supprimée. `_rmSet` est le tombstone d'`assignments`, pas
//     celui de `removalRequests`.
//   • `referencedTaskIds.has(t.id)` (merge.js:520) — une tâche perso SURVIT à son propre
//     tombstone tant qu'une assignation survivante la référence (les ~125 orphelines de la
//     v2.5.0).
//   • `pending.filter(k => !completed.includes(k) && !_refusedSet.has(k))` (merge.js:262) — une
//     quête en attente de validation sort de la file dès qu'elle est validée ou refusée (v1.64.0).
// Effacer n'importe laquelle des trois de src/merge.js laissait ce fichier ENTIÈREMENT VERT : une
// règle présente dans une copie et absente de l'autre, que la parité ne voyait pas. Les étages
// des listes posent chaque liste SEULE — `frais`/`perime` se contredisent sur le contenu,
// `supprime` sur le tombstone de la liste elle-même — et pas un seul n'a jamais fait dépendre le
// sort d'un élément d'une AUTRE liste. La fiche CHAINES de `pending` NOMMAIT pourtant sa
// charnière depuis toujours (« le retrait passe par `completed`/`refusedKeys`, filtrés dans la
// règle elle-même ») : une raison écrite à côté d'un contrôle n'est pas un contrôle (v2.16.94).
const CHARNIERES = [
  {
    nom: "une demande de retrait meurt avec l'assignation qu'elle vise",
    genre: "objets", champ: "removalRequests",
    sens: "rejet", // l'élément VISÉ est celui que la charnière fait disparaître
    regle: "src/merge.js:537 — `!_rmSet.has(r.instanceId)` (tombstone d'`assignments`)",
    vise:   { id: "hg_vise", instanceId: "as_charniere", note: "vise une assignation SUPPRIMÉE" },
    temoins: [{ id: "hg_temoin", instanceId: "as_vivante", note: "vise une assignation vivante" }],
    cfgPlus: { removedAssignments: ["as_charniere"] },
  },
  {
    nom: "une tâche perso survit à son tombstone tant qu'une assignation VIVANTE la référence",
    genre: "objets", champ: "customTasks",
    sens: "sauvetage", // l'élément VISÉ est celui que la charnière fait survivre
    regle: "src/merge.js:520 — `referencedTaskIds.has(t.id) || !_rmCT.has(t.id)`",
    vise:   { id: "ct_referencee", label: "référencée par une assignation vivante" },
    // Deux témoins, et le second n'est pas un doublon du premier : la charnière ne lit pas les
    // assignations BRUTES, elle lit `assignMap` — celles qui ont SURVÉCU à leur propre tombstone.
    // Une tâche référencée par une assignation elle-même supprimée ne doit donc PAS être sauvée,
    // sinon le ménage des orphelines (v2.5.0) ne finit jamais.
    temoins: [
      { id: "ct_orpheline", label: "référencée par personne" },
      { id: "ct_ref_morte", label: "référencée par une assignation SUPPRIMÉE" },
    ],
    cfgPlus: {
      removedCustomTasks: ["ct_referencee", "ct_orpheline", "ct_ref_morte"],
      assignments: [
        { instanceId: "as_sauveuse", taskId: "ct_referencee", playerIds: ["p1"], days: [0] },
        { instanceId: "as_morte", taskId: "ct_ref_morte", playerIds: ["p1"], days: [0] },
      ],
      removedAssignments: ["as_morte"],
    },
  },
  {
    nom: "une quête VALIDÉE sort de la file d'attente",
    genre: "chaines", champ: "pending", dans: "gameStates",
    sens: "rejet",
    regle: "src/merge.js:262 — `pending.filter((k) => !completed.includes(k) …)`",
    vise: "tv#2026-08-14",
    temoins: ["tw#2026-08-14"],
    gsPlus: { completed: ["tv#2026-08-14"] },
  },
  {
    nom: "une quête REFUSÉE sort de la file d'attente",
    genre: "chaines", champ: "pending", dans: "gameStates",
    sens: "rejet",
    regle: "src/merge.js:262 — `pending.filter((k) => … && !_refusedSet.has(k))`",
    vise: "tx#2026-08-14",
    temoins: ["tw#2026-08-14"],
    gsPlus: { refusedKeys: ["tx#2026-08-14"] },
  },
  // v2.17.4 — 26e étage. La SEULE charnière à DEUX sources que le projet porte en plus de celle de
  // `customTasks` (déjà couverte par le témoin `ct_ref_morte` de sa fiche), et la seule que le
  // recensement à une source ne pouvait pas atteindre : `pending` est filtrée par `completed`, et
  // `completed` est elle-même filtrée par `deCompleted`. Poser `deCompleted` SEULE ne déplace rien
  // (sans complétion, il n'y a rien à annuler) et poser `completed` seule est déjà la fiche
  // ci-dessus — il faut les DEUX pour que la quête ressorte de la file d'attente.
  // Vivant : `handleDeComplete` (App.jsx ~2929) retire la clé de `completed` et écrit son
  // tombstone daté, mais ne touche PAS à `pending` — or `pending` est une UNION, donc la copie
  // d'en face rapporte la clé et le filtre est la seule chose qui la retenait. Annuler une
  // validation remet donc la quête « ⏳ en attente », ce qui est cohérent (le parent peut
  // re-trancher) mais n'a jamais été écrit nulle part.
  {
    nom: "une validation ANNULÉE par le portail parent remet la quête dans la file d'attente",
    genre: "chaines", champ: "pending", dans: "gameStates",
    sens: "sauvetage", // l'élément VISÉ est celui que la charnière fait survivre
    regle: "src/merge.js:273 — `pending.filter((k) => !completed.includes(k) …)`, où `completed` "
         + "est elle-même filtrée par `_annulee` (merge.js:145) : DEUX structures à la fois",
    vise: "tqa#2026-08-14",
    // Le témoin est la même quête SANS l'annulation : validée, elle doit rester HORS de la file.
    // Sans lui, un `pending` qui ignorerait `completed` en entier passerait au vert.
    temoins: ["tqv#2026-08-14"],
    gsPlus: {
      completed: ["tqa#2026-08-14", "tqv#2026-08-14"],
      completedAt: {
        "tqa#2026-08-14": "2026-08-14T10:00:00.000Z",
        "tqv#2026-08-14": "2026-08-14T10:00:00.000Z",
      },
      deCompleted: { "tqa#2026-08-14": 1786780000000 }, // > la complétion → `completed` la lâche
    },
  },
  // v2.17.1 — 23e étage. La SEULE charnière neuve du recensement étendu aux objets, et la seule
  // du projet dont la valeur de rapprochement est une DATE : le tombstone ne mord que s'il est
  // plus récent que la complétion qu'il annule (v2.16.82, parce qu'une quête peut être REFAITE le
  // même jour sous la même `doneKey`).
  {
    nom: "une quête ANNULÉE par le portail parent sort de la liste des complétées",
    genre: "chaines", champ: "completed", dans: "gameStates",
    sens: "rejet",
    regle: "src/merge.js:145 — `completed.filter((k) => !_annulee(k))`, où `_annulee` croise "
         + "`deCompleted[k]` (l'annulation) avec `_completedAt[k]` (la complétion)",
    vise: "tan#2026-08-14",
    // Deux témoins, et le second n'est pas un doublon du premier. Le premier prouve que la règle
    // départage au lieu d'emporter toute la liste. Le SECOND est le discriminant DATÉ, celui que
    // la v2.16.82 a écrit exprès : une quête annulée puis REFAITE le même jour porte bel et bien
    // un tombstone, mais une complétion plus récente — elle doit rester. Sans lui, remplacer la
    // comparaison de dates par un simple `if (deCompleted[k]) return true` passerait au vert, et
    // la quête refaite disparaîtrait pour de bon.
    temoins: ["tsn#2026-08-14", "tre#2026-08-14"],
    gsPlus: {
      completedAt: {
        "tan#2026-08-14": "2026-08-14T10:00:00.000Z", // annulée APRÈS avoir été faite
        "tsn#2026-08-14": "2026-08-14T10:00:00.000Z", // jamais annulée
        "tre#2026-08-14": "2026-08-15T10:00:00.000Z", // REFAITE après l'annulation
      },
      deCompleted: {
        "tan#2026-08-14": 1786780000000, // > la complétion du 14 → mord
        "tre#2026-08-14": 1786700000000, // < la complétion du 15 → ne mord plus
      },
    },
  },
];

console.log("· charnières — le sort d'un élément décidé par une AUTRE liste");
for (const h of CHARNIERES) {
  const l = h.genre === "objets"
    ? LISTES.find((x) => x.champ === h.champ && (h.conteneur || null) === (x.conteneur ? x.conteneur.cle : null))
    : CHAINES.find((x) => x.champ === h.champ && x.dans === h.dans);
  if (!l) { fail(`22e étage — charnière « ${h.nom} » : « ${h.champ} » n'est plus déclarée dans ${h.genre === "objets" ? "LISTES" : "CHAINES"}.`); continue; }
  const chemin = `${l.dans}.${l.conteneur ? l.conteneur.cle + "." : ""}${l.champ}`;
  const nomEl = (e) => (h.genre === "chaines" ? e : e[l.cle]);
  const elems = [h.vise, ...h.temoins];
  const monte = (savedAt, gsBase, cfgBase, pl, plus) => mkFam(savedAt,
    { ...gsBase, ...(l.dans === "gameStates" ? { [l.champ]: elems } : {}), ...(plus.gs || {}) },
    { ...cfgBase, ...(l.dans === "config" ? bloc(l, elems) : {}), ...(plus.cfg || {}) }, pl);
  const litH = (fam) => {
    const racine = l.dans === "config" ? fam.config : fam.gameStates[0];
    const c = l.conteneur ? racine[l.conteneur.cle] : racine;
    return (c && c[l.champ]) || [];
  };
  const fA = monte("2026-08-15T12:00:00.000Z", gsA, famA.config, plA, { cfg: h.cfgPlus, gs: h.gsPlus });
  const fB = monte("2026-08-14T12:00:00.000Z", gsB, famB.config, plB, {});
  const surviVise = h.sens === "sauvetage";
  for (const [sens, base, inc] of [["charnière en base", fA, fB], ["charnière en incoming", fB, fA]]) {
    const rc = litH(client.mergeFamily(base, inc)), rs = litH(server.mergeFamily(base, inc));
    if (!same(rc, rs))
      fail(`mergeFamily (${sens}) — ${chemin} : client ≠ serveur sur la charnière « ${h.nom} ». `
         + `La règle (${h.regle}) n'est pas écrite pareil dans les deux copies.`);
    for (const [nom, out] of [["client", rc], ["serveur", rs]]) {
      const la = (e) => (h.genre === "chaines"
        ? out.includes(e) : out.some((x) => x && x[l.cle] === e[l.cle]));
      if (la(h.vise) !== surviVise)
        fail(`${nom} mergeFamily (${sens}) — ${chemin}[${nomEl(h.vise)}] : la charnière « ${h.nom} » `
           + `ne mord pas. L'élément visé ${surviVise ? "devait SURVIVRE et il a disparu"
              : "devait DISPARAÎTRE et il est là"}. Règle : ${h.regle} — dans src/merge.js ET `
           + `server-merge.cjs.`);
      for (const t of h.temoins)
        if (la(t) === surviVise)
          fail(`${nom} mergeFamily (${sens}) — ${chemin}[${nomEl(t)}] : le TÉMOIN de la charnière `
             + `« ${h.nom} » a le même sort que l'élément visé. La charnière ne départage donc rien `
             + `— elle emporte (ou épargne) toute la liste, et le contrôle sur l'élément visé ne `
             + `prouverait rien (v2.16.89, la fixture qui ne contredit pas est un contrôle inerte).`);
    }
  }
}

// ── Recensement des charnières PAR LA MESURE ────────────────────────────────
// Déclarer deux charnières ne dit rien de la TROISIÈME que quelqu'un écrira demain. Et un
// recensement par le source (`grep` sur `X.has(el.champ)`) serait à la fois fragile et faux : il
// ne dit pas quelle liste alimente `X`, et un octet illisible suffit à lui faire sauter un
// fichier en silence (v2.16.93). Celui-ci ne lit pas le code : il le MESURE.
//
// Le principe : poser un élément-SONDE dans la liste L, tous ses champs saturés d'une même
// sentinelle, et regarder s'il survit. Puis poser cette même sentinelle dans une autre liste M et
// remesurer. Si le sort de la sonde CHANGE, c'est que la règle de L a lu M — une charnière. Peu
// importe par quel champ ou quel `Set` intermédiaire : la mesure ne dépend d'aucune forme écrite.
// Deux régimes, parce qu'une charnière peut mordre dans les deux sens : sonde libre (M peut la
// faire DISPARAÎTRE, un rejet) et sonde déjà tombstonée par sa propre liste (M peut la faire
// REVENIR, un sauvetage).
console.log("· charnières — recensement par la MESURE : aucune dépendance inter-listes non déclarée");
{
  const SENT = "SONDE_CHARNIERE";
  const nomL = (l) => `${l.dans}.${l.conteneur ? l.conteneur.cle + "." : ""}${l.champ}`;
  const cibles = [...LISTES.map((l) => ({ ...l, genre: "objets" })),
                  ...CHAINES.map((l) => ({ ...l, genre: "chaines" }))];
  // Saturer TOUS les champs de la même sentinelle : la mesure n'a pas à deviner par quel champ la
  // charnière passe. Les nombres restent tels quels (une date ou un compteur ne sert jamais de
  // clé de rapprochement entre deux listes).
  const sature = (modele, cle, s = SENT) => {
    const out = {};
    for (const [k, v] of Object.entries(modele || {}))
      out[k] = typeof v === "string" ? s : Array.isArray(v) ? [s] : v;
    out[cle] = s;
    return out;
  };
  const sonde = (l, s = SENT) => (l.genre === "chaines" ? [s] : [sature(l.frais, l.cle, s)]);
  // v2.17.2 — 24e étage. Le TÉMOIN : la même injection, à la sentinelle près. Une source M
  // n'écrit pas que son contenu — elle écrit aussi l'échafaudage qui l'entoure (le `fixe` du
  // conteneur d'une liste nichée, par exemple). Comparer « M avec la sentinelle » à une mesure de
  // base SANS M du tout, c'est laisser cet échafaudage passer pour une charnière : quatre faux
  // positifs au premier passage, tous `weeklyQuests`/`weeklyChallenge` × leur propre liste
  // nichée, dont l'injection réécrit la clé d'arbitrage du conteneur et fait changer de branche.
  // Corrigé dans la QUESTION, pas par une exemption (v2.16.96) : le point de comparaison porte le
  // MÊME échafaudage, et ne diffère que par la valeur cherchée.
  const TEM = "TEMOIN_CHARNIERE";
  const present = (l, out) => (l.genre === "chaines"
    ? (out || []).includes(SENT)
    : (out || []).some((e) => e && e[l.cle] === SENT));
  const litL = (fam, l) => {
    const racine = l.dans === "config" ? fam.config : fam.gameStates[0];
    const c = l.conteneur ? racine[l.conteneur.cle] : racine;
    return (c && c[l.champ]) || [];
  };
  // ── 35e ÉTAGE : LE GARDE `conteneur` DES LISTES, RÉPARÉ PLUTÔT QU'EXEMPTÉ ──
  // v2.17.13 — la piste de la v2.17.12, point (1). Les boucles de LISTES portaient QUATRE fois
  // `if (l.conteneur && m.champ === l.conteneur.cle) continue;` (22e, 26e, 28e, 29e étages) :
  // refus de croiser une liste nichée avec l'objet qui la contient, au motif que la source
  // ÉCRASERAIT la cible. Le motif était exact — `...plus.cfg` écrit au PREMIER niveau, donc le
  // bloc de M remplaçait le conteneur en entier — mais l'exemption était la mauvaise réponse,
  // et la MESURE l'a montrée pire que ce que la piste croyait (sonde jetable, jetée après
  // lecture, comme au 34e étage) :
  //   • sous M, les deux copies portaient un `config.weeklyQuests` TEXTUELLEMENT IDENTIQUE
  //     (`generatedForWeek` « 2026-08-14 » des deux côtés, là où la fixture pose 08-14 contre
  //     08-07) — `fixture-identique-controle-inerte`, exactement la maladie du 34e étage ;
  //   • et surtout la sonde N'ÉTAIT PAS DANS LA FIXTURE : `assignments` valait le contenu réel
  //     de `famA` (`wq1`), pas l'élément-sentinelle. La paire ne mesurait donc pas « une cible
  //     reconstruite », elle ne mesurait RIEN — deux fois plutôt qu'une.
  //   • le compte, enfin, n'était pas celui que la piste annonçait : 13 paires exemptées (9 au
  //     22e — trois formes × deux régimes pour `weeklyQuests`, trois pour `weeklyChallenge` —,
  //     2 au 28e, 2 au 29e), pas 3. `prolonger-ce-qui-a-deja-bouge` : compter AVANT d'écrire.
  //
  // La réparation est le miroir exact de `sousCle` (34e étage) : de la source, ne prendre que
  // ce que la cible ne définit pas déjà, et rendre au conteneur le bloc que la CIBLE vient de
  // poser (son `fixe` — la clé d'arbitrage — et sa liste-sonde). Inconditionnel plutôt que
  // réservé aux paires en collision : quand `plus` n'écrit pas la clé du conteneur, `inj` vaut
  // déjà `propre` et l'opération est l'identité — 4 145 paires sur 4 147 ne changent pas d'un
  // octet, et aucun appelant n'a de drapeau à passer (donc aucun appelant ne peut l'oublier,
  // `garde-fou-teste-la-regle-pas-lappelant`).
  //
  // LIMITE, écrite plutôt que tue : une charnière qui ferait dépendre le sort d'un élément de la
  // valeur du `fixe` du conteneur (`assignments` × `weeklyQuests.generatedForWeek`) reste hors
  // d'atteinte — la cible impose son `fixe`, égal des deux côtés EXPRÈS (sans quoi le seau daté
  // prend un bloc en entier et la règle de la liste ne tourne jamais). C'est le jumeau de la
  // limite structurelle notée au 34e étage, et c'est strictement mieux que l'exemption : avant
  // ce soir, ces paires ne disaient rien du tout.
  const monte = (savedAt, gsBase, cfgBase, pl, l, elems, plus) => {
    const gs = { ...gsBase, ...(l.dans === "gameStates" ? bloc(l, elems) : {}), ...plus.gs };
    const cfg = { ...cfgBase, ...(l.dans === "config" ? bloc(l, elems) : {}), ...plus.cfg };
    if (l.conteneur) {
      const cible = l.dans === "gameStates" ? gs : cfg, k = l.conteneur.cle;
      const propre = bloc(l, elems)[k], inj = cible[k] || {}, neuf = { ...propre };
      for (const kk of Object.keys(inj)) if (!(kk in propre)) neuf[kk] = inj[kk];
      cible[k] = neuf;
    }
    return mkFam(savedAt, gs, cfg, pl);
  };
  // v2.17.5 — 27e étage. La SORTIE COMPLÈTE, normalisée sur la sentinelle. Les deux mesures
  // qu'on compare portent le même échafaudage à la sentinelle près (SENT d'un côté, TEM de
  // l'autre) : renommer l'une en l'autre rend les deux sorties TEXTUELLEMENT identiques dès que
  // la fusion les a traitées pareil. Toute différence qui SURVIT à ce renommage est donc un
  // endroit où la source injectée a changé quelque chose — et la sonde n'est qu'un de ces
  // endroits.
  const norm27 = (out) => JSON.stringify(out).split(SENT).join(TEM);
  const mesure = (l, plus, impl) => {
    const fA = monte("2026-08-15T12:00:00.000Z", gsA, famA.config, plA, l, sonde(l), plus);
    const fB = monte("2026-08-14T12:00:00.000Z", gsB, famB.config, plB, l, sonde(l), plus);
    try { const out = impl.mergeFamily(fA, fB);
          return { p: present(l, litL(out, l)), s: norm27(out), o: out }; } catch { return null; }
  };
  const plusDe = (m, elems) => (m.dans === "config"
    ? { cfg: bloc(m, elems), gs: {} } : { cfg: {}, gs: bloc(m, elems) });
  const fusionne = (p, q) => ({ cfg: { ...p.cfg, ...q.cfg }, gs: { ...p.gs, ...q.gs } });

  // v2.17.1 — 23e étage, la piste de la v2.17.0 mot pour mot : « le recensement mesure L × M
  // **liste contre liste**. Les charnières vers un OBJET (`completedAt`, `deCompleted`,
  // `rewardBuyTs`, `hiddenRewards`/`hiddenWeek`, `equipped`…) ne sont pas dans le produit — or
  // `deCompleted` EST une charnière datée de `completed` (v2.16.82) […] Étendre le côté M aux
  // OBJETS (une clé portant la sentinelle) dirait s'il y en a d'autres. »
  //
  // Dans une LISTE, poser la sentinelle c'est y poser un ÉLÉMENT. Dans un OBJET, c'est y poser une
  // CLÉ — c'est exactement ainsi que les règles du projet consultent un objet : `deCompleted[k]`,
  // `_completedAt[k]`, `rewardBuyTs[id]`. La clé est posée EN PLUS du contenu de la fixture, pas à
  // la place : remplacer l'objet en bloc effacerait le `day`/`week` des seaux datés et ferait
  // mesurer une forme qui n'existe nulle part (leçon de la v2.16.86).
  //
  // DEUX valeurs, parce que le projet rapproche par un objet de deux façons et qu'une clé n'en
  // porte qu'une à la fois : un TEXTE (`equipped[slot] === itemId`) et une DATE
  // (`Number(deCompleted[k]) > Date.parse(completedAt[k])`, où un texte vaut 0 et ne mord jamais).
  // La date est volontairement lointaine : un tombstone daté ne mord que s'il est plus récent que
  // ce qu'il annule. Une seule des deux formes aurait laissé l'autre moitié muette.
  // v2.17.3 — 25e étage, la piste de la v2.17.2 mot pour mot : « la sonde vaut un TEXTE ou un
  // NOMBRE, or le projet encode ses dates des DEUX façons (`deCompleted` en millisecondes,
  // `completedAt` en ISO) et un rapprochement daté ne mord que si les deux bouts parlent le même
  // encodage — une charnière qui lirait `Date.parse(L[k])` contre une M en ISO est hors d'atteinte
  // des DEUX côtés du produit. Ajouter une 3e forme `{clé→ISO}` aux deux côtés dirait s'il y en a. »
  //
  // Les trois formes sont mutuellement AVEUGLES, et c'est exactement ce qui fait qu'aucune n'est le
  // doublon d'une autre — chacune est le seul encodage que sa famille de règles sait lire :
  //   • `Number(v) > 1e12` (la forme de `deCompleted`) vaut NaN sur un ISO ET sur la sentinelle
  //   • `Date.parse(v)`    (la forme de `completedAt`) vaut NaN sur 9e12-le-NOMBRE et sur la sentinelle
  //   • `v === autreChamp` (la forme d'`equipped`)     ne rapproche que deux TEXTES égaux
  // La MÊME instante des deux côtés (9e12 ms et son ISO) : une charnière datée ne mord que si les
  // deux bouts parlent le même encodage, donc la forme est posée côté L **et** côté M. En ajouter
  // une d'un seul côté ne mesurerait rien de neuf — le produit ne croiserait jamais ISO × ISO.
  const FORMES = [["texte", SENT], ["date", 9e12], ["ISO", new Date(9e12).toISOString()]];
  const modeleObjet = (o) => ((o.dans === "config" ? famA.config : gsA)[o.champ]) || {};
  const sourcesM = [
    ...cibles.map((m) => ({ id: nomL(m), nom: nomL(m), champ: m.champ, plus: plusDe(m, sonde(m)),
                            plusTemoin: plusDe(m, sonde(m, TEM)),
                            // v2.17.12 — 34e étage : de quoi RECONNAÎTRE une source qui vit DANS
                            // l'objet sondé. Sans ces deux champs, la collision conteneur⊃liste
                            // n'est pas exprimable côté OBJET, et c'est précisément pour ça
                            // qu'elle a vécu treize étages sans être vue.
                            dans: m.dans, conteneur: m.conteneur || null })),
    ...OBJETS.flatMap((o) => FORMES.map(([forme, val]) => ({
      id: `${o.dans}.${o.champ}`, nom: `${o.dans}.${o.champ}{clé→${forme}}`, champ: o.champ,
      // v2.17.13 — 35e étage : sans `dans`, « M est le conteneur de L » se reconnaîtrait au NOM
      // seul, et une clé homonyme dans l'autre racine passerait pour la même structure.
      dans: o.dans, conteneur: null,
      plus: plusDe(o, { ...modeleObjet(o), [SENT]: val }),
      plusTemoin: plusDe(o, { ...modeleObjet(o), [TEM]: val }),
    }))),
  ];

  // Les paires déjà tranchées ailleurs. Une charnière déclarée dans CHARNIERES, ou le tombstone
  // de la liste elle-même (5e étage), ne sont pas des trouvailles.
  const paireDeclaree = (l, m) => CHARNIERES.some((h) => h.champ === l.champ
    && [...Object.keys(h.cfgPlus || {}), ...Object.keys(h.gsPlus || {})].includes(m.champ));
  // v2.17.13 — 35e étage. « M est l'objet qui CONTIENT la liste-cible », reconnu à la
  // DÉCLARATION : même racine, et le `champ` de la source est la clé du conteneur de la cible.
  const collisionL = (l, m) => !!(l.conteneur && m.dans === l.dans && m.champ === l.conteneur.cle);
  let trouvees = 0, paires = 0, collisionsL = 0;
  const rapport = [];

  // ── 27e ÉTAGE : LA TRACE, MESURÉE SUR TOUTE LA SORTIE ──────────────────────
  // v2.17.5 — la piste de la v2.17.4, mot pour mot : « la conjonction pure ne se mesure pas en
  // élargissant le produit […] mais en changeant ce qu'on appelle une "trace". Aujourd'hui la
  // trace, c'est la sonde qui bouge. Une M₁ peut très bien ne pas déplacer la sonde ET changer la
  // SORTIE ailleurs […] Comparer la fusion complète "M₁ avec sentinelle" à "M₁ avec témoin"
  // (normalisée sur la sentinelle) donnerait la liste des M₁ qui laissent une trace SANS être
  // nommées, et c'est elle qu'il faudrait prolonger. »
  //
  // La piste, prise AU PIED DE LA LETTRE, est INERTE — mesuré, pas supposé : sur une fusion NUE
  // (sans sonde), les 107 sources rendent une sortie strictement identique avec la sentinelle et
  // avec le témoin. **0 traceur sur 107**, et ce n'est pas un hasard de fixture, c'est structurel :
  // une règle ne peut voir une sentinelle que si elle la RAPPROCHE d'une valeur présente ailleurs,
  // et une sentinelle injectée dans un seul champ n'existe, par construction, qu'à un seul
  // endroit. Sans un second porteur, il n'y a rien à rapprocher. Un garde-fou qui ne peut pas
  // tomber, exactement ce que la v2.16.96 a appris à ne plus écrire.
  //
  // La question est un cran à côté, et elle se mesure : le second porteur, c'est LA SONDE. La
  // mesure la pose déjà à chacune des 12 246 paires — ce qui manquait, ce n'est pas une injection
  // de plus, c'est de REGARDER AILLEURS QUE LA SONDE. Jusqu'ici le recensement lisait UN booléen
  // (`present(l, litL(out, l))`) : la sonde est-elle là ? Toute autre conséquence de la même
  // injection — un élément VOISIN qui meurt, un champ que la sonde ne touche pas, un scalaire —
  // sortait du champ de vision de tous les étages, puisque les autres posent leurs fixtures SANS
  // sentinelle et ne peuvent pas déclencher une règle qui la cherche.
  //
  // Ce que l'étage ne coûte presque rien : les fusions sont DÉJÀ faites, seul le côté L demande
  // un témoin de plus (le côté objet et le 26e étage en calculent un depuis la v2.17.2).
  //
  // Chaque trace doit être CLASSÉE. Trois familles, et aucune n'est une exemption en prose : le
  // classement se calcule sur les fiches elles-mêmes, donc il périme tout seul si une fiche bouge.
  //   • `tombstone`      — L (ou le tombstone que son régime « sauvetage » injecte) EST le
  //                        tombstone déclaré de M. Le 5e étage tient la règle, vue du côté de M.
  //   • `tombstone daté` — même chose pour les deux tombstones qui sont des OBJETS datés et non
  //                        des listes de marques (`deCompleted`→`completed`, v2.16.82 ;
  //                        `refundedRewards`→`owned`, v2.16.92). Ils ne peuvent pas porter de
  //                        champ `tombstone` dans les fiches de listes, faute d'y être.
  //   • `miroir`         — une fiche CHARNIERES écrite SUR M nomme déjà L comme sa condition.
  //                        C'est la charnière déclarée, vue par l'autre bout.
  // Tout le reste tombe.
  const TOMBSTONES_DATES = { deCompleted: "completed", refundedRewards: "owned" };
  const parNomL = new Map(cibles.map((t) => [nomL(t), t]));
  const famille = (sources, m) => {
    const t = parNomL.get(m.id);
    for (const src of sources) {
      if (!src) continue;
      if (t && t.tombstone === src) return "tombstone";
      if (TOMBSTONES_DATES[src] === m.champ) return "tombstone daté";
    }
    // `miroir` se lit dans les DEUX sens, et le second n'est pas un luxe : dans un triplet, la
    // fiche qui explique la trace est écrite sur la PREMIÈRE source (`customTasks` sauvée par
    // `assignments`, `completed` sauvée par `completedAt`), pas sur la seconde. Ne lire que le
    // premier sens laissait ces deux-là NON CLASSÉES alors qu'elles sont déclarées depuis
    // v2.17.0 et v2.17.4 — un faux positif se corrige dans la QUESTION (v2.16.96).
    for (const h of CHARNIERES) {
      const noms = [...Object.keys(h.cfgPlus || {}), ...Object.keys(h.gsPlus || {})];
      if (h.champ === m.champ && sources.some((src) => src && noms.includes(src))) return "miroir";
      if (sources.includes(h.champ) && noms.includes(m.champ)) return "miroir";
    }
    return null;
  };
  let traces = 0, tracesNonClassees = 0; const rapportTrace = [];
  const traceVue = (nom, sources, m, a, b) => {
    if (a.s === b.s) return false;
    traces++;
    const f = famille(sources, m);
    rapportTrace.push(`[${f || "NON CLASSÉE"}] ${nom}`);
    if (!f) tracesNonClassees++;
    if (!f)
      fail(`27e étage — TRACE NON CLASSÉE : ${nom}. La sonde ne bouge pas, mais la SORTIE de la `
         + `fusion change quand ${m.nom} porte la sentinelle plutôt que le témoin. Une règle lit `
         + `donc l'une de ces structures (${sources.filter(Boolean).join(", ")}) pour décider du `
         + `sort de quelque chose que PERSONNE ne sonde : les autres étages posent leurs fixtures `
         + `sans sentinelle et ne peuvent pas la déclencher. Déclare-la — comme tombstone dans la `
         + `fiche de la liste visée, ou comme charnière dans CHARNIERES — ou ajoute-la à `
         + `TOMBSTONES_DATES si c'est un tombstone daté de plus.`);
    return true;
  };
  // La parité, elle aussi, ne portait que sur la sonde. La sortie complète est le contrôle
  // strictement plus fort, et il est GRATUIT : les deux fusions sont déjà faites. Le chemin lent
  // (re-sérialiser en triant les clés) ne sert qu'à ne PAS crier sur un simple écart d'ordre de
  // clés entre les deux fichiers — ce qui n'a aucune conséquence pour l'app.
  const stable = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v)
    : Array.isArray(v) ? `[${v.map(stable).join(",")}]`
    : `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",")}}`);
  let paritesSortie = 0, sortiesDivergentes = 0;
  // v2.17.5 — prolonger une TRACE (et non plus seulement une morsure) ouvre une porte que le 26e
  // étage n'avait pas : si la seconde source déplace la sonde À ELLE SEULE, le triplet n'est pas
  // une règle à deux étages, c'est la règle à une source du premier passage vue une deuxième fois.
  // Le premier passage a déjà la réponse pour chaque (sonde, régime, source) — on la garde.
  const bougeSeule = new Map();
  // L'étage est passé en paramètre : la même mesure sert au sens mesuré (27e) et au sens inverse
  // (28e), et un message qui annonce le mauvais étage envoie le lecteur chercher au mauvais endroit.
  const pariteSortie = (nom, vc, vs, etage = "27e") => {
    paritesSortie++;
    if (vc.s === vs.s || stable(vc.o) === stable(vs.o)) return;
    sortiesDivergentes++;
    fail(`${etage} étage — ${nom} : client et serveur rendent des SORTIES DIFFÉRENTES sous cette `
       + `injection, alors que la sonde a le même sort des deux côtés. La divergence est donc `
       + `ailleurs que là où le recensement regarde — une règle écrite dans une seule des deux `
       + `copies, qu'aucun contrôle sur la sonde ne peut voir.`);
  };

  // v2.17.4 — 26e étage : les paires qui DÉPLACENT la sonde sont les seules à pouvoir servir
  // de premier étage à une règle qui en exige deux. On les garde au passage.
  const candidats = [];

  for (const l of cibles) {
    const regimes = [{ nom: "rejet", plus: { cfg: {}, gs: {} } }];
    if (l.genre === "objets" && l.tombstone)
      regimes.push({ nom: "sauvetage", plus: plusDe({ champ: l.tombstone, dans: l.dans }, [SENT]) });
    for (const r of regimes) {
      const base = { client: mesure(l, r.plus, client), serveur: mesure(l, r.plus, server) };
      if (base.client === null) continue;
      // Un régime « sauvetage » n'a de sens que si la sonde est bel et bien morte au départ.
      if (r.nom === "sauvetage" && base.client.p !== false) continue;
      for (const m of sourcesM) {
        if (m.id === nomL(l)) continue;
        if (m.champ === l.tombstone) continue;          // tombstone de L : 5e étage
        // v2.17.13 — 35e étage : la paire « liste-cible ⊂ objet-source » n'est plus SAUTÉE, elle
        // est mesurée (`monte` rend au conteneur le bloc que la cible vient de poser). Comptée
        // sur le seul régime « rejet », le seul des deux qui soit posé inconditionnellement —
        // un attendu qui dépendrait de `base.client.p` viendrait du parcours qu'il surveille.
        if (collisionL(l, m) && r.nom === "rejet") collisionsL++;
        paires++;
        const plus = fusionne(r.plus, m.plus);
        const vc = mesure(l, plus, client), vs = mesure(l, plus, server);
        if (vc === null) continue;
        if (vc.p !== vs.p)
          fail(`22e étage — ${nomL(l)} × ${m.nom} (régime ${r.nom}) : la sonde survit côté `
             + `${vc.p ? "client" : "serveur"} et disparaît côté ${vc.p ? "serveur" : "client"}. Une `
             + `règle qui fait dépendre ${nomL(l)} de ${m.nom} n'est écrite que dans une des `
             + `deux copies.`);
        pariteSortie(`${nomL(l)} × ${m.nom} (régime ${r.nom})`, vc, vs);
        const refT = mesure(l, fusionne(r.plus, m.plusTemoin), client);
        if (refT !== null && vc.p === refT.p
            && traceVue(`${nomL(l)} × ${m.nom} (${r.nom})`,
                        [l.champ, ...(r.nom === "sauvetage" ? [l.tombstone] : [])], m, vc, refT))
          candidats.push({ kind: "L", l, r, m, via: "trace" });
        bougeSeule.set(`${nomL(l)}|${r.nom}|${m.nom}`, vc.p !== base.client.p);
        if (vc.p === base.client.p) continue;
        trouvees++;
        rapport.push(`${nomL(l)} × ${m.nom} (${r.nom})`);
        candidats.push({ kind: "L", l, r, m, vc, via: "morsure" });
        if (!paireDeclaree(l, m))
          fail(`22e étage — CHARNIÈRE NON DÉCLARÉE : le sort d'un élément de ${nomL(l)} dépend du `
             + `contenu de ${m.nom} (régime ${r.nom} : la sonde ${vc.p ? "REVIENT" : "DISPARAÎT"} `
             + `quand ${m.nom} porte la même valeur). Les étages des listes posent chaque liste `
             + `SEULE et ne peuvent pas voir cette dépendance : effacer la règle les laisserait `
             + `tous verts. Ajoute la paire à CHARNIERES, avec un TÉMOIN qui prouve qu'elle `
             + `départage au lieu d'emporter toute la liste.`);
      }
    }
  }

  // ── 24e ÉTAGE : le côté L ouvert aux OBJETS ────────────────────────────────
  // v2.17.2 — la piste de la v2.17.1, mot pour mot : « le côté L reste les listes — aucun objet
  // n'est SONDÉ, donc si le sort d'une CLÉ de `deCompleted` dépendait d'ailleurs, rien ne le
  // verrait (les 21 objets sont tous des unions par clé qui ne filtrent pas, mais c'est une
  // LECTURE DU CODE, pas une mesure) ». C'était l'angle mort SYMÉTRIQUE de celui que la v2.17.1
  // vient de fermer côté M : la mesure savait déjà poser une clé-sentinelle dans un objet, elle
  // ne savait pas encore en SONDER un.
  //
  // Dans une liste, la sonde est un ÉLÉMENT et on demande « survit-il ? ». Dans un objet, la
  // sonde est une CLÉ et on demande la même chose. Deux différences qui comptent :
  //   • la clé est posée EN PLUS du contenu que CHAQUE côté porte déjà (`{...gsBase[champ],
  //     [SENT]: val}`), jamais à la place : remplacer l'objet en bloc effacerait le `day`/`week`
  //     des seaux datés et ferait mesurer une forme qui n'existe nulle part (v2.16.86). Et le
  //     contenu vient de la base du côté mesuré, pas de `famA` pour les deux : c'est ce qui fait
  //     que les seaux datés arbitrent vraiment.
  //   • « présente » veut dire clé présente ET valeur non nulle. Sur un objet, le projet écrit
  //     un retrait de DEUX façons (6e étage) : `delete h.placed[ancre]` (`house`) et `null` sur
  //     la clé (`equipped`, `settings`). Ne regarder que `hasOwnProperty` rendrait la moitié des
  //     retraits invisibles.
  //
  // DEUX formes de valeur, pour la même raison que côté M : une charnière rapproche par TEXTE
  // (`equipped[slot] === itemId`) ou par DATE (`Number(deCompleted[k]) > …`, où un texte vaut 0
  // et ne mord jamais). Un seul régime, en revanche : « sauvetage » demande une sonde déjà morte
  // au départ, or aucun objet du projet n'a de tombstone à lui (les 21 sont classés `sansRetrait`,
  // `valeurNulle` ou `derniereEcriture` au 6e étage) — il n'y a rien pour tuer la clé d'abord.
  const nomO = (o) => `${o.dans}.${o.champ}`;
  const litO = (fam, o) => ((o.dans === "config" ? fam.config : fam.gameStates[0])[o.champ]) || {};
  const presentO = (obj) => obj[SENT] !== undefined && obj[SENT] !== null;
  // La clé-sonde est posée EN DERNIER, PAR-DESSUS ce que la source M a écrit — pas avant. Sans
  // ça, une M qui vit DANS l'objet sondé (`config.weeklyQuests.assignments` est une liste nichée
  // dont le conteneur EST `weeklyQuests`) réécrit le conteneur en bloc et efface la sonde : la
  // mesure crie « charnière » sur son propre échafaudage. Quatre faux positifs de cette forme au
  // premier passage. Corriger dans la QUESTION plutôt qu'exempter la paire (v2.16.96) : la paire
  // reste MESURÉE, la sonde survit à l'injection, et ce qui la fait disparaître ne peut plus être
  // que la fusion elle-même.
  //
  // ── 34e ÉTAGE : LA DOCTRINE CI-DESSUS N'ÉTAIT PAS TENUE POUR DEUX PAIRES ───
  // v2.17.12 — la piste de la v2.17.11, point (1). Trois lignes plus haut, la règle de la mesure
  // est écrite noir sur blanc : « la clé est posée EN PLUS du contenu que CHAQUE côté porte déjà,
  // jamais à la place […] et le contenu vient de la base du côté mesuré, pas de `famA` pour les
  // deux : c'est ce qui fait que les seaux datés arbitrent vraiment. » Elle est FAUSSE pour les
  // deux paires où la source M vit DANS l'objet sondé — `config.weeklyQuests` ⊃
  // `config.weeklyQuests.assignments`, `config.weeklyChallenge` ⊃
  // `config.weeklyChallenge.challenges` : le `...plus.cfg` du dessus écrit au PREMIER niveau,
  // donc il remplace le bloc entier du conteneur, sur les DEUX copies, par le bloc de M.
  //
  // MESURÉ avant d'être corrigé (sonde jetable, pas relecture) : sous M, les deux copies portent
  // un `config.weeklyQuests` TEXTUELLEMENT IDENTIQUE — même `generatedForWeek` (« 2026-08-14 »
  // des deux côtés, là où la fixture pose 08-14 contre 08-07), mêmes assignations, même
  // clé-sonde. Idem pour `weeklyChallenge{weekKey}`. Or `generatedForWeek`/`weekKey` EST la clé
  // d'arbitrage du seau daté (v2.16.78) : la mettre à égalité sur les deux copies, c'est retirer
  // au bloc la seule chose que sa propre règle pouvait départager. La paire est alors muette sur
  // l'axe de l'ordre non pas parce que la fusion est saine, mais parce que l'échafaudage a
  // effacé la question — `fixture-identique-controle-inerte`, et le patron jumeau de
  // `cle-arbitrage-jamais-mise-a-egalite`.
  //
  // Ce n'est donc PAS le choix « sauter comme le font les listes » : sauter aurait fermé le
  // garde des deux côtés et laissé la charnière conteneur × liste-contenue mesurée par PERSONNE
  // (`angle-mort-symetrique` à l'envers). Ce n'est pas non plus « garder et écrire pourquoi » :
  // il n'y a rien à écrire en faveur d'une paire inerte. C'est la troisième voie, celle que la
  // v2.16.96 avait déjà prise ici même — corriger dans la QUESTION. `sousCle` dit : de M, ne
  // prends QUE la liste qu'elle vient poser, et laisse à chaque copie le bloc de conteneur
  // qu'elle porte déjà. Les deux copies restent d'accord sur la structure INJECTÉE (la liste
  // sentinelle, identique des deux côtés, comme dans toutes les autres paires) et redeviennent
  // en désaccord sur ce que la fixture leur donne — exactement le régime de toutes les autres.
  const monteO = (savedAt, gsBase, cfgBase, pl, o, val, plus, sousCle = null) => {
    const gs = { ...gsBase, ...plus.gs }, cfg = { ...cfgBase, ...plus.cfg };
    const cible = o.dans === "gameStates" ? gs : cfg;
    if (sousCle) {
      const propre = (o.dans === "gameStates" ? gsBase : cfgBase)[o.champ] || {};
      cible[o.champ] = { ...propre, [sousCle]: (cible[o.champ] || {})[sousCle] };
    }
    cible[o.champ] = { ...(cible[o.champ] || {}), [SENT]: val };
    return mkFam(savedAt, gs, cfg, pl);
  };
  // La collision, reconnue à la DÉCLARATION plutôt qu'au nom : une source-liste dont le
  // `conteneur` est l'objet sondé. `null` partout ailleurs — 4 145 paires sur 4 147 ne changent
  // pas d'un octet.
  const sousCleDe = (o, m) => (m.conteneur && m.dans === o.dans && m.conteneur.cle === o.champ
    ? m.champ : null);
  const mesureO = (o, val, plus, impl, sousCle = null) => {
    const fA = monteO("2026-08-15T12:00:00.000Z", gsA, famA.config, plA, o, val, plus, sousCle);
    const fB = monteO("2026-08-14T12:00:00.000Z", gsB, famB.config, plB, o, val, plus, sousCle);
    try { const out = impl.mergeFamily(fA, fB);
          return { p: presentO(litO(out, o)), s: norm27(out), o: out }; } catch { return null; }
  };
  let sondes = 0;
  for (const o of OBJETS) {
    for (const [forme, val] of FORMES) {
      const vide = { cfg: {}, gs: {} };
      const base = { client: mesureO(o, val, vide, client), serveur: mesureO(o, val, vide, server) };
      if (base.client === null) continue;
      if (base.client.p !== base.serveur.p)
        fail(`24e étage — ${nomO(o)}{clé→${forme}} : la clé-sonde survit côté `
           + `${base.client.p ? "client" : "serveur"} et disparaît côté ${base.client.p ? "serveur" : "client"}, `
           + `SANS qu'aucune autre structure ne la vise. Les deux copies n'arbitrent pas cet objet pareil.`);
      sondes++;
      for (const m of sourcesM) {
        if (m.id === nomO(o)) continue;
        paires++;
        // Le point de comparaison porte le MÊME échafaudage que la mesure, sentinelle exceptée —
        // v2.17.12 : `sousCle` comprise, sinon le témoin et la mesure ne parlent plus du même
        // objet et l'écart mesuré serait celui des deux échafaudages, pas celui de la sentinelle.
        const sc = sousCleDe(o, m);
        const ref = mesureO(o, val, m.plusTemoin, client, sc);
        const vc = mesureO(o, val, m.plus, client, sc), vs = mesureO(o, val, m.plus, server, sc);
        if (vc === null || ref === null) continue;
        if (vc.p !== vs.p)
          fail(`24e étage — ${nomO(o)}{clé→${forme}} × ${m.nom} : la clé-sonde survit côté `
             + `${vc.p ? "client" : "serveur"} et disparaît côté ${vc.p ? "serveur" : "client"}. Une règle qui `
             + `fait dépendre ${nomO(o)} de ${m.nom} n'est écrite que dans une des deux copies.`);
        pariteSortie(`${nomO(o)}{clé→${forme}} × ${m.nom}`, vc, vs);
        bougeSeule.set(`${nomO(o)}|${forme}|${m.nom}`, vc.p !== ref.p);
        if (vc.p === ref.p) {
          if (traceVue(`${nomO(o)}{clé→${forme}} × ${m.nom}`, [o.champ], m, vc, ref))
            candidats.push({ kind: "O", o, forme, val, m, via: "trace" });
          continue;
        }
        trouvees++;
        rapport.push(`${nomO(o)}{clé→${forme}} × ${m.nom} (clé)`);
        candidats.push({ kind: "O", o, forme, val, m, vc, via: "morsure" });
        fail(`24e étage — CHARNIÈRE NON DÉCLARÉE : le sort d'une CLÉ de ${nomO(o)}{clé→${forme}} dépend du contenu `
           + `de ${m.nom} (la clé-sonde ${vc.p ? "REVIENT" : "DISPARAÎT"} quand ${m.nom} porte la même `
           + `valeur). Le 6e étage pose chaque objet SEUL et ne peut pas voir cette dépendance : `
           + `effacer la règle le laisserait vert. Déclare la paire, avec un TÉMOIN qui prouve `
           + `qu'elle départage au lieu d'emporter tout l'objet.`);
      }
    }
  }
  // Ce que le 24e étage NE couvre PAS, écrit noir sur blanc :
  //   • (FERMÉ en v2.17.3) la valeur de la clé-sonde valait un TEXTE ou un NOMBRE, alors que le
  //     projet encode ses dates des DEUX façons — `deCompleted[k]` en millisecondes, `completedAt[k]`
  //     en ISO. La 3e forme `{clé→ISO}` est posée des deux côtés du produit et la réponse est ZÉRO.
  //     Falsifié : une charnière `petNickname[k]` × `completedAt[k]` par `Date.parse` écrite dans
  //     LES DEUX copies est nommée par la paire ISO × ISO — et par elle seule. Avec deux formes,
  //     ou avec la 3e d'un seul côté du produit, l'étage reste VERT sur la même règle.
  //   • aucun régime « sauvetage » côté objet : il demande une sonde déjà morte au départ, et
  //     aucun des 21 objets n'a de tombstone à lui (6e étage). Une règle qui RESSUSCITERAIT une
  //     clé d'objet à cause d'une autre structure ne serait donc pas nommée.
  //   • (FERMÉ en v2.17.4) une charnière qui exige DEUX autres structures à la fois était
  //     invisible : la mesure ne posait qu'une M à la fois, côté liste comme côté objet. Le 26e
  //     étage prolonge les charnières qui ont DÉJÀ déplacé la sonde avec une seconde source, et il
  //     en a nommé une vivante que personne ne surveillait (`pending` × `completed` × `deCompleted`).
  //     Ce qui reste ouvert et se dit en chiffres : il ne prolonge QUE les 5 paires qui bougent, donc
  //     une règle dont le PREMIER étage ne déplace rien à lui seul reste hors d'atteinte.

  // ── 26e ÉTAGE : LES CHARNIÈRES À DEUX SOURCES ──────────────────────────────
  // v2.17.4 — la piste de la v2.17.3, mot pour mot : « une charnière qui exige DEUX autres
  // structures à la fois reste invisible, la mesure ne pose qu'une M à la fois — `completed` ×
  // `completedAt` en est l'exemple vivant […] Il ne se mesure pas en ajoutant une forme mais en
  // posant DEUX sources M à la fois — le produit passerait de `L × M` à `L × M × M'`, soit ~107²
  // combinaisons par sonde, hors d'atteinte en force brute. La version tenable : ne croiser DEUX M
  // que lorsque la première a laissé une trace (la sonde a bougé, mais pas assez pour être
  // nommée), ce qui ramène le second facteur à une poignée de candidats. »
  //
  // « Bougé sans être nommée » se lit dans le code du premier passage, il n'y a rien à deviner :
  // une paire qui déplace la sonde est soit une trouvaille NON déclarée — et alors le fichier
  // tombe déjà, il n'y a pas de second étage à prolonger — soit une charnière DÉCLARÉE, qui a bel
  // et bien bougé et que personne ne signale. Ces cinq-là sont les seuls M₁ qui ouvrent une porte :
  // une M qui ne déplace rien ne peut pas être le premier étage d'une règle à deux étages, puisque
  // le second n'aurait rien à annuler ni à confirmer. Le produit tombe de ~107² à 5 × 107.
  //
  // Ce que l'étage ajoute au premier passage : celui-ci demandait « la sonde bouge-t-elle quand M
  // porte la marque ? ». Le 26e demande « et quand une SECONDE structure la porte AUSSI, bouge-
  // t-elle encore ? ». C'est exactement la forme du seul sauvetage vivant du projet :
  // `deCompleted[k]` condamne une clé de `completed`, `_completedAt[k]` la sauve — mais seulement
  // si le tombstone l'a condamnée d'abord. Aucun passage à une seule M ne peut l'atteindre : sans
  // tombstone la clé survit déjà, donc la date de complétion n'a rien à changer.
  //
  // Le point de comparaison porte le MÊME échafaudage que la mesure, sentinelle exceptée (la
  // leçon du 24e étage, v2.17.2), et il porte AUSSI M₁ : ce qu'on mesure ici n'est pas « M₂
  // change-t-elle quelque chose » — le premier passage l'a déjà demandé — mais « M₂ change-t-elle
  // quelque chose UNE FOIS QUE M₁ a mordu ».
  const clesTouchees = (p) => [...Object.keys(p.cfg || {}).map((k) => `config.${k}`),
                               ...Object.keys(p.gs || {}).map((k) => `gameStates.${k}`)];
  const mesureDe = (c, plus, impl) => (c.kind === "L"
    ? mesure(c.l, plus, impl) : mesureO(c.o, c.val, plus, impl));
  let triples = 0, paires3 = 0, collisions = 0, seules = 0;
  for (const c of candidats) {
    const nomSonde = c.kind === "L" ? nomL(c.l) : `${nomO(c.o)}{clé→${c.forme}}`;
    const premier = c.kind === "L" ? fusionne(c.r.plus, c.m.plus) : c.m.plus;
    // Les clés de premier niveau déjà écrites : celles de M₁ (et du régime), plus celle de la
    // sonde elle-même côté liste.
    const prises = new Set([...clesTouchees(premier),
      ...(c.kind === "L" ? clesTouchees(plusDe(c.l, [])) : [`${c.o.dans}.${c.o.champ}`])]);
    for (const m2 of sourcesM) {
      if (m2.id === c.m.id) continue;                  // les trois formes d'un même objet
      if (c.kind === "L") {
        if (m2.id === nomL(c.l)) continue;
        if (m2.champ === c.l.tombstone) continue;      // tombstone de L : 5e étage
        // v2.17.13 — 35e étage : le garde `conteneur` spécifique est retiré ici aussi. La paire
        // n'est pas pour autant mesurée : la règle GÉNÉRIQUE deux lignes plus bas la saute déjà
        // (M₂ écrit la même clé de premier niveau que la sonde), à la différence près qu'elle la
        // COMPTE dans `collisions` au lieu de la taire. Une couverture qu'on borne se dit.
      } else if (m2.id === nomO(c.o)) continue;
      // Deux injections qui écrivent la MÊME clé de premier niveau : `fusionne` est un spread, la
      // seconde effacerait la première et la mesure retomberait sur « L × M₂ » en le taisant. On
      // saute, et on le COMPTE (une couverture qu'on borne se dit, v2.16.96).
      if (clesTouchees(m2.plus).some((k) => prises.has(k))) { collisions++; continue; }
      if (bougeSeule.get(c.kind === "L" ? `${nomL(c.l)}|${c.r.nom}|${m2.nom}`
                                        : `${nomO(c.o)}|${c.forme}|${m2.nom}`)) { seules++; continue; }
      paires3++;
      const ref = mesureDe(c, fusionne(premier, m2.plusTemoin), client);
      const vc = mesureDe(c, fusionne(premier, m2.plus), client);
      const vs = mesureDe(c, fusionne(premier, m2.plus), server);
      if (vc === null || ref === null) continue;
      if (vc.p !== vs.p)
        fail(`26e étage — ${nomSonde} × ${c.m.nom} × ${m2.nom} : la sonde survit côté `
           + `${vc.p ? "client" : "serveur"} et disparaît côté ${vc.p ? "serveur" : "client"}. Une règle `
           + `qui fait dépendre ${nomSonde} de ${c.m.nom} ET de ${m2.nom} n'est écrite que dans `
           + `une des deux copies.`);
      pariteSortie(`${nomSonde} × ${c.m.nom} × ${m2.nom}`, vc, vs);
      if (vc.p === ref.p) {
        traceVue(`${nomSonde} × ${c.m.nom} × ${m2.nom}`,
                 [c.kind === "L" ? c.l.champ : c.o.champ,
                  ...(c.kind === "L" && c.r.nom === "sauvetage" ? [c.l.tombstone] : []),
                  c.m.champ], m2, vc, ref);
        continue;
      }
      triples++;
      rapport.push(`${nomSonde} × ${c.m.nom} × ${m2.nom} (${c.kind === "L" ? c.r.nom : "clé"})`);
      if (c.kind !== "L" || !paireDeclaree(c.l, m2))
        fail(`26e étage — CHARNIÈRE À DEUX SOURCES NON DÉCLARÉE : une fois que ${c.m.nom} a `
           + `${c.via === "trace" ? "laissé une TRACE hors sonde" : "mordu"}, `
           + `le sort de ${nomSonde} dépend ENCORE du contenu de ${m2.nom} (la sonde `
           + `${vc.p ? "REVIENT" : "DISPARAÎT"} quand ${m2.nom} porte la même valeur). Le premier `
           + `passage ne pose qu'une source à la fois et ne peut pas voir ce second étage : `
           + `effacer la règle le laisserait vert. Ajoute ${m2.champ} à la fiche CHARNIERES de `
           + `${c.kind === "L" ? c.l.champ : "cet objet"}, avec un TÉMOIN qui prouve que la seconde `
           + `source départage au lieu d'emporter toute la liste.`);
    }
  }

  // ── 28e ÉTAGE : LA DIRECTION ───────────────────────────────────────────────
  // v2.17.6 — la piste de la v2.17.5, mot pour mot : « les 12 246 paires sont toutes mesurées
  // copie fraîche en base, périmée en incoming ; une règle écrite dans un seul sens, le patron
  // exact des quatre quadrants de `mergeGS`, laisserait tout le recensement vert. Le coût est
  // connu et il est brutal — refaire le produit dans l'autre sens le DOUBLE — et il ne se
  // contourne PAS en ne mesurant que les 23 paires qui bougent déjà : une règle qui ne mord que
  // dans le sens non mesuré n'a, par définition, laissé aucune trace dans le sens mesuré. Ce qui
  // se négocie, en revanche, c'est le PRODUIT : le sens inverse n'a pas besoin des 3 formes ni des
  // deux régimes pour dire s'il existe une asymétrie, une seule forme et le régime `rejet`
  // suffisent à répondre OUI ou NON, et c'est seulement si la réponse est OUI qu'il faut payer le
  // produit complet. »
  //
  // « L'autre sens », c'est l'ORDRE DES ARGUMENTS, et rien d'autre : les deux copies portent la
  // MÊME injection (`monte` pose la sonde et la source des deux côtés), donc inverser revient à
  // demander `mergeFamily(fB, fA)` au lieu de `mergeFamily(fA, fB)`. Ce que ça change n'est pas
  // cosmétique : `mergeFamily` calcule `preferIncoming = isNewer(incoming.savedAt, base.savedAt)`,
  // donc le sens mesuré depuis le 22e étage a TOUJOURS valu `preferIncoming === false`, et les 36
  // endroits de `mergeGS` qui lisent ce drapeau n'ont jamais été exercés que par leur branche
  // « base gagne ». Le 18e étage connaît les quatre quadrants — mais il ne leur pose qu'une seule
  // question, celle des valeurs INVENTÉES. Le sort d'un ÉLÉMENT, lui, n'a jamais été mesuré que
  // dans un sens.
  //
  // Le produit RÉDUIT, et pourquoi chaque coupe est sans conséquence pour la question posée :
  //   • une seule FORME de clé côté objet (`texte`). Les trois formes existent parce qu'une
  //     charnière DATÉE ne mord que si les deux bouts parlent le même encodage (v2.17.3) — c'est
  //     une question d'ENCODAGE, pas de sens. Une règle asymétrique qui ne mordrait que par
  //     `Date.parse` mordrait dans les deux sens ou dans aucun ; ce que l'étage cherche ici, c'est
  //     l'existence d'un ÉCART entre les deux sens, pas son catalogue complet.
  //   • le régime `sauvetage` sauté. Il demande une sonde déjà tombstonée, donc il ne s'applique
  //     qu'aux 21 listes d'objets, et il pose une source de PLUS (le tombstone) : c'est le produit
  //     complet, pas le sondage d'existence.
  // Ce que la réduction coûte est écrit plus bas, en toutes lettres, et se paiera le jour où la
  // réponse passera à OUI.
  //
  // Le point de comparaison est le MÊME des deux côtés, sinon la mesure compare deux questions :
  // côté liste le premier passage juge la morsure contre la fusion SANS source (`base.client.p`),
  // côté objet contre le TÉMOIN (`ref.p`, v2.17.2). Le sens inverse reprend exactement le même
  // point de comparaison sur chaque côté — sinon un écart de MÉTHODE se lirait comme un écart de
  // SENS (v2.16.88 : le relevé qui partage l'angle mort de ce qu'il surveille ne produit aucun
  // signal ; ici l'inverse, un relevé qui change de question produit un faux signal).
  //
  // Les DEUX copies sont mesurées dans le sens inverse, et ce n'est pas un luxe : l'asymétrie se
  // lit sur le client, or une règle écrite dans le SEUL serveur et qui ne mord que dans le sens
  // inverse ne déplacerait jamais la sonde côté client — ni à l'aller ni au retour — et l'étage
  // resterait muet. La parité du sens inverse ferme ce trou, et elle rend la lecture par le seul
  // client COMPLÈTE : les deux parités (aller, déjà mesurée au 22e/24e étage, et retour) donnent
  // `mordFwd(client) === mordFwd(serveur)` et `mordInv(client) === mordInv(serveur)`.
  const mesureInv = (l, plus, impl) => {
    const fA = monte("2026-08-15T12:00:00.000Z", gsA, famA.config, plA, l, sonde(l), plus);
    const fB = monte("2026-08-14T12:00:00.000Z", gsB, famB.config, plB, l, sonde(l), plus);
    try { const out = impl.mergeFamily(fB, fA);   // ← périmée en BASE, fraîche en INCOMING
          return { p: present(l, litL(out, l)), s: norm27(out), o: out }; } catch { return null; }
  };
  const mesureOInv = (o, val, plus, impl) => {
    const fA = monteO("2026-08-15T12:00:00.000Z", gsA, famA.config, plA, o, val, plus);
    const fB = monteO("2026-08-14T12:00:00.000Z", gsB, famB.config, plB, o, val, plus);
    try { const out = impl.mergeFamily(fB, fA);
          return { p: presentO(litO(out, o)), s: norm27(out), o: out }; } catch { return null; }
  };
  const [[FORME_INV]] = FORMES;                        // « texte » — la première des trois
  const estForme = (m, f) => m.nom.endsWith(`{clé→${f}}`);
  const sourcesInv = sourcesM.filter((m) => !m.nom.includes("{clé→") || estForme(m, FORME_INV));
  let pairesInv = 0, asymetries = 0, basesInv = 0, basesAsym = 0;
  const rapportInv = [];
  const asymVue = (nom, mordFwd, mordInv, declaree, quoi) => {
    if (!!mordFwd === !!mordInv) return;
    asymetries++;
    rapportInv.push(`${nom} — mord ${mordInv ? "à l'ENVERS seulement" : "à l'ENDROIT seulement"}`);
    if (declaree) return;
    fail(`28e étage — CHARNIÈRE ASYMÉTRIQUE : ${nom}. ${quoi} ${mordInv
        ? "quand la copie PÉRIMÉE est en base (preferIncoming = vrai), et ne bouge pas dans le sens "
          + "que tout le recensement mesure"
        : "dans le sens mesuré, et plus du tout quand les deux copies sont échangées"}. Une règle `
       + `de fusion qui ne vaut que dans un sens est le patron exact des quatre quadrants de `
       + `mergeGS (18e étage) : selon que la sync tourne côté client (mergeFamily(local, remote)) `
       + `ou côté serveur (mergeFamily(existant, PUT)), la même donnée n'a pas le même sort. `
       + `Écris la règle dans les DEUX branches de preferIncoming, ou déclare la paire dans `
       + `CHARNIERES si l'asymétrie est voulue.`);
  };

  // (a) la sonde SEULE, dans les deux sens. Avant toute source : si le sort de l'élément dépend
  // déjà de l'ordre des arguments, la comparaison paire par paire ci-dessous mesurerait un écart
  // qui n'a rien à voir avec la source posée.
  for (const l of cibles) {
    const vide = { cfg: {}, gs: {} };
    const bf = mesure(l, vide, client), bi = mesureInv(l, vide, client);
    if (bf === null || bi === null) continue;
    basesInv++;
    if (bf.p === bi.p) continue;
    basesAsym++;
    fail(`28e étage — ${nomL(l)} : la sonde ${bf.p ? "survit" : "disparaît"} quand la copie fraîche `
       + `est en base, et ${bi.p ? "survit" : "disparaît"} quand les deux copies sont échangées, `
       + `SANS qu'aucune autre structure ne soit posée. Les deux copies portent pourtant la MÊME `
       + `liste : c'est donc la règle de ${nomL(l)} elle-même qui lit preferIncoming pour décider `
       + `du sort d'un élément.`);
  }
  for (const l of cibles) {
    const r = { nom: "rejet", plus: { cfg: {}, gs: {} } };
    const bi = mesureInv(l, r.plus, client);
    if (bi === null) continue;
    for (const m of sourcesInv) {
      if (m.id === nomL(l)) continue;
      if (m.champ === l.tombstone) continue;
      if (collisionL(l, m)) collisionsL++;              // v2.17.13 — 35e étage
      const plus = fusionne(r.plus, m.plus);
      const ic = mesureInv(l, plus, client), is = mesureInv(l, plus, server);
      if (ic === null || is === null) continue;
      pairesInv++;
      if (ic.p !== is.p)
        fail(`28e étage — ${nomL(l)} × ${m.nom} (sens INVERSE) : la sonde survit côté `
           + `${ic.p ? "client" : "serveur"} et disparaît côté ${ic.p ? "serveur" : "client"}. Une `
           + `règle qui fait dépendre ${nomL(l)} de ${m.nom} n'est écrite que dans une des deux `
           + `copies — et seul le sens inverse la fait mordre.`);
      pariteSortie(`${nomL(l)} × ${m.nom} (sens INVERSE)`, ic, is, "28e");
      asymVue(`${nomL(l)} × ${m.nom} (rejet)`,
              bougeSeule.get(`${nomL(l)}|rejet|${m.nom}`), ic.p !== bi.p,
              paireDeclaree(l, m),
              `Le sort d'un élément de ${nomL(l)} dépend du contenu de ${m.nom}`);
    }
  }
  for (const o of OBJETS) {
    const val = FORMES[0][1];
    const vide = { cfg: {}, gs: {} };
    const bf = mesureO(o, val, vide, client), bi = mesureOInv(o, val, vide, client);
    if (bf !== null && bi !== null) {
      basesInv++;
      if (bf.p !== bi.p) {
        basesAsym++;
        fail(`28e étage — ${nomO(o)}{clé→${FORME_INV}} : la clé-sonde ${bf.p ? "survit" : "disparaît"} `
           + `quand la copie fraîche est en base, et ${bi.p ? "survit" : "disparaît"} quand les deux `
           + `copies sont échangées, SANS qu'aucune autre structure ne soit posée. C'est la règle de `
           + `${nomO(o)} elle-même qui lit preferIncoming pour décider du sort d'une CLÉ.`);
      }
    }
    for (const m of sourcesInv) {
      if (m.id === nomO(o)) continue;
      const ic = mesureOInv(o, val, m.plus, client), is = mesureOInv(o, val, m.plus, server);
      const ir = mesureOInv(o, val, m.plusTemoin, client);   // même point de comparaison qu'à l'aller
      if (ic === null || is === null || ir === null) continue;
      pairesInv++;
      if (ic.p !== is.p)
        fail(`28e étage — ${nomO(o)}{clé→${FORME_INV}} × ${m.nom} (sens INVERSE) : la clé-sonde `
           + `survit côté ${ic.p ? "client" : "serveur"} et disparaît côté `
           + `${ic.p ? "serveur" : "client"}. Une règle qui fait dépendre ${nomO(o)} de ${m.nom} `
           + `n'est écrite que dans une des deux copies — et seul le sens inverse la fait mordre.`);
      pariteSortie(`${nomO(o)}{clé→${FORME_INV}} × ${m.nom} (sens INVERSE)`, ic, is, "28e");
      asymVue(`${nomO(o)}{clé→${FORME_INV}} × ${m.nom} (clé)`,
              bougeSeule.get(`${nomO(o)}|${FORME_INV}|${m.nom}`), ic.p !== ir.p, false,
              `Le sort d'une CLÉ de ${nomO(o)} dépend du contenu de ${m.nom}`);
    }
  }
  console.log(`    (sens INVERSE — ${basesInv} sondes seules (${basesAsym} asymétrique(s)), puis `
    + `${pairesInv} paires (produit réduit : ${sourcesInv.length} sources, 1 forme `
    + `« ${FORME_INV} », régime rejet) = ${asymetries} charnière(s) asymétrique(s))`);
  if (process.env.DBG28 && rapportInv.length) console.log("      " + rapportInv.join("\n      "));
  // Ce que le 28e étage NE couvre PAS, écrit noir sur blanc :
  //   • **le produit est RÉDUIT, et la réduction se dit en chiffres.** Une seule des trois formes
  //     de clé (`texte`) des DEUX côtés, et le seul régime `rejet` : une charnière asymétrique qui
  //     ne mordrait que par un rapprochement DATÉ (`date`/`ISO`, v2.17.3), ou seulement en régime
  //     `sauvetage`, reste hors d'atteinte. C'est assumé, et c'est le marché que la piste posait :
  //     le sens inverse n'a pas besoin du produit complet pour dire s'il EXISTE une asymétrie.
  //     Le coût est MESURÉ, pas estimé : le fichier passe de 89 s à 115 s sur la même machine et
  //     la même passe, soit **+26 s** pour 4 147 paires. Rendre un facteur (les deux formes datées,
  //     ou le régime `sauvetage`) coûte du même ordre à chaque fois : le produit complet à
  //     l'envers vaut donc bien le « ~60 s de plus, le produit DOUBLÉ » que la v2.17.5 annonçait.
  //     Le marché a tenu — 26 s ont suffi à répondre NON. Le jour où la réponse passe à OUI, on paie.
  //   • **le sens inverse ne repose que la question de la SONDE** (l'élément survit-il ?) et celle
  //     de la parité de SORTIE. Il ne repose ni celle du 27e étage (une TRACE ailleurs que sur la
  //     sonde), ni celle du 26e (une seconde source). Une règle à la fois asymétrique ET sans
  //     morsure sur la sonde n'est donc pas nommée.
  //   • **les deux sens mesurés partagent le MÊME écart de `savedAt`**, et c'est le vrai angle mort
  //     qui reste. `isNewer` compare avec un `>` STRICT (src/merge.js:29) : à `savedAt` ÉGAL,
  //     `preferIncoming` vaut `false` dans LES DEUX ordres d'arguments. Les deux sens que cet étage
  //     compare retombent donc sur la même branche, et ce qui tranche n'est plus la préférence mais
  //     l'ORDRE seul — le patron exact de la v2.16.89 (« chaque côté met SA copie en `a`, la
  //     divergence ne se referme jamais »). Le 18e étage ne le voit pas non plus : il compare
  //     `(A,B,vrai)`↔`(B,A,faux)` et `(A,B,faux)`↔`(B,A,vrai)`, jamais `(A,B,faux)`↔`(B,A,faux)`.
  //     Et ce cas n'est pas exotique : deux appareils qui poussent dans la même seconde, ou un
  //     serveur qui renvoie l'estampille qu'il vient de recevoir, y tombent.


  // ── 29e ÉTAGE : L'ÉGALITÉ ──────────────────────────────────────────────────
  // v2.17.7 — la piste de la v2.17.6, mot pour mot : « les deux sens mesurés partagent le MÊME
  // écart de `savedAt`, et c'est le vrai angle mort qui reste. `isNewer` compare avec un `>`
  // STRICT (src/merge.js:29) : à `savedAt` ÉGAL, `preferIncoming` vaut `false` dans LES DEUX
  // ordres d'arguments — les deux sens que le 28e étage compare retombent sur la même branche, et
  // ce qui tranche n'est plus la préférence mais l'ORDRE seul, le patron exact de la v2.16.89.
  // Le 18e étage ne le voit pas non plus : il compare `(A,B,vrai)`↔`(B,A,faux)` et
  // `(A,B,faux)`↔`(B,A,vrai)`, jamais `(A,B,faux)`↔`(B,A,faux)`. Le mesurer ne demande pas un
  // produit de plus, seulement de rejouer la passe réduite du 28e étage avec `savedAt` identique
  // des deux côtés. »
  //
  // Le quadrant `(A,B,faux)`↔`(B,A,faux)` est le SEUL que personne ne pose, et c'est celui que la
  // vraie vie produit : deux appareils qui poussent dans la même seconde, ou un serveur qui
  // renvoie l'estampille qu'il vient de recevoir. Les 22e/24e étages mesurent `(A,B,faux)`, le
  // 28e mesure `(B,A,vrai)`, le 18e apparie les quadrants CROISÉS. À égalité, les deux appelants
  // — `mergeFamily(local, distant)` sur l'appareil A et `mergeFamily(local, distant)` sur
  // l'appareil B, qui est le même appel avec les arguments échangés — prennent la MÊME branche de
  // `preferIncoming`, et rien d'autre que la POSITION ne les départage.
  //
  // Ce que la mesure isole, et pourquoi ce n'est pas du bruit : la sonde est posée IDENTIQUE sur
  // les deux copies (`monte`/`monteO` écrivent le même bloc des deux côtés), et la source M
  // aussi. Les deux copies sont donc D'ACCORD sur l'élément mesuré. Si son sort change quand on
  // échange les arguments, ce n'est pas « les deux copies portent des contenus différents » —
  // c'est que la règle décide du sort d'un élément que les deux copies partagent en regardant
  // QUI est en `a`. Comparer les SORTIES COMPLÈTES à l'envers, en revanche, serait du bruit pur :
  // `famA` et `famB` sont bâties pour se contredire partout, et tout champ scalaire arbitré
  // « le frais gagne, sinon la base » diverge trivialement à égalité. La question est posée sur
  // la sonde, pas sur la sortie (v2.16.96 : corriger dans la QUESTION).
  //
  // Les DEUX copies sont mesurées, pour la raison exacte du 28e étage : une règle écrite dans le
  // SEUL serveur et qui n'arbitre par l'ordre qu'à égalité ne déplacerait jamais la sonde côté
  // client, et l'étage resterait muet. On compare donc les quatre `p` : client-endroit,
  // client-envers, serveur-endroit, serveur-envers.
  const EQ_ST = "2026-08-15T12:00:00.000Z";
  const mesureEq = (l, plus, impl, inv) => {
    const fA = monte(EQ_ST, gsA, famA.config, plA, l, sonde(l), plus);
    const fB = monte(EQ_ST, gsB, famB.config, plB, l, sonde(l), plus);
    // v2.17.13 — 35e étage, le jumeau côté LISTE du garde-fou d'échafaudage du 34e, posé UNE
    // fois par paire (client, à l'ENDROIT). Le 34e demande « les deux copies portent-elles un
    // bloc DISTINCT ? » ; celui-ci demande la question d'AVANT, et c'est elle qui manquait : la
    // sonde est-elle seulement DANS la fixture ? Une source qui écrit la clé du conteneur
    // effaçait la liste-sentinelle en entier, sur les deux copies — la paire répondait alors
    // « même sort » quoi qu'il arrive à la fusion, et son silence ne parlait que d'elle.
    if (impl === client && !inv && l.conteneur) {
      const dedansA = present(l, litL(fA, l)), dedansB = present(l, litL(fB, l));
      if (!dedansA || !dedansB) {
        sondeEffacee++;
        fail(`35e étage — SONDE EFFACÉE PAR L'ÉCHAFAUDAGE : ${nomL(l)}, sous la source posée, ne `
           + `porte plus l'élément-sentinelle ${!dedansA && !dedansB ? "sur AUCUNE des deux copies"
                : `côté ${dedansA ? "B" : "A"}`}. La fixture a remplacé le bloc du conteneur au `
           + `lieu de le côtoyer : quelle que soit la règle de ${nomL(l)}, la mesure ne peut plus `
           + `rendre que « la sonde a disparu », et ce que cette paire dit ne vient pas de la `
           + `fusion. Rends au conteneur le bloc que la CIBLE pose (voir \`monte\`, 35e étage) au `
           + `lieu de le remplacer.`);
      }
    }
    try { const out = inv ? impl.mergeFamily(fB, fA) : impl.mergeFamily(fA, fB);
          return { p: present(l, litL(out, l)), s: norm27(out) }; } catch { return null; }
  };
  const mesureOEq = (o, val, plus, impl, inv, sousCle = null) => {
    const fA = monteO(EQ_ST, gsA, famA.config, plA, o, val, plus, sousCle);
    const fB = monteO(EQ_ST, gsB, famB.config, plB, o, val, plus, sousCle);
    // v2.17.12 — 34e étage, le garde-fou de l'échafaudage lui-même, posé UNE fois par paire
    // (côté client, à l'ENDROIT). La question de l'ordre — « la clé-sonde survit-elle quand A est
    // en base et disparaît-elle quand on échange ? » — n'a de sens que si les deux copies portent
    // un bloc-cible DISTINCT : la sonde et la source sont posées identiques des deux côtés
    // EXPRÈS, et c'est le contenu que chaque copie porte déjà qui donne à la règle du bloc de
    // quoi trancher. Si l'échafaudage rend les deux blocs textuellement égaux, la paire répond
    // « même sort » quoi qu'il arrive à la fusion : elle ne surveille plus rien et son zéro ne
    // parle que d'elle. C'est le trou exact que le 34e étage vient de fermer ; ce contrôle est ce
    // qui empêchera une prochaine nuit de le rouvrir en silence, en `plus` de la correction.
    if (impl === client && !inv) {
      const bA = JSON.stringify((o.dans === "gameStates" ? fA.gameStates[0] : fA.config)[o.champ]);
      const bB = JSON.stringify((o.dans === "gameStates" ? fB.gameStates[0] : fB.config)[o.champ]);
      if (bA === bB) {
        copiesJumelles++;
        fail(`34e étage — ÉCHAFAUDAGE INERTE : ${nomO(o)}, sous la source posée, porte un bloc `
           + `TEXTUELLEMENT IDENTIQUE sur les deux copies (${bA.slice(0, 120)}…). La question de `
           + `l'ordre est alors répondue par la fixture, pas par la fusion : quelle que soit la `
           + `règle de ${nomO(o)}, échanger deux entrées égales rend la même sortie, et le `
           + `« 0 arbitrage par l'ordre seul » de cette paire ne mesure rien. Rends au bloc ce que `
           + `chaque copie porte déjà (voir \`sousCle\` au 34e étage) au lieu de le remplacer.`);
      }
    }
    try { const out = inv ? impl.mergeFamily(fB, fA) : impl.mergeFamily(fA, fB);
          // v2.17.8 — 30e étage : la SIGNATURE manquait de ce côté-ci. `mesureO` (23e étage) la
          // rend depuis toujours, `mesureOEq` non — et c'est exactement ce qui rendait le côté
          // objet inconfrontable au régime mesuré. Voir `memeQueAvantO` plus bas.
          return { p: presentO(litO(out, o)), s: norm27(out) }; } catch { return null; }
  };
  let pairesEq = 0, ordreSeul = 0, basesEq = 0, basesOrdre = 0, memeSortie = 0, pariteEq = 0;
  let copiesJumelles = 0, collisionsO = 0, sondeEffacee = 0;
  let basesEqS = 0, basesOrdreS = 0, basesParite = 0;
  let memeSortieBase = 0;
  const rapportEq = [];
  const ordreVu = (nom, fe, ie, quoi, deja = "") => {
    if (fe.p === ie.p) return;
    ordreSeul++;
    rapportEq.push(`${nom} — survit ${fe.p ? "à l'ENDROIT" : "à l'ENVERS"} seulement (savedAt ÉGAL)`);
    fail(`29e étage — ARBITRAGE PAR L'ORDRE SEUL : ${nom}. À \`savedAt\` ÉGAL — donc avec `
       + `\`preferIncoming\` FAUX des deux côtés, la même branche — ${quoi} survit quand `
       + `${fe.p ? "la copie A" : "la copie B"} est en base et disparaît quand les deux copies sont `
       + `échangées. Les deux copies portent pourtant la MÊME sonde : ce n'est donc pas la fraîcheur `
       + `qui tranche, c'est la POSITION de l'argument. Les deux appareils qui se synchronisent dans `
       + `la même seconde gardent chacun un sous-ensemble différent, et rien ne le leur dit `
       + `(v2.16.89). Départage sur le CONTENU (union, max, id) plutôt que sur \`a\` ?? \`b\`, ou `
       + `rends \`isNewer\` total sur l'égalité.${deja}`);
  };
  // Ce que le 29e étage suppose, et qui doit être VÉRIFIÉ, pas supposé : que le régime « savedAt
  // ÉGAL » ne diffère du régime mesuré depuis le 22e étage que par l'ORDRE des arguments. Le
  // premier jet posait ici une autre question — « cette charnière ne mord-elle qu'à égalité ? » —
  // et cette question-là est INERTE PAR CONSTRUCTION : `savedAt` n'est lu nulle part ailleurs que
  // par les trois `isNewer(incoming.savedAt, base.savedAt)` de `mergeFamily` (src/merge.js:508,
  // 573, 867), et ce booléen vaut `false` AUSSI BIEN dans le régime mesuré (la base est fraîche,
  // l'incoming périmé) qu'à égalité (le `>` est strict). Les deux régimes rendent donc la même
  // fusion, la comparaison comparait une grandeur à elle-même, et son « 0 charnière conditionnée
  // à la fraîcheur » était un zéro qui ne pouvait pas tomber — mesuré avant de le retirer : 2803
  // paires, 0 sortie différente (v2.17.7).
  //
  // La question est donc RETOURNÉE plutôt qu'exemptée (v2.16.96) : au lieu de chercher une
  // charnière que la construction interdit, on EXIGE l'identité qui la rend impossible. Ce
  // contrôle-là peut tomber — le jour où une règle lira `savedAt` autrement que par `isNewer`
  // (un rapprochement à la minute, une fenêtre de tolérance, un `>=`), le raisonnement de tout
  // l'étage s'écroule, et c'est ici que ça se verra plutôt que dans un zéro rassurant.
  // ── 31e ÉTAGE : L'IDENTITÉ N'ÉTAIT PROUVÉE QUE SUR UNE COPIE ────────────────
  // v2.17.9 — la piste de la v2.17.8 demandait d'instruire DEUX réserves avant d'appliquer son
  // point (a) (« cesser de poser le côté ENDROIT à égalité »). La réserve (i), mot pour mot :
  // « `memeQueAvant`/`memeQueAvantO` confrontent justement le `fc` ENDROIT — l'identité qui les
  // rend redondantes est aussi ce qui les alimente, et il faut décider si le contrôle de
  // couverture survit tel quel ou change de forme. »
  //
  // En l'instruisant, l'identité s'est révélée plus étroite que ce que tout le monde en disait.
  // Le 29e étage mesure QUATRE fusions par paire — client-endroit, client-envers,
  // serveur-endroit, serveur-envers — et n'en confrontait qu'UNE au régime mesuré : `fc`, le
  // CLIENT. `fs` — le côté ENDROIT du SERVEUR — n'a jamais été confronté à rien. « ÉGAL ≡
  // mesuré » était donc une phrase vraie pour une moitié de ce qu'elle prétend couvrir, et c'est
  // le même patron `angle-mort-symetrique` que la v2.17.8 a fermé sur l'axe liste/objet, reparu
  // ici sur l'axe client/serveur. Une nuit qui aurait appliqué (a) sur la foi de cette phrase
  // aurait retiré `fs` sans qu'aucune mesure ne l'ait jamais couvert.
  //
  // Fermer ce trou coûte une fusion de plus par paire, et la piste espérait la financer en
  // libérant du temps ailleurs. **Les deux façons de la financer ont été MESURÉES, et aucune ne
  // rapporte.** Le régime mesuré des deux copies (`vc`/`vs`) est déjà calculé par les 22e/23e
  // étages sur des entrées identiques : le confronter REFAIT la fusion, et un mémo devrait donc
  // rendre les deux côtés gratuits. Écrit, mesuré, retiré — 24,29 s CPU avec le mémo contre
  // 23,90 s en fusions fraîches, soit 1,6 % d'écart sur une machine dont le mur d'horloge varie
  // de 25 % d'une passe à l'autre : les 8 294 fusions évitées coûtent, en `Map` et en chaînes
  // retenues, à peu près ce qu'elles coûtaient à calculer. Un mémo qui ne rapporte rien mais
  // couple ce contrôle aux boucles des 22e/23e étages n'est pas un gain, c'est une dépendance de
  // plus ; la version simple est gardée et l'espoir de la piste est écrit ici comme MESURÉ FAUX,
  // pour qu'aucune nuit ne le réécrive. Le vrai prix de l'étage est donc net : 21,07 s quand
  // l'identité ne couvrait qu'une copie, 23,90 s quand elle les couvre toutes les deux (+13,4 %).
  const identite = (etage, quoi, cote, eq, mes, queue = "", nue = false) => {
    if (mes === undefined || mes === null || !eq) return;
    // v2.17.11 — 33e étage : les sondes SEULES ont leur PROPRE compteur. Le mettre en commun
    // avec `memeSortie` aurait fait partager au relevé le plafond de ce qu'il surveille
    // (`releve-partage-le-plafond-surveille`) : le contrôle du 31e attend `pairesEq × 2`, un
    // appel de plus l'aurait rendu ROUGE, et le rendre tolérant aurait éteint sa question.
    if (nue) memeSortieBase++; else memeSortie++;
    if (mes === eq.s) return;
    fail(`${etage}e étage — RÉGIME ÉGAL ≠ RÉGIME MESURÉ : ${quoi}, à l'ENDROIT, côté ${cote}, la `
       + `fusion ne rend pas la même sortie selon que les deux estampilles sont ÉGALES ou que la `
       + `base est la plus fraîche. Or les deux passent par la même branche : \`isNewer\` est le `
       + `SEUL lecteur de \`savedAt\` (src/merge.js:508, 573, 867) et il rend \`false\` dans les `
       + `deux cas. Une divergence ici veut dire qu'une règle lit \`savedAt\` autrement — et alors `
       + `tout le recensement des 22e-30e étages, qui ne mesure QU'UN écart d'estampille, a un `
       + `angle mort de plus.${queue}`);
  };
  //
  // ── LE VERDICT SUR LE POINT (a), ET POURQUOI IL EST ÉCRIT ICI ──────────────
  // Le point (a) de la piste — « ne mesurer à égalité que l'ENVERS » — est REFUSÉ, et la raison
  // tient en une ligne de ce fichier plutôt qu'en un paragraphe du journal : l'identité s'écrit
  // `identite(29, …, fc, mes.c)`. `fc` est le côté ENDROIT ; `mes.c` est le régime mesuré. Les
  // retirer l'un OU l'autre ne laisse qu'une seule grandeur, et le test devient `mes.c === mes.c`
  // — vrai pour toujours, quoi qu'il arrive à la fusion. C'est exactement `compteur-de-securite-
  // qui-ne-peut-pas-tomber` et `fixture-identique-controle-inerte`, et le contrôle de couverture
  // ci-dessous ne peut PAS le voir : `memeSortie` s'incrémenterait pareil, le compte tomberait
  // juste, et le build resterait vert en ne surveillant plus rien.
  //
  // Le côté ENDROIT à égalité n'est donc pas « payé pour rien » : il est le SEUL opérande non
  // redondant de la seule mesure qui garde vraie la phrase dont tous les étages 22e-31e
  // dépendent — « `isNewer` est le seul lecteur de `savedAt` ». Une redondance qui n'existe que
  // parce qu'on la vérifie ne peut pas servir d'argument pour cesser de la vérifier ; le jour où
  // on cesse, elle cesse d'être vraie sans que personne ne l'apprenne. `ordreVu` le dit d'une
  // autre façon : il compare l'ENDROIT à l'ENVERS, et une question sur l'ORDRE ne se pose pas
  // avec un seul ordre.
  //
  // Ce qui RESTE ouvert de la piste, et qui n'est pas tranché ici : la réserve (ii) — les deux
  // autres formes de clé (`date`, `ISO`) et le régime `sauvetage`, que le produit réduit n'a
  // jamais posés ni au 28e, ni au 29e, ni au 30e. Elle est maintenant SANS financement : la
  // réserve (i) montre qu'il n'y avait pas de temps à récupérer ici, ni en coupant (a), ni en
  // mémorisant. Ces axes devront être payés, ou ne pas être posés — pas espérés gratuits.
  // ── 33e ÉTAGE : L'IDENTITÉ N'A JAMAIS ÉTÉ POSÉE SUR L'ENTRÉE NUE ───────────
  // v2.17.11 — la piste de la v2.17.10, point (1), mot pour mot : « `memeQueAvant`/
  // `memeQueAvantO` ne sont appelées que dans les boucles de PAIRES — la sonde SEULE, elle,
  // n'est jamais confrontée au régime mesuré, ni côté client ni côté serveur. […] l'identité
  // « ÉGAL ≡ mesuré » vaut pour 8 294 paires et pour ZÉRO base, alors que les bases viennent de
  // recevoir leurs propres crieurs et que rien ne dit que leurs conclusions se transportent. »
  //
  // Ce n'est PAS le même trou que la jambe 1 du 32e étage, et la différence tient à l'ENTRÉE.
  // Là-bas, ajouter `ordreVu(fs, is)` posait un crieur redondant parce que le treillis des
  // quatre `p` de la MÊME paire le rendait muet par construction. Ici, la grandeur confrontée
  // n'est pas un quatrième booléen de la même fusion : c'est une fusion sur une entrée que les
  // boucles de paires ne posent JAMAIS. Leur `plus` vaut toujours `fusionne(vide, m.plus)`
  // avec `m.plus` non vide — 65 sources, aucune vide. L'entrée NUE (`{cfg:{},gs:{}}`, la seule
  // structure posée étant la sonde elle-même) n'apparaît nulle part dans les 8 294 paires, et
  // une règle qui lirait `savedAt` autrement que par `isNewer` sur un chemin que seule
  // l'entrée nue emprunte serait invisible à tous les étages précédents. L'identité des 29e-31e
  // dit « pour toute entrée PORTANT une source M » ; elle ne dit rien de l'entrée sans M.
  //
  // Pourquoi ça compte maintenant plutôt qu'un jour : depuis le 32e étage, la sonde seule n'est
  // plus un intermédiaire de calcul, elle CRIE (arbitrage par l'ordre client, arbitrage par
  // l'ordre serveur, parité entre copies) et elle ANNOTE (⚠️ ATTRIBUTION, qui redirige 750 cris
  // de paire vers la structure). Toutes ces conclusions sont tirées dans le régime « savedAt
  // ÉGAL », et elles ne valent pour l'app que si ce régime rend, sur l'entrée nue, la même
  // fusion que le régime mesuré des 22e-30e étages. Personne ne l'avait vérifié : c'est le
  // patron `tolerance-adossee-au-mauvais-etage` — la phrase citée existe, mais elle a été
  // prouvée sur d'autres entrées que celles dont on se sert.
  const QUEUE_B = ` Et ici AUCUNE source n'est posée : le \`plus\` est l'entrée NUE, que les`
    + ` boucles de PAIRES ne posent jamais (leur \`plus\` porte toujours une source M). Ce cri`
    + ` dit donc que l'identité des 29e-31e étages ne se transporte PAS à l'entrée nue — et`
    + ` avec elle tombe tout ce que la sonde SEULE conclut depuis le 32e étage : ses deux`
    + ` arbitrages par l'ordre, sa parité client/serveur, et l'annotation ⚠️ ATTRIBUTION qui`
    + ` réoriente les cris des paires.`;
  const memeQueAvant = (l, plus, fc, fs, nue = false) => {
    const mc = mesure(l, plus, client), ms = mesure(l, plus, server);
    identite(nue ? 33 : 29, nomL(l), "client", fc, mc && mc.s, nue ? QUEUE_B : "", nue);
    identite(nue ? 33 : 31, nomL(l), "serveur", fs, ms && ms.s, nue ? QUEUE_B : "", nue);
  };
  // ── 30e ÉTAGE : L'ANGLE MORT SYMÉTRIQUE DU 29e ─────────────────────────────
  // v2.17.8 — la piste de la v2.17.7, point (b), mot pour mot : « la redondance n'est mesurée que
  // pour les LISTES — le côté objet (`mesureOEq`) n'a jamais été confronté au régime du 23e étage
  // de la même façon, et rien ne dit que l'identité y tient : c'est exactement le patron
  // angle-mort-symétrique, où le contrôle jumeau porte le même trou et où le « zéro » ne parle que
  // d'une moitié. »
  //
  // Le chiffre le disait déjà, et personne ne l'avait lu : l'étage annonçait « 4147 paires » et
  // « 2803 sorties confrontées au régime mesuré ». Les 1344 manquantes ne sont pas un échantillon,
  // c'est LA MOITIÉ OBJET EN ENTIER (21 objets × 65 sources − 21 auto-exclusions). `memeQueAvant`
  // n'est appelée que dans la boucle des listes ; la boucle des objets ne l'a jamais appelée, et
  // `mesureOEq` ne rendait même pas la signature qu'il aurait fallu lui donner.
  //
  // Pourquoi ça compte MAINTENANT plutôt qu'un jour : le point (a) de la même piste propose de
  // CESSER de mesurer le côté ENDROIT, au motif qu'il est « provablement redondant » avec le 22e.
  // Cette preuve est celle de `memeQueAvant` — donc elle ne porte QUE sur les listes. Appliquer
  // (a) aux deux moitiés reviendrait à retirer une mesure de la moitié objet sur la foi d'une
  // preuve qui ne l'a jamais couverte : le patron « tolérance adossée au mauvais étage », en pire,
  // parce qu'ici c'est la mesure elle-même qu'on retirerait. (b) est donc le PRÉALABLE de (a),
  // pas sa suite.
  const QUEUE_O = ` Et une raison SUPPLÉMENTAIRE de crier ici : c'est cette identité, et elle`
    + ` seule, qui autoriserait à ne plus mesurer le côté ENDROIT des objets.`;
  const memeQueAvantO = (o, val, plus, fc, fs, nue = false, sousCle = null) => {
    const mc = mesureO(o, val, plus, client, sousCle), ms = mesureO(o, val, plus, server, sousCle);
    const quoi = `${nomO(o)}{clé→${FORME_INV}}`;
    identite(nue ? 33 : 30, quoi, "client", fc, mc && mc.s, nue ? QUEUE_B : QUEUE_O, nue);
    identite(nue ? 33 : 31, quoi, "serveur", fs, ms && ms.s, nue ? QUEUE_B : QUEUE_O, nue);
  };

  // (a) la sonde SEULE. Avant toute source : si le sort de l'élément dépend déjà de l'ordre à
  // égalité, la comparaison paire par paire mesurerait un écart qui n'a rien à voir avec M.
  //
  // ── 32e ÉTAGE : L'AXE CLIENT/SERVEUR POSÉ SUR LE RESTE DU 29e ──────────────
  // v2.17.10 — la question laissée ouverte par la v2.17.9, mot pour mot : « l'axe qui vient de
  // livrer, client/serveur, n'a été posé que sur `identite`. Les autres contrôles du 29e étage —
  // `ordreVu` et les sondes seules (`baseEqL`) — ne sont posés que côté CLIENT ; `ordreVu(fc, ic)`
  // n'est jamais rejoué en `ordreVu(fs, is)`. Rien ne dit que « 0 arbitrage par l'ordre seul »
  // vaut pour le serveur. »
  //
  // Elle a DEUX jambes, et elles ne se ressemblent pas.
  //
  // ── JAMBE 1 : `ordreVu` côté serveur dans les boucles de PAIRES — REFUSÉE ──
  // La conclusion s'y transporte DÉJÀ, et la preuve tient sur le treillis booléen des quatre
  // `p` que chaque paire calcule (`fc`/`ic` client, `fs`/`is` serveur, tous les quatre
  // mesurés depuis la v2.17.9 pour le contrôle de parité) :
  //
  //     supposons `fs.p ≠ is.p`         — le SERVEUR arbitre par l'ordre ;
  //     si la parité est muette, alors  `fc.p = fs.p` et `ic.p = is.p` ;
  //     donc                            `fc.p ≠ ic.p` — et `ordreVu` CLIENT crie.
  //
  // Autrement dit : `fs.p ≠ is.p` ⟹ (la parité crie) ∨ (`ordreVu` client crie). Il n'existe
  // aucune assignation des quatre booléens où le serveur arbitre par l'ordre sans qu'un crieur
  // déjà écrit ne parle. Ajouter `ordreVu(fs, is)` serait donc poser un crieur qui ne peut
  // JAMAIS crier seul — la forme même de `compteur-de-securite-qui-ne-peut-pas-tomber`, et
  // l'inverse exact de ce que la v2.17.9 a dû défendre pour `fc` (là, retirer l'opérande rendait
  // le test tautologique ; ici, ajouter l'opérande rend le crieur redondant). La preuve n'est pas
  // restée sur le papier : une règle serveur-seule qui arbitre par la POSITION à égalité, injectée
  // dans les paires, rend le build ROUGE **aujourd'hui**, sans une ligne de plus (v2.17.10).
  //
  // ── JAMBE 2 : les sondes SEULES — VIVANTE, et pas pour la raison annoncée ──
  // Ici le treillis ne s'applique pas : la boucle des bases ne calcule QUE le client, et **aucun
  // contrôle de parité n'y existe**. Les 4147 parités du 29e étage ont TOUJOURS une source M au
  // tableau ; la sonde toute seule n'a jamais été confrontée entre les deux copies.
  //
  // Et en allant écrire cette moitié, on trouve que l'ATTRIBUTION que ce bloc promet depuis le
  // 29e étage n'a jamais été écrite non plus. Sa raison d'être, deux lignes plus haut : « si le
  // sort de l'élément dépend déjà de l'ordre à égalité, la comparaison paire par paire mesurerait
  // un écart qui n'a rien à voir avec M ». `baseEqL` était bien rempli — et `bq` n'était lu que
  // comme un GARDE de présence (`if (!bq) continue`), son `.p` jamais comparé à quoi que ce
  // soit. Le jour où une sonde tranche par l'ordre toute seule, l'étage crie 65 fois « `l` × M »
  // en accusant chaque source, et la phrase censée l'empêcher est de la prose (patron
  // `raison-ecrite-a-cote-est-fausse`). Côté OBJET c'était pire : le résultat de la base n'était
  // même pas retenu. Les deux sont écrits maintenant, pour les DEUX copies.
  const baseEqL = new Map(), baseEqO = new Map();
  const sondeSeule = (nom, quoi, fe, ie, fes, ies) => {
    basesEq++;
    if (fe.p !== ie.p) {
      basesOrdre++;
      fail(`29e étage — ${nom} : à \`savedAt\` ÉGAL, côté CLIENT, ${quoi} `
         + `${fe.p ? "survit" : "disparaît"} quand la copie A est en base et `
         + `${ie.p ? "survit" : "disparaît"} quand les deux copies sont échangées, SANS qu'aucune `
         + `autre structure ne soit posée. C'est la règle de ${nom} elle-même qui tranche par la `
         + `POSITION de l'argument dès que la fraîcheur n'arbitre plus.`);
    }
    if (fes === null || ies === null) return { c: fe, ci: ie, s: null, si: null };
    basesEqS++;
    if (fes.p !== ies.p) {
      basesOrdreS++;
      fail(`32e étage — ${nom} : à \`savedAt\` ÉGAL, côté SERVEUR, ${quoi} `
         + `${fes.p ? "survit" : "disparaît"} quand la copie A est en base et `
         + `${ies.p ? "survit" : "disparaît"} quand les deux copies sont échangées, SANS qu'aucune `
         + `autre structure ne soit posée. La sonde seule n'était mesurée QUE côté client depuis le `
         + `29e étage : une règle de ${nom} écrite dans le SEUL serveur et qui tranche par la `
         + `POSITION dès que la fraîcheur n'arbitre plus passait ici sans être nommée.`);
    }
    if (fe.p !== fes.p || ie.p !== ies.p) {
      basesParite++;
      fail(`32e étage — ${nom} (sonde SEULE, savedAt ÉGAL) : ${quoi} survit côté `
         + `${fe.p !== fes.p ? (fe.p ? "client" : "serveur") : (ie.p ? "client" : "serveur")} et `
         + `disparaît de l'autre, dans le sens ${fe.p !== fes.p ? "ENDROIT" : "ENVERS"}, SANS `
         + `qu'aucune source ne soit posée. Les 4147 parités du 29e étage ont toutes une source M `
         + `au tableau : un écart client/serveur que la structure porte TOUTE SEULE y est imputé à `
         + `M, une fois par source.`);
    }
    return { c: fe, ci: ie, s: fes, si: ies };
  };
  // Ce que la sonde SEULE disait déjà, rendu au cri de la paire (voir jambe 2 ci-dessus).
  const dejaSonde = (bq, quoi) => {
    if (!bq) return "";
    const cotes = [];
    if (bq.c.p !== bq.ci.p) cotes.push("client");
    if (bq.s && bq.si && bq.s.p !== bq.si.p) cotes.push("serveur");
    const div = !!(bq.s && bq.si && (bq.c.p !== bq.s.p || bq.ci.p !== bq.si.p));
    if (!cotes.length && !div) return "";
    return ` ⚠️ ATTRIBUTION (32e étage) : la sonde SEULE de ${quoi} — aucune source posée —`
       + (cotes.length ? ` tranche DÉJÀ par l'ordre côté ${cotes.join(" et ")}` : "")
       + (div ? `${cotes.length ? ", et" : ""} diverge DÉJÀ entre les deux copies` : "")
       + `. Ce cri n'accuse donc pas la source : il répète un écart que la structure porte seule. `
       + `Répare d'abord sa propre règle, puis relis ce cri.`;
  };
  for (const l of cibles) {
    const vide = { cfg: {}, gs: {} };
    const fe = mesureEq(l, vide, client, false), ie = mesureEq(l, vide, client, true);
    if (fe === null || ie === null) continue;
    const fes = mesureEq(l, vide, server, false), ies = mesureEq(l, vide, server, true);
    baseEqL.set(nomL(l), sondeSeule(nomL(l), "la sonde", fe, ie, fes, ies));
    memeQueAvant(l, vide, fe, fes, true); // v2.17.11 — 33e étage : l'entrée NUE, les DEUX copies
  }
  for (const l of cibles) {
    const r = { cfg: {}, gs: {} };
    const bq = baseEqL.get(nomL(l));
    if (!bq) continue;
    for (const m of sourcesInv) {
      if (m.id === nomL(l)) continue;
      if (m.champ === l.tombstone) continue;
      if (collisionL(l, m)) collisionsL++;              // v2.17.13 — 35e étage
      const plus = fusionne(r, m.plus);
      const fc = mesureEq(l, plus, client, false), ic = mesureEq(l, plus, client, true);
      const fs = mesureEq(l, plus, server, false), is = mesureEq(l, plus, server, true);
      if (fc === null || ic === null || fs === null || is === null) continue;
      pairesEq++;
      pariteEq++;
      if (fc.p !== fs.p || ic.p !== is.p)
        fail(`29e étage — ${nomL(l)} × ${m.nom} (savedAt ÉGAL) : la sonde survit côté `
           + `${fc.p !== fs.p ? (fc.p ? "client" : "serveur") : (ic.p ? "client" : "serveur")} et `
           + `disparaît de l'autre, dans le sens `
           + `${fc.p !== fs.p ? "ENDROIT" : "ENVERS"}. Une règle qui fait dépendre ${nomL(l)} de `
           + `${m.nom} n'est écrite que dans une des deux copies — et seule l'égalité des `
           + `estampilles la fait mordre.${dejaSonde(bq, nomL(l))}`);
      ordreVu(`${nomL(l)} × ${m.nom}`, fc, ic, `un élément de ${nomL(l)}`,
              dejaSonde(bq, nomL(l)));
      memeQueAvant(l, plus, fc, fs);   // v2.17.9 — 31e étage : les DEUX copies
    }
  }
  // ── LE GARDE `conteneur` : CLOS DES DEUX CÔTÉS (34e puis 35e étage) ────────
  // Trouvé par le FAUX POSITIF de la falsification du 33e étage, pas par une relecture. Les
  // boucles de LISTES portent trois fois `if (l.conteneur && m.champ === l.conteneur.cle)
  // continue;` (22e, 28e, 29e étages) : refus de croiser une liste avec le conteneur qui la
  // contient, parce que la source ÉCRASERAIT la cible au lieu de la côtoyer. Les boucles
  // d'OBJETS n'ont AUCUN garde symétrique — seulement `m.id === nomO(o)`. Quand l'objet-cible
  // EST le conteneur d'une liste-source, `plusDe(m, …)` remplace le bloc de premier niveau en
  // entier et `monteO` repose la clé-sonde PAR-DESSUS le bloc de M : le `modeleObjet` de la
  // fixture est effacé, et la paire mesurée n'est pas « la clé de O × la liste M » mais « O
  // reconstruit à partir du bloc de M ». Deux paires sur 8294 — `config.weeklyQuests` ⊃
  // `config.weeklyQuests.assignments` et `config.weeklyChallenge` ⊃
  // `config.weeklyChallenge.challenges`, les deux seuls cas du projet. L'enjeu est petit, le
  // patron ne l'est pas : `angle-mort-symetrique`, le garde d'un seul côté, et rien ne
  // l'exerçait. TRANCHÉ au 34e étage (v2.17.12) : ni sauter ni garder tel quel — corriger dans
  // la QUESTION, `sousCle` juste en dessous. Et TRANCHÉ DANS L'AUTRE SENS au 35e étage
  // (v2.17.13) : les quatre `continue` du côté liste sont retirés, `monte` rend au conteneur le
  // bloc que la cible pose. Ce paragraphe se lisait encore « à trancher » une nuit après l'avoir
  // été — `raison-ecrite-a-cote-est-fausse` : une prose qui survit à sa décision envoie le
  // lecteur suivant refaire un travail déjà fait.
  for (const o of OBJETS) {
    const val = FORMES[0][1];
    const vide = { cfg: {}, gs: {} };
    const fe = mesureOEq(o, val, vide, client, false), ie = mesureOEq(o, val, vide, client, true);
    if (fe !== null && ie !== null) {
      const fes = mesureOEq(o, val, vide, server, false), ies = mesureOEq(o, val, vide, server, true);
      baseEqO.set(nomO(o), sondeSeule(`${nomO(o)}{clé→${FORME_INV}}`, "la clé-sonde", fe, ie, fes, ies));
      memeQueAvantO(o, val, vide, fe, fes, true); // v2.17.11 — 33e étage : l'entrée NUE
    }
    const bo = baseEqO.get(nomO(o));
    for (const m of sourcesInv) {
      if (m.id === nomO(o)) continue;
      const sc = sousCleDe(o, m);            // v2.17.12 — 34e étage
      const fc = mesureOEq(o, val, m.plus, client, false, sc), ic = mesureOEq(o, val, m.plus, client, true, sc);
      const fs = mesureOEq(o, val, m.plus, server, false, sc), is = mesureOEq(o, val, m.plus, server, true, sc);
      if (fc === null || ic === null || fs === null || is === null) continue;
      if (sc) collisionsO++;
      pairesEq++;
      pariteEq++;
      if (fc.p !== fs.p || ic.p !== is.p)
        fail(`29e étage — ${nomO(o)}{clé→${FORME_INV}} × ${m.nom} (savedAt ÉGAL) : la clé-sonde `
           + `survit côté ${fc.p !== fs.p ? (fc.p ? "client" : "serveur") : (ic.p ? "client" : "serveur")} `
           + `et disparaît de l'autre, dans le sens ${fc.p !== fs.p ? "ENDROIT" : "ENVERS"}. Une règle `
           + `qui fait dépendre ${nomO(o)} de ${m.nom} n'est écrite que dans une des deux copies — et `
           + `seule l'égalité des estampilles la fait mordre.${dejaSonde(bo, nomO(o))}`);
      ordreVu(`${nomO(o)}{clé→${FORME_INV}} × ${m.nom}`, fc, ic, `une CLÉ de ${nomO(o)}`,
              dejaSonde(bo, nomO(o)));
      memeQueAvantO(o, val, m.plus, fc, fs, false, sc); // v2.17.8 — 30e ; v2.17.9 — les DEUX copies
    }
  }
  // v2.17.8 — 30e étage, le contrôle qui garde le contrôle. `memeSortie` était jusqu'ici un
  // compteur d'ambiance : il valait 2803 sur 4147 paires et personne n'a lu l'écart pendant une
  // nuit entière. Un compteur qu'on IMPRIME sans le confronter à ce qu'il devrait valoir ne
  // surveille rien (v2.16.96 : un garde-fou qui ne peut pas tomber n'en est pas un). Il est
  // maintenant ADOSSÉ à `pairesEq` : le jour où une moitié cesse d'être confrontée — parce qu'un
  // `continue` est ajouté, parce qu'une boucle oublie l'appel, ou parce qu'on applique le point
  // (a) de la piste sans le mesurer d'abord — ce n'est plus un chiffre qui baisse en silence,
  // c'est un build rouge. C'est la leçon `temoin-appelle-la-mesure-directement` posée à l'endroit :
  // le contrôle regarde ce que les BOUCLES ont demandé, pas ce que la machinerie sait faire.
  //
  // v2.17.9 — 31e étage : le compte attendu passe à DEUX par paire. Chaque paire pose quatre
  // fusions à égalité, dont deux à l'ENDROIT (`fc` client, `fs` serveur) ; les deux doivent dire
  // qu'elles rendent la sortie du régime mesuré, sinon l'identité ne vaut que pour la copie
  // confrontée. Le `× 2` est la forme même de la réserve (i) : c'est ce chiffre, et pas une
  // phrase, qui empêchera la prochaine nuit de retirer `fs` en croyant l'identité acquise.
  // v2.17.12 — 34e étage : les paires en COLLISION ne peuvent plus disparaître en silence.
  // L'attendu est dérivé des DÉCLARATIONS (`OBJETS` × les cibles porteuses d'un `conteneur`), pas
  // de ce que la boucle a bien voulu poser : un contrôle dont l'attendu vient du même parcours que
  // le mesuré ne peut pas voir le parcours se rétrécir (`releve-partage-le-plafond-surveille`).
  // Il tombe dans les deux sens. Vers le BAS : le jour où une nuit ajoute le `continue` symétrique
  // des listes — la sortie « facile » que la piste du 33e étage proposait — la charnière
  // conteneur × liste-contenue cesse d'être mesurée par QUI QUE CE SOIT, des deux côtés du
  // produit, et c'est un build rouge plutôt qu'un chiffre qui baisse. Vers le HAUT : le jour où
  // une liste nichée de plus est déclarée (`conteneur:`), la paire naît et le contrôle exige
  // qu'on l'ait vue naître.
  const collisionsAttendues = OBJETS.reduce((n, o) => n + cibles.filter((m) =>
    m.conteneur && m.dans === o.dans && m.conteneur.cle === o.champ).length, 0);
  if (collisionsO !== collisionsAttendues)
    fail(`34e étage — COLLISIONS CONTENEUR NON MESURÉES : ${collisionsAttendues} paires `
       + `« objet-cible ⊃ liste-source » sont DÉCLARÉES (une cible avec \`conteneur:\` dont la clé `
       + `est un objet d'\`OBJETS\`), mais ${collisionsO} ont été mesurées. Ce sont les seules `
       + `paires où la source vit DANS la cible : leur échafaudage passe par \`sousCle\`, et sans `
       + `lui la source remplace le bloc du conteneur sur les DEUX copies — clé d'arbitrage `
       + `comprise. Les sauter, c'est fermer le garde des deux côtés du produit et laisser la `
       + `charnière conteneur × liste-contenue mesurée par personne.`);
  if (copiesJumelles !== 0)
    fail(`34e étage — ${copiesJumelles} paires d'objets mesurées sur deux copies JUMELLES `
       + `(voir les cris ci-dessus). Attendu : 0.`);
  // v2.17.13 — 35e étage, le jumeau côté LISTE, et il tombe pour la même raison que celui du 34e :
  // l'attendu vient des DÉCLARATIONS (`cibles` porteuses d'un `conteneur` × les sources dont le
  // `champ` EST cette clé), jamais du parcours mesuré — un attendu dérivé de la même boucle ne
  // peut pas voir la boucle rétrécir (`releve-partage-le-plafond-surveille`). Il tombe dans les
  // deux sens : vers le BAS si une nuit remet l'un des `continue` retirés ce soir, vers le HAUT
  // si une liste nichée de plus est déclarée sans qu'on ait vu naître ses paires. Le `× 2` du
  // second terme est le 28e étage ET le 29e, qui partagent `sourcesInv` et le seul régime rejet.
  const nichees = cibles.filter((l) => l.conteneur);
  const collisionsLAttendues =
      nichees.reduce((n, l) => n + sourcesM.filter((m) => collisionL(l, m)).length, 0)
    + nichees.reduce((n, l) => n + sourcesInv.filter((m) => collisionL(l, m)).length, 0) * 2;
  if (collisionsL !== collisionsLAttendues)
    fail(`35e étage — COLLISIONS LISTE ⊂ OBJET NON MESURÉES : ${collisionsLAttendues} paires `
       + `« liste-cible ⊂ objet-source » sont DÉCLARÉES (une cible avec \`conteneur:\` dont la clé `
       + `est une source), mais ${collisionsL} ont été traversées. Ce sont les seules paires où la `
       + `source vit AU-DESSUS de la cible : leur échafaudage passe par le rappel du bloc dans `
       + `\`monte\` (35e étage), et sans lui la source efface la liste-sonde en entier sur les deux `
       + `copies. Les sauter, c'est rendre la charnière conteneur × liste-contenue muette du côté `
       + `liste, alors que le 34e étage vient de l'ouvrir du côté objet.`);
  if (sondeEffacee !== 0)
    fail(`35e étage — ${sondeEffacee} paire(s) de listes mesurées SANS la sonde dans la fixture `
       + `(voir les cris ci-dessus). Attendu : 0.`);
  if (memeSortie !== pairesEq * 2)
    fail(`31e étage — COUVERTURE INCOMPLÈTE : ${pairesEq} paires mesurées à \`savedAt\` ÉGAL, donc `
       + `${pairesEq * 2} confrontations attendues (client ET serveur, les deux côtés ENDROIT), `
       + `mais seulement ${memeSortie} faites (${pairesEq * 2 - memeSortie} muettes). Chaque paire `
       + `posée à égalité doit dire, POUR CHAQUE COPIE, si sa sortie est la MÊME qu'au régime des `
       + `22e-30e étages — c'est cette identité qui autorise à transporter leurs conclusions ici. `
       + `Une moitié non confrontée rend le « 0 arbitrage par l'ordre seul » vrai pour une moitié `
       + `seulement : c'est l'angle mort qui a vécu une nuit entière côté OBJET (v2.17.7 : 2803 `
       + `sur 4147) et qui vivait depuis toujours côté SERVEUR (v2.17.8 : 4147 sur 8294).`);
  // v2.17.10 — 32e étage : la même discipline que le `memeSortie` du 30e, appliquée aux sondes
  // seules. `basesEqS` est ADOSSÉ à `basesEq` : si une nuit retire la mesure serveur des bases —
  // ou si une copie se met à jeter là où l'autre passe — ce n'est pas un chiffre qui baisse en
  // silence dans une ligne de relevé, c'est un build rouge. Sans cet adossement, le « 0 tranchée
  // par l'ordre côté serveur » ci-dessous serait un zéro qui ne parle que de ce qu'on a bien voulu
  // mesurer (`releve-partage-le-plafond-surveille`).
  if (basesEqS !== basesEq)
    fail(`32e étage — COUVERTURE INCOMPLÈTE DES SONDES SEULES : ${basesEq} sondes mesurées côté `
       + `client, mais seulement ${basesEqS} côté serveur (${basesEq - basesEqS} muette(s)). Une `
       + `sonde que le client sait fusionner et que le serveur jette est déjà une divergence — et `
       + `tant qu'elle n'est pas mesurée, le « 0 arbitrage par l'ordre » des bases ne vaut que pour `
       + `la copie qu'on a regardée.`);
  // v2.17.11 — 33e étage : le même adossement que les 30e/31e/32e, posé sur les BASES. Le compte
  // attendu n'est PAS `basesEq × 2` mais `basesEq + basesEqS` : la moitié serveur d'une base
  // n'existe que si `mesureEq(…, server, …)` a rendu quelque chose, et c'est `basesEqS` qui le
  // compte. Écrire `× 2` aurait fait de ce contrôle un doublon de celui du 32e étage — il serait
  // devenu rouge pour la même raison, et muet sur la sienne (`angle-mort-symetrique`). Adossé
  // aux deux compteurs séparément, il ne parle que de ce qu'il surveille : chaque sonde MESURÉE,
  // sur chaque copie où elle l'a été, doit dire si le régime « savedAt ÉGAL » lui rend la même
  // sortie que le régime des 22e-30e étages.
  if (memeSortieBase !== basesEq + basesEqS)
    fail(`33e étage — COUVERTURE INCOMPLÈTE DE L'ENTRÉE NUE : ${basesEq} sondes seules mesurées `
       + `côté client et ${basesEqS} côté serveur, donc ${basesEq + basesEqS} confrontations au `
       + `régime mesuré attendues, mais seulement ${memeSortieBase} faites `
       + `(${basesEq + basesEqS - memeSortieBase} muette(s)). Une sonde seule dont on ne sait pas `
       + `si sa fusion à égalité rend la sortie du régime mesuré ne peut RIEN transporter : ni son `
       + `« 0 arbitrage par l'ordre », ni sa parité client/serveur, ni l'annotation ⚠️ ATTRIBUTION `
       + `dont dépendent les cris des paires depuis le 32e étage.`);
  console.log(`    (savedAt ÉGAL — ${basesEq} sondes seules × 2 copies (${basesOrdre} tranchée(s) `
    + `par l'ordre côté client, ${basesOrdreS} côté serveur, ${basesParite} divergente(s) entre `
    + `copies), `
    + `puis ${pairesEq} paires × 2 ordres × 2 copies (produit réduit : ${sourcesInv.length} sources, `
    + `1 forme « ${FORME_INV} », régime rejet) = ${ordreSeul} arbitrage(s) par l'ordre seul, `
    + `${pariteEq} parités client/serveur, ${memeSortie}/${pairesEq * 2} sorties confrontées au `
    + `régime mesuré (les DEUX copies), ${memeSortieBase}/${basesEq + basesEqS} pour l'entrée NUE, `
    + `${collisionsO}/${collisionsAttendues} collision(s) conteneur⊃liste posées sur le bloc PROPRE `
    + `de chaque copie, ${copiesJumelles} paire(s) sur copies jumelles, `
    + `${collisionsL}/${collisionsLAttendues} collision(s) liste⊂conteneur MESURÉES, `
    + `${sondeEffacee} sonde(s) effacée(s) par l'échafaudage)`);
  if (process.env.DBG29 && rapportEq.length) console.log("      " + rapportEq.join("\n      "));
  // Ce que le 29e étage NE couvre PAS, écrit noir sur blanc :
  //   • **`ordreVu` n'est posé que côté CLIENT, et c'est un CHOIX MESURÉ, pas un oubli** — voir
  //     la jambe 1 du 32e étage plus haut : `fs.p ≠ is.p` implique qu'un crieur déjà écrit parle,
  //     donc le côté serveur y serait redondant par construction. Ce qui NE se transporte pas de
  //     cette façon, ce sont les sondes seules, et elles sont mesurées des deux côtés depuis la
  //     v2.17.10.
  //   • **le produit reste RÉDUIT**, exactement comme au 28e : une seule des trois formes de clé
  //     (`texte`) et le seul régime `rejet`. Un arbitrage par l'ordre qui ne se manifesterait que
  //     par un rapprochement DATÉ, ou seulement sur une sonde déjà tombstonée, reste hors
  //     d'atteinte. Le marché est le même : dire s'il EXISTE, pas en dresser le catalogue.
  //   • **la question porte sur la SONDE**, pas sur la sortie complète. Une règle qui arbitre par
  //     l'ordre à égalité sur un champ que la sonde ne touche pas n'est pas nommée ici — et ce
  //     n'est pas un oubli : à égalité, tout scalaire arbitré « le frais gagne, sinon la base »
  //     diverge trivialement entre les deux ordres, donc la sortie complète répondrait OUI partout
  //     et ne désignerait rien (le contraire du 27e étage, où la sortie complète discrimine parce
  //     que les deux mesures ne diffèrent QUE par la sentinelle).
  //   • **l'égalité mesurée est EXACTE** (la même chaîne ISO des deux côtés). Deux estampilles
  //     distinctes que `new Date()` rendrait égales — même milliseconde écrite deux fois avec un
  //     décalage de fuseau, par exemple — tomberaient dans la même branche sans que l'étage les
  //     pose. C'est le même `>` qui décide, donc la conclusion se transporte ; la MESURE, elle,
  //     ne porte que sur la forme exacte.
  const parMorsure = candidats.filter((c) => c.via === "morsure").length;
  console.log(`    (${parMorsure} charnières + ${candidats.length - parMorsure} traces hors sonde `
    + `prolongées × ${sourcesM.length} secondes sources `
    + `= ${paires3} triplets mesurés, ${collisions} sautés (même clé de premier niveau que la `
    + `première source), ${seules} sautés (la seconde source mord déjà SEULE), `
    + `${triples} charnières à deux sources)`);

  console.log(`    (${paritesSortie} sorties complètes comparées client/serveur, `
    + `${sortiesDivergentes} divergente(s) ; ${traces} traces hors sonde dont `
    + `${tracesNonClassees} non classée(s) — familles : `
    + `${[...new Set(rapportTrace.map((r) => r.slice(1, r.indexOf("]"))))].sort().join(", ")})`);
  if (process.env.DBG27) console.log("      " + rapportTrace.join("\n      "));
  if (process.env.DBG22) console.log("      " + rapport.join("\n      "));
  console.log(`    (${cibles.length} listes + ${sondes} objets sondés (${OBJETS.length} × ${FORMES.length} formes) × `
    + `${sourcesM.length} sources (dont ${OBJETS.length} objets × ${FORMES.length} formes : `
    + `${FORMES.map(([f]) => f).join("/")}) × régimes = ${paires} paires `
    + `mesurées, ${trouvees} charnières, ${CHARNIERES.length} déclarées)`);
  // Ce que ce recensement NE couvre PAS, écrit noir sur blanc :
  //   • une charnière dont la valeur de rapprochement n'est pas la valeur BRUTE d'un champ (les
  //     marques composées `id#estampille` d'`owned`/`deCompleted`, par exemple) ne peut pas être
  //     trouvée par une sentinelle unique. Le régime « sauvetage » ne tourne donc que sur les
  //     listes d'objets, qui ont toutes un tombstone à marque simple.
  //   • (PÉRIMÉ, réécrit en v2.17.3) ce bloc affirmait encore « le côté L reste les LISTES, un
  //     objet n'est jamais SONDÉ, ça reste un angle mort ». C'est FAUX depuis le 24e étage
  //     (v2.17.2), qui sonde les 21 objets par une CLÉ : l'angle mort est fermé, et « les 21 sont
  //     des unions par clé qui ne filtrent pas » n'est plus une lecture du code mais une mesure.
  //     Une raison écrite à côté de ce qu'elle décrit envoie le lecteur suivant refaire un travail
  //     déjà fait (v2.16.83) : les limites RÉELLES du côté objet sont écrites au 24e étage, pas ici.
  // Ce que le 27e étage NE couvre PAS, écrit noir sur blanc :
  //   • (FERMÉ en v2.17.6) ce bloc affirmait que les 12 246 paires sont toutes mesurées dans UN
  //     seul sens — copie fraîche en base, périmée en incoming — et qu'une règle écrite dans un
  //     seul sens laisserait tout le recensement vert. C'est le 28e étage, et la réponse est NON :
  //     4 147 paires remesurées `mergeFamily(fB, fA)`, 65 sondes seules, 0 asymétrie. Le coût
  //     annoncé (~60 s, le produit DOUBLÉ) n'a pas eu à être payé en entier : le produit RÉDUIT —
  //     1 forme, régime `rejet` — suffit à répondre OUI ou NON, et il coûte +26 s (89 s → 115 s,
  //     mesuré). Ce qui reste ouvert est écrit à sa place, au 28e étage, pas ici (v2.16.83).
  //   • **le classement se fait par NOM de champ, pas par EFFET.** `famille` accepte une trace dès
  //     qu'une fiche déclarée relie les deux structures ; elle ne vérifie pas que la trace relevée
  //     est bien CELLE de la règle déclarée. Une SECONDE règle entre les deux mêmes champs serait
  //     avalée en silence. La fermer demanderait de comparer les CHEMINS que la trace déplace à
  //     ceux que la fiche produit — mesurable, mais c'est un autre étage.
  //   • la conjonction PURE reste hors d'atteinte, et la borne se chiffre : la prolongation est
  //     désormais nourrie par les morsures ET par les traces (5 + 18), mais une première source qui
  //     ne change RIEN — ni la sonde, ni la sortie — n'ouvre toujours aucune porte. Sur une fusion
  //     NUE, les 107 sources sont dans ce cas (0 traceur, mesuré) ; avec la sonde posée, 18 en
  //     sortent. Une conjonction dont la première marche est en dehors de ces 18 reste muette.
  //   • (FERMÉ en v2.17.4) ce bloc affirmait qu'une charnière à DEUX sources est invisible, et
  //     citait `completed` × `completedAt` comme son exemple vivant. C'est FAUX depuis le 26e
  //     étage, qui nomme ce triplet-là par la mesure — avec deux autres. Ce qu'il ne couvre
  //     toujours pas est écrit à sa place, pas ici (v2.16.83 : une raison écrite à côté de ce
  //     qu'elle décrit envoie le lecteur suivant refaire un travail déjà fait).
}

// ═══════════════════════════════════════════════════════════════════════════
// 43e étage — LE PREMIER NIVEAU DE LA CHARGE (v2.17.21)
// ═══════════════════════════════════════════════════════════════════════════
// Les quarante-deux étages au-dessus partent tous de `fam.config` et `fam.gameStates`. Le relevé de
// prod partait des deux mêmes racines. Le détecteur d'inventions aussi. Le recensement des chemins
// jetés aussi. Personne, dans ce fichier, ne regardait la charge ELLE-MÊME — alors que les deux
// copies rendent `{ ...newer, config, gameStates, seenVersions, savedAt }` : tout champ posé à la
// racine traverse la fusion, et son sort est décidé par un spread que rien ne mesurait. C'est le
// plafond de la v2.16.88 monté d'un cran, et il était plus haut que je ne le croyais — un
// recensement borné au premier niveau ne peut rien dire de l'étage AU-DESSUS de lui.
//
// La mise en CONSTATS est une fonction pure, `constatsRacine(m)`, partagée par le réel et par les
// témoins (leçon de la v2.17.20 : un témoin qui appelle la mesure directement ne prouve rien de la
// boucle qui la promène). Les témoins lui passent des fusions VOLONTAIREMENT fausses et exigent que
// chaque axe crie — falsifier une des quatre mesures fait donc échouer l'étage.
console.log("· premier niveau de la CHARGE — chaque champ de racine doit dire qui l'arbitre");
{
  const schemaProd = require(path.join(ROOT, "scripts/schema-prod.json"));
  const REGLES_RACINE = {
    config: "recomposé champ par champ par les étages ci-dessus (`config` est reconstruit, jamais "
      + "pris en bloc) — sa complétude est le contrôle « fixtures vs schéma de prod ».",
    gameStates: "recomposé par `mergeGS` joueur par joueur (server-merge.cjs ~384) — sa complétude "
      + "est celle des étages `mergeGS`.",
    savedAt: "clé d'ARBITRAGE de toute la charge : le plus récent des deux gagne (`isNewer`). "
      + "Mesuré ici, axe [savedAt].",
    seenVersions: "UNION de QUATRE sources — les deux copies de `config` et les deux de racine "
      + "(v2.16.52 : le champ vit aux deux endroits). Axe [union] ici, et le croisement entre les "
      + "deux emplacements est fiché au 17e étage.",
  };

  // ── Complétude, dans les deux sens ───────────────────────────────────────────────────────────
  const enProd = Object.keys(schemaProd.champs)
    .filter((c) => c.startsWith("charge.") && c.split(".").length === 2)
    .map((c) => c.slice("charge.".length));
  for (const cle of enProd)
    if (!(cle in REGLES_RACINE))
      fail(`« ${cle} » est un champ de PREMIER NIVEAU de la charge que la prod porte et qu'aucune `
         + `règle ne nomme. Les deux \`mergeFamily\` rendent \`{...newer, …}\` : il traverse donc la `
         + `fusion en bloc, du seul côté gagnant, et disparaît si le gagnant ne le porte pas. `
         + `Ajoute-lui une fiche dans REGLES_RACINE — soit une règle qui l'arbitre, soit le constat `
         + `qu'il suit le gagnant, écrit noir sur blanc.`);
  for (const cle of Object.keys(REGLES_RACINE))
    if (!enProd.includes(cle))
      fail(`REGLES_RACINE fiche « ${cle} », que le relevé de prod ne porte plus à la racine. Fiche `
         + `périmée : retire-la, sinon elle couvrira un jour un champ homonyme sans relecture.`);
  for (const [cle, pourquoi] of Object.entries(REGLES_RACINE))
    if (!pourquoi) fail(`REGLES_RACINE — fiche « ${cle} » sans raison écrite.`);

  // ── La fixture doit se CONTREDIRE à la racine ────────────────────────────────────────────────
  // Sans ça l'axe [union] se satisfait tout seul : `attendu` est calculé à partir des fixtures, donc
  // deux racines identiques (ou recopiées de `config`) le vérifient sans rien mesurer. Mesuré :
  // deux racines portant la MÊME liste ne faisaient crier personne.
  {
    const rA = famA.seenVersions, rB = famB.seenVersions;
    const cA = famA.config.seenVersions, cB = famB.config.seenVersions;
    if (!Array.isArray(rA) || !Array.isArray(rB) || !rA.length || !rB.length)
      fail(`43e étage — les fixtures doivent porter une liste \`seenVersions\` à la RACINE (la prod `
         + `en porte une, et les deux copies de la fusion la lisent). Sans elle, la moitié racine de `
         + `l'union à quatre sources est inerte.`);
    else {
      if (!rA.some((v) => !rB.includes(v)) || !rB.some((v) => !rA.includes(v)))
        fail(`43e étage — les deux racines \`seenVersions\` ne se contredisent pas dans les deux sens `
           + `(A=${JSON.stringify(rA)}, B=${JSON.stringify(rB)}). L'axe [union] serait vérifié par sa `
           + `propre fixture : chaque côté doit porter une version que l'autre n'a pas.`);
      const melange = [...rA, ...rB].filter((v) => [...cA, ...cB].includes(v));
      if (melange.length)
        fail(`43e étage — la racine et \`config\` partagent ${JSON.stringify(melange)}. Le CROISEMENT `
           + `entre les deux emplacements (17e étage) devient alors indiscernable d'une recopie : `
           + `garde les deux jeux de versions disjoints.`);
    }
  }

  // ── La mise en CONSTATS, pure, partagée par le réel et par les témoins ───────────────────────
  // famA est daté du 15 août, famB du 14 : A est le côté FRAIS, dans les deux ordres.
  const avecTemoin = (fam, v) => ({ ...fam, temoinRacine: v });
  const unionAttendue = [...new Set([...(famA.seenVersions || []), ...(famB.seenVersions || []),
    ...famA.config.seenVersions, ...famB.config.seenVersions])].sort();
  const constatsRacine = (m) => {
    const out = [];
    // [savedAt] — la clé qui décide de TOUTE la charge.
    for (const [sens, x, y] of [["AB", famA, famB], ["BA", famB, famA]]) {
      const got = m(x, y).savedAt;
      if (got !== famA.savedAt)
        out.push(`[savedAt] ${sens} : \`savedAt\` rendu « ${got} », attendu « ${famA.savedAt} » (le `
               + `plus récent des deux). Si cette clé sort du mauvais côté, chaque arbitrage des `
               + `étages au-dessus est mesuré à l'envers.`);
    }
    // [union] — quatre sources, et les DEUX emplacements doivent recevoir la même union.
    for (const [sens, x, y] of [["AB", famA, famB], ["BA", famB, famA]]) {
      const o = m(x, y);
      for (const [ou, liste] of [["racine", o.seenVersions], ["config", o.config.seenVersions]]) {
        const got = [...new Set(liste || [])].sort();
        if (JSON.stringify(got) !== JSON.stringify(unionAttendue))
          out.push(`[union] ${sens} : \`seenVersions\` (${ou}) vaut ${JSON.stringify(got)}, attendu `
                 + `l'union des QUATRE sources ${JSON.stringify(unionAttendue)}. Une version annoncée `
                 + `à un enfant et perdue à la synchro lui sera réannoncée.`);
      }
    }
    // [bloc] — la règle par DÉFAUT de la racine : un champ porté des deux côtés suit le gagnant.
    for (const [sens, x, y] of [["AB", avecTemoin(famA, "frais"), avecTemoin(famB, "perime")],
                                ["BA", avecTemoin(famB, "perime"), avecTemoin(famA, "frais")]]) {
      const got = m(x, y).temoinRacine;
      if (got !== "frais")
        out.push(`[bloc] ${sens} : un champ de racine porté des DEUX côtés rend « ${got} », attendu `
               + `« frais ». La racine suit le gagnant de \`savedAt\` (\`...newer\`) ; si ce n'est `
               + `plus vrai, la fiche REGLES_RACINE de ce champ est fausse.`);
    }
    // [perdu] — et porté par le SEUL côté périmé, il tombe. Comportement MESURÉ, pas approuvé.
    for (const [sens, x, y] of [["AB", famA, avecTemoin(famB, "seul")],
                                ["BA", avecTemoin(famB, "seul"), famA]]) {
      const got = m(x, y).temoinRacine;
      if (got !== undefined)
        out.push(`[perdu] ${sens} : un champ de racine porté par le seul côté PÉRIMÉ rend « ${got} », `
               + `alors que \`...newer\` le laisse tomber. Si la règle a changé (tant mieux), réécris `
               + `cette mesure ET la fiche REGLES_RACINE qui la décrit.`);
    }
    return out;
  };

  // ── Le réel ──────────────────────────────────────────────────────────────────────────────────
  for (const [nom, m] of [["client", client.mergeFamily], ["serveur", server.mergeFamily]])
    for (const msg of constatsRacine(m)) fail(`43e étage — ${nom} ${msg}`);

  // ── Les témoins : quatre fusions volontairement fausses, un axe chacune ──────────────────────
  // Ils passent par `constatsRacine`, pas à côté : falsifier une des quatre mesures rend le témoin
  // de cet axe muet, et l'étage échoue en le disant.
  // Les axes sont DÉCLARÉS : sans cette liste, vider la table des témoins ne fait crier personne
  // (mesuré — c'est le second tas de la v2.17.20, « rien ne déclarait combien de témoins doivent
  // tourner »). Un axe ajouté à `constatsRacine` sans son témoin fait donc échouer l'étage.
  const AXES = ["savedAt", "union", "bloc", "perdu"];
  const vrai = client.mergeFamily;
  const TEMOINS = [
    ["savedAt", "le mauvais côté gagne l'arbitrage", (x, y) => ({ ...vrai(x, y), savedAt: famB.savedAt })],
    ["union", "l'union rend une liste vide", (x, y) => { const o = vrai(x, y);
      return { ...o, seenVersions: [], config: { ...o.config, seenVersions: [] } }; }],
    ["bloc", "la racine du gagnant est jetée", (x, y) => { const o = { ...vrai(x, y) };
      delete o.temoinRacine; return o; }],
    ["perdu", "la racine du périmé survit", (x, y) => ({ ...vrai(x, y), temoinRacine: "seul" })],
  ];
  // La boucle ne juge RIEN : elle collecte. Le verdict est pris une seule fois, sur le COMPTE — une
  // table de témoins vidée, un axe ajouté sans le sien et un témoin devenu muet passent tous les
  // trois par là. Un `fail` dans la boucle EN PLUS de celui-ci serait redondant, et sa falsification
  // passerait inaperçue : une seule ligne de verdict, nommée, plutôt que deux dont l'une ment.
  // L'ANCRE : un axe que `constatsRacine` n'émet JAMAIS, promené par la même collecte. Il doit
  // rester non prouvé. Sans lui, une collecte qui cesse de lire les cris (`axesProuves.add(axe)`
  // sans condition) déclare les quatre axes prouvés et ne fait crier personne — mesuré.
  const AXE_INERTE = "axeQuAucuneMesureNEmet";
  const axesProuves = new Set();
  const pourquoiMuet = new Map(TEMOINS.map(([axe, quoi]) => [axe, quoi]));
  for (const [axe, , faux] of [...TEMOINS, [AXE_INERTE, "", vrai]])
    if (constatsRacine(faux).some((c) => c.startsWith(`[${axe}]`))) axesProuves.add(axe);
  if (axesProuves.has(AXE_INERTE))
    fail(`43e étage — ANCRE : la collecte des témoins déclare prouvé « ${AXE_INERTE} », un axe`
       + ` qu'aucune mesure n'émet. Elle ne lit donc plus les cris qu'elle est censée compter, et`
       + ` le « 4/4 prouvés » imprimé plus bas ne veut plus rien dire.`);
  for (const axe of AXES)
    if (!axesProuves.has(axe))
      fail(`43e étage — l'axe [${axe}] est déclaré et aucun témoin ne prouve qu'il sait crier`
         + `${pourquoiMuet.has(axe) ? ` (le sien — une fusion où ${pourquoiMuet.get(axe)} — reste muet)` : ` (aucun témoin ne le vise)`}. `
         + `La mesure de cet axe ne mesure peut-être plus rien, et son « zéro » sur la vraie fusion `
         + `ne prouverait alors rien du tout. Répare la mesure, ou ajoute-lui un témoin.`);
  for (const [axe] of TEMOINS)
    if (!AXES.includes(axe))
      fail(`43e étage — le témoin « ${axe} » ne correspond à aucun axe déclaré. Ajoute l'axe à AXES `
         + `(et sa mesure à \`constatsRacine\`), ou retire le témoin.`);
  console.log(`    (${enProd.length} champs de racine, ${Object.keys(REGLES_RACINE).length} fichés ; `
    + `${AXES.length} axes × 2 copies mesurés, ${axesProuves.size}/${AXES.length} prouvés par un `
    + `témoin de fusion fausse)`);
  // Ce que le 43e étage NE couvre PAS, écrit noir sur blanc :
  //   • qu'un champ de racine porté par le seul côté périmé DOIVE survivre. Il ne survit pas, dans
  //     les deux copies, et l'axe [perdu] grave ce comportement tel quel plutôt que de l'approuver.
  //     Le jour où la racine portera autre chose que les quatre champs d'aujourd'hui, c'est cette
  //     ligne-là qu'il faudra rouvrir — un champ de racine neuf serait perdu à la première synchro
  //     venue du mauvais côté, sans qu'aucun autre étage ne le voie.
  //   • la PROFONDEUR sous un champ de racine inconnu : `releve-schema-prod.mjs` descend sous lui en
  //     `*`, mais aucun étage ne mesurerait l'arbitrage de ce qu'il y trouverait. Il n'y a rien à y
  //     trouver aujourd'hui (les quatre champs sont fichés) ; ce sera à mesurer au cinquième.
  //   • les témoins prouvent que chaque axe SAIT crier ; ils ne prouvent pas que la liste des axes
  //     est complète. Un cinquième comportement de racine, non nommé, resterait muet — c'est la
  //     limite de tout recensement par table, et elle est ici bornée à quatre champs connus.
  //   • DEUX muettes mesurées, nommées plutôt que passées sous silence (22 variantes rejouées) :
  //     (a) la ligne de verdict `if (!axesProuves.has(axe))` est le dernier maillon non mesuré —
  //         tout ce qui est en amont l'est, l'ancre `AXE_INERTE` comprise. Une ligne, nommée.
  //     (b) désarmer la contradiction de racine des fixtures ne fait crier personne, et c'est
  //         STRUCTUREL : c'est une assertion désarmée sur un sujet sain. Ce qu'elle surveille est
  //         mesuré par le lavage, pas par la falsification — deux racines rendues identiques, ou
  //         recopiées de `config`, sont bien attrapées (v2.17.20 : les deux mesures ne voient pas
  //         la même chose, il faut les deux).
}


// ═══════════════════════════════════════════════════════════════════════════
// 44e étage — LE RELEVÉ DE TAILLES DE LA PROD (v2.17.22)
// ═══════════════════════════════════════════════════════════════════════════
// Pourquoi cet étage existe. Deux nuits d'affilée, la charge de prod a bougé sans qu'on puisse dire
// OÙ : −242 octets le 1er septembre, et le 2, `config` qui grossit de 1 300 pendant que « le reste »
// maigrit de 1 730. Les deux constats ont été laissés OUVERTS dans `PROJET-ETAT`, et les deux fois
// pour la même raison : la référence de la veille avait été prise À LA MAIN, par une commande écrite
// nulle part. Une référence qu'on ne peut pas rejouer ne peut ni confirmer ni infirmer.
// `scripts/releve-tailles-prod.mjs` la rend rejouable et `scripts/tailles-prod.json` la fige, comme
// `releve-schema-prod.mjs` l'avait fait pour la FORME. Cet étage est ce qui empêche ce fichier de
// devenir un champ écrit et jamais lu : il en mesure la fraîcheur ET la complétude.
//
// Ce qu'il mesure, et c'est plus fort qu'un simple « le fichier est là » : JSON impose une identité
// à l'octet près entre un conteneur et ses enfants (accolades + virgules + Σ ( "clé": + valeur )).
// Le relevé enregistre les deux côtés par des chemins INDÉPENDANTS — le nombre d'enfants est compté
// à la source (`Object.keys(v).length`), jamais dérivé de la somme de ce qui a été relevé — donc un
// sous-arbre oublié par le parcours casse l'identité. Le fichier porte ainsi la preuve que son
// propre recensement est complet, et il suffit ici de la rejouer. C'est la leçon des v2.17.20/21
// (« mesurer le RECENSEMENT, pas le détecteur ») appliquée à la génération plutôt qu'après coup.
//
// La mise en constats est une FONCTION PURE partagée par la génération, par cet étage et par ses
// témoins — jamais réécrite ici. Les témoins passent à `constats` des relevés VOLONTAIREMENT faux :
// falsifier une mesure rend son témoin muet, et l'étage le dit.
{
  const { constats: constatsTailles } = await import(path.join(ROOT, "scripts/releve-tailles-prod.mjs"));
  const tailles = require(path.join(ROOT, "scripts/tailles-prod.json"));

  // L'ÂGE, avec l'horloge que ce dépôt contrôle (v2.17.17) : `releveLe` est la date de GÉNÉRATION.
  // `prodSavedAt` est imprimé et volontairement pas arbitré — une prod peut légitimement ne pas
  // bouger — mais son ABSENCE dirait que le fichier vient d'un autre script.
  const AGE_MAX_J = 14;
  const ageJ = Math.floor((Date.now() - Date.parse(`${tailles.releveLe}T00:00:00Z`)) / 86400000);
  const dateCharge = tailles.prodSavedAt ? String(tailles.prodSavedAt).slice(0, 10) : null;
  console.log(`· relevé de tailles de prod (du ${tailles.releveLe}, il y a ${ageJ} jour(s)`
            + `${dateCharge ? `, sur une charge datée du ${dateCharge}` : ""}) — attribution complète à l'octet`);
  if (!("prodSavedAt" in tailles))
    fail(`44e étage — « prodSavedAt » absent de scripts/tailles-prod.json : ce fichier ne vient pas de `
       + `scripts/releve-tailles-prod.mjs. Régénère après un GET : node scripts/releve-tailles-prod.mjs `
       + `<prod.json> > scripts/tailles-prod.json`);
  if (!Number.isFinite(ageJ))
    fail(`44e étage — « releveLe » vaut « ${tailles.releveLe} », qui n'est pas une date lisible.`);
  else if (ageJ > AGE_MAX_J)
    fail(`44e étage — relevé de tailles pas régénéré depuis ${ageJ} jours (plafond ${AGE_MAX_J}). Il sert `
       + `de RÉFÉRENCE à la soustraction de la nuit (« --contre ») : périmé, il attribue un écart de `
       + `deux semaines à un seul chemin et la mesure ne veut plus rien dire. Régénère après un GET : `
       + `node scripts/releve-tailles-prod.mjs <prod.json> > scripts/tailles-prod.json`);

  // LE RÉEL.
  for (const m of constatsTailles(tailles.chemins)) fail(`44e étage — ${m}`);

  // LES TÉMOINS. Chaque axe déclaré doit être prouvé par un relevé faux qui le fait crier — sinon
  // son « zéro » sur le fichier committé ne prouve rien. Même fonction, mêmes entrées de forme.
  const AXES = ["orphelin", "compte", "octets", "donnée"];
  const clone = () => JSON.parse(JSON.stringify(tailles.chemins));
  const unConteneur = Object.keys(tailles.chemins).find((c) => c.startsWith("charge.config.") && tailles.chemins[c].forme === "liste");
  // Un enfant SCALAIRE de `config` : sa propre identité n'est pas posée (un scalaire n'a pas de
  // ponctuation), donc lui retirer une occurrence ne fait crier que le [compte] de son parent. Un
  // témoin qui déclencherait deux axes à la fois prouverait les deux et masquerait qu'un des deux
  // ne sait plus crier tout seul.
  const unScalaire = Object.keys(tailles.chemins).find((c) => /^charge\.config\.[A-Za-z0-9_]+$/.test(c) && tailles.chemins[c].forme === "scalaire");
  const TEMOINS = [
    ["orphelin", `un chemin intermédiaire (« ${unConteneur} ») retiré du relevé`,
      () => { const c = clone(); delete c[unConteneur]; return c; }],
    ["compte", `un enfant (« ${unScalaire} ») relevé une fois de moins que la prod n'en porte`,
      () => { const c = clone(); c[unScalaire].n -= 1; return c; }],
    ["octets", "un sous-arbre dont le poids n'explique plus celui de son parent",
      () => { const c = clone(); c["charge.config"].octets += 1; return c; }],
    ["donnée", "un chemin qui porte une clé choisie par la famille (une date)",
      () => { const c = clone(); c["charge.config.fuite-2026-08-14"] = { octets: 0, n: 1, cles: 0, enfants: 0, vides: 0, forme: "scalaire" }; return c; }],
  ];
  // La boucle ne juge RIEN : elle collecte, et le verdict est pris une seule fois sur le COMPTE.
  // L'ANCRE est un axe qu'aucune mesure n'émet, promené par la même collecte : il doit rester non
  // prouvé. Sans lui, une collecte qui cesse de lire les cris déclarerait les quatre axes prouvés.
  const AXE_INERTE = "axeQuAucuneMesureNEmet";
  const prouves = new Set();
  const pourquoi = new Map(TEMOINS.map(([a, q]) => [a, q]));
  // L'ancre est une DÉCLARATION tant que rien ne compte les passages : la retirer de la boucle
  // laissait tout au vert (mesuré). Le compte de visites en fait une mesure — c'est la même faute
  // que « une liste est une déclaration, pas une mesure » (v2.17.20), et elle se solde pareil.
  let visites = 0;
  for (const [axe, , faux] of [...TEMOINS, [AXE_INERTE, "", clone]]) {
    visites++;
    if (constatsTailles(faux()).some((m) => m.startsWith(`[${axe}]`))) prouves.add(axe);
  }
  if (visites !== TEMOINS.length + 1)
    fail(`44e étage — la collecte a visité ${visites} témoin(s) pour ${TEMOINS.length} déclaré(s) plus `
       + `l'ancre. Si c'est l'ancre qui manque, plus rien ne surveille une collecte qui cesserait de `
       + `lire les cris, et le « ${AXES.length}/${AXES.length} prouvés » deviendrait automatique.`);
  if (prouves.has(AXE_INERTE))
    fail(`44e étage — ANCRE : la collecte déclare prouvé « ${AXE_INERTE} », un axe qu'aucune mesure `
       + `n'émet. Elle ne lit donc plus les cris qu'elle compte, et le « ${AXES.length}/${AXES.length} prouvés » ne veut plus rien dire.`);
  for (const axe of AXES)
    if (!prouves.has(axe))
      fail(`44e étage — l'axe [${axe}] est déclaré et aucun témoin ne prouve qu'il sait crier`
         + `${pourquoi.has(axe) ? ` (le sien — ${pourquoi.get(axe)} — reste muet)` : ` (aucun témoin ne le vise)`}. `
         + `Sa mesure ne mesure peut-être plus rien, et son zéro sur le fichier committé ne prouverait `
         + `alors rien. Répare la mesure, ou ajoute-lui un témoin.`);
  for (const [axe] of TEMOINS)
    if (!AXES.includes(axe))
      fail(`44e étage — le témoin « ${axe} » ne correspond à aucun axe déclaré.`);
  console.log(`    (${Object.keys(tailles.chemins).length} chemins, ${tailles.chemins["charge"] ? tailles.chemins["charge"].octets : 0} octets `
    + `attribués depuis la racine ; ${AXES.length} axes, ${prouves.size}/${AXES.length} prouvés par un relevé faux)`);
  // Ce que le 44e étage NE couvre PAS, écrit noir sur blanc :
  //   • l'axe [unité]. L'identité JSON est invariante d'échelle : tout compter en unités de chaîne
  //     JS au lieu d'octets UTF-8 la laisse vraie à l'octet près (mesuré — c'est la seule
  //     falsification du parcours que les autres axes ne voient pas). Elle se tranche en confrontant
  //     le total à un encodeur INDÉPENDANT, ce qui exige la charge de prod. Cet étage lit un fichier
  //     committé sans la prod sous la main : `constats` accepte la charge en second argument et
  //     l'axe est mesuré à la GÉNÉRATION, jamais ici. C'est une frontière, pas un oubli.
  //   • que le relevé décrive la prod d'AUJOURD'HUI. Seul son âge est arbitré (14 jours), comme
  //     pour `schema-prod.json` : une charge qui change de forme sans que personne régénère reste
  //     invisible jusqu'au plafond.
  //   • la SOUSTRACTION elle-même (`--contre`) n'est pas rejouée ici : elle n'a d'entrée qu'avec
  //     deux relevés, et le dépôt n'en fige qu'un. Ce qu'elle a de mesurable — que rien ne reste
  //     hors attribution — est exactement l'identité que cet étage vérifie sur chacun des deux.
  //   • les chemins ne sont pas croisés avec `scripts/schema-prod.json`. C'est délibéré : l'identité
  //     à l'octet mesure déjà la complétude du parcours à CHAQUE niveau, ce qu'une comparaison de
  //     listes de chemins ne ferait que deviner, et les deux relevés se régénèrent séparément.
  //   • CINQ muettes mesurées (18 variantes rejouées dans un arbre miroir : 11 falsifications de
  //     l'étage, 7 lavages du fichier committé — 13 attrapées). Elles sont TOUTES de la même
  //     famille : une assertion désarmée sur un sujet SAIN ne peut pas crier, parce qu'il n'y a
  //     rien à trouver. Chacune est appariée à la variante qui prouve que sa ligne est vivante :
  //       (a) `for (const m of constatsTailles(...)) fail(...)` retirée — le dernier maillon. Les
  //           SEPT lavages crient à travers cette ligne, donc elle vit.
  //       (b) le plafond d'âge à l'infini — le lavage « relevé vieux de 8 mois » crie à travers lui.
  //       (c) l'arbitrage de `prodSavedAt` absent — le lavage « prodSavedAt absent » crie à travers.
  //       (d) le contrôle témoin→axe retiré — les falsifications « AXES vidé » et « un axe retiré »
  //           crient à travers lui.
  //       (e) le compte de visites retiré — la falsification « l'ANCRE n'est plus promenée » crie à
  //           travers lui (c'est LUI qui l'attrape : sans ce compte, elle était muette, mesuré).
  //     C'est la leçon de la v2.17.20 : falsification et lavage ne voient pas la même chose, il
  //     faut les deux, et une muette appariée n'est pas un angle mort.
}

if (failures) {
  console.error(`\n✗ Couche de fusion : ${failures} problème(s).`);
  console.error("  Toute règle de fusion doit être écrite dans LES DEUX fichiers.\n");
  process.exit(1);
}
console.log("✓ Parité de fusion client/serveur vérifiée.");
