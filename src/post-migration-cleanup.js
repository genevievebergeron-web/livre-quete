// ═══════════════════════════════════════════════════════════════════════════
// Les deux ménages qui tournent APRÈS `migrateSavedData`, au chargement
// ═══════════════════════════════════════════════════════════════════════════
// Extrait d'`App.jsx` (~2200-2233) le 2026-08-26 (v2.17.18). Le code n'a pas changé de
// comportement : il a changé d'ADRESSE, pour devenir mesurable.
//
// Pourquoi le déplacer. `check-migration-sans-mutation.mjs` tient deux promesses sur
// `migrateSavedData` — chaque ménage doit AGIR sur sa fixture (couverture), et l'argument doit
// ressortir bit-pour-bit intact (intégrité, parce qu'une écriture dans un sous-arbre PARTAGÉ
// efface l'état « avant » que `doitRestamper` compare, et le cloud jette alors la réparation :
// mesuré 0/5 contre 5/5 le 2026-08-26). Ces deux ménages-ci tournaient juste après, sur le même
// `data`, et échappaient aux deux promesses pour une raison purement technique : `App.jsx` n'est
// pas importable depuis un script Node (JSX + React). La limite était écrite en tête du contrôle
// pour ne pas se périmer en silence ; ce fichier la retire.
//
// Trois règles tenues ici, et chacune est vérifiée par le contrôle :
//   1. AUCUNE mutation de l'argument — on reconstruit, on n'écrit jamais dedans.
//   2. AUCUNE horloge et AUCUN état de module : `today` et `synced` sont des PARAMÈTRES.
//      Une fonction qui lit `todayStamp()` elle-même ne peut pas être mesurée sur un jour choisi,
//      et une qui lit `wasLastLoadSynced()` traîne `sync.js` (donc `localStorage`) dans Node.
//   3. L'ORDRE compte : le ménage des orphelines lit `assignments` APRÈS le filtrage des
//      tâches « un jour », comme dans l'original. Les inverser changerait le résultat.
import { _uniq } from "./shared.js";

// 🧹 Tâches « à usage unique » d'un jour PASSÉ (anti-accumulation).
const menageUnJour = (config, today) => {
  const expired = (config.assignments || []).filter((a) => a.oneDay && a.oneDay !== today).map((a) => a.instanceId);
  if (!expired.length) return config;
  const rm = new Set(expired);
  return { ...config,
    assignments: (config.assignments || []).filter((a) => !rm.has(a.instanceId)),
    removedAssignments: _uniq([...(config.removedAssignments || []), ...expired]).slice(-800) };
};

// 🧹 v1.55.0 — tâches perso ORPHELINES (plus aucune assignation) → tombstone durable.
// v2.15.8 (CAUSE RACINE de la casse généralisée des tâches perso de toute la famille, trouvée le
// 2026-07-28 en reconstruisant les rituels Matin/École/Camp/Soir) : ce ménage tournait à CHAQUE
// chargement, sur CHAQUE appareil, sans aucune protection, avec deux failles combinées :
// (1) ne regardait QUE `config.assignments`, jamais `config.weeklyQuests.assignments` (Lot 7) ;
// (2) tournait même quand `load()` retombait sur la copie LOCALE seule après un échec réseau
// (`LAST_LOAD_SYNCED=false` — serveur Canner qui se réveille, ~1-4s, ou simple délai wifi,
// documenté dans SYNC.md) — une copie locale peut alors être périmée (n'a pas encore vu les
// assignations créées ailleurs depuis sa dernière vraie synchro), faisant passer des tâches BIEN
// VIVANTES pour orphelines, tombstonées pour toujours et repoussées au cloud aussitôt.
// Fix : n'agir QUE sur une synchro cloud confirmée (`synced`), et inclure `weeklyQuests`.
const menageOrphelines = (config) => {
  const usedTaskIds = new Set([
    ...(config.assignments || []).map((a) => a.taskId),
    ...(((config.weeklyQuests || {}).assignments) || []).map((a) => a.taskId)]);
  const orphans = (config.customTasks || []).filter((t) => t && t.id && !usedTaskIds.has(t.id)).map((t) => t.id);
  if (!orphans.length) return config;
  const orphSet = new Set(orphans);
  return { ...config,
    customTasks: (config.customTasks || []).filter((t) => !orphSet.has(t.id)),
    removedCustomTasks: _uniq([...(config.removedCustomTasks || []), ...orphans]).slice(-1000) };
};

// Rend un NOUVEAU `data` quand quelque chose a bougé, et l'argument tel quel sinon.
// `synced` = la dernière lecture venait-elle vraiment du cloud (`wasLastLoadSynced()`) ?
export const nettoyerApresMigration = (data, { today, synced }) => {
  if (!data?.config || !data?.gameStates) return data;
  let config = menageUnJour(data.config, today);
  if (synced) config = menageOrphelines(config);
  return config === data.config ? data : { ...data, config };
};
