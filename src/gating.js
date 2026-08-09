// ─── VERROUS D'ACCÈS (règles pures) ──────────────────────────────
// Extrait de `App.jsx` (Lot 5 #24, découpage progressif, 2026-08-08). Les trois verrous que le
// parent peut poser sur la journée d'un enfant vivaient côte à côte dans `App.jsx` sans former un
// module : ce sont pourtant les mêmes règles, de la même famille (« l'enfant peut-il ouvrir ça
// maintenant? »), toutes pures — elles lisent `config`/`player`/`pState` et répondent oui/non,
// sans état React, sans JSX, sans toucher à l'avatar.
//
// Ce qui est verrouillé, et ce qui ne l'est JAMAIS : les quêtes restent toujours accessibles
// (on veut que les corvées se fassent). Ces verrous ne portent que sur les à-côtés — boutique,
// personnalisation du perso, session prolongée.
//
// Les seuils de coût d'énergie (`CHEST_ENERGY`, `SHOP_ENERGY`…) restent dans `App.jsx` : ce sont
// des réglages de gameplay, pas des règles d'accès (même distinction que pour `energy.js`).

import { todayStamp, SHOP_UNLOCK_DEFAULT } from "./shared.js";

// v2.16.7 — Chantier 6.6 (demande de Gen) : verrou du matin parent-contrôlé, plage horaire fixe.
// Heure LOCALE obligatoire (jamais toISOString — leçon v2.5.24, un bug UTC avait déjà cassé un
// mécanisme similaire basé sur l'heure). Gère le cas où la fenêtre chevauche minuit (start>end).
export const isMorningLocked = (player, now = new Date()) => {
  const lock = player?.morningLock;
  if (!lock?.enabled) return false;
  const [sh, sm] = (lock.start || "06:00").split(":").map(Number);
  const [eh, em] = (lock.end || "09:00").split(":").map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = sh * 60 + (sm || 0), end = eh * 60 + (em || 0);
  return start <= end ? (cur >= start && cur < end) : (cur >= start || cur < end);
};

// Backlog #13 — budget-temps quotidien par enfant (contrôle parental). `dailyMinutesLimit` (config
// joueur) : null/0 = pas de limite. `pState.sessionMinutes` accumule les minutes du jour courant
// (voir timer dans App()) — verrouillé seulement une fois le jour ET le plafond atteints.
export const isTimeLocked = (player, pState) => {
  const limit = player?.dailyMinutesLimit;
  if (!limit) return false;
  const sm = pState?.sessionMinutes;
  if (!sm || sm.day !== todayStamp()) return false;
  return (sm.minutes || 0) >= limit;
};

// v2.16.26 — Backlog #15 : accès boutique/avatar débloqué après X tâches ROTATIVES (isRecurring:true,
// système récurrent du Lot 7 — recurring.js) complétées aujourd'hui, pas juste n'importe quelle tâche.
// Compte les assignations distinctes (pas les XP) : 1 tâche rotative faite = 1, peu importe sa difficulté.
export const rotatingDoneToday = (assignments, completed, playerId) => {
  const stamp = todayStamp();
  const doneSet = new Set(completed || []);
  return (assignments || []).filter(a =>
    a.isRecurring && (a.playerIds || []).includes(playerId) && doneSet.has(a.instanceId + "_" + playerId + "#" + stamp)
  ).length;
};

export const isShopLocked = (config, pState, assignments, playerId) => {
  const need = config?.shopUnlockCount ?? SHOP_UNLOCK_DEFAULT;
  if (need <= 0) return false; // 0 = parent a désactivé la condition
  return rotatingDoneToday(assignments, pState?.completed, playerId) < need;
};

// Combien de tâches rotatives il reste à faire avant le déblocage (0 = déjà débloqué).
// Ce calcul était réécrit à la main sur 4 sites d'appel dans `App.jsx`, dont un qui le refaisait
// trois fois de suite dans la même phrase pour accorder les pluriels — d'où ce helper.
export const rotatingRemaining = (config, pState, assignments, playerId) => {
  const need = config?.shopUnlockCount ?? SHOP_UNLOCK_DEFAULT;
  return Math.max(0, need - rotatingDoneToday(assignments, pState?.completed, playerId));
};
