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
//
// CE QUE LA FIXTURE PORTE SANS QUE PERSONNE NE LE LISE (mesuré le 2026-09-01, en lavant chaque
// élément un par un et en comptant qui crie). Sur 36 lavages, 25 font crier quelqu'un, 2 font
// planter (matière structurelle : `players[1]`, `savedAt`) et 9 passent en SILENCE :
//   `gameStates[1]` sauf `coins` (`pin`, `mode`, `house`, `activeDays`), `xp` et `completed` des
//   deux états, et la VALEUR de `savedAt`.
// Ces neuf-là sont décoratifs : ils rendent la fixture ressemblante à la prod, aucune assertion
// ne les lit, et les laver ne prouve donc rien. Ce n'est PAS de la couverture — qui ajoutera une
// assertion sur l'un d'eux devra la laver pour vérifier qu'elle mesure autre chose qu'elle-même.
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
    // PAS "minecraft" : c'est la valeur que `mergeFamily` complète par défaut, donc une fixture
    // qui la porte est indiscernable d'une fixture qui n'a pas de thème du tout (mesuré). La
    // prémisse de l'ancre ne mesurerait alors rien. Un thème non-défaut la rend vraie.
    theme: "galaxy",
    players: [{ id: "p1", name: "Antoine" }, { id: "p2", name: "Elli" }],
    // Deux listes d'OBJETS non vides, et l'ordre des deux compte : c'est la seule matière que
    // l'ancre d'ordre plus bas peut réordonner sans effet de bord. (Réordonner `players`, essayé
    // d'abord, ne marche PAS : la fusion apparie les `gameStates` sur l'ordre des joueurs, donc
    // le renversement fait fusionner les deux états ensemble — `activeDays` passe de 3 à 5
    // entrées. `doitRestamper` répond alors OUI pour ce contenu-là, pas pour l'ordre, et
    // l'ancre serait verte sous un module qui exempte l'ordre des objets. Mesuré.)
    assignments: [
      { days: ["mon"], time: "08:00", taskId: "td07", playerIds: ["p1"], instanceId: "i_a" },
      { days: ["tue"], time: "09:00", taskId: "td08", playerIds: ["p2"], instanceId: "i_b" },
    ],
    customTasks: [
      { id: "cust_1", xp: 20, cat: "custom", diff: "medium", coins: 10, emoji: "⭐", label: "Un" },
      { id: "cust_2", xp: 30, cat: "custom", diff: "hard", coins: 15, emoji: "🔥", label: "Deux" },
    ],
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
// La 4e colonne est la PRÉMISSE : la valeur que la fixture — et elle seule — doit poser à ce
// chemin. Sans elle, un lavage de la fixture désarme l'ancre en silence : `mergeFamily` complète
// les `gameStates` jusqu'au nombre de joueurs, donc retirer le 2e état de la fixture laisse un
// créneau REMBOURRÉ (`coins: 0`, aucune `house`) sur lequel l'ancre `gameStates[1].coins`
// continue de passer — elle mesure alors un défaut de schéma, plus une réparation sur l'état
// que la fixture décrit. Mesuré : fixture privée de son 2e état → ZÉRO crieur.
const ancres = [
  ["config.theme",              (d, v) => { d.config.theme = v; },              (d) => d.config.theme,              "galaxy"],
  ["config.players[0].name",    (d, v) => { d.config.players[0].name = v; },    (d) => d.config.players[0].name,    "Antoine"],
  ["gameStates[0].pin",         (d, v) => { d.gameStates[0].pin = v; },         (d) => d.gameStates[0].pin,         "1234"],
  ["gameStates[0].mode",        (d, v) => { d.gameStates[0].mode = v; },        (d) => d.gameStates[0].mode,        "week"],
  ["gameStates[0].house.floor", (d, v) => { d.gameStates[0].house.floor = v; }, (d) => d.gameStates[0].house?.floor, null],
  ["gameStates[1].coins",       (d, v) => { d.gameStates[1].coins = v; },       (d) => d.gameStates[1].coins,       3],
];
for (const [nom, set, get, attendu] of ancres) {
  const avant = pointFixe(cloud());
  const apres = clone(avant);
  if (get(avant) !== attendu) {
    fail(`ancre ${nom} : la fixture n'y pose plus ${JSON.stringify(attendu)} mais ${JSON.stringify(get(avant))} — l'ancre ne mesure plus l'état que la fixture décrit`);
    continue;
  }
  const val = typeof get(avant) === "number" ? get(avant) + 777 : "RÉPARÉ";
  set(apres, val);
  if (!doitRestamper(avant, apres, true)) { fail(`ancre ${nom} : la fusion jetterait la réparation, doitRestamper dit NON`); continue; }
  const ecrit = mergeFamily(avant, { ...apres, savedAt: new Date(Date.parse(avant.savedAt) + 60000).toISOString() });
  if (get(ecrit) !== val) fail(`ancre ${nom} : restampé mais la réparation ne survit pas (${JSON.stringify(get(ecrit))})`);
}

