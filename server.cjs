/* ═══════════════════════════════════════════════════════════════
   Livre de Quêtes — serveur de production
   - Sert le build Vite (dist/) avec fallback SPA
   - API de synchronisation familiale: GET/PUT /api/famille
   - Stockage: Postgres Canner (DATABASE_URL injecté par Canner)
     ou fichier JSON local si pas de base (dev / repli)
   ═══════════════════════════════════════════════════════════════ */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, "dist");
const DATA_FILE = path.join(__dirname, "familles-local.json"); // repli sans Postgres
const MAX_BODY = 2 * 1024 * 1024; // 2 Mo — largement assez pour une famille

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2",
};

// ── Stockage ──────────────────────────────────────────────────
let pool = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
      max: 3,
    });
  } catch (e) { console.error("pg indisponible, repli fichier:", e.message); }
}

let tableReady = false;
async function ensureTable() {
  if (!pool || tableReady) return;
  await pool.query("create table if not exists familles (id text primary key, data jsonb not null, saved_at timestamptz not null default now())");
  tableReady = true;
}

function readLocal() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { return {}; }
}
function writeLocal(all) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(all));
}

async function getFamille(id) {
  if (pool) {
    await ensureTable();
    const r = await pool.query("select data from familles where id=$1", [id]);
    return r.rows[0]?.data ?? null;
  }
  return readLocal()[id] ?? null;
}

async function putFamille(id, data) {
  if (pool) {
    await ensureTable();
    await pool.query(
      "insert into familles (id, data, saved_at) values ($1,$2,$3) on conflict (id) do update set data=excluded.data, saved_at=excluded.saved_at",
      [id, data, data?.savedAt || new Date().toISOString()]
    );
    return;
  }
  const all = readLocal(); all[id] = data; writeLocal(all);
}

// ── FUSION NON-DESTRUCTIVE (côté serveur) ─────────────────────
// Port de mergeFamily/mergeGS du client : garantit qu'un PUT d'un appareil
// (même une vieille version) n'écrase JAMAIS les changements d'un autre.
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
const _mergeCalendar = (a, b) => { const m = new Map(); for (const e of [...(a||[]), ...(b||[])]) { if (e && e.id != null) m.set(e.id, e); } return [...m.values()]; };
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
    calendar: _mergeCalendar(a.calendar, b.calendar),
    avatar: avatarConfigured,
    pin: preferIncoming ? (b.pin ?? a.pin ?? null) : (a.pin ?? b.pin ?? null),
    mode: b.mode ?? a.mode ?? null,
    // v2.15.8 — port du même tombstone que le client (App.jsx, mergeGS) : les routines n'avaient
    // aucun tombstone, contrairement à assignments/customTasks/childTaskProposals — une routine
    // supprimée localement revenait dès que ce merge serveur la retrouvait dans l'état existant.
    removedRoutineIds: _uniq([...(a.removedRoutineIds||[]), ...(b.removedRoutineIds||[])]).slice(-200),
    routines: (() => { const removed=new Set([...(a.removedRoutineIds||[]), ...(b.removedRoutineIds||[])]); const m = new Map(); for (const r of [...(a.routines||[]), ...(b.routines||[])]) { if (r && r.id != null && !removed.has(r.id) && !m.has(r.id)) m.set(r.id, r); } return [...m.values()]; })(),
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
    activeDays: _uniq([...(a.activeDays||[]), ...(b.activeDays||[])]),
    // v2.16.34 — miroir du merge client (App.jsx, mergeGS) : ratchet par rang, jamais de recul.
    leagueTier: (() => { const RANK={bronze:0,argent:1,or:2,diamant:3}; const ra=RANK[a.leagueTier]||0, rb=RANK[b.leagueTier]||0; return rb>=ra ? (b.leagueTier||"bronze") : (a.leagueTier||"bronze"); })(),
    bossBattle: mergeBossBattle(a.bossBattle, b.bossBattle),
    settings: { ...(a.settings||{}), ...(b.settings||{}) },
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
  // v2.16.35 — miroir du merge client : invitations "en équipe" enfant→enfant, union-by-id + statut COLLANT
  const teamInvites = (() => { const m=new Map(); for (const inv of [...(bC.teamInvites||[]), ...(iC.teamInvites||[])]) { if (!inv||inv.id==null) continue; const prev=m.get(inv.id); if (!prev) m.set(inv.id,{ ...inv }); else if (prev.status==="pending"&&inv.status&&inv.status!=="pending") m.set(inv.id,{ ...inv }); } const cut=Date.now()-2*864e5; return [...m.values()].filter(inv=>inv.status==="pending"||(inv.createdAt||0)>cut).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,40); })();
  const config = {
    ...bC, ...iC, players, assignments:[...assignMap.values()], removedAssignments, customTasks:[...taskMap.values()], removedCustomTasks, teamInvites,
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
    weeklyChallenge: (() => { const a=bC.weeklyChallenge, b=iC.weeklyChallenge; if (!a) return b||null; if (!b) return a;
      if (a.weekKey !== b.weekKey) return (a.weekKey||"") >= (b.weekKey||"") ? a : b;
      // Même semaine : fusionner les checkins par enfant (union des jours cochés)
      const cMap = new Map(); for (const c of [...(a.challenges||[]),...(b.challenges||[])]) { if (!c?.playerId) continue; if (!cMap.has(c.playerId)) cMap.set(c.playerId, {...c}); else { const ex=cMap.get(c.playerId); cMap.set(c.playerId, {...b.challenges?.find(x=>x.playerId===c.playerId)||ex, checkins:{...ex.checkins,...c.checkins}}); } } return {...b, challenges:[...cMap.values()]}; })(),
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

// ── Helpers HTTP ──────────────────────────────────────────────
const sendJson = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
};

