// ═══════════════════════════════════════════════════════════════════════════
// Relevé du SCHÉMA de la production — structure seule, aucune donnée de famille
// ═══════════════════════════════════════════════════════════════════════════
// v2.16.86 — pourquoi ce fichier existe : les dix étages de `check-merge-parity.mjs` ne valent que
// par leur RECENSEMENT, et ce recensement lit la fusion des FIXTURES du garde-fou. Un champ que ni
// `famA` ni `famB` ne porte est donc invisible à tous les contrôles de complétude — c'est ce qui a
// caché `feed[].likeTs`/`unlikes` pendant une nuit (v2.16.85). Le miroir coûte aussi : `house.deco`
// était une forme INVENTÉE par les fixtures, absente de la prod ET du code, et le 10e étage a crié
// dessus (v2.16.86) — la classer aurait gravé un faux durable dans le fichier.
//
// Ce script fige la STRUCTURE de la prod dans le dépôt pour que le garde-fou puisse comparer.
// Ce qui est enregistré : des NOMS de champs et des natures. Ce qui ne l'est JAMAIS : les valeurs,
// et les clés des objets à clés dynamiques (ids de joueur, ids de quête, dates) — d'où
// `objet`/`objetDeListes` comme natures terminales, sans descendre dedans.
//
//   node scripts/releve-schema-prod.mjs <prod.json> [> scripts/schema-prod.json]
//
// `<prod.json>` = la réponse brute de `GET /api/famille?id=…` (enveloppe `{data:…}` acceptée).
// Le fichier produit se relit à l'oeil : si une ligne ressemble à une donnée de famille, c'est un
// bug de ce script, pas une fatalité.
import fs from "node:fs";

const brut = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const d = brut.data || brut;

const estObjet = (v) => v && typeof v === "object" && !Array.isArray(v);
// Nature d'une valeur, sans jamais regarder ce qu'elle contient de nominatif.
const nature = (v) => {
  if (Array.isArray(v)) {
    if (!v.length) return "listeVide";
    return v.some(estObjet) ? "listeObjets" : "liste";
  }
  if (estObjet(v)) return Object.values(v).some(Array.isArray) ? "objetDeListes" : "objet";
  return "scalaire";
};

const schema = {};
// Un même champ n'a pas la même richesse chez les 4 enfants : `ritualCelebrated` vaut `{}` chez
// deux d'entre eux et `{day, ids}` chez les deux autres. On garde toujours la forme la PLUS riche,
// sinon le schéma décrit un enfant plutôt que l'app.
const RICHESSE = { scalaire: 0, listeVide: 1, liste: 2, objet: 2, objetDeListes: 3, listeObjets: 3 };
const pose = (chemin, nat) => {
  const avant = schema[chemin];
  if (avant === undefined || RICHESSE[nat] > RICHESSE[avant]) schema[chemin] = nat;
};

// Un seul niveau de descente sous une racine, puis les ÉLÉMENTS des listes d'objets : c'est très
// exactement la surface que les étages 1-10 recensent. Aller plus profond enregistrerait des clés
// dynamiques sans qu'aucun contrôle sache quoi en faire.
const releve = (racine, dans) => {
  for (const [k, v] of Object.entries(racine || {})) {
    pose(`${dans}.${k}`, nature(v));
    if (estObjet(v)) {
      for (const [k2, v2] of Object.entries(v)) {
        if (!Array.isArray(v2)) continue;      // les clés dynamiques d'objet ne sont pas relevées…
        pose(`${dans}.${k}.${k2}`, nature(v2)); // …mais une LISTE posée sous un objet, si (10e étage)
        for (const el of v2) if (estObjet(el))
          for (const [sk, sv] of Object.entries(el)) pose(`${dans}.${k}.${k2}[].${sk}`, nature(sv));
      }
    }
    if (!Array.isArray(v)) continue;
    for (const el of v) if (estObjet(el))
      for (const [sk, sv] of Object.entries(el)) pose(`${dans}.${k}[].${sk}`, nature(sv));
  }
};

releve(d.config, "config");
for (const gs of d.gameStates || []) releve(gs, "gameStates");

const sortie = {
  _lisezMoi: "Structure de la prod, sans aucune donnée de famille. Régénérer avec scripts/releve-schema-prod.mjs.",
  releveLe: (d.savedAt || "").slice(0, 10),
  champs: Object.fromEntries(Object.keys(schema).sort().map((k) => [k, schema[k]])),
};
process.stdout.write(JSON.stringify(sortie, null, 2) + "\n");
