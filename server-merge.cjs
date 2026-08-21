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
// v2.16.89 — port du correctif client : à `updatedAt` ÉGAL (61 des 61 événements de la prod n'en
// portent aucun), `>=` sur `[...a, ...b]` rendait le SECOND argument de l'appelant, pas le côté
// frais — et chaque appelant met sa propre copie en premier. Voir src/merge.js pour le détail.
const _mergeCalendar = (a, b, removedIds, preferIncoming) => {
  const rm = removedIds ? new Set(removedIds) : null;
  const byId = new Map(); const noId = []; const seenRaw = new Set();
  const frais = preferIncoming ? (b || []) : (a || []), perime = preferIncoming ? (a || []) : (b || []);
  for (const e of [...frais, ...perime]) {
    if (!e) continue;
    if (e.id == null) { const k = JSON.stringify(e); if (!seenRaw.has(k)) { seenRaw.add(k); noId.push(e); } continue; }
    if (rm && rm.has(e.id)) continue;
    const prev = byId.get(e.id);
    if (!prev || (e.updatedAt || 0) > (prev.updatedAt || 0)) byId.set(e.id, e);
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
  // v2.16.81 — MIROIR de src/merge.js. ÉPOQUE DE RESET : un état VIDE n'exprime aucun retrait face
  // à des max() et des unions, donc « Reset complet » ne remettait à zéro que `coins`. Ici c'était
  // même sans appel : `mergeFamily(existing, data)` met toujours le stocké en `a`, donc le reset
  // n'atteignait JAMAIS le nuage. Le côté qui a vu le reset le plus récent gagne entièrement.
  const _resetAt = Math.max(Number(a.resetAt) || 0, Number(b.resetAt) || 0);
  if (_resetAt > 0) {
    const aVieux = (Number(a.resetAt) || 0) < _resetAt;
    const bVieux = (Number(b.resetAt) || 0) < _resetAt;
    if (aVieux && !bVieux) return { ...b, resetAt: _resetAt };
    if (bVieux && !aVieux) return { ...a, resetAt: _resetAt };
  }
  // v2.16.82 — miroir EXACT du correctif client (src/merge.js) : `completedAt` en union par clé où
  // l'horodatage le plus RÉCENT gagne (l'ordre du spread ne regardait pas `preferIncoming`, et ici
  // c'est l'état STOCKÉ qui est en `a` — une re-validation n'aurait jamais pu s'inscrire), et
  // `deCompleted`, tombstone daté du bouton « ↩️ Annuler » du portail parent. `completed` est une
  // union de chaînes : un état d'où la clé a disparu n'exprime aucun retrait, donc l'annulation était
  // systématiquement défaite par la copie d'en face. Le tombstone ne l'emporte que s'il est plus
  // récent que la complétion, pour qu'une quête refaite le même jour (même `doneKey`) tienne.
  const _completedAt = (() => {
    const A = a.completedAt || {}, B = b.completedAt || {}, out = { ...A };
    for (const k of Object.keys(B)) {
      const prev = out[k];
      if (prev === undefined) { out[k] = B[k]; continue; }
      const tp = Date.parse(prev), tb = Date.parse(B[k]);
      out[k] = (Number.isNaN(tp) || (!Number.isNaN(tb) && tb > tp)) ? B[k] : prev;
    }
    return out;
  })();
  const deCompleted = (() => {
    const A = a.deCompleted || {}, B = b.deCompleted || {}, out = { ...A };
    for (const k of Object.keys(B)) out[k] = Math.max(Number(out[k]) || 0, Number(B[k]) || 0);
    const cles = Object.keys(out);
    if (cles.length <= 400) return out;
    const garde = cles.sort((x, y) => (out[x] || 0) - (out[y] || 0)).slice(-400);
    const borne = {}; for (const k of garde) borne[k] = out[k];
    return borne;
  })();
  const _annulee = (k) => {
    const t = Number(deCompleted[k]) || 0;
    if (!t) return false;
    const fait = Date.parse(_completedAt[k]);
    return t > (Number.isNaN(fait) ? 0 : fait);
  };
  const completed = _uniq([...(a.completed||[]), ...(b.completed||[])]).filter((k) => !_annulee(k));
  const refusedKeys = _uniq([...(a.refusedKeys||[]), ...(b.refusedKeys||[])]).slice(-400); // v1.64.0 — tombstone des refus
  const _refusedSet = new Set(refusedKeys);
  // v2.16.81 — MIROIR de src/merge.js : `owned` était une union pure, donc le retrait de
  // « J'ai changé d'idée » ne survivait pas. `refundedRewards` sert de tombstone (keyé sur l'achat).
  const _refunded = _uniq([...(a.refundedRewards||[]), ...(b.refundedRewards||[])]).slice(-200);
  const _rewardBuyTs = preferIncoming ? (b.rewardBuyTs || a.rewardBuyTs || {}) : (a.rewardBuyTs || b.rewardBuyTs || {});
  const _disowned = (id) => {
    const stamp = _rewardBuyTs[id];
    if (stamp != null) return _refunded.includes(id + "#" + String(stamp));
    return _refunded.some((k) => typeof k === "string" && k.startsWith(id + "#"));
  };
  // v2.16.79 — MIROIR de src/merge.js. Objets fusionnés CLÉ PAR CLÉ : chaque sous-clé de l'incoming
  // gagnait, même périmée, sans jamais regarder `preferIncoming`. L'union par clé est conservée (un
  // appareil peut connaître une clé que l'autre ignore) ; seul l'ordre du spread s'inverse quand
  // c'est la BASE la plus fraîche. Le côté frais écrase, le côté périmé complète.
  const _byKey = (A, B) => (preferIncoming ? { ...(A||{}), ...(B||{}) } : { ...(B||{}), ...(A||{}) });
  // v2.16.79 — le verrou `configured` est gardé, mais quand les DEUX côtés sont configurés (le cas
  // des 4 enfants de la prod) `b.avatar` gagnait en bloc quelle que soit sa fraîcheur : signalement
  // `bug_xcqtyr7` (« Je clique sur changer les yeux, et ça ne marche pas, ça reste pareil »).
  const _aCfg = !!a.avatar?.configured, _bCfg = !!b.avatar?.configured;
  const avatarConfigured = (_aCfg && _bCfg) ? _byKey(a.avatar, b.avatar)
    : _bCfg ? b.avatar : (_aCfg ? a.avatar : _byKey(a.avatar, b.avatar));
  const removedCalendarIds = _uniq([...(a.removedCalendarIds || []), ...(b.removedCalendarIds || [])]).slice(-400); // v2.16.67 — miroir du client (v2.7.0) : le serveur ne transportait pas du tout ce tombstone
  // v2.16.76 — miroir du correctif client (src/merge.js) : `hiddenRewards` n'a de sens que pour le
  // jour inscrit dans `hiddenWeek`, or la liste était en union sans fin et le jour en « l'incoming
  // gagne toujours ». Ici (`mergeFamily(existing, data)`, l'état stocké toujours en `a`) le jour
  // frais gagnait pendant que la liste gardait toute l'histoire : de vieilles récompenses rangées
  // des semaines plus tôt disparaissaient de la boutique du jour au premier « ranger » de l'enfant.
  // Seau daté, même règle que `dailyClaimed` plus bas.
  const _hidden = (() => {
    const A = { day: a.hiddenWeek || "", ids: a.hiddenRewards || [] };
    const B = { day: b.hiddenWeek || "", ids: b.hiddenRewards || [] };
    if (A.day && A.day === B.day) return { day: A.day, ids: _uniq([...A.ids, ...B.ids]) };
    return ((B.day || "") >= (A.day || "")) ? (B.day ? B : A) : (A.day ? A : B);
  })();
  return {
    ...a, ...b,
    xp: Math.max(a.xp||0, b.xp||0),
    coins: preferIncoming ? (b.coins ?? a.coins ?? 0) : (a.coins ?? b.coins ?? 0),
    coinsLifetime: Math.max(a.coinsLifetime || 0, b.coinsLifetime || 0), // v2.5.26 — miroir du merge client (jamais décrémenté)
    // v2.5.26 — miroir du fix client v2.5.3 : sans ça, le spread ...b laissait n'importe quel client
    // (même un vieux, pas à jour) écraser coinsWeek côté serveur. On garde la semaine la plus récente.
    // v2.16.89 — port du correctif client. `aw >= bw` rendait l'objet ENTIER du côté `a` à semaine ÉGALE, c'est-à-dire 7 jours
    // sur 7 : la seule chose qu'un `>=` sur la clé d'arbitrage ne sait PAS départager, c'est l'égalité,
    // et c'est justement le cas qui dure toute la semaine. `a`, ce n'est pas « le plus ancien » ni
    // « le plus frais », c'est la copie que l'appelant a mise en premier — le client son local, le
    // serveur son stocké — donc à semaine égale chaque côté gardait la SIENNE. Aucune divergence
    // vivante aujourd'hui (`migrateGameState` réécrit `coinsWeek` en `{week}` seul, sans `coins`,
    // depuis la v2.16.45), mais la règle ne sait pas arbitrer une seconde sous-clé et rien ne le
    // disait. Égalité tranchée par la fraîcheur, comme `hiddenWeek` (v2.16.76) et `weeklyQuests`
    // (v2.16.78) ; semaines différentes : la plus récente gagne, inchangé.
    coinsWeek: (()=>{ const aw=(a.coinsWeek?.week||""); const bw=(b.coinsWeek?.week||"");
      if (aw === bw) return (preferIncoming ? (b.coinsWeek||a.coinsWeek) : (a.coinsWeek||b.coinsWeek)) || {week:aw};
      return aw>bw ? (a.coinsWeek||{week:aw}) : (b.coinsWeek||{week:bw}); })(),
    resetAt: _resetAt || undefined, // v2.16.81 — l'époque de reset se propage (max)
    completed,
    deCompleted, // v2.16.82 — tombstone daté de « ↩️ Annuler »
    completedAt: _completedAt,
    xpLog: mergeXpLog(a.xpLog, b.xpLog, _completedAt), // v2.16.65 — miroir du merge client : union par `id`, multiplicité MAX (jamais la somme) pour l'hérité, + réparation des journaux déjà gonflés
    pending: _uniq([...(a.pending||[]), ...(b.pending||[])]).filter(k => !completed.includes(k) && !_refusedSet.has(k)), // v1.64.0 — exclut les refusées
    refusedKeys,
    refusals: preferIncoming ? (b.refusals || a.refusals || []) : (a.refusals || b.refusals || []),
    owned: _uniq([...(a.owned||[]), ...(b.owned||[])]).filter((id) => !_disowned(id)), // v2.16.81 — voir `_disowned`
    boughtRewards: preferIncoming ? (b.boughtRewards || a.boughtRewards || []) : (a.boughtRewards || b.boughtRewards || []), // v1.63.0 — dernière-écriture-gagne (avec coins)
    rewardBuyTs: _rewardBuyTs, // v2.16.62 — voyage avec boughtRewards (même règle) : une résurrection ramène l'ancienne estampille, déjà tombstonée ; hoisté en v2.16.81
    refundedRewards: _refunded, // v1.69.0 — tombstone « déjà remboursé » (union) → fin des pièces infinies ; keyé sur l'achat depuis v2.16.62 ; hoisté en v2.16.81
    badges: _uniq([...(a.badges||[]), ...(b.badges||[])]),
    equipped: _byKey(a.equipped, b.equipped), // v2.16.79 — voir `_byKey` ci-dessus ; signalement `bug_56gb01a` (« il me mais tougour un casque de chevalier »)
    calendar: _mergeCalendar(a.calendar, b.calendar, removedCalendarIds, preferIncoming),
    removedCalendarIds,
    avatar: avatarConfigured,
    // v2.16.72 — MIROIR de src/merge.js : « Ma maison » n'avait de règle dans aucune des deux copies.
    // Dernière-écriture-gagne sur l'objet entier (jamais d'union par slot : retirer un meuble, c'est
    // enlever sa clé de `placed`, une union le ferait revenir).
    house: preferIncoming ? (b.house ?? a.house ?? null) : (a.house ?? b.house ?? null),
    pin: preferIncoming ? (b.pin ?? a.pin ?? null) : (a.pin ?? b.pin ?? null),
    // v2.16.76 — miroir du client : `mode` et `activeRoutineId` disaient « l'incoming gagne
    // TOUJOURS » sans regarder la fraîcheur, donc n'importe quelle tablette en retard imposait au
    // nuage son vieux mode et son vieux rituel. Même règle que `pin`/`house`/`coins`.
    mode: preferIncoming ? (b.mode ?? a.mode ?? null) : (a.mode ?? b.mode ?? null),
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
    activeRoutineId: preferIncoming ? (b.activeRoutineId ?? a.activeRoutineId ?? null) : (a.activeRoutineId ?? b.activeRoutineId ?? null), // v2.16.76 — voir `mode` ci-dessus
    hiddenRewards: _hidden.ids,       // v2.16.76 — seau daté, voir `_hidden` plus haut
    hiddenWeek: _hidden.day || null,  // v2.16.76 — indissociable de `hiddenRewards` ci-dessus
    dailyClaimed: (() => { const A=a.dailyClaimed||{}, B=b.dailyClaimed||{}; if (A.day && A.day===B.day) return { day:A.day, ids:_uniq([...(A.ids||[]),...(B.ids||[])]) }; return ((B.day||"")>=(A.day||"")) ? (B.day?B:A) : (A.day?A:B); })(),
    // v2.12.2 — miroir du fix client (bug "notification félicitation qui revient sans cesse") :
    // dernière-écriture-gagne laissait une soeur/frère au savedAt plus récent ressusciter en bloc
    // une file jamais vidée. Union + tombstone consumedCelebrationIds, même patron que refundedRewards.
    consumedCelebrationIds: _uniq([...(a.consumedCelebrationIds||[]), ...(b.consumedCelebrationIds||[])]).slice(-300),
    pendingCelebrations: (() => { const consumed = new Set([...(a.consumedCelebrationIds||[]), ...(b.consumedCelebrationIds||[])]); const seen = new Set(); const out = []; for (const c of [...(a.pendingCelebrations||[]), ...(b.pendingCelebrations||[])]) { if (!c || !c.id || consumed.has(c.id) || seen.has(c.id)) continue; seen.add(c.id); out.push(c); } return out; })(),
    petXp: mergePetXp(a.petXp, b.petXp),
    petDay: (() => { const A=a.petDay||{}, B=b.petDay||{}; if (A.day && A.day===B.day) return { day:A.day, xp:Math.max(A.xp||0,B.xp||0) }; return ((B.day||"")>=(A.day||"")) ? (B.day?B:A) : (A.day?A:B); })(),
    // v2.16.88 — voir src/merge.js : `_byKey` aux DEUX niveaux (le côté frais gagne sur un palier en
    // collision, un palier connu d'un seul côté survit). L'ancienne règle gardait toujours `a`.
    petEvo: (() => { const A=a.petEvo||{}, B=b.petEvo||{}, out={};
      for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) out[k]=_byKey(A[k], B[k]);
      return out; })(),
    // v2.15.7 — port du correctif client (App.jsx, mergeGS) : ce bloc utilisait `preferIncoming`
    // (basé sur le savedAt GLOBAL de tout le blob famille), plus grossier que la comparaison par
    // energyTs déjà faite côté client — un vrai désaccord entre les deux moitiés de la fusion.
    // Même fix : sous ~5 min d'écart entre les deux energyTs (fenêtre de course plausible entre
    // deux appareils), prendre le minimum d'énergie (jamais de remboursement accidentel) et son
    // energyTs assorti ; au-delà, comparer directement par energyTs (pas par preferIncoming).
    energy: (() => { const aT=a.energyTs?new Date(a.energyTs).getTime():0, bT=b.energyTs?new Date(b.energyTs).getTime():0;
      if (Math.abs(aT-bT) <= 5*60*1000) return Math.min(a.energy??100, b.energy??100);
      return bT>=aT ? (b.energy??a.energy??100) : (a.energy??b.energy??100); })(),
    // v2.16.90 — dans la fenêtre de 5 min, `a.energy <= b.energy ? a.energyTs : b.energyTs` ne sait
    // pas départager l'ÉGALITÉ des deux énergies : il rend alors le timestamp du côté que l'APPELANT a
    // mis en PREMIER (le client son local, le serveur son stocké), donc chaque copie garde le sien et
    // la divergence ne se referme jamais toute seule — le défaut de `hiddenWeek` (v2.16.76), `petEvo`
    // (v2.16.88), `coinsWeek` et `_mergeCalendar` (v2.16.89), mot pour mot. Et l'égalité n'est pas un
    // cas de laboratoire : deux copies d'un même enfant s'assoient très souvent sur la même valeur
    // (pleine à 100, ou fraîchement synchronisée) avec chacune son horodatage. À énergie ÉGALE, c'est
    // donc le timestamp le plus RÉCENT qui gagne : `currentEnergy` compte la régénération DEPUIS lui,
    // donc le plus récent en crédite le MOINS — il reste du côté « jamais généreux » que toute cette
    // règle défend, et il ne dépend d'aucun ordre d'arguments.
    energyTs: (() => { const aT=a.energyTs?new Date(a.energyTs).getTime():0; const bT=b.energyTs?new Date(b.energyTs).getTime():0;
      if (Math.abs(aT-bT) <= 5*60*1000) {
        const eA=a.energy??100, eB=b.energy??100;
        if (eA !== eB) return eA < eB ? (a.energyTs??b.energyTs??null) : (b.energyTs??a.energyTs??null);
        if (!a.energyTs || !b.energyTs) return a.energyTs ?? b.energyTs ?? null;
        if (aT !== bT) return aT > bT ? a.energyTs : b.energyTs;
        return a.energyTs >= b.energyTs ? a.energyTs : b.energyTs; } // même instant, deux écritures : converger quand même
      return bT>=aT ? (b.energyTs??a.energyTs??null) : (a.energyTs??b.energyTs??null); })(),
    lastFedDay: [a.lastFedDay, b.lastFedDay].filter(Boolean).sort().pop() || null,
    // v2.16.72 — MIROIR de src/merge.js : le jour ne recule jamais (sinon le toast « Nouvelle
    // journée! » se rejoue sur une journée déjà ouverte).
    lastSeenDay: [a.lastSeenDay, b.lastSeenDay].filter(Boolean).sort().pop() || null,
    activeDays: _uniq([...(a.activeDays||[]), ...(b.activeDays||[])]),
    // v2.16.34 — miroir du merge client (App.jsx, mergeGS) : ratchet par rang, jamais de recul.
    leagueTier: (() => { const RANK={bronze:0,argent:1,or:2,diamant:3}; const ra=RANK[a.leagueTier]||0, rb=RANK[b.leagueTier]||0; return rb>=ra ? (b.leagueTier||"bronze") : (a.leagueTier||"bronze"); })(),
    bossBattle: mergeBossBattle(a.bossBattle, b.bossBattle),
    settings: _byKey(a.settings, b.settings), // v2.16.79 — réglages d'accessibilité : une tablette en retard les rallumait un par un
    // v2.16.74 — miroir du merge client (src/merge.js) : compteur à vie par étiquette de tâche,
    // MAX clé par clé, famille `coinsLifetime`/`leagueTier`.
    catCounts: (()=>{ const A=a.catCounts||{}, B=b.catCounts||{}, out={...A}; Object.entries(B).forEach(([k,v])=>{ out[k]=Math.max(out[k]||0, v||0); }); return out; })(),
    // v2.16.71 — les 4 règles suivantes existaient côté client depuis longtemps et n'ont JAMAIS
    // été portées ici : elles tombaient donc dans le `{...a, ...b}` du haut, où l'incoming écrase
    // l'existant en entier. Mesuré par `scripts/check-merge-parity.mjs` (nouveau, lancé au build).
    // « rituel déjà fêté aujourd'hui » (v1.68.0) : sans l'union par jour, la fête d'un rituel
    // revient une 2e fois. Même famille que le bug v2.12.2 (« félicitation qui revient sans cesse »).
    ritualCelebrated: (() => { const A=a.ritualCelebrated||{}, B=b.ritualCelebrated||{}; if (A.day && A.day===B.day) return { day:A.day, ids:_uniq([...(A.ids||[]),...(B.ids||[])]) }; return ((B.day||"")>=(A.day||"")) ? (B.day?B:A) : (A.day?A:B); })(),
    // Surnoms de familiers (v2.4.2) : union par petId, sinon le surnom donné sur une tablette
    // disparaît dès qu'un autre appareil pousse un objet qui ne le contient pas.
    petNickname: _byKey(a.petNickname, b.petNickname), // v2.16.79 — renommer un familier DÉJÀ nommé est une collision sur la même sous-clé
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
// v2.16.77 : `name`/`color` en dernière-écriture-gagne (ils étaient restés en base-gagne-toujours,
// donc un renommage ne survivait jamais au merge serveur) ; `morningLock`/`dailyMinutesLimit`
// (contrôles parentaux) avaient AUCUNE règle et retombaient sur le spread `{...a,...b}`, donc
// « l'incoming gagne toujours », même périmé. Arbitrage par PRÉSENCE de la clé : `null` (= aucune
// limite) est une valeur choisie par le parent. Miroir exact de `src/merge.js`.
const _mergePlayer = (a, b, preferIncoming = false) => {
  const w = preferIncoming ? b : a, o = preferIncoming ? a : b;
  const frais = (k) => (k in w ? w[k] : o[k]);
  // v2.16.87 — périmé d'abord, frais ensuite (voir le commentaire de src/merge.js) : un champ que
  // ce littéral ne nomme pas prenait TOUJOURS l'incoming, quelle que soit la fraîcheur.
  return { ...o, ...w, name:w.name||o.name, color:w.color||o.color,
    morningLock: frais("morningLock"), dailyMinutesLimit: frais("dailyMinutesLimit"),
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
  // v2.16.80 — miroir du merge client : le « tombstone naturel » (`_rmSet`) ne couvre que
  // l'APPROBATION d'une demande de retrait ; un REFUS ne touche pas à l'assignation, donc la demande
  // refusée revenait par l'union à chaque synchro. Tombstone explicite, écrit par les deux branches.
  const removedRemovalRequests = _uniq([...(bC.removedRemovalRequests||[]), ...(iC.removedRemovalRequests||[])]).slice(-400);
  const _rmReq = new Set(removedRemovalRequests);
  const reqMap = new Map();
  [...(bC.removalRequests||[]), ...(iC.removalRequests||[])].forEach(r => { if (r && r.id && !_rmSet.has(r.instanceId) && !_rmReq.has(r.id)) reqMap.set(r.id, r); });
  const removedProposals = _uniq([...(bC.removedProposals||[]), ...(iC.removedProposals||[])]).slice(-800);
  const _rmProp = new Set(removedProposals);
  // v2.16.80 — miroir du merge client : tombstones des deux listes du portail parent qui n'en avaient
  // aucun (`announcements` : supprimer une annonce ne partait jamais ; `momentRequests` : une demande
  // annulée par remboursement revenait, le « fantôme » que le commentaire v2.6.4 dit vouloir éviter).
  const removedAnnouncements = _uniq([...(bC.removedAnnouncements||[]), ...(iC.removedAnnouncements||[])]).slice(-200);
  const _rmAnn = new Set(removedAnnouncements);
  const removedMomentRequests = _uniq([...(bC.removedMomentRequests||[]), ...(iC.removedMomentRequests||[])]).slice(-200);
  const _rmMom = new Set(removedMomentRequests);
  const propMap = new Map();
  [...(bC.childTaskProposals||[]), ...(iC.childTaskProposals||[])].forEach(p => { if (p && p.id && !_rmProp.has(p.id)) propMap.set(p.id, p); });
  // v2.16.35 — miroir du merge client : invitations "en équipe" enfant→enfant, union-by-id + statut COLLANT
  const teamInvites = (() => { const m=new Map(); for (const inv of [...(bC.teamInvites||[]), ...(iC.teamInvites||[])]) { if (!inv||inv.id==null) continue; const prev=m.get(inv.id); if (!prev) m.set(inv.id,{ ...inv }); else if (prev.status==="pending"&&inv.status&&inv.status!=="pending") m.set(inv.id,{ ...inv }); } const cut=Date.now()-2*864e5; return [...m.values()].filter(inv=>inv.status==="pending"||(inv.createdAt||0)>cut).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,40); })();
  const config = {
    ...bC, ...iC, players, assignments:[...assignMap.values()], removedAssignments, customTasks:[...taskMap.values()], removedCustomTasks, teamInvites,
    removalRequests:[...reqMap.values()], removedRemovalRequests, childTaskProposals:[...propMap.values()], removedProposals,
    // v2.16.71 — miroir du merge client (v2.6.0) : les annonces du parent n'avaient pas de règle ici.
    // Union par id, 20 plus récentes, comme le client.
    // v2.16.80 — plus le tombstone `removedAnnouncements` : sans lui, l'union RESSUSCITAIT toute
    // annonce supprimée par le parent (et le serveur, qui met toujours sa copie en base, le faisait
    // systématiquement — la suppression ne pouvait pas marcher).
    removedAnnouncements,
    announcements: (() => { const m=new Map(); for (const a of [...(bC.announcements||[]), ...(iC.announcements||[])]) { if (a && a.id != null && !_rmAnn.has(a.id) && !m.has(a.id)) m.set(a.id, a); } return [...m.values()].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,20); })(),
    // v2.16.56 — miroir du merge client : récompenses cochées par le parent = DERNIÈRE ÉCRITURE GAGNE.
    // En union, aucun décochage ne survivait à une synchro. Une liste vide ne peut pas écraser une
    // liste réelle.
    // v2.16.81 — MIROIR : `&& n.length` retiré (revert silencieux quand le parent décoche la
    // dernière récompense). Voir la note complète dans src/merge.js.
    selectedRewards:(() => { const n=newerC.selectedRewards, o=(preferIncoming?bC:iC).selectedRewards; if (Array.isArray(n)) return _uniq(n); if (Array.isArray(o)) return _uniq(o); return []; })(),
    // v2.16.84 — miroir du merge client : le ❤️ est un TOGGLE, l'union ne savait pas exprimer le
    // retrait du coeur (204/204 ressuscités sur la prod du 18 août). Tombstone DATÉ `unlikes`, qui
    // ne bat le coeur que s'il est plus récent que `likeTs` (ré-aimer doit refonctionner).
    feed: (() => { const m=new Map(); const maxPar=(A,B)=>{ const o={...(A||{})}; for (const [k,v] of Object.entries(B||{})) if ((Number(v)||0)>(Number(o[k])||0)) o[k]=v; return o; }; for (const f of [...(bC.feed||[]), ...(iC.feed||[])]) { if (!f||f.id==null) continue; const prev=m.get(f.id); if (prev) { prev.likes=_uniq([...(prev.likes||[]),...(f.likes||[])]); prev.likeTs=maxPar(prev.likeTs,f.likeTs); prev.unlikes=maxPar(prev.unlikes,f.unlikes); } else m.set(f.id,{ ...f, likes:[...(f.likes||[])], likeTs:{...(f.likeTs||{})}, unlikes:{...(f.unlikes||{})} }); } return [...m.values()].map(f=>{ const e={ ...f, likes:f.likes.filter(q=>(Number(f.unlikes[q])||0)<=(Number(f.likeTs[q])||0)) }; if(!Object.keys(e.likeTs).length) delete e.likeTs; if(!Object.keys(e.unlikes).length) delete e.unlikes; return e; }).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,60); })(),
    // v2.6.0 — miroir du merge client : quêtes de réparation 🕊️, union-by-id exactly-once
    repairEvents: (() => { const m=new Map(); for (const e of [...(bC.repairEvents||[]), ...(iC.repairEvents||[])]) { if (e && e.id != null && !m.has(e.id)) m.set(e.id, e); } return [...m.values()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,100); })(),
    // v2.6.2 — miroir du merge client : récompenses "moment" à planifier, union-by-id + statut MONOTONE
    // v2.16.80 — miroir du merge client : (A) à statut ÉGAL la règle gardait la PREMIÈRE copie vue,
    // donc la BASE, donc la copie du serveur : re-planifier la date d'un moment déjà « planifie » ne
    // pouvait jamais être acceptée par le nuage (même défaut que `routines` avant la v2.16.70).
    // (B) tombstone `removedMomentRequests` pour la demande annulée par remboursement.
    removedMomentRequests,
    momentRequests: (() => { const rank={attente:0,planifie:1,fait:2}; const m=new Map(); for (const r of [...(bC.momentRequests||[]), ...(iC.momentRequests||[])]) { if (!r||r.id==null||_rmMom.has(r.id)) continue; const prev=m.get(r.id); if (!prev || (rank[r.status]||0) > (rank[prev.status]||0)) m.set(r.id,r); else if ((rank[r.status]||0)===(rank[prev.status]||0)) { if (r.plannedDate && !prev.plannedDate) m.set(r.id,r); else if (!(prev.plannedDate && !r.plannedDate) && preferIncoming) m.set(r.id,r); } } return [...m.values()].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,60); })(),
    coinOffers: (() => { const m=new Map(); for (const o of [...(bC.coinOffers||[]), ...(iC.coinOffers||[])]) { if (!o||o.id==null) continue; const prev=m.get(o.id); if (!prev) m.set(o.id,{ ...o }); else if (prev.status==="pending"&&o.status&&o.status!=="pending") m.set(o.id,{ ...o }); } const cut=Date.now()-2*864e5; return [...m.values()].filter(o=>o.status==="pending"||(o.ts||0)>cut).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,40); })(),
    bugs: (() => { const m=new Map(); for (const x of [...(bC.bugs||[]), ...(iC.bugs||[])]) { if (x&&x.id!=null&&!m.has(x.id)) m.set(x.id,x); } return [...m.values()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,60); })(),
    // v2.16.42 — miroir du merge client (merge.js, v1.90.0) qui MANQUAIT ici : les logs
    // techniques tombaient dans le `{...bC, ...iC}` ci-dessus, donc un appareil poussant
    // une config sans erreurs écrasait purement et simplement celles d'un autre appareil.
    // Même union-by-id que `bugs`, même plafond que le client (80).
    errorLogs: (() => { const m=new Map(); for (const x of [...(bC.errorLogs||[]), ...(iC.errorLogs||[])]) { if (x&&x.id!=null&&!m.has(x.id)) m.set(x.id,x); } return [...m.values()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,80); })(),
    boss: (() => { const a=bC.boss, b=iC.boss; if (!a) return b||null; if (!b) return a;
      // v2.16.89 — `{...a, ...b}` : les sous-clés que ce littéral ne NOMME pas (`id`, `name`, `emoji`,
      // `hpMax`, `image`, `difficulty`) prenaient toujours l'incoming, sans regarder `preferIncoming` —
      // exactement le défaut de `_byKey` avant la v2.16.79 et celui de `challenges[].playerName` en
      // v2.16.87. Rien ne diverge aujourd'hui : `handleLaunchBoss` (App.jsx ~3087) écrit ces six
      // descripteurs dans le MÊME littéral que `startedAt`, donc à `startedAt` égal ils sont égaux
      // par construction. Mais c'était une promesse que rien ne mesurait, et la seule chose qui la
      // tient est une habitude d'écriture. Ordre du spread piloté par la fraîcheur, comme partout ailleurs.
      if (a.startedAt === b.startedAt) {
        const lastHitTs = [a.lastHitTs, b.lastHitTs].filter(Boolean).sort().pop() || a.lastHitTs;
        const perime = preferIncoming ? a : b, frais = preferIncoming ? b : a;
        return { ...perime, ...frais, defeatedAt: a.defeatedAt || b.defeatedAt, lastHitTs };
      }
      return (new Date(b.startedAt||0) >= new Date(a.startedAt||0)) ? b : a; })(),
    pin: newerC.pin || bC.pin || iC.pin || "1146",
    mode: newerC.mode || bC.mode || iC.mode || "routine",
    routineEnd: newerC.routineEnd || bC.routineEnd || iC.routineEnd,
    // v2.16.73 — miroir du merge client : `theme` (thème de la famille) et `customRewards`
    // (récompenses maison du parent) n'avaient de règle NULLE PART. Sans règle, l'incoming gagne
    // toujours, même plus vieux — un appareil en retard rebasculait le thème de toute la famille
    // et effaçait les récompenses maison. `customRewards` = dernière écriture gagne (jamais une
    // union : le parent doit pouvoir en supprimer une), et `[]` du côté frais tient, alors qu'un
    // `undefined` n'efface rien.
    theme: newerC.theme || bC.theme || iC.theme || "minecraft",
    customRewards: (() => { const n=newerC.customRewards, o=(preferIncoming?bC:iC).customRewards; if (Array.isArray(n)) return n; if (Array.isArray(o)) return o; return []; })(),
    // Lot 7 — last-write-wins par weekKey (plus récent gagne)
    // v2.16.78 — remis à l'identique du client (src/merge.js) : (A) à clé de semaine ÉGALE,
    // dernière-écriture-gagne au lieu de « la base gagne toujours » — c'est ICI que le défaut
    // mordait le plus fort, `mergeFamily(existing, data)` mettant toujours l'état stocké en `a` ;
    // (B) tombstone `removedAssignments` appliqué DANS `weeklyQuests.assignments`. Voir le commentaire
    // long côté client pour la preuve et la portée (le retrait vaut pour la semaine en cours).
    weeklyQuests: (() => { const a=bC.weeklyQuests, b=iC.weeklyQuests;
      let wq;
      if (!a) wq = b||null;
      else if (!b) wq = a;
      else {
        const aValid=isValidCustodyWeekKey(a.generatedForWeek), bValid=isValidCustodyWeekKey(b.generatedForWeek);
        if (aValid !== bValid) wq = aValid ? a : b;
        else { const aw=a.generatedForWeek||"", bw=b.generatedForWeek||""; wq = (aw===bw) ? (preferIncoming?b:a) : (aw>bw ? a : b); }
      }
      if (!wq) return null;
      return { ...wq, assignments: (wq.assignments||[]).filter(x => x && !_rmSet.has(x.instanceId)) }; })(),
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
      // v2.16.91 — voir le commentaire de src/merge.js : les deux copies branchent maintenant sur
      // l'égalité de `weekKey`, comme les neuf autres seaux datés de la fusion.
      if ((bWC.weekKey||"") !== (iWC.weekKey||""))
        return (iWC.weekKey||"") >= (bWC.weekKey||"") ? iWC : bWC;
      const weekKey = (iWC.weekKey||"") >= (bWC.weekKey||"") ? (iWC.weekKey||bWC.weekKey) : bWC.weekKey;
      const cm = new Map();
      (bWC.challenges||[]).forEach(c => { if (c && c.playerId != null) cm.set(c.playerId, {...c}); });
      (iWC.challenges||[]).forEach(c => {
        if (!c || c.playerId == null) return;
        const ex = cm.get(c.playerId);
        if (!ex) { cm.set(c.playerId, {...c}); return; }
        // v2.16.87 — périmé d'abord, frais ensuite (voir le commentaire de src/merge.js).
        const perime = preferIncoming ? ex : c, recent = preferIncoming ? c : ex;
        cm.set(c.playerId, { ...perime, ...recent,
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
