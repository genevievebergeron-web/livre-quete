// ─── PERSISTANCE & SYNC MULTI-APPAREILS ──────────────────────────────────────
// Extrait d'`App.jsx` le 2026-08-06 (Lot 5/#24, 22e incrément). Contenu déplacé tel quel :
// stockage local (`STORE_KEY`), détection du mode de sync, `remotePush`/`remotePull`,
// et les deux points d'entrée `save`/`load`.
//
// ⚠️ État de module MUTABLE : `LAST_SAVED_AT` et `LAST_LOAD_SYNCED` étaient des `let` lus ET
// écrits depuis la boucle de sync d'`App()`. Un binding importé est en lecture seule en ESM —
// ils sont donc exposés par accesseurs (`getLastSavedAt`/`setLastSavedAt`/`wasLastLoadSynced`),
// seule adaptation de cette extraction. Aucune autre ligne n'a changé.
import { mergeFamily } from "./merge.js";

export const STORE_KEY = "livre-de-quetes-v1";

// ─── SYNC CLOUD (multi-appareils) ────────────────────────────
// Deux modes, détectés automatiquement (voir SYNC.md) :
//   1. API même-origine /api/famille — active quand l'app roule sur le serveur
//      Node (server.cjs) avec le Postgres Canner. RIEN à configurer ici.
//   2. Supabase — remplir SYNC_URL et SYNC_KEY ci-dessous (solution de rechange).
// Si aucun des deux n'est disponible : sauvegarde locale seulement, comme avant.
const SYNC_URL = "";  // (optionnel) ex: "https://abcdefgh.supabase.co"
const SYNC_KEY = "";  // (optionnel) clé "anon public" Supabase
const FAMILY_ID = "livre-quetes-bergeron-2026"; // identifiant unique de la famille (agit comme mot de passe — garder original)

const supaEnabled = () => Boolean(SYNC_URL && SYNC_KEY);
const supaHeaders = () => ({ apikey: SYNC_KEY, Authorization: `Bearer ${SYNC_KEY}`, "Content-Type": "application/json" });
let LAST_SAVED_AT = null; // horodatage de la dernière sauvegarde connue localement
// v2.15.8 (cause racine de la casse généralisée des tâches perso — voir le ménage des orphelines
// dans `migrateSavedData`, resté dans `App.jsx`) :
// true seulement quand load() a reçu une vraie réponse cloud (fusionnée ou seule source). false quand
// remotePull() a échoué (serveur endormi, réseau) et qu'on est retombé sur la copie locale SEULE —
// potentiellement périmée si cet appareil n'a pas rouvert l'app depuis un moment.
let LAST_LOAD_SYNCED = false;
let _pushTimer = null;
let API_OK = null; // détection unique de l'API même-origine
// Signale à l'UI qu'une synchro cloud vient de réussir (pour l'indicateur ☁️)
const markSynced = () => { try { window.dispatchEvent(new CustomEvent("lq-synced")); } catch {} };

// L'API même-origine est-elle là? (un déploiement statique renverrait du HTML → non)
const apiAvailable = async () => {
  if (API_OK !== null) return API_OK;
  try {
    const r = await fetch("/api/sante", { cache: "no-store" });
    const ct = r.headers.get("content-type") || "";
    API_OK = r.ok && ct.includes("json") && (await r.json())?.ok === true;
  } catch { API_OK = false; }
  return API_OK;
};

