// ─── MIGRATIONS DE DONNÉES ───────────────────────────────────
// Extrait d'`App.jsx` le 2026-08-06 (Lot 5/#24, vingt-troisième incrément) — déplacement pur,
// aucun changement de comportement. Contient toute la couche qui fait franchir les mises à jour
// aux données déjà en prod, sans jamais rien écraser : `migrateGameState` (par joueur),
// `migrateSavedData` (config famille + ménages des références mortes) et `dedupeUpdateFeed`.
// `migratePetXpV2`/`PET_LEVELS_OLD` viennent avec, `migrateGameState` étant leur seul appelant.
import { PET_LEVELS } from "./pets.js";
import { TASK_CATALOG } from "./catalog.js";
import { COLOR_DESATURATE_MAP } from "./shared.js";
import { computeLeagueTier, leagueRank } from "./leagues.js";
import { custodyWeekKey, CHALLENGE_PERFECTION_FRAME_ID } from "./recurring.js";
import { CHANGELOG } from "./changelog.js";

// v1.52.0 — migration anti-rétrogradation : avec la nouvelle courbe (plus dure), on remonte
// l'XP des familiers existants pour qu'aucun enfant ne perde son stade. Mappe l'ancien niveau
// (courbe 6 paliers) vers le nouveau (8 paliers) et remonte au plancher du palier obtenu.
const PET_LEVELS_OLD = [0, 30, 80, 160, 280, 450];
const migratePetXpV2 = (petXp) => {
  const out = { ...(petXp || {}) };
  for (const k in out) {
    const xp = out[k] || 0;
    let oldLv = 1; for (let i = 0; i < PET_LEVELS_OLD.length; i++) if (xp >= PET_LEVELS_OLD[i]) oldLv = i + 1;
    const newLv = Math.max(1, Math.min(PET_LEVELS.length, Math.round(oldLv / PET_LEVELS_OLD.length * PET_LEVELS.length)));
    const floor = PET_LEVELS[newLv - 1] || 0;
    if (xp < floor) out[k] = floor;
  }
  return out;
};

