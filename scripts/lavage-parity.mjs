#!/usr/bin/env node
// Lavage automatisé de `check-merge-parity.mjs` — le dernier garde-fou non lavé.
//
// LE GESTE. Chaque catalogue déclaratif du garde-fou (fiches, exemptions, tolérances, axes,
// témoins) est découpé en ENTRÉES de premier niveau. Retirer une entrée doit faire CRIER le
// garde-fou : soit parce qu'un étage de complétude constate qu'un champ de la prod n'est plus
// classé, soit parce que ce que l'entrée exemptait échoue de nouveau. Une entrée dont le retrait
// laisse tout au vert n'est ancrée par rien — elle pourrait disparaître sans que personne le voie.
//
// TROIS ISSUES, JAMAIS DEUX. `cri` (sortie ≠ 0 ET le garde-fou a imprimé son propre « ✗ »),
// `plantage` (sortie ≠ 0 SANS « ✗ » : le retrait a cassé le fichier, le lavage ne prouve rien —
// compter ça comme un cri gonflerait le score avec des faux), `muet` (sortie 0 : la trouvaille).
//
// CE QUI MESURE LE RECENSEMENT, PAS LE DÉTECTEUR (leçon v2.17.20). Le découpage se prouve par une
// identité à l'octet : les entrées d'un catalogue plus les interstices doivent reconstituer son
// corps exactement, et un interstice ne peut porter que des virgules, des blancs et des
// commentaires. Un sous-arbre oublié par le découpage casse l'identité. Deux ancres encadrent la
// campagne : l'arbre miroir NON modifié doit sortir 0 (sinon tout crierait pour une raison
// étrangère et chaque entrée passerait pour ancrée), et une entrée témoin doit crier (sinon le
// coureur n'observe rien). Les deux sont comptées, pas déclarées.
//
// FRONTIÈRE ÉCRITE ET COMPTÉE. Le lavage ne descend pas SOUS le premier niveau d'un catalogue :
// retirer la seule raison `sansRetrait` d'une fiche, ou une clé d'un `frais:`, n'est pas mesuré
// ici. Le nombre de sous-entrées non visitées est COMPTÉ et imprimé à chaque passe — une frontière
// qui grandit se voit, au lieu de se périmer en silence.
//
//   node scripts/lavage-parity.mjs                 # exhaustif, 4 travailleurs
//   node scripts/lavage-parity.mjs --echantillon 20 --graine 7
//   node scripts/lavage-parity.mjs --catalogue CHAINES
//   node scripts/lavage-parity.mjs --liste         # recensement seul, rien n'est exécuté
//   node scripts/lavage-parity.mjs --sortie scripts/lavage-parity.json

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CIBLE = path.join(HERE, "check-merge-parity.mjs");

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const drapeau = (n) => args.includes(n);
const ECHANTILLON = Number(opt("--echantillon", 0)) || 0;
const GRAINE = Number(opt("--graine", 1));
const CATALOGUE = opt("--catalogue", null);
const TRAVAILLEURS = Math.max(1, Number(opt("--travailleurs", 4)));
const SORTIE = opt("--sortie", null);
const LISTE_SEULE = drapeau("--liste");

// ── 1. masque : 1 = octet de CODE (hors chaîne, hors commentaire) ─────────────────────────────
const src = fs.readFileSync(CIBLE, "utf8");
function masquer(s) {
  const m = new Uint8Array(s.length);
  let i = 0;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === "/" && d === "/") { while (i < s.length && s[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < s.length) { if (s[i] === "\\") { i += 2; continue; } if (s[i] === q) { i++; break; } i++; }
      continue;
    }
    m[i] = 1; i++;
  }
  return m;
}
const M = masquer(src);
const OUVRANTS = { "{": "}", "[": "]", "(": ")" };
function fermantDe(iOuv) {
  let n = 0, i = iOuv;
  while (i < src.length) {
    if (M[i]) {
      const c = src[i];
      if (OUVRANTS[c]) n++;
      else if (c === "}" || c === "]" || c === ")") { n--; if (!n) return i; }
    }
    i++;
  }
  throw new Error("délimiteur non fermé à " + iOuv);
}
const ligneDe = (i) => src.slice(0, i).split("\n").length;

