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
// projet (`GLOBAL_CSS`, `todayStamp`, `weekKey`, `streakOf`, `dayOfDoneKey`,
// `appendXpLog`, `activeDaysFromCompleted`, `sanitizeXpLog`…). Chaque
// recensement fait au `grep` depuis que ces octets existent — « qui lit ce
// champ ? », « où ce geste est-il écrit ? », « ce champ est-il consommé
// quelque part ? » — l'excluait donc sans le dire. Un recensement qui saute un
// fichier SANS le signaler ne rend pas une réponse incomplète : il rend une
// réponse fausse, avec l'assurance d'une réponse complète. C'est la même
// famille que « le relevé au même plafond que le surveillé » (v2.16.88) et
// « recensement borné au premier niveau », un cran plus bas encore : ici c'est
// l'OUTIL du recensement qui a l'angle mort, pas sa portée.
//
// Ce script rend cet angle mort impossible à recréer en silence.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (msg) => { failures++; console.error("  ✗ " + msg); };

// Les extensions que l'on LIT au grep. Le reste (png, ico, woff…) est du binaire
// assumé : personne n'y cherche un identifiant.
const TEXTE = new Set([".js", ".jsx", ".cjs", ".mjs", ".json", ".md", ".html", ".css", ".svg", ".txt", ".yml", ".yaml"]);

// Ce que grep considère comme binaire, en pratique : un octet NUL suffit. On
// vérifie aussi que l'UTF-8 est valide — une séquence invalide fait basculer
// certains greps (et certains éditeurs) dans le même silence.
const dec = new TextDecoder("utf-8", { fatal: true });
const illisible = (buf) => {
  if (buf.includes(0)) return "octet NUL";
  try { dec.decode(buf); } catch { return "UTF-8 invalide"; }
  return null;
};

console.log("· sources lisibles — aucun fichier de texte ne doit être invisible au grep");

// TÉMOIN d'abord : un détecteur qui ne trouve rien n'apprend rien tant qu'on n'a
// pas vu qu'il SAIT trouver. On lui donne les deux formes qu'il prétend voir.
{
  const temoins = [
    ["octet NUL", Buffer.concat([Buffer.from('const k = "a'), Buffer.from([0]), Buffer.from('b";')])],
    ["UTF-8 invalide", Buffer.concat([Buffer.from("const s = \""), Buffer.from([0xff, 0xfe]), Buffer.from("\";")])],
  ];
  for (const [attendu, buf] of temoins) {
    const vu = illisible(buf);
    if (vu !== attendu)
      fail(`TÉMOIN — un fichier ${attendu} n'est pas détecté (rendu : ${JSON.stringify(vu)}). Le `
         + `« aucun fichier illisible » de ce script ne prouverait alors rien du tout.`);
  }
  const sain = illisible(Buffer.from('const s = "é — ☕";\n'));
  if (sain !== null)
    fail(`TÉMOIN — un fichier parfaitement lisible (accents, tiret, emoji) est signalé `
       + `${JSON.stringify(sain)}. Un détecteur qui crie au loup ferait exempter le vrai cas.`);
}

const suivis = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
let lus = 0;
for (const rel of suivis) {
  if (!TEXTE.has(path.extname(rel).toLowerCase())) continue;
  const abs = path.join(ROOT, rel);
  let buf;
  try { buf = fs.readFileSync(abs); } catch { continue; } // fichier supprimé mais encore indexé
  lus++;
  const quoi = illisible(buf);
  if (quoi)
    fail(`« ${rel} » contient un ${quoi} : \`grep\` saute ce fichier EN SILENCE (pas de ligne `
       + `« Binary file … matches », rien du tout). Tout recensement fait au grep — « qui lit ce `
       + `champ ? », « où ce geste est-il écrit ? » — l'exclura donc sans le dire, et rendra une `
       + `réponse fausse avec l'assurance d'une réponse complète. Si l'octet sert vraiment `
       + `(séparateur de clé, sentinelle), écris-le ÉCHAPPÉ dans la chaîne (\`"\\u0000"\`) : le `
       + `programme se comporte exactement pareil et le fichier redevient du texte.`);
}
console.log(`    (${lus} fichiers de texte suivis, ${failures} illisible(s))`);

if (failures) {
  console.error(`\n✗ Sources : ${failures} fichier(s) invisible(s) aux outils de texte.\n`);
  process.exit(1);
}
console.log("✓ Tous les sources suivis sont lisibles au grep.");
