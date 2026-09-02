// ═══════════════════════════════════════════════════════════════════════════
// Aucun fichier source ne doit être INVISIBLE aux outils de texte
// ═══════════════════════════════════════════════════════════════════════════
// Pourquoi ce fichier existe (v2.16.94, 2026-08-21) :
//
// `src/shared.js` portait DEUX octets NUL bruts, écrits littéralement dans une
// chaîne (`date + "<NUL>" + k`, séparateur de clé de `sanitizeXpLog`). Le
// comportement était juste, et la valeur du séparateur aussi — mais l'octet
// était dans le SOURCE au lieu d'y être échappé (`\u0000`). Conséquence :
// `file` classait le fichier en « data », et **`grep` le sautait en silence**,
// sans un mot, sans ligne « Binary file … matches ».
//
// Ça n'est pas une coquette : `src/shared.js` est le fichier le plus importé du
// projet. Un recensement qui saute un fichier SANS le signaler ne rend pas une
// réponse incomplète : il rend une réponse fausse, avec l'assurance d'une
// réponse complète.
//
// ── v2.17.20 (2026-09-02) : ce contrôle avait le défaut qu'il dénonce ────────
// Mesuré à l'échafaudage (17 variantes rejouées, hors dépôt) : **10 muettes**.
// Six d'entre elles falsifiaient le RECENSEMENT — liste d'extensions vidée,
// `git ls-files` rendu vide, corps de boucle qui ne vérifie rien, erreur de
// lecture avalée, `fail()` du recensement rendu muet, compteur jamais
// incrémenté — et **aucune ne faisait crier personne**. Le script pouvait
// visiter ZÉRO fichier et imprimer « ✓ Tous les sources suivis sont lisibles ».
// La raison : les témoins appelaient `illisible()` **directement**. La
// machinerie savait détecter ; rien ne vérifiait que la boucle la DEMANDE.
// Quatre autres muettes lavaient la table des témoins (retirer un témoin, ou
// la vider entièrement) : rien ne déclarait combien de témoins doivent tourner.
//
// Trois conséquences, écrites ici parce qu'elles sont la structure du fichier :
//   1. Le recensement est une FONCTION (`recenser`), et les témoins passent par
//      elle — même code, entrée en mémoire au lieu du disque. Falsifier le
//      corps de la boucle fait donc crier les témoins.
//   2. On mesure la SORTIE du recensement, pas seulement le détecteur : les
//      fichiers porteurs déclarés doivent avoir été visités, et le compte a un
//      plancher. Un recensement vide crie.
//   3. L'exemption d'extension est INVERSÉE et sa frontière est mesurée. Elle
//      était une liste blanche sans frontière : elle sautait **7 fichiers de
//      texte suivis** en silence, dont les deux sources Python du pipeline
//      PixelLab (`scripts/avatar-lot.py`, `scripts/gemini-pixel-cleanup.py`).
//      Désormais tout ce qui est suivi est lu SAUF les extensions déclarées
//      binaires, et rien ne peut être sauté faute de règle.
//   4. La mise en CONSTATS est une fonction pure partagée par le réel et par les
//      témoins. Elle vivait dans la boucle du réel, où le dépôt est sain : la
//      supprimer ne faisait crier personne. Partagée, elle est mesurée.
//
// Après correctif, rejoué sur le même échafaudage : **22 attrapés sur 25** (14
// falsifications du module, 11 lavages de la fixture), contre 7 sur 17 avant. Et
// `check-sources-lisibles` est le SEUL crieur des 22 : les trois autres garde-fous
// sont muets partout, l'axe n'est donc emprunté à personne.
//
// CE QUI RESTE NON MESURÉ : les trois muettes, et elles sont structurelles, pas des
// oublis. Qui touche à l'une d'elles n'a rien derrière pour l'attraper.
//   • retirer un nom de `PORTEURS` : la liste est une DÉCLARATION, pas une mesure.
//     En retirer un fait vérifier moins, jamais crier.
//   • mettre le plancher de `visites.length` à zéro : le plancher est REDONDANT avec
//     `PORTEURS` — les deux ne crient que si le recensement s'effondre, et `PORTEURS`
//     crie le premier. Il est gardé pour l'effondrement PARTIEL (le dépôt qui perd la
//     moitié de ses sources sans perdre les cinq porteurs), que `PORTEURS` ne voit pas.
//   • la ligne `for (const m of constats(reel)) fail(m)` elle-même : tout ce qui est
//     en amont est mesuré, ce dernier maillon ne l'est pas. Une seule ligne, écrite ici.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (msg) => { failures++; console.error("  ✗ " + msg); };

// L'exemption, et elle seule : du binaire assumé, où personne ne cherche un
// identifiant. Tout le reste est lu — un fichier suivi ne peut pas être sauté
// faute de règle, et la frontière est vérifiée plus bas.
const BINAIRE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3", ".wav", ".ogg", ".m4a",
  ".mp4", ".mov", ".webm", ".pdf", ".zip", ".gz", ".br"]);