// ── 2. recensement des catalogues — AUCUNE liste blanche ──────────────────────────────────────
// Un catalogue est tout `const NOM = [` / `const NOM = {` à N'IMPORTE QUELLE indentation, NOM en
// capitales. Borner à `^const` sauterait sept catalogues indentés bien vivants (SOUS_LE_PLAFOND,
// GESTES, TOMBSTONES_DATES, REGLES_RACINE, NIVEAUX, NIVEAUX_OBJ, TEMOINS) — c'est l'exemption par
// omission payée en v2.17.20, on ne la refait pas. Ce qui est écarté l'est par une LISTE NOIRE,
// nommée et justifiée, donc relisable.
const ECARTES = {
  // Écartés NOMMÉMENT, jamais par omission. Ce sont des échafaudages LOCAUX à un étage (des listes
  // de cas montées puis consommées trois lignes plus bas), pas des catalogues déclaratifs : en
  // retirer une entrée retire une ASSERTION, ce qui ne peut évidemment faire crier personne. Les
  // laver rendrait des « muettes » qui ne désignent aucun défaut — un faux positif se corrige dans
  // la QUESTION, pas en élargissant la réponse.
  cas: "liste de cas locale à l'étage « ↩️ Annuler »",
  trucs: "liste de cas locale à l'étage des unions bornées",
  fauxRang: "échafaudage local d'un témoin",
  sourcesM: "liste de sources locale au recensement des charnières",
};
const catalogues = [];
{
  // Les deux casses. La convention du fichier met les catalogues en CAPITALES, mais `gsA`, `gsB`,
  // `plA` et `plB` — les quatre fixtures principales, celles dont chaque clé EST un champ de la
  // prod — sont en minuscules. S'en tenir aux capitales aurait laissé hors du lavage précisément
  // les objets que l'exigence de contradiction existe pour ancrer. Pour les minuscules on exige un
  // littéral multi-lignes, sinon chaque `const c = { ...o }` d'une fonction entrerait ici.
  const re = /(^|\n)[ \t]*const ([A-Za-z][A-Za-z0-9_]*) = ([[{])/g;
  let m;
  while ((m = re.exec(src))) {
    const iOuv = m.index + m[0].length - 1;
    if (!M[iOuv]) continue;
    const iFerm = fermantDe(iOuv);
    const multiLignes = src.slice(iOuv, iFerm).includes("\n");
    if (/^[a-z]/.test(m[2]) && !multiLignes) continue;
    catalogues.push({ nom: m[2], type: m[3], iOuv, iFerm, ligne: ligneDe(iOuv) });
  }
}

// ── 3. découpage en entrées de premier niveau, prouvé par une identité à l'octet ───────────────
// Le corps d'un catalogue est PARTITIONNÉ : chaque octet appartient soit à une entrée, soit à un
// interstice. Un interstice ne peut contenir, en code, que des virgules et des blancs (les
// commentaires sont hors code par le masque). Si le découpage saute une entrée, l'interstice
// correspondant porte du code et l'identité casse — le recensement se dénonce lui-même.
function decouper(cat) {
  const entrees = [];
  let i = cat.iOuv + 1;
  while (i < cat.iFerm) {
    if (!M[i] || /\s/.test(src[i]) || src[i] === ",") { i++; continue; }
    const debut = i;
    if (OUVRANTS[src[i]]) { i = fermantDe(i) + 1; }
    else { // paire `cle: valeur` d'un objet plat, ou scalaire d'un tableau plat
      while (i < cat.iFerm && !(M[i] && src[i] === ",")) { if (M[i] && OUVRANTS[src[i]]) i = fermantDe(i); i++; }
    }
    entrees.push({ debut, fin: i, ligne: ligneDe(debut), texte: src.slice(debut, i) });
  }
  // identité : les interstices ne portent aucun code hors `,` et blancs
  let curseur = cat.iOuv + 1, octetsEntrees = 0;
  for (const e of entrees) {
    for (let j = curseur; j < e.debut; j++)
      if (M[j] && !/[\s,]/.test(src[j]))
        throw new Error(`${cat.nom} : interstice porteur de code à la ligne ${ligneDe(j)} (« ${src[j]} ») — découpage incomplet`);
    octetsEntrees += e.fin - e.debut;
    curseur = e.fin;
  }
  for (let j = curseur; j < cat.iFerm; j++)
    if (M[j] && !/[\s,]/.test(src[j]))
      throw new Error(`${cat.nom} : queue porteuse de code à la ligne ${ligneDe(j)} — découpage incomplet`);
  const corps = cat.iFerm - cat.iOuv - 1;
  return { entrees, octetsEntrees, corps };
}

let sousEntrees = 0; // la frontière, COMPTÉE
const variantes = [];
let identiteOctets = 0, identiteCorps = 0;
for (const cat of catalogues) {
  if (ECARTES[cat.nom]) continue;
  const d = decouper(cat);
  identiteOctets += d.octetsEntrees; identiteCorps += d.corps;
  for (const e of d.entrees) {
    // ce que le lavage NE visite PAS : les entrées d'un cran plus bas
    if (OUVRANTS[src[e.debut]]) { try { sousEntrees += decouper({ nom: cat.nom, iOuv: e.debut, iFerm: e.fin - 1 }).entrees.length; } catch { /* pas un conteneur découpable */ } }
    variantes.push({ catalogue: cat.nom, ligne: e.ligne, debut: e.debut, fin: e.fin,
      etiquette: e.texte.replace(/\s+/g, " ").slice(0, 72) });
  }
}

// Seconde frontière, NOMMÉE et comptée : le recensement retient les catalogues à nom en
// CAPITALES. C'est une convention du fichier, donc une liste blanche déguisée — et une liste
// blanche saute par omission (v2.17.20). Les littéraux multi-lignes à nom en minuscules sont donc
// dénombrés et nommés ici, sans être lavés : `const cas = [`, `const trucs = [`, `const sourcesM = [`
// sont des catalogues déclaratifs bien vivants, locaux à un étage. Le jour où ce compte grandit,
// il se voit.
console.log(`Lavage de check-merge-parity.mjs — ${catalogues.length} catalogues, ${variantes.length} entrées de premier niveau`);
console.log(`  recensement prouvé : ${identiteOctets}/${identiteCorps} octets de corps dans une entrée, le reste en virgules et blancs`);
console.log(`  frontière 1 (non visité) : ${sousEntrees} sous-entrées d'un cran plus bas — le lavage ne descend pas là`);
const ecartesVus = catalogues.filter((c) => ECARTES[c.nom]).map((c) => `${c.nom}:${c.ligne}`);
console.log(`  frontière 2 (non visité) : ${ecartesVus.length} catalogue(s) écarté(s) par la liste NOIRE — ${ecartesVus.join(", ") || "aucun"}`);
for (const nom of Object.keys(ECARTES))
  if (!catalogues.some((c) => c.nom === nom))
    console.log(`  ⚠ la liste noire nomme « ${nom} », que le recensement ne trouve plus — entrée périmée`);

if (LISTE_SEULE) {
  for (const v of variantes) console.log(`  ${String(v.ligne).padStart(4)} ${v.catalogue.padEnd(26)} ${v.etiquette}`);
  process.exit(0);
}

// ── 4. sélection ──────────────────────────────────────────────────────────────────────────────
let choisies = CATALOGUE ? variantes.filter((v) => v.catalogue === CATALOGUE) : variantes.slice();
if (CATALOGUE && !choisies.length) { console.error(`  ✗ aucun catalogue nommé ${CATALOGUE}`); process.exit(1); }
if (ECHANTILLON && ECHANTILLON < choisies.length) {
  let s = GRAINE >>> 0 || 1;
  const suivant = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let i = choisies.length - 1; i > 0; i--) { const j = Math.floor(suivant() * (i + 1)); [choisies[i], choisies[j]] = [choisies[j], choisies[i]]; }
  choisies = choisies.slice(0, ECHANTILLON);
  choisies.sort((a, b) => a.debut - b.debut);
  console.log(`  échantillon : ${choisies.length} entrées (graine ${GRAINE})`);
}

// ── 5. arbre miroir : tout en liens symboliques, sauf le fichier lavé ──────────────────────────
function miroir(sourceVariante) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lavage-"));
  for (const e of fs.readdirSync(ROOT)) {
    if (e === "scripts") continue;
    fs.symlinkSync(path.join(ROOT, e), path.join(dir, e));
  }
  fs.mkdirSync(path.join(dir, "scripts"));
  for (const e of fs.readdirSync(HERE)) {
    if (e === "check-merge-parity.mjs") continue;
    fs.symlinkSync(path.join(HERE, e), path.join(dir, "scripts", e));
  }
  fs.writeFileSync(path.join(dir, "scripts", "check-merge-parity.mjs"), sourceVariante);
  return dir;
}
function courir(sourceVariante) {
  return new Promise((resolve) => {
    const dir = miroir(sourceVariante);
    const p = spawn(process.execPath, [path.join(dir, "scripts", "check-merge-parity.mjs")],
      { cwd: dir, env: { ...process.env, LAVAGE_ARRET_AU_1ER_CRI: "1" } });
    let sortie = "";
    p.stdout.on("data", (d) => (sortie += d));
    p.stderr.on("data", (d) => (sortie += d));
    p.on("close", (code) => {
      fs.rmSync(dir, { recursive: true, force: true });
      const crie = sortie.includes("✗");
      resolve({ code, issue: code === 0 ? "muet" : crie ? "cri" : "plantage",
        motif: crie ? (sortie.split("\n").find((l) => l.includes("✗")) || "").trim().slice(0, 150)
                    : code === 0 ? "" : sortie.trim().split("\n").slice(-2).join(" ").slice(0, 150) });
    });
  });
}
const sansEntree = (v) => {
  // retire l'entrée ET la virgule qui la suit (ou la précède, si c'est la dernière)
  let fin = v.fin;
  while (fin < src.length && /\s/.test(src[fin])) fin++;
  if (src[fin] === "," && M[fin]) fin++;
  else { let d = v.debut; while (d > 0 && /\s/.test(src[d - 1])) d--; if (src[d - 1] === "," && M[d - 1]) return src.slice(0, d - 1) + src.slice(v.fin); }
  return src.slice(0, v.debut) + src.slice(fin);
};

