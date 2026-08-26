// ═══════════════════════════════════════════════════════════════════════════
// La réparation faite au chargement atteint-elle le cloud ? (`doitRestamper`)
// ═══════════════════════════════════════════════════════════════════════════
// Pourquoi ce fichier existe (v2.17.14, 2026-08-25) :
// `App.jsx` persiste TOUJOURS les données migrées au chargement. Ce `save()` repasse par
// `remotePush`, qui refusionne avant d'écrire — et `mergeFamily` arbitre sur `savedAt`.
// Tant que ce chemin recopiait le `savedAt` du serveur, l'arbitrage était à ÉGALITÉ, donc
// « la base gagne » : tout ce que la migration réparait dans un champ dernière-écriture-gagne
// était réécrit par le cloud avant d'y arriver. Mesuré sur la prod du 2026-08-25 : 5 cibles
// sur 5 perdues. Rien ne criait — la migration se réapplique à chaque chargement, l'écran de
// l'appareil qui vient de charger a l'air juste, et la valeur d'avant revient à la fusion
// suivante. Le symptôme visible était `savedAt` figé à la milliseconde pendant quatre nuits.
//
// Ce contrôle tient les DEUX bouts, et les deux comptent autant :
//   • les ANCRES — une réparation doit passer. Sans elles, supprimer `doitRestamper` passerait.
//   • les TÉMOINS — restamper quand rien n'a changé est un défaut SYMÉTRIQUE, pas une
//     prudence : ça fait gagner l'appareil qui vient d'ouvrir l'app sur tous les champs
//     dernière-écriture-gagne, tous les jours. Le premier jet de `doitRestamper` (comparer
//     `_famSig`) tombait exactement là, à cause d'`activeDays` que la migration ressort TRIÉE
//     alors que le cloud la porte en désordre — même ensemble, aucun consommateur de l'ordre.
//     Le témoin `ordre` ci-dessous est CE cas-là, figé pour qu'il ne revienne pas.
//
// Il ne teste pas `mergeFamily` (c'est le rôle de check-merge-parity.mjs) : il teste que la
// décision de restamper est prise quand — et seulement quand — la fusion jetterait la réparation.
import { fileURLToPath } from "node:url";
import path from "node:path";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { doitRestamper } = await import(path.join(ROOT, "src/sync.js"));
const { mergeFamily } = await import(path.join(ROOT, "src/merge.js"));

let failures = 0;
const fail = (m) => { failures++; console.error("  ✗ " + m); };

// Deux copies qui se CONTREDISENT sur les champs testés : une fixture identique des deux côtés
// donnerait le même résultat avec ou sans règle, et le contrôle passerait sans rien surveiller.
const cloud = () => ({
  savedAt: "2026-08-25T05:13:57.632Z",
  config: {
    theme: "minecraft",
    players: [{ id: "p1", name: "Antoine" }, { id: "p2", name: "Elli" }],
    assignments: [], customTasks: [],
  },
  gameStates: [
    { pin: "1234", mode: "week", coins: 12, house: { floor: null }, xp: 100,
      activeDays: ["2026-08-09", "2026-06-13", "2026-07-16"], completed: [] },
    { pin: "5678", mode: "day", coins: 3, house: { floor: "f1" }, xp: 50,
      activeDays: ["2026-07-02", "2026-06-30"], completed: [] },
  ],
});
const clone = (o) => JSON.parse(JSON.stringify(o));

// La fixture brute n'est PAS un état de prod : `mergeFamily` lui ajoute 116 champs de schéma
// (`removedAssignments: []`, `themeId: "none"`, `boss: null`…) qu'une donnée déjà fusionnée porte
// depuis longtemps. Mesurer la restampe sur elle mesurerait cette COMPLÉTION, pas une réparation —
// les deux témoins criaient pour ça, et pour ça seulement (sur la prod ils sont muets, mesuré le
// 2026-08-25). On travaille donc sur le POINT FIXE de la fusion, l'état de toute donnée en prod.
// Conséquence assumée et vraie : au tout premier chargement d'une donnée incomplète (famille
// neuve), `doitRestamper` dira OUI. C'est souhaitable — ces 116 champs ont intérêt à monter — et
// ça n'arrive qu'une fois. Le point fixe n'est pas supposé : il est VÉRIFIÉ juste en dessous.
const pointFixe = (d) => mergeFamily(d, clone(d));
{
  const un = pointFixe(cloud()), deux = pointFixe(un);
  if (JSON.stringify(un) !== JSON.stringify(deux))
    fail("la fusion n'a pas de point fixe sur la fixture : ce contrôle mesurerait de la complétion de schéma, pas une réparation");
}

