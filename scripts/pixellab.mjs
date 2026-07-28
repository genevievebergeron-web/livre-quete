#!/usr/bin/env node
// Helper PixelLab : génère des "map objects" (pixel art, fond transparent) et enregistre les PNG.
// Usage : node scripts/pixellab.mjs <jobs.json>
// jobs.json = [{ "out":"public/sprites/items/sc1.png", "description":"...", "view":"side" }, ...]
import fs from "fs";
import os from "os";
import path from "path";

const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8"));
const AUTH = cfg.projects["/Users/genevievebergeron"].mcpServers.pixellab.headers.Authorization;
const ENDPOINT = "https://api.pixellab.ai/mcp";

async function rpc(method, params) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  // réponse en SSE : lignes "data: {...}"
  const dataLines = text.split("\n").filter(l => l.startsWith("data: ")).map(l => l.slice(6));
  const payload = dataLines.length ? dataLines.join("") : text;
  return JSON.parse(payload);
}
const callTool = (name, args) => rpc("tools/call", { name, arguments: args });
const textOf = j => (j.result?.content || []).filter(p => p.type === "text").map(p => p.text).join("\n");
const imgOf  = j => (j.result?.content || []).find(p => p.type === "image");
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function genOne(job) {
  // Idempotent : un PNG déjà présent n'est pas régénéré (permet de relancer un lot interrompu).
  if (!job.force && fs.existsSync(job.out)) return { out: job.out, ok: true, bytes: fs.statSync(job.out).size, skipped: true };
  const args = {
    description: job.description,
    width: job.width || 64, height: job.height || 64,
    view: job.view || "side",
    outline: job.outline || "single color outline",
    shading: job.shading || "basic shading",
    detail: job.detail || "medium detail",
  };
  let id = job.id;                         // si fourni → on saute la création (pas de génération)
  if (!id) {
    const created = await callTool("create_map_object", args);
    const t = textOf(created);
    id = (t.match(/^id:\s*([0-9a-f-]+)/m) || [])[1];
    if (!id) return { out: job.out, ok: false, err: "no id: " + t.slice(0, 200) };
  }
  for (let i = 0; i < 40; i++) {           // ~ jusqu'à 4 min
    await sleep(6000);
    const got = await callTool("get_map_object", { object_id: id });
    const gt = textOf(got);
    if (/status:\s*completed/.test(gt)) {
      const img = imgOf(got);
      if (!img) return { out: job.out, ok: false, err: "completed sans image" };
      fs.mkdirSync(path.dirname(job.out), { recursive: true });
      fs.writeFileSync(job.out, Buffer.from(img.data, "base64"));
      return { out: job.out, ok: true, bytes: fs.statSync(job.out).size, id };
    }
    if (/status:\s*(failed|error)/.test(gt)) return { out: job.out, ok: false, err: gt.slice(0, 200) };
  }
  return { out: job.out, ok: false, err: "timeout" };
}

const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const results = [];
for (const job of jobs) {                  // séquentiel = doux pour l'API d'essai
  process.stdout.write(`→ ${job.out} … `);
  try { const r = await genOne(job); results.push(r); console.log(r.ok ? `OK (${r.bytes}o)` : `ÉCHEC: ${r.err}`); }
  catch (e) { results.push({ out: job.out, ok: false, err: e.message }); console.log("ERREUR:", e.message); }
}
const bal = await callTool("get_balance", {});
console.log("\n--- BALANCE ---\n" + textOf(bal));
console.log("OK:", results.filter(r => r.ok).length, "/", results.length);
