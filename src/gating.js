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

// v2.16.66 — cœur du compteur de budget-temps, sorti du composant pour être vérifiable hors React
// (le timer lui-même reste dans App()). Le compteur mesurait la PRÉSENCE et non l'USAGE : arrière-plan
// et veille de l'appareil étaient crédités au budget du jour (465 minutes mesurées en prod le 8 août
// pour une journée sans une seule quête complétée).
export const SESSION_TICK_MS = 60000;                       // cadence du flush
export const SESSION_MAX_CREDIT_MS = 2 * SESSION_TICK_MS;   // un flush ne crédite jamais plus que ~2 ticks
// Décide ce qu'un flush accorde. `rawMs` = temps écoulé depuis le dernier versement, `counting` = faux
// dès que l'onglet est en arrière-plan. Retourne les minutes à créditer et s'il faut repartir de
// maintenant (`resetClock`) plutôt que d'avancer d'un compte rond en gardant le reste sous la minute.
// Un écart > SESSION_MAX_CREDIT_MS ne peut pas être du jeu : le tick de 60 s n'a pas pu se produire,
// donc la machine dormait. On crédite la part plausible et on repart de maintenant — sans quoi l'écart
// sauté serait recrédité tick après tick jusqu'à rattrapage.
export const sessionFlushPlan = (rawMs, counting) => {
  if (!counting) return { minutes: 0, resetClock: true };
  const gap = rawMs > SESSION_MAX_CREDIT_MS;
  const minutes = Math.floor(Math.min(Math.max(0, rawMs), SESSION_MAX_CREDIT_MS) / 60000);
  return { minutes, resetClock: gap };
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

// v2.16.60 — le verrou exigeait des quêtes rotatives que l'enfant n'avait PAS dans sa journée.
// Deux situations, mesurées sur la donnée de prod, où le compteur restait bloqué à 0/2 pour
// toujours : (a) en mode « rituel », les quêtes rotatives ne sont jamais affichées (elles portent
// toutes un `days` non vide, donc elles vivent dans `weekMine`, que le mode rituel écarte) — deux
// des quatre enfants sont dans ce mode ; (b) une semaine sur deux, hors semaine de garde,
// `config.weeklyQuests` est mis à null et le tableau de bord ne reçoit AUCUNE rotative — pour les
// quatre enfants cette fois. Dans les deux cas, la consigne « fais encore 2 tâches rotatives »
// désignait des quêtes qui n'existaient nulle part.
//
// Correctif : on n'exige jamais plus de rotatives qu'il y en a RÉELLEMENT dans la journée que
// l'enfant a sous les yeux. `visible` = la liste affichée (`myAssignments` du tableau de bord,
// donc déjà filtrée par mode, par jour et dédoublonnée) — 0 rotative visible = pas de verrou.
// La décision de Gen (Backlog #15 : débloquer après X rotatives) est intacte : dès qu'une semaine
// de garde donne 3 à 10 rotatives par jour et par enfant, le seuil de 2 s'applique comme avant.
export const rotatingAvailableToday = (visible) => (visible || []).filter(a => a.isRecurring).length;

// Seuil réellement exigé aujourd'hui = min(réglage du parent, rotatives réellement proposées).
export const rotatingNeed = (config, visible) => {
  const want = config?.shopUnlockCount ?? SHOP_UNLOCK_DEFAULT;
  if (want <= 0) return 0; // 0 = parent a désactivé la condition
  return Math.min(want, rotatingAvailableToday(visible));
};

export const isShopLocked = (config, pState, assignments, playerId, visible) => {
  const need = rotatingNeed(config, visible);
  if (need <= 0) return false;
  return rotatingDoneToday(assignments, pState?.completed, playerId) < need;
};

// Combien de tâches rotatives il reste à faire avant le déblocage (0 = déjà débloqué).
// Ce calcul était réécrit à la main sur 4 sites d'appel dans `App.jsx`, dont un qui le refaisait
// trois fois de suite dans la même phrase pour accorder les pluriels — d'où ce helper.
export const rotatingRemaining = (config, pState, assignments, playerId, visible) => {
  const need = rotatingNeed(config, visible);
  return Math.max(0, need - rotatingDoneToday(assignments, pState?.completed, playerId));
};