// Pousse l'état complet vers le cloud (debounce 1.5s pour regrouper les actions rapides)
export const remotePush = (data) => {
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(async () => {
    try {
      if (await apiAvailable()) {
        // ⚠️ FUSION AVANT ÉCRITURE : on relit le cloud et on fusionne, sinon un push « brut »
        // écrase les changements faits sur un autre appareil (ex: une validation qui « revient »).
        let toWrite = data;
        try {
          const r0 = await fetch(`/api/famille?id=${encodeURIComponent(FAMILY_ID)}`, { cache: "no-store" });
          if (r0.ok) { const cloud = (await r0.json())?.data; if (cloud && cloud.config) toWrite = mergeFamily(cloud, data); }
        } catch {}
        await fetch("/api/famille", { method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: FAMILY_ID, data: toWrite }) });
        // v2.5.11 — FUSION AVANT L'ÉCRITURE LOCALE FINALE, même principe que la fusion avant écriture
        // cloud ci-dessus : ce callback est déclenché par un setTimeout debounced (1500ms) qui peut
        // rester "en vol" pendant plusieurs centaines de ms (2 fetch réseau successifs). Si une AUTRE
        // action (ex: ajouter une tâche) a sauvegardé une version plus fraîche dans localStorage PENDANT
        // ce vol, `clearTimeout` ne peut plus annuler ce callback déjà démarré — sans cette fusion, le
        // `toWrite` (bâti sur une fermeture plus vieille) écrasait purement et simplement cette version
        // plus fraîche, faisant "disparaître" ce qui venait d'être ajouté. Bug signalé par Antoine
        // (« ajout de quête, ça dit que c'est ajouté, mais ça apparaît pas »), le 2026-07-25.
        try {
          let finalWrite = toWrite;
          try { const cur = localStorage.getItem(STORE_KEY); if (cur) { const curData = JSON.parse(cur); if (curData?.config) finalWrite = mergeFamily(toWrite, curData); } } catch {}
          localStorage.setItem(STORE_KEY, JSON.stringify(finalWrite));
          LAST_SAVED_AT = finalWrite.savedAt || LAST_SAVED_AT;
        } catch {}
        markSynced();
      } else if (supaEnabled()) {
        let toWrite = data;
        try {
          const r0 = await fetch(`${SYNC_URL}/rest/v1/familles?id=eq.${encodeURIComponent(FAMILY_ID)}&select=data`, { headers: supaHeaders() });
          if (r0.ok) { const cloud = (await r0.json())?.[0]?.data; if (cloud && cloud.config) toWrite = mergeFamily(cloud, data); }
        } catch {}
        await fetch(`${SYNC_URL}/rest/v1/familles?on_conflict=id`, {
          method: "POST",
          headers: { ...supaHeaders(), Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({ id: FAMILY_ID, data: toWrite, saved_at: toWrite.savedAt || new Date().toISOString() }),
        });
        // v2.5.11 — même fusion défensive que la branche apiAvailable() ci-dessus (voir son commentaire).
        try {
          let finalWrite = toWrite;
          try { const cur = localStorage.getItem(STORE_KEY); if (cur) { const curData = JSON.parse(cur); if (curData?.config) finalWrite = mergeFamily(toWrite, curData); } } catch {}
          localStorage.setItem(STORE_KEY, JSON.stringify(finalWrite));
          LAST_SAVED_AT = finalWrite.savedAt || LAST_SAVED_AT;
        } catch {}
        markSynced();
      }
    } catch (e) { console.warn("Sync: push échoué (mode local conservé)", e); }
  }, 1500);
};

// Récupère l'état depuis le cloud.
//   → objet data  : le cloud a des données
//   → null        : le cloud est JOINT mais VIDE (aucune famille encore)  → on peut semer sans risque
//   → PULL_FAILED : échec réseau / pas de sync  → NE PAS écraser le cloud (on garde le local et on réessaiera)
export const PULL_FAILED = Symbol("pull_failed");
export const remotePull = async () => {
  try {
    if (await apiAvailable()) {
      const r = await fetch(`/api/famille?id=${encodeURIComponent(FAMILY_ID)}`, { cache: "no-store" });
      if (!r.ok) return PULL_FAILED;
      const d = (await r.json())?.data;
      markSynced();
      return d || null;
    }
    if (supaEnabled()) {
      const r = await fetch(`${SYNC_URL}/rest/v1/familles?id=eq.${encodeURIComponent(FAMILY_ID)}&select=data`, { headers: supaHeaders() });
      if (!r.ok) return PULL_FAILED;
      const rows = await r.json();
      markSynced();
      return rows?.[0]?.data || null;
    }
  } catch { return PULL_FAILED; }
  return PULL_FAILED; // aucune sync disponible
};

