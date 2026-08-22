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

// v2.16.95 — 19e étage : un tri BORNÉ doit être TOTAL. Les huit listes triées puis coupées
// (`feed`, `bugs`, `errorLogs`, `announcements`, `repairEvents`, `momentRequests`, `coinOffers`,
// `teamInvites`) trient sur une DATE, puis gardent les N premières. À date ÉGALE, `Array.sort`
// est stable : l'ordre rendu est celui de la concaténation, donc celui des ARGUMENTS — et le
// client met son local en `a` là où le serveur met son stocké. Quand le plafond mord, les deux
// copies gardent alors des sous-ensembles DIFFÉRENTS, pour toujours et sans un seul message.
// Les ex aequo ne sont pas un cas d'école : `announcements` trie sur `createdAt` à la JOURNÉE
// (9 annonces en prod, 5 dates distinctes), et `momentRequests` fait pareil. Départager sur
// `id` ne change pas la règle de rétention (« les N plus récentes ») : il la rend totale.
// Chaque élément vient d'une `Map` clavée par `id`, donc `id` est présent et unique.
const _departageId = (a, b) => String((a && a.id) ?? "").localeCompare(String((b && b.id) ?? ""));
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
// v2.16.89 — `updatedAt` ÉGAL (le cas de TOUS les événements de la prod : 61 sur 61 n'en portent
// aucun, donc `0 >= 0` des deux côtés) : `>=` sur un parcours `[...a, ...b]` donnait la version
// arrivée en DERNIER, c'est-à-dire `b` — le second argument de l'appelant, jamais le plus frais.
// Or chaque appelant met SA copie en premier (le client son local, le serveur son stocké), donc
// « le second gagne » désigne deux versions opposées selon le côté : le client afficherait celle
// du nuage pendant que le nuage garderait celle du client. Même défaut, mot pour mot, que
// `petEvo` en v2.16.88 et `hiddenWeek` en v2.16.76. On parcourt maintenant le côté FRAIS d'abord
// et on tranche l'égalité en sa faveur (`>` au lieu de `>=`) : un `updatedAt` strictement plus
// grand continue de gagner d'où qu'il vienne, et à égalité c'est la fraîcheur de la famille qui
// départage, dans les deux copies et dans les deux sens.
export const _mergeCalendar = (a, b, removedIds, preferIncoming) => {
  const rm = removedIds ? new Set(removedIds) : null;
  const byId = new Map(); const noId = []; const seenRaw = new Set();
  const frais = preferIncoming ? (b || []) : (a || []), perime = preferIncoming ? (a || []) : (b || []);
  for (const e of [...frais, ...perime]) {
    if (!e) continue;
    if (e.id == null) { const k = JSON.stringify(e); if (!seenRaw.has(k)) { seenRaw.add(k); noId.push(e); } continue; }
    if (rm && rm.has(e.id)) continue; // suppression (tombstone) gagne sur une version pas encore synchronisée
    const prev = byId.get(e.id);
    if (!prev || (e.updatedAt || 0) > (prev.updatedAt || 0)) byId.set(e.id, e);
  }
  return [...byId.values(), ...noId];
};
// Fusion d'un état de joueur — non régressive (max XP/pièces, union des listes)
export const mergeGS = (a, b, preferIncoming) => {
  a = a || {}; b = b || {};
  // v2.16.81 — ÉPOQUE DE RESET. « Reset complet » (portail parent, `handleResetPlayer`) promet
  // « XP, pièces et tâches seront à 0 » et remet effectivement tout l'état du joueur à vide en
  // local. Mais la fusion, elle, ne savait pas ce qu'est un reset : `xp`/`coinsLifetime` en max(),
  // `completed`/`owned`/`badges`/`activeDays`/`refusedKeys`… en union — un état VIDE n'exprime donc
  // AUCUN retrait. Mesuré sur la donnée de prod du 17 août (Elli Le Pickle) : sur 13 champs, un
  // seul (`coins`, dernière-écriture-gagne) tombait vraiment à 0 ; 2659 XP, 105 quêtes accomplies,
  // 27 objets, 21 badges et 18 jours actifs revenaient tous du nuage à la synchro suivante. Côté
  // serveur c'était pire : `mergeFamily(existing, data)` met le stocké en `a`, donc le reset ne
  // pouvait même pas atteindre le nuage. Le bouton ne remettait rien à zéro pour de bon.
  // Un reset est une ÉPOQUE, pas un contenu : le côté qui a vu le reset le plus récent gagne
  // ENTIÈREMENT, l'autre ne contribue rien (c'est précisément ce que « complet » veut dire).
  const _resetAt = Math.max(Number(a.resetAt) || 0, Number(b.resetAt) || 0);
  if (_resetAt > 0) {
    const aVieux = (Number(a.resetAt) || 0) < _resetAt;
    const bVieux = (Number(b.resetAt) || 0) < _resetAt;
    if (aVieux && !bVieux) return { ...b, resetAt: _resetAt };
    if (bVieux && !aVieux) return { ...a, resetAt: _resetAt };
  }
  // v2.16.82 — `completedAt` : union par clé où la valeur la plus RÉCENTE gagne, au lieu de
  // « le côté `a` gagne toujours ». L'ordre du spread ne regardait pas `preferIncoming` (c'est le
  // spread naïf de la v2.16.79, resté sur ce champ). Pour une PREMIÈRE complétion la clé n'existe
  // que d'un côté, donc l'ordre ne se voyait jamais ; il ne se voit qu'à la RÉÉCRITURE de la même
  // clé — précisément le cas qu'ouvre le correctif ci-dessous (annuler puis refaire la quête), où
  // le serveur (`mergeFamily(existing, data)`, l'état stocké en `a`) aurait gardé à vie l'ancien
  // horodatage. Le max est monotone : il donne le même résultat dans les deux sens et dans les deux
  // copies, sans avoir besoin de `preferIncoming`. Ensemble de clés inchangé (toujours l'union),
  // donc la borne de plausibilité de `mergeXpLog` (v2.16.65), qui ne COMPTE que les clés par jour,
  // est strictement identique.
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
  // v2.16.82 — `deCompleted` : tombstone daté du bouton « ↩️ Annuler » du portail parent
  // (`handleDeComplete`, App.jsx ~2917 ; visible sur toute carte déjà validée en mode parent).
  // Le handler retire la clé de `completed` et reprend l'XP et les pièces — mais `completed` est une
  // UNION de chaînes, et un état d'où la clé a disparu n'exprime AUCUN retrait : la copie d'en face
  // la ramenait, toujours, dans les deux sens et dans les deux copies (vérifié en rejouant les vrais
  // modules). Le bouton existe depuis le portail parent et n'a donc jamais rien annulé pour de bon :
  // la quête revient cochée à la synchro suivante, l'XP et les pièces restent repris, et chaque
  // nouveau clic les reprend une fois de plus.
  // La quête peut être REFAITE le même jour (même `doneKey` : `instanceId_playerId#jour`), donc un
  // tombstone permanent la condamnerait. Même patron que `refundedRewards`/`rewardBuyTs` (v2.16.81) :
  // le tombstone porte la DATE de l'annulation et ne l'emporte que s'il est plus récent que la
  // complétion inscrite dans `completedAt`. Une re-validation écrit un horodatage neuf → le
  // tombstone ne mord plus. Union par clé en MAX : monotone, donc aucun retrait à exprimer ici.
  const deCompleted = (() => {
    const A = a.deCompleted || {}, B = b.deCompleted || {}, out = { ...A };
    for (const k of Object.keys(B)) out[k] = Math.max(Number(out[k]) || 0, Number(B[k]) || 0);
    const cles = Object.keys(out);
    if (cles.length <= 400) return out;
    // v2.16.96 — 20e étage : un tri BORNÉ doit être TOTAL, ici sur un OBJET. Le tri porte sur la
    // VALEUR (l'horodatage de l'annulation) et garde les 400 plus récentes ; à valeur ÉGALE,
    // `Array.sort` est stable, donc l'ordre rendu est celui de `Object.keys(out)` — soit les clés
    // de `{ ...A }` puis les clés neuves de `B`, donc celui des ARGUMENTS. Or le client met son
    // local en `a` là où le serveur met son stocké : au-delà de 400 clés, les deux copies
    // gardaient des tombstones DIFFÉRENTS, et un `deCompleted` perdu, c'est une quête annulée qui
    // revient cochée. Départager sur la CLÉ ne change pas la règle de rétention, il la rend totale.
    const garde = cles.sort((x, y) => ((out[x] || 0) - (out[y] || 0)) || String(x).localeCompare(String(y))).slice(-400); // borné, comme `refusedKeys`
    const borne = {}; for (const k of garde) borne[k] = out[k];
    return borne;
  })();
  const _annulee = (k) => {
    const t = Number(deCompleted[k]) || 0;
    if (!t) return false;
    const fait = Date.parse(_completedAt[k]); // absent (complétions d'avant la v1.60.0) ou illisible → 0
    return t > (Number.isNaN(fait) ? 0 : fait);
  };
  const completed = _uniq([...(a.completed || []), ...(b.completed || [])]).filter((k) => !_annulee(k));
  const refusedKeys = _uniq([...(a.refusedKeys || []), ...(b.refusedKeys || [])]).slice(-400); // v1.64.0 — tombstone des demandes refusées
  const _refusedSet = new Set(refusedKeys);
  // v2.16.81 — hoistés (le littéral les lisait en place) : `owned` s'appuie dessus, voir plus bas.
  const _refunded = _uniq([...(a.refundedRewards || []), ...(b.refundedRewards || [])]).slice(-200);
  // v2.16.92 — l'estampille voyageait EN BLOC avec `boughtRewards` (dernière-écriture-gagne), alors
  // que les DEUX autres champs que `_disowned` croise avec elle — `owned` et `refundedRewards` —
  // sont des unions increvables. Le côté qui perdait l'arbitrage emportait donc sa marque, et
  // `_disowned` retombait sur sa branche LEGACY (« sans estampille, tout tombstone portant cet id
  // compte ») : la récompense RACHETÉE après un remboursement était re-tombstonée par la marque du
  // vieil achat et retirée d'`owned`, que l'union venait pourtant de préserver. Le garde-fou
  // contournait déjà le défaut, en toutes lettres (« la marque doit être posée du côté FRAIS,
  // sinon la clé `id#estampille` ne se reconstitue pas et le contrôle ment »).
  // Règle : union par id, la PLUS GRANDE estampille gagne. `buyTs` est un `Date.now()` (App.jsx
  // ~2890), donc il n'avance jamais à reculons : le max est toujours l'achat le plus récent, c'est
  // exactement ce que la clé `id#estampille` doit nommer. La crainte de la v2.16.62 (« une
  // résurrection par instantané périmé ramène l'ANCIENNE estampille, déjà tombstonée ») tient
  // toujours : une marque périmée ne peut plus GAGNER, mais elle ne peut pas non plus effacer la
  // neuve, et un id que le côté frais ne connaît pas garde la sienne au lieu de n'en avoir aucune.
  const _rewardBuyTs = (() => {
    const A = a.rewardBuyTs || {}, B = b.rewardBuyTs || {}, out = {};
    for (const id of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const va = A[id], vb = B[id];
      if (va == null) { out[id] = vb; continue; }
      if (vb == null) { out[id] = va; continue; }
      const na = Number(va), nb = Number(vb);
      // Estampilles non numériques (jamais écrites par l'app) : on retombe sur le côté frais.
      if (Number.isNaN(na) || Number.isNaN(nb)) { out[id] = preferIncoming ? vb : va; continue; }
      out[id] = na >= nb ? va : vb;
    }
    return out;
  })();
  // « cet id est-il un achat REMBOURSÉ et pas encore racheté ? » — mêmes deux branches que
  // `handleRefundReward` : avec estampille on exige la clé exacte, sans estampille (états d'avant
  // la v2.16.62) tout tombstone portant cet id compte.
  const _disowned = (id) => {
    const stamp = _rewardBuyTs[id];
    if (stamp != null) return _refunded.includes(id + "#" + String(stamp));
    return _refunded.some((k) => typeof k === "string" && k.startsWith(id + "#"));
  };
  const removedCalendarIds = _uniq([...(a.removedCalendarIds || []), ...(b.removedCalendarIds || [])]).slice(-400); // v2.7.0 — tombstone des événements calendrier supprimés
  // v2.16.79 — objets fusionnés CLÉ PAR CLÉ (`{...a.X, ...b.X}`) : chaque sous-clé présente chez
  // l'incoming gagnait, même périmée, sans jamais regarder `preferIncoming`. C'est le spread naïf
  // de `house` (v2.16.72) et de `mode` (v2.16.76), mais à l'échelle de la sous-clé — donc invisible
  // aux garde-fous, qui ne font jamais entrer les deux côtés en collision sur la MÊME sous-clé.
  // L'union par clé a une vraie raison d'être (un appareil peut connaître une clé que l'autre ignore,
  // ex. un réglage ajouté par une version plus récente) : on la GARDE, on ne fait qu'inverser l'ordre
  // du spread quand c'est la BASE qui est la plus fraîche. Le côté frais écrase, le côté périmé
  // complète. Utilisé pour `equipped`, `settings`, `petNickname` et l'avatar ci-dessous.
  const _byKey = (A, B) => (preferIncoming ? { ...(A || {}), ...(B || {}) } : { ...(B || {}), ...(A || {}) });
  // v2.16.79 — `avatar` : le verrou `configured` (une apparence configurée bat une apparence qui ne
  // l'est pas) est conservé, mais quand les DEUX côtés sont configurés — le cas des 4 enfants de la
  // prod — `b.avatar` gagnait EN BLOC, quelle que soit sa fraîcheur. Dans la boucle de sync du client
  // (`mergeFamily(local, remote)`, App.jsx:2393) le nuage est en `b` : la copie d'avant le push
  // debounced (~1,5 s) rendait donc son ancienne apparence et le changement que l'enfant venait de
  // faire disparaissait dans les 25 s, sans message. C'est le signalement `bug_xcqtyr7` du 27 juillet
  // (« Je clique sur changer les yeux, et ça ne marche pas, ça reste pareil, c'est aussi comme ça
  // pour quand je pèse sur l'option bouches du personnage »), longtemps classé « à voir dans
  // `avatarpopup.jsx` » alors que le composant n'y est pour rien.
  const _aCfg = !!a.avatar?.configured, _bCfg = !!b.avatar?.configured;
  const avatarConfigured = (_aCfg && _bCfg) ? _byKey(a.avatar, b.avatar)
    : _bCfg ? b.avatar : (_aCfg ? a.avatar : _byKey(a.avatar, b.avatar));
  // v2.16.76 — `hiddenRewards` (récompenses « rangées » par l'enfant) n'a de sens QUE pour le jour
  // inscrit dans `hiddenWeek` : la lecture (App.jsx ~415) fait `hiddenWeek===todayStamp() ? ids : []`
  // et l'écriture (handleHideReward, App.jsx ~3707) repart d'une liste VIDE dès que le jour change.
  // Or les deux champs étaient fusionnés séparément et incompatiblement : la liste en union sans fin,
  // le jour en « l'incoming gagne toujours ». Les deux sens de la synchro cassaient, en miroir :
  //   • boucle client, `mergeFamily(local, remote)` toutes les 25 s → `hiddenWeek` revenait à celui du
  //     nuage (périmé), donc la récompense que l'enfant venait de ranger REVENAIT sur son écran ;
  //   • serveur, `mergeFamily(existing, data)` → `hiddenWeek` prenait le jour FRAIS mais la liste
  //     gardait toute l'histoire, donc de vieilles récompenses disparaissaient de la boutique du jour
  //     sans que personne n'y touche.
  // Mesuré sur la prod du 2026-08-16 : 3 enfants sur 4 traînent une réserve périmée que le verrou
  // daté neutralise correctement au repos (Antoine Emery `rw_hydre_5dollars` du 1er juillet, Elli
  // `rw_servi`+`rw_hydre_5dollars` du 25 juillet, Antoine DR `rw_depanneur` du 8 juin) — il suffisait
  // du premier « ranger » d'aujourd'hui pour la ressusciter en bloc.
  // Règle : les deux champs forment UN seau daté, fusionné comme `dailyClaimed`/`ritualCelebrated`
  // juste plus bas — même jour → union des ids ; jours différents → le jour le plus récent emporte SA
  // liste, en entier. Le verrou daté redevient increvable.
  const _hidden = (() => {
    const A = { day: a.hiddenWeek || "", ids: a.hiddenRewards || [] };
    const B = { day: b.hiddenWeek || "", ids: b.hiddenRewards || [] };
    if (A.day && A.day === B.day) return { day: A.day, ids: _uniq([...A.ids, ...B.ids]) };
    return ((B.day || "") >= (A.day || "")) ? (B.day ? B : A) : (A.day ? A : B);
  })();
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
    // v2.16.89 — `aw >= bw` rendait l'objet ENTIER du côté `a` à semaine ÉGALE, c'est-à-dire 7 jours
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
    resetAt: _resetAt || undefined, // v2.16.81 — l'époque de reset se propage (max), voir la tête de mergeGS
    completed,
    deCompleted, // v2.16.82 — tombstone daté de « ↩️ Annuler » (voir plus haut)
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
    // v2.16.81 — `owned` est une union pure depuis toujours, et une union ne sait pas exprimer un
    // retrait. « J'ai changé d'idée » (App.jsx ~3575/3580) retire l'id d'`owned` ET de
    // `boughtRewards` : le second tient (dernière-écriture-gagne), le premier revenait TOUJOURS du
    // nuage. Constaté dans la donnée de prod du 17 août : `rw_depanneur` + `rw_bonbon` chez Elli
    // (remboursés la semaine du 20 juillet) et `rw_depanneur` chez Antoine DR (15 juin) étaient
    // encore dans `owned`, un mois et deux mois plus tard.
    // Pas de nouveau tombstone : `refundedRewards` EST déjà le tombstone du remboursement, keyé sur
    // l'achat (`id#rewardBuyTs[id]`) depuis la v2.16.62. On soustrait donc de l'union les ids dont
    // l'ACHAT COURANT est remboursé — un vrai rachat pose une estampille neuve, la clé ne
    // correspond plus, l'objet reste possédé. `_disowned` reprend mot pour mot les deux branches du
    // handler de remboursement, y compris l'état legacy sans estampille.
    owned: _uniq([...(a.owned || []), ...(b.owned || [])]).filter((id) => !_disowned(id)),
    boughtRewards: preferIncoming ? (b.boughtRewards || a.boughtRewards || []) : (a.boughtRewards || b.boughtRewards || []), // v1.63.0 — dernière-écriture-gagne (voyage avec coins)
    // v2.16.62 — l'estampille d'achat VOYAGE AVEC `boughtRewards` (exactement la même règle) : une
    // résurrection par instantané périmé ramène donc l'ANCIENNE estampille, déjà tombstonée, au lieu
    // de rouvrir un remboursement. Union interdite ici — il faut la valeur du même côté que l'achat.
    rewardBuyTs: _rewardBuyTs,
    refundedRewards: _refunded, // v1.69.0 — tombstone « déjà remboursé » (union increvable → fin des pièces infinies) ; keyé sur l'achat depuis v2.16.62 ; hoisté en v2.16.81 (`owned` s'en sert)
    badges: _uniq([...(a.badges || []), ...(b.badges || [])]),
    // v2.16.79 — voir `_byKey` en tête de `mergeGS`. `equipped` porte ce que l'enfant a sur le dos
    // (chapeau, armure, familier, skin, thème) ; `onEquip` (App.jsx:2907) écrit la sous-clé du slot,
    // et RETIRE en y posant `null` — donc une sous-clé qui existe des deux côtés, tout le temps.
    // Le nuage périmé gagnait sur chaque slot : l'enfant équipe un masque, la synchro lui remet son
    // ancien casque. C'est le signalement `bug_56gb01a` du 28 juillet, mot pour mot (« je veut maitre
    // un nouvaut masque mais il me mais tougour un casque de chevalier »).
    equipped: _byKey(a.equipped, b.equipped),
    calendar: _mergeCalendar(a.calendar, b.calendar, removedCalendarIds, preferIncoming),
    removedCalendarIds,
    avatar: avatarConfigured,
    // v2.16.72 — « Ma maison » (v2.8.0) n'avait de règle dans AUCUNE des deux fusions : `house` tombait
    // dans le `{...a, ...b}` ci-dessus, où l'incoming écrase l'objet ENTIER sans jamais regarder
    // laquelle des deux écritures est la plus fraîche. `migrateGameState` (migrations.js:120) pose
    // toujours le champ, donc la clé est présente des deux côtés : l'incoming gagne TOUJOURS, même
    // quand il est en retard. Deux conséquences, toutes deux mesurées en rejouant la fusion sur la
    // prod du 16 août : (1) boucle de sync du client, `mergeFamily(local, remote)` toutes les 25 s
    // (App.jsx ~2393) — le nuage pas encore à jour dans la fenêtre du push debounced (~1,5 s) rend
    // sa copie d'avant et le meuble que l'enfant vient de poser DISPARAÎT de son écran ; (2) côté
    // serveur, `mergeFamily(existing, data)` (server.cjs) met toujours l'état stocké en `a`, donc
    // n'importe quelle tablette en retard efface du nuage la déco d'une autre. Même famille exacte
    // que `routines` en v2.16.70 et `petNickname` en v2.16.71.
    // Règle : dernière-écriture-gagne sur l'objet ENTIER — comme `coins`/`pin`/`boughtRewards` plus
    // haut. Surtout PAS d'union par slot : retirer un meuble se fait en enlevant sa clé de `placed`,
    // donc une union le ressusciterait (vérifié : l'assertion « un meuble retiré ne revient pas »
    // échoue avec une union comme elle échouait avec le spread naïf).
    house: preferIncoming ? (b.house ?? a.house ?? null) : (a.house ?? b.house ?? null),
    // PIN : dernière écriture gagne (permet de changer le code d'un enfant depuis un autre appareil)
    pin: preferIncoming ? (b.pin ?? a.pin ?? null) : (a.pin ?? b.pin ?? null),
    // v2.16.76 — `mode` (📋 Mes tâches / ⏰ Rituels) et `activeRoutineId` (plus bas) disaient
    // « l'incoming gagne TOUJOURS », sans jamais regarder lequel des deux côtés est le plus frais :
    // exactement le comportement du spread naïf que `house` avait avant la v2.16.72. Dans la boucle
    // de sync du client, `mergeFamily(local, remote)` met le NUAGE en `b` : la copie d'avant le push
    // debounced (~1,5 s) écrasait donc le choix que l'enfant venait de faire, dans les 25 s. C'est le
    // retour par la synchro du symptôme que la v2.16.63 a corrigé côté écran (« le rituel choisi par
    // l'enfant était jeté, retour forcé au matin, en silence »). Même règle que `pin`/`house`/`coins`.
    mode: preferIncoming ? (b.mode ?? a.mode ?? null) : (a.mode ?? b.mode ?? null),
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
    activeRoutineId: preferIncoming ? (b.activeRoutineId ?? a.activeRoutineId ?? null) : (a.activeRoutineId ?? b.activeRoutineId ?? null), // v2.16.76 — voir `mode` ci-dessus
    hiddenRewards: _hidden.ids,       // v2.16.76 — seau daté, voir `_hidden` plus haut
    hiddenWeek: _hidden.day || null,  // v2.16.76 — indissociable de `hiddenRewards` ci-dessus
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
    // v1.57.0 — voies d'évolution choisies par familier, `{petId:{1:element,2:…,3:…}}`.
    // v2.16.88 — l'ancienne règle (`out[k]={...B[k], ...out[k]}`) donnait TOUJOURS la victoire au
    // côté `a`, sans jamais regarder `preferIncoming` : « collant, 1er choix gagne ». Le mot « 1er »
    // était faux — `a`, ce n'est pas le premier choix dans le temps, c'est la copie que l'appelant a
    // mise en premier, et chaque appelant y met la SIENNE. Client : `mergeFamily(local, remote)`
    // (App.jsx ~2393) met le local en `a`. Serveur : `mergeFamily(existing, data)` met le stocké en
    // `a`. Chacun gardait donc son propre élément, pour toujours, et la divergence ne se refermait
    // JAMAIS — rejoué sur les vrais modules : nuage « eau », tablette en retard « feu », la tablette
    // affiche « feu » à vie pendant que le nuage et les autres appareils restent à « eau ». Le trou
    // était atteignable sans rien faire d'anormal : `petPendingTier` (pets.js:188) rouvre le choix
    // sur toute tablette qui n'a pas encore reçu la synchro, et l'enfant repropose en toute bonne foi.
    // Règle : `_byKey` aux DEUX niveaux — sur un palier en collision, le côté FRAIS gagne ; un palier
    // que seul l'autre côté connaît survit (un palier acquis ne se perd jamais). La « collance » est
    // conservée là où elle vit vraiment : l'UI ne repropose jamais un palier déjà choisi (`taken`).
    petEvo: (()=>{ const A=a.petEvo||{}, B=b.petEvo||{}, out={};
      for(const k of new Set([...Object.keys(A), ...Object.keys(B)])) out[k]=_byKey(A[k], B[k]);
      return out; })(),
    petNickname: _byKey(a.petNickname, b.petNickname), // v2.4.2 — surnom par familier (union par petId) ; v2.16.79 — RENOMMER un familier déjà nommé est une collision sur la même sous-clé : le côté frais gagne, voir `_byKey`
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
    energyTs: (()=>{ const aT=a.energyTs?new Date(a.energyTs).getTime():0; const bT=b.energyTs?new Date(b.energyTs).getTime():0;
      if (Math.abs(aT-bT) <= 5*60*1000) {
        const eA=a.energy??100, eB=b.energy??100;
        if (eA !== eB) return eA < eB ? (a.energyTs??b.energyTs??null) : (b.energyTs??a.energyTs??null);
        if (!a.energyTs || !b.energyTs) return a.energyTs ?? b.energyTs ?? null;
        if (aT !== bT) return aT > bT ? a.energyTs : b.energyTs;
        return a.energyTs >= b.energyTs ? a.energyTs : b.energyTs; } // même instant, deux écritures : converger quand même
      return bT>=aT ? (b.energyTs??a.energyTs??null) : (a.energyTs??b.energyTs??null); })(),
    lastFedDay: [a.lastFedDay, b.lastFedDay].filter(Boolean).sort().pop() || null, // jour le plus récent
    // v2.16.72 — même trou que `house` juste au-dessus, conséquence plus petite mais du même
    // mécanisme : `lastSeenDay` retient le dernier jour où l'enfant a ouvert l'app, et c'est LUI
    // qui décide du toast « 🌅 Nouvelle journée! Tes routines sont prêtes. » (App.jsx:361). En
    // spread naïf, une copie en retard le fait RECULER — l'enfant se refait expliquer le reset
    // quotidien sur une journée qu'il a déjà ouverte. Le champ ne fait qu'avancer : jour le plus
    // récent, exactement comme `lastFedDay` ci-dessus.
    lastSeenDay: [a.lastSeenDay, b.lastSeenDay].filter(Boolean).sort().pop() || null,
    activeDays: _uniq([...(a.activeDays||[]), ...(b.activeDays||[])]), // union (série merge-safe)
    // v2.16.34 — Backlog #13 (ligues) : ratchet par rang, même esprit que xp/coinsLifetime — le
    // palier ne doit jamais reculer parce qu'un appareil moins à jour a fusionné en dernier.
    leagueTier: leagueRank(b.leagueTier) >= leagueRank(a.leagueTier) ? (b.leagueTier || "bronze") : (a.leagueTier || "bronze"),
    // Backlog #13 — même jour → max (deux appareils qui comptent la même session ne doivent jamais
    // sous-compter) ; jour différent → le plus récent (nouveau jour = compteur reparti à 0).
    sessionMinutes: (()=>{ const A=a.sessionMinutes||{}, B=b.sessionMinutes||{}; if(A.day&&A.day===B.day) return {day:A.day, minutes:Math.max(A.minutes||0,B.minutes||0)}; return ((B.day||"")>=(A.day||""))?(B.day?B:A):(A.day?A:B); })(),
    bossBattle: mergeBossBattle(a.bossBattle, b.bossBattle), // jetons/dégâts monotones par boss → max

    // v2.16.79 — voir `_byKey` en tête de `mergeGS`. `settings` porte le mode calme, le décompte
    // calme, la police lisible, une tâche à la fois, l'échelle de police, le son et le réglage
    // d'humour (v2.16.x) : précisément les réglages d'accessibilité qu'un enfant coupe pour son
    // confort. Une tablette en retard les rallumait un par un, en silence.
    settings: _byKey(a.settings, b.settings),
    // v2.16.74 — compteur à vie par étiquette de tâche : MAX clé par clé, exactement comme
    // `coinsLifetime`/`leagueTier`. Un spread naïf laisserait une tablette en retard ramener le
    // compte de « ménage » à sa valeur d'avant, ce qui est précisément le recul que ce compteur
    // existe pour empêcher.
    catCounts: (()=>{ const A=a.catCounts||{}, B=b.catCounts||{}, out={...A}; Object.entries(B).forEach(([k,v])=>{ out[k]=Math.max(out[k]||0, v||0); }); return out; })(),
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
// v2.16.77 : `name` et `color` étaient restés en BASE-GAGNE-TOUJOURS (`a.X || b.X`) alors que le
// reste passait en dernière-écriture-gagne — exactement le bug que la v1.66.0 décrit pour `pseudo`,
// laissé sur deux champs. Côté serveur, `mergeFamily(existant, PUT)` met TOUJOURS la copie du
// serveur en `a` : renommer un enfant ou changer sa couleur ne survivait donc jamais au premier
// aller-retour. `morningLock` et `dailyMinutesLimit` (contrôles parentaux, `gating.js`) n'avaient
// eux AUCUNE règle : ils retombaient sur le spread `{...a, ...b}`, donc « l'incoming gagne
// toujours », donc une tablette en retard rouvrait la boutique et rendait le budget-temps périmé.
// `dailyMinutesLimit` s'arbitre par PRÉSENCE de la clé, pas par véracité : `null` (= aucune limite)
// est une valeur choisie par le parent, qu'un `||` ou un `??` écraserait par l'ancienne limite.
export const _mergePlayer = (a, b, preferIncoming = false) => {
  const w = preferIncoming ? b : a, o = preferIncoming ? a : b; // w = écriture la plus récente
  const frais = (k) => (k in w ? w[k] : o[k]);
  return {
    // v2.16.87 — l'ordre des deux spreads était `{...a, ...b}` : un champ que ce littéral ne nomme
    // PAS prenait toujours `b`, l'incoming, sans le moindre égard pour la fraîcheur. Les sept
    // champs que la prod porte sont tous nommés plus bas, donc rien de visible ne cassait — mais
    // c'était vrai par accident, et le 11e étage du garde-fou de fusion le mesure maintenant :
    // huitième champ ajouté un jour = tablette en retard qui écrase la valeur fraîche, en silence.
    // Périmé d'abord, frais ensuite : ce que la règle ne nomme pas suit quand même son élément.
    ...o, ...w,
    name: w.name || o.name,
    color: w.color || o.color,
    morningLock: frais("morningLock"),
    dailyMinutesLimit: frais("dailyMinutesLimit"),
    pseudo: w.pseudo || o.pseudo,
    themeId: (w.themeId && w.themeId !== "none") ? w.themeId
           : (o.themeId && o.themeId !== "none") ? o.themeId
           : (w.themeId || o.themeId || "none"),
    themeChosenAt: w.themeChosenAt || o.themeChosenAt,
    // v2.16.95 — 19e étage : cette union était la seule du projet à être lue par son RANG
    // (`loginscreen.jsx` ~130 et ~50 : `starterThemes[0]` est le thème PRÉSÉLECTIONNÉ au premier
    // login de l'enfant), et elle concaténait `a` puis `b` — donc le côté que l'APPELANT met en
    // premier. Le client met son local en `a`, le serveur son stocké : deux tablettes pouvaient
    // présélectionner un thème DIFFÉRENT pour le même enfant. Même forme que la v2.16.89. Elle
    // est aussi bornée (`slice(0, 4)`, la plus petite du projet) : la tête gagne, donc le frais
    // gagne maintenant aussi sous le plafond. `w`/`o` = frais/périmé, comme partout ci-dessus.
    starterThemes: _uniq([...(w.starterThemes || []), ...(o.starterThemes || [])]).slice(0, 4),
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
  // v2.16.80 — ce « tombstone naturel » ne couvre QUE l'approbation : approuver retire l'assignation,
  // donc son instanceId entre dans `removedAssignments` et la demande s'efface. REFUSER, lui, ne
  // touche pas à l'assignation (c'est tout l'intérêt du refus) : `handleRefuseRemoval` (App.jsx ~3259)
  // retirait la demande de la liste locale et RIEN ne l'empêchait de revenir par l'union. Côté serveur
  // c'est systématique — `mergeFamily(existing, PUT)` remet toujours sa propre copie en base — donc la
  // demande refusée réapparaissait dans le portail parent à la synchro suivante, indéfiniment, avec un
  // toast « Demande de retrait refusée » qui n'avait jamais d'effet durable. Tombstone explicite, écrit
  // par les DEUX branches (approbation et refus), même patron que `removedProposals` juste dessous.
  const removedRemovalRequests = _uniq([...(bC.removedRemovalRequests || []), ...(iC.removedRemovalRequests || [])]).slice(-400);
  const _rmReq = new Set(removedRemovalRequests);
  const reqMap = new Map();
  [...(bC.removalRequests || []), ...(iC.removalRequests || [])].forEach((r) => { if (r && r.id && !_rmSet.has(r.instanceId) && !_rmReq.has(r.id)) reqMap.set(r.id, r); });
  // v2.5.10 (Correctif 2C) — propositions de tâche enfant→parent : union par id, moins les tombstones
  // (approuvées ou refusées sur un appareil, ne doivent pas revenir via une copie pas encore synchronisée).
  const removedProposals = _uniq([...(bC.removedProposals || []), ...(iC.removedProposals || [])]).slice(-800);
  const _rmProp = new Set(removedProposals);
  // v2.16.80 — tombstones des deux listes du portail parent qui n'en avaient aucun (voir `announcements`
  // et `momentRequests` plus bas). Bornés comme les autres : ces listes sont déjà tronquées à 20 / 60.
  const removedAnnouncements = _uniq([...(bC.removedAnnouncements || []), ...(iC.removedAnnouncements || [])]).slice(-200);
  const _rmAnn = new Set(removedAnnouncements);
  const removedMomentRequests = _uniq([...(bC.removedMomentRequests || []), ...(iC.removedMomentRequests || [])]).slice(-200);
  const _rmMom = new Set(removedMomentRequests);
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
  const teamInvites = [...teamInviteMap.values()].filter(inv => inv.status === "pending" || (inv.createdAt || 0) > teamInvitesCutoff).sort((a, b) => ((b.createdAt || 0) - (a.createdAt || 0)) || _departageId(a, b)).slice(0, 40);
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
    removedRemovalRequests, // v2.16.80 — tombstone du REFUS, voir plus haut
    childTaskProposals: [...propMap.values()],
    removedProposals,
    teamInvites,
    // v2.16.56 — Récompenses cochées par le parent : DERNIÈRE ÉCRITURE GAGNE, plus une union.
    // L'union rendait tout décochage impossible : dès qu'un appareil resynchronisait, sa copie
    // remettait la récompense retirée. C'est une SÉLECTION (un choix de parent), pas un journal
    // d'événements — même patron que `pin`/`mode`/`routineEnd` juste plus bas. Une liste vide ou
    // absente ne peut pas écraser une liste réelle (sinon un appareil jamais passé par l'assistant
    // effacerait la sélection de la famille).
    // v2.16.81 — le `&& n.length` a sauté. Cette règle et `customRewards` (plus bas) existent pour
    // la MÊME raison — permettre au parent de RETIRER, ce qu'une union ne sait pas faire — et le
    // commentaire de `customRewards` énonce la distinction qui compte : `[]` (« il n'y en a plus »,
    // ça tient) ≠ `undefined` (« je ne connais pas le champ », n'efface rien). `Array.isArray`
    // tranche déjà cette distinction ; `&& n.length` ajoutait seulement le REVERT silencieux du
    // seul cas qu'il attrape — le parent décoche la DERNIÈRE récompense, et l'ancienne sélection
    // revient du nuage. Trouvé par le contrôle « listes de chaînes » de ce même passage.
    // Aucun risque de boutique vide : en aval, une liste vide vaut « pas de filtre » et rend TOUT
    // le catalogue (`shopRewardPool`, catalog.js:133 ; l'assistant recharge aussi les défauts,
    // setupwizard.jsx:53). Honorer `[]` ne peut donc jamais retirer une récompense de l'écran.
    selectedRewards: (() => {
      const n = newerC.selectedRewards, o = (newer === base ? iC : bC).selectedRewards;
      if (Array.isArray(n)) return _uniq(n);
      if (Array.isArray(o)) return _uniq(o);
      return [];
    })(),
    // v2.16.84 — le ❤️ du fil de famille est un TOGGLE (`toggleFeedLike`, App.jsx ~2366) : retaper
    // le coeur RETIRE l'id de `likes`. Or `likes` était unionné, et une union ne sait pas exprimer
    // un retrait — le « je retire mon coeur » revenait à la synchro suivante, pour toujours.
    // Mesuré en rejouant les vrais modules sur la prod du 18 août : 204/204 retraits ressuscités
    // (31 entrées aimées, 51 coeurs, client ET serveur, dans les deux sens).
    // L'union reste le bon choix pour l'AJOUT : deux appareils peuvent aimer la même entrée en même
    // temps, et un dernière-écriture-gagne perdrait le coeur de l'autre enfant. On garde donc
    // l'union et on la soustrait d'un tombstone DATÉ, exactement comme `completed`/`deCompleted`
    // (v2.16.82) : `unlikes[qui]` bat le coeur seulement s'il est plus récent que `likeTs[qui]`,
    // donc ré-aimer après avoir retiré son coeur refonctionne (sinon le tombstone serait définitif).
    // Coeurs d'avant la v2.16.84 : pas de `likeTs` → 0 → tout retrait les bat, ce qui est voulu.
    feed: (() => { // fil de famille : union par id, likes unionnés moins les retraits datés, 60 plus récents
      const m = new Map();
      const maxPar = (A, B) => { const o = { ...(A || {}) }; for (const [k, v] of Object.entries(B || {})) if ((Number(v) || 0) > (Number(o[k]) || 0)) o[k] = v; return o; };
      for (const f of [...(bC.feed || []), ...(iC.feed || [])]) {
        if (!f || f.id == null) continue;
        const prev = m.get(f.id);
        if (prev) {
          prev.likes = _uniq([...(prev.likes || []), ...(f.likes || [])]);
          prev.likeTs = maxPar(prev.likeTs, f.likeTs);
          prev.unlikes = maxPar(prev.unlikes, f.unlikes);
        } else m.set(f.id, { ...f, likes: [...(f.likes || [])], likeTs: { ...(f.likeTs || {}) }, unlikes: { ...(f.unlikes || {}) } });
      }
      // Les deux tables vides ne sont pas réécrites : le fil voyage à chaque synchro, et 60 entrées
      // × 2 objets vides pèsent pour rien (leçon des ~5127 `updateFeedEntries`, v2.5.29).
      return [...m.values()].map((f) => {
        const e = { ...f, likes: f.likes.filter((q) => (Number(f.unlikes[q]) || 0) <= (Number(f.likeTs[q]) || 0)) };
        if (!Object.keys(e.likeTs).length) delete e.likeTs;
        if (!Object.keys(e.unlikes).length) delete e.unlikes;
        return e;
      }).sort((a, b) => ((b.ts || 0) - (a.ts || 0)) || _departageId(a, b)).slice(0, 60);
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
      return [...m.values()].filter(o => o.status === "pending" || (o.ts || 0) > cutoff).sort((a, b) => ((b.ts || 0) - (a.ts || 0)) || _departageId(a, b)).slice(0, 40);
    })(),
    bugs: (() => { const m = new Map(); for (const x of [...(bC.bugs || []), ...(iC.bugs || [])]) { if (x && x.id != null && !m.has(x.id)) m.set(x.id, x); } return [...m.values()].sort((a, b) => ((b.ts || 0) - (a.ts || 0)) || _departageId(a, b)).slice(0, 60); })(), // v1.65.0 — bugs signalés : union par id (ne se perdent plus à la synchro)
    errorLogs: (() => { const m = new Map(); for (const x of [...(bC.errorLogs || []), ...(iC.errorLogs || [])]) { if (x && x.id != null && !m.has(x.id)) m.set(x.id, x); } return [...m.values()].sort((a, b) => ((b.ts || 0) - (a.ts || 0)) || _departageId(a, b)).slice(0, 80); })(), // v1.90.0 — logs techniques (erreurs JS) : même pattern que bugs, union par id
    boss: (() => { // même boss = garder l'état "vaincu" si l'un l'a vaincu; sinon le plus récent
      const a = bC.boss, b = iC.boss;
      if (!a) return b || null; if (!b) return a;
      // v2.16.71 — `lastHitTs` était arbitré côté SERVEUR seulement (le seul cas de dérive dans ce
      // sens-là) : sur le même boss, `{...a, ...b}` laissait l'incoming imposer sa date de dernier
      // coup, même plus vieille. Or c'est elle qui pilote la régénération des PV de la famille
      // (`bosses.jsx:131-133`) : une date reculée redonne des PV au boss après un coup encaissé.
      // On garde la plus récente des deux, comme le serveur le fait déjà.
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
      return (new Date(b.startedAt||0) >= new Date(a.startedAt||0)) ? b : a;
    })(),
    // PIN parent : dernière écriture gagne (permet de le changer / réinitialiser depuis n'importe quel appareil)
    pin: newerC.pin || bC.pin || iC.pin || "1146",
    mode: newerC.mode || bC.mode || iC.mode || "routine",
    routineEnd: newerC.routineEnd || bC.routineEnd || iC.routineEnd,
    // v2.16.73 — `theme` (thème visuel de la FAMILLE, celui que `App.jsx` résout en
    // `resolvedWeekTheme`) était le seul réglage de l'assistant à ne pas avoir sa règle, à côté de
    // `pin`/`mode`/`routineEnd` juste au-dessus qui l'ont depuis toujours. Sans règle, il retombait
    // sur le spread naïf `{...bC,...iC}` : l'incoming gagnait TOUJOURS, même vieux de trois jours.
    // Un appareil resté sur l'ancien thème pouvait donc rebasculer toute la famille en poussant
    // n'importe quelle autre modification (un enfant qui coche une quête suffit). Même patron que
    // `mode`, et même défaut que le repli d'`App.jsx` (`THEMES[config?.theme||"minecraft"]`).
    theme: newerC.theme || bC.theme || iC.theme || "minecraft",
    // v2.16.73 — `customRewards` (les récompenses maison créées par le parent dans l'assistant)
    // n'avait aucune règle non plus. Le champ était décoratif jusqu'à la v2.16.56 — c'est elle qui
    // l'a rendu porteur : la boutique lit maintenant `shopRewardPool` (`catalog.js`) = catalogue +
    // `customRewards`, et `PlayerDashboard` repêche dans `allRewards` le libellé d'une récompense
    // DÉJÀ ACHETÉE qui n'est plus au bassin du jour (`App.jsx:427-431`). Devenu porteur, il est
    // resté sur le spread naïf : une copie plus vieille effaçait les récompenses maison, et
    // `selectedRewards` — protégé, lui, depuis la v2.16.56 — continuait de pointer vers des ids
    // qui n'existaient plus.
    // DERNIÈRE ÉCRITURE GAGNE, pas une union : le parent doit pouvoir SUPPRIMER une récompense
    // maison (une union la ressusciterait à la synchro suivante, exactement le piège corrigé pour
    // `selectedRewards`). On distingue `[]` (le côté frais dit « il n'y en a plus » — ça tient) de
    // `undefined` (le côté frais ne connaît pas le champ — il ne doit rien effacer).
    customRewards: (() => {
      const n = newerC.customRewards, o = (newer === base ? iC : bC).customRewards;
      if (Array.isArray(n)) return n;
      if (Array.isArray(o)) return o;
      return [];
    })(),
    // v2.6.0 — annonces parent : union par id, 20 les plus récentes.
    // v2.16.80 — le commentaire d'origine disait « suppression = tombstone via absence sur les deux
    // côtés » : c'est précisément ce qu'une union par id ne peut pas faire. `handleDeleteAnnouncement`
    // (App.jsx ~2736) retire l'annonce de la liste locale, puis la fusion la RESSUSCITE depuis l'autre
    // copie — et côté serveur `mergeFamily(existing, PUT)` a toujours l'ancienne liste en base, donc
    // supprimer une annonce ne pouvait tout simplement PAS marcher, dans aucun sens. Même famille que
    // `selectedRewards` (v2.16.56) et `customRewards` (v2.16.73), où l'union rendait le retrait
    // impossible ; ici la sortie choisie est un tombstone plutôt qu'un dernière-écriture-gagne, parce
    // qu'une annonce est CRÉÉE par un appareil et lue par les autres (une liste fraîche mais partielle
    // ne doit pas effacer l'annonce qu'un autre appareil vient d'écrire).
    removedAnnouncements,
    announcements: (() => { const m = new Map(); for (const a of [...(bC.announcements||[]), ...(iC.announcements||[])]) { if (a && a.id != null && !_rmAnn.has(a.id) && !m.has(a.id)) m.set(a.id, a); } return [...m.values()].sort((a, b) => ((b.createdAt||"").localeCompare(a.createdAt||"")) || _departageId(a, b)).slice(0, 20); })(),
    // v2.14.2 (correctif rattrapage Ursul/Antoine DR, 2026-07-28) — Lot 7 (semaine de garde) :
    // weeklyQuests n'était PAS listé ici, donc il retombait sur le spread naïf `{...bC,...iC}` ci-dessus
    // — iC (incoming) écrasait TOUJOURS bC, sans égard à la fraîcheur (même bug déjà corrigé pour
    // weeklyChallenge, voir plus bas). Un appareil resté sur une semaine de garde plus vieille (ou sur
    // `weeklyQuests:null`) pouvait donc effacer les assignations de la semaine en cours partout, orphelinant
    // les demandes de validation en attente. Fix : dernière-semaine-gagne par generatedForWeek, comme le
    // fait déjà server.cjs (mergeFamily côté serveur) — les deux moitiés de la fusion restent cohérentes.
    // v2.16.78 — DEUX défauts d'une même racine : `weeklyQuests` était traité comme un BLOC OPAQUE,
    // arbitré en entier sur sa seule clé de semaine, sans que rien ne regarde jamais à l'intérieur.
    // (A) Sur une MÊME `generatedForWeek` — le cas normal pendant les 7 jours de la semaine de garde —
    //     `>=` rendait `a`, la BASE, TOUJOURS. Or le serveur met toujours l'état stocké en `a`
    //     (`mergeFamily(existing, data)`) : le nuage n'a donc JAMAIS pu accepter la moindre
    //     modification de `weeklyQuests.assignments` à l'intérieur d'une semaine — figé à sa toute
    //     première écriture, exactement le défaut de `routines` en v2.16.70. Deux écrivains réels
    //     tombaient dedans : le report des tâches récurrentes manquées (`carryOverUnfinishedTasks`,
    //     App.jsx ~2569, qui réécrit `a.days` sans toucher `generatedForWeek`) et le ménage des
    //     assignations orphelines (`migrations.js` ~254, qui tourne à CHAQUE chargement — il nettoie
    //     en local, le nuage repasse la copie sale par-dessus, en boucle). Prouvé en rejouant les vrais
    //     modules sur la prod du 2026-08-17 (`savedAt` 02:30Z, jamais d'écriture) : le report réel
    //     modifie 2 assignations (`rc_lavabo_cuisine`) et les 2 sens serveur perdaient l'écriture fraîche.
    //     Règle : à clé de semaine ÉGALE, dernière-écriture-gagne (`preferIncoming`), comme `coins`/
    //     `pin`/`house`. À clé différente, comportement inchangé (la semaine la plus récente gagne).
    // (B) Le tombstone `removedAssignments` — le seul mécanisme qui empêche une assignation supprimée
    //     de ressusciter à la synchro — n'était appliqué qu'à `config.assignments`, jamais aux
    //     assignations DANS `weeklyQuests`. Pendant une semaine de garde, `PlayerDashboard` reçoit
    //     pourtant les deux listes confondues (App.jsx ~4253) et le bouton « 🗑️ Je ne veux plus de
    //     cette tâche » (App.jsx ~1156) s'affiche sur TOUTES les cartes : l'enfant pouvait demander le
    //     retrait d'une rotative, le parent approuver (toast « 🗑️ Tâche retirée », tombstone écrit,
    //     demande consommée) — et la tâche restait là, pour toujours, sans aucune trace de l'échec.
    //     Le filtre est appliqué APRÈS l'arbitrage, donc il tient quel que soit le côté qui l'emporte
    //     (le tombstone, lui, s'unionne — increvable, patron de `removedCalendarIds`/`removedProposals`).
    //     ⚠️ Portée : les instanceId sont RÉGÉNÉRÉS à chaque semaine de garde, donc le retrait vaut
    //     pour la semaine en cours. Le rendre permanent d'une semaine à l'autre demande un autre
    //     mécanisme (une exclusion par enfant) — décision de conception, à trancher avec Gen (👤).
    weeklyQuests: (() => {
      const a = bC.weeklyQuests, b = iC.weeklyQuests;
      let wq;
      if (!a) wq = b || null;
      else if (!b) wq = a;
      else {
        // v2.14.3 (correctif rattrapage Ursul/Antoine DR, 2026-07-28) : une donnée corrompue trouvée
        // en prod ("2026-07-25z2", jamais produite par ce code — voir isValidCustodyWeekKey) battait
        // pour toujours la vraie clé du jour dans une comparaison `>=` brute, empêchant tout correctif
        // via une simple synchro. Une clé invalide perd maintenant automatiquement face à une clé
        // valide, peu importe l'ordre alphabétique.
        const aValid = isValidCustodyWeekKey(a.generatedForWeek), bValid = isValidCustodyWeekKey(b.generatedForWeek);
        if (aValid !== bValid) wq = aValid ? a : b;
        else {
          const aw = a.generatedForWeek || "", bw = b.generatedForWeek || "";
          wq = (aw === bw) ? (preferIncoming ? b : a) : (aw > bw ? a : b); // v2.16.78 (A)
        }
      }
      if (!wq) return null;
      return { ...wq, assignments: (wq.assignments || []).filter((x) => x && !_rmSet.has(x.instanceId)) }; // v2.16.78 (B)
    })(),
    // v2.6.0 — quêtes de réparation 🕊️ : union-by-id (id = instanceId de l'assignation) = effet
    // collectif exactly-once même après fusion multi-appareils. ⚠️ JAMAIS sur config.boss (merge shallow).
    repairEvents: (() => { const m = new Map(); for (const e of [...(bC.repairEvents||[]), ...(iC.repairEvents||[])]) { if (e && e.id != null && !m.has(e.id)) m.set(e.id, e); } return [...m.values()].sort((a, b) => ((b.ts||0)-(a.ts||0)) || _departageId(a, b)).slice(0, 100); })(),
    // v2.6.2 — récompenses "moment" à planifier avec le parent : union-by-id + progression MONOTONE
    // du statut (attente < planifie < fait) — après fusion multi-appareils, un statut ne recule jamais
    // (le parent a pu le marquer "Fait" sur un appareil pendant qu'un autre pousse encore "attente").
    // v2.16.80 — DEUX défauts, tous deux invisibles aux garde-fous parce que rien ne met jamais deux
    // copies du même ÉLÉMENT DE LISTE en collision sur des champs internes contradictoires.
    // (A) RE-PLANIFIER une date ne tenait jamais. Le bouton « 📅 Prévu » (parentpanel.jsx ~565) reste
    //     affiché tant que le parent n'a pas cliqué « ✔ Fait », et le champ date est pré-rempli avec
    //     `m.plannedDate` : changer la date d'un moment déjà planifié est un geste normal et prévu.
    //     Or à statut ÉGAL (« planifie » des deux côtés) la règle gardait `prev`, c'est-à-dire la
    //     PREMIÈRE copie rencontrée, donc la BASE — et le serveur met toujours sa propre copie en base
    //     (`mergeFamily(existing, PUT)`). Le nuage ne pouvait donc accepter aucune re-planification :
    //     la date y restait figée à la première, exactement comme le contenu des rituels avant la
    //     v2.16.70. Règle : le rang du statut reste MONOTONE (il ne recule jamais) ; à rang égal,
    //     dernière-écriture-gagne (`preferIncoming`), comme `coins`/`pin`/`house`.
    // (B) Une demande ANNULÉE revenait. Quand l'enfant se fait rembourser une récompense « moment »
    //     encore en attente, `handleRefundReward` (App.jsx ~3569) la retire — le commentaire v2.6.4 dit
    //     mot pour mot « sinon un fantôme reste pour toujours dans à planifier ». Sans tombstone,
    //     l'union la ressuscitait et le fantôme restait quand même. Tombstone explicite.
    removedMomentRequests,
    momentRequests: (() => {
      const rank = { attente:0, planifie:1, fait:2 };
      const m = new Map();
      for (const r of [...(bC.momentRequests||[]), ...(iC.momentRequests||[])]) {
        if (!r || r.id == null || _rmMom.has(r.id)) continue;
        const prev = m.get(r.id);
        if (!prev || (rank[r.status]||0) > (rank[prev.status]||0)) m.set(r.id, r);
        else if ((rank[r.status]||0) === (rank[prev.status]||0)) {
          // Un côté a une date, l'autre pas : la date gagne (elle ne s'efface jamais toute seule).
          // Sinon — le cas de la re-planification — c'est l'écriture la plus récente qui tranche.
          if (r.plannedDate && !prev.plannedDate) m.set(r.id, r);
          else if (!(prev.plannedDate && !r.plannedDate) && preferIncoming) m.set(r.id, r);
        }
      }
      return [...m.values()].sort((a, b) => ((b.createdAt||"").localeCompare(a.createdAt||"")) || _departageId(a, b)).slice(0, 60);
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
      // v2.16.91 — `weekKey` était arbitré (la semaine la plus récente gagne) et `challenges`
      // unionné SANS JAMAIS regarder si les deux copies parlaient de la même semaine. Sur les dix
      // seaux datés de la fusion, c'était le seul : `dailyClaimed`, `ritualCelebrated`, `petDay`,
      // `sessionMinutes`, `challengeTiers`, `coinsWeek`, `bossBattle`, `boss` et `weeklyQuests`
      // branchent tous sur l'égalité de leur clé et rendent le côté frais SEUL quand elle diffère.
      // Ici, le défi qu'un enfant avait la semaine passée était réétiqueté à la semaine en cours et
      // s'y réinstallait — définitivement, puisque chaque fusion le recopiait. Les deux écrivains
      // d'`App.jsx` avaient le même trou (`{...prev, weekKey:cwk}` sur des `challenges` périmés) :
      // corrigés au même endroit. `checkins` ne se perd pas au passage — il n'est lu que par
      // `challengeDaysCount`/`hasPerfectChallengeWeek`, qui ne comptent QUE les jours de la semaine
      // demandée (v2.16.53) ; ce qui part est du contenu d'une semaine révolue, jamais un paiement.
      if ((bWC.weekKey||"") !== (iWC.weekKey||""))
        return (iWC.weekKey||"") >= (bWC.weekKey||"") ? iWC : bWC;
      const weekKey = (iWC.weekKey||"") >= (bWC.weekKey||"") ? (iWC.weekKey||bWC.weekKey) : bWC.weekKey;
      const cm = new Map();
      (bWC.challenges||[]).forEach(c => { if (c && c.playerId != null) cm.set(c.playerId, {...c}); });
      (iWC.challenges||[]).forEach(c => {
        if (!c || c.playerId == null) return;
        const ex = cm.get(c.playerId);
        if (!ex) { cm.set(c.playerId, {...c}); return; }
        // v2.16.87 — même défaut que `_mergePlayer`, dans la même forme de code : `{...ex, ...c}`
        // donnait TOUJOURS l'incoming aux champs que ce littéral ne nomme pas. Ici il y en a un
        // vrai en prod, `playerName`. Il n'est lu nulle part aujourd'hui (👤 à trancher), donc
        // personne ne pouvait le voir — mais il est ÉCRIT, et une tablette en retard le réécrivait.
        const perime = preferIncoming ? ex : c, recent = preferIncoming ? c : ex;
        cm.set(c.playerId, {
          ...perime, ...recent,
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