// ─── DATA MIGRATION ── préserve les données des enfants entre les pushes ────
// Ajoute les nouveaux champs sans jamais écraser les données existantes
export const migrateGameState = (gs) => {
  const hasPin = gs.pin != null;
  const oldAvatar = gs.avatar || {};
  // v2.5.0 → v2.16.45 — HISTORIQUE DU RESET HEBDOMADAIRE DES PIÈCES, ET POURQUOI IL N'EXISTE PLUS.
  // Le solde de pièces était remis à 0 à chaque changement de semaine de garde (vendredi minuit,
  // `custodyWeekKey` — PAS `weekKey`). v2.16.22 (2 août) l'a désactivé via le drapeau `noCoinsResetV1`,
  // mais en gardant la branche de reset en place « au cas où » — elle restait donc atteignable.
  // v2.16.45 (8 août) la retire pour de bon, après avoir reconstruit ce qu'elle avait coûté en prod :
  // les soldes que Gen avait redistribués à la main le 28 juillet (350/161/151/350) ont survécu
  // TROIS JOURS — le vendredi 31 juillet a fait basculer `custodyWeekKey`, la branche a mis les 4
  // enfants à 0, et v2.16.22 (2 août) a figé ce zéro en solde « persistant ». C'est très exactement
  // le signalement `bug_hlu9mkd` (« J'ai perdu 150 pièces, je peux le récupérer? »), resté sans
  // explication pendant huit jours. Détail complet : PROJET-ETAT.md v2.16.45.
  // La branche était encore atteignable malgré `noCoinsResetV1` : `handleResetPlayer` (`App.jsx`)
  // réécrit un état AVEC `coinsWeek` mais SANS le drapeau — un autre appareil ouvrant ce joueur lors
  // d'une semaine de garde ultérieure repassait `storedWeek < cwk` et re-effaçait les pièces gagnées
  // entre-temps. Plus de branche = plus de chemin, quel que soit l'état des drapeaux.
  // `coinsWeek` continue d'être maintenu (stamp max) : `merge.js` le fusionne encore et de vieux
  // clients l'écrivent toujours — on garde la donnée, on retire seulement l'effacement.
  const cwk = custodyWeekKey();
  // v2.5.26 — on conserve le stamp le PLUS RÉCENT des deux (comparaison lexicographique sûre sur
  // `YYYY-MM-DD`) : un stamp « futur » écrit par un vieux client UTC ne doit pas être rétrogradé,
  // sinon la guerre de stamps avec ce client repart (même raison qu'au merge, `merge.js` ~65).
  const storedWeek = gs.coinsWeek?.week || "";
  return {
    xp: 0, completed: [], equipped: {},
    ...gs,
    badges: gs.badges || [],
    owned: (gs.owned || []).filter(id => id !== CHALLENGE_PERFECTION_FRAME_ID), // v2.6.2 — retire l'item fantôme « cadre » accordé par l'ancien défi parfait (jamais défini, rendu vide)
    boughtRewards: gs.boughtRewards || [],
    refundedRewards: gs.refundedRewards || [], // v1.69.0 — tombstone anti-remboursement-infini
    pending: gs.rotativeCleanupV1 ? (gs.pending || []) : [], // v1.108.0 — ménage unique (Gen) : vide les tâches en suspens pour la bascule vers les quêtes rotatives
    rotativeCleanupV1: true, // v1.108.0 — drapeau : ménage de transition Lot 7 appliqué (xp/coins/badges/completed/routines intacts)
    coinsLifetime: gs.coinsLifetime ?? (gs.coins || 0), // v2.5.0 — jamais réinitialisé ni décrémenté (badges Petit Trésor/Oncle Picsou), seedé depuis le solde actuel au premier déploiement
    coins: gs.coins || 0, // v2.16.45 — solde purement persistant : plus AUCUN chemin ne le remet à 0 ici (voir le bloc d'historique ci-dessus)
    coinsWeek: { week: storedWeek > cwk ? storedWeek : cwk }, // v2.5.26 — garde le stamp max (cohérent avec le merge v2.5.3) pour ne pas relancer la guerre de stamps avec un vieux client
    noCoinsResetV1: true, // v2.16.22 — drapeau conservé : de vieux clients pas encore mis à jour peuvent encore lire ce champ, et il documente l'état de bascule
    pin: gs.pin ?? null,
    mode: gs.mode ?? null,        // v1.13.0 — mode choisi par l'enfant ("routine"|"week"); null = défaut famille
    routines: gs.routines || [],  // v1.13.0 — routines créées par l'enfant: [{id,name,emoji,taskIds:[instanceId]}]
    // v2.15.8 (bug trouvé en reconstruisant les rituels Matin/École/Camp/Soir, 2026-07-28) : contrairement
    // à assignments/customTasks/childTaskProposals, les routines n'avaient AUCUN tombstone — « Supprimer
    // le rituel » (App.jsx ~2924) filtrait juste localement, mais la fusion routines (union-by-id) allait
    // le RESSUSCITER dès qu'un autre appareil (ou le serveur, qui garde l'ancien état) réapparaissait dans
    // la fusion. Même patron que removedProposals/removedAssignments.
    removedRoutineIds: gs.removedRoutineIds || [],
    activeRoutineId: gs.activeRoutineId ?? null, // routine en cours (null = aucune / toutes)
    settings: { sound:true, calm:false, calmCountdown:false, humor:true, focus:false, fontScale:1, readableFont:false, femTitles:false, highContrast:false, ...(gs.settings||{}) }, // v1.16.0 — réglages d'accessibilité par enfant (fontScale/readableFont: v1.87.0, Lot 3 #12; femTitles: v2.5.27; highContrast: v2.16.49, Lot 3 #12)
    hiddenRewards: gs.hiddenRewards || [], // v1.23.0 — récompenses cachées cette semaine
    hiddenWeek: gs.hiddenWeek ?? null,
    dailyClaimed: gs.dailyClaimed || { day:null, ids:[] }, // v1.28.0 — objectifs du jour réclamés
    pendingCelebrations: gs.pendingCelebrations || [], // v1.31.0 — fêtes (popup/jeu) différées vers l'appareil de l'enfant
    consumedCelebrationIds: gs.consumedCelebrationIds || [], // v2.12.2 — tombstone anti-résurrection (voir mergeGameState)
    petXp: gs.petMigV2 ? (gs.petXp || {}) : migratePetXpV2(gs.petXp), // v1.52.0 — migration anti-rétrogradation (une seule fois)
    petMigV2: true, // v1.52.0 — drapeau : migration de courbe des familiers appliquée
    petDay: gs.petDay || { day:null, xp:0 }, // v1.52.0 — plafond quotidien d'XP du familier
    petEvo: gs.petEvo || {}, // v1.57.0 — voies d'évolution par familier {petId:{1,2,3}}
    petNickname: gs.petNickname || {}, // v2.4.2 — surnom personnalisé par familier {petId:string}
    dismissedAnnouncements: gs.dismissedAnnouncements || [], // v2.6.0 — annonces parent archivées par l'enfant
    completedAt: gs.completedAt || {}, // v1.60.0 — horodatage de complétion {doneKey:ISO}
    xpLog: gs.xpLog || [], // v2.16.32 — Backlog #13 : journal d'XP horodaté toutes sources (voir appendXpLog)
    refusedKeys: gs.refusedKeys || [], // v1.64.0 — tombstone des demandes refusées
    refusals: gs.refusals || [], // v1.64.0 — file du message drôle de refus à montrer à l'enfant
    energy: gs.energy == null ? 100 : gs.energy, // v1.41.0 — énergie (sieste/frein sain)
    energyTs: gs.energyTs || null,
    lastFedDay: gs.lastFedDay || null,           // v1.41.0 — Tamagotchi : nourri le jour…
    activeDays: gs.activeDays || [],             // v1.41.0 — jours avec ≥1 quête (pour la série 🔥)
    // v2.16.34 — Backlog #13 (ligues) : recalculé à CHAQUE chargement à partir de activeDays (comme
    // le nettoyage des orphelines plus bas), mais RATCHET — ne remplace le palier déjà stocké que si
    // le palier mérité cette semaine est PLUS HAUT. Jamais de rétrogradation : une semaine calme
    // après une bonne série ne fait jamais reculer l'enfant.
    leagueTier: (() => { const computed = computeLeagueTier(gs.activeDays || []); const stored = gs.leagueTier || "bronze"; return leagueRank(computed) > leagueRank(stored) ? computed : stored; })(),
    sessionMinutes: gs.sessionMinutes || { day: null, minutes: 0 }, // Backlog #13 — budget-temps quotidien (contrôle parental)
    bossBattle: gs.bossBattle || {bossId:null,earned:0,spent:0,dmg:0}, // v1.42.0 — combat de boss (jetons/dégâts)
    // v2.15.0 — calendrier purement événementiel (demande de Gen) : "devoir"/"examen" agissaient
    // comme des tâches à XP déguisées en calendrier — migration ponctuelle et sans perte : on garde
    // l'entrée (date/heure/récurrence/libellé intacts), seul le type devient "evenement" générique.
    calendar: (gs.calendar || []).map(e => (e && (e.type==="devoir"||e.type==="examen")) ? {...e, type:"evenement"} : e),
    house: gs.house || { wallpaper:null, floor:null, placed:{} }, // v2.8.0 — Ma maison (décor).
    // Fusion : transporté en bloc par le spread ...a,...b de mergeGS (dernière écriture gagne,
    // comme boughtRewards) — AUCUN changement client/serveur requis, miroir server.cjs intouché.
    avatar: {
      skin:"sk1", eyes:"ey1", mouth:"mo1", hair:"ha1",
      back:"bk0", shoes:"sh0", extra:"xt0",       // v2.7.0/v2.12.0 — slots (défaut "Aucun")
      build:"bd_ado",                             // v2.11.0 — silhouette (les 4 enfants sont ados)
      ...oldAvatar,
      configured: oldAvatar.configured ?? hasPin, // v1.6.0 — true = onboarding complété
    },
  };
};

