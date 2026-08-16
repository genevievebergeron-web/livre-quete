/* ═══════════════════════════════════════════════════════════════
   Livre de Quêtes — couche de fusion CÔTÉ SERVEUR
   ═══════════════════════════════════════════════════════════════
   Extrait de `server.cjs` le 2026-08-15 (v2.16.71). Contenu déplacé TEL QUEL,
   puis remis en parité avec `src/merge.js` (voir l'entrée v2.16.71 de
   PROJET-ETAT.md pour les 6 règles qui manquaient ici).

   ⚠️ CE FICHIER EST UNE COPIE MANUELLE de `src/merge.js`. Il existe parce que
   `server.cjs` est en CommonJS et que `src/merge.js` est un module ESM tirant
   `themes.js`/`pets.js`/`leagues.js`/`recurring.js`/`shared.js`/`energy.js` —
   on ne peut pas simplement le `require()`. Toute règle ajoutée dans l'un DOIT
   l'être dans l'autre : `node scripts/check-merge-parity.mjs` (lancé par
   `npm run build`) rejoue les DEUX implémentations sur des scénarios réalistes
   et échoue à la moindre divergence. C'est ce garde-fou qui manquait — six
   règles avaient dérivé sans que rien ne le signale.
   ═══════════════════════════════════════════════════════════════ */
const _uniq = (a) => [...new Set(a || [])];