const estTexte = (rel) => !BINAIRE.has(path.extname(rel).toLowerCase());

// Ce que grep considère comme binaire, en pratique : un octet NUL suffit. On
// vérifie aussi que l'UTF-8 est valide — une séquence invalide fait basculer
// certains greps (et certains éditeurs) dans le même silence.
const dec = new TextDecoder("utf-8", { fatal: true });
const illisible = (buf) => {
  if (buf.includes(0)) return "octet NUL";
  try { dec.decode(buf); } catch { return "UTF-8 invalide"; }
  return null;
};

// ── LE RECENSEMENT ──────────────────────────────────────────────────────────
// Une seule fonction pour le disque et pour les témoins. `entrees` est une
// liste de `[chemin, lire()]` ; `lire` rend un Buffer ou lève. Elle ne crie
// pas : elle REND ce qu'elle a vu, et c'est cette sortie que l'on mesure.
function recenser(entrees) {
  const visites = [], illisibles = [], sautes = [], illisibleALire = [];
  for (const [rel, lire] of entrees) {
    if (!estTexte(rel)) { sautes.push(rel); continue; }
    let buf;
    try { buf = lire(); } catch (e) { illisibleALire.push([rel, String(e.message || e)]); continue; }
    if (buf === null) continue; // supprimé mais encore indexé : cas déclaré, mesuré plus bas
    visites.push(rel);
    const quoi = illisible(buf);
    if (quoi) illisibles.push([rel, quoi]);
  }
  return { visites, illisibles, sautes, illisibleALire };
}

// Les CONSTATS que le recensement justifie, en fonction pure. Elle est partagée par le réel et
// par les témoins : c'est ce partage qui rend le verdict mesurable. Avant la v2.17.20 la mise en
// constats n'existait que dans la boucle du réel, où le dépôt est sain — supprimer le cri final
// ne faisait donc crier personne (mesuré : muet).
function constats(r) {
  const out = [];
  for (const [rel, err] of r.illisibleALire)
    out.push(`« ${rel} » est suivi par git et illisible sur le disque (${err}). Il était autrefois `
     + `sauté en silence par un \`catch { continue }\` : un fichier qu'on n'arrive pas à lire `
     + `n'est pas un fichier sain.`);
  for (const [rel, quoi] of r.illisibles)
    out.push(`« ${rel} » contient un ${quoi} : \`grep\` saute ce fichier EN SILENCE (pas de ligne `
     + `« Binary file … matches », rien du tout). Tout recensement fait au grep — « qui lit ce `
     + `champ ? », « où ce geste est-il écrit ? » — l'exclura donc sans le dire, et rendra une `
     + `réponse fausse avec l'assurance d'une réponse complète. Si l'octet sert vraiment `
     + `(séparateur de clé, sentinelle), écris-le ÉCHAPPÉ dans la chaîne (\`"\\u0000"\`) : le `
     + `programme se comporte exactement pareil et le fichier redevient du texte.`);
  return out;
}

console.log("· sources lisibles — aucun fichier de texte ne doit être invisible au grep");