const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BODY) { reject(new Error("payload trop gros")); req.destroy(); return; }
    chunks.push(c);
  });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});

// id famille: borné et sans caractères exotiques (sert de clé primaire)
const validId = (id) => typeof id === "string" && /^[\w-]{4,80}$/.test(id);

// v2.16.27 — Backlog #1 (sécurité) : rate-limit simple en mémoire sur /api/famille. La vraie
// faille corrigée par ce chantier est FAMILY_ID publié en clair dans le dépôt public (voir
// plan) — ceci est une couche défensive en plus, pas la correction principale (qui nécessite
// une variable d'env côté Canner, hors du dépôt). Fenêtre glissante 60s, ~4 requêtes/appareil/min
// en usage normal (sync périodique) → 30/min laisse large marge à 4 appareils, bloque un script.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateHits = new Map(); // ip -> [timestamps]
function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}
function isRateLimited(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const hits = (rateHits.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateHits.set(ip, hits);
  // nettoyage occasionnel pour ne pas accumuler indéfiniment des IP inactives
  if (rateHits.size > 500 && Math.random() < 0.01) {
    for (const [k, v] of rateHits) if (!v.some(t => now - t < RATE_LIMIT_WINDOW_MS)) rateHits.delete(k);
  }
  return hits.length > RATE_LIMIT_MAX;
}
// v2.16.27 — validation savedAt : refuse un timestamp invalide ou trop dans le futur (dérive
// d'horloge légitime tolérée à 5 min ; jamais de borne "trop vieux", un appareil hors-ligne qui
// resynchronise plus tard est un cas normal, déjà géré par la fusion dernière-écriture-gagne).
function isValidSavedAt(v) {
  if (typeof v !== "string") return false;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return false;
  return t < Date.now() + 5 * 60 * 1000;
}

// ── Serveur ───────────────────────────────────────────────────
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");

  try {
    // Santé — permet au client de détecter l'API (un SPA statique renverrait du HTML)
    if (u.pathname === "/api/sante") {
      return sendJson(res, 200, { ok: true, stockage: pool ? "postgres" : "fichier" });
    }

    if (u.pathname === "/api/famille" && isRateLimited(req)) {
      return sendJson(res, 429, { erreur: "trop de requêtes, réessaie dans une minute" });
    }

    if (u.pathname === "/api/famille" && req.method === "GET") {
      const id = u.searchParams.get("id");
      if (!validId(id)) return sendJson(res, 400, { erreur: "id invalide" });
      const data = await getFamille(id);
      return sendJson(res, 200, { data });
    }

    if (u.pathname === "/api/famille" && req.method === "PUT") {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { erreur: "JSON invalide" }); }
      const { id, data } = body || {};
      if (!validId(id)) return sendJson(res, 400, { erreur: "id invalide" });
      if (!data || typeof data !== "object" || !data.savedAt) return sendJson(res, 400, { erreur: "data.savedAt requis" });
      if (!isValidSavedAt(data.savedAt)) return sendJson(res, 400, { erreur: "savedAt invalide" });
      // ⚠️ FUSION NON-DESTRUCTIVE : on FUSIONNE l'arrivant avec l'état serveur au lieu d'écraser.
      // Ça empêche un appareil (même une vieille version) d'annuler les changements d'un autre
      // (ex: une validation qui « revient »). XP/complétions ne peuvent que progresser.
      const existing = await getFamille(id);
      let merged = data;
      try { if (existing && existing.config) merged = mergeFamily(existing, data); } catch (e) { console.error("merge serveur échoué, fallback écrasement:", e.message); merged = data; }
      await putFamille(id, merged);
      return sendJson(res, 200, { ok: true, data: merged });
    }

    if (u.pathname.startsWith("/api/")) return sendJson(res, 404, { erreur: "inconnu" });

    // ── Fichiers statiques (dist/) avec fallback SPA ──
    let file = path.normalize(path.join(DIST, u.pathname === "/" ? "index.html" : u.pathname));
    if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
    const ext = path.extname(file);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error("Erreur serveur:", e);
    sendJson(res, 500, { erreur: "erreur serveur" });
  }
}).listen(PORT, () => console.log(`Livre de Quêtes en ligne — port ${PORT} — stockage: ${pool ? "Postgres" : "fichier local"}`));
