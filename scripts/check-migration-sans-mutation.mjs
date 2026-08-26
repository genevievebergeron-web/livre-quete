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
// CE QU'IL NE COUVRE PAS, et il faut le savoir : le bloc de ménage d'`App.jsx` (~2200-2233,
// tâches « un jour » périmées, tâches perso orphelines) tourne APRÈS `migrateSavedData` et AVANT
// `doitRestamper`, sur le même `data`. Il réassigne `data.config` (`{...data.config, …}`) plutôt
// que d'écrire dedans, donc il est sain aujourd'hui — vérifié à la main le 2026-08-26, pas mesuré
// ici : `App.jsx` n'est pas importable depuis un script Node (JSX + React). Une mutation en place
// ajoutée LÀ retomberait donc dans l'angle mort, et ce fichier resterait muet.
//
import { fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { migrateSavedData } = await import(path.join(ROOT, "src/migrations.js"));
const { TASK_CATALOG } = await import(path.join(ROOT, "src/catalog.js"));
const { COLOR_DESATURATE_MAP } = await import(path.join(ROOT, "src/shared.js"));

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

if (failures) { console.error(`✗ migrateSavedData (couverture des ménages + intégrité de l'argument) : ${failures} problème(s)`); process.exit(1); }
console.log("✓ migrateSavedData : argument intact, et les 12 ménages surveillés agissent bien sur les fixtures");
