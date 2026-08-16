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
  calendar: [{ id: "e1", updatedAt: 5, title: "A" }], removedCalendarIds: ["e0"],
  avatar: { configured: true, skin: "a" }, pin: "1111", mode: "routine",
  removedRoutineIds: ["r_old"],
  routines: [{ id: "rt1", name: "Matin A", tasks: ["a"] }],
  activeRoutineId: "rt1", hiddenRewards: ["rw_h_a"], hiddenWeek: "2026-08-07",
  dailyClaimed: { day: "2026-08-14", ids: ["o3"] },
  ritualCelebrated: { day: "2026-08-14", ids: ["rt1"] },
  consumedCelebrationIds: ["c_a"], pendingCelebrations: [{ id: "c_p_a" }],
  petXp: { dragon: 40 }, petDay: { day: "2026-08-14", xp: 10 },
  petEvo: { dragon: { path: "feu" } }, petNickname: { dragon: "Flamme" },
  energy: 60, energyTs: "2026-08-14T12:00:00.000Z", lastFedDay: "2026-08-14",
  activeDays: ["2026-08-14"], leagueTier: "or",
  sessionMinutes: { day: "2026-08-15", minutes: 42 },
  bossBattle: { bossId: "2026-08-01", earned: 5, spent: 2, dmg: 30 },
  settings: { calm: true }, dismissedAnnouncements: ["an_a"],
  challengeTiers: { week: "2026-08-14", tiers: [3] },
  house: { deco: ["tapis_a"] }, lastSeenDay: "2026-08-14",
};
const gsB = {
  ...gsA,
  xp: 700, coins: 80, coinsLifetime: 800, coinsWeek: { week: "2026-08-07", coins: 99 },
  completed: ["t3#2026-08-15"], completedAt: { "t3#2026-08-15": "2026-08-15T10:00:00.000Z" },
  xpLog: [{ id: "x2", date: "2026-08-15", amount: 30, source: "rituel" }],
  pending: ["t4#2026-08-15"], refusedKeys: ["t8#2026-08-02"], refusals: ["r-b"],
  owned: ["item_b"], boughtRewards: ["rw_bonbon"], rewardBuyTs: { rw_bonbon: 222 },
  refundedRewards: ["rw_new"], badges: ["b_b"], equipped: { cape: "c_b" },
  calendar: [{ id: "e1", updatedAt: 9, title: "B" }], removedCalendarIds: ["e2"],
  avatar: { configured: false, skin: "b" }, pin: "2222", mode: "semaine",
  removedRoutineIds: ["r_other"],
  routines: [{ id: "rt1", name: "Matin B", tasks: ["a", "b"] }],
  activeRoutineId: "rt2", hiddenRewards: ["rw_h_b"], hiddenWeek: "2026-08-14",
  dailyClaimed: { day: "2026-08-14", ids: ["o6"] },
  ritualCelebrated: { day: "2026-08-14", ids: ["rt2"] },
  consumedCelebrationIds: ["c_b"], pendingCelebrations: [{ id: "c_p_b" }],
  petXp: { dragon: 10, chat: 5 }, petDay: { day: "2026-08-14", xp: 25 },
  petEvo: { dragon: { path: "glace" } }, petNickname: { chat: "Minou" },
  energy: 95, energyTs: "2026-08-14T12:01:00.000Z", lastFedDay: "2026-08-13",
  activeDays: ["2026-08-13"], leagueTier: "bronze",
  sessionMinutes: { day: "2026-08-15", minutes: 5 },
  bossBattle: { bossId: "2026-08-01", earned: 9, spent: 1, dmg: 10 },
  settings: { sound: false }, dismissedAnnouncements: ["an_b"],
  challengeTiers: { week: "2026-08-07", tiers: [3, 5, 7] },
  house: { deco: ["tapis_b"] }, lastSeenDay: "2026-08-15",
};

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
  customRewards: [{ id: "cr1", label: "Maison A", coins: 20 }],
  updateFeedEntries: [{ type: "update", version: "2.16.70", features: ["a"], ts: "2026-08-15" }],
  selectedRewards: ["rw_ecran"], seenVersions: ["2.16.70"],
  feed: [{ id: "f1", ts: 2, likes: ["p1"] }],
  bugs: [{ id: "bg1", ts: 2 }], errorLogs: [{ id: "er1", ts: 2 }],
  coinOffers: [], teamInvites: [], repairEvents: [{ id: "rp1", ts: 2 }], momentRequests: [],
  boss: { startedAt: "2026-08-01", hp: 100, lastHitTs: "2026-08-14T10:00:00.000Z" },
  weeklyQuests: { generatedForWeek: "2026-08-14", assignments: [{ instanceId: "wq1", taskId: "tk1", playerIds: ["p1"], days: [0] }] },
  weeklyChallenge: { weekKey: "2026-08-14", challenges: [{ playerId: "p1", text: "A", checkins: { "2026-08-14": true } }] },
});
const famB = mkFam("2026-08-14T12:00:00.000Z", gsB, {
  announcements: [{ id: "an2", createdAt: "2026-08-13", text: "B" }],
  childTaskProposals: [{ id: "pr2", label: "Proposition B" }], removedProposals: ["pr3"],
  removalRequests: [{ id: "rq2", instanceId: "as1" }],
  customRewards: [{ id: "cr2", label: "Maison B", coins: 30 }],
  updateFeedEntries: [{ type: "update", version: "2.16.41", features: ["b"], ts: "2026-08-06" }],
  selectedRewards: ["rw_bonbon"], seenVersions: ["2.16.41"],
  feed: [{ id: "f1", ts: 2, likes: ["p2"] }],
  bugs: [{ id: "bg2", ts: 1 }], errorLogs: [{ id: "er2", ts: 1 }],
  coinOffers: [], teamInvites: [], repairEvents: [{ id: "rp2", ts: 1 }], momentRequests: [],
  boss: { startedAt: "2026-08-01", hp: 60, lastHitTs: "2026-08-15T10:00:00.000Z" },
  weeklyQuests: { generatedForWeek: "2026-08-07", assignments: [{ instanceId: "wq2", taskId: "tk1", playerIds: ["p1"], days: [1] }] },
  weeklyChallenge: { weekKey: "2026-08-07", challenges: [{ playerId: "p1", text: "B", checkins: { "2026-08-07": true } }] },
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

if (failures) {
  console.error(`\n✗ Parité de fusion : ${failures} divergence(s) entre src/merge.js et server-merge.cjs.`);
  console.error("  Toute règle de fusion doit être écrite dans LES DEUX fichiers.\n");
  process.exit(1);
}
console.log("✓ Parité de fusion client/serveur vérifiée.");
