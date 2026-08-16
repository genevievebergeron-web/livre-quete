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
//
// v2.16.71 — ces ~245 lignes vivaient ici, en copie manuelle de `src/merge.js`. Elles sont
// maintenant dans `server-merge.cjs`, pour une seule raison : un module séparé est chargeable
// par un test, alors qu'un bloc au milieu de ce fichier ne l'était pas (le `require` démarre le
// serveur). `scripts/check-merge-parity.mjs` rejoue donc les DEUX fusions sur les mêmes entrées
// à chaque `npm run build` et échoue à la moindre divergence — six règles avaient dérivé sans
// que rien ne le signale. La copie reste une copie (CommonJS ici, ESM là-bas) : toute règle
// ajoutée dans l'un des deux fichiers DOIT être écrite dans l'autre.
const { mergeFamily } = require("./server-merge.cjs");

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
