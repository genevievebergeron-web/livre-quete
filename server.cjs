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
      // Anti-écrasement: on ne remplace que par plus récent (last-write-wins par savedAt)
      const existing = await getFamille(id);
      if (existing?.savedAt && new Date(existing.savedAt) > new Date(data.savedAt)) {
        return sendJson(res, 200, { ok: true, ignore: "plus ancien que l'état serveur", data: existing });
      }
      await putFamille(id, data);
      return sendJson(res, 200, { ok: true });
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