// v2.16.65 — MIROIR EXACT de sanitizeXpLog/mergeXpLog (src/shared.js). Les deux moitiés doivent
// bouger ensemble, sinon la réparation faite par un client est annulée par la fusion du serveur :
// c'est le serveur qui détient les journaux gonflés (500 entrées par enfant, mesuré le 14 août).
const _dayOfDoneKey = (k) => { const m = /#(\d{4}-\d{2}-\d{2})$/.exec(String(k || "")); return m ? m[1] : null; };
const _xpLogKey = (e) => `${e && e.date}|${e && e.amount}|${e && e.source}`;
const sanitizeXpLog = (xpLog, completedAt) => {
  const log = xpLog || [];
  if (!log.some((e) => e && !e.id)) return log;
  const doneByDate = {};
  for (const k of Object.keys(completedAt || {})) { const d = _dayOfDoneKey(k); if (d) doneByDate[d] = (doneByDate[d] || 0) + 1; }
  const legacyQuestByDate = {};
  for (const e of log) { if (e && !e.id && e.source === "quete" && e.date) (legacyQuestByDate[e.date] = legacyQuestByDate[e.date] || []).push(e); }
  const drop = new Set(); const keepCount = {};
  for (const [date, entries] of Object.entries(legacyQuestByDate)) {
    const limit = Math.max(doneByDate[date] || 0, 1);
    if (entries.length <= limit) continue;
    const counts = {}; for (const e of entries) counts[_xpLogKey(e)] = (counts[_xpLogKey(e)] || 0) + 1;
    const g = Object.values(counts).reduce((a, b) => { while (b) { [a, b] = [b, a % b]; } return a; }, 0);
    const target = g >= 2 ? Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, n / g])) : null;
    const total = target ? Object.values(target).reduce((a, b) => a + b, 0) : 0;
    if (target && total <= limit) { for (const [k, n] of Object.entries(target)) keepCount[date + " " + k] = n; }
    drop.add(date);
  }
  if (!drop.size) return log;
  const seen = {};
  return log.filter((e) => {
    if (!e || e.id || e.source !== "quete" || !drop.has(e.date)) return true;
    const k = e.date + " " + _xpLogKey(e);
    const quota = keepCount[k] || 0;
    seen[k] = (seen[k] || 0) + 1;
    return seen[k] <= quota;
  });
};
const mergeXpLog = (a, b, completedAt) => {
  const A = sanitizeXpLog(a, completedAt), B = sanitizeXpLog(b, completedAt);
  const out = []; const ids = new Set(); const legacy = {};
  for (const e of [...A, ...B]) {
    if (!e) continue;
    if (e.id) { if (!ids.has(e.id)) { ids.add(e.id); out.push(e); } }
    else { const k = _xpLogKey(e); (legacy[k] = legacy[k] || []).push(e); }
  }
  for (const [k, entries] of Object.entries(legacy)) {
    const inA = A.filter((e) => e && !e.id && _xpLogKey(e) === k).length;
    const inB = B.filter((e) => e && !e.id && _xpLogKey(e) === k).length;
    for (let i = 0; i < Math.max(inA, inB); i++) out.push(entries[i]);
  }
  return out.sort((x, y) => (x.date || "").localeCompare(y.date || "")).slice(-500);
};
const isNewer = (a, b) => { if (!a) return false; if (!b) return true; try { return new Date(a) > new Date(b); } catch { return false; } };
// v2.14.3 (correctif rattrapage Ursul/Antoine DR, 2026-07-28) — port du même garde-fou côté client
// (src/recurring.js, isValidCustodyWeekKey) : une valeur corrompue trouvée en prod ("2026-07-25z2",
// jamais produite par custodyWeekKey() — qui ne renvoie que des vendredis YYYY-MM-DD) battait pour
// toujours la vraie clé du jour dans la comparaison `>=` brute ci-dessous, rendant la corruption
// increvable via une simple synchro. Une clé invalide perd désormais face à une clé valide.
const isValidCustodyWeekKey = (v) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  return d.getDay() === 5; // vendredi
};
// v2.16.67 — miroir enfin fidèle du merge client (`src/merge.js` _mergeCalendar, v2.7.0). Cette
// version-ci ignorait DEUX choses que le client applique depuis longtemps : les pierres tombales
// (`removedCalendarIds`, que le serveur ne transportait même pas — voir mergeGS) et `updatedAt`.
// Conséquence : un événement supprimé sur un appareil ressuscitait à la synchro suivante, et la
// version gagnante était « celle qui arrive en dernier » plutôt que la plus récente. Personne ne
// s'en était aperçu parce qu'aucun événement n'avait jamais été supprimé en prod
// (`removedCalendarIds` vide chez les 4 enfants) — mais la v2.16.67 ajoute une deuxième façon
// d'en retirer un (décocher un enfant dans le formulaire), donc le trou devait être bouché.
const _mergeCalendar = (a, b, removedIds) => {
  const rm = removedIds ? new Set(removedIds) : null;
  const byId = new Map(); const noId = []; const seenRaw = new Set();
  for (const e of [...(a || []), ...(b || [])]) {
    if (!e) continue;
    if (e.id == null) { const k = JSON.stringify(e); if (!seenRaw.has(k)) { seenRaw.add(k); noId.push(e); } continue; }
    if (rm && rm.has(e.id)) continue;
    const prev = byId.get(e.id);
    if (!prev || (e.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(e.id, e);
  }
  return [...byId.values(), ...noId];
};
const mergePetXp = (a, b) => { const out = { ...(a||{}) }; for (const k in (b||{})) out[k] = Math.max(out[k]||0, b[k]||0); return out; };
const mergeBossBattle = (a, b) => { a=a||{}; b=b||{};
  if (!a.bossId) return b.bossId ? b : { bossId:null, earned:0, spent:0, dmg:0 };
  if (!b.bossId) return a;
  if (a.bossId === b.bossId) return { bossId:a.bossId, earned:Math.max(a.earned||0,b.earned||0), spent:Math.max(a.spent||0,b.spent||0), dmg:Math.max(a.dmg||0,b.dmg||0) };
  return (new Date(b.bossId) > new Date(a.bossId)) ? b : a;
};
const mergeGS = (a, b, preferIncoming) => {
  a = a || {}; b = b || {};
  const completed = _uniq([...(a.completed||[]), ...(b.completed||[])]);
  const refusedKeys = _uniq([...(a.refusedKeys||[]), ...(b.refusedKeys||[])]).slice(-400); // v1.64.0 — tombstone des refus
  const _refusedSet = new Set(refusedKeys);
  const avatarConfigured = b.avatar?.configured ? b.avatar : (a.avatar?.configured ? a.avatar : { ...(a.avatar||{}), ...(b.avatar||{}) });
  const _completedAt = { ...(b.completedAt || {}), ...(a.completedAt || {}) }; // v2.16.65 — hissé : borne de plausibilité de mergeXpLog
  const removedCalendarIds = _uniq([...(a.removedCalendarIds || []), ...(b.removedCalendarIds || [])]).slice(-400); // v2.16.67 — miroir du client (v2.7.0) : le serveur ne transportait pas du tout ce tombstone
  return {
    ...a, ...b,
    xp: Math.max(a.xp||0, b.xp||0),
    coins: preferIncoming ? (b.coins ?? a.coins ?? 0) : (a.coins ?? b.coins ?? 0),
    coinsLifetime: Math.max(a.coinsLifetime || 0, b.coinsLifetime || 0), // v2.5.26 — miroir du merge client (jamais décrémenté)
    // v2.5.26 — miroir du fix client v2.5.3 : sans ça, le spread ...b laissait n'importe quel client
    // (même un vieux, pas à jour) écraser coinsWeek côté serveur. On garde la semaine la plus récente.
    coinsWeek: (() => { const aw = (a.coinsWeek?.week || ""); const bw = (b.coinsWeek?.week || ""); return aw >= bw ? (a.coinsWeek || { week: aw }) : (b.coinsWeek || { week: bw }); })(),
    completed,
    completedAt: _completedAt,
    xpLog: mergeXpLog(a.xpLog, b.xpLog, _completedAt), // v2.16.65 — miroir du merge client : union par `id`, multiplicité MAX (jamais la somme) pour l'hérité, + réparation des journaux déjà gonflés
    pending: _uniq([...(a.pending||[]), ...(b.pending||[])]).filter(k => !completed.includes(k) && !_refusedSet.has(k)), // v1.64.0 — exclut les refusées
    refusedKeys,
    refusals: preferIncoming ? (b.refusals || a.refusals || []) : (a.refusals || b.refusals || []),
    owned: _uniq([...(a.owned||[]), ...(b.owned||[])]),
    boughtRewards: preferIncoming ? (b.boughtRewards || a.boughtRewards || []) : (a.boughtRewards || b.boughtRewards || []), // v1.63.0 — dernière-écriture-gagne (avec coins)
    rewardBuyTs: preferIncoming ? (b.rewardBuyTs || a.rewardBuyTs || {}) : (a.rewardBuyTs || b.rewardBuyTs || {}), // v2.16.62 — voyage avec boughtRewards (même règle) : une résurrection ramène l'ancienne estampille, déjà tombstonée
    refundedRewards: _uniq([...(a.refundedRewards||[]), ...(b.refundedRewards||[])]).slice(-200), // v1.69.0 — tombstone « déjà remboursé » (union) → fin des pièces infinies ; keyé sur l'achat depuis v2.16.62
    badges: _uniq([...(a.badges||[]), ...(b.badges||[])]),
    equipped: { ...(a.equipped||{}), ...(b.equipped||{}) },
    calendar: _mergeCalendar(a.calendar, b.calendar, removedCalendarIds),
    removedCalendarIds,
    avatar: avatarConfigured,
    // v2.16.72 — MIROIR de src/merge.js : « Ma maison » n'avait de règle dans aucune des deux copies.
    // Dernière-écriture-gagne sur l'objet entier (jamais d'union par slot : retirer un meuble, c'est
    // enlever sa clé de `placed`, une union le ferait revenir).
    house: preferIncoming ? (b.house ?? a.house ?? null) : (a.house ?? b.house ?? null),
    pin: preferIncoming ? (b.pin ?? a.pin ?? null) : (a.pin ?? b.pin ?? null),
    mode: b.mode ?? a.mode ?? null,
    // v2.15.8 — port du même tombstone que le client (App.jsx, mergeGS) : les routines n'avaient
    // aucun tombstone, contrairement à assignments/customTasks/childTaskProposals — une routine
    // supprimée localement revenait dès que ce merge serveur la retrouvait dans l'état existant.
    removedRoutineIds: _uniq([...(a.removedRoutineIds||[]), ...(b.removedRoutineIds||[])]).slice(-200),
    // v2.16.70 — port du même correctif que le client (src/merge.js) : l'union par id gardait la
    // PREMIÈRE copie rencontrée, donc `a` = l'état DÉJÀ stocké ici (`mergeFamily(existing, data)`)
    // gagnait toujours. Le serveur ne pouvait donc jamais accepter la modification d'un rituel
    // existant, ni le ménage des références mortes fait par le client à chaque chargement.
    // Présence = union (avec tombstone) ; contenu d'un id commun = l'écriture la plus récente.
    routines: (() => { const removed=new Set([...(a.removedRoutineIds||[]), ...(b.removedRoutineIds||[])]); const m = new Map(); const fresh = preferIncoming ? (b.routines||[]) : (a.routines||[]), stale = preferIncoming ? (a.routines||[]) : (b.routines||[]); for (const r of [...fresh, ...stale]) { if (r && r.id != null && !removed.has(r.id) && !m.has(r.id)) m.set(r.id, r); } return [...m.values()]; })(),
    activeRoutineId: b.activeRoutineId ?? a.activeRoutineId ?? null,
    hiddenRewards: _uniq([...(a.hiddenRewards||[]), ...(b.hiddenRewards||[])]),
    hiddenWeek: b.hiddenWeek ?? a.hiddenWeek ?? null,
    dailyClaimed: (() => { const A=a.dailyClaimed||{}, B=b.dailyClaimed||{}; if (A.day && A.day===B.day) return { day:A.day, ids:_uniq([...(A.ids||[]),...(B.ids||[])]) }; return ((B.day||"")>=(A.day||"")) ? (B.day?B:A) : (A.day?A:B); })(),
    // v2.12.2 — miroir du fix client (bug "notification félicitation qui revient sans cesse") :
    // dernière-écriture-gagne laissait une soeur/frère au savedAt plus récent ressusciter en bloc
    // une file jamais vidée. Union + tombstone consumedCelebrationIds, même patron que refundedRewards.
    consumedCelebrationIds: _uniq([...(a.consumedCelebrationIds||[]), ...(b.consumedCelebrationIds||[])]).slice(-300),
    pendingCelebrations: (() => { const consumed = new Set([...(a.consumedCelebrationIds||[]), ...(b.consumedCelebrationIds||[])]); const seen = new Set(); const out = []; for (const c of [...(a.pendingCelebrations||[]), ...(b.pendingCelebrations||[])]) { if (!c || !c.id || consumed.has(c.id) || seen.has(c.id)) continue; seen.add(c.id); out.push(c); } return out; })(),
    petXp: mergePetXp(a.petXp, b.petXp),
    petDay: (() => { const A=a.petDay||{}, B=b.petDay||{}; if (A.day && A.day===B.day) return { day:A.day, xp:Math.max(A.xp||0,B.xp||0) }; return ((B.day||"")>=(A.day||"")) ? (B.day?B:A) : (A.day?A:B); })(),
    petEvo: (() => { const out={...(a.petEvo||{})}; const B=b.petEvo||{}; for(const k in B){ out[k]={...(B[k]||{}), ...(out[k]||{})}; } return out; })(),
    // v2.15.7 — port du correctif client (App.jsx, mergeGS) : ce bloc utilisait `preferIncoming`
    // (basé sur le savedAt GLOBAL de tout le blob famille), plus grossier que la comparaison par
    // energyTs déjà faite côté client — un vrai désaccord entre les deux moitiés de la fusion.
    // Même fix : sous ~5 min d'écart entre les deux energyTs (fenêtre de course plausible entre
    // deux appareils), prendre le minimum d'énergie (jamais de remboursement accidentel) et son
    // energyTs assorti ; au-delà, comparer directement par energyTs (pas par preferIncoming).
    energy: (() => { const aT=a.energyTs?new Date(a.energyTs).getTime():0, bT=b.energyTs?new Date(b.energyTs).getTime():0;
      if (Math.abs(aT-bT) <= 5*60*1000) return Math.min(a.energy??100, b.energy??100);
      return bT>=aT ? (b.energy??a.energy??100) : (a.energy??b.energy??100); })(),
    energyTs: (() => { const aT=a.energyTs?new Date(a.energyTs).getTime():0, bT=b.energyTs?new Date(b.energyTs).getTime():0;
      if (Math.abs(aT-bT) <= 5*60*1000) return (a.energy??100) <= (b.energy??100) ? (a.energyTs??b.energyTs??null) : (b.energyTs??a.energyTs??null);
      return bT>=aT ? (b.energyTs??a.energyTs??null) : (a.energyTs??b.energyTs??null); })(),
    lastFedDay: [a.lastFedDay, b.lastFedDay].filter(Boolean).sort().pop() || null,
    // v2.16.72 — MIROIR de src/merge.js : le jour ne recule jamais (sinon le toast « Nouvelle
    // journée! » se rejoue sur une journée déjà ouverte).
    lastSeenDay: [a.lastSeenDay, b.lastSeenDay].filter(Boolean).sort().pop() || null,
    activeDays: _uniq([...(a.activeDays||[]), ...(b.activeDays||[])]),
    // v2.16.34 — miroir du merge client (App.jsx, mergeGS) : ratchet par rang, jamais de recul.
    leagueTier: (() => { const RANK={bronze:0,argent:1,or:2,diamant:3}; const ra=RANK[a.leagueTier]||0, rb=RANK[b.leagueTier]||0; return rb>=ra ? (b.leagueTier||"bronze") : (a.leagueTier||"bronze"); })(),
    bossBattle: mergeBossBattle(a.bossBattle, b.bossBattle),
    settings: { ...(a.settings||{}), ...(b.settings||{}) },
    // v2.16.71 — les 4 règles suivantes existaient côté client depuis longtemps et n'ont JAMAIS
    // été portées ici : elles tombaient donc dans le `{...a, ...b}` du haut, où l'incoming écrase
    // l'existant en entier. Mesuré par `scripts/check-merge-parity.mjs` (nouveau, lancé au build).
    // « rituel déjà fêté aujourd'hui » (v1.68.0) : sans l'union par jour, la fête d'un rituel
    // revient une 2e fois. Même famille que le bug v2.12.2 (« félicitation qui revient sans cesse »).
    ritualCelebrated: (() => { const A=a.ritualCelebrated||{}, B=b.ritualCelebrated||{}; if (A.day && A.day===B.day) return { day:A.day, ids:_uniq([...(A.ids||[]),...(B.ids||[])]) }; return ((B.day||"")>=(A.day||"")) ? (B.day?B:A) : (A.day?A:B); })(),
    // Surnoms de familiers (v2.4.2) : union par petId, sinon le surnom donné sur une tablette
    // disparaît dès qu'un autre appareil pousse un objet qui ne le contient pas.
    petNickname: { ...(a.petNickname||{}), ...(b.petNickname||{}) },
    // Budget-temps quotidien (Backlog #13) : même jour → MAX. Sans ça, un appareil qui a compté
    // moins de minutes REMET le compteur du jour à sa valeur à lui — le plafond posé par le parent
    // (« 30 min ») se retrouve silencieusement repoussé d'autant.
    sessionMinutes: (() => { const A=a.sessionMinutes||{}, B=b.sessionMinutes||{}; if (A.day && A.day===B.day) return { day:A.day, minutes:Math.max(A.minutes||0,B.minutes||0) }; return ((B.day||"")>=(A.day||"")) ? (B.day?B:A) : (A.day?A:B); })(),
    // Annonces archivées par l'enfant (v2.6.0) : union, sinon une annonce balayée revient.
    dismissedAnnouncements: _uniq([...(a.dismissedAnnouncements||[]), ...(b.dismissedAnnouncements||[])]),
    // v2.16.71 — `challengeTiers` n'avait de règle NULLE PART (ni client ni serveur), alors que
    // c'est le SEUL garde-fou d'idempotence d'un vrai versement de pièces : les paliers gradués du
    // défi hebdo (3 jours → +10 🪙, 5 → +15, 7 → +25 + badge, App.jsx ~2535) ne sont payés qu'une
    // fois parce que le palier est inscrit ici. En spread naïf, une copie portant le marqueur d'une
    // semaine PASSÉE écrase celui de la semaine en cours → l'effet repasse et repaie. Règle : même
    // semaine → union des paliers (monotone, un palier payé ne se dépaie jamais) ; semaine
    // différente → la plus récente gagne. Même patron que `dailyClaimed`/`ritualCelebrated`.
    challengeTiers: (() => { const A=a.challengeTiers||{}, B=b.challengeTiers||{}; if (A.week && A.week===B.week) return { week:A.week, tiers:_uniq([...(A.tiers||[]),...(B.tiers||[])]) }; return ((B.week||"")>=(A.week||"")) ? (B.week?B:A) : (A.week?A:B); })(),
  };
};
// v1.66.0 (fix B2) : pseudo / themeId / themeChosenAt en DERNIÈRE-ÉCRITURE-GAGNE (preferIncoming)
const _mergePlayer = (a, b, preferIncoming = false) => {
  const w = preferIncoming ? b : a, o = preferIncoming ? a : b;
  return { ...a, ...b, name:a.name||b.name, color:a.color||b.color,
    pseudo: w.pseudo || o.pseudo,
    themeId:(w.themeId && w.themeId!=="none") ? w.themeId : (o.themeId && o.themeId!=="none") ? o.themeId : (w.themeId||o.themeId||"none"),
    themeChosenAt: w.themeChosenAt || o.themeChosenAt,
    starterThemes:_uniq([...(a.starterThemes||[]), ...(b.starterThemes||[])]).slice(0,4) };
};
const mergeFamily = (base, incoming) => {
  if (!base) return incoming; if (!incoming) return base;
  const bC = base.config||{}, iC = incoming.config||{};
  const bP = bC.players||[], iP = iC.players||[]; const bG = base.gameStates||[], iG = incoming.gameStates||[];
  const preferIncoming = isNewer(incoming.savedAt, base.savedAt);
  const byId = new Map();
  bP.forEach((p, i) => byId.set(p.id, { player:{ ...p }, gs:bG[i] }));
  iP.forEach((p, i) => { if (byId.has(p.id)) { const e=byId.get(p.id); e.player=_mergePlayer(e.player,p,preferIncoming); e.gs=mergeGS(e.gs,iG[i],preferIncoming); } else byId.set(p.id, { player:{ ...p }, gs:iG[i] }); });
  const players = [...byId.values()].map(e => e.player);
  const gameStates = [...byId.values()].map(e => e.gs);
  const removedAssignments = _uniq([...(bC.removedAssignments||[]), ...(iC.removedAssignments||[])]).slice(-800);
  const _rmSet = new Set(removedAssignments);
  const assignMap = new Map(); (bC.assignments||[]).forEach(a => { if (!_rmSet.has(a.instanceId)) assignMap.set(a.instanceId, a); }); (iC.assignments||[]).forEach(a => { if (!_rmSet.has(a.instanceId) && !assignMap.has(a.instanceId)) assignMap.set(a.instanceId, a); });
  const removedCustomTasks = _uniq([...(bC.removedCustomTasks||[]), ...(iC.removedCustomTasks||[])]).slice(-1000);
  const _rmCT = new Set(removedCustomTasks);
  // v2.15.9 (trouvé en restaurant les rituels perso d'Elli, 2026-07-28) : ce filtre appliquait le
  // tombstone à l'aveugle, contrairement au client (App.jsx, même merge) qui GARDE une tâche perso
  // tombstonée si une assignation SURVIVANTE la référence encore (Correctif 2A, v2.5.0) — exactement
  // le cas d'une tâche restaurée sous son ID d'origine pour rebrancher une assignation déjà vivante.
  // Sans ce garde-fou ici, le serveur rejetait silencieusement toute restauration de ce genre.
  const referencedTaskIds = new Set([...assignMap.values()].map(a => a.taskId));
  const _keepTask = t => referencedTaskIds.has(t.id) || !_rmCT.has(t.id);
  const taskMap = new Map(); (bC.customTasks||[]).forEach(t => { if (_keepTask(t)) taskMap.set(t.id, t); }); (iC.customTasks||[]).forEach(t => { if (_keepTask(t) && !taskMap.has(t.id)) taskMap.set(t.id, t); });
  const newer = preferIncoming ? incoming : base; const newerC = newer.config||{};
  // v2.16.71 — miroir du merge client (src/merge.js) : demandes de retrait de tâche (v1.83.0) et
  // propositions de tâche enfant→parent (v2.5.10) n'avaient AUCUNE règle ici — elles tombaient dans
  // le `{...bC, ...iC}` plus bas, où l'incoming écrase l'existant en entier. Un appareil poussant
  // une config sans la demande d'un enfant l'effaçait donc du nuage : le parent ne la voyait jamais.
  const reqMap = new Map();
  [...(bC.removalRequests||[]), ...(iC.removalRequests||[])].forEach(r => { if (r && r.id && !_rmSet.has(r.instanceId)) reqMap.set(r.id, r); });
  const removedProposals = _uniq([...(bC.removedProposals||[]), ...(iC.removedProposals||[])]).slice(-800);
  const _rmProp = new Set(removedProposals);
  const propMap = new Map();
  [...(bC.childTaskProposals||[]), ...(iC.childTaskProposals||[])].forEach(p => { if (p && p.id && !_rmProp.has(p.id)) propMap.set(p.id, p); });
  // v2.16.35 — miroir du merge client : invitations "en équipe" enfant→enfant, union-by-id + statut COLLANT
  const teamInvites = (() => { const m=new Map(); for (const inv of [...(bC.teamInvites||[]), ...(iC.teamInvites||[])]) { if (!inv||inv.id==null) continue; const prev=m.get(inv.id); if (!prev) m.set(inv.id,{ ...inv }); else if (prev.status==="pending"&&inv.status&&inv.status!=="pending") m.set(inv.id,{ ...inv }); } const cut=Date.now()-2*864e5; return [...m.values()].filter(inv=>inv.status==="pending"||(inv.createdAt||0)>cut).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,40); })();
  const config = {
    ...bC, ...iC, players, assignments:[...assignMap.values()], removedAssignments, customTasks:[...taskMap.values()], removedCustomTasks, teamInvites,
    removalRequests:[...reqMap.values()], childTaskProposals:[...propMap.values()], removedProposals,
    // v2.16.71 — miroir du merge client (v2.6.0) : les annonces du parent n'avaient pas de règle ici.
    // Union par id, 20 plus récentes, comme le client.
    announcements: (() => { const m=new Map(); for (const a of [...(bC.announcements||[]), ...(iC.announcements||[])]) { if (a && a.id != null && !m.has(a.id)) m.set(a.id, a); } return [...m.values()].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,20); })(),
    // v2.16.56 — miroir du merge client : récompenses cochées par le parent = DERNIÈRE ÉCRITURE GAGNE.
    // En union, aucun décochage ne survivait à une synchro. Une liste vide ne peut pas écraser une
    // liste réelle.
    selectedRewards:(() => { const n=newerC.selectedRewards, o=(preferIncoming?bC:iC).selectedRewards; if (Array.isArray(n)&&n.length) return _uniq(n); if (Array.isArray(o)&&o.length) return _uniq(o); return []; })(),
    feed: (() => { const m=new Map(); for (const f of [...(bC.feed||[]), ...(iC.feed||[])]) { if (!f||f.id==null) continue; const prev=m.get(f.id); if (prev) prev.likes=_uniq([...(prev.likes||[]),...(f.likes||[])]); else m.set(f.id,{ ...f, likes:[...(f.likes||[])] }); } return [...m.values()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,60); })(),
    // v2.6.0 — miroir du merge client : quêtes de réparation 🕊️, union-by-id exactly-once
    repairEvents: (() => { const m=new Map(); for (const e of [...(bC.repairEvents||[]), ...(iC.repairEvents||[])]) { if (e && e.id != null && !m.has(e.id)) m.set(e.id, e); } return [...m.values()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,100); })(),
    // v2.6.2 — miroir du merge client : récompenses "moment" à planifier, union-by-id + statut MONOTONE
    momentRequests: (() => { const rank={attente:0,planifie:1,fait:2}; const m=new Map(); for (const r of [...(bC.momentRequests||[]), ...(iC.momentRequests||[])]) { if (!r||r.id==null) continue; const prev=m.get(r.id); if (!prev || (rank[r.status]||0) > (rank[prev.status]||0)) m.set(r.id,r); else if ((rank[r.status]||0)===(rank[prev.status]||0) && r.plannedDate && !prev.plannedDate) m.set(r.id,r); } return [...m.values()].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,60); })(),
    coinOffers: (() => { const m=new Map(); for (const o of [...(bC.coinOffers||[]), ...(iC.coinOffers||[])]) { if (!o||o.id==null) continue; const prev=m.get(o.id); if (!prev) m.set(o.id,{ ...o }); else if (prev.status==="pending"&&o.status&&o.status!=="pending") m.set(o.id,{ ...o }); } const cut=Date.now()-2*864e5; return [...m.values()].filter(o=>o.status==="pending"||(o.ts||0)>cut).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,40); })(),
    bugs: (() => { const m=new Map(); for (const x of [...(bC.bugs||[]), ...(iC.bugs||[])]) { if (x&&x.id!=null&&!m.has(x.id)) m.set(x.id,x); } return [...m.values()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,60); })(),
    // v2.16.42 — miroir du merge client (merge.js, v1.90.0) qui MANQUAIT ici : les logs
    // techniques tombaient dans le `{...bC, ...iC}` ci-dessus, donc un appareil poussant
    // une config sans erreurs écrasait purement et simplement celles d'un autre appareil.
    // Même union-by-id que `bugs`, même plafond que le client (80).
    errorLogs: (() => { const m=new Map(); for (const x of [...(bC.errorLogs||[]), ...(iC.errorLogs||[])]) { if (x&&x.id!=null&&!m.has(x.id)) m.set(x.id,x); } return [...m.values()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,80); })(),
    boss: (() => { const a=bC.boss, b=iC.boss; if (!a) return b||null; if (!b) return a;
      if (a.startedAt===b.startedAt) { const lastHitTs=[a.lastHitTs,b.lastHitTs].filter(Boolean).sort().pop()||a.lastHitTs; return { ...a, ...b, defeatedAt:a.defeatedAt||b.defeatedAt, lastHitTs }; }
      return (new Date(b.startedAt||0) >= new Date(a.startedAt||0)) ? b : a; })(),
    pin: newerC.pin || bC.pin || iC.pin || "1146",
    mode: newerC.mode || bC.mode || iC.mode || "routine",
    routineEnd: newerC.routineEnd || bC.routineEnd || iC.routineEnd,
    // Lot 7 — last-write-wins par weekKey (plus récent gagne)
    weeklyQuests: (() => { const a=bC.weeklyQuests, b=iC.weeklyQuests; if (!a) return b||null; if (!b) return a;
      const aValid=isValidCustodyWeekKey(a.generatedForWeek), bValid=isValidCustodyWeekKey(b.generatedForWeek);
      if (aValid !== bValid) return aValid ? a : b;
      return (a.generatedForWeek||"") >= (b.generatedForWeek||"") ? a : b; })(),
    // v2.16.71 — remis à l'identique du client (src/merge.js, fix v2.5.16 « défi cochable à
    // l'infini »). Cette copie n'unionnait les coches QUE si les deux côtés portaient la même
    // `weekKey` : à la bascule du vendredi, un appareil resté sur l'ancienne clé voyait sa coche
    // du jour jetée en bloc avec tout son objet. Le client, lui, garde la clé la plus récente ET
    // unionne les coches par enfant dans tous les cas (les coches ne font qu'ajouter des jours,
    // aucune UI ne décoche — et `challengeDaysCount` filtre par semaine à la lecture, donc une
    // vieille coche transportée ne compte pas). Texte et emoji suivent la dernière écriture.
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
        cm.set(c.playerId, { ...ex, ...c,
          text: preferIncoming ? (c.text ?? ex.text) : (ex.text ?? c.text),
          emoji: preferIncoming ? (c.emoji ?? ex.emoji) : (ex.emoji ?? c.emoji),
          checkins: {...(ex.checkins||{}), ...(c.checkins||{})} });
      });
      return { weekKey, challenges:[...cm.values()] };
    })(),
    custodySchedule: newerC.custodySchedule || bC.custodySchedule || iC.custodySchedule,
  };
  // v2.16.52 — même union que le `mergeFamily` du client (src/merge.js) : `seenVersions` (versions
  // du changelog déjà annoncées) est passé dans `config`, et le spread naïf `{...bC,...iC}` en
  // ferait une dernière-écriture-gagne. Les deux moitiés de la fusion doivent rester cohérentes,
  // sinon le serveur défait ce que le client garde.
  const seenVersions = _uniq([...(bC.seenVersions || []), ...(iC.seenVersions || []), ...(base.seenVersions || []), ...(incoming.seenVersions || [])]);
  config.seenVersions = seenVersions;
  return { ...newer, config, gameStates, seenVersions, savedAt: preferIncoming ? incoming.savedAt : base.savedAt };
};


module.exports = { _uniq, isNewer, sanitizeXpLog, mergeXpLog, isValidCustodyWeekKey, _mergeCalendar, mergePetXp, mergeBossBattle, mergeGS, _mergePlayer, mergeFamily };