// v2.5.29 — garde une seule entrée changelog par version (la plus récente), plafonnée aux 30
// dernières, en préservant l'ordre. Utilisé au chargement (migrateSavedData) ET à l'ajout (~5127).
export const dedupeUpdateFeed = (list) => {
  const seen = new Set(); const out = [];
  for (let i = (list || []).length - 1; i >= 0; i--) {
    const e = list[i];
    if (!e || !e.version || seen.has(e.version)) continue;
    seen.add(e.version); out.unshift(e);
  }
  return out.slice(-30);
};

export const migrateSavedData = (data) => {
  if (!data) return null;
  const seenVersions = data.seenVersions || [];
  const newVersions = CHANGELOG.map(c=>c.version).filter(v=>!seenVersions.includes(v));
  // Merge stored config, then apply defaults for missing/undefined fields
  const mergedConfig = { ...(data.config || {}) };
  if (mergedConfig.pin == null) mergedConfig.pin = "1146"; // fix: spread can't override undefined
  if (!Array.isArray(mergedConfig.players)) mergedConfig.players = [];
  if (!Array.isArray(mergedConfig.assignments)) mergedConfig.assignments = [];
  if (!Array.isArray(mergedConfig.childTaskProposals)) mergedConfig.childTaskProposals = []; // v2.5.10 (Correctif 2C)
  if (!Array.isArray(mergedConfig.removedProposals)) mergedConfig.removedProposals = [];
  if (!Array.isArray(mergedConfig.teamInvites)) mergedConfig.teamInvites = []; // v2.16.35 — Backlog #17 : invitations "en équipe" enfant→enfant
  if (!mergedConfig.rotativeCleanupV1) { // v1.108.0 — ménage unique (demandé par Gen) : bascule vers les quêtes rotatives (Lot 7B) —
    mergedConfig.assignments = [];       // vide les anciennes assignations manuelles pour laisser toute la place à weeklyQuests
    mergedConfig.removalRequests = [];   // demandes de retrait orphelines (pointaient sur des assignations qui disparaissent)
    mergedConfig.rotativeCleanupV1 = true;
  }
  if (!mergedConfig.colorToneDownV1) { // v2.2.0 (Lot 6 #26, demandé par Gen) : les couleurs de joueur sont
    // enregistrées une fois au choix et ne se recalculent plus jamais depuis COLORS — sans cette
    // migration ponctuelle, la palette adoucie n'aurait aucun effet sur les enfants déjà configurés.
    mergedConfig.players = (mergedConfig.players || []).map(p =>
      p && COLOR_DESATURATE_MAP[p.color] ? { ...p, color: COLOR_DESATURATE_MAP[p.color] } : p
    );
    mergedConfig.colorToneDownV1 = true;
  }
  if (!mergedConfig.orphanAssignCleanupV1) { // v2.5.2 (Correctif 2B) — ménage ponctuel (demandé par Gen) :
    // purge les assignations déjà en prod dont le taskId ne correspond à AUCUNE tâche connue (ni
    // TASK_CATALOG ni customTasks) — ~125 orphelines générales + les 16 "cust_hydre_*" du bug boss #1
    // (données de test du 1er juillet jamais nettoyées, jamais complétables). Purge seulement, jamais
    // de reconstruction (le nom/emoji d'origine n'existe plus nulle part).
    const knownTaskIds = new Set([...TASK_CATALOG.map(t=>t.id), ...(mergedConfig.customTasks||[]).map(t=>t.id)]);
    mergedConfig.assignments = (mergedConfig.assignments||[]).filter(a => knownTaskIds.has(a.taskId));
    mergedConfig.orphanAssignCleanupV1 = true;
  }
  let orphanPendingInstanceIds = null; // v2.6.6 — voir ci-dessous, utilisé pour purger `pending` chez tous les enfants
  if (!mergedConfig.orphanAssignCleanupV2) { // v2.6.6 — bug signalé par Gen : tâches fantômes (cust_camp_*
    // et consorts, 125 en prod le 27 juillet) réapparaissent sans cesse dans la file « à valider » — leurs
    // tâches personnalisées ont été supprimées après le passage de V1, mais pas leurs assignations
    // récurrentes (jamais renettoyées depuis, elles régénèrent une entrée `pending` chaque jour). Même
    // purge que V1, réappliquée + weeklyQuests par précaution + nettoyage des `pending` déjà accumulées
    // (voir plus bas, approvePending tombstone maintenant aussi pour éviter que ça ne revienne).
    const knownTaskIds2 = new Set([...TASK_CATALOG.map(t=>t.id), ...(mergedConfig.customTasks||[]).map(t=>t.id)]);
    const before = mergedConfig.assignments || [];
    mergedConfig.assignments = before.filter(a => knownTaskIds2.has(a.taskId));
    const purgedFromStatic = before.filter(a => !knownTaskIds2.has(a.taskId)).map(a => a.instanceId);
    // v2.14.2 (correctif rattrapage Ursul/Antoine DR, 2026-07-28) : les instanceId purgés de
    // weeklyQuests.assignments n'étaient PAS ajoutés à orphanPendingInstanceIds (contrairement à
    // ceux de config.assignments juste au-dessus) — leurs `pending` correspondants survivaient donc
    // indéfiniment, orphelins, et « Valider » ne donnait plus jamais d'XP/pièce pour ces demandes.
    let purgedFromWq = [];
    if (mergedConfig.weeklyQuests) {
      const beforeWq = mergedConfig.weeklyQuests.assignments || [];
      mergedConfig.weeklyQuests = { ...mergedConfig.weeklyQuests, assignments: beforeWq.filter(a => knownTaskIds2.has(a.taskId)) };
      purgedFromWq = beforeWq.filter(a => !knownTaskIds2.has(a.taskId)).map(a => a.instanceId);
    }
    orphanPendingInstanceIds = new Set([...purgedFromStatic, ...purgedFromWq]);
    mergedConfig.orphanAssignCleanupV2 = true;
  }
  // v2.14.2 (correctif rattrapage Ursul/Antoine DR, 2026-07-28) — orphanAssignCleanupV1/V2 ci-dessus
  // sont des ménages À DRAPEAU UNIQUE (ne s'exécutent qu'une fois). Si une tâche personnalisée est
  // supprimée APRÈS leur passage — exactement ce qui est arrivé : 7 tâches rituelles supprimées les
  // 24-28 juillet alors que V2 avait déjà tourné —, l'assignation orpheline qui en résulte n'est plus
  // JAMAIS nettoyée : chaque jour l'enfant la complète, la demande atterrit dans `pending`, et
  // « Valider » échoue silencieusement pour toujours (« Tâche supprimée entretemps », 0 XP/pièce).
  // Même leçon déjà tirée pour `removalRequests` juste en dessous : ce ménage doit tourner à CHAQUE
  // chargement (idempotent — ne retire que des références déjà mortes, aucun coût sur données propres).
  {
    const knownTaskIdsLive = new Set([...TASK_CATALOG.map(t=>t.id), ...(mergedConfig.customTasks||[]).map(t=>t.id)]);
    const beforeLive = mergedConfig.assignments || [];
    mergedConfig.assignments = beforeLive.filter(a => knownTaskIdsLive.has(a.taskId));
    const purgedLiveStatic = beforeLive.filter(a => !knownTaskIdsLive.has(a.taskId)).map(a => a.instanceId);
    let purgedLiveWq = [];
    if (mergedConfig.weeklyQuests) {
      const beforeLiveWq = mergedConfig.weeklyQuests.assignments || [];
      mergedConfig.weeklyQuests = { ...mergedConfig.weeklyQuests, assignments: beforeLiveWq.filter(a => knownTaskIdsLive.has(a.taskId)) };
      purgedLiveWq = beforeLiveWq.filter(a => !knownTaskIdsLive.has(a.taskId)).map(a => a.instanceId);
    }
    if (purgedLiveStatic.length || purgedLiveWq.length) {
      const extra = new Set([...purgedLiveStatic, ...purgedLiveWq]);
      orphanPendingInstanceIds = orphanPendingInstanceIds ? new Set([...orphanPendingInstanceIds, ...extra]) : extra;
    }
  }
  // v2.9.1 (corrigé v2.11.1) — bug signalé par Gen : « plusieurs de ses rituels sont vides » +
  // « demandes de retrait fantômes ». Les rituels (routines[].taskIds) et les demandes de retrait
  // (removalRequests) référencent tous deux des instanceId d'assignation — or les assignations se
  // RÉGÉNÈRENT à chaque semaine de garde (nouveaux instanceId à chaque fois, custodyWeekKey). Un
  // ménage à DRAPEAU UNIQUE (comme les autres ci-dessus) était donc le mauvais patron ici : il ne
  // nettoyait qu'une fois puis se taisait pour toujours, alors que de nouvelles orphelines
  // apparaissent chaque semaine — Olivier/Antoine DR avaient encore des rituels 100% morts après
  // son passage. Recalculé à CHAQUE chargement (peu coûteux, idempotent sur données déjà propres) —
  // ne retire QUE les références mortes, jamais une tâche encore valide.
  const validInstanceIdsForCleanup = new Set([...(mergedConfig.assignments||[]), ...((mergedConfig.weeklyQuests||{}).assignments||[])].map(a=>a.instanceId));
  if (Array.isArray(mergedConfig.removalRequests)) {
    mergedConfig.removalRequests = mergedConfig.removalRequests.filter(r => validInstanceIdsForCleanup.has(r.instanceId));
  }
  if (!Array.isArray(mergedConfig.feed)) mergedConfig.feed = []; // v1.19.0 — fil de famille
  // v2.5.29 — updateFeedEntries s'accumulait SANS plafond ni dédoublonnage (~5127) : chaque appareil
  // ré-ajoutait ses entrées changelog → 2,35 Mo observés en prod, poussés à CHAQUE sync par chaque
  // appareil (et payload familial > MAX_BODY 2 Mo du serveur). Nettoyage au chargement + à l'ajout.
  mergedConfig.updateFeedEntries = dedupeUpdateFeed(mergedConfig.updateFeedEntries);
  const migratedGameStates = (data.gameStates || []).map(migrateGameState).map(gs => {
    let next = gs;
    if (orphanPendingInstanceIds && orphanPendingInstanceIds.size && (next.pending || []).length) {
      // v2.6.6 — purge les entrées `pending` déjà accumulées qui pointent sur une assignation
      // orpheline qu'on vient de retirer ci-dessus (sinon la file "à valider" reste polluée
      // jusqu'à ce que le parent clique sur chacune manuellement — le vrai symptôme signalé).
      const filtered = (next.pending || []).filter(k => {
        const base = k.split("#")[0];
        const inst = base.slice(0, base.lastIndexOf("_"));
        return !orphanPendingInstanceIds.has(inst);
      });
      if (filtered.length !== (next.pending || []).length) next = { ...next, pending: filtered };
    }
    if (Array.isArray(next.routines) && next.routines.length) {
      // v2.9.1 (corrigé v2.11.1) — retire les taskIds morts de chaque rituel, À CHAQUE chargement
      // (voir commentaire plus haut) ; un rituel qui devient vide après ce nettoyage est retiré
      // (une carte "rituel vide" n'aide personne) — activeRoutineId remis à null s'il pointait
      // dessus, pour ne jamais laisser l'app référencer un rituel qui n'existe plus.
      const cleaned = next.routines
        .map(r => ({ ...r, taskIds: (r.taskIds || []).filter(id => validInstanceIdsForCleanup.has(id)) }))
        .filter(r => r.taskIds.length > 0);
      const activeStillThere = cleaned.some(r => r.id === next.activeRoutineId);
      next = { ...next, routines: cleaned, activeRoutineId: activeStillThere ? next.activeRoutineId : null };
    }
    return next;
  });
  return {
    ...data,
    config: mergedConfig,
    gameStates: migratedGameStates,
    seenVersions: [...seenVersions, ...newVersions],
    newChangelogVersions: newVersions,
  };
};