// ── L'ANCRE D'ORDRE : l'exemption s'arrête aux listes d'OBJETS ─────────────
// Le témoin `réordonnancement` ci-dessous fige une EXEMPTION : l'ordre d'une liste de scalaires
// n'est un comportement pour personne, donc le réordonner ne justifie pas une restampe. Une
// exemption sans frontière mesurée s'élargit en silence : un `_triScalaires` qui trierait AUSSI
// les listes d'objets exempterait l'ordre des ASSIGNATIONS et des TÂCHES PERSO, qui est celui
// de l'écran. Rien ne le voyait — falsifié le 2026-09-01 (tri par `JSON.stringify` au lieu du
// garde `every(scalaire)`), ZÉRO crieur sur les six ancres et les trois témoins.
// Chaque ancre vérifie SA prémisse avant de conclure : le renversement doit se voir, et la
// fusion doit vraiment le jeter — sinon il n'y a rien à restamper et l'ancre serait verte pour
// une raison qui n'est pas la sienne. C'est mesuré ici, pas supposé.
for (const [nom, cle, ident] of [
  ["assignments", "assignments", (a) => a.instanceId],
  ["customTasks", "customTasks", (a) => a.id],
]) {
  const avant = pointFixe(cloud());
  const apres = clone(avant);
  apres.config[cle].reverse();
  const ids = (d) => d.config[cle].map(ident).join(",");
  if (ids(avant) === ids(apres))
    fail(`ancre d'ordre ${nom} : la fixture n'a plus de quoi montrer un réordonnancement (liste vide ou à un élément)`);
  else if (ids(mergeFamily(avant, apres)) === ids(apres))
    fail(`ancre d'ordre ${nom} : la fusion ne jette PLUS cet ordre — l'ancre ne mesure plus rien, il faut la relire avant de la croire`);
  else if (!doitRestamper(avant, apres, true))
    fail(`ancre d'ordre ${nom} : la fusion jetterait le réordonnancement et doitRestamper dit NON — l'exemption d'ordre déborde des listes de scalaires`);
}

// ── TÉMOINS : ne PAS restamper ─────────────────────────────────────────────
// Un témoin dit « ne restampe pas ». Une mutation qui ne mute RIEN le satisfait tout aussi bien :
// il devient alors un doublon du premier témoin et ne surveille plus rien. Chacun porte donc sa
// PRÉMISSE — ce que la fixture doit rendre vrai pour que le témoin ait un sens — et elle est
// mesurée, pas relue. Le cas qui a motivé ça est le 2e : trier `activeDays` dans la fixture (ou
// la vider, ou la réduire à un élément) rendait la mutation inerte, et ZÉRO assertion criait.
const temoins = [
  ["rien n'a changé", (d) => d, true,
    (a, b) => [JSON.stringify(a) === JSON.stringify(b),
               "la fixture fait maintenant DIVERGER les deux copies : ce témoin ne dit plus « rien n'a changé »"]],
  // le cas réel qui a fait tomber le premier jet : la migration trie `activeDays`, le cloud la
  // porte en désordre. Même ensemble, fusionnée en union, aucun consommateur ne lit l'ordre.
  ["réordonnancement d'une liste de scalaires", (d) => { d.gameStates[0].activeDays = [...d.gameStates[0].activeDays].sort(); return d; }, true,
    (a, b) => [JSON.stringify(a) !== JSON.stringify(b),
               "la fixture ne réordonne plus rien (`activeDays` déjà triée, vide, ou à un seul élément) : le témoin passe sans mesurer l'exemption d'ordre"]],
  // une copie locale possiblement périmée (load() retombé sur le local seul) ne doit JAMAIS
  // gagner par sa simple ouverture — même garde que le ménage des orphelines (v2.15.8).
  ["chargement non synchronisé", (d) => { d.config.theme = "RÉPARÉ"; return d; }, false,
    (a, b) => [doitRestamper(a, b, true) === true,
               "sans le garde `synced`, cette mutation ne ferait DÉJÀ pas restamper : le témoin est vert sans jamais toucher au garde"]],
];
for (const [nom, muter, synced, premisse] of temoins) {
  const avant = pointFixe(cloud());
  const apres = muter(clone(avant));
  const [ok, pourquoi] = premisse(avant, apres);
  if (!ok) { fail(`témoin « ${nom} » — prémisse perdue : ${pourquoi}`); continue; }
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
console.log("✓ Restampe après migration vérifiée (6 ancres + 2 ancres d'ordre, 3 témoins, prémisses de fixture mesurées).");