// ── 6. les deux ancres, comptées ──────────────────────────────────────────────────────────────
const t0 = Date.now();
console.log("  ancre 1 — l'arbre miroir NON modifié doit sortir 0…");
const ancre1 = await courir(src);
if (ancre1.issue !== "muet") {
  console.error(`  ✗ ANCRE 1 ROUGE (${ancre1.issue}) : le miroir crie de lui-même, aucune entrée ne peut être jugée.`);
  console.error(`    ${ancre1.motif}`);
  process.exit(1);
}
console.log("  ancre 1 verte (le silence est atteignable).");

// ── 7. campagne ───────────────────────────────────────────────────────────────────────────────
const resultats = [];
let faits = 0;
async function travailleur(file) {
  for (;;) {
    const v = file.shift();
    if (!v) return;
    const r = await courir(sansEntree(v));
    resultats.push({ ...v, ...r });
    faits++;
    if (r.issue !== "cri") console.log(`  ${r.issue === "muet" ? "MUET " : "plant"} ${String(v.ligne).padStart(4)} ${v.catalogue.padEnd(24)} ${v.etiquette}`);
    if (faits % 20 === 0) console.log(`  … ${faits}/${choisies.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
}
const file = choisies.slice();
await Promise.all(Array.from({ length: TRAVAILLEURS }, () => travailleur(file)));
resultats.sort((a, b) => a.debut - b.debut);

const cris = resultats.filter((r) => r.issue === "cri");
const muets = resultats.filter((r) => r.issue === "muet");
const plantages = resultats.filter((r) => r.issue === "plantage");

// ancre 2 — le coureur doit savoir OBSERVER un cri. En exhaustif la campagne le prouve seule ;
// en échantillon il faut le forcer, sinon « zéro muet » pourrait vouloir dire « rien n'a tourné ».
if (!cris.length) {
  console.log("  ancre 2 — aucune entrée n'a crié : le coureur sait-il seulement voir un cri ?");
  const faux = src.replace("let failures = 0;", "let failures = 0;\nfail(\"ancre de lavage — cri forcé\");");
  if (faux === src) { console.error("  ✗ ANCRE 2 IMPOSSIBLE À POSER (le point d'injection a bougé)."); process.exit(1); }
  const a2 = await courir(faux);
  if (a2.issue !== "cri") { console.error(`  ✗ ANCRE 2 ROUGE (${a2.issue}) : un cri forcé n'est pas observé, la campagne ne prouve rien.`); process.exit(1); }
  console.log("  ancre 2 verte (un cri est bien observé).");
}

console.log(`\n${faits} entrées lavées en ${Math.round((Date.now() - t0) / 1000)} s : `
  + `${cris.length} cri(s), ${muets.length} MUETTE(S), ${plantages.length} plantage(s)`);
if (plantages.length) {
  console.log("\nPlantages — le retrait casse le fichier, le lavage ne prouve RIEN sur ces entrées :");
  for (const p of plantages) console.log(`  ${String(p.ligne).padStart(4)} ${p.catalogue.padEnd(24)} ${p.etiquette}\n        ${p.motif}`);
}
if (muets.length) {
  console.log("\nMUETTES — retirer ces entrées ne fait crier personne. Elles ne sont ancrées par rien :");
  for (const m of muets) console.log(`  ${String(m.ligne).padStart(4)} ${m.catalogue.padEnd(24)} ${m.etiquette}`);
}

if (SORTIE) {
  const inst = {
    laveLe: new Date().toISOString().slice(0, 10),
    cible: "scripts/check-merge-parity.mjs",
    catalogues: catalogues.length, entrees: variantes.length, sousEntreesNonVisitees: sousEntrees,
    ecartesNonVisites: ecartesVus,
    exhaustif: !ECHANTILLON && !CATALOGUE,
    cris: cris.length, muettes: muets.length, plantages: plantages.length,
    muettesDetail: muets.map((m) => ({ catalogue: m.catalogue, entree: m.etiquette })),
    plantagesDetail: plantages.map((p) => ({ catalogue: p.catalogue, entree: p.etiquette })),
  };
  fs.writeFileSync(path.join(ROOT, SORTIE), JSON.stringify(inst, null, 2) + "\n");
  console.log(`\nInstantané écrit : ${SORTIE}`);
}
process.exit(muets.length || plantages.length ? 1 : 0);