// ── TÉMOINS : ils passent par `recenser`, pas par `illisible` ───────────────
// C'est tout le correctif de la v2.17.20. Un témoin qui appelle le détecteur
// directement prouve que le détecteur sait détecter, et RIEN sur la boucle.
{
  const NUL = Buffer.concat([Buffer.from('const k = "a'), Buffer.from([0]), Buffer.from('b";')]);
  const MAUVAIS_UTF8 = Buffer.concat([Buffer.from('const s = "'), Buffer.from([0xff, 0xfe]), Buffer.from('";')]);
  const SAIN = Buffer.from('const s = "é — ☕";\n');
  const fixture = [
    ["t/nul.js", () => NUL],
    ["t/utf8.js", () => MAUVAIS_UTF8],
    ["t/sain.js", () => SAIN],
    ["t/sain.md", () => Buffer.from("# titre\n")],
    ["t/image.png", () => NUL],   // exclu par extension : ne doit PAS être visité
  ];

  // PRÉMISSE — ce que la fixture doit porter, vérifié avant d'en conclure quoi
  // que ce soit. Sans ça, retirer un témoin (ou vider la table) passe au vert :
  // quatre lavages muets mesurés le 2 septembre.
  const p = [
    [fixture.length === 5, "5 entrées"],
    [fixture.filter(([r]) => estTexte(r)).length === 4, "4 entrées de texte"],
    [fixture.some(([, l]) => l().includes(0) && true), "au moins un octet NUL"],
    [illisible(NUL) === "octet NUL", "le buffer NUL porte bien un NUL"],
    [illisible(MAUVAIS_UTF8) === "UTF-8 invalide", "le buffer UTF-8 est bien invalide"],
    [illisible(SAIN) === null, "le buffer sain est bien lisible"],
    [!estTexte("t/image.png"), "l'entrée .png est bien exclue par extension"],
  ];
  for (const [vrai, quoi] of p)
    if (!vrai) fail(`TÉMOIN — prémisse fausse : la fixture ne porte plus « ${quoi} ». `
      + `Le témoin ne mesure alors plus ce qu'il prétend, et passe au vert sans rien dire.`);

  const r = recenser(fixture);
  const vus = r.illisibles.map(([rel, quoi]) => `${rel}:${quoi}`).sort().join(" | ");
  const attendu = "t/nul.js:octet NUL | t/utf8.js:UTF-8 invalide";
  if (vus !== attendu)
    fail(`TÉMOIN — le RECENSEMENT ne rend pas les deux fichiers illisibles de sa fixture.\n`
       + `        attendu : ${attendu}\n        rendu   : ${vus || "(rien)"}\n`
       + `        C'est la boucle qui est mesurée ici, pas le détecteur : si elle ne vérifie `
       + `plus, ou si son verdict n'est plus lu, « aucun fichier illisible » ne prouve rien.`);
  if (r.visites.join(",") !== "t/nul.js,t/utf8.js,t/sain.js,t/sain.md")
    fail(`TÉMOIN — le recensement n'a pas visité exactement les 4 entrées de texte de la `
       + `fixture (rendu : ${r.visites.join(",") || "aucune"}). Un recensement qui saute `
       + `silencieusement une entrée est précisément le défaut que ce fichier existe pour interdire.`);
  if (r.sautes.join(",") !== "t/image.png")
    fail(`TÉMOIN — l'exclusion par extension ne saute pas exactement l'entrée binaire `
       + `(rendu : ${r.sautes.join(",") || "aucune"}).`);
  const c = constats(r);
  if (c.length !== 2 || !c.some((m) => m.includes("t/nul.js")) || !c.some((m) => m.includes("t/utf8.js")))
    fail(`TÉMOIN — la mise en CONSTATS ne rend pas un constat par fichier illisible de la fixture `
       + `(${c.length} rendu(s)). C'est l'étape qui transforme ce que le recensement a vu en cri : `
       + `sans elle, le recensement peut voir juste et le build rester vert.`);
  const rErr = recenser([["t/casse.js", () => { throw new Error("boum"); }]]);
  if (rErr.illisibleALire.length !== 1)
    fail(`TÉMOIN — une erreur de lecture n'est pas retenue par le recensement. Elle serait `
       + `alors avalée en silence, et le fichier compterait pour sain.`);
}

// ── LE RÉEL ─────────────────────────────────────────────────────────────────
const suivis = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const reel = recenser(suivis.map((rel) => [rel, () => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs) : null; // supprimé mais indexé
}]));

// Le recensement a-t-il eu lieu ? Cinq falsifications passaient en silence
// faute de cette question (2 septembre) : liste d'extensions vidée, `git
// ls-files` vide, boucle inerte, verdict non lu, compteur non incrémenté.
const PORTEURS = ["src/shared.js", "src/merge.js", "server-merge.cjs", "package.json",
                  "scripts/check-sources-lisibles.mjs"];
const vus = new Set(reel.visites);
for (const f of PORTEURS)
  if (!vus.has(f))
    fail(`RECENSEMENT — « ${f} » est suivi par git et n'a pas été visité. Le « aucun fichier `
       + `illisible » de ce script ne porterait donc pas sur lui. C'est le fichier même pour `
       + `lequel ce contrôle existe qui échapperait au contrôle.`);
if (reel.visites.length < 60)
  fail(`RECENSEMENT — seulement ${reel.visites.length} fichiers de texte visités, contre 87 le `
     + `2 septembre 2026. Un effondrement pareil veut dire que le recensement ne recense plus, `
     + `pas que le dépôt a maigri. (Si le dépôt a vraiment maigri, baisse ce plancher À LA MAIN.)`);
if (!reel.sautes.length)
  fail(`RECENSEMENT — aucun fichier n'a été sauté, alors que le dépôt suit des images. `
     + `L'exemption \`BINAIRE\` ne s'applique donc à rien : elle est décorative.`);

// La FRONTIÈRE de l'exemption. Une liste blanche d'extensions sautait 7 fichiers
// de texte suivis en silence (les deux sources Python entre autres) ; la règle
// est inversée, et on vérifie qu'aucun fichier n'est sauté faute de règle.
const sansRegle = reel.sautes.filter((rel) => !BINAIRE.has(path.extname(rel).toLowerCase()));
if (sansRegle.length)
  fail(`FRONTIÈRE — ${sansRegle.length} fichier(s) sauté(s) sans règle qui le dise : `
     + `${sansRegle.slice(0, 5).join(", ")}. Un fichier n'est exempté que par une extension `
     + `déclarée binaire dans \`BINAIRE\`, jamais par omission.`);
for (const m of constats(reel)) fail(m);

console.log(`    (${reel.visites.length} fichiers de texte suivis, ${reel.sautes.length} binaires `
          + `exemptés par extension, ${reel.illisibles.length} illisible(s))`);

if (failures) {
  console.error(`\n✗ Sources : ${failures} constat(s).\n`);
  process.exit(1);
}
console.log("✓ Tous les sources suivis sont lisibles au grep, et le recensement est mesuré.");