// Signature de contenu (ignore savedAt) pour détecter un vrai changement
export const _famSig = (d) => { try { return JSON.stringify({ c: d?.config, g: d?.gameStates }); } catch { return Math.random() + ""; } };

export const save = async (data) => {
  LAST_SAVED_AT = data.savedAt || LAST_SAVED_AT;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { console.warn("Storage save failed:", e); }
  remotePush(data);
};

export const load = async () => {
  let local = null;
  try { const r = localStorage.getItem(STORE_KEY); if (r) local = JSON.parse(r); } catch {}
  const remote = await remotePull();
  const hasRemoteData = remote && remote !== PULL_FAILED; // objet data réel
  // Les deux existent → on FUSIONNE (rien n'est écrasé, l'XP ne peut que monter)
  if (hasRemoteData && local) {
    LAST_LOAD_SYNCED = true; // v2.15.8 — vraie donnée cloud reçue, assignments/customTasks à jour
    const merged = mergeFamily(local, remote);
    if (_famSig(merged) !== _famSig(local)) {
      merged.savedAt = new Date().toISOString();
      try { localStorage.setItem(STORE_KEY, JSON.stringify(merged)); } catch {}
      LAST_SAVED_AT = merged.savedAt;
      remotePush(merged); // on renvoie la fusion au cloud pour converger
      return merged;
    }
    LAST_SAVED_AT = local.savedAt || merged.savedAt || null;
    return local;
  }
  // Seul le cloud a des données → on les prend
  if (hasRemoteData && !local) {
    LAST_LOAD_SYNCED = true; // v2.15.8 — idem, données cloud à jour (pas de copie locale à fusionner)
    try { localStorage.setItem(STORE_KEY, JSON.stringify(remote)); } catch {}
    LAST_SAVED_AT = remote.savedAt || null;
    return remote;
  }
  // Cloud JOINT mais VIDE (remote===null) → on peut semer le local sans risque d'écraser quoi que ce soit
  if (remote === null && local) remotePush(local);
  // remote===PULL_FAILED → échec réseau : on NE touche PAS au cloud, on garde le local et la boucle réessaiera.
  // v2.15.8 (cause racine de la casse généralisée des tâches perso, 2026-07-28) : LAST_LOAD_SYNCED reste
  // false ici — cette copie locale peut être périmée (assignments incomplets si l'appareil n'a pas
  // rouvert l'app depuis un moment). Le ménage des tâches orphelines (dans `App.jsx`) DOIT vérifier ce drapeau
  // avant de tombstoner quoi que ce soit, sinon un simple délai réseau (serveur Canner qui se réveille,
  // ~1-4s selon SYNC.md) suffit à faire supprimer pour toujours des tâches perso bien vivantes ailleurs.
  LAST_LOAD_SYNCED = false;
  LAST_SAVED_AT = local?.savedAt || null;
  return local;
};


// Accesseurs de l'état de module mutable (voir en-tête) — utilisés par la boucle de sync d'`App()`.
export const getLastSavedAt = () => LAST_SAVED_AT;
export const setLastSavedAt = (v) => { LAST_SAVED_AT = v; };
export const wasLastLoadSynced = () => LAST_LOAD_SYNCED;

