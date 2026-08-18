import { useState, useEffect, useRef, useCallback, useMemo, memo, lazy, Suspense } from "react";
import { SFX, setSfxMuted } from "./sfx.js";
import { CALM, setCalm } from "./calm.js";
import { PLAYER_THEMES, THEME_XP_UNLOCK, PT_LIST, getPlayerTheme, BASE_SHOP_ITEMS, shopItemById, ULTRA_ITEMS, pickUltraLegendary } from "./themes.js";
import { PET_STAGES, PET_DAILY_CAP, gainPet, petLevel, petStage, petBar, mergePetXp, PET_SPRITES, PET_SPRITE_KEY, petSpriteKey, ITEM_SPRITES, renderItemToCtx, PET_ELEMENTS, PET_ELEMENT_KEYS, petTierForLevel, petActiveElement, petIsLegendary, petFormLabel, petPalOverride, petPendingTier, petEvoOptions } from "./pets.js";
import { LEVELS, getLevel, getLevelTitle, xpBar } from "./leveling.js";
import { TASK_CATALOG, CAT_LABELS, DIFF_COLOR, estMinOf, REWARD_CATALOG, weeklyRewards, shopRewardPool, REWARD_CAT_BADGE, REWARD_TIERS, tierOf, RARITIES, rarityOf, PRICE_MULT, baseCost, priceOf, DIFF_PRESETS, CHILD_DIFF_PRESETS, CAT_META, catMeta, normLabel, CAL_TYPES, calEventIcon, calEventIconName, REFUS_MSGS, refusMsg, BADGES, completionCatCounts, mergeCatCounts, checkBadges, dedupeAssignments, assignmentKey } from "./catalog.js";
import { Countdown, HeaderClock, TimeTimerDisc, TaskTimerModal } from "./timers.jsx";
import { PetSprite, ItemSprite, HELD_WEAPON_IDS, AVATAR_EQUIP_ANCHORS, equipAnchorStyle, EquippedGear, badgeSymbol, renderBadgeToCtx, BadgeIcon, CHESTS, pickFromChest, renderChestToCtx, ChestSprite, UIIcon, Coin, Xp } from "./sprites.jsx";
import { Toast, PinDots, PinKeypad, TaskCheck, AnnouncementCountdown } from "./ui.jsx";
// v2.16.60 — `SHOP_UNLOCK_DEFAULT` n'est plus importé ici : le seul site d'App.jsx qui l'utilisait
// (le dénominateur « 0/2 » de la boutique verrouillée) passe maintenant par `rotatingNeed`, qui
// plafonne le seuil au nombre de rotatives réellement proposées. `parentpanel.jsx` (le sélecteur du
// réglage) et `gating.js` continuent de l'importer depuis `shared.js`.
import { DAYS_SHORT, fmtDateShort, displayName, THEMES, uid, _uniq, todayStamp, weekKey, getWeeklyFreeTheme, isThemeUnlocked, resolveRandomTheme, resolveWeekRandomTheme, GLOBAL_CSS, streakOf, appendXpLog, dayOfDoneKey, findCalendarSiblings, calendarUpdatePlan } from "./shared.js";
import { WeekView } from "./weekview.jsx";
import { TaskChooser, CustomTaskModal } from "./taskpickers.jsx";
import { EvolutionModal, PinPad, RewardPopup } from "./popups.jsx";
import { AVATAR_PARTS, DEFAULT_AVATAR, renderAvatarToCtx, AvatarCanvas } from "./avatar.jsx";
import { PlayerProfile } from "./playerprofile.jsx";
import { AvatarPopup } from "./avatarpopup.jsx";
import { DECO_CATALOG, decoForTheme, DecoSprite, HouseScene } from "./house.jsx";
import { spawnParticles } from "./particles.js";
import { InlineRitualTimer } from "./ritualtimer.jsx";
import { isCustodyWeek, custodyWeekKey, generateCustodyWeekAssignments, challengeDaysCount, CHALLENGE_TIERS, carryOverUnfinishedTasks, isValidCustodyWeekKey } from "./recurring.js";
import { LoginScreen } from "./loginscreen.jsx";
import { BOSSES, BossSprite, BOSS_DIFF, ATTACKS, FAMILY_HP_MAX, familyHp, repairDamageFor, bossDamageTotal, bossJetons, heartsRow, bossQuestsAllDone, bossModifierOfDay, bossAtkDamage, PET_ATTACK_COST, petAttackDamage } from "./bosses.jsx";
import { TimerView } from "./timerview.jsx";
import { ENERGY_MAX, currentEnergy, minsToEnergy } from "./energy.js";
import { isMorningLocked, isTimeLocked, rotatingDoneToday, isShopLocked, rotatingRemaining, rotatingNeed, sessionFlushPlan, SESSION_TICK_MS } from "./gating.js";
import { isNewer, mergeGS, mergeFamily } from "./merge.js";
import { STORE_KEY, PULL_FAILED, remotePush, remotePull, save, load, _famSig, getLastSavedAt, setLastSavedAt, wasLastLoadSynced } from "./sync.js";
import { CHANGELOG } from "./changelog.js";
import { migrateSavedData, dedupeUpdateFeed } from "./migrations.js";
import { queueError, peekErrorQueue, dropQueuedErrors } from "./errorlog.js";

// ─── ÉCRANS CHARGÉS À LA DEMANDE (v2.16.43) ──────────────────
// Ces trois écrans pèsent lourd (~1900 lignes cumulées) et ne s'affichent JAMAIS au démarrage :
// l'assistant de configuration ne sert qu'au tout premier lancement, le portail parent qu'après
// un PIN, un mini-jeu qu'après une montée de niveau. Les sortir du fichier principal allège ce
// que le navigateur doit télécharger et exécuter AVANT de montrer quoi que ce soit à l'enfant.
// ⚠️ Il n'y a PAS de service worker ici (`vite.config.js`: `selfDestroying:true`) — un morceau
// chargé à la demande est donc un vrai aller-retour réseau. Pour qu'un wifi qui flanche ne
// bloque jamais l'ouverture du portail parent ou d'un mini-jeu, `usePrefetchLazyScreens`
// ci-dessous va les chercher en tâche de fond dès que la page est au repos, bien avant qu'on en
// ait besoin. Si malgré tout le chargement échoue, l'`ErrorBoundary` de `main.jsx` (v2.16.42)
// affiche l'écran de repli avec son bouton « Recharger » au lieu d'une page blanche.
const SetupWizard = lazy(() => import("./setupwizard.jsx").then(m => ({ default: m.SetupWizard })));
const ParentPanel = lazy(() => import("./parentpanel.jsx").then(m => ({ default: m.ParentPanel })));
const MiniGame    = lazy(() => import("./minigames.jsx").then(m => ({ default: m.MiniGame })));

// Écran d'attente pendant qu'un morceau se télécharge. Volontairement identique à l'écran
// « ⚔️ Chargement… » du démarrage (même fond, même police, même animation) : sur une connexion
// normale il n'apparaît que quelques dizaines de millisecondes, et sur une connexion lente
// l'enfant voit quelque chose de familier plutôt qu'un trou blanc.
function LazyScreenFallback(){
  return <div style={{minHeight:"100vh",background:"#1a1a2e",display:"flex",alignItems:"center",justifyContent:"safe center"}}>
    <style>{GLOBAL_CSS}</style>
    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:12,color:"#D9BC5C",animation:"pulse 1s infinite"}}>⚔️ Chargement…</div>
  </div>;
}

// Même chose, mais pour les deux écrans qui s'ouvrent PAR-DESSUS le jeu (portail parent,
// mini-jeu) : un `position:fixed` par-dessus tout, pour ne pas pousser la mise en page du
// dashboard resté monté derrière.
function LazyOverlayFallback(){
  return <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(26,26,46,0.95)",display:"flex",alignItems:"center",justifyContent:"safe center"}}>
    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:12,color:"#D9BC5C",animation:"pulse 1s infinite"}}>⚔️ Chargement…</div>
  </div>;
}

// Va chercher les morceaux à la demande en tâche de fond, une seule fois, quand le navigateur
// n'a rien de mieux à faire. `import()` met le module en cache : au vrai moment d'ouverture,
// l'affichage est instantané et fonctionne même si le réseau est tombé entre-temps.
// L'assistant de configuration est volontairement EXCLU : soit il est déjà affiché (premier
// lancement), soit il ne servira jamais à cet appareil — le précharger serait du gaspillage.
function usePrefetchLazyScreens(ready){
  useEffect(() => {
    if(!ready) return;
    let cancelled = false;
    const warm = () => {
      if(cancelled) return;
      // Échecs ignorés volontairement : ce n'est qu'un préchargement d'avance. Si ça rate,
      // React refera l'`import()` au moment réel de l'affichage (avec son écran d'attente).
      import("./parentpanel.jsx").catch(()=>{});
      import("./minigames.jsx").catch(()=>{});
    };
    const ric = typeof window !== "undefined" && window.requestIdleCallback;
    const id = ric ? window.requestIdleCallback(warm, { timeout: 4000 }) : setTimeout(warm, 2000);
    return () => { cancelled = true; if(ric) window.cancelIdleCallback?.(id); else clearTimeout(id); };
  }, [ready]);
}

// ⚠️ v2.16.42 — exporté : `main.jsx` le passe à l'`ErrorBoundary` pour horodater un
// plantage de rendu avec la bonne version. Le tableau CHANGELOG vit dans changelog.js.
export const APP_VERSION = "2.16.82";
const BUG_EMAIL = "sturnus.vulgaris.linnaeus@proton.me";
// `weeklyRewards` (rotation quotidienne de la boutique) est dans `src/catalog.js` depuis le
// 2026-08-09 (Lot 5/#24), avec le `REWARD_CATALOG` qu'elle tire au sort.

// ─── CONSTANTS ───────────────────────────────────────────────
const DAYS = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];


// v1.52.0 — `migratePetXpV2`/`PET_LEVELS_OLD` sont dans `src/migrations.js` depuis le 2026-08-06
// (Lot 5/#24) : `migrateGameState`, resté leur seul appelant, est parti dans le même module.
// v1.52.0 — `gainPet` (plafond quotidien d'XP du familier) est dans `src/pets.js` depuis le
// 2026-08-09 (Lot 5/#24), avec le `PET_DAILY_CAP` qu'elle applique.

// ─── ÉNERGIE / SIESTE (frein sain : on ne passe pas la journée dessus) ──────
// L'énergie se RECHARGE toute seule avec le temps réel (pleine en ~3 h).
// Les extras « plaisir » (coffres, jouer) la consomment. Basse → le familier fait une sieste.
// Les quêtes ne sont JAMAIS bloquées (on veut que les corvées se fassent).
// `ENERGY_MAX`/`ENERGY_REGEN_PER_MIN`/`currentEnergy`/`minsToEnergy` — déplacés dans
// `src/energy.js` le 2026-08-06 (Lot 5/#24), partagés avec `merge.js`. Les seuils de coût
// ci-dessous restent ici : ce sont des réglages de gameplay, pas de la mécanique de calcul.
const CHEST_ENERGY = 30;   // ouvrir un coffre coûte de l'énergie
const PLAY_ENERGY  = 20;   // jouer avec le familier
const FEED_ENERGY  = 45;   // nourrir le familier (1×/jour) en redonne
// v1.84.0 (Lot 1 #B3) — le frein énergie s'élargit à la boutique et à l'avatar (browsing "plaisir"
// sans limite naturelle). Volontairement PAS étendu à : (1) le mini-jeu de niveau — récompense
// méritée par un accomplissement (level-up), pas une activité répétée pour tuer le temps; (2) le
// combat de boss — déjà gaté par les jetons (1 par quête complétée), donc déjà lié à l'effort réel;
// l'audit du 16 juin avait explicitement jugé le boss "bien conçu... RAS", ajouter l'énergie par-dessus
// serait redondant et rendrait une activité familiale plus frustrante sans bénéfice.
const SHOP_ENERGY  = 15;   // acheter dans la boutique (magasiner)
const AVATAR_ENERGY= 10;   // ouvrir le personnalisateur de perso
// ─── COMBAT DE BOSS FAMILIAL ──────────────────────────────────
// Logique pure du combat (BOSS_DIFF, ATTACKS, familyHp, bossDamageTotal, bossJetons, heartsRow…)
// déplacée dans `src/bosses.jsx` le 2026-08-06 (Lot 5/#24) — voir l'import en tête de fichier.
// Les trois verrous d'accès (matin, budget-temps, boutique/avatar après X tâches rotatives) sont
// dans `src/gating.js` depuis le 2026-08-08 (Lot 5/#24) — voir l'import en tête de fichier.
// Le reste de la logique pure du combat (verrou des corvées du boss, modificateur du jour,
// dégâts d'attaque et du familier) est dans `src/bosses.jsx` depuis le 2026-08-06 (Lot 5/#24).
// `mergeBossBattle` — déplacée dans `src/merge.js` le 2026-08-06 (Lot 5/#24) : elle n'est
// consommée que par `mergeGS`, elle part donc avec le reste de la couche de fusion.
// Le tirage « Au hasard 🎲 » (`resolveRandomTheme`, `resolveWeekRandomTheme`) est dans
// `src/shared.js` depuis le 2026-08-09 (Lot 5/#24), avec le reste de la sélection de thème
// (`pickStarterThemes`/`getWeeklyFreeTheme`/`isThemeUnlocked`). Les deux cartes de sélecteur
// `RANDOM_THEME_PLAYER`/`RANDOM_THEME_WEEK` qui vivaient ici étaient du code mort (plus aucun
// lecteur dans le dépôt) : retirées, pas déménagées — détail dans `shared.js`.


// ─── STORAGE ─────────────────────────────────────────────────
// ─── CHANGELOG ───────────────────────────────────────────────
// La liste des versions est dans `src/changelog.js` depuis le 2026-08-06 (Lot 5/#24) — deux
// consommateurs : l'affichage des nouveautés ici, et `migrateSavedData` dans `migrations.js`.
// ⚠️ Une nouvelle version s'ajoute EN TÊTE du tableau de `changelog.js`, pas ici.

// Structured for easy Supabase swap: replace save/load with async Supabase calls
// Future: import { saveToSupabase, loadFromSupabase } from './lib/supabase.js'
// ─── PERSISTANCE & SYNC ──────────────────────────────────────
// Toute la couche de persistance/sync (`STORE_KEY`, `remotePush`/`remotePull`, `save`, `load`,
// `_famSig`) est extraite dans `src/sync.js` depuis le 2026-08-06 (Lot 5/#24) — voir l'import en tête.
// `isNewer` et la couche de fusion (`_mergeCalendar`, `mergeGS`, `_mergePlayer`, `mergeFamily`) sont
// dans `src/merge.js` depuis la même date.

// ─── DATA MIGRATION ──────────────────────────────────────────
// `migrateGameState`, `migrateSavedData` et `dedupeUpdateFeed` (avec `migratePetXpV2`) sont dans
// `src/migrations.js` depuis le 2026-08-06 (Lot 5/#24) — voir l'import en tête.

// FUTURE: export family config as JSON for sharing / backup
const exportConfig = (config, gameStates) => {
  const blob = new Blob([JSON.stringify({config, gameStates, exportedAt: new Date().toISOString()}, null, 2)], {type: 'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `livre-de-quetes-${new Date().toISOString().slice(0,10)}.json`; a.click();
};

const importConfig = (file, onSuccess) => {
  const r = new FileReader();
  r.onload = e => { try { const d = JSON.parse(e.target.result); onSuccess(d); } catch { alert('Fichier invalide'); } };
  r.readAsText(file);
};

// ─── UTILS ───────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0,10);

// v2.16.11 (Backlog #12) — easter egg du titre de header, tapé 7 fois d'affilée.
const TITLE_EASTER_EGGS = [
  "🥚 Tu l'as trouvé! Le Livre te trouve très curieux·se aujourd'hui.",
  "🕵️ Secret débloqué : ce titre ne fait absolument rien d'autre que ça.",
  "🐔 Pourquoi le poulet a traversé la route? Pour éviter tes quêtes, évidemment.",
  "✨ Bravo, tu viens de gagner... rien du tout. Mais bravo quand même!",
];

// ═══════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// GAME ENGINE
// ═══════════════════════════════════════════════════════════════


// ─── PLAYER DASHBOARD ────────────────────────────────────────

// v1.101.0 (Lot 5 #23) — memo() : App() passe maintenant des callbacks stabilisés (voir plus bas),
// donc un re-render de App() ne force plus systématiquement un re-render de tout le dashboard.
const PlayerDashboard = memo(function PlayerDashboard({ player, playerIdx, pState, config, assignments, allTasks, allRewards, onRequestComplete, onBuy, onEquip, onChildAddTask, onChildPickTask, onChildAddRoutineTask, onRequestRemoval, onCreateTeamInvite, onRespondTeamInvite, onUpdatePseudo, onRespondOffer, showToast, onFeedPet, onPlayPet, onRenamePet, onChoosePetEvo, onDismissRefusal, onDismissAnnouncement, onBossAttack, onBossPetAttack, onBossFinish, allStates, onLogout, onOpenParentPin, onReportBug, hamOpen, onCloseHam, onUnclaimReward, onHideReward, onClaimDaily, onOpenChest, onUpdateAvatar, parentMode, playerMode, todayDayIdx, onPatchState, onChangeTheme, onDeComplete, onForceComplete, onGoFamily, onGoCalendars, onGoTimer, th, weeklyChallenge, onChallengeCheckin }) {
  const [routineBuilder, setRoutineBuilder] = useState(null); // null | {name, emoji, taskIds:[]}
  const [routineTaskModal, setRoutineTaskModal] = useState(false); // l'enfant crée sa propre tâche pour le rituel
  const [homeTab, setHomeTab] = useState("accueil"); // accueil | jour | sem | shop — barre d'onglets en bas
  const [jourView, setJourView] = useState("today"); // v2.16.31 — Backlog #7+#11 incrément 4/5 : toggle "Aujourd'hui"/"Cette semaine" DANS l'onglet Quêtes (pMode==="week" seulement)
  const [openRoutineGroups, setOpenRoutineGroups] = useState({}); // mode "Tout" : quels rituels sont dépliés
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [bugOpen, setBugOpen] = useState(false); const [bugText, setBugText] = useState("");
  const [pseudoDraft, setPseudoDraft] = useState(""); // l'enfant change son pseudo
  const [pinDraft, setPinDraft] = useState(""); const [pinDraft2, setPinDraft2] = useState(""); // l'enfant change son code
  const [profileMsg, setProfileMsg] = useState("");
  const [themePicker, setThemePicker] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [laterOpen, setLaterOpen] = useState(false); // v1.63.0 — accordéon « tâches planifiées » (replié par défaut)
  const [dailyGoalsOpen, setDailyGoalsOpen] = useState(false); // Backlog UX #13 — accordéon « Défi + Objectifs » (replié par défaut, sous la liste de quêtes)
  const [taskTimerFor, setTaskTimerFor] = useState(null); // Backlog UX #11 — {emoji,label} de la tâche en cours de minutage, ou null
  const [teamPickerFor, setTeamPickerFor] = useState(null); // Backlog #17 — instanceId de la tâche pour laquelle le sélecteur de coéquipier est ouvert, ou null
  // v1.57.0 — évolution du familier équipé en attente d'un choix?
  const _eqPetId = pState.equipped?.pet;
  const _eqPetLv = petLevel((pState.petXp||{})[_eqPetId]||0);
  const _eqPetEvo = (pState.petEvo||{})[_eqPetId];
  const _petPendingTier = _eqPetId ? petPendingTier(_eqPetEvo, _eqPetLv) : 0;
  const [chestReveal, setChestReveal] = useState(null); // {item,dup,chest,refund}
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = pState.settings || { sound:true, calm:false, calmCountdown:false, humor:true, focus:false, fontScale:1, readableFont:false, highContrast:false };
  const setSetting = (key,val)=> onPatchState && onPatchState({ settings: { ...settings, [key]:val } });
  const [shopTab, setShopTab] = useState("rewards");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [timeUnlockOpen, setTimeUnlockOpen] = useState(false); // Backlog #13 — code parent pour prolonger si le budget-temps est atteint
  // Refonte visuelle Phase 5 — avatar vivant : humeur temporaire (non persistée), revient à
  // "neutral" après `ms`. "tired" est calculé en continu (pas un minuteur) : ≥19h ET plus aucune
  // quête restante aujourd'hui — pas de sprite sheet, juste une surcharge canvas (avatar.jsx).
  const [avatarMood, setAvatarMood] = useState("neutral");
  const moodTimerRef = useRef(null);
  const setMoodFor = (mood, ms)=>{
    clearTimeout(moodTimerRef.current);
    setAvatarMood(mood);
    moodTimerRef.current = setTimeout(()=>setAvatarMood("neutral"), ms);
  };
  useEffect(()=>()=>clearTimeout(moodTimerRef.current),[]);
  // v1.84.0 (Lot 1 #B3) — ouvrir le personnalisateur coûte de l'énergie (frein "plaisir")
  // v2.16.7 — Chantier 6.6 : verrou du matin (parent-contrôlé) — cadrage ludique, jamais "verrouillé".
  const openAvatar = ()=>{
    if(isMorningLocked(player)){ showToast&&showToast("🚪 Les autres salles du Livre se réveillent après tes tâches du matin!","#D9BC5C",3500); return; }
    if(isShopLocked(config,pState,assignments,player.id,myAssignments)){ const need=rotatingRemaining(config,pState,assignments,player.id,myAssignments); showToast&&showToast(`🔒 Fais encore ${need} tâche${need>1?"s":""} rotative${need>1?"s":""} aujourd'hui pour débloquer ton perso!`,"#D9BC5C",3500); return; }
    if(currentEnergy(pState)<AVATAR_ENERGY){ const m=minsToEnergy(pState,AVATAR_ENERGY); showToast&&showToast(`😴 Ton héros se repose… reviens dans ~${m} min pour changer de look!`,"#85CDD1",3500); return; }
    onPatchState&&onPatchState({energy:Math.max(0,currentEnergy(pState)-AVATAR_ENERGY),energyTs:new Date().toISOString()});
    setAvatarOpen(true);
  };
  // v2.16.7 — Chantier 6.6 : si le verrou du matin démarre PENDANT que l'enfant est déjà sur la
  // boutique (ou avait le popup avatar ouvert), on le ramène en douceur — jamais de piège.
  useEffect(()=>{
    if(isMorningLocked(player)){
      if(homeTab==="shop") setHomeTab("accueil");
      if(avatarOpen) setAvatarOpen(false);
    }
  },[player.morningLock, homeTab, avatarOpen]);
  // Largeur de la bannière « Ma maison » (accueil) — pleine largeur du contenu, plafonnée.
  const bannerW = Math.min(680, (typeof window!=="undefined"?window.innerWidth:360)-16);
  const [themeRevealed, setThemeRevealed] = useState(false);
  const [badgeInfo, setBadgeInfo] = useState(null); // badge tapé → bulle d'info (tablette-friendly)
  const [petNickEditing, setPetNickEditing] = useState(false);
  const [petNickDraft, setPetNickDraft] = useState("");
  const T = th;
  // Resolve random theme per player (stable per session via player.id)
  const resolvedThemeId = player.themeId==="random"
    ? (themeRevealed ? resolveRandomTheme(player.id) : "none")
    : player.themeId;
  const pt = getPlayerTheme(resolvedThemeId);
  const isRandomUnrevealed = player.themeId==="random" && !themeRevealed;
  const lv = getLevel(pState.xp);
  const lvTitle = getLevelTitle(pState.xp, player.themeId, settings.femTitles);
  const xbr = xpBar(pState.xp);
  const xpPct = Math.min(100, (xbr.cur/xbr.needed)*100);
  // Refonte visuelle Phase 5 (suite) — "proud" (badge gagné ou niveau monté) et "levelup" (victoire
  // de boss réclamée pour ce joueur) détectés localement par comparaison à la valeur précédente,
  // sans prop drilling depuis App() : badges/niveau/bossClaimed sont déjà dans `pState`.
  const prevBadgeCountRef = useRef((pState.badges||[]).length);
  const prevLevelRef = useRef(lv.level);
  const prevBossClaimedRef = useRef(pState.bossClaimed);
  useEffect(()=>{
    const badgeCount=(pState.badges||[]).length;
    if(badgeCount>prevBadgeCountRef.current) setMoodFor("proud",4000);
    prevBadgeCountRef.current=badgeCount;
  },[pState.badges]);
  useEffect(()=>{
    if(lv.level>prevLevelRef.current) setMoodFor("proud",4000);
    prevLevelRef.current=lv.level;
  },[lv.level]);
  useEffect(()=>{
    if(pState.bossClaimed && pState.bossClaimed!==prevBossClaimedRef.current) setMoodFor("levelup",4000);
    prevBossClaimedRef.current=pState.bossClaimed;
  },[pState.bossClaimed]);
  const pMode = playerMode || config.mode || "routine";
  // v2.16.55 — une seule carte par assignation réellement distincte. Les 67 copies exactes déjà
  // présentes en prod (voir `dedupeAssignments`, catalog.js) donnaient à l'enfant 3 à 5 cases à
  // cocher pour la MÊME tâche : cocher l'une n'éteint pas les autres (la clé de complétion contient
  // l'`instanceId`). Filtre de vue seulement — rien n'est supprimé, et les `instanceId` cités par
  // ses rituels sont ceux qu'on garde en priorité pour qu'un rituel ne perde jamais une entrée.
  // v2.16.58 — le regroupement passe du `taskId` au LIBELLÉ (3e arg `labelOf`) : les vieilles copies
  // de tâches perso ont chacune leur propre `taskId`, donc v2.16.55 ne les voyait pas. Et les cases
  // DÉJÀ COCHÉES aujourd'hui rejoignent `ritualInstIds` dans les `instanceId` prioritaires, pour que
  // le jour de la mise à jour aucun enfant ne voie une case qu'il venait de cocher se volatiliser.
  const ritualInstIds = useMemo(()=>{
    const s=new Set(); for(const r of (pState.routines||[])) for(const id of (r.taskIds||[])) s.add(id); return s;
  },[pState.routines]);
  // v2.16.61 — les quêtes que l'enfant vient d'ajouter lui-même portent `childAdded` : elles
  // rejoignent les `instanceId` prioritaires de la dédup, sinon une quête ajoutée dont le libellé
  // existe déjà ailleurs (autre rituel, autre heure) se faisait replier sur la copie déjà là —
  // donc « ajoutée! » puis rien à l'écran, le même symptôme que le filtre de rituel corrigé plus bas.
  const childAddedIds = useMemo(
    ()=>new Set((assignments||[]).filter(a=>a && a.childAdded).map(a=>a.instanceId)),
    [assignments]
  );
  const keptInstIds = useMemo(()=>{
    const s=new Set([...ritualInstIds, ...childAddedIds]);
    const suffix="_"+player.id+"#"+todayStamp();
    for(const k of [...(pState.completed||[]), ...(pState.pending||[])])
      if(typeof k==="string" && k.endsWith(suffix)) s.add(k.slice(0, k.length-suffix.length));
    return s;
  },[ritualInstIds, childAddedIds, pState.completed, pState.pending, player.id]);
  const labelOfTask = useMemo(()=>{
    const m=new Map((allTasks||[]).map(t=>[t.id,t.label]));
    return (id)=>m.get(id)||"";
  },[allTasks]);
  const allMine = useMemo(
    ()=>dedupeAssignments(assignments.filter(a=>a.playerIds.includes(player.id)), keptInstIds, labelOfTask),
    [assignments, player.id, keptInstIds, labelOfTask]
  );
  const isWeekAss = (a)=> Array.isArray(a.days) && a.days.length>0;
  const routineMine = allMine.filter(a=>!isWeekAss(a));
  const weekMine = allMine.filter(isWeekAss);
  const myRoutines = pState.routines || [];
  const activeRoutine = pMode==="routine" && pState.activeRoutineId ? myRoutines.find(r=>r.id===pState.activeRoutineId) : null;
  // v1.68.0 (B5) — Fête quand un rituel est complété AU COMPLET (toutes ses tâches faites/en attente
  // aujourd'hui). Avant : finir un rituel ne donnait rien de spécial. 1× par rituel par jour (garde
  // ritualCelebrated, merge-safe). Pas d'XP ici (l'XP vient des quêtes/du minuteur) → 0 risque d'éco.
  const [ritualWin, setRitualWin] = useState(null); // {name, emoji}
  useEffect(()=>{
    if(parentMode) return;
    const day=todayStamp();
    const rc=(pState.ritualCelebrated && pState.ritualCelebrated.day===day) ? (pState.ritualCelebrated.ids||[]) : [];
    const isDone=k=>(pState.completed?.includes(k))||(pState.pending?.includes(k));
    const fresh=[];
    for(const r of (pState.routines||[])){
      const items=(routineMine||[]).filter(a=>r.taskIds?.includes(a.instanceId));
      if(items.length>0 && !rc.includes(r.id) && items.every(a=>isDone(a.instanceId+"_"+player.id+"#"+day))) fresh.push(r);
    }
    if(fresh.length){
      onPatchState&&onPatchState({ ritualCelebrated:{ day, ids:[...rc, ...fresh.map(r=>r.id)] } });
      try{ if(!CALM) spawnParticles(fresh[0].emoji||"⏰"); SFX.epic&&SFX.epic(); }catch{}
      setRitualWin({ name:fresh[0].name, emoji:fresh[0].emoji||"⏰", n:fresh.length });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pState.completed, pState.pending]);
  // v1.87.0 (Lot 3 #16) — message "Nouvelle journée!" au premier retour dans l'app un jour différent :
  // explique pourquoi les tâches sont "décochées" (reset quotidien par clé datée) au lieu de laisser
  // l'enfant deviner. Une fois par ouverture (au montage), pas à chaque re-render.
  useEffect(()=>{
    if(parentMode) return;
    const today=todayStamp();
    if(pState.lastSeenDay && pState.lastSeenDay!==today){
      showToast&&showToast("🌅 Nouvelle journée! Tes routines sont prêtes.","#85CDD1",4000);
    }
    if(pState.lastSeenDay!==today){ onPatchState&&onPatchState({lastSeenDay:today}); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  // Vue Semaine : on met en avant les tâches d'AUJOURD'HUI; le reste de la semaine va dans une section grisée
  const todayWeek = weekMine.filter(a=>Array.isArray(a.days)&&a.days.includes(todayDayIdx));
  const laterWeek = weekMine.filter(a=>!(Array.isArray(a.days)&&a.days.includes(todayDayIdx)));
  // Tâches affichées selon le mode choisi par l'enfant (l'XP des deux se cumule)
  // - mode semaine → tâches d'aujourd'hui
  // - routine ciblée → seulement les tâches choisies pour cette routine
  // - mode routine sans routine ciblée → toutes les tâches de routine
  // v2.6.0 — les quêtes de réparation 🕊️ sont TOUJOURS visibles, peu importe le mode (semaine/rituel)
  // ou le rituel actif : elles concernent la journée et tous les enfants sélectionnés doivent les voir.
  // v2.16.61 — MÊME RAISON pour les quêtes que l'enfant ajoute lui-même avec « ➕ Ajouter une quête
  // à ma journée ». En mode Rituel ⏰ avec un rituel sélectionné, la liste affichée est filtrée sur
  // `activeRoutine.taskIds` — or une quête tout juste ajoutée n'appartient à AUCUN rituel (son
  // `instanceId` vient d'être créé). L'enfant lisait « ➕ Quête ajoutée à ta journée! » et la carte
  // n'apparaissait nulle part : c'est le motif exact de trois signalements ouverts depuis le 31
  // juillet (« ajout de quête, ça dit c'Est ajouté, mais ça apparait pas », « jai cree une tache est
  // elle est nule par », « Je peut pas ajouter dotre tache »). Mesuré sur la donnée de prod du 13
  // août : les QUATRE enfants ont un rituel actif (« Routine du matin »), et deux d'entre eux sont
  // en mode Rituel — Elli voit 6 de ses 87 assignations de rituel, Olivier 6 sur 60.
  const repairMine = allMine.filter(a=>a.repair);
  const modeMine = (pMode==="week"
    ? todayWeek
    : (activeRoutine ? routineMine.filter(a=>activeRoutine.taskIds?.includes(a.instanceId)) : routineMine)
  ).filter(a=>!a.repair);
  const childAddedMine = allMine.filter(a=>a.childAdded && !a.repair);
  const _mySeen = new Set();
  const myAssignments = [...repairMine, ...[...modeMine, ...childAddedMine].filter(a=>{
    if(_mySeen.has(a.instanceId)) return false; _mySeen.add(a.instanceId); return true;
  })];
  // Refonte visuelle Phase 5 — humeur affichée sur l'avatar du header : un événement (happy au
  // tap, voir requestComplete plus bas) est prioritaire ; sinon "tired" si ≥19h ET plus aucune
  // quête restante aujourd'hui (fin de journée paisible, pas un reproche — jamais si 0 quête).
  const _todayDoneKey = a=>a.instanceId+"_"+player.id+"#"+todayStamp();
  const _allDoneToday = myAssignments.length>0 && myAssignments.every(a=>pState.completed?.includes(_todayDoneKey(a)));
  const dashboardMood = avatarMood!=="neutral" ? avatarMood : (new Date().getHours()>=19 && _allDoneToday ? "tired" : "neutral");
  const themedCat = pt.shopCategory;
  const SHOP_TABS = { rewards:"🎁 Récompenses", hats:"🎩 Chapeaux", armors:"🛡️ Armures", pets:"🐾 Familiers", deco:"🏠 Maison", skins:"✨ Spécial", ...(themedCat.items.length>0?{[themedCat.id]:themedCat.label}:{}) };
  // Refonte Phase 7 — icônes pixel art des onglets boutique (repli = l'emoji du libellé).
  // Le libellé SHOP_TABS garde son emoji en tête de string : au rendu on le sépare pour
  // afficher <UIIcon> + texte (l'onglet thématique n'a pas de sprite dédié → emoji).
  const SHOP_TAB_ICONS = { rewards:"shop_rewards", hats:"shop_hats", armors:"shop_armors", pets:"shop_pets", deco:"shop_house", skins:"shop_special" };
  const splitEmojiLabel = (l)=>{ const m=/^(\S+)\s+(.*)$/.exec(l||""); return m?[m[1],m[2]]:[null,l]; };
  // Ma maison (2026-07-27) — items déco visibles : génériques + ceux du thème ACTIF seulement
  const decoItems = decoForTheme(player.themeId||"none");
  const SHOP_ITEMS = BASE_SHOP_ITEMS;
  const eq = pState.equipped || {};
  // hat/armor/pet resolved via allShopItemsFlat after it's declared below

  // Récompenses ALÉATOIRES du jour (reset quotidien); les cachées laissent place à de nouvelles
  const _hiddenRw = (pState.hiddenWeek===todayStamp() ? (pState.hiddenRewards||[]) : []);
  // v2.16.56 — le tirage part du bassin choisi par le parent (étape 3 de l'assistant : cases cochées
  // + récompenses maison), plus de REWARD_CATALOG en dur. Voir shopRewardPool (catalog.js).
  const _rwPool = shopRewardPool(config);
  const _rwDrawn = weeklyRewards(_rwPool.length, _rwPool).filter(r=>!_hiddenRw.includes(r.id)).slice(0,8);
  // v2.16.59 — une récompense DÉJÀ ACHETÉE reste affichée même quand le tirage du jour ne la sort
  // pas. Cette grille est le SEUL endroit du jeu qui montre `boughtRewards` : c'est là que vivent
  // « RÉCLAMÉ! », « ↩️ J'ai changé d'idée » et « ✓ Cacher ». Tant que le tirage était figé (cf.
  // `mixSeed`), une récompense achetée restait à l'écran par accident ; le réparer l'aurait fait
  // disparaître dès le lendemain, sans aucune autre surface pour la retrouver. Le défaut existait
  // déjà pour toute récompense achetée sous une AUTRE sélection de parent : en prod ce soir, Elli
  // a payé « Manger un bonbon » (rw_bonbon) et la carte n'est nulle part sur son écran, parce que
  // le bassin actuel (`selectedRewards`) ne la contient plus. On repêche dans `allRewards`
  // (catalogue + récompenses maison), pas dans le bassin, sinon le repêchage aurait le même trou.
  const _rwBought = (pState.boughtRewards||[])
    .filter(id => !_hiddenRw.includes(id) && !_rwDrawn.some(r=>r.id===id))
    .map(id => (allRewards||[]).find(r=>r.id===id))
    .filter(Boolean);
  const myRewards = [..._rwBought, ..._rwDrawn];
  const allShopItemsFlat = [
    ...SHOP_ITEMS.hats, ...SHOP_ITEMS.armors, ...SHOP_ITEMS.pets,
    ...(pt.shopCategory?.items||[]),
  ];

  // Backlog #13 — budget-temps quotidien : une fois le plafond du jour atteint, le dashboard est
  // remplacé par un écran de pause (jamais les mots "verrouillé"/"interdit", même cadrage anti-punitif
  // que le verrou du matin v2.16.7). Un parent peut prolonger avec son code — remet le compteur à 0
  // (extension accordée) sans faire sortir l'enfant de sa session.
  if (!parentMode && isTimeLocked(player, pState)) {
    return (
      <div style={{minHeight:"60vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",padding:24,textAlign:"center"}}>
        <div style={{fontSize:56,marginBottom:14}}>🛌</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(11px,1.8vw,15px)",color:th.accent,marginBottom:10}}>C'EST L'HEURE DE LA PAUSE!</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"var(--txt-pale,#aaa)",maxWidth:320,lineHeight:1.4,marginBottom:22}}>Tu as atteint ton temps de jeu pour aujourd'hui. Demande à un parent si tu veux continuer un peu.</div>
        <button className="btn-press" onClick={()=>{SFX.click();setTimeUnlockOpen(true);}}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"12px 22px",background:th.accent,color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:8,cursor:"pointer",boxShadow:"3px 3px 0 #0d0d0d"}}>
          🔓 Déverrouiller
        </button>
        {timeUnlockOpen && (
          <PinPad pin={config.pin} label="Code parent" th={th}
            onSuccess={()=>{ setTimeUnlockOpen(false); onPatchState&&onPatchState({sessionMinutes:{day:todayStamp(),minutes:0}}); }}
            onCancel={()=>setTimeUnlockOpen(false)}/>
        )}
      </div>
    );
  }

  return (
    // v1.87.0 (Lot 3 #12) — accessibilité texte : `zoom` (pas `fontSize`/`rem`) car TOUT le style de
    // l'app est en px/clamp() littéraux, pas en unités relatives — zoom est la seule façon de tout
    // agrandir (texte ET boutons ET espacements) sans réécrire des centaines de styles inline.
    // `readable-font` (classe CSS, voir GLOBAL_CSS) bascule la police pixel-art vers une police
    // système lisible via un sélecteur global — même raison, pas de réécriture site-wide possible ici.
    <div className={settings.readableFont?"readable-font":undefined} style={{display:"flex",flexDirection:"column",gap:10,padding:"10px 8px 92px",zoom:settings.fontScale||1}}>
      {/* v1.68.0 (B5) — bannière de fin de rituel (toute une routine complétée) */}
      {ritualWin && (
        <div onClick={()=>setRitualWin(null)} style={{position:"fixed",inset:0,zIndex:2600,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"center",justifyContent:"safe center",padding:16,overflowY:"auto",cursor:"pointer"}}>
          <div style={{maxWidth:360,width:"100%",maxHeight:"90vh",overflowY:"auto",textAlign:"center",background:"linear-gradient(160deg,#173a17,#0c220c)",border:`3px solid ${th.accent||"#5CAD68"}`,borderRadius:14,padding:"26px 22px",boxShadow:"0 0 26px rgba(46,204,64,0.5)"}}>
            <div style={{fontSize:60,lineHeight:1}}>{ritualWin.emoji}</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.7vw,14px)",color:th.accent||"#5CAD68",margin:"12px 0 6px"}}>RITUEL COMPLÉTÉ!</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#fff",lineHeight:1.3}}>Bravo, tu as fini « {ritualWin.name} » au complet! 🎉</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#9ad29a",marginTop:8}}>Quelle belle job. 👏</div>
            <button className="btn-press" onClick={(e)=>{e.stopPropagation();setRitualWin(null);}} style={{marginTop:16,fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 22px",background:th.accent||"#5CAD68",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:8,cursor:"pointer",boxShadow:"3px 3px 0 #0d0d0d"}}>YEAH!</button>
          </div>
        </div>
      )}
      {/* ✨ Évolution du familier — choix d'une voie élémentaire (niveaux 4/8/12) */}
      {!parentMode && _petPendingTier>0 && _eqPetId && (
        <EvolutionModal petId={_eqPetId} tier={_petPendingTier} evo={_eqPetEvo} th={th}
          onChoose={(el)=>{ onChoosePetEvo && onChoosePetEvo(_eqPetId, _petPendingTier, el); }}/>
      )}
      {/* v1.64.0 — message drôle quand une quête a été refusée par le parent */}
      {!parentMode && (pState.refusals||[]).map(r=>(
        <div key={r.key} style={{display:"flex",alignItems:"center",gap:10,background:"#3a2410",border:"2px solid #D99248",borderRadius:8,padding:"9px 11px"}}>
          <span style={{fontSize:20}}>{r.emoji}</span>
          <span style={{flex:1,fontFamily:"'VT323',monospace",fontSize:15,color:"#FFD7A0",lineHeight:1.3}}><b>{r.label}</b> — {r.msg}</span>
          <button onClick={()=>{ if(SFX.click)SFX.click(); onDismissRefusal&&onDismissRefusal(r.key); }} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"6px 9px",background:"#D99248",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:"pointer",whiteSpace:"nowrap"}}>Archiver</button>
        </div>
      ))}
      {/* ☰ Menu (déclenché depuis le header) — méta : réglages, archives, bug, validation parent, quitter */}
      {hamOpen && (
        <div onClick={()=>onCloseHam&&onCloseHam()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2600,display:"flex",justifyContent:"flex-end"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:pt.bg||"#1a1a2e",borderLeft:`3px solid ${pt.accent||player.color}`,width:"min(280px,82vw)",height:"100%",padding:16,display:"flex",flexDirection:"column",gap:10,overflowY:"auto",boxShadow:"-6px 0 24px rgba(0,0,0,0.5)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,11px)",color:pt.accent||player.color}}>☰ Menu</div>
              <button onClick={()=>onCloseHam&&onCloseHam()} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"5px 10px",background:"#222",color:"var(--txt-muted,#888)",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
            </div>
            {[
              ["⚙️ Mes réglages", ()=>{onCloseHam&&onCloseHam();setSettingsOpen(true);}],
              ["🗄️ Archives", ()=>{onCloseHam&&onCloseHam();setArchivesOpen(true);}],
              ["🐛 J'ai trouvé un bug", ()=>{onCloseHam&&onCloseHam();setBugOpen(true);}],
              ["🔓 Validation parent", ()=>{onCloseHam&&onCloseHam();onOpenParentPin&&onOpenParentPin();}],
              ["🚪 Quitter / changer d'enfant", ()=>{onCloseHam&&onCloseHam();onLogout&&onLogout();}],
            ].map(([lbl,fn])=>(
              <button key={lbl} onClick={fn}
                style={{textAlign:"left",fontFamily:"'VT323',monospace",fontSize:17,padding:"12px 14px",background:"rgba(0,0,0,0.4)",color:"#ddd",border:`2px solid ${(pt.accent||player.color)}33`,borderRadius:8,cursor:"pointer"}}>{lbl}</button>
            ))}
          </div>
        </div>
      )}
      {/* 🗄️ Archives — quêtes complétées (aujourd'hui) */}
      {archivesOpen && (()=>{
        const stamp="#"+todayStamp();
        const done=(pState.completed||[]).filter(k=>k.endsWith(stamp));
        const rows=done.map(k=>{ const base=k.split("#")[0]; const inst=base.slice(0,base.lastIndexOf("_")); const ass=(config.assignments||[]).find(a=>a.instanceId===inst); const t=ass?allTasks.find(x=>x.id===ass.taskId):null; const ts=(pState.completedAt||{})[k]; const time=ts?new Date(ts).toLocaleTimeString("fr-CA",{hour:"2-digit",minute:"2-digit"}):""; const cat=t?.cat; return { emoji:t?.emoji||"✅", label:t?.label||(inst.startsWith("cal_")?"Devoir/examen":"Quête"), time, cat }; }).sort((a,b)=>(b.time||"").localeCompare(a.time||""));
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:2600,display:"flex",flexDirection:"column",padding:16,overflowY:"auto",maxWidth:640,margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:pt.accent||player.color}}>🗄️ Archives — aujourd'hui</div>
              <button onClick={()=>setArchivesOpen(false)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"6px 12px",background:"#222",color:"var(--txt-muted,#888)",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-muted,#888)",marginBottom:8}}>Tes quêtes complétées aujourd'hui ({rows.length}) :</div>
            {rows.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"var(--txt-faint,#555)",textAlign:"center",padding:18}}>Rien encore aujourd'hui. Fais une quête! 💪</div>}
            {rows.map((r,i)=>{ const m=r.cat?catMeta(r.cat):null; return (<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",background:"rgba(0,0,0,0.4)",border:"1px solid #2a2a2a",borderRadius:6,marginBottom:5}}><span style={{fontSize:18}}>{r.emoji}</span><span style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#5CAD68",flex:1}}>{r.label}{m?<span style={{color:m.color,fontSize:13}}> · {m.label}</span>:""}</span>{r.time&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-muted,#888)"}}>{r.time}</span>}<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5CAD68"}}>✅</span></div>); })}
            <button onClick={()=>setArchivesOpen(false)} style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"13px",marginTop:8,background:pt.accent||player.color,color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer"}}>← Retour</button>
          </div>
        );
      })()}
      {/* 🐛 Signaler un bug → envoyé au parent */}
      {bugOpen && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:2600,display:"flex",flexDirection:"column",padding:16,overflowY:"auto",maxWidth:640,margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:"#D99248"}}>🐛 J'ai trouvé un bug</div>
            <button onClick={()=>{setBugOpen(false);setBugText("");}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"6px 12px",background:"#222",color:"var(--txt-muted,#888)",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginBottom:6}}>Explique ce qui ne marche pas — ton parent va le recevoir :</div>
          <textarea value={bugText} onChange={e=>setBugText(e.target.value.slice(0,300))} autoFocus placeholder="ex: quand je clique sur..., il se passe..."
            style={{fontFamily:"'VT323',monospace",fontSize:16,padding:"10px 12px",background:"#111",color:"#fff",border:"2px solid #D99248",borderRadius:6,outline:"none",minHeight:120,resize:"vertical"}}/>
          <button className="btn-press" disabled={!bugText.trim()} onClick={()=>{ if(bugText.trim()&&onReportBug){ const ok=onReportBug(bugText.trim()); if(ok){setBugOpen(false);setBugText("");} } }}
            style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.2vw,11px)",padding:"15px",marginTop:10,background:bugText.trim()?"#D99248":"#333",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:8,cursor:bugText.trim()?"pointer":"not-allowed",opacity:bugText.trim()?1:0.5,boxShadow:"2px 2px 0 #0d0d0d"}}>📨 Envoyer au parent</button>
        </div>
      )}
      {homeTab==="accueil" && (<>
      {/* ── v2.6.0 ANNONCES PARENT ──────────────────────────────── */}
      {!parentMode && (config.announcements||[])
        .filter(a=> !a.expiresAt || a.expiresAt >= todayStamp())
        .filter(a=> a.targetAll || (a.targetPlayerIds||[]).includes(player.id))
        .filter(a=> !(pState.dismissedAnnouncements||[]).includes(a.id))
        .map(a=>(
          <div key={a.id} style={{background:a.secret?"rgba(180,120,0,0.22)":"rgba(60,160,60,0.15)",
            border:`2px solid ${a.secret?"#C8942A":"#4CAF50"}`,borderRadius:10,padding:14,marginBottom:4}}>
            {a.secret && <div style={{color:"#FFB300",fontWeight:"bold",fontSize:11,marginBottom:6,letterSpacing:1,fontFamily:"'Press Start 2P',monospace"}}>🤫 MESSAGE SECRET</div>}
            {a.title && <div style={{color:"#FFD54F",fontWeight:"bold",fontSize:16,marginBottom:10,
              letterSpacing:0.3,textAlign:"center",lineHeight:1.3,fontFamily:"'Press Start 2P',monospace"}}>{a.title}</div>}
            <div style={{fontSize:15,lineHeight:1.5,fontFamily:"'VT323',monospace",color:"#eee"}}>{a.emoji} {a.text}</div>
            {a.countdownTo && <AnnouncementCountdown target={a.countdownTo} label={a.countdownLabel} doneText={a.countdownDoneText}/>}
            {(a.sharedTasks||[]).length>0 && <><div style={{marginTop:12,fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"var(--txt-pale,#aaa)",letterSpacing:0.5}}>{a.sharedTasksLabel || (a.countdownTo ? "AVANT 10H30 :" : "À FAIRE :")}</div>
              {(a.sharedTasks||[]).map((t,i)=><TaskCheck key={i} text={t}/>)}</>}
            {((a.playerTasks||{})[player.id]||[]).length>0 && <><div style={{marginTop:10,fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"var(--txt-pale,#aaa)",letterSpacing:0.5}}>{a.playerTasksLabel || "TES MISSIONS (dans la journée) :"}</div>
              {((a.playerTasks||{})[player.id]||[]).map((t,i)=><TaskCheck key={i} text={t}/>)}</>}
            <button onClick={()=>{if(SFX.click)SFX.click();onDismissAnnouncement&&onDismissAnnouncement(a.id);}}
              style={{marginTop:12,padding:"8px 16px",borderRadius:8,fontFamily:"'Press Start 2P',monospace",
                fontSize:8,background:"#333",border:"2px solid #555",color:"#eee",cursor:"pointer",display:"block",width:"100%"}}>
              {a.dismissLabel || "🤐 Compris, je reste discret·e !"}
            </button>
          </div>
        ))
      }
      {/* Player header card */}
      <div style={{background:"rgba(0,0,0,0.5)",border:`2px solid #2a2a2a`,borderTop:`3px solid ${player.color}`,borderRadius:8,padding:14,display:"flex",gap:12,alignItems:"center"}}>
        {/* Avatar — clickable → opens creator/inventory */}
        <div style={{position:"relative",flexShrink:0,cursor:"pointer"}} onClick={openAvatar} title="Personnaliser mon perso">
          <AvatarCanvas avatarDef={pState.avatar||DEFAULT_AVATAR} bodyColor={pt.charBodyColor||player.color} size={72} mood={dashboardMood}
            style={{border:`4px solid ${pt.accent||player.color}`,boxShadow:`0 0 14px ${pt.glow||player.color}50`,display:"block"}}/>
          {/* v1.81.0 — ancré sur la vraie géométrie du corps (EquippedGear), voir plus haut */}
          <EquippedGear eq={eq} items={allShopItemsFlat} size={72} avatarDef={pState.avatar}/>
          {eq.pet   && (petSpriteKey(eq.pet) ? <div style={{position:"absolute",bottom:-8,left:-10,pointerEvents:"none"}}><PetSprite itemId={eq.pet} size={30}/></div> : <span style={{position:"absolute",bottom:-8,left:-6,fontSize:18,pointerEvents:"none"}}>{allShopItemsFlat.find(i=>i.id===eq.pet)?.emoji}</span>)}
          <div style={{position:"absolute",bottom:-18,left:"50%",transform:"translateX(-50%)",fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"var(--txt-faint,#555)",whiteSpace:"nowrap"}}>✏️ Modifier</div>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.4vw,14px)",color:player.color,marginBottom:3}}>{displayName(player)}</div>
          {isRandomUnrevealed
            ? <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#D9BC5C",marginBottom:5}}>❓ THÈME MYSTÈRE</div>
            : <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:pt.accent||"var(--txt-pale,#aaa)",marginBottom:5,textShadow:`0 0 8px ${pt.glow}60`}}>Niv.{lvTitle.level} — {lvTitle.title}</div>
          }
          {isRandomUnrevealed && <button className="btn-press" onClick={()=>{setThemeRevealed(true);SFX.epic();spawnParticles("🎲");}}
            style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"6px 12px",background:"linear-gradient(90deg,#D97070,#D9BC5C,#44FF44)",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:3,cursor:"pointer",boxShadow:"3px 3px 0 #0d0d0d",marginBottom:4}}>
            🎲 RÉVÉLER MON THÈME!
          </button>}
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1",marginBottom:2}}>⚡ XP {pState.xp}</div>
          <div style={{height:9,background:"#111",border:"2px solid #333",borderRadius:1,overflow:"hidden",marginBottom:6}}>
            <div style={{height:"100%",width:xpPct+"%",background:`linear-gradient(90deg,${player.color},#85CDD1)`,transition:"width 0.8s ease"}}/>
          </div>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.2vw,12px)",color:"#D9BC5C"}}><Coin size={14}/> {pState.coins} {pt.coinName||"pièces"}</div>
          {/* v1.84.0 (Lot 1 #B3) — sieste visible ICI aussi (pas juste sur la carte familier) dès
              qu'au moins une activité plaisir (boutique/avatar) est bloquée par l'énergie */}
          {(()=>{ const cur=currentEnergy(pState); const thresh=Math.max(SHOP_ENERGY,AVATAR_ENERGY);
            if(cur>=thresh) return null;
            const m=minsToEnergy(pState,thresh);
            return <div style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#85CDD1",marginTop:3}}>😴 Ton héros se repose… prêt dans ~{m} min</div>;
          })()}
        </div>
      </div>

      {/* Boutons thème + réglages */}
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>{SFX.click();setThemePicker(true);}}
          style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px",background:"rgba(0,0,0,0.4)",border:`2px solid ${pt.accent||player.color}55`,color:pt.accent||player.color,borderRadius:5,cursor:"pointer"}}>
          🎨 Thème : {pt.name}
        </button>
        <button onClick={()=>{SFX.click();setSettingsOpen(true);}} title="Mes réglages (son, animations…)"
          style={{flexShrink:0,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 12px",background:"rgba(0,0,0,0.4)",border:"2px solid #555",color:"#bbb",borderRadius:5,cursor:"pointer"}}>
          ⚙️
        </button>
      </div>

      {/* 🔥 Série + 🐾 Familier vivant (énergie / sieste / nourrir / jouer) */}
      {(()=>{
        const acc=pt.accent||player.color;
        const streak=streakOf(pState.activeDays);
        // v2.5.21 — fallback sur le catalogue complet (pas seulement le thème courant) : un familier gagné
        // en récompense de boss (pickUltraLegendary, toutes thèmes confondus) ou équipé avant un changement
        // de thème hebdomadaire n'était plus trouvé dans allShopItemsFlat (scopé au thème actuel) → la carte
        // familier retombait sur "Pas de familier équipé" malgré owned[]/equipped.pet valides (perte purement
        // visuelle, aucune donnée perdue).
        const eqPet=allShopItemsFlat.find(i=>i.id===eq.pet) || shopItemById(eq.pet);
        const cur=currentEnergy(pState);
        const fedToday=pState.lastFedDay===todayStamp();
        const eColor=cur>=60?"#5CAD68":cur>=30?"#D9BC5C":"#D98C8C";
        const napping=cur<PLAY_ENERGY;
        // v2.15.7 (demande de Gen, 2026-07-28) : depuis v2.11.3, jouer restait TOUJOURS permis même
        // plafond atteint (seul le message changeait, honnêtement) — décision volontaire à l'époque.
        // Gen veut maintenant un vrai blocage visuel du bouton une fois le plafond quotidien atteint.
        const capReached = pState.petDay?.day===todayStamp() && (pState.petDay.xp||0) >= PET_DAILY_CAP;
        return (
          <div style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${acc}55`,borderRadius:8,padding:12,display:"flex",flexDirection:"column",gap:10}}>
            {/* Série */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:streak>0?"#D99248":"var(--txt-dim,#666)"}}>🔥 Série : {streak} jour{streak>1?"s":""}</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:12,color:"var(--txt-soft,#777)"}}>{streak>0?"Fais une quête chaque jour!":"Fais une quête pour démarrer ta série!"}</div>
            </div>
            {/* Backlog #13 — budget-temps quotidien : discret, visible seulement si un parent l'a configuré */}
            {player.dailyMinutesLimit ? (()=>{
              const sm=pState.sessionMinutes; const used=sm?.day===todayStamp()?(sm.minutes||0):0; const limit=player.dailyMinutesLimit;
              const pctT=Math.min(100,Math.round(used/limit*100));
              return (
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"var(--txt-muted,#888)"}}>⏳ Temps aujourd'hui</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:pctT>=100?"#D97070":"var(--txt-muted,#888)"}}>{used}/{limit} min</span>
                  </div>
                  <div style={{height:6,background:"#111",border:"1px solid #333",borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:pctT+"%",background:pctT>=100?"#D97070":"#85CDD1",transition:"width 0.6s"}}/>
                  </div>
                </div>
              );
            })() : null}
            {eqPet ? (()=>{ const xp=(pState.petXp||{})[eqPet.id]||0; const lv=petLevel(xp); const bar=petBar(xp); const pctp=bar.max?100:Math.round(bar.cur/bar.needed*100);
              const _evo=(pState.petEvo||{})[eqPet.id]; const _leg=petIsLegendary(_evo,lv);
              return (<>
                <div style={{display:"flex",alignItems:"center",gap:12}} onClick={openAvatar} >
                  <div style={{width:48,height:48,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",filter:`drop-shadow(0 0 6px ${pt.glow||acc})`,opacity:napping?0.6:1}}>
                    {napping ? <div style={{fontSize:48,lineHeight:1}}>😴</div> : petSpriteKey(eqPet.id) ? <PetSprite itemId={eqPet.id} size={48} palOverride={petPalOverride(_evo)} legendary={_leg}/> : <div style={{fontSize:48,lineHeight:1}}>{eqPet.emoji}</div>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      {petNickEditing
                        ? (<><input autoFocus value={petNickDraft}
                            onChange={e=>setPetNickDraft(e.target.value)}
                            onKeyDown={e=>{ if(e.key==="Enter"){ onRenamePet&&onRenamePet(eqPet.id,petNickDraft); setPetNickEditing(false); } if(e.key==="Escape") setPetNickEditing(false); }}
                            onClick={e=>e.stopPropagation()} maxLength={20}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,background:"#111",border:`1px solid ${acc}`,color:acc,borderRadius:3,padding:"2px 5px",width:110}}/>
                          <button onClick={e=>{e.stopPropagation();onRenamePet&&onRenamePet(eqPet.id,petNickDraft);setPetNickEditing(false);}}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"2px 5px",background:acc,color:"#0d0d0d",border:"none",borderRadius:3,cursor:"pointer"}}>✔</button></>)
                        : (<><div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:acc}}>{pState.petNickname?.[eqPet.id]||eqPet.name} — Niv.{lv}</div>
                          <button onClick={e=>{e.stopPropagation();setPetNickDraft(pState.petNickname?.[eqPet.id]||eqPet.name);setPetNickEditing(true);}}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"1px 3px",background:"transparent",border:`1px solid ${acc}44`,color:acc,borderRadius:3,cursor:"pointer",lineHeight:1,flexShrink:0}} title="Renommer">✏️</button></>)
                      }
                    </div>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#bbb",margin:"1px 0 3px"}}>🐾 {petStage(xp)} {napping?"· 💤 fait la sieste":""}</div>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"var(--txt-muted,#888)"}}>XP familier</div>
                    <div style={{height:7,background:"#111",border:"1px solid #333",borderRadius:3,overflow:"hidden",margin:"1px 0 4px"}}><div style={{height:"100%",width:pctp+"%",background:acc}}/></div>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"var(--txt-muted,#888)"}}>⚡ Énergie {cur}%</div>
                    <div style={{height:7,background:"#111",border:"1px solid #333",borderRadius:3,overflow:"hidden",marginTop:1}}><div style={{height:"100%",width:cur+"%",background:eColor,transition:"width 0.6s"}}/></div>
                  </div>
                </div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:fedToday?"#5CAD68":"#D9BC5C",lineHeight:1.3}}>
                  {fedToday?"✅ Nourri aujourd'hui — il gagne de l'XP avec tes quêtes!":"🍖 Nourris-le aujourd'hui pour qu'il gagne de l'XP avec tes quêtes!"}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={(e)=>{e.stopPropagation();onFeedPet&&onFeedPet();}} disabled={fedToday}
                    style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"10px",background:fedToday?"#1a1a1a":"#5CAD68",color:fedToday?"var(--txt-faint,#555)":"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:5,cursor:fedToday?"default":"pointer",opacity:fedToday?0.6:1}}>🍖 Nourrir</button>
                  <button onClick={(e)=>{e.stopPropagation();if(capReached)return;onPlayPet&&onPlayPet();}} disabled={napping||capReached}
                    style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"10px",background:(napping||capReached)?"#1a1a1a":acc,color:(napping||capReached)?"var(--txt-soft,#777)":"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:5,cursor:(napping||capReached)?"default":"pointer",opacity:(napping||capReached)?0.6:1}}>{capReached?"🌙 Demain":napping?"💤 Sieste":"🎾 Jouer"}</button>
                </div>
              </>); })() : (
                <div onClick={openAvatar} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{fontSize:40,opacity:0.5}}>🐾</div>
                  <div style={{flex:1,fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-pale,#aaa)"}}>Pas de familier équipé. Achètes-en un à la boutique 🛒, nourris-le chaque jour et il évoluera avec tes quêtes!</div>
                </div>
              )}
          </div>
        );
      })()}
      {/* 📬 Demandes de pièces reçues (offres en attente que CET enfant doit accepter) */}
      {(()=>{ const offers=(config.coinOffers||[]).filter(o=>o.toId===player.id && o.status==="pending");
        if(!offers.length) return null;
        return (
          <div style={{background:"rgba(94,222,245,0.08)",border:"2px solid #85CDD155",borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#85CDD1",marginBottom:8}}>📬 DEMANDES DE PIÈCES ({offers.length})</div>
            {offers.map(o=>{ const from=config.players.find(p=>p.id===o.fromId); const enough=(pState.coins||0)>=o.amount;
              return (
                <div key={o.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:120,fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd"}}><b style={{color:from?.color||"#fff"}}>{displayName(from)}</b> te demande {o.amount} 🪙</div>
                  <button disabled={!enough} onClick={()=>{SFX.click();onRespondOffer&&onRespondOffer(o.id,true);}} title={enough?"":"Pas assez de pièces"}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 10px",background:enough?"#5CAD68":"#333",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:enough?"pointer":"not-allowed",opacity:enough?1:0.5}}>✅ Donner</button>
                  <button onClick={()=>{SFX.click();onRespondOffer&&onRespondOffer(o.id,false);}}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 10px",background:"#1a1a1a",color:"#D98C8C",border:"2px solid #D98C8C55",borderRadius:4,cursor:"pointer"}}>✕</button>
                </div>
              );
            })}
          </div>
        );
      })()}
      </>)}

      {/* Panneau « Mes réglages » (accessibilité par enfant) */}
      {settingsOpen && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:2500,display:"flex",flexDirection:"column",padding:16,overflowY:"auto",maxWidth:640,margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.4vw,12px)",color:pt.accent||player.color}}>⚙️ Mes réglages</div>
            <button onClick={()=>{SFX.click();setSettingsOpen(false);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"6px 12px",background:"#222",color:"var(--txt-muted,#888)",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-muted,#888)",marginBottom:10}}>Ajuste l'app comme tu l'aimes. Touche pour activer ou désactiver.</div>

          {/* Mon profil — l'enfant change SON pseudo et SON code secret */}
          <div style={{background:"rgba(0,0,0,0.5)",border:`2px solid ${pt.accent||player.color}`,borderRadius:6,padding:12,marginBottom:12}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:pt.accent||player.color,marginBottom:8}}>🙂 Mon profil</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-pale,#aaa)",marginBottom:3}}>Mon pseudo</div>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              <input value={pseudoDraft} onChange={e=>setPseudoDraft(e.target.value.slice(0,16))} placeholder={player.pseudo||player.name||"Mon pseudo"}
                style={{flex:1,fontFamily:"'VT323',monospace",fontSize:16,padding:"8px 10px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none"}}/>
              <button onClick={()=>{ if(pseudoDraft.trim()){ SFX.click(); onUpdatePseudo&&onUpdatePseudo(pseudoDraft.trim()); setProfileMsg("✅ Pseudo changé!"); setPseudoDraft(""); } }}
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"0 14px",background:pseudoDraft.trim()?(pt.accent||player.color):"#333",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:"pointer",opacity:pseudoDraft.trim()?1:0.5}}>✅</button>
            </div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-pale,#aaa)",marginBottom:3}}>Mon code secret (4 chiffres)</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <input type="password" inputMode="numeric" maxLength={4} value={pinDraft} onChange={e=>setPinDraft(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="Nouveau"
                style={{width:92,fontFamily:"'Press Start 2P',monospace",fontSize:13,padding:"9px 6px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none",textAlign:"center",letterSpacing:3}}/>
              <input type="password" inputMode="numeric" maxLength={4} value={pinDraft2} onChange={e=>setPinDraft2(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="Encore"
                style={{width:92,fontFamily:"'Press Start 2P',monospace",fontSize:13,padding:"9px 6px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none",textAlign:"center",letterSpacing:3}}/>
              <button disabled={!(pinDraft.length===4&&pinDraft===pinDraft2)}
                onClick={()=>{ if(pinDraft.length===4&&pinDraft===pinDraft2){ SFX.click(); onPatchState&&onPatchState({pin:pinDraft}); setProfileMsg("🔑 Code secret changé!"); setPinDraft("");setPinDraft2(""); } }}
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"0 14px",alignSelf:"stretch",background:(pinDraft.length===4&&pinDraft===pinDraft2)?(pt.accent||player.color):"#333",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:"pointer",opacity:(pinDraft.length===4&&pinDraft===pinDraft2)?1:0.5}}>✅</button>
            </div>
            {pinDraft.length===4&&pinDraft2.length===4&&pinDraft!==pinDraft2 && <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#D98C8C",marginTop:5}}>Les deux codes ne sont pas pareils.</div>}
            {profileMsg && <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#5CAD68",marginTop:6}}>{profileMsg}</div>}
          </div>

          {[
            ["sound","🔊 Son","Les petits sons quand tu touches et réussis"],
            ["calm","🎬 Mode calme","Moins d'animations et de clignotements (plus doux pour les yeux)"],
            ["calmCountdown","⏱ Décompte calme","Le minuteur sans rouge ni « dépêche-toi »"],
            ["focus","🎯 Une tâche à la fois","Voir seulement la prochaine quête, pas toute la liste"],
            ["humor","😄 Messages rigolos","Des petites blagues après une quête réussie (et un secret ou deux)"], // v2.16.48 — voir commentaire ci-dessous
            ["readableFont","🔤 Police plus lisible","Remplace les lettres « jeu vidéo » par une police plus simple à lire"], // v1.87.0 (Lot 3 #12)
            ["highContrast","🌗 Contraste fort","Éclaircit les petits textes gris et les cadres, pour mieux les distinguer"], // v2.16.49 (Lot 3 #12, dernier tiers)
            ["femTitles","👑 Titres au féminin","Héroïne, Championne, Chevalière… au lieu de Héros, Champion, Chevalier"], // v2.5.27 — branche titleF/levelsF (item #5 analyse game design)
          ].map(([key,label,desc])=>{
            // v1.82.0 (Lot 1 #4) — "humor" avait été RETIRÉ de cette liste : le champ existait mais
            // aucun texte humoristique n'existait dans le code, donc le réglage promettait une
            // fonction inexistante. v2.16.10/v2.16.11 (Backlog #12) ont livré cet humour pour de vrai
            // (FUNNY_MSGS dans RewardPopup, TITLE_EASTER_EGGS sur le titre du header) — sans jamais
            // rebrancher le réglage, donc l'humour était devenu impossible à couper. v2.16.48 le
            // remet : le champ `settings.humor` n'a jamais cessé d'être persisté (défaut `true`,
            // et `true` pour les 4 enfants en prod), donc personne ne voit son app changer.
            // `sound` et `humor` valent `true` par défaut → testés en `!==false`, pas en booléen nu.
            const isOn = (key==="sound"||key==="humor") ? settings[key]!==false : !!settings[key];
            return (
              <div key={key} onClick={()=>{SFX.click();setSetting(key, !isOn);}}
                style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",background:"rgba(0,0,0,0.5)",border:`2px solid ${isOn?(pt.accent||"#5CAD68"):"#333"}`,borderRadius:6,marginBottom:8,cursor:"pointer"}}>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:isOn?(pt.accent||"#fff"):"var(--txt-mild,#999)"}}>{label}</div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-muted,#888)"}}>{desc}</div>
                </div>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"6px 10px",borderRadius:20,background:isOn?(pt.accent||"#5CAD68"):"#333",color:isOn?"#0d0d0d":"var(--txt-muted,#888)",minWidth:54,textAlign:"center"}}>{isOn?"ON":"OFF"}</div>
              </div>
            );
          })}
          {/* v1.87.0 (Lot 3 #12) — taille du texte : `zoom` sur le conteneur racine (voir plus haut),
              pas un booléen donc en dehors de la liste ON/OFF ci-dessus */}
          <div style={{padding:"11px 12px",background:"rgba(0,0,0,0.5)",border:"2px solid #333",borderRadius:6,marginBottom:8}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#ccc",marginBottom:8}}>🔍 Taille du texte</div>
            <div style={{display:"flex",gap:6}}>
              {[["Normal",1],["Grand",1.15],["Très grand",1.3]].map(([lbl,val])=>{ const on=(settings.fontScale||1)===val; return (
                <button key={val} onClick={()=>{SFX.click();setSetting("fontScale",val);}}
                  style={{flex:1,fontFamily:"'VT323',monospace",fontSize:15,padding:"8px 4px",background:on?(pt.accent||"#5CAD68"):"#1a1a1a",color:on?"#0d0d0d":"#bbb",border:`2px solid ${on?(pt.accent||"#5CAD68"):"#333"}`,borderRadius:4,cursor:"pointer"}}>{lbl}</button>
              ); })}
            </div>
          </div>
          <button className="btn-press" onClick={()=>{SFX.click();setSettingsOpen(false);}}
            style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"14px",marginTop:8,background:pt.accent||player.color,color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>
            ← Retour
          </button>
        </div>
      )}

      {/* Sélecteur de thème — un thème par semaine, débloqué par XP */}
      {themePicker && (()=>{
        const canChange = !player.themeChosenAt || weekKey(new Date(player.themeChosenAt)) !== weekKey();
        const list = PT_LIST.filter(t=>!t.secret);
        const nextLocked = list.filter(t=>!isThemeUnlocked(t.id,pState.xp,player.starterThemes||[])).sort((a,b)=>(a.xpUnlock||0)-(b.xpUnlock||0))[0];
        const weeklyFreeId = getWeeklyFreeTheme();
        const weeklyFreeTheme = PLAYER_THEMES[weeklyFreeId];
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:2500,display:"flex",flexDirection:"column",padding:16,overflowY:"auto",maxWidth:640,margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.4vw,12px)",color:pt.accent||player.color}}>🎨 Choisis ton thème</div>
              <button onClick={()=>{SFX.click();setThemePicker(false);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"6px 12px",background:"#222",color:"var(--txt-muted,#888)",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:canChange?"#9fe":"#FFA94D",marginBottom:4,lineHeight:1.3}}>
              {canChange ? "Touche un thème débloqué pour le choisir. Il dure toute la semaine 🗓️" : "Tu as déjà choisi ton thème cette semaine. Tu pourras en changer lundi prochain! 🗓️"}
            </div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-muted,#888)",marginBottom:4}}>🔒 Les autres thèmes se débloquent en gagnant de l'XP.{nextLocked?` Prochain : ${nextLocked.icon} ${nextLocked.name} à ${nextLocked.xpUnlock} XP (tu as ${pState.xp} XP).`:" Tu les as tous débloqués! 🏆"}</div>
            {weeklyFreeTheme && <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#D9BC5C",marginBottom:10}}>🎲 Thème de la semaine gratuit : {weeklyFreeTheme.icon} {weeklyFreeTheme.name} — débloqué pour tout le monde, sans XP!</div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
              {list.map(t=>{
                const unlocked=isThemeUnlocked(t.id,pState.xp,player.starterThemes||[]);
                const current=player.themeId===t.id;
                const selectable=unlocked&&canChange&&!current;
                const isWeeklyFree = t.id===weeklyFreeId;
                return (
                  <button key={t.id} disabled={!selectable}
                    onClick={()=>{ if(selectable){ onChangeTheme&&onChangeTheme(t.id); setThemePicker(false); } }}
                    style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"12px 8px",
                      background:current?`${t.accent}25`:unlocked?"rgba(0,0,0,0.6)":"rgba(0,0,0,0.3)",
                      border:`3px solid ${current?t.accent:isWeeklyFree?"#D9BC5C":unlocked?"#555":"#2a2a2a"}`,borderRadius:8,
                      cursor:selectable?"pointer":"default",opacity:unlocked?1:0.5,boxShadow:current?`0 0 14px ${t.glow||t.accent}50`:"none"}}>
                    <span style={{fontSize:30,filter:unlocked?"none":"grayscale(1)"}}>{t.icon}</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",color:current?t.accent:unlocked?"#ddd":"var(--txt-dim,#666)",textAlign:"center",lineHeight:1.3}}>{t.name}</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:current?"#5CAD68":unlocked?(t.accent||"#D9BC5C"):"var(--txt-soft,#777)"}}>
                      {current?"✅ ACTUEL":isWeeklyFree&&unlocked?"🎲 Gratuit!":unlocked?"Choisir":`🔒 ${t.xpUnlock} XP`}
                    </span>
                  </button>
                );
              })}
            </div>
            <button className="btn-press" onClick={()=>{SFX.click();setThemePicker(false);}}
              style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"14px",marginTop:14,background:pt.accent||player.color,color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>
              ← Retour
            </button>
          </div>
        );
      })()}

      {/* v2.15.0 — les rappels devoir/examen (computeCalendarReminders) ont été retirés d'ici :
          le calendrier n'accorde plus d'XP, c'est maintenant purement informationnel (demande de
          Gen) — homeTab==="sem" n'avait plus que ça comme contenu propre, donc plus de wrapper. */}
      {homeTab==="jour" && (<>
      {/* v2.16.25 — Backlog #16 : petit bandeau avatar + barre XP en haut de "Aujourd'hui", pour
          garder la mini-vitrine perso visible même sans repasser par Accueil (réutilise AvatarCanvas/
          xpBar déjà en place, aucun nouveau composant). */}
      <div style={{display:"flex",gap:10,alignItems:"center",background:"rgba(0,0,0,0.35)",border:"2px solid #2a2a2a",borderRadius:8,padding:"8px 12px",marginBottom:8}}>
        <AvatarCanvas avatarDef={pState.avatar||DEFAULT_AVATAR} bodyColor={pt.charBodyColor||player.color} size={36} mood={dashboardMood}
          style={{border:`2px solid ${pt.accent||player.color}`,borderRadius:4,flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",fontFamily:"'Press Start 2P',monospace",fontSize:6,color:pt.accent||player.color,marginBottom:3}}>
            <span>Niv.{lvTitle.level}</span><span><Coin size={9}/> {pState.coins}</span>
          </div>
          <div style={{height:6,background:"#111",border:"1px solid #333",borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",width:xpPct+"%",background:`linear-gradient(90deg,${player.color},${pt.accent||"#85CDD1"})`,transition:"width 0.8s ease"}}/>
          </div>
        </div>
      </div>
      {/* Lot 7A — bannière semaine de pause */}
      {!isCustodyWeek() && (()=>{
        const now2=new Date();
        const daysUntilFri = (5 - now2.getDay() + 7) % 7 || 7; // jours jusqu'au prochain vendredi
        return (
          <div style={{background:"rgba(0,0,0,0.5)",border:"2px solid #85CDD1",borderRadius:6,padding:"10px 13px",marginBottom:4,textAlign:"center"}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,8px)",color:"#85CDD1",marginBottom:5}}>📍 SEMAINE CHEZ L'AUTRE PARENT</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:17,color:"var(--txt-pale,#aaa)",lineHeight:1.3}}>
              Tes quêtes de la maison reprennent vendredi!{daysUntilFri===1?" (demain)":` (dans ${daysUntilFri} jours)`}
            </div>
          </div>
        );
      })()}
      {/* v2.15.0 — rappels devoir/examen retirés d'ici aussi (voir plus haut) : le calendrier
          est maintenant consulté dans son propre écran, purement informationnel. */}
      {/* ── NAVIGATION CLAIRE À 2 NIVEAUX ──
          1) Gros choix : Semaine (accueil) vs Rituels.  2) Si Rituels : quel rituel. */}
      {(()=>{
        const acc = th.accent||player.color;
        const seg = (active,label,sub,onClick)=>(
          <button onClick={onClick}
            style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,10px)",padding:"12px 8px",
              display:"flex",flexDirection:"column",alignItems:"center",gap:4,lineHeight:1.3,
              background:active?acc:"rgba(0,0,0,0.4)",color:active?"#0d0d0d":"var(--txt-pale,#aaa)",
              border:`3px solid ${active?acc:"#333"}`,borderRadius:8,cursor:"pointer",
              boxShadow:active?`0 0 14px ${acc}55`:"none",transition:"all 0.15s"}}>
            <span>{label}</span>
            <span style={{fontFamily:"'VT323',monospace",fontSize:12,opacity:0.85,fontWeight:active?700:400}}>{sub}</span>
          </button>
        );
        return (
          <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:2}}>
            {/* Niveau 1 : Semaine vs Rituels */}
            <div style={{display:"flex",gap:8}}>
              {/* v1.85.0 (Lot 2 #8) — "📋 Mes tâches" au lieu de "🏠 Semaine" : évite la collision
                  d'icône avec l'onglet du bas "🏠 Accueil" (deux 🏠 pour deux choses différentes)
                  et le mot "Semaine" déjà pris par l'onglet du bas "📅 Semaine" (calendrier). */}
              {/* v2.16.63 — le choix de rituel SURVIT à un aller-retour par « Mes tâches ». Avant, ce
                  bouton remettait `activeRoutineId` à null, et le bouton d'à côté re-sélectionnait
                  toujours `myRoutines[0]` (le rituel du matin) : un enfant qui avait choisi « 🌙 Soir »
                  puis jeté un oeil à sa semaine revenait sur le matin, sans que rien ne le dise.
                  Ce nettoyage ne servait à rien — `activeRoutine` (plus haut) est DÉJÀ neutralisé par
                  `pMode==="routine"`, donc l'id conservé est simplement ignoré en mode Semaine. */}
              {seg(pMode==="week","📋 Mes tâches","planifiées cette semaine",()=>{ if(pMode!=="week"){SFX.click();onPatchState({mode:"week"});} })}
              {seg(pMode==="routine","⏰ Rituels",myRoutines.length?`${myRoutines.length} rituel${myRoutines.length>1?"s":""}`:"à créer",()=>{
                if(pMode!=="routine"){
                  SFX.click();
                  // On ne repart du premier rituel QUE si le dernier choix ne désigne plus rien
                  // (rituel supprimé, ou aucun choix encore fait). "all" = la puce « 🗂️ Tout ».
                  const keep = pState.activeRoutineId==="all" || myRoutines.some(r=>r.id===pState.activeRoutineId);
                  onPatchState(keep ? {mode:"routine"} : {mode:"routine",activeRoutineId: myRoutines[0]?.id || null});
                }
              })}
            </div>
            {/* Niveau 2 : quel rituel (visible seulement en mode Rituels) */}
            {pMode==="routine" && (
              <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,alignItems:"center"}}>
                {myRoutines.map(r=>{ const on=pState.activeRoutineId===r.id; return (
                  <button key={r.id} onClick={()=>{SFX.click();onPatchState({mode:"routine",activeRoutineId:r.id});}}
                    style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"7px 12px",whiteSpace:"nowrap",
                      background:on?acc:"#1a1a1a",color:on?"#0d0d0d":"#bbb",border:`2px solid ${on?acc:"#333"}`,borderRadius:20,cursor:"pointer",fontWeight:on?700:400}}>
                    {r.emoji||"⏰"} {r.name}
                  </button>
                ); })}
                {/* v2.16.63 — « Tout » vaut maintenant "all" et non plus null, pour que ce choix-là
                    aussi se retienne. Partout où l'écran dérive `activeRoutine`, un `find()` sur "all"
                    ne trouve rien et rend exactement le même `undefined` qu'avant : comportement
                    identique, mais on distingue « l'enfant a choisi Tout » de « aucun choix fait ». */}
                {routineMine.length>0 && (()=>{ const on=!activeRoutine; return (
                  <button onClick={()=>{SFX.click();onPatchState({mode:"routine",activeRoutineId:"all"});}}
                    style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"7px 12px",whiteSpace:"nowrap",
                      background:on?acc:"#1a1a1a",color:on?"#0d0d0d":"#bbb",border:`2px solid ${on?acc:"#333"}`,borderRadius:20,cursor:"pointer",fontWeight:on?700:400}}>
                    🗂️ Tout
                  </button>
                ); })()}
                <button onClick={()=>{ SFX.click(); setRoutineBuilder({name:"",emoji:"🌅",taskIds:[]}); }}
                  style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"7px 12px",whiteSpace:"nowrap",
                    background:"rgba(0,0,0,0.4)",border:`2px dashed ${acc}`,color:acc,borderRadius:20,cursor:"pointer"}}>
                  ➕ Nouveau
                </button>
              </div>
            )}
          </div>
        );
      })()}

      </>)}
      {/* Créateur de routine (enfant autonome) */}
      {routineBuilder && (
        <div style={{background:"rgba(0,0,0,0.6)",border:`3px solid ${th.accent||player.color}`,borderRadius:6,padding:12,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:th.accent||player.color}}>{routineBuilder.editId?"✏️ Modifier mon rituel":"🌟 Mon nouveau rituel"}</div>
            <button onClick={()=>{SFX.click();setRoutineBuilder(null);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"5px 9px",background:"#1a1a1a",color:"var(--txt-muted,#888)",border:"2px solid #333",borderRadius:4,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {["🌅","🌙","☀️","🌆","⭐","🏃","🦷","📚"].map(em=>(
              <button key={em} onClick={()=>{SFX.click();setRoutineBuilder(b=>({...b,emoji:em}));}}
                style={{fontSize:18,padding:"5px 8px",background:routineBuilder.emoji===em?`${th.accent||player.color}30`:"#1a1a1a",border:`2px solid ${routineBuilder.emoji===em?(th.accent||player.color):"#333"}`,borderRadius:5,cursor:"pointer"}}>{em}</button>
            ))}
          </div>
          <input value={routineBuilder.name} onChange={e=>setRoutineBuilder(b=>({...b,name:e.target.value.slice(0,16)}))} placeholder="Nom (ex: Matin, Soir...)"
            style={{fontFamily:"'VT323',monospace",fontSize:16,padding:"8px 10px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none"}}/>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-muted,#888)"}}>⏰ Heure de fin (optionnel) :</span>
            <input type="time" value={routineBuilder.endTime||""} onChange={e=>setRoutineBuilder(b=>({...b,endTime:e.target.value}))}
              style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none"}}/>
          </div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb"}}>👇 Touche les tâches que tu VEUX faire dans ce rituel.</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-soft,#777)"}}>Une tâche choisie devient verte avec un ✅. Touche encore pour l'enlever.</div>
          <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:"32vh",overflowY:"auto"}}>
            {routineMine.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-muted,#888)"}}>Tu n'as pas encore de tâche de rituel. Touche « ➕ Créer ma propre tâche » plus bas pour en ajouter une! 👇</div>}
            {routineMine.map(a=>{
              const t=allTasks.find(x=>x.id===a.taskId); if(!t)return null;
              const sel=routineBuilder.taskIds.includes(a.instanceId);
              return (
                <div key={a.instanceId} onClick={()=>{SFX.click();setRoutineBuilder(b=>({...b,taskIds:sel?b.taskIds.filter(x=>x!==a.instanceId):[...b.taskIds,a.instanceId]}));}}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",background:sel?`${th.accent||player.color}25`:"rgba(0,0,0,0.4)",border:`2px solid ${sel?(th.accent||player.color):"#333"}`,borderRadius:4,cursor:"pointer"}}>
                  <span style={{fontSize:18,lineHeight:0}}>{sel?<UIIcon name="check" emoji="✅" size={18}/>:<UIIcon name={"task_"+t.id} emoji={t.emoji} size={18}/>}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd",flex:1}}>{t.label}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1"}}><Xp size={9}/>{t.xp}</span>
                </div>
              );
            })}
          </div>
          {/* L'enfant est autonome : il peut créer sa propre tâche et l'ajouter direct au rituel */}
          <button onClick={()=>{SFX.click();setRoutineTaskModal(true);}}
            style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"10px",background:"rgba(0,0,0,0.4)",border:`2px dashed ${th.accent||player.color}`,color:(th.accent||player.color),borderRadius:5,cursor:"pointer"}}>
            ➕ Créer ma propre tâche
          </button>
          {routineTaskModal && <CustomTaskModal title="➕ Ma tâche de rituel" confirmLabel="Ajouter au rituel" th={th}
            onClose={()=>setRoutineTaskModal(false)}
            onCreate={(data)=>{ const newId = onChildAddRoutineTask && onChildAddRoutineTask(data); if(newId) setRoutineBuilder(b=>({...b, taskIds:[...b.taskIds, newId]})); setRoutineTaskModal(false); }}/>}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{SFX.click();setRoutineBuilder(null);}}
              style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"9px",background:"#1a1a1a",color:"var(--txt-muted,#888)",border:"2px solid #333",borderRadius:4,cursor:"pointer"}}>Annuler</button>
            <button className="btn-press" disabled={!routineBuilder.name.trim()||routineBuilder.taskIds.length===0}
              onClick={()=>{
                const name=routineBuilder.name.trim(); if(!name||routineBuilder.taskIds.length===0)return;
                const data={name,emoji:routineBuilder.emoji,endTime:routineBuilder.endTime||"",taskIds:routineBuilder.taskIds};
                if(routineBuilder.editId){
                  onPatchState({routines:myRoutines.map(r=>r.id===routineBuilder.editId?{...r,...data}:r),mode:"routine",activeRoutineId:routineBuilder.editId});
                } else {
                  const newR={id:"rt_"+uid(),...data};
                  onPatchState({routines:[...myRoutines,newR],mode:"routine",activeRoutineId:newR.id});
                }
                setRoutineBuilder(null);
              }}
              style={{flex:2,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"9px",background:(routineBuilder.name.trim()&&routineBuilder.taskIds.length)?(th.accent||player.color):"#333",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:4,cursor:"pointer",opacity:(routineBuilder.name.trim()&&routineBuilder.taskIds.length)?1:0.5,boxShadow:"3px 3px 0 #0d0d0d"}}>{routineBuilder.editId?"✅ Enregistrer":"✅ Créer mon rituel"}</button>
          </div>
        </div>
      )}

      {/* v2.16.31 — Backlog #7+#11 incrément 4/5 : la vue 7-colonnes de l'ancien onglet "Semaine"
          devient un 2e mode d'affichage ici, dans "Quêtes" (seulement en mode "📋 Mes tâches" —
          les Rituels ont déjà leur propre déroulé journalier, pas de sens à segmenter par semaine). */}
      {homeTab==="jour" && pMode==="week" && (
        <div style={{display:"flex",justifyContent:"flex-end",gap:4,marginTop:2}}>
          {[["today","✅ Aujourd'hui"],["week","📅 Cette semaine"]].map(([v,l])=>{
            const active = jourView===v;
            return <button key={v} onClick={()=>{ SFX.click&&SFX.click(); setJourView(v); }}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"5px 7px",background:active?"#85CDD1":"#1a1a1a",color:active?"#0d0d0d":"var(--txt-soft,#777)",border:`1px solid ${active?"#85CDD1":"#333"}`,borderRadius:3,cursor:"pointer"}}>{l}</button>;
          })}
        </div>
      )}
      {homeTab==="jour" && !(pMode==="week" && jourView==="week") && (<>
      {/* Tasks */}
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",color:"var(--txt-muted,#888)",borderBottom:"2px solid #333",paddingBottom:3}}>📋 MES QUÊTES — {pMode==="week"?`AUJOURD'HUI (${DAYS_SHORT[todayDayIdx]}) 📅`:(activeRoutine?`${activeRoutine.emoji||"⏰"} ${activeRoutine.name.toUpperCase()}`:"RITUEL ⏰")}</div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-faint,#555)",marginBottom:2}}>Quand c'est fait, appuie sur le bouton — tes parents valideront et tu recevras ton XP!</div>
      {/* Backlog #17 incrément 1 — invitations "en équipe" reçues d'un frère/soeur, en attente de réponse.
          Affichées ici (pas seulement sur la carte de la tâche, que l'invité n'a pas forcément dans SA
          propre liste — la tâche appartient encore à l'initiateur tant que l'invitation n'est pas acceptée). */}
      {(config.teamInvites||[]).filter(inv=>inv.toPlayerId===player.id&&inv.status==="pending").map(inv=>{
        const fromP=(config.players||[]).find(p=>p.id===inv.fromPlayerId);
        const invTask=allTasks.find(t=>t.id===inv.taskId);
        if(!fromP||!invTask) return null;
        return <div key={inv.id} style={{background:"rgba(133,205,209,0.10)",border:"3px solid #85CDD1",borderRadius:8,padding:"10px 12px",marginBottom:8}}>
          <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#fff",lineHeight:1.35,marginBottom:8}}>🤝 <b style={{color:fromP.color}}>{displayName(fromP)}</b> t'invite à faire « {invTask.emoji} {invTask.label} » ensemble! Vous partagerez l'XP et les pièces.</div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{SFX.click();onRespondTeamInvite&&onRespondTeamInvite(inv.id,true);}}
              style={{flex:1,padding:"8px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#0d0d0d",background:"#5CAD68",border:"3px solid #0d0d0d",borderRadius:3,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>
              ✔ Accepter
            </button>
            <button onClick={()=>{SFX.click();onRespondTeamInvite&&onRespondTeamInvite(inv.id,false);}}
              style={{flex:1,padding:"8px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#ccc",background:"transparent",border:"2px solid #666",borderRadius:3,cursor:"pointer"}}>
              ✕ Non merci
            </button>
          </div>
        </div>;
      })}
      {/* v1.85.0 (Lot 2 #7) — état vide orientant : si l'AUTRE mode a des tâches, on le dit plutôt
          que de laisser croire qu'il n'y a rien du tout ("on sait jamais où chercher") */}
      {myAssignments.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"var(--txt-faint,#555)",textAlign:"center",padding:16,lineHeight:1.4}}>
        {pMode==="week"
          ? (weekMine.length ? "Rien de prévu aujourd'hui! 🎉"
             : routineMine.length ? <>Pas de tâches planifiées, mais tu as des <b style={{color:"var(--txt-pale,#aaa)"}}>rituels ⏰</b> — touche « Rituels » ci-dessus!</>
             : "Aucune quête de semaine pour l'instant. Demande à un parent d'en ajouter (type 📅 Semaine).")
          : (activeRoutine ? "Ce rituel est vide. Modifie-le ou crée-en un nouveau."
             : weekMine.length ? <>Pas de rituels, mais tu as des <b style={{color:"var(--txt-pale,#aaa)"}}>tâches planifiées 📋</b> — touche « Mes tâches » ci-dessus!</>
             : "Aucune quête de routine pour l'instant. Demande à un parent d'en ajouter (type ⏰ Rituel).")}
      </div>}
      {(()=>{ const _dk=a=>a.instanceId+"_"+player.id+"#"+todayStamp(); const undone=myAssignments.filter(a=>!pState.completed?.includes(_dk(a)));
        if(settings.focus && myAssignments.length>0 && undone.length===0) return <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:"#5CAD68",textAlign:"center",padding:16}}>🎉 Tout est fait! Bravo!</div>;
        // v1.88.0 (Lot 3 #15) — avertissement de transition : ton neutre/encourageant (pas d'urgence
        // rouge, contrairement au décompte) quand il reste peu de tâches — les transitions sont
        // difficiles pour TSA/TDAH, un signal clair "tu y es presque" aide à anticiper la fin.
        if(!settings.focus && myAssignments.length>=3 && undone.length>0 && undone.length<=2){
          return <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-pale,#aaa)",textAlign:"center",padding:"6px 4px"}}>
            🌟 Encore {undone.length} tâche{undone.length>1?"s":""}, tu y es presque!
          </div>;
        }
        return null;
      })()}
      {(()=>{
        const renderCard=(ass)=>{
        const task=allTasks.find(t=>t.id===ass.taskId);
        if(!task)return null;
        const doneKey=ass.instanceId+"_"+player.id+"#"+todayStamp(); // clé du jour → se remet à zéro chaque jour
        const done=pState.completed?.includes(doneKey);
        const pending=pState.pending?.includes(doneKey);
        return (
          // Refonte visuelle Phase 3 — bordure neutre .card-n1 (patron Phase 1) au repos, la
          // difficulté quitte la bordure pour un liseré gauche 4px DIFF_COLOR (info conservée,
          // bruit réduit) ; done/pending gardent leur bordure pleine couleur (état, pas décor).
          <div key={ass.instanceId} className={done||pending?"":"texture-grain"} style={{background:done||pending?"rgba(0,0,0,0.55)":"var(--tile-bg)",border:`3px solid ${done?"#5CAD68":pending?"#D9BC5C":"var(--b-soft)"}`,borderTop:done||pending?undefined:"3px solid rgba(255,255,255,0.14)",borderLeft:`4px solid ${DIFF_COLOR(task.diff)}`,boxShadow:done||pending?undefined:"var(--elev3)",borderRadius:8,padding:"10px 12px",position:"relative",transition:"border 0.2s"}}>
            {done&&<div style={{position:"absolute",inset:0,background:"rgba(0,30,0,0.7)",display:"flex",alignItems:"center",justifyContent:"safe center",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1vw,10px)",color:"#5CAD68",borderRadius:5}}>✅ VALIDÉ!</div>}
            {/* v2.15.6 (demande de Gen, 2026-07-28) : ce renderCard n'est utilisé QUE pour la liste
                déjà filtrée à aujourd'hui (myAssignments/list, voir plus bas) — jamais pour la vue
                semaine. Afficher `ass.days` en entier (ex: « Lun Mar Mer Jeu Ven ») sur une carte du
                jour donnait l'impression trompeuse que « le reste de la semaine » s'affichait dans
                Mes tâches, alors que la carte elle-même est bien filtrée à aujourd'hui — seul le
                badge mentait. Le header de section dit déjà « AUJOURD'HUI », donc plus besoin d'un
                badge jour ici : ne garder que l'heure du moment (matin/soir/etc.), le cas échéant. */}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-muted,#888)",marginBottom:3}}>{ass.time?`⏰ ${ass.time}`:""}</div>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:5}}>
              <span className="icon-tile" style={{width:36,height:36,flex:"0 0 36px"}}><UIIcon name={"task_"+task.id} emoji={task.emoji} size={26} block/></span>
              <span style={{fontWeight:900,fontSize:"clamp(12px,1.4vw,14px)",color:"#fff",lineHeight:1.3,flex:1}}>{task.label}</span>
            </div>
            {/* v2.6.0 — quête de réparation 🕊️ : les 3 petites étapes descriptives (texte simple, pas de cases) */}
            {Array.isArray(task.steps)&&task.steps.length>0&&<div style={{marginBottom:6}}>
              {task.steps.map((s,si)=>(
                <div key={si} style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#9ED8DE",lineHeight:1.35,paddingLeft:6}}>· {s}</div>
              ))}
            </div>}
            {/* Backlog #17 incrément 1 — badge "en équipe" une fois l'invitation acceptée (2 playerIds).
                Les quêtes de réparation (ass.repair) ont déjà leur propre patron multi-joueurs (récompense
                pleine pour chacun, pas partagée) — on ne les touche pas, ce badge ne concerne que teamSplit. */}
            {ass.playerIds.length>1 && !ass.repair && (()=>{
              const mateNames=ass.playerIds.filter(pid=>pid!==player.id).map(pid=>{ const mate=(config.players||[]).find(p=>p.id===pid); return mate?displayName(mate):null; }).filter(Boolean);
              return mateNames.length ? <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#9ED8DE",marginBottom:5}}>🤝 En équipe avec {mateNames.join(", ")} — XP et pièces partagés</div> : null;
            })()}
            <div style={{display:"flex",gap:6,marginBottom:done?"0":"7px",flexWrap:"wrap"}}>
              <span className="chip-cost" style={{color:"#85CDD1",borderColor:"rgba(133,205,209,0.55)",background:"rgba(133,205,209,0.10)"}}><Xp size={9}/>{task.xp} XP</span>
              <span className="chip-cost"><Coin size={9}/>{task.coins}</span>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:DIFF_COLOR(task.diff),border:`1px solid ${DIFF_COLOR(task.diff)}40`,padding:"1px 4px"}}>{task.diff.toUpperCase()}</span>
              {/* Backlog UX #12 — temps approximatif, dérivé du palier de difficulté (~8/18/25/30 min) */}
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-mild,#999)",border:"1px solid #444",padding:"1px 4px"}}>⏱️~{estMinOf(task.diff)}min</span>
              {task.cat && (()=>{ const m=catMeta(task.cat); return <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:m.color,background:`${m.color}1A`,border:`1px solid ${m.color}55`,padding:"1px 4px"}}>{m.label}</span>; })()}
            </div>
            {!done&&!pending&&<div style={{display:"flex",gap:6}}>
              <button className="btn-press" onClick={e=>{SFX.click();setMoodFor("happy",5000);onRequestComplete(ass,player.id,e);}}
                style={{flex:1,padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",
                  color:"#0d0d0d",background:player.color,border:"3px solid #0d0d0d",borderRadius:3,cursor:"pointer",
                  boxShadow:"2px 2px 0 #0d0d0d",transition:"all 0.08s"}}>
                ✔ J'AI FAIT ÇA!
              </button>
              {/* Backlog UX #11 — minuteur pour CETTE tâche précise (outil de concentration, ne complète pas la tâche) */}
              <button onClick={()=>{SFX.click();setTaskTimerFor({emoji:task.emoji,label:task.label});}}
                title="Lancer un minuteur pour cette tâche"
                style={{padding:"9px 11px",fontSize:16,background:"rgba(0,0,0,0.4)",border:`3px solid ${player.color}`,borderRadius:3,cursor:"pointer"}}>
                ⏱
              </button>
            </div>}
            {/* v1.83.0 (Lot 1 #B6) — l'enfant peut demander à retirer une tâche qu'il ne veut plus (le parent approuve) */}
            {!done&&!pending&&(()=>{
              const reqPending=(config.removalRequests||[]).some(r=>r.instanceId===ass.instanceId && r.playerId===player.id);
              return reqPending
                ? <div style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#FFA94D",textAlign:"center",marginTop:5}}>🗑️ Retrait demandé — en attente du parent…</div>
                : <button onClick={()=>{ if(window.confirm(`Demander à retirer « ${task.label} » de tes tâches?`)){ SFX.click(); onRequestRemoval&&onRequestRemoval(ass.instanceId); } }}
                    style={{width:"100%",padding:"5px",marginTop:5,fontFamily:"'VT323',monospace",fontSize:12,color:"var(--txt-muted,#888)",background:"transparent",border:"1px dashed #444",borderRadius:3,cursor:"pointer"}}>
                    🗑️ Je ne veux plus de cette tâche
                  </button>;
            })()}
            {/* Backlog #17 incrément 1 — invitation "en équipe" : seulement sur une tâche encore solo
                (playerIds.length===1), pas les réparations (déjà multi-joueurs par nature). */}
            {!done&&!pending&&!ass.repair&&ass.playerIds.length===1&&(config.players||[]).length>1&&(()=>{
              const siblings=(config.players||[]).filter(p=>p.id!==player.id);
              const outgoingPending=(config.teamInvites||[]).find(inv=>inv.instanceId===ass.instanceId&&inv.fromPlayerId===player.id&&inv.status==="pending");
              if(outgoingPending){
                const toName=displayName(siblings.find(s=>s.id===outgoingPending.toPlayerId)||{});
                return <div style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#85CDD1",textAlign:"center",marginTop:5}}>🤝 Invitation envoyée à {toName} — en attente…</div>;
              }
              const outgoingDeclined=(config.teamInvites||[]).find(inv=>inv.instanceId===ass.instanceId&&inv.fromPlayerId===player.id&&inv.status==="declined");
              return <>
                {outgoingDeclined && <div style={{fontFamily:"'VT323',monospace",fontSize:12,color:"var(--txt-muted,#888)",textAlign:"center",marginTop:5}}>😌 {displayName(siblings.find(s=>s.id===outgoingDeclined.toPlayerId)||{})} ne peut pas cette fois — pas grave, continue en solo!</div>}
                {teamPickerFor===ass.instanceId
                  ? <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:5}}>
                      {siblings.map(s=>(
                        <button key={s.id} onClick={()=>{SFX.click();onCreateTeamInvite&&onCreateTeamInvite(ass.instanceId,s.id);setTeamPickerFor(null);}}
                          style={{padding:"5px 9px",fontFamily:"'VT323',monospace",fontSize:13,color:"#0d0d0d",background:s.color,border:"1px solid #0d0d0d",borderRadius:3,cursor:"pointer"}}>
                          {displayName(s)}
                        </button>
                      ))}
                      <button onClick={()=>setTeamPickerFor(null)} style={{padding:"5px 9px",fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-muted,#888)",background:"transparent",border:"1px dashed #444",borderRadius:3,cursor:"pointer"}}>Annuler</button>
                    </div>
                  : <button onClick={()=>{SFX.click();setTeamPickerFor(ass.instanceId);}}
                      style={{width:"100%",padding:"5px",marginTop:5,fontFamily:"'VT323',monospace",fontSize:12,color:"#9ED8DE",background:"transparent",border:"1px dashed #4A8A90",borderRadius:3,cursor:"pointer"}}>
                      🤝 Faire en équipe
                    </button>}
              </>;
            })()}
            {!done&&!pending&&parentMode&&<button onClick={()=>onForceComplete(ass,player.id)}
              style={{width:"100%",padding:"6px",fontFamily:"'Press Start 2P',monospace",fontSize:"7px",
                color:"#0d0d0d",background:"#D99248",border:"2px solid #CC6600",borderRadius:2,cursor:"pointer",marginTop:4}}>
              ⚡ VALIDER SANS CODE (parent)
            </button>}
            {done&&parentMode&&<button onClick={()=>onDeComplete(ass.instanceId+"_"+player.id+"#"+todayStamp(), playerIdx)}
              style={{position:"absolute",top:4,right:4,padding:"3px 7px",fontFamily:"'Press Start 2P',monospace",fontSize:"6px",
                color:"#D97070",background:"rgba(0,0,0,0.7)",border:"1px solid #D97070",borderRadius:2,cursor:"pointer",zIndex:10}}>
              ↩️ Annuler
            </button>}
            {/* v2.6.2 — gratification instantanée : la carte en attente montre les gains RÉSERVÉS
                (grisés — l'octroi réel reste à la validation parent, libellé explicite pour éviter
                tout « mais j'avais déjà mes points! », cadre TOP). bounceIn = tué par .calm-mode. */}
            {pending&&(()=>{
              // Backlog #17 — sur une tâche "en équipe" (teamSplit), le montant réservé affiché doit déjà
              // montrer la moitié partagée (même arrondi que approvePending), sinon l'enfant voit un montant
              // plein ici puis un montant divisé une fois validé — décalage confus, pas une vraie erreur mais
              // une promesse non tenue à l'écran.
              const rXp=ass.teamSplit?Math.round((task.xp||0)/2):(task.xp||0);
              const rCoins=ass.teamSplit?Math.round((task.coins||0)/2):(task.coins||0);
              return <div style={{textAlign:"center",marginTop:4,animation:"bounceIn 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C"}}>⏳ Bravo! En attente de validation…</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#9a8c56",marginTop:2}}>+{rXp} XP · +{rCoins} 🪙 réservés — ton parent valide et c'est à toi!</div>
              </div>;
            })()}
          </div>
        );
        };
        // Mode « Tout » (rituels, sans rituel ciblé) : regrouper par rituel, replié par défaut → fini le scroll infini
        const isTout = pMode==="routine" && !activeRoutine && !settings.focus;
        if(isTout){
          const dk=a=>a.instanceId+"_"+player.id+"#"+todayStamp();
          const used=new Set();
          const groups=myRoutines.map(r=>{
            const items=routineMine.filter(a=>r.taskIds?.includes(a.instanceId) && !used.has(a.instanceId));
            items.forEach(a=>used.add(a.instanceId));
            return {id:r.id, label:`${r.emoji||"⏰"} ${r.name}`, items};
          }).filter(g=>g.items.length>0);
          const orphans=routineMine.filter(a=>!used.has(a.instanceId));
          if(orphans.length) groups.push({id:"__autres", label:"🗂️ Autres tâches", items:orphans});
          // v2.6.0 — les quêtes de réparation 🕊️ s'affichent TOUJOURS, en tête, hors des groupes
          // repliés (cette branche « Tout » lit routineMine directement et ignorait myAssignments).
          const repairCards = repairMine.map(renderCard);
          if(groups.length===0 && repairCards.length===0) return null;
          const acc=th.accent||player.color;
          return [...repairCards, ...groups.map(g=>{
            const open=!!openRoutineGroups[g.id];
            const doneN=g.items.filter(a=>pState.completed?.includes(dk(a))).length;
            const allDone=doneN===g.items.length;
            return (
              <div key={g.id} style={{display:"flex",flexDirection:"column"}}>
                <button onClick={()=>{SFX.click();setOpenRoutineGroups(s=>({...s,[g.id]:!s[g.id]}));}}
                  style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",
                    fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",lineHeight:1.4,textAlign:"left",
                    padding:"11px 12px",background:open?`${acc}22`:"rgba(0,0,0,0.45)",
                    color:allDone?"#5CAD68":"#fff",border:`2px solid ${open?acc:"#333"}`,borderRadius:8,cursor:"pointer"}}>
                  <span>{open?"▼":"▶"} {g.label}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:15,color:allDone?"#5CAD68":"var(--txt-muted,#888)"}}>{allDone?"✅ ":""}{doneN}/{g.items.length}</span>
                </button>
                {open && <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8,marginBottom:4}}>{g.items.map(renderCard)}</div>}
              </div>
            );
          })];
        }
        const _done=a=>pState.completed?.includes(a.instanceId+"_"+player.id+"#"+todayStamp());
        const undoneAll = myAssignments.filter(a=>!_done(a)); // v1.88.0 — nommé pour réutilisation (D'abord→Ensuite)
        const list = settings.focus ? undoneAll.slice(0,1) : undoneAll; // v1.60.0 — les quêtes validées quittent la liste → Archives
        if(list.length===0 && myAssignments.length>0) return <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:"#5CAD68",textAlign:"center",padding:16,lineHeight:1.6}}>🎉 Tout est fait pour aujourd'hui!<br/><span style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-pale,#aaa)"}}>Tes quêtes finies sont rangées dans 🗄️ Archives (menu ☰).</span></div>;
        // v2.11.2 — « Ma journée » sectionnée Matin/Après-midi/Soir en mode Semaine (pas en mode
        // Rituel : les rituels ont déjà leurs propres noms temporels, ni en mode focus : 1 seule
        // carte, rien à sectionner). Réparation reste hors sections, toujours en tête (patron v2.6.0).
        const cards = (pMode==="week" && !settings.focus) ? (()=>{
          const repairCards = list.filter(a=>a.repair).map(renderCard);
          const rest = list.filter(a=>!a.repair);
          const sections = [
            {key:"matin", label:"🌅 Matin", items:rest.filter(a=>a.time==="matin")},
            {key:"apm", label:"☀️ Après-midi", items:rest.filter(a=>a.time==="après-midi")},
            {key:"soir", label:"🌙 Soir", items:rest.filter(a=>a.time==="soir")},
            {key:"autres", label:"🕐 Autres moments", items:rest.filter(a=>a.time!=="matin"&&a.time!=="après-midi"&&a.time!=="soir")},
          ].filter(s=>s.items.length>0);
          const out=[...repairCards];
          sections.forEach(s=>{
            out.push(<div key={"sec-"+s.key} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",color:th.accent||"var(--txt-muted,#888)",marginTop:10,marginBottom:2}}>{s.label}</div>);
            out.push(...s.items.map(renderCard));
          });
          return out;
        })() : list.map(renderCard);
        // v1.88.0 (Lot 3 #14) — "D'abord → Ensuite" : en mode focus (une tâche à la fois), montre
        // ce qui vient après — prévisibilité utile pour TSA/TDAH (savoir à quoi s'attendre).
        if(settings.focus && undoneAll.length>1){
          const next=allTasks.find(t=>t.id===undoneAll[1].taskId);
          cards.push(
            <div key="first-then" style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"rgba(0,0,0,0.3)",border:"1px dashed #444",borderRadius:6,fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-soft,#777)",flexWrap:"wrap"}}>
              <span>👉 Ensuite:</span>
              {next && <UIIcon name={"task_"+next.id} emoji={next.emoji} size={16}/>}
              <span style={{color:"var(--txt-pale,#aaa)"}}>{next?next.label:"?"}</span>
            </div>
          );
        }
        return cards;
      })()}

      {/* Backlog UX #13 — Défi de la semaine + Objectifs du jour, repliés par défaut SOUS la liste de
          quêtes (avant : ces 2 blocs poussaient le bouton "J'AI FAIT ÇA!" sous 2 écrans de défilement,
          le constat 🔴 le plus important de l'audit UX). Accordéon même patron visuel que « Tâches planifiées ». */}
      {(()=>{
        const myChallenge = weeklyChallenge?.challenges?.find(c=>c.playerId===player.id);
        const todayC = todayStamp(); // date LOCALE — l'ancien toISOString (UTC) marquait le check-in au LENDEMAIN après 20h
        const challengeDone = myChallenge && myChallenge.checkins?.[todayC];
        const stamp="#"+todayStamp();
        const doneToday=(pState.completed||[]).filter(k=>k.endsWith(stamp));
        const countToday=doneToday.length;
        // Backlog #17 — même garde-fou que le graphique hebdo de FamilyOverview : une tâche teamSplit
        // n'accorde jamais le plein XP du catalogue (voir approvePending).
        const axp={}; assignments.forEach(a=>{const t=allTasks.find(x=>x.id===a.taskId); const raw=t?(t.xp||0):0; axp[a.instanceId]=a.teamSplit?Math.round(raw/2):raw;});
        const xpToday=doneToday.reduce((s,k)=>{const base=k.split("#")[0]; const inst=base.slice(0,base.lastIndexOf("_")); return s+(axp[inst]||0);},0);
        const OBJ=[
          {id:"o3",  label:"Faire 3 quêtes",  prog:Math.min(countToday,3), goal:3,  xp:10, coins:5},
          {id:"o6",  label:"Faire 6 quêtes",  prog:Math.min(countToday,6), goal:6,  xp:15, coins:10},
          {id:"oxp", label:"Gagner 60 XP",    prog:Math.min(xpToday,60),   goal:60, xp:0,  coins:10},
        ];
        const claimed=(pState.dailyClaimed&&pState.dailyClaimed.day===todayStamp())?pState.dailyClaimed.ids:[];
        const readyToClaim = OBJ.filter(o=>o.prog>=o.goal && !claimed.includes(o.id)).length;
        return (
          <div style={{marginTop:6}}>
            <button onClick={()=>{ if(SFX.click)SFX.click(); setDailyGoalsOpen(o=>!o); }}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",textAlign:"left",fontFamily:"'Press Start 2P',monospace",fontSize:7,lineHeight:1.4,color:"var(--txt-mild,#999)",background:"rgba(0,0,0,0.3)",border:"1px solid #2a2a2a",borderRadius:6,padding:"9px 11px",cursor:"pointer"}}>
              <span>{dailyGoalsOpen?"▼":"▶"} 🎯 Défi &amp; objectifs du jour</span>
              {readyToClaim>0 && <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#5CAD68"}}>🎁 {readyToClaim}</span>}
            </button>
            {dailyGoalsOpen && <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8}}>
              {myChallenge && (
                <div style={{background:"rgba(0,0,0,0.6)",border:`3px solid ${challengeDone?"#5CAD68":"#D9BC5C"}`,borderRadius:6,padding:"11px 13px"}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,8px)",color:"#D9BC5C",marginBottom:6}}>⭐ DÉFI DE LA SEMAINE</div>
                  <div style={{fontSize:"clamp(13px,1.6vw,16px)",color:"#FFF",lineHeight:1.4,marginBottom:8}}>{myChallenge.emoji||"⭐"} {myChallenge.text||"Défi à venir…"}</div>
                  {challengeDone
                    ? <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,0.9vw,9px)",color:"#5CAD68"}}>✅ Défi relevé aujourd'hui!</div>
                    : onChallengeCheckin && <button className="btn-press" onClick={()=>{SFX.click();onChallengeCheckin(todayC,true);}}
                        style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#0d0d0d",background:"#D9BC5C",border:"3px solid #0d0d0d",borderRadius:3,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>
                        ✅ J'ai réussi aujourd'hui!
                      </button>}
                </div>
              )}
              <div style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${(th.accent||player.color)}44`,borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:th.accent||player.color,marginBottom:6}}>🎯 OBJECTIFS DU JOUR</div>
                {OBJ.map(o=>{ const done=o.prog>=o.goal; const isClaimed=claimed.includes(o.id);
                  return (
                    <div key={o.id} style={{marginBottom:14}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                        <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:isClaimed?"#5CAD68":"#ccc"}}>{isClaimed?"✅ ":""}{o.label} <span style={{color:"#85CDD1"}}>+{o.xp} XP{o.coins?` +${o.coins}🪙`:""}</span></span>
                        {done&&!isClaimed&&<button onClick={()=>{SFX.click();onClaimDaily&&onClaimDaily(o);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"4px 8px",background:"#5CAD68",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:3,cursor:"pointer"}}>Réclamer</button>}
                      </div>
                      <div style={{height:8,background:"#111",border:"1px solid #333",borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",width:Math.round(o.prog/o.goal*100)+"%",background:isClaimed?"#5CAD68":`linear-gradient(90deg,${player.color},${th.accent})`,transition:"width 0.5s"}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>}
          </div>
        );
      })()}

      {/* Enfant : ajouter une quête — CHOISIR dans la grille (anti-doublons), repli = créer la sienne */}
      <button onClick={()=>{SFX.click();setChooserOpen(true);}}
        style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"10px",background:"rgba(0,0,0,0.4)",border:`2px dashed ${player.color}`,color:player.color,borderRadius:5,cursor:"pointer",marginTop:2}}>
        ➕ Ajouter une quête à ma journée
      </button>
      {chooserOpen && <TaskChooser allTasks={allTasks} th={th}
        onClose={()=>setChooserOpen(false)}
        onPick={(taskId)=>{ onChildPickTask&&onChildPickTask(taskId); setChooserOpen(false); }}
        onCreateOwn={()=>{ setChooserOpen(false); setAddTaskOpen(true); }}/>}
      {addTaskOpen && <CustomTaskModal title="➕ Ma nouvelle quête" confirmLabel="Ajouter à ma journée" th={th} scopeOptions
        onClose={()=>setAddTaskOpen(false)}
        onCreate={(data)=>{ onChildAddTask&&onChildAddTask(data); setAddTaskOpen(false); }}/>}
      {taskTimerFor && <TaskTimerModal task={taskTimerFor} accent={th.accent||player.color} onClose={()=>setTaskTimerFor(null)}/>}

      </>)}
      {homeTab==="jour" && pMode==="week" && jourView==="week" && (<>
      {/* v2.6.1 — Vue Semaine en colonnes (comme un calendrier papier), demandée par Gen.
          Toggle 🗓️/📋 persisté PAR ENFANT (settings.weekCols, défaut colonnes) — repères stables :
          l'ancienne liste reste à un tap. 7 colonnes = les 7 prochains jours à partir d'AUJOURD'HUI,
          défilement horizontal avec snap (téléphone), aujourd'hui encadré à l'accent du thème.
          v2.16.31 — Backlog #7+#11 incrément 4/5 : déplacée depuis l'ex-onglet "Semaine" (devenu
          "Calendrier", vue événements-only — voir onGoCalendars). Les événements du calendrier,
          qui étaient épinglés en haut de chaque colonne depuis v2.15.3, sont retirés d'ici : ils
          vivent maintenant exclusivement dans l'écran Calendrier pour éviter la duplication. */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,0.9vw,9px)",color:"#85CDD1"}}>📅 MA SEMAINE</div>
        <div style={{display:"flex",gap:4}}>
          {[["cols","🗓️ Colonnes"],["liste","📋 Liste"]].map(([v,l])=>{
            const active = (settings.weekCols!==false) === (v==="cols");
            return <button key={v} onClick={()=>{ SFX.click&&SFX.click(); onPatchState&&onPatchState({settings:{...settings, weekCols:v==="cols"}}); }}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"5px 7px",background:active?"#85CDD1":"#1a1a1a",color:active?"#0d0d0d":"var(--txt-soft,#777)",border:`1px solid ${active?"#85CDD1":"#333"}`,borderRadius:3,cursor:"pointer"}}>{l}</button>;
          })}
        </div>
      </div>
      {settings.weekCols!==false && (
        <div style={{display:"flex",gap:6,overflowX:"auto",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch",paddingBottom:6,marginTop:4}}>
          {Array.from({length:7},(_,k)=>{
            const dt=new Date(); dt.setDate(dt.getDate()+k);
            // stamp en date LOCALE (jamais toISOString — leçon v2.5.24)
            const stamp=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
            const dIdx=(dt.getDay()+6)%7;
            const dayTasks=weekMine.filter(a=>Array.isArray(a.days)&&a.days.includes(dIdx)&&(!a.oneDay||a.oneDay===stamp));
            const isToday=k===0;
            const acc=th.accent||player.color;
            const MAXT=5;
            return (
              <div key={stamp} style={{flex:"0 0 auto",width:138,scrollSnapAlign:"start",background:"rgba(0,0,0,0.35)",border:isToday?`2px solid ${acc}`:"1px solid #2a2a2a",borderRadius:6,padding:"7px 7px 9px",boxSizing:"border-box"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:isToday?acc:"var(--txt-mild,#999)",marginBottom:2}}>{DAYS_SHORT[dIdx]} {dt.getDate()}</div>
                {isToday && <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#0d0d0d",background:acc,borderRadius:2,padding:"2px 4px",display:"inline-block",marginBottom:4}}>AUJOURD'HUI</div>}
                {dayTasks.length===0 && (
                  <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-faint,#555)",marginTop:4}}>🌿 Libre</div>
                )}
                {dayTasks.slice(0,MAXT).map(a=>{
                  const t=allTasks.find(x=>x.id===a.taskId); if(!t) return null;
                  const doneKey=a.instanceId+"_"+player.id+"#"+stamp;
                  const done=isToday && ((pState.completed||[]).includes(doneKey)||(pState.pending||[]).includes(doneKey));
                  return (
                    <div key={a.instanceId} style={{display:"flex",alignItems:"flex-start",gap:4,marginTop:4,opacity:done?0.45:1}}>
                      <span style={{fontSize:12,lineHeight:"14px"}}>{done?"✓":<UIIcon name={"task_"+t.id} emoji={t.emoji} size={12}/>}</span>
                      <span style={{fontFamily:"'VT323',monospace",fontSize:14,lineHeight:"14px",color:"#ccc",textDecoration:done?"line-through":"none",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{t.label}</span>
                    </div>
                  );
                })}
                {dayTasks.length>MAXT && <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-soft,#777)",marginTop:3}}>+{dayTasks.length-MAXT} autres quêtes</div>}
              </div>
            );
          })}
        </div>
      )}
      {/* Tâches planifiées (pas aujourd'hui) — accordéon replié par défaut (vue Semaine, mode Liste) */}
      {settings.weekCols===false && pMode==="week" && laterWeek.length>0 && (
        <div style={{marginTop:6}}>
          <button onClick={()=>{ if(SFX.click)SFX.click(); setLaterOpen(o=>!o); }}
            style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",textAlign:"left",fontFamily:"'Press Start 2P',monospace",fontSize:7,lineHeight:1.4,color:"var(--txt-mild,#999)",background:"rgba(0,0,0,0.3)",border:"1px solid #2a2a2a",borderRadius:6,padding:"9px 11px",cursor:"pointer"}}>
            <span>{laterOpen?"▼":"▶"} 📅 Tâches planifiées</span>
            <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-muted,#888)"}}>{laterWeek.length}</span>
          </button>
          {laterOpen && <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:5,opacity:0.85}}>
            {laterWeek.map(ass=>{ const t=allTasks.find(x=>x.id===ass.taskId); if(!t)return null;
              return (
                <div key={ass.instanceId} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 9px",background:"rgba(0,0,0,0.3)",border:"1px solid #2a2a2a",borderRadius:4}}>
                  <UIIcon name={"task_"+t.id} emoji={t.emoji} size={15}/>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-pale,#aaa)",flex:1}}>{t.label}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#85CDD1"}}>{ass.days.map(d=>DAYS_SHORT[d]).join(" ")}</span>
                </div>
              );
            })}
          </div>}
        </div>
      )}

      </>)}
      {homeTab==="jour" && (<>
      {/* v1.73.0 — minuteur INLINE dans la fenêtre du rituel (3 modes : minuterie / heure butoir / chrono) */}
      {activeRoutine && (
        <InlineRitualTimer endTime={activeRoutine.endTime} accent={th.accent||player.color}/>
      )}
      {/* Minuteur plein écran (heure de fin → XP à la complétion du rituel) */}
      {activeRoutine && onGoTimer && (
        <button onClick={()=>{SFX.click();onGoTimer(activeRoutine.id);}}
          style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:th.accent||player.color,background:"transparent",border:`1px solid ${(th.accent||player.color)}55`,borderRadius:4,cursor:"pointer",marginTop:4}}>
          ⛶ Minuteur plein écran (avec XP){activeRoutine.endTime?` · ${activeRoutine.endTime.replace(":","h")}`:""}
        </button>
      )}
      {/* v2.16.30 — Backlog #7+#11 incrément 3/5 : la Minuterie n'a plus de destination indépendante
          depuis Accueil (voir plus haut) — vit maintenant ici, dans Rituels, même en mode "🗂️ Tout"
          (aucun rituel sélectionné) pour ne perdre aucun accès (ex: minuteur libre "Défi minuté"). */}
      {pMode==="routine" && !activeRoutine && onGoTimer && (
        <button onClick={()=>{SFX.click();onGoTimer(null);}}
          style={{width:"100%",padding:"9px",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:th.accent||player.color,background:"transparent",border:`1px solid ${(th.accent||player.color)}55`,borderRadius:4,cursor:"pointer",marginTop:4}}>
          ⛶ Minuteur plein écran
        </button>
      )}
      {/* Terminer la routine → retour au mode Semaine */}
      {activeRoutine && (
        <button className="btn-press" onClick={()=>{
            if(window.confirm("Terminer le rituel et revenir au mode Semaine?")){ onPatchState({mode:"week",activeRoutineId:null}); SFX.epic && SFX.epic(); }
          }}
          style={{width:"100%",padding:"11px",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#0d0d0d",background:"#5CAD68",border:"3px solid #0d0d0d",borderRadius:4,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d",marginTop:4}}>
          ✅ J'ai fini mon rituel — revenir au mode Semaine 📅
        </button>
      )}
      {activeRoutine && (
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{ SFX.click(); setRoutineBuilder({editId:activeRoutine.id,name:activeRoutine.name,emoji:activeRoutine.emoji||"🌅",endTime:activeRoutine.endTime||"",taskIds:[...(activeRoutine.taskIds||[])]}); }}
            style={{flex:1,padding:"8px",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:th.accent||player.color,background:"transparent",border:`1px solid ${th.accent||player.color}55`,borderRadius:3,cursor:"pointer"}}>
            ✏️ Modifier
          </button>
          <button onClick={()=>{ if(window.confirm(`Supprimer le rituel «${activeRoutine.name}» ? (tes tâches et ton XP restent)`)){ onPatchState({routines:myRoutines.filter(r=>r.id!==activeRoutine.id),removedRoutineIds:[...new Set([...(pState.removedRoutineIds||[]),activeRoutine.id])].slice(-200),activeRoutineId:null,mode:"week"}); } }}
            style={{flex:1,padding:"8px",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D98C8C",background:"transparent",border:"1px solid #D98C8C40",borderRadius:3,cursor:"pointer"}}>
            🗑️ Supprimer
          </button>
        </div>
      )}

      </>)}
      {homeTab==="shop" && (isShopLocked(config,pState,assignments,player.id,myAssignments) ? (
        <div style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${pt.accent||player.color}55`,borderRadius:10,padding:20,textAlign:"center",marginTop:8}}>
          <div style={{fontSize:34,marginBottom:8}}>🔒</div>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:pt.accent||player.color,marginBottom:10}}>BOUTIQUE VERROUILLÉE</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:17,color:"#ccc",lineHeight:1.4}}>
            {(()=>{ const left=rotatingRemaining(config,pState,assignments,player.id,myAssignments); const s=left>1?"s":"";
              return <>Fais encore <b style={{color:"#D9BC5C"}}>{left}</b> tâche{s} rotative{s} aujourd'hui pour débloquer la boutique!</>; })()}
          </div>
          {/* v2.16.60 — le dénominateur affichait le réglage brut du parent (2) même quand l'enfant
              n'avait qu'une seule rotative dans sa journée : il montre maintenant le seuil réellement
              exigé, celui qu'il est possible d'atteindre. */}
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"var(--txt-muted,#888)",marginTop:10}}>{rotatingDoneToday(assignments,pState.completed,player.id)}/{rotatingNeed(config,myAssignments)}</div>
        </div>
      ) : (<>
      {/* Shop */}
      <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-faint,#555)",marginTop:6,marginBottom:2}}>Dépense tes pièces pour des accessoires et de vraies récompenses — les quêtes difficiles en rapportent plus!</div>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",color:"var(--txt-muted,#888)",borderBottom:"2px solid #333",paddingBottom:3,marginTop:0}}><UIIcon name="nav_shop" emoji="🛒" size={11}/> BOUTIQUE — {pState.coins} <Coin size={11}/></div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-soft,#777)",margin:"2px 0"}}>Touche un item pour l'acheter avec tes pièces 🪙. Gagne des pièces en faisant tes quêtes!</div>

      {/* 🎁 Coffres mystères */}
      {(()=>{ const cur=currentEnergy(pState); if(cur>=CHEST_ENERGY) return null; const m=minsToEnergy(pState,CHEST_ENERGY);
        return <div style={{background:"rgba(94,222,245,0.08)",border:"2px solid #85CDD155",borderRadius:6,padding:"8px 10px",fontFamily:"'VT323',monospace",fontSize:14,color:"#9fd",lineHeight:1.3}}>💤 Ton familier est fatigué et fait une sieste — les coffres reviennent dans ~{m} min. En attendant, va faire tes quêtes! 🌟</div>;
      })()}
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        {CHESTS.map(ch=>{ const can=pState.coins>=ch.cost && currentEnergy(pState)>=CHEST_ENERGY; return (
          <button key={ch.id} disabled={!can} onClick={()=>{
              if(pState.coins<ch.cost || currentEnergy(pState)<CHEST_ENERGY)return;
              const pool=allShopItemsFlat.filter(it=>it.slot);
              const item=pickFromChest(pool, ch, pState.owned||[]); if(!item)return;
              const dup=pState.owned?.includes(item.id); const refund=Math.max(3,Math.round(baseCost(item)/3));
              onOpenChest&&onOpenChest({cost:ch.cost,itemId:item.id,dup,refund});
              setChestReveal({item,dup,chest:ch,refund});
              SFX.epic&&SFX.epic(); if(!CALM) spawnParticles("🎉");
            }}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"8px 4px",background:`linear-gradient(180deg,${ch.color}1A,rgba(0,0,0,0.5))`,border:`2px solid ${ch.color}`,borderRadius:8,cursor:can?"pointer":"not-allowed",opacity:can?1:0.45,boxShadow:can?`0 0 8px ${ch.color}40`:"none"}}>
            <ChestSprite open={false} size={48}/>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:ch.color,textAlign:"center"}}>{ch.name.replace("Coffre ","")}</span>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#D9BC5C"}}>{ch.cost} <Coin size={9}/></span>
          </button>
        ); })}
      </div>

      {chestReveal && (()=>{ const it=chestReveal.item, rar=rarityOf(it.cost);
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:2700,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:14,padding:20,textAlign:"center",overflowY:"auto",boxSizing:"border-box"}}>
            <ChestSprite open={true} size={110}/>
            {/* Refonte visuelle Phase 6 — rayons + popIn (pur CSS, tués par .calm-mode) ; la lueur
                statique (box-shadow) reste visible même figée — la récompense reste "spéciale". */}
            <div style={{position:"relative",width:80,height:80,display:"flex",alignItems:"center",justifyContent:"center",animation:"popIn 0.5s cubic-bezier(0.34,1.56,0.64,1)"}}>
              <div className="rays-bg" style={{color:rar.color}}/>
              <div style={{position:"relative",zIndex:1,borderRadius:"50%",boxShadow:`0 0 40px ${rar.color}`}}><ItemSprite itemId={it.id} emoji={it.emoji} size={52}/></div>
            </div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,11px)",color:rar.color}}>{rar.name.toUpperCase()}</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#fff"}}>{it.name}</div>
            {chestReveal.dup
              ? <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#D9BC5C"}}>Tu l'avais déjà! Doublon → +{chestReveal.refund} 🪙</div>
              : <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#5CAD68"}}>Nouvel item débloqué! 🎉</div>}
            <button className="btn-press" onClick={()=>{SFX.click();setChestReveal(null);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"14px 28px",background:rar.color,color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>Super!</button>
          </div>
        );
      })()}

      <div className="card-n2" style={{background:"rgba(0,0,0,0.45)",padding:10}}>
        {/* v2.6.6+ — tabs agrandis en style "pastille" (demande de Gen, réf. planche mockup :
            tap-cible plus grand, texte lisible, icône bien visible — les tabs "microscopiques"
            fontSize:6/padding:4px 7px ne l'étaient pas assez). */}
        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
          {Object.entries(SHOP_TABS).map(([k,l])=>{ const [em,txt]=splitEmojiLabel(l); return (
            <button key={k} onClick={()=>{setShopTab(k);SFX.click();}} style={{display:"inline-flex",alignItems:"center",gap:6,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"9px 14px",background:shopTab===k?"#D9BC5C":"#222",color:shopTab===k?"#0d0d0d":"var(--txt-pale,#aaa)",border:`2px solid ${shopTab===k?"#D9BC5C":"#444"}`,borderRadius:20,cursor:"pointer",transition:"all 0.12s"}}>{em&&<UIIcon name={SHOP_TAB_ICONS[k]} emoji={em} size={18}/>}{txt}</button>
          );})}
        </div>
        {shopTab==="rewards" && (
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {/* v2.6.2 — récompenses "moment" achetées : à planifier avec un parent, aucune expiration */}
            {(()=>{ const myMoments=(config.momentRequests||[]).filter(m=>m.playerId===player.id && m.status!=="fait");
              if(!myMoments.length) return null;
              return <div style={{background:"rgba(50,40,10,0.35)",border:"2px solid #D9BC5C55",borderRadius:5,padding:"7px 9px",marginBottom:4}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#D9BC5C",marginBottom:5}}>🗓️ MES MOMENTS À VENIR</div>
                {myMoments.map(m=>(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                    <span style={{fontSize:14}}>{m.emoji}</span>
                    <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ddd",flex:1}}>{m.label}</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:m.status==="planifie"?"#5CAD68":"#D9BC5C"}}>{m.status==="planifie"?`📅 ${fmtDateShort(m.plannedDate)}`:"⏳ à planifier"}</span>
                  </div>
                ))}
              </div>; })()}
            <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-muted,#888)",marginBottom:2}}>🎲 Les récompenses changent chaque semaine — profites-en!</div>
            {myRewards.length===0&&<div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-dim,#666)",textAlign:"center",padding:"10px 6px"}}>Pas de récompenses cette semaine.</div>}
            {/* Refonte visuelle Phase 2 — sections Petite/Moyenne/Épique (planche de tiers) au lieu
                d'une liste plate ; l'or ne reste que sur le prix 🪙 et le bouton Acheter. */}
            {["petite","moyenne","epique"].map(tk=>{
              const group=myRewards.filter(r=>tierOf(r)===tk); if(!group.length) return null;
              const T2=REWARD_TIERS[tk];
              return (
                <div key={tk}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:T2.color,margin:"6px 0 3px"}}>{T2.label.toUpperCase()}</div>
                  {group.map(r=>{
                    const rPrice=priceOf(r);
                    const canBuy=pState.coins>=rPrice;
                    const bought=pState.boughtRewards?.includes(r.id);
                    // v2.16.57 — les DEUX manques de cet onglet, corrigés ici (la grille cosmétique
                    // juste en dessous, App.jsx ~1561, avait déjà les deux depuis v2.15.7 — jamais
                    // reportés sur l'onglet Récompenses, celui des récompenses de la vraie vie) :
                    //  1. clic sans pièces = silence TOTAL (ni son ni message). La grille cosmétique
                    //     dit « il t'en manque X ». Ici l'enfant tape et rien ne répond.
                    //  2. l'énergie n'était pas regardée : une récompense payable s'affichait
                    //     « Acheter » en or plein contraste, puis handleBuy la refusait avec le
                    //     message générique « la boutique rouvre dans ~X min », sans lien visible
                    //     avec la carte tapée — exactement le motif de plainte de v2.15.7
                    //     (« je pèse et rien ne se passe »), l'énergie étant le même pool pour
                    //     boutique + Mon Perso + coffres.
                    const rHasEnergy = currentEnergy(pState) >= SHOP_ENERGY;
                    const rLocked = !bought && (!canBuy || !rHasEnergy);
                    return (
                      <div key={r.id} onClick={()=>{ if(bought) return;
                          if(!canBuy){ SFX.click&&SFX.click(); showToast(`🪙 Pas assez de pièces! Il t'en manque ${rPrice-(pState.coins||0)}.`,"#D98C8C",2600); return; }
                          if(!rHasEnergy){ SFX.click&&SFX.click(); const m=minsToEnergy(pState,SHOP_ENERGY); showToast(`😴 Ton héros se repose… reviens dans ~${m} min pour cette récompense!`,"#85CDD1",3000); return; }
                          onBuy(r,player.id); }} className={bought?"":T2.cls}
                        style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",marginBottom:5,background:"rgba(0,0,0,0.4)",border:bought?"2px solid #5CAD68":undefined,borderRadius:4,cursor:bought?"default":rLocked?"not-allowed":"pointer",opacity:rLocked?0.4:1}}>
                        <span className="icon-tile" style={{width:38,height:38,flex:"0 0 38px"}}><UIIcon name={r.id} emoji={r.emoji} size={26} block/></span>
                        <div style={{flex:1}}>
                          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:bought?"#5CAD68":"#ddd",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            {r.label}
                            {REWARD_CAT_BADGE[r.cat] && <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#0d0d0d",background:REWARD_CAT_BADGE[r.cat].color,borderRadius:3,padding:"2px 5px"}}>{REWARD_CAT_BADGE[r.cat].label}</span>}
                          </div>
                          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:bought?"#5CAD68":"#D9BC5C"}}>{bought?"RÉCLAMÉ!":<>{rPrice} <Coin size={9}/></>}</div>
                        </div>
                        {!bought&&!rLocked&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C"}}>Acheter</span>}
                        {rLocked&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#444"}}><UIIcon name="lock" emoji="🔒" size={12} style={{opacity:0.6}}/></span>}
                        {bought&&<div style={{display:"flex",flexDirection:"column",gap:3}}>
                          <button onClick={(e)=>{e.stopPropagation();SFX.click();onUnclaimReward&&onUnclaimReward(r);}}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"4px 6px",background:"rgba(0,0,0,0.6)",color:"#D99248",border:"1px solid #D99248",borderRadius:3,cursor:"pointer",whiteSpace:"nowrap"}}>↩️ J'ai changé d'idée</button>
                          <button onClick={(e)=>{e.stopPropagation();SFX.click();onHideReward&&onHideReward(r);}}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"4px 6px",background:"rgba(0,0,0,0.6)",color:"#5CAD68",border:"1px solid #5CAD68",borderRadius:3,cursor:"pointer",whiteSpace:"nowrap"}}>✓ Cacher</button>
                        </div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
        {shopTab!=="rewards" && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
            {(SHOP_ITEMS[shopTab] || (shopTab==="deco" ? decoItems : shopTab===themedCat.id ? themedCat.items : []) || []).map(item=>{
              const owned=pState.owned?.includes(item.id);
              const isDeco=item.slot==="deco"||item.slot==="skin"; // déco + déblocage de peau : jamais « équipé », se gère dans Mon Perso
              const equipped=!isDeco && eq[item.slot]===item.id;
              const iPrice=priceOf(item);
              const canAfford=pState.coins>=iPrice;
              const rar=rarityOf(item.cost);
              // v2.15.7 (bug signalé par Antoine Emery, 2026-07-28 : « je pèse sur Maison/Spécial et
              // rien ne se passe ») : le clic vérifiait déjà les pièces (toast si insuffisant) mais
              // JAMAIS l'énergie avant d'appeler onBuy → handleBuy — qui, lui, bloque bien l'achat si
              // l'énergie manque (App.jsx:6093), mais après coup, avec un message générique sans lien
              // visible avec l'item cliqué. Comme Maison/Spécial contiennent les items les plus chers,
              // c'est là que l'énergie (dépensée par les achats précédents + ouverture de Mon Perso,
              // même pool) s'épuise le plus souvent — d'où l'impression que « rien ne se passe ».
              // Fix : même garde + même toast explicite AVANT le clic, comme pour les pièces.
              const hasEnergy = currentEnergy(pState) >= SHOP_ENERGY;
              return (
                <div key={item.id} onClick={()=>{ if(equipped||(isDeco&&owned))return; if(owned&&item.slot&&!isDeco){setMoodFor("equipped",3000);onEquip(item,player.id);} else if(!owned&&canAfford&&!hasEnergy){SFX.click&&SFX.click();const m=minsToEnergy(pState,SHOP_ENERGY);showToast(`😴 Ton héros se repose… reviens dans ~${m} min pour acheter ça!`,"#85CDD1",3000);} else if(!owned&&canAfford){onBuy(item,player.id);} else if(!owned&&!canAfford){SFX.click&&SFX.click();showToast(`🪙 Pas assez de pièces! Il t'en manque ${iPrice-(pState.coins||0)}.`,"#D98C8C",2600);} }}
                  className={equipped?"":rar.cls}
                  style={{background:equipped?"linear-gradient(180deg,#5CAD6814,rgba(0,0,0,0.45))":undefined,border:equipped?"2px solid #5CAD68":undefined,borderRadius:6,padding:"7px 5px 5px",textAlign:"center",cursor:equipped||(isDeco&&owned)?"default":owned||(canAfford&&hasEnergy)?"pointer":"not-allowed",opacity:!owned&&(!canAfford||!hasEnergy)?0.45:1,filter:!owned&&(!canAfford||!hasEnergy)?"grayscale(1)":"none",position:"relative"}}>
                  <span style={{position:"absolute",top:2,left:0,right:0,fontFamily:"'Press Start 2P',monospace",fontSize:4,color:rar.color}}>{rar.name.toUpperCase()}</span>
                  {/* v2.16.25 — Backlog #16 : cadenas systématique (déjà présent en Récompenses,
                      App.jsx ~2925) étendu ici pour une cohérence grisé+cadenas dans tout le jeu. */}
                  {!owned&&(!canAfford||!hasEnergy)&&<span style={{position:"absolute",top:2,right:3}}><UIIcon name="lock" emoji="🔒" size={10} style={{opacity:0.7}}/></span>}
                  <span className="icon-tile" style={{width:40,height:40,flex:"none",margin:"8px auto 3px"}}>
                    {isDeco
                      ? <DecoSprite decoId={item.id} emoji={item.emoji} size={30}/>
                      : petSpriteKey(item.id)
                      ? <PetSprite itemId={item.id} size={30}/>
                      : <ItemSprite itemId={item.id} emoji={item.emoji} size={30} style={{fontSize:20}}/>}
                  </span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#ccc",display:"block",marginBottom:2,lineHeight:1.1}}>{item.name}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:equipped?"#5CAD68":owned?"var(--txt-muted,#888)":"#D9BC5C"}}>{equipped?"✅ ÉQUIPÉ · retirer":owned?(item.slot==="skin"?"✨ Débloqué":isDeco?"🏠 Mon Perso":"Équiper"):<>{iPrice} <Coin size={9}/></>}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>))}
      {homeTab==="accueil" && (<>
      {/* ── BANNIÈRE « Ma maison » (demande Gen 2026-07-27) : la chambre de l'enfant en large,
          avec son avatar dedans, sur l'écran d'accueil. Tap → Mon Perso (même gate énergie). ── */}
      <div onClick={openAvatar} style={{marginTop:8,cursor:"pointer"}} title="Ma maison — touche pour personnaliser">
        <HouseScene player={player} pState={pState} width={bannerW} ratio={0.36}/>
      </div>
      {/* v2.16.31 — Backlog #7+#11 incréments 3+4/5 : le dernier bouton du menu Accueil
          ("Calendrier") est retiré à son tour — même raison que "Famille" en v2.16.30, devenu
          pur doublon depuis que "Calendrier" a sa propre place dans la nav du bas (ex-onglet
          "Semaine"). Le menu Accueil (Famille/Calendrier/Minuterie à l'origine) est maintenant
          entièrement vide — les 3 destinations ont chacune leur point d'accès dédié ailleurs. */}
      {/* ── BADGE SHELF ─────────────────────────────────────── */}
      <div style={{marginTop:8,background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"12px 14px",border:`2px solid ${pt.accent||"#444"}33`}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:pt.accent||"#D9BC5C",marginBottom:4}}>🏅 BADGES</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-faint,#555)",marginBottom:8}}>Appuie sur un badge pour voir comment le gagner — certains sont secrets! 🕵️</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {BADGES.filter(b=>b.type==="general"||b.type===resolvedThemeId).map(b=>{
            const earned=(pState.badges||[]).includes(b.id);
            const showing=badgeInfo===b.id;
            return (
              <div key={b.id} title={earned?`${b.name}: ${b.desc}`:`🔒 ${b.desc}`}
                onClick={()=>{SFX.click();setBadgeInfo(showing?null:b.id);}}
                style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,width:60,opacity:earned?1:showing?0.7:0.3,transition:"opacity 0.3s",cursor:"pointer",borderRadius:6,outline:showing?`2px solid ${pt.accent||"#D9BC5C"}`:"none",padding:2}}>
                <BadgeIcon badge={b} earned={earned} size={40}/>
                <div style={{fontFamily:"'VT323',monospace",fontSize:11,color:earned?(pt.accent||"#D9BC5C"):"var(--txt-dim,#666)",textAlign:"center",lineHeight:1.2,maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>
              </div>
            );
          })}
        </div>
        {badgeInfo&&(()=>{
          const b=BADGES.find(x=>x.id===badgeInfo);
          if(!b)return null;
          const earned=(pState.badges||[]).includes(b.id);
          return (
            <div style={{marginTop:8,background:"rgba(0,0,0,0.5)",border:`2px solid ${earned?(pt.accent||"#D9BC5C"):"#444"}`,borderRadius:6,padding:"8px 12px",display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:24,filter:earned?"none":"grayscale(1)"}}>{b.emoji}</span>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:earned?(pt.accent||"#D9BC5C"):"var(--txt-pale,#aaa)"}}>{earned?b.name:"🔒 Pas encore gagné"}</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-muted,#888)",lineHeight:1.3}}>{b.desc}</div>
              </div>
              <button onClick={()=>setBadgeInfo(null)} style={{background:"none",border:"none",color:"var(--txt-faint,#555)",cursor:"pointer",fontSize:14}}>✕</button>
            </div>
          );
        })()}
        {(pState.badges||[]).length===0&&<div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-faint,#555)",marginTop:6}}>Complète des quêtes pour débloquer des badges!</div>}
      </div>
      </>)}

      {/* ── ONGLET BOSS : combat familial (jetons d'attaque gagnés en faisant des quêtes) ── */}
      {homeTab==="boss" && config.boss && (()=>{
        const boss=config.boss; const bid=boss.startedAt; const hpMax=boss.hpMax||80;
        const total=bossDamageTotal(allStates||[], bid, config.repairEvents); const hpLeft=Math.max(0,hpMax-total); const hpPct=Math.round(hpLeft/hpMax*100);
        const won=!!boss.defeatedAt; const enraged=!won && hpPct<=30; const fhp=familyHp(boss, enraged); const myJetons=bossJetons(pState,bid);
        const mod=bossModifierOfDay(bid);
        const _petId=pState.equipped?.pet; const _petLv=petLevel((pState.petXp||{})[_petId]||0); const _petReady=!!_petId && pState.lastFedDay===todayStamp() && _petLv>=4;
        const atkBtn=(type,label,sub,enabled)=>(
          <button disabled={!enabled} onClick={()=>{ if(enabled){SFX.click();onBossAttack&&onBossAttack(type);} }}
            style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 6px",lineHeight:1.5,background:enabled?(boss.color||"#FF5555"):"#1a1a1a",color:enabled?"#0d0d0d":"#555",border:"2px solid #0d0d0d",borderRadius:6,cursor:enabled?"pointer":"not-allowed",opacity:enabled?1:0.5,boxShadow:enabled?"2px 2px 0 #0d0d0d":"none"}}>
            {label}<br/><span style={{fontFamily:"'VT323',monospace",fontSize:12}}>{sub}</span>
          </button>
        );
        return (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,11px)",color:"#FF5555"}}>⚔️ COMBAT DE BOSS</div>
            <div style={{background:"rgba(50,18,35,0.55)",border:`3px solid ${boss.color||"#FF5555"}`,borderRadius:12,padding:16,textAlign:"center"}}>
              {boss.forest && <div style={{fontSize:26,letterSpacing:6,marginBottom:-4}}>🌲🌳🌲🌳🌲</div>}
              <BossSprite boss={boss} size={104} style={{filter:won?"grayscale(0.7) opacity(0.7)":"none"}}/>
              {boss.forest && <div style={{fontSize:20,letterSpacing:8,marginTop:2,opacity:0.85}}>🌲🌳🌲</div>}
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:boss.color||"#FF5555",marginTop:8}}>{boss.emoji} {boss.name}</div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-muted,#888)",margin:"8px 0 2px"}}>PV DU BOSS</div>
              <div style={{height:18,background:"#111",border:"2px solid #333",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:hpPct+"%",background:"linear-gradient(90deg,#D97070,#D9BC5C)",transition:"width 0.5s"}}/></div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C",marginTop:3}}>{hpLeft} / {hpMax} PV {won?"✓":""}</div>
            </div>
            {/* v2.16.4 — Chantier 6.3 (demande de Gen) : le bouton "COMBAT FINAL" ouvrait TOUJOURS
                le mini-jeu statique de l'Hydre (HydraFinalGame/combat-hydre.html), peu importe le
                vrai boss actif — et gagner/perdre n'affectait pas les vrais PV. Remplacé par une
                tuile boss-agnostique : le visage de l'enfant + 2 rangées de cœurs (PV boss, PV
                famille), toujours synchronisées avec le vrai combat. Jetons restent en chiffre
                plus bas (Gen a tranché pour 2 rangées seulement, pas 3). */}
            <div style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${boss.color||"#FF5555"}55`,borderRadius:8,padding:"10px 12px",display:"flex",alignItems:"center",gap:12}}>
              <AvatarCanvas avatarDef={pState.avatar||DEFAULT_AVATAR} bodyColor={pt.charBodyColor||player.color} size={48} mood={dashboardMood}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-muted,#888)"}}>PV boss</span>
                  <span style={{fontSize:15,letterSpacing:1}}>{heartsRow(hpPct)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-muted,#888)"}}>PV famille</span>
                  <span style={{fontSize:15,letterSpacing:1}}>{heartsRow(fhp)}</span>
                </div>
              </div>
            </div>
            {!won && <div style={{background:`${boss.color||"#FF5555"}22`,border:`2px solid ${boss.color||"#FF5555"}55`,borderRadius:8,padding:"7px 10px",textAlign:"center"}}>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C"}}><UIIcon name={"boss_mod_"+mod.id} emoji={mod.emoji} size={11}/> {mod.label} (aujourd'hui)</span>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#eee"}}>{mod.desc}</div>
            </div>}
            {enraged && <div style={{background:"#3a0e0e",border:"2px solid #D97070",borderRadius:8,padding:"7px 10px",textAlign:"center",fontFamily:"'VT323',monospace",fontSize:15,color:"#FF8888"}}>🔥 Le boss ENRAGE! Il vide les PV de la famille 2× plus vite — achevez-le!</div>}
            <div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-muted,#888)"}}>❤️ PV DE LA FAMILLE</span><span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:fhp<30?"#D97070":"#5CAD68"}}>{fhp}%</span></div>
              <div style={{height:10,background:"#111",border:"2px solid #333",borderRadius:3,overflow:"hidden",marginTop:2}}><div style={{height:"100%",width:fhp+"%",background:fhp<30?"#D97070":"#5CAD68",transition:"width 0.5s"}}/></div>
              {!won && fhp<40 && <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#FF8888",marginTop:5,lineHeight:1.3}}>⚠️ Le boss reprend des forces! Faites des quêtes et attaquez vite pour défendre la famille!</div>}
            </div>
            {won ? <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:"#5CAD68",textAlign:"center",padding:16}}>🏆 BOSS VAINCU!<br/><span style={{fontFamily:"'VT323',monospace",fontSize:16}}>Bravo toute la famille! 🎉</span></div> : (<>
              <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ddd",textAlign:"center"}}>Tu as <b style={{color:"#D9BC5C",fontSize:20}}>{myJetons}</b> jeton{myJetons>1?"s":""} d'attaque ⚡<br/><span style={{fontSize:13,color:"var(--txt-muted,#888)"}}>1 jeton par quête validée</span></div>
              <div style={{display:"flex",gap:8}}>
                {atkBtn("petite",`${boss.atkEmoji?.petite||"🗡️"} Petite`,`1 jeton · −${bossAtkDamage("petite",mod)} PV`, myJetons>=1)}
                {atkBtn("grosse",`${boss.atkEmoji?.grosse||"💥"} Grosse`,`3 jetons · −${bossAtkDamage("grosse",mod)} PV`, myJetons>=3)}
              </div>
              <button className="btn-press" onClick={()=>{ if(SFX.click)SFX.click(); onBossPetAttack&&onBossPetAttack(); }}
                style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:8,lineHeight:1.5,padding:"12px 6px",background:(_petReady&&myJetons>=PET_ATTACK_COST)?"#D9BC5C":"#2a2418",color:(_petReady&&myJetons>=PET_ATTACK_COST)?"#0d0d0d":"var(--txt-mild,#999)",border:"2px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>
                🐾 Attaque du familier<br/><span style={{fontFamily:"'VT323',monospace",fontSize:12}}>{PET_ATTACK_COST} jetons · dégâts selon ton familier{_petReady?"":" — nourris-le, niv.4+"}</span>
              </button>
              {/* v2.16.20 — Coup de grâce : dès 70%+ de dégâts (hpPct<=30, même seuil que le mode
                  enragé ci-dessus), accessible aux 4 enfants SANS jeton — c'est la finition
                  collective, pas une attaque de plus. */}
              {enraged && <div style={{background:"linear-gradient(180deg,#3a2e0e,#1a1a1a)",border:"2px solid #D9BC5C",borderRadius:8,padding:"10px 12px",textAlign:"center",display:"flex",flexDirection:"column",gap:8}}>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#D9BC5C"}}>🔥 Le boss vacille! Coup de grâce disponible!</span>
                <button className="btn-press" onClick={()=>{ if(SFX.click)SFX.click(); onBossFinish&&onBossFinish(); }}
                  style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 6px",background:"#D9BC5C",color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>
                  ⚔️ COUP DE GRÂCE
                </button>
              </div>}
              {myJetons<1 && <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-muted,#888)",textAlign:"center"}}>Va faire des quêtes (onglet ✅ Aujourd'hui) pour gagner des jetons d'attaque! 💪</div>}
            </>)}
          </div>
        );
      })()}

      {/* ── BARRE D'ONGLETS EN BAS (désencombre l'accueil) ── */}
      {/* v1.89.0 (desktop/mobile flex) — la bande reste pleine largeur (continuité visuelle),
          mais les boutons eux-mêmes restent groupés dans une colonne de largeur raisonnable
          au lieu de s'étirer d'un bord à l'autre d'un écran d'ordinateur. */}
      <div style={{position:"fixed",left:0,right:0,bottom:0,zIndex:90,display:"flex",justifyContent:"center",background:`${pt.bg||"#1a1a2e"}F2`,borderTop:`2px solid ${(pt.accent||player.color)}55`,backdropFilter:"blur(8px)",boxShadow:"0 -4px 16px rgba(0,0,0,0.45)",paddingBottom:"env(safe-area-inset-bottom)"}}>
        <div style={{display:"flex",width:"100%",maxWidth:900}}>
        {(()=>{ const acc=pt.accent||player.color; const bossActive=config.boss && !config.boss.defeatedAt;
          const morningLocked=isMorningLocked(player); // v2.16.7 — Chantier 6.6
          // v2.16.28 — Backlog #7+#11 increment 1/5 : "Aujourd'hui" renommé "Quêtes" (décision de
          // Gen, 1er août). v2.16.29 — increment 2/5 : "Famille" ajouté comme onglet à part
          // entière (navigue vers view==="family" via onGoFamily, pas un homeTab local — jamais
          // "actif" au sens des autres onglets puisqu'on quitte le dashboard). v2.16.30 —
          // increment 3/5 : bouton "Famille" retiré du bloc Accueil (redondant avec l'onglet du
          // bas) et "Minuterie" déplacée dans le sous-onglet Rituels (avec ou sans rituel actif).
          // v2.16.31 — increments 3+4/5 (couplés) : "Semaine" devient "Calendrier" — même
          // position/icône, mais navigue maintenant vers view==="calendars" (via onGoCalendars,
          // même patron que Famille/onGoFamily) plutôt que de basculer un homeTab local, puisque
          // son contenu (vue 7-colonnes événements-only) vit désormais dans l'écran Calendrier
          // partagé — voir plus bas. Les tâches qu'affichait l'ancien onglet "Semaine" ont
          // migré dans "Quêtes" via le toggle "Aujourd'hui"/"Cette semaine" (jourView).
          const tabs=[["accueil","🏠","Accueil","nav_home"],["jour","✅","Quêtes","nav_today"],["family","👨‍👩‍👧‍👦","Famille","nav_family"],...(bossActive?[["boss","⚔️","BOSS","nav_boss"]]:[]),["sem","📅","Calendrier","nav_week"],["shop","🛒","Boutique","nav_shop"]];
          return tabs.map(([k,ic,lb,icn])=>{ const isFamily=k==="family"; const isCalendars=k==="sem"; const on=!isFamily&&!isCalendars&&homeTab===k; const isBoss=k==="boss"; const col=isBoss?"#FF5555":acc;
            const locked=k==="shop"&&morningLocked;
            return (
              <button key={k} onClick={()=>{
                  if(locked){ showToast&&showToast("🚪 Les autres salles du Livre se réveillent après tes tâches du matin!","#D9BC5C",3500); SFX.click(); return; }
                  if(isFamily){ onGoFamily&&onGoFamily(); return; }
                  if(isCalendars){ onGoCalendars&&onGoCalendars(); return; }
                  setHomeTab(k);SFX.click();
                }}
                style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"9px 2px 11px",background:on?`${col}22`:(isBoss?"#FF55550F":"transparent"),border:"none",borderTop:on?`3px solid ${col}`:"3px solid transparent",cursor:"pointer",opacity:locked?0.5:1}}>
                <span style={{fontSize:20,lineHeight:0,filter:on?"none":"grayscale(0.3) opacity(0.8)",animation:isBoss?"pulse 1.4s infinite":"none"}}><UIIcon name={icn} emoji={ic} size={20} block/></span>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(5px,1vw,7px)",color:on?col:(isBoss?"#FF8888":"var(--txt-muted,#888)")}}>{locked?"🚪":lb}</span>
              </button>
            );
          });
        })()}
        </div>
      </div>

    {/* Avatar popup */}
    {avatarOpen && <AvatarPopup player={player} pState={pState} onClose={()=>setAvatarOpen(false)}
      onUpdateAvatar={(av)=>onUpdateAvatar(av,player.id)} onEquip={(item)=>{setMoodFor("equipped",3000);onEquip(item,player.id);}}
      onUpdateHouse={(h)=>onPatchState({house:h})}
      allShopItems={allShopItemsFlat} th={th}/>}
    </div>
  );
});

// ─── ESPACE FAMILLE (Lot 6 #27) ──────────────────────────────
// Petite scène où les 4 avatars flânent (idle, purement décoratif — aucune position n'est
// enregistrée ni synchronisée, ça repart à zéro à chaque chargement). Clic sur un avatar =
// ouvre son profil (même modal que l'ancien bouton "📊 Profil"). Clic ailleurs dans la scène =
// fait marcher SON PROPRE avatar jusque là (si on est connecté comme un enfant, pas en mode
// parent). Volontairement pas de mécanique de jeu (pas de score, pas de collecte) — un espace
// social, pas un jeu de plus.
// Lot 6 #27 correctif — écarte les positions trop proches (avatars/étiquettes qui se
// chevauchent) en les repoussant le long de l'axe, de gauche à droite puis droite à gauche
// pour rester dans les bornes [8,92] même quand plusieurs avatars sont collés.
const FAMILY_SPACE_MIN_GAP = 16;
function resolveFamilySpaceOverlaps(posMap, playerIds, minGap = FAMILY_SPACE_MIN_GAP) {
  const sorted = [...playerIds].sort((a, b) => (posMap[a] ?? 50) - (posMap[b] ?? 50));
  const out = { ...posMap };
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    if ((out[cur] ?? 50) - (out[prev] ?? 50) < minGap) out[cur] = Math.min(92, (out[prev] ?? 50) + minGap);
  }
  for (let i = sorted.length - 2; i >= 0; i--) {
    const next = sorted[i + 1], cur = sorted[i];
    if ((out[next] ?? 50) - (out[cur] ?? 50) < minGap) out[cur] = Math.max(8, (out[next] ?? 50) - minGap);
  }
  return out;
}

function FamilySpace({ config, gameStates, meId, onOpenProfile, th }) {
  const players = config.players || [];
  const playerIds = players.map(p => p.id);
  const [positions, setPositions] = useState(() => {
    const obj = {};
    players.forEach((p, i) => { obj[p.id] = players.length>1 ? 12 + i*(76/(players.length-1)) : 50; });
    return resolveFamilySpaceOverlaps(obj, playerIds);
  });
  // Flânerie ambiante : chaque avatar a une chance de dériver vers une nouvelle position
  // toutes les quelques secondes — juste pour que la scène se sente vivante.
  useEffect(() => {
    const interval = setInterval(() => {
      setPositions(prev => {
        const next = {...prev};
        players.forEach(p => {
          if (Math.random() < 0.5) {
            const cur = next[p.id] ?? 50;
            next[p.id] = Math.max(8, Math.min(92, cur + (Math.random()-0.5)*34));
          }
        });
        return resolveFamilySpaceOverlaps(next, playerIds);
      });
    }, 4000 + Math.random()*2000);
    return () => clearInterval(interval);
  }, [players.length]);

  const handleSceneClick = (e) => {
    if (!meId || meId === "parent") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(8, Math.min(92, ((e.clientX - rect.left) / rect.width) * 100));
    setPositions(prev => resolveFamilySpaceOverlaps({...prev, [meId]: pct}, playerIds));
  };

  return (
    <div onClick={handleSceneClick} style={{position:"relative",height:150,background:`linear-gradient(180deg, ${th.bg||"#1a1a2e"} 0%, ${th.primary||"#2a2a4a"}33 100%)`,borderRadius:10,border:`2px solid ${th.accent||"#5CAD68"}33`,overflow:"hidden",cursor:"pointer",marginBottom:2}}>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:16,background:`${th.accent||"#5CAD68"}22`,borderTop:`2px solid ${th.accent||"#5CAD68"}55`}}/>
      {players.map((p,i)=>{
        const gs = gameStates[i] || {};
        const x = positions[p.id] ?? 50;
        const isMe = p.id===meId;
        // Chantier F (2026-07-27) — humeur réelle dans l'Espace Famille : sourire si le joueur
        // a complété ≥1 quête aujourd'hui (image statique, aucune animation — mode calme ok).
        // (date LOCALE via new Date(ts), pas slice(0,10) qui comparerait la date UTC — piège v2.5.24)
        const _did = Object.values(gs.completedAt||{}).some(ts=>{ const d=ts&&new Date(ts); return d&&!isNaN(d) && `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`===todayStamp(); });
        return (
          <div key={p.id}
            onClick={(e)=>{ e.stopPropagation(); SFX.click(); onOpenProfile(i); }}
            className="float-y"
            style={{position:"absolute",bottom:12,left:`${x}%`,transform:"translateX(-50%)",transition:"left 3.5s ease-in-out",cursor:"pointer",textAlign:"center",zIndex:isMe?2:1}}>
            <AvatarCanvas avatarDef={gs.avatar||DEFAULT_AVATAR} bodyColor={getPlayerTheme(p.themeId).charBodyColor||p.color} size={44} mood={_did?"happy":"neutral"}
              style={{border:`2px solid ${p.color}`,borderRadius:6,boxShadow:isMe?`0 0 10px ${p.color}80`:"none"}}/>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:p.color,marginTop:2,textShadow:"1px 1px 0 #0d0d0d"}}>{displayName(p)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── FAMILY OVERVIEW ─────────────────────────────────────────

// v1.95.0 (Lot 5 #23) — memo() : évite un re-render quand ses props n'ont pas vraiment changé
// (efficace maintenant que App() passe des callbacks/allTasks stabilisés, voir plus bas).
const FamilyOverview = memo(function FamilyOverview({ config, gameStates, allTasks, onSelectPlayer, canOpen, th, meId, onLike, onPostChat, onGiveCoins, onCreateOffer }) {
  const [profileIdx, setProfileIdx] = useState(null);
  const [chatText, setChatText] = useState("");
  const mayOpen = (i)=> canOpen ? canOpen(i) : true;
  const feedName = (pid)=> pid==="parent" ? "👤 Parent" : (displayName((config.players||[]).find(p=>p.id===pid))||"?");
  const feedColor = (pid)=> pid==="parent" ? "#D99248" : ((config.players||[]).find(p=>p.id===pid)?.color||"#888");
  const timeAgo = (ts)=>{ const s=Math.floor((Date.now()-(ts||0))/1000); if(s<60)return "à l'instant"; const m=Math.floor(s/60); if(m<60)return `il y a ${m} min`; const h=Math.floor(m/60); if(h<24)return `il y a ${h} h`; return `il y a ${Math.floor(h/24)} j`; };
  return (
    <div style={{padding:"10px 8px",display:"flex",flexDirection:"column",gap:10}}>
      {profileIdx!==null&&(
        <PlayerProfile player={config.players[profileIdx]} pState={gameStates[profileIdx]||{xp:0,coins:0,completed:[],badges:[]}} config={config} gameStates={gameStates} th={th} meId={meId} onGiveCoins={onGiveCoins} onCreateOffer={onCreateOffer} onClose={()=>setProfileIdx(null)} assignments={[...(config.assignments||[]),...(isCustodyWeek()?(config.weeklyQuests?.assignments||[]):[])]}/>
      )}
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,11px)",color:th.accent,marginBottom:4}}>👨‍👩‍👧‍👦 VUE FAMILLE</div>

      {/* Lot 6 #27 — espace famille : les avatars flânent, clic pour ouvrir un profil ou se déplacer */}
      <FamilySpace config={config} gameStates={gameStates} meId={meId} onOpenProfile={setProfileIdx} th={th}/>

      {/* ⚔️ Boss de famille — PV du boss (attaqué via les jetons gagnés en quêtes) */}
      {config.boss && (()=>{
        const b=config.boss; const hpMax=b.hpMax||80;
        const total=bossDamageTotal(gameStates, b.startedAt, config.repairEvents); const hpLeft=Math.max(0,hpMax-total);
        const pct=Math.min(100,Math.round(hpLeft/hpMax*100));
        const won=!!b.defeatedAt; const fhp=familyHp(b);
        return (
          <div style={{background:won?"rgba(20,55,25,0.5)":"rgba(50,18,35,0.5)",border:`2px solid ${won?"#5CAD68":b.color}`,borderRadius:10,padding:12,display:"flex",gap:12,alignItems:"center"}}>
            <BossSprite boss={b} size={84} style={{flexShrink:0,filter:won?"grayscale(0.6) opacity(0.7)":"none"}}/>
            {b.forest && <span style={{fontSize:22,flexShrink:0}}>🌲{won?"":"🔥"}🌲</span>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:won?"#5CAD68":b.color}}>{won?`🏆 ${b.name} vaincu!`:`${b.emoji} ${b.name}`}</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ccc",margin:"3px 0"}}>{won?"Bravo la famille! Vous l'avez battu ensemble! 🎉":"Faites des quêtes → attaquez le boss dans l'onglet ⚔️ BOSS!"}</div>
              <div style={{height:14,background:"#111",border:"2px solid #333",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:pct+"%",background:`linear-gradient(90deg,#D97070,#D9BC5C)`,transition:"width 0.6s ease"}}/>
              </div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C",marginTop:3}}>{hpLeft} / {hpMax} PV{won?" ✓":` · ❤️ Famille ${fhp}%`}</div>
            </div>
          </div>
        );
      })()}
      {/* Player cards grid */}
      <div className="fo-grid" style={{display:"grid",gridTemplateColumns:`repeat(${Math.min((config.players||[]).length,2)},1fr)`,gap:10,marginTop:14}}>
        {(config.players||[]).map((player,i)=>{
          const ps=gameStates[i]||{xp:0,coins:0,completed:[]};
          const _allAss=[...(config.assignments||[]),...(isCustodyWeek()?(config.weeklyQuests?.assignments||[]):[])];
          const myDone=_allAss.filter(a=>a.playerIds.includes(player.id)&&ps.completed?.includes(a.instanceId+"_"+player.id+"#"+todayStamp())).length;
          const myTotal=_allAss.filter(a=>a.playerIds.includes(player.id)).length;
          const pct=myTotal>0?Math.round((myDone/myTotal)*100):0;
          const lv=getLevel(ps.xp);
          return (
            <div key={player.id} onClick={()=>{SFX.click(); mayOpen(i)?onSelectPlayer(i):setProfileIdx(i);}}
              style={{background:"rgba(0,0,0,0.5)",border:`2px solid ${player.color}99`,borderRadius:8,padding:14,cursor:"pointer",transition:"all 0.15s"}}>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                <AvatarCanvas avatarDef={gameStates[i]?.avatar||DEFAULT_AVATAR} bodyColor={getPlayerTheme(player.themeId).charBodyColor||player.color} size={44}
                  style={{border:`3px solid ${player.color}`,borderRadius:5}}/>
                <div>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.2vw,12px)",color:player.color}}>{displayName(player)}</div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-pale,#aaa)"}}>Niv.{getLevelTitle(ps.xp,player.themeId).level} — {getLevelTitle(ps.xp,player.themeId,ps.settings?.femTitles).title}</div>
                </div>
              </div>
              {/* Progress */}
              <div style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-muted,#888)"}}>Quêtes</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:player.color}}>{myDone}/{myTotal}</span>
                </div>
                <div style={{height:10,background:"#111",border:"2px solid #333",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:pct+"%",background:`linear-gradient(90deg,${player.color},${th.accent})`,transition:"width 0.8s ease"}}/>
                </div>
              </div>
              {/* v2.16.22 — Backlog #12 : XP/pièces retirés d'ici (déjà dans le popup Profil,
                  juste en dessous) — la carte reste un coup d'œil rapide "quêtes du jour",
                  le Profil devient LA source de détail (niveau/XP/pièces/série/inventaire). */}
              <div style={{display:"flex",gap:6,marginTop:8}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:player.color,flex:1,alignSelf:"center"}}>{mayOpen(i)?"Voir mes quêtes →":"Voir le profil →"}</div>
                <button onClick={e=>{e.stopPropagation();SFX.click();setProfileIdx(i);}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"4px 6px",background:"rgba(0,0,0,0.6)",color:th.accent,border:`1px solid ${th.accent}`,borderRadius:3,cursor:"pointer",flexShrink:0}}>📊 Profil</button>
              </div>
            </div>
          );
        })}
      </div>
      {/* 📊 Progrès de la semaine — XP par jour par membre (calculé depuis les quêtes validées) */}
      {(()=>{
        const ds = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        // v2.9.1 — bug signalé par Gen : « toutes les stats de la semaine à 0 » pour 3 enfants sur 4
        // le lundi matin. Ce graphique calculait la semaine en ISO (lundi→dimanche) via
        // `(monday.getDay()+6)%7` — un lundi, "cette semaine" ne couvrait alors QUE lundi→dimanche
        // À VENIR, excluant tout le vendredi/samedi/dimanche déjà fait (la vraie semaine de garde,
        // vendredi→jeudi). Rien n'était perdu (vérifié : xp/coins/completed/badges intacts en prod)
        // — seul ce graphique regardait la mauvaise fenêtre. Même patron que custodyWeekKey
        // (recurring.js) utilisé partout ailleurs dans l'app pour "cette semaine".
        const custodyStart = new Date(); custodyStart.setHours(0,0,0,0);
        custodyStart.setDate(custodyStart.getDate() - ((custodyStart.getDay() + 2) % 7)); // recule au vendredi précédent
        const weekDates = [...Array(7)].map((_,i)=>{ const d=new Date(custodyStart); d.setDate(custodyStart.getDate()+i); return ds(d); });
        const custodyDayLabels = [...DAYS_SHORT.slice(4), ...DAYS_SHORT.slice(0,4)]; // Ven Sam Dim Lun Mar Mer Jeu — aligné sur weekDates
        const todayDs = ds(new Date());
        // v2.6.6 — bug signalé par Gen : « pas encore d'XP » alors que des dizaines de quêtes rotatives
        // étaient validées — assXp ne lisait que config.assignments (l'ancien système statique), jamais
        // config.weeklyQuests.assignments (le système rotatif de garde depuis le 24 juillet), qui porte
        // désormais quasi toute l'activité réelle.
        // Backlog #17 — reconstruction depuis `completed` (pas de montant stocké par doneKey) : une tâche
        // teamSplit n'a JAMAIS accordé le plein XP du catalogue (voir approvePending) — sans ce garde-fou,
        // ce graphique afficherait le double de ce que l'enfant a réellement reçu pour une tâche partagée.
        const assXp = {}; [...(config.assignments||[]), ...(config.weeklyQuests?.assignments||[])].forEach(a=>{ const t=(allTasks||[]).find(x=>x.id===a.taskId); const raw=t?(t.xp||0):0; assXp[a.instanceId]= a.teamSplit?Math.round(raw/2):raw; });
        const xpFor = (ps,dateStr)=> (ps.completed||[]).reduce((sum,k)=>{ if(!k.endsWith("#"+dateStr)) return sum; const inst=k.split("#")[0].slice(0,k.split("#")[0].lastIndexOf("_")); return sum + (assXp[inst]||0); },0);
        const players=config.players||[];
        const perPlayer = players.map((p,i)=>{ const ps=gameStates[i]||{completed:[]}; const days=weekDates.map(d=>xpFor(ps,d)); return {p, days, total:days.reduce((a,b)=>a+b,0)}; });
        const maxDay = Math.max(1, ...perPlayer.flatMap(x=>x.days));
        const leader = [...perPlayer].sort((a,b)=>b.total-a.total);
        const anyXp = perPlayer.some(x=>x.total>0);
        return (
          <div style={{marginTop:6,background:"rgba(0,0,0,0.4)",border:`2px solid ${th.accent}33`,borderRadius:8,padding:"12px 12px"}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:th.accent,marginBottom:8}}>📊 PROGRÈS DE LA SEMAINE</div>
            {!anyXp && <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-soft,#777)"}}>Pas encore d'XP cette semaine. Faites des quêtes pour remplir le graphique! 💪</div>}
            {anyXp && perPlayer.map(({p,days,total})=>(
              <div key={p.id} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:p.color}}>{displayName(p)}</span>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#85CDD1"}}>⚡{total}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,alignItems:"end",height:46}}>
                  {days.map((v,di)=>(
                    <div key={di} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                      <div style={{width:"100%",height:`${Math.max(3,(v/maxDay)*38)}px`,background:weekDates[di]===todayDs?p.color:`${p.color}99`,borderRadius:"2px 2px 0 0",border:weekDates[di]===todayDs?`1px solid #fff`:"none"}} title={`${v} XP`}/>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:weekDates[di]===todayDs?th.accent:"var(--txt-dim,#666)",marginTop:2}}>{custodyDayLabels[di]}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {anyXp && leader.length>1 && leader[0].total>0 && (
              <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#D9BC5C",marginTop:4,textAlign:"center"}}>🏆 En tête cette semaine : <b style={{color:leader[0].p.color}}>{displayName(leader[0].p)}</b> ({leader[0].total} XP) — continuez! 🔥</div>
            )}
          </div>
        );
      })()}

      {/* 📣 Fil de famille — accomplissements + ❤️ + petit chat */}
      <div style={{marginTop:6,background:"rgba(0,0,0,0.4)",border:`2px solid ${th.accent}33`,borderRadius:8,padding:"12px 12px"}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:th.accent,marginBottom:8}}>📣 FIL DE FAMILLE</div>
        {/* Chat */}
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          <input value={chatText} onChange={e=>setChatText(e.target.value.slice(0,140))} placeholder="Écris un mot à la famille…" maxLength={140}
            style={{flex:1,fontFamily:"'VT323',monospace",fontSize:15,padding:"8px 10px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:5,outline:"none"}}/>
          <button onClick={()=>{ if(chatText.trim()){ onPostChat&&onPostChat(chatText.trim()); setChatText(""); SFX.click(); } }}
            style={{flexShrink:0,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px 12px",background:th.accent,color:"#0d0d0d",border:"2px solid #0d0d0d",borderRadius:5,cursor:"pointer"}}>Envoyer</button>
        </div>
        {(config.feed||[]).length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-soft,#777)"}}>Rien encore. Les accomplissements de chacun s'afficheront ici! 🌟</div>}
        <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:"40vh",overflowY:"auto"}}>
          {(()=>{ // Regroupe les quêtes consécutives d'un même enfant pour éviter le flood
            const src=config.feed||[]; const grouped=[];
            for(let i=0;i<src.length;){ const f=src[i];
              if(f.type==="task"){ let j=i, likes=[...(f.likes||[])];
                while(j+1<src.length && src[j+1].type==="task" && src[j+1].playerId===f.playerId){ j++; likes.push(...(src[j].likes||[])); }
                const count=j-i+1;
                grouped.push(count>1 ? {...f, likes:_uniq(likes), emoji:"🔥", text:`${feedName(f.playerId)} a accompli ${count} quêtes!`} : f);
                i=j+1;
              } else { grouped.push(f); i++; }
            }
            // Lot 6 #28 — en-têtes de jour (Aujourd'hui/Hier/jour de semaine/date) pour mieux
            // repérer où on est dans le temps sur une liste par ailleurs plate.
            const dayLabel=(ts)=>{
              const d=new Date(ts), now=new Date();
              const yest=new Date(now); yest.setDate(yest.getDate()-1);
              if(d.toDateString()===now.toDateString()) return "Aujourd'hui";
              if(d.toDateString()===yest.toDateString()) return "Hier";
              const diffDays=Math.floor((now-d)/86400000);
              return diffDays<7 ? d.toLocaleDateString('fr-CA',{weekday:'long'}) : d.toLocaleDateString('fr-CA',{day:'numeric',month:'long'});
            };
            let lastDay=null; const out=[];
            grouped.forEach(f=>{ const dl=dayLabel(f.ts); if(dl!==lastDay){ out.push({__dayHeader:true,label:dl,key:"day_"+dl+"_"+f.ts}); lastDay=dl; } out.push(f); });
            return out;
          })().map(f=>{
            if(f.__dayHeader) return <div key={f.key} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-dim,#666)",textTransform:"uppercase",margin:"8px 0 2px",paddingBottom:3,borderBottom:"1px solid #2a2a2a"}}>{f.label}</div>;
            const liked=(f.likes||[]).includes(meId);
            // Lot 6 #28 — accent de couleur par type d'événement (même sémantique que le reste de l'app :
            // vert=quête, cyan=niveau/XP, or=badge, rouge=boss, orange=rituel) pour distinguer d'un coup d'œil.
            const TYPE_ACCENT={task:"#5CAD68",level:"#85CDD1",badge:"#D9BC5C",boss:"#D98C8C",ritual:"#D99248",repair:"#7FD6E0"}; // v2.6.0 — 🕊️
            const accent=f.type==="chat"?feedColor(f.playerId):(TYPE_ACCENT[f.type]||"#2a2a2a");
            return (
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"rgba(0,0,0,0.4)",border:"1px solid #2a2a2a",borderLeft:`3px solid ${accent}`,borderRadius:6}}>
                <span style={{fontSize:18}}>{f.emoji||"✨"}</span>
                <div style={{flex:1,minWidth:0}}>
                  {f.type==="chat"
                    ? <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#eee",lineHeight:1.25}}><b style={{color:feedColor(f.playerId)}}>{feedName(f.playerId)}:</b> {f.text}</div>
                    : <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd",lineHeight:1.25}}>{f.text}</div>}
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"var(--txt-dim,#666)",marginTop:2}}>{timeAgo(f.ts)}</div>
                </div>
                <button onClick={()=>{onLike&&onLike(f.id);SFX.click();}}
                  style={{flexShrink:0,fontFamily:"'VT323',monospace",fontSize:15,padding:"4px 8px",background:liked?"#3a1a1a":"transparent",color:liked?"#D98C8C":"var(--txt-muted,#888)",border:`1px solid ${liked?"#D98C8C":"#444"}`,borderRadius:14,cursor:"pointer"}}>
                  {liked?"❤️":"🤍"} {(f.likes||[]).length||""}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

// ─── PARENT PANEL ────────────────────────────────────────────
// Extrait dans `src/parentpanel.jsx` le 2026-08-05 (Lot 5/#24) — voir l'import en tête de fichier.

// ═══════════════════════════════════════════════════════════════
// LOGIN SCREEN — "Qui joue?" + PIN par joueur
// ═══════════════════════════════════════════════════════════════
// ─── CALENDAR HELPERS ────────────────────────────────────────────────────────
// Libellé lisible d'une récurrence
const recurLabel = (e) => {
  if (e?.recur?.freq==="daily") return "Chaque jour";
  if (e?.recur?.freq==="weekly") return "Chaque "+(DAYS[e.recur.day]||"?");
  return e?.date||"";
};

export default function App() {
  const [screen, setScreen] = useState("loading"); // loading|setup|login|game
  // v2.16.43 — précharge portail parent + mini-jeux en tâche de fond une fois le démarrage passé.
  usePrefetchLazyScreens(screen !== "loading");
  const [config, setConfig] = useState(null);
  const [gameStates, setGameStates] = useState([]); // per-player
  const [view, setView] = useState("family"); // "family"|0|1|2|3
  const [parentPinOpen, setParentPinOpen] = useState(false);
  const [parentMode, setParentMode] = useState(false);
  const [sessionPlayer, setSessionPlayer] = useState(null); // enfant connecté (idx) — null = parent/aucun
  const [returnToPlayer, setReturnToPlayer] = useState(null); // v2.5.3 (Correctif 3) — enfant à restaurer en sortant du mode parent, SEULEMENT si on y est entré depuis sa session (pas depuis l'écran de login)
  const [editingBook, setEditingBook] = useState(false); // true = "Modifier le livre" (édite la config existante)
  const [parentPanel, setParentPanel] = useState(false); // slide-out panel
  const [hamOpen, setHamOpen] = useState(false); // menu ☰ enfant (piloté depuis le header)
  const [timerRitual, setTimerRitual] = useState(null); // rituel pré-sélectionné en ouvrant la minuterie
  // v2.6.6 — calendrier consolidé (menu du bas) : formulaire d'ajout/modification pour l'enfant connecté.
  const [myCalOpen, setMyCalOpen] = useState(false);
  const [myCalForm, setMyCalForm] = useState({ editId:null, ownerIdx:null, type:"evenement", label:"", date:"", time:"", recur:"none", day:0 });
  const [myCalTargets, setMyCalTargets] = useState([]); // v2.15.0 — enfant(s) ciblé(s) par un ajout en mode parent (checkboxes, comme l'ancien onglet parent retiré)
  const [actionLog, setActionLog] = useState([]); // [{time,msg,color}]
  const [undoStack, setUndoStack] = useState([]);
  const [pinChangeMode, setPinChangeMode] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [toast, setToast] = useState(null);
  // v2.16.11 (Backlog #12) — easter egg : taper vite 7 fois sur le titre du header
  // révèle un message secret. refs pour ne pas re-render à chaque tap ; le compteur
  // se remet à zéro si on s'arrête plus d'1.5s (doit être un vrai tapotement rapide).
  const titleTapCountRef = useRef(0);
  const titleTapTimerRef = useRef(null);
  const [rewardPopup, setRewardPopup] = useState(null);
  const [bossWin, setBossWin] = useState(null); // v1.72.0 — célébration de victoire de boss
  const [miniGame, setMiniGame] = useState(null); // {player,playerIdx,level,playerThemeId,pendingReward}
  const [syncedAt, setSyncedAt] = useState(0); // dernier instant de synchro cloud réussie
  const [now, setNow] = useState(new Date());

  // v1.94.0 (Lot 5 #22) — ralenti de 1s à 30s : rien ici (barre de progression, compte à
  // rebours, indicateur de synchro) n'a besoin d'une précision à la seconde près, et ce
  // tick re-render tout l'arbre App() (voir HeaderClock ci-dessus pour l'affichage H:M
  // qui, lui, garde un tick de 1s mais isolé dans son propre composant).
  useEffect(()=>{ const i=setInterval(()=>setNow(new Date()),30000); return()=>clearInterval(i); },[]);

  // Load + migration automatique des données
  useEffect(()=>{
    load().then(raw=>{
      const data = migrateSavedData(raw);
      if(data?.config&&data?.gameStates){
        // 🧹 Nettoyage des tâches « à usage unique » d'un jour passé (anti-accumulation)
        const today=todayStamp();
        const expired=(data.config.assignments||[]).filter(a=>a.oneDay && a.oneDay!==today).map(a=>a.instanceId);
        if(expired.length){
          const rm=new Set(expired);
          data.config={...data.config,
            assignments:(data.config.assignments||[]).filter(a=>!rm.has(a.instanceId)),
            removedAssignments:_uniq([...(data.config.removedAssignments||[]), ...expired]).slice(-800)};
        }
        // 🧹 v1.55.0 — ménage des tâches perso ORPHELINES (plus aucune assignation) → tombstone durable
        // v2.15.8 (CAUSE RACINE de la casse généralisée des tâches perso de toute la famille, trouvée
        // le 2026-07-28 en reconstruisant les rituels Matin/École/Camp/Soir) : ce ménage tournait à
        // CHAQUE chargement, sur CHAQUE appareil, sans aucune protection, avec deux failles combinées :
        // (1) ne regardait QUE config.assignments, jamais config.weeklyQuests.assignments (Lot 7) ;
        // (2) tournait même quand load() retombait sur la copie LOCALE seule après un échec réseau
        // (LAST_LOAD_SYNCED=false — serveur Canner qui se réveille, ~1-4s, ou simple délai wifi,
        // documenté dans SYNC.md) — une copie locale peut alors être périmée (n'a pas encore vu les
        // assignations créées ailleurs depuis sa dernière vraie synchro), faisant passer des tâches
        // BIEN VIVANTES pour orphelines, tombstonées pour toujours et repoussées au cloud aussitôt
        // (save() plus bas). Fix : n'agir QUE sur une synchro cloud confirmée, et inclure weeklyQuests.
        if (wasLastLoadSynced()) {
          const usedTaskIds=new Set([...(data.config.assignments||[]).map(a=>a.taskId), ...((data.config.weeklyQuests||{}).assignments||[]).map(a=>a.taskId)]);
          const orphans=(data.config.customTasks||[]).filter(t=>t&&t.id&&!usedTaskIds.has(t.id)).map(t=>t.id);
          if(orphans.length){
            const orphSet=new Set(orphans);
            data.config={...data.config,
              customTasks:(data.config.customTasks||[]).filter(t=>!orphSet.has(t.id)),
              removedCustomTasks:_uniq([...(data.config.removedCustomTasks||[]), ...orphans]).slice(-1000)};
          }
        }
        setConfig(data.config);
        setGameStates(data.gameStates);
        // Toujours persister les données migrées (pin par défaut, seenVersions, etc.)
        save({...data, newChangelogVersions:[]});
        // Injecter les nouvelles versions dans le feed famille
        if(data.newChangelogVersions?.length){
          const newEntries = data.newChangelogVersions
            .map(v=>CHANGELOG.find(c=>c.version===v))
            .filter(Boolean)
            .map(c=>({ type:"update", version:c.version, features:c.features, ts:new Date().toISOString() }));
          // v2.5.29 — fini l'accumulation sans plafond (2,35 Mo en prod).
          // v2.16.52 — l'ordre de cette concaténation n'a plus d'importance : `dedupeUpdateFeed`
          // classe par position dans le CHANGELOG et garde les 30 plus récentes (avant, la queue
          // de la liste gagnait, donc ce bloc — trié du plus récent au plus vieux — faisait garder
          // les versions les plus VIEILLES).
          setConfig(cfg=>({...cfg, updateFeedEntries: dedupeUpdateFeed([...(cfg.updateFeedEntries||[]),...newEntries])}));
        }
        // Les tâches en attente d'hier restent simplement dans la file
        // "À valider" du portail parent (plus de modal en libre-service).
        setScreen("login");
      } else setScreen("setup"); // No valid saved data → first-time setup
    });
  },[]);

  const persist = useCallback((cfg,gs) => save({config:cfg,gameStates:gs,savedAt:new Date().toISOString()}), []);

  // Refs pour lire l'état courant dans des callbacks (fil de famille)
  const cfgRef = useRef(config); cfgRef.current = config;
  const gsRef = useRef(gameStates); gsRef.current = gameStates;
  const viewRef = useRef(view); viewRef.current = view; // pour ne pas casser l'écran courant pendant la sync

  // Backlog #13 — budget-temps quotidien par enfant (contrôle parental). Comptabilise le temps de
  // session en minutes RÉELLES écoulées (horodatage, pas des ticks comptés — un intervalle peut être
  // retardé quand l'onglet est en arrière-plan) pendant qu'un enfant est connecté (hors mode parent).
  // v2.16.66 — le compteur mesurait la PRÉSENCE (« l'enfant est connecté »), pas l'USAGE : tout le
  // temps passé en arrière-plan ou appareil en veille était crédité au budget du jour. Preuve dans la
  // donnée de prod du 14 août : Olivier portait `sessionMinutes {day:"2026-08-08", minutes:465}` —
  // 7 h 45 de « jeu » un jour où il n'a complété AUCUNE quête et dont la dernière action réelle
  // (`energyTs`) date de 13:49 UTC ; les trois autres enfants sont à 2 minutes. Le jour où un budget
  // est réglé dans le portail, ces minutes-là déclenchent l'écran « C'EST L'HEURE DE LA PAUSE! »
  // (`isTimeLocked`, gating.js) sans que l'enfant ait joué. Deux gardes, aucune n'invente de seuil :
  //   (a) le temps ne court QUE pendant que l'onglet est visible — passer en arrière-plan verse ce
  //       qui est dû puis arrête le chrono, revenir le redémarre à maintenant ;
  //   (b) un flush ne crédite jamais plus que ~2 ticks : le tick est de 60 s et ne peut se produire
  //       que si la machine tourne, donc un écart supérieur signifie veille/gel, pas du jeu. Le
  //       compteur repart alors de maintenant (sinon l'écart sauté serait recrédité tick après tick).
  useEffect(()=>{
    if(sessionPlayer==null || parentMode) return;
    let lastFlush = Date.now();
    let counting = (typeof document==="undefined") || document.visibilityState!=="hidden";
    const flush = () => {
      const now = Date.now();
      const { minutes:elapsedMin, resetClock } = sessionFlushPlan(now-lastFlush, counting);
      if(elapsedMin<=0){ if(resetClock) lastFlush = now; return; }
      lastFlush = resetClock ? now : lastFlush + elapsedMin*60000;
      const day = todayStamp();
      const gs = gsRef.current; const s = gs[sessionPlayer]; if(!s) return;
      const sm = s.sessionMinutes && s.sessionMinutes.day===day ? s.sessionMinutes : {day, minutes:0};
      const n=[...gs]; n[sessionPlayer]={...s, sessionMinutes:{day, minutes:(sm.minutes||0)+elapsedMin}};
      setGameStates(n); persist(cfgRef.current, n);
    };
    const iv=setInterval(flush,SESSION_TICK_MS);
    const onVis=()=>{
      if(document.visibilityState==="hidden"){ flush(); counting=false; }   // verser AVANT d'arrêter
      else { lastFlush = Date.now(); counting=true; }
    };
    document.addEventListener("visibilitychange",onVis);
    return ()=>{ clearInterval(iv); document.removeEventListener("visibilitychange",onVis); flush(); };
  },[sessionPlayer, parentMode, persist]);

  // v1.90.0 — capture globale des erreurs JS techniques → config.errorLogs (synced comme config.bugs),
  // pour aider au troubleshooting à distance (voir MAINTENANCE.md, chantier "logs techniques" du 21
  // juillet). Discret : aucune UI enfant, lisible seulement par le parent (ParentPanel, onglet Journal)
  // et par les passes de maintenance qui lisent /api/famille. Anti-spam : même erreur < 1 min ignorée
  // (évite qu'une erreur qui boucle remplisse les 80 places d'un coup).
  // v2.16.42 — la capture passe désormais par la file DURABLE (`errorlog.js`) au lieu
  // d'écrire directement dans config : une erreur qui casse le rendu démonte l'arbre
  // avant que `setConfig`/`persist` aient abouti, donc les erreurs les plus graves ne
  // se journalisaient jamais (errorLogs vide en prod depuis un mois). La file est versée
  // dans config.errorLogs par l'effet de remontée juste en dessous.
  const lastErrRef = useRef({ key: "", ts: 0 });
  useEffect(() => {
    const logError = (message, stack, source) => {
      const key = (message || "") + "|" + (stack || "").slice(0, 200);
      const now = Date.now();
      if (lastErrRef.current.key === key && now - lastErrRef.current.ts < 60000) return;
      lastErrRef.current = { key, ts: now };
      const cfg = cfgRef.current || {};
      const who = (() => { const v = viewRef.current; return typeof v === "number" ? (cfg.players?.[v]?.name || "?") : "?"; })();
      queueError({ id: "err_" + uid(), ts: now, who, message: (message || "").slice(0, 300), stack: (stack || "").slice(0, 500), source: source || "", appVersion: APP_VERSION });
    };
    const onError = (event) => { try { logError(event.message, event.error?.stack, event.filename); } catch {} };
    const onRejection = (event) => { try { const r = event.reason; logError(r?.message || String(r), r?.stack, "promise"); } catch {} };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);

  // v2.16.42 — remontée de la file durable vers config.errorLogs (d'où elle se synchronise
  // vers le portail parent, onglet Journal, exactement comme config.bugs). Tourne dès que
  // la config est chargée : c'est CE passage qui récupère un plantage de rendu survenu au
  // chargement précédent (l'ErrorBoundary l'a mis en file, l'app est morte, on le remonte
  // au prochain démarrage sain). Puis toutes les 15 s pour les erreurs bénignes en cours
  // de session. N'écrit rien — donc ne déclenche aucune synchro — si la file est vide.
  //
  // Deux temps volontaires (écrire, PUIS retirer de la file une fois l'entrée constatée
  // dans la config) : une écriture de config peut encore être écrasée juste après par une
  // autre (course au démarrage entre `load()` et cet effet, observée en dev). Vider la file
  // d'avance perdrait l'erreur pour de bon ; ici le prochain tour la réécrit simplement.
  useEffect(() => {
    if (screen === "loading") return;
    const flushErrors = () => {
      const queued = peekErrorQueue();
      if (!queued.length) return;
      const cfg = cfgRef.current || {};
      const known = new Set((cfg.errorLogs || []).map(e => e && e.id));
      const landed = queued.filter(e => known.has(e.id));
      if (landed.length) dropQueuedErrors(landed.map(e => e.id)); // confirmées → hors de la file
      const fresh = queued.filter(e => !known.has(e.id));
      if (!fresh.length) return;
      const n = { ...cfg, errorLogs: [...fresh, ...(cfg.errorLogs || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 80) };
      setConfig(n); persist(n, gsRef.current);
    };
    flushErrors();
    const iv = setInterval(flushErrors, 15000);
    return () => clearInterval(iv);
  }, [screen, persist]);

  // Ajoute une entrée au fil de famille (auto: quêtes, niveaux; manuel: chat)
  const pushFeed = useCallback((entry)=>{
    const cfg=cfgRef.current||{}; const fe={ id:"f_"+uid(), ts:Date.now(), likes:[], ...entry };
    const n={...cfg, feed:[fe,...(cfg.feed||[])].slice(0,60)};
    setConfig(n); persist(n, gsRef.current);
  },[persist]);
  const toggleFeedLike = useCallback((feedId, byId)=>{
    const cfg=cfgRef.current||{};
    const feed=(cfg.feed||[]).map(f=> f.id!==feedId ? f : {...f, likes: (f.likes||[]).includes(byId) ? f.likes.filter(x=>x!==byId) : [...(f.likes||[]),byId]});
    const n={...cfg, feed}; setConfig(n); persist(n, gsRef.current);
  },[persist]);

  // ── Boucle de sync : tire les changements faits sur les autres appareils ──
  // (remotePull retourne null en ~0ms si aucun mode sync n'est disponible)
  useEffect(()=>{
    let stop=false;
    const tick=async()=>{
      const remote=await remotePull();
      if(stop||!remote||remote===PULL_FAILED)return; // rien à faire si cloud vide ou échec réseau
      let local=null; try{const r=localStorage.getItem(STORE_KEY); if(r)local=JSON.parse(r);}catch{}
      // Pas de local : on adopte le remote s'il est plus récent (comportement d'origine)
      if(!local){
        if(isNewer(remote.savedAt, getLastSavedAt())){
          const data=migrateSavedData(remote);
          if(data?.config&&data?.gameStates){
            setLastSavedAt(data.savedAt);
            try{localStorage.setItem(STORE_KEY,JSON.stringify(data));}catch{}
            setConfig(data.config); setGameStates(data.gameStates);
          }
        }
        return;
      }
      // Les deux existent → fusion non-destructive
      const merged=mergeFamily(local, remote);
      // ⚠️ Ne pas casser l'écran de l'enfant qui joue : on garde SON mode/rituel courant
      // (sinon la sync d'un autre appareil le ramène ailleurs au bout de 25s).
      const vi=viewRef.current;
      if(typeof vi==="number" && merged.gameStates?.[vi] && gsRef.current?.[vi]){
        merged.gameStates[vi]={...merged.gameStates[vi], mode:gsRef.current[vi].mode, activeRoutineId:gsRef.current[vi].activeRoutineId};
      }
      if(_famSig(merged)!==_famSig(local)){
        merged.savedAt=new Date().toISOString();
        const data=migrateSavedData(merged);
        if(data?.config&&data?.gameStates){
          setLastSavedAt(data.savedAt);
          try{localStorage.setItem(STORE_KEY,JSON.stringify(data));}catch{}
          setConfig(data.config); setGameStates(data.gameStates);
          remotePush(data);
        }
      } else if(isNewer(local.savedAt, remote.savedAt)){
        remotePush(local); // contenu identique mais le cloud est en retard → on le remet à jour
      }
    };
    const iv=setInterval(tick,25000); // toutes les 25s
    const onVis=()=>{ if(document.visibilityState==="visible") tick(); }; // + au retour sur l'app
    document.addEventListener("visibilitychange",onVis);
    return ()=>{ stop=true; clearInterval(iv); document.removeEventListener("visibilitychange",onVis); };
  },[]);

  // Indicateur de synchro : écoute les synchros cloud réussies (push/pull)
  useEffect(()=>{
    const onSync=()=>setSyncedAt(Date.now());
    window.addEventListener("lq-synced",onSync);
    return ()=>window.removeEventListener("lq-synced",onSync);
  },[]);

  // v1.79.0 — FILET DE SÉCURITÉ victoire du boss (fix "boss jamais vaincu")
  // Avant : la victoire n'était calculée QUE dans handleBossAttack/handleBossPetAttack, au moment d'un clic.
  // Si les dégâts cumulés dépassaient déjà les PV (ex: dégâts arrivés par synchro d'un autre appareil APRÈS
  // le dernier clic, ou tous les jetons de la famille dépensés avant que le total franchisse le seuil),
  // plus personne ne pouvait re-déclencher le calcul de victoire → boss bloqué pour toujours, sans le jeu
  // de fin ni les récompenses (vécu avec l'Hydre à deux têtes du 1er juillet, jamais vaincue malgré des
  // dégâts cumulés très supérieurs à ses PV). Ce filet réévalue la victoire à CHAQUE changement d'état
  // (sync, validation de quête…), pas seulement au clic — donc impossible de rester bloqué.
  useEffect(()=>{
    const boss = cfgRef.current?.boss;
    if(!boss || boss.defeatedAt) return;
    const HPMAX = boss.hpMax||80;
    const totalDmg = bossDamageTotal(gameStates, boss.startedAt, cfgRef.current?.repairEvents); // v2.6.0 — inclut les réparations 🕊️
    if(totalDmg < HPMAX) return;
    if(!bossQuestsAllDone(cfgRef.current, gameStates)) return;
    const bid = boss.startedAt;
    if(gameStates.some(g=>g.bossClaimed===bid)) return; // v2.5.25 — idempotence : un autre chemin (clic attaque/familier) a déjà accordé la victoire pour ce boss
    const now = new Date().toISOString();
    const n = gameStates.map(g=>{
      const _it = pickUltraLegendary();
      return {...g, coins:(g.coins||0)+40, coinsLifetime:(g.coinsLifetime||0)+40, xp:(g.xp||0)+50,
        owned:[...new Set([...(g.owned||[]), _it.id])],
        badges:[...new Set([...(g.badges||[]),"b_boss"])],
        bossClaimed: bid,
        pendingCelebrations:[...(g.pendingCelebrations||[]), {id:"c_"+uid(), bossWin:{name:boss.name,emoji:boss.emoji,color:boss.color}, itemId:_it.id, itemName:_it.name, itemEmoji:_it.emoji}]};
    });
    const nb = {...boss, defeatedAt:now};
    const fe = {id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:"🏆",text:`🎉 La famille a VAINCU le ${boss.name}! +40 🪙 et +50 XP pour tout le monde! 🏆`};
    const ncfg = {...cfgRef.current, boss:nb, feed:[fe,...(cfgRef.current.feed||[])].slice(0,60)};
    setConfig(ncfg); setGameStates(n); persist(ncfg, n);
  },[gameStates, config?.boss, config?.repairEvents]); // v2.6.0 — re-évalue aussi quand une réparation 🕊️ ajoute des dégâts

  // v2.6.0 — 🕊️ Effet collectif des quêtes de réparation. Exactly-once : config.repairEvents
  // (union-by-id des deux côtés du merge, id = instanceId de l'assignation) — un event existe ⇒
  // l'effet a déjà été accordé, même après fusion multi-appareils. Actif SEULEMENT en mode parent :
  // le portail est ouvert au moment de la DERNIÈRE validation (approvePending), donc un seul
  // appareil détecteur en pratique — fenêtre de course quasi nulle, et l'union-by-id couvre le reste.
  // ⚠️ Ne JAMAIS stocker sur config.boss (merge shallow last-write-wins).
  useEffect(()=>{
    if(!parentMode) return;
    const cfg = cfgRef.current; if(!cfg?.players?.length) return;
    const granted = new Set((cfg.repairEvents||[]).map(e=>e.id));
    const ready = (cfg.assignments||[]).filter(a =>
      a.repair && Array.isArray(a.playerIds) && a.playerIds.length>=2 && !granted.has(a.instanceId) &&
      a.playerIds.every(pid=>{
        const idx=(cfg.players||[]).findIndex(p=>p.id===pid); if(idx<0) return false;
        const key=a.instanceId+"_"+pid+"#"+(a.oneDay||todayStamp());
        return (gameStates[idx]?.completed||[]).includes(key);
      }));
    if(!ready.length) return;
    const boss = (cfg.boss && !cfg.boss.defeatedAt) ? cfg.boss : null;
    let n = gameStates; let feed = [...(cfg.feed||[])]; const events = [...(cfg.repairEvents||[])];
    const nameOf = pid => { const pl=(cfg.players||[]).find(p=>p.id===pid); return pl ? displayName(pl) : null; };
    for(const a of ready){
      const names = a.playerIds.map(nameOf).filter(Boolean);
      const listTxt = names.length>1 ? names.slice(0,-1).join(", ")+" et "+names[names.length-1] : (names[0]||"");
      if(boss){
        const bid=boss.startedAt, HPMAX=boss.hpMax||80;
        const cur = bossDamageTotal(n, bid, events);
        // Cap HPMAX-1 si le verrou des corvées du boss est actif (même règle que les attaques)
        const room = bossQuestsAllDone(cfg, n) ? 50 : Math.max(0,(HPMAX-1)-cur);
        const dmg = Math.min(50, room);
        events.push({ id:a.instanceId, bossStartedAt:bid, dmg, bonusCoins:0, ts:Date.now() });
        feed.unshift({ id:"f_"+uid(), ts:Date.now(), likes:[], type:"repair", playerId:"parent", emoji:"🕊️", text:`🕊️ ${listTxt} ont réparé quelque chose ensemble — le boss recule de ${dmg} PV!` });
      } else {
        events.push({ id:a.instanceId, bossStartedAt:null, dmg:0, bonusCoins:10, ts:Date.now() });
        n = n.map((g,i)=> a.playerIds.includes((cfg.players||[])[i]?.id) ? {...g, coins:(g.coins||0)+10, coinsLifetime:(g.coinsLifetime||0)+10} : g);
        feed.unshift({ id:"f_"+uid(), ts:Date.now(), likes:[], type:"repair", playerId:"parent", emoji:"🕊️", text:`🕊️ ${listTxt} ont réparé quelque chose ensemble — la famille a retrouvé son équilibre! +10 🪙 chacun` });
      }
    }
    const ncfg = {...cfg, repairEvents:events, feed:feed.slice(0,60)};
    setConfig(ncfg); if(n!==gameStates) setGameStates(n); persist(ncfg, n);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gameStates, parentMode]);

  // Lot 7A — génération auto des quêtes récurrentes au début de chaque semaine de garde
  useEffect(()=>{
    if(!config?.players?.length) return;
    const cwk = custodyWeekKey();
    if(isCustodyWeek() && config.weeklyQuests?.generatedForWeek !== cwk){
      const newAss = generateCustodyWeekAssignments(config.players, cwk);
      const n = {...config, weeklyQuests:{ generatedForWeek:cwk, assignments:newAss }};
      setConfig(n); persist(n, gameStates);
    } else if(!isCustodyWeek() && config.weeklyQuests?.generatedForWeek){
      // Semaine de pause — vider les quêtes récurrentes
      const n = {...config, weeklyQuests: null};
      setConfig(n); persist(n, gameStates);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[config?.players, config?.weeklyQuests?.generatedForWeek]);

  // v2.6.2 — Défi hebdo GRADUÉ (décision Gen 26 juillet) : fini le tout-ou-rien du « défi parfait ».
  // Paliers 3/5/7 jours cochés (NON consécutifs — rien ne se perd, aucun reproche sous 3 jours),
  // payés dès qu'atteints : +10 🪙, +15 🪙, +25 🪙 + badge « Maître de soi » au 7/7.
  // Remplace le cadre fantôme frame_maitre_de_soi (jamais défini dans aucun catalogue — bug #2
  // de l'analyse game design) et l'écriture pendingCelebration au singulier que rien ne lisait
  // (bug #1). Idempotence multi-appareils : payé UNIQUEMENT sur l'appareil de l'enfant connecté
  // (sessionPlayer), marqueur semaine+paliers dans SON gameState (challengeTiers).
  useEffect(()=>{
    if(parentMode || sessionPlayer==null) return;
    if(!config?.weeklyChallenge?.challenges?.length) return;
    const cwk = custodyWeekKey();
    if(config.weeklyChallenge.weekKey && config.weeklyChallenge.weekKey!==cwk) return; // défi d'une autre semaine
    const player=config.players[sessionPlayer]; if(!player) return;
    const ch=config.weeklyChallenge.challenges.find(c=>c.playerId===player.id); if(!ch) return;
    const nDays=challengeDaysCount(ch.checkins, cwk);
    if(nDays<CHALLENGE_TIERS[0].days) return;
    setGameStates(gs=>{
      const s=gs[sessionPlayer]; if(!s) return gs;
      const claimed=(s.challengeTiers&&s.challengeTiers.week===cwk)?(s.challengeTiers.tiers||[]):[];
      const due=CHALLENGE_TIERS.filter(t=>nDays>=t.days && !claimed.includes(t.days));
      if(!due.length) return gs;
      const coins=due.reduce((a,t)=>a+t.coins,0);
      const hit7=due.some(t=>t.days===7);
      const newBadge=hit7 && !(s.badges||[]).includes("b_maitre");
      const celeb={ id:"c_"+uid(), level:null, taskEmoji:ch.emoji||"🌟",
        taskLabel:`Défi de la semaine : ${nDays} jour${nDays>1?"s":""} réussi${nDays>1?"s":""}!`,
        xp:0, coins, themeId:player.themeId||"none",
        badges:newBadge?[{id:"b_maitre",emoji:"🧘",name:"Maître de soi"}]:[] };
      const n=[...gs];
      n[sessionPlayer]={...s,
        coins:(s.coins||0)+coins, coinsLifetime:(s.coinsLifetime||0)+coins,
        badges:hit7?[...new Set([...(s.badges||[]),"b_maitre"])]:(s.badges||[]),
        challengeTiers:{week:cwk, tiers:[...claimed, ...due.map(t=>t.days)]},
        pendingCelebrations:[...(s.pendingCelebrations||[]), celeb]};
      persist(config,n);
      return n;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[config?.weeklyChallenge, sessionPlayer, parentMode]);

  const showToast = useCallback((msg,color="",dur=3000)=>{ setToast({msg,color}); setTimeout(()=>setToast(null),dur); },[]);
  const logAction = useCallback((msg,color="#D99248")=>{
    const entry={time:new Date().toLocaleTimeString("fr-CA",{hour:"2-digit",minute:"2-digit"}),msg,color};
    setActionLog(l=>[entry,...l.slice(0,19)]);
  },[]);

  const todayDayIdx = (now.getDay()+6)%7; // Mon=0

  // Report des tâches récurrentes non faites (carry-over, approuvé par Gen le 2026-07-25) — Lun-Jeu seulement.
  useEffect(()=>{
    if(!isCustodyWeek()) return;
    if(!config?.weeklyQuests?.assignments?.length) return;
    const { assignments: nextAss, changed } = carryOverUnfinishedTasks(config.weeklyQuests.assignments, gameStates, config.players, todayDayIdx);
    if(!changed) return;
    const n = {...config, weeklyQuests:{...config.weeklyQuests, assignments: nextAss}};
    setConfig(n); persist(n, gameStates);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[config?.weeklyQuests?.assignments, todayDayIdx]);

  // Handle setup complete
  const handleSetupDone = useCallback((cfg) => {
    const gs = cfg.players.map(()=>({ xp:0, coins:0, completed:[], pending:[], owned:[], equipped:{}, boughtRewards:[], badges:[], pin:null }));
    setConfig(cfg); setGameStates(gs); setScreen("login"); setView("family");
    persist(cfg,gs);
    setTimeout(()=>SFX.welcome(),300);
  },[persist]);

  // Request complete
  // L'enfant envoie sa tâche en validation — autonome, pas de code à entrer.
  // Le parent valide ensuite depuis le portail (onglet "À valider").
  const requestComplete = useCallback((ass,playerId) => {
    const playerIdx = config.players.findIndex(p=>p.id===playerId);
    if(playerIdx<0)return;
    const gs=gameStates[playerIdx];
    // Calendrier = clé sans date (persiste jusqu'à l'examen); tâches = clé du jour (reset quotidien)
    const isCal=String(ass.instanceId).startsWith("cal_");
    const doneKey=isCal ? ass.instanceId+"_"+playerId : ass.instanceId+"_"+playerId+"#"+todayStamp();
    if(gs.completed?.includes(doneKey)||gs.pending?.includes(doneKey))return;
    setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={...n[playerIdx],pending:[...new Set([...(n[playerIdx].pending||[]),doneKey])]}; persist(config,n); return n; });
    // v2.6.2 — gratification instantanée (décision Gen 26 juillet) : le TAP lui-même est célébré
    // (mini pluie d'étoiles, gardée par CALM à l'intérieur de spawnParticles + son léger), même si
    // l'octroi réel d'XP/pièces reste 100 % à la validation parent. Modèle Joon : le cerveau TDAH a
    // besoin d'un retour immédiat — sans tricher sur la supervision.
    try{ const _t=[...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===ass.taskId); spawnParticles(_t?.emoji||"⭐", false); SFX.click&&SFX.click(); }catch{}
    // v2.5.28 (item #6 analyse game design) — l'info « familier pas nourri = pas d'XP » existait mais
    // n'était montrée nulle part au bon moment. L'XP familier est accordée à la VALIDATION parent
    // (petFedToday, ~5385), donc nourrir plus tard aujourd'hui compte encore — le message est une
    // invitation douce, pas une punition (un seul toast à la fois, d'où le message combiné).
    const petHungry = !!gs.equipped?.pet && gs.lastFedDay !== todayStamp();
    if(petHungry) showToast("📨 Envoyée à tes parents! 🍖 Psst : ton familier a faim — nourris-le aujourd'hui pour qu'il gagne de l'XP avec tes quêtes!","#85CDD1",5500);
    else showToast("📨 Envoyée à tes parents pour validation!","#85CDD1",3500);
  },[config,gameStates,persist,showToast]);

  // Retrouve la tâche (catalogue, perso ou calendrier) derrière un doneKey
  const resolvePendingTask = useCallback((playerIdx, doneKey)=>{
    const base=doneKey.split("#")[0]; // retire le tampon de date éventuel
    const instanceId=base.slice(0,base.lastIndexOf("_"));
    if(instanceId.startsWith("cal_")){
      const entry=(gameStates[playerIdx]?.calendar||[]).find(e=>"cal_"+e.id===instanceId);
      if(!entry)return null;
      const exam=entry.type==="examen";
      return { emoji:exam?"📝":"📚", label:(exam?"Étudier: ":"Devoir: ")+entry.label, xp:exam?20:10, coins:exam?5:3 };
    }
    const allAss=[...(config.assignments||[]),...(config.weeklyQuests?.assignments||[])];
    const ass=allAss.find(a=>a.instanceId===instanceId);
    if(!ass)return null;
    const found=[...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===ass.taskId)||null;
    // Backlog #17 — tâche "en équipe" (invitation acceptée) : marque à porter jusqu'à approvePending,
    // qui divisera XP/pièces par 2 (partagés, pas doublés — voir le plan §#17).
    return found && ass.teamSplit ? {...found, teamSplit:true} : found;
  },[config,gameStates]);

  // Validation parent (portail) : donne XP/pièces/badges + popup/mini-jeu
  // v2.16.68 — `opts.viaOverride` : même chemin, même comptabilité, seuls les mots changent.
  // Le raccourci « ⚡ VALIDER SANS CODE » du tableau de bord enfant passe par ici (voir
  // `handleForceComplete`), et le parent est alors DEVANT l'enfant — « à sa prochaine connexion »
  // serait faux, la fête part dès qu'il rend l'appareil (l'effet ~2827 la retient tant que
  // `parentMode` est actif). Le journal du portail garde la distinction des deux gestes.
  const approvePending = useCallback((playerIdx, doneKey, opts)=>{
    const viaOverride=!!opts?.viaOverride;
    const task=resolvePendingTask(playerIdx,doneKey);
    const player=config.players[playerIdx];
    if(!task){ // assignation disparue → on nettoie sans récompense
      // v2.6.6 — bug signalé par Gen : approuver une tâche fantôme ne l'empêchait PAS de revenir
      // (contrairement à refuser, qui tombstone via refusedKeys) — une assignation récurrente
      // orpheline régénérait donc la même fausse demande chaque jour malgré l'approbation répétée.
      setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
        n[playerIdx]={...p,
          pending:(p.pending||[]).filter(k=>k!==doneKey),
          refusedKeys:[...new Set([...(p.refusedKeys||[]), doneKey])].slice(-400)};
        persist(config,n); return n; });
      return;
    }
    setGameStates(gs=>{
      const p=gs[playerIdx];
      if(p.completed?.includes(doneKey))return gs;
      const prevLv=getLevel(p.xp).level;
      // Backlog #17 — tâche "en équipe" (teamSplit) : XP/pièces PARTAGÉS, pas doublés — chacun des 2
      // reçoit la moitié (arrondie) à SA propre validation, contrairement aux réparations 🕊️ qui donnent
      // la récompense pleine à chacun (patron existant, volontairement différent, voir plan §#17).
      const grantXp=task.teamSplit?Math.round((task.xp||0)/2):(task.xp||0);
      const grantCoins=task.teamSplit?Math.round((task.coins||0)/2):(task.coins||0);
      const newXp=p.xp+grantXp, newCoins=p.coins+grantCoins;
      const newLv=getLevel(newXp).level;
      // Count tasks done today for streak badge (clés du jour: ..._player#YYYY-MM-DD)
      const today="#"+todayStamp();
      const todayCount=(p.completed||[]).filter(k=>k.endsWith(today)).length+1;
      const updatedPs={...p,xp:newXp,coins:newCoins,coinsLifetime:(p.coinsLifetime||0)+grantCoins,completed:[...new Set([...(p.completed||[]),doneKey])],pending:(p.pending||[]).filter(k=>k!==doneKey),completedAt:{...(p.completedAt||{}), [doneKey]:new Date().toISOString()},xpLog:appendXpLog(p.xpLog,grantXp,"quete",dayOfDoneKey(doneKey,todayStamp()))};
      // v2.16.74 — badges par étiquette : le compte n'est plus relu SEULEMENT depuis les
      // assignations vivantes (voir `mergeCatCounts`, catalog.js). La catégorie est tamponnée
      // ICI, le seul endroit où la tâche est encore résolue (`task`), donc une assignation
      // supprimée plus tard — ou une quête rotative `wq_*` remplacée la semaine suivante — ne
      // peut plus faire reculer la progression de l'enfant. Le calcul historique reste dans la
      // boucle via le MAX : il voit encore ce que le compteur, neuf, n'a pas.
      // Comme `coinsLifetime`, ce compteur ne redescend pas à l'annulation (`handleUndo`) — même
      // choix délibéré, et même conséquence bornée : +1 par annulation.
      const _catBumped={...(p.catCounts||{})};
      if(task.cat)_catBumped[task.cat]=(_catBumped[task.cat]||0)+1;
      const _catCounts=mergeCatCounts(_catBumped, completionCatCounts(updatedPs, cfgRef.current||config));
      updatedPs.catCounts=_catCounts;
      const newBadgeIds=checkBadges(updatedPs,player,todayCount, _catCounts);
      if(newBadgeIds.length) updatedPs.badges=[...(p.badges||[]),...newBadgeIds];
      // Le familier ÉQUIPÉ gagne de l'XP — SEULEMENT s'il est « en forme » (nourri aujourd'hui).
      // C'est la boucle Tamagotchi : nourris-le chaque jour pour qu'il grandisse avec tes quêtes.
      const eqPet=p.equipped?.pet;
      const petFedToday=p.lastFedDay===todayStamp();
      if(eqPet && petFedToday){ const _g=gainPet(p,eqPet,grantXp); updatedPs.petXp=_g.petXp; updatedPs.petDay=_g.petDay; }
      // Série 🔥 : marquer le jour où l'ENFANT a accompli la quête — pas celui où le parent valide.
      // v2.16.64 : `todayStamp()` ici créditait la date de la VALIDATION. Une validation faite le
      // lendemain (ou en lot après plusieurs jours) déplaçait la journée de l'enfant, et le jour du
      // travail ne comptait ni pour la série 🔥 ni pour la ligue. La clé porte le bon jour.
      updatedPs.activeDays=_uniq([...(p.activeDays||[]), dayOfDoneKey(doneKey, todayStamp())]);
      const n=[...gs]; n[playerIdx]=updatedPs;
      // Fil de famille : on enregistre l'accomplissement (+ niveau / badges) dans le MÊME save
      const now=Date.now(); const fents=[{ id:"f_"+uid(), ts:now, likes:[], type:"task", playerId:player.id, text:`${displayName(player)} a accompli « ${task.label} »`, emoji:task.emoji||"✅" }];
      if(prevLv<newLv) fents.unshift({ id:"f_"+uid(), ts:now+1, likes:[], type:"level", playerId:player.id, text:`${displayName(player)} passe au niveau ${newLv}!`, emoji:"⭐" });
      for(const bid of newBadgeIds){ const b=BADGES.find(x=>x.id===bid); if(b) fents.unshift({ id:"f_"+uid(), ts:now+2, likes:[], type:"badge", playerId:player.id, text:`${displayName(player)} a gagné le badge « ${b.name} »`, emoji:b.emoji||"🏅" }); }
      let feedAcc=[...fents, ...((config.feed)||[])];
      let bossNow=config.boss;
      // Combat de boss : chaque quête accomplie donne 1 JETON d'attaque (dépensé dans l'onglet BOSS)
      if(bossNow && !bossNow.defeatedAt){
        const bid=bossNow.startedAt;
        const cur=(updatedPs.bossBattle&&updatedPs.bossBattle.bossId===bid)?updatedPs.bossBattle:{bossId:bid,earned:0,spent:0,dmg:0};
        updatedPs.bossBattle={...cur, earned:(cur.earned||0)+1};
        n[playerIdx]=updatedPs;
      }
      // La célébration (popup + jeu de niveau) est DIFFÉRÉE vers l'appareil de l'enfant,
      // jouée à SA prochaine connexion — pas sur l'écran du parent qui valide.
      const celeb={ id:"c_"+uid(), level: prevLv<newLv?newLv:null, taskEmoji:task.emoji||"✅", taskLabel:task.label||"", xp:grantXp, coins:grantCoins, themeId:player.themeId||"none",
        badges:newBadgeIds.map(id=>BADGES.find(b=>b.id===id)).filter(Boolean).map(b=>({id:b.id,emoji:b.emoji,name:b.name})) };
      n[playerIdx]={...n[playerIdx], pendingCelebrations:[...(n[playerIdx].pendingCelebrations||[]), celeb]};
      const newCfg={...config, boss:bossNow, feed:feedAcc.slice(0,60)};
      setConfig(newCfg);
      persist(newCfg,n);
      setUndoStack(u=>[...u.slice(-9),{doneKey,playerIdx,xp:grantXp,coins:grantCoins}]);
      showToast(viaOverride
        ? `⚡ Validé sans code! ${displayName(player)} aura sa surprise${prevLv<newLv?" et son jeu de niveau":""} en revenant à son écran 🎉`
        : `✅ Validé! ${displayName(player)} aura sa surprise${prevLv<newLv?" et son jeu de niveau":""} à sa prochaine connexion 🎉`,"#5CAD68",4000);
      return n;
    });
    logAction(`${viaOverride?"⚡ Validé sans code":"✅ Validé"}: ${displayName(player)} — ${task.label}`,"#5CAD68");
  },[config,persist,resolvePendingTask,logAction,showToast]);

  // v1.64.0 — l'enfant « archive » (efface) un message de refus
  const handleDismissRefusal = useCallback((playerIdx, key)=>{
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]; n[playerIdx]={...p, refusals:(p.refusals||[]).filter(r=>r.key!==key)}; persist(config,n); return n; });
  },[config,persist]);

  // v2.6.0 — annonces parent : archivage par l'enfant
  const handleDismissAnnouncement = useCallback((playerIdx, announcementId)=>{
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]; n[playerIdx]={...p, dismissedAnnouncements:[...(p.dismissedAnnouncements||[]), announcementId]}; persist(config,n); return n; });
  },[config,persist]);
  // v2.6.0 — création d'une annonce parent
  const handleCreateAnnouncement = useCallback((announcement)=>{
    const newCfg={...config, announcements:[...(config.announcements||[]), {...announcement, id:uid(), createdAt:todayStamp()}]};
    setConfig(newCfg); persist(newCfg, gameStates);
  },[config,gameStates,persist]);
  // v2.6.0 — suppression d'une annonce parent
  // v2.16.80 — le retrait local ne suffisait pas : `announcements` se fusionne en union par id, donc
  // l'annonce revenait de l'autre copie à la synchro suivante (et systématiquement côté serveur, qui
  // met toujours son état stocké en base). Tombstone, comme pour les rituels et les propositions.
  const handleDeleteAnnouncement = useCallback((announcementId)=>{
    const newCfg={...config,
      announcements:(config.announcements||[]).filter(a=>a.id!==announcementId),
      removedAnnouncements:_uniq([...(config.removedAnnouncements||[]), announcementId]).slice(-200)};
    setConfig(newCfg); persist(newCfg, gameStates);
  },[config,gameStates,persist]);
  // v2.15.1 — renvoyer une annonce aux enfants qui l'ont fermée (copie ciblée, nouvel id —
  // seule façon fiable de la faire réapparaître : dismissedAnnouncements est une union entre appareils)
  //
  // v2.16.54 — deux défauts trouvés dans les données de prod du 12 août, qui se nourrissaient l'un
  // l'autre : `config.announcements` portait SIX copies quasi identiques de « Départ: 8:00! »
  // (`n1ywe2h` + 5 copies des 28-29 juillet). Reconstitution :
  //   (1) La copie héritait de `expiresAt` TEL QUEL. L'original expirait le 28 juillet ; les copies
  //       faites le 29 naissaient donc déjà expirées, et le filtre côté enfant
  //       (`expiresAt >= todayStamp()`) les écartait aussitôt — un renvoi qui ne renvoyait rien.
  //   (2) Rien ne changeait côté parent après un clic : `closedBy` se calcule sur
  //       `dismissedAnnouncements` de l'ORIGINAL, qui ne bouge évidemment jamais (et que la fusion
  //       traite en union increvable). Le bouton « 🔄 Renvoyer (2) » restait donc là, identique,
  //       sans le moindre retour visuel — le réflexe humain étant de recliquer.
  // Fix : la copie est prolongée jusqu'à aujourd'hui si elle serait née expirée, elle est marquée
  // `resendOf` (lien vers l'original), et un enfant qui a déjà un renvoi OUVERT n'en reçoit pas un
  // deuxième. Le bouton disparaît donc tout seul, et réapparaît si l'enfant referme aussi le renvoi.
  const handleResendAnnouncement = useCallback((announcementId)=>{
    const anns=config.announcements||[];
    const orig=anns.find(a=>a.id===announcementId);
    if(!orig) return 0;
    const today=todayStamp();
    const rootId=orig.resendOf||announcementId; // jamais de copie de copie : tout pend de l'original
    const openResends=anns.filter(a=>a.resendOf===rootId && (!a.expiresAt || a.expiresAt>=today));
    const dismissedBy=(config.players||[]).filter((p,i)=>{
      const gs=gameStates[i];
      if(!gs||!(gs.dismissedAnnouncements||[]).includes(announcementId)) return false;
      if(!(orig.targetAll || (orig.targetPlayerIds||[]).includes(p.id))) return false;
      // renvoi déjà en cours et pas encore fermé par cet enfant → ne pas en refabriquer un
      return !openResends.some(r=>(r.targetPlayerIds||[]).includes(p.id) && !(gs.dismissedAnnouncements||[]).includes(r.id));
    }).map(p=>p.id);
    if(!dismissedBy.length) return 0;
    const copy={...orig, id:uid(), resendOf:rootId, targetAll:false, targetPlayerIds:dismissedBy,
      createdAt:today, expiresAt:(orig.expiresAt && orig.expiresAt>=today)?orig.expiresAt:today};
    const newCfg={...config, announcements:[...anns, copy]};
    setConfig(newCfg); persist(newCfg, gameStates);
    return dismissedBy.length;
  },[config,gameStates,persist]);

  // Refus parent : retire la demande sans XP
  const refusePending = useCallback((playerIdx, doneKey)=>{
    const task=resolvePendingTask(playerIdx,doneKey);
    const player=config.players[playerIdx];
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
      const refusal={ key:doneKey, label:task?.label||"Quête", emoji:task?.emoji||"✗", msg:refusMsg(doneKey), ts:Date.now() };
      n[playerIdx]={...p,
        pending:(p.pending||[]).filter(k=>k!==doneKey),
        refusedKeys:[...new Set([...(p.refusedKeys||[]), doneKey])].slice(-400), // tombstone → ne revient plus au portail parent
        refusals:[...(p.refusals||[]).filter(r=>r.key!==doneKey), refusal].slice(-10) }; // message drôle pour l'enfant
      persist(config,n); return n; });
    logAction(`✗ Refusé: ${displayName(player)} — ${task?.label||doneKey}`,"#D99248");
    showToast(`✗ Demande refusée`,"#D99248");
  },[config,persist,resolvePendingTask,logAction,showToast]);

  // Mini-game ended — apply bonus then show reward popup
  const handleMiniGameEnd = useCallback((bonusXp,bonusCoins)=>{
    if(!miniGame)return;
    const {playerIdx,pendingReward}=miniGame;
    setMiniGame(null);
    if(bonusXp>0||bonusCoins>0){
      setGameStates(gs=>{
        const n=[...gs];
        n[playerIdx]={...n[playerIdx],xp:n[playerIdx].xp+bonusXp,coins:n[playerIdx].coins+bonusCoins,coinsLifetime:(n[playerIdx].coinsLifetime||0)+Math.max(0,bonusCoins)};
        persist(config,n);
        return n;
      });
      showToast(`🎮 Bonus mini-jeu! +${bonusXp} XP · +${bonusCoins} 🪙`,"#D9BC5C",4000);
    }
    setRewardPopup(pendingReward);
  },[miniGame,config,persist,showToast]);

  // À la connexion de l'enfant : jouer les fêtes différées (validées par le parent sur un autre appareil)
  // puis vider la file pour qu'elles ne rejouent pas.
  const consumeCelebrations = useCallback((idx)=>{
    const ps=gameStates[idx]; if(!ps) return;
    const queue=ps.pendingCelebrations||[]; if(!queue.length) return;
    const player=config.players[idx]; if(!player) return;
    const _bw=queue.find(c=>c.bossWin); const _wonItems=queue.filter(c=>c.itemId).map(c=>({id:c.itemId,name:c.itemName,emoji:c.itemEmoji})); // v1.74.0 — victoire de boss différée
    // On regroupe la file en UNE fête (cumul XP/pièces, tous les badges, le plus haut niveau atteint)
    const totXp=queue.reduce((s,c)=>s+(c.xp||0),0);
    const totCoins=queue.reduce((s,c)=>s+(c.coins||0),0);
    // Dédoublonne les badges par id (sinon un même badge gagné sur 2 appareils s'affiche 2 fois)
    const allBadges=(()=>{ const seen=new Set(), out=[]; for(const b of queue.flatMap(c=>c.badges||[])){ if(b&&!seen.has(b.id)){seen.add(b.id);out.push(b);} } return out; })();
    const levels=queue.map(c=>c.level).filter(l=>l!=null);
    const topLevel=levels.length?Math.max(...levels):null;
    const label=queue.length===1?(queue[0].taskLabel||"Quête validée!"):`${queue.length} quêtes validées pendant ton absence!`;
    const emoji=queue.length===1?(queue[0].taskEmoji||"✅"):"🎉";
    const forcedType=queue.map(c=>c.game).find(Boolean)||null; // jeu imposé (ex: cadeau Pac-Man)
    // Cadeau pur (0 XP / 0 pièce / aucun badge) → on ne montre pas de popup de récompense vide
    const pendingRwd=(totXp||totCoins||allBadges.length)?{ task:{emoji,label,xp:totXp,coins:totCoins}, player, newBadges:allBadges }:null;
    // On vide la file tout de suite ET on marque ces ids comme consommés (tombstone v2.12.2 —
    // le simple vidage à [] ne suffit plus à empêcher une résurrection par fusion, voir mergeGameState).
    const consumedIds=queue.map(c=>c.id).filter(Boolean);
    setGameStates(gs=>{ const n=[...gs]; if(n[idx]) n[idx]={...n[idx], pendingCelebrations:[], consumedCelebrationIds:[...new Set([...(n[idx].consumedCelebrationIds||[]), ...consumedIds])].slice(-300)}; persist(config,n); return n; });
    setTimeout(()=>{
      // v1.88.0 (Lot 3 #11) — intensité réduite pour une célébration de tâche(s) ordinaire(s);
      // pleine intensité si un vrai jalon est dedans (level-up ou victoire de boss)
      spawnParticles(emoji, topLevel!=null || !!_bw);
      if(_bw){ try{ if(!CALM)spawnParticles("🏆"); SFX.epic&&SFX.epic(); }catch{} setBossWin({..._bw.bossWin, items:_wonItems}); } // notif de victoire à la connexion
      if(topLevel!=null||forcedType){ SFX.epic(); setMiniGame({player,playerIdx:idx,level:topLevel||getLevel(ps.xp||0).level,playerThemeId:player.themeId||"none",pendingReward:pendingRwd,forcedType,isGift:topLevel==null}); }
      else if(pendingRwd){ SFX.task(); setRewardPopup(pendingRwd); }
    },500);
  },[gameStates,config,persist,spawnParticles]);

  // v1.67.0 (fix B1) — Avant, le mini-jeu/fête de niveau ne se jouait QU'à la connexion
  // (consumeCelebrations dans onSelectPlayer). Si le parent validait pendant que l'enfant
  // était DÉJÀ connecté, la file pendingCelebrations grandissait via la sync mais rien ne
  // se déclenchait → l'enfant voyait la notif au fil mais « le jeu ne partait jamais ».
  // Cet effet consomme la file AUSSI en cours de session (sans couper une fête en cours).
  useEffect(()=>{
    if(sessionPlayer==null || parentMode) return;
    if(miniGame || rewardPopup) return;            // ne pas interrompre une fête déjà à l'écran
    const q=gameStates[sessionPlayer]?.pendingCelebrations;
    if(q && q.length) consumeCelebrations(sessionPlayer);
  },[sessionPlayer,parentMode,gameStates,miniGame,rewardPopup,consumeCelebrations]);

  // Buy / equip
  const handleBuy = useCallback((item,playerId)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    // v1.84.0 (Lot 1 #B3) — magasiner coûte de l'énergie (frein "plaisir", jamais les corvées)
    const p0=gameStates[idx];
    if(currentEnergy(p0)<SHOP_ENERGY){ const m=minsToEnergy(p0,SHOP_ENERGY); showToast(`😴 Ton héros se repose… la boutique rouvre dans ~${m} min!`,"#85CDD1",3500); return; }
    const isReward=!item.slot;
    const price=priceOf(item); // items (.cost) ET récompenses (.coins), ×PRICE_MULT
    if((p0.coins||0)<price) return; // pas assez de pièces — rien à faire (même garde qu'avant, remontée hors de l'updater)
    // v2.6.2 — l'entrée "moment" (mr, uid() inclus) est construite ICI, dans le corps de handleBuy
    // (appelé UNE FOIS par vrai clic) — jamais dans l'updater passé à setGameStates, que StrictMode
    // double-invoque en dev : un uid()+setConfig générés à CHAQUE invocation créait 2 entrées
    // dupliquées par achat (trouvé en test navigateur). Précédent apparenté : v2.5.23.
    let newCfg = config;
    // v2.16.62 — estampille d'ACHAT, calculée ici (corps de handleBuy, une fois par vrai clic) et
    // jamais dans l'updater, que StrictMode double-invoque : c'est elle qui identifie désormais le
    // remboursement dans `refundedRewards` (voir handleUnclaimReward). Le tombstone était keyé sur la
    // SEMAINE, donc il expirait au changement de semaine alors que la récompense, elle, revenait
    // indéfiniment par `boughtRewards` (dernière-écriture-gagne).
    const buyTs = isReward ? Date.now() : 0;
    if(isReward && item.moment){
      const mr={ id:"mr_"+uid(), playerId, rewardId:item.id, emoji:item.emoji, label:item.label, coins:price, status:"attente", plannedDate:null, createdAt:new Date().toISOString() };
      newCfg = {...config, momentRequests:[...(config.momentRequests||[]), mr]};
      setConfig(newCfg);
    }
    SFX.buy();
    setGameStates(gs=>{
      const p=gs[idx];
      // v2.16.2 — double-clic/double-tap rapide sur "Acheter" (avant que le bouton se réaffiche en
      // ÉQUIPÉ/RÉCLAMÉ) pouvait re-passer ce test : p0 ci-dessus vient d'une fermeture figée au rendu
      // du clic, donc un 2e clic quasi simultané le relit encore "pas assez cher" → 2e débit réel de
      // pièces alors que owned/boughtRewards restent dédupliqués par Set (achat visible une seule fois,
      // pièces perdues deux fois). Idempotence sur l'état FRAIS de l'updater : déjà possédé → no-op.
      const alreadyHave = isReward ? (p.boughtRewards||[]).includes(item.id) : (p.owned||[]).includes(item.id);
      if(alreadyHave) return gs;
      if((p.coins||0)<price)return gs;
      const n=[...gs]; n[idx]={...p,coins:(p.coins||0)-price,owned:[...new Set([...(p.owned||[]),item.id])],boughtRewards:isReward?[...new Set([...(p.boughtRewards||[]),item.id])]:p.boughtRewards,rewardBuyTs:isReward?{...(p.rewardBuyTs||{}),[item.id]:buyTs}:p.rewardBuyTs,equipped:item.slot?{...(p.equipped||{}),[item.slot]:item.id}:(p.equipped||{}),energy:Math.max(0,currentEnergy(p)-SHOP_ENERGY),energyTs:new Date().toISOString()};
      persist(newCfg,n); // newCfg identique à chaque (double-)invocation → persist reste idempotent
      return n;
    });
    showToast(item.moment ? `🎉 ${item.emoji} ${item.label} — à planifier avec ton parent! 🗓️` : `🎉 ${item.emoji} ${item.name||item.label} acheté!`,"#D9BC5C", item.moment?4200:3000);
    spawnParticles(item.emoji||"🎉");
  },[config,gameStates,persist,showToast]);

  const handleUpdateAvatar = useCallback((avatarDef, playerId)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    setGameStates(gs=>{ const n=[...gs]; n[idx]={...n[idx],avatar:avatarDef}; persist(config,n); return n; });
  },[config,persist]);

  const handleEquip = useCallback((item,playerId)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    // v2.13.x (retour Gen : « on peut pas le déséquiper? ») — TOGGLE : retaper l'item équipé le retire.
    const already = (gameStates[idx]?.equipped||{})[item.slot]===item.id;
    setGameStates(gs=>{ const n=[...gs]; n[idx]={...n[idx],equipped:{...(n[idx].equipped||{}),[item.slot]:already?null:item.id}}; persist(config,n); return n; });
    showToast(already?`↩️ ${item.emoji} retiré`:`✅ ${item.emoji} équipé!`, already?"#85CDD1":"#5CAD68");
  },[config,gameStates,persist,showToast]);

  // ── Parent mode actions ──────────────────────────────────
  const handleDeComplete = useCallback((doneKey, playerIdx) => {
    const player = config.players[playerIdx];
    const assId = doneKey.split("_")[0];
    const ass = config.assignments.find(a=>a.instanceId===assId);
    const task = ass ? [...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===ass.taskId) : null;
    // v2.16.82 — retirer la clé de `completed` ne suffisait pas : `completed` est une UNION de
    // chaînes, et un état d'où la clé a disparu n'exprime AUCUN retrait — la copie d'en face la
    // ramenait à la synchro suivante, dans les deux sens. Le bouton reprenait donc l'XP et les
    // pièces sans jamais décocher la quête pour de bon, et chaque nouveau clic les reprenait encore.
    // `deCompleted[doneKey]` = date de l'annulation ; `mergeGS` soustrait de l'union les clés dont
    // l'annulation est plus récente que la complétion (`completedAt`), donc refaire la quête le même
    // jour la remet bien au tableau. `completedAt` n'est PAS effacé : c'est la borne de comparaison.
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
      n[playerIdx]={...p, xp:Math.max(0,p.xp-(task?.xp||0)), coins:Math.max(0,p.coins-(task?.coins||0)),
        completed:(p.completed||[]).filter(k=>k!==doneKey),
        deCompleted:{...(p.deCompleted||{}), [doneKey]:Date.now()}};
      persist(config,n); return n; });
    logAction(`↩️ ${player?.name}: tâche annulée (${task?.label||doneKey})`,"#D99248");
    showToast(`↩️ Tâche annulée pour ${player?.name}`,"#D99248");
  },[config,persist,logAction,showToast]);

  const handleAdjustXP = useCallback((playerIdx, delta) => {
    const player = config.players[playerIdx];
    setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={...n[playerIdx],xp:Math.max(0,n[playerIdx].xp+delta),coins:Math.max(0,n[playerIdx].coins+(delta>0?Math.abs(Math.floor(delta/2)):0))}; persist(config,n); return n; });
    logAction(`${delta>0?"+":""}${delta} XP → ${player?.name}`,"#85CDD1");
    showToast(`${delta>0?"+":""}${delta} XP pour ${player?.name}`,"#85CDD1");
  },[config,persist,logAction,showToast]);

  // Ajuster les pièces seulement (ex: rembourser une récompense)
  const handleAdjustCoins = useCallback((playerIdx, delta) => {
    const player = config.players[playerIdx];
    setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={...n[playerIdx],coins:Math.max(0,(n[playerIdx].coins||0)+delta)}; persist(config,n); return n; });
    logAction(`${delta>0?"+":""}${delta} 🪙 → ${player?.name}`,"#D9BC5C");
    showToast(`${delta>0?"+":""}${delta} 🪙 pour ${player?.name}`,"#D9BC5C");
  },[config,persist,logAction,showToast]);

  // v2.16.7 — Chantier 6.6 : verrou du matin parent-contrôlé (demande de Gen). Champ sur
  // config.players[i], même patron que pin/themeId déjà présents sur l'objet joueur.
  const handleSetMorningLock = useCallback((playerIdx, patch) => {
    const newCfg = {...config, players: config.players.map((p,i)=> i===playerIdx
      ? {...p, morningLock:{enabled:false,start:"06:00",end:"09:00",...p.morningLock,...patch}}
      : p)};
    setConfig(newCfg); persist(newCfg, gameStates);
  },[config,gameStates,persist]);

  // Backlog #13 — budget-temps quotidien par enfant (contrôle parental). Même patron que
  // handleSetMorningLock : champ sur config.players[i], null/0 = pas de limite.
  const handleSetDailyLimit = useCallback((playerIdx, minutes) => {
    const newCfg = {...config, players: config.players.map((p,i)=> i===playerIdx
      ? {...p, dailyMinutesLimit: minutes || null}
      : p)};
    setConfig(newCfg); persist(newCfg, gameStates);
  },[config,gameStates,persist]);

  // v2.16.68 — « ⚡ VALIDER SANS CODE (parent) » n'était pas une validation, mais une validation
  // AU RABAIS : il écrivait `xp`, `coins`, `coinsLifetime`, `completed`, `activeDays`… et rien
  // d'autre. Manquaient, en silence : `completedAt` (aucune heure au journal du jour, et la quête
  // ne comptait pas pour le « a joué aujourd'hui » qui se lit sur `completedAt`), `xpLog` (invisible
  // dans la courbe d'XP du profil et dans les ligues), les badges (`checkBadges` jamais appelé — un
  // palier franchi par ce bouton n'était JAMAIS décerné), l'XP du familier, le jeton d'attaque du
  // boss, l'entrée au fil de famille (la fratrie ne voyait pas la quête passer) et la célébration
  // différée (l'enfant n'avait ni popup, ni jeu de niveau, ni annonce de badge). Or le bouton dit
  // « VALIDER » : il ne se distingue de la validation normale que par l'absence de code à taper —
  // pas par ce qu'il accorde. Il délègue donc maintenant à `approvePending`, le MÊME chemin, au
  // lieu d'en recopier une moitié qui prenait du retard à chaque correctif (c'est la 2e fois :
  // v2.16.64 avait déjà dû venir y greffer `activeDays` à la main). Même famille que v2.16.64/65.
  const handleForceComplete = useCallback((ass, playerId) => {
    const playerIdx=config.players.findIndex(p=>p.id===playerId); if(playerIdx<0)return;
    const isCal=String(ass.instanceId).startsWith("cal_");
    const doneKey=isCal ? ass.instanceId+"_"+playerId : ass.instanceId+"_"+playerId+"#"+todayStamp();
    // Garde-fou : `approvePending` tombstone dans `refusedKeys` une clé dont la tâche est
    // introuvable — c'est voulu pour une demande fantôme envoyée par l'enfant (v2.6.6), PAS pour un
    // clic parent sur une carte affichée à l'écran. On résout d'abord, et on ne délègue qu'ensuite.
    const task=resolvePendingTask(playerIdx,doneKey);
    if(!task){ showToast("⚠️ Cette quête n'existe plus — rien n'a été validé.","#D97070",3500); return; }
    // Le tap parent est célébré tout de suite (l'enfant est là, il regarde) ; la vraie fête, elle,
    // reste différée jusqu'à la sortie du mode parent, comme pour toute validation.
    spawnParticles(task.emoji||"✅");
    approvePending(playerIdx, doneKey, {viaOverride:true});
  },[config,resolvePendingTask,approvePending,showToast]);

  // ── Gestion des tâches depuis le portail parent ──────────
  // Ajoute une tâche pour chaque joueur coché (copies indépendantes, comme le wizard)
  const handleAddAssignment = useCallback((taskId, playerIds, assType, customDays, time)=>{
    if(!taskId||!playerIds?.length)return;
    // assType: "week" → tâche planifiée (jours choisis = récurrence hebდo par jour); sinon → routine (sans jour)
    const days = assType==="week" ? ((Array.isArray(customDays)&&customDays.length)?[...customDays].sort((a,b)=>a-b):[0,1,2,3,4]) : [];
    // v2.16.55 — même garde-fou que l'assistant : un enfant qui a DÉJÀ exactement cette assignation
    // (même tâche, mêmes jours, même heure) n'en reçoit pas une 2e. Chaque copie était une case à
    // cocher de plus dans sa journée, sans aucun moyen de le voir d'ici.
    const existingKeys = new Set();
    for (const a of (config.assignments||[])) for (const pid of (a.playerIds||[])) existingKeys.add(pid+"§"+assignmentKey(a));
    const probe = {taskId,days,time:time||""};
    const fresh = playerIds.filter(pid=>!existingKeys.has(pid+"§"+assignmentKey(probe)));
    const skipped = playerIds.length - fresh.length;
    const task=[...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===taskId);
    if(!fresh.length){ showToast(`✓ ${task?.label||"Cette tâche"} est déjà assignée à ${playerIds.length>1?"ces enfants":"cet enfant"}.`,"#85CDD1",3500); return; }
    const newAss = fresh.map(pid=>({instanceId:uid(),taskId,playerIds:[pid],days,time:time||"",createdAt:Date.now()}));
    const newCfg={...config,assignments:[...(config.assignments||[]),...newAss]};
    setConfig(newCfg); persist(newCfg,gameStates);
    logAction(`➕ Tâche ajoutée: ${task?.label||taskId} (${fresh.length} joueur${fresh.length>1?"s":""}${skipped?`, ${skipped} déjà assigné${skipped>1?"s":""}`:""})`,"#5CAD68");
    showToast(skipped?`➕ Tâche ajoutée! (${skipped} l'avai${skipped>1?"en":""}t déjà)`:"➕ Tâche ajoutée!","#5CAD68");
  },[config,gameStates,persist,logAction,showToast]);

  // v2.6.0 — Quête de réparation 🕊️ (chantier approuvé le 25 juillet) : le PARENT crée une tâche
  // à la volée (cat "reparation", champs figés après création — le merge union-by-id ne fusionne
  // pas champ par champ) + UNE assignation multi-enfants (patron rc_brassee — PAS handleAddAssignment
  // qui splitte en une assignation par enfant). oneDay = aujourd'hui (auto-nettoyée demain, ~5121).
  // Cadrage TOP/AuDHD : texte symétrique, récompenses égales (20 XP / 10 🪙 via approvePending normal).
  const handleCreateRepairQuest = useCallback((preset, playerIds)=>{
    if(!preset?.label || !Array.isArray(playerIds) || playerIds.length<2) return;
    const taskId = "cust_rep_"+uid();
    const task = { id:taskId, emoji:preset.emoji||"🕊️", label:preset.label, xp:20, coins:10, diff:"medium", cat:"reparation", repair:true, steps:Array.isArray(preset.steps)?preset.steps.slice(0,3):[] };
    const todayIdx=(new Date().getDay()+6)%7;
    const ass = { instanceId:uid(), taskId, playerIds:[...playerIds], days:[todayIdx], time:"", oneDay:todayStamp(), repair:true, createdAt:Date.now() };
    const newCfg = {...config, customTasks:[...(config.customTasks||[]), task], assignments:[...(config.assignments||[]), ass]};
    setConfig(newCfg); persist(newCfg, gameStates);
    logAction(`🕊️ Quête de réparation créée: ${task.label} (${playerIds.length} enfants)`,"#7FD6E0");
    showToast("🕊️ Quête de réparation créée — chacun la verra dans sa journée.","#7FD6E0",4000);
  },[config,gameStates,persist,logAction,showToast]);

  // v2.6.2 — le parent choisit une date pour une récompense "moment" : ajoute un vrai événement
  // calendrier (type "recompense" 🎁, visible enfant+parent) et fait avancer le statut vers "planifie".
  const handlePlanMoment = useCallback((momentId, date)=>{
    if(!date) return;
    const cfg=cfgRef.current||config;
    const mr=(cfg.momentRequests||[]).find(m=>m.id===momentId); if(!mr) return;
    const idx=config.players.findIndex(p=>p.id===mr.playerId); if(idx<0) return;
    const calId=Date.now()+"_"+Math.random().toString(36).slice(2,6);
    // v2.16.80 — RE-planifier (le bouton « 📅 Prévu » reste affiché tant que « ✔ Fait » n'est pas
    // cliqué, et le champ date est pré-rempli avec la date déjà prévue) ajoutait un DEUXIÈME
    // événement 🎁 sans retirer le premier : l'enfant voyait le même moment à deux dates. On déplace
    // l'événement au lieu de l'empiler, et on tombstone l'ancien pour que le retrait survive à la
    // synchro (`removedCalendarIds`, même mécanisme que la suppression d'un événement ordinaire).
    const ancienCal=mr.calId ? String(mr.calId).replace(/^cal_/,"") : null;
    setGameStates(gs=>{ const n=[...gs];
      const e={ id:calId, type:"recompense", label:`${mr.emoji} ${mr.label}`, date, recur:null };
      const reste=(n[idx].calendar||[]).filter(c=>!ancienCal || c.id!==ancienCal);
      n[idx]={...n[idx], calendar:[...reste, e],
        removedCalendarIds:ancienCal ? _uniq([...(n[idx].removedCalendarIds||[]), ancienCal]).slice(-400) : (n[idx].removedCalendarIds||[])};
      const newCfg={...cfg, momentRequests:(cfg.momentRequests||[]).map(m=>m.id===momentId?{...m,status:"planifie",plannedDate:date,calId:"cal_"+calId}:m)};
      setConfig(newCfg);
      persist(newCfg,n);
      return n;
    });
    showToast("🗓️ Moment planifié — ajouté au calendrier!","#85CDD1",3500);
  },[config,persist,showToast]);

  // v2.6.2 — le moment a été vécu → statut "fait" (retiré de la liste "à planifier", aucune
  // pression temporelle : reste "à planifier" indéfiniment tant que ce bouton n'est pas cliqué).
  const handleMarkMomentDone = useCallback((momentId)=>{
    const cfg=cfgRef.current||config;
    const newCfg={...cfg, momentRequests:(cfg.momentRequests||[]).map(m=>m.id===momentId?{...m,status:"fait"}:m)};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("✅ Moment vécu ensemble! 💛","#5CAD68",3500);
  },[config,gameStates,persist,showToast]);

  // Lance un boss de famille — le parent choisit la difficulté (PV du boss)
  const handleLaunchBoss = useCallback((difficulty="moyen")=>{
    const nPlayers = Math.max(1,(config.players||[]).length);
    const base = BOSSES[Math.floor(Math.random()*BOSSES.length)];
    const diff = BOSS_DIFF[difficulty] || BOSS_DIFF.moyen;
    const now = new Date().toISOString();
    // PV adaptés au nombre d'enfants (1 jeton par quête ≈ ~5 quêtes/enfant/jour)
    const hpMax = Math.round(diff.hp * (0.6 + 0.4*nPlayers));
    const boss = {...base, hpMax, lastHitTs:now, difficulty, startedAt:now, defeatedAt:null};
    const fe={id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:boss.emoji,text:`⚔️ Un ${boss.name} (${diff.label}, ${hpMax} PV) apparaît! Faites des quêtes pour l'attaquer dans l'onglet BOSS!`};
    const newCfg={...config, boss, feed:[fe,...(config.feed||[])].slice(0,60)};
    setConfig(newCfg); persist(newCfg, gameStates);
    showToast(`${boss.emoji} ${boss.name} apparaît! Battez-le en famille!`,"#D98C8C",4500);
  },[config,gameStates,persist,showToast]);

  // Attaque du boss : dépense des jetons (gagnés en faisant des quêtes) → enlève des PV
  const handleBossAttack = useCallback((playerIdx, type)=>{
    const atk = ATTACKS[type]; const boss = cfgRef.current?.boss;
    if(!atk || !boss || boss.defeatedAt) return;
    const bid = boss.startedAt;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
      const bb=(p.bossBattle&&p.bossBattle.bossId===bid)?p.bossBattle:{bossId:bid,earned:0,spent:0,dmg:0};
      if((bb.earned-bb.spent) < atk.cost) return gs; // pas assez de jetons
      const mod = bossModifierOfDay(bid); const dmg = bossAtkDamage(type, mod); // v1.58.0 — modificateur du jour
      const newBB={...bb, spent:bb.spent+atk.cost, dmg:bb.dmg+dmg};
      n[playerIdx]={...p, bossBattle:newBB};
      let totalDmg = n.reduce((s,g)=> s + ((g.bossBattle&&g.bossBattle.bossId===bid)?(g.bossBattle.dmg||0):0), 0) + repairDamageFor(cfgRef.current?.repairEvents, bid); // v2.6.0 — inclut les réparations 🕊️ dans le cap et le seuil de victoire
      let nb = {...boss, lastHitTs:new Date().toISOString()};
      const HPMAX=(boss.hpMax||80), questsDone=bossQuestsAllDone(cfgRef.current, n);
      if(!questsDone && totalDmg > HPMAX-1){ const over=totalDmg-(HPMAX-1); newBB.dmg=Math.max(bb.dmg||0, newBB.dmg-over); n[playerIdx]={...p, bossBattle:newBB}; totalDmg=HPMAX-1; }
      const locked = !questsDone && totalDmg >= HPMAX-1;
      const defeated = questsDone && totalDmg >= HPMAX;
      const alreadyClaimed = n.some(g=>g.bossClaimed===bid); // v2.5.25 — idempotence : le filet de sécurité ou le familier a peut-être déjà accordé la victoire
      if(defeated && !alreadyClaimed){ nb.defeatedAt=new Date().toISOString(); for(let i=0;i<n.length;i++){ const _it=pickUltraLegendary(); n[i]={...n[i], coins:(n[i].coins||0)+40, coinsLifetime:(n[i].coinsLifetime||0)+40, xp:(n[i].xp||0)+50, xpLog:appendXpLog(n[i].xpLog,50,"boss"), owned:[...new Set([...(n[i].owned||[]), _it.id])], badges:[...new Set([...(n[i].badges||[]),"b_boss"])], bossClaimed:bid, pendingCelebrations:[...(n[i].pendingCelebrations||[]), {id:"c_"+uid(), bossWin:{name:boss.name,emoji:boss.emoji,color:boss.color}, itemId:_it.id, itemName:_it.name, itemEmoji:_it.emoji}]}; } } // v1.74.0 — +40🪙 +50XP + badge + item ULTRA LÉGENDAIRE + notif différée à chaque enfant
      else if(defeated && alreadyClaimed){ nb.defeatedAt = nb.defeatedAt || new Date().toISOString(); }
      const fe = (defeated && !alreadyClaimed) ? {id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:"🏆",text:`🎉 La famille a VAINCU le ${boss.name}! +40 🪙 et +50 XP pour tout le monde! 🏆`} : null;
      const ncfg={...cfgRef.current, boss:nb, feed: fe?[fe,...(cfgRef.current.feed||[])].slice(0,60):cfgRef.current.feed};
      setConfig(ncfg); persist(ncfg, n);
      if(defeated && !alreadyClaimed){ setTimeout(()=>{ try{ if(!CALM){ spawnParticles("🎉"); spawnParticles("🏆"); } SFX.epic&&SFX.epic(); }catch{} showToast(`🏆 Boss vaincu! Récompense ultra légendaire pour tout le monde!`,"#D9BC5C",5000); },150); }
      else if(!defeated){ setTimeout(()=>{ try{ if(!CALM) spawnParticles(locked?(boss.emoji||"🐉"):atk.emoji); SFX.task&&SFX.task(); }catch{} showToast(locked?`${boss.emoji||"🐉"} ${boss.name||"Le boss"} RÉSISTE! Finissez TOUTES vos corvées pour l'achever! ⚡`:(dmg>0?`${atk.emoji} −${dmg} PV au boss!`:`🛡️ La carapace bloque — vise plus gros!`),"#D98C8C",locked?3600:2200); },60); }
      return n;
    });
  },[persist,showToast]);

  // v1.58.0 — attaque du FAMILIER : il frappe le boss s'il est en forme (nourri) et assez évolué (niv ≥4). Légendaire = bonus de dégâts.
  const handleBossPetAttack = useCallback((playerIdx)=>{
    const boss = cfgRef.current?.boss; if(!boss || boss.defeatedAt) return;
    const p0 = gameStates[playerIdx]; const petId = p0?.equipped?.pet;
    if(!petId){ showToast("Équipe un familier pour qu'il attaque! 🐾","#D99248",2800); return; }
    if(p0.lastFedDay!==todayStamp()){ showToast("Ton familier a faim — nourris-le pour qu'il se batte! 🍖","#D99248",3000); return; }
    const petLv = petLevel((p0.petXp||{})[petId]||0);
    if(petLv<4){ showToast("Ton familier est trop jeune pour se battre (niv. 4) 🐣","#D99248",3000); return; }
    const bid = boss.startedAt;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
      const bb=(p.bossBattle&&p.bossBattle.bossId===bid)?p.bossBattle:{bossId:bid,earned:0,spent:0,dmg:0};
      if((bb.earned-bb.spent) < PET_ATTACK_COST){ setTimeout(()=>showToast(`Il faut ${PET_ATTACK_COST} jetons (fais des quêtes) pour lancer ton familier!`,"#D99248",3000),0); return gs; }
      const mod = bossModifierOfDay(bid); const legend = petIsLegendary((p.petEvo||{})[petId], petLv);
      const dmg = petAttackDamage(petLv, legend, mod);
      const newBB={...bb, spent:bb.spent+PET_ATTACK_COST, dmg:bb.dmg+dmg};
      n[playerIdx]={...p, bossBattle:newBB};
      let totalDmg = n.reduce((s,g)=> s + ((g.bossBattle&&g.bossBattle.bossId===bid)?(g.bossBattle.dmg||0):0), 0) + repairDamageFor(cfgRef.current?.repairEvents, bid); // v2.6.0 — inclut les réparations 🕊️ dans le cap et le seuil de victoire
      let nb = {...boss, lastHitTs:new Date().toISOString()};
      const HPMAX=(boss.hpMax||80), questsDone=bossQuestsAllDone(cfgRef.current, n);
      if(!questsDone && totalDmg > HPMAX-1){ const over=totalDmg-(HPMAX-1); newBB.dmg=Math.max(bb.dmg||0, newBB.dmg-over); n[playerIdx]={...p, bossBattle:newBB}; totalDmg=HPMAX-1; }
      const locked = !questsDone && totalDmg >= HPMAX-1;
      const defeated = questsDone && totalDmg >= HPMAX;
      const alreadyClaimed = n.some(g=>g.bossClaimed===bid); // v2.5.25 — idempotence : le filet de sécurité ou une attaque de joueur a peut-être déjà accordé la victoire
      if(defeated && !alreadyClaimed){ nb.defeatedAt=new Date().toISOString(); for(let i=0;i<n.length;i++){ const _it=pickUltraLegendary(); n[i]={...n[i], coins:(n[i].coins||0)+40, coinsLifetime:(n[i].coinsLifetime||0)+40, xp:(n[i].xp||0)+50, xpLog:appendXpLog(n[i].xpLog,50,"boss"), owned:[...new Set([...(n[i].owned||[]), _it.id])], badges:[...new Set([...(n[i].badges||[]),"b_boss"])], bossClaimed:bid, pendingCelebrations:[...(n[i].pendingCelebrations||[]), {id:"c_"+uid(), bossWin:{name:boss.name,emoji:boss.emoji,color:boss.color}, itemId:_it.id, itemName:_it.name, itemEmoji:_it.emoji}]}; } } // v1.74.0 — +40🪙 +50XP + badge + item ULTRA LÉGENDAIRE + notif différée à chaque enfant
      else if(defeated && alreadyClaimed){ nb.defeatedAt = nb.defeatedAt || new Date().toISOString(); }
      const fe = (defeated && !alreadyClaimed) ? {id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:"🏆",text:`🎉 La famille a VAINCU le ${boss.name}! +40 🪙 et +50 XP pour tout le monde! 🏆`} : null;
      const ncfg={...cfgRef.current, boss:nb, feed: fe?[fe,...(cfgRef.current.feed||[])].slice(0,60):cfgRef.current.feed};
      setConfig(ncfg); persist(ncfg, n);
      if(defeated && !alreadyClaimed){ setTimeout(()=>{ try{ if(!CALM){ spawnParticles("🎉"); spawnParticles("🏆"); } SFX.epic&&SFX.epic(); }catch{} showToast(`🏆 Boss vaincu! Récompense ultra légendaire pour tout le monde!`,"#D9BC5C",5000); },150); }
      else if(!defeated){ setTimeout(()=>{ try{ if(!CALM) spawnParticles(locked?(boss.emoji||"🐉"):"🐾"); SFX.epic&&SFX.epic(); }catch{} showToast(locked?`${boss.emoji||"🐉"} ${boss.name||"Le boss"} RÉSISTE! Finissez TOUTES vos corvées pour l'achever! ⚡`:`🐾 Ton familier frappe! −${dmg} PV${legend?" — Légendaire! 👑":""}`,"#D9BC5C",locked?3600:2800); },60); }
      return n;
    });
  },[gameStates,persist,showToast]);

  // v2.16.20 — Coup de grâce : dès que le boss a perdu 70%+ de ses PV (hpPct<=30, même seuil que
  // le mode "enraged" déjà existant), les 4 enfants peuvent l'achever d'un coup, SANS jeton — c'est
  // la finition collective, pas une attaque de plus (demande de Gen : « les 4 enfants doivent y
  // avoir accès »). Même patron que handleBossAttack/handleBossPetAttack (verrou bossQuestsAllDone
  // conservé tel quel — si les corvées du jour ne sont pas finies, le message "RÉSISTE" habituel
  // s'affiche, le coup de grâce ne contourne pas ce verrou).
  const handleBossFinish = useCallback((playerIdx)=>{
    const boss = cfgRef.current?.boss; if(!boss || boss.defeatedAt) return;
    const bid = boss.startedAt;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
      const bb=(p.bossBattle&&p.bossBattle.bossId===bid)?p.bossBattle:{bossId:bid,earned:0,spent:0,dmg:0};
      const totalDmgBefore = n.reduce((s,g)=> s + ((g.bossBattle&&g.bossBattle.bossId===bid)?(g.bossBattle.dmg||0):0), 0) + repairDamageFor(cfgRef.current?.repairEvents, bid);
      const HPMAX=(boss.hpMax||80);
      const hpPctBefore = Math.round(Math.max(0,HPMAX-totalDmgBefore)/HPMAX*100);
      if(hpPctBefore>30) return gs; // pas encore à 70%+ de dégâts — le bouton ne devrait même pas être cliquable
      const dmg = Math.max(0, HPMAX-totalDmgBefore); // juste assez pour finir, jamais plus
      const newBB={...bb, dmg:bb.dmg+dmg};
      n[playerIdx]={...p, bossBattle:newBB};
      let totalDmg = totalDmgBefore + dmg;
      let nb = {...boss, lastHitTs:new Date().toISOString()};
      const questsDone=bossQuestsAllDone(cfgRef.current, n);
      if(!questsDone && totalDmg > HPMAX-1){ const over=totalDmg-(HPMAX-1); newBB.dmg=Math.max(bb.dmg||0, newBB.dmg-over); n[playerIdx]={...p, bossBattle:newBB}; totalDmg=HPMAX-1; }
      const locked = !questsDone && totalDmg >= HPMAX-1;
      const defeated = questsDone && totalDmg >= HPMAX;
      const alreadyClaimed = n.some(g=>g.bossClaimed===bid);
      if(defeated && !alreadyClaimed){ nb.defeatedAt=new Date().toISOString(); for(let i=0;i<n.length;i++){ const _it=pickUltraLegendary(); n[i]={...n[i], coins:(n[i].coins||0)+40, coinsLifetime:(n[i].coinsLifetime||0)+40, xp:(n[i].xp||0)+50, xpLog:appendXpLog(n[i].xpLog,50,"boss"), owned:[...new Set([...(n[i].owned||[]), _it.id])], badges:[...new Set([...(n[i].badges||[]),"b_boss"])], bossClaimed:bid, pendingCelebrations:[...(n[i].pendingCelebrations||[]), {id:"c_"+uid(), bossWin:{name:boss.name,emoji:boss.emoji,color:boss.color}, itemId:_it.id, itemName:_it.name, itemEmoji:_it.emoji}]}; } }
      else if(defeated && alreadyClaimed){ nb.defeatedAt = nb.defeatedAt || new Date().toISOString(); }
      const fe = (defeated && !alreadyClaimed) ? {id:"f_"+uid(),ts:Date.now(),likes:[],type:"boss",playerId:"parent",emoji:"🏆",text:`🎉 La famille a VAINCU le ${boss.name}! +40 🪙 et +50 XP pour tout le monde! 🏆`} : null;
      const ncfg={...cfgRef.current, boss:nb, feed: fe?[fe,...(cfgRef.current.feed||[])].slice(0,60):cfgRef.current.feed};
      setConfig(ncfg); persist(ncfg, n);
      if(defeated && !alreadyClaimed){ setTimeout(()=>{ try{ if(!CALM){ spawnParticles("🎉"); spawnParticles("🏆"); } SFX.epic&&SFX.epic(); }catch{} showToast(`🏆 Boss vaincu! Récompense ultra légendaire pour tout le monde!`,"#D9BC5C",5000); },150); }
      else if(locked){ setTimeout(()=>{ try{ if(!CALM) spawnParticles(boss.emoji||"🐉"); }catch{} showToast(`${boss.emoji||"🐉"} ${boss.name||"Le boss"} RÉSISTE! Finissez TOUTES vos corvées pour l'achever! ⚡`,"#D98C8C",3600); },60); }
      return n;
    });
  },[persist,showToast]);

  // Le parent crée/assigne une routine à un enfant (atterrit dans gs[idx].routines)
  const handleAssignRoutine = useCallback((playerIdx, routine)=>{
    if(playerIdx==null||!routine?.name?.trim()||!(routine.taskIds||[]).length)return;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]||{}; const r={id:"rt_"+uid(), emoji:"🌅", endTime:"", ...routine, name:routine.name.trim()}; n[playerIdx]={...p, routines:[...(p.routines||[]), r]}; persist(config,n); return n; });
    logAction(`🧩 Routine « ${routine.name.trim()} » assignée à ${config.players[playerIdx]?.name||""}`,"#5CAD68");
    showToast("✅ Routine assignée à l'enfant!","#5CAD68");
  },[config,persist,logAction,showToast]);

  const handleRemoveAssignment = useCallback((instanceId)=>{
    // v2.16.78 — cherchée dans les DEUX listes, comme `handleApproveRemoval` : sans ça le journal
    // du parent retomberait sur l'instanceId brut pour une rotative.
    const ass=[...(config.assignments||[]),...(config.weeklyQuests?.assignments||[])].find(a=>a.instanceId===instanceId);
    const task=ass?[...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===ass.taskId):null;
    // Tombstone : la fusion ré-ajouterait l'assignation sinon → on mémorise les supprimées
    // v2.16.78 — pendant une semaine de garde, une assignation peut vivre dans `weeklyQuests.assignments`
    // et PAS dans `config.assignments` : ne filtrer que la seconde laissait la tâche à l'écran malgré le
    // toast « Tâche retirée ». La fusion applique désormais le tombstone dans les deux listes (merge.js) ;
    // on retire ici aussi pour que l'écran suive tout de suite, sans attendre un aller-retour de synchro.
    const newCfg={...config,
      assignments:(config.assignments||[]).filter(a=>a.instanceId!==instanceId),
      weeklyQuests:config.weeklyQuests?{...config.weeklyQuests,assignments:(config.weeklyQuests.assignments||[]).filter(a=>a.instanceId!==instanceId)}:config.weeklyQuests,
      removedAssignments:_uniq([...(config.removedAssignments||[]), instanceId]).slice(-800)};
    setConfig(newCfg); persist(newCfg,gameStates);
    logAction(`🗑️ Tâche retirée: ${task?.label||instanceId}`,"#D99248");
    showToast("🗑️ Tâche retirée","#D99248");
  },[config,gameStates,persist,logAction,showToast]);

  // v1.83.0 (Lot 1 #B6) — l'enfant DEMANDE à retirer une tâche (pas de suppression directe :
  // le parent approuve, même esprit que la validation des tâches complétées).
  const handleRequestRemoval = useCallback((playerIdx, instanceId)=>{
    const pid=config.players[playerIdx]?.id; if(!pid) return;
    if((config.removalRequests||[]).some(r=>r.instanceId===instanceId && r.playerId===pid)) return; // déjà demandé
    const req={id:"rmreq_"+uid(), instanceId, playerId:pid, requestedAt:Date.now()};
    const newCfg={...config, removalRequests:[...(config.removalRequests||[]), req]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("🗑️ Demande envoyée au parent","#D9BC5C");
  },[config,gameStates,persist,showToast]);

  // v2.16.35 — Backlog #17 incrément 1 : invitation "en équipe" (enfant→enfant). L'enfant initiateur
  // choisit une de SES tâches solo (playerIds.length===1) et un frère/soeur — l'invitation reste en
  // attente jusqu'à ce que l'invité accepte ou refuse (voir handleRespondTeamInvite).
  const handleCreateTeamInvite = useCallback((playerIdx, instanceId, toPlayerId)=>{
    const fromPlayerId=config.players[playerIdx]?.id; if(!fromPlayerId||!toPlayerId||fromPlayerId===toPlayerId) return;
    const ass=(config.assignments||[]).find(a=>a.instanceId===instanceId); if(!ass||ass.playerIds?.length!==1) return;
    if((config.teamInvites||[]).some(inv=>inv.instanceId===instanceId&&inv.status==="pending")) return; // déjà une invitation en cours pour cette tâche
    const invite={id:"tinv_"+uid(), taskId:ass.taskId, instanceId, fromPlayerId, toPlayerId, status:"pending", createdAt:Date.now()};
    const newCfg={...config, teamInvites:[...(config.teamInvites||[]), invite]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("🤝 Invitation envoyée!","#85CDD1");
  },[config,gameStates,persist,showToast]);

  // Réponse de l'invité : accepté → la tâche devient une assignation partagée (playerIds à 2, teamSplit:true,
  // XP/pièces divisés à la validation — voir approvePending) ; refusé → rien ne change pour l'initiateur,
  // qui verra une petite note douce sur sa carte de tâche.
  const handleRespondTeamInvite = useCallback((playerIdx, inviteId, accept)=>{
    const invite=(config.teamInvites||[]).find(i=>i.id===inviteId&&i.status==="pending"); if(!invite) return;
    const toPlayerId=config.players[playerIdx]?.id; if(!toPlayerId||invite.toPlayerId!==toPlayerId) return;
    let assignments=config.assignments||[];
    if(accept){
      assignments=assignments.map(a=>a.instanceId===invite.instanceId&&!(a.playerIds||[]).includes(toPlayerId)
        ? {...a, playerIds:[...a.playerIds, toPlayerId], teamSplit:true}
        : a);
    }
    const teamInvites=(config.teamInvites||[]).map(i=>i.id===inviteId?{...i,status:accept?"accepted":"declined"}:i);
    const newCfg={...config, assignments, teamInvites};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast(accept?"🤝 Équipe formée! Vous partagez XP et pièces sur cette tâche.":"D'accord, pas de souci 😊", accept?"#5CAD68":"#888");
  },[config,gameStates,persist,showToast]);

  const handleApproveRemoval = useCallback((reqId)=>{
    const req=(config.removalRequests||[]).find(r=>r.id===reqId); if(!req) return;
    // v2.16.78 — c'est LE chemin par lequel une rotative pouvait être « retirée » sans jamais partir :
    // l'enfant voit ses quêtes de la semaine de garde mêlées aux siennes (App.jsx ~4253) et le bouton
    // « 🗑️ Je ne veux plus de cette tâche » s'affiche sur toutes les cartes, mais l'approbation ne
    // filtrait que `config.assignments`. La demande était consommée, le tombstone écrit, le toast
    // affiché — et la tâche revenait le lendemain, sans trace de l'échec. On cherche donc la tâche
    // dans les DEUX listes (sinon le libellé du journal retombait sur l'instanceId brut) et on retire
    // dans les deux. Le tombstone reste le vrai garde-fou : voir `weeklyQuests` dans merge.js.
    const _allAss=[...(config.assignments||[]),...(config.weeklyQuests?.assignments||[])];
    const ass=_allAss.find(a=>a.instanceId===req.instanceId);
    const task=ass?[...TASK_CATALOG,...(config.customTasks||[])].find(t=>t.id===ass.taskId):null;
    const newCfg={...config,
      assignments:(config.assignments||[]).filter(a=>a.instanceId!==req.instanceId),
      weeklyQuests:config.weeklyQuests?{...config.weeklyQuests,assignments:(config.weeklyQuests.assignments||[]).filter(a=>a.instanceId!==req.instanceId)}:config.weeklyQuests,
      removedAssignments:_uniq([...(config.removedAssignments||[]), req.instanceId]).slice(-800),
      removalRequests:(config.removalRequests||[]).filter(r=>r.id!==reqId),
      // v2.16.80 — la demande elle-même a son propre tombstone (l'assignation supprimée suffisait ici,
      // mais pas dans la branche « refus » juste dessous : on écrit la même chose des deux côtés).
      removedRemovalRequests:_uniq([...(config.removedRemovalRequests||[]), reqId]).slice(-400)};
    setConfig(newCfg); persist(newCfg,gameStates);
    logAction(`🗑️ Retrait approuvé: ${task?.label||req.instanceId}`,"#D99248");
    showToast("🗑️ Tâche retirée","#D99248");
  },[config,gameStates,persist,logAction,showToast]);

  // v2.16.80 — le refus ne touche PAS à l'assignation (c'est tout son intérêt), donc il ne posait
  // aucun tombstone : la demande refusée revenait dans le portail parent à chaque synchro, pour
  // toujours. Le toast était le seul effet durable du bouton.
  const handleRefuseRemoval = useCallback((reqId)=>{
    const newCfg={...config,
      removalRequests:(config.removalRequests||[]).filter(r=>r.id!==reqId),
      removedRemovalRequests:_uniq([...(config.removedRemovalRequests||[]), reqId]).slice(-400)};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("Demande de retrait refusée","#FF6464");
  },[config,gameStates,persist,showToast]);

  // Ménage : supprimer TOUTES les tâches qu'un enfant s'est créées (child:true)
  const handleClearChildTasks = useCallback((playerIdx)=>{
    const pid=config.players[playerIdx]?.id; if(!pid) return;
    const childTaskIds=new Set((config.customTasks||[]).filter(t=>t.child).map(t=>t.id));
    const toRemove=(config.assignments||[]).filter(a=>a.playerIds?.includes(pid) && childTaskIds.has(a.taskId)).map(a=>a.instanceId);
    if(!toRemove.length){ showToast("Aucune tâche perso à supprimer 👍","#888"); return; }
    const removedSet=new Set(toRemove);
    const newCfg={...config,
      assignments:(config.assignments||[]).filter(a=>!removedSet.has(a.instanceId)),
      removedAssignments:_uniq([...(config.removedAssignments||[]), ...toRemove]).slice(-800)};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast(`🗑️ ${toRemove.length} tâche(s) perso supprimée(s)`,"#D99248");
  },[config,gameStates,persist,showToast]);

  const handleAddCustomTask = useCallback((data)=>{
    if(!data?.label?.trim())return null;
    const label=data.label.trim();
    // v1.82.0 (Lot 1 #3/B7) — anti-doublon côté parent, même règle que côté enfant (v1.53.0,
    // handleChildAddTask) : un libellé déjà présent réutilise la tâche existante au lieu d'en
    // empiler une nouvelle — évite que le catalogue/menu de choix grossisse à l'infini.
    const existing=(config.customTasks||[]).find(t=>normLabel(t.label)===normLabel(label));
    if(existing){ showToast(`${existing.emoji} «${existing.label}» existe déjà — réutilisée!`,"#D9BC5C",4000); return existing.id; }
    const newTask={id:"cust_"+uid(),emoji:data.emoji||"⭐",label,xp:20,coins:10,diff:"medium",cat:"custom"};
    const newCfg={...config,customTasks:[...(config.customTasks||[]),newTask]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast(`${newTask.emoji} «${newTask.label}» créée — assigne-la maintenant!`,"#5CAD68",4000);
    return newTask.id;
  },[config,gameStates,persist,showToast]);

  // Enfant : ajoute une quête à SA journée (type routine, aujourd'hui). Le parent valide à la fin.
  const handleChildAddTask = useCallback((playerIdx, data)=>{
    const pid=config.players[playerIdx]?.id; if(!pid||!data?.label?.trim())return;
    const label=data.label.trim();
    // v2.5.10 (Correctif 2C) — l'enfant choisit la portée de sa tâche : A) once (comportement d'origine,
    // 1 jour, nettoyée le lendemain), B) reusable (privée mais permanente, ownerId posé), C) propose
    // (rien n'est créé tout de suite — va dans config.childTaskProposals, en attente d'approbation parent).
    const scope=data.scope||"once";
    if(scope==="propose"){
      // anti-doublon élargi : si une tâche de ce nom existe déjà (catalogue ou perso) ou est déjà proposée,
      // pas la peine de proposer un doublon — on informe l'enfant plutôt que de créer une 2e demande.
      const already=[...TASK_CATALOG,...(config.customTasks||[])].some(t=>normLabel(t.label)===normLabel(label))
        || (config.childTaskProposals||[]).some(p=>normLabel(p.label)===normLabel(label));
      if(already){ showToast(`«${label}» existe déjà — pas besoin de la proposer!`,"#D9BC5C",3500); return; }
      const prop={id:"prop_"+uid(), playerId:pid, label, emoji:data.emoji||"⭐", diff:data.diff||"medium", requestedAt:Date.now()};
      const newCfg={...config, childTaskProposals:[...(config.childTaskProposals||[]),prop]};
      setConfig(newCfg); persist(newCfg,gameStates);
      showToast("🧑‍🤝‍🧑 Proposée à la famille — en attente d'un parent!","#D9BC5C",4000);
      return;
    }
    // v1.53.0 anti-doublon : si une tâche au MÊME libellé existe déjà, on la réutilise au lieu d'en recréer une
    const existing=(config.customTasks||[]).find(t=>normLabel(t.label)===normLabel(label));
    const _dp=CHILD_DIFF_PRESETS[data.diff]||CHILD_DIFF_PRESETS.medium; // plafond anti-farm
    const taskId=existing?existing.id:("cust_"+uid());
    const newTask={id:taskId,emoji:data.emoji||"⭐",label,xp:_dp.xp,coins:_dp.coins,diff:data.diff||"medium",cat:"custom",child:true,
      ...(scope==="reusable"&&!existing?{ownerId:pid}:{})}; // v2.5.10 — portée B : privée mais réutilisable, jamais nettoyée
    // La quête doit apparaître dans la vue ACTUELLE de l'enfant : si mode Semaine → aujourd'hui; si Routine → tâche de routine
    const pmode=gameStates[playerIdx]?.mode||config.mode||"routine";
    const todayIdx=(new Date().getDay()+6)%7;
    const days=pmode==="week" ? [todayIdx] : [];
    const ass={instanceId:uid(),taskId,playerIds:[pid],days,time:data.timeOfDay||"",createdAt:Date.now(),childAdded:true,
      ...(scope==="reusable"?{}:{oneDay:todayStamp()})}; // v2.5.10 — portée A seulement : à usage unique (nettoyée après aujourd'hui)
    // v2.16.61 — `childAdded` : marque une quête ajoutée par l'ENFANT lui-même, pour qu'elle reste
    // visible même quand un rituel ⏰ est sélectionné (voir `childAddedMine` dans PlayerDashboard).
    const customTasks=existing?(config.customTasks||[]):[...(config.customTasks||[]),newTask];
    const newCfg={...config, customTasks, assignments:[...(config.assignments||[]),ass]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast(scope==="reusable"?"🔁 Quête perso ajoutée — elle reste pour toi!":"➕ Quête ajoutée à ta journée!","#5CAD68");
  },[config,gameStates,persist,showToast]);

  // v2.5.10 (Correctif 2C) — le parent approuve une tâche proposée : elle rejoint le catalogue familial
  // partagé (même forme que handleAddCustomTask), disponible pour tous via TaskChooser. Aucune
  // auto-assignation — le parent (ou l'enfant) l'assigne ensuite normalement, même flux que d'habitude.
  const handleApproveProposal = useCallback((propId)=>{
    const prop=(config.childTaskProposals||[]).find(p=>p.id===propId); if(!prop) return;
    const pl=config.players.find(p=>p.id===prop.playerId);
    const already=(config.customTasks||[]).find(t=>normLabel(t.label)===normLabel(prop.label));
    const newTask=already||{id:"cust_"+uid(),emoji:prop.emoji||"⭐",label:prop.label,xp:20,coins:10,diff:prop.diff||"medium",cat:"custom"};
    const newCfg={...config,
      customTasks:already?(config.customTasks||[]):[...(config.customTasks||[]),newTask],
      childTaskProposals:(config.childTaskProposals||[]).filter(p=>p.id!==propId),
      removedProposals:_uniq([...(config.removedProposals||[]),propId]).slice(-800)};
    setConfig(newCfg); persist(newCfg,gameStates);
    logAction(`✅ Tâche approuvée: ${newTask.label} (proposée par ${pl?displayName(pl):"?"})`,"#5CAD68");
    showToast(`✅ «${newTask.label}» ajoutée aux tâches de la famille!`,"#5CAD68");
  },[config,gameStates,persist,logAction,showToast]);

  const handleRefuseProposal = useCallback((propId)=>{
    const prop=(config.childTaskProposals||[]).find(p=>p.id===propId); if(!prop) return;
    const playerIdx=config.players.findIndex(p=>p.id===prop.playerId);
    const newCfg={...config,
      childTaskProposals:(config.childTaskProposals||[]).filter(p=>p.id!==propId),
      removedProposals:_uniq([...(config.removedProposals||[]),propId]).slice(-800)};
    setConfig(newCfg);
    if(playerIdx>=0){
      // même patron que refusPending (v1.64.0) : message drôle affiché à l'enfant, archivable, réutilise
      // exactement le même mécanisme d'affichage (PlayerDashboard, aucune nouvelle UI nécessaire)
      const key="propref_"+propId;
      const refusal={ key, label:prop.label, emoji:prop.emoji||"✗", msg:refusMsg(key), ts:Date.now() };
      setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx];
        n[playerIdx]={...p, refusals:[...(p.refusals||[]).filter(r=>r.key!==key), refusal].slice(-10)};
        persist(newCfg,n); return n; });
    } else persist(newCfg,gameStates);
    logAction(`✗ Tâche proposée refusée: ${prop.label}`,"#D99248");
    showToast("Proposition refusée","#FF6464");
  },[config,gameStates,persist,logAction,showToast]);

  // v1.57.0 — l'enfant choisit la voie d'évolution de son familier (tier 1/2/3 → élément)
  const handleChoosePetEvo = useCallback((playerIdx, petId, tier, element)=>{
    if(playerIdx==null||!petId||!tier||!element)return;
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]||{}; const pe={...(p.petEvo||{})}; pe[petId]={...(pe[petId]||{}), [tier]:element}; n[playerIdx]={...p, petEvo:pe}; persist(config,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("✨"); SFX.epic&&SFX.epic(); }catch{} },120);
    showToast("✨ Ton familier a évolué!","#D9BC5C",3500);
  },[config,persist,showToast]);

  // v1.53.0 — l'enfant CHOISIT une tâche existante (grille) : on réutilise le taskId → aucun doublon créé
  const handleChildPickTask = useCallback((playerIdx, taskId)=>{
    const pid=config.players[playerIdx]?.id; if(!pid||!taskId)return;
    const pmode=gameStates[playerIdx]?.mode||config.mode||"routine";
    const todayIdx=(new Date().getDay()+6)%7;
    const days=pmode==="week" ? [todayIdx] : [];
    // v2.16.61 — `childAdded:true` (même raison que handleChildAddTask) : sans ça, une quête choisie
    // dans la grille « ➕ Choisis une quête » disparaissait à l'écran d'un enfant en mode Rituel ⏰.
    const ass={instanceId:uid(),taskId,playerIds:[pid],days,time:"",oneDay:todayStamp(),createdAt:Date.now(),childAdded:true};
    const newCfg={...config, assignments:[...(config.assignments||[]),ass]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("➕ Quête ajoutée à ta journée!","#5CAD68");
  },[config,gameStates,persist,showToast]);

  // L'enfant crée sa propre tâche de RITUEL (days:[] = type rituel) et on retourne l'instanceId
  // pour l'ajouter immédiatement au rituel qu'il est en train de bâtir.
  const handleChildAddRoutineTask = useCallback((playerIdx, data)=>{
    const pid=config.players[playerIdx]?.id; if(!pid||!data?.label?.trim())return null;
    const label=data.label.trim();
    // v2.16.44 — c'était le DERNIER chemin de création sans anti-doublon : chaque tâche créée depuis
    // le constructeur de rituel empilait une nouvelle entrée `cust_`, même quand la même existait déjà
    // (le catalogue perso familial est monté à 82 entrées dont 26 copies). Même règle que
    // `handleChildAddTask` (v1.53.0) et `handleAddCustomTask` (v1.82.0) : libellé déjà connu → on
    // réutilise son `taskId`. L'assignation, elle, est toujours neuve (c'est l'entrée de SON rituel).
    const existing=(config.customTasks||[]).find(t=>normLabel(t.label)===normLabel(label));
    const taskId=existing?existing.id:("cust_"+uid());
    const _dp=CHILD_DIFF_PRESETS[data.diff]||CHILD_DIFF_PRESETS.medium; // plafond anti-farm
    const newTask={id:taskId,emoji:data.emoji||"⭐",label,xp:_dp.xp,coins:_dp.coins,diff:data.diff||"medium",cat:"custom",child:true};
    const instanceId=uid();
    const ass={instanceId,taskId,playerIds:[pid],days:[],time:""}; // days:[] → tâche de rituel (persiste dans SON rituel)
    const newCfg={...config, customTasks:existing?(config.customTasks||[]):[...(config.customTasks||[]),newTask], assignments:[...(config.assignments||[]),ass]};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("➕ Tâche ajoutée à ton rituel!","#5CAD68");
    return instanceId;
  },[config,gameStates,persist,showToast]);

  // Lot 7C — cocher le défi personnel du jour
  const handleChallengeCheckin = useCallback((playerId, date, val)=>{
    const cwk = custodyWeekKey();
    const prev = config.weeklyChallenge || { weekKey: cwk, challenges: [] };
    const idx = prev.challenges.findIndex(c=>c.playerId===playerId);
    let challenges;
    if(idx>=0){
      challenges = prev.challenges.map((c,i)=> i===idx ? {...c, checkins:{...(c.checkins||{}), [date]:val}} : c);
    } else {
      const player = config.players.find(p=>p.id===playerId);
      challenges = [...prev.challenges, { playerId, text:"", emoji:"⭐", checkins:{ [date]:val }, playerName:player?.pseudo||"" }];
    }
    const n={...config, weeklyChallenge:{...prev, weekKey:cwk, challenges}};
    setConfig(n); persist(n,gameStates);
  },[config,gameStates,persist]);

  // Lot 7C — parent met à jour le texte du défi
  const handleUpdateChallenge = useCallback((playerId, text, emoji)=>{
    const cwk = custodyWeekKey();
    const prev = config.weeklyChallenge || { weekKey: cwk, challenges: [] };
    const idx = prev.challenges.findIndex(c=>c.playerId===playerId);
    let challenges;
    if(idx>=0){
      challenges = prev.challenges.map((c,i)=> i===idx ? {...c, text, emoji} : c);
    } else {
      const player = config.players.find(p=>p.id===playerId);
      challenges = [...prev.challenges, { playerId, text, emoji, checkins:{}, playerName:player?.pseudo||"" }];
    }
    const n={...config, weeklyChallenge:{...prev, weekKey:cwk, challenges}};
    setConfig(n); persist(n,gameStates);
  },[config,gameStates,persist]);

  // Échange de pièces entre enfants (l'un DONNE à l'autre)
  const handleGiveCoins = useCallback((fromId, toId, amount)=>{
    const amt=Math.max(0, Math.round(amount||0));
    const fi=config.players.findIndex(p=>p.id===fromId);
    const ti=config.players.findIndex(p=>p.id===toId);
    if(fi<0||ti<0||fi===ti||amt<=0) return false;
    let ok=false;
    setGameStates(gs=>{ const n=[...gs];
      if((n[fi]?.coins||0) < amt) return gs; // pas assez de pièces
      n[fi]={...n[fi], coins:(n[fi].coins||0)-amt};
      n[ti]={...n[ti], coins:(n[ti].coins||0)+amt};
      ok=true; persist(config,n); return n; });
    if(ok){
      const fromP=config.players[fi], toP=config.players[ti];
      pushFeed({type:"gift",playerId:fromId,emoji:"🪙",text:`${displayName(fromP)} a donné ${amt} pièces à ${displayName(toP)} 💛`});
      showToast(`🪙 ${amt} pièces envoyées à ${displayName(toP)}!`,"#D9BC5C",3000);
    } else { showToast("Pas assez de pièces 😅","#D98C8C",2500); }
    return ok;
  },[config,persist,showToast,pushFeed]);

  // 🐛 Signalement de bug → stocké dans config.bugs, visible dans le portail parent
  const handleReportBug = useCallback((text, who)=>{
    const t=(text||"").trim(); if(!t) return false;
    const cfg=cfgRef.current||{};
    const bug={ id:"bug_"+uid(), ts:Date.now(), who:who||"?", text:t.slice(0,300) };
    const n={...cfg, bugs:[bug, ...(cfg.bugs||[])].slice(0,50)};
    setConfig(n); persist(n, gsRef.current);
    showToast("🐛 Merci! Le bug a été envoyé au parent.","#5CAD68",3500);
    return true;
  },[persist,showToast]);

  // OFFRE : un enfant DEMANDE des pièces à un frère (fromId=demandeur, toId=détenteur qui paie)
  const handleCreateOffer = useCallback((fromId, toId, amount)=>{
    const amt=Math.max(1, Math.round(amount||0));
    const cfg=cfgRef.current||{};
    if(fromId===toId || amt<=0 || !cfg.players?.some(p=>p.id===fromId) || !cfg.players?.some(p=>p.id===toId)) return false;
    const offer={ id:"of_"+uid(), fromId, toId, amount:amt, ts:Date.now(), status:"pending" };
    const n={...cfg, coinOffers:[offer, ...(cfg.coinOffers||[])].slice(0,40)};
    setConfig(n); persist(n, gsRef.current);
    const toP=cfg.players.find(p=>p.id===toId);
    showToast(`📨 Demande envoyée à ${displayName(toP)} (${amt} 🪙)`,"#85CDD1",3000);
    return true;
  },[persist,showToast]);

  // RÉPONSE à une offre (par le détenteur toId) : accepter = transférer, refuser = marquer refusé
  const handleRespondOffer = useCallback((offerId, accept)=>{
    const cfg=cfgRef.current||{};
    const offer=(cfg.coinOffers||[]).find(o=>o.id===offerId);
    if(!offer || offer.status!=="pending") return;
    const hi=cfg.players.findIndex(p=>p.id===offer.toId);   // détenteur (paie)
    const ri=cfg.players.findIndex(p=>p.id===offer.fromId); // demandeur (reçoit)
    if(!accept){
      const ncfg={...cfg, coinOffers:(cfg.coinOffers||[]).map(o=>o.id===offerId?{...o,status:"declined"}:o)};
      setConfig(ncfg); persist(ncfg, gsRef.current); showToast("Demande refusée","#888",2500); return;
    }
    let ok=false;
    setGameStates(gs=>{ const n=[...gs];
      if((n[hi]?.coins||0) < offer.amount) return gs; // pas assez
      n[hi]={...n[hi], coins:(n[hi].coins||0)-offer.amount};
      n[ri]={...n[ri], coins:(n[ri].coins||0)+offer.amount};
      ok=true;
      const c=cfgRef.current||{};
      const ncfg={...c, coinOffers:(c.coinOffers||[]).map(o=>o.id===offerId?{...o,status:"accepted"}:o)};
      setConfig(ncfg); persist(ncfg, n); return n;
    });
    if(ok){ const toP=cfg.players[hi], fromP=cfg.players[ri];
      pushFeed({type:"gift",playerId:offer.toId,emoji:"🪙",text:`${displayName(toP)} a envoyé ${offer.amount} pièces à ${displayName(fromP)} 💛`});
      showToast(`✅ ${offer.amount} 🪙 envoyées!`,"#D9BC5C",3000);
    } else showToast("Tu n'as pas assez de pièces 😅","#D98C8C",2500);
  },[persist,showToast,pushFeed]);

  // L'enfant change SON pseudo (dans config.players)
  const handleUpdatePseudo = useCallback((playerIdx, pseudo)=>{
    const clean=(pseudo||"").trim().slice(0,16); if(!clean||!config.players[playerIdx])return;
    const newCfg={...config, players:config.players.map((pl,i)=>i===playerIdx?{...pl,pseudo:clean}:pl)};
    setConfig(newCfg); persist(newCfg,gameStates);
    showToast("✅ Pseudo changé!","#5CAD68");
  },[config,gameStates,persist,showToast]);

  // Annuler une récompense réclamée (remet les pièces) — accessible enfant ET parent
  const handleUnclaimReward = useCallback((playerId, reward)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    // v1.69.0 — VRAI fix « pièces infinies » : le remboursement est IDEMPOTENT par semaine.
    // Cause restante (post-v1.63) : coins/boughtRewards sont en dernière-écriture-gagne au niveau
    // FAMILLE → l'appareil d'un AUTRE enfant qui pousse un instantané périmé ressuscitait la
    // récompense remboursée (le bouton revenait) → re-remboursement sans fin. On pose un tombstone
    // `refundedRewards` (id#semaine, fusionné en UNION = increvable) : on ne rembourse qu'UNE fois.
    // v2.16.62 — le tombstone de v1.69.0 ne tenait QUE la semaine où il était posé. Or la récompense,
    // elle, ressuscite indéfiniment (boughtRewards = dernière-écriture-gagne, cf. ci-dessus) : passé
    // le lundi suivant, `id#semaine` ne correspondait plus et le même « J'ai changé d'idée » repayait
    // le prix PLEIN, sans que rien n'ait été dépensé — et de nouveau chaque semaine. Mesuré sur la
    // donnée de prod du 14 août : Elli avait `rw_depanneur` et `rw_bonbon` à la fois dans
    // `boughtRewards` ET dans `refundedRewards` (tombstones de la semaine du 20 juillet) = 270 pièces
    // encaissables à deux tapes, pour un `coinsLifetime` de 317. La v2.16.59 (qui repêche toujours une
    // récompense achetée dans la boutique) rendait justement ces deux cartes visibles tous les jours.
    // Le tombstone est maintenant keyé sur l'ACHAT (`rewardBuyTs`, posé par handleBuy) : un vrai
    // rachat produit une nouvelle estampille donc un nouveau remboursement légitime, tandis qu'une
    // résurrection par synchro ramène l'ANCIENNE estampille → déjà tombstonée, aucune pièce.
    // États d'avant la v2.16.62 (pas d'estampille) : tout tombstone portant cet id bloque le paiement.
    const stamp=(gameStates[idx]?.rewardBuyTs||{})[reward.id];
    const key=reward.id+"#"+(stamp?String(stamp):weekKey());
    let did=false;
    setGameStates(gs=>{ const n=[...gs]; const p=n[idx];
      if(!(p.boughtRewards||[]).includes(reward.id)) return gs; // pas réclamée → rien
      const already=(p.refundedRewards||[]).includes(key)
        || (!stamp && (p.refundedRewards||[]).some(k=>k.startsWith(reward.id+"#"))); // legacy : jamais 2 fois
      if(already){
        // déjà remboursée cette semaine (revenue via une synchro) → on retire juste le bouton, AUCUNE pièce
        n[idx]={...p, boughtRewards:(p.boughtRewards||[]).filter(r=>r!==reward.id), owned:(p.owned||[]).filter(id=>id!==reward.id)}; persist(config,n); return n;
      }
      did=true;
      n[idx]={...p,
        boughtRewards:(p.boughtRewards||[]).filter(r=>r!==reward.id),
        owned:(p.owned||[]).filter(id=>id!==reward.id),              // v2.5.23 — sinon un double-tap Acheter→"J'ai changé d'idée" laisse l'id orphelin dans owned[] pour toujours
        coins:(p.coins||0)+priceOf(reward),                         // rembourse ce qui a été payé (×PRICE_MULT)
        refundedRewards:[...new Set([...(p.refundedRewards||[]), key])].slice(-200) };
      persist(config,n); return n; });
    // v2.6.4 — même piège que v2.5.23 (owned[] orphelin) mais pour les moments : si le remboursement
    // a eu lieu ET que la demande n'a pas encore été engagée par le parent (statut "attente"),
    // on la retire — sinon un fantôme reste pour toujours dans "à planifier". Une demande déjà
    // "planifie"/"fait" (le parent s'est déjà engagé) n'est JAMAIS effacée automatiquement.
    if(did && reward.moment){
      const cfg=cfgRef.current||config;
      // v2.16.80 — sans tombstone, l'union par id ressuscitait la demande retirée ici : le « fantôme
      // pour toujours dans à planifier » que ce bloc existe pour éviter revenait quand même.
      const partis=(cfg.momentRequests||[]).filter(m=>m.playerId===playerId && m.rewardId===reward.id && m.status==="attente").map(m=>m.id);
      const newCfg={...cfg,
        momentRequests:(cfg.momentRequests||[]).filter(m=>!(m.playerId===playerId && m.rewardId===reward.id && m.status==="attente")),
        removedMomentRequests:_uniq([...(cfg.removedMomentRequests||[]), ...partis]).slice(-200)};
      setConfig(newCfg); persist(newCfg,gameStates);
    }
    if(did) showToast("↩️ J'ai changé d'idée — pièces remises!","#D99248");
  },[config,gameStates,persist,showToast]);

  // Minuterie : l'enfant a complété un rituel chronométré → bonus XP + entrée au fil
  const handleRitualTimerDone = useCallback((playerIdx, ritual, minutes)=>{
    const player=config.players[playerIdx]; if(!player)return;
    // XP SEULEMENT si c'est un vrai rituel enregistré (avec id). La minuterie libre = outil, pas de récompense.
    const isRealRoutine = !!(ritual && ritual.id);
    if(!isRealRoutine){
      showToast(`⏱ Minuterie terminée! C'est un outil — pas de récompense. 🙂`,"#888",4000);
      return;
    }
    const bonus=Math.min(40, 5*Math.max(1,(ritual?.taskIds?.length||1)));
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]||{};
      // v2.16.69 — JOUR ACTIF. Un rituel chronométré terminé accordait l'XP, le fil de famille et
      // la fête… mais n'écrivait pas `activeDays`, le seul champ que lisent la série 🔥 et la ligue.
      // Un enfant dont la journée est un rituel complet (et rien d'autre de validé) voyait donc sa
      // série affichée à 0 dans la seconde qui suit le « +XP 🎉 ». `todayStamp()` est le bon jour
      // ici, contrairement à `approvePending` (v2.16.64) : le geste est LIVE sur l'écran de
      // l'enfant, pas une validation parent qui peut tomber des jours plus tard.
      // Volontairement PAS étendu à `handleClaimDaily` : les 3 objectifs du jour se calculent tous
      // sur `doneToday` (clés de `completed` du jour), donc une journée réclamable a forcément déjà
      // ses complétions — et `approvePending` a déjà inscrit le jour. Ni au boss : sa victoire
      // donne 50 XP à TOUS les enfants, y compris ceux qui n'ont rien fait.
      n[playerIdx]={...p, xp:(p.xp||0)+bonus, xpLog:appendXpLog(p.xpLog,bonus,"rituel"),
        activeDays:_uniq([...(p.activeDays||[]), todayStamp()])};
      const txt=`${displayName(player)} a complété son rituel « ${ritual.name} » en ${minutes} min! (+${bonus} XP)`;
      const fe={id:"f_"+uid(),ts:Date.now(),likes:[],type:"ritual",playerId:player.id,emoji:ritual?.emoji||"⏱",text:txt};
      const newCfg={...config, feed:[fe,...(config.feed||[])].slice(0,60)};
      setConfig(newCfg); persist(newCfg,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("⏱"); SFX.epic&&SFX.epic(); }catch{} showToast(`⏱ Rituel fini en ${minutes} min! +${bonus} XP 🎉`,"#D9BC5C",4500); },150);
  },[config,persist,showToast]);

  // Parent : ajoute un événement au calendrier d'un ou plusieurs enfants (récurrent ou daté)
  const handleAddCalendarEvent = useCallback((playerIds, entry)=>{
    if(!playerIds?.length || !entry?.label?.trim())return;
    // v2.16.67 — un seul geste = un seul événement : toutes les copies partagent un `groupId`,
    // pour que ✏️ sache plus tard qu'elles sont la même chose (voir findCalendarSiblings).
    const groupId="cg_"+uid();
    setGameStates(gs=>{ const n=[...gs];
      playerIds.forEach(pid=>{ const i=config.players.findIndex(p=>p.id===pid); if(i<0)return;
        const e={ id:Date.now()+"_"+Math.random().toString(36).slice(2,6), groupId, type:entry.type||"evenement", label:entry.label.trim(), date:entry.date||null, time:entry.time||null, recur:entry.recur||null, updatedAt:Date.now() };
        n[i]={...n[i], calendar:[...(n[i].calendar||[]), e]};
      });
      persist(config,n); return n; });
    showToast("📅 Événement ajouté au calendrier!","#85CDD1");
  },[config,persist,showToast]);
  // v2.6.6 — modifier un événement depuis la section Calendrier.
  // v2.16.67 — l'édition porte sur TOUTES les copies de l'événement, pas seulement celle de
  // l'enfant dont on a tapé la ligne. `siblingIds` ({indice joueur → id de sa copie}) est résolu
  // par l'appelant AVANT d'entrer ici, et `targetIds` est la sélection d'enfants affichée à
  // l'écran : cocher un enfant sans copie lui en crée une, décocher un enfant qui en a une la
  // lui retire (avec pierre tombale, comme la suppression). Côté enfant, l'appelant ne passe que
  // sa propre copie — un enfant ne touche jamais au calendrier d'un autre.
  const handleUpdateCalendarEvent = useCallback((siblingIds, payload, targetIds, groupId)=>{
    const targets=new Set(targetIds||[]);
    if(!targets.size) return;                       // garde-fou : un formulaire sans cible n'efface rien
    const gid=groupId||("cg_"+uid());
    setGameStates(gs=>{ const n=[...gs];
      calendarUpdatePlan(config.players||[], siblingIds, targetIds).forEach(({idx:i, op, id})=>{
        if(op==="none") return;
        const cal=n[i]?.calendar||[];
        if(op==="update"){
          // v2.7.0 — updatedAt : pour que le merge multi-appareils garde la version la plus récente
          n[i]={...n[i], calendar:cal.map(e=>(e && e.id===id)?{...e, ...payload, groupId:gid, updatedAt:Date.now()}:e)};
        } else if(op==="remove"){
          n[i]={...n[i], calendar:cal.filter(e=>!e || e.id!==id),
            removedCalendarIds:[...(n[i].removedCalendarIds||[]), id].slice(-400)};
        } else { // "add" — un enfant coché qui n'avait pas encore cet événement
          const e={ id:Date.now()+"_"+Math.random().toString(36).slice(2,6), groupId:gid, ...payload, updatedAt:Date.now() };
          n[i]={...n[i], calendar:[...cal, e]};
        }
      });
      persist(config,n); return n; });
    showToast("📅 Événement modifié!","#85CDD1");
  },[config,persist,showToast]);
  const handleDeleteCalendarEvent = useCallback((playerName, entryId)=>{
    const i=config.players.findIndex(p=>(p.name||"")===playerName); if(i<0)return;
    setGameStates(gs=>{ const n=[...gs];
      // v2.7.0 — tombstone : empêche un appareil pas encore synchronisé de faire « ressusciter » l'événement au prochain merge
      n[i]={...n[i], calendar:(n[i].calendar||[]).filter(e=>e.id!==entryId), removedCalendarIds:[...(n[i].removedCalendarIds||[]), entryId].slice(-400)};
      persist(config,n); return n; });
  },[config,persist]);

  // Objectif du jour réclamé → bonus XP/pièces (une fois par jour)
  const handleClaimDaily = useCallback((playerIdx, obj)=>{
    const wk=todayStamp();
    setGameStates(gs=>{ const n=[...gs]; const p=n[playerIdx]; const dc=(p.dailyClaimed&&p.dailyClaimed.day===wk)?p.dailyClaimed:{day:wk,ids:[]};
      if(dc.ids.includes(obj.id))return gs;
      n[playerIdx]={...p, xp:(p.xp||0)+(obj.xp||0), coins:(p.coins||0)+(obj.coins||0), coinsLifetime:(p.coinsLifetime||0)+(obj.coins||0), xpLog:appendXpLog(p.xpLog,obj.xp||0,"objectif"), dailyClaimed:{day:wk,ids:[...dc.ids,obj.id]}};
      persist(config,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("🎯"); SFX.epic&&SFX.epic(); }catch{} },120);
    showToast(`🎯 Objectif réussi! +${obj.xp} XP${obj.coins?` +${obj.coins} 🪙`:""}`,"#5CAD68",3500);
  },[config,persist,showToast]);

  // Ouvrir un coffre : déduit le coût, ajoute l'item (ou rembourse un doublon)
  const handleOpenChest = useCallback((playerId, payload)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    setGameStates(gs=>{ const n=[...gs]; const p=n[idx]; if((p.coins||0)<payload.cost)return gs;
      // Ouvrir un coffre dépense aussi de l'ÉNERGIE (frein sain)
      n[idx]={...p, coins:(p.coins||0)-payload.cost+(payload.dup?(payload.refund||0):0), owned:payload.dup?(p.owned||[]):[...new Set([...(p.owned||[]),payload.itemId])],
        energy:Math.max(0, currentEnergy(p)-CHEST_ENERGY), energyTs:new Date().toISOString()};
      persist(config,n); return n; });
  },[config,persist]);

  // 🍖 Nourrir le familier (1×/jour) → recharge l'énergie + rend le familier content (+XP)
  const handleFeedPet = useCallback((playerIdx)=>{
    const p=gameStates[playerIdx]; if(!p) return;
    const today=todayStamp();
    if(p.lastFedDay===today){ showToast("Ton familier a déjà mangé aujourd'hui 🐾 Reviens demain!","#D99248",3000); return; }
    const eqPet=p.equipped?.pet;
    setGameStates(gs=>{ const n=[...gs]; const q=n[playerIdx]; const _g=gainPet(q,eqPet,12);
      n[playerIdx]={...q, lastFedDay:today, energy:Math.min(ENERGY_MAX, currentEnergy(q)+FEED_ENERGY), energyTs:new Date().toISOString(),
        petXp:_g.petXp, petDay:_g.petDay };
      persist(config,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("🍖"); SFX.coin&&SFX.coin(); }catch{} },80);
    showToast("🍖 Miam! Ton familier est rassasié et plein d'énergie!","#5CAD68",3000);
  },[gameStates,config,persist,showToast]);

  // 🎾 Jouer avec le familier → coûte de l'énergie, donne de l'XP au familier
  // v2.11.3 — bug_lyr5812 (signalé par un enfant : « familier peut jouer à l'infini ») : la vraie
  // cause n'était pas l'absence de plafond quotidien (gainPet le respecte déjà, PET_DAILY_CAP=50)
  // mais le toast qui affirmait « gagne de l'XP » à CHAQUE clic, même une fois le plafond atteint —
  // l'enfant pouvait donc jouer sans fin en croyant progresser alors que 0 XP était accordé. Fix :
  // toast honnête selon le gain réel, jeu (énergie, animation) toujours permis — pas de blocage dur,
  // cohérent avec le principe directeur (mise en scène OUI, jamais de fausse récompense).
  const handlePlayPet = useCallback((playerIdx)=>{
    const p=gameStates[playerIdx]; if(!p) return;
    const eqPet=p.equipped?.pet;
    if(!eqPet){ showToast("Équipe d'abord un familier 🐾","#D99248",2500); return; }
    if(currentEnergy(p)<PLAY_ENERGY){ const m=minsToEnergy(p,PLAY_ENERGY); showToast(`💤 Ton familier fait une sieste… reviens dans ~${m} min!`,"#85CDD1",3500); return; }
    const today=todayStamp();
    const roomBefore=Math.max(0, PET_DAILY_CAP-((p.petDay&&p.petDay.day===today)?(p.petDay.xp||0):0));
    const gained=Math.min(10,roomBefore)>0;
    setGameStates(gs=>{ const n=[...gs]; const q=n[playerIdx]; const _g=gainPet(q,eqPet,10);
      n[playerIdx]={...q, energy:Math.max(0, currentEnergy(q)-PLAY_ENERGY), energyTs:new Date().toISOString(),
        petXp:_g.petXp, petDay:_g.petDay };
      persist(config,n); return n; });
    setTimeout(()=>{ try{ if(!CALM) spawnParticles("🎾"); SFX.click&&SFX.click(); }catch{} },80);
    showToast(gained ? "🎾 Vous vous êtes bien amusés! Ton familier gagne de l'XP 🌟" : "🎾 Vous vous êtes bien amusés! (Ton familier a atteint son max d'XP du jour — reviens demain 🌙)","#D9BC5C",2800);
  },[gameStates,config,persist,showToast]);

  // v2.4.2 — l'enfant donne un surnom à son familier équipé
  const handleRenamePet = useCallback((playerIdx, petId, nickname)=>{
    setGameStates(gs=>{ const n=[...gs]; const q=n[playerIdx]||{};
      n[playerIdx]={...q, petNickname:{...(q.petNickname||{}), [petId]: nickname.trim().slice(0,20)}};
      persist(config,n); return n; });
  },[config,persist]);

  // Cacher une récompense (terminée/utilisée) → une nouvelle prend sa place
  const handleHideReward = useCallback((playerId, reward)=>{
    const idx=config.players.findIndex(p=>p.id===playerId); if(idx<0)return;
    const wk=todayStamp();
    setGameStates(gs=>{ const n=[...gs]; const p=n[idx]; const sameWeek=p.hiddenWeek===wk; const hidden=sameWeek?[...(p.hiddenRewards||[])]:[]; if(!hidden.includes(reward.id))hidden.push(reward.id); n[idx]={...p, hiddenRewards:hidden, hiddenWeek:wk}; persist(config,n); return n; });
    showToast("✅ Récompense rangée — une nouvelle apparaît!","#5CAD68");
  },[config,persist,showToast]);

  const handleResetPlayer = useCallback((playerIdx) => {
    const player=config.players[playerIdx];
    if(!window.confirm(`Reset ${player?.name}? XP, pièces et tâches seront à 0.`))return;
    // v2.16.45 — `noCoinsResetV1:true` ajouté ici aussi : cet état repart SANS drapeau autrement, et
    // un appareil resté sur une version d'avant v2.16.45 (bundle en cache, hors ligne) y verrait un
    // `coinsWeek` sans drapeau — donc l'ancien reset hebdomadaire réarmé sur les pièces regagnées
    // depuis. Le drapeau voyage maintenant avec l'état plutôt que d'être seulement reposé au prochain
    // chargement. Voir le bloc d'historique en tête de `migrateGameState`.
    // v2.16.81 — `resetAt` : sans lui, ce reset ne remettait à zéro QUE `coins`. Un état vide
    // n'exprime aucun retrait face à des `Math.max` (xp, coinsLifetime) et à des unions
    // (completed, owned, badges, activeDays, refusedKeys…) : mesuré sur la prod du 17 août, 12 des
    // 13 champs revenaient du nuage à la synchro suivante, et côté serveur le reset ne pouvait même
    // pas être accepté (`mergeFamily(existing, data)` met le stocké en base). L'estampille fait du
    // reset une ÉPOQUE que `mergeGS` sait arbitrer — voir la tête de `mergeGS` dans `src/merge.js`.
    setGameStates(gs=>{ const n=[...gs]; n[playerIdx]={xp:0,coins:0,coinsLifetime:0,coinsWeek:{week:custodyWeekKey()},noCoinsResetV1:true,resetAt:Date.now(),completed:[],pending:[],owned:[],equipped:{},boughtRewards:[],badges:[],avatar:n[playerIdx].avatar}; persist(config,n); return n; });
    logAction(`🔄 Reset complet: ${player?.name}`,"#D97070");
    showToast(`🔄 ${player?.name} réinitialisé`,"#D97070");
  },[config,persist,logAction,showToast]);

  const handleExport = useCallback(() => {
    exportConfig(config, gameStates);
    logAction("📤 Config exportée","#888");
    showToast("📤 Fichier téléchargé!","#888");
  },[config, gameStates, logAction, showToast]);

  const handleImport = useCallback((file) => {
    importConfig(file, ({config:c, gameStates:gs}) => {
      setConfig(c); setGameStates(gs); setScreen("game");
      persist(c, gs);
      showToast("📥 Config importée!","#5CAD68");
      logAction("📥 Config importée","#5CAD68");
    });
  },[persist, showToast, logAction]);

  const handleChangePin = useCallback((p) => {
    if(p.length!==4||!/^\d{4}$/.test(p))return;
    const newConfig={...config,pin:p};
    setConfig(newConfig);
    persist(newConfig,gameStates);
    logAction(`🔐 PIN changé`,"#888");
    showToast("🔐 PIN mis à jour!","#888");
    setPinChangeMode(false); setNewPin("");
  },[config,gameStates,persist,logAction,showToast]);

  // v2.16.26 — Backlog #15 : réglage global (pas par enfant, plus simple) du nombre de tâches
  // rotatives requises avant de débloquer boutique/avatar. 0 = désactivé (voir isShopLocked).
  const handleSetShopUnlockCount = useCallback((n)=>{
    const newConfig={...config, shopUnlockCount:Math.max(0,Math.min(10,n))};
    setConfig(newConfig);
    persist(newConfig,gameStates);
    logAction(`🔒 Seuil de déblocage boutique/avatar : ${n} tâche(s) rotative(s)`,"#888");
  },[config,gameStates,persist,logAction]);

  const handleUndo = useCallback(()=>{
    if(!undoStack.length)return;
    const last=undoStack[undoStack.length-1]; setUndoStack(u=>u.slice(0,-1));
    setGameStates(gs=>{ const n=[...gs]; const p=n[last.playerIdx]; n[last.playerIdx]={...p,xp:Math.max(0,p.xp-last.xp),coins:Math.max(0,p.coins-last.coins),completed:(p.completed||[]).filter(k=>k!==last.doneKey)}; persist(config,n); return n; });
    showToast("↩️ Action annulée!","#D99248");
  },[undoStack,config,persist,showToast]);

  // v1.95.0 (Lot 5 #23) — useMemo : sans ça, allTasks/allRewards étaient de nouveaux tableaux
  // à CHAQUE render, ce qui aurait annulé React.memo sur FamilyOverview/ParentPanel/PlayerDashboard
  // (les 3 les reçoivent en prop) même après avoir stabilisé leurs callbacks.
  const allTasks = useMemo(()=>[...TASK_CATALOG,...(config?.customTasks||[])], [config?.customTasks]);
  const allRewards = useMemo(()=>[...REWARD_CATALOG,...(config?.customRewards||[])], [config?.customRewards]);
  // Resolve week theme (random_week → pick based on current week number) — fallback famille
  const weekNum = Math.ceil(new Date().getDate()/7) + new Date().getMonth()*4;
  const resolvedWeekTheme = config?.theme==="random_week"
    ? THEMES[resolveWeekRandomTheme(weekNum)] || THEMES.minecraft
    : THEMES[config?.theme||"minecraft"];
  // Un seul thème à choisir : en vue joueur, tout l'écran (fond, bordures, titres)
  // suit le thème personnel du joueur. La vue famille garde l'ambiance par défaut.
  const viewedPlayer = typeof view==="number" ? config?.players?.[view] : null;
  const th = useMemo(()=>{
    if (!viewedPlayer) return resolvedWeekTheme;
    const ptv = getPlayerTheme(viewedPlayer.themeId==="random" ? resolveRandomTheme(viewedPlayer.id) : viewedPlayer.themeId);
    return { name:ptv.name, bg:ptv.bg, primary:ptv.primary, accent:ptv.accent, card:"rgba(0,0,0,0.5)", text:"#fff" };
  },[viewedPlayer, resolvedWeekTheme]);

  // Mode effectif : chaque enfant choisit le sien (routine|week). Vue famille/parent = accueil Semaine (pas de gros chrono rouge).
  const effectiveMode = typeof view==="number" ? (gameStates[view]?.mode || config?.mode || "routine") : "week";
  // Réglages d'accessibilité de l'enfant affiché → pilotent son/animations/décompte
  const curSettings = (typeof view==="number" ? gameStates[view]?.settings : null) || { sound:true, calm:false, calmCountdown:false, humor:true, focus:false, fontScale:1, readableFont:false, highContrast:false };
  setSfxMuted(curSettings.sound === false);
  setCalm(curSettings.calm);
  // Le décompte de routine ne s'affiche que pour un enfant en mode routine, et seulement dans une fenêtre du matin
  // (sinon une routine d'hier soir laisse un gros « EN RETARD » rouge en permanence).
  // Heure de fin: celle de la routine active si elle en a une, sinon l'heure de routine famille
  const activeRoutineObj = (typeof view==="number" && effectiveMode==="routine" && gameStates[view]?.activeRoutineId)
    ? (gameStates[view].routines||[]).find(r=>r.id===gameStates[view].activeRoutineId) : null;
  const countdownEnd = activeRoutineObj
    ? (activeRoutineObj.endTime || "")               // routine ciblée: seulement si elle a une heure de fin
    : (config?.routineEnd || "08:30");               // mode "Toutes les routines": heure famille
  const showCountdown = (()=>{
    if(typeof view!=="number" || effectiveMode!=="routine" || !config || !countdownEnd) return false;
    const [eh,em]=countdownEnd.split(":").map(Number);
    const nowMin=now.getHours()*60+now.getMinutes();
    return nowMin <= (eh*60+em+90); // jusqu'à 90 min après l'heure de fin
  })();

  // Date display (l'affichage H:M est dans <HeaderClock/>, isolé — voir v1.94.0)
  const daysArr=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"],mthArr=["jan","fév","mar","avr","mai","jun","jul","aoû","sep","oct","nov","déc"];
  const dateStr=`${daysArr[now.getDay()]} ${now.getDate()} ${mthArr[now.getMonth()]}`;

  // Day progress (routine: 6h–routineEnd, week: Mon–Sun)
  const dayPct = useMemo(()=>{
    if(!config)return 0;
    if(effectiveMode==="routine"){ const [eh,em]=(config.routineEnd||"08:30").split(":").map(Number); const s=new Date();s.setHours(6,0,0,0); const e=new Date();e.setHours(eh,em,0,0); return Math.max(0,Math.min(100,((now-s)/(e-s))*100)); }
    if(effectiveMode==="week"){ return Math.round((todayDayIdx/6)*100); }
    return 0;
  },[config,now,todayDayIdx,effectiveMode]);

  // v1.95.0 (Lot 5 #23) — callbacks stabilisés (useCallback) pour que React.memo sur
  // FamilyOverview/ParentPanel serve à quelque chose : sans ça, ces props recréées
  // en ligne à chaque render de App() auraient toujours été "différentes" pour le
  // comparateur de memo, qui aurait donc re-render ces enfants de toute façon.
  // Placés AVANT les "return" précoces ci-dessous (screen loading/setup/login) — les Hooks
  // doivent être appelés dans le même ordre à chaque render, jamais après un retour conditionnel.
  // config peut être null ici (écrans loading/setup) → chaînage optionnel partout.
  const familyMeId = parentMode ? "parent" : (sessionPlayer!=null ? config?.players?.[sessionPlayer]?.id : "parent");
  const onFamilySelectPlayer = useCallback(i=>{ setView(i); SFX.click(); }, []);
  const onFamilyCanOpen = useCallback(i=> parentMode || sessionPlayer===i, [parentMode, sessionPlayer]);
  const onFamilyLike = useCallback((fid)=> toggleFeedLike(fid, familyMeId), [toggleFeedLike, familyMeId]);
  const onFamilyPostChat = useCallback((text)=>{ pushFeed({type:"chat",playerId:familyMeId,text,emoji:"💬"}); }, [pushFeed, familyMeId]);

  const onParentPanelClose = useCallback(()=>setParentPanel(false), []);
  const onParentPanelExit = useCallback(()=>{ setParentMode(false); setParentPanel(false);
    if(returnToPlayer!=null){ setSessionPlayer(returnToPlayer); setView(returnToPlayer); setReturnToPlayer(null); } // v2.5.3 (Correctif 3) — restaure la session enfant si on est entré depuis elle
    showToast("🔒 Mode parent quitté","#D99248"); }, [showToast, returnToPlayer]);
  const onParentPanelReset = useCallback(()=>{ if(window.confirm("Remettre tous les joueurs à zéro?")){ (config?.players||[]).forEach((_,i)=>handleResetPlayer(i)); } }, [config?.players, handleResetPlayer]);
  const onParentPanelSetup = useCallback(()=>{ setEditingBook(true); setScreen("setup"); setParentPanel(false); }, []);

  // v1.101.0 (Lot 5 #23) — même traitement que FamilyOverview/ParentPanel ci-dessus, mais pour
  // PlayerDashboard : ~26 props callback étaient recréées en ligne à chaque render (curry sur
  // `view`, ou logique courte), rendant un futur React.memo(PlayerDashboard) inefficace. Chaque
  // handler `handleXxx` sous-jacent est déjà un useCallback stable — seule la couche de currying
  // par `view`/`config` manquait. Comportement identique, juste la couche stable ajoutée.
  const onDashUpdateAvatar = useCallback((av,pid)=>{
    const i=config.players.findIndex(p=>p.id===pid); if(i<0)return;
    setGameStates(gs=>{ const n=[...gs]; n[i]={...n[i],avatar:av}; persist(config,n); return n; });
  }, [config, persist]);
  const onDashChildAddTask = useCallback((data)=>handleChildAddTask(view,data), [view, handleChildAddTask]);
  const onDashChildPickTask = useCallback((taskId)=>handleChildPickTask(view,taskId), [view, handleChildPickTask]);
  const onDashChildAddRoutineTask = useCallback((data)=>handleChildAddRoutineTask(view,data), [view, handleChildAddRoutineTask]);
  const onDashRequestRemoval = useCallback((instanceId)=>handleRequestRemoval(view,instanceId), [view, handleRequestRemoval]);
  const onDashCreateTeamInvite = useCallback((instanceId,toPlayerId)=>handleCreateTeamInvite(view,instanceId,toPlayerId), [view, handleCreateTeamInvite]);
  const onDashRespondTeamInvite = useCallback((inviteId,accept)=>handleRespondTeamInvite(view,inviteId,accept), [view, handleRespondTeamInvite]);
  const onDashUpdatePseudo = useCallback((pseudo)=>handleUpdatePseudo(view,pseudo), [view, handleUpdatePseudo]);
  const onDashFeedPet = useCallback(()=>handleFeedPet(view), [view, handleFeedPet]);
  const onDashPlayPet = useCallback(()=>handlePlayPet(view), [view, handlePlayPet]);
  const onDashRenamePet = useCallback((petId,nickname)=>handleRenamePet(view,petId,nickname), [view, handleRenamePet]);
  const onDashChoosePetEvo = useCallback((petId,tier,el)=>handleChoosePetEvo(view,petId,tier,el), [view, handleChoosePetEvo]);
  const onDashDismissRefusal = useCallback((key)=>handleDismissRefusal(view,key), [view, handleDismissRefusal]);
  const onDashDismissAnnouncement = useCallback((id)=>handleDismissAnnouncement(view,id), [view, handleDismissAnnouncement]); // v2.6.0
  const onDashBossAttack = useCallback((type)=>handleBossAttack(view,type), [view, handleBossAttack]);
  const onDashBossPetAttack = useCallback(()=>handleBossPetAttack(view), [view, handleBossPetAttack]);
  const onDashBossFinish = useCallback(()=>handleBossFinish(view), [view, handleBossFinish]);
  const onDashLogout = useCallback(()=>{SFX.click();setParentMode(false);setSessionPlayer(null);setParentPanel(false);setParentPinOpen(false);setView("family");setScreen("login");}, []);
  const onDashOpenParentPin = useCallback(()=>{SFX.click();setParentPinOpen(true);}, []);
  const onDashReportBug = useCallback((text)=>handleReportBug(text, displayName(config.players[view])), [config, view, handleReportBug]);
  const onDashCloseHam = useCallback(()=>setHamOpen(false), []);
  const onDashGoFamily = useCallback(()=>{setView("family");SFX.click();}, []);
  const onDashGoCalendars = useCallback(()=>{setView("calendars");SFX.click();}, []);
  const onDashGoTimer = useCallback((ritualId)=>{setTimerRitual(ritualId&&typeof ritualId==="string"?ritualId:null);setView("timer");SFX.click();}, []);
  const onDashUnclaimReward = useCallback((reward)=>handleUnclaimReward(config.players[view]?.id, reward), [config, view, handleUnclaimReward]);
  const onDashHideReward = useCallback((reward)=>handleHideReward(config.players[view]?.id, reward), [config, view, handleHideReward]);
  const onDashClaimDaily = useCallback((obj)=>handleClaimDaily(view, obj), [view, handleClaimDaily]);
  const onDashOpenChest = useCallback((payload)=>handleOpenChest(config.players[view]?.id, payload), [config, view, handleOpenChest]);
  const onDashPatchState = useCallback((patch)=>{
    setGameStates(gs=>{ const n=[...gs]; n[view]={...n[view],...patch}; persist(config,n); return n; });
    SFX.click();
  }, [view, config, persist]);
  const onDashChangeTheme = useCallback((themeId)=>{
    const now=new Date().toISOString();
    const newCfg={...config, players: config.players.map((pl,i)=> i===view ? {...pl, themeId, themeChosenAt:now} : pl)};
    setConfig(newCfg); persist(newCfg, gameStates); SFX.epic&&SFX.epic();
    showToast("🎨 Nouveau thème activé pour la semaine!","#D9BC5C",3000);
  }, [view, config, gameStates, persist, showToast]);
  if(screen==="loading") return <div style={{minHeight:"100vh",background:"#1a1a2e",display:"flex",alignItems:"center",justifyContent:"safe center"}}><style>{GLOBAL_CSS}</style><div style={{fontFamily:"'Press Start 2P',monospace",fontSize:12,color:"#D9BC5C",animation:"pulse 1s infinite"}}>⚔️ Chargement…</div></div>;
  if(screen==="setup") return <Suspense fallback={<LazyScreenFallback/>}><SetupWizard existing={editingBook?config:null} onDone={(d)=>{setEditingBook(false);handleSetupDone(d);}}
    onCancel={editingBook?()=>{setEditingBook(false);setScreen("game");setParentPanel(true);}:null}/></Suspense>;
  if(screen==="login"&&!config) return <Suspense fallback={<LazyScreenFallback/>}><SetupWizard existing={null} onDone={handleSetupDone}/></Suspense>;
  if(screen==="login") return <LoginScreen config={config} gameStates={gameStates} appVersion={APP_VERSION}
    onSelectPlayer={(idx)=>{
      // À la connexion, l'enfant arrive sur l'écran d'accueil Semaine (pas au milieu d'une routine).
      // v2.16.63 — `mode:"week"` suffit pour ça ; on ne jette plus son dernier rituel choisi, sinon
      // « ⏰ Rituels » le renvoie au matin à chaque ouverture de session.
      setGameStates(gs=>{ const n=[...gs]; if(n[idx]) n[idx]={...n[idx],mode:"week"}; persist(config,n); return n; });
      setSessionPlayer(idx); setParentMode(false); setView(idx); setScreen("game"); SFX.click();
      // Jouer les fêtes différées (quêtes validées par le parent sur un autre appareil)
      consumeCelebrations(idx);
    }}
    onParentLogin={()=>{ setParentMode(true); setSessionPlayer(null); setView("family"); setScreen("game"); SFX.click(); }}
    onNewSetup={()=>{ setEditingBook(false); setScreen("setup"); }}
    onSetPlayerPin={(idx, newPin)=>{
      const gs = [...gameStates]; gs[idx]={...gs[idx], pin:newPin};
      setGameStates(gs); save({config, gameStates:gs, savedAt:new Date().toISOString()});
    }}
    onCompleteOnboarding={(idx, {themeId, avatar, pseudo, pin})=>{
      const now = new Date().toISOString();
      const newConfig = {...config};
      newConfig.players = config.players.map((pl,i)=> i===idx
        ? {...pl, themeId, pseudo, themeChosenAt:now}
        : pl
      );
      const gs = [...gameStates];
      gs[idx] = {...gs[idx], pin, avatar:{...avatar, configured:true}};
      setConfig(newConfig); setGameStates(gs);
      save({config:newConfig, gameStates:gs, savedAt:now});
    }}/>;


  const currentPlayerView = typeof view==="number" ? view : null;
  const currentPlayer = currentPlayerView!==null ? config.players[currentPlayerView] : null;
  const currentPlayerState = currentPlayerView!==null ? gameStates[currentPlayerView] : null;

  return (
    // v2.16.49 (Lot 3 #12, dernier tiers) — « contraste fort » se pose ICI, sur la racine, et pas
    // sur le conteneur de l'écran enfant comme `readable-font` : la classe ne repeint rien
    // elle-même, elle REDÉFINIT des variables CSS (--txt-*/--b-*), et une variable ne descend
    // qu'aux descendants du nœud qui la déclare. Sur la racine, elle atteint aussi les popups
    // `position:fixed` (qui restent des descendants DOM de game-root) et le header.
    <div className={"game-root vignette-bg"+(CALM?" calm-mode":"")+(curSettings.highContrast?" high-contrast":"")} style={{minHeight:"100vh",background:th.bg,position:"relative",overflowX:"hidden"}}>
      <style>{GLOBAL_CSS+`
        .nav-btn:hover{opacity:0.85;}
        .task-card:hover{transform:translateY(-1px);}
      `}</style>
      <div style={{position:"fixed",inset:0,background:`radial-gradient(ellipse at 30% 0%,${th.primary}0E 0%,transparent 55%)`,zIndex:0,pointerEvents:"none"}}/>

      {/* ── HEADER ── */}
      {/* v1.89.0 (desktop/mobile flex) — largeur plafonnée + centrée (comme le contenu et la barre
          d'onglets) pour que l'app reste une colonne confortable au lieu de s'étirer sur un écran
          d'ordinateur — le fond dégradé de game-root reste visible de chaque côté. */}
      <div style={{position:"sticky",top:0,zIndex:100,maxWidth:900,margin:"0 auto",background:`${th.bg}F2`,borderBottom:`2px solid ${th.accent}55`,padding:"9px 12px",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        {/* Title + mode badge — tap 7× d'affilée (<1.5s entre chaque) pour un easter egg discret */}
        <div style={{flex:1,minWidth:120}} onClick={()=>{
          clearTimeout(titleTapTimerRef.current);
          titleTapCountRef.current+=1;
          if(titleTapCountRef.current>=7){
            titleTapCountRef.current=0;
            // v2.16.48 — l'easter egg fait partie de « 😄 Messages rigolos » : muet si l'enfant l'a coupé.
            if(curSettings.humor!==false){
              SFX.epic&&SFX.epic(); spawnParticles("✨");
              showToast(TITLE_EASTER_EGGS[Math.floor(Math.random()*TITLE_EASTER_EGGS.length)],"#D9BC5C",4500);
            }
          } else {
            titleTapTimerRef.current=setTimeout(()=>{titleTapCountRef.current=0;},1500);
          }
        }}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,12px)",color:th.accent}}>{currentPlayer ? `⚔️ Les quêtes de ${displayName(currentPlayer)}` : (sessionPlayer!=null && config.players[sessionPlayer] ? `⚔️ Les quêtes de ${displayName(config.players[sessionPlayer])}` : "⚔️ LIVRE DE QUÊTES")}</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-muted,#888)"}}>{effectiveMode==="routine"?"Mode Rituel ⏰":"Mode Semaine 📅"} — {th.name}</div>
        </div>
        {/* Clock (discrète : heure:minute, sans clignotement) — composant isolé, v1.94.0 */}
        <HeaderClock style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.6vw,14px)",color:"#7aa"}}/>
        {/* Indicateur de synchro cloud */}
        {syncedAt>0 && (()=>{ const fresh=(now.getTime()-syncedAt)<40000;
          return <div title={fresh?"Progression synchronisée sur tous les appareils":"En attente de synchro…"}
            style={{fontFamily:"'VT323',monospace",fontSize:13,color:fresh?"#5CAD68":"var(--txt-dim,#666)",whiteSpace:"nowrap"}}>☁️{fresh?" ✓":" …"}</div>; })()}
        {/* Contrôles header */}
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {parentMode ? (<>
            <button onClick={()=>{SFX.click();setParentPanel(true);}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"8px 12px",background:"#D99248",color:"#0d0d0d",border:"2px solid #D99248",borderRadius:3,cursor:"pointer",boxShadow:"0 0 10px #D9924860",position:"relative"}}>
              🔓 PARENT ▸
              {(()=>{ const nb=gameStates.reduce((s,gs)=>s+(gs.pending||[]).length,0);
                return nb>0?<span style={{position:"absolute",top:-7,right:-7,background:"#D97070",color:"#fff",borderRadius:"50%",minWidth:16,height:16,fontSize:9,lineHeight:"16px",fontFamily:"'Press Start 2P',monospace",padding:"0 2px",border:"2px solid #0d0d0d"}}>{nb}</span>:null; })()}
            </button>
            <button onClick={()=>{SFX.click();setParentMode(false);setParentPanel(false); if(returnToPlayer!=null){ setSessionPlayer(returnToPlayer); setView(returnToPlayer); setReturnToPlayer(null); } showToast("🔒 Mode parent quitté","#D99248");}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"8px 10px",background:"#222",color:"#D99248",border:"2px solid #D99248",borderRadius:3,cursor:"pointer"}} title="Quitter le mode parent">🔒</button>
          </>) : sessionPlayer!=null ? (
            // ☰ Menu enfant (contient réglages, archives, bug, validation parent, quitter)
            <button onClick={()=>{SFX.click(); if(typeof view!=="number") setView(sessionPlayer); setHamOpen(true);}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"8px 14px",background:"#222",color:th.accent,border:`2px solid ${th.accent}66`,borderRadius:3,cursor:"pointer"}} title="Menu">☰ Menu</button>
          ) : (
            <button onClick={()=>{SFX.click();setParentMode(false);setSessionPlayer(null);setParentPanel(false);setParentPinOpen(false);setView("family");setScreen("login");}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"8px 10px",background:"#222",color:"var(--txt-muted,#888)",border:"2px solid #444",borderRadius:3,cursor:"pointer"}} title="Déconnexion">🚪</button>
          )}
        </div>
      </div>

      {/* ── ROUTINE COUNTDOWN (sticky below header) ── */}
      {showCountdown&&<div style={{position:"sticky",top:72,zIndex:90,maxWidth:900,margin:"0 auto",padding:"6px 12px",background:`${th.bg}EE`,backdropFilter:"blur(6px)"}}><Countdown endTime={countdownEnd} th={th} calm={curSettings.calmCountdown}/></div>}

      {/* ── DAY PROGRESS ── */}
      <div style={{maxWidth:900,margin:"0 auto",padding:"6px 12px",background:"rgba(0,0,0,0.55)",borderBottom:"2px solid #333"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-muted,#888)"}}>{effectiveMode==="routine"?"6h00":"Lun"}</span>
          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:th.accent}}>
            {effectiveMode==="routine"?"⏱ Progression":"📅 Semaine — "+DAYS_SHORT[todayDayIdx]}
          </span>
          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-muted,#888)"}}>{effectiveMode==="routine"?config.routineEnd:"Dim"}</span>
        </div>
        <div style={{height:12,background:"#111",border:"2px solid #333",borderRadius:2,overflow:"hidden",position:"relative"}}>
          <div style={{height:"100%",width:dayPct+"%",background:`linear-gradient(90deg,${th.primary},${th.accent})`,transition:"width 1s ease",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)",animation:"shimmer 2s infinite"}}/>
          </div>
          {effectiveMode==="week"&&DAYS_SHORT.map((d,i)=><div key={i} style={{position:"absolute",top:0,left:`${(i/6)*100}%`,width:1,height:"100%",background:"rgba(255,255,255,0.1)"}}/>)}
        </div>
      </div>

      {/* ── PLAYER NAV ── (cachée en session enfant : la nav passe par l'accueil-menu + footer) */}
      {!(sessionPlayer!=null && !parentMode) &&
      <div style={{display:"flex",gap:0,maxWidth:900,margin:"0 auto",background:"rgba(0,0,0,0.6)",borderBottom:"2px solid #333",overflowX:"auto"}}>
        <button onClick={()=>{setView("family");SFX.click();}} className="nav-btn"
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view==="family"?th.accent:"transparent",color:view==="family"?"#0d0d0d":"var(--txt-muted,#888)",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
          👨‍👩‍👧‍👦 Famille
        </button>
        <button onClick={()=>{setView("calendars");SFX.click();}} className="nav-btn"
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view==="calendars"?th.accent:"transparent",color:view==="calendars"?"#0d0d0d":"var(--txt-muted,#888)",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
          📅 Calendriers
        </button>
        <button onClick={()=>{setView("timer");SFX.click();}} className="nav-btn"
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view==="timer"?th.accent:"transparent",color:view==="timer"?"#0d0d0d":"var(--txt-muted,#888)",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
          ⏱ Minuterie
        </button>
        {/* Un enfant connecté ne voit QUE son onglet. Le parent voit tout le monde.
            v2.5.8 (Backlog UX item 3) — préfixe "👁️" en mode parent : ces onglets affichent la
            page de l'enfant EN LECTURE (même écran que lui), pas un panneau de gestion — ajuster
            XP/pièces se fait dans le tiroir MODE PARENT → Actions. */}
        {(config.players||[]).map((pl,i)=>({pl,i})).filter(({i})=> parentMode || sessionPlayer===null || sessionPlayer===i).map(({pl,i})=>(
          <button key={pl.id} onClick={()=>{setView(i);SFX.click();}} className="nav-btn"
            style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",padding:"9px 14px",background:view===i?pl.color:"transparent",color:view===i?"#0d0d0d":"var(--txt-muted,#888)",border:"none",borderRight:"2px solid #333",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,borderBottom:view===i?`3px solid ${pl.color}`:"none"}}>
            {parentMode?"👁️ Voir ":""}{displayName(pl)}
          </button>
        ))}
      </div>}

      {/* ── FOOTER COLLANT enfant : retour à l'accueil depuis Famille/Calendrier/Minuterie ── */}
      {(sessionPlayer!=null && !parentMode && (view==="family"||view==="calendars"||view==="timer")) && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:60,background:"rgba(0,0,0,0.92)",borderTop:"2px solid #333",display:"flex",justifyContent:"center",padding:"8px 10px",paddingBottom:"calc(8px + env(safe-area-inset-bottom))"}}>
          <button onClick={()=>{setView(sessionPlayer);SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:"#0d0d0d",background:th.accent,border:"none",borderRadius:10,padding:"12px 26px",cursor:"pointer"}}>🏠 Accueil</button>
        </div>
      )}

      {/* ── CONTENT ── */}
      {/* paddingBottom dégage le footer fixe pour que la dernière tâche reste atteignable */}
      <div style={{position:"relative",maxWidth:view==="week"?"100%":900,margin:"0 auto",paddingBottom:48}}>
        {view==="calendars"&&(()=>{
          // v2.15.0 — SEULE section calendrier de l'app (demande de Gen, celle accessible via le
          // pied de page collant côté enfant / le bouton "📅 Calendriers" côté parent — l'ancien
          // onglet séparé du tiroir parent a été retiré). Purement événementiel : plus de
          // devoir/examen (ces "tâches à XP" ont été retirées du calendrier, voir migration
          // migrateGameState). Tout le monde peut modifier : le parent peut éditer n'importe quelle
          // entrée de n'importe quel enfant (y compris santé/sport/intervenant/camp, qu'il gère) ;
          // l'enfant connecté peut modifier ses propres entrées "événement".
          const order=(config.players||[]).map((p,i)=>i).sort((a,b)=> (a===sessionPlayer?-1:b===sessionPlayer?1:0));
          const TYPE_OPTIONS = parentMode
            ? [["evenement","📅 Événement"],["sante",CAL_TYPES.sante.label],["sport",CAL_TYPES.sport.label],["intervenant",CAL_TYPES.intervenant.label],["camp",CAL_TYPES.camp.label]]
            : [["evenement","📅 Événement"]];
          const blankForm = { editId:null, ownerIdx:null, groupId:null, siblingIds:{}, type:"evenement", label:"", date:"", time:"", recur:"none", day:0 };
          const resetForm=()=>{ setMyCalForm(blankForm); setMyCalTargets(sessionPlayer!=null?[config.players[sessionPlayer]?.id].filter(Boolean):[]); setMyCalOpen(false); };
          const startEdit=(e,ownerIdx)=>{
            // v2.16.67 — retrouver les autres copies du MÊME événement (ajout multi-enfants) pour
            // que la portée de la modification soit visible et modifiable, au lieu d'être devinée.
            // Côté enfant : jamais de fratrie, on ne touche que sa propre copie.
            const sibs = parentMode
              ? findCalendarSiblings((config.players||[]).map((_,pi)=>gameStates[pi]?.calendar||[]), ownerIdx, e)
              : [{idx:ownerIdx, entry:e}];
            const siblingIds={}; sibs.forEach(s=>{ siblingIds[s.idx]=s.entry.id; });
            setMyCalForm({editId:e.id,ownerIdx,groupId:e.groupId||null,siblingIds,type:e.type||"evenement",label:e.label,date:e.date||"",time:e.time||"",recur:e.recur?e.recur.freq:"none",day:e.recur?.day??0});
            setMyCalTargets(sibs.map(s=>config.players[s.idx]?.id).filter(Boolean));
            setMyCalOpen(true);
          };
          const saveForm=()=>{
            if(!myCalForm.label.trim()||(myCalForm.recur==="none"&&!myCalForm.date)) return;
            const payload={
              type: myCalForm.type,
              label: myCalForm.label.trim(),
              date: myCalForm.recur==="none" ? myCalForm.date : null,
              time: myCalForm.time || null,
              recur: myCalForm.recur==="none" ? null : (myCalForm.recur==="weekly" ? {freq:"weekly",day:myCalForm.day} : {freq:"daily"}),
            };
            if(myCalForm.editId!=null){
              // v2.16.67 — côté enfant la portée reste sa seule copie ; côté parent c'est la
              // sélection affichée (pré-cochée sur les enfants qui ont déjà cet événement).
              const targets = parentMode ? myCalTargets : [config.players[myCalForm.ownerIdx]?.id].filter(Boolean);
              if(!targets.length) return;
              handleUpdateCalendarEvent(myCalForm.siblingIds||{}, payload, targets, myCalForm.groupId);
            } else if(myCalTargets.length){
              handleAddCalendarEvent(myCalTargets, payload);
            } else return;
            SFX.click();
            resetForm();
          };
          const deleteEntry=(id,ownerIdx)=>{
            const owner=config.players[ownerIdx];
            if(owner) handleDeleteCalendarEvent(owner.name, id);
            SFX.click();
          };
          return (
            <div style={{padding:"10px 8px",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,11px)",color:th.accent}}>📅 CALENDRIER</div>
              {(sessionPlayer!=null || parentMode) && (
                <div>
                  <button onClick={()=>{ if(myCalOpen) resetForm(); else { setMyCalForm(blankForm); setMyCalTargets(sessionPlayer!=null?[config.players[sessionPlayer]?.id].filter(Boolean):[]); setMyCalOpen(true); } SFX.click(); }}
                    style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"12px",
                      background:myCalOpen?"#1a1a1a":th.accent,color:myCalOpen?th.accent:"#0d0d0d",
                      border:`3px solid ${myCalOpen?th.accent:"#0d0d0d"}`,borderRadius:5,cursor:"pointer",
                      boxShadow:myCalOpen?"none":"4px 4px 0 #0d0d0d",transition:"all 0.12s"}}>
                    {myCalOpen?"✕ Fermer":"➕ Ajouter un événement"}
                  </button>
                  {myCalOpen && (
                    <div style={{marginTop:8,background:"rgba(0,0,0,0.5)",border:`2px solid ${th.accent}`,borderRadius:5,padding:10,display:"flex",flexDirection:"column",gap:6}}>
                      {TYPE_OPTIONS.length>1 && <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {TYPE_OPTIONS.map(([v,l])=>(
                          <button key={v} onClick={()=>{setMyCalForm(f=>({...f,type:v}));SFX.click();}}
                            style={{flex:"1 0 auto",fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"6px 8px",background:myCalForm.type===v?th.accent:"#1a1a1a",color:myCalForm.type===v?"#0d0d0d":"var(--txt-muted,#888)",border:`2px solid ${myCalForm.type===v?th.accent:"#333"}`,borderRadius:3,cursor:"pointer"}}>
                            {l}
                          </button>
                        ))}
                      </div>}
                      <input value={myCalForm.label} onChange={e=>setMyCalForm(f=>({...f,label:e.target.value.slice(0,50)}))} placeholder="Cours de natation, rendez-vous..."
                        style={{fontFamily:"'VT323',monospace",fontSize:16,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3,outline:"none",width:"100%",boxSizing:"border-box"}}/>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        {[["none","Une date"],["weekly","Chaque semaine"],["daily","Chaque jour"]].map(([v,l])=>(
                          <button key={v} onClick={()=>{setMyCalForm(f=>({...f,recur:v}));SFX.click();}}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 8px",background:myCalForm.recur===v?"#D99248":"#1a1a1a",color:myCalForm.recur===v?"#0d0d0d":"var(--txt-muted,#888)",border:`2px solid ${myCalForm.recur===v?"#D99248":"#333"}`,borderRadius:3,cursor:"pointer"}}>{l}</button>
                        ))}
                      </div>
                      {myCalForm.recur==="none" && <input type="date" value={myCalForm.date} onChange={e=>setMyCalForm(f=>({...f,date:e.target.value}))}
                        style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3,outline:"none",width:"100%",boxSizing:"border-box"}}/>}
                      {myCalForm.recur==="weekly" && <select value={myCalForm.day} onChange={e=>setMyCalForm(f=>({...f,day:+e.target.value}))}
                        style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4}}>{DAYS.map((d,i)=><option key={i} value={i}>{d}</option>)}</select>}
                      <div>
                        <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-muted,#888)",marginBottom:2}}>Heure (optionnel)</div>
                        <input type="time" value={myCalForm.time} onChange={e=>setMyCalForm(f=>({...f,time:e.target.value}))}
                          style={{fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3,outline:"none"}}/>
                      </div>
                      {/* v2.16.67 — la sélection d'enfants est désormais affichée AUSSI en modification :
                          un événement ajouté à plusieurs enfants existe en autant de copies, et sans ce
                          bloc le parent n'avait aucun moyen de voir laquelle (ou lesquelles) il changeait. */}
                      {parentMode && (
                        <div>
                          <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-muted,#888)",marginBottom:4}}>{myCalForm.editId!=null?"Appliquer à quels enfants?":"Pour quel enfant?"}</div>
                          {myCalForm.editId!=null && Object.keys(myCalForm.siblingIds||{}).length>1 && (
                            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#85CDD1",marginBottom:4,lineHeight:1.3}}>
                              🔗 Même événement chez {Object.keys(myCalForm.siblingIds).length} enfants. Décoche un enfant pour le lui retirer.
                            </div>
                          )}
                          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                            {config.players.map(pl=>{ const sel=myCalTargets.includes(pl.id); return (
                              <div key={pl.id} onClick={()=>setMyCalTargets(ids=>sel?ids.filter(x=>x!==pl.id):[...ids,pl.id])} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:sel?pl.color:"#1a1a1a",color:sel?"#0d0d0d":"var(--txt-faint,#555)",border:`2px solid ${sel?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>{displayName(pl)}</div>
                            ); })}
                          </div>
                        </div>
                      )}
                      <button onClick={saveForm}
                        style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px",background:th.accent,color:"#0d0d0d",border:"none",borderRadius:3,cursor:"pointer"}}>
                        ✓ {myCalForm.editId!=null?"Modifier":"Enregistrer"}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* v2.15.2 — colonnes flex qui s'ajustent (demande de Gen) : les calendriers des
                  enfants se placent côte à côte quand l'écran le permet, et s'empilent sur mobile.
                  v2.16.31 — Backlog #7+#11 incréments 3+4/5 : chaque carte enfant passe de la
                  liste "14 prochains jours groupés par date" à une grille "7 colonnes" (même
                  patron visuel que l'ex-onglet "Semaine", maintenant retiré des tâches — voir
                  homeTab==="jour"), scrollable horizontalement, jours à partir d'AUJOURD'HUI. */}
              <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"flex-start"}}>
              {order.map(i=>{ const p=config.players[i]; const cal=(gameStates[i]?.calendar)||[];
                const mine=i===sessionPlayer;
                return (
                  <div key={p.id} style={{background:"rgba(0,0,0,0.5)",border:`2px solid ${p.color}99`,borderRadius:8,padding:12,flex:"1 1 300px",minWidth:0}}>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:p.color,marginBottom:6}}>{displayName(p)}{mine?" (toi)":""}</div>
                    <div style={{display:"flex",gap:6,overflowX:"auto",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch",paddingBottom:6}}>
                      {Array.from({length:7},(_,k)=>{
                        const dt=new Date(); dt.setDate(dt.getDate()+k);
                        // stamp en date LOCALE (jamais toISOString — leçon v2.5.24)
                        const stamp=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
                        const dIdx=(dt.getDay()+6)%7;
                        const dayEvents=cal.filter(e=> e && (e.recur?.freq==="daily" || (e.recur?.freq==="weekly" && e.recur.day===dIdx) || e.date===stamp));
                        const isToday=k===0;
                        return (
                          <div key={stamp} style={{flex:"0 0 auto",width:128,scrollSnapAlign:"start",background:"rgba(0,0,0,0.35)",border:isToday?`2px solid ${p.color}`:"1px solid #2a2a2a",borderRadius:6,padding:"7px 7px 9px",boxSizing:"border-box"}}>
                            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:isToday?p.color:"var(--txt-mild,#999)",marginBottom:4}}>{DAYS_SHORT[dIdx]} {dt.getDate()}</div>
                            {dayEvents.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-faint,#555)"}}>🌿 Rien</div>}
                            {dayEvents.map(e=>{
                              const editable = parentMode || (mine && (e.type||"evenement")==="evenement");
                              return (
                                <div key={e.id} style={{display:"flex",flexDirection:"column",gap:1,marginTop:4,padding:"3px 5px",background:"rgba(133,205,209,0.12)",border:"1px solid #85CDD155",borderRadius:3}}>
                                  <div style={{display:"flex",gap:4,alignItems:"flex-start"}}>
                                    <span style={{fontSize:11,lineHeight:"13px"}}><UIIcon name={calEventIconName(e)} emoji={calEventIcon(e)} size={11}/></span>
                                    <span style={{fontFamily:"'VT323',monospace",fontSize:12,lineHeight:"13px",color:"#9fd8db",flex:1,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical"}}>{e.time?`${e.time} · `:""}{e.label}</span>
                                  </div>
                                  {editable && <div style={{display:"flex",gap:6,marginTop:2,alignSelf:"flex-end"}}>
                                    <button onClick={()=>startEdit(e,i)} style={{background:"none",border:"none",color:"var(--txt-muted,#888)",cursor:"pointer",fontSize:11,lineHeight:1,padding:0}}>✏️</button>
                                    <button onClick={()=>deleteEntry(e.id,i)} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:12,lineHeight:1,padding:0}}>✕</button>
                                  </div>}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          );
        })()}
        {view==="timer"&&(
          <TimerView config={config} gameStates={gameStates} sessionPlayer={sessionPlayer} parentMode={parentMode} th={th} onComplete={handleRitualTimerDone} initialRitualId={timerRitual} onCompleteTask={requestComplete}/>
        )}
        {view==="family"&&(()=>{
          // v1.60.0 — stats familiales : quêtes accomplies par étiquette, agrégées sur tous les enfants
          // v2.6.6 — même bug que le graphique XP : ignorait config.weeklyQuests.assignments, donc
          // sous-comptait "quêtes accomplies ensemble" pour tout ce qui passe par le système rotatif.
          const catByInst={}; [...(config.assignments||[]), ...(config.weeklyQuests?.assignments||[])].forEach(a=>{ const t=allTasks.find(x=>x.id===a.taskId); if(t) catByInst[a.instanceId]=t.cat; });
          const counts={}; let total=0;
          (gameStates||[]).forEach(gs=>{ (gs.completed||[]).forEach(k=>{ const base=k.split("#")[0]; const inst=base.slice(0,base.lastIndexOf("_")); const cat=catByInst[inst]; if(cat){ counts[cat]=(counts[cat]||0)+1; total++; } }); });
          if(total===0) return null;
          const cats=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
          const maxN=Math.max(...cats.map(c=>counts[c]));
          return (
            <div style={{background:th.card||"rgba(0,0,0,0.5)",border:`2px solid ${(th.accent||"#D9BC5C")}55`,borderRadius:10,padding:14,margin:"4px 0 12px"}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",color:th.accent||"#D9BC5C",marginBottom:4}}>📊 Stats de la famille</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#fff",marginBottom:10}}>{total} quêtes accomplies ensemble! 🎉</div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {cats.map(c=>{ const m=catMeta(c); const w=Math.round(counts[c]/maxN*100); return (
                  <div key={c}>
                    <div style={{display:"flex",justifyContent:"space-between",fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd"}}><span style={{color:m.color}}>{m.label}</span><span>{counts[c]}</span></div>
                    <div style={{height:10,background:"#111",border:"1px solid #333",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:w+"%",background:m.color,transition:"width 0.6s"}}/></div>
                  </div>
                );})}
              </div>
            </div>
          );
        })()}
        {view==="family"&&(
          <FamilyOverview config={config} gameStates={gameStates} allTasks={allTasks} onSelectPlayer={onFamilySelectPlayer} canOpen={onFamilyCanOpen} th={th}
            onGiveCoins={handleGiveCoins}
            onCreateOffer={handleCreateOffer}
            meId={familyMeId}
            onLike={onFamilyLike}
            onPostChat={onFamilyPostChat}/>
        )}
        {typeof view==="number"&&(
          <PlayerDashboard
            player={config.players[view]}
            playerIdx={view}
            pState={gameStates[view]||{xp:0,coins:0,completed:[],pending:[],owned:[],equipped:{},boughtRewards:[],calendar:[]}}
            config={config}
            assignments={[...(config.assignments||[]),...(isCustodyWeek()?(config.weeklyQuests?.assignments||[]):[])]}
            weeklyChallenge={isCustodyWeek()?config.weeklyChallenge:null}
            onChallengeCheckin={(date,val)=>handleChallengeCheckin(config.players[view].id,date,val)}
            allTasks={allTasks}
            allRewards={allRewards}
            onRequestComplete={requestComplete}
            onBuy={handleBuy}
            onEquip={handleEquip}
            onUpdateAvatar={onDashUpdateAvatar}
            onChildAddTask={onDashChildAddTask}
            onChildPickTask={onDashChildPickTask}
            onChildAddRoutineTask={onDashChildAddRoutineTask}
            onRequestRemoval={onDashRequestRemoval}
            onCreateTeamInvite={onDashCreateTeamInvite}
            onRespondTeamInvite={onDashRespondTeamInvite}
            showToast={showToast}
            onUpdatePseudo={onDashUpdatePseudo}
            onRespondOffer={handleRespondOffer}
            onFeedPet={onDashFeedPet}
            onPlayPet={onDashPlayPet}
            onRenamePet={onDashRenamePet}
            onChoosePetEvo={onDashChoosePetEvo}
            onDismissRefusal={onDashDismissRefusal}
            onDismissAnnouncement={onDashDismissAnnouncement}
            onBossAttack={onDashBossAttack}
            onBossPetAttack={onDashBossPetAttack}
            onBossFinish={onDashBossFinish}
            allStates={gameStates}
            onLogout={onDashLogout}
            onOpenParentPin={onDashOpenParentPin}
            onReportBug={onDashReportBug}
            hamOpen={hamOpen} onCloseHam={onDashCloseHam}
            onGoFamily={onDashGoFamily}
            onGoCalendars={onDashGoCalendars}
            onGoTimer={onDashGoTimer}
            onUnclaimReward={onDashUnclaimReward}
            onHideReward={onDashHideReward}
            onClaimDaily={onDashClaimDaily}
            onOpenChest={onDashOpenChest}
            parentMode={parentMode}
            playerMode={gameStates[view]?.mode || config.mode || "routine"}
            todayDayIdx={todayDayIdx}
            onPatchState={onDashPatchState}
            onChangeTheme={onDashChangeTheme}
            onDeComplete={handleDeComplete}
            onForceComplete={handleForceComplete}
            th={th}
          />
        )}
      </div>

      {/* ── MODALS ── */}
      {/* Parent Panel slide-out */}
      {parentMode && parentPanel && (
        <Suspense fallback={<LazyOverlayFallback/>}>
        <ParentPanel
          config={config} gameStates={gameStates} parentMode={parentMode}
          actionLog={actionLog} undoStack={undoStack} players={config.players} th={th}
          allTasks={allTasks}
          onApprovePending={approvePending}
          onRefusePending={refusePending}
          onAddAssignment={handleAddAssignment}
          onAssignRoutine={handleAssignRoutine}
          onLaunchBoss={handleLaunchBoss}
          onCreateRepairQuest={handleCreateRepairQuest}
          onPlanMoment={handlePlanMoment}
          onMarkMomentDone={handleMarkMomentDone}
          bossActive={!!(config.boss && !config.boss.defeatedAt)}
          onRemoveAssignment={handleRemoveAssignment}
          onApproveRemoval={handleApproveRemoval}
          onRefuseRemoval={handleRefuseRemoval}
          onApproveProposal={handleApproveProposal}
          onRefuseProposal={handleRefuseProposal}
          onClearChildTasks={handleClearChildTasks}
          onAddCustomTask={handleAddCustomTask}
          onClose={onParentPanelClose}
          onExitParent={onParentPanelExit}
          onUndo={handleUndo}
          onReset={onParentPanelReset}
          onResetPlayer={handleResetPlayer}
          onAdjustXP={handleAdjustXP}
          onAdjustCoins={handleAdjustCoins}
          onSetMorningLock={handleSetMorningLock}
          onSetDailyLimit={handleSetDailyLimit}
          onSetShopUnlockCount={handleSetShopUnlockCount}
          onChangePin={handleChangePin}
          onExport={handleExport}
          onImport={handleImport}
          onSetup={onParentPanelSetup}
          onUpdateChallenge={handleUpdateChallenge}
          onCreateAnnouncement={handleCreateAnnouncement}
          onResendAnnouncement={handleResendAnnouncement} showToast={showToast}
          onDeleteAnnouncement={handleDeleteAnnouncement}
        />
        </Suspense>
      )}

      {parentPinOpen&&(
        <PinPad pin={config.pin} label="Accès mode parent" onSuccess={()=>{ const turningOn=!parentMode; setParentMode(turningOn); setParentPinOpen(false); if(turningOn){ if(sessionPlayer!=null) setReturnToPlayer(sessionPlayer); setSessionPlayer(null); setView("family"); } showToast(turningOn?"🔓 Mode parent activé!":"🔒 Mode parent désactivé","#D99248"); }} onCancel={()=>setParentPinOpen(false)} th={th}/>
      )}
      {bossWin&&(
        <div onClick={()=>{setBossWin(null);SFX.click&&SFX.click();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:3200,display:"flex",alignItems:"center",justifyContent:"safe center",padding:16,overflowY:"auto",cursor:"pointer"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(160deg,#1a2e1a,#0c220c)",border:`5px solid ${bossWin.color||"#D9BC5C"}`,borderRadius:16,padding:"28px 26px",maxWidth:380,width:"100%",maxHeight:"90vh",overflowY:"auto",textAlign:"center",boxShadow:`0 0 50px ${bossWin.color||"#D9BC5C"}70`,animation:"bounceIn 0.45s cubic-bezier(0.34,1.56,0.64,1)"}}>
            {/* Refonte visuelle Phase 6 — rayons derrière l'emoji du boss vaincu + glowPulse sur
                "VICTOIRE!" (pur CSS, tués par .calm-mode/prefers-reduced-motion). */}
            <div style={{position:"relative",width:90,height:90,margin:"0 auto 6px",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div className="rays-bg" style={{color:bossWin.color||"#D9BC5C"}}/>
              <div style={{fontSize:64,lineHeight:1,position:"relative",zIndex:1}}>{bossWin.emoji||"🐲"}</div>
            </div>
            <div className="glow-pulse" style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(12px,2vw,18px)",color:"#D9BC5C",marginBottom:8}}>🏆 VICTOIRE!</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:19,color:"#fff",marginBottom:8,lineHeight:1.3}}>Vous avez vaincu<br/><b style={{color:bossWin.color||"#D9BC5C"}}>{bossWin.name}</b> en équipe! 💪</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#5CAD68",margin:"12px 0 8px",lineHeight:1.6}}>+40 <Coin size={12}/> · +50 <Xp size={12}/><br/>🐲 Badge « Tombeur de Boss »!</div>
            {bossWin.items && bossWin.items.length>0 && (
              <div style={{background:"rgba(255,91,174,0.12)",border:"2px solid #FF5BAE",borderRadius:10,padding:"10px 12px",margin:"4px 0 8px"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FF5BAE",marginBottom:6}}>🎁 ITEM ULTRA LÉGENDAIRE!</div>
                {bossWin.items.map((it,i)=>(<div key={i} style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#fff"}}><span style={{fontSize:22}}>{it.emoji}</span> {it.name}</div>))}
              </div>
            )}
            <button className="btn-press" onClick={()=>{setBossWin(null);SFX.click&&SFX.click();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"12px 24px",background:"#5CAD68",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d",marginTop:4}}>🎉 Bravo!</button>
          </div>
        </div>
      )}
      {rewardPopup&&(
        <RewardPopup task={rewardPopup.task} player={rewardPopup.player} newBadges={rewardPopup.newBadges||[]} onClose={()=>{setRewardPopup(null);SFX.click();}} th={th} humor={curSettings.humor!==false}/>
      )}
      {miniGame&&(
        <Suspense fallback={<LazyOverlayFallback/>}>
          <MiniGame player={miniGame.player} playerThemeId={miniGame.playerThemeId} level={miniGame.level} forcedType={miniGame.forcedType} isGift={miniGame.isGift} onFinish={handleMiniGameEnd}/>
        </Suspense>
      )}
      {toast&&<Toast msg={toast.msg} color={toast.color}/>}

      {/* ── VERSION FOOTER ── */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,display:"flex",alignItems:"center",justifyContent:"safe center",gap:10,padding:"5px 12px",background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)",zIndex:50,borderTop:"1px solid #222",paddingBottom:"calc(5px + env(safe-area-inset-bottom))"}}>
        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#444"}}>Livre de Quêtes v{APP_VERSION}</span>
        <button
          onClick={()=>{
            // Copie l'adresse au presse-papier + confirme (mailto ne mène nulle part sans app de courriel)
            try{ navigator.clipboard&&navigator.clipboard.writeText(BUG_EMAIL); }catch{}
            showToast(`🐛 Bug? Écris à ${BUG_EMAIL} (adresse copiée!)`,"#D99248",7000);
            const subject=encodeURIComponent(`[Bug v${APP_VERSION}] `);
            const body=encodeURIComponent(`Version: ${APP_VERSION}\nDate: ${new Date().toLocaleString("fr-CA")}\n\nDécris le bug ici:\n\n`);
            try{ window.open(`mailto:${BUG_EMAIL}?subject=${subject}&body=${body}`,"_blank"); }catch{}
          }}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"3px 8px",background:"transparent",color:"#444",border:"1px solid #333",borderRadius:3,cursor:"pointer"}}
          title="Rapporter un bug"
        >🐛 bug</button>
      </div>
    </div>
  );
}
