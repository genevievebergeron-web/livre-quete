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
const isNewer = (a, b) => { if (!a) return false; if (!b) return true; try { return new Date(a) > new Date(b); } catch { return false; } };
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
  return {
    ...a, ...b,
    xp: Math.max(a.xp||0, b.xp||0),
    coins: preferIncoming ? (b.coins ?? a.coins ?? 0) : (a.coins ?? b.coins ?? 0),
    completed,
    completedAt: { ...(b.completedAt || {}), ...(a.completedAt || {}) },
    pending: _uniq([...(a.pending||[]), ...(b.pending||[])]).filter(k => !completed.includes(k) && !_refusedSet.has(k)), // v1.64.0 — exclut les refusées
    refusedKeys,
    refusals: preferIncoming ? (b.refusals || a.refusals || []) : (a.refusals || b.refusals || []),
    owned: _uniq([...(a.owned||[]), ...(b.owned||[])]),
    boughtRewards: preferIncoming ? (b.boughtRewards || a.boughtRewards || []) : (a.boughtRewards || b.boughtRewards || []), // v1.63.0 — dernière-écriture-gagne (avec coins)
    refundedRewards: _uniq([...(a.refundedRewards||[]), ...(b.refundedRewards||[])]).slice(-200), // v1.69.0 — tombstone « déjà remboursé » (union) → fin des pièces infinies
    badges: _uniq([...(a.badges||[]), ...(b.badges||[])]),
    equipped: { ...(a.equipped||{}), ...(b.equipped||{}) },
    calendar: _mergeCalendar(a.calendar, b.calendar),
    avatar: avatarConfigured,
    pin: preferIncoming ? (b.pin ?? a.pin ?? null) : (a.pin ?? b.pin ?? null),
    mode: b.mode ?? a.mode ?? null,
    routines: (() => { const m = new Map(); for (const r of [...(a.routines||[]), ...(b.routines||[])]) { if (r && r.id != null && !m.has(r.id)) m.set(r.id, r); } return [...m.values()]; })(),
    activeRoutineId: b.activeRoutineId ?? a.activeRoutineId ?? null,
    hiddenRewards: _uniq([...(a.hiddenRewards||[]), ...(b.hiddenRewards||[])]),
    hiddenWeek: b.hiddenWeek ?? a.hiddenWeek ?? null,
    dailyClaimed: (() => { const A=a.dailyClaimed||{}, B=b.dailyClaimed||{}; if (A.day && A.day===B.day) return { day:A.day, ids:_uniq([...(A.ids||[]),...(B.ids||[])]) }; return ((B.day||"")>=(A.day||"")) ? (B.day?B:A) : (A.day?A:B); })(),
    pendingCelebrations: preferIncoming ? (b.pendingCelebrations||[]) : (a.pendingCelebrations||[]),
    petXp: mergePetXp(a.petXp, b.petXp),
    petDay: (() => { const A=a.petDay||{}, B=b.petDay||{}; if (A.day && A.day===B.day) return { day:A.day, xp:Math.max(A.xp||0,B.xp||0) }; return ((B.day||"")>=(A.day||"")) ? (B.day?B:A) : (A.day?A:B); })(),
    petEvo: (() => { const out={...(a.petEvo||{})}; const B=b.petEvo||{}; for(const k in B){ out[k]={...(B[k]||{}), ...(out[k]||{})}; } return out; })(),
    energy: (preferIncoming ? b.energy : a.energy) ?? (a.energy ?? b.energy ?? 100),
    energyTs: (preferIncoming ? b.energyTs : a.energyTs) ?? (a.energyTs ?? b.energyTs ?? null),
    lastFedDay: [a.lastFedDay, b.lastFedDay].filter(Boolean).sort().pop() || null,
    activeDays: _uniq([...(a.activeDays||[]), ...(b.activeDays||[])]),
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
  const taskMap = new Map(); (bC.customTasks||[]).forEach(t => { if (!_rmCT.has(t.id)) taskMap.set(t.id, t); }); (iC.customTasks||[]).forEach(t => { if (!_rmCT.has(t.id) && !taskMap.has(t.id)) taskMap.set(t.id, t); });
  const newer = preferIncoming ? incoming : base; const newerC = newer.config||{};
  const config = {
    ...bC, ...iC, players, assignments:[...assignMap.values()], removedAssignments, customTasks:[...taskMap.values()], removedCustomTasks,
    selectedRewards:_uniq([...(bC.selectedRewards||[]), ...(iC.selectedRewards||[])]),
    feed: (() => { const m=new Map(); for (const f of [...(bC.feed||[]), ...(iC.feed||[])]) { if (!f||f.id==null) continue; const prev=m.get(f.id); if (prev) prev.likes=_uniq([...(prev.likes||[]),...(f.likes||[])]); else m.set(f.id,{ ...f, likes:[...(f.likes||[])] }); } return [...m.values()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,60); })(),
    coinOffers: (() => { const m=new Map(); for (const o of [...(bC.coinOffers||[]), ...(iC.coinOffers||[])]) { if (!o||o.id==null) continue; const prev=m.get(o.id); if (!prev) m.set(o.id,{ ...o }); else if (prev.status==="pending"&&o.status&&o.status!=="pending") m.set(o.id,{ ...o }); } const cut=Date.now()-2*864e5; return [...m.values()].filter(o=>o.status==="pending"||(o.ts||0)>cut).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,40); })(),
    bugs: (() => { const m=new Map(); for (const x of [...(bC.bugs||[]), ...(iC.bugs||[])]) { if (x&&x.id!=null&&!m.has(x.id)) m.set(x.id,x); } return [...m.values()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,60); })(),
    boss: (() => { const a=bC.boss, b=iC.boss; if (!a) return b||null; if (!b) return a;
      if (a.startedAt===b.startedAt) { const lastHitTs=[a.lastHitTs,b.lastHitTs].filter(Boolean).sort().pop()||a.lastHitTs; return { ...a, ...b, defeatedAt:a.defeatedAt||b.defeatedAt, lastHitTs }; }
      return (new Date(b.startedAt||0) >= new Date(a.startedAt||0)) ? b : a; })(),
    pin: newerC.pin || bC.pin || iC.pin || "1146",
    mode: newerC.mode || bC.mode || iC.mode || "routine",
    routineEnd: newerC.routineEnd || bC.routineEnd || iC.routineEnd,
    // Lot 7 — last-write-wins par weekKey (plus récent gagne)
    weeklyQuests: (() => { const a=bC.weeklyQuests, b=iC.weeklyQuests; if (!a) return b||null; if (!b) return a; return (a.generatedForWeek||"") >= (b.generatedForWeek||"") ? a : b; })(),
    weeklyChallenge: (() => { const a=bC.weeklyChallenge, b=iC.weeklyChallenge; if (!a) return b||null; if (!b) return a;
      if (a.weekKey !== b.weekKey) return (a.weekKey||"") >= (b.weekKey||"") ? a : b;
      // Même semaine : fusionner les checkins par enfant (union des jours cochés)
      const cMap = new Map(); for (const c of [...(a.challenges||[]),...(b.challenges||[])]) { if (!c?.playerId) continue; if (!cMap.has(c.playerId)) cMap.set(c.playerId, {...c}); else { const ex=cMap.get(c.playerId); cMap.set(c.playerId, {...b.challenges?.find(x=>x.playerId===c.playerId)||ex, checkins:{...ex.checkins,...c.checkins}}); } } return {...b, challenges:[...cMap.values()]}; })(),
    custodySchedule: newerC.custodySchedule || bC.custodySchedule || iC.custodySchedule,
  };
  return { ...newer, config, gameStates, savedAt: preferIncoming ? incoming.savedAt : base.savedAt };
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

// ── Serveur ───────────────────────────────────────────────────
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");

  try {
    // Santé — permet au client de détecter l'API (un SPA statique renverrait du HTML)
    if (u.pathname === "/api/sante") {
      return sendJson(res, 200, { ok: true, stockage: pool ? "postgres" : "fichier" });
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