// ─── v2.17.14 — RESTAMPE APRÈS MIGRATION ─────────────────────────────────────
// Le chargement (`App.jsx`) persiste TOUJOURS les données migrées : `save({...data, …})`.
// Ce `data` vient de `load()`, donc son `savedAt` est celui du SERVEUR. Or `remotePush`
// refusionne avant d'écrire (`mergeFamily(cloud, data)`) et `preferIncoming` vaut
// `isNewer(incoming.savedAt, base.savedAt)` — à horodatage ÉGAL, c'est `false` : la base
// gagne. Tout ce que la migration vient de réparer dans un champ « dernière-écriture-gagne »
// (`pin`, `mode`, `coins`, `house`, `theme`, `players[].name`…) est donc réécrit par le cloud
// avant même d'y arriver. Mesuré le 2026-08-25 sur la donnée de prod : 5 cibles sur 5 perdues
// sans restampe, 5 sur 5 qui survivent avec. Rien ne criait : la migration se réapplique à
// chaque chargement, l'écran de l'appareil qui vient de charger a l'air juste, et la valeur
// d'avant revient à la fusion suivante. `savedAt` figé à la milliseconde depuis quatre nuits
// (2026-08-25T05:13:57.632Z) alors que la donnée grossissait est le symptôme qui l'a nommé.
//
// Deux conditions, et les deux comptent :
//   • le contenu a VRAIMENT changé (`_famSig` ignore `savedAt`) — sinon chaque ouverture
//     d'app ferait gagner cet appareil sur tous les champs « dernière-écriture-gagne », ce
//     qui est le cas NORMAL, 7 jours sur 7 ;
//   • le chargement était SYNCHRONISÉ — même garde que le ménage des orphelines (v2.15.8) :
//     sur un `load()` retombé sur la copie locale seule (serveur Canner qui se réveille), cette
//     copie peut être périmée, et la restamper la ferait écraser ce qui est plus frais ailleurs.
//     Sans synchro, on ne restampe pas : la migration repassera au prochain chargement synchronisé.
//
// La QUESTION a dû être corrigée avant qu'une ligne ne parte en prod. Premier jet : « le contenu
// a-t-il changé ? » (`_famSig`, qui compare `JSON.stringify`). Mesuré sur la prod : il répond OUI
// tous les jours, et pour RIEN — le seul écart entre le cloud et la sortie de `migrateSavedData`,
// sur les quatre joueurs, est que `activeDays` en ressort TRIÉE (`activeDaysFromCompleted`) alors
// que le cloud la porte en désordre. Même ensemble (mesuré), et aucun consommateur ne lit l'ordre :
// `streakOf`, `activeDaysThisWeek` et `computeLeagueTier` construisent tous un `Set`, la fusion en
// fait une union `_uniq`. Écarts HORS `activeDays` : ZÉRO. Ce premier jet aurait donc restampé à
// chaque ouverture, faisant gagner l'appareil qui vient de charger sur tous les champs
// « dernière-écriture-gagne » — précisément le danger que la condition existait pour écarter.
//
// La question juste n'est pas « est-ce que ça a changé ? » mais « est-ce que la fusion à venir va
// JETER quelque chose ? ». On la pose telle quelle : on rejoue `mergeFamily` et on regarde si elle
// rend `apres` intact. À l'ordre des listes de scalaires près — celles-là sont fusionnées en union,
// leur ordre n'est un comportement pour personne, et c'est exactement le bruit d'`activeDays`.
const _triScalaires = (o) => {
  if (o === null || typeof o !== "object") return o;
  if (Array.isArray(o)) {
    const n = o.map(_triScalaires);
    return n.every((v) => v === null || typeof v !== "object")
      ? [...n].sort((x, y) => (String(x) < String(y) ? -1 : 1))
      : n;
  }
  const out = {};
  for (const k of Object.keys(o).sort()) out[k] = _triScalaires(o[k]);
  return out;
};
const _sigOrdreLibre = (d) => {
  try { return JSON.stringify(_triScalaires({ c: d?.config, g: d?.gameStates })); }
  catch { return Math.random() + ""; }
};
export const doitRestamper = (avant, apres, synced) => {
  if (!synced || !avant?.config) return false;
  try { return _sigOrdreLibre(mergeFamily(avant, apres)) !== _sigOrdreLibre(apres); }
  catch { return false; }
};
