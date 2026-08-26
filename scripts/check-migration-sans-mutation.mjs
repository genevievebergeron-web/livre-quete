// ═══════════════════════════════════════════════════════════════════════════
// `migrateSavedData` laisse-t-elle son ARGUMENT intact ? (intégrité de `raw`)
// ═══════════════════════════════════════════════════════════════════════════
// Pourquoi ce fichier existe (v2.17.15, 2026-08-26) :
// La v2.17.14 a posé `doitRestamper(raw, migre, …)` — restamper `savedAt` quand la fusion à venir
// jetterait ce que la migration vient de réparer. Ce détecteur compare deux états. Il a donc un
// angle mort STRUCTUREL, qu'aucune de ses ancres ni de ses témoins ne peut voir : si une migration
// écrit dans un sous-objet que `raw` et la sortie PARTAGENT, l'état « avant » cesse d'exister,
// les deux côtés portent la réparation, la comparaison est muette — et le cloud jette la
// réparation exactement comme avant la v2.17.14.
//
// Ce n'est pas une inquiétude de relecture, c'est un chiffre. Mesuré le 2026-08-26 sur la donnée
// de prod, cinq champs « dernière écriture gagne », fusion posée contre la copie SERVEUR intacte
// (celle de `remotePush`, pas contre la copie locale — qui est mutée dans ce régime et ferait
// « survivre » la réparation par construction) :
//   • réparation IMMUABLE (ce que le code fait aujourd'hui) : 5/5 détectées, 5/5 au cloud ;
//   • réparation par MUTATION EN PLACE                      : 0/5 détectées, 0/5 au cloud.
//
// Et la surface est large : sur la prod, `migrateSavedData` rend **700** racines de sous-arbres
// PAR RÉFÉRENCE depuis son argument, contre 75 nœuds reconstruits. `gameStates[].completed`,
// `.house`, `.xpLog`, `.pending`, `config.players`, `config.customTasks`, `config.feed`… tous
// partagés. Un `gs.completed.push(…)` ou un `cfg.players[0].name = …` dans une migration future
// suffit, et rien ne crierait. C'est ce silence-là que ce fichier casse.
//
// Il tient deux choses, et la première conditionne la seconde :
//   • la COUVERTURE — chaque ménage visé doit avoir AGI sur la fixture. Une fixture qui n'atteint
//     plus un ménage ne le surveille pas : le contrôle passerait au vert sur du code mort. C'est
//     un ÉCHEC ici, pas un avertissement.
//   • l'INTÉGRITÉ — l'argument doit être bit-pour-bit identique après l'appel.
//
// Deux fixtures, parce qu'un seul régime ne peut pas couvrir les deux : les ménages à DRAPEAU
// UNIQUE ne tournent que sur une donnée qui ne les porte pas, et `rotativeCleanupV1` VIDE
// `assignments` — il masque donc les ménages d'orphelines qui viennent après lui. Les mesurer
// dans la même fixture, ce serait n'en mesurer aucun.
// v2.17.18 — le bloc de ménage qui tourne APRÈS `migrateSavedData` et AVANT `doitRestamper`
// (tâches « un jour » périmées, tâches perso orphelines) était nommé ici comme angle mort assumé :
// il vivait dans `App.jsx`, que Node ne peut pas importer (JSX + React), donc « vérifié à la main,
// pas mesuré ». Il vit maintenant dans `src/post-migration-cleanup.js` et il est mesuré plus bas,
// aux mêmes deux promesses, plus deux qui n'appartiennent qu'à lui (le garde `synced` de la
// v2.15.8, et l'ORDRE des deux ménages).
//
// CE QU'IL NE COUVRE TOUJOURS PAS : ce qui reste dans le `useEffect` d'`App.jsx` autour de ces
// appels (`setConfig`/`setGameStates`, la persistance, l'injection du changelog dans le fil).
// Aucune de ces lignes ne transforme `data` avant `doitRestamper` aujourd'hui — mais c'est du
// raisonnement, pas une mesure : la frontière du mesurable est la frontière du module.
//
import { fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { migrateSavedData } = await import(path.join(ROOT, "src/migrations.js"));
const { TASK_CATALOG } = await import(path.join(ROOT, "src/catalog.js"));
const { COLOR_DESATURATE_MAP } = await import(path.join(ROOT, "src/shared.js"));
const { nettoyerApresMigration } = await import(path.join(ROOT, "src/post-migration-cleanup.js"));

let failures = 0;
const fail = (m) => { failures++; console.error("  ✗ " + m); };
const VRAI_ID = TASK_CATALOG[0].id;                       // tâche du catalogue → assignation VIVANTE
const COULEUR_AVANT = Object.keys(COLOR_DESATURATE_MAP)[0];

// ── Fixture A — famille DÉJÀ MIGRÉE (le régime de la prod) ────────────────
// Tous les drapeaux posés : seuls les ménages qui tournent à CHAQUE chargement peuvent agir.
// La saleté est donc « vivante » : orpheline apparue après le passage des ménages à drapeau,
// rituel pointant sur une assignation disparue, `pending` sans assignation.
const familleMigree = () => ({
  savedAt: "2026-08-26T00:00:00.000Z",
  config: {
    pin: "1146", theme: "minecraft",
    rotativeCleanupV1: true, colorToneDownV1: true, orphanAssignCleanupV1: true,
    orphanAssignCleanupV2: true, updateFeedRebuildV1: true,
    players: [{ id: "p1", name: "Antoine", color: "#5F87B3" }],
    customTasks: [],
    assignments: [
      { instanceId: "i_vivante", taskId: VRAI_ID },      // survit
      { instanceId: "i_morte",   taskId: "cust_disparue" }, // orpheline VIVANTE → ménage LIVE
    ],
    weeklyQuests: { assignments: [{ instanceId: "wq_morte", taskId: "cust_disparue2" }] },
    removalRequests: [{ instanceId: "i_morte" }],        // pointe sur une assignation qui disparaît
    updateFeedEntries: [
      { type: "update", version: "1.2.0", features: ["a"], ts: "2026-01-01" },
      { type: "update", version: "1.2.0", features: ["a"], ts: "2026-01-01" }, // doublon
    ],
  },
  gameStates: [{
    pin: "1234", xp: 10, completed: [], completedAt: {},
    pending: ["i_morte_p1#2026-08-25"],                  // orphelin → purgé
    routines: [{ id: "r1", taskIds: ["i_morte"] }],      // 100 % mort → rituel retiré
    activeRoutineId: "r1",                               // → remis à null
  }],
});

// ── Fixture B — famille NEUVE (aucun drapeau) ─────────────────────────────
// Ici ce sont les ménages à drapeau unique qui tournent. `rotativeCleanupV1` vide `assignments`,
// donc les orphelines ne sont PAS ce qu'on mesure dans cette fixture — c'est le rôle de A.
const familleNeuve = () => ({
  savedAt: "2026-08-26T00:00:00.000Z",
  config: {
    players: [{ id: "p1", name: "Antoine", color: COULEUR_AVANT }], // → désaturée
    assignments: [{ instanceId: "i_x", taskId: VRAI_ID }],          // → vidée par rotativeCleanupV1
    removalRequests: [{ instanceId: "i_x" }],
    updateFeedEntries: [{ type: "update", version: "1.2.0", features: ["vieux"], ts: "2026-01-01" }],
  },
  gameStates: [{ pin: "1234", xp: 0, completed: [], completedAt: {} }],
});

// ── COUVERTURE : chaque ménage a-t-il vraiment AGI ? ──────────────────────
// Sans ces assertions, une fixture qui cesse d'atteindre un ménage rendrait ce contrôle vert
// sur du code qu'il ne visite plus. Chaque ligne dit ce que le ménage DOIT avoir changé.
const couverture = [
  ["A", familleMigree, [
    ["ménage LIVE des orphelines (config.assignments)",
      (e, o) => o.config.assignments.length < e.config.assignments.length
             && o.config.assignments.every((a) => a.instanceId !== "i_morte")
             && o.config.assignments.some((a) => a.instanceId === "i_vivante")],
    ["ménage LIVE des orphelines (weeklyQuests.assignments)",
      (e, o) => (o.config.weeklyQuests.assignments || []).length < (e.config.weeklyQuests.assignments || []).length],
    ["removalRequests mortes filtrées",
      (e, o) => (o.config.removalRequests || []).length < (e.config.removalRequests || []).length],
    ["pending orphelins purgés",
      (e, o) => (o.gameStates[0].pending || []).length < (e.gameStates[0].pending || []).length],
    ["rituel 100 % mort retiré",
      (e, o) => (o.gameStates[0].routines || []).length < (e.gameStates[0].routines || []).length],
    ["activeRoutineId remis à null",
      (e, o) => e.gameStates[0].activeRoutineId != null && o.gameStates[0].activeRoutineId === null],
    ["updateFeedEntries dédoublonnées",
      (e, o) => (o.config.updateFeedEntries || []).length < (e.config.updateFeedEntries || []).length],
  ]],
  ["B", familleNeuve, [
    ["rotativeCleanupV1 a vidé assignments et posé son drapeau",
      (e, o) => e.config.assignments.length > 0 && o.config.assignments.length === 0
             && !e.config.rotativeCleanupV1 && o.config.rotativeCleanupV1 === true],
    ["colorToneDownV1 a désaturé la couleur du joueur",
      (e, o) => o.config.players[0].color !== e.config.players[0].color
             && o.config.players[0].color === COLOR_DESATURATE_MAP[e.config.players[0].color]],
    ["orphanAssignCleanupV1/V2 ont posé leurs drapeaux",
      (e, o) => !e.config.orphanAssignCleanupV1 && !e.config.orphanAssignCleanupV2
             && o.config.orphanAssignCleanupV1 === true && o.config.orphanAssignCleanupV2 === true],
    ["updateFeedRebuildV1 a rebâti le fil des nouveautés",
      (e, o) => !e.config.updateFeedRebuildV1 && o.config.updateFeedRebuildV1 === true
             && (o.config.updateFeedEntries || []).length > (e.config.updateFeedEntries || []).length],
    ["migrateGameState a complété l'état du joueur",
      (e, o) => e.gameStates[0].coins === undefined && typeof o.gameStates[0].coins === "number"
             && !Array.isArray(e.gameStates[0].activeDays) && Array.isArray(o.gameStates[0].activeDays)],
  ]],
];
// L'entrée est relue depuis un instantané pris AVANT l'appel : la couverture reste juste même
// si l'intégrité est violée (sinon une mutation en place blanchirait les deux contrôles d'un coup —
// un contrôle qui lit APRÈS la transformation ne peut pas juger la transformation).
for (const [nom, fabrique, checks] of couverture) {
  const raw = fabrique();
  const entree = JSON.parse(JSON.stringify(raw));
  const sortie = migrateSavedData(raw);
  for (const [quoi, ok] of checks) {
    let vert = false;
    try { vert = !!ok(entree, sortie); } catch { vert = false; }
    if (!vert) fail(`couverture ${nom} — « ${quoi} » n'a rien RETIRÉ ni CHANGÉ : la fixture ne porte plus la saleté que ce ménage existe pour nettoyer, donc ce contrôle ne le surveille pas`);
  }
}

// ── INTÉGRITÉ : l'argument survit-il intact ? ─────────────────────────────
// C'est CE que `doitRestamper` ne peut structurellement pas voir. La comparaison est faite sur
// une sérialisation prise AVANT l'appel : elle attrape aussi bien un champ écrasé qu'un `push`
// dans une liste partagée, à n'importe quelle profondeur.
for (const [nom, fabrique] of [["A (déjà migrée)", familleMigree], ["B (neuve)", familleNeuve]]) {
  const raw = fabrique();
  const avant = JSON.stringify(raw);
  migrateSavedData(raw);
  if (JSON.stringify(raw) !== avant)
    fail(`intégrité ${nom} : \`migrateSavedData\` a MODIFIÉ son argument. L'état « avant » n'existe plus, `
       + `donc \`doitRestamper\` (sync.js) ne peut plus voir la réparation, donc le cloud la jette `
       + `(mesuré : 0/5 réparations arrivent au cloud dans ce régime). Reconstruire au lieu de muter.`);
}

// ═══════════════════════════════════════════════════════════════════════════
// `nettoyerApresMigration` — les deux ménages du chargement (v2.17.18)
// ═══════════════════════════════════════════════════════════════════════════
// Mêmes deux promesses que ci-dessus (COUVERTURE + INTÉGRITÉ), plus deux qui n'appartiennent
// qu'à ce module et qu'aucune des deux ne peut voir :
//   • le GARDE `synced` — la cause racine de la v2.15.8. Le ménage des orphelines ne doit PAS
//     agir sur une lecture qui n'a pas été confirmée par le cloud, sinon une copie locale périmée
//     fait passer des tâches vivantes pour orphelines et les tombstone pour toujours. « Il agit »
//     et « il s'abstient » sont deux faits distincts : les deux sont mesurés.
//   • l'ORDRE — le ménage des orphelines lit `assignments` APRÈS le filtrage des « un jour ».
//     Les inverser laisse en vie une tâche perso dont la dernière assignation vient de partir.
//     Mesuré par une DIFFÉRENCE entre deux jours, pas par un état final.
//
// La fixture porte de la saleté des DEUX sortes. Sans elle, le contrôle serait inerte : sur la
// prod du 2026-08-26, les deux ménages sont des no-op (317→317 assignations, 83→83 tâches perso),
// et comparer deux no-op ne prouve rien.
const HIER = "2026-08-25", AUJD = "2026-08-26";
const familleAuChargement = () => ({
  savedAt: "2026-08-26T00:00:00.000Z",
  config: {
    assignments: [
      { instanceId: "i_perenne", taskId: "cust_perenne" },            // sans `oneDay` → survit
      { instanceId: "i_hier",    taskId: "cust_a", oneDay: HIER },    // périmé → part
      { instanceId: "i_hier2",   taskId: "cust_c", oneDay: HIER },    // périmé, tombstone NON pré-semé
      { instanceId: "i_aujd",    taskId: "cust_b", oneDay: AUJD },    // du jour → survit AUJD
    ],
    weeklyQuests: { assignments: [{ instanceId: "wq1", taskId: "cust_wq" }] },
    customTasks: [
      { id: "cust_perenne", label: "vivante" },   // assignée → survit
      { id: "cust_wq",      label: "hebdo" },     // tenue en vie par weeklyQuests SEUL
      { id: "cust_a",       label: "orpheline" }, // sa seule assignation part avec `i_hier`
      { id: "cust_b",       label: "du jour" },   // orpheline seulement APRÈS AUJD
      { id: "cust_c",       label: "orpheline 2" }, // part avec `i_hier2`
    ],
    removedAssignments: ["i_hier"],      // déjà là → le tombstone ne doit pas doubler
    removedCustomTasks: [],
  },
  gameStates: [{ pin: "1234", xp: 0, completed: [], completedAt: {} }],
});
const ids = (arr, k) => (arr || []).map((x) => (k ? x[k] : x));

// ── COUVERTURE : chaque ménage a-t-il RETIRÉ quelque chose ? ──────────────
// Écrit en DIFFÉRENCE entrée→sortie, jamais en état final : une fixture qu'on viderait de sa
// saleté satisferait « il reste les vivantes » tout aussi bien, et le contrôle passerait au vert
// sur du code qu'il ne visite plus.
{
  const couvertures = [
    // Le tombstone est mesuré sur `i_hier2`, PAS sur `i_hier` : celui-ci est pré-semé dans
    // `removedAssignments` (c'est son rôle, tester le non-doublon), donc un `includes` sur lui
    // est satisfait par la fixture même si le ménage cessait complètement d'écrire le tombstone
    // (mesuré le 2026-08-26 : écriture retirée → zéro crieur). Deux assertions étaient aveugles
    // au même élément de fixture, pour la même raison.
    ["ménage « un jour » — l'assignation périmée est RETIRÉE",
      (e, o) => ids(e.config.assignments, "instanceId").includes("i_hier")
             && !ids(o.config.assignments, "instanceId").includes("i_hier")],
    ["ménage « un jour » — le tombstone est ÉCRIT (mesuré là où la fixture ne le pré-sème pas)",
      (e, o) => !e.config.removedAssignments.includes("i_hier2")
             && o.config.removedAssignments.includes("i_hier2")],
    ["ménage « un jour » — celle du JOUR et la pérenne survivent",
      (e, o) => ids(o.config.assignments, "instanceId").join() === "i_perenne,i_aujd"],
    // Écrit en DIFFÉRENCE, et pas « il y en a exactement 1 » : une fixture SANS le tombstone
    // préexistant satisfait « exactement 1 » grâce à celui que le ménage vient d'ajouter, donc
    // l'assertion cesserait de tester quoi que ce soit sans que rien ne crie (mesuré le
    // 2026-08-26 : fixture lavée là → zéro crieur sur les quatre garde-fous du build).
    ["ménage « un jour » — le tombstone déjà présent ne DOUBLE pas",
      (e, o) => e.config.removedAssignments.includes("i_hier")
             && o.config.removedAssignments.filter((x) => x === "i_hier").length === 1],
    ["ménage des orphelines — la tâche perso dont l'assignation vient de partir est RETIRÉE",
      (e, o) => ids(e.config.customTasks, "id").includes("cust_a")
             && !ids(o.config.customTasks, "id").includes("cust_a")
             && o.config.removedCustomTasks.includes("cust_a")],
    ["ménage des orphelines — `weeklyQuests` tient sa tâche en vie (le trou de la v2.15.8)",
      (e, o) => ids(e.config.customTasks, "id").includes("cust_wq")
             && ids(o.config.customTasks, "id").includes("cust_wq")],
    // Sans cette ligne, un ménage qui retirerait TOUTES les tâches perso passait au vert : les
    // autres assertions ne parlent que de ce qui doit PARTIR (mesuré le 2026-08-26, zéro crieur).
    ["ménage des orphelines — une tâche perso ASSIGNÉE survit",
      (e, o) => ids(e.config.customTasks, "id").includes("cust_perenne")
             && ids(o.config.customTasks, "id").includes("cust_perenne")
             && ids(o.config.customTasks, "id").includes("cust_b")],
  ];
  const raw = familleAuChargement();
  const entree = JSON.parse(JSON.stringify(raw));
  const sortie = nettoyerApresMigration(raw, { today: AUJD, synced: true });
  for (const [quoi, ok] of couvertures) {
    let vert = false;
    try { vert = !!ok(entree, sortie); } catch { vert = false; }
    if (!vert) fail(`couverture chargement — « ${quoi} » : la fixture ne porte plus la saleté que ce ménage existe pour nettoyer, ou le ménage ne l'atteint plus`);
  }
}

// ── Le GARDE `synced` (cause racine v2.15.8) ──────────────────────────────
// Deux faits distincts, deux mesures : sans synchro confirmée, le ménage des orphelines
// S'ABSTIENT — et celui des « un jour », lui, tourne quand même (il ne dépend d'aucun réseau).
{
  const raw = familleAuChargement();
  const entree = JSON.parse(JSON.stringify(raw));
  const o = nettoyerApresMigration(raw, { today: AUJD, synced: false });
  // En DIFFÉRENCE contre l'entrée, jamais contre une longueur codée en dur : un « === 4 » se
  // périme dès que la fixture gagne ou perd une tâche, et le fait mesuré est « rien n'a été retiré ».
  if (ids(o.config.customTasks, "id").join() !== ids(entree.config.customTasks, "id").join()
      || o.config.removedCustomTasks.length !== entree.config.removedCustomTasks.length)
    fail("garde `synced` : le ménage des orphelines a AGI sur une lecture non confirmée par le cloud. "
       + "C'est la cause racine de la v2.15.8 — une copie locale périmée fait passer des tâches vivantes "
       + "pour orphelines, les tombstone pour toujours et repousse le tombstone au cloud aussitôt.");
  if (ids(o.config.assignments, "instanceId").includes("i_hier"))
    fail("garde `synced` : le ménage « un jour » s'est abstenu lui aussi. Il ne dépend d'aucune "
       + "lecture réseau (une date périmée l'est sur n'importe quelle copie) — le garde est posé trop haut.");
}

// ── L'ORDRE des deux ménages ──────────────────────────────────────────────
// `cust_b` n'est orpheline QUE lorsque `i_aujd` a été filtrée. La différence entre les deux jours
// est donc la signature de l'ordre : l'inversion rendrait les deux sorties identiques.
{
  const leJour  = nettoyerApresMigration(familleAuChargement(), { today: AUJD, synced: true });
  const lendemain = nettoyerApresMigration(familleAuChargement(), { today: "2026-08-27", synced: true });
  const vivantLeJour = ids(leJour.config.customTasks, "id").includes("cust_b");
  const mortLendemain = !ids(lendemain.config.customTasks, "id").includes("cust_b");
  if (!vivantLeJour || !mortLendemain)
    fail("ordre des ménages : le ménage des orphelines ne lit pas `assignments` APRÈS le filtrage des "
       + `« un jour » (cust_b vivante le jour même : ${vivantLeJour}, morte le lendemain : ${mortLendemain}). `
       + "Inversés, une tâche perso survit un chargement de plus à sa dernière assignation.");
}

// ── INTÉGRITÉ : l'argument survit-il intact ? ─────────────────────────────
// Même raison qu'au-dessus, et elle vaut ici AUSSI : ce module tourne entre `migrateSavedData` et
// `doitRestamper`, sur le `data` que ce dernier compare. Une écriture en place ferait porter la
// réparation aux deux côtés de la comparaison, et le cloud la jetterait en silence.
// Le troisième cas est le chemin `return data` (rien à nettoyer) : il ne reconstruit RIEN, donc
// c'est le seul où une écriture en place serait la seule trace de passage. La fixture y est lavée
// de sa saleté — c'est le seul endroit où ça se justifie, et l'assertion ne porte que sur l'argument.
const familleSansSaleté = () => {
  const f = familleAuChargement();
  f.config.assignments = [{ instanceId: "i_perenne", taskId: "cust_perenne" }];
  f.config.customTasks = [{ id: "cust_perenne", label: "vivante" }, { id: "cust_wq", label: "hebdo" }];
  return f;
};
for (const [quoi, fabrique, args] of [["synchro confirmée", familleAuChargement, { today: AUJD, synced: true }],
                                      ["sans synchro",      familleAuChargement, { today: AUJD, synced: false }],
                                      ["rien à nettoyer",   familleSansSaleté,   { today: AUJD, synced: true }]]) {
  const raw = fabrique();
  const avant = JSON.stringify(raw);
  nettoyerApresMigration(raw, args);
  if (JSON.stringify(raw) !== avant)
    fail(`intégrité chargement (${quoi}) : \`nettoyerApresMigration\` a MODIFIÉ son argument. `
       + "Il tourne entre `migrateSavedData` et `doitRestamper` (sync.js) : l'état « avant » que "
       + "`doitRestamper` compare porterait alors la réparation lui aussi, donc le cloud la jette. "
       + "Reconstruire au lieu de muter.");
}

if (failures) { console.error(`✗ ménages du chargement (couverture + intégrité de l'argument) : ${failures} problème(s)`); process.exit(1); }
console.log("✓ migrateSavedData : argument intact, et les 12 ménages surveillés agissent bien sur les fixtures");
console.log("✓ nettoyerApresMigration : argument intact, les 2 ménages du chargement agissent, garde `synced` et ordre tenus");
