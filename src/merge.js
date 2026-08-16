// ─── FUSION NON-DESTRUCTIVE (multi-appareils) ────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif, 2026-08-06) : toute la couche de
// fusion d'état — `mergeGS` (un joueur), `mergeFamily` (instantané famille complet) et leurs
// aides (`_mergeCalendar`, `_mergePlayer`, `mergeBossBattle`, `isNewer`). Fonctions PURES,
// zéro React, zéro DOM. C'est le code le plus critique de l'app côté données (c'est lui qui
// garantit qu'une progression ne peut jamais régresser ni disparaître lors d'une synchro entre
// deux appareils) — déplacé ici à l'identique, sans la moindre retouche de logique.
import { PLAYER_THEMES } from "./themes.js";
import { mergePetXp } from "./pets.js";
import { leagueRank } from "./leagues.js";
import { isValidCustodyWeekKey } from "./recurring.js";
import { weekKey, _uniq, mergeXpLog } from "./shared.js";
import { currentEnergy } from "./energy.js";

export const isNewer = (a, b) => { // a plus récent que b ? (timestamps ISO, tolérant aux absents)
  if (!a) return false;
  if (!b) return true;
  try { return new Date(a) > new Date(b); } catch { return false; }
};
export const mergeBossBattle = (a, b) => {
  a = a || {}; b = b || {};
  if (!a.bossId) return b.bossId ? b : { bossId:null, earned:0, spent:0, dmg:0 };
  if (!b.bossId) return a;
  if (a.bossId === b.bossId) return { bossId:a.bossId, earned:Math.max(a.earned||0,b.earned||0), spent:Math.max(a.spent||0,b.spent||0), dmg:Math.max(a.dmg||0,b.dmg||0) };
  return (new Date(b.bossId) > new Date(a.bossId)) ? b : a; // boss le plus récent
};
// ─── FUSION NON-DESTRUCTIVE (multi-appareils) ────────────────
// Quand deux appareils ont chacun leur progression non synchronisée, on FUSIONNE
// au lieu d'écraser : l'XP ne peut que monter, rien n'est perdu. C'est ce qui
// permet de réunir « l'ordi (2 modes) » et « le cell (1 mode) » sans tout casser.
// v2.7.0 — dernière-écriture-gagne (par updatedAt) + tombstone (removedIds) au lieu d'un simple
// « premier id vu gagne ». Avant : si un appareil modifiait/supprimait un événement pendant qu'un
// autre pas encore synchronisé renvoyait l'ancienne version, le merge pouvait faire réapparaître
// l'ancienne version modifiée, ou ressusciter un événement supprimé.
export const _mergeCalendar = (a, b, removedIds) => {
  const rm = removedIds ? new Set(removedIds) : null;
  const byId = new Map(); const noId = []; const seenRaw = new Set();
  for (const e of [...(a || []), ...(b || [])]) {
    if (!e) continue;
    if (e.id == null) { const k = JSON.stringify(e); if (!seenRaw.has(k)) { seenRaw.add(k); noId.push(e); } continue; }
    if (rm && rm.has(e.id)) continue; // suppression (tombstone) gagne sur une version pas encore synchronisée
    const prev = byId.get(e.id);
    if (!prev || (e.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(e.id, e);
  }
  return [...byId.values(), ...noId];
};
// Fusion d'un état de joueur — non régressive (max XP/pièces, union des listes)
export const mergeGS = (a, b, preferIncoming) => {
  a = a || {}; b = b || {};
  const completed = _uniq([...(a.completed || []), ...(b.completed || [])]);
  const refusedKeys = _uniq([...(a.refusedKeys || []), ...(b.refusedKeys || [])]).slice(-400); // v1.64.0 — tombstone des demandes refusées
  const _refusedSet = new Set(refusedKeys);
  const removedCalendarIds = _uniq([...(a.removedCalendarIds || []), ...(b.removedCalendarIds || [])]).slice(-400); // v2.7.0 — tombstone des événements calendrier supprimés
  const avatarConfigured = b.avatar?.configured ? b.avatar : (a.avatar?.configured ? a.avatar : { ...(a.avatar || {}), ...(b.avatar || {}) });
  const _completedAt = { ...(b.completedAt || {}), ...(a.completedAt || {}) }; // v2.16.65 — hissé : `mergeXpLog` s'en sert comme borne de plausibilité
  return {
    ...a, ...b,
    xp: Math.max(a.xp || 0, b.xp || 0),
    // ⚠️ Les pièces se DÉPENSENT : un max() ramènerait l'argent dépensé (achats infinis).
    // → dernière écriture gagne (l'appareil qui a changé le solde le plus récemment gagne).
    coins: preferIncoming ? (b.coins ?? a.coins ?? 0) : (a.coins ?? b.coins ?? 0),
    coinsLifetime: Math.max(a.coinsLifetime || 0, b.coinsLifetime || 0), // v2.5.0 — jamais décrémenté, donc fusion sûre par max (comme xp)
    // coinsWeek doit être géré EXPLICITEMENT — sinon le spread ...b l'écrase toujours par l'incoming.
    // Bug v2.5.3 : un vieux device synquant avec un coinsWeek d'une semaine passée déclenchait un
    // reset spurieux à la prochaine migration. Fix : on garde la semaine la plus récente (lexicographique).
    coinsWeek: (()=>{ const aw=(a.coinsWeek?.week||""); const bw=(b.coinsWeek?.week||""); return aw>=bw ? (a.coinsWeek||{week:aw}) : (b.coinsWeek||{week:bw}); })(),
    completed,
    completedAt: _completedAt, // v1.60.0 — horodatage de complétion (union)
    // v2.16.65 — l'ancienne CONCATÉNATION doublait le journal à chaque synchro (2 → 4 → 8 → … → 500).
    // Mesuré en prod le 14 août : 3 enfants sur 4 avec un journal saturé de 500 entrées toutes datées
    // du même jour, dont un enfant qui n'avait pas joué depuis 9 jours. `mergeXpLog` unionne par `id`
    // et prend la multiplicité MAXIMALE (jamais la somme) pour les entrées héritées, et répare au
    // passage les journaux déjà gonflés — des deux côtés, donc la réparation survit à la synchro.
    xpLog: mergeXpLog(a.xpLog, b.xpLog, _completedAt),
    pending: _uniq([...(a.pending || []), ...(b.pending || [])]).filter((k) => !completed.includes(k) && !_refusedSet.has(k)), // v1.64.0 — exclut les refusées (sinon l'union les ré-ajoutait au portail parent)
    refusedKeys,
    refusals: preferIncoming ? (b.refusals || a.refusals || []) : (a.refusals || b.refusals || []), // v1.64.0 — file consommable du message drôle de refus
    owned: _uniq([...(a.owned || []), ...(b.owned || [])]),
    boughtRewards: preferIncoming ? (b.boughtRewards || a.boughtRewards || []) : (a.boughtRewards || b.boughtRewards || []), // v1.63.0 — dernière-écriture-gagne (voyage avec coins)
    // v2.16.62 — l'estampille d'achat VOYAGE AVEC `boughtRewards` (exactement la même règle) : une
    // résurrection par instantané périmé ramène donc l'ANCIENNE estampille, déjà tombstonée, au lieu
    // de rouvrir un remboursement. Union interdite ici — il faut la valeur du même côté que l'achat.
    rewardBuyTs: preferIncoming ? (b.rewardBuyTs || a.rewardBuyTs || {}) : (a.rewardBuyTs || b.rewardBuyTs || {}),
    refundedRewards: _uniq([...(a.refundedRewards || []), ...(b.refundedRewards || [])]).slice(-200), // v1.69.0 — tombstone « déjà remboursé » (union increvable → fin des pièces infinies) ; keyé sur l'achat depuis v2.16.62
    badges: _uniq([...(a.badges || []), ...(b.badges || [])]),
    equipped: { ...(a.equipped || {}), ...(b.equipped || {}) },
    calendar: _mergeCalendar(a.calendar, b.calendar, removedCalendarIds),
    removedCalendarIds,
    avatar: avatarConfigured,
    // PIN : dernière écriture gagne (permet de changer le code d'un enfant depuis un autre appareil)
    pin: preferIncoming ? (b.pin ?? a.pin ?? null) : (a.pin ?? b.pin ?? null),
    mode: b.mode ?? a.mode ?? null,
    // v2.15.8 — tombstone des rituels supprimés (union, comme removedProposals) : sans ça, une
    // routine retirée localement (« Supprimer le rituel ») revenait dès qu'un autre appareil (ou le
    // serveur, qui garde l'ancien état) réapparaissait dans la fusion union-by-id ci-dessous.
    removedRoutineIds: _uniq([...(a.removedRoutineIds||[]), ...(b.removedRoutineIds||[])]).slice(-200),
    // v2.16.70 — l'union par id gardait la PREMIÈRE copie rencontrée, sans jamais regarder laquelle
    // des deux est la plus fraîche : toute MODIFICATION d'un rituel existant (renommer, changer
    // l'émoji, ajouter/retirer une quête — `onPatchState({routines:...})`, App.jsx ~1019) était donc
    // jetée en silence dès qu'une copie du même id était déjà en place. Côté SERVEUR c'est
    // systématique et non pas occasionnel : `mergeFamily(existing, data)` met toujours l'état déjà
    // stocké en `a`, donc le nuage n'a JAMAIS pu accepter une seule modification de rituel — le
    // contenu d'un rituel y est figé à sa toute première écriture. Conséquences mesurées sur la prod
    // du 2026-08-15 : les 3 rituels d'Antoine Emery gardent 5 références d'assignations supprimées
    // (`e3i368n`, `kmq0izq`, `ey05hal`, tous dans `removedAssignments`), alors que le ménage de
    // rituels tourne à CHAQUE chargement depuis la v2.11.1 — il nettoie bien en local, puis la
    // fusion serveur lui repasse l'ancienne copie par-dessus, en boucle depuis 3 semaines.
    // Fix : la PRÉSENCE reste une union (avec le tombstone `removedRoutineIds` ci-dessus), mais le
    // CONTENU d'un id présent des deux côtés vient de l'écriture la plus récente — même règle
    // `preferIncoming` que `coins`/`pin`/`boughtRewards` plus haut dans cette même fonction.
    routines: (() => { const removed=new Set([...(a.removedRoutineIds||[]), ...(b.removedRoutineIds||[])]); const m = new Map(); const fresh = preferIncoming ? (b.routines || []) : (a.routines || []), stale = preferIncoming ? (a.routines || []) : (b.routines || []); for (const r of [...fresh, ...stale]) { if (r && r.id != null && !removed.has(r.id) && !m.has(r.id)) m.set(r.id, r); } return [...m.values()]; })(),
    activeRoutineId: b.activeRoutineId ?? a.activeRoutineId ?? null,
    hiddenRewards: _uniq([...(a.hiddenRewards||[]),...(b.hiddenRewards||[])]),
    hiddenWeek: b.hiddenWeek ?? a.hiddenWeek ?? null,
    dailyClaimed: (()=>{ const A=a.dailyClaimed||{}, B=b.dailyClaimed||{}; if(A.day&&A.day===B.day) return {day:A.day, ids:_uniq([...(A.ids||[]),...(B.ids||[])])}; return ((B.day||"")>=(A.day||""))?(B.day?B:A):(A.day?A:B); })(),
    ritualCelebrated: (()=>{ const A=a.ritualCelebrated||{}, B=b.ritualCelebrated||{}; if(A.day&&A.day===B.day) return {day:A.day, ids:_uniq([...(A.ids||[]),...(B.ids||[])])}; return ((B.day||"")>=(A.day||""))?(B.day?B:A):(A.day?A:B); })(), // v1.68.0 (B5) — garde « rituel déjà fêté aujourd'hui »
    // v2.12.2 — bug signalé par Gen (« notification félicitation qui revient sans cesse ») : la file
    // « consommable » utilisait dernière-écriture-gagne (l'union empêcherait l'enfant de la vider), mais
    // ça laissait un appareil FRÈRE/SŒUR non lié (savedAt global plus récent, mais qui n'a jamais vu le
    // vidage local) ressusciter en bloc l'ancienne file non vidée à chaque fusion — même patron que le
    // tombstone refundedRewards ci-dessus (union increvable, jamais de résurrection après consommation).
    consumedCelebrationIds: _uniq([...(a.consumedCelebrationIds||[]), ...(b.consumedCelebrationIds||[])]).slice(-300),
    pendingCelebrations: (()=>{ const consumed=new Set([...(a.consumedCelebrationIds||[]), ...(b.consumedCelebrationIds||[])]); const seen=new Set(); const out=[]; for(const c of [...(a.pendingCelebrations||[]), ...(b.pendingCelebrations||[])]){ if(!c||!c.id||consumed.has(c.id)||seen.has(c.id))continue; seen.add(c.id); out.push(c); } return out; })(),
    petXp: mergePetXp(a.petXp, b.petXp), // XP des familiers : max par familier (ne fait que monter)
    petDay: (()=>{ const A=a.petDay||{}, B=b.petDay||{}; if(A.day&&A.day===B.day) return {day:A.day, xp:Math.max(A.xp||0,B.xp||0)}; return ((B.day||"")>=(A.day||""))?(B.day?B:A):(A.day?A:B); })(), // v1.52.0 — plafond quotidien familier (merge-safe)
    petEvo: (()=>{ const out={...(a.petEvo||{})}; const B=b.petEvo||{}; for(const k in B){ out[k]={...(B[k]||{}), ...(out[k]||{})}; } return out; })(), // v1.57.0 — voies d'évolution choisies (collant : 1er choix gagne)
    petNickname: {...(a.petNickname||{}), ...(b.petNickname||{})}, // v2.4.2 — surnom par familier (union ; dernier nom donné gagne par petId)
    // Énergie : consommable → l'horodatage energyTs arbitre directement (pas le flag coarse preferIncoming).
    // Bug v2.5.3 : preferIncoming basé sur savedAt global pouvait annuler une consommation d'énergie
    // si l'appareil qui avait ouvert un coffre avait un savedAt plus vieux que l'autre.
    // v2.15.7 (bug signalé « le coffre se recharge trop vite parfois », 2026-07-28) : l'énergie
    // (pool partagé boutique/avatar/familier/coffre) se fusionnait par « dernier energyTs gagne »
    // — dans une fenêtre de synchro quasi simultanée entre deux appareils, celui qui n'avait pas
    // encore reçu la dépense de l'autre pouvait pousser un timestamp perçu comme plus récent avec
    // une énergie plus haute, remboursant silencieusement une dépense déjà faite (achat, coffre…).
    // Fix : sous ~5 min d'écart (fenêtre de course plausible), prendre le MINIMUM des deux valeurs
    // — ne se trompe jamais dans le sens généreux — et son energyTs assorti (cohérent avec la
    // régénération recalculée depuis ce timestamp par currentEnergy/minsToEnergy). Au-delà de 5 min,
    // comportement inchangé (le plus récent gagne — nécessaire pour que la régénération progresse).
    energy: (()=>{ const aT=a.energyTs?new Date(a.energyTs).getTime():0; const bT=b.energyTs?new Date(b.energyTs).getTime():0;
      if (Math.abs(aT-bT) <= 5*60*1000) return Math.min(a.energy??100, b.energy??100);
      return bT>=aT ? (b.energy??a.energy??100) : (a.energy??b.energy??100); })(),
    energyTs: (()=>{ const aT=a.energyTs?new Date(a.energyTs).getTime():0; const bT=b.energyTs?new Date(b.energyTs).getTime():0;
      if (Math.abs(aT-bT) <= 5*60*1000) return (a.energy??100) <= (b.energy??100) ? (a.energyTs??b.energyTs??null) : (b.energyTs??a.energyTs??null);
      return bT>=aT ? (b.energyTs??a.energyTs??null) : (a.energyTs??b.energyTs??null); })(),
    lastFedDay: [a.lastFedDay, b.lastFedDay].filter(Boolean).sort().pop() || null, // jour le plus récent
    activeDays: _uniq([...(a.activeDays||[]), ...(b.activeDays||[])]), // union (série merge-safe)
    // v2.16.34 — Backlog #13 (ligues) : ratchet par rang, même esprit que xp/coinsLifetime — le
    // palier ne doit jamais reculer parce qu'un appareil moins à jour a fusionné en dernier.
    leagueTier: leagueRank(b.leagueTier) >= leagueRank(a.leagueTier) ? (b.leagueTier || "bronze") : (a.leagueTier || "bronze"),
    // Backlog #13 — même jour → max (deux appareils qui comptent la même session ne doivent jamais
    // sous-compter) ; jour différent → le plus récent (nouveau jour = compteur reparti à 0).
    sessionMinutes: (()=>{ const A=a.sessionMinutes||{}, B=b.sessionMinutes||{}; if(A.day&&A.day===B.day) return {day:A.day, minutes:Math.max(A.minutes||0,B.minutes||0)}; return ((B.day||"")>=(A.day||""))?(B.day?B:A):(A.day?A:B); })(),
    bossBattle: mergeBossBattle(a.bossBattle, b.bossBattle), // jetons/dégâts monotones par boss → max

    settings: { ...(a.settings || {}), ...(b.settings || {}) },
    dismissedAnnouncements: _uniq([...(a.dismissedAnnouncements||[]), ...(b.dismissedAnnouncements||[])]), // v2.6.0 — union des annonces archivées
    // v2.16.71 — `challengeTiers` n'avait de règle dans AUCUNE des deux fusions, alors que c'est le
    // SEUL garde-fou d'idempotence d'un versement de pièces réel : les paliers gradués du défi hebdo
    // (3 jours → +10 🪙, 5 → +15, 7 → +25 + badge « Maître de soi », App.jsx ~2535) ne sont payés
    // qu'une fois parce que le palier atteint est inscrit ici. En spread naïf `{...a, ...b}`, une
    // copie portant le marqueur d'une semaine PASSÉE (le cas normal : le marqueur ne bouge que
    // quand un palier tombe) écrase celui de la semaine en cours dès que l'autre côté est en
    // retard — typiquement la boucle de sync (App.jsx ~2393, `mergeFamily(local, remote)` toutes
    // les 25 s) qui relit un nuage pas encore à jour dans la fenêtre de ~1,5 s du push debounced.
    // L'effet, dont la dépendance `config?.weeklyChallenge` change à chaque tick fusionné, repasse
    // alors avec `claimed=[]` et REPAIE le palier. Même famille que v2.16.62 (récompense remboursée
    // deux fois). Règle : même semaine → union des paliers (monotone, un palier payé ne se dépaie
    // jamais) ; semaine différente → la plus récente gagne — patron de `dailyClaimed`/`ritualCelebrated`.
    challengeTiers: (()=>{ const A=a.challengeTiers||{}, B=b.challengeTiers||{}; if(A.week&&A.week===B.week) return {week:A.week, tiers:_uniq([...(A.tiers||[]),...(B.tiers||[])])}; return ((B.week||"")>=(A.week||""))?(B.week?B:A):(A.week?A:B); })(),
  };
};
// Fusion d'un joueur (config) — garde UN seul thème par enfant.
// v1.66.0 (fix B2) : pseudo / themeId / themeChosenAt en DERNIÈRE-ÉCRITURE-GAGNE
// (preferIncoming = la copie entrante est plus récente). Avant, la base gagnait
// toujours → le pseudo changé par l'enfant « revenait » à sa prochaine sync.
export const _mergePlayer = (a, b, preferIncoming = false) => {
  const w = preferIncoming ? b : a, o = preferIncoming ? a : b; // w = écriture la plus récente
  return {
    ...a, ...b,
    name: a.name || b.name,
    color: a.color || b.color,
    pseudo: w.pseudo || o.pseudo,
    themeId: (w.themeId && w.themeId !== "none") ? w.themeId
           : (o.themeId && o.themeId !== "none") ? o.themeId
           : (w.themeId || o.themeId || "none"),
    themeChosenAt: w.themeChosenAt || o.themeChosenAt,
    starterThemes: _uniq([...(a.starterThemes || []), ...(b.starterThemes || [])]).slice(0, 4),
  };
};
// Fusion complète de deux instantanés famille { config, gameStates, savedAt }
export const mergeFamily = (base, incoming) => {
  if (!base) return incoming;
  if (!incoming) return base;
  const bC = base.config || {}, iC = incoming.config || {};
  const bP = bC.players || [], iP = iC.players || [];
  const bG = base.gameStates || [], iG = incoming.gameStates || [];
  const preferIncoming = isNewer(incoming.savedAt, base.savedAt);
  const byId = new Map();
  bP.forEach((p, i) => byId.set(p.id, { player: { ...p }, gs: bG[i] }));
  iP.forEach((p, i) => {
    if (byId.has(p.id)) { const e = byId.get(p.id); e.player = _mergePlayer(e.player, p, preferIncoming); e.gs = mergeGS(e.gs, iG[i], preferIncoming); }
    else byId.set(p.id, { player: { ...p }, gs: iG[i] });
  });
  const players = [...byId.values()].map((e) => e.player);
  const gameStates = [...byId.values()].map((e) => e.gs);
  // Assignations : union par instanceId, MOINS les supprimées (tombstones, union des deux côtés)
  const removedAssignments = _uniq([...(bC.removedAssignments || []), ...(iC.removedAssignments || [])]).slice(-800);
  const _rmSet = new Set(removedAssignments);
  const assignMap = new Map();
  (bC.assignments || []).forEach((a) => { if (!_rmSet.has(a.instanceId)) assignMap.set(a.instanceId, a); });
  (iC.assignments || []).forEach((a) => { if (!_rmSet.has(a.instanceId) && !assignMap.has(a.instanceId)) assignMap.set(a.instanceId, a); });
  // Tâches perso : union par id, MOINS les supprimées (tombstones durables, comme les assignations) —
  // v2.5.0 (Correctif 2A) : SAUF si une assignation survivante (assignMap, déjà calculé ci-dessus)
  // référence encore cette tâche — sinon une tâche supprimée sur un appareil pendant qu'une assignation
  // qui la référence survit sur un autre appareil devient une « assignation orpheline » (taskId sans
  // tâche correspondante, jamais complétable) — c'est la cause des ~125 orphelines trouvées en prod.
  const removedCustomTasks = _uniq([...(bC.removedCustomTasks || []), ...(iC.removedCustomTasks || [])]).slice(-1000);
  const _rmCT = new Set(removedCustomTasks);
  const referencedTaskIds = new Set([...assignMap.values()].map((a) => a.taskId));
  const _keepTask = (t) => referencedTaskIds.has(t.id) || !_rmCT.has(t.id);
  const taskMap = new Map();
  (bC.customTasks || []).forEach((t) => { if (_keepTask(t)) taskMap.set(t.id, t); });
  (iC.customTasks || []).forEach((t) => { if (_keepTask(t) && !taskMap.has(t.id)) taskMap.set(t.id, t); });
  // v1.83.0 (Lot 1 #B6) — demandes de retrait de tâche (enfant→parent) : union par id,
  // en retirant celles dont l'assignation visée a déjà été supprimée entretemps (tombstone naturel).
  const reqMap = new Map();
  [...(bC.removalRequests || []), ...(iC.removalRequests || [])].forEach((r) => { if (r && r.id && !_rmSet.has(r.instanceId)) reqMap.set(r.id, r); });
  // v2.5.10 (Correctif 2C) — propositions de tâche enfant→parent : union par id, moins les tombstones
  // (approuvées ou refusées sur un appareil, ne doivent pas revenir via une copie pas encore synchronisée).
  const removedProposals = _uniq([...(bC.removedProposals || []), ...(iC.removedProposals || [])]).slice(-800);
  const _rmProp = new Set(removedProposals);
  const propMap = new Map();
  [...(bC.childTaskProposals || []), ...(iC.childTaskProposals || [])].forEach((p) => { if (p && p.id && !_rmProp.has(p.id)) propMap.set(p.id, p); });
  // v2.16.35 — Backlog #17 incrément 1 : invitations "en équipe" enfant→enfant — union par id, résolution
  // (accepté/refusé) COLLANTE une fois prise, même patron que coinOffers (sinon un appareil resté sur
  // "pending" pourrait faire revivre une invitation déjà tranchée par l'autre enfant sur un autre appareil).
  const teamInviteMap = new Map();
  for (const inv of [...(bC.teamInvites || []), ...(iC.teamInvites || [])]) {
    if (!inv || inv.id == null) continue;
    const prevInv = teamInviteMap.get(inv.id);
    if (!prevInv) teamInviteMap.set(inv.id, { ...inv });
    else if (prevInv.status === "pending" && inv.status && inv.status !== "pending") teamInviteMap.set(inv.id, { ...inv });
  }
  const teamInvitesCutoff = Date.now() - 2 * 864e5;
  const teamInvites = [...teamInviteMap.values()].filter(inv => inv.status === "pending" || (inv.createdAt || 0) > teamInvitesCutoff).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 40);
  const newer = isNewer(incoming.savedAt, base.savedAt) ? incoming : base;
  const newerC = newer.config || {};
  const config = {
    ...bC, ...iC,
    players,
    assignments: [...assignMap.values()],
    removedAssignments,
    customTasks: [...taskMap.values()],
    removedCustomTasks,
    removalRequests: [...reqMap.values()],
    childTaskProposals: [...propMap.values()],
    removedProposals,
    teamInvites,
    // v2.16.56 — Récompenses cochées par le parent : DERNIÈRE ÉCRITURE GAGNE, plus une union.
    // L'union rendait tout décochage impossible : dès qu'un appareil resynchronisait, sa copie
    // remettait la récompense retirée. C'est une SÉLECTION (un choix de parent), pas un journal
    // d'événements — même patron que `pin`/`mode`/`routineEnd` juste plus bas. Une liste vide ou
    // absente ne peut pas écraser une liste réelle (sinon un appareil jamais passé par l'assistant
    // effacerait la sélection de la famille).
    selectedRewards: (() => {
      const n = newerC.selectedRewards, o = (newer === base ? iC : bC).selectedRewards;
      if (Array.isArray(n) && n.length) return _uniq(n);
      if (Array.isArray(o) && o.length) return _uniq(o);
      return [];
    })(),
    feed: (() => { // fil de famille : union par id, likes unionnés, 60 plus récents
      const m = new Map();
      for (const f of [...(bC.feed || []), ...(iC.feed || [])]) {
        if (!f || f.id == null) continue;
        const prev = m.get(f.id);
        if (prev) prev.likes = _uniq([...(prev.likes || []), ...(f.likes || [])]);
        else m.set(f.id, { ...f, likes: [...(f.likes || [])] });
      }
      return [...m.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 60);
    })(),
    coinOffers: (() => { // offres de pièces : union par id; une résolution (accepté/refusé) est COLLANTE
      const m = new Map();
      for (const o of [...(bC.coinOffers || []), ...(iC.coinOffers || [])]) {
        if (!o || o.id == null) continue;
        const prev = m.get(o.id);
        if (!prev) m.set(o.id, { ...o });
        else if (prev.status === "pending" && o.status && o.status !== "pending") m.set(o.id, { ...o }); // garder le résolu
      }
      // on ne garde que les 40 plus récentes et on jette les résolues de plus de 2 jours
      const cutoff = Date.now() - 2 * 864e5;
      return [...m.values()].filter(o => o.status === "pending" || (o.ts || 0) > cutoff).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 40);
    })(),
    bugs: (() => { const m = new Map(); for (const x of [...(bC.bugs || []), ...(iC.bugs || [])]) { if (x && x.id != null && !m.has(x.id)) m.set(x.id, x); } return [...m.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 60); })(), // v1.65.0 — bugs signalés : union par id (ne se perdent plus à la synchro)
    errorLogs: (() => { const m = new Map(); for (const x of [...(bC.errorLogs || []), ...(iC.errorLogs || [])]) { if (x && x.id != null && !m.has(x.id)) m.set(x.id, x); } return [...m.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 80); })(), // v1.90.0 — logs techniques (erreurs JS) : même pattern que bugs, union par id
    boss: (() => { // même boss = garder l'état "vaincu" si l'un l'a vaincu; sinon le plus récent
      const a = bC.boss, b = iC.boss;
      if (!a) return b || null; if (!b) return a;
      // v2.16.71 — `lastHitTs` était arbitré côté SERVEUR seulement (le seul cas de dérive dans ce
      // sens-là) : sur le même boss, `{...a, ...b}` laissait l'incoming imposer sa date de dernier
      // coup, même plus vieille. Or c'est elle qui pilote la régénération des PV de la famille
      // (`bosses.jsx:131-133`) : une date reculée redonne des PV au boss après un coup encaissé.
      // On garde la plus récente des deux, comme le serveur le fait déjà.
      if (a.startedAt === b.startedAt) { const lastHitTs = [a.lastHitTs, b.lastHitTs].filter(Boolean).sort().pop() || a.lastHitTs; return { ...a, ...b, defeatedAt: a.defeatedAt || b.defeatedAt, lastHitTs }; }
      return (new Date(b.startedAt||0) >= new Date(a.startedAt||0)) ? b : a;
    })(),
    // PIN parent : dernière écriture gagne (permet de le changer / réinitialiser depuis n'importe quel appareil)
    pin: newerC.pin || bC.pin || iC.pin || "1146",
    mode: newerC.mode || bC.mode || iC.mode || "routine",
    routineEnd: newerC.routineEnd || bC.routineEnd || iC.routineEnd,
    // v2.6.0 — annonces parent : union par id, 20 les plus récentes (suppression = tombstone via absence sur les deux côtés)
    announcements: (() => { const m = new Map(); for (const a of [...(bC.announcements||[]), ...(iC.announcements||[])]) { if (a && a.id != null && !m.has(a.id)) m.set(a.id, a); } return [...m.values()].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,20); })(),
    // v2.14.2 (correctif rattrapage Ursul/Antoine DR, 2026-07-28) — Lot 7 (semaine de garde) :
    // weeklyQuests n'était PAS listé ici, donc il retombait sur le spread naïf `{...bC,...iC}` ci-dessus
    // — iC (incoming) écrasait TOUJOURS bC, sans égard à la fraîcheur (même bug déjà corrigé pour
    // weeklyChallenge, voir plus bas). Un appareil resté sur une semaine de garde plus vieille (ou sur
    // `weeklyQuests:null`) pouvait donc effacer les assignations de la semaine en cours partout, orphelinant
    // les demandes de validation en attente. Fix : dernière-semaine-gagne par generatedForWeek, comme le
    // fait déjà server.cjs (mergeFamily côté serveur) — les deux moitiés de la fusion restent cohérentes.
    weeklyQuests: (() => {
      const a = bC.weeklyQuests, b = iC.weeklyQuests;
      if (!a) return b || null;
      if (!b) return a;
      // v2.14.3 (correctif rattrapage Ursul/Antoine DR, 2026-07-28) : une donnée corrompue trouvée
      // en prod ("2026-07-25z2", jamais produite par ce code — voir isValidCustodyWeekKey) battait
      // pour toujours la vraie clé du jour dans une comparaison `>=` brute, empêchant tout correctif
      // via une simple synchro. Une clé invalide perd maintenant automatiquement face à une clé
      // valide, peu importe l'ordre alphabétique.
      const aValid = isValidCustodyWeekKey(a.generatedForWeek), bValid = isValidCustodyWeekKey(b.generatedForWeek);
      if (aValid !== bValid) return aValid ? a : b;
      return (a.generatedForWeek || "") >= (b.generatedForWeek || "") ? a : b;
    })(),
    // v2.6.0 — quêtes de réparation 🕊️ : union-by-id (id = instanceId de l'assignation) = effet
    // collectif exactly-once même après fusion multi-appareils. ⚠️ JAMAIS sur config.boss (merge shallow).
    repairEvents: (() => { const m = new Map(); for (const e of [...(bC.repairEvents||[]), ...(iC.repairEvents||[])]) { if (e && e.id != null && !m.has(e.id)) m.set(e.id, e); } return [...m.values()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,100); })(),
    // v2.6.2 — récompenses "moment" à planifier avec le parent : union-by-id + progression MONOTONE
    // du statut (attente < planifie < fait) — après fusion multi-appareils, un statut ne recule jamais
    // (le parent a pu le marquer "Fait" sur un appareil pendant qu'un autre pousse encore "attente").
    momentRequests: (() => {
      const rank = { attente:0, planifie:1, fait:2 };
      const m = new Map();
      for (const r of [...(bC.momentRequests||[]), ...(iC.momentRequests||[])]) {
        if (!r || r.id == null) continue;
        const prev = m.get(r.id);
        if (!prev || (rank[r.status]||0) > (rank[prev.status]||0)) m.set(r.id, r);
        else if ((rank[r.status]||0) === (rank[prev.status]||0) && r.plannedDate && !prev.plannedDate) m.set(r.id, r);
      }
      return [...m.values()].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,60);
    })(),
    // Bug live signalé par Gen (2026-07-25) : « défi de la semaine peut être coché à l'infini ».
    // Cause : weeklyChallenge n'était PAS listé ici, donc il retombait sur le spread naïf `{...bC,...iC}`
    // ci-dessus — iC (incoming) écrasait TOUJOURS bC en entier, sans égard à la fraîcheur (contrairement
    // au reste de cette fonction), et sans fusionner les checkins. Résultat : une simple relecture cloud
    // (poll périodique, autre appareil) pouvait ramener une copie sans la coche du jour et effacer la
    // coche qui venait d'être faite → le bouton réapparaissait, cochable encore et encore. Fix : fusion
    // explicite par playerId + UNION des checkins (checkins ne fait qu'ajouter des jours "true", jamais
    // les retirer — aucune UI ne décoche — donc l'union est increvable, même patron que `owned`/`badges`).
    weeklyChallenge: (() => {
      const bWC = bC.weeklyChallenge, iWC = iC.weeklyChallenge;
      if (!bWC) return iWC || null;
      if (!iWC) return bWC;
      const weekKey = (iWC.weekKey||"") >= (bWC.weekKey||"") ? (iWC.weekKey||bWC.weekKey) : bWC.weekKey;
      const cm = new Map();
      (bWC.challenges||[]).forEach(c => { if (c && c.playerId != null) cm.set(c.playerId, {...c}); });
      (iWC.challenges||[]).forEach(c => {
        if (!c || c.playerId == null) return;
        const ex = cm.get(c.playerId);
        if (!ex) { cm.set(c.playerId, {...c}); return; }
        cm.set(c.playerId, {
          ...ex, ...c,
          text: preferIncoming ? (c.text ?? ex.text) : (ex.text ?? c.text),
          emoji: preferIncoming ? (c.emoji ?? ex.emoji) : (ex.emoji ?? c.emoji),
          checkins: {...(ex.checkins||{}), ...(c.checkins||{})},
        });
      });
      return { weekKey, challenges:[...cm.values()] };
    })(),
  };
  // v2.16.52 — `seenVersions` (versions du changelog déjà annoncées) est passé dans `config`, où
  // il survit à `persist()`. Le spread naïf `{...bC,...iC}` en ferait une dernière-écriture-gagne :
  // un appareil qui n'a pas encore vu les dernières versions effacerait la liste de l'autre et
  // ferait ré-annoncer tout le changelog partout. Union explicite, dans les deux emplacements
  // (racine incluse) le temps que tous les appareils soient passés en 2.16.52+ : une version
  // annoncée une fois l'est pour toujours, quel que soit l'appareil qui l'a vue.
  const seenVersions = _uniq([...(bC.seenVersions || []), ...(iC.seenVersions || []), ...(base.seenVersions || []), ...(incoming.seenVersions || [])]);
  config.seenVersions = seenVersions;
  return { ...newer, config, gameStates, seenVersions, savedAt: isNewer(incoming.savedAt, base.savedAt) ? incoming.savedAt : base.savedAt };
};