// ── ANCRES : une réparation sur un champ dernière-écriture-gagne ────────────
// Chacune est vérifiée DEUX fois : la décision (`doitRestamper` dit OUI) et l'EFFET
// (la valeur survit vraiment à `mergeFamily`). La décision seule ne prouve rien :
// un `doitRestamper` qui renverrait toujours `true` passerait les ancres et échouerait
// les témoins — c'est précisément pour ça que les deux séries sont là.
const ancres = [
  ["config.theme",              (d, v) => { d.config.theme = v; },              (d) => d.config.theme],
  ["config.players[0].name",    (d, v) => { d.config.players[0].name = v; },    (d) => d.config.players[0].name],
  ["gameStates[0].pin",         (d, v) => { d.gameStates[0].pin = v; },         (d) => d.gameStates[0].pin],
  ["gameStates[0].mode",        (d, v) => { d.gameStates[0].mode = v; },        (d) => d.gameStates[0].mode],
  ["gameStates[0].house.floor", (d, v) => { d.gameStates[0].house.floor = v; }, (d) => d.gameStates[0].house?.floor],
  ["gameStates[1].coins",       (d, v) => { d.gameStates[1].coins = v; },       (d) => d.gameStates[1].coins],
];
for (const [nom, set, get] of ancres) {
  const avant = pointFixe(cloud());
  const apres = clone(avant);
  const val = typeof get(avant) === "number" ? get(avant) + 777 : "RÉPARÉ";
  set(apres, val);
  if (!doitRestamper(avant, apres, true)) { fail(`ancre ${nom} : la fusion jetterait la réparation, doitRestamper dit NON`); continue; }
  const ecrit = mergeFamily(avant, { ...apres, savedAt: new Date(Date.parse(avant.savedAt) + 60000).toISOString() });
  if (get(ecrit) !== val) fail(`ancre ${nom} : restampé mais la réparation ne survit pas (${JSON.stringify(get(ecrit))})`);
}

// ── TÉMOINS : ne PAS restamper ─────────────────────────────────────────────
const temoins = [
  ["rien n'a changé", (d) => d, true],
  // le cas réel qui a fait tomber le premier jet : la migration trie `activeDays`, le cloud la
  // porte en désordre. Même ensemble, fusionnée en union, aucun consommateur ne lit l'ordre.
  ["réordonnancement d'une liste de scalaires", (d) => { d.gameStates[0].activeDays = [...d.gameStates[0].activeDays].sort(); return d; }, true],
  // une copie locale possiblement périmée (load() retombé sur le local seul) ne doit JAMAIS
  // gagner par sa simple ouverture — même garde que le ménage des orphelines (v2.15.8).
  ["chargement non synchronisé", (d) => { d.config.theme = "RÉPARÉ"; return d; }, false],
];
for (const [nom, muter, synced] of temoins) {
  const avant = pointFixe(cloud());
  const apres = muter(clone(avant));
  if (doitRestamper(avant, apres, synced)) fail(`témoin « ${nom} » : restampe alors qu'il ne faut pas`);
}

// ── L'ANCRE DU CONTRÔLE LUI-MÊME ───────────────────────────────────────────
// Un contrôle dont les fixtures ne se contredisent jamais passe en vert sans rien surveiller.
// Celui-ci le vérifie sur lui-même : la fixture DOIT produire une divergence de fusion.
{
  const avant = pointFixe(cloud()), apres = clone(avant);
  apres.config.theme = "AUTRE";
  const f = mergeFamily(avant, apres);
  if (f.config.theme === "AUTRE") fail("fixture inerte : à savedAt égal la fusion devrait garder la BASE — le contrôle ne surveille rien");
}

if (failures) {
  console.error(`\n✗ Restampe après migration : ${failures} problème(s).`);
  console.error("  Une réparation faite au chargement doit atteindre le cloud — et une");
  console.error("  restampe inutile fait gagner un appareil périmé. Les deux sont des défauts.\n");
  process.exit(1);
}
console.log("✓ Restampe après migration vérifiée (6 ancres, 3 témoins).");
